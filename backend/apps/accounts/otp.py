import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import APIException

from .models import OTPRequest
from .sms import get_provider


class OTPError(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = "otp_error"

    def __init__(self, detail, code=None, status_code=None, retry_after=None):
        super().__init__(detail, code)
        self.error_code = code or self.default_code
        if status_code:
            self.status_code = status_code
        self.retry_after = retry_after


def _hash(phone, code):
    msg = f"{phone}:{code}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), msg, hashlib.sha256).hexdigest()


def send_otp(phone, ip=None):
    """Create and send an OTP. Enforces a resend cooldown and an hourly cap per phone number."""
    now = timezone.now()
    recent = OTPRequest.objects.filter(phone=phone, created_at__gte=now - timedelta(hours=1))
    last = recent.order_by("-created_at").first()
    cooldown = settings.OTP_RESEND_COOLDOWN_SECONDS
    if last and (now - last.created_at).total_seconds() < cooldown:
        wait = int(cooldown - (now - last.created_at).total_seconds()) + 1
        raise OTPError(f"Please wait {wait} seconds before requesting another OTP.", "otp_cooldown",
                       status.HTTP_429_TOO_MANY_REQUESTS, retry_after=wait)
    if recent.count() >= settings.OTP_MAX_SENDS_PER_HOUR:
        raise OTPError("Too many OTP requests. Try again later.", "otp_rate_limited",
                       status.HTTP_429_TOO_MANY_REQUESTS, retry_after=3600)

    provider = get_provider()  # raises ImproperlyConfigured if misconfigured (never silently bypasses)
    code = "".join(str(secrets.randbelow(10)) for _ in range(settings.OTP_LENGTH))
    OTPRequest.objects.create(phone=phone, code_hash=_hash(phone, code), ip_address=ip,
                              expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS))
    provider.send_otp(phone, code)
    return code


def verify_otp(phone, code):
    """Verify the newest unused OTP for the phone. Failed attempts are persisted before the error is raised."""
    code = str(code or "").strip()
    outcome = None
    with transaction.atomic():
        req = (OTPRequest.objects.select_for_update()
               .filter(phone=phone, verified_at__isnull=True).order_by("-created_at").first())
        if req is None:
            outcome = ("invalid", "Invalid or expired OTP.")
        elif req.is_expired:
            outcome = ("expired", "OTP has expired. Request a new one.")
        elif req.attempts >= settings.OTP_MAX_VERIFY_ATTEMPTS:
            outcome = ("locked", "Too many incorrect attempts. Request a new OTP.")
        else:
            req.attempts += 1
            if hmac.compare_digest(req.code_hash, _hash(phone, code)):
                now = timezone.now()
                req.verified_at = now
                # Invalidate any other outstanding codes for this number.
                OTPRequest.objects.filter(phone=phone, verified_at__isnull=True).exclude(pk=req.pk).update(
                    expires_at=now)
            else:
                left = settings.OTP_MAX_VERIFY_ATTEMPTS - req.attempts
                outcome = ("invalid", f"Incorrect OTP. {left} attempt(s) left.")
            req.save()
    if outcome:
        raise OTPError(outcome[1], f"otp_{outcome[0]}")
