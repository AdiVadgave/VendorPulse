"""
Start the VendorPulse backend server.

Usage:
    python run.py                  # development (auto-reload)
    python run.py --no-reload      # production-style
"""
import truststore
truststore.inject_into_ssl()

import argparse
import logging

import uvicorn

from app.config import settings
from app.core.logging_config import setup_logging

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VendorPulse backend server")
    parser.add_argument("--no-reload", action="store_true", help="Disable auto-reload")
    args = parser.parse_args()

    # Initialize logging before uvicorn starts
    setup_logging()
    logger = logging.getLogger(__name__)
    logger.info(
        "Starting VendorPulse server on %s:%s (reload=%s)",
        settings.host,
        settings.port,
        not args.no_reload,
    )

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=not args.no_reload,
        log_level="info",
    )
