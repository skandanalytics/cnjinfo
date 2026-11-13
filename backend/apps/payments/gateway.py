"""Razorpay access.

The real client is used only when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are both set.
Tests inject a fake with use_gateway(); nothing here calls the network unless create_order
is invoked on the real client. Checkout signatures use the key secret. Webhook signatures
use RAZORPAY_WEBHOOK_SECRET when it is set, otherwise the same key secret.
"""
import hashlib
import hmac
import json
import time
from base64 import b64encode
from decimal import Decimal, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

try:
    import razorpay
except ImportError:
    razorpay = None

_gateway = None


class GatewayError(Exception):
    def __init__(self, detail, code="gateway_error"):
        super().__init__(detail)
        self.detail, self.code = detail, code


class RazorpayClient:
    """Wrapper around official Razorpay Python SDK with HTTP fallback."""

    def __init__(self, key_id, key_secret):
        self.key_id = key_id
        self.key_secret = key_secret
        if razorpay is not None:
            try:
                self.sdk = razorpay.Client(auth=(key_id, key_secret))
            except Exception:
                self.sdk = None
        else:
            self.sdk = None

    def create_order(self, amount, receipt=None, notes=None, currency="INR"):
        if isinstance(amount, (Decimal, float)) or (isinstance(amount, str) and "." in amount):
            paise = int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        else:
            paise = int(amount)
        if paise < 100:
            raise GatewayError("amount must be >= 100 paise", "invalid_amount")

        order_data = {
            "amount": paise,
            "currency": (currency or "INR").upper(),
            "receipt": str(receipt)[:40] if receipt else f"rcpt_{int(paise)}",
            "notes": {str(k): str(v) for k, v in (notes or {}).items()},
        }

        if self.sdk is not None:
            try:
                data = self.sdk.order.create(data=order_data)
                order_id = data.get("id")
                if order_id:
                    return order_id
            except Exception as exc:
                raise GatewayError("The payment provider could not start this payment.", "gateway_error") from exc

        body = json.dumps(order_data).encode()
        token = b64encode(f"{self.key_id}:{self.key_secret}".encode()).decode()
        request = Request(
            "https://api.razorpay.com/v1/orders",
            data=body,
            headers={"Content-Type": "application/json", "Authorization": f"Basic {token}"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=15) as response:
                data = json.loads(response.read().decode())
        except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise GatewayError("The payment provider could not start this payment.", "gateway_error") from exc
        order_id = data.get("id")
        if not order_id:
            raise GatewayError("The payment provider did not return an order id.", "gateway_error")
        return order_id


class FakeRazorpay:
    """In-process stand-in. Tests must opt in; an empty key configuration never selects this."""

    def __init__(self):
        self.created = []
        self._n = 0

    def create_order(self, amount, receipt=None, notes=None, currency="INR"):
        self._n += 1
        order_id = f"order_test_{int(time.time() * 1000)}_{self._n}"
        self.created.append({"id": order_id, "amount": str(amount), "receipt": receipt, "notes": notes or {}, "currency": currency})
        return order_id


def use_gateway(client):
    """Install a gateway for the current thread of work. Pass None to clear it."""
    global _gateway
    _gateway = client


def get_gateway():
    if _gateway is not None:
        return _gateway
    key_id = (settings.RAZORPAY_KEY_ID or "").strip()
    secret = (settings.RAZORPAY_KEY_SECRET or "").strip()
    if not key_id or not secret:
        return None
    return RazorpayClient(key_id, secret)


def keys_configured():
    return bool((settings.RAZORPAY_KEY_ID or "").strip() and (settings.RAZORPAY_KEY_SECRET or "").strip())


def checkout_secret():
    return (settings.RAZORPAY_KEY_SECRET or "").strip()


def webhook_secret():
    dedicated = (settings.RAZORPAY_WEBHOOK_SECRET or "").strip()
    return dedicated or checkout_secret()


def _hmac(secret, message):
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def sign_checkout(order_id, payment_id, secret):
    return _hmac(secret, f"{order_id}|{payment_id}".encode("utf-8"))


def sign_webhook(body, secret):
    if isinstance(body, str):
        body = body.encode("utf-8")
    return _hmac(secret, body)


def _matches(expected, given):
    if not expected or not given or not isinstance(given, str):
        return False
    try:
        return hmac.compare_digest(expected, given)
    except (TypeError, ValueError):
        return False


def verify_checkout_signature(order_id, payment_id, signature, secret):
    if not secret or not order_id or not payment_id or not signature:
        return False
    if razorpay is not None:
        try:
            client = razorpay.Client(auth=("dummy", secret))
            client.utility.verify_payment_signature({
                "razorpay_order_id": str(order_id),
                "razorpay_payment_id": str(payment_id),
                "razorpay_signature": str(signature)
            })
            return True
        except Exception:
            return False
    return _matches(sign_checkout(order_id, payment_id, secret), signature)


def verify_webhook_signature(body, signature, secret):
    if not secret:
        return False
    return _matches(sign_webhook(body, secret), signature)
