# Data Model: Retire the second poll loop in `/cockpit:auto`

This feature ships **no new persistent schema**. It **retires** a subset of the in-memory loop bookkeeping and ledger vocabulary introduced by #420, and adds one pre-flight error sentinel. The three sections below list retirements, additions, and unchanged surfaces so `tasks.md` can reference them.

## In-memory loop state (delta from #420)

State that the parent loop must carry across iterations, with delta-vs-#420 annotations. The pre-#420 cursor + per-class cursor-recovery counters + the `heartbeatScheduledWakeupArmed` boolean are unchanged.

| Field | Type | Purpose | Status (this PR) |
|---|---|---|---|
| `monitorHandle` | opaque (harness token from `Monitor.spawn(...)`) | Reference to the running doorbell sensor process (was `generacy cockpit watch`, now `generacy cockpit doorbell`) | **Retained** — the parent still spawns the sensor under `Monitor` and holds the handle; only the spawned verb changes |
| `heartbeatScheduledWakeupArmed` | boolean | Whether a 5-minute `ScheduleWakeup` is currently armed | **Retained** — unchanged from #420 (heartbeat is the sole recovery signal per Q3=A) |
| `watchRespawnBackoffSec` | number (1 → 2 → 4 → … cap 300) | Backoff delay for the next re-spawn attempt | **Retired** — the C5 re-spawn state machine is removed (Q3=A); the doorbell surface owns transport resilience engine-side |
| `watchRespawnAttemptCounter` | number (monotone) | Attempt number for user-visible + ledger accounting | **Retired** — no C5 producer left on the skill side |

The retirement of `watchRespawnBackoffSec` and `watchRespawnAttemptCounter` deletes the "watch-health signal" reset condition (previously: any Monitor-delivered wake whose drain dispatched at least one event reset both counters to 1/0 respectively). The reset language is removed from step 4 (C3 iteration) and step 5 (C5 block deletion).

None of this state is persisted to disk. The cursor was already in-memory-only per `auto.md` step 5 (line 130); the retained fields inherit that.

## Retired ledger vocabulary

Three rows in `auto.md § Ledger § Action + outcome vocabulary` are struck. Format matches the existing `<issue-ref> · <transition-class> · <action> · <outcome>` shape.

| Retired row | `<transition-class>` | `<action>` | `<outcome>` (examples) | Reason |
|---|---|---|---|---|
| Watch lifecycle — arm-up | `watch-lifecycle` | `spawn` | `armed`, `spawn failed: <description>` | The doorbell subprocess spawn produces no skill-side ledger line — the sensor is arm-and-forget (Q3=A). Engine-side doorbell arm/re-arm accounting, if any, surfaces through `cockpit_await_events` as an ordinary event, not a skill-side ledger row |
| Watch lifecycle — re-spawn | `watch-lifecycle` | `watch-respawn` | `attempt=<n> backoff=<b>s exit=<code>`, `attempt=<n> backoff=<b>s spawned`, `attempt=<n> backoff=<b>s spawn failed: <description>` | C5 re-spawn state machine retired (Q3=A) |
| (Surrounding prose above the cluster: `The <issue-ref> slot of the three rows above carries the <epic-ref>…`) | — | — | — | Prose is deleted with the rows |

Retained rows (unchanged): the **heartbeat** dispatch row (`heartbeat · schedule-wakeup · fired · drain empty | drain complete (<M> events)`) survives — the heartbeat is #420 FR-004 territory (Q3=A explicitly keeps it as the sole recovery signal).

**Ledger `What does NOT count` bullet update**: the post-#420 note ("watch re-spawns DO ledger — the `watch-lifecycle · watch-respawn` rows are mandatory per-attempt per FR-005; pre-#420 auto.md excluded re-arms from ledger accounting") reverts to pre-#420 wording: "re-arms and doorbell arm-ups are not dispatches" (matching #420's pre-existing "re-arms are idempotent" language style).

**§ Ledger example lines**: any example run that shows a `watch-lifecycle · spawn · armed` or `watch-lifecycle · watch-respawn · …` ledger line drops that line from the example. In `auto.md § Examples` (Example 1, step 1: "Sensor arm-up — step 2 spawns `generacy cockpit watch christrudelpw/epic#42` under harness `Monitor`. Ledger: `christrudelpw/epic#42 · watch-lifecycle · spawn · armed`."), the ledger line is deleted and the sentence updates to "step 2 spawns `generacy cockpit doorbell christrudelpw/epic#42` under harness `Monitor` (no ledger line — sensor arm-up is engine-owned)." Same treatment applied to any other example touching the retired rows.

## Pre-flight error class (new sentinel)

A new fail-loud sentinel under the existing "print + exit" pattern (mirrors the shape of `monitor-tool-missing` at `auto.md:37` and `cockpit-mcp-tools-missing` at `auto.md:60–62`).

| Sentinel | Trigger | Print message | Ledger line | Exit code |
|---|---|---|---|---|
| `engine-doorbell-missing` | `generacy cockpit doorbell --help` returns non-zero at step 1's pre-flight (after `Monitor` presence check and `command -v generacy` both pass) | `Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#970). Upgrade the cluster's generacy build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.` | *not written* — the ledger file has not been created yet at step 1's doorbell probe (identical to `monitor-tool-missing` ordering: pre-flight refuses to touch the filesystem for a run that can never succeed) | non-zero |

Contrast with `cockpit-mcp-tools-missing` (fires at step 3, after the ledger file exists — so it writes a ledger line before exiting). `engine-doorbell-missing` fires earlier in step 1, before the ledger directory is created; therefore it does NOT write a ledger line, only prints and exits. This ordering is deliberate: pre-flight refuses to touch the filesystem for a run that can never succeed.

**Probe implementation**: the probe is a single Bash invocation, exit-code-only. Equivalent shell:

```bash
generacy cockpit doorbell --help >/dev/null 2>&1
```

Exit 0 = surface present; exit non-zero = surface missing (whether the CLI itself is absent, or the subcommand isn't registered, or `--help` errors for any reason). The playbook does not need to distinguish causes — the actionable error names the fix regardless (upgrade the engine).

## Interface: `generacy cockpit doorbell <epic-ref>` CLI (engine-owned; documented for reference)

This is the new CLI surface consumed by this feature. Not part of this repo; documented here so tasks can reference the exact call shape. **Owned and built by generacy#970.**

### Positional

- **`<epic-ref>`**: identifier of the ref to watch — `<owner>/<repo>#<n>`. Under `invocationForm: tracking-existing | tracking-new`, this positional carries the tracking ref (matching the ledger header line's `Tracking ref:` field), same treatment as the retired `generacy cockpit watch` positional.

### Emission contract

- **stdout**: one line per real state transition on the ref. Content is opaque to `/cockpit:auto` — the parent treats each non-empty stdout line as a doorbell only (never parses fields). Preserves § Invariants #7 verbatim.
- **stderr**: reserved for the engine's operational logging (surfaced by Monitor as part of the child's output; not consumed by the parent).
- **Exit semantics**: when the child exits, one final Monitor wake-up event carries the exit code. **Post-#431**, the parent does NOT re-spawn on exit — the exit is treated as "sensor stopped emitting; heartbeat will detect via a subsequent empty-drain window" per Q3=A. The `monitorHandle` is discarded on exit; a fresh handle is only bound if the entire loop is re-entered (fresh invocation, or a subsequent `/cockpit:auto` invocation).

### Internal shape (out of scope for this repo; documented for context)

Per generacy#970: `generacy cockpit doorbell <epic-ref>` attaches to the shared event-bus poll loop that `cockpit_await_events` drains. It does NOT run an independent `runOnePoll` + `resolveEpic` cycle; the doorbell subprocess emits stdout lines when the shared loop signals a transition. This is the load-bearing behavior — the whole reason for the swap is that the doorbell subprocess adds zero background GraphQL cost beyond what `cockpit_await_events`'s server-side poll loop already pays.

### Interface: harness `Monitor` and `ScheduleWakeup` (unchanged; #420 documented)

Both harness tools continue to have the exact semantics `data-model.md` in `specs/420-summary-cockpit-auto-s/` describes. `Monitor.spawn(command, ...)` is called with `generacy cockpit doorbell <epic-ref>` in place of `generacy cockpit watch <epic-ref>`; every other call shape and semantic is identical.

## Retained invariants (called out for tasks.md reference)

- **§ Invariants #7 — Stream consumption is unfiltered**: the doorbell stdout line is a doorbell only; no field-based filter over the stream. Q1 anchor.
- **§ Invariants #8 — Ledger-only rows are cheap by contract**: D.9/D.9a/D.9b/D.9c/D.9d skip the per-event `cockpit_status(json=true)` re-check entirely. This PR restates the invariant unchanged (Q4 anchor); no expansion.
- **§ Invariants #9 — MCP-tool-only invariant**: `MIGRATED_VERBS = ["status", "context", "queue", "advance", "resume", "merge"]` — unchanged. `doorbell` is a NEW verb outside that set (like `watch`), so §9's whitelist is untouched. The playbook-verification test's `406-2` pin ("migrated playbooks have zero `generacy cockpit <migrated-verb>` invocations") continues to hold because `doorbell` is not in `MIGRATED_VERBS`.

## Relationships

- The retained `monitorHandle` is 1:1 with a live `generacy cockpit doorbell` subprocess (was `generacy cockpit watch` pre-#431).
- The `heartbeatScheduledWakeupArmed` boolean is 1:1 with at most one outstanding `ScheduleWakeup` timer (unchanged).
- The retired `watchRespawnBackoffSec` and `watchRespawnAttemptCounter` fields are dropped; no successor state is introduced (Q3=A).
- Retired ledger rows (`watch-lifecycle` cluster) leave no successor rows; the heartbeat row remains as the sole engine-transport observability surface on the skill side.

## Validation rules

- The `Monitor` presence check MUST run before any state-changing call (unchanged from #420 FR-006).
- The `generacy cockpit doorbell --help` probe MUST run AFTER `command -v generacy` and BEFORE `gh auth status` in step 1's pre-flight sequence (new — Decision 2). Missing surface produces the `engine-doorbell-missing` sentinel and hard-exits without creating the ledger file.
- The heartbeat interval remains fixed at 5 minutes (300 seconds), hardcoded (unchanged from #420 Q1=A).
- **No backoff sequence exists post-#431** — the retired `1s → 2s → 4s → 8s → 16s → 32s → 64s → 128s → 256s → 300s (cap)` schedule is deleted with the C5 block. Any future doorbell-transport backoff lives engine-side.
- The doorbell subprocess's Monitor exit is a no-op on the skill side (per Q3=A). The next `ScheduleWakeup` fire will detect via an empty drain window (if the doorbell surface stays down) or a real event drain (if the engine restored signal in the interim).
