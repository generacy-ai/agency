# Implementation Plan: Route `blocked:stuck-merge-conflicts` to D.11

**Feature**: Extend `auto.md` dispatch so `blocked:stuck-merge-conflicts` routes to the D.11 merge-conflicts escalation gate instead of falling through to D.10 unrecognized-state.
**Branch**: `421-summary-orchestrator-s-merge`
**Status**: Complete

## Summary

`auto.md`'s dispatch table only names the verbatim string `waiting-for:merge-conflicts` as the D.11 trigger. When the orchestrator's engine escalates an unresolvable conflict by also applying `blocked:stuck-merge-conflicts`, the event has no matching row and falls through to D.10 (unrecognized-state), whose option set (`Skip` / `Stop`) cannot advance the merge-conflicts gate. On the snappoll dogfood run this happened 3 times; the operator resolved each by hand via a manual advance.

This fix is a **documentation-only edit** to `packages/claude-plugin-cockpit/commands/auto.md`. No code changes, no schema changes, no new tools — the surface is prose in a `.md` playbook the loop reads at runtime. The four resolved clarifications drive exactly four edit sites:

1. **D.11 Trigger** — extend the verbatim event-string set to include `blocked:stuck-merge-conflicts` alongside `waiting-for:merge-conflicts`, with an explicit note that the two labels co-occur and represent one incident.
2. **D.11 presentation (§ Gate contract G.4d)** — when the source label is `blocked:stuck-merge-conflicts`, insert a fixed-shape `**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)` field above `**Root cause:**` in the presentation block. Opening line and other fields unchanged.
3. **D.11 diagnosis subagent prompt** — pass the source label verbatim in the subagent's prompt so it can reference "auto-remedy already failed" in `root_cause`/`evidence`. Return schema unchanged.
4. **D.11 dispatch + Ledger + dedup semantics** — record the real source label in the ledger line (`waiting-for:merge-conflicts` vs. `blocked:stuck-merge-conflicts`), and add a dedup rule: once D.11 dispatches for an issue-ref, subsequent merge-conflict-family events for the same ref are ledger-only (`already-dispatched`), cleared when the `merge-conflicts` gate advances.
5. **D.10 Trigger case (d)** — broaden the case-(d) prose from `waiting-for:*` to `waiting-for:* or blocked:*`, documenting `blocked:*` as a recognized state-token family so future `blocked:*` labels (e.g. `blocked:stuck-validate-fix`) don't fall through the vague catch-all.

## Technical Context

- **Language / Format**: Markdown playbook (`auto.md`) consumed by the `cockpit:auto` slash-command flow.
- **Consumer**: Claude Code sessions running `/cockpit:auto` — the LLM reads the playbook to route batched state-transition events.
- **Runtime state**: `session mute set` and the new `dispatched-issues set` are in-memory across the auto run. No persistence.
- **Dependencies**: None new. The `@generacy-ai/cockpit` classifier fix (companion issue on generacy) is a prerequisite for the `blocked:*` labels to actually reach the loop as recognized tokens — but this fix is idempotent under the current classifier: the D.11 row simply won't match until the classifier surfaces `blocked:stuck-merge-conflicts` in events, at which point the row is ready.
- **Testing**: Fixture-based — the four in-code fixture scenarios listed in `quickstart.md` verify each edit site. There is no in-repo runtime test for `auto.md` dispatch (it is prose the LLM interprets), so verification is documentary + replayed-transcript spot-check per the snappoll incidents cited in the spec.

## Project Structure

```
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                       ← the ONLY file this feature edits
specs/421-summary-orchestrator-s-merge/
├── spec.md                           ← read-only
├── clarifications.md                 ← read-only (batch 1 resolved 2026-07-15)
├── plan.md                           ← this file
├── research.md                       ← technology / pattern decisions
├── data-model.md                     ← state-token vocabulary + dedup entity
├── quickstart.md                     ← verification scenarios
└── contracts/                        ← (empty — no new schemas)
```

### Edit sites in `auto.md`

| Site | Approx. line | Edit |
|------|--------------|------|
| Dispatch table row for D.11 | 110 | Widen the trigger cell to name both labels. |
| D.11 § Trigger prose | 377 | Name both labels as verbatim event strings and note co-occurrence + dedup. |
| D.11 § Dispatch step 1.5 (subagent prompt) | 381–387 | Add source label to the prompt payload. |
| D.11 § Dispatch step 1 (fetch context) or new step | 380 | Insert dedup check: if issue-ref is in dispatched-issues set, ledger-only `already-dispatched` and return. |
| D.11 § Ledger line format | 396 | Replace hardcoded `waiting-for:merge-conflicts` with `<source-label>` placeholder + list both possible values. |
| D.11 § post-advance hook | 390 | Clear the issue-ref from dispatched-issues set on successful advance. |
| § Gate contract G.4d initial presentation | 685–697 | Insert conditional `**Auto-remedy status:**` row above `**Root cause:**` when source label is `blocked:stuck-merge-conflicts`. |
| § Gate contract G.4d re-presentation | 701–717 | Same insertion in the typed-error re-presentation shape. |
| D.10 § Trigger case (d) | 400 | Broaden `waiting-for:*` → `waiting-for:* or blocked:*`. |
| Any dispatch-table reference to D.10 catch-all | 402 | Update the "Any `waiting-for:*` label without a matching dispatch row IS an unrecognized state" paragraph to include `blocked:*`. |

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo. Nothing to check.

## Risks & Mitigations

- **Risk**: The classifier prerequisite hasn't shipped, so this playbook change alone won't fire the new D.11 branch until generacy#943's companion classifier fix lands.
  **Mitigation**: The edit is a no-op until events actually carry `blocked:*` labels, so it is safe to ship ahead of the classifier. The dedup entry format and ledger placeholder are already valid for the `waiting-for:merge-conflicts`-only path (source label = `waiting-for:merge-conflicts`, dedup applies only when a second event would arrive).
- **Risk**: Future `blocked:*` labels appear that are NOT stuck-merge-conflicts and should not route to D.11.
  **Mitigation**: D.10's broadened case (d) explicitly names "not matching a Trigger in D.1–D.11" — new `blocked:*` labels without their own dispatch row correctly land in D.10 (escalation gate), not D.11.
- **Risk**: Dedup by issue-ref could hide a genuinely new merge conflict on the same issue if the operator resolves the first one via `Skip` (which does not advance the gate) rather than `I've resolved it`.
  **Mitigation**: The dedup entry is cleared only on `merge-conflicts` gate advance (Q1 answer). `Skip` leaves the entry in place for the session, which is intentional session-local mute semantics — subsequent same-issue events remain suppressed until the session ends or the gate advances.

## Suggested next step

`/speckit:tasks` — generate the ordered task list for the edit sites above.
