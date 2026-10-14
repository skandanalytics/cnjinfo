from django.conf import settings
from rest_framework.settings import api_settings
from rest_framework.throttling import SimpleRateThrottle
from .phone import normalize_phone


def _phone_ident(request):
    data = getattr(request, "data", None)
    if isinstance(data, dict):
        raw = data.get("phone")
        if raw:
            try:
                return f"phone-{normalize_phone(raw)}"
            except Exception:
                digits = "".join(ch for ch in str(raw) if ch.isdigit())
                if len(digits) >= 10:
                    return f"phone-{digits[-10:]}"
    return None


class BaseOTPThrottle(SimpleRateThrottle):
    def get_rate(self):
        rates = getattr(settings, "REST_FRAMEWORK", {}).get("DEFAULT_THROTTLE_RATES", {})
        if self.scope in rates:
            return rates[self.scope]
        return getattr(api_settings, "DEFAULT_THROTTLE_RATES", {}).get(self.scope) or super().get_rate()


class OTPSendPhoneThrottle(BaseOTPThrottle):
    scope = "otp_send_phone"

    def get_cache_key(self, request, view):
        ident = _phone_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}


class OTPSendIPThrottle(BaseOTPThrottle):
    scope = "otp_send_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}


class OTPVerifyPhoneThrottle(BaseOTPThrottle):
    scope = "otp_verify_phone"

    def get_cache_key(self, request, view):
        ident = _phone_ident(request)
        if not ident:
            return None
        return self.cache_format % {"scope": self.scope, "ident": ident}


class OTPVerifyIPThrottle(BaseOTPThrottle):
    scope = "otp_verify_ip"

    def get_cache_key(self, request, view):
        return self.cache_format % {"scope": self.scope, "ident": self.get_ident(request)}
