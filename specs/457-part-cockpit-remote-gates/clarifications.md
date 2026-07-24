# Clarifications: cockpit:auto (--gates=ui) — Reuse Existing Pending Gates in Startup Sweep

**Issue**: [generacy-ai/agency#457](https://github.com/generacy-ai/agency/issues/457)
**Branch**: `457-part-cockpit-remote-gates`

## Batch 1 — 2026-07-24

### Q1: Generation-drift matching
**Context**: FR-002 requires the sweep to key the durable query on a `gateId` that includes the same content/SHA-derived `generation` as the live path (FR-006 replaces the current `generation=1` default). If the pending gate in the inbox was drafted from **older** content than the current sweep computes, the two `gateId`s will not coalesce.
**Question**: When the durable query returns no exact-`gateId` match but an `open`/unanswered gate exists for the same `(issue, kind)` at a different `generation`, what MUST the sweep do?
**Options**:
- A: Treat it as "no existing gate" and open a new one (operator sees both stale + fresh; operator dismisses the stale)
- B: Skip drafting and re-attach to the stale pending gate as-is (single gate remains; operator's answer resolves the stale one)
- C: Dismiss/cancel the stale pending gate, then run the current draft-then-open flow (single fresh gate; requires a cancel path)
- D: Other

**Answer**: **C** — Dismiss/cancel the stale pending gate, then run the current draft-then-open flow (single fresh gate). The required cancel path already exists and needs no new work: `cockpit_gate_ack(gateId, outcome: 'superseded')` is a valid call on a non-terminal gate (GateOutcomeSchema = ['applied','superseded','failed'], `packages/generacy/src/cli/commands/cockpit/mcp/gates/schemas.ts:46-47`), and the cloud's `handleGateOutcome` transitions any open|answered|delivered doc to terminal (generacy-cloud `services/api/src/services/relay/message-handler.ts:934-980`), after which the status query reports `absent` and the list query filters it out. Drift is detectable because `cockpit_gate_list({issueRef, gateType})` returns each non-terminal gate's `generation` (`query-schemas.ts:58-72`).

Rationale: option B is a correctness hazard, not merely cosmetic — `generation` is content-derived (PR head SHA for implementation-review/manual-validation; answer-set content hash for clarification; `auto.md:1352-1362`), so a different generation means the reviewed content itself changed. Re-attaching would apply an operator verdict computed against an old head SHA to current state — precisely what D.12's supersession checks exist to prevent. Option A re-creates the duplicate-inbox symptom this issue was filed to fix. C is consistent with the D.12 revised-draft re-open path (`auto.md:790-800`), which supersedes the prior record and mints a new gateId whenever the content discriminator changes.

Implementation note: ack the stale gate `superseded` with a detail string naming generation drift, so the ledger/post-mortem can distinguish it from an operator-driven supersession.

### Q2: Live-path scope
**Context**: FR-001 scopes the new pre-draft check to the **sweep** path. The live path (in-session, event-driven dispatch) still spawns the drafter before opening the gate, with no cross-session dedup. Two concurrent conversations reacting to the same fresh event can both draft.
**Question**: Is the pre-draft durable check strictly a sweep-only change, or MUST it also gate the LIVE path so concurrent live drafts on the same `gateId` cannot both run?
**Options**:
- A: Sweep-only — live path is out of scope for this spec
- B: Both — live path also gains the pre-draft durable check
- C: Other

**Answer**: **B** — Both: the live path also gains the pre-draft durable check. Option A ('sweep-only') is not actually cheaper, because the startup sweep has no dispatch code of its own. `auto.md:184` specifies that the sweep "treat[s] every issue whose current transition class is one of D.1–D.9 as a synthetic event. Dispatch each one by one (per § Dispatch and § Ledger)" — i.e., sweep-synthesized events and live events run through the SAME D.n dispatch rows. Scoping the new check to "sweep only" would require inventing a per-dispatch provenance flag (sweep-vs-live) that does not exist anywhere in the playbook today, making A strictly more complex to implement than B as well as strictly less safe.

The existing D.11 precedent this spec says to mirror (`auto.md:706`) is likewise an unconditional check at the top of the dispatch block, not a sweep-conditional one. The added cost of B is one read-only MCP query per gate initiation — `cockpit_gate_status` is read-only, observer-independent by construction, and already retry-wrapped (`cockpit_gate_status.ts:1-16, :55-62`) — paid only on the two-hop initiation path that is in any case about to spawn a drafting subagent, which is orders of magnitude more expensive.

### Q3: Answered-but-unconsumed gates
**Context**: FR-003 says the sweep reuses gates that are `open`/unanswered. A gate can also be `answered` but not yet consumed by any session (e.g., prior session crashed mid-consume). The spec is silent on this state.
**Question**: When the durable query returns a gate that is `answered` but no session has consumed the answer yet, what MUST the sweep do?
**Options**:
- A: Treat as "no existing gate" — re-derive from labels and re-draft (answer is discarded; safest for correctness)
- B: Consume the existing answer and continue as if this session had opened the gate (cheapest; requires the durable query to return the answer payload)
- C: Skip drafting and record the answered gate in `openGates`, letting downstream logic consume it (mirrors the "record it and continue" pattern in FR-003)
- D: Other

**Answer**: **C** — Skip drafting and record the answered gate in `openGates`, letting downstream logic consume it (mirroring the "record it and continue" pattern in FR-003).

Verification findings: option B is NOT viable as written — no layer of the #1038 query stack returns the answer payload. The MCP-facing schema is `{gateId, status:'open'|'answered'} | {gateId:null, status:'absent'}` (`query-schemas.ts:33-46`), the orchestrator route's response envelope is the same two shapes, and even the pre-collapse cluster→cloud response type is only `{gateId, status}` (`packages/orchestrator/src/services/cloud-gate-query-client.ts:68-77`). Choosing B would require adding new fields across cloud, orchestrator route, and MCP schema — new work the question's framing does not acknowledge. Option A is ruled out by the dependency's own normative contract, which states verbatim that `delivered` must be reported as `answered` because "reporting delivered as open would cause the sweep to re-draft an in-flight-answered gate (bad UX + duplicate risk)" and that the answered status "correctly signals 'skip this one'" (generacy `specs/1038-issue-1038/contracts/gate-query.md:62-73`); A would additionally violate SC-002 directly.

The `openGates` record required by C is load-bearing rather than cosmetic: D.12 step 1 acks any arriving gate-answer that has no matching `openGates` entry as 'superseded (no record)' and drops it (`auto.md:762`), so without the record a redelivered answer is silently discarded.

**Required follow-on work** (must be addressed in the plan, not deferred silently): the MCP `answered` state conflates cloud `answered`, `delivered`, AND `applied`, and `cockpit-gate-delivery.ts:147-176` re-delivers only docs whose `status == 'answered' AND clusterId matches`. A gate stuck at cloud `delivered` (or already `applied`) will therefore NEVER produce a D.12 event, and option C on its own would leave that issue parked forever with no operator-visible signal. C must ship together with a bounded escape hatch — e.g., after N consecutive sweeps in which a recorded `answered` gate yields no D.12 event, ack it `superseded` and re-derive from labels — or, if out of scope here, file it as an explicit blocking follow-up and state the parked-forever failure mode in the spec.

### Q4: Concurrent-sweep race
**Context**: If two conversations start their sweeps within the same window (e.g., overlapping cluster restart + operator new-conversation), both pre-draft checks may return "no existing gate" before either has called `cockpit_gate_open`. Assumption 3 treats the inbox as authoritative but does not spell out the race resolution.
**Question**: For two concurrent sweeps computing the same `gateId` and both finding no existing gate, what is the required guarantee?
**Options**:
- A: Cloud-side coalescing on identical `gateId` is sufficient — no client-side change needed; both may spawn drafters but only one gate opens
- B: Cloud-side coalescing is sufficient for the gate, but the wasted drafter spawn on the losing side is acceptable and out of scope
- C: A client-side lock/lease is required so only one session drafts
- D: Other

**Answer**: **B** — Cloud-side coalescing is sufficient for the gate, and the wasted drafter spawn on the losing side of the race is acceptable and out of scope.

Cloud-side coalescing is confirmed, not assumed: `handleGateOpen` runs a Firestore `runTransaction` on the single document `organizations/{orgId}/cockpitGates/{gateId}` (generacy-cloud `services/api/src/services/relay/message-handler.ts:779-796, :823-885`), so of two concurrent frames carrying an identical `gateId`, exactly one takes the `!snap.exists` create branch and the other takes the non-terminal branch that only rebinds `clusterId` and refreshes `body`/`options`/`askedAt`. A second inbox entry is structurally impossible.

Rationale for B over A: A leaves unanswered the question the spec actually has to settle — whether a race-window double drafter spawn fails SC-002 ("drafting subagent spawns on the sweep path = 0"). B pins that SC-002 is measured against the existing-gate case rather than the both-found-absent race, so a tester cannot fail the spec on a benign race. Rationale for B over C: C is disproportionate — no per-gateId lease primitive exists, and the one lease that does exist (`cockpit_claim`: idempotent acquire-or-refresh-or-takeover of the active-driver claim on a scope, with a claim-conflict refusal; `cockpit_claim.ts:1-30`) is scope-level, is not referenced anywhere in `auto.md`, and is absent from the sweep's seven-tool presence check (`auto.md:176`). C would mean wiring an entire new concurrency mechanism into the playbook to save one duplicated subagent in a rare window.

### Q5: D.11's existing session-scoped dedup
**Context**: D.11 already has an in-memory `dispatched-issues` check at `auto.md:706`. FR-001 adds a durable pre-draft check to every `D.n` gate on the sweep path, including D.11.
**Question**: When D.11 gains the new durable check, does the existing in-memory `dispatched-issues` check remain as defense in depth, or is it removed in favor of the durable check alone?
**Options**:
- A: Keep both — in-memory short-circuits repeated hits within the same session; durable covers cross-session
- B: Replace with durable only — the in-memory set is redundant once the durable check exists
- C: Other

**Answer**: **A** — Keep both: the in-memory `dispatched-issues` set short-circuits repeated hits within the same session, and the durable check covers cross-session.

The in-memory set is NOT redundant, because it does two things the durable check provably cannot:

1. **Label-pair coalescing.** `auto.md:701` states the classifier applies `waiting-for:merge-conflicts` and `blocked:stuck-merge-conflicts` together for a single stuck-merge incident. Those are two different triggering labels, so under the escalation generation discriminator ("subtype + triggering label/state + occurrence counter", `auto.md:1360`) they hash to two DIFFERENT `gateId`s. The durable check would not coalesce them, and one incident would open two gates — the exact duplicate-gate class this issue exists to eliminate.

2. **Session-mute lifecycle semantics no gate query can express.** The in-memory set is removed on successful advance (`auto.md:717`) and deliberately LEFT IN PLACE on skip (`auto.md:718`), because Invariant 3 (`auto.md:1636`) makes Skip a session-local mute that never touches labels. Drop the set and every skipped merge-conflict issue re-gates on every wake, since its durable gate has already been acked terminal.

Compounding both points: D.11 is precisely where the durable check is weakest. The DATA GAPS note (`auto.md:1367`) records that no durable occurrence counter for escalations exists today and that dedup IS the session-local set. Option B would therefore be a regression, not a simplification.
