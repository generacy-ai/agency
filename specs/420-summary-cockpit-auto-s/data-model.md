# Data Model: Monitor-driven wake-ups for `/cockpit:auto`

This feature ships no new persistent schema. The only "data" it touches is the loop's in-memory bookkeeping plus a small number of new ledger action strings. The section below lists both, since `tasks.md` will reference them.

## In-memory loop state (new)

State that the parent loop must carry across iterations, in addition to the pre-existing cursor + per-class cursor-recovery counters:

| Field | Type | Purpose | Reset condition |
|---|---|---|---|
| `monitorHandle` | opaque (harness token from `Monitor.spawn(...)`) | Reference to the running `generacy cockpit watch <epic-ref>` sensor process | On Monitor-exit event; new handle assigned on next successful re-spawn |
| `watchRespawnBackoffSec` | number (1 → 2 → 4 → … cap 300) | Current backoff delay for the next re-spawn attempt | Reset to `1` on any Monitor-delivered wake that produced at least one dispatched event |
| `watchRespawnAttemptCounter` | number (monotone, resets to 0 on watch health) | Attempt number for user-visible + ledger accounting | Reset to `0` on watch-health event (same trigger as above) |
| `heartbeatScheduledWakeupArmed` | boolean | Whether a 5-minute `ScheduleWakeup` is currently armed | Set `true` on arm; set `false` on fire (natural) or on any Monitor-delivered wake (superseded — a real event is more informative than a pure delay) |

None of this is persisted to disk. The cursor was already in-memory-only per `auto.md` step 5 (line 83); the new fields inherit that.

## Ledger vocabulary additions

Two new dispatch rows in the `## Ledger § Action + outcome vocabulary` table. Format is the existing `<issue-ref> · <transition-class> · <action> · <outcome>` shape.

| Dispatch row | `<transition-class>` | `<action>` | `<outcome>` (examples) |
|---|---|---|---|
| Watch lifecycle — arm-up | `watch-lifecycle` | `spawn` | `armed`, `spawn failed: <description>` |
| Watch lifecycle — re-spawn | `watch-lifecycle` | `watch-respawn` | `attempt=<n> backoff=<b>s exit=<code>`, `attempt=<n> backoff=<b>s spawned`, `attempt=<n> backoff=<b>s spawn failed: <description>` |
| Heartbeat fire | `heartbeat` | `schedule-wakeup` | `armed (5m)`, `fired · drain complete (<M> events)`, `fired · drain empty` |

The `<issue-ref>` slot carries the `<epic-ref>` for all three rows (the watch and heartbeat are epic-scoped, not per-issue). Under `invocationForm: tracking-existing | tracking-new` the tracking ref is used instead of an epic ref — following the same pattern the ledger header line already carries.

## Pre-flight error class (existing category, new instance)

A new fail-loud sentinel under the existing "print + exit" pattern:

| Sentinel | Trigger | Print message | Ledger line | Exit code |
|---|---|---|---|---|
| `monitor-tool-missing` | Harness `Monitor` tool is absent from the session's tool binding at step 1's pre-flight | `Monitor tool is required for /cockpit:auto but is not available in this harness. Upgrade Claude Code, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.` | *not written* — the ledger file has not been created yet at step 1's `Monitor` check | non-zero |

Contrast with the existing `cockpit-mcp-tools-missing` sentinel (fires at step 3, after the ledger file exists — so it writes a ledger line before exiting). The `monitor-tool-missing` fail happens earlier in step 1, before the ledger directory is created; therefore it does NOT write a ledger line, only prints and exits. This ordering is deliberate: pre-flight refuses to touch the filesystem for a run that can never succeed.

## Interface: harness `Monitor` and `ScheduleWakeup` tools (unchanged; documented for reference)

These are Claude Code harness tools consumed by this feature. Not part of this repo; documented here so tasks can reference the exact call shapes.

### `Monitor.spawn(command, ...)` — background sensor

- **Input**: shell command to run in the background (`generacy cockpit watch <epic-ref>`).
- **Output** (per line of child stdout): a wake-up event that re-invokes the model with the line's content as context. Idle cost is zero — no model turns while the child is quiet.
- **Exit semantics**: when the child exits, one final wake-up event carries the exit code. The parent uses this to trigger the re-spawn branch.

### `ScheduleWakeup({delaySeconds, prompt, reason})` — pure-delay wake-up

- **Input**: `delaySeconds` (clamped to [60, 3600]), `prompt` (the input the harness will feed the model on wake), `reason` (short user-facing string, telemetry).
- **Output**: no immediate output. The harness re-invokes the model with `prompt` after `delaySeconds` elapse. Zero token cost until fire.
- **Semantics**: If the model is re-invoked for any other reason before the delay elapses (e.g., a Monitor-delivered wake), the scheduled wake-up remains armed but the loop re-arms fresh with a new 5-minute window. The stale one either fires harmlessly (produces one extra drain that will show zero events) or is superseded per harness semantics — either way, no correctness impact.

## Relationships

- The in-memory `monitorHandle` is 1:1 with a live `generacy cockpit watch` subprocess.
- The `heartbeatScheduledWakeupArmed` boolean is 1:1 with at most one outstanding `ScheduleWakeup` timer.
- New ledger rows (`watch-lifecycle`, `heartbeat`) live alongside the existing cursor-recovery rows in the same `.ledger` file; grepping by `<action>` remains reliable.

## Validation rules

- The `Monitor` presence check MUST run before any state-changing call — verified by ordering it at the very top of step 1's pre-flight, above `command -v generacy` (which is also currently the first check).
- The heartbeat interval is fixed at 5 minutes (300 seconds) — hardcoded in the playbook prose, not operator-configurable.
- The re-spawn backoff sequence is fixed at `1s → 2s → 4s → 8s → 16s → 32s → 64s → 128s → 256s → 300s (cap)` — hardcoded.
- Backoff counters reset only on watch-health signal (Monitor-delivered wake with ≥1 dispatched event), not on any successful `cockpit_await_events` return. A drain that returns zero events after a heartbeat fire is not a health signal — the watch never woke.
