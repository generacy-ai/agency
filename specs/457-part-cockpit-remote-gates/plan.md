# Implementation Plan: `cockpit:auto (--gates=ui)` — Reuse Existing Pending Gates in Startup Sweep

**Feature**: Add a durable pre-draft gate-status check at the top of every drafting D.n dispatch (D.1, D.2, D.3, D.4, D.7, D.11) — on BOTH the sweep path and the live in-session dispatch path — so restarting a `/cockpit:auto --gates=ui` conversation (or restarting the cluster) never produces duplicate operator-inbox gates and never re-runs the expensive drafting subagent for a gate that is already open. Includes generation drift handling (ack-`superseded` + re-draft), answered-state re-attach with a bounded escape hatch, D.11 defense-in-depth (durable check AND existing session-scoped `dispatched-issues` set), and re-pinned playbook-verification assertions.
**Branch**: `457-part-cockpit-remote-gates`
**Status**: Complete
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) (Q1 supersede-and-redraft; Q2 both-paths; Q3 record-and-consume + bounded hatch; Q4 cloud-transaction coalescing; Q5 keep both dedup layers)
**Epic**: [generacy-ai/generacy-cloud#850 — Cockpit Remote Gates](https://github.com/generacy-ai/generacy-cloud/issues/850)
**Design**: [docs/cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)

## Summary

Playbook-prose-only edit on the plugin side, plus re-pinned playbook-verification tests. **No engine changes, no MCP schema changes to `cockpit_gate_open` / `cockpit_gate_ack` / `cockpit_gate_status` / `cockpit_gate_list`.** The two read-only status tools this feature depends on (`cockpit_gate_status`, `cockpit_gate_list`) are delivered by the blocking upstream **generacy-ai/generacy#1038** — this ticket assumes them bound; ticket-side testing uses fixture-driven pins on the playbook text.

The bug is precisely diagnosed in `spec.md § Root Cause`: `auto.md` today spawns the drafting subagent BEFORE calling `cockpit_gate_open`, and the sweep's only cross-session dedup is `openGates` (in-memory, empty after restart) plus D.11's `dispatched-issues` (also in-memory). The sweep also hard-codes `generation=1` (`auto.md:198`) while the live path derives generation from content, so sweep-derived and live-derived `gateId`s never coalesce. Result: after any restart every already-pending gate is drafted a second time AND opened a second time in the operator inbox.

The fix adds — at the top of each of the six drafting D.n rows, on BOTH sweep and live paths — a **pre-draft `cockpit_gate_status` / `cockpit_gate_list` durable check** keyed on the same content-derived `gateId` the live path already uses. Three cases result:

1. **Existing open/answered gate at the SAME `gateId`** (Q1 case B / Q3) — skip the drafting subagent; record the existing gate in `openGates` and continue. `answered` state re-attaches so downstream D.12 delivery redelivers the answer via the existing NDJSON replay + `deliveryId` dedup path.
2. **Existing open/answered gate for the same `(issue, kind)` at a DIFFERENT `generation`** (Q1 case C, generation drift) — ack the stale gate `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft')`, then run the current draft-then-open flow. Re-attaching would apply an operator verdict computed against an old head SHA to current content, exactly the correctness hazard D.12's supersession checks exist to prevent.
3. **No matching gate at the current `gateId`** — the current draft-then-open flow runs unchanged.

Two ancillary changes are load-bearing:

- **Sweep `generation=1` default is removed** (FR-006). The sweep must derive `generation` from the same content-derived function the live path already uses (per-gateType table at `auto.md:1354-1366`), or `gateId`s do not coalesce — the pre-draft check would never match and the fix would be a no-op.
- **Bounded escape hatch for parked `answered` gates** (FR-009 / Q3 required follow-on). The MCP `answered` state collapses cloud `answered` / `delivered` / `applied` per the #1038 contract; a gate stuck at cloud `delivered` (or already `applied`) never produces a D.12 event because `cockpit-gate-delivery.ts:147-176` re-delivers only docs whose `status == 'answered' AND clusterId matches`. Without a bounded hatch, option Q3=C would park such an issue forever with no operator-visible signal. Rule: **after `N=3` consecutive sweeps in which a recorded `answered` gate produces no D.12 event, ack it `superseded` (detail: `answered-not-consumed — presumed stuck at cloud delivered/applied`) and re-derive from labels**. Rationale for N=3 in `research.md § R5`.

D.11's existing in-memory `dispatched-issues` set (`auto.md:706`) is **retained** as defense in depth (Q5=A). The durable check cannot express two properties the in-memory set does: (a) coalescing the `waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` label pair (they hash to two different `gateId`s under the escalation generation discriminator `subtype + triggering label/state + occurrence counter`, `auto.md:1360`); (b) session-mute-on-Skip semantics that never touch labels (`auto.md:718, :1636`) so the durable gate has been acked terminal by the time the next wake fires. Dropping either would REINTRODUCE duplicate gates — the opposite of this feature's purpose.

Playbook-verification tests are re-pinned to the new contract — the pre-draft check heading strings on each of the six D.n rows, the generation-drift ack rule, the record-and-consume rule for `answered` state, the bounded N=3 escape hatch, the D.11 defense-in-depth rule, and the removal of the `generation=1` default from the sweep. Existing pins that describe the OLD behavior are re-pinned to the NEW contract in the SAME PR, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin).

## Technical Context

**Language / runtime**: The plugin is playbook prose interpreted by the model at slash-command time; no compile-time code path executes it. Reference-implementation TypeScript (if any) lives under `packages/claude-plugin-cockpit/lib/` in the same shape as `lib/gate-wire-types.ts` (created by #449) and `lib/clarification-batch-parser.ts` / `lib/intent-recognition.ts` / `lib/invocation-form-4.ts`. Tests run under `vitest`, matching `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (3131 lines today).

**Frameworks / dependencies**:
- **No new runtime deps.** The wire types for the new read-only queries live upstream in the generacy MCP surface (per #1038 — `cockpit_gate_status`, `cockpit_gate_list`); the plugin consumes their return shapes as documented.
- **New MCP tools consumed** (bound by the cluster per generacy#1038, not registered by this ticket):
  - `cockpit_gate_status({ issueRef, gateType, generation }) → { gateId, status: 'open'|'answered' } | { gateId: null, status: 'absent' }` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`) requires all three semantic inputs; the tool server derives `gateKey`/`gateId` internally and the plugin never hand-builds them. Used in the pre-draft check step 1 to detect the same-`gateId` reuse case.
  - `cockpit_gate_list({ issueRef, gateType }) → { gates: [{ gateId, gateType, generation, status }, ...], truncated?: boolean }` — enumerates non-terminal gates for the `(issue, gateType)` pair; used in step 2 to detect generation drift. Returns an OBJECT (not a bare array); the plugin iterates `result.gates`. Entries do NOT carry `askedAt` and the list has no wire-level ordering guarantee.
  - Both queries may return a typed `query-unreachable` error class (per generacy #1038 `mcp/errors.ts` / FR-014); the plugin MUST NOT collapse it to `status: 'absent'` — on `query-unreachable`, the pre-draft check aborts the event's dispatch with a visible error and moves to the next event.
  - `cockpit_gate_ack(gateId, outcome: 'superseded', detail)` — already bound; extends existing usage with the `superseded` outcome on non-terminal gates (per Q1 rationale citing `packages/generacy/src/cli/commands/cockpit/mcp/gates/schemas.ts:46-47` and generacy-cloud `services/api/src/services/relay/message-handler.ts:934-980`).
- **Reused verbatim from today's playbook**: every drafting subagent invocation (D.1 clarification drafter `auto.md:421`, D.2 review-verdict analyzer `:475`, D.3 same-as-D.2 `:509`, D.4 manual-val summarizer `:528`, D.7 diagnosis subagent `:608`, D.11 merge-conflicts diagnosis subagent `:708`); the `cockpit_gate_open` call and its per-row `GateOpenParams` (from the § UI-mode gate mapping table); the D.12 gate-answer routing and `openGates` map; the § UI-mode fallback path; the § Ledger `· source: ui-gate` provenance suffix. **The pre-draft check inserts a step 0 in each drafting D.n dispatch — it does not change any downstream step.**

**Boundaries preserved**:
- **`--gates=local` byte-path unchanged.** The pre-draft check is scoped explicitly to `ResolvedGateMode === "ui"`. Under `local` the check is dead prose and every existing local-mode test passes without modification.
- **Never merge on red and every gate prompts** (auto.md opening paragraph) unaffected. The pre-draft check moves WHERE the drafting decision is made (from "always draft" to "draft only when no gate exists"), not WHETHER the operator is prompted. Every existing pending gate still requires an operator answer; nothing auto-proceeds.
- **No engine changes / no MCP schema changes** for the plugin ticket. `cockpit_gate_status` and `cockpit_gate_list` are owned by generacy#1038; deviations from their frozen return shapes must be proposed on that issue, not patched here.
- **Playbook-first, code-second.** Any TypeScript added under `lib/` is a reference implementation of the prose, not the source of truth.
- **UI mode only.** The change targets `ResolvedGateMode === "ui"`. `--gates=cli` and `--gates=none` are out of scope per spec § Out of scope.

**Presence-check for the new tools**: `cockpit_gate_status` and `cockpit_gate_list` join the existing tool-presence check at `auto.md:176` (currently seven tools) → the check grows to name nine `cockpit_*` tools. When either new tool is absent from the session's MCP binding, the sweep's fail-loud path (§ step 3 `Print + exit`) fires exactly as it does today for any missing cockpit tool — no operator prompt, no ledger dir created, per the Q3=A precedent from #449.

**Session-state model**: Extends the `openGates: Map<gateId, GateRecord>` block already in `auto.md § In-memory loop state additions` (added by #449). Two additions:

- `answeredGateSweepCounter: Map<gateId, number>` — for each `gateId` currently in `openGates` in state `answered`, count consecutive sweeps in which no D.12 event has landed. Incremented on each sweep entry with the gate still in `answered`. Decremented/deleted the moment a D.12 event resolves it. When the counter reaches `N=3`, the sweep acks the gate `superseded` (detail: `answered-not-consumed — presumed stuck at cloud delivered/applied`), removes it from `openGates`, and re-derives from labels on the same sweep.
- **No new session state for `open` gates** — the existing `openGates` entry from the pre-draft check IS the record; the durable inbox is authoritative per the spec's Assumption 3.

## Approach

The change adds exactly one new sub-step at the head of each drafting D.n dispatch — **step 0: pre-draft gate-status check** — plus a **sweep-time counter tick for `answered` gates**. Every downstream step (subagent spawn, gate open, ledger row, ack path) is unchanged.

### Step-0 pre-draft check (added to D.1, D.2, D.3, D.4, D.7, D.11)

Inserted at the very top of each dispatch, before context fetch / subagent spawn:

1. Compute `gateType` and the content-derived `generation` for the current event (per the § UI-mode gate mapping generation-discriminator table at `auto.md:1354-1366`). This computation is the SAME one the live path already does today at `cockpit_gate_open` call time — the pre-draft check simply performs it BEFORE spawning the subagent instead of AFTER.
2. Call `cockpit_gate_status({ issueRef, gateType, generation })` — the MCP tool's frozen `.strict()` input schema requires all three semantic inputs; the tool server derives `gateKey`/`gateId` internally (the plugin never hand-builds a hash).
3. Branch on the return:
   - **`{ status: 'open' }` or `{ status: 'answered' }`** — skip the subagent; record a PARTIAL `openGates` entry keyed by the returned `gateId` (`{gateId, gateType, generation, issueRef, status, transitionClass}` — `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated on the reuse path because the status query returns none of them); continue to next event. For `answered`, tick the sweep counter (see below). **The drafting subagent is NOT spawned.** The FR-005 "one pointer line" is NOT printed on the reuse path — that line requires `inboxUrl` which the query does not return.
   - **`{ status: 'absent' }`** — run `cockpit_gate_list({ issueRef, gateType })`; iterate `result.gates` and branch again:
     - If `result.gates` contains a non-terminal entry at a DIFFERENT `generation` (generation drift, Q1=C) — call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')`. Then continue to the current draft-then-open flow (subagent spawn → present gate → `cockpit_gate_open`) with the fresh generation. The stale gate transitions terminal cloud-side.
     - If `result.gates` is empty AND `result.truncated !== true` (no gate anywhere for this `(issue, gateType)`) — run the current draft-then-open flow unchanged.
     - If `result.gates` is empty AND `result.truncated === true` — treat as `query-unreachable` (a drift entry may be hidden on a subsequent page); abort this event with a visible error per FR-014.
   - **`query-unreachable` typed error** (from either query, after the tool's internal retry budget is exhausted) — abort this event's dispatch, write ledger `<issue-ref> · <transition-class> · pre-draft-check · error: query-unreachable — aborting sweep for this event · source: ui-gate`, and continue with the next event. **MUST NOT** collapse to `absent`.

Per Q4=B (cloud-side coalescing on identical `gateId` via the Firestore `runTransaction` on `organizations/{orgId}/cockpitGates/{gateId}`), no client-side lock/lease is added. Concurrent sweeps that both see `absent` may both draft, but only one gate document exists cloud-side; the second `cockpit_gate_open` call takes the non-terminal-branch that only rebinds `clusterId` and refreshes `body`/`options`/`askedAt`. One duplicated drafter spawn in the race window is acceptable and out of scope per spec § Out of scope and SC-002's precise wording (which measures against the existing-gate case only).

### `answered`-state sweep counter (FR-009 bounded escape hatch)

Per Q3 required follow-on: when the pre-draft check records an `answered` gate, the sweep-time counter `answeredGateSweepCounter[gateId]` is incremented (initialized to `1` on first observation). On D.12 delivery of any `gate-answer` whose `gateId` matches, the counter is reset (deleted). At the top of every sweep:

- For each entry in `openGates` where `status == 'answered' AND counter >= N=3` (with N=3 chosen in `research.md § R5`): call `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')`, remove from `openGates`, delete the counter. Then re-derive from labels on the same sweep — the resulting event proceeds through the normal pre-draft check with a fresh `gateId` (since generation is content-derived, the fresh label-driven event yields the same generation and thus the same `gateId`; the just-acked gate is now terminal, so `cockpit_gate_status` returns `absent` and drafting proceeds).

N=3 is the value pinned in the playbook prose so a future edit that "simplifies" it to N=1 (aggressive) or N=∞ (unbounded park-forever) breaks the pin.

### D.11 defense-in-depth (Q5=A / FR-010)

D.11's `dispatched-issues` in-memory check at `auto.md:706` is **retained** in its current position (step 1 of D.11's dispatch). The new pre-draft check is inserted as **step 0**, ABOVE the `dispatched-issues` check. Order of operations:

1. Step 0: pre-draft `cockpit_gate_status` — if an existing gate is found at the same `gateId`, record and continue. This coalesces the CROSS-SESSION case (durable gate survived a restart / cluster takeover).
2. Step 1 (unchanged from today): `dispatched-issues` set check — if `<issue-ref>` is present, write ledger-only `already-dispatched` row and continue. This coalesces the WITHIN-SESSION label-pair case (`waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` fire together but hash to different `gateId`s under the escalation generation discriminator) AND preserves session-mute-on-Skip semantics (the set entry survives skip per `auto.md:718`, but is removed on successful advance per `:717`; no durable gate query can express this because Skip never touches labels).
3. Steps 1a onward (unchanged): fetch context; spawn diagnosis subagent; present G.4d.

The two checks are complementary, not redundant. `research.md § R6` enumerates the two orthogonal properties the in-memory set expresses that no durable query can.

### Sweep `generation` derivation (FR-006)

The sweep at `auto.md:198` currently hard-codes `generation=1`. This is the load-bearing bug behind the whole issue: sweep-derived and live-derived `gateId`s never coalesce because the live path uses a content-derived generation. The fix: compute `generation` per-event using the SAME derivation function the § UI-mode gate mapping table defines (per-gateType, table at `auto.md:1354-1366`), which requires reading the same content inputs the live path already reads (`clarificationComment.body` for D.1, PR head SHA for D.3 / D.4, artifact + review-branch head SHA for D.2, `subtype + triggering label + occurrence counter` for D.7/D.11 escalations).

**DATA GAP consequences (per `auto.md:1367`)**: for `escalation`, `clarification`, `artifact-review`, `implementation-review`, `manual-validation`, and `scope-drained`, several inputs to the generation function are not yet derived from durable GitHub state today (the parent loop doesn't compute head SHA / occurrence counter / batch-id). For gateTypes where the input is NOT yet computable, the pre-draft check's `gateId` cannot be built with the same value the live path used, and the same-`gateId` reuse case degrades to the generation-drift case (list-then-ack-superseded-then-redraft). The drafting subagent still runs, but no duplicate INBOX entry is created (cloud-side `handleGateOnCoal` coalesces on the fresh `gateId`, and the stale one has just been acked). The parked-answered escape hatch still applies. **This degradation is documented on the epic as a DATA GAPS follow-up** — the fix does not depend on the gaps being closed to eliminate duplicate INBOX entries (SC-001 target), but SC-002 (`drafting subagent spawns = 0` in the reuse case) is not fully met for the gap-affected gateTypes until #1038's DATA GAPS follow-up ships. `phase-queue` and `filing` have no gap (phase number / draft hash are fully known) and hit SC-002 = 0 immediately.

### Playbook edits (auto.md)

The prose edits are surgical:

1. **§ Dispatch D.1** — add `**Step 0 — pre-draft gate-status check**` block before the current step 1 (`Fetch context`). Ledger line unchanged.
2. **§ Dispatch D.2** — same shape; before current step 1 (`Resolve target artifact`).
3. **§ Dispatch D.3** — same shape; before current step 1 (`Resolve PR`).
4. **§ Dispatch D.4** — same shape; before current step 1 (`Spawn manual-validation summarizer`).
5. **§ Dispatch D.7** — same shape; before current step 1 (`Fetch evidence`). Both first-dispatch AND repeat-dispatch paths gain the pre-draft check.
6. **§ Dispatch D.11** — pre-draft check inserted as new step 0 BEFORE the current step 1 (`Dedup check` — the in-memory `dispatched-issues` check). Step 1 through step 3 unchanged.
7. **§ step 3 startup sweep** — the paragraph at `auto.md:198` that hard-codes `generation=1` is rewritten to state that sweep-time `cockpit_gate_open` uses the same content-derived generation the live path derives. The `answeredGateSweepCounter` tick + N=3 escape hatch is added as a new paragraph at the top of the sweep (BEFORE the synthetic-event dispatch), together with an explicit statement that the N=3 threshold is a load-bearing value pinned by the test suite. Tool-presence check grows from seven to nine tools (adding `cockpit_gate_status`, `cockpit_gate_list`).
8. **§ In-memory loop state additions (UI mode)** — add `answeredGateSweepCounter: Map<GateId, number>` alongside the existing `openGates` and `firstGateOpenFailureNoted`.
9. **§ D.12 gate-answer** — add a single-line clarifying step in the answer handler that resets the sweep counter (`answeredGateSweepCounter.delete(event.gateId)`) when a D.12 event resolves an entry.

**No other rows change.** D.5 (green merge) has no gate. D.6 (validate + red) already routes through the § G.4(a) fixer branch under a single `openGates` record — its gate is opened via the § D.6 → G.4(a) path and does not need a separate pre-draft check (the sweep does not synthesize D.6 events directly — it synthesizes the underlying `completed:validate` label state, which the fixer branch's own idempotency handles). D.8 (phase-complete → G.5) opens against `<epic-ref>` (sole per-issue exception per the § UI-mode gate mapping G.5 row); its generation is the phase number (`P<next>`) which has NO data gap and is fully coalescing. D.8 gains the pre-draft check by the same rule as the other six drafting rows — added as a step 0 before the current step 1 (`Compute next phase scope`). D.10 (unrecognized state) opens G.4(c) with an operator-facing catch-all that never re-runs after restart because the label itself must be identical for the trigger to re-fire; the pre-draft check adds no value here and is NOT added (out-of-scope for this issue; explicitly noted in the plan so a future review doesn't mistake the omission for drift). D.9 / D.9a–D.9d are ledger-only, no gate, no change.

**Correction**: The six-row scope in FR-001 is authoritative (D.1, D.2, D.3, D.4, D.7, D.11). The plan MUST NOT expand it to D.8 without a corresponding spec update. The D.8 note in the paragraph above is provisional analysis noting the same durable-check logic APPLIES structurally, but the spec explicitly enumerates the six rows and D.8 is not among them. This plan implements EXACTLY the six rows the spec pins; D.8 is a follow-up.

### Test edits (playbook-verification.test.ts)

Add a new `describe("457 sweep-time gate reuse", () => { ... })` block at the end of the file (after the `449 UI-mode gates` block at line 2832). New assertions:

- **457-1**: § step 3 startup sweep declares the nine-tool presence check (adds `cockpit_gate_status`, `cockpit_gate_list` alongside the existing seven).
- **457-2**: § step 3 startup sweep no longer contains the string `generation=1` (the hard-coded default is removed).
- **457-3**: § step 3 startup sweep declares the `answeredGateSweepCounter` + `N=3` escape hatch verbatim (N pinned literally).
- **457-4 through 457-9**: each of § Dispatch D.1, D.2, D.3, D.4, D.7, D.11 contains the `**Step 0 — pre-draft gate-status check**` heading AND the three-branch rule (same-gateId reuse / generation-drift supersede-and-redraft / absent-no-op) AND the "on `answered`, record + tick sweep counter" clause.
- **457-10**: § Dispatch D.11 contains BOTH the new pre-draft check (as step 0) AND the existing `dispatched-issues` in-memory dedup check (as step 1) — defense-in-depth pin.
- **457-11**: § In-memory loop state additions (UI mode) declares `answeredGateSweepCounter: Map<GateId, number>`.
- **457-12**: § D.12 gate-answer resets the sweep counter on D.12 delivery (verbatim rule).
- **457-13**: § UI-mode gate mapping generation-discriminator table is unchanged (drift audit — the new pre-draft check MUST use the SAME generation function the live path uses; a divergence here would silently re-break the feature).

Existing pins on § step 3 startup sweep and § Dispatch D.1/D.2/D.3/D.4/D.7/D.11 that quote the OLD contract (no step 0) are **re-pinned to the new contract in the same PR**, per repo CLAUDE.md § "Cockpit playbook pins" (do not weaken; re-pin).

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo (verified: `find /workspaces/agency/.specify -type f` returns only templates). Applying the plugin-scope `CLAUDE.md` pins:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins `commands/auto.md` by exact heading strings and contract rules. This plan **re-pins** the § step 3 sweep, six D.n dispatch rows, and In-memory-loop-state additions to the NEW contract. New pins are added under a `describe("457 …")` block. No pin is weakened or deleted; the acceptance criterion (spec § US3) is verified by the re-pinned suite going green.
- **Never merge on red / every gate prompts** (auto.md opening paragraph): the pre-draft check moves WHERE the drafting decision is made (only when no gate exists), not WHETHER the operator is prompted. Every existing gate still requires an operator answer; nothing auto-proceeds. Per-gate auto-approve stays out of scope.
- **Playbook-first, code-second** (existing pattern at `lib/gate-wire-types.ts`, `lib/clarification-batch-parser.ts`, etc.): any `lib/` additions are reference implementations of prose contracts, not the source of truth. If a `lib/gate-status-check.ts` reference module is added under this ticket, its shape mirrors `lib/gate-wire-types.ts` (types + short guard functions with unit-testable fixtures).
- **No new external systems / no new APIs bound by this ticket**: `cockpit_gate_status` and `cockpit_gate_list` are bound by the cluster (generacy#1038), not by the plugin. No new dependency-graph edges introduced by this ticket beyond consuming the return shapes #1038 already documents.

## Project Structure

### Documentation (this feature)

```text
specs/457-part-cockpit-remote-gates/
├── spec.md                        (unchanged — read-only)
├── clarifications.md              (unchanged — read-only, source of Q1–Q5)
├── plan.md                        (this file)
├── research.md                    (technology decisions + rationale + N=3 justification)
├── data-model.md                  (types: pre-draft check step, answeredGateSweepCounter, extended openGates record shape)
├── quickstart.md                  (operator usage; restart-safety demo; parked-answered demo)
├── contracts/
│   ├── pre-draft-check.md         (the six-row step-0 contract: gateId derivation, three-branch rule, ack-superseded detail strings)
│   ├── answered-escape-hatch.md   (FR-009 contract: counter, N=3, ack rule, re-derive-from-labels)
│   └── sweep-generation-fix.md    (FR-006 contract: sweep now uses live-path generation function; removal of `generation=1` default)
├── checklists/                    (empty; populated by /checklist if invoked)
└── tasks.md                       (Generated by /speckit:tasks)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/auto.md                     (EDIT — 6 new step-0 blocks in D.1/D.2/D.3/D.4/D.7/D.11; § step 3 sweep rewritten; § In-memory loop state block extended; § D.12 counter-reset clause)
├── lib/                                 (potential NEW files, ref-impl only — TBD in tasks phase; NOT load-bearing)
│   └── gate-status-check.ts             (OPTIONAL — reference guard functions for the three-branch rule; fixtures pinned by test)
└── tests/playbook-verification.test.ts  (EDIT — new `describe("457 sweep-time gate reuse")` block; existing pins on § step 3 and the six D.n rows re-pinned to the new contract)
```

**Files intentionally not touched**:
- **Engine / cluster / MCP server code** — `cockpit_gate_status` and `cockpit_gate_list` implementations live in generacy-ai/generacy#1038 (upstream blocking dependency). This ticket assumes those tools bound; ticket-side testing uses `--gates=local` byte-path (unchanged) plus fixture-driven UI-mode pins on the playbook text.
- **Cloud code** (`generacy-cloud/services/api/src/services/relay/message-handler.ts`) — the transaction-based coalescing on `cockpitGates/{gateId}` is already correct per Q4 verification; no change needed.
- **The other five `commands/*.md` playbooks** (clarify, queue, review, merge, status, watch) — their pinned tests continue to pass unchanged. The `readdirSync(COMMANDS_DIR)` sweep in `playbook-verification.test.ts` also pins them for invocation-vs-`--help` drift; the edit to auto.md must not break that sweep.
- **`cockpit-remote-gates-plan.md`** in tetrad-development — this plan references the epic doc's Wire contracts and Idempotency sections. Contract changes must be proposed on the epic tracking issue.
- **D.5, D.6, D.8, D.9 family, D.10** — out of scope per spec § FR-001 (six drafting rows only). D.8's structural applicability is noted above but explicitly deferred.

## Key technical decisions (details in research.md)

| Decision | Choice | Rationale (short) | Clarification anchor |
|----------|--------|-------------------|----------------------|
| Generation-drift matching | Ack stale gate `superseded` + run fresh draft-then-open flow | Re-attaching would apply an operator verdict computed against old head SHA to current content — the correctness hazard D.12's supersession checks exist to prevent | Q1=C |
| Live-path scope | BOTH sweep and live paths gain the pre-draft check | Sweep-synthesized and live events share the same D.n dispatch rows (`auto.md:184`); a "sweep-only" flag does not exist and would be strictly more complex than an unconditional check | Q2=B |
| Answered-but-unconsumed gates | Skip drafting + record in `openGates` so D.12 delivery redelivers | Consuming inline is not viable (no layer of the #1038 stack returns the answer payload); treating as absent violates the #1038 contract; recording is load-bearing because D.12 step 1 drops answers with no `openGates` entry | Q3=C |
| Parked-answered escape hatch | After N=3 consecutive sweeps with no D.12 event, ack `superseded` + re-derive from labels | The MCP `answered` state conflates cloud `answered`/`delivered`/`applied` and `cockpit-gate-delivery.ts:147-176` re-delivers only `answered + clusterId matches`; a gate stuck at `delivered` or `applied` would otherwise park forever | Q3 required follow-on |
| Concurrent-sweep race | Cloud-side transactional coalescing on `cockpitGates/{gateId}` is authoritative; wasted drafter spawn on the losing side is out of scope | No per-`gateId` lease exists; the only lease (`cockpit_claim`) is scope-level and absent from `auto.md`; C would wire a new concurrency mechanism to save one drafter spawn in a rare window | Q4=B |
| D.11 in-memory `dispatched-issues` | KEEP both — durable covers cross-session; in-memory coalesces the label-pair AND preserves session-mute-on-Skip semantics | Removing the in-memory set would reintroduce duplicate gates (the label-pair hashes to two different `gateId`s under escalation generation) AND re-gate every skipped merge-conflict issue on every wake | Q5=A |
| Sweep `generation=1` default | REMOVED; sweep uses the live-path content-derived generation function | The whole feature is a no-op without this fix — `gateId`s never coalesce across sweep/live paths | FR-006 (prerequisite for FR-002) |
| Presence-check tool-set | Grows from 7 to 9 (`cockpit_gate_status`, `cockpit_gate_list` added) | Fail-loud on absence matches the seven-cockpit-tools precedent at `auto.md:176`; explicit `--gates=ui` on a cluster without #1038 hard-fails per the Q3=A precedent from #449 | (implicit in Assumption 1) |

## Complexity Tracking

No constitution file → no violations to justify.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan + the three contracts.
