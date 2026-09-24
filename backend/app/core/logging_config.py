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


def sanitize_for_log(value):
    """Sanitize untrusted values before interpolating into log fields."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value.translate(_CRLF)
    if isinstance(value, tuple):
        return tuple(sanitize_for_log(v) for v in value)
    if isinstance(value, list):
        return [sanitize_for_log(v) for v in value]
    if isinstance(value, set):
        return {sanitize_for_log(v) for v in value}
    if isinstance(value, dict):
        return {sanitize_for_log(k): sanitize_for_log(v) for k, v in value.items()}
    return str(value).translate(_CRLF)


def _sanitize_arg(value):
    """CR/LF-strip a single log ARG while PRESERVING its type.

    Only ``str`` can carry a newline into the log, so nothing else needs touching —
    and nothing else may be touched: ``sanitize_for_log`` stringifies via ``str(value)``,
    which turns an int 200 into "200" and then ``"status=%d" % ("200",)`` raises
    ``TypeError: %d format: a real number is required, not str`` while the record is
    being rendered. That kills the whole log line (both the console and the rotating
    file handler), so every request was being logged as a "--- Logging error ---"
    traceback instead of a line. Containers keep their type too, recursively."""
    if isinstance(value, str):
        return value.translate(_CRLF)
    if isinstance(value, tuple):
        return tuple(_sanitize_arg(v) for v in value)
    if isinstance(value, list):
        return [_sanitize_arg(v) for v in value]
    if isinstance(value, dict):
        return {k: _sanitize_arg(v) for k, v in value.items()}
    return value


class _LogSanitizer(logging.Filter):
    """Strip CR/LF from the log message and any string args."""

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = sanitize_for_log(record.msg)
        # Type-preserving: see _sanitize_arg. Never use sanitize_for_log on args.
        if isinstance(record.args, (tuple, dict)):
            record.args = _sanitize_arg(record.args)
        return True


class _SanitizingFormatter(logging.Formatter):
    """Sanitize the final rendered log message to prevent log forging."""

    def format(self, record: logging.LogRecord) -> str:
        original_msg = record.msg
        original_args = record.args
        try:
            record.msg = sanitize_for_log(record.getMessage())
            record.args = ()
            return super().format(record)
        finally:
            record.msg = original_msg
            record.args = original_args


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
    file_handler.setFormatter(_SanitizingFormatter(FILE_FORMAT, datefmt=DATE_FORMAT))

    # ── Console handler (concise) ─────────────────────────────────────
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(getattr(logging, level.upper(), logging.INFO))
    console_handler.setFormatter(_SanitizingFormatter(CONSOLE_FORMAT, datefmt=DATE_FORMAT))

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
