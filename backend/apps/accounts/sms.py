"""SMS / WhatsApp provider abstraction.
Sends OTP messages. In production and staging, GreenApiProvider sends the OTP exclusively
to the configured SKAND OTP WhatsApp group (GREEN_API_GROUP_ID).
"""
import json
import logging
import urllib.request
import urllib.error

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


class SmsProvider:
    def send_otp(self, phone, code):  # pragma: no cover - interface
        raise NotImplementedError


class ConsoleProvider(SmsProvider):
    """Development only: writes the OTP to the server log. Refused when DEBUG is off."""

    def send_otp(self, phone, code):
        logger.warning("DEV OTP for %s is %s", phone, code)


class GreenApiGroupProvider(SmsProvider):
    """Green API WhatsApp group delivery provider.
    
    CRITICAL RULE:
    The OTP is sent EXCLUSIVELY to the SKAND OTP WhatsApp group (GREEN_API_GROUP_ID).
    It is NEVER sent directly to the customer's phone number or personal WhatsApp.
    """

    def send_otp(self, phone, code):
        instance_id = getattr(settings, "GREEN_API_INSTANCE_ID", "")
        token = getattr(settings, "GREEN_API_TOKEN", "")
        group_id = getattr(settings, "GREEN_API_GROUP_ID", "")
        host = (getattr(settings, "GREEN_API_BASE_URL", None) or getattr(settings, "GREEN_API_HOST", "https://7107.api.greenapi.com")).rstrip("/")

        # Always log for authorized staff monitoring
        logger.info(
            "SKAND OTP requested for customer phone: %s (OTP: %s) -> Target Group: %s",
            phone, code, group_id or "NOT_CONFIGURED"
        )

        if not instance_id or not token or not group_id:
            logger.warning(
                "Green API credentials or GREEN_API_GROUP_ID not fully configured in environment. "
                "OTP generated and logged for staff: phone=%s, code=%s",
                phone, code
            )
            # If credentials are not yet set in environment, do not crash; the request succeeds
            # and staff can view server logs until Green API credentials are added to .env
            return

        # Green API SendMessage endpoint:
        # POST {{host}}/waInstance{{idInstance}}/sendMessage/{{apiTokenInstance}}
        url = f"{host}/waInstance{instance_id}/sendMessage/{token}"

        # Group message body: customer phone is mentioned in text, but RECIPIENT is STRICTLY the group chatId
        expiry_min = getattr(settings, "FOODIE_OTP_EXPIRY_MINUTES", 5)
        message_text = (
            "🔐 *SKAND OTP VERIFICATION*\n\n"
            f"📱 Customer Mobile: +91 {phone}\n"
            f"🔢 OTP Code: *{code}*\n"
            f"⏳ Valid for: {expiry_min} minutes\n\n"
            "_Please share this code only with authorized staff/customer._"
        )

        payload = {
            "chatId": group_id,  # STRICTLY THE GROUP ID (never the customer's phone)
            "message": message_text,
        }

        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data_bytes,
            headers={"Content-Type": "application/json"},
            method="POST"
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                resp_data = resp.read().decode("utf-8")
                logger.info("Green API group message response: %s", resp_data)
        except urllib.error.HTTPError as exc:
            err_body = exc.read().decode("utf-8") if exc.fp else ""
            logger.error("Green API HTTPError %s: %s", exc.code, err_body)
        except Exception as exc:
            logger.error("Green API connection error: %s", exc)


PROVIDERS = {
    "console": ConsoleProvider,
    "green_api": GreenApiGroupProvider,
}


def get_provider():
    name = settings.OTP_PROVIDER
    if name == "console" and not settings.DEBUG:
        raise ImproperlyConfigured("OTP_PROVIDER=console is development-only and cannot be used when DEBUG is off.")
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise ImproperlyConfigured(f"Unknown OTP_PROVIDER '{name}'. Configure a real SMS provider.")


def dev_otp_visible():
    """Whether the API may echo the OTP back.
    STRICT SECURITY REQUIREMENT: Never expose dev_otp to the frontend/customer UI under any circumstances.
    """
    return False
