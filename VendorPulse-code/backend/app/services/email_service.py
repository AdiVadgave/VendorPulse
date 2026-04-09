"""Email service.

This module intentionally uses the standard library (smtplib) to avoid adding
runtime dependencies.

For Gmail, use an App Password (recommended) with SMTP over TLS.
"""

from __future__ import annotations

import smtplib
from dataclasses import dataclass
from email.mime.text import MIMEText


class EmailSendError(RuntimeError):
    pass


@dataclass(frozen=True)
class EmailConfig:
    host: str
    port: int
    username: str
    password: str
    use_tls: bool = True
    from_email: str | None = None


class EmailService:
    def __init__(self, config: EmailConfig):
        self._config = config

    @classmethod
    def from_settings(cls, settings) -> "EmailService":
        cfg = EmailConfig(
            host=getattr(settings, "smtp_host"),
            port=int(getattr(settings, "smtp_port")),
            username=getattr(settings, "smtp_username"),
            password=getattr(settings, "smtp_password"),
            use_tls=bool(getattr(settings, "smtp_use_tls")),
            from_email=(getattr(settings, "smtp_from_email") or None),
        )
        return cls(cfg)

    def send_text_email(self, *, to_email: str, subject: str, text: str) -> None:
        from_email = self._config.from_email or self._config.username

        msg = MIMEText(text, _subtype="plain", _charset="utf-8")
        msg["Subject"] = subject
        msg["From"] = from_email
        msg["To"] = to_email

        try:
            if self._config.use_tls:
                with smtplib.SMTP(self._config.host, self._config.port, timeout=20) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(self._config.username, self._config.password)
                    server.sendmail(from_email, [to_email], msg.as_string())
            else:
                with smtplib.SMTP(self._config.host, self._config.port, timeout=20) as server:
                    server.ehlo()
                    server.login(self._config.username, self._config.password)
                    server.sendmail(from_email, [to_email], msg.as_string())
        except Exception as exc:  # noqa: BLE001
            raise EmailSendError(f"Failed to send email to '{to_email}': {exc}") from exc
