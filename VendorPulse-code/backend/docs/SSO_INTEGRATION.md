# SSO Integration (Entra ID — user sign-in)

**Status:** Code scaffolding implemented & dormant (`SSO_ENABLED=false`). Goes live via a config flip once the app registration's client id is available.
**Owner:** VendorPulse team
**Last updated:** 2026-07-22

---

## 1. What this is (and how it differs from Mail.Send)

SSO lets **users log in to VendorPulse with their Shell account** (Entra ID / Azure AD). It is a **separate identity** from the Mail.Send integration — do not confuse the two:

| | Mail.Send (already live) | SSO (this doc) |
|---|---|---|
| Answers | "how does the server send email?" | "who is the person using the app?" |
| Identity | the **app** (service principal) | the **user** (delegated) |
| Flow | client-credentials, **certificate** | OIDC Authorization Code + PKCE (SPA) |
| Runs | backend, no user present | browser, user clicks "Sign in" |
| Credential | X.509 cert (`.pfx`) | **none** (SPA is a public client) |
| App registration | `AZ-AS-SPN-DS-N-...VendorPulse` (cert) | `AZ-AS-SPN-DS-N-VendorPulse-SSO` (SPA) |

They run in parallel and never interfere. Turning on SSO does **not** change how mail is sent — mail still goes as `Mobility-VendorPulse@shell.com`.

---

## 2. Architecture

```
Browser (SPA)
  │  1. user clicks "Sign in with Shell"
  ▼
Microsoft Entra ID  ──►  user authenticates (MFA etc.)
  │  2. redirects back to http://localhost:5173 with an ID token
  ▼
MSAL.js (AuthProvider.tsx)  ── stores token, gates the app
  │  3. attaches "Authorization: Bearer <idToken>" to every API call (api.ts)
  ▼
FastAPI backend (core/auth.py)
  │  4. validates the token: signature (JWKS) + issuer + audience + expiry
  ▼
Route handler  ── knows the signed-in user (email, name, roles)
```

**Token choice:** the login-only flow validates the **ID token** (audience = the SPA client id). No custom API scope is required, which is why the Identifier URI (`https://shell.com/vendorpulse`) is just a name and never used at runtime.

---

## 3. What must be made available (procurement checklist)

| # | Item | Who provides | How |
|---|---|---|---|
| 1 | **App registration (SPA type)** | Shell IAM self-service portal / Jayadev Warrier | §4 below |
| 2 | **Application (client) ID** | returned after #1 is provisioned | copy from the portal |
| 3 | **Directory (tenant) ID** | already known | `db1e96a8-a3da-442a-930b-235cac24cd5c` |
| 4 | **Delegated Graph permissions** (`openid`, `profile`, `email`, `User.Read`) | Shell admin | added on the registration + **admin consent** |
| 5 | *(prod only)* prod **Reply URL** | you, at deploy time | add `https://<prod-dns>` to the same registration |
| 6 | *(optional)* **App roles** + user assignments | Shell admin | only if you want role-gating (§8) |

**Nothing else** — no client secret, no certificate for SSO.

---

## 4. App registration — exact values (Shell IAM self-service portal)

Create a **new** registration (do not reuse the Mail.Send SPN):

| Portal field | Value |
|---|---|
| Application Name | `AZ-AS-SPN-DS-N-VendorPulse-SSO` |
| App/SPN Description | `VendorPulse user SSO login (Entra ID)` |
| Prod/Non-Prod | Non-Production |
| Service | AS (Azure@Shell Platform) |
| Business Code | DS - (Downstream) |
| **App Type** | **Single Page Application** |
| **Reply URL** | `http://localhost:5173` |
| **Allow ID Token** | **Yes** |
| **Identifier URI** | `https://shell.com/vendorpulse` (a name under a verified domain — never visited) |
| Additional Information | `Delegated user sign-in for VendorPulse` |

Then, via **"Add API Permissions"**: Microsoft Graph → **Delegated** → `openid`, `profile`, `email`, `User.Read` → **admin consent granted**.

> Local dev runs entirely on `http://localhost:5173`. The prod URL is added later as a **second** Reply URL; you do not need DNS to build or test.

---

## 5. The code (already implemented — dormant)

| Layer | File | Role |
|---|---|---|
| Backend config | `app/config.py` | `SSO_ENABLED`, `SSO_CLIENT_ID`, `SSO_TENANT_ID`, `SSO_EXTRA_AUDIENCES` |
| Backend validation | `app/core/auth.py` | `get_current_user` (validates token / dev principal when off), `require_roles(...)` |
| Frontend config | `src/lib/auth/msalConfig.ts` | MSAL config from `VITE_SSO_*` |
| Frontend gate | `src/lib/auth/AuthProvider.tsx` | login gate + token bridge; passthrough when off |
| Frontend transport | `src/lib/api.ts` | attaches `Authorization: Bearer` when logged in |
| Frontend bootstrap | `src/main.tsx` | app wrapped in `<AuthProvider>` |

Dependencies added: backend `pyjwt`; frontend `@azure/msal-browser`, `@azure/msal-react`.

**While `SSO_ENABLED=false`:** the backend returns a dev principal and gates nothing; the frontend renders with no login gate. The app is identical to its pre-SSO behaviour.

---

## 6. Turning it on (config only — no code changes)

**Backend `.env`:**
```
SSO_ENABLED=true
SSO_CLIENT_ID=<Application (client) ID>
SSO_TENANT_ID=db1e96a8-a3da-442a-930b-235cac24cd5c
```

**Frontend `.env.local`** (copy from `.env.local.example`):
```
VITE_SSO_ENABLED=true
VITE_SSO_CLIENT_ID=<same client id>
VITE_SSO_TENANT_ID=db1e96a8-a3da-442a-930b-235cac24cd5c
VITE_API_URL=http://localhost:8000
```

Restart backend (`python run.py`) and frontend (`npm run dev`).

---

## 7. Testing locally

1. Open `http://localhost:5173` → you now see **"Sign in with Shell"**.
2. Click it → Microsoft login → authenticate with a **real Shell account**.
3. You are redirected back into the app; the ID token is attached to API calls.
4. Confirm the backend accepts it: any API call succeeds (200). Tamper with / drop the token → backend returns **401**.
5. To inspect the signed-in identity server-side, add `user: CurrentUser = Depends(get_current_user)` to any route and log `user.email` / `user.roles`.

---

## 8. Role-based authorization (optional, after login works)

`require_roles` is ready but applied to nothing (behaviour unchanged). To gate an action:

```python
from fastapi import Depends
from app.core.auth import require_roles

@router.post("/minutes/send", dependencies=[Depends(require_roles("VMO"))])
def send_minutes(...):
    ...
```

Requires **App roles** defined on the registration and users assigned to them (Enterprise applications → Users and groups). While SSO is off, the dev principal carries `VMO`, so gated routes stay open in dev.

---

## 9. Production

| Concern | Dev | Production |
|---|---|---|
| Reply URL | `http://localhost:5173` | **add** `https://<prod-dns>` to the same registration |
| Config source | `.env` / `.env.local` | App Service → Application settings (or VM env) |
| CORS | `localhost` origins | add the prod origin to `CORS_ORIGINS` |
| Token cache | `sessionStorage` | same (no change needed) |

- The prod DNS is created as a **CNAME** (+ TXT verify) pointing your Shell name at the Azure host; only needed to *deploy*, not to *build*.
- No certificate, no secret to rotate for SSO — ever.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Login popup/redirect loops | Reply URL mismatch | the URL in the browser must exactly match a Reply URL on the registration |
| Backend returns 401 on every call | `SSO_CLIENT_ID` mismatch (audience) | backend `SSO_CLIENT_ID` must equal the SPA client id |
| "SSO is enabled but not configured" (500) | `SSO_ENABLED=true` but ids blank | fill `SSO_CLIENT_ID` / `SSO_TENANT_ID` |
| Consent prompt / "need admin approval" | delegated permissions not consented | Shell admin grants admin consent (§4) |
| 403 on a gated route | user lacks the app role | assign the role in Enterprise applications |

---

## 11. Summary

- SSO is a **user-login** layer, fully separate from the app-only Mail.Send flow.
- All code is in place and **dormant**; going live is a **config flip** once the client id arrives.
- Only external dependency: a **SPA app registration + admin-consented delegated permissions** from the Shell IAM team. No secret, no certificate.
- Local dev needs only `http://localhost:5173`; prod adds one Reply URL and a DNS CNAME.
