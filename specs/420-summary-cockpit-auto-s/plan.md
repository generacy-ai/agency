# Implementation Plan: Monitor-driven wake-ups for `/cockpit:auto`

**Feature**: Restore the Monitor sensor + MCP fetcher model in `/cockpit:auto` so the loop sits idle at zero token cost between real epic-state transitions
**Branch**: `420-summary-cockpit-auto-s`
**Issue**: [#420](https://github.com/generacy-ai/agency/issues/420)
**Date**: 2026-07-15
**Status**: Complete

## Summary

`/cockpit:auto` currently long-polls `cockpit_await_events(maxWaitMs=55000)` per iteration. Every return — including empty ones — costs a full model turn that re-reads the entire session context. On the snappoll dogfood run, 34 of 110 poll calls (31%) returned zero events and burned ~41.8M cache-read tokens (~$13) of pure waiting for a 13-issue epic.

This feature restores the pre-#406 sensor/actuator split, adapted to the current typed-batch MCP world:

- **Monitor is the doorbell** — the harness `Monitor` tool runs `generacy cockpit watch <epic-ref>` as a background sensor. Idle cost is zero (no model turns while the process is quiet).
- **`cockpit_await_events` remains the source of typed batches** — on each Monitor-delivered wake, the loop drains events via `cockpit_await_events(epic, cursor, maxWaitMs=<smallest-accepted>, coalesceWindowMs=3000)`. The watch NDJSON line is a doorbell only; no parallel parser is introduced.
- **`ScheduleWakeup` heartbeat** — a 5-minute pure-delay wake-up is armed whenever Monitor is silent, providing belt-and-braces recovery if the watch process dies. Costs zero tokens until it fires.
- **Watch re-spawn on Monitor exit** — exponential backoff (1s → 2s → 4s → …) capped at the 5-minute heartbeat interval, unlimited retries. Re-spawn attempts print in the loop's user-visible output.
- **Hard fail without Monitor** — pre-flight refuses to run in a harness that lacks `Monitor`, directing operators to the assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) as the manual path. No fallback long-poll mode is retained (that dark surface was the root of the #86/#800/#801 chain).

The change is a wake-source swap only. Cursor protocol, batch ordering, dispatch table, gate contracts, and ledger semantics are all unchanged. This is a plugin-side edit — the MCP engine, the CLI watch process, and other cockpit skills are not touched.

## Technical Context

- **Language / runtime**: The playbook is a Claude Code plugin markdown file (`packages/claude-plugin-cockpit/commands/auto.md`) interpreted by the harness at invocation time. No compiled code; the "implementation" is prose that the model executes tool-by-tool.
- **Framework**: Claude Code harness. Load-bearing tools: harness `Monitor` (background stdout streaming with model re-invocation per line), harness `ScheduleWakeup` (scheduled delay wake-up, no token cost until fire), harness `Bash` (for `generacy cockpit watch` invocation surface / re-spawn accounting).
- **MCP tools consumed** (unchanged from #406 shape): `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`.
- **External CLI**: `generacy cockpit watch <epic-ref>` — emits one NDJSON line per real state transition. Unchanged since #406 landed the MCP path alongside it.
- **Constraint (Q2 clarification)**: The MCP engine lives in the `generacy` repo, out of scope for this PR. The loop uses the smallest currently-accepted `maxWaitMs` (e.g., `1` ms) as the non-blocking drain — no engine change required.
- **Constraint (Q3 clarification)**: No fallback long-poll mode. Pre-flight hard-fails if `Monitor` is unavailable; the assist commands are the manual path.

## Project Structure

Files touched by this feature (all under `packages/claude-plugin-cockpit/`):

```
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md            ← MODIFY: step 1 pre-flight, step 2 sensor spawn, step 4 drain-on-wake, step 5 respawn + heartbeat, ledger action strings, invariants, examples
└── README.md              ← MODIFY (optional): update the § commands overview if it names auto's polling model
```

Files not touched:

- `packages/claude-plugin-cockpit/commands/watch.md` — the `/cockpit:watch` assist skill is separate; its subprocess is spawned interactively per invocation.
- The MCP engine (`cockpit_await_events` server) — lives in the `generacy` repo. Not editable from this repo.
- `generacy cockpit watch` CLI — unchanged NDJSON emission.
- Other cockpit skills (`clarify`, `status`, `advance`, `merge`, `review`, `queue`, `resume`) — sensor is shared infrastructure; observable event stream is preserved (FR-009).

## Constitution Check

No `.specify/memory/constitution.md` file present in this repo; the project has no formal constitution to check against. The change adheres to the implicit invariants of the cockpit plugin as stated in `auto.md § Invariants`:

- **Never merge on red** — unchanged (dispatch table D.5/D.6 untouched).
- **Every gate prompts** — unchanged (no new gates, no gate changes).
- **Analysis in subagents** — unchanged (no new inline analysis).
- **Stream consumption is unfiltered** — the watch NDJSON is used only as a doorbell (never parsed for content); `cockpit_await_events` remains the typed-batch source. No field-based filter is introduced.
- **Ledger discipline** — one ledger line per dispatch is preserved. Heartbeat and re-spawn events add new ledger action strings (`heartbeat`, `watch-respawn`) but do not violate the mandatory-per-dispatch rule (both are "dispatches" in the ledger-taxonomy sense: parent processes a wake-up signal and takes a countable action).

The one norm-shift worth naming: pre-#406, "watch re-arms don't count as dispatches" was explicit in `auto.md § Ledger` (line 929). This feature reintroduces re-spawn events but chooses to *ledger them anyway* — that's the FR-005 acceptance criterion "re-spawn attempts and outcomes MUST be printed in the loop's user-visible output," and the ledger is the user-visible output. The `auto.md § Ledger` § "What does NOT count" bullet will need a targeted edit to reflect the new decision.

## Key Technical Decisions

Decisions summarized here; full rationale in `research.md`.

1. **Doorbell + typed-batch fetcher** over "pure Monitor rewrite" (which would need a per-line NDJSON parser resurrected in the loop). The MCP typed-batch is already the source of truth for events; Monitor just wakes the loop. Keeps the change small and preserves cursor semantics unchanged.
2. **`ScheduleWakeup` for heartbeat** over a long `cockpit_await_events` call. The whole point of the rewrite is that a wake-up costs zero tokens until it fires; a long-poll call still burns one turn per fire. 5-minute interval matches Q1=A.
3. **`maxWaitMs=1` on wake-driven drains** over waiting for the engine to add `maxWaitMs=0`. Q2=C: no cross-repo dependency, no companion issue blocks this PR. One-millisecond block is negligible against the polling-turn savings.
4. **Hard-fail pre-flight** over graceful fallback. Q3=A: dark-surface fallback was the failure mode that produced the #86/#800/#801 chain.
5. **Unbounded exponential-backoff re-spawn, capped at heartbeat interval**. Q4=A: watch exits are documented-normal; any hard cap eventually kills a healthy long run. Ceiling tied to heartbeat means pathological case degrades to exactly the heartbeat cost.
6. **No client-side debounce; reuse `coalesceWindowMs`**. Q5=C: burst-batching already lives in the MCP layer; adding a client-side debounce has nowhere free to run in a playbook (waiting is itself a turn).

## Constraints and Assumptions

- **Monitor semantics**: background process idles at zero token cost; model is re-invoked exactly when a new line arrives on the child's stdout. This is the harness-tool contract, unchanged.
- **`ScheduleWakeup` semantics**: pure delay, zero token cost until fire; harness re-invokes the model when the scheduled time arrives. Available in every environment that supports Monitor (both are Claude Code capabilities).
- **`generacy cockpit watch <epic-ref>`**: emits one NDJSON line per real state transition on stdout, unchanged since #406. Exits are considered normal (session tool timeouts; re-arms are idempotent).
- **`cockpit_await_events` current bounds**: accepts `maxWaitMs` down to some minimum (e.g., `1` ms). If the engine tightens this minimum, the playbook needs a matching bump; if it later accepts `0`, the playbook MAY be updated as a one-line follow-up (non-blocking).
- **Operator environment**: `/cockpit:auto` is intended for interactive Claude Code sessions (desktop, CLI, web). Headless remote agents or non-Claude-Code runners hard-fail at pre-flight per FR-006. This is a policy choice, not a technical limit.

## Out of Scope

- Rewriting the NDJSON sensor or the MCP event protocol.
- Changing gate semantics, phase transitions, or advancement rules.
- Removing `cockpit_await_events`.
- Adding a true `maxWaitMs=0` non-blocking mode to the engine — that's a one-line generacy nicety filed separately if wanted.
- Fallback long-poll path for harnesses without Monitor.
- Migrating other cockpit skills (`/cockpit:watch`, `/cockpit:status`, etc.).
- Multi-epic supervision from a single loop.

## Success Signals

Reference SC-001–SC-006 in `spec.md § Success Criteria`. Baseline is the snappoll dogfood run transcript (110 polling turns / 34 zero-event / ~41.8M cache-read tokens on empty polls). Targets:

- Zero-event polling turns drop by ≥90% (34 → ≤3 on snappoll fixture).
- Cache-read tokens on pure-polling turns drop by ≥90% (~41.8M → ≤4M).
- Wake latency ≤ 5s p95 from watch-line emission to loop wake.
- Epic-completion parity (same gates cleared, same merges, same terminal state).
- Watch-death recovery within one heartbeat window (≤ 5m + 30s).
- Pre-flight refusal without Monitor exits non-zero, no state-changing action, actionable error.

## Next Step

Run `/cockpit:tasks` (or `/speckit:tasks`) to generate the task list from this plan.
