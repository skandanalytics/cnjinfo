"""Razorpay access.

The real client is used only when RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are both set.
Tests inject a fake with use_gateway(); nothing here calls the network unless create_order
is invoked on the real client. Checkout signatures use the key secret. Webhook signatures
use RAZORPAY_WEBHOOK_SECRET when it is set, otherwise the same key secret.
"""
import hashlib
import hmac
import json
from base64 import b64encode
from decimal import Decimal, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings

_gateway = None


class GatewayError(Exception):
    def __init__(self, detail, code="gateway_error"):
        super().__init__(detail)
        self.detail, self.code = detail, code


class RazorpayClient:
    """Thin HTTP wrapper. Not used in tests."""

    def __init__(self, key_id, key_secret):
        self.key_id = key_id
        self.key_secret = key_secret

    def create_order(self, amount, receipt, notes=None):
        paise = int((Decimal(amount) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
        body = json.dumps({
            "amount": paise,
            "currency": "INR",
            "receipt": str(receipt)[:40],
            "notes": {str(k): str(v) for k, v in (notes or {}).items()},
        }).encode()
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

    def create_order(self, amount, receipt, notes=None):
        self._n += 1
        order_id = f"order_test_{self._n}"
        self.created.append({"id": order_id, "amount": str(amount), "receipt": receipt, "notes": notes or {}})
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
    if not secret:
        return False
    return _matches(sign_checkout(order_id, payment_id, secret), signature)


def verify_webhook_signature(body, signature, secret):
    if not secret:
        return False
    return _matches(sign_webhook(body, secret), signature)
