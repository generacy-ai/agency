# Feature Specification: Cockpit Remote Gates — auto.md `--gates` mode + gate-answer dispatch

**Branch**: `449-part-cockpit-remote-gates` | **Date**: 2026-07-22 | **Status**: Draft
**Parent epic**: Cockpit Remote Gates (tracking issue in `generacy-ai/generacy-cloud`)
**Wire contracts**: [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md) — implement against the contracts as written; propose contract changes on the epic before diverging.

## Summary

Rework `packages/claude-plugin-cockpit/commands/auto.md` so the `/cockpit:auto` driving session **never blocks on a human gate**. In UI-gates mode, each gate contract G.1–G.7 opens a remote gate record via `cockpit_gate_open` (routed to a central operator inbox on generacy.ai), prints a one-line pointer, records the open gate in session state, and returns to the dispatch loop. Answers arrive later as a new event class **D.12 `gate-answer`** on the existing wake paths (`Monitor` doorbell NDJSON lines and `cockpit_await_events` batches) and are applied by mapping `optionId`/`freeText` onto the exact same handling the corresponding `AskUserQuestion` selection performs today.

## Context

Today, every gate (clarify/review/manual-validate/merge-fixer-escalation/error/phase-queue/scope-drained) surfaces via `AskUserQuestion` in the driving session and **blocks** the loop until the operator answers in that session. Multiple concurrent `/cockpit:auto` runs each hold their own blocking prompt, and answering requires reattaching to the session that opened it.

The Cockpit Remote Gates epic introduces a central operator inbox on generacy.ai. This feature is the **skill-side half** of that epic: the driving session never blocks on humans; it fans gate records out to the inbox and applies answers as they land, so a single operator can drive many concurrent runs from one place.

## User Stories

### US1 — Operator answers gates from the inbox instead of reattaching to sessions
**As** a Generacy operator running one or more `/cockpit:auto` sessions,
**I want** every human gate to open as a record in the generacy.ai inbox rather than blocking the driving session,
**So that** I can answer gates from a single central UI while the driving sessions keep dispatching batches in the background.

**Acceptance Criteria**:
- [ ] When a gate fires in UI mode, the driving session prints exactly one pointer line (`gate open: <title> → answer in the generacy.ai inbox`) and returns to the dispatch loop within the same assistant turn — no `AskUserQuestion` call.
- [ ] The remote gate record carries the same drafted title/body/options the local `AskUserQuestion` would have shown today (via the plan-doc wire contract; generation per plan-doc rules).
- [ ] Operator submissions in the inbox propagate to the driving session as a `gate-answer` event on the existing wake paths (doorbell line + `cockpit_await_events` batch item).

### US2 — Applied answers produce the same downstream actions as local AskUserQuestion
**As** a user relying on `/cockpit:auto`'s existing behavior,
**I want** an inbox answer for a given gate to trigger the exact same follow-up work as picking that option locally today,
**So that** switching to UI-gates mode does not change any dispatch outcome or ledger semantics.

**Acceptance Criteria**:
- [ ] Each of G.1–G.7 has an explicit mapping in auto.md from `optionId` / `freeText` to the same tool calls, subagent hops, and ledger writes the local option triggers today (relay clarify answers, `cockpit advance`, phase-queue, merge, fixer spawn, mute, exit, edit-directive loops via `freeText`).
- [ ] `freeText` "edit directive" answers re-open a fresh gate generation with the revised draft, matching today's local re-present behavior.
- [ ] After applying, the loop emits `cockpit_gate_ack` with `applied` (or `failed` with detail); no ledger line is silently dropped.

### US3 — Stale gates are acknowledged as superseded, never mis-applied
**As** a user whose `/cockpit:auto` run advances state while a gate is open,
**I want** answers to gates whose live labels/state have moved on to be rejected as superseded rather than applied to the wrong context,
**So that** stale operator input can't corrupt the run.

**Acceptance Criteria**:
- [ ] On every `gate-answer` event, D.12 re-checks the gate is still current against live labels/state before applying.
- [ ] If stale, the loop calls `cockpit_gate_ack` with `superseded` and does NOT apply the answer.
- [ ] A superseded ack produces a ledger line noting the supersession outcome; the loop continues.

### US4 — UI-mode outage never stalls the operator
**As** an operator whose cloud gate service momentarily fails,
**I want** `/cockpit:auto` to fall back to the local `AskUserQuestion` for the affected gate,
**So that** a transient outage degrades gracefully rather than stalling the run.

**Acceptance Criteria**:
- [ ] On `cockpit_gate_open` error, the loop falls back to local `AskUserQuestion` for that gate (fail toward the operator).
- [ ] Repeated failures within one run are noted **once** in the ledger; the loop keeps trying subsequent gates via UI mode.
- [ ] No path exists where a `cockpit_gate_open` error causes the loop to stall waiting on a phantom remote answer.

### US5 — Restart re-opens still-pending gates without duplicates
**As** an operator restarting a driving session that had gates open in the inbox,
**I want** the startup sweep to re-open remote gates for any still-pending `waiting-for:*` states,
**So that** in-flight decisions survive process restarts without producing duplicate inbox records.

**Acceptance Criteria**:
- [ ] Startup sweep in UI mode re-opens gates for every pending `waiting-for:*` state observed.
- [ ] Re-opens are idempotent by `gateId` (per plan-doc `gateId`/generation rules) — no duplicate inbox records.
- [ ] Answers submitted for a pre-restart gate generation are still applied (or rejected as superseded) under the D.12 rules.

### US6 — `--gates=local` preserves today's byte-path exactly
**As** a maintainer worried about regressions,
**I want** an explicit `--gates=local` invocation flag that reproduces today's behavior byte-for-byte,
**So that** existing scripts, ops docs, and playbook-verification pins can rely on the exact pre-change dispatch shape.

**Acceptance Criteria**:
- [ ] `--gates=local` disables every UI-mode code path — no `cockpit_gate_open`, no D.12, no startup sweep for UI.
- [ ] `--gates=ui` forces UI mode even when local would otherwise apply (subject to fallback per US4).
- [ ] Default `--gates=auto` picks UI when `cockpit_gate_open` is present AND the cluster is cloud-activated, otherwise local.
- [ ] Playbook-verification pins covering `--gates=local` invocations are byte-identical to pre-change output for the same input.

## Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                                                                                          | Priority | Notes |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|-------|
| FR-001 | Add invocation flag `--gates=ui\|local\|auto` to auto.md's argument spec; default `auto`.                                                                                                                                                                                                                             | P1       | Mutually exclusive values. |
| FR-002 | Under `--gates=auto`, select UI mode iff `cockpit_gate_open` MCP tool is present AND the cluster is cloud-activated; otherwise select local mode.                                                                                                                                                                     | P1       | Cloud-activation signal per plan-doc. |
| FR-003 | In UI mode, replace every gate contract G.1–G.7's `AskUserQuestion` call with a `cockpit_gate_open` call using the same drafted title/body/options mapped onto the plan-doc wire contract (gate record).                                                                                                              | P1       | Draft content unchanged from today. |
| FR-004 | In UI mode, print exactly one pointer line per gate open: `gate open: <title> → answer in the generacy.ai inbox`.                                                                                                                                                                                                     | P1       | No other operator-facing output for the gate open. |
| FR-005 | In UI mode, record the open gate in session state keyed by `gateId` (per plan-doc generation rules) and return to the dispatch loop within the same assistant turn.                                                                                                                                                   | P1       | No blocking wait. |
| FR-006 | Add dispatch class **D.12 `gate-answer`** to auto.md's event dispatch table for both the doorbell NDJSON line and the `cockpit_await_events` batch item.                                                                                                                                                              | P1       | New row in the D-table. |
| FR-007 | D.12 handling MUST re-check the gate is still current against live labels/state before applying; if stale, call `cockpit_gate_ack` with `superseded` and skip apply.                                                                                                                                                  | P1       | Supersession is a first-class outcome. |
| FR-008 | For non-stale gates, D.12 maps `optionId` / `freeText` onto the exact same downstream handling the corresponding local `AskUserQuestion` selection performs today: relay clarify answers, advance, queue, merge, fixer spawn, mute, exit, edit-directive loops via `freeText`.                                        | P1       | Per-gate mapping table in auto.md. |
| FR-009 | `freeText` edit-directive answers MUST cause a fresh gate generation to open (new `gateId` generation) with the revised draft; the prior generation is superseded.                                                                                                                                                    | P1       | Matches today's local re-present. |
| FR-010 | After apply, D.12 MUST call `cockpit_gate_ack` with outcome `applied` or `failed` (with detail). A ledger line MUST be written for every D.12 event.                                                                                                                                                                  | P1       | No silent drops (§ Invariants §7). |
| FR-011 | On `cockpit_gate_open` error, fall back to a local `AskUserQuestion` for that gate (fail toward the operator). The run MUST NOT stall.                                                                                                                                                                                | P1       | Fallback per gate. |
| FR-012 | Repeated `cockpit_gate_open` failures within one run MUST be noted **once** in the ledger; the loop MUST continue attempting UI mode on subsequent gates.                                                                                                                                                             | P2       | Prevent log-spam without hiding degradation. |
| FR-013 | UI-mode startup sweep MUST re-open remote gates for every pending `waiting-for:*` state discovered, idempotently by `gateId` (no duplicate inbox records).                                                                                                                                                            | P1       | Restart-safety. |
| FR-014 | `--gates=local` MUST preserve today's byte-path exactly — no `cockpit_gate_open` call, no D.12 dispatch, no UI startup sweep.                                                                                                                                                                                          | P1       | Playbook pins depend on this. |
| FR-015 | Update `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins for every auto.md edit; new pins MUST assert (a) the new gate mapping table headings/columns, (b) the D.12 dispatch row, (c) the fallback rule, (d) the supersession rule, (e) the `--gates` flag on the argument spec.                | P1       | Re-pin, do not weaken (per CLAUDE.md). |
| FR-016 | Update plugin docs (README / cockpit plugin docs) with the `--gates` flag, UI vs. local semantics, and the operator pointer line format.                                                                                                                                                                              | P2       | User-facing doc surface. |

## Success Criteria

| ID      | Metric                                                                                                                                            | Target                                 | Measurement                                                                     |
|---------|---------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------|---------------------------------------------------------------------------------|
| SC-001  | Playbook-verification suite green with updated pins covering FR-001, FR-006, FR-007, FR-008, FR-011, FR-014.                                       | 100% pass                              | `pnpm test` on `packages/claude-plugin-cockpit`.                                 |
| SC-002  | `--gates=local` byte-path unchanged from pre-#449.                                                                                                | Zero diff on local-mode pin fixtures    | Playbook-verification diff test against pre-change golden.                       |
| SC-003  | Every gate contract G.1–G.7 has an unambiguous `optionId`/`freeText` → local-action mapping row in auto.md.                                        | 7/7 gates mapped                        | Manual audit against auto.md gate-mapping table.                                 |
| SC-004  | D.12 dispatch row present in the event dispatch table with re-check + supersession + apply/fail + ack semantics specified.                          | Present, complete                       | Playbook-verification assertion + manual read.                                   |
| SC-005  | Fallback path exercised in a simulated `cockpit_gate_open` error: run continues, single ledger note, no stall.                                     | 100% of simulated errors fall back      | Unit/integration test simulating error return.                                   |
| SC-006  | Startup sweep re-opens each pending `waiting-for:*` gate exactly once by `gateId` across restart.                                                   | Zero duplicate inbox records            | Integration test with two simulated startups on the same pending state.         |

## Assumptions

- The plan doc's wire contracts (gate record, answer NDJSON line, outcome ack, `gateId`/generation rules) are stable for the duration of this feature; contract changes go to the epic first.
- `cockpit_gate_open`, `cockpit_gate_ack`, and the `gate-answer` event class are provided by the cluster/cloud side (epic phases P1–P3) and are OUT OF SCOPE for this feature to implement.
- "Cloud-activated cluster" has a detectable signal usable at `auto` mode selection time (per plan-doc); the exact mechanism is defined by the plan doc, not re-specified here.
- Today's local `AskUserQuestion` bodies/options for G.1–G.7 are the source of truth for the UI-mode drafted body/options — no change to draft content is in scope here.
- Playbook-verification tests pin every `commands/*.md` playbook by exact heading strings and contract rules (per project CLAUDE.md); this feature re-pins rather than weakens.

## Out of Scope

- Cluster/cloud implementation (epic phases P1–P3): the inbox UI, backend, `cockpit_gate_open`/`cockpit_gate_ack` MCP tools, and doorbell `gate-answer` NDJSON emission.
- Dual-surface first-answer-wins (a gate answered simultaneously via local AskUserQuestion AND the inbox).
- Per-gate auto-approve / "full auto" — every gate still prompts (local or remote); this feature does not change the every-gate-prompts invariant.
- Changes to draft body/option content for any G.1–G.7 gate; only the surface (local vs. remote) changes.
- Any change to `--gates=local` byte-path; that path must be pin-preserved.

---

*Generated by speckit — grounded in issue #449 and the cockpit-remote-gates plan doc.*
