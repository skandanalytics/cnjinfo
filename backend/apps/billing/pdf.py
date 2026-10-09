"""One-page invoice PDF from a frozen snapshot. No live prices."""
from io import BytesIO

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas


def render_invoice_pdf(invoice):
    snap = invoice.snapshot or {}
    buf = BytesIO()
    pdf = canvas.Canvas(buf, pagesize=A4)
    _, height = A4
    y = height - 20 * mm
    pdf.setTitle(invoice.invoice_number)

    def line(text, size=11, bold=False):
        nonlocal y
        pdf.setFont("Helvetica-Bold" if bold else "Helvetica", size)
        pdf.drawString(18 * mm, y, str(text)[:120])
        y -= size + 5

    branch = snap.get("branch") or {}
    line("Foodie", 16, True)
    line(f"Invoice {invoice.invoice_number}", 13, True)
    line(f"Order {snap.get('order_number', '')}")
    line(f"Branch {branch.get('name', '')}")
    line(f"Payment status {snap.get('payment_status', '')}")
    line("Items", 12, True)
    for item in snap.get("items") or []:
        line(f"{item.get('name')}  x{item.get('quantity')}  {item.get('line_total')}")
    line("Price breakdown", 12, True)
    for label, key in (
        ("Items", "items_subtotal"),
        ("Customizations", "customization_total"),
        ("Dish discounts", "dish_discount_total"),
        ("Coupons", "coupon_discount_total"),
        ("Takeaway charge", "takeaway_charge"),
        ("Taxable amount", "taxable_amount"),
        ("GST rate", "gst_rate"),
        ("GST", "gst_amount"),
        ("Service charge rate", "service_charge_rate"),
        ("Service charge", "service_charge_amount"),
        ("Total", "total_amount"),
    ):
        line(f"{label}: {snap.get(key)}")
    pdf.showPage()
    pdf.save()
    return buf.getvalue()
