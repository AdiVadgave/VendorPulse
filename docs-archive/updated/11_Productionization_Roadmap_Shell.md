# Productionization Roadmap — Shell (3-Week Plan)

> **Version:** 2.2 | **Date:** 2026-06-03
> **Audience:** Shell PMO, Shell Sponsor, Zensar Delivery Manager, Zensar VP
> **Purpose:** Compressed 3-week delivery plan from POC → Shell production go-live
> **Posture:** Aggressive timeline; scope-disciplined; design-change-aware; assumes Shell-side access fast-tracked

---

## 1. Headline shape

```
Week 1                Week 2                Week 3
──────                ──────                ──────
Foundations,          Functional            Hardening,
Migration &           Completion            UAT & Go-Live
Design Alignment      (chosen path)
─────────────────────────────────────────────────────────
Days 1–5              Days 6–10             Days 11–15

Mobilise +            Six agents real,      UAT with pilot
production            Module B per          coordinators,
substrate up,         design decision,      defect fixes,
Gmail/Forms gone,     Shell branding,       pilot vendor
DESIGN LOCKED         Outlook emails        cycle starts
```

This is a **sprint-paced delivery**, not a phased programme. The standard 21-week productionization plan has been compressed by ~85%. To make it land safely:

1. **Pre-position** Shell-side access *before* day 1 (see [§2](#2-day-zero-prerequisites))
2. **Run a design-alignment checkpoint on day 2** so any Shell-side preference changes are captured and the rest of the plan re-shaped while there is still time
3. **Reduce scope** of the first release (see [§9](#9-deferred-from-the-3-week-scope))
4. **Parallelise** workstreams that the longer plan would have sequenced
5. **Operate in production from day 1 of week 3** — no separate UAT environment cycle

This is achievable, but it is **not the conservative path**. The risk profile is explicitly higher (see [§10](#10-risks-specific-to-the-compressed-timeline)).

---

## 2. Day-zero prerequisites

The following **must already be in place on Monday of week 1**, or the plan slips immediately. Shell ownership confirmed in advance:

- [ ] Entra ID app registrations (`VendorPulse-NonProd` and `VendorPulse-Prod`) created and admin-consent granted on Graph application permissions
- [ ] Service mailbox `vendorpulse-svc@shell.com` provisioned with Application Access Policy already scoping the app
- [ ] Azure subscription accessible to Zensar engineers with deploy permission
- [ ] Resource groups, Postgres Flexible Server, Key Vault, App Service Plan, App Insights / Log Analytics workspace, Container Registry, Front Door — all provisioned (even if empty) per the [Deployment Architecture](12_Deployment_Architecture_Shell.md)
- [ ] LLM provider chosen, contract signed, API key deposited into Key Vault
- [ ] Shell SSO redirect URIs registered on the OIDC app
- [ ] DNS hostnames and TLS certificates provisioned for prod and non-prod
- [ ] Scorecard taxonomy **drafted** (locked at Day 2 design checkpoint)
- [ ] Three named VMO coordinators identified for UAT
- [ ] One pilot vendor cycle pre-agreed
- [ ] Shell brand colours and email "from" identity confirmed
- [ ] Source code repo created in Shell-owned Azure DevOps; Zensar engineers added as guests
- [ ] Product Owner (Shell VMO), IT Architecture liaison, IT Security liaison, Entra ID admin all named and available daily for the 3 weeks

**If any of the above is not in place on day 1, the timeline must be re-baselined.** The compressed plan assumes Shell-side mobilisation has happened in parallel during contract negotiation.

---

## 3. Week 1 — Foundations, Migration & Design Alignment (Days 1–5)

### Goal

By end of Friday week 1: a non-prod environment serving an authenticated user, with Postgres, Key Vault, Graph integration (app-only), Gmail/Forms code paths completely removed, **and the design fully aligned with Shell expectations** — so week 2 builds the right thing, not the assumed thing.

### Why design alignment matters in Week 1

The POC and the docs in this pack reflect Zensar's assumptions about how Shell wants the product to behave. Some of those assumptions **will be wrong**. Examples of common late-binding decisions enterprise clients raise on contact with reality:

- **"We want the scorecard as an Excel file we email out, not an in-app form"** (worked example in [§3.7](#37-worked-example--scorecard-as-an-excel-attachment))
- "Vendor briefs need to be in PowerPoint, not Markdown/HTML"
- "Minutes should land in SharePoint as Word docs, not just be emailed"
- "We need our existing vendor master from SAP / Ariba, not a CSV import"
- "Approvals should route through Power Automate / our existing workflow tool"
- "Scorecard categories are different from what was discussed"
- "External vendors should never see Shell-hosted forms; only Outlook"
- "Action items need to land in Azure DevOps / ServiceNow / Planner"
- "We need German / French / Dutch language support"
- "VMO Coordinators should sign in via privileged-access workstation only"

A 21-week plan absorbs these as Phase 0–1 conversations. **A 3-week plan must surface them by end of Day 2** so the rest of the week can pivot. That is the explicit purpose of the design-alignment checkpoint below.

### 3.1 Daily breakdown

#### Day 1 — Monday

**Morning kick-off (joint, 90 min)**
- Walk through this pack with Shell stakeholders end-to-end
- Confirm day-zero prerequisites (§2) — any gaps flagged immediately
- **Preview the design-alignment topics** (§3.2 below) so Shell stakeholders come to Day 2 with answers, not surprise
- Lock the 10 architectural decisions from [§02 ADR table](02_Solution_Architecture_Shell.md#8-architectural-decisions-log-adrs)
- Agree daily standup time and steering cadence

**Engineering (afternoon)**
- Branch `shell-prod` from POC `main`
- Run `git filter-repo` on the new repo to scrub POC secrets from history (per [§07 cutover](07_Gmail_to_Outlook_Migration_Plan.md#8-cutover-plan))
- Rotate every POC secret with the relevant provider
- Push cleaned branch to Shell's Azure DevOps repo
- Wire CI: lint + typecheck + unit tests on every push

**Pre-read for Day 2 sent to Shell stakeholders by EoD:**
- This document's §3.2 (design alignment topics) as a 1-page agenda

**Deliverable by EoD:** Clean `shell-prod` branch in Shell's repo; CI runs green; Day-2 design checkpoint agenda issued.

---

#### Day 2 — Tuesday

**Morning — engineering (parallel with afternoon design checkpoint)**
- Migrate database layer from SQLite to PostgreSQL (`asyncpg`, `gen_random_uuid` defaults, JSONB columns)
- Generate initial Alembic migration for the 15 core tables
- Wire `pydantic-settings` + `azure-identity` + Key Vault SDK so secrets resolve via managed identity
- Remove all Google/Gmail references from frontend code

**Afternoon — Design alignment checkpoint (joint, ~2 hours, blocking)**

This is the **single most important meeting of week 1.** Attendees:

- Shell VMO Product Owner
- Shell IT Architecture liaison
- Shell IT Security liaison (drop-in for permission questions)
- Shell Brand / Comms representative (drop-in for email tone / from-identity)
- Zensar Solution Architect, Delivery Manager, Tech Lead

Topics worked through, decision-or-defer recorded for each:

| # | Topic | Default (POC) | What Shell may change to | Default if Shell says nothing |
|---|-------|---------------|---------------------------|-------------------------------|
| DA-01 | **Scorecard collection mechanism** | In-app form (token-link from email) | **Excel attachment via Outlook** / Microsoft Forms / actionable card | In-app form |
| DA-02 | Scorecard taxonomy (4 cats × 16 params) | POC structure | Shell's actual VMO taxonomy | POC structure with parameter labels updated |
| DA-03 | Vendor brief output format | In-app card + email body (Markdown) | PowerPoint deck (`.pptx`) | In-app + email |
| DA-04 | Meeting minutes output | In-app + email | Word doc to SharePoint | In-app + email |
| DA-05 | Action item tracking | In-app `action_items` table | Mirror to Azure DevOps / Planner / ServiceNow | In-app only; export to CSV |
| DA-06 | Vendor master source | CSV import | SAP / Ariba sync | CSV import |
| DA-07 | Approval routing | In-app approval panel | Power Automate / Shell-internal workflow | In-app |
| DA-08 | UI language(s) | English | Multi-language | English |
| DA-09 | Email "from" display name | "VendorPulse — Shell VMO" | Per-cycle organiser display | "VendorPulse — Shell VMO" |
| DA-10 | External (vendor) attendee handling | Same as internal | Email-only; no portal access | Same as internal |
| DA-11 | Audit retention | 90d hot / 3y cold | Shell records-policy override | 90d / 3y |
| DA-12 | Scorecard data classification | "Confidential" | Higher (e.g. requires field-level encryption) | "Confidential" |

For each topic the outcome is one of:

- **CONFIRM** — proceed as default, no change
- **CHANGE — IN-SCOPE** — change accepted into the 3-week plan; assess where to absorb the cost
- **CHANGE — DEFERRED** — accepted as a real requirement but pushed to warranty / Phase 2; default behaviour stands for first release
- **NEEDS RESEARCH** — owner takes away with a 24h hard deadline (recorded as Day 3 risk)

**Output of the checkpoint:**
- A single signed-off **Design Decision Log** committed to the repo (`docs/updated/13_Design_Decisions.md` — created end-of-day Day 2)
- Updated workstream plan for days 3–10 reflecting any IN-SCOPE changes
- Any DEFERRED items added to the Phase 2 backlog
- Risk register updated

**Engineering (late afternoon — based on checkpoint outcome)**
- Adjust week 2 plan
- Issue updated daily plan for days 3–5
- Spike out any IN-SCOPE change immediately to validate effort estimates

**Deliverable by EoD:** Design Decision Log committed; week 2 plan updated and re-circulated; backend connected to Postgres.

---

#### Day 3 — Wednesday

**Authentication (parallel — backend + frontend)**
- Backend: MSAL OIDC flow + session cookie + role middleware
- Backend: `/api/v1/auth/me`, `/api/v1/auth/login`, `/api/v1/auth/callback`, `/api/v1/auth/logout`
- Frontend: `AuthGuard`, `RoleGuard`, redirect-on-401 in axios interceptor
- Entra ID group → app role mapping wired

**Graph integration replacement (parallel — backend)**
- Refactor `GraphService` to MSAL `acquire_token_for_client` with certificate from Key Vault
- All Graph calls use `/users/{organiser-email}/*` (app-only) instead of `/me/*` (delegated)
- Tenacity retry on 429/5xx with `Retry-After` honoured

**Module B path validation (parallel — based on Day 2 decision)**
- If **in-app form** decision: confirm `ScorecardFormService` design from [§05 LLD](05_LLD_Backend_Shell.md#9-scorecardformservice-replaces-google-forms)
- If **Excel attachment** decision: spike out `ExcelScorecardService` (template generator + parser) — see [§3.7](#37-worked-example--scorecard-as-an-excel-attachment) — and validate that openpyxl + Graph mail attachment pattern works end-to-end. **This is a critical spike — failure here means immediate escalation to scope-trim.**
- If another path chosen: spike out the chosen design and validate effort fits week 2 days 6–7

**Deliverable by EoD:** Shell SSO works end-to-end in non-prod; backend successfully acquires Graph app-only token; chosen Module B path validated by a working spike.

---

#### Day 4 — Thursday

**Gmail / Google Forms removal — final pass**
- Delete `gmail_service.py`, `google_forms_service.py`, `google_auth_service.py`, related routes, related env vars
- Remove `google-*` packages from `requirements.in`, regenerate lock
- Replace every agent's email-send path to call `GraphService.send_mail(...)` from the service mailbox

**Hosting bring-up**
- Bicep templates produce non-prod App Service, Front Door, private endpoints — verify against pre-provisioned RG
- CI pipeline pushes container image to ACR and deploys to non-prod App Service slot:staging

**Module B foundations (path-specific)**
- If in-app form: build `scorecard_form_links` table, token issuance, route skeleton
- If Excel attachment: build `scorecard_excel_packets` table, Excel template generator skeleton, attachment parser skeleton
- If other path: equivalent foundations laid

**Deliverable by EoD:** Zero references to Google/Gmail anywhere in the codebase; non-prod App Service running a containerised build of the app; Module B foundations in place for chosen path.

---

#### Day 5 — Friday

**Module A end-to-end against real Graph**
- Real attendee resolution via Graph `/users/{email}`
- Real `findMeetingTimes` with organiser mailbox
- Real `create_event` with Teams meeting URL via `isOnlineMeeting=true`
- Real `sendMail` for attendee refresh email

**Week 1 demo (joint, end of day)**
- Walk Shell through: log in with SSO → create a test cycle → trigger attendee refresh → ranked slots from real Graph data → approve a slot → Teams meeting created → invite sent
- Show the Module B spike result (in-app form sample OR Excel template sample)

**Deliverable by EoD:** One real Shell test mailbox receives a real Teams meeting invite via app-only Graph from VendorPulse, end-to-end in the non-prod environment. **Design Decision Log signed off.** **No further design changes accepted into the 3-week scope after this point.**

### 3.2 Week 1 gate

- [ ] Shell user can sign in via Entra ID
- [ ] Postgres + Alembic working
- [ ] All Gmail/Forms code removed
- [ ] Module A demonstrated end-to-end against real Graph
- [ ] CI/CD pipeline deploying to non-prod automatically
- [ ] **Design Decision Log signed off and committed**
- [ ] **Module B chosen path validated by working spike**

### 3.3 Change-control after Week 1

After end of Day 5, the design surface is **frozen**. Further Shell-side change requests enter one of two paths:

- **Defect** — interpretation: the existing design has a bug or omission. Goes through the defect tracker, P1/P2/P3 triaged.
- **Change request** — interpretation: design works but Shell wants something different. Logged but **deferred to warranty / Phase 2**. Cannot be absorbed into the 3-week window without slipping go-live.

This is a hard line. Honouring it is what makes 3 weeks possible.

### 3.4 Anticipated mid-flight design changes — absorption strategy

For each topic from Day 2 (§3.1 table), if Shell chooses the non-default option, here is how the plan absorbs the change:

| Topic | If Shell chooses non-default | Absorption strategy |
|-------|------------------------------|----------------------|
| **DA-01 Excel scorecard** | **Excel attachment** | Replace days 6–7 in-app-form workstream with Excel template generator + parser. Net effort similar; UX differs. See §3.7. |
| DA-02 Scorecard taxonomy | Different taxonomy | Update `scorecard_taxonomy.json` config and Pydantic enums. Half-day. |
| DA-03 Vendor brief as PowerPoint | PPTX output | Add `python-pptx` template; render after AI generation. One day backend; UI minimal change. **Tight fit — high risk of needing to defer.** |
| DA-04 Minutes to SharePoint | SharePoint Word doc | Add Graph `Sites` API call to upload `.docx` rendered via `python-docx`. One day. Requires `Sites.ReadWrite.All` permission — adds Shell-side approval delay risk. |
| DA-05 Action items mirror | Azure DevOps / Planner sync | **Cannot fit.** Defer to Phase 2. Provide CSV export only in v1. |
| DA-06 SAP / Ariba vendor master | API sync | **Cannot fit.** Defer to Phase 2. Use CSV import for pilot. |
| DA-07 Power Automate approvals | External workflow | **Cannot fit.** Defer to Phase 2. Use in-app approvals for pilot. |
| DA-08 Multi-language | i18n | **Cannot fit.** Defer to Phase 2. English-only for pilot. |
| DA-09 Per-cycle organiser display name | Display config | Half-day backend change to `GraphService.send_mail`. |
| DA-10 Vendor email-only | No-portal | Drop public scorecard form route (if Excel path chosen, this aligns); reduce frontend work slightly. |
| DA-11 Audit retention override | Different period | Config change in observability Bicep + Postgres archive policy. Half-day. |
| DA-12 Field-level encryption on scorecards | Encryption-at-column | **Cannot fit.** Defer to Phase 2. Tenant-level encryption at rest stands for v1. |

The pattern: **single-day changes can fit; multi-day integrations cannot.** Use the day-2 checkpoint to surface and triage, not to renegotiate the timeline.

### 3.5 What we will not pivot on (architectural invariants)

Even if Shell raises these mid-flight, they will not change in the 3-week window:

- **Single-tenant Shell-only deployment** — multi-tenant rework is multi-week
- **Microsoft Graph for all messaging/calendar** — no return to Gmail / no addition of SES, SendGrid, etc.
- **App-only Graph auth with certificate** — no return to delegated-token-in-env-var pattern
- **PostgreSQL** — no swap to SQL Server / Oracle / Cosmos
- **App Service** — no swap to AKS / on-prem / VM-based hosting
- **Entra ID SSO** — no swap to Active Directory Federation Services / SAML-via-PingFederate / SiteMinder
- **The 12-state workflow** — no rollback steps, no parallel branches
- **Human approval gate on every outbound action** — no bypass even for "trusted" content
- **No mobile native app** — web only

These are foundational; changing them is a new engagement, not a defect fix.

### 3.6 Buffer in Week 1

Each engineer has approximately **half a day of unallocated time** built into week 1 specifically to absorb design-change impact. If the Day 2 checkpoint produces only CONFIRM outcomes, that buffer pulls forward into the Module A demo polish. If it produces many CHANGE — IN-SCOPE outcomes, the buffer is consumed by re-planning and the Module B path adjustment.

If buffer is exhausted by Day 4 and there is still significant design uncertainty, the Delivery Manager escalates to steering for a re-baseline conversation. **The plan does not silently slip — it surfaces.**

---

### 3.7 Worked example — Scorecard as an Excel attachment

This is the most common mid-flight design change for enterprise VMO clients and is worth a full worked-out section. If Shell chooses Excel on Day 2, this is exactly what happens.

#### 3.7.1 What changes vs. the default in-app form

| Aspect | Default (in-app form) | Excel attachment path |
|--------|------------------------|------------------------|
| Stakeholder experience | Click email link → SSO or token → fill web form → submit | Open email → download attached Excel → fill in Excel → reply with attached file |
| Data lands by | Direct POST to backend | Graph webhook / polling on reply mailbox; attachment parsed |
| Auth | SSO (internal) or token-link (external) | None on the stakeholder side; trust is mailbox-based |
| Drafts | Autosave to Postgres | Local Excel save by the stakeholder |
| Validation | Server-side at submit | Server-side at parse; rejected attachments trigger a reply with errors |
| Outlier flagging | Same logic post-validation | Same logic post-validation |

#### 3.7.2 Backend changes

Replace `ScorecardFormService` with `ExcelScorecardService`:

```python
# app/services/excel_scorecard_service.py
from openpyxl import Workbook, load_workbook
from openpyxl.styles import PatternFill, Font, Alignment, Protection
from openpyxl.workbook.protection import WorkbookProtection
from openpyxl.worksheet.protection import SheetProtection
from openpyxl.worksheet.datavalidation import DataValidation

class ExcelScorecardService:
    """
    Generates per-stakeholder Excel scorecard workbooks,
    parses returned attachments, validates and persists scores.
    """

    SHEET_NAME = "Scorecard"
    METADATA_SHEET = "_metadata"     # hidden; used to verify origin

    async def generate_workbook(self, db, cycle_id: str, stakeholder_id: str) -> bytes:
        """Returns a workbook as bytes, ready for Graph email attachment."""
        cycle = await cycle_repo.get_with_taxonomy(db, cycle_id)
        stakeholder = await stakeholder_repo.get(db, stakeholder_id)

        wb = Workbook()
        ws = wb.active
        ws.title = self.SHEET_NAME

        # Header block (Shell-themed, locked cells)
        self._write_header(ws, cycle, stakeholder)

        # Scorecard rows — one per parameter, grouped by category
        for row, param in enumerate(cycle.taxonomy.parameters, start=10):
            ws.cell(row=row, column=1, value=param.category_label)
            ws.cell(row=row, column=2, value=param.label)
            ws.cell(row=row, column=3, value=param.description)
            # Score column with 1–5 data validation
            score_cell = ws.cell(row=row, column=4)
            score_cell.value = None
            score_cell.protection = Protection(locked=False)   # editable
            ws.add_data_validation(
                DataValidation(type="whole", operator="between",
                               formula1=1, formula2=5,
                               errorTitle="Invalid score",
                               error="Score must be 1, 2, 3, 4, or 5")
            )
            # Comment column
            comment_cell = ws.cell(row=row, column=5)
            comment_cell.protection = Protection(locked=False)

        # Metadata sheet (hidden) — embeds cycle_id, stakeholder_id, signed token
        self._write_metadata(wb, cycle_id, stakeholder_id)

        # Lock the structure; allow only edits to score + comment columns
        ws.protection = SheetProtection(sheet=True, selectLockedCells=False,
                                         selectUnlockedCells=True)
        ws.protection.password = self._sheet_password()

        # Save and return bytes
        import io
        bio = io.BytesIO()
        wb.save(bio)
        return bio.getvalue()

    async def issue_packet(self, db, cycle_id: str, stakeholder_id: str) -> ExcelPacket:
        """Record packet issuance for tracking and replay-protection."""
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        packet = ScorecardExcelPacket(
            cycle_id=cycle_id,
            stakeholder_id=stakeholder_id,
            token_hash=token_hash,
            issued_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(days=14),
            status="ISSUED",
        )
        db.add(packet)
        await db.flush()
        return packet, token

    async def parse_returned_workbook(self, db, attachment_bytes: bytes,
                                       sender_email: str) -> ParseResult:
        """Parse an attachment that arrived in the service mailbox."""
        wb = load_workbook(io.BytesIO(attachment_bytes), data_only=True)
        if self.METADATA_SHEET not in wb.sheetnames:
            return ParseResult(error="Attachment not recognised as a VendorPulse scorecard")
        cycle_id, stakeholder_id, signed_token = self._read_metadata(wb)

        # Verify signed token (HMAC against Key Vault secret)
        if not self._verify_token(signed_token, cycle_id, stakeholder_id):
            return ParseResult(error="Scorecard token invalid or tampered")

        # Verify sender matches stakeholder of record
        stakeholder = await stakeholder_repo.get(db, stakeholder_id)
        if stakeholder.email.lower() != sender_email.lower():
            return ParseResult(error="Scorecard sender does not match expected stakeholder")

        # Verify packet not already used
        packet = await scorecard_packet_repo.get_by_cycle_stakeholder(db, cycle_id, stakeholder_id)
        if packet.status == "PARSED":
            return ParseResult(error="A scorecard has already been parsed for this stakeholder")

        # Extract scores
        ws = wb[self.SHEET_NAME]
        scores: dict[str, int] = {}
        comments: dict[str, str] = {}
        errors: list[str] = []
        for row in range(10, 10 + len(cycle.taxonomy.parameters)):
            param_label = ws.cell(row=row, column=2).value
            score_value = ws.cell(row=row, column=4).value
            comment_value = ws.cell(row=row, column=5).value
            param = cycle.taxonomy.parameter_by_label(param_label)
            if score_value is None:
                errors.append(f"{param_label}: missing score")
                continue
            if not (isinstance(score_value, int) and 1 <= score_value <= 5):
                errors.append(f"{param_label}: score must be 1–5")
                continue
            if score_value in (1, 5) and not (comment_value and str(comment_value).strip()):
                errors.append(f"{param_label}: comment required for score {score_value}")
                continue
            scores[param.code] = score_value
            if comment_value:
                comments[param.code] = str(comment_value).strip()

        return ParseResult(
            cycle_id=cycle_id,
            stakeholder_id=stakeholder_id,
            scores=scores,
            comments=comments,
            errors=errors,
        )

    async def ingest(self, db, parse_result: ParseResult) -> None:
        """Persist parsed scorecard to scorecards table."""
        # ... call ValidationService, persist Scorecard rows, mark packet PARSED
```

#### 3.7.3 Mail reply ingestion

A scheduled job (every 5 minutes) polls the service mailbox for unread replies bearing `.xlsx` attachments:

```python
# app/services/mail_poller.py
class ScorecardReplyPoller:
    INTERVAL_MIN = 5

    async def poll(self, db):
        """Look for new replies to scorecard request emails."""
        # Graph: GET /users/{svc-mailbox}/messages?$filter=isRead eq false
        # and hasAttachments eq true
        messages = await graph.list_unread_with_attachments(
            mailbox=settings.graph_service_mailbox
        )
        for msg in messages:
            for attachment in msg["attachments"]:
                if not attachment["name"].lower().endswith(".xlsx"):
                    continue
                content = await graph.download_attachment(
                    mailbox=settings.graph_service_mailbox,
                    message_id=msg["id"],
                    attachment_id=attachment["id"],
                )
                result = await excel_scorecard_service.parse_returned_workbook(
                    db, content, sender_email=msg["from"]["emailAddress"]["address"]
                )
                if result.error:
                    # Auto-reply with errors
                    await graph.send_mail(
                        from_mailbox=settings.graph_service_mailbox,
                        to=[msg["from"]["emailAddress"]["address"]],
                        subject=f"Re: {msg['subject']} — please review",
                        body=f"We could not accept your scorecard:\n\n{result.error}\n\nPlease correct and reply again.",
                    )
                elif result.errors:
                    # Auto-reply with per-field errors
                    await graph.send_mail(...)
                else:
                    await excel_scorecard_service.ingest(db, result)

            # Mark message as read so we don't reprocess
            await graph.mark_read(settings.graph_service_mailbox, msg["id"])
```

#### 3.7.4 Additional Graph permissions required

| Permission | Why | Risk added |
|------------|-----|------------|
| `Mail.Read` (Application, mailbox-scoped to service mailbox) | Poll for stakeholder replies | Low — restricted by Application Access Policy to one mailbox |
| `Mail.ReadWrite` | Mark messages as read post-processing | Low — same constraint |

These must be added to the Entra ID app registration **on Day 2 evening** if the Excel path is chosen. Shell admin consent is the long-lead item; it must complete within 24–48 hours or week 2 cannot start. Plan accordingly.

#### 3.7.5 Frontend changes

- **Remove** the `/scorecard/:linkToken` public route (no longer needed)
- **Keep** the `SubmissionTracker` — reads now show: `Issued → Sent → Replied → Parsed → Rejected (with reason)`
- **Add** an "Excel attachment preview" panel in admin (download a sample workbook to sanity-check formatting)
- **Add** to the dispatch panel: "Resend Excel" action for stakeholders who replied with errors

#### 3.7.6 Data model deltas

```sql
-- Replace scorecard_form_links with:
CREATE TABLE scorecard_excel_packets (
    packet_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id         UUID NOT NULL REFERENCES governance_cycles(cycle_id),
    stakeholder_id   UUID NOT NULL REFERENCES stakeholders(stakeholder_id),
    token_hash       TEXT NOT NULL,
    issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at          TIMESTAMPTZ,
    expires_at       TIMESTAMPTZ NOT NULL,
    received_at      TIMESTAMPTZ,           -- when reply arrived
    parsed_at        TIMESTAMPTZ,           -- when successfully ingested
    status           TEXT NOT NULL DEFAULT 'ISSUED'   -- ISSUED | SENT | REPLIED | PARSED | REJECTED
                        CHECK(status IN ('ISSUED','SENT','REPLIED','PARSED','REJECTED')),
    last_error       TEXT,
    UNIQUE(cycle_id, stakeholder_id)
);
```

#### 3.7.7 Operational considerations

- **Old Excel versions**: Workbooks generated by `openpyxl` 3.x in `.xlsx` format are compatible with Excel 2010+. Shell's Microsoft 365 estate is fine. **`.xls` legacy format is not supported.**
- **Mobile reply**: Stakeholders replying from Outlook mobile sometimes auto-strip attachments. Mitigation: the request email body includes plain-text instructions and a fallback contact for VMO.
- **Stakeholder modifies cell structure**: The workbook is structurally protected (`SheetProtection` + password); modifications to header rows are rejected at parse.
- **Multi-recipient reply ("Reply All")**: Reply lands in the service mailbox plus other recipients' inboxes; our poller only sees the copy in the service mailbox, which is correct.
- **Spam folder**: If the request email lands in spam at the recipient end, the reply never happens. Operational mitigation: the SubmissionTracker shows the issued/sent state and the VMO coordinator can resend.
- **`agent_runs` audit** — Excel generation does not call the LLM at all; the agent's role is generating the personalised email body. The Excel template generator is deterministic.

#### 3.7.8 Effort and timeline impact

| Day | Original (in-app form) work | If Excel path chosen |
|-----|------------------------------|----------------------|
| Day 3 spike | `ScorecardFormService` shape | `ExcelScorecardService` spike — generate sample, parse sample, round-trip via Graph |
| Day 4 | `scorecard_form_links` table + route skeleton | `scorecard_excel_packets` table + Excel template skeleton + poller skeleton |
| Day 6 | Frontend form page + autosave | Excel template polish + Graph poller wiring |
| Day 7 | Token validation + form submission flow | Reply parsing + validation + auto-error-reply |
| Day 8 | (same — Modules C/D/E/F) | (same) |

Net-net: roughly the same number of engineer-days; the workload moves from frontend-heavy (in-app form) to backend-heavy (Excel + poller). **If frontend engineers are otherwise idle during the Module B days, this is a workload-balance loss.** The Tech Lead reassigns one frontend engineer to admin module polish and accessibility testing in this scenario.

---

## 4. Week 2 — Functional completion (Days 6–10)

### Goal

By end of Friday week 2: all six agents (A–F) functional, scorecard collection working in whichever mode Shell chose on Day 2, Shell-themed UI and email templates, and admin module complete. **Code is feature-frozen by Friday EoD.**

### 4.1 Daily breakdown

#### Day 6 — Monday

**Module B — heaviest single feature, path per Day-2 decision**

- **If in-app form path:** `ScorecardFormService` complete; public route working; frontend form rendering with autosave
- **If Excel attachment path:** `ExcelScorecardService` complete; Graph poller running on schedule; admin preview working
- **If other path:** equivalent work

**Deliverable by EoD:** Module B core flow exercised end-to-end with a sample stakeholder.

#### Day 7 — Tuesday

**Module B — completion**
- Validation (server-side range check, comment-required for 1/5)
- Reminder cadence wired (`REMINDER_1`, `REMINDER_2`, `ESCALATION` via Graph `sendMail`)
- `SubmissionTracker` reading directly from `scorecards` / status table
- End-to-end test: dispatch via Graph → stakeholder action → score lands in DB → tracker updates

**Modules C / D / F — port from POC**
- Mostly unchanged from POC; verify against Postgres + new agent base class
- Add audit writes (`external_calls` rows) on every LLM call

**Deliverable by EoD:** Modules B, C, D, F functional in non-prod.

#### Day 8 — Wednesday

**Module E — Meeting**
- Live note capture (unchanged from POC)
- Transcript paste → AI classification (unchanged from POC)
- Minutes generation (unchanged from POC)
- Minutes distribution via Graph `sendMail` — coordinator-approved, internal recipients only
- Email template (HTML) optimised for Outlook desktop / OWA / mobile

**Shell email templates — Outlook-friendly redesign**
- Table-based layouts (no CSS grid / flex)
- Solid Shell-tone backgrounds (no `linear-gradient`)
- Inline-styled fonts (no web-font loading)
- Plain-text fallbacks
- All template types: scorecard request, reminder ×2, invite, minutes (and reply-with-errors if Excel path)

**Deliverable by EoD:** Module E end-to-end; emails render acceptably in Outlook desktop, OWA, mobile.

#### Day 9 — Thursday

**Admin module**
- Vendor master CRUD
- User-role view (read-only sync from Entra ID)
- LLM budget panel
- Audit log viewer (`agent_runs`, `external_calls`, `security_events`; CSV export with audit trail)
- System health panel
- (If Excel path) Excel attachment preview / replay tool

**Shell branding**
- Tailwind v4 tokens updated with Shell brand colours
- Header / footer Shell wordmark
- Toast styling Shell-tone

**Deliverable by EoD:** Admin module functional; UI visibly Shell-branded.

#### Day 10 — Friday

**Hardening pass**
- Cycle-wide token budget enforcement
- Tenant-wide daily budget alerts
- Rate-limit middleware (`slowapi`)
- Error handler middleware mapping to user-friendly messages
- Correlation-ID propagation through to App Insights

**End-of-week-2 demo + code freeze**
- Full cycle demonstration: CYCLE_CREATED → ARCHIVED with all 12 states and all 6 agents, using Shell's chosen scorecard mechanism
- Code freeze declared for feature work; only defect fixes from Monday onwards

**Deliverable by EoD:** Feature-complete, demoable end-to-end on non-prod against real Shell test mailboxes.

### 4.2 Week 2 gate

- [ ] All 6 agents functional in non-prod
- [ ] Scorecard collection working in chosen mode (in-app form OR Excel OR other)
- [ ] Email rendering verified across Outlook desktop, OWA, mobile
- [ ] Admin module complete
- [ ] Shell visual identity applied
- [ ] Code feature-frozen

---

## 5. Week 3 — Hardening, UAT, Pilot Go-Live (Days 11–15)

### Goal

By end of Friday week 3: production environment live, one real Shell vendor cycle running, coordinators using the system, handover documents produced. Defect-fix warranty begins on Monday of week 4.

### 5.1 Daily breakdown

#### Day 11 — Monday

**UAT kick-off (3 named Shell VMO coordinators)**
- 60-min walkthrough session led by Zensar Tech Lead
- Coordinators access non-prod with their real Shell SSO
- Each coordinator runs a simulated cycle from a test vendor

**Defect intake**
- All findings logged in a single tracker (severity P1/P2/P3)
- Triage every 4 hours during week 3
- P1 fixes deployed same-day; P2 next business day; P3 deferred to warranty

**Parallel: Security review (Shell IT Security)**
- Shell reviews Graph permissions (including any added on Day 2 for the chosen scorecard path), Application Access Policy, RBAC mappings
- Permissions sanity check on Postgres roles, Key Vault access, ACR pull

**Deliverable by EoD:** First defect list captured; security review checkpoint scheduled for day 13.

#### Day 12 — Tuesday

**Defect fixes + UAT day 2**
- P1 fixes deployed; coordinators verify
- Coordinators progress further into their simulated cycles
- Module E (meeting / minutes) typically exposed today

**Observability finalisation**
- Operator workbook live in Shell's App Insights workspace
- Coordinator-facing health panel wired
- Alert rules configured: app down, agent failure rate, Graph auth failure, LLM budget thresholds
- (If Excel path) Mail poller health alert configured

**Runbook draft v0.9**
- Daily-ops checklist
- P1/P2/P3 response procedures
- Common-symptom → first-look location reference from [§10](10_Expected_Errors_and_Considerations.md#10-operational-runbook-quick-reference)

**Deliverable by EoD:** UAT mid-point review; all P1 defects from day 11 closed.

#### Day 13 — Wednesday

**Production environment provisioning**
- Deploy Bicep to prod resource group
- Apply `alembic upgrade head` against fresh prod Postgres
- Smoke test prod infrastructure

**UAT defect fixes continue**
- P2 defects from days 11–12 deployed in afternoon batch
- Coordinators finish their simulated cycles

**Security review checkpoint (Shell IT Security)**
- Walk Shell IT Security through final Graph permission scopes
- Walk through Audit log (`agent_runs`, `external_calls`, `security_events`)
- Sign-off for production go-live

**Pre-flight for go-live**
- Final image built and tagged `prod-<date>-<sha>`
- Image deployed to prod App Service slot:staging
- Smoke tests against staging slot

**Deliverable by EoD:** UAT complete; security review signed off; production environment ready for cutover.

#### Day 14 — Thursday

**Production cutover**
- CAB ticket approved (pre-filed days earlier with full deployment runbook attached)
- DNS cutover — Shell DNS → Front Door endpoint
- Slot swap: prod slot:staging → slot:production (zero-downtime, atomic)
- 60-min observation window: error rate, agent failure rate, Graph auth success
- Sanity check: Zensar engineer logs in via Shell SSO, creates throwaway test cycle, archives — verifies prod is fully functional

**Pilot cycle kick-off**
- Lead Shell VMO coordinator initiates the agreed pilot vendor cycle
- Zensar Tech Lead pair-shadows the coordinator for the first few actions
- App Insights monitored live throughout the day
- End-of-day check: cycle in `ATTENDEE_REFRESH_SENT` state; Module A working as expected

**Deliverable by EoD:** Production live; first real Shell vendor cycle in flight.

#### Day 15 — Friday

**Pilot cycle progression**
- Coordinator drives the cycle through Module A → Module B
- Real Shell stakeholders receive scorecard requests in the chosen mode (link or Excel)
- Zensar engineer on standby for any production support issues

**Handover artefacts finalised**
- Runbook v1.0 finalised and walked through with Shell IT Ops
- Architecture decision log finalised (includes the Day 2 Design Decision Log)
- Pack v2.x docs committed to Shell's docs repository
- On-call escalation handoff

**Coordinator training session #1 (90 min)**
- Walk through the workflow tabs
- Approval gate behaviour
- Reading the admin / audit panels
- Troubleshooting common issues
- Recording captured

**End-of-week-3 retrospective**
- Joint Shell + Zensar retro
- Lessons-learned document committed
- Defect warranty period starts Monday of week 4

**Deliverable by EoD:** Production handed over; pilot cycle running; documentation complete; training delivered.

### 5.2 Week 3 gate (engagement-complete gate)

- [ ] Production environment live in Shell's Azure
- [ ] Pilot vendor cycle progressing without P1 issues
- [ ] All P1 / P2 UAT defects closed
- [ ] Coordinator training delivered and recorded
- [ ] Runbook v1.0 signed off by Shell IT Ops
- [ ] Defect warranty period agreed
- [ ] Lessons-learned document captured
- [ ] Design Decision Log committed alongside other handover docs

---

## 6. Workstream view (across the three weeks)

```
Workstream                  Week 1       Week 2       Week 3
─────────────────────       ──────────   ──────────   ──────────
Foundations / IaC           ████████░░   ░░░░░░░░░░   ░░░░░░░░░░
Design alignment            ░░██░░░░░░   ░░░░░░░░░░   ░░░░░░░░░░
Auth / SSO                  ░░██████░░   ░░░░░░░░░░   ░░░░░░░░░░
Graph integration           ░░░░██████   ██░░░░░░░░   ░░░░░░░░░░
Gmail/Forms removal         ████████░░   ░░░░░░░░░░   ░░░░░░░░░░
Module A                    ░░░░░░████   ██░░░░░░░░   ░░░░░░░░░░
Module B (chosen path)      ░░░░░░██░░   ████████░░   ░░░░░░░░░░
Modules C/D/E/F             ░░░░░░░░░░   ░░██████░░   ░░░░░░░░░░
Admin module                ░░░░░░░░░░   ░░░░░░████   ░░░░░░░░░░
Shell branding              ░░░░░░░░░░   ░░░░░░████   ██░░░░░░░░
Outlook email templates     ░░░░░░░░░░   ░░░░████░░   ░░░░░░░░░░
Observability               ░░░░░░░░██   ██░░░░░░░░   ████░░░░░░
UAT                         ░░░░░░░░░░   ░░░░░░░░░░   ████████░░
Defect fixes                ░░░░░░░░░░   ░░░░░░░░░░   ██████░░░░
Production deployment       ░░░░░░░░░░   ░░░░░░░░░░   ░░░░████░░
Pilot cycle                 ░░░░░░░░░░   ░░░░░░░░░░   ░░░░░░████
Handover / training         ░░░░░░░░░░   ░░░░░░░░░░   ░░░░░░░░██
```

---

## 7. Resourcing (Zensar)

| Role | Allocation | Notes |
|------|-----------|-------|
| Delivery Manager | 100% | Daily standup, defect triage, Shell-side coordination, Design Decision Log owner |
| Solution Architect | 100% | Architecture review, security liaison, design checkpoint co-chair |
| Tech Lead | 100% | Engineering decisions, code-review gatekeeper |
| Backend Engineer × 2 | 100% | Implementation |
| Frontend Engineer × 2 | 100% | Implementation (one may shift to admin module polish if Excel path absorbs frontend Module B work) |
| QA Engineer | 100% | Cross-browser, a11y, regression |
| DevOps / Cloud Engineer | 100% | Bicep, CI/CD, observability, cutover |

The compressed plan **assumes no PTO** during the 3 weeks across all roles. Any PTO must be pre-declared and re-baselined into the plan.

---

## 8. Critical path

```
Day-zero prerequisites
   │ (Shell — must be complete before kick-off)
   ▼
Day 1 — Branch + scrub + design topics issued
   ▼
Day 2 — Design alignment checkpoint LOCKED
   │ (single biggest scope-shaping moment)
   ▼
Day 3 — SSO + Graph app-only working + Module B path spiked
   │ (single biggest external-dependency moment)
   ▼
Day 5 — Module A end-to-end; design frozen
   ▼
Day 8 — Module B (chosen path) + Outlook email templates
   ▼
Day 10 — Code freeze
   ▼
Day 13 — Production environment ready + security sign-off
   ▼
Day 14 — Cutover + pilot cycle starts
   ▼
Day 15 — Handover
```

**Two biggest at-risk transitions:**

1. **Day 2 design checkpoint** — if Shell does not show up with answers, the rest of the plan starts on a guess. Mitigation: Day-1 pre-read so Shell stakeholders arrive prepared.
2. **Day 3 Graph app-only auth** — if not working by Wednesday week 1, the rest slips. Mitigation: full Entra ID admin consent pre-granted as day-zero prerequisite.

---

## 9. Deferred from the 3-week scope

To make this fit, the following are explicitly deferred to a warranty / Phase 2 engagement:

- Performance / load testing at scale (smoke + light functional only)
- Full security pen-test by a third party (Shell internal review only)
- Formal accessibility audit (axe-core automated only)
- Multi-vendor parallel onboarding (pilot is one vendor)
- VPN / mobile / BYOD compatibility testing (standard Shell desktop only)
- Disaster recovery drill (documented but not exercised)
- CMK (customer-managed keys) for encryption at rest
- Cross-region DR setup (single-region only)
- Training for the remaining coordinator population beyond the 3 pilot users
- SAP / Ariba / Coupa vendor master integration
- Teams meeting transcript ingestion
- Power Automate / external workflow tool integration
- Multi-language UI
- Mobile native app
- Embedded help / in-app tutorials
- AI-assisted contract analysis

If Shell needs any of these in the first release, the 3-week plan must be extended.

---

## 10. Risks specific to the compressed timeline

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| C-01 | Day-zero prerequisites slip | High | Critical | Shell-side pre-mobilisation 4–6 weeks ahead; daily prereq check by Zensar Solution Architect |
| C-02 | Single major defect in UAT pushes cutover past day 14 | Medium | High | Strict P1/P2 triage; any major architectural defect by day 12 forces a re-baseline conversation, not a heroic crunch |
| C-03 | First-release prompt-tuning quality issues | Medium | Medium | Accept POC-quality refined for Shell terminology; further tuning during warranty |
| C-04 | Coordinator UAT feedback exposes UX gaps | Medium | Medium | UX findings deferred to warranty unless usability-blocking; invest in week-2 Module B polish |
| C-05 | Outlook email rendering issues late | Medium | Medium | Litmus testing built into day 8; fallback to simpler HTML if needed |
| C-06 | Shell IT Security raises a late permission objection | Low | High | Day-11 explicit security checkpoint; brief IT Security during day-zero prereq, not day 11 |
| C-07 | Zensar team member unplanned absence | Medium | High | Cross-training; pair on critical-path work |
| C-08 | LLM quality regression | Low | Medium | SDK pinned; no model upgrades during delivery; provider abstraction supports swap |
| C-09 | Late Alembic migration not backwards-compatible | Low | Medium | Code freeze on day 10 includes schema freeze; only additive migrations after |
| C-10 | DNS / TLS cutover fails on day 14 | Low | High | Provisioning a week-1 day-zero prereq; cutover dry-run on day 13 |
| **C-11** | **Day-2 design checkpoint produces too many IN-SCOPE changes — week 1 buffer exhausted** | **Medium** | **High** | **DM triggers steering-committee re-baseline conversation on Day 3 morning if buffer is overrun** |
| **C-12** | **Late discovery during Module B build that the spike was misleading** (e.g. Excel mailbox-policy quirk blocks reply ingestion) | **Medium** | **High** | **Day-3 spike must validate end-to-end round-trip, not just code shape; if spike fails, fall back to default in-app form same-day** |
| **C-13** | **Shell post-Day-5 changes their mind on a Day-2 decision** | **Medium** | **Critical** | **Design frozen by Day 5 EoD; post-freeze changes go to defect/warranty paths per §3.3 — DM enforces** |

---

## 11. Steering cadence (compressed)

| Cadence | Audience | Agenda |
|---------|----------|--------|
| **Day-1 kick-off** (90 min) | All | Walkthrough, prereq confirm, Day-2 agenda issued |
| **Day-2 design checkpoint** (~2 hr) | Joint inc. IT Sec + Brand | DA-01..DA-12 each decided or deferred |
| **Daily 9:00 standup** (15 min) | Joint team | Yesterday / today / blockers |
| **Daily 13:00 defect triage** (20 min, week 3 only) | Joint team | P1/P2 review |
| **End-of-week demo + steering** (60 min, Fridays) | Sponsor + PMO + Zensar DM/SA | Demo, gate review, risks |
| **Day-13 security sign-off** (45 min) | Shell IT Sec + Zensar SA | Permissions, audit posture, go/no-go |
| **Day-14 CAB approval** | Shell CAB + Zensar DM | Change ticket; runbook walkthrough |
| **End-of-engagement retro** (90 min, Friday week 3) | Joint | Lessons learned |

---

## 12. Definition of "done" for the 3-week engagement

The engagement is complete when **all** of the following hold:

- [ ] Production environment live in Shell's Azure subscription
- [ ] One pilot vendor cycle actively running in production
- [ ] All P1 defects closed; P2 defects with workaround or scheduled fix
- [ ] Pilot coordinators trained; training recorded
- [ ] Runbook v1.0 handed to Shell IT Ops
- [ ] Architecture / decision-log / docs (incl. Design Decision Log from Day 2) committed to Shell's docs repository
- [ ] Defect warranty period dates set (typically 4 weeks)
- [ ] Lessons-learned document captured

---

## 13. After the 3 weeks

**Defect warranty (weeks 4–7):**
- Zensar fixes P1/P2 defects discovered in production
- Light-touch support; not a full operate-and-maintain contract
- Shell IT Ops handles BAU; Zensar on escalation

**Phase 2 candidates** (separate engagement, scoped after warranty period) include any DEFERRED items from the Day-2 Design Decision Log plus the standard list (multi-vendor onboarding, performance testing, third-party pen-test, CMK, cross-region DR, SAP/Ariba integration, Teams transcript ingestion, MS Forms or in-app form alternative if Excel chosen first, multi-language UI, mobile native app, AI-assisted contract analysis, self-service form designer).

Shell can request any of these as follow-on work. None require re-architecting the v1 product.

---

*Productionization Roadmap (3-week compressed, design-change-aware) — Zensar VendorPulse for Shell — 2026-06-03.*
