"""
Start the VendorPulse backend server.

Usage:
    python run.py                  # development (auto-reload)
    python run.py --no-reload      # production-style
"""
import argparse

import uvicorn

from app.config import settings

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="VendorPulse backend server")
    parser.add_argument("--no-reload", action="store_true", help="Disable auto-reload")
    args = parser.parse_args()

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=not args.no_reload,
        log_level="info",
    )
