"""Email sending routes.

Provides a minimal API to send a text email to a Gmail address.

Implementation notes:
- Uses SMTP with an app password (recommended) or OAuth2.
- For Gmail, configure credentials via environment variables.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.services.email_service import EmailSendError, EmailService

router = APIRouter(tags=["email"])


class SendEmailRequest(BaseModel):
    to_email: EmailStr = Field(..., description="Recipient Gmail address")
    subject: str = Field("VendorPulse notification", min_length=1, max_length=255)
    text: str = Field(..., min_length=1, description="Email plain-text content")


class SendEmailResponse(BaseModel):
    message: str


@router.post("/api/email/send", response_model=SendEmailResponse)
def send_email(payload: SendEmailRequest):
    # Ensure email settings are present
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        raise HTTPException(
            status_code=500,
            detail=(
                "Email is not configured. Set SMTP_HOST, SMTP_USERNAME, "
                "SMTP_PASSWORD (and optionally SMTP_PORT, SMTP_USE_TLS)."
            ),
        )

    svc = EmailService.from_settings(settings)

    try:
        svc.send_text_email(
            to_email=str(payload.to_email),
            subject=payload.subject,
            text=payload.text,
        )
    except EmailSendError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return SendEmailResponse(message="Email sent")
