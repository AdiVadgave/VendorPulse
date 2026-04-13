# Module A — Scheduling: Slot Ranking & Recommendation Box

This document explains exactly how the scheduling module ranks meeting slots, what the "Attending / Coverage / Conflicts" stat tabs on a `SlotCard` mean, and — importantly — **whether the conflicts tab is even reachable given how Microsoft Graph actually behaves**. Written as groundwork for redesigning the recommendation box.

---

## 1. Two ranking paths (don't confuse them)

VendorPulse has **two** separate ranking implementations. They live in different files and produce the same `SlotProposal` shape, but they compute scores very differently.

| Path | File | Used when |
|---|---|---|
| **Deterministic ranker** | `app/services/slot_ranking_service.py` | Legacy / mock flow — enumerates candidate slots inside business hours and cross-references the in-repo availability store (no Graph). |
| **Graph-based ranker** | `app/api/routes/graph_scheduling.py` (inline, inside `find_meeting_times_graph`) | Real flow — delegates slot *discovery* to Microsoft Graph `findMeetingTimes`, then assigns a rank score to each suggestion it gets back. **This is what the sample log shows.** |

Everything below about the "Attending / Coverage / Conflict" UI tabs applies to the Graph-based ranker, which is the one the frontend uses today.

---

## 2. How Graph's `findMeetingTimes` actually behaves

This is the key fact that changes how you should think about the recommendation box.

Graph's `findMeetingTimes` is **not** "give me every slot in the window and I'll show conflicts". It is **"find me slots where everyone is available, ranked by my confidence"**. Specifically, with the parameters we use:

```python
body = {
    "attendees": [...],                       # required
    "isOrganizerOptional": False,             # organiser must be free (hard constraint)
    "timeConstraint": { "activityDomain": "unrestricted", ... },
    "meetingDuration": "PT1H",
    "maxCandidates": 10,
    "returnSuggestionReasons": true,
    "minimumAttendeePercentage": 100,          # <--- this is load-bearing
}
```

Because `minimumAttendeePercentage` is effectively 100 (we don't override it — Graph defaults to "all attendees free"), every suggestion Graph returns **is already a "100% coverage" slot**. Each attendee's availability inside that slot will be `free`, `tentative`, or occasionally `busy`/`oof`/`workingElsewhere` — but never a truly hard conflict on a required attendee, because Graph wouldn't have surfaced the slot otherwise.

Your sample log confirms this:

```
suggestions=8 … filtered_conflicts=0
```

8 suggestions came back, **0 were filtered out as conflicts**. Every availability entry is either `free` or `tentative` — no `busy`, no `oof`. The `conflict_names` array is empty in every slot.

> **Takeaway:** In the Graph-powered flow, the "Conflicts" tab is almost always `0`. It is only non-zero in edge cases (see §5).

---

## 3. The rank score formula (Graph path)

Once Graph returns N suggestions, the backend loops over them and builds a `SlotProposal` per suggestion. The score is derived from two signals only:

### Signal 1 — Graph's own confidence score

Graph attaches a numeric `confidence` (0–100) or a textual `confidenceLevel` (`high`/`medium`/`low`) to each suggestion. The sample log shows `confidence: 100.0` for every slot.

We map that to a base score using three configurable bands (read from `.env`):

| Graph confidence | Base score | Setting |
|---|---|---|
| ≥ 90 (or "high")    | **100** | `scheduling_confidence_high_score` |
| 70–89 (or "medium") | 80      | `scheduling_confidence_medium_score` |
| < 70 (or "low")     | 60      | `scheduling_confidence_low_score` |
| Missing/unknown     | 60      | falls back to low |

This is `_base_score_from_confidence()` in `graph_scheduling.py`.

### Signal 2 — Tentative penalty

For each attendee whose status is `tentative` in the slot, we subtract 15 points (`scheduling_tentative_penalty`). This is the only way two "100% confidence" slots can differ in score.

### Final formula

```
rank_score = clamp(
    base_score - (tentative_count × 15),
    0, 100
)
```

Applied to your sample:

| Slot | Graph confidence | Free | Tentative | Base | Penalty | Final |
|---|---|---|---|---|---|---|
| 2026-04-17 12:00 IST | 100 | 8/8 | 0 | 100 | 0  | **100** |
| 2026-04-21 13:00 IST | 100 | 7/8 | 1 (v.kulkarni3) | 100 | 15 | **85** |
| 2026-04-22 13:00 IST | 100 | 7/8 | 1 (hrushikesh)  | 100 | 15 | **85** |

Slots are then sorted by `-rank_score, proposed_time` and assigned ranks (1st Choice, 2nd Choice, 3rd Choice) in the UI.

---

## 4. What the three stat tabs on `SlotCard` actually show

Source: `frontend/src/components/modules/scheduling/SlotCard.tsx:179-199`

```
┌────────────┬────────────┬────────────┐
│ Attending  │ Coverage   │ Conflicts  │
│  8/8       │  100%      │  0         │
└────────────┴────────────┴────────────┘
```

### Attending — `slot.attendance_count / slot.total_attendees`

- `attendance_count = len(attending) + len(tentative)` — **includes tentatives**
- `total_attendees = len(attendee_emails)` — the full required-attendee list for the cycle

So "Attending 7/8" with 1 tentative is counted as 7 attending. Tentatives are surfaced separately as amber chips in the attendee chip grid below the stats.

### Coverage — `attendance_count / total_attendees × 100`

Just the percentage form of Attending. In the Graph flow this is almost always 100% because Graph pre-filters for that.

### Conflicts — `slot.conflict_count`

Number of required attendees whose status is `busy`, `oof`, `workingElsewhere`, or `unknown`. The code also deletes the whole slot if `conflict_names` is non-empty (`graph_scheduling.py:531-533`):

```python
if conflict_names:
    filtered_conflicts += 1
    continue
```

In other words: **a slot with conflicts is dropped entirely before it reaches the frontend**. So the "Conflicts" number on any card the user sees is structurally guaranteed to be 0 in the current implementation.

---

## 5. Is the Conflicts tab relevant?

**Short answer: no, not in the Graph path as it's currently wired.**

Reasons the tab is effectively dead in the Graph flow:

1. Graph's `findMeetingTimes` already filters to slots where all required attendees are free/tentative.
2. The backend filters out any remaining hard-conflict slot before persisting (`filtered_conflicts` counter in the log).
3. Every card the user ever sees has `conflict_count = 0`.

### When *could* the conflict tab be non-zero?

Only if you deliberately change one of the following:

| Change | Effect |
|---|---|
| Drop `minimumAttendeePercentage` below 100 | Graph returns slots where some attendees are busy — those become conflicts. |
| Stop filtering `if conflict_names: continue` in `graph_scheduling.py:531` | Busy-attendee slots reach the UI so the coordinator can make a judgement call. |
| Switch back to the deterministic ranker | That path already shows conflicts because it doesn't pre-filter by availability. |

### Where the tabs *are* meaningful

- **Attending** is still meaningful, but only to distinguish "all free" from "some tentative" (e.g. 8/8 vs 7/8 with 1 tentative).
- **Coverage** is redundant with Attending — it's just the same information as a percentage.
- **Conflicts** is dead information in the current flow.

---

## 6. Implications for the recommendation-box redesign

Given the above, the information users actually need from a Graph-backed slot is:

1. **Time + timezone** (primary)
2. **Graph confidence** — how sure is Graph this works for everyone? (today's `rank_score` partially captures this)
3. **How many attendees are tentative vs fully free** — this is the only real differentiator between two "100-confidence" slots
4. **Key-role flags** — is the organiser free? is the exec sponsor free (not just available — free, see `graph_scheduling.py:526-528`)?
5. **Why Graph picked this slot** — `suggestionReason` from Graph is available but we currently discard it
6. **AI rationale** — `ranking_rationale` is LLM-generated for the top 3 slots and shown in italics on the card

Information that currently takes up stat-tab real estate but shouldn't:

- **Conflicts** — always 0, remove it.
- **Coverage %** — redundant with Attending fraction.

### Suggested redesign of the stat row

Replace the 3-stat row with a compact confidence-first layout:

```
┌──────────────────────────────────────────────────────────────┐
│ ⭐ 100/100  ·  Graph: High  ·  8 free · 0 tentative          │
│ Organiser ✓  ·  Exec Sponsor ✓                                │
│ "Suggested because it is one of the nearest times when all   │
│  attendees are available." — Graph                           │
└──────────────────────────────────────────────────────────────┘
```

Key changes:

- Lead with the rank score (already the primary sort key) instead of burying it as a progress bar below the stats.
- Split 8/8 into **free vs tentative** explicitly — this is the actual decision information.
- Surface Graph's own `suggestionReason` (it's already in the response — we just throw it away today — see `graph_scheduling.py:678`).
- Drop the Conflicts tile entirely.
- Keep the Organiser / Exec-Sponsor pills (they're cheap insurance for the coordinator).

If you want to keep the current three-tile aesthetic, the cleaner three-tile split would be:

| Tile 1 | Tile 2 | Tile 3 |
|---|---|---|
| **Score** 100/100 | **Free** 8/8 | **Tentative** 0 |

That still gives three compact numbers, but every one of them changes slot-to-slot and actually informs the decision.

---

## 7. Quick reference — files to look at when changing this

| Concern | File |
|---|---|
| Graph call + score formula | `backend/app/api/routes/graph_scheduling.py` (esp. `_base_score_from_confidence`, loop at line 474) |
| Score thresholds / penalties (env-tunable) | `backend/app/config.py` lines 50–61 |
| Deterministic fallback ranker | `backend/app/services/slot_ranking_service.py` |
| Card UI (what to change for the redesign) | `frontend/src/components/modules/scheduling/SlotCard.tsx` |
| Card container (passes `rank` to each card) | `frontend/src/components/modules/scheduling/SlotRankingPanel.tsx` |
| `SlotProposal` TypeScript shape | `frontend/src/types/scheduling.types.ts` |

---

## 8. TL;DR

- `rank_score = confidence_band_score − 15 × tentative_count`, clamped 0–100.
- Graph pre-filters to 100% coverage, so **Coverage and Conflicts are structurally always 100% and 0** in the real flow.
- Only **Attending** changes slot-to-slot, and only because of tentatives.
- When redesigning the recommendation box: drop "Conflicts", merge "Coverage" into "Attending", expose `Free vs Tentative` explicitly, and surface Graph's `suggestionReason` — it's free context we're currently throwing away.
