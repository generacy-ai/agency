# Research: `cockpit:auto (--gates=ui)` — Reuse Existing Pending Gates in Startup Sweep

Rationale, alternatives considered, and prior art referenced during planning. Every load-bearing choice traces to either a clarification answer (Q1–Q5 in [clarifications.md](./clarifications.md)), the frozen wire contract from #449 / #1038 / the epic plan, or an existing pattern in `packages/claude-plugin-cockpit/commands/auto.md`.

## R1 — Where does the pre-draft check slot in each D.n row?

**Decision**: A new **step 0** at the very top of every drafting D.n dispatch (D.1, D.2, D.3, D.4, D.7, D.11), BEFORE any existing step 1. In D.11 specifically, step 0 sits ABOVE the existing step 1 (`Dedup check` — the `dispatched-issues` in-memory set); the two dedup layers are complementary, not replacements (Q5=A / § R6 below).

**Why**: The bug in the spec's § Root Cause is precisely that the drafting subagent spawns BEFORE `cockpit_gate_open`. Moving the check UP (to step 0) is the minimum edit that fixes the problem. Every downstream step is unchanged; every existing test that describes the current step-1-and-onward flow continues to describe correct behavior after the edit.

**Alternatives considered**:
- **Cache the check result in a session-scoped Map keyed on `<issueRef, gateType>`** — rejected. Adds new state to reason about, and buys nothing because the durable check is exactly one MCP call per drafting dispatch (bounded by event frequency, not by loop iterations) and the tool is already retry-wrapped.
- **Combine steps 0 and 1 in D.11 into a single "dedup" step** — rejected. The two checks have different semantics (cross-session durable vs within-session in-memory; label-pair coalescing; session-mute-on-Skip) and combining them would blur the failure modes each covers. Explicit stepwise ordering makes the code review of the D.11 edit trivially verifiable against the pin.

## R2 — Generation-drift handling (Q1=C)

**Decision**: When `cockpit_gate_list({ issueRef, gateType })` returns a non-terminal gate at a DIFFERENT `generation` than the current sweep computes, ack the stale gate `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')`, THEN run the current draft-then-open flow with the fresh generation.

**Why (per Q1=C rationale)**: `generation` is content-derived (PR head SHA for implementation-review / manual-validation; answer-set content hash for clarification; per the per-gateType table at `auto.md:1354-1366`). A different generation means the reviewed content itself changed. Re-attaching (option B) would apply an operator verdict computed against an OLD head SHA to CURRENT content — precisely the correctness hazard D.12's supersession checks exist to prevent. Option A ("treat as absent, open a new one, operator dismisses stale") re-creates the duplicate-inbox symptom this issue was filed to fix.

**Verification anchors** (per Q1=C answer):
- `cockpit_gate_ack(gateId, outcome: 'superseded')` is a valid call on a non-terminal gate: `GateOutcomeSchema = ['applied','superseded','failed']` (`packages/generacy/src/cli/commands/cockpit/mcp/gates/schemas.ts:46-47`).
- Cloud `handleGateOutcome` transitions any `open | answered | delivered` doc to terminal (`services/api/src/services/relay/message-handler.ts:934-980`), after which the status query reports `absent` and the list query filters it out.
- Drift is detectable because `cockpit_gate_list({issueRef, gateType})` returns each non-terminal gate's `generation` (`query-schemas.ts:58-72`).

**Detail-string convention**: The `detail` field on the ack MUST name generation drift explicitly ("generation drift — content changed since original draft (was g<old>, now g<new>)") so the post-mortem ledger can distinguish drift-driven supersessions from operator-driven ones. This mirrors the D.12 `superseded (stale generation)` outcome vocabulary already established at `auto.md:764`.

**Contract**: `contracts/pre-draft-check.md § Generation drift`.

## R3 — Live-path scope (Q2=B)

**Decision**: Both the sweep path AND the live in-session dispatch path gain the pre-draft check.

**Why (per Q2=B rationale)**: The sweep has no dispatch code of its own — `auto.md:184` specifies that the sweep "treat[s] every issue whose current transition class is one of D.1–D.9 as a synthetic event. Dispatch each one by one (per § Dispatch and § Ledger)." Sweep-synthesized and live events run through the SAME D.n dispatch rows. Scoping the check "sweep-only" would require inventing a per-dispatch provenance flag (sweep-vs-live) that does not exist in the playbook today — strictly MORE complex than the unconditional check, and strictly less safe (concurrent conversations reacting to the same fresh event would still both draft).

The existing D.11 precedent (`auto.md:706`) is likewise an unconditional check at the top of the dispatch block, not a sweep-conditional one. The added cost of B is one read-only MCP query per gate initiation — `cockpit_gate_status` is read-only, observer-independent by construction, and already retry-wrapped per Q2=B's citation of the upstream `cockpit_gate_status.ts:1-16, :55-62`. This cost is paid only on the two-hop initiation path that is about to spawn a drafting subagent — orders of magnitude more expensive than one MCP query.

**Alternatives rejected**:
- **Sweep-only** — see above. Requires a provenance flag that doesn't exist and is strictly less safe.
- **Live-only** — solves the concurrent-conversations race but does not solve the restart case (which is the primary bug the spec was filed against).

**Contract**: `contracts/pre-draft-check.md § Scope`.

## R4 — Answered-but-unconsumed gates (Q3=C)

**Decision**: Skip drafting AND record the answered gate in `openGates` with `status: 'answered'`, letting downstream D.12 delivery consume the answer.

**Why (per Q3=C rationale)**: The #1038 query stack does NOT return the answer payload (MCP schema is `{gateId, status:'open'|'answered'} | {gateId:null, status:'absent'}` per `query-schemas.ts:33-46`; the orchestrator route's response envelope is the same two shapes; even the pre-collapse cluster→cloud response type is only `{gateId, status}` per `cloud-gate-query-client.ts:68-77`). Consuming inline (option B) would require adding new fields across cloud, orchestrator route, and MCP schema — new work Q3's framing does not acknowledge and out of scope for this ticket.

Option A (treat as absent, re-draft) is ruled out by the #1038 dependency's own normative contract, which states verbatim that "reporting delivered as open would cause the sweep to re-draft an in-flight-answered gate (bad UX + duplicate risk)" and that the `answered` status "correctly signals 'skip this one'" (generacy `specs/1038-issue-1038/contracts/gate-query.md:62-73`). A would additionally violate SC-002 directly.

The `openGates` record required by C is load-bearing rather than cosmetic: D.12 step 1 acks any arriving `gate-answer` that has no matching `openGates` entry as `'superseded (no record)'` and drops it (`auto.md:762`). Without the record, a redelivered answer is silently discarded.

**Contract**: `contracts/pre-draft-check.md § Answered state`.

## R5 — Parked-answered escape hatch (Q3 required follow-on) — why N=3

**Decision**: After **N=3** consecutive sweeps in which a recorded `answered` gate produces no D.12 event, ack it `superseded` (detail: `answered-not-consumed — presumed stuck at cloud delivered/applied`), remove from `openGates`, and re-derive from labels on the same sweep.

**Why the hatch is required at all** (per Q3 required follow-on): The MCP `answered` state conflates cloud `answered`, `delivered`, AND `applied`, and `packages/generacy/.../cockpit-gate-delivery.ts:147-176` re-delivers only docs whose `status == 'answered' AND clusterId matches`. A gate stuck at cloud `delivered` (or already `applied` in a prior cluster) NEVER produces a D.12 event under the new cluster, and option Q3=C on its own would leave that issue parked forever with no operator-visible signal.

**Why N=3 and not N=1 or N=∞**:
- **N=1** (ack on first sweep with no D.12) — too aggressive. A single sweep may fire before the D.12 event's redelivery attempt lands (typical redelivery is within a few seconds of the sweep completing but is not synchronous). N=1 would ack a gate that is about to be resolved.
- **N=2** — plausible but leaves no margin for a slow redelivery in a busy cluster. If the sweep interval is short and the redelivery is slow, N=2 could occasionally ack a gate that would have delivered normally.
- **N=3** — provides two full sweeps of margin between "recorded answered" and "declared stuck." At typical wake-driven sweep intervals (§ step 4 loop; sweep = per Monitor / heartbeat wake, so sweep count is a function of unrelated event volume, not wall-clock time), N=3 is short enough to avoid parking a genuinely stuck gate for user-perceptible time and long enough to tolerate a slow redelivery.
- **N=∞** (no hatch) — parks issues forever; violates FR-009 and the Q3 required follow-on framing.
- **N chosen by wall-clock time** — rejected. Sweep count is a more faithful measure of "how many chances the D.12 event has had to arrive"; wall-clock time is confounded by event volume.

N is pinned literally in the playbook prose (`N=3`) so a future edit that "simplifies" it in either direction breaks the pin and forces re-clarification. If operational evidence later shows N=3 is too low or too high, the pin is re-set in a follow-up under the CLAUDE.md re-pin rule.

**Contract**: `contracts/answered-escape-hatch.md`.

## R6 — D.11 defense in depth (Q5=A)

**Decision**: Keep both the new durable pre-draft check AND the existing in-memory `dispatched-issues` set at `auto.md:706`. The durable check covers cross-session; the in-memory set does two things the durable check provably cannot.

**Why the in-memory set is not redundant** (per Q5=A rationale):

1. **Label-pair coalescing.** `auto.md:701` states the classifier applies `waiting-for:merge-conflicts` and `blocked:stuck-merge-conflicts` together for a single stuck-merge incident. Those are two different triggering labels, so under the escalation generation discriminator (`subtype + triggering label/state + occurrence counter`, per `auto.md:1360`) they hash to two DIFFERENT `gateId`s. The durable check would NOT coalesce them, and one incident would open two gates — the exact duplicate-gate class this issue exists to eliminate. The in-memory set coalesces on `<issue-ref>`, which is the correct key for a single incident.

2. **Session-mute lifecycle semantics no gate query can express.** The in-memory set is removed on successful advance (`auto.md:717`) and deliberately LEFT IN PLACE on skip (`auto.md:718`), because Invariant 3 (`auto.md:1636`) makes Skip a session-local mute that never touches labels. Drop the set and every skipped merge-conflict issue re-gates on every wake, since its durable gate has already been acked terminal.

Compounding both points: D.11 is precisely where the durable check is weakest. The DATA GAPS note (`auto.md:1367`) records that no durable occurrence counter for escalations exists today and that dedup IS the session-local set. Option B (replace with durable only) would be a regression, not a simplification.

**Ordering**: The pre-draft check goes as step 0 (above the in-memory dedup at step 1). This ordering is deliberate — the cross-session durable check should fire FIRST, so that a session that inherits a still-open gate from a prior session's answered-but-not-consumed advance never spawns the diagnosis subagent, even if `<issue-ref>` is not yet in the current session's in-memory set.

**Contract**: `contracts/pre-draft-check.md § D.11 defense-in-depth`.

## R7 — Sweep `generation` derivation (FR-006)

**Decision**: The sweep at `auto.md:198` currently hard-codes `generation=1`. Remove that default and derive `generation` per-event using the SAME per-gateType function the live path uses (§ UI-mode gate mapping generation-discriminator table at `auto.md:1354-1366`).

**Why this is load-bearing**: Without this change, sweep-derived and live-derived `gateId`s cannot coalesce, because `gateId = hash(issueRef, gateType, generation)` is content-derived on the live path but constant on the sweep. The pre-draft check would call `cockpit_gate_status(gateId=hash(..., 1))` and never find the live-derived record — so the fix would be a no-op for every gate type whose content-derived generation ≠ 1 (which is all of them once the loop has advanced past the first draft of a gate).

**DATA GAP consequences** (per `auto.md:1367`): For `escalation`, `clarification`, `artifact-review`, `implementation-review`, `manual-validation`, and `scope-drained`, several inputs to the generation function are not yet derived from durable GitHub state today (the parent loop doesn't compute head SHA / occurrence counter / batch-id). For these gateTypes, the sweep can still compute the SAME generation as the live path IF the live path also does not yet compute it durably (both would use whatever placeholder derivation is in place today). The pre-draft check catches the exact-`gateId` reuse case for `phase-queue` (phase number) and `filing` (draft hash over `{title, body, labels}`) unconditionally — no gap there. For the other gateTypes, the check catches reuse in the cases where the placeholder function happens to produce the same value on sweep and live (typically, when the loop has not iterated past first-draft), and falls through to the generation-drift branch (list-then-ack-superseded-then-redraft) in the cases where it does not.

**Why this partial-coverage state is acceptable**: The DUPLICATE INBOX ENTRY problem (SC-001, the primary user-visible bug) is eliminated in ALL cases because generation drift is handled — a stale gate is acked terminal, then a fresh gate is drafted; the operator sees ONE gate. The DUPLICATE DRAFTER SPAWN problem (SC-002) is partially covered — the drafting subagent still runs in the generation-drift case, but there is no drafting-subagent spawn in the exact-`gateId` reuse case. Once #1038's DATA GAPS follow-up ships and the parent loop derives head SHA / occurrence counter / batch-id from durable state, SC-002 hits zero across all gateTypes.

The `spec.md § Success Criteria` SC-002 explicitly measures "drafting subagent spawns for issues with an existing open gate at the current `gateId`" — the phrase "at the current `gateId`" is the exact-match case that IS 0 today; the generation-drift case is not covered by SC-002 by design.

**Alternatives rejected**:
- **Compute a NEW durable generation function specifically for the sweep** — rejected. Divergence between sweep and live is the exact bug we are fixing; a second function would compound it.
- **Wait for #1038 DATA GAPS follow-up before shipping** — rejected. The primary SC-001 target (duplicate inbox entries = 0) is met immediately with the change described here; deferring adds no value.

**Contract**: `contracts/sweep-generation-fix.md`.

## R8 — Presence check for the new tools

**Decision**: `cockpit_gate_status` and `cockpit_gate_list` join the existing tool-presence check at `auto.md:176`. The check grows from seven tools to nine (`cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events` — plus the two new ones). If either is absent from the session's MCP tool binding, the sweep's `Print + exit` fail-loud path fires exactly as it does today for any missing cockpit tool.

**Why**: The Q3=A precedent from #449 established that explicit `--gates=ui` on a cluster without a required capability hard-fails at pre-flight rather than prompting or silently degrading. The new tools are strictly required for the pre-draft check to execute, and the check itself is unconditional under `ResolvedGateMode === "ui"` — absence therefore MUST hard-fail. Silent whole-run downgrade would reintroduce exactly the duplicate-drafter symptom the whole ticket exists to fix.

**Alternatives rejected**:
- **Skip the pre-draft check when the tools are absent, log a warning** — rejected. Silent degradation on a static capability check contradicts the seven-cockpit-tools precedent AND causes SC-001 to fail (duplicate inbox entries would return in exactly the scenario the ticket was filed against).
- **Add a per-check `try/catch` around `cockpit_gate_status`, fall back to today's behavior on error** — rejected. Static presence and call-time error are different semantics; the #449 pattern already distinguishes them (pre-flight absence = hard-fail; call-time error = per-gate fallback). The pre-draft check is a NEW call site, but the same distinction applies: absence should hard-fail; a call-time error should apply the same first-failure-note-then-continue rule as `cockpit_gate_open` per `auto.md:1396-1402`.

**Contract**: `contracts/pre-draft-check.md § Tool-presence check`.

## R9 — Concurrent-sweep race (Q4=B)

**Decision**: Rely on cloud-side coalescing on identical `gateId`. No client-side lock/lease is added. Wasted drafter spawn on the losing side of a concurrent-sweep race is acceptable and out of scope for SC-002.

**Why**: Cloud-side coalescing is confirmed, not assumed: `handleGateOpen` runs a Firestore `runTransaction` on the single document `organizations/{orgId}/cockpitGates/{gateId}` (generacy-cloud `services/api/src/services/relay/message-handler.ts:779-796, :823-885`), so of two concurrent frames carrying an identical `gateId`, exactly one takes the `!snap.exists` create branch and the other takes the non-terminal branch that only rebinds `clusterId` and refreshes `body`/`options`/`askedAt`. A second inbox entry is structurally impossible.

Rationale for B over A (per Q4=B): A leaves unanswered whether a race-window double drafter spawn fails SC-002. B pins that SC-002 is measured against the existing-gate case rather than the both-found-absent race, so a tester cannot fail the spec on a benign race.

Rationale for B over C: C is disproportionate. No per-`gateId` lease primitive exists, and the one lease that does exist (`cockpit_claim`) is scope-level, not referenced in `auto.md`, and absent from the sweep's seven-tool presence check. C would mean wiring an entire new concurrency mechanism into the playbook to save one duplicated subagent spawn in a rare window.

**No contract file** — this decision does not add prose to `auto.md`; it is a pinned rationale that a future edit MUST NOT introduce a client-side lease attempting to "improve" this behavior. The relevant pin is the SC-002 measurement scope in `spec.md § Success Criteria` (unchanged by this plan).

## R10 — Playbook-verification pin discipline

**Decision**: Every existing pin that quotes the OLD contract of § step 3 sweep, or of § Dispatch D.1 / D.2 / D.3 / D.4 / D.7 / D.11, is re-pinned to the NEW contract in the same PR. Not weakened, not deleted. New pins added under a `describe("457 …")` block for the pre-draft check heading, the three-branch rule, the `answeredGateSweepCounter` + N=3 escape hatch, the D.11 defense-in-depth ordering, the sweep `generation=1` removal, and the tool-presence count.

**Why**: Per repo CLAUDE.md § "Cockpit playbook pins" — heading renames, loop-shape edits, and new/removed steps break the pins on purpose (drift audit, not smoke test). Re-pinning to the new contract preserves the drift-audit value while allowing the intentional contract change.

**Coverage sketch** (final task list is generated by `/speckit:tasks`):
- 457-1: § step 3 nine-tool presence check
- 457-2: § step 3 removal of `generation=1`
- 457-3: § step 3 `answeredGateSweepCounter` + N=3 escape hatch verbatim
- 457-4 through 457-9: pre-draft check heading + three-branch rule on each of D.1/D.2/D.3/D.4/D.7/D.11
- 457-10: D.11 defense-in-depth (both step 0 durable and step 1 in-memory checks)
- 457-11: § In-memory loop state additions declares `answeredGateSweepCounter`
- 457-12: § D.12 resets the sweep counter on delivery
- 457-13: § UI-mode gate mapping generation-discriminator table drift audit — sweep uses the same function

Re-pin targets (existing tests that must be updated to match the new prose): the § step 3 startup-sweep assertions in the 449-* block (`449-8`, `449-9` for tool count / sweep behavior — audit and re-pin only if they quote the old sweep prose), plus any 396-* / 406-* / 437-* assertions that quote D.11 step 1 verbatim (audit needed at implementation time).

## Key sources

- Spec: [spec.md](./spec.md)
- Clarifications: [clarifications.md](./clarifications.md) — Q1 (Answer C), Q2 (Answer B), Q3 (Answer C + required follow-on), Q4 (Answer B), Q5 (Answer A)
- Playbook target: `packages/claude-plugin-cockpit/commands/auto.md` — six drafting D.n rows (`:415–:735`), § step 3 startup sweep (`:174–:203`), § UI-mode gate mapping generation-discriminator table (`:1354–:1367`), § D.12 gate-answer (`:743–:802`), § UI-mode fallback and In-memory loop state additions (`:1386–:1427`)
- Playbook-verification pins: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (specifically the `449 UI-mode gates` block at `:2832` — pattern to follow for the new `457 sweep-time gate reuse` block)
- Upstream (blocking dependency): [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) — read-only gate-status query MCP tools (`cockpit_gate_status`, `cockpit_gate_list`) and their return-shape contracts (`query-schemas.ts:33-46`, `:58-72`; `cloud-gate-query-client.ts:68-77`)
- Cloud coalescing invariant (Q4 verification anchor): `generacy-cloud/services/api/src/services/relay/message-handler.ts:779-796, :823-885` (`handleGateOpen` Firestore `runTransaction`)
- Cloud terminal-state transition (Q1 verification anchor): `generacy-cloud/services/api/src/services/relay/message-handler.ts:934-980` (`handleGateOutcome`)
- Cluster answer-redelivery scope (Q3 required follow-on anchor): `packages/generacy/.../cockpit-gate-delivery.ts:147-176` (redelivers only `status == 'answered' AND clusterId matches`)
- Repo pin rule: `/workspaces/agency/CLAUDE.md § "Cockpit playbook pins"` — never weaken assertions; re-pin to new contract in the same PR
- Prior parallel work: `specs/449-part-cockpit-remote-gates/` (introduces `--gates=ui|local|auto` and D.12 dispatch); `specs/450-part-cockpit-remote-gates/` (P4 dogfood — the concrete run report that surfaced this bug's symptoms)
