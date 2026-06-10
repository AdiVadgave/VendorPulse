# Expected Errors & Operational Considerations

> **Version:** 2.0 | **Date:** 2026-06-03
> **Audience:** Shell IT Operations, on-call rota, Zensar SRE / Tech Lead
> **Purpose:** Enumerate failure modes the system **will** see in production, with the agreed handling for each

---

## Reading guide

This is **not** a complete error catalogue. It is a curated list of the failure modes a Shell support engineer will actually encounter, with:

- The trigger
- What the system does automatically
- What the operator should do
- Where to look for evidence

For exhaustive HTTP / exception mappings, see [§16 of the Backend LLD](05_LLD_Backend_Shell.md#16-error-handling).

---

## 1. LLM provider failure

### 1.1 LLM API key invalid or rotated

**Trigger:** 401 from Anthropic / Azure OpenAI. Often happens immediately after a forgotten rotation.

**Automatic behaviour:**
- Every agent run failing in the same minute → `agent_runs.status = FAILED` with `error_message` mentioning auth
- `external_calls.provider = 'anthropic' status_code = 401` rows accumulating
- App Insights alert fires within 2 minutes

**Operator action:**
1. Confirm Key Vault has the current key (it may have rotated)
2. Restart the App Service instances (forces token cache flush)
3. If still failing, the key with the provider needs renewal — escalate to Shell Procurement / LLM provider contact

**Evidence:** App Insights → search `cloud_RoleName == 'vendorpulse' and resultCode == 401 and target contains 'anthropic'`

### 1.2 LLM provider 429 (rate limited)

**Trigger:** Provider is throttling. Usually happens during high-volume cycles (many cycles running simultaneously).

**Automatic behaviour:**
- `LLMService` retries with exponential backoff up to 5 times honouring `Retry-After`
- If exhausted, agent returns `status = failed`; coordinator UI shows retry button

**Operator action:** None usually needed. If persistent (>10 minutes), check daily tenant budget — we may have hit a soft cap.

### 1.3 LLM provider 5xx outage

**Trigger:** Provider has a region outage.

**Automatic behaviour:**
- Retry with backoff (5 attempts)
- After exhaustion, agent reports failed
- No outbound communications go out (agent never reaches "ready to send" state)

**Operator action:**
1. Check provider status page (https://status.anthropic.com or Azure status)
2. Inform Shell VMO that AI assistance is degraded — workflow can continue manually
3. If outage > 4 hours, switch provider via `LLM_PROVIDER=azure_openai` config (or vice versa) and restart

### 1.4 LLM output validation failure

**Trigger:** Claude returns malformed JSON despite tool definition.

**Automatic behaviour:**
- `BaseAgent` catches JSON decode error, marks `agent_runs.status = FAILED`, logs the raw output
- Agent response surfaces "Unable to parse AI response" message
- No partial side-effect (the tool call was the last step; nothing committed)

**Operator action:**
1. Retry from UI
2. If recurring, review the offending agent's `system_prompt` and `tool` definitions — model behaviour may have changed across updates

### 1.5 Token budget exhausted

**Trigger:** Cycle has consumed its full `per_cycle_token_budget`.

**Automatic behaviour:** HTTP 429 from `/api/v1/.../generate-*` endpoints; toast in UI; agent does not run.

**Operator action:**
1. `vmo_admin` extends cycle budget via Admin panel (logged as security event)
2. Investigate whether prompt size has grown unexpectedly (e.g. unusually long pasted notes)

---

## 2. Microsoft Graph failures

### 2.1 Graph token acquisition fails

**Trigger:** Certificate expired, Entra ID app disabled, or admin consent withdrawn.

**Automatic behaviour:**
- `GraphAuthError` thrown from `_get_token`; cascades to 503 from API
- All scheduling / mail / Teams operations fail immediately
- App Insights alert on `result == 'auth_failed'` events spiking

**Operator action:**
1. Check certificate expiry in Entra ID portal — rotate if < 30 days remaining
2. Verify app registration not disabled
3. Verify admin consent still in place for application permissions
4. Restart App Service after Key Vault cert refresh

### 2.2 Graph 429 (throttled)

**Trigger:** Service mailbox or app has exceeded per-app or per-mailbox limits. Most common during bulk operations (scorecard dispatch to 10+ recipients).

**Automatic behaviour:**
- `_request` catches 429, reads `Retry-After`, sleeps, retries up to 5 times
- Token bucket in `GraphService` set to 80% of published limits to avoid in the first place
- Audit row written for every 429

**Operator action:** None usually needed. If persistent, consider scheduling bulk operations off-peak or increasing the staggered sending delay.

**Known limits (as documented by Microsoft):**
- Per-mailbox: 10,000 requests / 10 minutes
- Per-app per-mailbox: 1,500 requests / 30 seconds
- `sendMail`: 30 messages / minute / mailbox

### 2.3 Graph 5xx

**Trigger:** Graph outage or partial degradation.

**Automatic behaviour:** Retry with backoff (5 attempts); if exhausted, surface as 503 to caller.

**Operator action:** Check https://status.office.com. If wide-area outage, communicate degradation to Shell VMO; manual workflow possible.

### 2.4 Mailbox not found / disabled

**Trigger:** Stakeholder leaves Shell during a cycle; their mailbox is disabled.

**Automatic behaviour:**
- `GraphPermanentError` with 404 / `MailboxNotEnabledForRESTAPI`
- Agent skips that attendee, marks them as `invite_status = FAILED` in `cycle_attendees`
- Warning surfaced to coordinator; coordinator can replace the attendee

**Operator action:** None. The product is designed to gracefully degrade per-attendee.

### 2.5 External (vendor) attendee invitation blocked

**Trigger:** Shell external-collaboration policy blocks external invitees from the service mailbox.

**Automatic behaviour:**
- Graph returns 403 or `EwsExternalServerError`
- Event creation may succeed partially (internal attendees added, external skipped)
- Coordinator sees warning

**Operator action:**
1. Coordinator can manually invite external attendees from their own Outlook calendar after the meeting is created
2. Long-term: Shell IT Security to confirm policy and/or whitelist VendorPulse service principal

### 2.6 Teams meeting URL not created

**Trigger:** Service mailbox doesn't have a Teams license, or Teams policy doesn't permit online meeting creation by Graph.

**Automatic behaviour:** Event is created without an online meeting URL; coordinator sees warning "Teams URL missing"; UI prompts to add one manually.

**Operator action:**
1. Verify service mailbox has Microsoft 365 E3/E5 (Teams included)
2. Verify Teams meeting policy assigned

### 2.7 Online meeting `joinUrl` is null even on success

**Trigger:** Async provisioning delay (rare). Graph returned 201 but the `onlineMeeting` object wasn't ready.

**Automatic behaviour:** Poll for up to 30 seconds; if still missing, save event without URL, surface warning.

**Operator action:** Reload the cycle in 1–2 minutes; the URL usually appears.

### 2.8 `findMeetingTimes` returns 0 suggestions

**Trigger:** Date range too narrow, all attendees fully booked, working-hours mismatch.

**Automatic behaviour:** Frontend shows `EmptyState` with "No common slots found"; coordinator can adjust date range or attendee list.

**Operator action:** None — UX is designed to surface this clearly.

### 2.9 Graph `request-id` missing

**Trigger:** Network proxy strips the header. Loses correlation.

**Automatic behaviour:** Audit row written with `request_id = null`; we can still correlate by timestamp + endpoint but it's harder.

**Operator action:** If chronic, work with Shell Networking to whitelist Graph response headers through egress proxy.

---

## 3. Authentication / authorisation failures

### 3.1 User cannot log in (Entra ID redirect fails)

**Trigger:** OIDC callback fails — could be expired session at Entra side, misconfigured redirect URI, or transient outage.

**Automatic behaviour:** User sees `/login-error` page with a correlation ID and "try again" button.

**Operator action:**
1. Check Entra ID sign-in logs for the failure reason
2. Verify redirect URI matches what's registered in the app
3. Confirm App Service is not flapping (App Insights availability)

### 3.2 User logs in but sees "Access denied"

**Trigger:** User is not in any of the four Entra groups we map to roles.

**Automatic behaviour:** App shows "no permissions" page; instructs user to contact VMO Admin.

**Operator action:** Add the user to the appropriate Entra group. Group membership changes take ~5 minutes to propagate to a new session.

### 3.3 Stale role after Entra group change

**Trigger:** User's group changed in Entra ID but they still have an active VendorPulse session.

**Automatic behaviour:** Session expires after 8 hours, so changes propagate within 8 hours max. Until then, the user has their old role.

**Operator action:** For urgent role removal, `vmo_admin` can force-logout the user via Admin panel (writes to `security_events`).

### 3.4 Session cookie blocked by privacy settings

**Trigger:** Rare — non-standard browser configuration blocking SameSite cookies.

**Automatic behaviour:** User cannot stay logged in; redirect loop.

**Operator action:** Confirm Shell's standard browser policy allows session cookies for internal Microsoft 365 hosts.

---

## 4. Scorecard form failures

### 4.1 Stakeholder reports "Form link expired"

**Trigger:** Link is past `expires_at` (14 days from issuance) OR has been used already.

**Automatic behaviour:** Form page renders an expired notice.

**Operator action:** Coordinator opens the cycle → `SubmissionTracker` → "Reissue form link" → a new email goes out.

### 4.2 Stakeholder reports "Cannot find email"

**Trigger:** Email caught by spam filter, or the Shell service mailbox not yet whitelisted at the recipient end (for external vendors).

**Automatic behaviour:** None — system has no visibility into recipient inbox state.

**Operator action:**
1. Confirm send succeeded in `external_calls` (status 202)
2. Check recipient's spam folder
3. Coordinator can copy the form URL from the admin tools and paste it manually

### 4.3 Stakeholder submits invalid data (score out of range)

**Trigger:** Manual API manipulation; should not happen via UI.

**Automatic behaviour:** Server-side validation rejects; HTTP 422.

**Operator action:** None — system handles this correctly. If a user reports the legitimate case (e.g., wants a half-score), educate or extend taxonomy.

### 4.4 Form autosave fails

**Trigger:** Network blip mid-save.

**Automatic behaviour:** UI retries silently; on persistent failure, shows toast "Draft save failed — retrying".

**Operator action:** None if transient. If chronic, check Postgres connection pool health.

---

## 5. Graph throttling & service availability

### 5.1 Per-day mailbox quota for `sendMail`

**Soft limit:** ~10,000 messages/day. Our expected peak is ~50 messages/day (10 scorecard recipients × 5 active cycles). **Headroom is enormous; we are not at risk.**

### 5.2 What happens if we exceed limits anyway

`GraphService` enters back-off, cycles re-queue agent actions, coordinators see "delivery in progress" UI. No data loss; just slower delivery. If sustained, alert fires.

### 5.3 Microsoft 365 outage (region-wide)

Shell's Outlook would also be down — so VMO coordinators aren't trying to use the app anyway. We degrade gracefully:

- All Graph calls fail; agents return failed
- App itself still up; coordinators can view data, plan, draft
- Sending resumes automatically when Graph is reachable again

---

## 6. Workflow state errors

### 6.1 Coordinator tries to advance state before module complete

**Trigger:** Coordinator clicks "Next" without finishing module work (rare — UI typically prevents this).

**Automatic behaviour:** Backend returns 409 Conflict; UI shows toast.

**Operator action:** None — UX surfaces the missing prerequisite.

### 6.2 Cycle stuck in a state

**Trigger:** Approval never came back (coordinator went on leave); LLM call ended in `pending_approval` but no one acted.

**Automatic behaviour:** Cycle remains in its current state; `approval_pending.count` metric reflects backlog; weekly reminder email to organiser if a cycle hasn't progressed in 14 days.

**Operator action:** `vmo_admin` can:
1. Re-assign approval to another coordinator
2. Cancel the pending approval (a security event)
3. Archive the cycle if no longer relevant

### 6.3 Workflow needs to "go back"

**Trigger:** Coordinator realises they sent a scorecard request with the wrong attendees.

**System behaviour:** **No state rollback exists.** Forward-only by design.

**Recommended handling:**
1. Continue forward — let the scorecard collection complete; outliers can be flagged
2. Or: `vmo_admin` archives the cycle and starts a new one
3. For very-low-impact corrections (e.g., add a missing attendee), the data model permits inserting a new attendee + form link without rollback

---

## 7. Data integrity

### 7.1 Duplicate scorecard submission

**Trigger:** Race condition or token reuse attempt.

**Automatic behaviour:** Unique constraint on `(cycle_id, stakeholder_id, parameter)` rejects duplicate; transaction rolls back; user sees error.

**Operator action:** None — DB protects integrity.

### 7.2 Orphaned `agent_runs`

**Trigger:** Pod killed mid-run; `agent_runs.status` stuck at `PENDING`.

**Automatic behaviour:** Background sweeper (runs hourly) marks `agent_runs` older than 30 minutes still `PENDING` as `FAILED` with `error_message = 'Run timed out — possibly killed mid-execution'`.

**Operator action:** None routine. Investigate if many runs are being killed (App Service restarts? OOM?).

### 7.3 Vendor renamed mid-cycle

**Trigger:** VMO renames a vendor (e.g., M&A activity).

**Automatic behaviour:** All `vendor_id` foreign keys are stable; only `vendors.name` updates. Historical UI may briefly show inconsistency.

**Operator action:** None — by-design. Renames are rare.

---

## 8. Performance edge cases

### 8.1 A cycle with 50+ attendees

**Behaviour:** Slot ranking algorithm scales linearly (~O(slots × attendees)); LLM prompts grow linearly. Per-cycle token budget may exhaust faster.

**Operator action:** For very large cycles, `vmo_admin` raises the cycle budget. UI is designed for ~20 attendees; >50 may degrade rendering performance (large tables).

### 8.2 A cycle with 100+ historical cycles for analytics

**Behaviour:** Module F queries paginate; charts cap at 12 most recent cycles by default. No degradation expected for the foreseeable future.

### 8.3 Long meeting transcripts (>50k tokens)

**Behaviour:** Truncation logic in MeetingAgent chunks transcripts > 30k tokens and processes in sections, then merges minutes.

**Operator action:** Educate coordinators not to paste entire raw transcripts; use highlights. Or wait for Phase 2 Teams transcript ingestion.

---

## 9. Cost / spend anomalies

### 9.1 LLM cost spike

**Trigger:** A single cycle consumed 5x expected tokens.

**Likely cause:** Coordinator pasted an unusually long alignment note or transcript.

**Automatic behaviour:** Per-cycle budget enforced; spike contained. Alert fires at 80% of daily tenant budget.

**Operator action:** Review `agent_runs.tokens_used` for the cycle. Consider tighter per-cycle budget. Educate coordinator.

### 9.2 App Insights cost spike

**Trigger:** Verbose logging accidentally enabled in prod, or repeated error log loop.

**Automatic behaviour:** Daily cap on App Insights set at 1 GB; further data dropped after cap.

**Operator action:** Find the source via App Insights diagnostics; reduce log level; deploy fix.

---

## 10. Operational runbook quick reference

| Symptom | First-look location |
|---------|----------------------|
| Whole app down | App Service health → check Front Door, container status |
| Agents failing | App Insights → `customEvents | where name == 'agent.failed'` |
| Emails not arriving | Service mailbox "Sent Items" + `external_calls.provider='graph'` |
| Form links expired | `scorecard_form_links` table; reissue from coordinator UI |
| Users can't log in | Entra ID sign-in logs; verify redirect URIs |
| Stuck cycle | `governance_cycles` for state; `approval_pending` metric |
| Cost surprise | Admin → LLM Budget panel |
| Slow page load | App Insights → performance tab; check Postgres health |
| Workflow violation toast for user | `cycle_state_transitions` to confirm current state |

---

## 11. On-call expectations

| Severity | Definition | Response time | Resolution target |
|----------|------------|----------------|--------------------|
| **P1 — Critical** | App down for all users OR data integrity issue | 15 min ack | 4 hours |
| **P2 — Major** | A module unusable OR widespread (>20%) failures | 1 hour ack | 1 business day |
| **P3 — Minor** | Single-user issue OR cosmetic | next business day | 5 business days |
| **P4 — Info** | Question, request | best-effort | n/a |

On-call coverage: **business hours, 5×8** (Shell EMEA hours) post-handover. Out-of-hours support is escalation-only.

---

## 12. Lessons we've already learned

From the POC's operational profile, even at single-developer scale:

1. **Graph token expiry surprises.** Always re-acquire with sufficient leeway (we cache with 60-second pre-expiry margin).
2. **`findMeetingTimes` is sensitive to timezone and working-hours configuration.** Set `activityDomain='unrestricted'` if `'work'` returns nothing — the POC's GraphService already does this.
3. **Outlook desktop is strict on HTML.** Cross-client testing is mandatory before any email template change.
4. **Empty agent runs.** Sometimes Claude calls only deterministic tools and produces no narrative text — the response is still valid. UI must not assume "text always present".
5. **Form prefill works on full Forms URLs, not on `forms.gle` short links.** (Less relevant now — we're moving off Forms — but the lesson generalises: always use canonical URLs.)
6. **Stakeholder email typos.** A single typo (`firstname.lastname@shel.com` vs `shell.com`) causes silent send failure. Validate domain format at attendee entry.

---

*Expected Errors & Operational Considerations — Zensar VendorPulse for Shell — 2026-06-03.*
