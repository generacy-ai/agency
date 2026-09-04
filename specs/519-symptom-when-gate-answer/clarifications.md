# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-09-04 00:17

### Q1: Guard placement vs adopted gate records
**Context**: FR-001 places the not-mine branch inside D.12 step 1 (the *no-record* lookup), but US1's first acceptance criterion reads unconditionally: "A `gate-answer` whose `gateKey` `runId` segment ≠ this run's `runId` is a logged no-op." These conflict for adopted gates: the § step 3 Adoption pass creates `openGates` entries whose originating `runId` differs from the current run's, and D.12 steps 3/5 already read `openGates[gateId].runId` specifically to handle answers for gates a *prior* run opened. If the runId-mismatch guard fires before the record lookup, adopted gates' answers become no-ops and adoption breaks.
**Question**: Does the foreign-run/out-of-scope guard apply only when `openGates[event.gateId]` is absent (an existing record — including an adopted one — always processes normally), or does it pre-empt processing even when a matching record exists?
**Options**:
- A: Guard only inside the no-record branch — record present (current-run or adopted) → steps 2–6 run unchanged; US1's AC wording is tightened to "…and has no `openGates` record".
- B: Guard runs before the record lookup — any `runId` mismatch is a no-op even with a matching record (the adoption answer path is intentionally changed).

**Answer**: A) Guard only inside the no-record branch — record present (current-run or adopted) → steps 2–6 run unchanged; US1's AC wording is tightened to "…and has no `openGates` record". The playbook already builds the whole #471 adoption feature on the premise that an answer for a gate a PRIOR run opened processes normally: the Adoption pass adds `openGates` entries carrying the originating row's `runId`, and D.12 steps 3 and 5 explicitly read `openGates[gateId].runId` because "for an adopted entry they differ"; step 1's no-record ack is the SOLE ack path using the run-wide `runId`. Option B would turn every adopted-gate answer into a no-op — a regression of #471 that FR-001/FR-006 and the Out-of-Scope note never intended. The runId-mismatch guard is only meaningful once the record lookup has already failed. (auto.md:309, :317, :325, :1098, :1102, :1107, :1662-1665)

### Q2: gateKey without a runId segment
**Context**: FR-002 derives "mine" from the `gateKey`'s 4th (`runId`) segment, and FR-005 re-documents the payload accordingly. But the current payload doc (auto.md Shape 3) shows 3 segments, and under `runIdEnabled === false` gates are opened without a `runId` — a replayed answers-file can deliver historical answers whose `gateKey` has only 3 segments.
**Question**: When an arriving `gateKey` carries no `runId` segment, how should the guard classify it?
**Options**:
- A: Skip the runId comparison for that event — apply only the in-scope-issue check; a 3-segment in-scope key with no record falls through to the existing `superseded (no record)` ack.
- B: Treat as foreign — no runId segment means ownership is unprovable, so logged no-op (safest against damaging historical records).
- C: Treat as mine — always fall through to the existing no-record ack (current behaviour, preserves startup-race handling for legacy gates).

**Answer**: A) Skip the runId comparison for that event — apply only the in-scope-issue check; a 3-segment in-scope key with no record falls through to the existing `superseded (no record)` ack. A session on the `invalid-args` graceful-degradation branch has `runIdEnabled === false` and opens its OWN gates without a runId segment, so a legacy-shaped key is exactly the startup-race / duplicate-delivery case FR-006 preserves. Option B would silently drop a run's own answers on a pre-#1067 cluster; option C would keep acking out-of-scope historical records — the #1/#5–#8 damage class, which the in-scope check alone already catches. Note for /plan: `generation` may itself contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`), so "has a runId segment" must NOT be implemented as a positional segment count — test the trailing colon-free segment against the runId literal / `<tracking-ref-slug>-<timestamp>` shape, and parse the issue ref as the prefix before the first `:`. (auto.md:242, :95-101, :1087, :1098, :1668-1670)

### Q3: Ledger vocabulary for the out-of-scope-issue branch
**Context**: FR-004 mandates the verbatim row `foreign-run delivery — not acked (owner run: <runId>)`. The guard has two triggers, though: foreign `runId` and out-of-scope issue. An answer whose `gateKey` names an out-of-scope issue but carries *this* run's `runId` (or no runId segment, per Q2) would produce a row naming this very run as the "owner" — misleading for the US2 audit goal of distinguishing drop reasons.
**Question**: Should both guard triggers share the single verbatim vocabulary, or does the out-of-scope-issue branch get its own variant (e.g., `out-of-scope delivery — not acked (issue: <issue-ref>)`)?
**Options**:
- A: One vocabulary for both branches — `foreign-run delivery — not acked (owner run: <runId>)` verbatim, exactly as improvised in production.
- B: Two pinned variants — foreign-run keeps the production wording; out-of-scope-issue gets a distinct wording naming the issue instead of the run.

**Answer**: B) Two pinned variants — foreign-run keeps the production wording; out-of-scope-issue gets a distinct wording naming the issue instead of the run. US2's whole point is letting an operator tell WHY a delivery was dropped, and the actual production damage (issues #1, #5–#8 acked `superseded (no record)`) was the out-of-scope class — a row naming this very run as "owner run" for such an event is actively misleading, and under Q2's answer there may be no run to name at all. Keep FR-004's `foreign-run delivery — not acked (owner run: <runId>)` verbatim for the runId-mismatch trigger and add `out-of-scope delivery — not acked (issue: <issue-ref>)` for the in-scope-set miss. Evaluate runId-mismatch first (it carries the more actionable owner), then out-of-scope; pin both strings in the FR-007 test. This mirrors how the playbook already keeps distinct UI-specific outcome strings so grep recipes stay stable. (auto.md:1129, :1800, :315)

### Q4: Full ledger row shape for the no-op
**Context**: Ledger rows follow the four-column format `<issue-ref> · <transition-class> · <original-action> · <outcome> · source: <token>`, but `transitionClass` and `<original-action>` are read from the `openGates` record (auto.md Payload shape note) — which by definition doesn't exist in the no-op case. FR-004 specifies only the outcome-slot vocabulary, and FR-007 pins it verbatim, so the surrounding row shape must be exact.
**Question**: What fills the remaining slots of the no-op ledger row, and which `source:` token does it carry?
**Options**:
- A: Four-column shape with the issue-ref parsed from the `gateKey`, placeholder slots for the unknowable columns, and `· source: ui-gate` — e.g., `<gateKey-issue-ref> · — · gate-answer · foreign-run delivery — not acked (owner run: <runId>) · source: ui-gate`.
- B: Reuse the existing no-record row shape (as step 1 writes today) with the new vocabulary in the outcome slot.
- C: A free-form single line (no four-column contract); exact shape deferred to /plan, with only the FR-004 vocabulary pinned.

**Answer**: A) Four-column shape with the issue-ref parsed from the `gateKey`, placeholder slots for the unknowable columns, and `· source: ui-gate` — e.g. `<gateKey-issue-ref> · — · gate-answer · foreign-run delivery — not acked (owner run: <runId>) · source: ui-gate`. Ledger Rule 2 already mandates that every D.12 row is the four-column format with `· source: ui-gate`, and Rule 4 says D.12 rows carry `ui-gate` regardless of transport, so a free-form line (C) would violate the ledger contract and leave FR-007's verbatim pin without a shape. Option B is not actually distinct: the "existing no-record row shape" sources `<transition-class>` / `<original-action>` from the `openGates` record that does not exist here, so it collapses into A or is undefined. A is deterministic from the payload alone — the issue ref is the colon-free prefix of the `gateKey`, `—` fills the unknowable transition-class slot, `gate-answer` names the dispatch class, and the FR-004/Q3 vocabulary fills the outcome slot. (auto.md:1094, :1689-1691, :1794-1800, :1804, :242)

### Q5: Replayed-delivery dedup for the no-op
**Context**: The doorbell's answers-file source replays history, so the same foreign answer can be redelivered on every wake — and `deliveryId` is unique per delivery *attempt*, so `deliveryId` dedup does not collapse replays. FR-004's "exactly one ledger row" per event, applied per Invariant #8, means a long run could write the identical foreign-run row dozens of times.
**Question**: Should the no-op write one ledger row per delivery (strict Invariant #8), or dedup so each foreign `gateId` is logged at most once per run?
**Options**:
- A: One row per delivery — strict one-line-per-dispatch; accept the repetition as an audit trail of every replayed delivery.
- B: Dedup per `gateId` — first foreign delivery writes the row; subsequent replays of the same `gateId` are fully silent (tracked in a session-local seen-set).
- C: Dedup per `gateId` per wake/batch — one row per sweep that redelivers it.

**Answer**: A) One row per delivery — strict one-line-per-dispatch; accept the repetition as an audit trail of every replayed delivery. The ledger contract is explicit that any typed event the parent processes is a dispatch and "a dispatch without a ledger line is a protocol violation", and the row is cheap (no tool calls, no ack) so repetition costs nothing but bytes. A session-local seen-set (B) adds new loop state that is not persisted and silently swallows events — exactly the "quietly dropped vs lost" ambiguity US2 exists to eliminate — and "per wake/batch" (C) is ill-defined across the enriched-line and `cockpit_await_events` batch paths. The volume concern is also largely moot: this epic's P1 fix generacy#1228 (PR #1231, merged) makes the doorbell persist the consumed byte position per epic and filter answers by the bound epic's ref set, so replay on an upgraded cluster is one-shot per line and foreign-epic lines never arrive. This guard is defence in depth for older doorbells, where a faithful audit trail is preferable to a dedup heuristic. (auto.md:1697-1699, :1113, :1092, :1877, :1660)
