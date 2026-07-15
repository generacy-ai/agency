# Data Model

This feature has no schema changes and no new persisted entities. It touches two conceptual entities in the `auto.md` runtime model.

## Entity 1: Merge-conflict source label (event token)

Discriminated union representing which label the classifier surfaced first for a given merge-conflict incident. The auto loop reads this value verbatim from the streamed transition event and threads it through the D.11 dispatch, presentation, ledger, and subagent prompt.

```ts
type MergeConflictSourceLabel =
  | "waiting-for:merge-conflicts"     // base-sync produced a conflict; operator-authored resolution needed
  | "blocked:stuck-merge-conflicts";  // engine auto-remedy attempted AND failed; operator resolution is only path forward
```

**Origin**: `cockpit_status(epic, json=true)` return payload (streamed event line, live-state re-check).

**Lifetime**: Per-event. Passed to D.11's subagent prompt and rendered into the G.4d presentation block. Written verbatim into the ledger line for the audit trail.

**Validation**:
- Must be one of the two literal strings above. Any other `blocked:*` token routes to D.10 (broadened case (d)); any other `waiting-for:*` token also routes to D.10 per its existing trigger.
- Not persisted between events; the loop re-reads it per dispatch.

**Semantic difference for D.11 rendering**:
- `waiting-for:merge-conflicts`: presentation block is the standard five-element shape (Root cause / Evidence / Conflicted paths / Suggested decision + trailing resolve-locally prose).
- `blocked:stuck-merge-conflicts`: presentation block gains a sixth row `**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)` above `**Root cause:**`. All other rows unchanged.

## Entity 2: Dispatched-issues set (in-memory dedup)

Session-scoped set of issue-refs for which D.11 has already dispatched an escalation gate in the current auto run. Purpose: suppress redundant gates when the co-occurring sibling label produces a second event for the same incident.

```ts
type IssueRef = string;              // e.g. "generacy-ai/agency#421"
type DispatchedIssuesSet = Set<IssueRef>;
```

**Lifecycle**:
| Event | Action |
|-------|--------|
| Loop start (auto run begins) | Set is empty. |
| D.11 dispatches for `<issue-ref>` (either source label, first arrival) | Add `<issue-ref>` to set. Run the full D.11 flow (subagent + gate + apply verdict). |
| Merge-conflict-family event arrives for `<issue-ref>` already in set | Skip D.11 dispatch. Write ledger line `<issue-ref> · <source-label> · escalation-gate · already-dispatched`. Continue main loop. |
| `cockpit_advance(gate="merge-conflicts")` succeeds for `<issue-ref>` | Remove `<issue-ref>` from set. Future merge-conflict events on the same issue re-gate. |
| `Skip (session-local mute)` verdict for `<issue-ref>` | Leave entry in place (session-mute semantics). The existing session mute set already suppresses further events; the dispatched set is now aligned with that. |
| `Stop (exit auto)` verdict | Set drops with process exit. |
| `cockpit_advance` returns typed-error and operator picks retry / skip / stop from re-presented gate | Entry remains until either advance succeeds or session ends. Re-presentation is the same dispatch, so no second entry is created. |

**Storage**: In-memory JS `Set<string>` in the auto-loop harness state, alongside the existing `session mute set` (referenced at `auto.md:266`, `:305`, `:391`, `:407`, `:749`). Not persisted, not observable outside the run.

**Validation**:
- Keyed by canonical issue-ref (`<owner>/<repo>#<n>`). No shorthand.
- Membership check is exact string match.

## Entity 3: Ledger line format (extended)

The D.11 ledger line format is extended to carry the *actual* source label rather than the hardcoded `waiting-for:merge-conflicts`.

**Before**:
```
<issue-ref> · waiting-for:merge-conflicts · escalation-gate · <advanced | advance failed: … | skip … | stop …>
```

**After**:
```
<issue-ref> · <source-label> · escalation-gate · <advanced | advance failed: <code>: <message> | skip (session-local mute) | stop (exit) | already-dispatched>
```

Where `<source-label>` is one of the two `MergeConflictSourceLabel` values above, written verbatim from the triggering event. The new `already-dispatched` outcome captures the dedup case from Entity 2.

## Relationships

```
event stream ─┬─▶ D.11 Trigger match on <source-label>
              │        │
              │        ▼
              │   dispatched-issues set? ── yes ──▶ ledger `already-dispatched` ──▶ continue
              │        │
              │        no
              │        ▼
              │   add issue-ref to set
              │        │
              │        ▼
              │   D.11 subagent (prompt includes <source-label> verbatim)
              │        │
              │        ▼
              │   G.4d gate presentation (Auto-remedy status row iff source = blocked:*)
              │        │
              │        ▼
              │   verdict apply
              │        │
              │   ┌────┴────┬─────────┬──────────┐
              │   ▼         ▼         ▼          ▼
              │  advance  skip     stop     typed-error re-present
              │   │
              │   ▼
              │  clear dispatched-issues set entry ──▶ continue
              │
              └─▶ ledger line: <issue-ref> · <source-label> · escalation-gate · <outcome>
```
