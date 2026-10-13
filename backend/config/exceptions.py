from rest_framework.exceptions import Throttled
from rest_framework.views import exception_handler


def _wait_text(seconds):
    wait = max(0, int(seconds or 0))
    if wait <= 0:
        return "a short while"
    if wait < 60:
        unit = "second" if wait == 1 else "seconds"
        return f"{wait} {unit}"
    minutes = (wait + 59) // 60
    if minutes < 60:
        unit = "minute" if minutes == 1 else "minutes"
        return f"{minutes} {unit}"
    hours = minutes // 60
    rem = minutes % 60
    if rem == 0:
        unit = "hour" if hours == 1 else "hours"
        return f"{hours} {unit}"
    h_unit = "hour" if hours == 1 else "hours"
    m_unit = "minute" if rem == 1 else "minutes"
    return f"{hours} {h_unit} {rem} {m_unit}"


def foodie_exception_handler(exc, context):
    response = exception_handler(exc, context)
    if response is None or not isinstance(exc, Throttled):
        return response
    wait = int(getattr(exc, "wait", None) or 0)
    view = context.get("view")
    view_name = view.__class__.__name__ if view else ""
    request = context.get("request")
    path = getattr(request, "path", "")
    scopes = [
        getattr(cls, "scope", "")
        for cls in getattr(view, "throttle_classes", []) or []
    ]
    otp = any(str(scope).startswith("otp_") for scope in scopes) or "OTP" in view_name or "/otp/" in path
    wait_text = _wait_text(wait)
    detail = (
        f"OTP requests are temporarily limited. Try again in {wait_text}."
        if otp else
        f"Too many requests. Try again in {wait_text}."
    )
    response.data = {"detail": detail, "code": "throttled", "retry_after": wait}
    if wait:
        response["Retry-After"] = str(wait)
    return response
