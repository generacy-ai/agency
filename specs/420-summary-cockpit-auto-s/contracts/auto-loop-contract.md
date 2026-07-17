# Contract: `/cockpit:auto` main-loop interface (post-#420)

Behavioural contract for the parts of `packages/claude-plugin-cockpit/commands/auto.md` that this feature edits. This is not a machine schema — the playbook is prose the model executes — but the contract points are what `tasks.md` and any reviewer will grade against.

## C1 — Pre-flight `Monitor` check

**Where**: Step 1 of `## Instructions`, before `command -v generacy`.

**Behaviour**:
- The playbook prose MUST include a step directing the model to check whether the harness `Monitor` tool is present in the current session's tool binding.
- On absence: print the message named in `data-model.md § Pre-flight error class` verbatim, exit non-zero. Do NOT create the ledger directory. Do NOT write a ledger line.
- On presence: fall through to the existing `command -v generacy` check.

**Non-goals**:
- Detecting *whether the harness will call `Monitor.spawn` successfully at step 2* — the check is presence-only. Actual spawn failure is handled by the step 5 re-spawn branch.
- Distinguishing between "Monitor absent" and "Monitor present but broken" — both surface as spawn failure at step 2 and route to re-spawn.

## C2 — Step 2 sensor arm-up

**Where**: Step 2 of `## Instructions`, replacing the current "No background watcher to spawn" paragraph.

**Behaviour**:
- The playbook prose MUST direct the model to spawn `generacy cockpit watch <epic-ref>` under harness `Monitor` at loop start.
- Under epic-less invocation forms (`--tracking`, `--new`), the ref passed to the watch subprocess is the tracking ref (matching the ledger header line's `Tracking ref:` field).
- Write the arm-up ledger line: `<ref> · watch-lifecycle · spawn · armed` (or `spawn failed: <description>` on immediate failure).
- On immediate spawn failure, transition to the step 5 re-spawn branch with `attempt=1 backoff=1s`.

**Non-goals**:
- Filtering or parsing the watch NDJSON content. Lines are doorbells only.
- Coordinating multiple watch subprocesses. One epic per auto invocation.

## C3 — Main-loop drain shape (step 4)

**Where**: Step 4 of `## Instructions`.

**Behaviour**:
- The playbook prose MUST specify that each `cockpit_await_events` call use `maxWaitMs=<smallest-currently-accepted>` (documented as `1`) and `coalesceWindowMs=3000`, with `maxBatchSize=256` unchanged.
- The main-loop iteration model is wake-driven: the model responds to a Monitor-delivered wake (or to a ScheduleWakeup heartbeat fire) by draining events, THEN falls through to arm the next heartbeat and wait.
- Consumption of the returned batch is unchanged (per-event dispatch in stream order, per step 4a–4d).
- The `initial: true` handling and D.10 semantics are unchanged.

**Non-goals**:
- Adding a client-side debounce or batch coalescer beyond what `coalesceWindowMs` already provides.
- Changing cursor semantics, batch ordering, or dispatch classification.

## C4 — Heartbeat lifecycle

**Where**: New paragraph in step 4 (after the drain-shape paragraph).

**Behaviour**:
- After each drain, the playbook prose MUST direct the model to arm a `ScheduleWakeup(delaySeconds=300, prompt=<verbatim /cockpit:auto invocation>, reason="cockpit-auto heartbeat while Monitor silent")` if no heartbeat is currently outstanding, then wait for the next wake signal.
- On heartbeat fire: drain events per C3, write ledger `<ref> · heartbeat · schedule-wakeup · fired · drain <empty|complete (<M> events)>`, re-arm.
- On Monitor-delivered wake: heartbeat is superseded (either fires harmlessly with zero events or is dropped by harness semantics). The next arm cycle happens after the wake's drain.

**Non-goals**:
- Coordinating multiple outstanding heartbeats. One at a time.
- Adjusting the 5-minute interval based on epic activity. Fixed.

## C5 — Watch-process re-spawn (step 5)

**Where**: New "Watch re-spawn" subsection added to step 5, or a new step depending on the author's preferred flow. Adjacent to cursor recovery, since both are lifecycle-recovery branches.

**Behaviour**:
- On Monitor-reported exit of the watch subprocess:
  - Print `[watch] Monitor reported exit · code=<c> · backoff=<b>s` to the transcript.
  - Write ledger `<ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s exit=<code>`.
  - Wait `<b>` seconds via `Bash sleep` (when `<b>` ≤ 60) or `ScheduleWakeup` (when `<b>` > 60), then attempt `Monitor.spawn("generacy cockpit watch <ref>")` again.
  - On spawn success: ledger `<ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawned`, continue main loop.
  - On spawn failure: ledger `<ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawn failed: <description>`, double the backoff (cap 300), retry.
- Backoff schedule: `1, 2, 4, 8, 16, 32, 64, 128, 256, 300, 300, 300, ...` (double until 300, then hold).
- Reset on watch-health: any Monitor-delivered wake that produces at least one dispatched event resets `attemptCounter` to 0 and `backoffSec` to 1.

**Non-goals**:
- Hard retry cap. Retries are unbounded.
- Fallback to long-poll after N failures. Not offered.
- Distinguishing transient vs. permanent watch failures. Both walk the same backoff.

## C6 — Docs updates in `auto.md`

**Where**: Multiple sections in `auto.md`.

**Behaviour**:
- The tagline (line 2 `description:`) needs to be updated — it currently says "long-polling cockpit_await_events", which becomes false. Suggested: "Drive an epic (or a tracking issue) to terminal by dispatching Monitor-delivered wake-ups through cockpit_await_events with fused human gates".
- The loop-shape one-liner in the opening paragraph (`long-poll → dispatch → ledger → advance`) needs to be updated to reflect the wake-driven shape.
- The `## Ledger § What does NOT count` bullet ("watch re-arms (spawning `cockpit watch` again after it dies)") needs to be removed — re-spawn events DO ledger now per C5.
- The `## Ledger § Action + outcome vocabulary` table needs the three new rows named in `data-model.md § Ledger vocabulary additions`.
- The `## Invariants` section can stay unchanged. #7's "Stream consumption is unfiltered" is preserved by construction — the NDJSON is used only as a doorbell, never parsed.
- The `## Examples` section — Example 1 (end-to-end run) will show one extra pair of ledger lines (arm-up and one heartbeat fire). Optional; adds concrete flavour but doesn't gate the feature.

**Non-goals**:
- Rewriting any of the D.1–D.11 dispatch subsections. All dispatch behaviour is preserved.
- Rewriting any of the G.1–G.7 gate contracts. All gate behaviour is preserved.

## C7 — Observable event stream to other cockpit skills

**Where**: Not in `auto.md` — this is a promise about what the change does NOT do.

**Behaviour**:
- The NDJSON emission from `generacy cockpit watch` is unchanged. Other consumers (`/cockpit:watch`, external scripts) see identical output.
- The typed-batch shape returned by `cockpit_await_events` is unchanged. No new fields, no new event types.
- No changes to any label-writing behaviour (`cockpit_advance`, `cockpit_queue`, `cockpit_resume`, `cockpit_merge`) — the sensor is a wake source, not an actor.

## Verification checklist

Each contract point maps to spec acceptance criteria and success criteria:

| Contract | Spec FR | Spec SC |
|---|---|---|
| C1 (Monitor pre-flight) | FR-006 | SC-006 |
| C2 (sensor arm-up) | FR-001 | SC-004 |
| C3 (drain shape) | FR-002, FR-003, FR-007 | SC-001, SC-002 |
| C4 (heartbeat) | FR-004 | SC-005 |
| C5 (re-spawn) | FR-005 | SC-005 |
| C6 (docs updates) | FR-008 | — |
| C7 (external contract) | FR-009 | SC-004 |
