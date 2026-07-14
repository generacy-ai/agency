# Contract: Initial-flagged event dispatch

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 2 last paragraph; clarifications Q5; plan.md § Instructions step 4 one-sentence add

## Purpose

Document how first-sight events from generacy#935 (`initial: true` on `issue-transition`) dispatch through the existing table by carried state. **No new dispatch row.** The `auto.md` change is one sentence in the event-consumption step + one fixture.

## Q5 anchor (cross-issue alignment with generacy#935)

Both generacy#935 (Q1) and this spec (Q5) converged on the same shape:

- The engine emits `issue-transition` events with an `initial: true` flag for both:
  - **Connect-time snapshots** — events issued when the loop first connects to a scope, describing the current state of each scope member.
  - **Mid-run scope joins** — events issued when a new ref joins scope (via `cockpit_scope_add`), describing the joining ref's current state.
- The event carries a **known state class** (e.g., `waiting-for:clarification`, `waiting-for:implementation-review`).
- The playbook dispatches by carried state class — the existing dispatch table (D.1–D.11) handles the event without a special case for `initial: true`.

## Dispatch behavior

For each event in the `cockpit_await_events` batch (step 4 main loop), the parent:

1. **(a) Re-checks live state** via `cockpit_status(epic=<epic-ref>, json=true)` — the batch event is advisory; the live return is authoritative (unchanged from current step 4a).
2. **(b) Dispatches** per § Dispatch by the live transition class (unchanged from current step 4b).
3. **(c) Writes one ledger line** (unchanged from current step 4c).
4. **(d) Continues** with the next event in the batch (unchanged from current step 4d).

**The `initial: true` flag is orthogonal to dispatch.** Steps (a)–(d) are agnostic to whether the event is initial-flagged or a mid-run transition. The step-4a re-check ensures the live state is authoritative regardless.

## Playbook edit (one sentence)

Added to § Instructions step 4's "For each event in the batch" description, immediately after the (a)–(d) numbered list:

> **Initial-flagged events** — `issue-transition` events with `initial: true` from `cockpit_await_events`, produced by generacy#935 for connect-time snapshots and mid-run scope joins — dispatch through the existing table by their carried state class, the same as any other event. The step-4a re-check remains authoritative. **D.10 structurally cannot fire on an initial-flagged event because the state class is known.**

## Why D.10 cannot fire (Q5 rationale)

- D.10 (unrecognized state) fires when the re-check step reads a live state whose transition class is not one of D.1–D.9 (or D.11).
- An `initial: true` `issue-transition` event carries a known state class from the engine's classifier — the class is by definition one of the table's rows (or `phase:*` which routes to D.9d, or unrecognized which would already fire D.10 regardless of initial-flag).
- Therefore the state-class-known-ness (not the initial-flag itself) is what routes the event into the existing table — the initial-flag adds no dispatch information beyond "this is a snapshot vs a transition".

## Fixtures

Fixture verification for this behavior is inline in `tests/playbook-verification.test.ts` — no dedicated fixture file is needed because the assertion is grep-based (positive: sentence exists in step 4; negative: no D.12 row in § Dispatch table).

- **Static grep positive**: `commands/auto.md` § Instructions step 4 contains a sentence referencing "Initial-flagged events" AND references the existing dispatch table.
- **Static grep negative**: `commands/auto.md` § Dispatch table does NOT contain a `D.12` row.
- **Static grep negative**: `commands/auto.md` § Dispatch table's D.9-class rows (D.9, D.9a, D.9b, D.9c, D.9d) are unchanged — no `initial:` semantic added to a D.9 row.

## Verification

- **Static grep**: checks above (positive + two negatives).
- **Behavioral**: none dedicated — the assertion is that the existing dispatch table handles the event, which is verified by the existing D.1–D.11 tests continuing to pass (no regression).
- **True verifier**: operator smoke-test — an initial-flagged `waiting-for:clarification` event (mid-run scope join under an add-existing intent) arrives; the parent re-checks live state, dispatches to D.1, and processes the clarification through the standard G.1 batched-gate flow. No special case fires; the ledger line has the same shape as a mid-run non-initial-flagged D.1 dispatch.

## Related contracts

- [Intent recognition](./intent-recognition.md) — add-existing intent triggers `cockpit_scope_add`, which causes generacy#935 to emit an `initial: true` `issue-transition` event carrying the added ref's current state class.
- [Filing gate](./filing-gate.md) — file-new intent triggers `gh issue create` + `cockpit_scope_add`, which similarly causes generacy#935 to emit an `initial: true` event carrying `phase:specify` (or whatever the new issue's initial state class is).
- [Ledger scope mutations](./ledger-scope-mutations.md) — the scope-mutation ledger line is written BEFORE the initial-flagged event arrives (the ledger line records the intent-driven mutation; the event later confirms the engine has published the mutation).
