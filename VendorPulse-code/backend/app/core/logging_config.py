"""
Centralized logging configuration for VendorPulse backend.

Sets up:
  - Rotating file handler  -> logs/vendorpulse.log (10 MB, 5 backups)
  - Console handler        -> stdout (colored, concise)
  - Per-module loggers via standard logging.getLogger(__name__)

Usage:
    from app.core.logging_config import setup_logging
    setup_logging()           # call once at startup (run.py / main.py)

    # In any module:
    import logging
    logger = logging.getLogger(__name__)
    logger.info("message")
"""
from __future__ import annotations

import logging
import sys
from logging.handlers import RotatingFileHandler
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parent.parent.parent / "logs"
LOG_FILE = LOG_DIR / "vendorpulse.log"

# Format: timestamp | level | module:function:line | message
FILE_FORMAT = (
    "%(asctime)s | %(levelname)-8s | %(name)s:%(funcName)s:%(lineno)d | %(message)s"
)
CONSOLE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# Neutralize CR/LF in log records so user-controlled data cannot forge extra log
# lines (log injection / log forging — CWE-117). Installed centrally on every
# handler, so no route/service code needs to sanitize before logging.
_CRLF = str.maketrans({"\r": "\\r", "\n": "\\n"})


class _LogSanitizer(logging.Filter):
    """Strip CR/LF from the log message and any string args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = record.msg.translate(_CRLF)
        if isinstance(record.args, tuple):
            record.args = tuple(
                a.translate(_CRLF) if isinstance(a, str) else a
                for a in record.args
            )
        elif isinstance(record.args, dict):
            record.args = {
                k: (v.translate(_CRLF) if isinstance(v, str) else v)
                for k, v in record.args.items()
            }
        return True


def setup_logging(level: str = "INFO") -> None:
    """Initialize logging for the entire application. Call once at startup."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    root = logging.getLogger()
    root.setLevel(getattr(logging, level.upper(), logging.INFO))

    # Avoid adding duplicate handlers on reload
    if root.handlers:
        return

    # ── File handler (rotating, detailed) ─────────────────────────────
    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=10 * 1024 * 1024,  # 10 MB
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(logging.Formatter(FILE_FORMAT, datefmt=DATE_FORMAT))

    # ── Console handler (concise) ─────────────────────────────────────
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    console_handler.setFormatter(logging.Formatter(CONSOLE_FORMAT, datefmt=DATE_FORMAT))

    # Strip CR/LF from every record (log-injection defense) on both handlers.
    _sanitizer = _LogSanitizer()
    file_handler.addFilter(_sanitizer)
    console_handler.addFilter(_sanitizer)

    root.addHandler(file_handler)
    root.addHandler(console_handler)

    # Quiet down noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)
    logging.getLogger("urllib3").setLevel(logging.WARNING)
    logging.getLogger("msal").setLevel(logging.WARNING)

    logging.getLogger("app").info(
        "Logging initialized — file=%s, console=%s", LOG_FILE, level.upper()
    )
