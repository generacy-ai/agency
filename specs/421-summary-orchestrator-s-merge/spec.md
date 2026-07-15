# Feature Specification: Route `blocked:stuck-merge-conflicts` to D.11 merge-conflicts escalation gate

**Branch**: `421-summary-orchestrator-s-merge` | **Date**: 2026-07-15 | **Status**: Draft
**Source**: [generacy-ai/agency#421](https://github.com/generacy-ai/agency/issues/421)

## Summary

The orchestrator's merge-conflict handler escalates unresolvable conflicts by applying `blocked:stuck-merge-conflicts` (leaving `waiting-for:merge-conflicts` in place). `auto.md`'s dispatch table (in `packages/claude-plugin-cockpit/commands/auto.md`) handles `waiting-for:merge-conflicts` via D.11 but has no row for `blocked:stuck-merge-conflicts`, so each occurrence falls through to D.10 (the generic unrecognized-state escalation). On the snappoll dogfood run this happened 3 times, each interrupting the operator with a "never guess" gate whose options don't include the one action that actually helps (resolve conflicts → advance the `merge-conflicts` gate).

The fix extends D.11's trigger to match either `waiting-for:merge-conflicts` **or** `blocked:stuck-merge-conflicts`, so the auto-remedy-failed case reaches the same operator-resolution path as the plain-conflict case.

## Evidence

- **snappoll#3**: `blocked:stuck-merge-conflicts` at 2026-07-14T22:41:44Z → operator resolved via D.11-style path by hand (`manual-advance gate=merge-conflicts` comment at 22:43:39).
- **snappoll#13**: same pattern on 2026-07-15 (~15:01 advance + `cockpit_resume`).
- **Run summary**: "Escalations: 3 unrecognized-state (`blocked:stuck-merge-conflicts`)".
- **Shipped `auto.md`** (grep): `blocked:` appears nowhere; D.11 triggers only on the verbatim string `waiting-for:merge-conflicts`.
- Found during the snappoll dogfood run (cluster stable, orchestrator 0.8.0).

## Companion issue (out of scope here)

Filed on generacy from the same run: the `@generacy-ai/cockpit` classifier has no `blocked:*` tier, so these labels arrive as `unknown` state. D-class routing needs the classifier fix to see the label at all. **That fix lives in the generacy repo; this spec covers only the `auto.md` change.**

## User Stories

### US1: Operator resolves an auto-remedy-failed merge conflict without a "never guess" interruption

**As an** orchestrator operator running `/cockpit:auto` on an epic,
**I want** `blocked:stuck-merge-conflicts` to route to the same merge-conflicts resolution gate as `waiting-for:merge-conflicts`,
**So that** I can pick `I've resolved it → cockpit_advance(gate="merge-conflicts")` directly, without falling through to the D.10 unrecognized-state gate whose options don't include that action.

**Acceptance Criteria**:
- [ ] When an issue enters `blocked:stuck-merge-conflicts`, the auto loop fires the D.11 merge-conflicts escalation gate (not the D.10 unrecognized-state gate).
- [ ] The presented gate options are exactly: `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`.
- [ ] The gate presentation notes that the auto-remedy has already failed, distinguishing this case from a plain `waiting-for:merge-conflicts` event.
- [ ] Selecting `I've resolved it` calls `cockpit_advance(issue=<ref>, gate="merge-conflicts")`.

### US2: Audit trail distinguishes remedy-failed from plain conflict

**As an** operator or engineer reviewing a ledger post-run,
**I want** the ledger line to carry the real source label (`blocked:stuck-merge-conflicts` vs. `waiting-for:merge-conflicts`),
**So that** I can tell which conflicts were auto-remedy failures vs. plain conflicts when investigating patterns.

**Acceptance Criteria**:
- [ ] Ledger line for a D.11 dispatch triggered by `blocked:stuck-merge-conflicts` carries the verbatim source label `blocked:stuck-merge-conflicts` (not the D.11 trigger name `waiting-for:merge-conflicts`).
- [ ] Ledger line for a D.11 dispatch triggered by `waiting-for:merge-conflicts` continues to carry `waiting-for:merge-conflicts` (no regression).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Extend D.11's trigger in `packages/claude-plugin-cockpit/commands/auto.md` to match either `waiting-for:merge-conflicts` OR `blocked:stuck-merge-conflicts`. | P1 | Both labels co-occur; `blocked:` means "auto-remedy already failed". |
| FR-002 | The D.11 dispatch pipeline (fetch context → diagnosis subagent → escalation gate → apply verdict) remains identical for both trigger labels. | P1 | Same tool calls, same gate options, same advance target. |
| FR-003 | Update the D.11 gate presentation to note "auto-remedy already failed" when the source label is `blocked:stuck-merge-conflicts`. | P2 | Preserves operator context; does not change decision options. |
| FR-004 | Ledger line carries the verbatim source label (`blocked:stuck-merge-conflicts` or `waiting-for:merge-conflicts`) so the audit trail distinguishes the two cases. | P1 | Required for post-run analysis and finding investigations. |
| FR-005 | D.10 (unrecognized-state) trigger continues to exclude the `blocked:stuck-merge-conflicts` label. | P1 | The whole point of the fix — no more fall-through. |
| FR-006 | Remove or update the D.10 fall-through path for `blocked:stuck-merge-conflicts` — the label is now recognized. | P1 | Verify D.10 no longer catches this class. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Number of `unrecognized-state (blocked:stuck-merge-conflicts)` escalations per auto run. | 0 | Post-run ledger scan; compare to snappoll's 3. |
| SC-002 | Operator effort to resolve a stuck-merge-conflict escalation. | Zero out-of-band `manual-advance` comments; single in-gate approval. | Ledger + comment audit on a follow-up dogfood run. |
| SC-003 | Ledger contains a D.11 dispatch line whose source label is `blocked:stuck-merge-conflicts`. | ≥ 1 when the condition occurs. | Grep the run ledger. |
| SC-004 | No regression on plain `waiting-for:merge-conflicts` events — they still trigger D.11 identically. | 100% | Regression check on any epic that produces plain merge conflicts. |

## Assumptions

- The `blocked:stuck-merge-conflicts` label is applied *in addition to* `waiting-for:merge-conflicts` (they co-occur, per issue evidence); the fix routes the event whichever label the classifier surfaces first.
- Operator action to resolve a stuck merge conflict is identical to a plain merge conflict: resolve the conflict locally / on branch, then advance the `merge-conflicts` gate.
- The `@generacy-ai/cockpit` classifier fix (companion issue on generacy) is a **prerequisite** for `blocked:*` labels to reach the dispatch loop as recognized states at all. Without that fix, this `auto.md` change is a no-op on live runs — but the change is still correct and will activate once the classifier ships.

## Out of Scope

- Fixing the `@generacy-ai/cockpit` classifier's missing `blocked:*` tier (filed as a companion issue on generacy).
- Adding new gate options beyond D.11's existing three (`I've resolved it` / `Skip` / `Stop`).
- Auto-remedy improvements upstream of the escalation — the point of `blocked:stuck-merge-conflicts` is that auto-remedy already gave up.
- Any change to D.10's catch-all behavior for genuinely unknown labels.

---

*Generated by speckit*
