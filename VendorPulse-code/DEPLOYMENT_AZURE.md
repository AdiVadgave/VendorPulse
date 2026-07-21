# Deploying VendorPulse to Azure — Step-by-Step Runbook

A complete, beginner-friendly walkthrough to deploy VendorPulse to **Azure App Service**, protected by **Microsoft Entra ID**, backed by **Azure Database for PostgreSQL**, with secrets in **Azure Key Vault**.

**Chosen architecture (simplest, most robust for a first deploy):**

- **One App Service** running the FastAPI backend, which *also* serves the built React frontend (single URL, no CORS to configure).
- **Entra ID via App Service "Easy Auth"** — a Microsoft org login is forced before anyone can reach the app. No code changes.
- **Azure Database for PostgreSQL – Flexible Server** as the datastore.
- **Key Vault references** in App Settings — the app reads secrets as normal environment variables; Azure injects them from Key Vault using the app's Managed Identity. No code changes.

```
Browser ──(Microsoft login)──► App Service (Easy Auth)
                                   │  FastAPI + static React build
                                   │  reads config from App Settings
                                   ├──► Key Vault  (secrets via Managed Identity)
                                   └──► PostgreSQL Flexible Server (SSL)
```

> **Naming:** Pick a globally-unique app name up front. This guide uses `vendorpulse-app` — replace it everywhere with your own (e.g. `vendorpulse-<yourinitials>`). Your app URL will be `https://<app-name>.azurewebsites.net`.

---

## Prerequisites (do these once)

- [ ] An **Azure subscription** you can create resources in.
- [ ] Permission to **register applications in Entra ID** (for Easy Auth). If you can't, ask your Azure AD admin — you'll need one app registration.
- [ ] **Node.js 20+** and **Python 3.11+** installed locally (to build the frontend).
- [ ] **VS Code** with the **Azure App Service** extension (`ms-azuretools.vscode-azureappservice`) — the easiest way to deploy. Sign in via the Azure icon in the sidebar.

---

## Phase 0 — Build the deployable package locally

The single-App-Service model bundles the compiled frontend inside the backend. Two code changes needed for this are **already made** in this repo:
- `backend/app/main.py` serves `backend/static/` as the frontend (SPA fallback).
- `backend/requirements.txt` includes `gunicorn` (Linux production server).

### 0.1 Build the frontend

```powershell
cd "VendorPulse-code\frontend"
# Point the frontend at its own origin. Replace with YOUR app URL.
# (You can also do this after Phase 1 once you know the real URL, then rebuild.)
"VITE_API_URL=https://vendorpulse-app.azurewebsites.net" | Out-File -Encoding utf8 .env.production
npm install
npm run build        # produces frontend/dist/
```

### 0.2 Copy the build into the backend

```powershell
cd "VendorPulse-code"
# Remove any old copy, then copy the fresh build into backend/static
if (Test-Path "backend\static") { Remove-Item -Recurse -Force "backend\static" }
Copy-Item -Recurse "frontend\dist" "backend\static"
```

At this point `backend/static/index.html` and `backend/static/assets/` should exist. The **`backend/` folder is now the complete deployable unit** (FastAPI + frontend + requirements.txt).

> Repeat Phase 0 whenever you change frontend code, then redeploy (Phase 8).

---

## Phase 1 — Create the Resource Group and App Service

1. Go to the [Azure Portal](https://portal.azure.com).
2. **Create a Resource Group** (a folder for all these resources):
   - Search **"Resource groups"** → **Create**.
   - Name: `vendorpulse-rg`. Region: pick one close to you (e.g. *Central India* / *East US*). Use the **same region** for everything below.
3. **Create the App Service (Web App):**
   - Search **"App Services"** → **Create** → **Web App**.
   - **Resource Group:** `vendorpulse-rg`
   - **Name:** `vendorpulse-app` (must be globally unique)
   - **Publish:** `Code`
   - **Runtime stack:** `Python 3.11`
   - **Operating System:** `Linux`
   - **Region:** same as your resource group
   - **Pricing plan:** create a new App Service Plan — **B1 (Basic)** is fine to start (avoid Free F1; it sleeps and has tight limits).
   - **Review + create** → **Create**. Wait for deployment to finish.

---

## Phase 2 — Create Azure Database for PostgreSQL

1. Portal → search **"Azure Database for PostgreSQL flexible servers"** → **Create** → **Flexible server**.
2. Settings:
   - **Resource group:** `vendorpulse-rg`
   - **Server name:** `vendorpulse-db` (globally unique)
   - **Region:** same as above
   - **PostgreSQL version:** 16 (any 14+)
   - **Workload type:** *Development* (cheapest; upgrade later)
   - **Authentication method:** *PostgreSQL authentication only*
   - **Admin username:** `vpadmin` — **Password:** choose a strong one and **save it** (goes into Key Vault later).
3. **Networking** tab:
   - Connectivity: **Public access (allowed IP addresses)**.
   - ✅ Check **"Allow public access from any Azure service within Azure to this server"** (lets your App Service connect).
   - Add your **current client IP** too (so you can seed data from your laptop). *Add a firewall rule with your IP.*
4. **Review + create** → **Create**. This takes a few minutes.
5. Once created, open the server → **Databases** → **Add** → create a database named **`vendorpulse`**.
6. Copy the **Server name** (looks like `vendorpulse-db.postgres.database.azure.com`) — you'll need it.

Your connection string will be:
```
postgresql://vpadmin:<PASSWORD>@vendorpulse-db.postgres.database.azure.com:5432/vendorpulse?sslmode=require
```
> The app already defaults to `sslmode=require`, which Azure PostgreSQL mandates. Good.

---

## Phase 3 — Create the Key Vault and store secrets

1. Portal → search **"Key Vaults"** → **Create**.
   - **Resource group:** `vendorpulse-rg`, **Name:** `vendorpulse-kv` (globally unique), same region.
   - **Permission model:** **Azure role-based access control (RBAC)** (recommended).
   - **Review + create** → **Create**.
2. Grant **yourself** permission to add secrets:
   - Open the vault → **Access control (IAM)** → **Add role assignment**.
   - Role: **Key Vault Secrets Officer** → assign to **your own user** → Save.
   - (Wait ~1 minute for it to take effect.)
3. Open **Objects → Secrets → Generate/Import** and add these secrets (one at a time). Use exactly these secret names:

   | Secret name | Value |
   |---|---|
   | `database-url` | the full PostgreSQL connection string from Phase 2 |
   | `openai-api-key` | your OpenAI key (only if `AI_PROVIDER=openai`) |
   | `azure-openai-api-key` | your Azure OpenAI key (only if `AI_PROVIDER=azure`) |
   | `graph-access-token` | Microsoft Graph token (only if using Graph scheduling) |

   > Store only the secrets you actually use. At minimum, store `database-url`.

4. Copy each secret's **Secret Identifier** URI (looks like `https://vendorpulse-kv.vault.azure.net/secrets/database-url`) — you'll reference these in Phase 5.

---

## Phase 4 — Give the App Service a Managed Identity + Key Vault access

This lets the App Service read Key Vault secrets **without any passwords in code**.

1. Open your **App Service** (`vendorpulse-app`) → **Settings → Identity**.
2. **System assigned** tab → toggle **Status = On** → **Save** → Yes. Copy the **Object (principal) ID** shown.
3. Open your **Key Vault** → **Access control (IAM)** → **Add role assignment**:
   - Role: **Key Vault Secrets User**
   - Assign access to: **Managed identity** → select your App Service (`vendorpulse-app`).
   - **Save**.

Now the app's identity can read secrets. (The app's LLM code already uses `DefaultAzureCredential`, which automatically uses this same Managed Identity — no key needed for Azure OpenAI if you go that route.)

---

## Phase 5 — Configure App Settings (environment variables)

App Service **App Settings become environment variables**, and VendorPulse's config (`pydantic-settings`) reads env vars automatically — **so no `.env` file is needed in production.**

1. App Service → **Settings → Environment variables → App settings** → **Add** each of the following.

   **Secrets (via Key Vault references — Azure resolves these using the Managed Identity):**

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `@Microsoft.KeyVault(SecretUri=https://vendorpulse-kv.vault.azure.net/secrets/database-url)` |
   | `AZURE_OPENAI_API_KEY` | `@Microsoft.KeyVault(SecretUri=https://vendorpulse-kv.vault.azure.net/secrets/azure-openai-api-key)` |
   | `GRAPH_ACCESS_TOKEN` | `@Microsoft.KeyVault(SecretUri=https://vendorpulse-kv.vault.azure.net/secrets/graph-access-token)` |

   > Paste **your own** Secret Identifier URIs. Only add the ones you stored in Phase 3.

   **Plain (non-secret) settings:**

   | Name | Value | Notes |
   |---|---|---|
   | `ENABLE_LLM` | `true` or `false` | turn AI agents on/off |
   | `AI_PROVIDER` | `azure` | or `openai` / `foundry` |
   | `AZURE_OPENAI_ENDPOINT` | `https://<res>.openai.azure.com/` | if using Azure OpenAI |
   | `AZURE_OPENAI_DEPLOYMENT_NAME` | your deployment name | if using Azure OpenAI |
   | `CORS_ORIGINS` | `https://vendorpulse-app.azurewebsites.net` | your app URL |
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `1` | tells App Service to `pip install` on deploy |
   | `WEBSITES_PORT` | `8000` | the port gunicorn binds to |

2. Click **Apply / Save**. The app restarts.
3. Verify Key Vault references resolved: on the App settings screen each Key Vault reference should show a green **"Key Vault Reference"** ✅ status. A red ❌ means the Managed Identity role (Phase 4) isn't set correctly.

---

## Phase 6 — Set the startup command

App Service needs to know how to launch FastAPI.

1. App Service → **Settings → Configuration → General settings** (or **Settings → Environment variables → General settings** depending on portal version).
2. In **Startup Command**, paste:

   ```
   gunicorn app.main:app -k uvicorn.workers.UvicornWorker -w 2 --bind 0.0.0.0:8000 --timeout 600
   ```

   - `app.main:app` — the FastAPI app object (deploy root is the `backend/` folder, so `app.main` resolves).
   - `-w 2` — 2 worker processes (fine for B1).
   - `--timeout 600` — allows slow first-request cold starts / LLM calls.
3. **Save**.

---

## Phase 7 — Turn on Entra ID login (Easy Auth)

This forces every visitor to sign in with a Microsoft (Entra) account before reaching the app. **No code.**

1. App Service → **Settings → Authentication** → **Add identity provider**.
2. **Identity provider:** *Microsoft*.
3. **App registration:** *Create new app registration* (Azure does it for you).
   - **Name:** `vendorpulse-app-auth`
   - **Supported account types:** *Current tenant – Single tenant* (only your organization can sign in).
4. **Restrict access:** *Require authentication*.
5. **Unauthenticated requests:** *HTTP 302 Found redirect (recommended for websites)*.
6. **Add**.

Now browsing to `https://vendorpulse-app.azurewebsites.net` redirects to a Microsoft login. After signing in, the browser carries an auth cookie automatically — and because the frontend and API share the same origin, your API calls are authenticated too, with nothing extra to wire up.

> The signed-in user's identity is available to the backend (if ever needed) via the injected header `X-MS-CLIENT-PRINCIPAL-NAME`. Not required for the current app.

---

## Phase 8 — Deploy the code

Using **VS Code Azure App Service extension** (easiest):

1. In VS Code, open the **`VendorPulse-code/backend`** folder (this is the deploy root — it now contains `static/` from Phase 0).
2. Click the **Azure** icon → **App Services** → sign in → expand your subscription.
3. Right-click **`vendorpulse-app`** → **Deploy to Web App…**
4. Select the **`backend`** folder → confirm the overwrite prompt.
5. Wait for "Deployment successful". Because `SCM_DO_BUILD_DURING_DEPLOYMENT=1` is set, App Service runs `pip install -r requirements.txt` on the server.

**Alternative — Zip deploy from PowerShell** (if you prefer CLI later):
```powershell
cd "VendorPulse-code\backend"
Compress-Archive -Path * -DestinationPath ..\backend.zip -Force
# Then in Azure CLI:
# az webapp deploy --resource-group vendorpulse-rg --name vendorpulse-app --src-path ..\backend.zip --type zip
```

---

## Phase 9 — First-run checks & seeding demo data

1. **Schema is auto-created.** On first boot, the app's startup hook (`ensure_schema`) creates all 16 tables in your PostgreSQL database automatically. You do **not** run DDL manually.
2. **Watch the logs:** App Service → **Monitoring → Log stream**. Look for:
   `VendorPulse backend ready — PostgreSQL connected, schema ensured`
   If you see a Postgres connection error, re-check the `DATABASE_URL` secret and the DB firewall (Phase 2.3).
3. **Health check:** visit `https://vendorpulse-app.azurewebsites.net/api/health` (you'll sign in first). Expect `"status": "ok"` and `"database": "connected"`.
4. **Seed demo data (optional, one time):** App Service → **Development Tools → SSH** (opens a shell in the container):
   ```bash
   cd /home/site/wwwroot
   python seed_demo_data.py
   ```
   Or run the seeding from your laptop instead (your IP was allow-listed in Phase 2.3) by setting `DATABASE_URL` locally to the Azure connection string and running the script.
5. **Open the app:** `https://vendorpulse-app.azurewebsites.net` → sign in → the React dashboard should load.

---

## Troubleshooting quick reference

| Symptom | Likely cause / fix |
|---|---|
| App shows "Application Error" | Check **Log stream**. Usually startup command wrong or a missing App Setting. |
| Frontend loads but API calls fail | `VITE_API_URL` was wrong at build time → fix `.env.production`, rebuild (Phase 0), redeploy. |
| `database: unavailable` in health | Wrong `DATABASE_URL`, or DB firewall doesn't "Allow Azure services". |
| Key Vault reference shows ❌ | Managed Identity not granted **Key Vault Secrets User** (Phase 4), or wrong Secret URI. |
| Stuck on Microsoft login loop | App registration is single-tenant but you signed in with a different tenant's account. |
| Changes not appearing | Rebuild frontend + recopy to `backend/static` (Phase 0), then redeploy (Phase 8). |
| Slow first load | Cold start on B1. Enable **Always On** (App Service → Configuration → General settings). |

---

## What to harden later (not needed for first deploy)

- **Private networking:** put PostgreSQL behind a VNet/Private Endpoint instead of public access.
- **Managed Identity auth to PostgreSQL** (passwordless) instead of a stored password.
- **Slots:** add a `staging` deployment slot for zero-downtime releases.
- **CI/CD:** wire the existing `.github/` workflow to auto-build the frontend, copy to `backend/static`, and deploy on push.
- **Custom domain + managed certificate** on the App Service.
