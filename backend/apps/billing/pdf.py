"""Invoice PDF from the frozen order snapshot. Amounts are not recalculated here."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

INK = colors.HexColor("#1f2933")
MUTED = colors.HexColor("#52606d")
BRAND = colors.HexColor("#be123c")
LINE = colors.HexColor("#f1d5dc")
HEAD = colors.HexColor("#be123c")
ZEBRA = colors.HexColor("#fff7f8")
PAPER = colors.HexColor("#fffdfd")
WHITE = colors.white

FONT_DIR = Path(__file__).resolve().parent / "fonts"
REGULAR = "FoodieSans"
BOLD = "FoodieSans-Bold"
_FONTS_READY = False

PAYMENT_LABELS = {
    "PAID": "Paid",
    "UNPAID": "Unpaid",
    "PENDING": "Payment pending",
    "FAILED": "Payment failed",
    "REFUNDED": "Refunded",
}


def _ensure_fonts():
    global _FONTS_READY
    if _FONTS_READY:
        return
    pdfmetrics.registerFont(TTFont(REGULAR, str(FONT_DIR / "DejaVuSans.ttf")))
    pdfmetrics.registerFont(TTFont(BOLD, str(FONT_DIR / "DejaVuSans-Bold.ttf")))
    pdfmetrics.registerFontFamily(REGULAR, normal=REGULAR, bold=BOLD, italic=REGULAR, boldItalic=BOLD)
    _FONTS_READY = True


def _decimal(value):
    try:
        return Decimal(str(value if value not in (None, "") else "0")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return Decimal("0.00")


def _money(value):
    amount = _decimal(value)
    sign = "-" if amount < 0 else ""
    whole, frac = f"{abs(amount):.2f}".split(".")
    return f"{sign}\u20b9{int(whole):,}.{frac}"


def _discount(value):
    amount = _decimal(value)
    if amount > 0:
        amount = -amount
    return _money(amount)


def _rate(value):
    amount = _decimal(value)
    if amount == amount.to_integral():
        return str(int(amount))
    return f"{amount:.2f}"


def _text(value):
    return escape(str(value or "")).replace("\n", "<br/>")


def _style(name, **kwargs):
    base = dict(fontName=REGULAR, fontSize=11, leading=14, textColor=INK)
    base.update(kwargs)
    return ParagraphStyle(name, **base)


def _display_snapshot(invoice):
    """Money stays on the frozen snapshot. Names and payment method can be read from the order."""
    snap = dict(invoice.snapshot or {})
    items = [dict(row) for row in (snap.get("items") or [])]
    order = getattr(invoice, "order", None)
    if order is not None:
        from apps.orders.lifecycle import _invoice_contact

        contact = _invoice_contact(order)
        if not snap.get("customer_name"):
            snap["customer_name"] = contact.get("customer_name") or ""
        if not snap.get("payment_method"):
            snap["payment_method"] = contact.get("payment_method") or ""
        live_items = list(order.items.all())
        if items and len(items) == len(live_items):
            for row, live in zip(items, live_items):
                if not row.get("customizations"):
                    row["customizations"] = live.customizations or []
    snap["items"] = items
    return snap


def render_invoice_pdf(invoice, for_customer=False):
    _ensure_fonts()
    snap = _display_snapshot(invoice)
    branch = snap.get("branch") or {}
    usable = A4[0] - 28 * mm

    brand = _style("brand", fontName=BOLD, fontSize=26, leading=30, textColor=BRAND)
    kicker = _style("kicker", fontName=BOLD, fontSize=12, leading=15, textColor=BRAND, alignment=TA_RIGHT)
    body = _style("body", fontSize=11, leading=14)
    meta = _style("meta", fontSize=11, leading=15, alignment=TA_RIGHT)
    head = _style("head", fontName=BOLD, fontSize=10, leading=13, textColor=WHITE)
    head_right = _style("head_right", fontName=BOLD, fontSize=10, leading=13, textColor=WHITE, alignment=TA_RIGHT)
    head_center = _style("head_center", fontName=BOLD, fontSize=10, leading=13, textColor=WHITE, alignment=TA_CENTER)
    cell = _style("cell", fontSize=10.5, leading=13)
    cell_right = _style("cell_right", fontSize=10.5, leading=13, alignment=TA_RIGHT)
    cell_center = _style("cell_center", fontSize=10.5, leading=13, alignment=TA_CENTER)
    extra = _style("extra", fontSize=9, leading=12, textColor=MUTED)
    label = _style("label", fontSize=11, leading=14, textColor=MUTED)
    amount = _style("amount", fontSize=11, leading=14, alignment=TA_RIGHT)
    total_label = _style("total_label", fontName=BOLD, fontSize=13, leading=16, textColor=BRAND)
    total_amount = _style("total_amount", fontName=BOLD, fontSize=13, leading=16, textColor=BRAND, alignment=TA_RIGHT)
    footer = _style("footer", fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER)

    restaurant_name = branch.get("name") or "Foodie"
    contact_lines = [restaurant_name]
    contact_lines.extend(part for part in (
        branch.get("address") or "",
        branch.get("city") or "",
        branch.get("phone") or "",
        branch.get("email") or "",
    ) if part)
    placed = snap.get("placed_at") or ""
    order_number = snap.get("order_number") or snap.get("order_id") or ""
    takeaway = str(snap.get("order_type") or "").upper() == "TAKEAWAY" or not snap.get("table_label")
    service = "Takeaway" if takeaway else f"Table {snap.get('table_label')}"
    meta_lines = [
        f"Invoice no. {invoice.invoice_number}",
        f"Order {order_number}" if order_number else "",
        placed,
        service,
    ]
    customer = snap.get("customer_name") or ""
    if customer:
        meta_lines.append(customer)

    header = Table(
        [[
            Paragraph("FOODIE", brand),
            Paragraph("TAX INVOICE", kicker),
        ]],
        colWidths=[usable * 0.55, usable * 0.45],
    )
    header.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 2, BRAND),
    ]))

    left_detail = (
        f"<font name='{BOLD}' size='13'>{_text(restaurant_name)}</font><br/>"
        + "<br/>".join(_text(line) for line in contact_lines[1:])
    )
    right_detail = (
        f"<font name='{BOLD}'>{_text(invoice.invoice_number)}</font><br/>"
        + "<br/>".join(_text(line) for line in meta_lines[1:] if line)
    )
    details = Table(
        [[Paragraph(left_detail, body), Paragraph(right_detail, meta)]],
        colWidths=[usable * 0.58, usable * 0.42],
    )
    details.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("LEFTPADDING", (0, 0), (0, 0), 2),
        ("RIGHTPADDING", (1, 0), (1, 0), 2),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
    ]))

    name_w = usable - (18 + 34 + 36) * mm
    rows = [[
        Paragraph("Item", head),
        Paragraph("Qty", head_center),
        Paragraph("Unit price", head_right),
        Paragraph("Amount", head_right),
    ]]
    for item in snap.get("items") or []:
        extras = []
        for option in item.get("customizations") or []:
            if not isinstance(option, dict):
                continue
            label_text = option.get("name") or ""
            if not label_text:
                continue
            price = option.get("extra_price")
            extras.append(f"{label_text} (+{_money(price)})" if price not in (None, "", 0, "0", "0.00") else label_text)
        name_flow = [Paragraph(_text(item.get("name") or "Dish"), cell)]
        if extras:
            name_flow.append(Paragraph(_text(", ".join(extras)), extra))
        rows.append([
            name_flow,
            Paragraph(_text(item.get("quantity") or ""), cell_center),
            Paragraph(_money(item.get("unit_price")), cell_right),
            Paragraph(_money(item.get("line_total")), cell_right),
        ])
    if len(rows) == 1:
        rows.append([
            Paragraph("No items were saved on this order.", cell),
            Paragraph("", cell), Paragraph("", cell), Paragraph("", cell),
        ])

    items = Table(rows, colWidths=[name_w, 18 * mm, 34 * mm, 36 * mm], repeatRows=1)
    item_style = [
        ("BACKGROUND", (0, 0), (-1, 0), HEAD),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 1), (1, -1), "CENTER"),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 1), (-1, -1), 0.3, LINE),
    ]
    for index in range(1, len(rows)):
        if index % 2 == 0:
            item_style.append(("BACKGROUND", (0, index), (-1, index), ZEBRA))
    items.setStyle(TableStyle(item_style))

    gst_label = f"GST ({_rate(snap.get('gst_rate'))}%)"
    service_label = f"Service charge ({_rate(snap.get('service_charge_rate'))}%)"
    summary_rows = [
        ("Subtotal", _money(snap.get("items_subtotal"))),
        ("Add-on charges", _money(snap.get("customization_total"))),
        ("Menu discounts", _discount(snap.get("dish_discount_total"))),
        ("Coupon discounts", _discount(snap.get("coupon_discount_total"))),
    ]
    takeaway_charge = _decimal(snap.get("takeaway_charge"))
    if takeaway or takeaway_charge != 0:
        summary_rows.append(("Packing Charges (Takeaway)", _money(takeaway_charge)))
    summary_rows.extend([
        ("Taxable amount", _money(snap.get("taxable_amount"))),
        (gst_label, _money(snap.get("gst_amount"))),
        (service_label, _money(snap.get("service_charge_amount"))),
        ("Round-off", _money(snap.get("round_off"))),
    ])
    summary_data = [
        [Paragraph(_text(label_text), label), Paragraph(_text(value), amount)]
        for label_text, value in summary_rows
    ]
    summary_data.append([
        Paragraph("Grand total", total_label),
        Paragraph(_text(_money(snap.get("total_amount"))), total_amount),
    ])
    summary = Table(summary_data, colWidths=[78 * mm, 40 * mm])
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -2), ZEBRA),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#fff1f2")),
        ("LINEABOVE", (0, -1), (-1, -1), 1.2, BRAND),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("BOX", (0, 0), (-1, -1), 0.4, LINE),
    ]))
    summary_wrap = Table([["", summary]], colWidths=[usable - 118 * mm, 118 * mm])
    summary_wrap.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))

    closing_items = [
        Spacer(1, 8),
        summary_wrap,
    ]
    if not for_customer:
        payment_code = str(snap.get("payment_status") or "").upper()
        payment_label = PAYMENT_LABELS.get(payment_code, payment_code or "Unpaid")
        method = snap.get("payment_method") or ""
        payment_lines = [f"<b>Payment status</b>&nbsp;&nbsp;{_text(payment_label)}"]
        if method:
            payment_lines.append(f"<b>Payment method</b>&nbsp;&nbsp;{_text(method)}")
        payment = Paragraph("<br/>".join(payment_lines), body)
        closing_items.extend([
            Spacer(1, 10),
            payment,
        ])

    closing_items.extend([
        Spacer(1, 12),
        Paragraph("Thank you for dining with Foodie.", footer),
        Paragraph("Computer-generated invoice from the saved order.", footer),
    ])
    closing = KeepTogether(closing_items)

    story = [header, Spacer(1, 2), details, Spacer(1, 8), items, closing]

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        title=invoice.invoice_number,
        leftMargin=14 * mm,
        rightMargin=14 * mm,
        topMargin=14 * mm,
        bottomMargin=16 * mm,
    )

    def footer_bar(canvas, document):
        canvas.saveState()
        canvas.setFillColor(BRAND)
        canvas.rect(0, 0, A4[0], 7 * mm, fill=1, stroke=0)
        canvas.setFillColor(WHITE)
        canvas.setFont(REGULAR, 8)
        canvas.drawString(14 * mm, 2.6 * mm, invoice.invoice_number)
        canvas.drawRightString(A4[0] - 14 * mm, 2.6 * mm, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer_bar, onLaterPages=footer_bar)
    return buf.getvalue()
