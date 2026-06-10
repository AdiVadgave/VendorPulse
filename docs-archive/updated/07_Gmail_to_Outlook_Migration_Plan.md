# Gmail → Outlook / Microsoft 365 Migration Plan

> **Version:** 2.0 | **Date:** 2026-06-03
> **Audience:** Shell IT Architecture, Shell Identity / Messaging team, Zensar Tech Lead
> **Purpose:** Single-source-of-truth for what changes when we remove Google from the stack

---

## 1. Why this document exists

The POC integrates with **three Google services**:

1. **Gmail API** — sending scorecard requests, reminders, meeting minutes
2. **Google Forms API** — collecting scorecard responses
3. **Google OAuth** — authenticating the developer's personal Google account for the above

For the Shell engagement, all three are removed. Shell is a Microsoft 365 shop; nothing about the workflow needs Google's presence. Removing Google has three immediate benefits:

- **No Google CASA assessment** — saves an annual $10k–$30k commitment and a 2–4 month verification cycle
- **No personal Google account dependency** — the POC currently relies on a developer's Gmail account
- **Single identity surface for audit** — Shell IT only has to govern one tenant: their own

This document explains exactly what gets removed, what replaces it, and what risks come with the change.

---

## 2. Inventory of Google touchpoints in the POC

### 2.1 Backend files to delete

| File | Purpose | Disposition |
|------|---------|-------------|
| `app/services/gmail_service.py` | Sends emails via Gmail API; builds HTML templates | **Delete**; templates move to `app/utils/email_templates.py` and are sent via `GraphService.send_mail` |
| `app/services/google_forms_service.py` | Polls Google Forms responses | **Delete**; replaced by `app/services/scorecard_form_service.py` |
| `app/services/google_auth_service.py` | OAuth flow for Google | **Delete** |
| `data/google_token.json` | Stored Google refresh token | **Delete** + revoke at Google side |
| `data/scorecard_responses.json` | Cached Forms responses | **Delete** (data migrated to Postgres `scorecards`) |

### 2.2 Backend dependencies to remove

```diff
- google-auth>=2.29.0
- google-auth-oauthlib>=1.2.0
- google-api-python-client>=2.127.0
```

Remove from `requirements.in`, regenerate `requirements.txt`.

### 2.3 Backend env vars to retire

```diff
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_PROJECT_ID
- GOOGLE_FORM_ID
- GOOGLE_FORM_URL
- GOOGLE_FORM_PREFILL_CYCLE_ID_ENTRY
- GOOGLE_FORM_PREFILL_EMAIL_ENTRY
- GOOGLE_FORM_PREFILL_VENDOR_ENTRY
- GOOGLE_REDIRECT_URI
- SMTP_HOST, SMTP_PORT, SMTP_USERNAME, SMTP_PASSWORD, etc.  (if present)
```

### 2.4 Frontend code to remove

| Code | Disposition |
|------|------------|
| Any references to `gmailApi`, `googleFormsApi`, `googleAuthApi` | Delete |
| The `/auth/google` route handler in backend | Delete |
| Any UI showing "Google Form URL" or "Google form preview" | Delete; replaced by in-app form preview |
| Any mention of `GOOGLE_FORM_ID` or form prefill warnings in components | Delete |

### 2.5 Tests to retire

| File | Disposition |
|------|------------|
| `tmp_run_samsung_flow.py` | Already informal; delete or adapt to Graph-only path |
| Any test using `gmail_service.send_html_email` | Replace with Graph mock |
| Any test using `google_forms_service` mocks | Replace with in-app form mocks |

---

## 3. Replacement architecture

### 3.1 Outbound email

**Before (POC):**
```
Agent → gmail_service.send_html_email
         → Google OAuth credentials (data/google_token.json)
         → gmail API (users/me/messages/send)
```

**After (Shell):**
```
Agent → GraphService.send_mail(from_mailbox, to, subject, body, content_type)
         → MSAL app-only token (cert in Key Vault)
         → POST /users/{vendorpulse-svc@shell.com}/sendMail
         → Email arrives in recipient mailbox
         → Recipient Reply lands in vendorpulse-svc@shell.com (queryable via Graph)
```

**Important behavioural differences:**

| Behaviour | Gmail (POC) | Graph (Shell) |
|-----------|-------------|----------------|
| From-address | Developer's personal Gmail | Shell service mailbox `vendorpulse-svc@shell.com` |
| Reply tracking | Gmail thread IDs | Graph `conversationId` on messages |
| HTML rendering | Standard | Standard, but Outlook desktop has stricter HTML/CSS support — see §6 |
| Attachments | Supported via Gmail API | Supported via Graph (`attachments` field on `sendMail`) — out of scope for first release |
| Send authority | Anyone with the Google refresh token | Only the application principal, mailbox-scoped via Application Access Policy |
| Audit | Gmail "Sent" folder + our `notifications` table | Service mailbox "Sent" folder + our `external_calls` table + Log Analytics mirror |
| Rate limit | Gmail ~250 msg/day quota | Graph: ~10,000 msgs/day per mailbox, 30/min per app — generally not a constraint |

### 3.2 Scorecard collection

**Before (POC):**
```
Coordinator → ScorecardAgent → Gmail with Google Forms link
Stakeholder → click link → fill Google Form → submit
Backend → google_forms_service.poll_and_store → fetch responses → write to scorecards table
```

**After (Shell):**
```
Coordinator → ScorecardAgent → Graph sendMail with in-app form link
                                ↓ embed in personalised HTML body
ScorecardFormService.issue_link → one-time token, expires in 14 days

Stakeholder → click link /app/scorecard/{token}
            → Backend validates token via scorecard_form_link_repo
            → Frontend renders form with cycle context
            → Stakeholder fills (autosaves drafts) → submits
            → Backend persists scorecards rows, marks link used
            → SubmissionTracker updates live in coordinator UI
```

**No external polling. No third-party form provider. Full control over schema.**

### 3.3 Calendar / Teams meetings

**Before (POC):**
```
Manually pasted GRAPH_ACCESS_TOKEN → calls to /me/findMeetingTimes and /me/events
```

**After (Shell):**
```
MSAL app-only token (cert in Key Vault, rotated annually)
   → calls to /users/{organiser-email}/findMeetingTimes and /users/{organiser-email}/events
   → Teams meeting auto-provisioned via isOnlineMeeting=true
```

The Graph endpoints used are the same; only the authentication and target-user shape changes. The existing `GraphService` class is hardened (retry policy, audit, request-id capture, errors normalised) but conceptually identical.

---

## 4. Migration steps (engineering)

```
Phase 1 — Foundations (week 4–6)
─────────────────────────────────
[ ] Register VendorPulse-Prod and VendorPulse-NonProd apps in Shell Entra ID
[ ] Generate certificate, upload to Entra ID app, store in Key Vault
[ ] Request admin consent on Graph permissions (see §08 for full list)
[ ] Provision vendorpulse-svc@shell.com mailbox and apply Application Access Policy
[ ] Refactor GraphService to use MSAL app-only flow with cert auth
[ ] Replace gmail_service references in agents with GraphService.send_mail
[ ] Move HTML email templates to app/utils/email_templates.py (cleaned up — see §6)
[ ] Delete gmail_service.py, google_auth_service.py, google_forms_service.py
[ ] Remove google-* packages from requirements.in
[ ] Delete data/google_token.json, data/scorecard_responses.json from repo + scrub git history

Phase 2 — Functional migration (week 7–10)
─────────────────────────────────────────
[ ] Build ScorecardFormService — issue_link, validate_token, submit
[ ] Build /app/scorecard/:linkToken page in frontend
[ ] Migrate scorecard email template to embed in-app form URL
[ ] Add scorecard_form_links table + Alembic migration
[ ] End-to-end test: send request → click link → fill form → score lands in DB
[ ] Replace any UI references to "Google Form" with "Scorecard Form"
[ ] Update SubmissionTracker to read directly from scorecards table (remove polling)

Phase 3 — UAT (week 11–13)
─────────────────────────
[ ] Run a full cycle in non-prod against three real Shell test mailboxes
[ ] Verify email rendering across Outlook desktop / OWA / Outlook mobile
[ ] Verify Teams meeting URL is valid and joinable
[ ] Verify scorecard form completes successfully end-to-end
[ ] Confirm minutes distribution to internal recipients only (Shell policy decision)
[ ] Security review of Graph permission scopes and Application Access Policy

Phase 4 — Pilot go-live (week 14–15)
───────────────────────────────────
[ ] Run one real vendor cycle (e.g. CoreSystems Q3 2026) through the production environment
[ ] Coordinator + sponsor on standby for week of go-live
[ ] Monitor App Insights + agent_runs for any Graph or LLM errors
[ ] Capture lessons in post-pilot retro
```

---

## 5. Risks of the migration

| # | Risk | Mitigation |
|---|------|-----------|
| M1 | Entra ID app registration takes longer than 4 weeks due to Shell security review | Start week 1 of Phase 0; provide pre-filled justification document for each scope |
| M2 | Application Access Policy mis-applied → app can read/send for any Shell mailbox | Validate policy at deployment time via a Graph integration test that intentionally tries an unauthorised mailbox and expects 403 |
| M3 | Conditional Access policy blocks the app's sign-in pattern | Coordinate with Entra ID admin; app-only flow generally exempt from MFA-based CA, but device-compliance CA can still bite |
| M4 | Email rendering differences between Outlook desktop and OWA | Use Microsoft's [Email design](https://learn.microsoft.com/outlook/troubleshoot/messaging/) restrictions checklist; test in all clients during UAT |
| M5 | Scorecard form abandonment because UX is new | A/B parallel rendering of MS Forms is **not** offered; instead invest in form polish: autosave, mobile-friendly, single column |
| M6 | Service mailbox storage fills (Graph mail retention) | Configure mailbox retention policy to auto-archive sent items > 1 year; coordinate with Shell Exchange admin |
| M7 | Reply mail goes to the service mailbox — does anyone read it? | Define a small ops runbook: route forwarded into Teams channel; coordinator on-call reviews daily during cycle windows |
| M8 | External (vendor) attendees see the Shell service mailbox as the meeting organiser — branding concern? | Confirm with Shell brand team; alternative is to set organiser to a real VMO coordinator's mailbox (also possible) |

---

## 6. Email template considerations

The POC's `gmail_service.py` contains beautiful but **Gmail-tuned** HTML. Outlook desktop is famously stricter — particularly on:

- **CSS gradients** (the POC uses `linear-gradient` extensively on the header) — Outlook desktop renders these as a solid fallback colour. Fix: VML fallback OR redesign with solid Shell-tone backgrounds.
- **Web fonts** — Outlook will not load `Segoe UI` from CSS; specify it in inline `font-family` with system fallbacks.
- **CSS Grid / Flexbox** — Outlook desktop ignores both. Use 100% tables for layout.
- **`<style>` blocks** — Outlook desktop respects them; mobile clients sometimes strip. Inline critical styles.
- **`background-image`** — Outlook desktop drops them on `<td>`. Use solid colours.
- **Email width** — Stay ≤ 600px for the content table (Shell's Outlook default reading pane is narrow).

Action: **Redesign all email templates for Outlook compatibility in Phase 2.** Visual treatment moves from purple-gradient (POC) to Shell-tone solid blocks. Tested in:

- Outlook for Windows 2019 / Microsoft 365 (desktop)
- Outlook for Mac
- Outlook on the web (OWA)
- Outlook mobile (iOS, Android)
- Plain-text version (some Shell employees prefer)

We use [Litmus](https://litmus.com) or [Email on Acid](https://www.emailonacid.com) for cross-client rendering testing during Phase 2.

---

## 7. Why not Microsoft Forms?

Microsoft Forms is an obvious alternative to a custom in-app form. We rejected it for the following reasons:

1. **Forms-via-Graph is beta.** Microsoft's Graph endpoints for creating/managing Forms are in beta and not recommended for production. Public Forms can only be created via the Forms web UI, requiring manual setup per cycle.
2. **Per-cycle form management overhead.** Each vendor cycle would need a unique form. Whether created manually or via API, this is operational overhead.
3. **Schema flexibility.** Shell's scorecard taxonomy is hierarchical (4 categories × 16 parameters). Native form gives us total control over rendering, validation rules, and conditional questions (e.g., "Comment required if score is 1 or 5").
4. **Data flow simplicity.** A Microsoft Form response sits in a Forms backend; we'd still need to poll it into our Postgres. A native form writes directly. Fewer moving parts.
5. **Authentication for external respondents.** Forms can accept external users but the configuration is awkward. Our token-link approach is simpler and explicitly auditable.

Microsoft Forms remains a **fallback option** if the native form raises strong UX concerns during UAT. Switching back would take ~1 week and is well-understood.

---

## 8. Cutover plan

The POC and the Shell production environment are **separate codebases at separate code branches**. We never run the POC in Shell's tenant. The Shell environment is built fresh:

```
Phase 0 (week 1–2):
  Branch from POC main → create shell-prod branch
  Delete all Google code on shell-prod
  Establish Shell Azure infrastructure (App Service, KV, Postgres)

Phase 1–4:
  All development on shell-prod
  POC main left untouched (could be reused for other clients later)

Phase 5 (pilot):
  Promote shell-prod build → Shell staging slot → Shell production slot
  Database migrated from empty schema → seeded with Shell vendor master
  No POC data is migrated

Decommission POC:
  POC remains for demo / reference until end of Phase 5
  After successful Shell go-live, POC archived (read-only) or deleted per Shell policy
```

No production data migration is needed because **there is no POC production data**.

---

## 9. Rollback

The Gmail/Forms removal is a one-way door. There is no "go back to Gmail" plan in production because:

- The Shell tenant has no Google credentials
- Re-introducing Gmail would re-introduce all the compliance overhead the migration is removing
- A real Shell vendor cycle, mid-flight, would not benefit from a Gmail fallback

If the in-app form is found unworkable in pilot (Risk M5), the fallback is **Microsoft Forms via Graph** (§7), which has a ~1-week pivot cost.

---

## 10. Sign-off

This document is binding for both teams once signed:

| Role | Name | Signed |
|------|------|--------|
| Shell IT Architecture | TBD | |
| Shell IT Security | TBD | |
| Shell Identity Admin | TBD | |
| Shell Messaging Admin | TBD | |
| Zensar Solution Architect | TBD | |
| Zensar Delivery Manager | TBD | |

---

*Gmail → Outlook Migration Plan — Zensar VendorPulse for Shell — 2026-06-03.*
