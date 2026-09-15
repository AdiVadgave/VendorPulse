"""Free SPR period helpers.

A governance cycle's period is a free month range — a FROM and TO month — stored
as two ``YYYY-MM`` strings (``period_start`` / ``period_end``), replacing the rigid
Q1–Q4 model. ``YYYY-MM`` strings compare lexicographically, which equals
chronological order, so ranges sort and overlap-test with plain string comparison.
Legacy cycles that only have quarter+year are backfilled to a period.
"""
from __future__ import annotations

import re

_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_YM = re.compile(r"^\d{4}-(0[1-9]|1[0-2])$")

# Legacy quarter → first/last month of that quarter.
_Q_START = {"Q1": 1, "Q2": 4, "Q3": 7, "Q4": 10}
_Q_END = {"Q1": 3, "Q2": 6, "Q3": 9, "Q4": 12}


def is_valid_ym(value: object) -> bool:
    """True for a ``YYYY-MM`` string with month 01–12."""
    return isinstance(value, str) and bool(_YM.match(value.strip()))


def _fmt_ym(ym: str) -> str:
    """``2026-03`` → ``Mar 2026``."""
    year, month = ym.strip().split("-")
    return f"{_MONTHS[int(month) - 1]} {year}"


def period_from_quarter(quarter: str, year: object) -> tuple[str | None, str | None]:
    """Legacy ``Q1``..``Q4`` + year → ``(period_start, period_end)`` as ``YYYY-MM``."""
    try:
        y = int(year)
    except (TypeError, ValueError):
        return (None, None)
    if quarter not in _Q_START:
        return (None, None)
    return (f"{y:04d}-{_Q_START[quarter]:02d}", f"{y:04d}-{_Q_END[quarter]:02d}")


def quarter_year_from_period(period_start: object) -> tuple[str | None, int | None]:
    """Derive a ``(quarter, year)`` from a period's start month — kept populated for
    backward-compatible display/analytics. e.g. ``2026-03`` → ``("Q1", 2026)``."""
    if not is_valid_ym(period_start):
        return (None, None)
    year, month = str(period_start).split("-")
    quarter = (int(month) - 1) // 3 + 1
    return (f"Q{quarter}", int(year))


def period_label(cycle: dict) -> str:
    """Human label: ``"Mar 2026 – Sep 2026"`` (or ``"Mar 2026"`` for a single month).
    Falls back to ``"Q1 2026"`` for legacy cycles that still lack a period."""
    start = (cycle.get("period_start") or "")
    end = (cycle.get("period_end") or "")
    if is_valid_ym(start) and is_valid_ym(end):
        a, b = _fmt_ym(start), _fmt_ym(end)
        return a if a == b else f"{a} – {b}"
    q, y = cycle.get("quarter"), cycle.get("year")
    return f"{q or ''} {y or ''}".strip()


def period_sort_key(cycle: dict) -> tuple[int, int]:
    """Chronological ``(year, month)`` key from ``period_start`` (fallback quarter/year)."""
    start = cycle.get("period_start") or ""
    if is_valid_ym(start):
        year, month = str(start).split("-")
        return (int(year), int(month))
    try:
        y = int(cycle.get("year") or 0)
    except (TypeError, ValueError):
        y = 0
    return (y, _Q_START.get(cycle.get("quarter", ""), 0))


def periods_overlap(a_start: str, a_end: str, b_start: str, b_end: str) -> bool:
    """Two month ranges overlap iff ``a_start <= b_end`` and ``b_start <= a_end``."""
    return a_start <= b_end and b_start <= a_end
