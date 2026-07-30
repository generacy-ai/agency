# Quickstart: Startup sweep adopts pre-existing non-terminal gates instead of duplicating them across runs

**Feature**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)
**Branch**: `471-problem-once-phase-c`

This is an operator-facing quickstart. It shows how to observe the problem this feature fixes (duplicate inbox gates after a re-invocation), verify the fix landed, and interpret the four post-fix flows: same-generation adopt, generation-drift supersede, broad adopt of a non-matching row, and per-issue error defer.

## Prerequisites

- `/cockpit:auto` playbook at `packages/claude-plugin-cockpit/commands/auto.md` post-#471.
- Cluster registered per generacy-cloud#892 (`runId` on `cockpit_gate_list` rows) and #469 Phase B / generacy#1067 commit `82077f1a` (optional `runId` on the four gate-verb input schemas).
- `--gates=ui` or `--gates=auto` that resolves to `ui` (the adoption pass is dead prose under `local`).
- An epic issue with at least one child in a state that opens a gate (e.g. `waiting-for:clarification` on a child in D.1).

## Reproduce the duplicate-inbox regression (pre-#471, or after removing the adoption pass)

1. Start an epic run against a fresh epic:

   ```bash
   /cockpit:auto <owner>/<repo>#<epicN>
   ```

2. Wait for the run to open a `waiting-for:clarification` gate on a child (say `<owner>/<repo>#<childN>`). The gate appears in the operator inbox with `gateId = hash(childN, 'clarification', <gen>, R1)`. Do NOT answer it.

3. Interrupt the run:
   - Press `Ctrl-C`, OR
   - Trigger context exhaustion (long run, no interaction), OR
   - Restart the cluster, OR
   - Reboot the machine.

4. Re-invoke against the same epic:

   ```bash
   /cockpit:auto <owner>/<repo>#<epicN>
   ```

5. **Observe (pre-#471)**: TWO gates appear in the inbox for the same natural clarification decision on `<childN>`:
   - The original gate at `runId: R1` (still `open`; orphaned in the new run — no `openGates` entry tracks it).
   - A fresh gate at `runId: R2` (drafted by the new run's sweep).

   Answering the R1 gate resolves no `dispatchClass` in the R2 run — the answer routes nowhere. The operator must answer both, and only the R2 answer will land.

**Post-#471 the same steps produce ONE gate.**

## Verify the fix landed

Repeat steps 1–4 above. After step 4, **observe ONE gate in the inbox**, not two. The gate is the ORIGINAL R1 gate, adopted into the new run's `openGates` with:

- `gateId = <R1's gateId>` (unchanged).
- `runId = R1` in the `openGates` record (per FR-003 / FR-004 — this is different from the current run's loop-state `runId`, which is R2).
- `dispatchClass = 'D.1'` (per FR-008 — derived from `(gateType='clarification', generation)` using the same mapping-table rule the current-run sweep uses).

Answering the gate now:
- The answer arrives on `gateId = <R1's gateId>` via D.12.
- D.12 step 3's live-state supersession `cockpit_gate_ack(gateId, 'superseded', ...)` (if the answer changed labels) reads `runId = R1` from `openGates[gateId].runId` (per FR-004, plan § step 3 / § D.12 edits) and passes it on the wire. Server-side accept-and-ignore semantics (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`) mean the ack succeeds regardless.
- Step 5's `cockpit_gate_ack(gateId, 'applied', ...)` similarly reads `runId = R1` and passes it verbatim.

**Grep recipe (verify on the ledger)**:

```bash
# Confirm exactly one cockpit_gate_open row for the natural gate in R2
grep 'gateType=clarification' .generacy/cockpit/auto-runs/<R2-ledger>.ledger | grep 'gate-open'
# Should show ZERO rows for the adopted natural gate (per SC-006).

# Confirm the adopted entry's runId matches R1
grep 'gateType=clarification' .generacy/cockpit/auto-runs/<R2-ledger>.ledger | grep 'runId=<R1-string>'
```

## Four post-fix flows

### Flow 1 — Same-generation adopt (the common case)

**Setup**: R1 opened `clarification` on `<childN>` at `generation=g1`. R2 sweep derives `generation=g1` for the same natural gate (content unchanged between runs).

**Behaviour**: The `cockpit_gate_list({ issueRef: <childN>, gateType: <omitted> })` call returns one non-terminal row for the clarification gate. The classifier picks `adopt-natural` (per [`contracts/adoption-sweep.md § Branch: adopt-natural`](./contracts/adoption-sweep.md)). The row is added to `openGates` with the R1 `runId` preserved. The current run's derivation for the same natural gate produces a DIFFERENT 4-segment `gateId` from the prior-run row (because R1's `runId` and R2's `runId` differ — per §  gateId idempotency), so the sweep's subsequent D.1 dispatch calls `cockpit_gate_status` at the R2 `gateId` and gets `absent`. D.1 Step 0's `absent` branch then calls the runId-agnostic `cockpit_gate_list`, finds the SAME-generation prior-run row this adoption pass just adopted, takes the same-generation adopt branch, and continues to the next event — no `cockpit_gate_open` fires for this natural gate (per SC-006).

**Operator sees**: ONE gate. Same content, same options.

### Flow 2 — Generation-drift supersede (content moved between runs)

**Setup**: R1 opened `implementation-review` on `<childN>` at `generation=pr-sha:abc`. Between R1 and R2, a new PR head SHA landed. R2 sweep derives `generation=pr-sha:def`.

**Behaviour**: The `cockpit_gate_list` call returns the row at `generation=pr-sha:abc`. The classifier picks `drift-supersede` (per [`contracts/adoption-drift.md`](./contracts/adoption-drift.md)). The adoption pass acks the R1 gate `superseded` targeting the row's `runId=R1`. It does NOT add to `openGates`. The subsequent § Synthetic-event dispatch pass produces the `implementation-review` event for `<childN>`; D.3 routes it and opens a fresh gate at `generation=pr-sha:def` and `runId=R2` via `cockpit_gate_open`.

**Operator sees**: ONE gate — the fresh one at the current content. The stale gate is silently superseded (no inbox noise; it was against old content).

### Flow 3 — Broad adopt of a non-matching row (labels moved between runs)

**Setup**: R1 opened `implementation-review` on `<childN>` at some generation. Between R1 and R2, the child advanced past implementation-review — the current-run sweep would draft `manual-validation` for `<childN>`, not `implementation-review`. R1's gate is still `open`, still unanswered.

**Behaviour**: The `cockpit_gate_list` call returns the row for `implementation-review`. The classifier picks `broad-adopt` (per [`contracts/adoption-sweep.md § Branch: broad-adopt`](./contracts/adoption-sweep.md)). The row is added to `openGates` with the R1 `runId` preserved and `dispatchClass = 'D.3'` (derived from `(gateType='implementation-review', generation)`). The subsequent § Synthetic-event dispatch pass sees `<childN>` in the `waiting-for:manual-validation` transition class and draft's a fresh `manual-validation` gate at `runId=R2` via `cockpit_gate_open`.

**Operator sees**: TWO gates on `<childN>` — but this is CORRECT. They represent TWO different natural decisions (an old `implementation-review` still open from R1, and a new `manual-validation` from R2). Both are answerable — D.12 routes on `(dispatchClass, optionId)` and each answer lands. This is NOT the "duplicate for one decision" regression this feature exists to remove — that would be two gates for ONE decision, not two gates for TWO decisions.

An adopted `open` entry the operator ultimately ignores does not churn: the escape hatch (per `auto.md § step 3 / § step 4 sub-step 0 § Answered-gate parked-forever escape hatch`) only ticks `answered` entries.

### Flow 4 — Per-issue `cockpit_gate_list` error defer

**Setup**: The `cockpit_gate_list` call for `<childN>` returns `{status: 'error', class: 'transport', ...}` (the tool's internal `QUERY_RETRY_SCHEDULE` has already exhausted). Other in-scope issues' calls succeed normally.

**Behaviour**: The adoption pass skips both adoption AND drafting for `<childN>` this pass (per [`contracts/adoption-error-defer.md`](./contracts/adoption-error-defer.md) / FR-014 / V7). One ledger row is appended:

```
startup · adoption-list-error · <owner>/<repo>#<childN> · transport · deferred-to-next-wake
```

Other in-scope issues complete adoption + drafting normally. The run does NOT abort.

**Operator sees**: no gate for `<childN>` in this initial sweep. On the next natural wake (Monitor line or heartbeat), the label on `<childN>` (e.g. `waiting-for:clarification`) still triggers the transition class; the main-loop dispatch fires the D.n Step 0 for `<childN>` normally, and (assuming the transient blip is over) the gate opens as usual.

**Grep recipe**:

```bash
grep '· adoption-list-error ·' .generacy/cockpit/auto-runs/*.ledger
```

## Adopted `answered` gate (limitation to be aware of)

**Setup**: R1 opened `clarification` on `<childN>` and the operator ANSWERED it, but R1 died before D.12 delivered the answer to any dispatch. R2 starts.

**Behaviour**: The `cockpit_gate_list` call returns the row with `status: 'answered'` and `runId: R1`. The classifier picks `adopt-natural` (or `broad-adopt` — same shape). Adoption adds the entry to `openGates` AND initialises `answeredGateSweepCounter[gateId] = 1` (per FR-010 / SC-012).

**Two paths from here**:

1. **D.12 redelivery fires for the adopted `gateId` targeting R2** — the answer is consumed via the existing `deliveryId` dedup path. The operator sees no new prompt; the answer lands.
2. **D.12 does not redeliver** — after 3 sweeps in R2 (counter ticks 1 → 2 → 3), the escape hatch fires: acks `superseded` targeting `runId=R1` (accepted-and-ignored on the wire), deletes from `openGates`, and re-derives from current labels via `cockpit_status(issue=<childN>, json=true)`. If the operator's original answer caused a label transition (e.g. `waiting-for:clarification` → `completed:clarification`), the re-derivation dispatches on that transition. If labels did not move, the escape hatch synthesizes the SAME clarification event; the current-run sweep drafts a fresh gate; the operator is asked again.

**This is documented behaviour, not a bug.** No MCP surface returns the answer document (per FR-010's structural limitation). The follow-up to make answer-preservation unconditional is filed as a separate issue against generacy-cloud after this repair lands — see spec § Follow-ups.

## Escalation carve-out (per FR-013 / SC-011)

**Setup**: R1 opened an escalation gate (`gateType: 'escalation'`) on `<childN>` at `generation=occurrence:2`. R2 sweep derives `generation=occurrence:3` (a new escalation occurrence between runs).

**Behaviour**: The `cockpit_gate_list` call returns the row. The classifier does NOT pick `drift-supersede` for `escalation` gateTypes (per V4 / [`contracts/adoption-drift.md § Escalation carve-out`](./contracts/adoption-drift.md)) — it picks `broad-adopt` instead. The row is adopted at its stale `generation=occurrence:2`, left non-terminal. Whatever mechanism opens the fresh escalation for R2 (D.7 / D.10 / D.11 depending on subtype) will open its own gate at `generation=occurrence:3`.

**Operator sees**: potentially two escalation gates. This inherits the escalation-subtype residual limitation the live path already has (four dispatch rows share the one enum value; upstream generacy#1046). The carve-out preserves the existing behaviour rather than making it worse.

## `--gates=local` invariance (per FR-006 / US4 / SC-005)

Under `--gates=local`, the adoption pass is dead prose:

```bash
/cockpit:auto <owner>/<repo>#<epicN> --gates=local
```

Zero `cockpit_gate_list` calls fire on the adoption path. Zero `openGates` entries are recorded. The § step 3 sweep behaves exactly as today.

**Grep recipe**:

```bash
grep '· cockpit_gate_list ·' .generacy/cockpit/auto-runs/<ledger>.ledger
# Should return ZERO rows under --gates=local (the pre-flight probe under
# --gates=local is short-circuited per #469 / auto.md § step 1 § --gates
# resolution, and the adoption pass is dead prose under local).
```

## Troubleshooting

### "I see two gates for one decision after a re-invocation."

Symptoms of the pre-#471 regression. Verify:

1. The cluster is running a build that includes the #471 playbook prose. `grep 'Adoption pass' /workspaces/agency/packages/claude-plugin-cockpit/commands/auto.md` should return matches.
2. The run is under `ResolvedGateMode === "ui"`. The ledger's `Auto run starting · gates: <ui|local>` line names the mode; if `local`, adoption doesn't run (US4).
3. The `cockpit_gate_list` return actually contains the prior-run row. Inspect the tool call log for the § step 3 § Adoption pass block. If the row is missing, the cloud may be filtering by `runId` (should not happen — check for a rogue enablement of generacy-cloud#894).

### "I see one gate but D.12 answers land under the wrong `runId` on the wire."

The `openGates` per-entry `runId` field may not be threading. Verify:

1. `openGates[gateId].runId` on adopted entries equals the row's `runId`, not the current run's.
2. § D.12 step 5 / step 3 acks read from `openGates[event.gateId].runId` (per plan § D.12 edits), not the run-wide loop-state `runId`.

### "The run aborted after one child's `cockpit_gate_list` errored."

Contract violation. Per FR-014 the run MUST NOT abort on a per-issue `cockpit_gate_list` error. Verify [`contracts/adoption-error-defer.md`](./contracts/adoption-error-defer.md) is applied — the failing issue should defer and the run should continue.

## References

- [spec.md § User Stories](./spec.md) — the operator-facing scenarios above map 1:1 onto US1–US5.
- [contracts/adoption-sweep.md](./contracts/adoption-sweep.md) — call shapes, count, ordering, guard.
- [contracts/adoption-drift.md](./contracts/adoption-drift.md) — Flow 2's semantics.
- [contracts/adoption-error-defer.md](./contracts/adoption-error-defer.md) — Flow 4's semantics.
- [research.md](./research.md) — decisions and alternatives considered.
- `packages/claude-plugin-cockpit/commands/auto.md § step 3` — the block this feature edits.
- `specs/469-problem-cockpit-auto-only/spec.md § Assumptions → Behaviour change introduced by this phase` — the accepted consequence this feature repairs.
