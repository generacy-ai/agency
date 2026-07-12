# Clarifications: Found during the cockpit v1

## Batch 1 — 2026-07-12

### Q1: Ledger counter semantics
**Context**: FR-006 says the `<consecutive-count>` field of the `cursor-recovery` ledger line "is the `invalid-cursor` counter value at recovery time (always `0` for non-`invalid-cursor` classes)". But Story 3 acceptance scenario 2 shows a mixed run ending with `resetFrom · 1` (not `resetFrom · 0`) — implying the counter for a `resetFrom` line is a per-class count, not the invalid-cursor counter. These contradict, and the tie has to be broken before FR-006 and Story 3's audit fixture can both be enforced.
**Question**: Which reading is authoritative for `<consecutive-count>` on non-`invalid-cursor` recovery lines?
**Options**:
- A: FR-006 is authoritative — always `0` for non-`invalid-cursor` classes; fix Story 3 SC #2 to read `resetFrom · 0`.
- B: Story 3 SC #2 is authoritative — the count is per-class (each class has its own consecutive counter); rewrite FR-006 accordingly.
- C: Report a single per-line count for the class of *that* line, but only the `invalid-cursor` counter drives the escalation gate (i.e., non-`invalid-cursor` classes get their own count for the ledger but never escalate).

**Answer**: *Pending*

---

### Q2: "Successful cursor reuse" definition
**Context**: FR-002 resets the consecutive-fault counter "on any successful cursor reuse", but what qualifies as "successful" is not defined. This matters because a wrong definition either resets the counter prematurely (masking a real fault) or never resets it in low-traffic epics (causing false escalations after routine restarts).
**Question**: What outcome from a `cockpit_await_events` call qualifies as "successful cursor reuse" and resets the counter?
**Options**:
- A: Any call that presents the cursor and does *not* return a cursor-error signal (`invalid-cursor`/`resetFrom`/`expiry`/`discarded`) — including empty batches — counts as success.
- B: Only a call that both accepts the presented cursor *and* returns ≥1 event counts as success (empty batches leave the counter unchanged).
- C: Only a call that returns a fresh continuation cursor for the *next* poll counts as success (i.e., the cursor round-tripped).

**Answer**: *Pending*

---

### Q3: Gate behavior when no operator responds
**Context**: Auto-mode is designed to run unattended for extended periods (the incident's snappoll-1 run went many hours). The assumption "operators … can and will make the decision when prompted" holds for supervised sessions but leaves ambiguous what happens if the escalation gate fires with no watcher — the very case where silent degradation was worst in the original incident. Implementation must decide whether the gate blocks the dispatch loop forever, times out to a default, or something else.
**Question**: What is the required behavior when the G.4-class escalation gate fires and no operator responds within some reasonable window?
**Options**:
- A: Block the dispatch loop indefinitely — the gate never times out; the run halts progress until an operator answers.
- B: Timeout after a defined interval to the recommended default (`Continue degraded`) and record the auto-decision in the ledger.
- C: Timeout to `Stop (exit auto)` — no operator means no supervised session, so degradation should not be silently entered.
- D: Out of scope for this feature — timeout policy belongs to the G.4/AskUserQuestion contract (per #402) and this spec inherits whatever that contract does.

**Answer**: *Pending*

---

### Q4: Gate re-fire semantics after "Continue degraded" and counter reset
**Context**: Edge Cases say `Continue degraded` gives "decide-once semantics" and "the gate does not re-fire on every batch". FR-004 also requires the counter to reset on any successful cursor reuse, "so recovery from the degraded state is observable". Ambiguous: after the operator picks `Continue degraded`, the counter resets on a successful reuse, and *then* two new consecutive `invalid-cursor` occur — does the gate fire again (new streak = new decision) or is `Continue degraded` sticky for the remainder of the session?
**Question**: Does the escalation gate re-fire on a fresh 2-in-a-row `invalid-cursor` streak in the same session after the operator has already chosen `Continue degraded` (and the counter reset in between)?
**Options**:
- A: Yes — `Continue degraded` applies only to the streak that raised it; a *new* consecutive streak (after any successful reuse) is a new decision and the gate re-fires at count 2 again.
- B: No — `Continue degraded` is sticky for the whole session; the gate never fires a second time regardless of subsequent streaks (counter still resets for ledger accounting only).
- C: Sticky for a bounded window (e.g., N successful reuses since the decision), then eligible to re-fire — specify N.

**Answer**: *Pending*
