"""Email sending routes.

Provides a minimal API to send a text email to a Gmail address.

Implementation notes:
- Uses SMTP with an app password (recommended) or OAuth2.
- For Gmail, configure credentials via environment variables.
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field

from app.config import settings
from app.services.email_service import EmailSendError, EmailService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["email"])


class SendEmailRequest(BaseModel):
    to_email: EmailStr = Field(..., description="Recipient Gmail address")
    subject: str = Field("VendorPulse notification", min_length=1, max_length=255)
    text: str = Field(..., min_length=1, description="Email plain-text content")


class SendEmailResponse(BaseModel):
    message: str


@router.post("/api/email/send", response_model=SendEmailResponse)
def send_email(payload: SendEmailRequest):
    logger.info("send_email called — to=%s, subject=%s", payload.to_email, payload.subject)
    # Ensure email settings are present
    if not settings.smtp_host or not settings.smtp_username or not settings.smtp_password:
        logger.error("send_email: SMTP not configured")
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
        logger.error("send_email failed — to=%s, error=%s", payload.to_email, exc)
        raise HTTPException(status_code=502, detail=str(exc))

    logger.info("send_email success — to=%s", payload.to_email)
    return SendEmailResponse(message="Email sent")
