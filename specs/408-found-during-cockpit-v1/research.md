# Research: #408 — `auto.md` § step 5 cursor-error class split + consecutive-fault circuit breaker + ledger accounting

Phase 0 restatement of the Q1–Q4 decisions from [clarifications.md](./clarifications.md) as design decisions with alternatives-rejected and rationale. Each decision is anchored in a directly-observed T-S13 constraint (finding #59 in tetrad-development#92 on snappoll-1), a directly-observed pre-existing surface-drift, or the resolved-precedent shape of #398/#402/#403/#406; none is aesthetic.

## Framing: what shape of fix is this?

The observed failure is a **cursor-recovery-contract drift**, not a mechanism gap or a CLI-contract gap:

- The auto session **received** the `invalid-cursor` typed error from `cockpit_await_events` (mechanism worked — the tool server correctly reported the caller-side bug generacy#924 caused).
- The parent correctly recognized cursor recovery was needed: run the startup sweep + re-arm cursor-less.
- The parent then **entered recovery per batch** — after every event batch, the same recovery ran again, indefinitely, because the tool server kept returning `invalid-cursor` on every re-armed cursor's continuation call (generacy#924's bug made *every* cursor the server issued invalid).
- The run stayed correct because sweeps are idempotent (§ Ledger L.5 rule): the live-state re-check catches events already dispatched. But the whole dispatch-round reduction the MCP path exists to deliver (SC-003) was silently forfeited — the loop was doing 100% of a startup sweep per event batch instead of long-polling on a live cursor.
- The systematic fault surfaced only because the operator happened to be watching the transcript at ~2 hours in.

No mechanism gap (the tool server correctly reported the error and the parent correctly ran recovery). No CLI-contract gap (`cockpit_await_events` returned the correct typed error shape). The gap is at the *cursor-recovery contract*: `auto.md` § step 5 (post-#406) collapses all three cursor-error signals — `invalid-cursor` (caller bug), `resetFrom` (server-side event-log rotation), cursor expiry — onto **one unconditional recovery path**. #406's clarification (Q2) had specified `invalid-cursor` → fail loud (caller bug on this side of the boundary) vs `resetFrom` → recover; the shipped step 5 reinterpreted fail-loud as "log verbatim, then recover anyway." In finding #59's incident that softening was *lucky* (it kept the run alive against a server bug), and pure fail-loud would have aborted multi-hour runs on what generacy#924 shows can also present as a server-restart artifact — so neither extreme is right.

The fix has the same shape as #384/#388/#390/#394/#396/#398/#400/#402/#403 (instruction-drift class): pin the rule at a single load-bearing surface (§ step 5's revised body with class split + circuit breaker + ledger shape), add a new G.4(e) escalation-gate subtype to the standing gate-contract table, add a `cursor-recovery` action to the § Ledger action+outcome vocabulary. Backstop with a structural audit the model cannot silently regress (assertion 408-1 checks the class split, both escalation options, and the ledger shape; assertion 408-2 checks the audit isn't vacuous via a checked-in negative fixture).

## R1 — Ledger counter semantics: per-class count on every line; only `invalid-cursor` counter drives escalation (Q1=C)

**Decision**: The `<consecutive-count>` field of the `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` ledger line is **per-class**. Each of the four classes (`invalid-cursor`, `resetFrom`, `expiry`, `discarded`) has its own consecutive counter, incremented on each consecutive recovery of that class and reset on any successful cursor reuse (regardless of class). A `resetFrom · 1` line reads naturally as "first consecutive resetFrom"; a `resetFrom · 3` line reads naturally as "third consecutive resetFrom in a row without a successful reuse between them." Only the `invalid-cursor` counter reaching 2 fires the G.4(e) escalation gate. The `resetFrom`, `expiry`, and `discarded` counters are ledger accounting only — they answer future finding questions about reset-churn or expiry-churn without ever escalating.

**Rationale**: FR-006 (from spec.md) had said the `<consecutive-count>` field was "the `invalid-cursor` counter value at recovery time (always `0` for non-`invalid-cursor` classes)." But Story 3's SC #2 acceptance scenario for a mixed run showed the ledger ending with `resetFrom · 1` — implying the counter for a `resetFrom` line is a per-class count, not the `invalid-cursor` counter. These two texts contradicted, and the tie had to be broken before FR-006 and Story 3's audit fixture could both be enforced.

The alternatives:

- **Q1=A (FR-006 authoritative — always `0` for non-`invalid-cursor` classes; fix Story 3 SC #2 to read `resetFrom · 0`)**: The ledger throws away the very signal that would distinguish routine `resetFrom` events from `resetFrom` *churn* — the churn shape is tomorrow's version of this same finding (a systematic server-side rotation defect presenting as multiple consecutive `resetFrom` recoveries). If the ledger reads `resetFrom · 0 / resetFrom · 0 / resetFrom · 0`, three routine `resetFrom` events and three churn events look identical, and the ledger fails as an SC-003 measurement source.
- **Q1=B (Story 3 SC #2 authoritative — the count is per-class, and it drives escalation)**: Per-class count is correct, but "each class's counter drives escalation" would fire the gate on `resetFrom · 2` — noise. Server-side event-log rotations are routine, and the sweep + re-arm handles them idempotently; escalating on `resetFrom · 2` would produce false positives at rates that would train operators to always click Continue degraded, defeating the gate's purpose.

Q1=C is the reconciliation with the least rewrite. Ledger accounting is per-class (matches Story 3's `resetFrom · 1` reading and lets the run summary flag churn in any class); escalation semantics stay exactly as FR-002 specified them (only `invalid-cursor` at count 2 fires the gate). This is strictly more informative than Q1=A at the same ledger cost and strictly less noisy than Q1=B at the same escalation cost.

**Load-bearing property**: The ledger is the SC-003 measurement source. Post-fix, an operator running `grep cursor-recovery <ledger-file>` can compute the number of degraded rounds (rows with a class count > 1) and the run summary § L.6 can flag them. This lets SC-003 measurements exclude degraded runs from the dispatch-round-reduction calculation — the whole point of the MCP migration.

**Alternatives rejected in-line above**: Q1=A, Q1=B.

## R2 — "Successful cursor reuse" definition: presented + no cursor-error signal, empty batches included (Q2=A)

**Decision**: A `cockpit_await_events` call qualifies as a "successful cursor reuse" — resetting the consecutive-fault counter — when (a) it was called with a non-null cursor argument (the parent *presented* the cursor to the tool server) AND (b) it returned a normal batch response (no `invalid-cursor` typed error, no `resetFrom` reset signal, no cursor-expiry typed error, no `discarded` signal). **Empty batches count as success** — a call presenting a cursor and returning `{events: [], nextCursor: <new>}` is the cursor mechanism working perfectly on a quiet epic. The counter measures consecutive failures of the *cursor mechanism*, not of dispatch traffic.

**Rationale**: FR-002 said "reset the counter on any successful cursor reuse" but never defined "successful." The wrong definition either resets the counter prematurely (masking a real fault — the counter never reaches 2 because some spurious per-batch acceptance keeps resetting it) or never resets it in low-traffic epics (a low-traffic epic could see the counter carry across hours because no dispatch traffic happens to reset it, and then a routine restart's `resetFrom` sees a stale counter that false-escalates on the next unrelated `invalid-cursor`).

The alternatives:

- **Q2=B (only a call that both accepts the presented cursor AND returns ≥1 event counts as success)**: Makes streak state hostage to epic traffic. A low-traffic epic could see the counter reach `invalid-cursor · 1` early in a run, then the next 10 successful `cockpit_await_events` calls all return empty batches (no traffic on that epic), so the counter stays at 1 for hours — until a routine server restart causes a `resetFrom`, then the same server's post-restart bootstrap issues a fresh cursor that a caller-side race classifies as `invalid-cursor`, and the counter false-escalates to 2 on what's actually the first real event since the initial fault. This is the exact failure mode the question's own warning called out.
- **Q2=C (only a call that returns a fresh continuation cursor for the *next* poll counts as success — i.e., the cursor round-tripped)**: Describes the same acceptance event as Q2=A — every non-error response carries a `nextCursor` field, so "the cursor round-tripped" and "presented cursor accepted with no error signal" name the same event. Q2=A is the crisp form of the same test; Q2=C phrases the test around a derived property (the presence of a fresh continuation cursor in the return payload) rather than the primary property (no cursor-error signal). Prose economy favors Q2=A.

Q2=A is the only option that resets the counter on the correct semantic event (the cursor mechanism worked) without conflating that with dispatch traffic.

**Load-bearing property**: The counter reset behavior is what makes the circuit breaker's re-fire semantics work correctly. Combined with Q4=A (`Continue degraded` is decide-once for the streak that raised it; a new streak after a successful reuse re-fires the gate), this ensures the anti-nag property (within one unhealed streak the gate never re-asks) composes with the anti-silence property (a new streak after healing IS a new decision).

**Precedent match**: The "primary property, not derived property" rule is the same principle #396's declared-vocabulary fix used at the classification surface (classify by the vocabulary the taxonomy declares, not by inferred sub-tokens). Q2=A is the equivalent at the counter-reset surface.

**Alternatives rejected in-line above**: Q2=B, Q2=C.

## R3 — Gate timeout semantics: inherit the standing gate contract; no per-row timeout (Q3=D)

**Decision**: The G.4(e) escalation gate inherits the standing gate contract that every gate in `auto.md` follows: **it blocks awaiting the operator; no per-row timeout policy**. If timeout policy ever ships (auto-approve-after-N-minutes, or auto-stop-after-N-minutes), it ships for all gates via the `## AskUserQuestion invocation contract` section (#402's home for exactly this rule class), not as a fifth semantics unique to one row.

**Rationale**: This is an altitude question. Every gate in `auto.md` — G.1 (clarification batch), G.2 (review verdict), G.3 (manual-validation), G.4a/b/c/d (escalations), G.5 (phase-queue) — blocks awaiting the operator. That's the load-bearing gate contract, and it's stated as § Invariant #6: "Autonomy *policy* out of scope. Per-gate auto-approve and 'full auto' mode are explicitly out of scope in v1. Every gate prompts; none auto-proceed." The G.4(e) subtype is *another* row in the same table; it inherits the same contract.

The alternatives:

- **Q3=A (block indefinitely — the gate never times out; the run halts progress until an operator answers)**: This is what the standing gate contract already does. Q3=A "specifies" it explicitly here, which reads as re-declaring the general rule at this specific row. The declaration itself is fine (redundant but harmless) — but it invites future readers to interpret every gate's silence on timeout policy as "this specific gate doesn't time out" while Q3=A's explicit declaration means "this one is intentional." Better to inherit uniformly (Q3=D) so silence and inheritance mean the same thing.
- **Q3=B (timeout after a defined interval to `Continue degraded`; record the auto-decision in the ledger)**: Auto-approve-after-N-minutes. This is the exact autonomy policy the plan defers (§ Invariant #6). Shipping it at this one row cracks the door — future gate authors would ask "why does G.4(e) get timeout policy and G.2 doesn't?" and the answer would be "because we needed unattended-run safety for that one case," which admits a wedge for per-row timeout policy across the whole table.
- **Q3=C (timeout to `Stop` — no operator means no supervised session)**: Same wedge, opposite direction. Also loses the run: `Stop` exits auto and the run's ledger closes, so no further dispatch happens until the operator returns and restarts. If the fault is transient (a server restart that heals in 30 seconds), Q3=C burns an unnecessary run exit; if the fault is persistent, Q3=A/D and Q3=C are equivalent in outcome (both wait for the operator) — Q3=A/D just don't take the destructive branch preemptively.

Q3=D is the composition-with-the-standing-contract answer. The unattended-run worry inverts here: while the gate blocks, no recovery loop spins — a blocked gate is the *cheapest* state the degraded session can be in, and the pending question is the first thing a returning operator sees. Cost of block ≈ 0 (no CPU, no API calls, no ledger writes); cost of the run staying stuck on the gate is bounded by the operator's actual return time, not by an arbitrary N.

**Load-bearing property**: The inheritance property. Q3=D means that the entire gate-timeout question is closed here by not re-opening it at this row. If future work needs timeout policy, that work goes to #402's home — a single edit updates every gate uniformly.

**Alternatives rejected in-line above**: Q3=A, Q3=B, Q3=C.

## R4 — Re-fire semantics: new streak after successful reuse is a new decision; gate re-fires at count=2 (Q4=A)

**Decision**: After the operator chooses `Continue degraded` in response to a G.4(e) escalation gate, the counter resets on any successful cursor reuse (per Q2=A). If, after that reset, two more consecutive `invalid-cursor` occurrences accumulate (a fresh 2-in-a-row streak with an intervening healed period), the G.4(e) escalation gate **re-fires at count=2 again**. `Continue degraded` is decide-once for the streak that raised it — it does NOT stay sticky for the remainder of the session.

**Rationale**: `Continue degraded` answered *that* fault episode. Once cursor reuse succeeds, the system observably healed — the mechanism worked, the recovery took hold, dispatch traffic (or at least an accepted cursor round-trip) resumed. A subsequent streak is a distinct episode with possibly a distinct cause: the first episode might have been generacy#924's bus-lifetime bug on the tool server; the second episode might be a different server bug, an epic-configuration mismatch, or a caller-side race. Staying silent about the second episode (Q4=B) rebuilds the exact silent-degradation hole this issue closes, just behind a one-time consent screen.

The anti-nag property falls out of Q4=A's own definition:

- Within one unhealed streak (counter climbs 1, 2, 3, ...) the gate re-fires *only* at count=2 the first time; subsequent recoveries in the same streak (count=3, 4, 5, ...) do NOT re-fire the gate.
- Decide-once holds because "the same streak" is defined by no intervening successful reuse: as long as the counter never resets, the gate never re-asks.
- Re-fire frequency is bounded by actual heal-then-break cycles, not by batch count. If the system is genuinely broken, the counter climbs monotonically without resetting; the gate asked once at 2, and the answer sticks. If the system heals and breaks again, that's a new episode and warrants a new decision — this is what Q4=A captures.

The alternatives:

- **Q4=B (sticky for the whole session — the gate never fires a second time regardless of subsequent streaks)**: Rebuilds the exact silent-degradation hole this issue closes. After a healed period and a fresh 2-in-a-row streak, the loop again absorbs unbounded recovery silently, losing SC-003 measurement fidelity. The one-time consent screen answers episode 1; episode 2 has no consent and no signal.
- **Q4=C (sticky for a bounded window — e.g., N successful reuses since the decision, then eligible to re-fire)**: Adds a tunable (N) with no principle behind the number. If N=1 it degrades to Q4=A (any successful reuse allows re-fire); if N=∞ it degrades to Q4=B; anything in between is arbitrary. Q4=A's "any successful reuse resets" is the principled version of Q4=C's N=1.

Q4=A is the only option that composes correctly with Q2=A's counter-reset semantics (successful reuse → counter reset → new streak → new decision) AND with Q3=D's inherited gate contract (the gate blocks; when it re-fires, it blocks again — anti-silence).

**Load-bearing property**: Composition with Q2=A and Q3=D. The three decisions (Q2=A defines "successful reuse", Q3=D defines the gate contract, Q4=A defines re-fire semantics) form a triad: the counter's semantics + the gate's semantics + the re-fire's semantics together specify the circuit breaker's whole behavior. Any deviation on any leg (Q2=B/Q2=C, Q3=A/B/C, Q4=B/C) breaks the composition either into anti-nag failures (Q4=B) or anti-silence failures (Q2=B, Q4=C at N > 1) or wedge-opening failures (Q3=B/C).

**Alternatives rejected in-line above**: Q4=B, Q4=C.

## R5 — Load-bearing surfaces: what the fix touches and what it doesn't

The § step 5 body rewrite + the new G.4(e) subtype in § Gate contract + the new `cursor-recovery` row in § Ledger action+outcome vocabulary and the two audit assertions are the load-bearing edits. Everything else is completeness hygiene around them.

**Load-bearing** (a bug here reproduces the finding #59 sweep-per-batch degradation):

- `auto.md` § step 5 body — the runtime prose the auto session reads when composing a cursor-recovery decision. If this is missing the class split, the next session collapses all three signals onto one recovery path again. If this is missing the ledger-line shape, the SC-003 measurement source degrades.
- `auto.md` § Gate contract table — the G.4(e) row for cursor-recovery with the two options. If this is missing, the escalation gate's option strings aren't declared in the gate contract, and G.4(e)'s presentation block can't reference them via the standing gate-contract pattern.
- `auto.md` § Ledger action+outcome vocabulary — the `cursor-recovery` action row. If this is missing, the § Ledger `grep` recipes on `<action>` can't reliably filter cursor-recovery ledger lines from other actions, and the run-summary § L.6 counting logic can't classify them.
- The audit's structural assertions (Q3=C-style structural discrimination, per #402's precedent) applied to the current `auto.md` — the machine-checkable backstop that any future edit collapsing the class split, removing an option, or dropping the ledger shape fails at build time.

**Completeness hygiene** (a bug here fails the audit at build time, not at runtime):

- `tests/fixtures/408-drift-auto.md` — the machine-checkable proof that the audit's structural logic isn't vacuous (positive-signal check via assertion 408-2).
- The two new assertions (408-1, 408-2) — the audit's build-time enforcement.

**Not touched** (out of scope):

- `auto.md` § Invariants section — no new §9. The audit's guarantee lives inside the test file's assertion, not at the invariants surface. Matches SC-007 of #394 and #396/#398/#400/#402's no-§8 rule (and note #403 already added the §8 cost-contract, so §9 would be the next slot — but the circuit-breaker rule doesn't need to be an invariant, it needs to be a structural property of § step 5).
- Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) — cursor recovery lives in `auto.md` § step 5 only; `watch.md` is retired (pre-#406).
- `packages/claude-plugin-cockpit/lib/*.ts` — no runtime code change; the fix is playbook prose + test extension.
- Historical spec directories — deliberately byte-identical.
- The `cockpit_await_events` tool server contract — the four cursor-error signals (`invalid-cursor`, `resetFrom`, expiry, `discarded`) are shapes the server owns. If the server ever changes the shape (e.g., renames `discarded` to `evicted`), the fix is: refresh the class names in § step 5 + the audit's structural anchors — a small, mechanical follow-up.
- generacy-ai/generacy#924 — the companion server-side bus-lifetime bug. #924 fixes the *cause* of the incident (every returned cursor invalid); #408 fixes the *observability* of the incident (silent degradation vs. operator-visible escalation). Both are needed; #924 is sequenced first because the hardened error taxonomy the class split relies on (`never-issued` means caller bug) is what #924 establishes.

## Sources

- **Spec**: [spec.md](./spec.md) — observed T-S13 evidence (snappoll-1 first MCP-path run → every returned cursor invalid → recovery per batch indefinitely → SC-003 silently forfeited), the three-part fix framing, regression-test enumeration.
- **Clarifications**: [clarifications.md](./clarifications.md) — Q1–Q4 with resolved answers.
- **Predecessor fixes**: [../384-found-during-cockpit-v1/plan.md](../384-found-during-cockpit-v1/plan.md), [../388-found-during-cockpit-v1/plan.md](../388-found-during-cockpit-v1/plan.md), [../390-found-during-cockpit-v1/plan.md](../390-found-during-cockpit-v1/plan.md), [../394-found-during-cockpit-v1/plan.md](../394-found-during-cockpit-v1/plan.md), [../396-found-during-cockpit-v1/plan.md](../396-found-during-cockpit-v1/plan.md), [../398-found-during-cockpit-v1/plan.md](../398-found-during-cockpit-v1/plan.md), [../400-operator-requested-ux/plan.md](../400-operator-requested-ux/plan.md), [../402-found-during-cockpit-v1/plan.md](../402-found-during-cockpit-v1/plan.md), [../403-improvement-spec-from-cockpit/plan.md](../403-improvement-spec-from-cockpit/plan.md), [../406-follow-up-generacy-ai/plan.md](../406-follow-up-generacy-ai/plan.md) — the instruction-drift class this fix continues to close at successive playbook surfaces (this fix at the cursor-recovery contract surface).
- **Related architectural precedent**: #402 (harness-invocation contract at one home + cross-references from each site + structural audit) — same "single home + cross-references + declared-vocabulary audit" architecture applied here at the cursor-recovery surface. #398 (`describe("398 — …")` block + `398-1` positive audit + `398-2` negative fixture) and #402 (same test-file shape) — reused verbatim for `408-1` + `408-2`. #403 (§8 invariants surface addition + subagent-diagnosis contract) — precedent for adding a new subtype row to the Gate contract table with its own presentation block.
- **Companion server-side fix**: [generacy-ai/generacy#924](https://github.com/generacy-ai/generacy) — the bus-lifetime bug that made every returned cursor invalid on snappoll-1. Sequenced first; establishes the hardened error taxonomy (`never-issued` → caller bug; restarts/evictions → `discarded`/`resetFrom`) that the class split's runtime semantics depend on.
- **Incident evidence**: T-S13 run on snappoll-1 in tetrad-development#92 — the first MCP-path (post-#406) auto run whose transcript surfaced recovery per batch. Finding #59 documents the specific observation (SC-003 silently forfeited; operator-visible only because someone happened to be watching).
- **Runtime contract of record**: `cockpit_await_events` tool boundary — the four cursor-error signals (`invalid-cursor`, `resetFrom`, expiry, `discarded`) with post-#924 hardened classification (`never-issued` → caller bug; server restart / eviction → `discarded`/`resetFrom`). See [../406-follow-up-generacy-ai/data-model.md](../406-follow-up-generacy-ai/data-model.md) for the tool-server-owned event/cursor shape.
