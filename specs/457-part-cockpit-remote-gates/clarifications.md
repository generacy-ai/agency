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

**Answer**: *Pending*

### Q2: Live-path scope
**Context**: FR-001 scopes the new pre-draft check to the **sweep** path. The live path (in-session, event-driven dispatch) still spawns the drafter before opening the gate, with no cross-session dedup. Two concurrent conversations reacting to the same fresh event can both draft.
**Question**: Is the pre-draft durable check strictly a sweep-only change, or MUST it also gate the LIVE path so concurrent live drafts on the same `gateId` cannot both run?
**Options**:
- A: Sweep-only — live path is out of scope for this spec
- B: Both — live path also gains the pre-draft durable check
- C: Other

**Answer**: *Pending*

### Q3: Answered-but-unconsumed gates
**Context**: FR-003 says the sweep reuses gates that are `open`/unanswered. A gate can also be `answered` but not yet consumed by any session (e.g., prior session crashed mid-consume). The spec is silent on this state.
**Question**: When the durable query returns a gate that is `answered` but no session has consumed the answer yet, what MUST the sweep do?
**Options**:
- A: Treat as "no existing gate" — re-derive from labels and re-draft (answer is discarded; safest for correctness)
- B: Consume the existing answer and continue as if this session had opened the gate (cheapest; requires the durable query to return the answer payload)
- C: Skip drafting and record the answered gate in `openGates`, letting downstream logic consume it (mirrors the "record it and continue" pattern in FR-003)
- D: Other

**Answer**: *Pending*

### Q4: Concurrent-sweep race
**Context**: If two conversations start their sweeps within the same window (e.g., overlapping cluster restart + operator new-conversation), both pre-draft checks may return "no existing gate" before either has called `cockpit_gate_open`. Assumption 3 treats the inbox as authoritative but does not spell out the race resolution.
**Question**: For two concurrent sweeps computing the same `gateId` and both finding no existing gate, what is the required guarantee?
**Options**:
- A: Cloud-side coalescing on identical `gateId` is sufficient — no client-side change needed; both may spawn drafters but only one gate opens
- B: Cloud-side coalescing is sufficient for the gate, but the wasted drafter spawn on the losing side is acceptable and out of scope
- C: A client-side lock/lease is required so only one session drafts
- D: Other

**Answer**: *Pending*

### Q5: D.11's existing session-scoped dedup
**Context**: D.11 already has an in-memory `dispatched-issues` check at `auto.md:706`. FR-001 adds a durable pre-draft check to every `D.n` gate on the sweep path, including D.11.
**Question**: When D.11 gains the new durable check, does the existing in-memory `dispatched-issues` check remain as defense in depth, or is it removed in favor of the durable check alone?
**Options**:
- A: Keep both — in-memory short-circuits repeated hits within the same session; durable covers cross-session
- B: Replace with durable only — the in-memory set is redundant once the durable check exists
- C: Other

**Answer**: *Pending*
