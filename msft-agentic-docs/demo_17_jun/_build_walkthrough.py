"""Render demo_17_jun docs to PDF.
 - Component Justification -> portrait PDF.
 - Client Walkthrough -> portrait PDF, with a LANDSCAPE ERD page merged on the end.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # msft-agentic-docs/
import _md_to_pdf as M  # noqa: E402
from reportlab.lib.pagesizes import A4, landscape  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle  # noqa: E402
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image  # noqa: E402
from reportlab.lib.utils import ImageReader  # noqa: E402
from pypdf import PdfReader, PdfWriter  # noqa: E402

ERD_PNG = r"C:\Users\CK115382\AppData\Local\Temp\claude\C--Projects-QBR-VendorPulse\2a242701-8965-42b7-b28f-afd17fdafe97\scratchpad\erd.png"


def footer(label):
    def f(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(M.MUTED)
        canvas.drawString(15 * mm, 10 * mm, label)
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, "Page %d" % doc.page)
        canvas.setStrokeColor(M.RULE)
        canvas.line(15 * mm, 13 * mm, A4[0] - 15 * mm, 13 * mm)
        canvas.restoreState()
    return f


def render_md(src, out, label, title):
    styles = M.make_styles()
    flow = M.parse(src, styles)
    doc = SimpleDocTemplate(out, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=16 * mm, bottomMargin=18 * mm, title=title, author="Zensar")
    fn = footer(label)
    doc.build(flow, onFirstPage=fn, onLaterPages=fn)


def erd_page(out):
    pw, ph = landscape(A4)
    margin = 12 * mm
    ss = getSampleStyleSheet()
    h = ParagraphStyle("h", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=15,
                       textColor=colors.HexColor("#1F3864"), spaceAfter=2)
    cap = ParagraphStyle("c", parent=ss["BodyText"], fontName="Helvetica-Oblique", fontSize=9,
                         textColor=colors.HexColor("#555555"), spaceAfter=6)
    iw, ih = ImageReader(ERD_PNG).getSize()
    avail = pw - 2 * margin
    scale = avail / iw
    maxh = ph - 2 * margin - 22 * mm
    if ih * scale > maxh:
        scale = maxh / ih
    img = Image(ERD_PNG, width=iw * scale, height=ih * scale)
    img.hAlign = "CENTER"
    story = [
        Paragraph("Appendix — Data Model (Entity-Relationship Diagram)", h),
        Paragraph("Target relational schema (PostgreSQL / Azure SQL). Crow's-foot notation: "
                  "||--o{ one-to-many · ||--o| one-to-zero-or-one · ||--|| one-to-one · PK/FK keys.", cap),
        img,
    ]
    doc = SimpleDocTemplate(out, pagesize=landscape(A4), leftMargin=margin, rightMargin=margin,
                            topMargin=12 * mm, bottomMargin=12 * mm, title="VendorPulse ERD")
    doc.build(story)


def merge(parts, out):
    w = PdfWriter()
    for p in parts:
        for pg in PdfReader(p).pages:
            w.add_page(pg)
    with open(out, "wb") as fh:
        w.write(fh)


if __name__ == "__main__":
    # Component Justification (portrait, no diagram)
    render_md(os.path.join(HERE, "COMPONENT_JUSTIFICATION.md"),
              os.path.join(HERE, "VendorPulse_Component_Justification.pdf"),
              "VendorPulse — Why Each Component Is Required · Zensar · Confidential",
              "VendorPulse Component Justification")

    # Walkthrough (portrait) + ERD (landscape) merged
    walk_tmp = os.path.join(HERE, "_walk_tmp.pdf")
    erd_tmp = os.path.join(HERE, "_erd_tmp.pdf")
    render_md(os.path.join(HERE, "CLIENT_WALKTHROUGH.md"), walk_tmp,
              "VendorPulse — Client Walkthrough (Shell) · Zensar · Confidential",
              "VendorPulse Client Walkthrough")
    erd_page(erd_tmp)
    merge([walk_tmp, erd_tmp], os.path.join(HERE, "VendorPulse_Client_Walkthrough.pdf"))
    os.remove(walk_tmp); os.remove(erd_tmp)
    print("Done: VendorPulse_Client_Walkthrough.pdf (+ ERD page), VendorPulse_Component_Justification.pdf")
