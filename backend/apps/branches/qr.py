import io

import qrcode
from django.conf import settings
from qrcode.constants import ERROR_CORRECT_M


def qr_url(table):
    """URL encoded in the table's QR code. The opaque UUID is validated server-side on scan."""
    return f"{settings.FRONTEND_BASE_URL}/customer/welcome?qr={table.qr_code}"


def render_png(table, box_size=10):
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_M, box_size=box_size, border=4)
    qr.add_data(qr_url(table))
    qr.make(fit=True)
    buf = io.BytesIO()
    qr.make_image(fill_color="black", back_color="white").save(buf, format="PNG")
    return buf.getvalue()
