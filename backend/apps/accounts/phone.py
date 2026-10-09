import re


def normalize_phone(raw):
    """Return the phone in E.164 form. Bare 10-digit numbers starting 6-9 are treated as Indian (+91).

    Raises ValueError for anything that is not a plausible phone number.
    """
    s = re.sub(r"[\s\-()]", "", str(raw or ""))
    if s.startswith("+"):
        digits = s[1:]
        if digits.isdigit() and 8 <= len(digits) <= 15 and digits[0] != "0":
            return "+" + digits
        raise ValueError("Enter a valid phone number.")
    if s.isdigit():
        if len(s) == 10 and s[0] in "6789":
            return "+91" + s
        if len(s) == 12 and s.startswith("91") and s[2] in "6789":
            return "+" + s
    raise ValueError("Enter a valid phone number.")
