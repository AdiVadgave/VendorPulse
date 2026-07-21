# Mail.Send Implementation (Microsoft Graph — Service Mailbox)

**Status:** Implemented & verified (dev). Gmail fully removed.
**Owner:** VendorPulse backend
**Last updated:** 2026-07-21

---

## 1. Overview — what & why

VendorPulse sends two kinds of email:

1. **Scorecard requests** — the in-app scorecard form link, emailed to key internal reviewers.
2. **Meeting minutes (MOM)** — the finalised minutes, emailed to internal stakeholders after a governance meeting.

These previously went through **Gmail** (a personal Google account + OAuth). That has been **removed**. All outbound mail now goes through **Microsoft Graph**, sent **as a Shell service mailbox** using an **app-only** identity (no human login involved).

- **Service mailbox (the "from" address):** `Mobility-VendorPulse@shell.com`
- **App registration (the identity):** `AZ-AS-SPN-DS-N-VendorPulse`
- **Permission:** `Mail.Send` (Application) — admin-consented
- **Authentication:** client-credentials using an **X.509 certificate** (the SPN cert)

> "App-only" means the app authenticates as *itself* (a service principal), not as a signed-in user. This is the correct model for **system-generated** email that must send regardless of who (if anyone) is logged in.

---

## 2. What it's used for (call sites)

| Feature | Route | Recipient | Content builder |
|---|---|---|---|
| Scorecard dispatch | `POST /api/scorecard/dispatch-inapp` (`api/routes/scorecard_v2.py`) | key internal stakeholders' `email` | `email_templates.build_scorecard_email` |
| Meeting minutes | `POST /api/cycles/{id}/meeting/minutes/send` (`api/routes/meeting_agent.py`) | internal stakeholders' `email` | `email_templates.build_minutes_email` |

Both call the **same seam**: `get_mail_provider().send_html_email(...)`.

---

## 3. Architecture

The design isolates "how mail is sent" behind a single interface, so the transport can change (cert → Key Vault → Managed Identity) without touching any feature code.

```
Route (scorecard / meeting)
      │  build_*_email()  → {subject, html_body, text_body}
      ▼
mail_provider.get_mail_provider()          ← the single send seam
      │  GraphMailProvider.send_html_email()
      ▼
graph_auth.get_graph_app_token()           ← app-only token (MSAL + certificate)
      │  Bearer token (scope: https://graph.microsoft.com/.default)
      ▼
graph_service.GraphService.send_mail()      ← POST /users/{sender}/sendMail
      ▼
Microsoft Graph  →  sends as Mobility-VendorPulse@shell.com
```

### Files

| File | Responsibility |
|---|---|
| `app/services/mail_provider.py` | The send seam. `get_mail_provider()` → `GraphMailProvider`; `MailSendError`. |
| `app/services/graph_auth.py` | App-only **token acquisition** via MSAL + the SPN certificate. Loads the `.pfx`, builds the MSAL confidential client, returns a cached/refreshed Graph token. |
| `app/services/graph_service.py` | Thin Graph REST client — `send_mail()` POSTs to `/users/{sender}/sendMail`. |
| `app/services/email_templates.py` | Provider-agnostic HTML/text builders (`build_scorecard_email`, `build_minutes_email`). No transport/Google dependency. |
| `app/config.py` | `mail_provider`, `graph_mail_sender`, `graph_client_id`, `graph_tenant_id`, `graph_cert_path`, `graph_cert_password`, `graph_cert_thumbprint`. |

---

## 4. Authentication flow (how a token is obtained)

```mermaid
sequenceDiagram
    participant App as VendorPulse backend
    participant MSAL as MSAL (ConfidentialClientApplication)
    participant AAD as Microsoft Entra ID (login.microsoftonline.com)
    participant Graph as Microsoft Graph

    App->>App: load .pfx (private key + cert), derive thumbprint
    App->>MSAL: build client with {private_key, thumbprint, public_certificate}
    App->>MSAL: acquire_token_for_client(scope=.default)
    MSAL->>AAD: signed client assertion (JWT signed by the cert)
    AAD-->>MSAL: access token (roles: ["Mail.Send"])
    MSAL-->>App: bearer token (cached; auto-refreshed)
    App->>Graph: POST /users/Mobility-VendorPulse@shell.com/sendMail (Bearer)
    Graph-->>App: 202 Accepted (mail queued, saved to Sent Items)
```

Key points:
- The **private key never leaves the app**; only a **signed assertion** goes to Entra ID.
- MSAL **caches** the token in memory and **refreshes** it automatically — no per-send login.
- The token carries the **`Mail.Send` app role**, which is what Graph checks.

---

## 5. Azure setup (one-time — already done in dev)

1. **App registration** `AZ-AS-SPN-DS-N-VendorPulse`
   - API permission: **Microsoft Graph → `Mail.Send` (Application)** → **admin consent granted**.
2. **Certificate**
   - Public cert uploaded to the app registration (**Certificates & secrets → Certificates**).
   - Thumbprint: `E3B27F913B430B93718E3B12BDFE7E4FFF65DFC5`, valid **16 Jul 2026 → 16 Jul 2027**.
   - The **private key** (`.pfx`) is held by the app (see §6).
3. **ApplicationAccessPolicy (security scoping)** — restricts the SPN so it can send **only** as `Mobility-VendorPulse@shell.com`:
   - `Test-ApplicationAccessPolicy` → `Mobility-VendorPulse@shell.com` = **Granted**; any other mailbox = **Denied**.
   - Without this, application `Mail.Send` can send as *any* mailbox in the tenant — so this scoping is important.

---

## 6. Configuration (`.env`)

```
MAIL_PROVIDER=graph
GRAPH_MAIL_SENDER=Mobility-VendorPulse@shell.com
GRAPH_CLIENT_ID=74d7cccb-faab-4971-b0cd-962c665022d3
GRAPH_TENANT_ID=db1e96a8-a3da-442a-930b-235cac24cd5c
GRAPH_CERT_PATH=<path to the SPN .pfx>       # dev: backend/secrets/graph-mail.pfx (git-ignored)
GRAPH_CERT_PASSWORD=                          # empty for a Key Vault export
GRAPH_CERT_THUMBPRINT=E3B27F913B430B93718E3B12BDFE7E4FFF65DFC5   # optional; derived from the cert if blank
```

The certificate lives under `backend/secrets/` locally and is **git-ignored** (`*.pfx`, `secrets/` in `.gitignore`). It is **never** committed.

---

## 7. Local / dev testing

```
# token-only check
python scripts/test_graph_mail.py
# token + real send
python scripts/test_graph_mail.py your.name@shell.com
```
`GET /api/health` returns the DB status; a successful send returns Graph **202** and the message appears in the mailbox's **Sent Items** (`saveToSentItems: true`).

---

## 8. Production (Azure App Service or VM)

### Does the current method work in prod?
**Yes.** MSAL certificate auth needs only outbound HTTPS to `login.microsoftonline.com` and `graph.microsoft.com`, which App Service and VMs have. The app-only flow, the SPN, and the access policy are all production-valid.

### Required changes for prod
The mechanism is fine; the **only real change is where secrets live** and how config is provided.

| Concern | Dev (now) | Production (recommended) |
|---|---|---|
| Certificate storage | `.pfx` file under `backend/secrets/` | **Azure Key Vault** — do **not** ship the `.pfx` in the repo or container image |
| Config values | `.env` file | **App Service → Configuration → Application settings** (or VM environment) |
| Cert loading | read file at path | App Service Key Vault reference / `WEBSITE_LOAD_CERTIFICATES`, or fetch from Key Vault at startup |
| Outbound network | open | ensure firewall/NSG allows outbound 443 to Microsoft login + Graph |
| Cert lifecycle | manual | **renew before 16 Jul 2027**; re-upload public cert to the app registration, replace the private key in Key Vault |

**Recommended prod option (smallest change):** keep the cert flow, but store the `.pfx` in **Key Vault** and point the app at it. Code stays the same — only the *source* of the cert changes (a small, isolated edit in `graph_auth._load_pfx`).

**What NOT to do in prod:** commit the `.pfx` / password, or bake them into the Docker image.

---

## 9. After SSO integration

**Important distinction — these are two different identities:**

| | Purpose | Identity |
|---|---|---|
| **SSO (Entra ID login)** | lets **users sign in** to VendorPulse | the **signed-in user** (delegated) |
| **Mail.Send (current)** | sends **system email** as the service mailbox | the **app / service principal** (app-only) |

### Does SSO change Mail.Send?
**No — Mail.Send is unaffected by SSO.** System emails (scorecard requests, minutes) are automated and must send **as the service mailbox** regardless of who is (or isn't) logged in. SSO governs *who can log in and trigger an action*; it does **not** change *how* the email is sent. The two run in parallel:

- SSO → authorises the **user** (front-of-house login).
- App-only Mail.Send → sends the **email** (back-of-house, service mailbox).

### What SSO *does* add
- **Authorization**: once SSO is in, the app knows the logged-in user, so we can gate "who is allowed to dispatch scorecards / send minutes" by role. This is app logic, not a mail change.
- **No change to the send path or the "from" address** — mail keeps coming from `Mobility-VendorPulse@shell.com`.

### Optional future evolution (not required)
1. **Managed Identity instead of a certificate** (cleanest, secret-less):
   - Enable the App Service/VM **managed identity**.
   - Ask the Shell team to grant **`Mail.Send`** to that identity's service principal (+ add it to the ApplicationAccessPolicy).
   - Swap `graph_auth` token acquisition from MSAL-cert to `azure-identity`'s `DefaultAzureCredential`.
   - Result: **no cert, no password, no expiry** to manage. Only `graph_auth.py` changes; the send seam and all feature code stay identical.
2. **Delegated "send as the logged-in user"** — technically possible after SSO, but **not recommended** for automated/system email (it ties system mail to a person and their session). Keep app-only for system email.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `No Graph credentials — set GRAPH_CERT_PATH` | cert path not configured | set `GRAPH_CERT_PATH` (+ password if any) |
| `Graph token acquisition failed` | wrong tenant/client id, cert not uploaded, or clock skew | verify `GRAPH_CLIENT_ID`/`GRAPH_TENANT_ID`; confirm the public cert is on the app registration |
| Graph returns `ErrorAccessDenied` on send | app can't send as that mailbox | check the **ApplicationAccessPolicy** includes `GRAPH_MAIL_SENDER` |
| Token has no `Mail.Send` role | permission/consent missing | grant + admin-consent `Mail.Send` (Application) |
| Sends work then fail ~mid-2027 | certificate expired | renew the cert (see §8) |

---

## 11. Security summary

- Private key stays server-side; only a signed assertion is sent to Entra ID.
- The SPN is **scoped by ApplicationAccessPolicy** to a single mailbox.
- Cert/secret is **git-ignored** in dev and belongs in **Key Vault** in prod.
- The send seam (`mail_provider`) means the auth method can be upgraded (Key Vault, Managed Identity) with a one-file change and zero impact on features.
