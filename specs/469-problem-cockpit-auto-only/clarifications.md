# Clarifications: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

**Issue**: [generacy-ai/agency#469](https://github.com/generacy-ai/agency/issues/469)
**Branch**: `469-problem-cockpit-auto-only`

---

## Batch 1 — 2026-07-29

### Q1: Pre-draft `cockpit_gate_status` scope

**Context**: The spec's FR-004/FR-005 thread `runId` into `cockpit_gate_open` and `cockpit_gate_ack` only. But `auto.md:283` documents the pre-draft dedup invariant explicitly: every Step-0 `cockpit_gate_status({issueRef, gateType, generation})` check "names the same three inputs" as `cockpit_gate_open`, so live-derived and sweep-derived `gateId`s coalesce. If `runId` is threaded into the write side only, the identity split is:

| call | key derived | gateId |
|---|---|---|
| `cockpit_gate_open` (with `runId`) | `issueRef:gateType:generation:runId` | **A** |
| pre-draft `cockpit_gate_status` (3 inputs) | `issueRef:gateType:generation` | **B ≠ A** |

Every pre-draft check returns `absent`, Step 0 concludes no gate is open, the drafting subagent re-runs on every wake, and duplicate inbox gates accumulate against a `gateId` the loop never tracks. This is the exact regression `runId` was introduced to eliminate. FR-002's acceptance criterion "the pre-draft dedup invariant continues to hold" implies status is in scope, but the FR list doesn't say so.

**Question**: Should the per-event pre-draft `cockpit_gate_status` call in all six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) also carry the run's `runId`?

**Options**:
- A: Yes — add FR-004b (or FR-009) requiring `runId` on every pre-draft `cockpit_gate_status` invocation in an auto run; add an AC to US2 asserting "a second wake for an already-open gate takes the Step 0 reuse branch, not the draft branch"; and assert `cockpit_gate_open` and pre-draft `cockpit_gate_status` for the same natural gate in the same run derive the same `gateId`.
- B: No — status stays 3-input; accept that the pre-draft dedup invariant is intentionally relaxed for this phase and duplicates will be tolerated (please justify).
- C: Something else — please specify.

**Answer**: **A** — `runId` on every pre-draft `cockpit_gate_status`. Without it, `cockpit_gate_open` derives a 4-segment key and the Step-0 check derives a 3-segment one; every check returns `absent` and the loop re-drafts a gate it already opened. Shipping the write half alone would leave the epic measurably worse than before it started, since today's 3-input identity at least coalesces. Add FR-004b requiring `runId` on every pre-draft `cockpit_gate_status` invocation; add an AC to US2 asserting "a second wake for an already-open gate takes the Step 0 reuse branch, not the draft branch"; and assert that `cockpit_gate_open` and pre-draft `cockpit_gate_status` for the same natural gate in the same run derive the same `gateId`.

---

### Q2: `cockpit_gate_list` exclusion

**Context**: Phase B (generacy#1067, merged `82077f1a`) added `runId` to `CockpitGateListInputSchema` for MCP-surface parity, but the handler drops it before the cloud call. The deployed cloud contract refines `runId requires generation`, and the pre-flight sweep probe (`cockpit_gate_list({issueRef, gateType: <omitted>})`) has no `generation` — forwarding `runId` returns 400 and breaks the sweep's primary dedup primitive. List-mode `runId` filtering is separately tracked as generacy-cloud#894.

The spec's "Out of Scope" section does not mention `cockpit_gate_list`. Given the strict-schema-and-refinement failure mode, silence here is risky.

**Question**: Should the spec explicitly forbid threading `runId` into `cockpit_gate_list` (both the pre-flight probe and any other list call) as an in-scope constraint?

**Options**:
- A: Yes — add an explicit FR (e.g. FR-007b) stating "`cockpit_gate_list` MUST NOT carry `runId` during this phase" and add "adding `runId` to `cockpit_gate_list` calls" to Out of Scope with a pointer to generacy-cloud#894.
- B: No — leave unstated (implementer discretion / covered by "no change to schemas" clause).
- C: Something else — please specify.

**Answer**: **A** — forbid `runId` on `cockpit_gate_list`, with one explicit carve-out. Silence is genuinely risky: Phase B accepts `runId` on `CockpitGateListInputSchema` for surface parity, so an implementer who sees the field on the schema will reasonably assume it is meant to be passed. Add the FR and the Out-of-Scope entry pointing at generacy-cloud#894. **Deliberate exception**: the pre-flight capability probe (per Q5) passes `runId` to `cockpit_gate_list` on purpose. This is safe — post-#1067 the handler drops it before the cloud call, so it never reaches the endpoint that would 400. Word the FR as: *"no functional `cockpit_gate_list` call may carry `runId`; the pre-flight capability probe is the sole exception and does so precisely because the value is dropped locally"*, so the carve-out reads as intentional rather than as the first violation of a fresh rule.

---

### Q3: `auto.md:283` documentation update

**Context**: `auto.md:283` currently reads: "The pre-draft `cockpit_gate_status({issueRef, gateType, generation})` check … **names the same three inputs**, so sweep-derived and live-derived `gateId`s coalesce". This is load-bearing prose — a future reader consults it to decide whether two `gateId`s should coalesce. If Q1 is answered `A`, the pre-draft check names FOUR inputs, and the prose becomes actively misleading. Spec doesn't currently touch `auto.md`.

**Question**: Is updating `auto.md:283`'s prose (three → four inputs) part of this feature's deliverable?

**Options**:
- A: Yes — the doc line lands in the same PR as the caller wiring; add an FR requiring the prose to reflect the actual pre-draft check shape after Q1.
- B: No — spec ships without touching `auto.md`; the drift is filed as a follow-up doc issue.
- C: Only if Q1 = A (auto-yes when scope expands, auto-no otherwise).
- D: Something else — please specify.

**Answer**: **A** — `auto.md:283` lands in the same PR. Given Q1=A, A and C produce the same outcome; A is preferable because it states the deliverable outright instead of leaving a conditional for a later reader to re-evaluate. The line is not incidental documentation — it is the stated contract for when two `gateId`s coalesce and is what someone will consult when a gate does or does not dedup as expected. Prose that says "the same three inputs" while the code names four is worse than no prose, because it will be trusted. B's follow-up doc issue would leave that window open for exactly as long as follow-up doc issues usually stay open.

---

### Q4: `runId` value shape

**Context**: FR-001 says `runId` is "sourced from the ledger filename timestamp (`<tracking-ref-slug>-<timestamp>`)". Read strictly, that string is the whole ledger filename stem — slug + timestamp. Two options give different semantics and observability:

- Full composite (`<tracking-ref-slug>-<timestamp>`): human-readable in cloud logs, embeds the epic/tracking-ref in every gate document; longer.
- Timestamp only (`<timestamp>`): compact, epic-agnostic; requires cross-referencing to reconstruct the run's target.

They also differ in edge cases: two runs against different epics in the same second are trivially distinct under the full composite; under timestamp-only they collide across epics (same second → same runId on unrelated gates). SC-003's "distinct across two consecutive runs against the same epic/phase" is satisfied by either, but SC-004's cross-epic implications are only satisfied by the full composite.

**Question**: What is the exact value of `runId` on the wire?

**Options**:
- A: Full composite `<tracking-ref-slug>-<timestamp>` — the ledger filename stem verbatim.
- B: Timestamp only — the trailing timestamp component of the ledger filename.
- C: Something else — please specify (e.g. hash of the composite).

**Answer**: **A** — full composite `<tracking-ref-slug>-<timestamp>`. Note: the option's stated rationale (cross-epic timestamp collisions) does NOT actually hold — `issueRef` is already the first segment of the key (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), so two runs against different epics touch different issues and cannot collide on `gateId` regardless of `runId`. A same-second cross-epic `runId` collision is cosmetic, not functional. **The argument that does hold is traceability.** The tracking ref appears nowhere else in a gate document. Under B, an operator looking at a gate doc — or at a `cockpit_gate_list` row (which surfaces `runId` per generacy-cloud#892) — sees a bare `20260729-051000` and has to guess which run that was. Under A the row is self-describing and greps directly against `.generacy/cockpit/auto-runs/`, matching the design note *"reusing it keeps the ledger and the gate identity mutually traceable during a post-mortem."* Only the full stem is the ledger filename. Corroboration: generacy#1067's `runIdSource` log line deliberately records `'explicit' | 'unset'` and never the value, on the stated grounds that auto-run ids embed cluster/repo/issue/timestamp. **Invariant to pin**: `runId` must contain no `:`. It is the trailing key segment, and `generation` can already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`), so a colon-bearing `runId` would make the tail genuinely ambiguous to anything still parsing keys by position. Both A and B are colon-free today (slug is `/`→`-` with `#` stripped; timestamp is `YYYYMMDD-HHMMSS`); state the invariant so a future change to the ledger filename format cannot quietly introduce one.

---

### Q5: Runtime cluster prerequisite (Phase B strict-schema hazard)

**Context**: `CockpitGateStatusInputSchema` is `.strict()`, and `runId` was added to it only in Phase B (generacy#1067, `82077f1a`). If Q1 = A and this code runs against a cluster that has NOT yet picked up #1067, the pre-draft `cockpit_gate_status` call is a strict-schema violation → `invalid-args` on every pre-draft check, which fails closed into the same duplicate-drafting path this feature exists to eliminate. `cockpit_gate_open` / `cockpit_gate_ack` already accept `runId` (generacy#1055), so the open side would appear to work while the read side rejected — an asymmetric, confusing failure.

Spec's Assumptions section says "Generacy Phase B is deployed" but doesn't say what "deployed" means for a heterogeneous fleet, nor how the caller behaves if the assumption is violated.

**Question**: How should the spec pin the Phase-B prerequisite and the failure behaviour if it's violated?

**Options**:
- A: Preflight check — on session start, verify the connected cockpit MCP server is at ≥ #1067 (e.g. by version probe or capability advertisement); if not, refuse to enable `runId` threading for this session (fall back to 3-input identity) and log a startup warning. Add as an FR.
- B: Fail closed on first `invalid-args` — on the first pre-draft `cockpit_gate_status` returning `invalid-args`, disable `runId` for the remainder of the session and revert to 3-input identity, logging once. Add as an FR + AC.
- C: Assumption only — extend the Assumptions section to explicitly name commit `82077f1a` (or a version bound) and state behaviour is undefined if violated; no runtime guard.
- D: Something else — please specify.

**Answer**: **A** — pre-flight capability probe, decided once, whole-session. Corrections to the question's premise:

1. **The question's premise about "silent failure" is wrong.** An `invalid-args` from the pre-draft check does NOT fail into duplicate-drafting. The pre-draft failure line is pinned verbatim: *"pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger"*. On a pre-#1067 cluster the run aborts every dispatch, loudly, one ledger row per event, with a detail that names `runId` as the unrecognized key. That is a safe and diagnosable failure, not silent. The real competitor to A is C, not B.

2. **B must be rejected outright** — not on cost grounds. Disabling `runId` mid-session and reverting to 3-input identity produces a *mixed-identity run*. The startup sweep opens gates via `cockpit_gate_open` before any Step-0 check runs, so by the time the first `invalid-args` arrives there can already be 4-segment gates open; reverting the read side then orphans exactly those gates for the rest of the session. It also breaks two things this issue commits to: the AC *"every `cockpit_gate_open` and `cockpit_gate_ack` in one auto run carries the same `runId`"*, and the design note *"a `runId` used to open a gate but not to ack it means the ack targets a different key."* B is the one option that can leave a run in a state neither identity scheme describes.

3. **A over C because the probe is free.** The pre-flight functional probe today is `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })`. Add `runId` to it. `CockpitGateListInputSchema` is `.strict()` and gained `runId` only in #1067, so:
   - pre-#1067 cluster → `invalid-args` → disable `runId` threading for the whole session, log the startup warning, run with today's 3-input identity (i.e. generacy#1053 unfixed, which is the status quo, and the warning says so);
   - #1067 or later → the field is accepted and dropped locally → probe passes exactly as it does today → enable `runId`.

Zero additional calls, zero cloud impact (the handler drops the field before the request), and it fits the file's existing philosophy of probing whether the surface *works* rather than whether its tools are *bound*.

**Implementer notes**:
- This probes `CockpitGateListInputSchema` but the dependency in Q1 is `CockpitGateStatusInputSchema`. They are safe to infer from one another — both live in `mcp/gates/query-schemas.ts` and both gained `runId` in the same commit (`82077f1a`), so no deployment can split them. State this in the spec.
- Decide **once**, at pre-flight, before any gate is opened, and never flip mid-run. That keeps A free of B's mixed-identity hazard and mirrors the existing `--gates=auto` resolution (also decided once, explicitly does not flip mid-loop).
- C remains a reasonable fallback if the probe complicates `--gates` resolution ordering more than expected; the failure it leaves behind is loud and self-describing. But given the probe costs one field on a call that already happens, A is worth it and keeps a heterogeneous fleet working instead of hard-stopping on older clusters.

---

## Batch 1 - 2026-07-29 05:19

### Q1: runId string composition
**Context**: FR-001 says the runId is 'sourced from the ledger filename timestamp (`<tracking-ref-slug>-<timestamp>`)'. This is ambiguous: the parenthetical could describe either the full ledger filename (which is what gets used as the runId) or just the timestamp portion inside it. This determines the exact string value sent to the cloud on every gate verb, and whether cross-ref runIds can ever collide at the same timestamp.
**Question**: What is the exact string value the runId carries?
**Options**:
- A: The full ledger filename stem: `<tracking-ref-slug>-<timestamp>` (e.g., `epic-1053-20260729T143012Z`)
- B: Just the timestamp portion: `<timestamp>` (e.g., `20260729T143012Z`)
- C: A dedicated hash/UUID derived from the ledger filename but not equal to it

**Answer**: **A** — full ledger filename stem `<tracking-ref-slug>-<timestamp>`. Semantic duplicate of Batch 1 Q4; see that answer for the full rationale (traceability under `cockpit_gate_list` rows; no functional cross-epic collision risk because `issueRef` already segments the key). Also invariant: `runId` MUST NOT contain `:` (trailing key segment; `generation` can already contain colons).

### Q2: resume semantics
**Context**: The `cockpit_resume` verb exists and the spec doesn't say whether a resumed auto session reuses the original run's runId (recovered from the ledger) or mints a fresh one. This directly affects whether a `cockpit_gate_ack` issued after a resume can find the gate that the pre-resume `cockpit_gate_open` created (US2 acceptance) — and whether resume is treated as 'same run' or 'new run' by SC-003.
**Question**: When an auto session is resumed (e.g., after crash or explicit `cockpit_resume`), what runId should the resumed session use?
**Options**:
- A: Recover the ORIGINAL runId from the existing ledger — resume is 'same run', in-flight gates remain reachable by ack
- B: Mint a NEW runId — resume is treated as a fresh run and any in-flight gate opened by the crashed run becomes orphaned
- C: Resume path is out of scope for this issue — leave undefined and address in a follow-up

**Answer**: *Pending*

### Q3: runId propagation to subagents
**Context**: FR-002 requires runId stability across 'all wakes, all gate verbs, all subagent dispatches'. Subagents are spawned via the Agent tool with fresh context and cannot see the parent's variables. The spec doesn't say HOW the runId reaches a subagent that itself issues `cockpit_gate_open` — this is a real risk area because if each subagent recomputes the runId from its own view of the ledger filename, an inconsistent view (e.g., a fresh ledger file created mid-run) would break FR-002.
**Question**: How does the runId reach subagents that issue gate verbs?
**Options**:
- A: Passed as an explicit literal in the subagent's prompt (playbook writes the runId into every dispatch)
- B: Subagents re-derive the runId themselves from the ledger filename they discover on their own (requires an invariant that only one ledger file exists per run)
- C: Stored in an environment variable or shared file that subagents read on entry

**Answer**: *Pending*

### Q4: landing-order enforcement
**Context**: FR-008 mandates this change MUST NOT ship before Phase A (cloud) and Phase B (MCP read side) are deployed, because otherwise `cockpit_gate_status` returns `absent` for the run's own gates and the drafter duplicates inbox entries on every wake. The spec doesn't say how this ordering is enforced at runtime — process/discipline only, or an actual runtime guard.
**Question**: How is the Phase A + Phase B deployment precondition enforced at runtime in the cluster?
**Options**:
- A: Deploy-order discipline only — no runtime check; humans coordinate the rollout
- B: A capability probe at pre-flight (e.g., call `cockpit_gate_status` with a runId; if the server rejects the field, refuse to run auto)
- C: An explicit environment/feature flag that must be set on the cluster to activate runId threading

**Answer**: **B** — pre-flight capability probe. This matches Batch 1 Q5 (option A there = "preflight check" = same semantic answer). Concretely: extend the existing pre-flight `cockpit_gate_list({ issueRef, gateType: <omitted> })` call to also carry `runId`. On pre-#1067 clusters the strict schema returns `invalid-args` → disable `runId` threading for the session, log a startup warning, revert to today's 3-input identity (status quo). On #1067+, the field is accepted and dropped locally → probe passes → enable `runId`. Decision is made ONCE at pre-flight and never flips mid-run (mixed-identity would orphan sweep-opened gates; see Batch 1 Q5 answer). This is not option A here — the guard is a runtime probe, not deploy-order discipline; and not C — an env flag adds a coordination surface that the probe makes unnecessary.

### Q5: runId format constraints
**Context**: The cloud storage layer (Phase A) accepts an optional runId, but the spec doesn't state what format constraints it imposes (character set, max length, case sensitivity). If the ledger filename stem contains characters that Firestore document IDs or the gate composite key can't handle (slashes, dots, colons, unicode), the write will fail on production data. This blocks safe implementation of FR-001.
**Question**: What format constraints does the cloud (Phase A) require the runId string to satisfy?
**Options**:
- A: No constraints — Phase A accepts any UTF-8 string of any length
- B: URL-safe / DNS-safe only: `[A-Za-z0-9._-]`, max 128 chars (typical Firestore doc-ID constraints)
- C: Constraints exist but haven't been specified yet — a follow-up clarification is needed against generacy-cloud Phase A

**Answer**: **One constraint pinned by this issue, others inherited from Phase A.** From Batch 1 Q4 answer: `runId` MUST NOT contain `:` (it is the trailing key segment; `generation` may already contain colons like `spec-review:<sha>` and `sweep:needs-clarification:2`, so a colon-bearing `runId` would make the tail genuinely ambiguous to anything still parsing keys by position). Both today's candidate values (full composite `<tracking-ref-slug>-<timestamp>` and timestamp-only) are colon-free — slug is `/`→`-` with `#` stripped; timestamp is `YYYYMMDD-HHMMSS`. Beyond the no-colon invariant, character-set/length constraints inherit from Phase A's storage layer; the ledger filename is a filesystem-safe string by construction so B-style constraints (`[A-Za-z0-9._-]`, ≤128 chars) are satisfied in practice. If Phase A imposes tighter constraints, this must be filed as a follow-up clarification against generacy-cloud (option C's tail).

---

## Batch 2 — 2026-07-29 (follow-ups from GitHub answers)

### Q6: session-resume semantics

**Context**: The `cockpit_resume` verb exists in `auto.md` but is a **per-issue engine action** (line 829) that clears `agent:error` / `failed:*` labels — not a session-level restore of `/cockpit:auto` itself. Re-invoking `/cockpit:auto` against the same tracking ref creates a NEW ledger file at pre-flight (line 209), which by FR-001 mints a NEW `runId`. That means "session resume" doesn't really exist as a design surface in this skill — a re-invocation is a new run by construction. But the spec doesn't say so explicitly, and a future reader might assume otherwise.

**Question**: How should the spec handle "session resume" for `runId`?

**Options**:
- A: Recover the ORIGINAL runId from an existing ledger — treat re-invocation as "same run", in-flight gates remain reachable by ack.
- B: Mint a NEW runId on every `/cockpit:auto` invocation — re-invocation is definitionally a new run; any in-flight gate from a crashed prior run stays terminal under its old runId.
- C: Explicitly out of scope for this issue — the per-issue `cockpit_resume` verb is orthogonal (it clears labels, not gates), and session-level resume is not a surface `/cockpit:auto` exposes today. If a future session-resume surface is added, it needs its own clarification.

**Recommended**: **C**. Rationale: there is no session-resume surface to design against today, so pinning behaviour would import a design decision with no caller. Behaviourally the code is already at B (re-invocation → new ledger → new runId), and US1's whole point is that terminal gates don't block re-runs; making that explicit as an out-of-scope note keeps the spec honest.

**Answer**: *Pending*

---

### Q7: runId propagation to subagents

**Context**: FR-002 requires `runId` stability across "all wakes, all gate verbs, all subagent dispatches". Subagents run as fresh Agent-tool contexts and cannot see the parent's variables. The spec doesn't say HOW `runId` reaches a subagent that itself issues `cockpit_gate_open` / `cockpit_gate_ack`. If each subagent re-derives `runId` from the ledger filename it discovers on its own, an inconsistent view (e.g. a fresh ledger file created mid-run, a stale prior-run file, concurrent runs against different tracking refs) breaks FR-002.

`auto.md` already uses explicit-literal propagation for every other run-scoped value passed to subagents (epic ref, gateId, cursor, prompts).

**Question**: How does the runId reach subagents that issue gate verbs?

**Options**:
- A: Passed as an explicit literal in the subagent's prompt — the playbook writes the current run's `runId` into every dispatch, exactly as it does for every other run-scoped value today.
- B: Subagents re-derive the runId themselves from the ledger filename they discover on their own (requires an invariant that only one ledger file exists per run and that all subagents view it identically at all times).
- C: Stored in an environment variable or shared file that subagents read on entry.

**Recommended**: **A**. Rationale: the parent loop computed `runId` at pre-flight (FR-001) and is the authority; passing it as an explicit literal keeps the subagent stateless with respect to which run it belongs to. Pattern A matches every other run-scoped value in `auto.md`. B risks derivation drift under the exact scenarios FR-002 exists to prevent. C adds a global surface for one value that already has a clean propagation path.

**Answer**: *Pending*


