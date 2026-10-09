"""SMS provider abstraction. Real providers (e.g. an Indian SMS gateway) plug in by subclassing SmsProvider
and being listed in PROVIDERS; none is bundled because no provider/credentials have been chosen yet."""
import logging

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


PROVIDERS = {"console": ConsoleProvider}


def get_provider():
    name = settings.OTP_PROVIDER
    if name == "console" and not settings.DEBUG:
        raise ImproperlyConfigured("OTP_PROVIDER=console is development-only and cannot be used when DEBUG is off.")
    try:
        return PROVIDERS[name]()
    except KeyError:
        raise ImproperlyConfigured(f"Unknown OTP_PROVIDER '{name}'. Configure a real SMS provider.")


def dev_otp_visible():
    """Whether the API may echo the OTP back (development convenience, impossible when DEBUG is off)."""
    return bool(settings.DEBUG and settings.OTP_PROVIDER == "console")
