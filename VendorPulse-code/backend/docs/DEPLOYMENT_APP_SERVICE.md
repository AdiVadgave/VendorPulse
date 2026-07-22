# Deployment — Azure App Service (single service)

**Target:** one Linux App Service (Python 3.11) that runs the FastAPI backend **and**
serves the built React frontend from `backend/static/`. One deploy, one URL.
**Last updated:** 2026-07-22

---

## 0. Why single-service

`app/main.py` already serves `backend/static/` (hashed assets + SPA fallback) when
that folder exists, and registers all API routes first. So we:

1. build the frontend → copy into `backend/static/`
2. deploy the `backend/` folder to App Service
3. the same origin serves both the UI and `/api/*` (no CORS, no second host)

```
Browser ──► https://<app>.azurewebsites.net
              ├── /                 → index.html + /assets/*   (React SPA)
              └── /api/*            → FastAPI routes
                     ├── Postgres (Azure Database for PostgreSQL)
                     └── Microsoft Graph (Mail.Send, app-only cert)
```

---

## 1. Prerequisites

- **Azure CLI** installed and logged in: `az login`
- **Contributor** on a resource group (to create the App Service)
- Node + npm (to build the frontend), Python 3.11 (already have it)
- The values currently in `backend/.env` (Postgres, Graph mail, LLM)
- The Mail.Send certificate `.pfx` (kept out of the repo)

Pick names once and reuse them:

```bash
RG=rg-vendorpulse
PLAN=asp-vendorpulse
APP=vendorpulse-app            # → https://vendorpulse-app.azurewebsites.net
LOCATION=centralindia          # match your Postgres region if possible
```

---

## 2. Build the frontend into the backend

The frontend must know the API base URL at **build time**. Since the backend serves
it from the same origin, set `VITE_API_URL` to the final App Service URL:

```bash
cd frontend
VITE_API_URL=https://$APP.azurewebsites.net npm run build   # → frontend/dist
rm -rf ../backend/static && cp -r dist ../backend/static     # → backend/static
cd ..
```

> Helper: `backend/scripts/build_frontend_for_deploy.sh` does these three lines.
> ⚠️ If `VITE_API_URL` is left unset, the built app falls back to `localhost:8000`
> and will not work in production. Always pass it.

---

## 3. Create the App Service (Linux, Python 3.11)

```bash
az group create --name $RG --location $LOCATION

az appservice plan create --name $PLAN --resource-group $RG \
  --sku B1 --is-linux

az webapp create --name $APP --resource-group $RG --plan $PLAN \
  --runtime "PYTHON:3.11"
```

*(Portal equivalent: Create a resource → Web App → Publish: Code, Runtime: Python 3.11,
OS: Linux.)*

---

## 4. Startup command (gunicorn + uvicorn workers)

`run.py` is dev-only. In production, App Service runs the app via gunicorn:

```bash
az webapp config set --name $APP --resource-group $RG \
  --startup-file "gunicorn -k uvicorn.workers.UvicornWorker -w 2 --timeout 600 --bind 0.0.0.0:8000 app.main:app"
```

- `gunicorn` and `uvicorn` are already in `requirements.txt`.
- Port 8000 is the App Service Linux default; if the container can't be reached,
  also set app setting `WEBSITES_PORT=8000`.
- The lifespan hook connects to Postgres and runs `ensure_schema()` on boot.

---

## 5. Application settings (the `.env` values)

App Service injects **App Settings as environment variables**, which pydantic-settings
reads directly — so **do not ship `.env`**; set these instead. Enable the build step
so `pip install -r requirements.txt` runs on deploy:

```bash
az webapp config appsettings set --name $APP --resource-group $RG --settings \
  SCM_DO_BUILD_DURING_DEPLOYMENT=true \
  PG_HOST="vendorpulse-dev.postgres.database.azure.com" \
  PG_PORT=5432 \
  PG_DATABASE="vendorpulse" \
  PG_USER="vendorpulse_admin" \
  PG_PASSWORD="<db-password>" \
  PG_SSLMODE="require" \
  MAIL_PROVIDER="graph" \
  GRAPH_MAIL_SENDER="Mobility-VendorPulse@shell.com" \
  GRAPH_CLIENT_ID="74d7cccb-faab-4971-b0cd-962c665022d3" \
  GRAPH_TENANT_ID="db1e96a8-a3da-442a-930b-235cac24cd5c" \
  GRAPH_CERT_THUMBPRINT="E3B27F913B430B93718E3B12BDFE7E4FFF65DFC5" \
  GRAPH_CERT_PASSWORD="" \
  ENABLE_LLM=true \
  AI_PROVIDER="azure" \
  AZURE_OPENAI_API_KEY="<key>" \
  AZURE_OPENAI_ENDPOINT="https://gaura-mgt924zq-eastus2.openai.azure.com/" \
  AZURE_OPENAI_DEPLOYMENT_NAME="gpt-4o" \
  AZURE_OPENAI_API_VERSION="2024-12-01-preview" \
  CORS_ORIGINS="https://$APP.azurewebsites.net"
```

`GRAPH_CERT_PATH` is set in the next step (depends on how the cert is provided).

---

## 6. The Mail.Send certificate (pick ONE)

### Option A — Upload to App Service (recommended, cert stays out of the package)

```bash
# upload the .pfx (passwordless Key Vault export → empty password)
az webapp config ssl upload --name $APP --resource-group $RG \
  --certificate-file ./secrets/graph-mail.pfx --certificate-password ""

# make the platform load it into the runtime
az webapp config appsettings set --name $APP --resource-group $RG --settings \
  WEBSITE_LOAD_CERTIFICATES="E3B27F913B430B93718E3B12BDFE7E4FFF65DFC5" \
  GRAPH_CERT_PATH="/var/ssl/private/E3B27F913B430B93718E3B12BDFE7E4FFF65DFC5.p12"
```

On Linux, loaded certs appear at `/var/ssl/private/<THUMBPRINT>.p12` (uppercase, no
password) — which is what `graph_auth._load_pfx` reads.

### Option B — Import from Key Vault (best long-term)

If the cert lives in the Key Vault it was exported from, import it into App Service
(Portal → Certificates → **Bring your own / Import from Key Vault**), then set the
same `WEBSITE_LOAD_CERTIFICATES` + `GRAPH_CERT_PATH` as Option A. App Service auto-renews.

### Option C — Ship it in the package (quick, least secure)

Include `secrets/graph-mail.pfx` in the deploy zip and set
`GRAPH_CERT_PATH=/home/site/wwwroot/secrets/graph-mail.pfx`. Fine for a first smoke
test; avoid for anything lasting — the secret rides in the deployment artifact.

---

## 7. Let App Service reach Postgres

On the Postgres server's networking:

- Quickest: enable **"Allow public access from Azure services"** (adds `0.0.0.0` rule).
- Tighter: add the App Service **outbound IPs** to the firewall
  (`az webapp show ... --query outboundIpAddresses`).
- Tightest: VNet-integrate the App Service and use a private endpoint (later hardening).

SSL is already required (`PG_SSLMODE=require`).

---

## 8. Deploy the backend

Zip the backend (excluding local-only junk) and push it:

```bash
cd backend
zip -r ../deploy.zip . \
  -x ".venv/*" "logs/*" "__pycache__/*" "*.pyc" ".env" "data/*"
cd ..
az webapp deploy --resource-group $RG --name $APP --src-path deploy.zip --type zip
```

- `.env` is excluded on purpose — App Settings replace it.
- `data/*` excluded — Postgres is the live store now.
- `static/` **is** included (that's the built frontend).

---

## 9. First-run: seed the database (once)

If this Postgres is fresh, seed it the same way as locally (from your machine, which
already reaches Azure PG):

```bash
cd backend
python scripts/create_database.py          # if the DB doesn't exist yet
python scripts/migrate_json_to_postgres.py # loads the seed data
```

*(Skip if the database is already populated.)*

---

## 10. Verify

```bash
curl https://$APP.azurewebsites.net/api/health
# → {"status":"ok","database":"connected", ...}
```

Then:
- open `https://$APP.azurewebsites.net` → the UI loads
- test mail from the box that has the cert: `python scripts/test_graph_mail.py you@shell.com`
- stream logs if anything's off: `az webapp log tail --name $APP --resource-group $RG`

---

## 11. Production hardening (after it's working)

| Area | Do |
|---|---|
| Secrets | move `PG_PASSWORD`, LLM key into **Key Vault references** (`@Microsoft.KeyVault(...)`) instead of plain App Settings |
| Cert | Option B (Key Vault import) so it auto-renews before **16 Jul 2027** |
| DB network | VNet + private endpoint; drop the "allow Azure services" rule |
| HTTPS | App Service enforces HTTPS by default — keep `Only HTTPS = On` |
| Scaling | bump plan (B1 → P1v3) and workers (`-w`) for real load |
| CI/CD | wire a GitHub Action that runs steps 2 + 8 on push |
| Custom domain | add the Shell DNS **CNAME** + managed cert, then add that origin to `CORS_ORIGINS` |

---

## 12. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App won't start / 502 | wrong startup command or port | confirm the gunicorn startup line; set `WEBSITES_PORT=8000` |
| `/api/health` shows `database: unavailable` | PG firewall / wrong `PG_*` | allow App Service IPs; re-check settings |
| UI loads but API calls hit `localhost` | frontend built without `VITE_API_URL` | rebuild step 2 with the prod URL, redeploy |
| Mail 503 `ErrorAccessDenied` | cert not loaded / policy | verify `WEBSITE_LOAD_CERTIFICATES` + `/var/ssl/private/<thumb>.p12` exists |
| `pip` didn't install deps | build step off | ensure `SCM_DO_BUILD_DURING_DEPLOYMENT=true` |
| 404 on refresh of a deep link | static not deployed | confirm `backend/static/index.html` shipped in the zip |
