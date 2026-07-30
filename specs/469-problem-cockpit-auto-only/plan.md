# Implementation Plan: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

**Feature**: `/cockpit:auto` derives a per-run `runId` at pre-flight (the full ledger filename stem) and threads it as an explicit literal into every gate write and pre-draft read it issues during the run — Phase C of a three-phase change (cloud storage → MCP read/query threading → caller wiring) that unblocks re-running a completed epic phase after its prior gate reached a terminal cloud status.
**Branch**: `469-problem-cockpit-auto-only`
**Status**: Complete
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) (Batch 1 Q1 pre-draft `cockpit_gate_status` in scope; Q2 `cockpit_gate_list` forbidden with one probe-only carve-out; Q3 `auto.md:283` prose updated in the same PR; Q4 full ledger stem verbatim as `runId`; Q5 pre-flight capability probe, decided once, whole-session; Batch 1B Q1–Q5 semantic duplicates of Batch 1; Batch 2 Q6 session-resume out of scope with named behaviour change + follow-up; Q7 explicit-literal propagation to subagents + compute-once + enumerated dispatch-path test)
**Depends on**: [generacy-cloud Phase A](https://github.com/generacy-ai/generacy-cloud/issues/892) (write/read `runId` acceptance), [generacy Phase B / generacy#1067 commit `82077f1a`](https://github.com/generacy-ai/generacy/issues/1067) (`runId` on `CockpitGateStatusInputSchema` and `CockpitGateListInputSchema` in `mcp/gates/query-schemas.ts`)
**Unblocks**: [generacy#1053](https://github.com/generacy-ai/generacy/issues/1053) (re-run a completed epic phase and see a fresh inbox gate)

## Summary

Playbook-prose-only edit on the plugin side, plus playbook-verification test additions and a one-line update to the load-bearing prose at `auto.md:283`. **No engine changes, no MCP schema changes** — Phase B (generacy#1067, `82077f1a`) has already added optional `runId` to `CockpitGateOpenInputSchema`, `CockpitGateAckInputSchema`, `CockpitGateStatusInputSchema`, and `CockpitGateListInputSchema` in `mcp/gates/*schemas.ts`; this ticket is the write-side caller wiring that finally supplies a value.

Root cause is stated verbatim in `spec.md § Problem`: `/cockpit:auto` computes a per-run identity (the ledger filename timestamp) at pre-flight but never passes it downstream. Every `cockpit_gate_open` / `cockpit_gate_ack` call therefore derives an identical `gateId` from `issueRef:gateType:generation` — stable across runs by construction. Once a gate reaches a terminal cloud status (`applied` / `superseded` / `failed` / `expired`) the cloud log-drops any re-open at that `gateId`, silently on both sides: the cluster gets a 202, the cloud emits only a `console.warn`, and the auto session hangs waiting for an answer that will never appear in the inbox. A grep for `runId` across `packages/claude-plugin-cockpit/` returns zero hits today.

The fix threads a run-scoped `runId`, derived exactly once at pre-flight from the ledger filename stem, into every write-side gate verb (`cockpit_gate_open`, `cockpit_gate_ack`) and every pre-draft `cockpit_gate_status` call the run issues. The `runId` value on the wire is the FULL ledger filename stem verbatim — `<tracking-ref-slug>-<timestamp>` (e.g. `epic-1053-20260729-143012`) — NOT the trailing timestamp alone (per Batch 1 Q4 / Batch 1B Q1). Traceability drives the choice: the tracking ref appears nowhere else in a gate document, and the `runId` column now surfaces on every `cockpit_gate_list` row (per generacy-cloud#892), so a post-mortem grep of `.generacy/cockpit/auto-runs/` against the row's `runId` is self-describing.

Five ancillary changes are load-bearing:

1. **`runId` on the write-side WITHOUT the matching read-side is a regression**, not a fix. On any dispatch after the sweep, `cockpit_gate_open` would derive a 4-segment `issueRef:gateType:generation:runId` key while pre-draft `cockpit_gate_status` would derive a 3-segment `issueRef:gateType:generation` key. Every pre-draft check would return `absent` (Phase A stores the run's fresh gate under a key the 3-input query can't find), the drafting subagent would re-run on every wake, and duplicate inbox gates would accumulate against a `gateId` the loop never tracks. So **every per-event pre-draft `cockpit_gate_status` in all six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) also carries the run's `runId`** (per Batch 1 Q1 / FR-009).
2. **`auto.md:283` load-bearing prose is updated in the same PR** — the line currently reads "the pre-draft `cockpit_gate_status({issueRef, gateType, generation})` check … names the same three inputs, so sweep-derived and live-derived `gateId`s coalesce". Post-fix the check names FOUR inputs (`issueRef, gateType, generation, runId`); leaving stale "three inputs" prose is worse than no prose because it will be trusted (per Batch 1 Q3 / FR-010).
3. **Pre-flight capability probe extends today's `cockpit_gate_list({issueRef, gateType: <omitted>})` probe with a `runId` field**. On a cluster below commit `82077f1a`, `CockpitGateListInputSchema` is `.strict()` without the field and returns `{status:'error', class:'invalid-args'}`; the session disables `runId` threading for its entire lifetime, logs the startup warning naming the pre-#1067 cluster condition, and runs today's 3-input identity (generacy#1053 stays unfixed for that session — status quo). On #1067+, the field is accepted and dropped locally by Phase B's handler before the cloud call (cloud contract refines `runId requires generation` and the sweep probe carries no `generation` — see Batch 1 Q2 / FR-011); the probe passes exactly as today and `runId` threading is enabled. **The decision is made ONCE at pre-flight and MUST NOT flip mid-run** — a mid-run revert would orphan sweep-opened 4-segment gates while the read side reverts to 3-input identity (per Batch 1 Q5 / FR-012). Because Phase B's `mcp/gates/query-schemas.ts` gained `runId` on both `CockpitGateStatusInputSchema` and `CockpitGateListInputSchema` in the same commit (`82077f1a`), a probe against list is a valid inference for status.
4. **`runId` is FORBIDDEN on functional `cockpit_gate_list` calls in this phase**. The Phase B handler drops `runId` before the cloud call, but the cloud contract refines `runId requires generation`, and the sweep probe carries no `generation`. Extending `runId` to any functional list call outside the probe would 400 on the cloud side (list-mode `runId` filtering is separately tracked as generacy-cloud#894). The pre-flight capability probe is the sole exception, and is safe precisely because Phase B's handler drops the field locally (per Batch 1 Q2 / FR-011). This is a second, independent reason list must stay runId-agnostic: it is also the surface the Batch 2 Q6 "sweep adopts pre-existing gates" follow-up will consume — foreclosing runId filtering on list would foreclose that repair before it is built.
5. **Compute-once, propagate-explicit** (per Batch 2 Q7 / FR-014 / FR-015). `runId` is derived exactly once — at pre-flight, at the same point the ledger filename is computed — and every downstream consumer (parent loop, subagent dispatches, gate verbs) receives the pre-computed value as an explicit literal. No consumer re-derives it, even by the same rule. Subagents that issue any gate verb receive `runId` as an explicit literal in the dispatch prompt, matching how every other run-scoped value (epic ref, gateId, cursor, prompts) already travels in `auto.md`.

An additional invariant that this phase pins forever (per Batch 1 Q4 / Batch 1B Q5 / FR-013): **`runId` MUST NOT contain the `:` character**. It is the trailing composite-key segment (`${issueRef}:${gateType}:${generation}[:${runId}]`), and `generation` may already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`); a colon-bearing `runId` would make the tail genuinely ambiguous to anything parsing keys by position. Both candidate ledger-stem forms today are colon-free by construction (slug is `/` → `-` with `#` stripped, timestamp is `YYYYMMDD-HHMMSS`). Pinning the invariant now stops a future ledger-filename-format change from silently introducing one.

Session-resume for `/cockpit:auto` is **explicitly out of scope** (per Batch 2 Q6 / spec § Out of Scope). `cockpit_resume` is a per-issue engine action (`auto.md:829`) that clears `agent:error` / `failed:*` labels; it is not a session-level restore surface. A re-invocation of `/cockpit:auto` is definitionally a NEW run — pre-flight mints a new ledger file (`auto.md:209`), which by FR-001 mints a new `runId`. This is a real behaviour change relative to today (see spec § Assumptions → *Behaviour change introduced by this phase — re-invocation is a new run*): before this phase, `gateId = hash(issueRef, gateType, generation)` had no run component, so re-invoking the same tracking ref resumed prior gate identity by construction (a second invocation derived the same key, the Step-0 check found the still-open gate, and the reuse branch fired). After this phase, an interrupted-then-re-invoked run mints a fresh `runId`; its startup sweep's pre-draft check returns `absent` for any prior-run gate; a fresh gate is drafted for the same natural gate; and the prior-run gate is orphaned (no `openGates` entry in the new run tracks it — answering it routes nowhere). The clean fix — startup sweep adopts pre-existing non-terminal gates for the tracking ref into `openGates` before drafting anything, using `cockpit_gate_list({issueRef, gateType: <omitted>})` which is runId-agnostic and whose rows now carry `runId` as a first-class field per generacy-cloud#892 — is filed as a follow-up on this issue and is deliberately NOT in this PR's scope. Phase C is already carrying more than its original scope after Batch 1 Q1.

Playbook-verification tests are re-pinned to the new contract — the `runId` derivation site, the pre-flight capability probe, the write-side threading in D.1/D.2/D.3/D.4/D.7/D.11 pre-draft `cockpit_gate_status` calls, the startup sweep's `cockpit_gate_open` calls, D.12's `cockpit_gate_ack`, the updated `auto.md:283` prose, the no-`:` invariant, the compute-once invariant, and the enumerated-dispatch-path assertion. Existing pins that describe the pre-#469 contract (three-input pre-draft check; no `runId` on any gate verb) are re-pinned to the NEW contract in the SAME PR, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin).

## Technical Context

**Language / runtime**: The plugin is playbook prose interpreted by the model at slash-command time; no compile-time code path executes it. Reference-implementation TypeScript (if any) lives under `packages/claude-plugin-cockpit/lib/` in the same shape as `lib/gate-wire-types.ts`, `lib/gate-status-check.ts` (created by #457), and `lib/clarification-batch-parser.ts` / `lib/intent-recognition.ts` / `lib/invocation-form-4.ts`. Tests run under `vitest`, matching `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (currently 4555 lines).

**Frameworks / dependencies**:

- **No new runtime deps.** The wire schemas for `runId` on gate verbs already exist upstream (Phase B / generacy#1067, commit `82077f1a`); the plugin consumes those schemas by passing `runId` as an optional field on the existing MCP call shapes.
- **MCP tools consumed (all already bound; none newly introduced by this ticket)**:
  - `cockpit_gate_open` — Phase B added optional `runId: z.string().min(1).regex(NO_COLON).optional()` to `CockpitGateOpenInputSchema`. Plugin passes `runId` on every sweep-time AND live-time call under `runIdEnabled === true`.
  - `cockpit_gate_ack` — Phase B added optional `runId` to `CockpitGateAckInputSchema`. Plugin passes `runId` on every D.12 ack under `runIdEnabled === true`. Also on any escape-hatch ack (§ step 3 / step 4 sub-step 0 answered-gate escape hatch) AND on any generation-drift `superseded` ack in a Step 0 that fires (D.1/D.2/D.3/D.4 — never D.7/D.11, whose drift branch is disabled per the escalation-guard).
  - `cockpit_gate_status` — Phase B added optional `runId` to `CockpitGateStatusInputSchema`. Plugin passes `runId` on every pre-draft check in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) under `runIdEnabled === true`.
  - `cockpit_gate_list` — Phase B added optional `runId` to `CockpitGateListInputSchema` for surface parity; the handler drops the field before the cloud call. Plugin passes `runId` on EXACTLY ONE call: the pre-flight capability probe (per FR-012). No functional list call carries `runId` (per FR-011 / Batch 1 Q2). The pre-draft check's `absent`-branch `cockpit_gate_list({issueRef, gateType})` drift-detection call MUST NOT carry `runId`.
- **Reused verbatim from today's playbook**: the pre-flight ledger filename computation (`auto.md:209` — `<tracking-ref-slug>-<timestamp>`); the pre-flight `--gates=auto` three-part resolution (`auto.md:60`); the pre-flight `cockpit_gate_list` capability probe (`auto.md:89` — extends by adding `runId`); the six Step 0 blocks in D.1/D.2/D.3/D.4/D.7/D.11 (`auto.md:564`, `:630`, `:676`, `:708`, `:799`, `:909`); the startup sweep's `cockpit_gate_open` invocations (`auto.md § step 3 startup sweep`); every drafting subagent invocation; the D.12 gate-answer routing and `cockpit_gate_ack` shape (`auto.md § D.12`); the § step 3 / § step 4 sub-step 0 answered-gate escape hatch's `cockpit_gate_ack(superseded)` calls; the § Ledger `· source: ui-gate` provenance suffix. **The `runId` threading adds one field to each existing MCP call shape and one new derivation step at pre-flight — no downstream flow is restructured.**

**Boundaries preserved**:

- **`--gates=local` byte-path unchanged** (per FR-007 / US4). Under `local`, `cockpit_gate_open` / `cockpit_gate_ack` / `cockpit_gate_status` / `cockpit_gate_list` are never called (§ step 1 → resolves to local; § step 3 tool-presence check names seven baseline tools only; § Dispatch step 0 is skipped entirely). No `runId` is derived, no `runId` field appears on any call, no `runIdEnabled` decision is made. Every existing local-mode test passes without modification.
- **Never merge on red / every gate prompts** (auto.md opening paragraph) unaffected. `runId` threading changes WHICH `gateId` a call derives, not WHETHER the operator is prompted or WHAT they see. Every existing pending gate still requires an operator answer; nothing auto-proceeds; the failure paths in `contracts/error-handling.md` are unchanged.
- **No engine changes / no MCP schema changes.** `runId` acceptance on `CockpitGateOpenInputSchema` / `CockpitGateAckInputSchema` / `CockpitGateStatusInputSchema` / `CockpitGateListInputSchema` is bound by Phase B (generacy#1067). Any deviation from the frozen shape is proposed on that issue, not patched here.
- **Playbook-first, code-second.** Any TypeScript added under `lib/` is a reference implementation of the prose, not the source of truth. The optional `lib/runid.ts` reference module mirrors the shape of `lib/gate-wire-types.ts` (types + short guard functions with unit-testable fixtures).
- **UI mode only.** The `runId` change targets `ResolvedGateMode === "ui"`. `--gates=local` is out of scope for `runId` per FR-007; `--gates=auto` that resolves to `local` inherits the local byte-path.
- **Generation-drift branch guard preserved.** For `gateType: 'escalation'` (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d), the pre-draft check's drift branch is DISABLED (per `auto.md § Pre-draft check — shared rules → generation-drift branch guard`, established by #457). This ticket does NOT re-enable it: adding `runId` to the drift-branch `cockpit_gate_list({issueRef, gateType})` call would not recover the missing subtype discriminator that #1046 tracks upstream, and threading `runId` into a list call is forbidden by FR-011. The escalation-subtype residual limitation remains: a genuinely stale escalation gate is left non-terminal alongside the fresh one.

**Session-state model**: extends the § In-memory loop state additions (UI mode) block already extended by #449 (`openGates`, `firstGateOpenFailureNoted`) and #457 (`answeredGateSweepCounter`) with two additions:

- `runId: string | null` — the pre-flight-derived full ledger filename stem, or `null` under `--gates=local`. Under `runIdEnabled === false` (pre-#1067 cluster), the value is retained on the loop state (still the ledger stem) but is NOT passed to any gate verb — the `runIdEnabled` gate is what suppresses the field on the wire. Rationale for retention: the ledger stem is also used for other purposes today (append target filename), so the plugin does not delete it just because gate calls skip it.
- `runIdEnabled: boolean` — decided ONCE at pre-flight after the `cockpit_gate_list` capability probe (FR-012). Under `--gates=local` this is `false` unconditionally (no probe fires). Under `--gates=ui` (explicit) or `--gates=auto` that resolved to `ui`, `runIdEnabled === true` iff the probe returned `{status: 'ok', data: …}`; on any probe error class (`invalid-args`, `internal`, `transport`, `query-unreachable`, unknown) the value is `false` for the entire session. **MUST NOT flip mid-run** — the enforcement site is the playbook prose stating this once at derivation and every downstream reference site re-stating "read the pre-flight-decided value verbatim".

Under `local` the two fields are unused (declared for symmetry with the UI-mode branch of § In-memory loop state additions; the block already carries `local`-unused fields).

## Approach

The change adds one new derivation step at pre-flight, one pre-flight probe extension, three write-side call-shape extensions (open, ack, status), and one prose update to `auto.md:283`. Every existing flow shape is unchanged; every existing branch preserves its behaviour under `runIdEnabled === false`.

### Pre-flight `runId` derivation (auto.md § step 1)

Inserted at the point the ledger filename is computed (currently `auto.md:209`), BEFORE any gate verb fires. Contract: `contracts/runid-derivation.md`.

1. Compute the ledger filename stem exactly as today: `<tracking-ref-slug>-<timestamp>`, where `<tracking-ref-slug>` is the tracking reference with `/` replaced by `-` and `#` stripped, and `<timestamp>` is `YYYYMMDD-HHMMSS` in the operator's local time captured now.
2. Assign `runId := <tracking-ref-slug>-<timestamp>` (the ledger stem verbatim, `.ledger` suffix NOT included).
3. Assert `runId` is colon-free (static invariant per FR-013). This is redundant against today's derivation but pinned in the prose so a future ledger-format change cannot silently introduce a `:`.
4. Store `runId` on the § In-memory loop state additions block. Downstream sites (parent loop, subagent dispatches, gate verbs) read this stored value verbatim; NO consumer re-derives (per FR-014).

Under `--gates=local`, this step is dead prose (`runId` is not used; `runIdEnabled === false`).

### Pre-flight capability probe extension (auto.md § step 1 § Pre-flight probe (UI mode))

The probe today issues exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call (per `auto.md:89`, `auto.md § Pre-flight probe (UI mode)`) and classifies any `{status: 'error'}` return as failure. This ticket EXTENDS the call to include `runId`, and adds one `runIdEnabled` output. Contract: `contracts/runid-probe.md`.

1. Issue `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted>, runId: <runId> })`.
2. Classify per the existing four-class error taxonomy (`query-unreachable`, `invalid-args`, `internal`, `transport`):
   - `{status: 'ok', …}` → probe passes exactly as it does today; `runIdEnabled := true`.
   - `{status: 'error', class: 'invalid-args', …}` → cluster is pre-#1067 (the `.strict()` schema rejects `runId`). This is NOT a probe failure in the fatal sense — the probe distinguishes "capability absent" (`invalid-args` on a field a pre-#1067 cluster does not know) from "surface broken" (any other class). `runIdEnabled := false`; log the startup warning verbatim; continue the run under 3-input identity (status quo, generacy#1053 stays unfixed for this session).
   - Any other `{status: 'error', class: …}` → treat exactly as the pre-#469 probe failure (unchanged behaviour): explicit `--gates=ui` hard-fails the run with the probe-fail ledger row and operator-facing line; `--gates=auto` resolves to `local` with `<resolution reason> = probe-failed`; Form-3 TENTATIVE window hard-fails with `probe-failed-after-remote-gate-consumed`. `runIdEnabled` is not set (the run does not continue in UI mode).

Startup warning verbatim (new prose, load-bearing): `runId threading disabled for this session — cluster's cockpit MCP server does not accept runId on cockpit_gate_list (pre-generacy#1067). Run continues under today's 3-input gate identity; generacy#1053 (re-run terminal gates) will not be fixed for this session. Upgrade the cluster's generacy build to ≥ commit 82077f1a to enable runId threading.`

**Distinguishing `invalid-args` from other error classes at pre-flight is a NEW behaviour** compared to today's probe. Today's probe treats every error class the same (any error → probe-failed). The extension adds ONE branch — the `invalid-args` graceful-degradation path. All other classes retain today's behaviour verbatim. This asymmetry is safe because `invalid-args` on a `.strict()` schema is definitionally a "known-unknown" — the tool server told us it does not recognize the field. Every other class describes a broken surface, not a capability gap; downgrading `runIdEnabled` on those would silently mask a real bug.

The probe is issued at most ONCE per run (per FR-010, unchanged). The `runIdEnabled` decision is made at this call site and MUST NOT flip mid-run (per FR-012).

**Decision is made under `runId` on the wire, not by pre-checking whether the field would be rejected.** The extended probe is safe under `--gates=auto` short-circuit paths because those paths do not issue the probe at all (short-circuit rule at `auto.md:60` — probe fires only when items 1 AND 2 both pass). Under explicit `--gates=ui` the probe fires unconditionally as today; the extension changes only how the `invalid-args` class is routed.

### Write-side `runId` threading — three call shapes

Every write-side gate verb passes `runId` as an OPTIONAL FIELD on the existing call shape, guarded by `runIdEnabled`. Under `runIdEnabled === false` the field is OMITTED (not passed as `null` or `undefined` — omitted from the call payload entirely, so the tool server's `.strict()` schema resolves the payload against pre-#1067 semantics without the field present). Contract: `contracts/runid-threading.md`.

1. **`cockpit_gate_open` (write-side)** — every call in the run carries `runId`:
   - § step 3 startup sweep's `cockpit_gate_open` calls (per `auto.md § step 3` extended trigger set — every `waiting-for:*` label and every persistent non-`waiting-for:*` trigger listed at `auto.md:274`).
   - § UI-mode fallback branch's `cockpit_gate_open` (per `auto.md § UI-mode fallback`).
   - The live-path `cockpit_gate_open` in each drafting D.n dispatch (D.1 clarification, D.2 artifact-review, D.3 implementation-review, D.4 manual-validation, D.7 escalation-agent-error, D.8 phase-queue G.5, D.11 escalation-merge-conflicts). Note D.6 (G.4a), D.10 (G.4c) also carry `runId` on their `cockpit_gate_open` — every UI-mode gate open in the run.
   - Any `cockpit_gate_open` inside the drafting subagents (SB.1, SB.2, etc.) receives `runId` as an explicit literal in the dispatch prompt per FR-015.

2. **`cockpit_gate_ack` (write-side)** — every call in the run carries `runId`:
   - § D.12 gate-answer step 5's `cockpit_gate_ack(gateId, outcome: 'applied' | …)` on operator answer.
   - § D.12 gate-answer step 1's `cockpit_gate_ack(gateId, outcome: 'superseded', detail: '<no-record | stale-generation | …>')` on the no-`openGates`-record drop path (per `auto.md:762`).
   - § D.12 gate-answer step 3's `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'live-state supersession')`.
   - § step 3 answered-gate escape hatch's `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')` (per `auto.md:248`).
   - § step 4 sub-step 0 per-wake answered-gate escape hatch's `cockpit_gate_ack` (same detail as above; per `auto.md:300`).
   - The generation-drift branch's `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft …')` in Step 0 of D.1, D.2, D.3, D.4 (per `auto.md:572`, `:638`, `:684`, `:716`). Note: the drift branch is DISABLED for D.7 and D.11 (escalation guard), so no ack fires there.

3. **`cockpit_gate_status` (read-side)** — every pre-draft check in the six Step 0 blocks carries `runId`:
   - D.1 § Step 0 sub-step 2 (`auto.md:567`).
   - D.2 § Step 0 sub-step 2 (`auto.md:633`).
   - D.3 § Step 0 sub-step 2 (`auto.md:679`).
   - D.4 § Step 0 sub-step 2 (`auto.md:711`).
   - D.7 § Step 0 sub-step 2 (`auto.md § D.7`).
   - D.11 § Step 0 sub-step 2 (`auto.md § D.11`).

**`cockpit_gate_list` (read-side) — `runId` is FORBIDDEN on every functional call.** The pre-draft check's `absent`-branch drift-detection call (`cockpit_gate_list({ issueRef, gateType })`) MUST NOT carry `runId`. The Batch 2 Q6 sweep-adoption follow-up will also use a runId-agnostic list call (`cockpit_gate_list({issueRef, gateType: <omitted>})`) — reinforcing the FR-011 rule. The ONLY exception is the pre-flight capability probe (FR-012), and it is only safe because Phase B's handler drops the field before it reaches the cloud endpoint that would 400.

Subagents receive `runId` as an explicit literal in the dispatch prompt (per FR-015): the parent writes `<runId-literal>` into the prompt at dispatch time, the subagent quotes it verbatim on every gate verb it issues. Subagents MUST NOT re-derive `runId` from the ledger filename or any other source (per FR-014). The dispatch-prompt template gains one line: `runId: "<runId-literal>"` (or omitted when `runIdEnabled === false`, matching the wire shape).

### `auto.md:283` prose update

The current line reads (verbatim, extracted verbatim from `auto.md:283`):

> The pre-draft `cockpit_gate_status({issueRef, gateType, generation})` check (per § Dispatch step 0 in D.1 / D.2 / D.3 / D.4 / D.7 / D.11) **names the same three inputs**, so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed.

Post-fix:

> The pre-draft `cockpit_gate_status({issueRef, gateType, generation, runId})` check (per § Dispatch step 0 in D.1 / D.2 / D.3 / D.4 / D.7 / D.11) **names the same four inputs** (under `runIdEnabled === true`; three under `runIdEnabled === false`, matching the pre-#469 3-input identity), so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed AND the run is the same. Two runs against the same tracking ref intentionally derive DIFFERENT `gateId`s — see § Assumptions in `specs/469-problem-cockpit-auto-only/spec.md` for the behaviour change and the sweep-adoption follow-up.

This is the load-bearing contract for when two `gateId`s coalesce. The parallel update to the § step 3 startup sweep block's `gateId idempotency` paragraph (`auto.md:283` — the same paragraph) makes clear the sweep-time `cockpit_gate_open` calls derive the same 4-segment key as pre-draft `cockpit_gate_status`.

### Playbook edits (auto.md) — surgical

1. **§ step 1 (pre-flight)** — insert `runId := <tracking-ref-slug>-<timestamp>` derivation immediately after the ledger filename computation at `auto.md:209`. State the compute-once invariant and the no-`:` invariant verbatim (per FR-013 / FR-014).
2. **§ step 1 § Pre-flight probe (UI mode)** — extend the probe call at `auto.md:89` to include `runId: <runId>`. Add the `invalid-args` graceful-degradation branch with the verbatim startup warning; retain all other error-class behaviour verbatim. State that `runIdEnabled` is decided here, ONCE, and MUST NOT flip mid-run.
3. **§ In-memory loop state additions (UI mode)** — add `runId: string | null` and `runIdEnabled: boolean` alongside the existing `openGates`, `firstGateOpenFailureNoted`, and `answeredGateSweepCounter`.
4. **§ step 3 startup sweep** — the `gateId idempotency` paragraph at `auto.md:283` is updated (see § `auto.md:283` prose update above). Every `cockpit_gate_open` call in the sweep-time extended trigger set (the block at `auto.md:274`) states verbatim that the call passes `runId` under `runIdEnabled === true`. The `answeredGateSweepCounter` escape hatch's `cockpit_gate_ack` at `auto.md:248` states verbatim that the ack passes `runId` under `runIdEnabled === true`.
5. **§ step 4 sub-step 0** — the per-wake escape hatch's `cockpit_gate_ack` at `auto.md:300` states verbatim that the ack passes `runId` under `runIdEnabled === true`.
6. **§ Dispatch step 0 (D.1, D.2, D.3, D.4, D.7, D.11)** — each of the six `cockpit_gate_status({issueRef, gateType, generation})` calls (`auto.md:567`, `:633`, `:679`, `:711`, D.7, D.11) gains a fourth field `runId: <runId>` (under `runIdEnabled === true`). The `cockpit_gate_list({issueRef, gateType})` calls in the `absent` branch MUST NOT gain `runId` (per FR-011). The generation-drift `cockpit_gate_ack(staleGateId, outcome: 'superseded', …)` in D.1/D.2/D.3/D.4 (drift-branch-enabled rows) gains `runId` under `runIdEnabled === true`.
7. **§ Dispatch (D.1 through D.11) — live-path `cockpit_gate_open` calls** — every UI-mode `cockpit_gate_open` invocation in a drafting D.n row states verbatim that it passes `runId` under `runIdEnabled === true`. Subagents that issue `cockpit_gate_open` receive `runId` as an explicit literal in the dispatch prompt.
8. **§ D.12 gate-answer** — the step 5 `cockpit_gate_ack` (operator applies answer), the step 1 no-record `cockpit_gate_ack(superseded)`, and the step 3 live-state-supersession `cockpit_gate_ack(superseded)` all state verbatim that they pass `runId` under `runIdEnabled === true`. The reset of `answeredGateSweepCounter` on D.12 delivery is unchanged.
9. **§ UI-mode gate mapping** — a new "runId" column in the table is NOT added (the field is not per-gateType; it is per-run). Instead, a one-paragraph header note names the compute-once + explicit-literal rule and points at § step 1's derivation.
10. **§ Pre-draft check — shared rules** — the paragraph that names the three inputs (currently `auto.md § Pre-draft check — shared rules`) gains a `runId` bullet: "the pre-draft check's `gateId` uses four inputs when `runIdEnabled === true`; the fourth input is the pre-flight-derived `runId` and is threaded as an explicit literal, never re-derived (per FR-014)".

**No other rows change.** D.5 (green merge) has no gate. D.9 / D.9a–D.9d are ledger-only, no gate. D.10 (unrecognized state) opens G.4(c) under `gateType: 'escalation'` — its `cockpit_gate_open` gains `runId` under `runIdEnabled === true` (same rule as every other UI-mode gate open), but D.10 has no Step 0 pre-draft check (per `auto.md:959` note) and no drift-branch ack, so no other changes fire there.

### Test edits (playbook-verification.test.ts)

Add a new `describe("469 runId threading", () => { ... })` block at the end of the file (after the existing `457 …` block). New assertions:

- **469-1**: § step 1 (pre-flight) declares `runId := <tracking-ref-slug>-<timestamp>` derivation immediately after ledger filename computation.
- **469-2**: § step 1 declares the compute-once invariant (single derivation site; no consumer re-derives).
- **469-3**: § step 1 declares the no-`:` invariant on `runId` verbatim.
- **469-4**: § step 1 § Pre-flight probe (UI mode) declares the extended probe call shape `cockpit_gate_list({issueRef, gateType: <omitted>, runId})`.
- **469-5**: § step 1 § Pre-flight probe (UI mode) declares the `invalid-args` graceful-degradation branch with the verbatim startup warning.
- **469-6**: § step 1 § Pre-flight probe (UI mode) declares that `runIdEnabled` is decided ONCE at this site and MUST NOT flip mid-run.
- **469-7**: § In-memory loop state additions declares `runId: string | null` and `runIdEnabled: boolean`.
- **469-8**: § step 3 startup sweep declares that every `cockpit_gate_open` call passes `runId` under `runIdEnabled === true`.
- **469-9**: § step 3 / § step 4 sub-step 0 answered-gate escape hatch declares that `cockpit_gate_ack(superseded)` passes `runId` under `runIdEnabled === true`.
- **469-10**: § step 3 startup sweep `gateId idempotency` paragraph declares the FOUR inputs the `gateId` uses under `runIdEnabled === true`.
- **469-11 through 469-16**: each of § Dispatch step 0 (D.1, D.2, D.3, D.4, D.7, D.11) declares the extended `cockpit_gate_status({issueRef, gateType, generation, runId})` call shape.
- **469-17 through 469-20**: each of § Dispatch step 0 (D.1, D.2, D.3, D.4) generation-drift branch declares the `cockpit_gate_ack(staleGateId, outcome: 'superseded', …, runId)` call shape. D.7 and D.11 do NOT gain this pin (drift branch disabled per escalation guard).
- **469-21**: § Dispatch step 0 (D.1, D.2, D.3, D.4, D.7, D.11) `absent`-branch `cockpit_gate_list({issueRef, gateType})` MUST NOT carry `runId` (drift-detection list call is functional).
- **469-22**: § D.12 gate-answer's step 5 `cockpit_gate_ack` (operator apply) declares `runId` threading.
- **469-23**: § D.12 gate-answer's step 1 `cockpit_gate_ack(superseded, 'no record')` declares `runId` threading.
- **469-24**: § D.12 gate-answer's step 3 `cockpit_gate_ack(superseded, 'live-state supersession')` declares `runId` threading.
- **469-25**: Every drafting D.n row's live-path `cockpit_gate_open` call declares `runId` threading (D.1, D.2, D.3, D.4, D.6 G.4a, D.7 G.4b, D.8 G.5, D.10 G.4c, D.11 G.4d — this is the enumerated-dispatch-path assertion required by FR-016 / Batch 2 Q7).
- **469-26**: Subagent dispatch prompts that spawn a subagent capable of issuing a gate verb declare that `runId` is passed as an explicit literal in the prompt.
- **469-27**: `auto.md:283` prose update — the paragraph names FOUR inputs under `runIdEnabled === true` (per FR-010).
- **469-28**: § Pre-draft check — shared rules names `runId` as the fourth input under `runIdEnabled === true`.
- **469-29**: `--gates=local` byte-path invariance — no `runId` field appears in any local-mode assertion. Grep on the `local` branches of the six Step 0 blocks confirms zero `runId` occurrences.

Existing pins on § step 3 sweep `gateId idempotency`, the six Step 0 blocks, § D.12, and § Pre-draft check — shared rules that quote the OLD 3-input contract are **re-pinned to the new 4-input-under-`runIdEnabled` contract in the same PR**, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin).

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo (verified: `find /workspaces/agency/.specify -type f` returns only templates under `.specify/templates/`). Applying the plugin-scope `CLAUDE.md` pins:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins `commands/auto.md` by exact heading strings and contract rules. This plan **re-pins** the § step 3 sweep, six Step 0 blocks, § D.12, § Pre-draft check — shared rules, and § In-memory loop state additions to the NEW contract. New pins are added under a `describe("469 runId threading")` block. No pin is weakened or deleted; the acceptance criterion (spec § US1, US2, US3, US4 and SC-001 through SC-011) is verified by the re-pinned suite going green.
- **Never merge on red / every gate prompts** (auto.md opening paragraph): `runId` threading changes WHICH `gateId` a call derives, not WHETHER the operator is prompted. Every existing pending gate still requires an operator answer; nothing auto-proceeds; per-gate auto-approve stays out of scope.
- **Playbook-first, code-second** (existing pattern at `lib/gate-wire-types.ts`, `lib/gate-status-check.ts`, `lib/clarification-batch-parser.ts`, etc.): any `lib/` additions are reference implementations of prose contracts, not the source of truth. If a `lib/runid.ts` reference module is added under this ticket, its shape mirrors `lib/gate-wire-types.ts` (types + short guard functions with unit-testable fixtures).
- **No new external systems / no new APIs bound by this ticket**: `runId` acceptance on `cockpit_gate_open` / `cockpit_gate_ack` / `cockpit_gate_status` / `cockpit_gate_list` is bound by Phase B (generacy#1067 commit `82077f1a`). Phase A (generacy-cloud) accepts `runId` on the write and read paths and stores it as a doc field per generacy-cloud#892. No new dependency-graph edges introduced by this ticket.
- **Backwards compatibility across a heterogeneous fleet** (implicit in Phase C landing rule per FR-008): the pre-flight capability probe (FR-012) is the runtime guard. A pre-#1067 cluster runs today's 3-input identity with a loud startup warning; a #1067+ cluster runs the new 4-input identity. No mid-run flip.

## Project Structure

### Documentation (this feature)

```text
specs/469-problem-cockpit-auto-only/
├── spec.md                       (unchanged — read-only)
├── clarifications.md             (unchanged — read-only, source of Batch 1 Q1–Q5, Batch 1B Q1–Q5, Batch 2 Q6–Q7)
├── conversation-log.jsonl        (unchanged — event log)
├── plan.md                       (this file)
├── research.md                   (technology decisions + rationale + clarification anchors)
├── data-model.md                 (types: RunId, RunIdEnabled, extended CockpitGate*InputSchema shapes; validation rules)
├── quickstart.md                 (operator usage; reproduce-terminal-block demo; pre-flight probe fallback demo)
├── contracts/
│   ├── runid-derivation.md       (§ step 1 pre-flight derivation contract; compute-once; no-`:` invariant; ledger-stem verbatim)
│   ├── runid-threading.md        (write-side threading contract: open, ack, status; enumerated dispatch paths; subagent explicit-literal rule)
│   └── runid-probe.md            (pre-flight capability probe contract: extended list call, invalid-args graceful-degradation branch, other error classes unchanged, decide-once whole-session)
├── checklists/                   (empty; populated by /checklist if invoked)
└── tasks.md                      (Generated by /speckit:tasks)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/auto.md                     (EDIT — pre-flight runId derivation added at §step 1; pre-flight probe extended in § step 1 § Pre-flight probe (UI mode); § In-memory loop state additions extended; § step 3 sweep gateId idempotency paragraph updated; six § Dispatch step 0 blocks add runId to cockpit_gate_status; drift-branch cockpit_gate_ack in D.1/D.2/D.3/D.4 adds runId; every UI-mode cockpit_gate_open across sweep + drafting D.n adds runId; § D.12 ack calls add runId; § step 3 / § step 4 sub-step 0 escape-hatch cockpit_gate_ack adds runId; § Pre-draft check — shared rules names runId as fourth input; subagent dispatch prompts add explicit runId literal)
├── lib/                                 (potential NEW file, ref-impl only — TBD in tasks phase; NOT load-bearing)
│   └── runid.ts                         (OPTIONAL — reference guard functions for runId derivation and no-`:` invariant; fixtures pinned by test)
└── tests/playbook-verification.test.ts  (EDIT — new `describe("469 runId threading")` block with 29 assertions; existing pins on § step 3 sweep, six Step 0 blocks, § D.12, § Pre-draft check — shared rules that quote the pre-#469 3-input contract re-pinned to the new 4-input-under-runIdEnabled contract)
```

**Files intentionally not touched**:

- **Engine / cluster / MCP server code** — Phase B (generacy#1067) landed `runId` on all four gate-verb schemas in `mcp/gates/*schemas.ts` at commit `82077f1a`. No further engine change is needed; the plugin consumes the existing optional field.
- **Cloud code** (generacy-cloud) — Phase A landed `runId` acceptance on `handleGateOpen` / `handleGateOutcome` and `runId` storage as a doc field on `organizations/{orgId}/cockpitGates/{gateId}` per generacy-cloud#892. Phase A also surfaces `runId` on `cockpit_gate_list` rows for post-mortem traceability. No change here.
- **The other five `commands/*.md` playbooks** (clarify, queue, review, merge, status, watch) — none of them derive a `runId` or issue gate verbs at the sites this ticket edits. The `readdirSync(COMMANDS_DIR)` sweep in `playbook-verification.test.ts` pins them for invocation-vs-`--help` drift; the edit to auto.md must not break that sweep.
- **`cockpit-remote-gates-plan.md`** in tetrad-development — this plan references the epic doc's Wire contracts and Idempotency sections. Contract changes must be proposed on the epic tracking issue.
- **D.5, D.9 / D.9a–D.9d** — no gate, no change.
- **Sweep-adoption of pre-existing non-terminal gates for the tracking ref into `openGates`** (Batch 2 Q6 follow-up) — filed as a follow-up on this issue; deliberately NOT in this PR to keep scope bounded. Phase C is already carrying more than its original scope after Batch 1 Q1.

## Key technical decisions (details in research.md)

| Decision | Choice | Rationale (short) | Clarification anchor |
|----------|--------|-------------------|----------------------|
| `runId` on-wire value | Full ledger filename stem `<tracking-ref-slug>-<timestamp>` verbatim | Only the stem greps directly against `.generacy/cockpit/auto-runs/`. Under timestamp-only, a `cockpit_gate_list` row `runId: 20260729-051000` needs cross-referencing to reconstruct the target. Cross-epic `runId` collisions at the same second are cosmetic (not functional), because `issueRef` is already the leading key segment. Corroborated by generacy#1067's `runIdSource` log line deliberately recording `'explicit' | 'unset'` and never the value on the grounds that auto-run ids embed cluster/repo/issue/timestamp | Batch 1 Q4 / Batch 1B Q1 (FR-001) |
| Pre-draft `cockpit_gate_status` scope | `runId` on every per-event pre-draft check in D.1/D.2/D.3/D.4/D.7/D.11 | Without this, `cockpit_gate_open` derives a 4-segment key while pre-draft check derives a 3-segment one; every check returns `absent`, the drafting subagent re-runs on every wake, duplicate inbox gates accumulate against a `gateId` the loop never tracks. Same regression as the `runId`-on-open-alone case, one layer down | Batch 1 Q1 (FR-009) |
| `cockpit_gate_list` `runId` policy | FORBIDDEN on functional calls; sole exception is the pre-flight capability probe | Cloud contract refines `runId requires generation` and the sweep probe carries no `generation` — forwarding `runId` returns 400 and breaks the sweep's primary dedup primitive. Also: reinforces Batch 2 Q6 follow-up (sweep-adopt uses runId-agnostic list) | Batch 1 Q2 (FR-011) |
| Prose update at `auto.md:283` | Same PR as caller wiring | The line is the stated contract for when two `gateId`s coalesce; leaving stale "three inputs" prose while the code names four is worse than no prose because it will be trusted. B (follow-up doc issue) would leave the window open for exactly as long as follow-up doc issues usually stay open | Batch 1 Q3 (FR-010) |
| Runtime cluster prerequisite guard | Pre-flight capability probe, decided once, whole-session | The probe is FREE (extends the existing `cockpit_gate_list` call with one field). Mid-run revert (B) produces mixed-identity runs that orphan sweep-opened 4-segment gates; the startup sweep opens gates before any Step-0 check runs. Assumption-only (C) is a reasonable fallback but hard-stops older clusters on the very issue this fixes | Batch 1 Q5 / Batch 1B Q4 (FR-012) |
| Session-resume for `/cockpit:auto` | Explicitly out of scope; state the behaviour change in Assumptions; file sweep-adopt follow-up | `cockpit_resume` is per-issue not per-session; `/cockpit:auto` has no session-resume surface; re-invocation is definitionally a new run. Named-out-of-scope with follow-up prevents an operator hitting the "two identical gates after Ctrl-C then re-invoke" symptom from reverse-engineering it | Batch 2 Q6 |
| `runId` propagation to subagents | Explicit literal in dispatch prompt; compute-once at pre-flight; enumerated-dispatch-path test | B (subagent re-derives) requires a one-file-in-the-directory invariant that does not hold (the directory accumulates one file per run). C (env var / shared file) adds a global surface for a value with a clean explicit-literal propagation path. Sampling one call site instead of enumerating is a silent-degradation risk because `runId` is optional on every MCP schema | Batch 2 Q7 (FR-014, FR-015, FR-016) |
| No-`:` invariant on `runId` | Pinned in the derivation prose forever | `runId` is the trailing composite-key segment; `generation` may already contain colons; a colon-bearing `runId` would make the tail ambiguous to anything parsing keys by position. Both current candidate ledger-stem forms are colon-free by construction, but a future filename-format change could silently introduce one | Batch 1 Q4 / Batch 1B Q5 (FR-013) |
| Landing order | Do not land Phase C before Phase A (cloud) AND Phase B (`runId` on `CockpitGateStatusInputSchema` / `CockpitGateListInputSchema` — commit `82077f1a`) are deployed | A `runId` on the write side without matching read side makes every `cockpit_gate_status` return `absent`, breaking pre-draft dedup and duplicating gates every wake — exactly the regression this feature exists to eliminate | FR-008 |

## Complexity Tracking

No constitution file → no violations to justify. The added state (`runId`, `runIdEnabled`) and the pre-flight probe extension are the minimum surface required to satisfy the FR-001 through FR-016 set; no simpler alternative was proposed in the clarifications.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan + the three contracts.
