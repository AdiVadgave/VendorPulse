"""Minimal Markdown -> PDF renderer (reportlab Platypus).

Handles the subset used by CLIENT_WALKTHROUGH.md:
  # / ## / ###  headings
  - bullets
  > blockquotes
  | tables |
  **bold** and *italic* inline
  --- horizontal rule
  paragraphs

Usage: python _md_to_pdf.py CLIENT_WALKTHROUGH.md CLIENT_WALKTHROUGH.pdf
"""
import re
import sys
import html

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
    ListFlowable, ListItem,
)

SHELL_RED = colors.HexColor("#C8102E")
INK = colors.HexColor("#1a1a1a")
MUTED = colors.HexColor("#555555")
RULE = colors.HexColor("#dddddd")
ZEBRA = colors.HexColor("#f5f6f8")
HEADBG = colors.HexColor("#C8102E")


def make_styles():
    ss = getSampleStyleSheet()
    styles = {}
    styles["h1"] = ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                                  fontSize=20, leading=24, textColor=SHELL_RED, spaceBefore=6, spaceAfter=10)
    styles["h2"] = ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                                  fontSize=14, leading=18, textColor=SHELL_RED, spaceBefore=14, spaceAfter=6)
    styles["h3"] = ParagraphStyle("h3", parent=ss["Heading3"], fontName="Helvetica-Bold",
                                  fontSize=11.5, leading=15, textColor=INK, spaceBefore=10, spaceAfter=4)
    styles["body"] = ParagraphStyle("body", parent=ss["BodyText"], fontName="Helvetica",
                                    fontSize=9.5, leading=14, textColor=INK, spaceAfter=6, alignment=TA_LEFT)
    styles["bullet"] = ParagraphStyle("bullet", parent=styles["body"], spaceAfter=3, leading=13)
    styles["quote"] = ParagraphStyle("quote", parent=styles["body"], fontName="Helvetica-Oblique",
                                     textColor=MUTED, leftIndent=10, borderPadding=(2, 2, 2, 8),
                                     spaceBefore=4, spaceAfter=8)
    styles["cell"] = ParagraphStyle("cell", parent=styles["body"], fontSize=9, leading=12, spaceAfter=0)
    styles["cellhead"] = ParagraphStyle("cellhead", parent=styles["cell"], fontName="Helvetica-Bold",
                                        textColor=colors.white)
    return styles


def inline(text):
    """Convert a subset of inline markdown to reportlab markup."""
    text = html.escape(text, quote=False)
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r'<font face="Courier">\1</font>', text)
    return text


def parse(md_path, styles):
    with open(md_path, encoding="utf-8") as f:
        lines = f.read().splitlines()

    flow = []
    i = 0
    n = len(lines)

    def flush_para(buf):
        if buf:
            flow.append(Paragraph(inline(" ".join(buf)), styles["body"]))

    while i < n:
        line = lines[i]
        stripped = line.strip()

        if not stripped:
            i += 1
            continue

        # Horizontal rule
        if stripped == "---":
            flow.append(Spacer(1, 4))
            flow.append(HRFlowable(width="100%", thickness=0.6, color=RULE,
                                   spaceBefore=2, spaceAfter=8))
            i += 1
            continue

        # Headings
        if stripped.startswith("### "):
            flow.append(Paragraph(inline(stripped[4:]), styles["h3"]))
            i += 1
            continue
        if stripped.startswith("## "):
            flow.append(Paragraph(inline(stripped[3:]), styles["h2"]))
            i += 1
            continue
        if stripped.startswith("# "):
            flow.append(Paragraph(inline(stripped[2:]), styles["h1"]))
            i += 1
            continue

        # Tables
        if stripped.startswith("|") and i + 1 < n and re.match(r"^\s*\|[\s:|-]+\|\s*$", lines[i + 1]):
            rows = []
            while i < n and lines[i].strip().startswith("|"):
                rows.append(lines[i].strip())
                i += 1
            # rows[0] = header, rows[1] = separator, rest = data
            def split_row(r):
                cells = [c.strip() for c in r.strip().strip("|").split("|")]
                return cells
            header = split_row(rows[0])
            data_rows = [split_row(r) for r in rows[2:]]
            table_data = [[Paragraph(inline(c), styles["cellhead"]) for c in header]]
            for dr in data_rows:
                table_data.append([Paragraph(inline(c), styles["cell"]) for c in dr])
            ncols = len(header)
            avail = A4[0] - 30 * mm
            col_w = [avail / ncols] * ncols
            tbl = Table(table_data, colWidths=col_w, repeatRows=1)
            style = [
                ("BACKGROUND", (0, 0), (-1, 0), HEADBG),
                ("GRID", (0, 0), (-1, -1), 0.4, RULE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            for ri in range(2, len(table_data) + 1, 2):
                style.append(("BACKGROUND", (0, ri - 1), (-1, ri - 1), ZEBRA))
            tbl.setStyle(TableStyle(style))
            flow.append(Spacer(1, 2))
            flow.append(tbl)
            flow.append(Spacer(1, 6))
            continue

        # Blockquote
        if stripped.startswith(">"):
            buf = []
            while i < n and lines[i].strip().startswith(">"):
                buf.append(lines[i].strip()[1:].strip())
                i += 1
            flow.append(Paragraph(inline(" ".join(buf)), styles["quote"]))
            continue

        # Bullet list
        if stripped.startswith("- "):
            items = []
            while i < n and lines[i].strip().startswith("- "):
                txt = lines[i].strip()[2:]
                # gather indented continuation sub-bullets as part of same item text
                items.append(ListItem(Paragraph(inline(txt), styles["bullet"]),
                                      leftIndent=6, value="bullet"))
                i += 1
            flow.append(ListFlowable(items, bulletType="bullet", start="square",
                                     bulletColor=SHELL_RED, leftIndent=12, bulletFontSize=6))
            flow.append(Spacer(1, 4))
            continue

        # Paragraph (gather until blank or structural line)
        buf = []
        while i < n and lines[i].strip() and not re.match(r"^\s*(#|>|-\s|\|)", lines[i]) \
                and lines[i].strip() != "---":
            buf.append(lines[i].strip())
            i += 1
        flush_para(buf)

    return flow


def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(15 * mm, 10 * mm,
                      "VendorPulse — Client Walkthrough (Shell)  ·  Confidential")
    canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, "Page %d" % doc.page)
    canvas.setStrokeColor(RULE)
    canvas.line(15 * mm, 13 * mm, A4[0] - 15 * mm, 13 * mm)
    canvas.restoreState()


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else "CLIENT_WALKTHROUGH.md"
    out = sys.argv[2] if len(sys.argv) > 2 else "CLIENT_WALKTHROUGH.pdf"
    styles = make_styles()
    flow = parse(src, styles)
    doc = SimpleDocTemplate(out, pagesize=A4,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=16 * mm, bottomMargin=18 * mm,
                            title="VendorPulse Client Walkthrough (Shell)",
                            author="VendorPulse")
    doc.build(flow, onFirstPage=footer, onLaterPages=footer)
    print("Wrote", out)


if __name__ == "__main__":
    main()
