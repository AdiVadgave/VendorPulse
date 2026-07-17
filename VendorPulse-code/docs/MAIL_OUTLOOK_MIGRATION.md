# Mail: Gmail → Outlook (Microsoft Graph) Migration Guide

> **Status:** Code is **ready to switch**, default stays **Gmail**.
> **Goal:** Send scorecard links and meeting minutes (MOM) via **Outlook using a
> service account** (Microsoft Graph `Mail.Send`, app-only) instead of Gmail —
> flipped with one config value once the tenant grants `Mail.Send`.

---

## 1. What sends mail today

| What | Where | How |
|---|---|---|
| Scorecard request (Google Form link) | `backend/app/api/routes/scorecard.py:160` | `gmail_service.send_html_email(...)` |
| In-app scorecard link | `backend/app/api/routes/scorecard_v2.py:1049` | `gmail_service.send_html_email(...)` |
| Meeting minutes (MOM) | `backend/app/api/routes/meeting_agent.py:207` | `gmail_service.send_html_email(...)` |

The send primitive is `backend/app/services/gmail_service.py::send_html_email(*, to_email, subject, html_body, text_body=None) -> dict` (Gmail API, sends as the authenticated Google user; returns the Gmail message resource incl. `id`).

## 2. What's already in place (ready to switch)

- **`backend/app/services/mail_provider.py`** — a provider seam with the **same
  method signature** as `gmail_service.send_html_email`:
  - `GmailMailProvider` — delegates to `gmail_service.send_html_email` (today's behaviour, unchanged).
  - `GraphMailProvider` — sends via Outlook using `GraphService.send_mail(...)`.
  - `get_mail_provider()` — returns the provider chosen by config.
  - `MailSendError` — one exception both providers raise (Gmail's `GmailSendError` is re-raised as this).
- **`GraphService.send_mail(*, to_email, subject, html_body, sender=None, text_body=None)`** —
  `POST /users/{sender}/sendMail` (app-only, service account) or `/me/sendMail` (dev).
- **Config** (`backend/app/config.py`):
  - `mail_provider: str = "gmail"` → set to `"graph"` (or `"outlook"`) to switch.
  - `graph_mail_sender: str = ""` → the **service account UPN** to send AS (app-only). Empty falls back to `/me`.

## 3. Graph permission required

`Mail.Send` — **Application** permission (admin-consented) on the app registration
(the SPN), so the service account can send without a signed-in user. (Delegated
`Mail.Send` also works for dev with `/me`.) This is the same app-only token model
described in `GRAPH_SCHEDULING_HANDOVER.md` §12 — reuse that client-credentials
token helper when you build it.

## 4. The switch checklist (when `Mail.Send` is granted)

1. **Grant + consent** `Mail.Send` (Application) on the SPN.
2. **Create/choose a service-account mailbox** (e.g. `vendorpulse-noreply@shell.com`).
3. **Config** in `.env`:
   ```
   MAIL_PROVIDER=graph
   GRAPH_MAIL_SENDER=vendorpulse-noreply@shell.com
   ```
   (and the app-only token per the scheduling handover — replace the static
   `GRAPH_ACCESS_TOKEN` with the auto-refreshed client-credentials token.)
4. **Repoint the 3 call sites** (mechanical, behaviour-identical while `MAIL_PROVIDER=gmail`):
   at each of the 3 locations in §1, replace
   ```python
   from app.services.gmail_service import send_html_email, GmailSendError
   ...
   result = send_html_email(to_email=..., subject=..., html_body=..., text_body=...)
   ...
   except GmailSendError as exc:
   ```
   with
   ```python
   from app.services.mail_provider import get_mail_provider, MailSendError
   ...
   result = get_mail_provider().send_html_email(to_email=..., subject=..., html_body=..., text_body=...)
   ...
   except MailSendError as exc:
   ```
   (Doing this now with `MAIL_PROVIDER=gmail` changes nothing — `GmailMailProvider`
   calls the same function and re-raises `GmailSendError` as `MailSendError`. So it
   is safe to repoint ahead of time and flip the config later.)
5. **Note on `message_id`:** Graph `sendMail` returns 202 with no body, so
   `result.get("id")` is `None` on the Graph path (Gmail returns a real id). The
   call sites already treat `message_id` as optional — no change needed, but don't
   rely on it for Graph.

## 5. Not covered by this switch (call out separately)

- **The scorecard FORM itself** is a **Google Form** (`google_forms_service.py`,
  `google_form_url`, prefill entry IDs). Switching *email* to Outlook does **not**
  move the form. Replacing the Google Form (e.g. with Microsoft Forms or an in-app
  form) is a separate, larger task — the in-app scorecard form
  (`/scorecard?cycle=...&attendee=...`) already exists and is the natural
  Google-free path.
- **Reply tracking** (`GraphService.query_messages_by_conversation_id`) already
  exists for the Graph side if you later track responses in Outlook threads.

---

*Prepared alongside the Graph scheduling handover. The mail seam is intentionally
tiny so the Gmail→Outlook switch is a config flip plus three mechanical edits.*
