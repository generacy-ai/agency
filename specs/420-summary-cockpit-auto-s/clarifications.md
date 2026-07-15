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

**Answer**: A — 5 minutes via ScheduleWakeup (pure delay, zero token cost until fire). Rationale: ScheduleWakeup is the only mechanism that costs nothing until it fires, which is the point of the rewrite; the 55s long-poll option reintroduces the ~1-turn/min cost the run measured. At 5 minutes, a 30-minute quiet phase costs at most 6 heartbeat turns instead of ~33 (-82%) while a dead watch is caught within ~5m30s; 15 minutes saves a handful more turns at triple the stranding time. The mechanism must be pinned in the spec — it IS the token story.

### Q2: Engine tweak scope
**Context**: FR-003 mandates that `cockpit_await_events` MUST be updated to accept `maxWaitMs=0` (non-blocking drain), but the Assumptions section calls it 'a one-line engine tweak in the companion issue.' This creates a scope contradiction: either the engine change is part of #420's PR, or #420 depends on a separate issue that must land first. This decides whether the implement phase must edit the MCP engine code, and whether #420 can merge before that other issue.
**Question**: Is the `maxWaitMs=0` engine change part of this issue's scope, or a separate blocking dependency?
**Options**:
- A: In scope for #420 — the same PR ships both the auto-loop rewrite and the `maxWaitMs=0` engine tweak
- B: Separate companion issue (must be filed and merged first); #420 blocks on it and only ships the auto-loop change
- C: In scope, but gated behind existing tool behavior — loop uses the smallest currently-accepted `maxWaitMs` (e.g., 1 ms) if `0` is rejected, no engine edit needed

**Answer**: C — In scope but gated behind existing tool behavior: call `cockpit_await_events` with the smallest currently-accepted `maxWaitMs` (e.g. 1 ms) as the non-blocking drain; no engine edit, no cross-repo dependency. Rationale: A single PR cannot ship both repos (the engine lives in generacy), and blocking on a companion release train buys a semantic difference of one millisecond. If a true `maxWaitMs=0` is ever wanted for cleanliness it is a one-line generacy nicety to file separately without blocking this change.

### Q3: Missing Monitor behavior
**Context**: The Assumptions section says operators run `/cockpit:auto` inside a harness that supports Monitor, but does not say what the loop should do if Monitor is unavailable at runtime (e.g., older Claude Code build, headless/remote-agent run, non-Claude-Code harness). This decides whether missing Monitor is a hard error the operator must fix, or triggers automatic legacy long-poll behavior.
**Question**: How should `/cockpit:auto` behave when the harness `Monitor` tool is not available?
**Options**:
- A: Hard fail with a clear error and refuse to run — forces operator to upgrade harness or use `/cockpit:watch` manually
- B: Graceful fallback to the current pre-change long-poll behavior with a warning banner in the loop output
- C: Detect and warn, then run in reduced-polling mode using only the ScheduleWakeup heartbeat (no Monitor, no continuous long-poll)

**Answer**: A — Hard fail at pre-flight with a clear error and remedy ("upgrade Claude Code, or drive the epic with the assist commands"); refuse to run without Monitor. Rationale: Rev 3's costliest dogfooding lesson was that fallback mechanisms mask defects (the #86/#800/#801 chain came from exactly one graceful fallback) — a legacy long-poll or reduced-polling mode would live on forever as rarely-exercised dark surface. The check is cheap, runs at startup before any state changes, and the assist commands remain a fully supported manual path.

### Q4: Watch re-spawn policy
**Context**: FR-005 says the loop MUST re-spawn the watch process on Monitor exit but does not bound the retries. Without a cap, a persistently-crashing watch (e.g., broken binary, unauthenticated) would burn model turns in a re-spawn loop; too tight a cap would abort recoverable transient failures. SC-005 assumes the re-spawn succeeds within one heartbeat window.
**Question**: What re-spawn policy should apply when the watch process exits?
**Options**:
- A: Unlimited re-spawns with exponential backoff (1 s → 2 s → 4 s, capped at 60 s), never give up
- B: Bounded: up to 3 re-spawns; on the 4th failure within one heartbeat, mark the run as failed and stop
- C: Bounded with fallback: after N consecutive failures, keep the loop alive but fall back to long-poll `cockpit_await_events` instead of Monitor

**Answer**: A — Unlimited re-spawns with exponential backoff, with one refinement: cap the backoff ceiling at the Q1 heartbeat interval (5 min) rather than 60 s, so a persistently-dead watch degrades to exactly heartbeat cost. Rationale: Watch exits are documented-normal (session tool timeouts; re-arms are idempotent), so any hard cap eventually kills a healthy long run over a transient, and a fall-back-to-long-poll option resurrects the legacy path being deleted. With the ceiling tied to the heartbeat, the pathological case can never cost more than the fallback already accepted, and it stays loud in the loop output.

### Q5: Watch-line debouncing
**Context**: The doorbell design wakes the loop on every NDJSON line from `generacy cockpit watch`. During bursts (e.g., a phase transition that stamps many labels in seconds), each line would trigger a wake, and each wake is a full model turn. SC-001 targets a ~90% drop in polling turns (34 → ~3), which can be exceeded by burst amplification if lines are not coalesced.
**Question**: Should the loop coalesce closely-spaced watch lines into a single wake?
**Options**:
- A: No coalescing — each watch line triggers one wake; rely on `cockpit_await_events(maxWaitMs=0)` returning an empty/small batch on redundant fires being cheap enough
- B: Fixed small debounce (e.g., 500 ms): after a watch line, hold for the debounce window; if more lines arrive, fold them into one wake
- C: Reuse `coalesceWindowMs` (default 3000 ms) from `cockpit_await_events` — call it with that window on wake so bursts are already batched at the MCP layer

**Answer**: C — Reuse `coalesceWindowMs` (default 3000 ms) at the MCP layer: on each wake, fetch with that window so bursts arrive as one already-coalesced batch; no client-side debounce. Rationale: Monitor already semi-coalesces naturally (lines arriving during a turn are delivered with the next wake), and the MCP layer already owns burst-batching — reusing it adds zero new mechanism, per "the plugin narrates, the engine decides." A client-side debounce has nowhere free to run in a playbook: waiting is itself a turn.

