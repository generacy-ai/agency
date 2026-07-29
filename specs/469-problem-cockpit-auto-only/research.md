# Research: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

Rationale, alternatives considered, and prior art referenced during planning. Every load-bearing choice traces to a clarification answer (Batch 1 Q1–Q5, Batch 1B Q1–Q5, Batch 2 Q6–Q7 in [clarifications.md](./clarifications.md)), the frozen Phase B wire contract from generacy#1067, the Phase A storage contract from generacy-cloud#892, or an existing pattern in `packages/claude-plugin-cockpit/commands/auto.md`.

## R1 — Where does `runId` derivation slot in the pre-flight?

**Decision**: A new derivation step in § step 1, IMMEDIATELY AFTER the ledger filename computation currently at `auto.md:209`. `runId := <tracking-ref-slug>-<timestamp>` — the ledger filename stem verbatim, `.ledger` suffix NOT included.

**Why**: The derivation MUST happen at the same point the ledger filename is computed (per FR-014 compute-once). Placing it immediately after the ledger filename is computed makes the invariant self-enforcing — a future edit that moves the ledger filename computation must also move the `runId` derivation, and they never split. Any earlier position would derive `runId` before the tracking-ref-slug and timestamp are bound; any later position would allow a downstream site to be tempted to re-derive.

**Alternatives considered**:

- **Derive `runId` on first use** (in the startup sweep before the first `cockpit_gate_open`) — rejected. Two consumers use the value before the sweep — the pre-flight capability probe (§ step 1 § Pre-flight probe (UI mode), which extends its `cockpit_gate_list` call with `runId`) and the `--gates=auto` resolution's tentative-UI window (which needs a stable identity if Form 3 G.6 opens remotely before the probe fires). Late derivation would require a "compute `runId` lazily but atomically before either consumer" contract that adds no value.
- **Derive `runId` on the loop state at loop entry (§ step 4)** — rejected for the same reason. The startup sweep's `cockpit_gate_open` calls fire before § step 4.
- **Encode `runId` as a hash of the ledger filename** — rejected per Batch 1 Q4 / Batch 1B Q1. The hash is opaque under a `cockpit_gate_list` row inspection, defeating the traceability rationale.

**Contract**: `contracts/runid-derivation.md § Site`.

## R2 — `runId` on-wire value (Batch 1 Q4 / Batch 1B Q1)

**Decision**: The `runId` on every gate verb wire payload is the FULL ledger filename stem verbatim: `<tracking-ref-slug>-<timestamp>` (e.g. `epic-1053-20260729-143012`). NOT the trailing timestamp alone.

**Why (per Batch 1 Q4 answer)**: The rationale is traceability. The tracking ref appears nowhere else in a gate document. Under the timestamp-only choice, an operator inspecting a gate document — or a `cockpit_gate_list` row (which surfaces `runId` per generacy-cloud#892) — sees a bare `20260729-051000` and has to guess which run that was. Under the full-stem choice the row is self-describing and greps directly against `.generacy/cockpit/auto-runs/`, matching the design note *"reusing it keeps the ledger and the gate identity mutually traceable during a post-mortem."*

**Corroboration**: Generacy#1067's `runIdSource` log line deliberately records `'explicit' | 'unset'` and never the value, on the stated grounds that auto-run ids embed cluster/repo/issue/timestamp — the log-line design assumes the value is composite and self-describing, which the timestamp-only shape would not be.

**On cross-epic `runId` collisions**: The Batch 1 Q4 question posited a functional collision hazard under timestamp-only (same second → same `runId`). That hazard does NOT actually hold — `issueRef` is already the first segment of the key (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), so two runs against different epics touch different issues and cannot collide on `gateId` regardless of `runId`. A same-second cross-epic `runId` collision is COSMETIC, not functional. The traceability argument alone is load-bearing.

**Alternatives rejected**:

- **Timestamp only** — see above. Poor traceability.
- **Hash / UUID** — opaque under `cockpit_gate_list` inspection; adds a new derivation the operator cannot verify against the ledger filename.

**Contract**: `contracts/runid-derivation.md § Value shape`.

## R3 — Pre-draft `cockpit_gate_status` scope (Batch 1 Q1 → FR-009)

**Decision**: Every per-event pre-draft `cockpit_gate_status` invocation in all six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) carries the current run's `runId` under `runIdEnabled === true`.

**Why (per Batch 1 Q1 answer)**: `runId` on the write side alone would leave a 4-segment key on `cockpit_gate_open` and a 3-segment key on pre-draft `cockpit_gate_status`. Every pre-draft check would return `absent` (Phase A stores the run's fresh gate under a key the 3-input query cannot find), the drafting subagent would re-run on every wake, and duplicate inbox gates would accumulate against a `gateId` the loop never tracks. That is the exact regression `runId` was introduced to eliminate — shipping the write half alone would leave the epic MEASURABLY WORSE than before it started, because today's 3-input identity at least coalesces.

**Consequence for D.7 and D.11**: These rows carry `gateType: 'escalation'` and the generation-drift branch is DISABLED for them (the `cockpit_gate_list` drift-check filter is `{issueRef, gateType}` and cannot distinguish D.6/D.7/D.10/D.11 escalation subtypes — the residual-limitation call-out established by #457). The pre-draft `cockpit_gate_status` call itself still runs at Step 0 in D.7 and D.11 (it is the same-`gateId` reuse check, which does not depend on subtype), and it MUST carry `runId` for the same read/write coalescing reason as D.1/D.2/D.3/D.4. Only the `cockpit_gate_list` drift call (in the `absent` branch) is skipped for D.7/D.11.

**AC anchors satisfied by this decision** (per Batch 1 Q1 answer):

- New FR-009 (in spec.md) — "every pre-draft `cockpit_gate_status` call in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) also carries the run's `runId`".
- New US2 AC — "a second wake for an already-open gate takes the Step 0 reuse branch, not the draft branch".
- New US2 AC — "`cockpit_gate_open` and pre-draft `cockpit_gate_status` for the same natural gate in the same run derive the same `gateId`".

**Alternatives rejected**:

- **Status stays 3-input** — this is the "measurably worse" case above. Duplicates the exact bug this feature exists to eliminate.

**Contract**: `contracts/runid-threading.md § Read-side (cockpit_gate_status)`.

## R4 — `cockpit_gate_list` `runId` policy (Batch 1 Q2 → FR-011)

**Decision**: `runId` is FORBIDDEN on every functional `cockpit_gate_list` call in this phase. The pre-flight capability probe (FR-012) is the SOLE exception, and is safe precisely because Phase B's handler drops the field before it reaches the cloud endpoint.

**Why (per Batch 1 Q2 answer)**: Phase B accepts `runId` on `CockpitGateListInputSchema` for surface parity (both `status` and `list` schemas landed the field in the same commit `82077f1a`), but the handler drops `runId` before the cloud call. The deployed cloud contract refines `runId requires generation`, and the sweep probe (`cockpit_gate_list({issueRef, gateType: <omitted>})`) has no `generation` — forwarding `runId` would return 400 on the cloud side and break the sweep's primary dedup primitive. List-mode `runId` filtering is separately tracked as generacy-cloud#894 and is deliberately opt-in.

**Silence would be risky**: Because Phase B accepts `runId` on the list schema for surface parity, an implementer who sees the field on the schema will reasonably assume it is meant to be passed. FR-011 states the forbid-plus-carve-out rule explicitly: *"no functional `cockpit_gate_list` call may carry `runId`; the pre-flight capability probe is the sole exception and does so precisely because the value is dropped locally"*.

**Independent reinforcement from Batch 2 Q6**: The Batch 2 Q6 "sweep adopts pre-existing gates" follow-up will also use a runId-agnostic list call (`cockpit_gate_list({issueRef, gateType: <omitted>})`). Foreclosing runId filtering on list by default would foreclose that repair before it is built. generacy-cloud#894 should stay opt-in filtering for that reason.

**Alternatives rejected**:

- **Leave unstated** — a `list` schema that visibly accepts the field is a silent invitation to pass it. Silence is a specification bug.
- **Extend list to filter by `runId` by default** — would 400 the sweep probe (no `generation`) and would foreclose the Batch 2 Q6 sweep-adopt follow-up.

**Contract**: `contracts/runid-threading.md § Read-side (cockpit_gate_list)`; `contracts/runid-probe.md § Probe-only carve-out`.

## R5 — `auto.md:283` prose update (Batch 1 Q3 → FR-010)

**Decision**: The prose at `auto.md:283` is updated in the SAME PR as the caller wiring, from "the pre-draft check … names the same three inputs" to "the pre-draft check … names the same four inputs (under `runIdEnabled === true`; three under `runIdEnabled === false`)". Add a pointer to the behaviour-change note in spec.md § Assumptions.

**Why (per Batch 1 Q3 answer)**: The line is the load-bearing contract for when two `gateId`s coalesce; a future reader consults it to decide whether two `gateId`s should merge. If the code names FOUR inputs and the prose says THREE, the prose is actively misleading and will be trusted. Given Batch 1 Q1 = A (status is in scope), A and C produce the same outcome; A (states the deliverable outright) is preferable because it removes the conditional for a later reader.

**Alternatives rejected**:

- **Follow-up doc issue** — would leave the "three inputs" prose live for exactly as long as follow-up doc issues usually stay open (indefinitely).
- **Conditional on Batch 1 Q1** — would leave a conditional in the plan for a later reader to re-evaluate; A collapses the two.

**Contract**: `contracts/runid-threading.md § auto.md:283 prose update`.

## R6 — Runtime cluster prerequisite guard (Batch 1 Q5 / Batch 1B Q4 → FR-012)

**Decision**: Pre-flight capability probe, decided ONCE, whole-session. The probe extends today's `cockpit_gate_list({issueRef: <identity-ref>, gateType: <omitted>})` call with `runId`. On `invalid-args` (pre-#1067 cluster), `runIdEnabled := false` for the entire session, log the startup warning naming the pre-#1067 condition, and continue under today's 3-input identity. On `ok`, `runIdEnabled := true`. Every other error class routes to today's probe-failed behaviour verbatim.

**Why (per Batch 1 Q5 answer)**:

1. **The probe is FREE.** It extends an existing call with one field. Zero additional calls, zero cloud impact (the handler drops the field before the cloud call). Fits the file's existing philosophy of probing whether the surface WORKS rather than whether its tools are BOUND.
2. **B (mid-run revert) must be rejected outright**, not on cost grounds. Disabling `runId` mid-session and reverting to 3-input identity produces a MIXED-IDENTITY RUN. The startup sweep opens gates via `cockpit_gate_open` before any Step-0 check runs, so by the time the first `invalid-args` arrives there can already be 4-segment gates open; reverting the read side then orphans exactly those gates for the rest of the session. It also breaks two things this issue commits to: the AC *"every `cockpit_gate_open` and `cockpit_gate_ack` in one auto run carries the same `runId`"*, and the design note *"a `runId` used to open a gate but not to ack it means the ack targets a different key."* B is the one option that can leave a run in a state neither identity scheme describes.
3. **A over C (Assumption-only) because the probe is free and keeps a heterogeneous fleet working.** C hard-stops older clusters on the very issue this fixes.

**Distinguishing `invalid-args` from other error classes at pre-flight is a NEW behaviour** compared to today's probe. Today's probe treats every error class the same (any error → probe-failed). The extension adds ONE branch — the `invalid-args` graceful-degradation path. All other classes retain today's behaviour verbatim. This asymmetry is safe because `invalid-args` on a `.strict()` schema is definitionally a "known-unknown" — the tool server told us it does not recognize the field. Every other class describes a broken surface, not a capability gap; downgrading `runIdEnabled` on those would silently mask a real bug.

**Cross-schema inference** (per Batch 1 Q5 implementer notes): The probe tests `CockpitGateListInputSchema`, but the dependency in FR-009 is `CockpitGateStatusInputSchema`. Both live in `mcp/gates/query-schemas.ts` and both gained `runId` in the same commit `82077f1a`, so no deployment can split them. State this in the spec (per FR-012 note; already stated verbatim in spec.md's FR-012 Notes column).

**Mid-run flipping is FORBIDDEN**: The startup sweep opens gates BEFORE any Step-0 check runs. If the read side reverted after opens, sweep-opened 4-segment gates would be orphaned for the rest of the session. `runIdEnabled` is set once at the probe site and every downstream site reads it verbatim.

**Alternatives rejected**:

- **B (fail-closed on first `invalid-args`)** — see above; mixed-identity hazard.
- **C (Assumption-only)** — hard-stops older clusters on the very issue this fixes. Fine as a fallback if the probe complicates ordering more than expected, but the probe fits into today's ordering with zero re-arrangement (the probe already fires at exactly this site).
- **Env-var / feature flag** — adds a coordination surface the probe makes unnecessary.

**Contract**: `contracts/runid-probe.md`.

## R7 — Session-resume out of scope (Batch 2 Q6)

**Decision**: Session-resume for `/cockpit:auto` is out of scope. The spec § Out of Scope section states this explicitly and § Assumptions names the behaviour change this phase introduces. A sweep-adoption follow-up is filed on this issue.

**Why (per Batch 2 Q6 answer)**:

`cockpit_resume` (the verb) is a per-issue engine action (`auto.md:829`) that clears `agent:error` / `failed:*` labels — it is NOT a session-level restore surface. `/cockpit:auto` has no session-resume surface today.

Behaviourally, the code is already at option B (re-invocation → new ledger → new `runId`) by construction. But the "code is already there" framing understates the cost: today, `gateId = hash(issueRef, gateType, generation)` has no run component, so re-invoking against the same tracking ref RESUMED PRIOR GATE IDENTITY BY CONSTRUCTION — a second invocation derived the same key, the Step-0 check found the still-open gate, and the reuse branch fired. That is what `auto.md:283` means by "sweep-derived and live-derived `gateId`s coalesce". After Phase C, it does not.

Trace an interrupted-then-re-invoked run (context exhaustion, `Ctrl-C`, cluster restart — all routine):

1. Run 1 (`runId: R1`) opens gate **G1** for some issue. Operator has not answered it.
2. Session dies.
3. Operator re-invokes `/cockpit:auto <same-ref>` → new ledger file → `runId: R2`.
4. Startup sweep's pre-draft check asks `cockpit_gate_status({issueRef, gateType, generation, runId: R2})` → `absent`, because G1 carries R1.
5. A second gate **G2** is drafted for the same natural gate; **G1 is orphaned** — no `openGates` entry in the new run tracks it, so answering it routes nowhere.

That is the same duplicate-inbox-gate symptom this epic exists to remove, arriving through a door the epic opened. It is stated in spec.md § Assumptions so an operator who hits this finds it written down rather than reverse-engineering it from two identical gates.

**Sweep-adoption follow-up**: The clean fix is to have the startup sweep adopt pre-existing non-terminal gates for the tracking ref into `openGates` before drafting anything. The surface already exists and is deliberately runId-free: `cockpit_gate_list({issueRef, gateType: <omitted>})` returns every non-terminal gate for the ref regardless of run, and its rows now carry `runId` as a first-class field (generacy-cloud#892). This is a second, independent reason `cockpit_gate_list` must stay runId-agnostic — reinforcing FR-011 / R4. Adoption is NOT in this PR — Phase C already carries more than its original scope after Batch 1 Q1; file the follow-up, link it from the spec note, and let it land on its own.

**Alternatives rejected**:

- **Recover the ORIGINAL `runId` from an existing ledger** — treats re-invocation as "same run". Adds a session-resume surface `/cockpit:auto` does not have today. Would require settling questions this ticket does not ask (what if the ledger was corrupted? what if the operator wants a fresh run? what if multiple ledgers exist?). Deferred to a future session-resume surface if one is added.
- **State nothing** — leaves the "two identical gates after Ctrl-C then re-invoke" symptom for an operator to reverse-engineer. The Assumptions note is cheap and load-bearing.

## R8 — `runId` propagation to subagents (Batch 2 Q7 → FR-014, FR-015, FR-016)

**Decision**: The parent computes `runId` ONCE at pre-flight and passes it to subagents as an EXPLICIT LITERAL in the dispatch prompt. Subagents MUST NOT re-derive `runId` from the ledger filename or any other source. An automated test enumerates every dispatch path that can issue a gate verb and asserts each carries the run's `runId`.

**Why (per Batch 2 Q7 answer)**:

`auto.md` already uses explicit-literal propagation for every other run-scoped value passed to subagents (epic ref, gateId, cursor, prompts). Pattern A matches the file's existing conventions.

**Two invariants MUST be pinned because A's failure mode is silent**:

1. **Compute once, at pre-flight, and write that one value into every dispatch (FR-014).** `runId` must be derived exactly once — at the same point the ledger filename is computed — and thereafter only ever copied. Any subagent prompt that re-derives it, even by the same rule, is a place where the two can diverge. A future change to the ledger filename format that updates the derivation in one place but not the other would produce two `runId`s that "should agree" but don't; the pre-draft `cockpit_gate_status` check would return `absent` for the subagent's own open, and drafting would loop.

2. **Enumerate the dispatch paths and pin them in a test (FR-016).** `runId` is OPTIONAL on every MCP gate schema, so a dispatch path that forgets to pass it does not error — it silently derives a 3-segment key and mismatches everything else in the run. Same class of silent-degradation failure as the write/read split in FR-009, one layer down, will not surface as a crash. The test MUST name every path that can issue a gate verb — the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11), the startup sweep's `cockpit_gate_open` calls, and D.12's `cockpit_gate_ack` — and assert each carries the run's `runId`. Sampling one call site is insufficient.

**Alternatives rejected**:

- **Subagents re-derive from the ledger filename they discover on their own** — requires a one-file-per-directory invariant that does not hold (the directory accumulates one file per run — the whole point). Would drift the moment the filename format changes.
- **Environment variable / shared file** — adds a global surface for a single value with a clean propagation path. Also imports a new failure mode (subagent starts before env var is set / shared file exists).
- **Sample one call site instead of enumerating** — leaves the silent-degradation risk. FR-016 exists specifically to close it.

**Contract**: `contracts/runid-threading.md § Subagent explicit-literal propagation`.

## R9 — No-`:` invariant on `runId` (Batch 1 Q4 / Batch 1B Q5 → FR-013)

**Decision**: `runId` MUST NOT contain the `:` character. State this as a static invariant in the pre-flight derivation prose and assert it in a test.

**Why (per Batch 1 Q4 answer)**: `runId` is the trailing composite-key segment (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), and `generation` may already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`). A colon-bearing `runId` would make the tail genuinely ambiguous to anything still parsing keys by position. Both candidate values today (full ledger stem, timestamp-only) are colon-free by construction — the slug is `/` → `-` with `#` stripped; the timestamp is `YYYYMMDD-HHMMSS`. Pin the invariant so a future change to the ledger filename format cannot silently introduce one.

**Alternatives rejected**:

- **Rely on the derivation being colon-free by construction** — silent-failure risk under a future format change.
- **Reject a colon-bearing `runId` at the tool server** — a MCP-side check happens too late and the operator sees an opaque `invalid-args` from the tool.

**Contract**: `contracts/runid-derivation.md § Static invariants`.

## R10 — `runId` NOT sourced from `INSTANCE_NONCE` or any per-process value (FR-006)

**Decision**: `runId` MUST NOT be sourced from a per-process or per-MCP-connection value (e.g. the rejected `INSTANCE_NONCE` from generacy#1055).

**Why**: The cockpit MCP server is LONG-LIVED in the orchestrator container (a re-established design assumption from generacy#1055). Per-process values are STABLE across runs — the OPPOSITE of what's needed. Two auto runs invoked against the same cockpit MCP server would share the same `INSTANCE_NONCE`, defeating the whole purpose of a run discriminator.

This is stated for completeness — no one is proposing this after generacy#1055; the invariant exists so a future edit that "simplifies" `runId` derivation to `process.env.INSTANCE_NONCE` (or similar) breaks the pin.

**Alternatives rejected**:

- **`INSTANCE_NONCE`** — rejected by generacy#1055 for exactly this reason.
- **PID / hostname** — same failure mode as `INSTANCE_NONCE`.
- **Random UUID at first use** — sever the link to the ledger filename (defeats R2 traceability).

## R11 — Playbook-verification pin discipline

**Decision**: Every existing pin that quotes the OLD contract of § step 3 sweep `gateId idempotency`, the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11), § D.12 gate-answer, or § Pre-draft check — shared rules is re-pinned to the NEW contract in the same PR. Not weakened, not deleted. New pins added under a `describe("469 runId threading")` block for the derivation, the probe extension, the write-side threading in every enumerated dispatch path, the `auto.md:283` prose update, the no-`:` invariant, the compute-once invariant, and the subagent explicit-literal rule.

**Why**: Per repo CLAUDE.md § "Cockpit playbook pins" — heading renames, loop-shape edits, and new/removed steps break the pins on purpose (drift audit, not smoke test). Re-pinning to the new contract preserves the drift-audit value while allowing the intentional contract change.

**Coverage sketch** (final task list is generated by `/speckit:tasks`; see plan.md § Test edits for the numbered enumeration):

- 469-1 through 469-3: § step 1 pre-flight derivation (site + compute-once + no-`:`)
- 469-4 through 469-6: § step 1 § Pre-flight probe (UI mode) extension (call shape + `invalid-args` graceful-degradation + decide-once)
- 469-7: § In-memory loop state additions (declares `runId`, `runIdEnabled`)
- 469-8 through 469-10: § step 3 startup sweep write-side threading + `gateId idempotency` paragraph names FOUR inputs
- 469-11 through 469-16: § Dispatch step 0 `cockpit_gate_status` `runId` threading in D.1/D.2/D.3/D.4/D.7/D.11
- 469-17 through 469-20: § Dispatch step 0 generation-drift `cockpit_gate_ack` `runId` threading in D.1/D.2/D.3/D.4 (drift-branch-enabled rows only; D.7/D.11 not pinned because drift branch is disabled per escalation guard)
- 469-21: § Dispatch step 0 `absent`-branch `cockpit_gate_list` MUST NOT carry `runId`
- 469-22 through 469-24: § D.12 `cockpit_gate_ack` `runId` threading (step 5 operator apply; step 1 no-record; step 3 live-state supersession)
- 469-25: enumerated live-path `cockpit_gate_open` `runId` threading across every drafting D.n
- 469-26: subagent dispatch prompts declare the explicit-literal rule
- 469-27: `auto.md:283` prose names FOUR inputs
- 469-28: § Pre-draft check — shared rules names `runId` as the fourth input
- 469-29: `--gates=local` byte-path invariance — zero `runId` occurrences under local

Re-pin targets (existing tests that must be updated to match the new prose): the § step 3 startup-sweep `gateId idempotency` assertions in the 457-* block, plus the six D.n Step 0 assertions in the 457-* block (all of which quote the pre-469 3-input contract), plus any 449-* / 388-* / 390-* / 422-* assertions that quote § D.12's `cockpit_gate_ack` call shape verbatim (audit needed at implementation time).

## Key sources

- Spec: [spec.md](./spec.md)
- Clarifications: [clarifications.md](./clarifications.md) — Batch 1 Q1 (Answer A), Q2 (Answer A), Q3 (Answer A), Q4 (Answer A), Q5 (Answer A); Batch 1B Q1 (Answer A), Q2 (Answer C), Q3 (Answer A), Q4 (Answer B), Q5 (Answer: no-`:` invariant + Phase A inheritance); Batch 2 Q6 (Answer C + behaviour-change note + sweep-adopt follow-up), Q7 (Answer A + compute-once + enumerated-dispatch-path test).
- Playbook target: `packages/claude-plugin-cockpit/commands/auto.md` — pre-flight § step 1 (`:60`, `:80`, `:89`, `:209`); § step 1 § Pre-flight probe (UI mode) (`:82` and following); § step 3 startup sweep including `gateId idempotency` (`:229`, `:283`); six § Dispatch step 0 blocks (`:564` D.1, `:630` D.2, `:676` D.3, `:708` D.4, `:799` D.7, `:909` D.11); § step 3 answered-gate escape hatch (`:243`); § step 4 sub-step 0 (`:300`); § D.12 gate-answer; § Pre-draft check — shared rules (`:503`); § In-memory loop state additions (`:1646`).
- Playbook-verification pins: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (specifically the `457 …` block — pattern to follow for the new `469 runId threading` block; also the `449 UI-mode gates` block for site references).
- Upstream (blocking dependencies): [generacy-ai/generacy-cloud#892](https://github.com/generacy-ai/generacy-cloud/issues/892) — Phase A (`runId` acceptance on write and read paths; storage as doc field; `runId` on `cockpit_gate_list` rows for post-mortem traceability); [generacy-ai/generacy#1067](https://github.com/generacy-ai/generacy/issues/1067) — Phase B commit `82077f1a` (`runId` on `CockpitGateOpenInputSchema`, `CockpitGateAckInputSchema`, `CockpitGateStatusInputSchema`, `CockpitGateListInputSchema` in `mcp/gates/*schemas.ts`).
- Prior parallel work: `specs/449-part-cockpit-remote-gates/` (introduces `--gates=ui|local|auto`, `openGates`, D.12 dispatch); `specs/457-part-cockpit-remote-gates/` (introduces Step 0 pre-draft check + escape hatch + drift branch + escalation guard).
- Unblocked issue: [generacy-ai/generacy#1053](https://github.com/generacy-ai/generacy/issues/1053) — re-run a completed epic phase and see a fresh inbox gate (primary user-facing goal).
- Related future work (deferred, filed as follow-ups): sweep-adoption of pre-existing non-terminal gates for the tracking ref (Batch 2 Q6); list-mode `runId` filtering (generacy-cloud#894); subtype discriminator for `gateType: 'escalation'` (generacy#1046).
- Repo pin rule: `/workspaces/agency/CLAUDE.md § "Cockpit playbook pins"` — never weaken assertions; re-pin to new contract in the same PR.
