"""Invoice PDF from the frozen order snapshot. Amounts are not recalculated here."""
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#1f2933")
MUTED = colors.HexColor("#52606d")
BRAND = colors.HexColor("#b42318")
LINE = colors.HexColor("#e4e7eb")
HEAD = colors.HexColor("#fdf2f2")


def _money(value):
    try:
        return f"₹{float(value):,.2f}"
    except (TypeError, ValueError):
        return "₹0.00"


def render_invoice_pdf(invoice):
    snap = invoice.snapshot or {}
    branch = snap.get("branch") or {}
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, title=invoice.invoice_number,
        leftMargin=16 * mm, rightMargin=16 * mm, topMargin=14 * mm, bottomMargin=16 * mm,
    )
    title = ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=18, textColor=BRAND, leading=22)
    heading = ParagraphStyle("heading", fontName="Helvetica-Bold", fontSize=11, textColor=INK, leading=14, spaceBefore=8)
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9, textColor=INK, leading=12)
    muted = ParagraphStyle("muted", fontName="Helvetica", fontSize=8, textColor=MUTED, leading=11)
    right = ParagraphStyle("right", parent=body, alignment=2)

    story = [
        Paragraph("FOODIE", title),
        Paragraph("Tax invoice", heading),
        Paragraph(invoice.invoice_number, body),
        Spacer(1, 4),
    ]
    contact = "<br/>".join(part for part in (
        branch.get("name") or "",
        branch.get("address") or "",
        branch.get("city") or "",
        branch.get("phone") or "",
        branch.get("email") or "",
    ) if part)
    meta = "<br/>".join((
        f"Order {snap.get('order_number') or snap.get('order_id') or ''}",
        f"Type {snap.get('order_type') or ''}",
        f"Table {snap.get('table_label')}" if snap.get("table_label") else "Takeaway",
        f"Placed {snap.get('placed_at') or ''}",
    ))
    info = Table(
        [[Paragraph(contact or "Foodie", body), Paragraph(meta, right)]],
        colWidths=[110 * mm, 68 * mm],
    )
    info.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#fafbfc")),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.extend([info, Spacer(1, 8), Paragraph("Items", heading)])

    rows = [[
        Paragraph("<b>Item</b>", body), Paragraph("<b>Qty</b>", right),
        Paragraph("<b>Price</b>", right), Paragraph("<b>Amount</b>", right),
    ]]
    for item in snap.get("items") or []:
        rows.append([
            Paragraph(str(item.get("name") or ""), body),
            Paragraph(str(item.get("quantity") or ""), right),
            Paragraph(_money(item.get("unit_price")), right),
            Paragraph(_money(item.get("line_total")), right),
        ])
    items = Table(rows, colWidths=[98 * mm, 18 * mm, 30 * mm, 32 * mm], repeatRows=1)
    items.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEAD),
        ("LINEBELOW", (0, 0), (-1, 0), 0.6, BRAND),
        ("LINEBELOW", (0, 1), (-1, -2), 0.2, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(items)

    summary = []
    for label, key, money in (
        ("Items", "items_subtotal", True),
        ("Add-ons", "customization_total", True),
        ("Menu discounts", "dish_discount_total", True),
        ("Coupons", "coupon_discount_total", True),
        ("Takeaway charge", "takeaway_charge", True),
        ("Taxable amount", "taxable_amount", True),
        (f"GST ({snap.get('gst_rate') or 0}%)", "gst_amount", True),
        (f"Service charge ({snap.get('service_charge_rate') or 0}%)", "service_charge_amount", True),
    ):
        summary.append([Paragraph(label, muted), Paragraph(_money(snap.get(key)) if money else str(snap.get(key) or ""), right)])
    summary.append([
        Paragraph("<b>Total</b>", body),
        Paragraph(f"<b>{_money(snap.get('total_amount'))}</b>", right),
    ])
    totals = Table(summary, colWidths=[120 * mm, 58 * mm])
    totals.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("LINEABOVE", (0, -1), (-1, -1), 0.6, INK),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))
    paid = snap.get("payment_status") or ""
    story.extend([
        Spacer(1, 10), totals, Spacer(1, 8),
        Paragraph(f"Payment status: {paid}", heading),
        Paragraph(
            "Payment status is separate from the kitchen status. An order can be completed while it is still unpaid.",
            muted,
        ),
        Spacer(1, 10),
        Paragraph("Thank you for dining with Foodie.", body),
        Paragraph("This invoice is generated from the saved order. It does not add a tax registration number.", muted),
    ])

    def footer(canvas, document):
        canvas.saveState()
        canvas.setFont("Helvetica", 8)
        canvas.setFillColor(MUTED)
        canvas.drawString(16 * mm, 8 * mm, invoice.invoice_number)
        canvas.drawRightString(A4[0] - 16 * mm, 8 * mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
