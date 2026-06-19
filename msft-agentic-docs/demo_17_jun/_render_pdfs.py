"""Render the demo_17_jun docs to PDF using the shared ../_md_to_pdf.py engine.

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


def render(src, out, label, title):
    styles = M.make_styles()
    flow = M.parse(src, styles)
    doc = SimpleDocTemplate(out, pagesize=A4,
                            leftMargin=15 * mm, rightMargin=15 * mm,
                            topMargin=16 * mm, bottomMargin=18 * mm,
                            title=title, author="Zensar")
    f = make_footer(label)
    doc.build(flow, onFirstPage=f, onLaterPages=f)
    print("Wrote", out)


if __name__ == "__main__":
    render(os.path.join(HERE, "CLIENT_WALKTHROUGH.md"),
           os.path.join(HERE, "VendorPulse_Client_Walkthrough.pdf"),
           "VendorPulse — Client Walkthrough (Shell) · Zensar · Confidential",
           "VendorPulse Client Walkthrough")
    render(os.path.join(HERE, "COMPONENT_JUSTIFICATION.md"),
           os.path.join(HERE, "VendorPulse_Component_Justification.pdf"),
           "VendorPulse — Why Each Component Is Required · Zensar · Confidential",
           "VendorPulse Component Justification")
