"""
Scorecard -> PowerPoint, laid out to the Shell SPR scorecard template.

Produces ONE editable slide: real text boxes and a real PowerPoint table, so the deck
team can restyle, re-order and annotate it after pasting into the SPR deck. Nothing here
is a rendered image — that was the explicit requirement ("also it would be good if it
was editable").

Layout mirrors the supplied template:

    SCORECARD                                    High-Level Summary: 1..5 definitions
    [Vendor]              [period]               TOTAL SCORE: x/5 ^   Previous: y
    THEME | MEASURE | DESCRIPTION | SCORE | AVG | WEIGHT | COMMENTS
    ...one row per measure, THEME/AVG/WEIGHT merged down each theme...
    Copyright of Shell Information Technology International            INTERNAL

Trend arrows and every "Previous: N" come from the vendor's previous cycle, compiled
with the same function as the current one, so the two are always computed identically.

python-pptx notes that bit us elsewhere and are deliberately avoided here:
  * never assign ``text_frame.text`` — it collapses the paragraph to one unstyled run.
    Every styled fragment below is an explicit run.
  * ``add_picture`` cannot read SVG/EMF, so theme icons must arrive as PNG. None are
    shipped yet; the THEME cell is text-only until the artwork is supplied.
"""
from __future__ import annotations

import io
from typing import Optional

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Inches, Pt

from app.services.standard_text import cycle_period

# ── Palette ──────────────────────────────────────────────────────────────────
SHELL_RED = RGBColor(0xDD, 0x1D, 0x21)
INK = RGBColor(0x1E, 0x29, 0x3B)
MUTED = RGBColor(0x6B, 0x72, 0x80)
RULE = RGBColor(0xD1, 0xD5, 0xDB)
BAND = RGBColor(0xF3, 0xF4, 0xF6)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

GREEN = RGBColor(0x2E, 0x7D, 0x32)
AMBER = RGBColor(0xF5, 0x9E, 0x0B)
RED = RGBColor(0xDC, 0x26, 0x26)

# RAG measures carry no number — the cell is filled with the status colour instead.
_RAG_FILL = {"GREEN": GREEN, "AMBER": AMBER, "RED": RED}

FONT = "Arial"  # metric-stable everywhere; never Aptos (missing on older Office)

# 16:9 widescreen, matching the template.
SLIDE_W = Inches(13.333)
SLIDE_H = Inches(7.5)

_LEGEND = [
    "1 = systemic gaps",
    "2 = isolated gaps",
    "3 = meeting basic and/or contractual requirements",
    "4 = outcome or value-add activity or performance",
    "5 = significantly proactive or value-add with tangible business benefits",
]

_HEADERS = ["THEME", "MEASURE", "DESCRIPTION", "SCORE", "AVG", "WEIGHT", "COMMENTS"]
# Column widths in inches; must total the table width (12.53").
_COL_W = [1.30, 1.45, 2.60, 0.85, 0.85, 0.78, 4.70]


def _run(paragraph, text: str, *, size: int, bold: bool = False,
         color: RGBColor = INK, italic: bool = False):
    """Append a styled run. Always a run, never ``text_frame.text`` — see module docstring."""
    r = paragraph.add_run()
    r.text = text
    r.font.name = FONT
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    return r


def _textbox(slide, left, top, width, height):
    tb = slide.shapes.add_textbox(left, top, width, height)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = Emu(0)
    tf.margin_top = tf.margin_bottom = Emu(0)
    return tf


def _fmt_score(value: Optional[float]) -> str:
    """"4/5" for a whole number, "3.7/5" otherwise.

    Deliberately NOT rounded to an integer: with several reviewers the average is rarely
    whole, and rounding would hide real disagreement between them."""
    if value is None:
        return "—"
    return f"{int(value)}/5" if float(value).is_integer() else f"{value:g}/5"


def _fmt_avg(value: Optional[float]) -> str:
    if value is None:
        return "—"
    return f"{int(value)}" if float(value).is_integer() else f"{value:g}"


def _trend(current: Optional[float], previous: Optional[float]):
    """(arrow, colour) against the previous cycle, or None when there is nothing to
    compare — a first cycle, or a measure nobody scored on either side."""
    if current is None or previous is None:
        return None
    if current > previous:
        return ("▲", GREEN)      # ▲
    if current < previous:
        return ("▼", RED)        # ▼
    return None


def _index_previous(previous: Optional[dict]) -> tuple[dict, dict]:
    """(measure_key -> average, category_key -> average) for the previous cycle."""
    if not previous:
        return ({}, {})
    measures, cats = {}, {}
    for cat in previous.get("categories") or []:
        cats[cat.get("key")] = cat.get("category_average")
        for m in cat.get("measures") or []:
            measures[m.get("key")] = m.get("average")
    return (measures, cats)


def _measure_comment(measure: dict) -> str:
    """One paragraph for the COMMENTS column.

    Joins the reviewers' own comments rather than calling the LLM: a download must not
    depend on a live model call that can be slow or fail. Where a per-measure AI summary
    has already been generated it is preferred, since that is what the template shows."""
    summary = (measure.get("comment_summary") or "").strip()
    if summary:
        return summary
    parts = [c.strip() for c in (measure.get("comments") or {}).values() if (c or "").strip()]
    return "  ".join(parts)


def build_scorecard_pptx(
    *,
    weighted: dict,
    cycle: dict,
    previous: Optional[dict] = None,
) -> bytes:
    """Render the consolidated scorecard as a one-slide .pptx and return its bytes.

    ``weighted``/``previous`` are ``_compile_weighted`` results for this cycle and the
    vendor's preceding one (``previous`` None on a first cycle — the trend arrows and
    "Previous:" lines are then simply omitted)."""
    prev_measures, prev_cats = _index_previous(previous)

    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank

    # ── Title ────────────────────────────────────────────────────────────────
    tf = _textbox(slide, Inches(0.40), Inches(0.30), Inches(4.0), Inches(0.6))
    _run(tf.paragraphs[0], "SCORECARD", size=30, bold=True)

    # ── High-level summary legend (top right) ────────────────────────────────
    tf = _textbox(slide, Inches(7.60), Inches(0.22), Inches(5.35), Inches(1.15))
    _run(tf.paragraphs[0], "High-Level Summary:", size=9, bold=True, color=SHELL_RED)
    for line in _LEGEND:
        _run(tf.add_paragraph(), line, size=8, color=INK)

    # ── Vendor / period / total score ────────────────────────────────────────
    top = Inches(1.05)
    vendor = (cycle.get("vendor_name") or "Vendor").strip()
    frm, to = cycle_period(cycle.get("quarter", ""), cycle.get("year", ""))

    for left, width, text in (
        (Inches(0.40), Inches(2.60), vendor),
        (Inches(5.40), Inches(2.00), f"{frm} - {to}"),
    ):
        box = slide.shapes.add_textbox(left, top, width, Inches(0.36))
        box.line.color.rgb = SHELL_RED
        box.line.width = Pt(1)
        box.fill.background()
        itf = box.text_frame
        itf.word_wrap = True
        itf.vertical_anchor = MSO_ANCHOR.MIDDLE
        _run(itf.paragraphs[0], text, size=11, bold=True)

    overall = weighted.get("overall_score")
    prev_overall = (previous or {}).get("overall_score")
    tf = _textbox(slide, Inches(9.40), top, Inches(3.55), Inches(0.36))
    p = tf.paragraphs[0]
    _run(p, "TOTAL SCORE: ", size=12, bold=True)
    _run(p, _fmt_score(overall).replace("/5", "") + "/5", size=12, bold=True)
    t = _trend(overall, prev_overall)
    if t:
        _run(p, "  " + t[0], size=12, bold=True, color=t[1])
    if prev_overall is not None:
        _run(tf.add_paragraph(), f"Previous: {_fmt_avg(prev_overall)}", size=8, color=MUTED)

    # ── Table ────────────────────────────────────────────────────────────────
    categories = [c for c in (weighted.get("categories") or []) if c.get("measures")]
    rows = 1 + sum(len(c["measures"]) for c in categories)
    if rows == 1:                      # nothing configured — emit the header alone
        rows = 2

    table_top = Inches(1.60)
    table_h = Inches(5.20)
    shape = slide.shapes.add_table(rows, len(_HEADERS), Inches(0.40), table_top,
                                   Inches(sum(_COL_W)), table_h)
    table = shape.table

    # Type scale, chosen from the row count.
    #
    # A table's declared height is a MINIMUM: PowerPoint grows every row until its text
    # fits, so a fixed 5.2in box with 30 rows does not compress — it renders past the
    # footer and off the slide. python-pptx cannot show this (it reports the requested
    # height back), so it has to be prevented here rather than detected afterwards.
    # Shrinking the body type and setting an explicit per-row height keeps the rendered
    # table inside AVAILABLE_H for the row counts a real scorecard produces.
    body_pt, label_pt, score_pt = (7.5, 9.0, 11.0)
    if rows > 14:
        body_pt, label_pt, score_pt = (6.5, 8.0, 10.0)
    if rows > 22:
        body_pt, label_pt, score_pt = (5.5, 7.0, 9.0)
    row_h = Emu(int(table_h / max(rows, 1)))
    for r_ in table.rows:
        r_.height = row_h
    table.first_row = True
    for i, w in enumerate(_COL_W):
        table.columns[i].width = Inches(w)

    def cell_tf(r: int, c: int):
        cell = table.cell(r, c)
        cell.margin_left = cell.margin_right = Inches(0.06)
        cell.margin_top = cell.margin_bottom = Inches(0.03)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        cell.fill.solid()
        cell.fill.fore_color.rgb = WHITE
        return cell

    # Header row
    for c, label in enumerate(_HEADERS):
        cell = cell_tf(0, c)
        cell.fill.fore_color.rgb = BAND
        _run(cell.text_frame.paragraphs[0], label, size=label_pt, bold=True, color=MUTED)

    r = 1
    for cat in categories:
        first_row = r
        weight = cat.get("weight")
        cat_avg = cat.get("category_average")
        prev_cat = prev_cats.get(cat.get("key"))

        for m in cat["measures"]:
            is_rag = m.get("measure_type") == "rag"
            avg = m.get("average")

            _run(cell_tf(r, 1).text_frame.paragraphs[0], m.get("label", ""), size=label_pt, bold=True)
            _run(cell_tf(r, 2).text_frame.paragraphs[0], m.get("description", "") or "", size=body_pt, color=MUTED)

            # SCORE — a RAG measure has no number; the cell carries the status colour.
            sc = cell_tf(r, 3)
            sp = sc.text_frame.paragraphs[0]
            sp.alignment = PP_ALIGN.CENTER
            if is_rag:
                status = (m.get("rag_consensus") or "").upper()
                fill = _RAG_FILL.get(status)
                if fill:
                    sc.fill.fore_color.rgb = fill
                    _run(sp, status.title(), size=9, bold=True, color=WHITE)
                else:
                    _run(sp, "—", size=9, color=MUTED)
            else:
                _run(sp, _fmt_score(avg), size=score_pt, bold=True)
                t = _trend(avg, prev_measures.get(m.get("key")))
                if t:
                    _run(sp, "  " + t[0], size=10, bold=True, color=t[1])
                pv = prev_measures.get(m.get("key"))
                if pv is not None:
                    pp = sc.text_frame.add_paragraph()
                    pp.alignment = PP_ALIGN.CENTER
                    _run(pp, f"Previous: {_fmt_avg(pv)}", size=6.5, color=MUTED)

            _run(cell_tf(r, 6).text_frame.paragraphs[0], _measure_comment(m), size=body_pt)
            # Cells that get merged still need their fill/margins set first.
            cell_tf(r, 0)
            cell_tf(r, 4)
            cell_tf(r, 5)
            r += 1

        last_row = r - 1
        # THEME / AVG / WEIGHT span the theme's measures.
        for col in (0, 4, 5):
            if last_row > first_row:
                table.cell(first_row, col).merge(table.cell(last_row, col))

        theme_cell = table.cell(first_row, 0)
        theme_cell.fill.solid()
        theme_cell.fill.fore_color.rgb = BAND
        tp = theme_cell.text_frame.paragraphs[0]
        tp.alignment = PP_ALIGN.CENTER
        _run(tp, (cat.get("label") or "").upper(), size=10, bold=True)

        avg_cell = table.cell(first_row, 4)
        ap = avg_cell.text_frame.paragraphs[0]
        ap.alignment = PP_ALIGN.CENTER
        _run(ap, _fmt_avg(cat_avg), size=12, bold=True)
        t = _trend(cat_avg, prev_cat)
        if t:
            _run(ap, "  " + t[0], size=10, bold=True, color=t[1])
        if prev_cat is not None:
            pp = avg_cell.text_frame.add_paragraph()
            pp.alignment = PP_ALIGN.CENTER
            _run(pp, f"Previous {_fmt_avg(prev_cat)}", size=6.5, color=MUTED)

        w_cell = table.cell(first_row, 5)
        wp = w_cell.text_frame.paragraphs[0]
        wp.alignment = PP_ALIGN.CENTER
        _run(wp, f"{weight}%" if weight is not None else "—", size=11, bold=True)

    # ── Footer ───────────────────────────────────────────────────────────────
    tf = _textbox(slide, Inches(0.40), Inches(6.95), Inches(7.0), Inches(0.3))
    _run(tf.paragraphs[0], "Copyright of Shell Information Technology International",
         size=8, color=MUTED)

    tf = _textbox(slide, Inches(11.40), Inches(6.95), Inches(1.55), Inches(0.3))
    tf.paragraphs[0].alignment = PP_ALIGN.RIGHT
    _run(tf.paragraphs[0], "INTERNAL", size=8, bold=True, color=SHELL_RED)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
