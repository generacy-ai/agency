# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-15 17:17

### Q1: Fallback heartbeat interval
**Context**: FR-004 mandates a belt-and-braces heartbeat 'at a bounded interval' when Monitor is silent, and SC-005 measures recovery as '≤ heartbeat interval + 30 s' — but no concrete interval is pinned. This is load-bearing: too short defeats the token-saving purpose (extra polling turns during quiet phases); too long leaves epics stranded longer after a dead watch. The choice also decides between using a long `cockpit_await_events` call (each still burns one turn per fire) or a ScheduleWakeup-style pure delay (zero-cost until fire).
**Question**: What fallback heartbeat interval should the loop use when Monitor is silent, and which mechanism should implement it?
**Options**:
- A: 5 minutes via ScheduleWakeup (pure delay, zero token cost until fire — best for SC-001/SC-002 targets, worst SC-005 latency ≈5m30s)
- B: 15 minutes via ScheduleWakeup (further reduces heartbeat turns; watch-death detection ≈15m30s)
- C: 55 s via long `cockpit_await_events` (fastest recovery but reintroduces ~1/min polling turns — undermines SC-001)
- D: 5 min heartbeat interval, mechanism left to implementer's judgment (spec fixes the interval, not the how)

**Answer**: *Pending*

### Q2: Engine tweak scope
**Context**: FR-003 mandates that `cockpit_await_events` MUST be updated to accept `maxWaitMs=0` (non-blocking drain), but the Assumptions section calls it 'a one-line engine tweak in the companion issue.' This creates a scope contradiction: either the engine change is part of #420's PR, or #420 depends on a separate issue that must land first. This decides whether the implement phase must edit the MCP engine code, and whether #420 can merge before that other issue.
**Question**: Is the `maxWaitMs=0` engine change part of this issue's scope, or a separate blocking dependency?
**Options**:
- A: In scope for #420 — the same PR ships both the auto-loop rewrite and the `maxWaitMs=0` engine tweak
- B: Separate companion issue (must be filed and merged first); #420 blocks on it and only ships the auto-loop change
- C: In scope, but gated behind existing tool behavior — loop uses the smallest currently-accepted `maxWaitMs` (e.g., 1 ms) if `0` is rejected, no engine edit needed

**Answer**: *Pending*

### Q3: Missing Monitor behavior
**Context**: The Assumptions section says operators run `/cockpit:auto` inside a harness that supports Monitor, but does not say what the loop should do if Monitor is unavailable at runtime (e.g., older Claude Code build, headless/remote-agent run, non-Claude-Code harness). This decides whether missing Monitor is a hard error the operator must fix, or triggers automatic legacy long-poll behavior.
**Question**: How should `/cockpit:auto` behave when the harness `Monitor` tool is not available?
**Options**:
- A: Hard fail with a clear error and refuse to run — forces operator to upgrade harness or use `/cockpit:watch` manually
- B: Graceful fallback to the current pre-change long-poll behavior with a warning banner in the loop output
- C: Detect and warn, then run in reduced-polling mode using only the ScheduleWakeup heartbeat (no Monitor, no continuous long-poll)

**Answer**: *Pending*

### Q4: Watch re-spawn policy
**Context**: FR-005 says the loop MUST re-spawn the watch process on Monitor exit but does not bound the retries. Without a cap, a persistently-crashing watch (e.g., broken binary, unauthenticated) would burn model turns in a re-spawn loop; too tight a cap would abort recoverable transient failures. SC-005 assumes the re-spawn succeeds within one heartbeat window.
**Question**: What re-spawn policy should apply when the watch process exits?
**Options**:
- A: Unlimited re-spawns with exponential backoff (1 s → 2 s → 4 s, capped at 60 s), never give up
- B: Bounded: up to 3 re-spawns; on the 4th failure within one heartbeat, mark the run as failed and stop
- C: Bounded with fallback: after N consecutive failures, keep the loop alive but fall back to long-poll `cockpit_await_events` instead of Monitor

**Answer**: *Pending*

### Q5: Watch-line debouncing
**Context**: The doorbell design wakes the loop on every NDJSON line from `generacy cockpit watch`. During bursts (e.g., a phase transition that stamps many labels in seconds), each line would trigger a wake, and each wake is a full model turn. SC-001 targets a ~90% drop in polling turns (34 → ~3), which can be exceeded by burst amplification if lines are not coalesced.
**Question**: Should the loop coalesce closely-spaced watch lines into a single wake?
**Options**:
- A: No coalescing — each watch line triggers one wake; rely on `cockpit_await_events(maxWaitMs=0)` returning an empty/small batch on redundant fires being cheap enough
- B: Fixed small debounce (e.g., 500 ms): after a watch line, hold for the debounce window; if more lines arrive, fold them into one wake
- C: Reuse `coalesceWindowMs` (default 3000 ms) from `cockpit_await_events` — call it with that window on wake so bursts are already batched at the MCP layer

**Answer**: *Pending*

