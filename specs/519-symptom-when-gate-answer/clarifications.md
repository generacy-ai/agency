# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-09-04 00:17

### Q1: Guard placement vs adopted gate records
**Context**: FR-001 places the not-mine branch inside D.12 step 1 (the *no-record* lookup), but US1's first acceptance criterion reads unconditionally: "A `gate-answer` whose `gateKey` `runId` segment ≠ this run's `runId` is a logged no-op." These conflict for adopted gates: the § step 3 Adoption pass creates `openGates` entries whose originating `runId` differs from the current run's, and D.12 steps 3/5 already read `openGates[gateId].runId` specifically to handle answers for gates a *prior* run opened. If the runId-mismatch guard fires before the record lookup, adopted gates' answers become no-ops and adoption breaks.
**Question**: Does the foreign-run/out-of-scope guard apply only when `openGates[event.gateId]` is absent (an existing record — including an adopted one — always processes normally), or does it pre-empt processing even when a matching record exists?
**Options**:
- A: Guard only inside the no-record branch — record present (current-run or adopted) → steps 2–6 run unchanged; US1's AC wording is tightened to "…and has no `openGates` record".
- B: Guard runs before the record lookup — any `runId` mismatch is a no-op even with a matching record (the adoption answer path is intentionally changed).

**Answer**: *Pending*

### Q2: gateKey without a runId segment
**Context**: FR-002 derives "mine" from the `gateKey`'s 4th (`runId`) segment, and FR-005 re-documents the payload accordingly. But the current payload doc (auto.md Shape 3) shows 3 segments, and under `runIdEnabled === false` gates are opened without a `runId` — a replayed answers-file can deliver historical answers whose `gateKey` has only 3 segments.
**Question**: When an arriving `gateKey` carries no `runId` segment, how should the guard classify it?
**Options**:
- A: Skip the runId comparison for that event — apply only the in-scope-issue check; a 3-segment in-scope key with no record falls through to the existing `superseded (no record)` ack.
- B: Treat as foreign — no runId segment means ownership is unprovable, so logged no-op (safest against damaging historical records).
- C: Treat as mine — always fall through to the existing no-record ack (current behaviour, preserves startup-race handling for legacy gates).

**Answer**: *Pending*

### Q3: Ledger vocabulary for the out-of-scope-issue branch
**Context**: FR-004 mandates the verbatim row `foreign-run delivery — not acked (owner run: <runId>)`. The guard has two triggers, though: foreign `runId` and out-of-scope issue. An answer whose `gateKey` names an out-of-scope issue but carries *this* run's `runId` (or no runId segment, per Q2) would produce a row naming this very run as the "owner" — misleading for the US2 audit goal of distinguishing drop reasons.
**Question**: Should both guard triggers share the single verbatim vocabulary, or does the out-of-scope-issue branch get its own variant (e.g., `out-of-scope delivery — not acked (issue: <issue-ref>)`)?
**Options**:
- A: One vocabulary for both branches — `foreign-run delivery — not acked (owner run: <runId>)` verbatim, exactly as improvised in production.
- B: Two pinned variants — foreign-run keeps the production wording; out-of-scope-issue gets a distinct wording naming the issue instead of the run.

**Answer**: *Pending*

### Q4: Full ledger row shape for the no-op
**Context**: Ledger rows follow the four-column format `<issue-ref> · <transition-class> · <original-action> · <outcome> · source: <token>`, but `transitionClass` and `<original-action>` are read from the `openGates` record (auto.md Payload shape note) — which by definition doesn't exist in the no-op case. FR-004 specifies only the outcome-slot vocabulary, and FR-007 pins it verbatim, so the surrounding row shape must be exact.
**Question**: What fills the remaining slots of the no-op ledger row, and which `source:` token does it carry?
**Options**:
- A: Four-column shape with the issue-ref parsed from the `gateKey`, placeholder slots for the unknowable columns, and `· source: ui-gate` — e.g., `<gateKey-issue-ref> · — · gate-answer · foreign-run delivery — not acked (owner run: <runId>) · source: ui-gate`.
- B: Reuse the existing no-record row shape (as step 1 writes today) with the new vocabulary in the outcome slot.
- C: A free-form single line (no four-column contract); exact shape deferred to /plan, with only the FR-004 vocabulary pinned.

**Answer**: *Pending*

### Q5: Replayed-delivery dedup for the no-op
**Context**: The doorbell's answers-file source replays history, so the same foreign answer can be redelivered on every wake — and `deliveryId` is unique per delivery *attempt*, so `deliveryId` dedup does not collapse replays. FR-004's "exactly one ledger row" per event, applied per Invariant #8, means a long run could write the identical foreign-run row dozens of times.
**Question**: Should the no-op write one ledger row per delivery (strict Invariant #8), or dedup so each foreign `gateId` is logged at most once per run?
**Options**:
- A: One row per delivery — strict one-line-per-dispatch; accept the repetition as an audit trail of every replayed delivery.
- B: Dedup per `gateId` — first foreign delivery writes the row; subsequent replays of the same `gateId` are fully silent (tracked in a session-local seen-set).
- C: Dedup per `gateId` per wake/batch — one row per sweep that redelivers it.

**Answer**: *Pending*
