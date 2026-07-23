# Implementation Plan: `/cockpit:auto` — Cockpit Remote Gates (UI-mode dispatch)

**Feature**: Add a `--gates=ui|local|auto` invocation flag to `/cockpit:auto` and a new dispatch class **D.12 `gate-answer`** so that in UI-mode the loop opens a remote gate record via `cockpit_gate_open` (drafted body + options, exact wire contract per [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)) and returns to the dispatch loop rather than blocking on `AskUserQuestion`. Answers arrive as `gate-answer` events on the existing wake paths (doorbell NDJSON line + `cockpit_await_events` batch item), get validated against live labels/state, and map onto the same downstream tool calls the local `AskUserQuestion` path performs today — with `cockpit_gate_ack` closing the record as `applied` / `superseded` / `failed`.
**Branch**: `449-part-cockpit-remote-gates`
**Status**: Complete

## Summary

Playbook-prose-only edit on the skill side, plus re-pinned playbook-verification tests. **No engine changes, no MCP schema changes** — the epic's cluster/cloud implementation (P1–P3) is out of scope per spec § "Out of scope"; this ticket implements the skill-side rework against the wire contracts published in `cockpit-remote-gates-plan.md`.

Concretely, `packages/claude-plugin-cockpit/commands/auto.md` (1531 lines today) gains:

1. **A `--gates=ui|local|auto` flag** in the step-1 parse block (default `auto`: UI when `cockpit_gate_open` is present AND the cluster is cloud-activated, else local; `--gates=local` preserves today's exact byte-path; `--gates=ui` forces UI mode and **hard-fails at pre-flight if `cockpit_gate_open` is absent** — verbatim error, non-zero exit, no ledger dir created, per **Q3=A**).
2. **A 10-row UI-mode gate mapping table** (G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7) mapping each gate to its `cockpit_gate_open` call shape (title / drafted body / options / gateId + generation rules per plan doc) and its `optionId` / `freeText` → downstream-action mapping — per **Q1=C**. G.4e stays local-only (per-epic in-memory cursor-fault, no per-issue gate record possible).
3. **A new dispatch class D.12 `gate-answer`** added to the dispatch table (`## Dispatch` section) with a full contract: doorbell NDJSON line shape, `cockpit_await_events` batch item shape, live-state supersession check (`cockpit_gate_ack` with `superseded` when the gate's issue label has moved past the trigger state), option/freeText → same-as-local downstream handling (relay clarify answers, advance, queue, merge, fixer spawn, mute, exit, edit-directive re-open — revised drafts re-open as a NEW generation), and `applied` / `failed` ack.
4. **Fallback semantics**: `cockpit_gate_open` errors during a call fall back to local `AskUserQuestion` for that gate (fail toward the operator — never stall); repeated failures noted once in the ledger, loop continues (per **US4 / FR-011**). Distinct from pre-flight absence (Q3=A hard-fail).
5. **Startup-sweep extension** (per **Q2=B**): in UI mode, sweep re-opens remote gates for all persistent gate-trigger states — the waiting-for:* set FR-013 already covers, PLUS the label-driven non-waiting-for triggers (`agent:error`, `failed:*`, `completed:validate` with red checks, `phase-complete`, `blocked:stuck-merge-conflicts`). Idempotent by gateId. G.4e's in-memory cursor-fault is excluded.
6. **G.7 Add-more-work collapse** (per **Q4=A**): in UI mode the inbox operator's `Add more work` selection carries the prose payload in the answer's `freeText` field alongside the `optionId`; D.12 routes freeText through the existing intent recognizer, matching today's local two-turn flow in one wire round-trip.
7. **Ledger vocabulary preserved** (per **Q5=B**): gate-open is print-only ("one pointer line" per FR-005, treated as UI affordance, not dispatch). D.12 writes exactly one ledger line per resolved gate, reusing the pre-change `<action>` vocabulary and appending `· source: ui-gate` in the outcome slot (matching the E6 `· source: enriched-line` convention at `auto.md` line 1303). This preserves grep recipes on stable `<action>` / `<outcome>` strings.

Playbook-verification tests are re-pinned to the new contracts — heading strings, mapping-table row count (10), D.12 presence in the dispatch table, the `· source: ui-gate` suffix rule, and the pre-flight absence error string — per the CLAUDE.md "Cockpit playbook pins" rule (do not weaken; re-pin to the new contract in the same PR).

## Technical Context

**Language / runtime**: The skill is playbook prose interpreted by the model at slash-command time; no compile-time code path executes it. Reference-implementation libraries (if any) live under `packages/claude-plugin-cockpit/lib/` in TypeScript matching existing conventions (`lib/clarification-batch-parser.ts`, `lib/intent-recognition.ts`, `lib/invocation-form-4.ts` from #444). Tests run under `vitest`, matching `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.

**Frameworks / dependencies**:
- **No new runtime deps.** The wire types (`GateOpenParams`, `GateAnswerEvent`, `GateAckParams`) are defined in `data-model.md` as reference types; the wire contract itself is owned by `cockpit-remote-gates-plan.md`.
- **New MCP tools consumed** (bound by the cluster per epic P1–P3, not registered by this ticket): `cockpit_gate_open`, `cockpit_gate_ack`. Both are **present** in the deferred-tool list observed at session start.
- **Reused verbatim from today's playbook**: the downstream action set on each option (`cockpit advance`, `cockpit_queue`, `cockpit_merge`, `cockpit_resume`, `cockpit_scope_add`, `gh issue create`, fixer subagent spawn, session-mute set, exit sequence, edit-directive re-draft loop). D.12's job is to route `{optionId, freeText}` onto the same handling the local `AskUserQuestion` path performs today — no new downstream behavior.

**Boundaries preserved**:
- **`--gates=local` byte-path unchanged** (spec § Acceptance criteria). Every existing test that exercises local behavior continues to pass without modification of expectations.
- **Never merge on red** and **every gate prompts** (auto.md opening paragraph) unaffected. Per-gate auto-approve remains explicitly out of scope (spec § "Out of scope"); UI mode moves the presenter, not the decision policy.
- **No engine changes / no MCP schema changes for the plugin ticket.** The wire schema is owned by the epic tracking issue; deviations must be proposed there per spec § Summary ("propose contract changes on the epic before diverging").
- **Playbook-first, code-second.** Any TypeScript added under `lib/` is a reference implementation of the prose, not the source of truth.

**Presence detection for `--gates=auto`**: two-part check per Q3 rationale — (a) `cockpit_gate_open` is bound in the session's MCP tool binding, AND (b) the cluster is cloud-activated (observable via a startup handshake exposed by `cockpit_context` or the doorbell surface; exact query surface pinned in `contracts/gates-flag-parse.md`). If either is false, `--gates=auto` resolves to `local` for the entire run (byte-identical to `--gates=local`). This resolution is decided ONCE at pre-flight — it does not flip mid-run.

**Session-state model**: `openGates: Map<gateId, GateRecord>` lives in the loop's in-memory state (alongside `monitorHandle`, cursor, mute-set — see `data-model.md § In-memory loop state`). Records are added on `cockpit_gate_open` success, removed on `applied` / `superseded` / `failed` ack. Revised drafts (edit-directive path from Make-changes) re-open under a fresh `generation` — the prior generation's answer is `superseded` on arrival per plan-doc rules.

## Project Structure

```
specs/449-part-cockpit-remote-gates/
├── spec.md                              (unchanged — read-only)
├── clarifications.md                    (unchanged — read-only, source of Q1–Q5)
├── plan.md                              (this file)
├── research.md                          (technology decisions + rationale)
├── data-model.md                        (types: GateRecord, GateOpenParams, GateAnswerEvent, GateAckParams, OpenGatesMap)
├── quickstart.md                        (operator usage: --gates=ui, --gates=local, --gates=auto; expected output; error modes)
└── contracts/
    ├── gates-flag-parse.md              (--gates flag parse; auto resolution; pre-flight absence hard-fail; usage errors)
    ├── ui-gate-mapping.md               (the 10-row G.1–G.7 mapping table: title / body / options / gateId+generation / downstream action per optionId)
    ├── dispatch-d12-gate-answer.md      (D.12 class contract: doorbell line shape, batch item shape, supersession check, ack outcomes)
    ├── ui-mode-fallback.md              (cockpit_gate_open error → local AskUserQuestion for that gate; noted-once ledger rule)
    ├── ui-startup-sweep.md              (Q2=B extended trigger-state set + idempotency-by-gateId)
    └── ledger-ui-mode.md                (Q5=B: gate-open is print-only; D.12 reuses stable action vocabulary + `· source: ui-gate` outcome-slot suffix)

packages/claude-plugin-cockpit/
├── commands/auto.md                     (EDIT — step-1 flag parse; § Dispatch adds D.12; new § UI-mode gate mapping section; step-3 sweep extension; § Ledger adds source: ui-gate rule)
├── lib/                                 (potential NEW files, ref-impl only — TBD in tasks phase; not load-bearing)
└── tests/playbook-verification.test.ts  (EDIT — new 449-* describe block; existing pins on step-1 parse, dispatch table, ledger vocabulary re-pinned to the new contract)
```

**Files intentionally not touched**:
- **Engine / cluster / MCP server code** — the `cockpit_gate_open` and `cockpit_gate_ack` implementations live in `generacy-ai/generacy-cloud` per the epic phase ordering (P1–P3). This ticket assumes those tools are bound; ticket-side testing uses the `--gates=local` byte-path (unchanged) plus fixture-driven UI-mode pins on the playbook text.
- **The other five `commands/*.md` playbooks** (clarify, queue, review, merge, status, watch) — their pinned tests continue to pass unchanged. The `readdirSync(COMMANDS_DIR)` sweep in `playbook-verification.test.ts` also pins them for invocation-vs-`--help` drift; auto.md's edit must not break that sweep.
- **`cockpit-remote-gates-plan.md`** in tetrad-development — spec § Summary directs the reader to that doc for wire contracts. This plan references it, does not rewrite it. Contract changes must be proposed on the epic tracking issue.
- **G.4(e) escalation gate** (§ step 5 Branch B in auto.md) — retained as local-only per Q1=C rationale (per-epic in-memory cursor-fault; no `<issue-ref>` to key a per-issue gate record on).

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo. Applying the plugin-scope `CLAUDE.md` pins:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): `tests/playbook-verification.test.ts` pins auto.md by exact heading strings and contract rules. This plan **re-pins** the step-1 parse, dispatch table, ledger vocabulary, and startup-sweep assertions to the NEW contract (`--gates` flag present, D.12 row present, 10-row mapping table, `· source: ui-gate` rule, Q2=B extended trigger set). No pin is weakened or deleted; the acceptance criterion (spec § Acceptance criteria final clause) is verified by the re-pinned suite going green.
- **Never merge on red / every gate prompts** (auto.md opening paragraph): UI mode moves the presenter (AskUserQuestion → cockpit_gate_open) but preserves the decision policy — the operator still authors every gate outcome from the inbox; the loop still refuses to merge on red. Per-gate auto-approve remains out of scope (spec § Out of scope).
- **Playbook-first, code-second** (existing pattern at `lib/clarification-batch-parser.ts`, `lib/invocation-form-4.ts`): any `lib/` additions are reference implementations of prose contracts, not the source of truth. Model behavior is driven by the playbook prose interpreted at slash-command time.
- **No new external systems / no new APIs bound by this ticket**: `cockpit_gate_open` and `cockpit_gate_ack` are bound by the cluster (epic P1–P3), not by the plugin. No new dependency graph edges introduced by this ticket.

## Key technical decisions (details in research.md)

| Decision | Choice | Rationale (short) | Clarification anchor |
|----------|--------|-------------------|----------------------|
| G.4 subtype representation in the mapping table | One row per subtype G.4a–G.4d (10 rows total: G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7); G.4(e) stays local | Per-subtype option sets diverge; G.4(e) is per-epic in-memory (no `<issue-ref>` to key a gate record on) | Q1=C |
| Startup-sweep trigger set in UI mode | waiting-for:* + persistent label-driven non-waiting-for (`agent:error`, `failed:*`, `completed:validate`+red, `phase-complete`, `blocked:stuck-merge-conflicts`); G.4(e) excluded | These states persist across restart and do not self-re-fire; restricting to waiting-for:* would silently drop them | Q2=B |
| `--gates=ui` with `cockpit_gate_open` absent | Hard-fail at pre-flight with verbatim error; exit non-zero; no ledger dir created | Matches the seven-cockpit-tools presence-check precedent (`Print + exit`); `--gates=auto` is the mode designed to resolve to local on absence — explicit `ui` overrides should fail loud | Q3=A |
| G.7 Add-more-work follow-up in UI mode | Collapse two-turn flow: `Add more work` selection carries prose in `freeText` alongside `optionId`; D.12 routes freeText through the existing intent recognizer | Wire Answer schema's `freeText` field is designed for this (comment: "edit directives, add-work prose, etc."); re-opening a second gate is what single-answer wire avoids | Q4=A |
| Ledger vocabulary for UI-mode dispatch | Gate-open print-only (no ledger row); D.12 writes one row using pre-change `<action>` + `· source: ui-gate` in outcome slot | Reuses the E6 `· source: enriched-line` provenance-suffix convention; grep recipes on stable `<action>` / `<outcome>` strings keep working | Q5=B |
| Presence detection for `--gates=auto` | Two-part: `cockpit_gate_open` bound AND cluster cloud-activated; decided once at pre-flight | Static session properties; avoids mid-run flapping | (implicit in spec FR-002) |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan + the six contracts.
