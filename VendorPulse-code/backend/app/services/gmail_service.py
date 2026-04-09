"""
Gmail service — sends emails via the Gmail API using OAuth2 credentials.

Uses the authenticated user's own Gmail account (personal, not organisational).
"""
from __future__ import annotations

import base64
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from googleapiclient.discovery import build

from app.services.google_auth_service import get_credentials

logger = logging.getLogger(__name__)


class GmailSendError(RuntimeError):
    pass


def _get_gmail_service():
    creds = get_credentials()
    if creds is None:
        raise GmailSendError(
            "Google account not authenticated. "
            "Visit /auth/google to sign in first."
        )
    return build("gmail", "v1", credentials=creds)


def send_html_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
) -> dict:
    """Send an email via the authenticated user's Gmail account.

    Returns the Gmail API message resource (contains 'id', 'threadId', etc.).
    """
    service = _get_gmail_service()

    msg = MIMEMultipart("alternative")
    msg["To"] = to_email
    msg["Subject"] = subject

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")

    try:
        result = (
            service.users()
            .messages()
            .send(userId="me", body={"raw": raw})
            .execute()
        )
        logger.info("Email sent to %s — message id: %s", to_email, result.get("id"))
        return result
    except Exception as exc:
        raise GmailSendError(f"Failed to send email to '{to_email}': {exc}") from exc


def build_scorecard_email(
    *,
    attendee_name: str,
    vendor_name: str,
    cycle_id: str,
    quarter: str,
    year: int,
    form_url: str,
) -> dict[str, str]:
    """Generate a professional scorecard request email (subject + HTML body + text body)."""
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

    <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 12px 16px; border-radius: 4px; margin: 20px 0;">
      <p style="margin: 0; font-size: 13px; color: #92400e;">
        <strong>Important:</strong> Please enter Cycle ID <code style="background: #fff; padding: 2px 6px; border-radius: 3px; font-weight: bold;">{cycle_id}</code>
        in the form. Without the Cycle ID, your response cannot be mapped to this review cycle.
      </p>
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
        f"IMPORTANT: Enter Cycle ID '{cycle_id}' in the form so your response "
        f"can be mapped to this review cycle.\n\n"
        f"Categories: Risk & Compliance, Performance, Commercial, Relationship\n"
        f"Scale: 1 (Poor) to 5 (Excellent)\n\n"
        f"Thank you,\nVendorPulse"
    )

    return {"subject": subject, "html_body": html_body, "text_body": text_body}
