"""Render the Client Meeting Prep pack and the Cheat-Sheet to PDF.

Reuses the proven Markdown->PDF engine in ../_md_to_pdf.py (Shell styling,
headings, tables, bullets, blockquotes, bold/italic/code). The .docx remains
the editable master; these PDFs are for printing/sharing.

Usage: python _render_pdfs.py
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))  # msft-agentic-docs/

import _md_to_pdf as M  # noqa: E402
from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.platypus import SimpleDocTemplate  # noqa: E402


def make_footer(label):
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(M.MUTED)
        canvas.drawString(15 * mm, 10 * mm, label)
        canvas.drawRightString(A4[0] - 15 * mm, 10 * mm, "Page %d" % doc.page)
        canvas.setStrokeColor(M.RULE)
        canvas.line(15 * mm, 13 * mm, A4[0] - 15 * mm, 13 * mm)
        canvas.restoreState()
    return footer


def compact(styles):
    """Shrink fonts/spacing so the cheat-sheet fits a single A4 page."""
    styles["h1"].fontSize = 10.5
    styles["h1"].leading = 12
    styles["h1"].spaceBefore = 3
    styles["h1"].spaceAfter = 2
    styles["body"].fontSize = 7
    styles["body"].leading = 8.6
    styles["body"].spaceAfter = 2
    styles["bullet"].fontSize = 7
    styles["bullet"].leading = 8.6
    styles["bullet"].spaceAfter = 0.5
    styles["quote"].fontSize = 7
    styles["quote"].leading = 8.6
    styles["quote"].spaceBefore = 1
    styles["quote"].spaceAfter = 2
    return styles


def render(src, out, label, title, dense=False):
    styles = M.make_styles()
    if dense:
        styles = compact(styles)
    flow = M.parse(src, styles)
    margins = (10 * mm, 12 * mm) if dense else (16 * mm, 18 * mm)
    doc = SimpleDocTemplate(out, pagesize=A4,
                            leftMargin=13 * mm, rightMargin=13 * mm,
                            topMargin=margins[0], bottomMargin=margins[1],
                            title=title, author="Zensar")
    f = make_footer(label)
    doc.build(flow, onFirstPage=f, onLaterPages=f)
    print("Wrote", out)


if __name__ == "__main__":
    render(os.path.join(HERE, "VendorPulse_Client_Meeting_Prep.md"),
           os.path.join(HERE, "VendorPulse_Client_Meeting_Prep.pdf"),
           "VendorPulse — Client Meeting Prep · Zensar · Confidential",
           "VendorPulse Client Meeting Prep")
    render(os.path.join(HERE, "VendorPulse_Demo_and_Flow_Guide.md"),
           os.path.join(HERE, "VendorPulse_Demo_and_Flow_Guide.pdf"),
           "VendorPulse — Demo Guide, Flow & Agent Hosting · Zensar · Confidential",
           "VendorPulse Demo & Flow Guide")
    render(os.path.join(HERE, "VendorPulse_Agent_Options_ProCon.md"),
           os.path.join(HERE, "VendorPulse_Agent_Options_ProCon.pdf"),
           "VendorPulse — Agent Hosting Options (Pros & Cons) · Zensar · Confidential",
           "VendorPulse Agent Options Pros & Cons", dense=True)
    render(os.path.join(HERE, "VendorPulse_Cheat_Sheet.md"),
           os.path.join(HERE, "VendorPulse_Cheat_Sheet.pdf"),
           "VendorPulse — Meeting Cheat-Sheet · Zensar · Confidential",
           "VendorPulse Cheat Sheet", dense=True)
