"""
Email body templates (provider-agnostic).

Pure HTML/text builders for the two emails VendorPulse sends — scorecard
requests and meeting minutes. No mail-transport or Google dependency: the
result is handed to `mail_provider.get_mail_provider().send_html_email(...)`,
which sends via Microsoft Graph (the service mailbox).
"""
from __future__ import annotations


def build_minutes_email(
    *,
    attendee_name: str,
    vendor_name: str,
    quarter: str,
    year: int,
    minutes: dict,
) -> dict[str, str]:
    """Generate a professional meeting minutes email (subject + HTML body + text body)."""
    subject = f"Meeting Minutes — {vendor_name} {quarter} {year} EGB/QBR"

    meeting_date = minutes.get("meeting_date", "")
    executive_summary = minutes.get("executive_summary", "")
    key_decisions = minutes.get("key_decisions", [])
    action_items = minutes.get("action_items", [])
    agenda_summaries = minutes.get("agenda_summaries", [])
    attendees_list = minutes.get("attendees", [])

    decisions_html = "".join(
        f'<li style="margin-bottom:8px;">{d}</li>' for d in key_decisions
    )
    actions_html = "".join(
        f'<tr>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">{a.get("description","")}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#6366f1;">{a.get("owner","")}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">{a.get("due_date","TBD")}</td>'
        f'</tr>'
        for a in action_items
    )
    agenda_html = "".join(
        f'<div style="margin-bottom:12px;">'
        f'<p style="margin:0 0 4px 0;font-size:13px;font-weight:600;color:#1e293b;">{a.get("topic","")}</p>'
        f'<p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">{a.get("summary","")}</p>'
        f'</div>'
        for a in agenda_summaries
    )

    html_body = f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:680px;margin:0 auto;color:#1e293b;">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:24px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:20px;">VendorPulse — Meeting Minutes</h1>
    <p style="color:#c7d2fe;margin:6px 0 0 0;font-size:14px;">{vendor_name} · {quarter} {year} EGB/QBR</p>
  </div>

  <div style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:32px;border-radius:0 0 12px 12px;">
    <p style="font-size:15px;line-height:1.6;">Dear <strong>{attendee_name}</strong>,</p>
    <p style="font-size:14px;color:#475569;">Please find below the finalised minutes for the <strong>{vendor_name} {quarter} {year} EGB/QBR</strong>{f" held on {meeting_date}" if meeting_date else ""}.</p>

    {"<div style='background:#f8fafc;border-left:4px solid #6366f1;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0;'><p style='margin:0 0 6px 0;font-size:11px;font-weight:700;color:#6366f1;text-transform:uppercase;letter-spacing:0.5px;'>Executive Summary</p><p style='margin:0;font-size:14px;color:#334155;line-height:1.6;'>" + executive_summary + "</p></div>" if executive_summary else ""}

    {"<div style='margin:24px 0;'><p style='font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;'>Key Decisions</p><ul style='margin:0;padding-left:20px;color:#334155;line-height:1.8;'>" + decisions_html + "</ul></div>" if key_decisions else ""}

    {"<div style='margin:24px 0;'><p style='font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;'>Agenda Summaries</p>" + agenda_html + "</div>" if agenda_summaries else ""}

    {"<div style='margin:24px 0;'><p style='font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px;'>Action Items (" + str(len(action_items)) + ")</p><table style='width:100%;border-collapse:collapse;'><thead><tr><th style='text-align:left;padding:8px 12px;background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;'>Action</th><th style='text-align:left;padding:8px 12px;background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;'>Owner</th><th style='text-align:left;padding:8px 12px;background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;'>Due</th></tr></thead><tbody>" + actions_html + "</tbody></table></div>" if action_items else ""}

    {"<div style='margin:16px 0;'><p style='font-size:12px;color:#94a3b8;'>Attendees: " + ", ".join(attendees_list) + "</p></div>" if attendees_list else ""}

    <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
    <p style="font-size:11px;color:#94a3b8;text-align:center;">
      Sent via VendorPulse — Automated Governance Platform
    </p>
  </div>
</div>
"""

    text_lines = [
        f"Meeting Minutes — {vendor_name} {quarter} {year} EGB/QBR",
        f"Date: {meeting_date}" if meeting_date else "",
        "",
    ]
    if executive_summary:
        text_lines += ["EXECUTIVE SUMMARY", executive_summary, ""]
    if key_decisions:
        text_lines += ["KEY DECISIONS"] + [f"  {i+1}. {d}" for i, d in enumerate(key_decisions)] + [""]
    if agenda_summaries:
        text_lines += ["AGENDA SUMMARIES"] + [f"  • {a['topic']}: {a['summary']}" for a in agenda_summaries] + [""]
    if action_items:
        text_lines += [f"ACTION ITEMS ({len(action_items)})"] + [
            f"  {i+1}. {a['description']} — {a['owner']} (due: {a.get('due_date','TBD')})"
            for i, a in enumerate(action_items)
        ] + [""]
    if attendees_list:
        text_lines += [f"Attendees: {', '.join(attendees_list)}", ""]
    text_lines += ["---", "Sent via VendorPulse — Automated Governance Platform"]

    text_body = "\n".join(line for line in text_lines)
    return {"subject": subject, "html_body": html_body, "text_body": text_body}


def build_scorecard_email(
    *,
    attendee_name: str,
    attendee_email: str,
    vendor_name: str,
    cycle_id: str,
    quarter: str,
    year: int,
    form_url: str,
) -> dict[str, str]:
    """Generate a professional scorecard request email (subject + HTML body + text body).

    `form_url` is the in-app scorecard link (already carries the cycle id), so no
    manual cycle-id entry notice is needed.
    """
    subject = f"{vendor_name} — QBR Scorecard Input Request ({quarter} {year})"

    html_body = f"""\
<div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1e293b;">
  <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 24px 32px; border-radius: 12px 12px 0 0;">
    <h1 style="color: #fff; margin: 0; font-size: 20px;">VendorPulse — Scorecard Request</h1>
  </div>

  <div style="background: #ffffff; border: 1px solid #e2e8f0; border-top: none; padding: 32px; border-radius: 0 0 12px 12px;">
    <p style="font-size: 15px; line-height: 1.6;">Dear <strong>{attendee_name}</strong>,</p>

    <p style="font-size: 15px; line-height: 1.6;">
      You have been identified as a key reviewer for the <strong>{vendor_name}</strong>
      QBR governance cycle (<strong>{quarter} {year}</strong>).
    </p>

    <p style="font-size: 15px; line-height: 1.6;">
      Please complete your scorecard input by rating each parameter on a <strong>1–5 scale</strong>
      (1 = Poor, 5 = Excellent).
    </p>

    <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin: 24px 0;">
      <p style="font-size: 13px; color: #64748b; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">Scorecard Categories</p>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 2;">
        <li><strong>Risk &amp; Compliance</strong> — Release/Patch Mgmt, Security, Audit</li>
        <li><strong>Performance</strong> — Delivery Timeliness, Quality, SLA, Resource Capability</li>
        <li><strong>Commercial</strong> — Pricing, Contract Compliance, Cost Control, Billing</li>
        <li><strong>Relationship</strong> — Communication, Engagement, Responsiveness</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 28px 0;">
      <a href="{form_url}" style="display: inline-block; background: #6366f1; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-size: 15px; font-weight: 600; letter-spacing: 0.3px;">
        Open Scorecard Form
      </a>
    </div>

    <p style="font-size: 13px; color: #94a3b8; margin-top: 24px; line-height: 1.5;">
      If you have questions, reply to this email or contact your VMO Coordinator.<br>
      Thank you for your timely input.
    </p>

    <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
    <p style="font-size: 11px; color: #94a3b8; text-align: center;">
      Sent via VendorPulse — Automated Governance Platform
    </p>
  </div>
</div>
"""

    text_body = (
        f"Dear {attendee_name},\n\n"
        f"You have been selected as a key reviewer for the {vendor_name} "
        f"QBR governance cycle ({quarter} {year}).\n\n"
        f"Please complete your scorecard at: {form_url}\n\n"
        f"Categories: Risk & Compliance, Performance, Commercial, Relationship\n"
        f"Scale: 1 (Poor) to 5 (Excellent)\n\n"
        f"Thank you,\nVendorPulse"
    )
    return {"subject": subject, "html_body": html_body, "text_body": text_body}


def build_reminder_email(
    *,
    attendee_name: str,
    vendor_name: str,
    quarter: str,
    year: int,
    form_url: str,
    deadline: str,
    days_left: int,
    tone_label: str,
) -> dict[str, str]:
    """A scorecard reminder email. `days_left` drives the urgency copy/colour."""
    urgent = days_left <= 0
    accent = "#dc2626" if urgent else ("#d97706" if days_left <= 2 else "#6366f1")
    when = (
        "is due <strong>today</strong>" if days_left <= 0
        else f"is due in <strong>{days_left} day{'s' if days_left != 1 else ''}</strong> (by {deadline})"
    )
    subject = (
        f"{'FINAL REMINDER' if urgent else 'Reminder'} — {vendor_name} QBR Scorecard "
        f"{'due today' if urgent else f'due {deadline}'} ({quarter} {year})"
    )
    html_body = f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b;">
  <div style="background:{accent};padding:22px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:19px;">VendorPulse — Scorecard {tone_label}</h1>
    <p style="color:#ffffffcc;margin:6px 0 0 0;font-size:13px;">{vendor_name} · {quarter} {year}</p>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:30px 32px;border-radius:0 0 12px 12px;">
    <p style="font-size:15px;line-height:1.6;">Dear <strong>{attendee_name}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;">
      Our records show your scorecard input for the <strong>{vendor_name} {quarter} {year}</strong>
      governance cycle {when}. Please submit it at your earliest convenience.
    </p>
    <div style="text-align:center;margin:26px 0;">
      <a href="{form_url}" style="display:inline-block;background:{accent};color:#fff;text-decoration:none;padding:13px 34px;border-radius:8px;font-size:15px;font-weight:600;">
        Complete Scorecard
      </a>
    </div>
    <p style="font-size:13px;color:#94a3b8;">If you have already submitted, please disregard this reminder.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0;" />
    <p style="font-size:11px;color:#94a3b8;text-align:center;">Sent via VendorPulse — Automated Governance Platform</p>
  </div>
</div>
"""
    text_body = (
        f"Dear {attendee_name},\n\n"
        f"Reminder: your scorecard for {vendor_name} {quarter} {year} "
        f"{'is due today' if urgent else f'is due in {days_left} day(s) (by {deadline})'}.\n\n"
        f"Complete it here: {form_url}\n\n"
        f"If already submitted, please disregard.\n\nVendorPulse"
    )
    return {"subject": subject, "html_body": html_body, "text_body": text_body}


def build_escalation_email(
    *,
    coordinator_name: str,
    vendor_name: str,
    quarter: str,
    year: int,
    deadline: str,
    pending: list[dict],
) -> dict[str, str]:
    """Deadline-day escalation to the VMO Coordinator listing who is still outstanding."""
    subject = f"[Escalation] {vendor_name} QBR scorecards outstanding — deadline {deadline}"
    rows = "".join(
        f'<tr><td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;">{p.get("name","")}</td>'
        f'<td style="padding:6px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#64748b;">{p.get("email","")}</td></tr>'
        for p in pending
    )
    html_body = f"""\
<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:620px;margin:0 auto;color:#1e293b;">
  <div style="background:#dc2626;padding:22px 32px;border-radius:12px 12px 0 0;">
    <h1 style="color:#fff;margin:0;font-size:19px;">VendorPulse — Scorecard Escalation</h1>
    <p style="color:#ffffffcc;margin:6px 0 0 0;font-size:13px;">{vendor_name} · {quarter} {year}</p>
  </div>
  <div style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:30px 32px;border-radius:0 0 12px 12px;">
    <p style="font-size:15px;line-height:1.6;">Dear <strong>{coordinator_name or 'VMO Coordinator'}</strong>,</p>
    <p style="font-size:15px;line-height:1.6;">
      Today is the scorecard deadline (<strong>{deadline}</strong>) for <strong>{vendor_name} {quarter} {year}</strong>,
      and <strong>{len(pending)}</strong> reviewer{'s' if len(pending) != 1 else ''} {'have' if len(pending) != 1 else 'has'} not yet submitted:
    </p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <thead><tr>
        <th style="text-align:left;padding:6px 12px;background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;">Name</th>
        <th style="text-align:left;padding:6px 12px;background:#f8fafc;font-size:11px;color:#64748b;text-transform:uppercase;">Email</th>
      </tr></thead>
      <tbody>{rows}</tbody>
    </table>
    <p style="font-size:13px;color:#475569;">Please follow up directly to keep the governance cycle on track.</p>
    <hr style="border:none;border-top:1px solid #e2e8f0;margin:22px 0;" />
    <p style="font-size:11px;color:#94a3b8;text-align:center;">Sent via VendorPulse — Automated Governance Platform</p>
  </div>
</div>
"""
    text_lines = [
        f"Dear {coordinator_name or 'VMO Coordinator'},",
        "",
        f"Today is the scorecard deadline ({deadline}) for {vendor_name} {quarter} {year}.",
        f"{len(pending)} reviewer(s) have not submitted:",
        *[f"  - {p.get('name','')} <{p.get('email','')}>" for p in pending],
        "",
        "Please follow up directly.",
        "",
        "VendorPulse",
    ]
    return {"subject": subject, "html_body": html_body, "text_body": "\n".join(text_lines)}
