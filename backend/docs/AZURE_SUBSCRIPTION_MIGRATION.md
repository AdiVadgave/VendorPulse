# Migrating VendorPulse to a new Azure subscription

**Target subscription:** `AZ-AS-SUB-EX-N-SEQ04546-VENDORPULSEDEV`
**Written:** 2026-10-06
**Audience:** whoever runs the migration (you + whoever holds Owner/Contributor on the new subscription)

> The subscription name ends in **DEV**. This runbook assumes we are moving the
> development environment. If a separate production subscription is coming later,
> run this once per environment — do not point dev and prod at the same resources.

---

## 0. Read this first — what actually has to move

This is the single biggest time-saver in the whole exercise:

| Thing | Lives in | Moves with the subscription? |
|---|---|---|
| PostgreSQL Flexible Server | Subscription | **Yes — must be migrated** |
| App Services (**two**: frontend + backend) + Plan | Subscription | **Yes — must be migrated** |
| Azure OpenAI resource | Subscription | **Yes — must be migrated** |
| Key Vault (if the Mail cert lives in one) | Subscription | **Yes — must be migrated** |
| **Entra ID app registration — SSO (SPA)** | **Tenant** | **No. Leave it alone.** |
| **Entra ID app registration — Graph Mail.Send** | **Tenant** | **No. Leave it alone.** |
| **Admin consent for `Mail.Send`** | **Tenant** | **No. Do not re-request it.** |
| **Service mailbox `Mobility-VendorPulse@shell.com`** | **Exchange Online** | **No.** |
| The `.pfx` Mail.Send certificate itself | The cert is tenant-bound | No — but its *storage* may move |

**Why this matters:** app registrations, admin consent and the mailbox are **tenant**
objects. Shell's tenant ID does not change when the subscription changes. So
`GRAPH_CLIENT_ID`, `GRAPH_TENANT_ID`, `SSO_CLIENT_ID`, `SSO_TENANT_ID` and
`GRAPH_CERT_THUMBPRINT` **all stay exactly as they are today**.

Getting Shell admin consent for `Mail.Send` re-granted is slow and involves other
teams. You do not need to. Don't let anyone talk you into recreating the app
registrations "to be clean" — you would be buying weeks of delay for nothing.

**The only Entra change you need** is adding the new App Service URL as a redirect URI
on the SSO app registration (section 7). That's a two-minute edit, not a re-registration.

---

## 1. Inventory — fill this in before you touch anything

| Resource | Current (old subscription) | New |
|---|---|---|
| Subscription | `________________` | `AZ-AS-SUB-EX-N-SEQ04546-VENDORPULSEDEV` |
| Resource group | `________________` | `rg-vendorpulse-dev` |
| Postgres server | `vendorpulse-dev.postgres.database.azure.com` | `psql-vendorpulse-dev` |
| Postgres DB name | `vendorpulse` | `vendorpulse` |
| Postgres version | **16.15** | 16 (match or newer) |
| Postgres admin user | `vendorpulse_admin` | `vendorpulse_admin` |
| App Service — **backend/API** | `________________` | `app-vendorpulse-dev-api` |
| App Service — **frontend/SPA** | `________________` | `app-vendorpulse-dev-web` |
| App Service Plan / SKU | `________________` | `asp-vendorpulse-dev`, B1, shared by both apps |
| Azure OpenAI resource | `gaura-mgt924zq-eastus2` | `aoai-vendorpulse-dev` |
| OpenAI deployment | `gpt-4o` | `gpt-4o` (keep the name) |
| Key Vault (cert + secrets) | `________________` | `kv-vendorpulse-dev` (optional — see 2.4) |
| Region | `________________` | **North Europe** (`northeurope`) — matches the resource group |

**Created so far:** resource group `rg-vendorpulse-dev` in **North Europe**. ✅

The subscription also contains four Shell-managed resource groups —
`...-LOGGING`, `...-MBS` (West Europe), `...-NETWORKWATCHERS`, `...-PLATFORM`
(North Europe). **Those are platform/landing-zone groups. Do not put VendorPulse
resources in them and do not modify them.** Everything we create goes in
`rg-vendorpulse-dev`.

> The current Azure OpenAI endpoint is `gaura-mgt924zq-eastus2` — an auto-generated
> personal-looking name. This migration is a good moment to create a properly named
> resource rather than carrying that name forward.

---

## 2. Pre-flight

- [ ] You have **Contributor** (ideally Owner, for role assignments) on the new subscription.
- [ ] You can still reach the **old** Postgres (your IP is whitelisted) — you need it to take the dump.
- [ ] `az login` works and `az account list -o table` shows the new subscription.
- [ ] **`pg_dump` / `pg_restore` are version 16 or newer.** The server is PG 16.15; an older client refuses the dump. Check with `pg_dump --version`.
- [ ] You have the `.pfx` Mail.Send certificate and its password (empty if it was a Key Vault export).
- [ ] You have the current secret values to hand: `PG_PASSWORD`, `AZURE_OPENAI_API_KEY`. **Never commit these. `backend/.env` is git-ignored and must stay that way.**
- [ ] Agree a maintenance window — the app is down between the final dump and the cutover.

Select the new subscription:

```bash
az account set --subscription "AZ-AS-SUB-EX-N-SEQ04546-VENDORPULSEDEV"
az account show --query "{name:name, id:id, tenantId:tenantId}" -o table
```

Confirm `tenantId` is Shell's usual tenant. If it is **not**, stop — the SSO and Graph
app registrations will not apply and this runbook's section 0 no longer holds.

### 2.1 Check what the landing zone will actually allow — do this first

This subscription ships with `...-PLATFORM`, `...-NETWORKWATCHERS` and `...-LOGGING`
resource groups, which is the signature of a **governed Shell landing zone** rather than
an empty sandbox. That usually means Azure Policy is enforcing rules, and the one that
bites hardest is **"public network access denied" on PaaS resources**.

If that policy is on, section 4.2's `--public-access 0.0.0.0` will be **refused**, and
Postgres will need a private endpoint plus VNet integration for the App Services
instead. That is a different, larger piece of work — far better to discover it now than
halfway through a cutover.

```bash
# policies in force on this subscription
az policy assignment list --scope "/subscriptions/$(az account show --query id -o tsv)" \
  --query "[].{name:displayName, effect:parameters.effect.value}" -o table

# which regions you are permitted to deploy into
az policy assignment list --query "[?contains(displayName,'location') || contains(displayName,'region')].displayName" -o tsv
```

Then prove it cheaply with a **what-if** run before committing to anything:

```bash
az deployment group what-if --resource-group rg-vendorpulse-dev \
  --template-uri https://raw.githubusercontent.com/Azure/azure-quickstart-templates/master/quickstarts/microsoft.web/web-app-linux/azuredeploy.json \
  --parameters webAppName=vendorpulse-probe-$RANDOM 2>&1 | tail -20
```

Checklist before you create anything real:

- [ ] Is public network access to PaaS allowed? If **no** → plan private endpoints + VNet integration, and raise it with the platform team now.
- [ ] Is `northeurope` an allowed region? (The platform groups use both North and West Europe, so Europe is clearly permitted.)
- [ ] Are there **required tags**? A tag policy with a `deny` effect blocks resource creation outright. Find out which tags and have the values ready.
- [ ] Are the SKUs you want allowed? Burstable Postgres and B1 App Service plans are sometimes excluded from enterprise subscriptions.
- [ ] Is there a resource **naming** policy? Your `rg-vendorpulse-dev` did not follow the `AZ-AS-RGP-EX-N-SEQ04546-*` pattern and was accepted, so nothing is enforced at group level — but resource-level naming rules could still exist.

If any of these come back restrictive, stop and talk to whoever owns the landing zone
before going further. A policy denial mid-cutover is far more painful than a day's delay
up front.

### 2.2 Name everything up front

Decide **all** names before creating anything. The frontend is built against the
backend's URL and the backend must allow the frontend's origin, so if you invent names
as you go you will end up rebuilding the frontend. App Service URLs are predictable, so
fixing the names first removes the circularity entirely.

Proposed set, following the `rg-vendorpulse-dev` style you already used:

```bash
# ── paste this block into your shell and keep the session open ──
export SUB="AZ-AS-SUB-EX-N-SEQ04546-VENDORPULSEDEV"
export RG=rg-vendorpulse-dev
export LOCATION=northeurope

export PGSERVER=psql-vendorpulse-dev          # globally unique
export PGDB=vendorpulse
export PGADMIN=vendorpulse_admin

export AOAI=aoai-vendorpulse-dev
export AOAI_DEPLOYMENT=gpt-4o

export PLAN=asp-vendorpulse-dev
export API_APP=app-vendorpulse-dev-api        # globally unique
export WEB_APP=app-vendorpulse-dev-web        # globally unique
export KV=kv-vendorpulse-dev                  # globally unique, 3-24 chars

export API_URL=https://$API_APP.azurewebsites.net
export WEB_URL=https://$WEB_APP.azurewebsites.net

az account set --subscription "$SUB"
```

**Postgres, App Service and Key Vault names are globally unique across all of Azure** —
not just your subscription. Check before you commit to them:

```bash
az webapp list-runtimes >/dev/null   # warms the CLI
az rest --method get --url "https://management.azure.com/subscriptions/$(az account show --query id -o tsv)/providers/Microsoft.Web/checknameavailability?api-version=2023-01-01&name=$API_APP&type=Site" --query nameAvailable
az postgres flexible-server list --query "[?name=='$PGSERVER']" -o tsv   # empty = free in this sub
```

If a name is taken, add a short suffix (`-ne`, `-01`) and update **both** the variable
and your notes before continuing.

> Shell's platform groups use an `AZ-AS-RGP-EX-N-SEQ04546-*` convention. Your resource
> group did not follow it and was accepted, so nothing is enforced. If your team wants
> the convention applied to app resources too, decide that **now** — renaming later
> means recreating the resource.

### 2.3 Build order at a glance

Create in this order. Each row depends on the ones above it.

| # | Create | Why this position | Time |
|---|---|---|---|
| 0 | **Policy pre-flight** (2.1) | Can invalidate the whole plan | 10 min |
| 1 | **Azure OpenAI + `gpt-4o` deployment** (§5) | **Start first.** Creation is instant, but if quota is short the request takes **days**. Everything else can proceed while it's pending. | 10 min, or days if quota blocks |
| 2 | **PostgreSQL server + database** (§4.2) | Slowest to provision; the backend cannot start without it | 10–15 min |
| 3 | **Firewall rules** (§4.3) | Needed before you can restore | 2 min |
| 4 | **Restore the dump** (§4.4–4.5) | Needs 2 and 3 | 5 min |
| 5 | **App Service Plan** (§6.2) | Both web apps sit on it | 2 min |
| 6 | **Backend web app** + App Settings (§6.2) | Needs the Postgres and OpenAI values from 1–2 | 15 min |
| 7 | **Mail certificate** onto the backend app (§7) | Needs 6 | 10 min |
| 8 | **Frontend web app** (§6.3) | Must be built against the backend URL from 6 | 15 min |
| 9 | **SSO redirect URI** (§7) | Needs the frontend URL from 8 | 2 min |
| 10 | **Key Vault** (optional hardening, §2.4) | Easiest once the apps exist and have identities | 20 min |

Realistically half a day if nothing is blocked, and the OpenAI quota is the only thing
that can turn that into a week. **Which is why it is step 1, not step 5.**

### 2.4 Key Vault — optional, and why you might still want it

The inventory has a blank for Key Vault because today the Mail certificate is uploaded
straight to App Service and the secrets sit in plain App Settings. That works. A Key
Vault buys you two things:

- the Mail cert **auto-renews** before it expires on **16 Jul 2027** (it will otherwise
  expire silently and all outbound mail stops),
- `PG_PASSWORD` and `AZURE_OPENAI_API_KEY` become Key Vault **references** instead of
  readable plaintext in the portal.

It is not required for the migration to work, so it sits at step 10. If you do want it:

```bash
az keyvault create --name $KV --resource-group $RG --location $LOCATION \
  --enable-rbac-authorization true

# let the backend app read secrets using its own managed identity
az webapp identity assign --name $API_APP --resource-group $RG
PRINCIPAL=$(az webapp identity show --name $API_APP --resource-group $RG --query principalId -o tsv)
az role assignment create --assignee $PRINCIPAL --role "Key Vault Secrets User" \
  --scope $(az keyvault show --name $KV --query id -o tsv)
```

Then store each secret and swap the App Setting to
`@Microsoft.KeyVault(SecretUri=https://$KV.vault.azure.net/secrets/<name>/)`.

---

## 3. Which strategy

**Recommended: rebuild + restore.** Create fresh resources in the new subscription and
restore the data. The VendorPulse database is tiny (18 tables, largest ~1.7 MB, under
400 rows in the biggest table), so a dump/restore takes seconds and lets you fix the
resource naming on the way through.

*Alternative: `az resource move`.* Azure can move some resources between subscriptions
in place. It keeps hostnames identical (no connection-string churn), but it has real
constraints — both subscriptions must be in the same tenant, the resource must support
move, and PostgreSQL Flexible Server move has region and networking caveats. Given how
small the data is, rebuild is less risk for less effort. Use move only if an unchanged
hostname genuinely matters to you.

The rest of this runbook assumes **rebuild + restore**.

---

## 4. PostgreSQL — the only part with real data at stake

### 4.1 Take a verified backup from the OLD server

```bash
cd backend
# Values come from your existing .env — do not paste the password into the shell history;
# let pg_dump prompt, or export PGPASSWORD for the single command.
pg_dump \
  --host=vendorpulse-dev.postgres.database.azure.com \
  --username=vendorpulse_admin \
  --dbname=vendorpulse \
  --format=custom \
  --no-owner --no-privileges \
  --file=vendorpulse-$(date +%Y%m%d-%H%M).dump
```

- `--format=custom` so you can restore selectively if something goes wrong.
- `--no-owner --no-privileges` because the admin role name may differ on the new server.

**Verify the dump is real before you trust it:**

```bash
pg_restore --list vendorpulse-*.dump | grep -c "TABLE DATA"   # expect 18
```

Record the row counts from the old database so you can compare after the restore:

```sql
SELECT 'vendors' t, count(*) FROM vendors UNION ALL
SELECT 'persons', count(*) FROM persons UNION ALL
SELECT 'users', count(*) FROM users UNION ALL
SELECT 'cycles', count(*) FROM cycles UNION ALL
SELECT 'attendees', count(*) FROM attendees UNION ALL
SELECT 'meetings', count(*) FROM meetings UNION ALL
SELECT 'meeting_participants', count(*) FROM meeting_participants UNION ALL
SELECT 'meeting_attendees', count(*) FROM meeting_attendees UNION ALL
SELECT 'scorecard_submissions', count(*) FROM scorecard_submissions UNION ALL
SELECT 'action_items', count(*) FROM action_items UNION ALL
SELECT 'agent_runs', count(*) FROM agent_runs
ORDER BY 1;
```

> **Keep this dump file out of the repo.** It contains real attendee names, emails and
> scorecard comments. Store it somewhere controlled and delete it once the migration is
> signed off.

### 4.2 Create the new server

```bash
RG=rg-vendorpulse-dev           # already created
LOCATION=northeurope            # matches the resource group; keep DB + App Services together
PGSERVER=vendorpulse-dev-new    # pick the final name

az postgres flexible-server create \
  --resource-group $RG \
  --name $PGSERVER \
  --location $LOCATION \
  --version 16 \
  --tier Burstable --sku-name Standard_B1ms \
  --storage-size 32 \
  --admin-user vendorpulse_admin \
  --admin-password '<new-strong-password>' \
  --public-access 0.0.0.0

az postgres flexible-server db create \
  --resource-group $RG --server-name $PGSERVER --database-name vendorpulse
```

Match or exceed the old major version (**16**). Restoring a 16 dump into a 15 server fails.

### 4.3 Fix the firewall properly this time

The recurring "server closed the connection unexpectedly" problem is the firewall
rejecting a rotated home IP. While you are here, set it up so it stops biting:

```bash
# your current egress IP
MYIP=$(curl -s https://api.ipify.org)
az postgres flexible-server firewall-rule create \
  --resource-group $RG --name $PGSERVER \
  --rule-name dev-laptop --start-ip-address $MYIP --end-ip-address $MYIP

# let the App Service reach it
az postgres flexible-server firewall-rule create \
  --resource-group $RG --name $PGSERVER \
  --rule-name allow-azure --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0
```

If your ISP keeps rotating the address, ask for the Shell VPN egress range to be
whitelisted instead of a single IP — that is the actual fix.

### 4.4 Restore

```bash
pg_restore \
  --host=$PGSERVER.postgres.database.azure.com \
  --username=vendorpulse_admin \
  --dbname=vendorpulse \
  --no-owner --no-privileges \
  --verbose \
  vendorpulse-<timestamp>.dump
```

Some benign errors about extensions or roles are normal with `--no-owner`. Errors
mentioning **tables, constraints or indexes are not benign** — stop and investigate.

### 4.5 Verify the restore (do not skip)

The app rebuilds its own schema on boot, so the thing to check is **data integrity**.
Re-run the row-count query from 4.1 against the new server and compare. Then:

```sql
-- every expected table present
SELECT count(*) FROM pg_tables WHERE schemaname='public';            -- expect 18

-- the uniqueness guard that prevents duplicate scorecard submissions
SELECT to_regclass('public.subs_cycle_attendee_uq');                 -- must NOT be null

-- timestamp columns kept their real types (not reverted to text)
SELECT table_name, column_name, data_type FROM information_schema.columns
 WHERE column_name IN ('created_at','submitted_at','approved_at')
   AND table_schema='public' ORDER BY 1,2;                           -- expect timestamptz

-- no orphans
SELECT count(*) FROM scorecard_submissions s
  LEFT JOIN attendees a ON a.attendee_id = s.attendee_id
 WHERE s.attendee_id IS NOT NULL AND a.attendee_id IS NULL;          -- expect 0
```

---

## 5. Azure OpenAI

The LLM resource is subscription-scoped and does not move with the app registrations.

```bash
AOAI=aoai-vendorpulse-dev
az cognitiveservices account create \
  --name $AOAI --resource-group $RG --location eastus2 \
  --kind OpenAI --sku S0

az cognitiveservices account deployment create \
  --name $AOAI --resource-group $RG \
  --deployment-name gpt-4o \
  --model-name gpt-4o --model-version "2024-11-20" \
  --model-format OpenAI --sku-name Standard --sku-capacity 10
```

Then take the new endpoint and key:

```bash
az cognitiveservices account show --name $AOAI --resource-group $RG --query properties.endpoint -o tsv
az cognitiveservices account keys list --name $AOAI --resource-group $RG --query key1 -o tsv
```

- Keep the deployment name **`gpt-4o`** so `AZURE_OPENAI_DEPLOYMENT_NAME` is unchanged.
- Azure OpenAI capacity is quota-limited per subscription. If the deployment is
  refused, raise a quota request early — this is the step most likely to block you.
- **If the LLM is not ready on cutover day**, the app still runs with `ENABLE_LLM=false`.
  Scheduling, scorecards and email all work. What stops is AI insights, comment
  summaries — and **scorecard comment submission**, which deliberately refuses to save
  when redaction is unavailable. Plan for the LLM to be live before reviewers submit.

---

## 6. App Services — two web apps (frontend + backend)

> `DEPLOYMENT_APP_SERVICE.md` in this repo describes a **single** App Service that
> serves the API *and* the built SPA from `backend/static/`. The deployed environment
> uses **two separate web apps** instead. This section is the authoritative one for
> that topology; section 6B covers the single-app variant if you ever consolidate.

### 6.1 Decide both names first

The two apps depend on each other's URLs — the frontend is built against the backend's
URL, and the backend must allow the frontend's origin through CORS. App Service URLs
are predictable (`https://<name>.azurewebsites.net`), so **choose both names before
creating anything** and the circular dependency disappears.

```bash
RG=rg-vendorpulse-dev           # already created, North Europe
PLAN=asp-vendorpulse-dev
API_APP=vendorpulse-dev-api        # backend  -> https://vendorpulse-dev-api.azurewebsites.net
WEB_APP=vendorpulse-dev-web        # frontend -> https://vendorpulse-dev-web.azurewebsites.net

API_URL=https://$API_APP.azurewebsites.net
WEB_URL=https://$WEB_APP.azurewebsites.net
```

One plan can host both apps — no need for two.

### 6.2 Backend web app (Python / FastAPI)

```bash
az appservice plan create --name $PLAN --resource-group $RG --sku B1 --is-linux

az webapp create --name $API_APP --resource-group $RG --plan $PLAN --runtime "PYTHON:3.11"
az webapp config set --name $API_APP --resource-group $RG \
  --startup-file "gunicorn -k uvicorn.workers.UvicornWorker -w 2 --timeout 600 --bind 0.0.0.0:8000 app.main:app"
```

App Settings as in `DEPLOYMENT_APP_SERVICE.md` section 5, with the **new** Postgres and
OpenAI values, plus the one that is specific to a two-app layout:

```bash
az webapp config appsettings set --name $API_APP --resource-group $RG --settings \
  CORS_ORIGINS="$WEB_URL"
```

**`CORS_ORIGINS` is load-bearing here.** With a single app there is one origin and CORS
never fires. With two apps, every API call is cross-origin: if the frontend URL is not
in this list, the browser blocks *every* request and the UI looks completely dead with
only a console error to show for it. The backend uses an explicit allow-list with
`allow_credentials=True`, so a wildcard is deliberately not accepted.

Match the origin exactly: `https`, no trailing slash, no path. `https://x.azurewebsites.net/`
does not match `https://x.azurewebsites.net`.

Deploy the backend **without** `static/` — in this topology the backend is API-only:

```bash
cd backend
zip -r ../api.zip . -x ".venv/*" "logs/*" "__pycache__/*" "*.pyc" ".env" "data/*" "static/*"
cd ..
az webapp deploy --resource-group $RG --name $API_APP --src-path api.zip --type zip
```

On boot the log should say `running API-only`. That is correct here — it means the
backend found no `static/` folder and is serving just `/api/*`.

### 6.3 Frontend web app (static SPA)

Build with the **backend's** URL baked in, and the **frontend's** own URL as the SSO
redirect:

```bash
cd frontend
VITE_API_URL=$API_URL \
VITE_SSO_ENABLED=true \
VITE_SSO_CLIENT_ID=<unchanged> \
VITE_SSO_TENANT_ID=<unchanged> \
VITE_SSO_REDIRECT_URI=$WEB_URL \
npm run build
```

Note `VITE_API_URL` points at the **API app**, not at itself. That is the difference
from the single-service build, and getting it wrong is the most common failure.

Create and deploy the frontend app. Use the Node runtime purely as a static server:

```bash
az webapp create --name $WEB_APP --resource-group $RG --plan $PLAN --runtime "NODE:20-lts"

az webapp config set --name $WEB_APP --resource-group $RG \
  --startup-file "pm2 serve /home/site/wwwroot --no-daemon --spa"

cd frontend/dist && zip -r ../../web.zip . && cd ../..
az webapp deploy --resource-group $RG --name $WEB_APP --src-path web.zip --type zip
```

**The `--spa` flag is not optional.** It makes every unmatched path fall back to
`index.html`. Without it, a refresh on a deep link such as
`/cycles/c_e45ad.../?tab=scheduling` returns a 404 from the frontend host — the app
works until someone presses F5, which is exactly the sort of bug that reaches users.
In the single-service layout the FastAPI `spa_fallback` route did this job; with two
apps the backend never sees those URLs, so the frontend host has to handle it.

### 6.4 Frontend App Settings — there are almost none

`VITE_*` variables are compiled into the JavaScript bundle at **build time**. Setting
them as App Settings on the frontend web app does **nothing at all**. If an API URL or
SSO value needs to change, you must rebuild and redeploy the frontend — there is no
runtime configuration to edit.

This catches people every time. If the UI is calling the wrong API host, the fix is a
rebuild, never an App Setting.

### 6.5 Order of operations

1. Create both apps (names fixed in 6.1).
2. Configure and deploy the **backend**, including `CORS_ORIGINS=$WEB_URL`.
3. Confirm `curl $API_URL/api/health` responds.
4. Build the frontend against `$API_URL`, deploy to the frontend app.
5. Add `$WEB_URL` as an SSO redirect URI (section 7).
6. Open `$WEB_URL` and sign in.

### 6B. If you consolidate to one app later

The code already supports it: `app/main.py` serves `backend/static/` and registers a
SPA fallback whenever that folder exists. Build with
`backend/scripts/build_frontend_for_deploy.sh <url>`, include `static/` in the zip, and
delete the frontend web app. CORS then stops mattering because there is only one
origin. Fewer moving parts, one URL, one deploy — worth considering once the migration
has settled.

---

## 7. Mail.Send certificate and SSO redirect

### Certificate

The certificate and its tenant trust are unchanged. Only where App Service loads it
from changes. Re-do section 6 of `DEPLOYMENT_APP_SERVICE.md` against the new app:

```bash
az webapp config ssl upload --name $APP --resource-group $RG \
  --certificate-file ./secrets/graph-mail.pfx --certificate-password ""

az webapp config appsettings set --name $APP --resource-group $RG --settings \
  WEBSITE_LOAD_CERTIFICATES="<existing-thumbprint>" \
  GRAPH_CERT_PATH="/var/ssl/private/<existing-thumbprint>.p12"
```

`GRAPH_CLIENT_ID`, `GRAPH_TENANT_ID` and the thumbprint are **unchanged** — they are in
`DEPLOYMENT_APP_SERVICE.md` section 5. The cert expires **16 Jul 2027**; if a Key Vault
is in scope, importing from Key Vault (Option B) gets you auto-renewal.

### SSO redirect URI — the one Entra change

On the **existing** SSO app registration (do not create a new one):

1. Entra ID → App registrations → the VendorPulse SPA app
2. Authentication → Single-page application → **Add a URI**
3. Add **`$WEB_URL`** — the *frontend* app, where the browser actually signs in.
   Not the API app; the backend never handles the redirect.
4. Keep the old URI until the old environment is decommissioned, so you can roll back.

This must match `VITE_SSO_REDIRECT_URI` from the frontend build exactly, character for
character. A mismatch gives `AADSTS50011` at sign-in.

No new consent, no new client secret, no new app.

---

## 8. Configuration summary — what changes and what does not

| Setting | Changes? |
|---|---|
| `PG_HOST`, `PG_PASSWORD` | **Yes** — new server |
| `PG_DATABASE`, `PG_PORT`, `PG_SSLMODE`, `PG_POOL_*` | No |
| `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY` | **Yes** — new resource |
| `AZURE_OPENAI_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_VERSION` | No (if you kept `gpt-4o`) |
| `CORS_ORIGINS` (backend app) | **Yes** — must be the **frontend** app's URL |
| `VITE_API_URL` (build time) | **Yes** — must be the **backend** app's URL |
| `GRAPH_CERT_PATH`, `WEBSITE_LOAD_CERTIFICATES` | Path yes; thumbprint no |
| `GRAPH_CLIENT_ID`, `GRAPH_TENANT_ID`, `GRAPH_CERT_THUMBPRINT`, `GRAPH_MAIL_SENDER` | **No** |
| `SSO_CLIENT_ID`, `SSO_TENANT_ID` | **No** |
| `SSO_ENABLED` | Must be **`true`** in any shared environment |
| `VITE_SSO_REDIRECT_URI` (build time) | **Yes** — the **frontend** app's URL |
| `VITE_SSO_CLIENT_ID`, `VITE_SSO_TENANT_ID` | No |

> `SSO_ENABLED=false` leaves the API completely open. It is a local-development setting
> only. Verify it is `true` on the new App Service before anyone else gets the URL.

---

## 9. Verification

```bash
curl $API_URL/api/health          # the BACKEND app
```

Expect `"status":"ok"` and `"database":"connected"`. `"degraded"` with
`"database":"unavailable"` means the firewall or `PG_*` settings are wrong.

Check the two-app wiring explicitly before testing the UI:

```bash
# the frontend host serves the SPA
curl -s -o /dev/null -w "%{http_code}\n" $WEB_URL                 # 200

# deep links fall back to index.html (proves pm2 --spa is on)
curl -s -o /dev/null -w "%{http_code}\n" $WEB_URL/cycles/does-not-exist   # 200, NOT 404

# the backend accepts the frontend origin
curl -s -D- -o /dev/null -H "Origin: $WEB_URL" $API_URL/api/health | grep -i access-control-allow-origin
# must echo back $WEB_URL — if the header is absent, CORS_ORIGINS is wrong
```

Then walk one real cycle end to end:

- [ ] UI loads at the **frontend** URL; Shell SSO sign-in completes
- [ ] Browser devtools → Network shows API calls going to the **backend** URL with no CORS errors
- [ ] Refresh the page while deep inside a cycle — it reloads instead of 404ing
- [ ] An existing cycle opens and shows its attendees (proves the data restored)
- [ ] A scorecard submits successfully (proves Postgres **and** the LLM redaction path)
- [ ] Scorecard request email preview renders, including the Response Guidance block
- [ ] Send one real scorecard email to yourself (proves the Mail.Send cert loaded)
- [ ] Schedule a test meeting (proves delegated Graph calendar access)
- [ ] `az webapp log tail --name $APP --resource-group $RG` shows no errors on boot

The schema check on boot is self-healing: `ensure_schema()` runs on every start and
creates anything missing. If the logs show
`PostgreSQL schema ensured — 18 tables`, the database side is good.

---

## 10. Cutover and rollback

**Cutover order:**

1. Announce the window; stop people using the old app.
2. Take a **final** dump from the old database (data may have changed since your test run).
3. Restore into the new server; re-run the verification queries in 4.5.
4. Point users at the new URL.
5. Keep the old environment running, read-only if possible, for one week.

**Rollback:** the old subscription's resources are untouched by any of this. If the new
environment misbehaves, send people back to the old URL. The only thing to undo is the
SSO redirect URI you added, and leaving it costs nothing.

This is why nothing in this runbook deletes anything from the old subscription.

---

## 11. Decommission — only after sign-off

Once the new environment has run clean for a week **and** someone has signed off:

- [ ] Final dump of the old database, archived somewhere controlled
- [ ] Delete the old resource group
- [ ] Remove the old redirect URI from the SSO app registration
- [ ] Remove old firewall rules
- [ ] **Rotate the secrets that were in flight during the migration** — the old
      `PG_PASSWORD` and the old `AZURE_OPENAI_API_KEY` passed through shells, clipboards
      and possibly chat during this exercise. Treat them as exposed and retire them.
- [ ] Delete local `.dump` files — they contain real personal data

---

## 12. Things most likely to bite

| Symptom | Cause | Fix |
|---|---|---|
| `pg_restore` version error | client older than server 16 | install PostgreSQL 16 client tools |
| `server closed the connection unexpectedly` | IP not in the new firewall | add your current egress IP (4.3); TCP connecting proves nothing |
| App starts then exits | DB unreachable — `lifespan` fails fast by design | fix firewall/`PG_*`; the app will not boot without Postgres |
| UI calls `localhost:8000` | frontend built without `VITE_API_URL` | rebuild with the env vars set, redeploy |
| UI loads but every call fails; console shows CORS | frontend origin missing from `CORS_ORIGINS` on the **backend** app | set it to the exact frontend URL — `https`, no trailing slash |
| Works until you press F5, then 404 | frontend app missing the SPA fallback | startup command needs `pm2 serve /home/site/wwwroot --no-daemon --spa` |
| Changed an App Setting on the frontend app, nothing happened | `VITE_*` are compiled in at build time | rebuild the frontend and redeploy; there is no runtime config |
| UI calls the frontend's own host for `/api/*` | built with `VITE_API_URL` pointing at itself | rebuild with the **backend** app URL |
| SSO loops or `AADSTS50011` | redirect URI not registered | add the new URL to the SSO app registration (7) |
| Mail 503 `ErrorAccessDenied` | cert not loaded into the new app | check `WEBSITE_LOAD_CERTIFICATES` and that `/var/ssl/private/<thumb>.p12` exists |
| Scorecard submit returns 503 | LLM not configured — redaction unavailable, save refused | finish section 5; this refusal is intentional |
| Azure OpenAI deployment refused | subscription quota | raise a quota request; start this early |
| `RequestDisallowedByPolicy` on create | landing-zone Azure Policy | see 2.1 — usually public network access, a missing required tag, or a blocked SKU |
| Postgres refuses `--public-access` | policy denies public PaaS endpoints | private endpoint + VNet-integrate both App Services; involve the platform team |

---

## Related

- [`DEPLOYMENT_APP_SERVICE.md`](DEPLOYMENT_APP_SERVICE.md) — the deployment itself
- [`POSTGRES_MIGRATION.md`](POSTGRES_MIGRATION.md) — the original JSON → Postgres move
- [`MAIL_SEND_IMPLEMENTATION.md`](MAIL_SEND_IMPLEMENTATION.md) — Graph mail and the certificate
