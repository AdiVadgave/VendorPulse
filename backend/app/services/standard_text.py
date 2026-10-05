"""
The Shell-approved standard texts for every invite and notification VendorPulse sends.

SINGLE SOURCE OF TRUTH. Every title and body below is signed off by the business — do
not reword them at a call site, and do not inline a variant elsewhere. Call sites pass
the cycle's facts in and render what they get back; that is what keeps the wording
identical across the SPR invite, the alignment calls, the prep call and the scorecard.

Two sign-offs are in use and they are NOT interchangeable:
  * meeting invites      -> "Mobility Vendor Pulse Scheduling Agent"
  * the scorecard email  -> "Mobility Vendor Pulse Agent"

The title separator after "SPR" is an EN DASH (–); the separator between the period
months is a plain hyphen (-). Both are as specified.
"""
from __future__ import annotations

from html import escape

# Month abbreviations by quarter. The governance cycle is named for the quarter it
# REVIEWS, so Q1 covers Jan–Mar of that same year.
_QUARTER_MONTHS: dict[str, tuple[str, str]] = {
    "Q1": ("Jan", "Mar"),
    "Q2": ("Apr", "Jun"),
    "Q3": ("Jul", "Sep"),
    "Q4": ("Oct", "Dec"),
}


def cycle_period(quarter: str, year: int | str) -> tuple[str, str]:
    """The {from} / {to} labels for a cycle, e.g. ("Jan 2026", "Mar 2026").

    Derived from the quarter rather than stored, so every existing cycle renders
    correctly with no migration and no back-fill. An unrecognised quarter degrades to
    the bare year on both sides rather than emitting a broken title."""
    q = (quarter or "").strip().upper()
    y = str(year or "").strip()
    months = _QUARTER_MONTHS.get(q)
    if not months:
        return (y, y)
    return (f"{months[0]} {y}".strip(), f"{months[1]} {y}".strip())


def spr_label(vendor_name: str, quarter: str, year: int | str) -> str:
    """The common tail every title shares: "Shell/{vendor} SPR – {from} - {to}"."""
    frm, to = cycle_period(quarter, year)
    return f"Shell/{(vendor_name or '').strip()} SPR – {frm} - {to}"


def spr_title(vendor_name: str, quarter: str, year: int | str, prefix: str = "") -> str:
    """A full title. ``prefix`` is the bit before the pipe, e.g. "Prep Call" or
    "Internal Alignment 2"; omit it for the SPR meeting itself."""
    tail = spr_label(vendor_name, quarter, year)
    p = (prefix or "").strip()
    return f"{p} | {tail}" if p else tail


# ── Bodies ───────────────────────────────────────────────────────────────────
# Plain text. Call sites that need HTML wrap each line in a <p>; see as_html().

_SIGN_SCHEDULING = "Thank you.\nMobility Vendor Pulse Scheduling Agent"
_SIGN_AGENT = "Thank you.\nMobility Vendor Pulse Agent"

_ORGANISER_NOTE = (
    "Any additional details relevant to this call will be shared by the meeting "
    "organiser through a separate email."
)


def spr_invite_body(attendee_name: str, vendor_name: str, quarter: str, year: int | str) -> str:
    frm, to = cycle_period(quarter, year)
    return (
        f"Dear {attendee_name},\n\n"
        f"You are invited to the Shell/{vendor_name} SPR, covering the {frm} - {to} period.\n\n"
        "The preceding preparation sessions will be scheduled shortly, and any additional "
        "details relevant to this call will be shared by the meeting organiser through a "
        "separate email.\n\n"
        f"{_SIGN_SCHEDULING}"
    )


def alignment_invite_body(
    attendee_name: str, vendor_name: str, quarter: str, year: int | str, session: int = 1
) -> str:
    """Session 1 carries the extra IMPORTANT line asking for scores before the meeting;
    later sessions do not (by then the scorecard has been collected)."""
    frm, to = cycle_period(quarter, year)
    n = max(1, int(session or 1))
    important = (
        "IMPORTANT: Kindly submit your scores and comments before this meeting by using "
        "the link previously shared, even if you cannot attend.\n\n"
        if n == 1 else ""
    )
    return (
        f"Dear {attendee_name},\n\n"
        f"You are invited to the Internal Alignment Session {n} for the Shell/{vendor_name} "
        f"SPR covering the {frm} - {to} period.\n\n"
        f"{_ORGANISER_NOTE}\n\n"
        f"{important}"
        f"{_SIGN_SCHEDULING}"
    )


def vendor_prep_invite_body(attendee_name: str, vendor_name: str, quarter: str, year: int | str) -> str:
    frm, to = cycle_period(quarter, year)
    return (
        f"Dear {attendee_name},\n\n"
        f"You are invited to the Prep Call for the Shell/{vendor_name} SPR covering the "
        f"{frm} - {to} period.\n\n"
        "The main objective of this session is to present and discuss the SPR scorecard.\n\n"
        f"{_ORGANISER_NOTE}\n\n"
        f"{_SIGN_SCHEDULING}"
    )


def scorecard_request_body(attendee_name: str, vendor_name: str, quarter: str, year: int | str) -> str:
    """Note the sign-off: the scorecard is NOT from the Scheduling Agent."""
    frm, to = cycle_period(quarter, year)
    return (
        f"Dear {attendee_name},\n\n"
        f"You have been identified as a performance reviewer for the Shell/{vendor_name} "
        f"SPR – {frm} - {to} governance cycle.\n\n"
        "IMPORTANT: Please provide your scores and comments before the Internal Alignment "
        "Session, even if you cannot attend.\n\n"
        "Kindly reach out to the meeting organiser if you have any doubts or if you "
        "experience any challenges while filling your feedback in.\n\n"
        f"{_SIGN_AGENT}"
    )


def split_body(body: str) -> tuple[list[str], str]:
    """Split a standard text into (paragraphs before the sign-off, sign-off).

    Lets a rich HTML email interleave its own blocks — the form button, the how-to
    list, the personal-data notice — between the approved wording and the sign-off,
    without any call site having to restate a single approved sentence."""
    paras = [x for x in body.split("\n\n") if x.strip()]
    if not paras:
        return ([], "")
    return (paras[:-1], paras[-1])


def as_html(body: str) -> str:
    """Render a standard text as simple HTML paragraphs, preserving the line break
    inside the sign-off.

    The text is escaped first. Every builder above returns plain text with a vendor
    or attendee name interpolated into it, and a vendor name is free text typed by a
    coordinator, so an unescaped "&" or "<" would break the markup or inject into it.
    The frontend mirror escapes the same values (frontend/src/lib/standardText.ts),
    so escaping here also keeps the two renderings in step."""
    paras = [p for p in body.split("\n\n") if p.strip()]
    return "".join(
        '<p style="font-size:14px;line-height:1.6;margin:0 0 16px 0;color:#1e293b;">'
        + escape(p, quote=False).replace("\n", "<br>")
        + "</p>"
        for p in paras
    )
