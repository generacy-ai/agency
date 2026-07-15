# Feature Specification: Monitor-driven wake-ups for `/cockpit:auto`

**Branch**: `420-summary-cockpit-auto-s` | **Date**: 2026-07-15 | **Status**: Draft | **Issue**: [#420](https://github.com/generacy-ai/agency/issues/420)

## Summary

`/cockpit:auto`'s main loop currently waits for epic-state transitions by long-polling the `cockpit_await_events` MCP tool with `maxWaitMs=55000`. Every return — including empty ones — costs a full model turn that re-reads the session's entire accumulated context. On the snappoll dogfood run (12/12 issues merged, epic-complete), 34 of 110 poll calls (31%) returned zero events, contributing ~41.8M cache-read tokens of pure waiting (~$13 for a *small* 13-issue epic). A single 30-minute quiet phase burns ~33 polling turns × ~380k cache-read ≈ 12.5M tokens for zero progress. Cost scales linearly with wall-clock quiet time *and* session length (context re-read grows with the run).

The pre-#406 design (docs/epic-cockpit-plan.md rev 3, sensor/actuator split) already solved this: the harness `Monitor` tool ran `generacy cockpit watch` as a background sensor and re-invoked the model only when a transition line arrived — idle waiting cost zero tokens. This feature restores that model: **Monitor wakes, MCP fetches.** The watch line is a doorbell; `cockpit_await_events` remains the single source of typed, cursored batches for state dispatch.

## User Stories

### US1: Operator running long epics doesn't burn tokens on quiet phases

**As an** operator running `/cockpit:auto` on an epic with long implement/test phases,
**I want** the loop to sit idle at zero token cost while nothing is happening,
**So that** a 30-minute quiet phase doesn't cost me ~12.5M cache-read tokens (or ~$13 for a small epic) of pure waiting against my rate limits / budget.

**Acceptance Criteria**:
- [ ] During a stretch of wall-clock quiet time on an epic, the model incurs zero polling turns (i.e., no `cockpit_await_events` calls, no re-invocations) until a real transition happens or the 5-minute fallback heartbeat fires.
- [ ] When a transition does happen, the loop wakes within seconds of the watch line being emitted.
- [ ] Total polling turns on a representative run drop from ~1-per-minute-of-quiet to ~1-per-real-event (target: ~110 → ~76 for the snappoll baseline).

### US2: Loop keeps working if the watch process dies

**As an** operator who cannot supervise every run,
**I want** the loop to recover automatically if the background `generacy cockpit watch` process dies or hangs,
**So that** a silent sensor failure doesn't strand my epic mid-run.

**Acceptance Criteria**:
- [ ] A 5-minute `ScheduleWakeup` heartbeat fires even when Monitor is silent, so a dead watch is detected within one heartbeat window (~5m30s worst case).
- [ ] On detecting Monitor exit, the loop re-spawns the watch process unboundedly with exponential backoff (1s → 2s → 4s → …), capping at the 5-minute heartbeat interval.
- [ ] Re-spawn attempts and outcomes are surfaced in the loop's user-visible output so a persistently-broken watch is loud, not silent.

### US3: Existing event-dispatch semantics are preserved

**As a** developer of `/cockpit:auto`,
**I want** all typed event parsing, cursor bookkeeping, ordering, and re-check-live-state dispatch to continue flowing through `cockpit_await_events`,
**So that** this change is a wake-up-source swap only, not an event-protocol rewrite, and no regressions are introduced in gate advancement.

**Acceptance Criteria**:
- [ ] The auto loop still calls `cockpit_await_events(epic, cursor, ...)` on every wake and still consumes the typed batch it returns.
- [ ] The NDJSON watch-line content is ignored by the loop (used only as a doorbell); no parallel parser is introduced.
- [ ] End-to-end epic advancement on the snappoll fixture matches pre-change behavior (same gates cleared, same merges, same terminal state).

### US4: Missing Monitor fails loudly at pre-flight

**As an** operator running `/cockpit:auto` in an unsupported harness (older Claude Code, non-Claude-Code runner, headless remote agent lacking Monitor),
**I want** the command to refuse to run with a clear error and remedy,
**So that** I don't silently fall onto a legacy long-poll code path that would live on forever as rarely-exercised dark surface (the failure mode that caused the #86/#800/#801 chain).

**Acceptance Criteria**:
- [ ] Pre-flight check runs before any state-changing tool calls.
- [ ] If the harness `Monitor` tool is unavailable, the loop prints a clear error naming the requirement and pointing to the assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) as the supported manual path, then exits non-zero.
- [ ] No fallback long-poll or reduced-polling mode is provided.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `/cockpit:auto` MUST spawn `generacy cockpit watch <epic-ref>` under the harness `Monitor` tool at loop start. | P1 | NDJSON sensor exists unchanged post-#406. |
| FR-002 | On each Monitor-delivered wake-up, the loop MUST call `cockpit_await_events(epic, cursor, maxWaitMs=<minimum-accepted-value>, coalesceWindowMs=3000)` to drain the typed batch. Bursts are coalesced at the MCP layer via `coalesceWindowMs`; no client-side debounce is added. | P1 | Watch line is doorbell only; MCP remains source of truth for events and burst-batching. |
| FR-003 | The loop MUST use the smallest currently-accepted `maxWaitMs` value (e.g., `1`) on wake-driven drains so the call is effectively non-blocking without requiring an engine change. If a true `maxWaitMs=0` is later added to the engine as a nicety, the loop MAY be updated to use it; that change is not blocking. | P1 | Q2 clarification: no cross-repo dependency, no companion issue blocks this PR. |
| FR-004 | The loop MUST arm a `ScheduleWakeup` fallback heartbeat with a 5-minute delay whenever Monitor is silent. When the heartbeat fires, the loop drains events as in FR-002 and re-arms. | P1 | Q1 clarification: 5 min via ScheduleWakeup (pure delay, zero token cost until fire). Not a long `await_events` call. |
| FR-005 | On Monitor exit, the loop MUST re-spawn the watch process with exponential backoff starting at 1 s and doubling (1 s → 2 s → 4 s → 8 s → …), capped at 5 minutes (the FR-004 heartbeat interval). Re-spawns MUST continue indefinitely; no hard retry cap. Re-spawn attempts and outcomes MUST be printed in the loop's user-visible output. | P1 | Q4 clarification: unlimited retries, ceiling at heartbeat interval so pathological watch death degrades to exactly heartbeat cost. |
| FR-006 | `/cockpit:auto` MUST run a pre-flight check for harness `Monitor` availability before any state-changing tool calls. If unavailable, it MUST print a clear error identifying the missing tool and directing operators to the assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) as the manual path, then exit non-zero. No fallback long-poll mode. | P1 | Q3 clarification: hard fail, no graceful fallback. |
| FR-007 | Cursor protocol, batch ordering, and re-check-live-state dispatch MUST remain unchanged. | P1 | Change is wake-source only. |
| FR-008 | The shipped `auto.md` step 2 MUST be updated to describe the Monitor-plus-MCP model (removing the current "no background watcher to spawn" note) and to document the FR-006 pre-flight requirement, FR-004 heartbeat, and FR-005 re-spawn behavior. | P2 | Docs. |
| FR-009 | The change MUST NOT alter the observable event stream consumed by other cockpit skills (`/cockpit:watch`, etc.). | P2 | Sensor is shared infrastructure. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Zero-event `cockpit_await_events` polling turns per run | Drop by ≥90% vs. baseline (34 → ≤3 on snappoll fixture) | Count turns whose only tool call is `cockpit_await_events` and whose result was 0 events, from session transcript. |
| SC-002 | Cache-read tokens attributed to pure polling turns | Drop by ≥90% vs. baseline (~41.8M → ≤4M on snappoll fixture) | Sum cache-read tokens on pure-polling turns from transcript. |
| SC-003 | Wake latency after a real transition | ≤ 5 s p95 from watch-line emission to loop wake | Timestamp diff: transition emit (watch NDJSON) vs. next model turn start. |
| SC-004 | Epic-completion parity | Same terminal state and merged-issue count as baseline run on snappoll fixture | Compare epic ledger + PR merge list to baseline. |
| SC-005 | Recovery from watch-process death | Loop resumes within one heartbeat window (≤ 5 min + 30 s) | Kill watch mid-run in a test; measure time to next successful event dispatch. |
| SC-006 | Pre-flight refusal without Monitor | Command exits non-zero with actionable error and takes no state-changing action | Run `/cockpit:auto` in a harness without Monitor; inspect exit code, output, and cockpit ledger. |

## Assumptions

- The harness `Monitor` tool contract still holds: background process idles at zero token cost, model is re-invoked when a new line arrives on stdout.
- The harness `ScheduleWakeup` tool is available in every environment that supports Monitor (both are Claude Code capabilities).
- `generacy cockpit watch <epic-ref>` still emits one NDJSON line per real state transition (unchanged since #406 landed the MCP path alongside it).
- The currently-accepted minimum `maxWaitMs` value for `cockpit_await_events` (e.g., `1` ms) is close enough to zero that the extra millisecond per wake is negligible against the polling-turn savings. No engine change is required in this repo or in generacy.
- Operators run `/cockpit:auto` inside a harness that supports Monitor; unsupported harnesses hard-fail at pre-flight (see FR-006) rather than falling back.

## Out of Scope

- Rewriting the NDJSON sensor or the MCP event protocol.
- Changing gate semantics, phase transitions, or advancement rules.
- Removing `cockpit_await_events` — it remains the sole typed-event data path.
- Adding a true `maxWaitMs=0` non-blocking mode to the `cockpit_await_events` engine — the loop uses the smallest currently-accepted value instead. If the engine gains true zero later, updating the loop to use it is a follow-up.
- A graceful fallback long-poll path for harnesses without Monitor — pre-flight hard-fails instead.
- Migrating other cockpit skills (`/cockpit:watch`, `/cockpit:status`, etc.) — this feature only touches `/cockpit:auto`.
- Multi-epic supervision from a single loop.

## Evidence Pointers

- Shipped `auto.md` step 2 ("No background watcher to spawn. Post-#406 … the event source is `cockpit_await_events`, called per iteration.")
- Snappoll run transcript + ledger on `snappoll-orchestrator-1`; session file `~/.claude/projects/-workspaces-snappoll/1d0df76b….jsonl`.
- Original sensor/actuator intent: tetrad-development `docs/epic-cockpit-plan.md` §Architecture ("Monitor runs `generacy cockpit watch`").
- Regression origin: agency#406 (replaced Monitor sensor with MCP long-poll loop).
- Prior fallback-mask incident (Q3 rationale): the #86/#800/#801 chain — cited on the clarification comment.

---
