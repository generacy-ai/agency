# Implementation Plan: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Feature**: The `/cockpit:auto` startup sweep, under `ResolvedGateMode === "ui"`, calls `cockpit_gate_list({ issueRef, gateType: <omitted> })` once per in-scope issue (the tracking ref itself plus every in-scope child; N+1 calls for an N-child epic) BEFORE drafting anything, adopts every non-terminal row into `openGates` with the row's originating `runId` preserved (broad adoption per Q1=A, with the generation-drift branch of FR-013 winning where it applies), mirrors the live-path generation-drift branch for `(gateType == matches, generation differs)` rows (with the `escalation` carve-out preserved), and defers-not-drafts on a per-issue `cockpit_gate_list` error (FR-014).
**Branch**: `471-problem-once-phase-c`
**Status**: Complete
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) (Batch 1 Q1=A broad adoption with FR-013 drift precedence; Q2=A one call per in-scope issue — N+1 for an N-child epic; Q3=A record with `answeredGateSweepCounter = 1` + document the structural limitation + file the follow-up; Q4=A mirror the live-path drift branch with `escalation` carve-out; Q5=D per-issue defer with no new playbook-level retry layer)
**Depends on**: [#469](https://github.com/generacy-ai/agency/issues/469) (Phase C — per-run `runId` threading) must be deployed first. Landed at commit `5b15b70`.
**Repairs**: the accepted consequence documented in #469 spec § "Assumptions → Behaviour change introduced by this phase" — a re-invocation orphans prior-run non-terminal gates because the new `runId` makes their 4-segment `gateId` invisible to the current run's 4-segment pre-draft check.
**Unblocks**: [generacy#1053](https://github.com/generacy-ai/generacy/issues/1053) end-to-end — #469 unblocks the terminal-state re-open case; #471 unblocks the non-terminal-across-runs case.

## Summary

Playbook-prose-only edit on the plugin side, plus playbook-verification test additions and a per-entry `runId` shape change to the `openGates` in-memory record. **No engine changes, no MCP schema changes** — Phase B (generacy#1067) already accepts optional `runId` on all four gate-verb schemas, and `cockpit_gate_list` is deliberately runId-agnostic on functional calls (per #469 FR-011 and this spec's FR-005). generacy-cloud#892 already surfaces `runId` as a first-class field on every `cockpit_gate_list` row; this ticket is the caller wiring that finally consumes it.

Root cause is stated verbatim in `spec.md § Problem`. #469 threaded `runId` into every write-side gate verb and every pre-draft read, so `gateId = hash(issueRef, gateType, generation, runId)` after Phase C. A re-invocation of `/cockpit:auto <same-ref>` (context exhaustion, `Ctrl-C`, cluster restart, machine reboot — all routine) mints a new ledger file, which by #469 FR-001 mints a new `runId`. The startup sweep's pre-draft `cockpit_gate_status({issueRef, gateType, generation, runId})` check derives a 4-segment key that includes the NEW `runId`, returns `absent` for a gate opened by the previous run (that gate carries the OLD `runId`), and drafts a duplicate. The prior run's gate is orphaned — no `openGates` entry in the new run tracks it, so an operator answer resolves no `dispatchClass` and routes nowhere.

This feature changes the startup sweep to **adopt** pre-existing non-terminal gates for every in-scope issue into `openGates` BEFORE drafting anything, using the run-agnostic `cockpit_gate_list({ issueRef, gateType: <omitted> })` surface. Adopted entries carry their **originating** `runId` (read from the list row per generacy-cloud#892), so `openGates` entries can no longer assume a single run-wide `runId`. `cockpit_gate_ack` for an adopted entry targets the originating `runId`, which is accepted-and-ignored on the wire (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; ack targets an existing `gateId`) — the ack works regardless of which run opened the gate.

Six ancillary design points are load-bearing:

1. **Adoption is broad, not scoped** (per Batch 1 Q1=A / FR-009). Every non-terminal row `cockpit_gate_list` returns for an in-scope issue is adopted into `openGates`, including rows whose `(gateType, generation)` does NOT match a natural gate the current run's sweep would draft. `dispatchClass` for such rows is derived from `(gateType, generation)` using the same mapping-table rule the current-run sweep uses. Narrower rules leave orphaned inbox entries — the exact symptom this spec eliminates — most obviously in the common case where a prior run opened `implementation-review` on a child that has since moved to a phase where this run would draft `manual-validation`. An adopted unanswered `open` entry that no longer matches any current-run trigger simply sits in `openGates` and does nothing — the escape hatch only ticks `answered` entries, so nothing churns.

2. **N+1 calls per epic run, not 1** (per Batch 1 Q2=A / FR-001 / SC-008). `cockpit_gate_list` filters by `issueRef` — a single call against the epic ref sees only D.6 and D.7-phase-complete gates on the epic body. The gates that matter — D.1 clarification, D.2 clarification-review, D.3 plan-review, D.4 tasks-review, D.7 implementation-review, D.11 manual-validation — are opened against **child** issues. So the sweep issues one `cockpit_gate_list` per in-scope issue: the tracking ref itself PLUS every in-scope child. For an epic with N in-scope children that is N+1 calls. The count is pinned in FR-001 and asserted in SC-008 so no later "optimisation" back to one call is possible without re-triggering `/clarify`.

3. **Generation-drift on adopted gates mirrors the live-path drift branch** (per Batch 1 Q4=A / FR-013 / SC-010 / SC-011). For a row whose `(issueRef, gateType)` matches a natural gate the current run's sweep would draft but whose `generation` differs, the sweep MUST ack the prior-run gate `superseded` (targeting the prior-run's `runId` — accepted-and-ignored on the ack path) with the same detail the live-path uses, then draft fresh at the current-run generation. Adopting at the stale generation would apply an operator verdict computed against **old content** to **current content** — the correctness hazard `auto.md § Pre-draft check — shared rules → generation-drift branch guard` exists to prevent. FR-013 takes precedence over FR-009 where it applies. **Escalation carve-out preserved**: `gateType: 'escalation'` disables the drift branch (four dispatch rows share the one enum value; upstream generacy#1046). A prior-run `escalation` gate is adopted under FR-009 and left non-terminal.

4. **Adopted `answered` entries record with `answeredGateSweepCounter[gateId] = 1`** (per Batch 1 Q3=A / FR-010 / SC-012). This matches the reuse-answered branch semantics. The structural limitation is stated in FR-010 verbatim rather than implied away: `cockpit_gate_status` returns `{gateId, status}` and `cockpit_gate_list` returns `{gateId, gateType, generation, status, runId}` — neither carries the operator's answer document. The adopted answer is preserved *only if* D.12 redelivery fires; otherwise the escape hatch supersedes after 3 sweeps and re-derives from current labels — which either dispatches correctly (labels moved) or re-asks the operator (they did not). Any path that supersedes immediately guarantees the re-ask even where redelivery would have worked, so this option dominates. Answer-document surface is filed as a Follow-up (out of scope for this phase; requires a cloud-side surface change).

5. **`cockpit_gate_list` on the adoption path MUST NOT carry `runId`** (per FR-005 / #469 FR-011). #469 already forbids `runId` on functional `cockpit_gate_list` calls (cloud contract refines `runId requires generation`; list mode has no `generation`). Extending `runId` filtering to list would foreclose the adoption path by construction. This ticket pins the invariant a second time from the consumer end so a later "improvement" to list-mode filtering (generacy-cloud#894) cannot silently strand this repair. The sole exception is #469's pre-flight capability probe, which is safe only because Phase B's handler drops the field locally before it reaches the cloud endpoint that would 400.

6. **Per-issue defer on `cockpit_gate_list` error, no new retry layer** (per Batch 1 Q5=D / FR-014 / SC-013 / US5). `cockpit_gate_list` already retries internally per `QUERY_RETRY_SCHEDULE` (3 attempts, ~5s backoff, ~20s worst case per `auto.md` probe section) — by the time the playbook sees `status: 'error'` the transient case has been absorbed. Stacking a playbook-level retry on top would add ~35s per failing issue without buying anything, and under N+1 semantics that scales with the epic. Aborting the whole run for one child's transient failure is too blunt. Soft-fail-and-draft silently reintroduces the duplicate-inbox symptom the spec exists to remove. Resolution: on a per-issue `cockpit_gate_list` error, skip BOTH adoption and drafting for that issue this pass, write a ledger row naming the failing issue and the error class, and continue processing every other in-scope issue. This mirrors `auto.md`'s existing sweep-time `cockpit_gate_open` failure pattern (the label is persistent; the event re-fires on the next natural wake).

An additional invariant this phase pins: **`openGates` entries no longer assume a single run-wide `runId`** (per FR-004). Each entry carries its own `runId`. Adopted entries carry the originating `runId` from the list row; entries opened by the current run carry the current run's `runId`. This is a structural change to the in-memory record shape only — no on-wire or on-disk schema change beyond what #469 already introduces, and no on-wire consequence beyond making `cockpit_gate_ack` for an adopted entry target the originating `runId` (accepted-and-ignored on the ack path per generacy `mcp/gates/schemas.ts § GateAckInputSchema`).

`--gates=local` is entirely unaffected (per FR-006 / US4 / SC-005). Under `local` the adoption pass is dead prose — `cockpit_gate_list` is never called, no adoption occurs, no `openGates` entries are recorded across runs. The invariant matches #469 FR-007's local-invariance stance verbatim.

Playbook-verification tests are re-pinned to the new contract — the § step 3 Adoption pass block (call shape, N+1 count, ordering before the synthetic-event pass, UI-mode-only guard, no-`runId` invariant on the functional list call, per-issue error defer), the `openGates` record shape section (per-entry `runId`), the adoption-drift branch (four drift-enabled gateTypes + `escalation` carve-out), and the adopted `answered` counter initialisation. Existing pins that describe the pre-#471 `openGates` shape (single run-wide `runId`) are re-pinned to the NEW per-entry-`runId` shape in the SAME PR, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin).

## Technical Context

**Language / runtime**: The plugin is playbook prose interpreted by the model at slash-command time; no compile-time code path executes it. Reference-implementation TypeScript (if any) lives under `packages/claude-plugin-cockpit/lib/` in the same shape as `lib/gate-wire-types.ts`, `lib/gate-status-check.ts`, `lib/runid.ts` (#469), and `lib/clarification-batch-parser.ts` / `lib/intent-recognition.ts` / `lib/invocation-form-4.ts`. Tests run under `vitest`, matching `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (5148 lines).

**Frameworks / dependencies**:

- **No new runtime deps.** The wire schemas for `runId` on gate verbs already exist upstream (#469 Phase B / generacy#1067). `cockpit_gate_list` rows already carry `runId` as a first-class field per generacy-cloud#892. This ticket consumes those surfaces by reading the row's `runId` at adopt time and by NOT passing `runId` on the wire for the adoption-path `cockpit_gate_list` call.
- **MCP tools consumed (all already bound; none newly introduced by this ticket)**:
  - `cockpit_gate_list` — Phase B added optional `runId` on `CockpitGateListInputSchema` for surface parity; the handler drops the field before the cloud call. **Adoption path calls MUST NOT carry `runId`** (FR-005). The functional call is `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })` — one per in-scope issue per FR-001. The pre-flight capability probe from #469 remains the sole `cockpit_gate_list` call in the run that carries `runId`.
  - `cockpit_gate_ack` — Phase B added optional `runId` on `CockpitGateAckInputSchema`. This ticket does NOT change the ack call site set; it changes only WHICH `runId` value is carried for adopted-entry acks: the originating `runId` from the adopted `openGates` entry (per FR-003), not the current run's. The ack is accepted-and-ignored on the `runId` field server-side (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` drops it before the wire) — this is what lets an ack for a prior-run gate succeed regardless.
  - `cockpit_gate_open` — unchanged from #469's shape; adoption prevents duplicate opens for adopted natural gates (SC-006). The generation-drift branch of FR-013 opens a fresh gate at the current-run generation after superseding the stale one — that open is a normal current-run open carrying the current-run `runId`.
  - `cockpit_status` — used to derive `dispatchClass` and to synthesize follow-up events on the escape hatch's re-derivation path; unchanged by this ticket.
- **Reused verbatim from today's playbook**:
  - The § step 3 startup sweep block (`auto.md:261+`) including the tool-presence check, the answered-gate parked-forever escape hatch and its re-derivation, the UI-mode extended trigger set, the sweep-time `cockpit_gate_open` invocation with `runId` (#469 wiring), the sweep's `gateId idempotency` paragraph (extended by #469 to the 4-input form), the deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure (which the FR-014 defer-on-`cockpit_gate_list`-error rule structurally mirrors), and the sweep's status-table print rule.
  - The § UI-mode gate mapping table and the § Generation discriminator (UI mode) rules that supply the `dispatchClass` derivation from `(gateType, generation)`.
  - The § Pre-draft check — shared rules block, specifically the generation-drift branch guard (four drift-enabled gateTypes; `escalation` carve-out preserved).
  - The § step 3 / § step 4 sub-step 0 answered-gate parked-forever escape hatch — adopted `answered` entries feed the same counter this block ticks.
  - The § step 3 § Escape-hatch re-derivation block — adopted entries are subject to the same re-derivation on hatch fire.
  - The § D.12 gate-answer routing and `cockpit_gate_ack` shape — adopted entries flow through the same routing on operator answer.
  - The § Ledger `Narrow amendment` and the per-issue defer ledger-row shape established by the § step 3 sweep-time `cockpit_gate_open` failure pattern (FR-014 re-uses this pattern's shape for the adoption-path failure).

**The adoption pass adds one new block before the synthetic-event pass in § step 3 — no downstream flow is restructured.** Every existing branch preserves its behaviour under `ResolvedGateMode === "local"` and under the "no prior-run non-terminal gates present" fresh-invocation path (in which the N+1 `cockpit_gate_list` calls return `gates: []` and the adoption pass is a no-op).

**Boundaries preserved**:

- **`--gates=local` byte-path unchanged** (per FR-006 / US4 / SC-005). Under `local`, `cockpit_gate_list` is never called on the adoption path, no `openGates` entries are adopted, and the § step 3 sweep behaves exactly as today. Every existing local-mode test passes without modification.
- **Never merge on red / every gate prompts** (auto.md opening paragraph) unaffected. Adoption changes WHICH `openGates` entry tracks a natural decision, not WHETHER the operator is prompted or WHAT they see. An adopted `open` entry the operator has already been considering remains presented in the operator inbox — this ticket does not touch the presentation surface, only the plugin's in-memory tracking.
- **No engine changes / no MCP schema changes.** `runId` acceptance on all four gate-verb schemas is bound by #469 Phase B. The list-row `runId` field is bound by generacy-cloud#892. Any deviation from the frozen shape is proposed on those tickets, not patched here.
- **Playbook-first, code-second.** Any TypeScript added under `lib/` is a reference implementation of the prose, not the source of truth. An `lib/adoption.ts` reference module (if added) mirrors the shape of `lib/runid.ts` (types + short guard functions with unit-testable fixtures).
- **UI mode only.** The adoption pass targets `ResolvedGateMode === "ui"`. `--gates=local` is out of scope for adoption per FR-006; `--gates=auto` that resolves to `local` inherits the local byte-path.
- **Generation-drift branch guard preserved.** For `gateType: 'escalation'`, the drift branch is DISABLED (per `auto.md § Pre-draft check — shared rules → generation-drift branch guard`). FR-013 mirrors the live-path branch, which means the adoption path inherits the same carve-out — a prior-run `escalation` gate is adopted per FR-009 and left non-terminal; it is NOT superseded on generation drift.
- **#469's `runId` threading discipline preserved.** Adoption does NOT re-derive `runId`; it READS the row's `runId` field. The compute-once invariant #469 pinned still holds for the current run's `runId`; adopted entries carry a DIFFERENT `runId` (the row's), which is orthogonal to the current run's compute-once rule.

**Session-state model**: extends the § In-memory loop state additions (UI mode) block already extended by #449, #457, and #469 with a per-entry shape change to `openGates`:

- `openGates: Map<gateId, GateRecord>` — the record type gains a mandatory `runId: string` field (previously read from the single run-wide `runId` on loop state; now read from the per-entry field). For entries opened by the current run, the field carries the current run's `runId`. For entries adopted from `cockpit_gate_list`, the field carries the originating `runId` from the list row. The `dispatchClass`, `gateType`, `generation`, `issueRef`, `status`, and `transitionClass` fields are unchanged in shape from the reuse-answered branch (§ step 3 sweep `gateId idempotency` paragraph) established by #457. `inboxUrl`, `title`, `askedAt`, and `originalDraft` are NOT populated on adopted entries — the `cockpit_gate_list` return shape does not carry them, matching the DATA GAP the reuse path already tolerates.
- `answeredGateSweepCounter` — unchanged. Adopted `answered` entries initialise the counter to `1` (per FR-010 / SC-012), matching the reuse-answered branch.
- No new loop-state fields are added. The adoption pass is stateless across sweeps — it runs once at startup; the entries it adds live in `openGates` for the rest of the run.

Under `local` the `openGates` map is not populated at all (the map is UI-mode-only per #457 / #449), so the per-entry `runId` field is dead prose there.

## Approach

The change adds one new block before the synthetic-event pass in § step 3, one shape change to the `openGates` record, one prose reference update in the § step 3 `gateId idempotency` paragraph (to name adoption as the ordering primitive that keeps sweep-time `cockpit_gate_open` from duplicating an adopted natural gate), and one new failure-mode row in the sweep-time error handling. Every existing flow shape is unchanged; every existing branch preserves its behaviour under the "no prior-run non-terminal gates" fresh-invocation path.

### § step 3 § Adoption pass (UI mode) — new block

Inserted at the top of § step 3, immediately after the tool-presence check and the answered-gate parked-forever escape hatch (§ Answered-gate parked-forever escape hatch), and BEFORE the § Synthetic-event dispatch block. Contract: `contracts/adoption-sweep.md`. Under `ResolvedGateMode === "local"` the entire block is dead prose (no `cockpit_gate_list` calls, no adoption, no ledger rows).

1. **Enumerate in-scope issues.** The set is the tracking ref itself PLUS every in-scope child. In epic mode (`invocationForm: epic`), the set is `[<epic-ref>] ++ epic.inScopeChildren`. In epic-less modes (`invocationForm: tracking-existing | tracking-new | tracking-list`), the set is `[<tracking-ref>] ++ trackingIssue.taskListRefs`. Read the child set from the SAME `cockpit_status(epic|issue=<ref>, json=true)` call the synthetic-event pass immediately below already issues — the adoption pass reuses that call's result rather than re-querying (one call per run, shared with the sweep). If `cockpit_status` fails, that failure is already handled by the § step 3 tool-presence-check / existing sweep error path; adoption inherits.

2. **For each in-scope issue, call `cockpit_gate_list`.** Exactly one call per in-scope issue: `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })`. The `runId` field MUST NOT be present on the payload (per FR-005). For an epic-mode run against an epic with N in-scope children this is exactly N+1 calls (per FR-001 / SC-008).

3. **Classify per return:**
   - `{ status: 'ok', gates: [...] }` → proceed to step 4 with the returned rows for this issue.
   - `{ status: 'error', class: <any>, detail: <any> }` → skip both adoption AND drafting for THIS issue this pass (per FR-014 / SC-013). Write a ledger row naming the issue and the error class (see § Ledger row shape below). Continue with the next in-scope issue; do NOT abort the run. The underlying label(s) that would trigger the drafted gate remain persistent, so the event re-fires on the main loop's next natural wake — matching the existing sweep-time `cockpit_gate_open` failure pattern (`auto.md`).

4. **For each returned non-terminal row `(gateId, gateType, generation, status, runId)`:**
   1. **Compute `dispatchClass`** from `(gateType, generation)` using the SAME mapping-table rule the current-run sweep uses (per § UI-mode gate mapping / § Generation discriminator (UI mode)). This is the plugin's mapping — the row itself does not carry `dispatchClass` (per generacy-cloud row shape).
   2. **Check for a natural-gate match** against the current-run sweep's would-draft set for THIS issue:
      - If `(issueRef, gateType, generation)` matches a natural gate the current-run sweep would draft, this is a same-generation match. Adopt: add the row to `openGates` under `gateId` with `{gateId, gateType, generation, status, runId: <row.runId>, issueRef, dispatchClass}` (per FR-002 / FR-003 / FR-008). No ack fires; no fresh open fires for this natural gate this pass (per SC-006).
      - Else if `(issueRef, gateType)` matches a natural gate the current-run sweep would draft but `generation` differs, this is the **generation-drift branch (FR-013)**. Precedence: FR-013 wins over FR-009 for this row. Apply the § step 4a below.
      - Else this is a **non-matching row** (broad adoption per FR-009). Adopt: add the row to `openGates` under `gateId` with the same fields, and DO NOT draft anything for this row (it is not in the current run's trigger set). The record's `dispatchClass` is still resolvable from the mapping-table rule (FR-008), so if the operator answers it, D.12 routes on `(dispatchClass, optionId)`.
   3. **If the adopted row's `status` is `'answered'`**, initialise `answeredGateSweepCounter[gateId] = 1` (per FR-010 / SC-012). This matches the reuse-answered branch. The answer-document limitation is documented in § step 3 Adoption pass prose (see § Load-bearing prose changes below).

5. **§ step 4a — Generation-drift branch on adoption.** For a row whose `(issueRef, gateType)` matches a natural gate the current-run sweep would draft but whose `generation` differs, and whose `gateType` is one of `{clarification, artifact-review, implementation-review, manual-validation}`:
   1. Call `cockpit_gate_ack({ gateId: <row.gateId>, outcome: 'superseded', detail: '<live-path drift-branch detail string, verbatim>', runId: <row.runId> })`. The ack carries the row's originating `runId` (per FR-003). Server-side, the ack's `runId` is accepted-and-ignored (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`), so the ack works regardless of which run opened the gate.
   2. Do NOT add the superseded row to `openGates`. The gate is now terminal (`superseded`) and invisible to future `cockpit_gate_list` calls.
   3. **Do NOT draft a fresh gate here.** The current-run sweep's own synthetic-event pass (immediately below the adoption block) will produce the natural-gate event for this issue, which routes through the drafting D.n dispatch and opens the fresh gate at the current-run generation via `cockpit_gate_open`. The adoption pass's job is to CLEAR the stale gate; the drafting is the sweep's job. This ordering keeps the sweep and the live path symmetric: at both, the ack-supersede-then-draft happens as one operator-visible transition (one gate goes away, one gate appears).

   **Escalation carve-out (FR-013 / SC-011):** for `gateType: 'escalation'` the drift branch is DISABLED (per `auto.md § Pre-draft check — shared rules → generation-drift branch guard`, established by #457, upstream generacy#1046). A prior-run `escalation` gate is adopted per FR-009 at its `(gateType, generation)` and left non-terminal; the adoption pass does NOT ack it `superseded`.

6. **Ordering guarantees.**
   - The adoption pass runs AFTER #469's pre-flight capability probe and AFTER the § step 3 tool-presence check.
   - The adoption pass runs BEFORE the § Synthetic-event dispatch block and BEFORE ANY per-event D.n Step 0 pre-draft check.
   - The § step 3 sweep-time `cockpit_gate_open` calls in the extended trigger set (which fire from the synthetic-event pass's dispatch) find adopted natural gates already in `openGates`, so they issue no duplicate `cockpit_gate_open` for the natural gate that was adopted (per SC-006). The existing `gateId idempotency` paragraph is updated to name adoption as this ordering primitive (see § Load-bearing prose changes below).

### `openGates` record shape change (per-entry `runId`)

The § In-memory loop state additions (UI mode) block's `openGates` record documentation is extended to declare `runId: string` as a mandatory per-entry field. Contract: `data-model.md § GateRecord`.

- **Current-run entries**: `runId` equals the current run's loop-state `runId` (per #469). Site: every current-run sweep-time or live-path `cockpit_gate_open` success adds an entry with the current-run `runId`.
- **Adopted entries**: `runId` equals the row's `runId` from `cockpit_gate_list`. Site: the § Adoption pass block above.

Every downstream site that reads `runId` from loop state for a specific `openGates` entry MUST read `openGates[gateId].runId`, not the run-wide loop-state `runId`. The two sites that matter:

1. **`cockpit_gate_ack` for an entry in `openGates`** — reads `openGates[gateId].runId` and passes it verbatim. Sites: § step 3 / § step 4 sub-step 0 answered-gate escape hatch's `cockpit_gate_ack(gateId, 'superseded', ...)`; § D.12 gate-answer step 5's `cockpit_gate_ack(gateId, 'applied' | ...)`; § D.12 step 3's live-state supersession `cockpit_gate_ack(gateId, 'superseded', ...)`. The step 1 no-record ack (`auto.md § D.12 step 1`) has no `openGates` entry to read from and continues to use the current-run `runId` (matching #469's shape).
2. **The `answeredGateSweepCounter` escape-hatch re-derivation** (§ step 3 / § step 4 sub-step 0 § Escape-hatch re-derivation) — the ack site above; the re-derivation itself does not touch `runId`.

The `dispatchClass` mandatory-on-reuse rule established by #457 is unchanged; adopted entries populate `dispatchClass` per the same mapping-table rule.

### Load-bearing prose changes to `auto.md`

Surgical edits, all in `auto.md § step 3` and the paragraph shared with #469:

1. **New block: § step 3 § Adoption pass (UI mode)** — insert immediately after the § Answered-gate parked-forever escape hatch block and BEFORE the § Synthetic-event dispatch block. The block states verbatim: the call shape (`cockpit_gate_list({ issueRef, gateType: <omitted> })` — no `runId`); the N+1 count for an N-child epic; the broad-adoption rule (FR-009); the generation-drift branch (FR-013) with the `escalation` carve-out; the adopted `answered` counter initialisation (`answeredGateSweepCounter[gateId] = 1`, FR-010); the per-issue defer-on-error rule (FR-014); the FR-005 no-`runId` invariant on the functional list call; the FR-006 UI-mode-only guard; the ordering guarantees (after probe + tool-presence check + escape-hatch tick; before synthetic-event pass).
2. **§ step 3 § In-memory loop state additions (UI mode) block** — extend the `openGates` record documentation to declare per-entry `runId`. State verbatim that current-run entries carry the current-run `runId` and adopted entries carry the row's originating `runId`, and that `cockpit_gate_ack` for an `openGates` entry reads `openGates[gateId].runId` (NOT the run-wide loop-state `runId`).
3. **§ step 3 § gateId idempotency paragraph** (`auto.md:317` post-#469, at the sweep-time `cockpit_gate_open` block) — extend the paragraph to name adoption as the ordering primitive that prevents the sweep-time `cockpit_gate_open` from duplicating an adopted natural gate. Two sites cooperate: the § Adoption pass writes the prior-run row into `openGates` at startup, and every D.n Step 0 `absent` sub-branch (D.1 / D.2 / D.3 / D.4 / D.7 / D.11) calls the runId-agnostic `cockpit_gate_list` and adopts a same-generation prior-run row rather than drafting fresh. The prior-run row's `gateId` and the current-run derivation produce DIFFERENT 4-segment `gateId`s (because the two runs' `runId`s differ — per §  gateId idempotency), so the current-run `cockpit_gate_status` at the current `gateId` returns `absent`; Step 0's same-generation `absent` sub-branch then finds the row in the runId-agnostic list and adopts, suppressing the duplicate open. On the drift branch (different generation), the adoption pass or Step 0's drift branch acks the stale gate `superseded` FIRST, and this run's fresh `cockpit_gate_open` at the current-run generation and `runId` produces the SOLE remaining open under a DIFFERENT `gateId`. Preserve every existing sentence in the paragraph verbatim.
4. **§ step 3 § Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure paragraph** — add a companion paragraph immediately after: § Deferred-to-loop behavior on adoption-path `cockpit_gate_list` failure, describing the FR-014 defer-not-draft rule and pointing at the same ledger-row pattern.
5. **§ step 3 § Answered-gate parked-forever escape hatch → § Escape-hatch re-derivation** — update the `cockpit_gate_ack(gateId, 'superseded', ...)` line to state verbatim that `runId` is read from `openGates[gateId].runId` (not the run-wide loop-state `runId`), so that adopted-entry escape-hatch acks target the originating `runId`. Same edit at § step 4 sub-step 0 per-wake escape hatch.
6. **§ D.12 gate-answer step 5 (operator apply) `cockpit_gate_ack`** — update to state verbatim that `runId` is read from `openGates[event.gateId].runId`.
7. **§ D.12 gate-answer step 3 (live-state supersession) `cockpit_gate_ack`** — update to state verbatim that `runId` is read from `openGates[gateId].runId`.

The § D.12 gate-answer step 1 no-record ack keeps the run-wide loop-state `runId` (no `openGates` entry exists to read from — the drop path is exactly the case where the ack cannot target an entry's originating run).

### Test edits (`playbook-verification.test.ts`)

Add a new `describe("471 startup-sweep adoption", () => { ... })` block at the end of the file (after the existing #469 block). New assertions:

- **471-1**: § step 3 declares a § Adoption pass (UI mode) block positioned immediately after § Answered-gate parked-forever escape hatch and BEFORE § Synthetic-event dispatch.
- **471-2**: § Adoption pass declares the call shape `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })` verbatim, with no `runId` field.
- **471-3**: § Adoption pass declares the N+1 count rule verbatim: exactly one `cockpit_gate_list` per in-scope issue (tracking ref + every in-scope child).
- **471-4**: § Adoption pass declares the broad-adoption rule (FR-009): every non-terminal row for an in-scope issue is adopted into `openGates`, including rows whose `(gateType, generation)` does not match a natural gate the current run would draft.
- **471-5**: § Adoption pass declares the FR-013 generation-drift branch: for `(issueRef, gateType)` matches with differing `generation` and `gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}`, ack `superseded` targeting the row's `runId`.
- **471-6**: § Adoption pass declares the `escalation` carve-out verbatim: `gateType: 'escalation'` disables the drift branch on adoption; a prior-run `escalation` gate is adopted at its `(gateType, generation)` and left non-terminal.
- **471-7**: § Adoption pass declares the adopted-`answered` counter initialisation: `answeredGateSweepCounter[gateId] = 1` at adopt time.
- **471-8**: § Adoption pass declares the FR-014 defer-not-draft rule verbatim: on a per-issue `cockpit_gate_list` error, skip BOTH adoption and drafting for that issue, write a ledger row, continue with other issues, do not abort.
- **471-9**: § Adoption pass declares the FR-006 UI-mode-only guard: the block is dead prose under `ResolvedGateMode === "local"`.
- **471-10**: § Adoption pass declares the FR-005 no-`runId` invariant on the functional list call verbatim.
- **471-11**: § In-memory loop state additions declares `openGates` records carry a per-entry `runId` field. Current-run entries carry the current-run `runId`; adopted entries carry the row's originating `runId`.
- **471-12**: § step 3 § gateId idempotency paragraph names adoption as the ordering primitive that prevents sweep-time `cockpit_gate_open` from duplicating an adopted natural gate.
- **471-13**: § step 3 / § step 4 sub-step 0 escape-hatch `cockpit_gate_ack(superseded)` reads `runId` from `openGates[gateId].runId` (not the run-wide loop-state `runId`).
- **471-14**: § D.12 gate-answer step 5's `cockpit_gate_ack` reads `runId` from `openGates[event.gateId].runId`.
- **471-15**: § D.12 gate-answer step 3's live-state supersession `cockpit_gate_ack` reads `runId` from `openGates[gateId].runId`.
- **471-16**: § D.12 gate-answer step 1 no-record ack continues to use the run-wide loop-state `runId` (no `openGates` entry exists to read from on the drop path — preserve pre-#471 behaviour).
- **471-17**: The Follow-up (answer-document surface) is declared as out-of-scope prose in § Adoption pass — the adopted-`answered` limitation ("answer preserved only if D.12 redelivery fires; otherwise escape hatch re-asks after 3 sweeps") is stated verbatim rather than implied away.
- **471-18**: `--gates=local` byte-path invariance — no `cockpit_gate_list` occurs on the adoption path under `local`. Grep on the `local` branch of § step 3 confirms zero adoption-path `cockpit_gate_list` occurrences.

Existing pins on the § step 3 sweep, § In-memory loop state additions, § step 3 / § step 4 sub-step 0 escape hatch, and § D.12 that quote the OLD single-run-wide-`runId` `openGates` shape are **re-pinned to the new per-entry-`runId` shape in the same PR**, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin).

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo (verified: `find /workspaces/agency/.specify -type f` returns only templates under `.specify/templates/`). Applying the plugin-scope `CLAUDE.md` pins:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins `commands/auto.md` by exact heading strings and contract rules. This plan **re-pins** the § step 3 sweep, § In-memory loop state additions, § step 3 / § step 4 sub-step 0 escape hatch, and § D.12 to the NEW per-entry-`runId` shape. New pins are added under a `describe("471 startup-sweep adoption")` block. No pin is weakened or deleted; the acceptance criterion (spec § US1, US2, US3, US4, US5 and SC-001 through SC-013) is verified by the re-pinned suite going green.
- **Never merge on red / every gate prompts** (auto.md opening paragraph): adoption changes WHICH `openGates` entry tracks a natural decision, not WHETHER the operator is prompted or WHAT they see. Every existing pending gate still requires an operator answer; nothing auto-proceeds; per-gate auto-approve stays out of scope.
- **Playbook-first, code-second** (existing pattern at `lib/gate-wire-types.ts`, `lib/gate-status-check.ts`, `lib/runid.ts`, `lib/clarification-batch-parser.ts`): any `lib/` additions are reference implementations of prose contracts, not the source of truth. If a `lib/adoption.ts` reference module is added under this ticket, its shape mirrors `lib/runid.ts` (types + short guard functions with unit-testable fixtures).
- **No new external systems / no new APIs bound by this ticket**: `runId` acceptance on `cockpit_gate_ack` is bound by #469 Phase B; row-level `runId` field on `cockpit_gate_list` returns is bound by generacy-cloud#892. No new dependency-graph edges introduced by this ticket.
- **Backwards compatibility across the runId-capability boundary**: under `runIdEnabled === false` (pre-#1067 cluster; #469's graceful-degradation branch), the adoption pass still runs — `cockpit_gate_list` remains bound (the cluster's tool binding predates its `runId`-optional schema; the field is simply not sent) and the list rows still carry `runId` because the ROW-level field is a cloud storage/return concern (generacy-cloud#892) orthogonal to the MCP input-schema layer. Adopted-entry acks pass the row's `runId`, which the ack layer accepts-and-ignores identically regardless of the cluster's `runIdEnabled` posture. The adoption pass is therefore capability-independent of #469's probe outcome (verified in this plan; asserted in the test suite at pin 471-2 by pinning the call shape as having no `runId` field on the functional call).

## Project Structure

### Documentation (this feature)

```text
specs/471-problem-once-phase-c/
├── spec.md                       (unchanged — read-only)
├── clarifications.md             (unchanged — read-only, source of Batch 1 Q1–Q5)
├── conversation-log.jsonl        (unchanged — event log)
├── plan.md                       (this file)
├── research.md                   (technology decisions + rationale + clarification anchors)
├── data-model.md                 (types: AdoptedGateRecord, extended GateRecord shape with per-entry runId, CockpitGateListRow shape, validation rules)
├── quickstart.md                 (operator usage; reproduce-duplicate-inbox-across-runs demo; adopted-answer / drift / defer flows)
├── contracts/
│   ├── adoption-sweep.md         (§ step 3 § Adoption pass call shape, N+1 count, ordering, UI-mode guard, no-runId invariant)
│   ├── adoption-drift.md         (§ step 4a generation-drift branch on adoption; escalation carve-out; ack-supersede semantics)
│   └── adoption-error-defer.md   (FR-014 per-issue defer-not-draft on cockpit_gate_list error; ledger row shape; no new retry layer)
├── checklists/                   (empty; populated by /checklist if invoked)
└── tasks.md                      (Generated by /speckit:tasks)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/auto.md                     (EDIT — insert § step 3 § Adoption pass (UI mode) block after § Answered-gate parked-forever escape hatch and before § Synthetic-event dispatch; extend § In-memory loop state additions (UI mode) to declare per-entry runId on openGates records; extend § step 3 § gateId idempotency paragraph to name adoption as the ordering primitive; add § Deferred-to-loop behavior on adoption-path cockpit_gate_list failure paragraph mirroring the sweep-time cockpit_gate_open failure pattern; update § step 3 / § step 4 sub-step 0 escape-hatch acks and § D.12 steps 3 and 5 acks to read runId from openGates[gateId].runId)
├── lib/                                 (potential NEW file, ref-impl only — TBD in tasks phase; NOT load-bearing)
│   └── adoption.ts                      (OPTIONAL — reference guard functions for the adoption classifier: buildAdoptedRecord, classifyRowVsCurrentSweep, initialiseAnsweredCounter, defer-on-error decision; fixtures pinned by test. Mirrors lib/runid.ts shape.)
└── tests/playbook-verification.test.ts  (EDIT — new `describe("471 startup-sweep adoption")` block with 18 assertions; existing pins on § step 3 sweep, § In-memory loop state additions, § step 3 / § step 4 sub-step 0 escape hatch, § D.12 steps 3 and 5 that quote the pre-#471 single-run-wide-runId shape are re-pinned to the new per-entry-runId shape)
```

**Files intentionally not touched**:

- **Engine / cluster / MCP server code** — nothing new is needed. `runId` acceptance on all four gate-verb schemas is bound by #469 Phase B (generacy#1067). `cockpit_gate_list` remains runId-agnostic on the wire per #469's design and this ticket's FR-005.
- **Cloud code** (generacy-cloud) — `runId` on `cockpit_gate_list` rows is bound by generacy-cloud#892. No cloud change here. The answer-document surface (a would-be `answer` field on `cockpit_gate_status` returns, or a new `cockpit_gate_answer_fetch`) is filed as a Follow-up on this issue after landing.
- **The other five `commands/*.md` playbooks** (clarify, queue, review, merge, status, watch) — none of them run the startup sweep or manage `openGates`. The `readdirSync(COMMANDS_DIR)` sweep in `playbook-verification.test.ts` pins them for invocation-vs-`--help` drift; the edit to auto.md must not break that sweep.
- **`cockpit-remote-gates-plan.md`** in tetrad-development — this plan references the epic doc's Wire contracts and Idempotency sections. Contract changes must be proposed on the epic tracking issue.
- **D.5, D.9 / D.9a–D.9d** — no gate, no change; the adoption pass doesn't reach them.
- **`--gates=local` byte-path** — invariance is the whole point of FR-006; not touched. `local` tests pass unchanged.
- **Session-resume semantics for `/cockpit:auto`** — still out of scope (per #469's Batch 2 Q6, unchanged). This spec repairs cross-run gate VISIBILITY; it does not introduce session identity. A re-invocation remains definitionally a new run.
- **Answer-document surface for adopted `answered` gates** (FR-010 Follow-up) — requires a cloud-side surface change; filed as a separate issue against generacy-cloud after this repair lands.

## Key technical decisions (details in research.md)

| Decision | Choice | Rationale (short) | Clarification anchor |
|----------|--------|-------------------|----------------------|
| Adoption scope | Broad — adopt every non-terminal row for every in-scope issue, including rows whose `(gateType, generation)` does NOT match any natural gate the current run would draft | Narrower rules (adopt only matching rows) leave the exact orphaned-inbox-entry symptom this spec exists to eliminate — most obviously a prior-run `implementation-review` on a child now in `manual-validation` phase. An unanswered adopted `open` entry sits in `openGates` and does nothing (escape hatch only ticks `answered`), so the "false positive" cost is nil. Answered entries route via `dispatchClass` regardless. | Batch 1 Q1=A (FR-009 / SC-009) |
| `cockpit_gate_list` call granularity | Per in-scope issue — N+1 calls for an N-child epic | `cockpit_gate_list` filters by `issueRef`. The gates that matter (D.1 clarification, D.2 clarification-review, D.3 plan-review, D.4 tasks-review, D.7 implementation-review, D.11 manual-validation) are opened against **child** issues; one call against the epic ref sees only D.6 / D.7-phase-complete gates on the epic body. A per-tracking-ref implementation implements the repair for the rarest case and leaves the common one exactly as broken as before. Cost is N+1 startup calls once per run; each is a bounded 500-cap scan. | Batch 1 Q2=A (FR-001 / SC-008) |
| Adopted `answered` gate dispatch | Record with `answeredGateSweepCounter = 1` (matching reuse-answered); document the structural limitation; file the follow-up | No MCP surface returns the answer document — `cockpit_gate_status` returns `{gateId, status}`, `cockpit_gate_list` returns `{gateId, gateType, generation, status, runId}`. The current run structurally cannot consume a prior-run answer on its own. If D.12 redelivery fires, the answer is consumed via existing `deliveryId` dedup; otherwise the escape hatch supersedes after 3 sweeps and re-derives from current labels (dispatches correctly if labels moved; re-asks the operator if they did not). Any option that supersedes immediately guarantees the re-ask even where redelivery would have worked. | Batch 1 Q3=A (FR-010 / SC-012 / Follow-up) |
| Generation-drift on adopted gate | Mirror the live-path drift branch (ack `superseded` + draft fresh), with `escalation` carve-out preserved | Adopting at the stale generation applies an operator verdict computed against **old content** to **current content** — the exact hazard the live-path drift branch exists to prevent. Keeping the sweep and the live path symmetric leaves one drift rule to reason about, not two that can diverge. `escalation` disabled because four dispatch rows share the one enum value with no wire subtype discriminator (upstream generacy#1046). | Batch 1 Q4=A (FR-013 / SC-010 / SC-011) |
| `cockpit_gate_list` failure on adoption path | Per-issue defer — skip both adoption AND drafting for the failing issue; write a ledger row; do NOT abort; do NOT add a new playbook-level retry | Aborting the whole run for one child's transient failure is too blunt (blast radius under Q2=A is N+1 issues). Soft-fail-and-draft silently reintroduces the duplicate-inbox symptom this spec exists to remove. Stacking a playbook-level retry on top of `cockpit_gate_list`'s existing `QUERY_RETRY_SCHEDULE` (3 attempts, ~5s backoff, ~20s worst case) adds ~35s per failing issue without buying anything — by the time the playbook sees `status: 'error'`, the transient case has been absorbed. The label is persistent; the event re-fires on the main loop's next natural wake. Mirrors the existing sweep-time `cockpit_gate_open` failure pattern. | Batch 1 Q5=D (FR-014 / SC-013 / US5) |
| `runId` on adoption-path `cockpit_gate_list` | FORBIDDEN — the functional list call carries no `runId` field | Reinforces #469 FR-011 from the consumer end. Cloud contract refines `runId requires generation`; list mode has no `generation`; forwarding `runId` would 400. Also foreclosing runId filtering on list (generacy-cloud#894) at the same time would foreclose this repair before it is built — pinning the invariant twice (once at the producer, once at the consumer) is the durable defence. | FR-005 (reinforces #469 FR-011) |
| `openGates` record shape | Per-entry `runId` field | An adopted entry's originating `runId` is DIFFERENT from the current run's `runId`. A single run-wide `runId` on loop state cannot represent both. Every downstream ack for an `openGates` entry MUST target the entry's `runId`, not the loop-state `runId`, or acks for adopted entries would carry the wrong (or absent) `runId` on the wire. Server-side accept-and-ignore semantics on the ack path mean the ack still succeeds either way, but the intent-encoded value on the wire matters for audit/trace parity with `cockpit_gate_open`. | FR-003 / FR-004 |
| Landing order | Do not land Phase C (#471) before Phase C predecessor (#469) is deployed | The pre-draft check's 4-segment `gateId` is what surfaces the cross-run duplicate to fix. Without #469 there is no `runId` on the wire and the duplicate does not exist — this repair has nothing to repair. | Depends-on line above / #469 FR-008 |

## Complexity Tracking

No constitution file → no violations to justify. The added `openGates` per-entry `runId` field and the new § Adoption pass block are the minimum surface required to satisfy the FR-001 through FR-014 set; no simpler alternative was proposed in the clarifications that satisfies both US1 (no orphan) and US4 (`--gates=local` invariance).

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan + the three contracts.
