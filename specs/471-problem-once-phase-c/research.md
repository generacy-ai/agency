# Research: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Feature**: [spec.md](./spec.md)
**Branch**: `471-problem-once-phase-c`
**Depends on**: #469 (Phase C — per-run `runId` threading), commit `5b15b70`

This document records the decisions clarified in [clarifications.md](./clarifications.md) Batch 1 (2026-07-29) and the surrounding technology / pattern anchors that make each decision durable. Every decision below is anchored to a specific FR/SC in [spec.md](./spec.md) so a reviewer can trace prose → rule.

## R1 — Adoption scope: broad or scoped?

**Decision**: **Broad — adopt every non-terminal `cockpit_gate_list` row for every in-scope issue, with FR-013 generation-drift precedence.** Anchor: Batch 1 Q1=A → FR-009 / SC-009.

**Alternatives considered**:

- **Scoped adopt (Q1 option B)** — adopt only rows whose `(gateType, generation)` matches a natural gate the current-run sweep would draft. Rejected because it leaves non-matching rows orphaned, and an orphaned gate is the entire symptom this issue exists to remove. Narrowing the repair to the subset that needs it least is not a trade-off — it is a partial fix that will read as a complete one. Common failure case: a prior run opened `implementation-review` on a child that has since moved to a phase where this run would draft `manual-validation`. Under B the old gate is still open, still unanswered, still visible in the inbox, and untracked forever.
- **Adopt-and-ack-supersede on generation mismatch (Q1 option C)** — a middle-ground rule. Absorbed into option A + FR-013 (drift precedence): C's "adopt matches; supersede-and-draft on generation drift" IS the interaction of A and FR-013, made explicit as a precedence rule. Not rejected — refined.

**Pattern reference**: the reuse-answered branch (`auto.md § step 3 sweep 'gateId idempotency' → 'Plugin-side, on a cockpit_gate_status reuse-return'`) already records partial `openGates` entries with `dispatchClass` derived from the mapping-table row. Broad adoption re-uses that shape for a superset of rows.

**Safety of adopting non-matching rows**: an adopted `open` entry sits in `openGates` and does nothing — the escape hatch only ticks `answered` entries. `dispatchClass` is derived from `(gateType, generation)` by the same rule the current-run sweep uses, so if the operator answers it, D.12 routes on `(dispatchClass, optionId)`. No churn, no wrong action, no false-positive dispatch.

## R2 — `cockpit_gate_list` call granularity: per tracking ref vs per in-scope issue

**Decision**: **Per in-scope issue — one call per issue in scope (tracking ref + every in-scope child); N+1 calls for an N-child epic.** Anchor: Batch 1 Q2=A → FR-001 / SC-008.

**Alternatives considered**:

- **Per tracking ref, one call (Q2 option B)** — literal reading of FR-001 as originally drafted. Rejected because `cockpit_gate_list` filters by `issueRef`: one call against the epic ref sees only D.6 and D.7-phase-complete gates on the epic body. The gates that matter (D.1 clarification, D.2 clarification-review, D.3 plan-review, D.4 tasks-review, D.7 implementation-review, D.11 manual-validation) are opened against **child** issues and would remain orphaned. Implements the repair for the rarest case; leaves the common case (session dying with a clarification gate open on a child) exactly as broken as before.
- **Cross-issue list surface (Q2 option C)** — add a new/extended `cockpit_gate_list` mode that returns every non-terminal gate under a tracking-ref's transitive scope in one call. Requires an upstream generacy change; forbidden by the spec's "Out of Scope" clause on MCP schema changes and by the "no engine changes / no MCP schema changes" boundary in Phase C.
- **Per-issue call only for issues the sweep would draft for (Q2 option D)** — misses precisely the orphans. A gate can be open on a child whose labels have since moved — that is one of the ways a gate gets orphaned in the first place — and those issues would not be in the current-run trigger set.

**Cost**: N+1 startup calls once per run. Each call is a bounded 500-cap scan (per the tool boundary). The sweep already does per-issue work — the added per-issue read is amortised against work the sweep already performs. Pinned in the spec (SC-008) so no later "optimisation" back to one call is possible without re-triggering `/clarify`.

## R3 — Adopted `answered` gate dispatch mechanism

**Decision**: **Record with `answeredGateSweepCounter[gateId] = 1` (matching the reuse-answered branch); document the structural limitation verbatim; file the follow-up.** Anchor: Batch 1 Q3=A → FR-010 / SC-012 / Follow-up.

**Alternatives considered**:

- **Adopt-time answer fetch (Q3 option B)** — call a new/extended MCP surface at adopt time to fetch the answer document (e.g. `cockpit_gate_status` extended to return `answer` on `status: 'answered'`, or a dedicated `cockpit_gate_answer_fetch`). Requires an upstream generacy change; out of scope this phase. Filed as Follow-up.
- **Force D.12 redelivery at adopt time (Q3 option C)** — a cloud call that triggers redelivery for the adopted `gateId` targeting the current run. Requires new cloud behaviour; out of scope this phase.
- **Ack-superseded on adoption for `answered` (Q3 option D — retreat from FR-010)** — treat adopted `answered` entries identically to no-adoption: ack `superseded` on the spot with detail `'adopted-answered — answer not carried across runs'`, delete, and rely on the current run's D.n Step-0 to draft fresh from current labels. Guarantees the operator re-answer even in cases where D.12 redelivery would have worked, so option A dominates.

**Structural limitation (documented verbatim in FR-010 / spec § Follow-ups)**: no current MCP surface returns the operator's answer document. `cockpit_gate_status` returns `{gateId, status}`; `cockpit_gate_list` returns `{gateId, gateType, generation, status, runId}`. Neither carries the answer. `auto.md` already records this as a DATA GAP on the reuse path; adoption inherits it wholesale.

**Behaviour**: on adopting an `answered` entry, the counter is set to `1`. On the sweep-1 tick (§ step 3 / § step 4 sub-step 0 escape-hatch tick), the counter reaches `2`. On sweep-2, `3`, and the escape hatch fires: ack `superseded` (targeting the row's `runId`), delete, re-derive from current labels via `cockpit_status(issue=<issueRef>)`. If labels moved (the operator's answer caused a transition), the re-derivation dispatches correctly. If labels did not move (the answer was given but D.12 delivery never applied because the prior session died before it landed), the escape hatch re-asks the operator. Both outcomes are acceptable; neither is wrong.

**Sole path where the answer is preserved**: D.12 redelivery fires between adoption and the third sweep, and consumes the answer via the existing `deliveryId` dedup path.

**Follow-up filed on this issue after landing**: a cloud-side surface that returns the answer document at adopt time. Makes FR-010's preservation unconditional.

## R4 — Generation-drift on adopted gate

**Decision**: **Mirror the live-path drift branch — ack `superseded` (targeting row's `runId`) + let the sweep draft fresh at current generation; preserve the `escalation` carve-out exactly.** Anchor: Batch 1 Q4=A → FR-013 / SC-010 / SC-011.

**Alternatives considered**:

- **Adopt at prior generation (Q4 option B)** — leave the row as-is at its stale `generation`; do not draft fresh. Rejected on **correctness**, not preference. Adopting a gate at its prior `generation` means an operator verdict computed against **old content** (a prior PR head SHA, a revised answer-set, an old phase) gets applied to **current content**. `auto.md § Pre-draft check — shared rules → generation-drift branch guard` states this hazard verbatim: *"Re-attaching would apply an operator verdict computed against an old head SHA to current content — the correctness hazard D.12's supersession checks exist to prevent."* The adoption path does not get a different answer to the same question just because the gate arrived by a different route.
- **Skip the adoption (leave prior gate orphaned) and draft fresh (Q4 option C)** — reintroduces the duplicate-inbox symptom for the drift case, which is the one case where duplication is most likely (content moves while a session is dead).

**Symmetry with the live path**: keeping the sweep and the live path applying the SAME drift rule leaves one drift rule to reason about, not two that can diverge. If the live-path drift rule evolves (e.g. adds a new gateType with a drift branch, or refines the detail-message format), the adoption path inherits automatically.

**Escalation carve-out**: `gateType: 'escalation'` disables the drift branch, established by #457 in `auto.md § Pre-draft check — shared rules → generation-drift branch guard`. Four dispatch rows (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) share the one `gateType: 'escalation'` enum value and the wire carries no subtype discriminator to tell them apart. The drift branch cannot know which subtype to preserve. Upstream: [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046). FR-013 mirrors this carve-out. A prior-run `escalation` gate is adopted under FR-009 at its `(gateType, generation)` and left non-terminal; the adoption pass does NOT ack it `superseded` even when generation would otherwise differ. This inherits the escalation-subtype residual limitation the live path already tolerates.

**Ack `runId` targets prior-run**: FR-003 mandates the drift-branch ack carries the row's originating `runId`, not the current run's. Server-side, `cockpit_gate_ack` accepts-and-ignores `runId` (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` drops it before the wire — ack targets an existing `gateId`), so the ack works regardless. Encoding the prior-run `runId` on the wire is for audit/trace parity — an audit trace of "who superseded gate X" reads back correctly.

## R5 — `cockpit_gate_list` failure on adoption path

**Decision**: **Per-issue defer — skip both adoption and drafting for the failing issue; write a ledger row; do NOT abort the run; do NOT add a new playbook-level retry.** Anchor: Batch 1 Q5=D → FR-014 / SC-013 / US5.

**Alternatives considered**:

- **Hard-fail the run on adoption-path `cockpit_gate_list` error (Q5 option A)** — treat identically to the pre-flight probe's four-branch failure classes; print, exit non-zero, write a ledger row for the failure. Rejected because aborting the entire run because one child's read failed is a large blast radius for a repair path — and under Q2=A a single child's failure would take down a run whose other N issues adopted fine.
- **Soft-fail (skip adoption, continue drafting) (Q5 option B)** — write a ledger row noting adoption was skipped, proceed to the synthetic-event pass and the D.n Step-0 pre-draft checks. Duplicates ARE produced for any prior-run non-terminal gate on the failing issue — the exact symptom this spec exists to remove, silently reintroduced in the situation where nobody is looking.
- **Bounded retry, then hard-fail (Q5 option C)** — retry the `cockpit_gate_list` call with backoff (e.g. 3 attempts, 1s / 2s / 4s); on final failure, hard-fail per (A). Rejected because `cockpit_gate_list` already retries internally: `withRetry({ fn: () => client.listGates(...), schedule: QUERY_RETRY_SCHEDULE, shouldRetry: isRetryableGateQueryError })`. `auto.md` states the budget in the probe section — 3 attempts, ~5s backoff, 5000ms per attempt, ~20s worst case. Adding 1s/2s/4s in the playbook would turn a transient blip into ~35s of blocking per failing issue, and with Q2=A there are N+1 of them. By the time the playbook sees `status: 'error'`, the transient case has already been absorbed.

**Pattern reference**: `auto.md § step 3 § Deferred-to-loop behavior on sweep-time cockpit_gate_open failure` — the exact same shape:

> the specific gate's initiation is DEFERRED to the main loop's first natural wake … The record is NOT opened, but the underlying event WILL re-fire naturally because the label is persistent.

Same reasoning applies exactly for `cockpit_gate_list`: the label is persistent, the event re-fires, the next wake retries adoption for that issue. No duplicates, no aborted run, and the failure is visible in the ledger rather than inferred from a duplicate gate appearing later.

**Load-bearing composition**: this rule composes cleanly with FR-002 / FR-009. On a failed `cockpit_gate_list` for issue X:
1. FR-014: no adoption AND no drafting for X this pass.
2. Next natural wake: the persistent label (e.g. `waiting-for:clarification`) still on X causes `cockpit_await_events` to yield a synthetic-event-like transition; the main-loop dispatch retries `cockpit_gate_list` for X's `openGates` presence check via the existing D.n Step 0 (which is a `cockpit_gate_status` call, not `cockpit_gate_list`, but on the fresh wake the adoption pass rule no longer applies — the sweep is once-per-session, and by then either the transient blip is over and X's normal Step 0 does its job or the operator sees the second attempt fail loudly through the ordinary main-loop failure paths).

## R6 — `runId` on adoption-path `cockpit_gate_list`

**Decision**: **FORBIDDEN — the functional `cockpit_gate_list` call carries no `runId` field.** Anchor: FR-005 (reinforces #469 FR-011).

**Rationale**: #469 established that `cockpit_gate_list` remains runId-agnostic on functional calls. The cloud contract refines `runId requires generation`; list mode has no `generation`; forwarding `runId` would 400 at the cloud endpoint. Phase B's handler drops the field locally before the cloud call so the pre-flight capability probe (`auto.md § step 1 § Pre-flight probe (UI mode)`) can safely test acceptance of the field on the input schema without breaking the surface. The adoption path is a **functional** list call — not a probe. It MUST NOT carry `runId`.

This FR pins the invariant a SECOND time from the consumer end. #469 FR-011 pinned it from the producer end (the write side never sends `runId` on `cockpit_gate_list`); #471 FR-005 pins it from the consumer's perspective (the adoption path REQUIRES a runId-agnostic list surface). If a future generacy-cloud#894 makes `runId` filtering the default on `cockpit_gate_list`, both pins have to be lifted together — a single reviewer holding one pin cannot silently break the other repair.

**Test asserts**: pin 471-2 asserts the call shape has no `runId` field.

## R7 — `openGates` record shape: per-entry `runId`

**Decision**: **`openGates` entries carry per-entry `runId`; every downstream ack for an `openGates` entry reads `openGates[gateId].runId`, not the run-wide loop-state `runId`.** Anchor: FR-003 / FR-004.

**Rationale**: an adopted entry's originating `runId` is DIFFERENT from the current run's `runId` by construction — that is why the entry exists (a prior run opened it, then died). A single run-wide `runId` on loop state cannot represent both. Downstream ack sites that read the loop-state `runId` for an adopted entry would send the wrong `runId` on the wire.

**Server-side accept-and-ignore semantics** (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` drops `runId` before the wire — ack targets an existing `gateId` and performs no key derivation) mean the ack still succeeds either way. But encoding the correct value on the wire matters for:

- **Audit / trace parity with `cockpit_gate_open`** — a trace of "who supersede-acked gate X" reads back correctly against the run that opened it.
- **Future evolution** — if a future revision of `cockpit_gate_ack` starts consuming `runId` for some purpose (e.g. per-run rate limiting, per-run permissions), the correct value is already on the wire.
- **The compute-once invariant #469 established** — `runId` is derived exactly once per run, and every consumer receives the pre-computed value as an explicit literal. The adopted entry's `runId` is READ (from the row), not derived, so the compute-once invariant is not violated; the source is different but the invariant survives.

**Pattern reference**: the reuse-answered branch (`auto.md § step 3 sweep 'gateId idempotency'`) already carries a partial `openGates` record with `{gateId, gateType, generation, issueRef, status, transitionClass, dispatchClass}` — this ticket adds `runId` to the same shape.

## R8 — Adoption pass ordering: after probe and tool-presence check, before synthetic-event pass

**Decision**: **The § Adoption pass block runs immediately after the § Answered-gate parked-forever escape hatch and BEFORE the § Synthetic-event dispatch block, all within § step 3.** Anchor: FR-002 / SC-006.

**Rationale**: three ordering constraints compose to force this position:

1. **After the § step 3 tool-presence check** — the check verifies `cockpit_gate_list` is bound under `ResolvedGateMode === "ui"`; the adoption pass calls it.
2. **After the escape-hatch tick** — the escape hatch reads from `openGates` and may delete entries. Running adoption first, then the escape hatch, would let the hatch delete a just-adopted `answered` entry with `counter = 1` before the hatch's own counter-ticking logic ever ran, which is fine functionally (the counter starts at 1 either way) but obscures the ordering.
3. **Before the § Synthetic-event dispatch block** — the sweep's `cockpit_gate_open` calls in the extended trigger set (which fire from the synthetic-event pass's dispatch through the D.n rows) need the adopted entries in `openGates` at the moment they run, so the sweep-time open's pre-check finds the adopted entry and issues no duplicate open (SC-006). Also: the sweep-time `cockpit_gate_open` derivation includes `runId` (per #469); on the drift branch (FR-013), the adoption pass acks the stale gate `superseded` FIRST, so the sweep's fresh `cockpit_gate_open` at the current-run `runId` produces the sole remaining open for the natural gate.

**Reused call**: the adoption pass enumerates in-scope children from the SAME `cockpit_status(epic|issue=<ref>, json=true)` call the synthetic-event pass immediately below already issues. One call per run; no duplicate query.

## R9 — Under `runIdEnabled === false` (pre-#1067 cluster)

**Decision**: **The adoption pass runs normally.** The functional `cockpit_gate_list` call carries no `runId` regardless of `runIdEnabled` (per FR-005), so the surface is identical.

**Rationale**: `runIdEnabled` (from #469's pre-flight probe) governs whether the WRITE side sends `runId` on `cockpit_gate_open` / `cockpit_gate_ack` / pre-draft `cockpit_gate_status`. It has no bearing on `cockpit_gate_list`, which is deliberately runId-agnostic on functional calls under BOTH capability postures. The list ROW-level `runId` field is a cloud storage/return concern (generacy-cloud#892) orthogonal to the MCP input-schema layer — list rows still carry `runId` even against a pre-#1067 cluster, because Phase A landed the storage/return path independent of Phase B's input schemas.

Under `runIdEnabled === false`, adopted-entry acks pass the row's `runId`. Ack server accepts-and-ignores it identically regardless of cluster posture; the operational effect is identical. Adoption is capability-independent of #469's probe outcome.

## R10 — Alternative surface: `cockpit_gate_status` on every prior gate

**Considered but rejected**: use `cockpit_gate_status` (which takes `{issueRef, gateType, generation}`) per gate rather than `cockpit_gate_list` per issue. Rejected because the current run does not know what `(gateType, generation)` tuples prior runs opened. `cockpit_gate_list` enumerates them; `cockpit_gate_status` queries a specific tuple. The whole point of adoption is to see gates the current run has no reason to expect — that requires enumeration, not querying.

## R11 — Alternative surface: subscribe to a cross-run gate stream

**Considered but rejected**: subscribe to a generacy-cloud stream of gate transitions and reconstruct prior-run state from it. Rejected as an entirely new surface (SSE/WebSocket) with new failure modes, out of scope this phase, and not motivated by any success criterion. The one-shot per-issue `cockpit_gate_list` at startup is O(N+1) once per run — the marginal cost of a stream would not be justified by any measurable benefit.

## R12 — Reference implementation module (optional)

**Decision**: `lib/adoption.ts` MAY be added as a reference-only guard module mirroring `lib/runid.ts` shape (types + short guard functions with unit-testable fixtures). Non-load-bearing; the plugin does not import from it at runtime. Its purpose is fixture-verified machine checks that pin the shape of branches the prose describes. Deferred to the tasks phase to decide.

## Sources / references

- [spec.md](./spec.md) — full requirement text (FR-001 through FR-014; SC-001 through SC-013; US1–US5).
- [clarifications.md](./clarifications.md) — Batch 1 Q1–Q5 with reasoning.
- [/workspaces/agency/specs/469-problem-cockpit-auto-only/plan.md](../469-problem-cockpit-auto-only/plan.md) — #469 Phase C plan; the immediate predecessor this repair depends on.
- [/workspaces/agency/specs/469-problem-cockpit-auto-only/spec.md](../469-problem-cockpit-auto-only/spec.md) — §  Assumptions → *Behaviour change introduced by this phase — re-invocation is a new run*; the accepted consequence this feature repairs.
- `packages/claude-plugin-cockpit/commands/auto.md § step 3` — the startup sweep block this feature extends.
- `packages/claude-plugin-cockpit/commands/auto.md § Pre-draft check — shared rules → generation-drift branch guard` — the live-path drift rule FR-013 mirrors and the `escalation` carve-out FR-013 preserves.
- `packages/claude-plugin-cockpit/lib/runid.ts` — shape reference for the optional `lib/adoption.ts` reference module.
- generacy `mcp/gates/schemas.ts § GateAckInputSchema` — the accept-and-ignore semantics for `runId` on `cockpit_gate_ack` that make prior-run acks succeed.
- generacy `mcp/gates/query-schemas.ts` — `CockpitGateListInputSchema` (`runId` optional, handler-dropped) and `CockpitGateStatusInputSchema` (`runId` optional, threaded end-to-end).
- generacy-cloud#892 — deploys `runId` as a first-class field on `cockpit_gate_list` rows (the read that this repair consumes).
- generacy-cloud#894 — optional list-mode `runId` filtering; MUST remain strictly opt-in for this repair to survive (FR-005).
- generacy#1046 — the `escalation` subtype discriminator gap; FR-013 preserves the carve-out this issue tracks upstream.
- generacy#1053 — the tracking issue for the whole re-run / cross-run gate-visibility line of work; #469 + #471 together unblock it.
