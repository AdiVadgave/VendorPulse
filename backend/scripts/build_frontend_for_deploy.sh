#!/usr/bin/env bash
# Build the React frontend and copy it into backend/static/ for a single-service
# App Service deploy (the backend serves this folder). See docs/DEPLOYMENT_APP_SERVICE.md.
#
# Usage:
#   ./scripts/build_frontend_for_deploy.sh https://vendorpulse-app.azurewebsites.net
#
# The argument is the production API base URL. It is REQUIRED — without it the build
# falls back to http://localhost:8000 and will not work in production.
set -euo pipefail

API_URL="${1:-}"
if [[ -z "$API_URL" ]]; then
  echo "ERROR: pass the production URL, e.g. ./build_frontend_for_deploy.sh https://<app>.azurewebsites.net" >&2
  exit 1
fi

# Resolve repo paths relative to this script (backend/scripts/ → repo root).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FRONTEND_DIR="$(cd "$BACKEND_DIR/../frontend" && pwd)"
STATIC_DIR="$BACKEND_DIR/static"

echo "==> Building frontend with VITE_API_URL=$API_URL"
cd "$FRONTEND_DIR"
VITE_API_URL="$API_URL" npm run build

echo "==> Copying dist → $STATIC_DIR"
rm -rf "$STATIC_DIR"
cp -r "$FRONTEND_DIR/dist" "$STATIC_DIR"

echo "==> Done. backend/static/ is ready to include in the deploy zip."
