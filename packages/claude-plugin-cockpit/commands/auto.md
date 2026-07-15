---
description: Drive an epic (or a tracking issue) to terminal by dispatching Monitor-delivered wake-ups through cockpit_await_events with fused human gates
arguments:
  - name: tracking-ref
    description: "Tracking reference — one of: <epic-ref> positional (`owner/repo#N`), `--tracking <issue-ref>`, or `--new \"<title>\"`. Exactly one form per invocation."
    required: true
---

# Auto Command

Drive the named tracking ref (an epic, an existing tracking issue, or a newly filed tracking issue) to terminal state by dispatching Monitor-delivered wake-ups through `cockpit_await_events` and routing to the six existing assist commands' *actions* (MCP tool calls + subagent hops), never the assist commands themselves. The loop shape is: **pre-flight (incl. `Monitor` presence check) → arm `generacy cockpit watch <epic-ref>` under harness `Monitor` (sensor) → startup sweep (tool-presence check + synthetic-event dispatch) → per wake (Monitor line OR ScheduleWakeup heartbeat fire): drain typed batch via `cockpit_await_events(epic|issue, cursor, maxWaitMs=1, coalesceWindowMs=3000)` → consume batch in stream order → per event: re-check live state → dispatch → write one ledger line → advance in-memory cursor → arm next heartbeat → wait for next wake → exit on terminal state (`epic-complete` in epic mode, G.7 scope-drained `Finish` in epic-less mode).** Two hard boundaries are load-bearing: **never merge on red** (validate + green is mechanical; anything red routes through the bounded-fixer branch and, if still red, an escalation gate) and **every gate prompts** (per-gate auto-approve / "full auto" is explicitly out of scope). Analysis lives in subagents (`subagent_type: "general-purpose"`) whose contracts return strict JSON per hop; the parent loop stays thin.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments + pre-flight.** Recognize exactly one of three invocation forms per invocation — the tracking ref is the run's identity under all three forms (see `contracts/invocation-forms.md`):

   - **Form 1 (epic mode)**: `/cockpit:auto <epic-ref>` — one positional matching `<owner>/<repo>#<n>`. `invocationForm: epic`. D.8 phase-queue gate fires on `phase-complete`; run exits on `epic-complete`.
   - **Form 2 (epic-less: existing tracking)**: `/cockpit:auto --tracking <issue-ref>` — `--tracking` flag with one positional matching `<owner>/<repo>#<n>`. `invocationForm: tracking-existing`. G.7 scope-drained gate fires when every task-list ref is terminal per `cockpit_status`.
   - **Form 3 (epic-less: new tracking)**: `/cockpit:auto --new "<title>"` — `--new` flag with one quoted free-text title. `invocationForm: tracking-new`. **G.6 filing gate fires immediately** (drafts title/body from the operator-supplied `<title>` — same drafter shape as a mid-run file-new intent — presents G.6; on `Approve & file`, `gh issue create` produces the tracking ref; on `Skip (don't file)`, the run exits cleanly). Subsequent behavior identical to Form 2.

   On ambiguous input (e.g., both `--tracking` and `--new`, or neither flag with a non-parseable positional), print `Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>"` and exit non-zero.

   **Print startup line** naming the tracking ref (verbatim `owner/repo#n`) and the resolved `invocationForm`; under Form 3, the startup line prints after G.6 approval, once the new tracking ref exists.

   Pre-flight: **first**, check whether the harness `Monitor` tool is bound in the current session's tool binding. If `Monitor` is absent, print verbatim:

   ```
   Monitor tool is required for /cockpit:auto but is not available in this harness. Upgrade Claude Code, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
   ```

   Then exit non-zero. Do **NOT** create the ledger directory. Do **NOT** write a ledger line — the ledger file has not been created yet at this step, and pre-flight refuses to touch the filesystem for a run that can never succeed. The check is presence-only; do not attempt to distinguish "absent" from "present-but-broken" — an actually-broken `Monitor` surfaces as a spawn failure at step 2 and routes to the C5 re-spawn branch. This `Monitor`-presence check MUST run before every other pre-flight check (before `command -v generacy`, before ledger-directory creation, before any state-changing tool call). Maps to FR-006 / SC-006.

   On presence, fall through: `command -v generacy` (on failure → **Error handling** class `MISSING_BINARY`); `gh auth status` (on failure → **Error handling** class `AUTH_FAILURE`); confirm the operator's cwd is a writable git repo; create the ledger directory with `mkdir -p .generacy/cockpit/auto-runs` (on failure → **Error handling** class `OTHER`). Compute the run's ledger filename: `.generacy/cockpit/auto-runs/<tracking-ref-slug>-<timestamp>.ledger`, where `<tracking-ref-slug>` is the tracking reference with `/` replaced by `-` and `#` stripped, and `<timestamp>` is `YYYYMMDD-HHMMSS` in the operator's local time captured now.

   **Ledger header line** — the FIRST line of the ledger file, written above the dispatch stream: `Tracking ref: <tracking-ref> · form: <invocationForm>`. Under Forms 1 and 2 the header is written at step 1 (before the startup sweep). Under Form 3 the header is written after G.6 approval; if G.6 was skipped at the initial fire, the header carries `form: tracking-new (abandoned before creation)` and the run exits.

2. **Arm the background sensor under harness `Monitor`.** Spawn `generacy cockpit watch <epic-ref>` under the harness `Monitor` tool at loop start. The verb's positional is named `<epic-ref>` (matching `generacy cockpit watch --help`), but it takes the epic ref under `invocationForm: epic` or the tracking ref under `--tracking` / `--new` (matching the ledger header line's `Tracking ref:` field) — any task-list-bearing scope issue is accepted. The `Monitor.spawn(...)` call binds `monitorHandle` (see `data-model.md § In-memory loop state`) and re-invokes the model exactly when the child emits a stdout line — idle cost is zero. The NDJSON content on stdout is a **doorbell only**: the parent NEVER parses lines for content. `cockpit_await_events` remains the sole source of typed batches (step 4). On successful arm-up, write the ledger line:

   ```text
   <ref> · watch-lifecycle · spawn · armed
   ```

   On **immediate spawn failure** (`Monitor.spawn(...)` returns a spawn error, e.g., binary not on `$PATH`, cluster registration missing), write the ledger line:

   ```text
   <ref> · watch-lifecycle · spawn · spawn failed: <description>
   ```

   Then transition into the step 5 C5 re-spawn branch with `watchRespawnAttemptCounter = 1` and `watchRespawnBackoffSec = 1`. Do NOT abort the run — the C5 branch owns the recovery walk. The cursor is unchanged from pre-#420: the first `cockpit_await_events` call in step 4 arms the in-memory cursor from the tool server's connect-time position. Maps to FR-001, FR-009, SC-004.

3. **Startup sweep.**

   **Tool-presence check (fail-loud on missing cockpit MCP tools).** At the top of the sweep, before dispatching anything, verify that the seven `cockpit_*` MCP tools are present in the session's tool binding: `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`. If any of the seven is absent from the tool binding:
   - Append the load-bearing ledger line verbatim: `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`.
   - Print the load-bearing guidance verbatim: `cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75`.
   - Exit non-zero.

   The fail path is **ledger + print + exit only** — no operator prompt is fired. The operator can do nothing in-session about missing tool registration; a prompt whose every option means "abort" is not a decision. The correct response class for "environment doesn't support the operation" is `Print + exit`. Registration is owned by cluster-base#75 (runtime-registered per cluster); a cluster without registration hard-fails here by contract, not by bug.

   **Synthetic-event dispatch (only reached when all seven tools are present).** Call `cockpit_status(epic=<epic-ref>, json=true)` and treat every issue whose current transition class is one of D.1–D.9 (below) as a synthetic event. Dispatch each one by one (per § Dispatch and § Ledger) before entering the main loop. This handles the case where the epic already has open work when `/cockpit:auto` is invoked. The sweep ends with exactly one full status table (per § Ledger L.4 policy) and then hands off to step 4.

   Under `--tracking <issue-ref>` / `--new "<title>"` (epic-less mode), the sweep reads the task list from the tracking issue via `cockpit_status(issue=<tracking-ref>, json=true)` and treats each live-state ref as a synthetic event — structurally identical to the epic-ref sweep. This is the restart-safety mechanism: the scope survives restarts because it lives on the tracking issue, not in session state (spec § Changes item 5).

4. **Main loop (wake-driven).** Post-#420, the loop is **wake-driven**, not long-polling. The model does nothing between wakes — the harness re-invokes the loop only when a wake signal arrives:

   - **Monitor-delivered wake**: the harness re-invokes the model because `Monitor` observed a new stdout line from the `generacy cockpit watch <epic-ref>` sensor armed in step 2. The line content is a doorbell only — never parsed.
   - **`ScheduleWakeup` heartbeat fire**: the harness re-invokes the model because the belt-and-braces heartbeat (armed per C4 below) elapsed while `Monitor` was silent.

   Idle cost between wakes is **zero tokens** — no polling turn, no context re-read. This is the load-bearing property of the whole rewrite.

   **Per wake (Monitor or heartbeat), the iteration is**:

   1. **Drain** — call `cockpit_await_events(epic=<epic-ref>, cursor=<in-memory-cursor>, maxWaitMs=1, coalesceWindowMs=3000, maxBatchSize=256)` via the MCP tool binding. `maxWaitMs=1` is the smallest currently-accepted value at the tool boundary (Q2=C / FR-003) — the drain is effectively non-blocking. `coalesceWindowMs=3000` remains the sole burst-batcher (no client-side debounce is added; the MCP layer owns coalescing). The initial iteration passes `cursor=null` (cursor-less — the tool server arms from its connect-time position). Each successful return is a **batch of typed events** with a `nextCursor` field; the batch's events are already parsed by the tool server (no NDJSON stream, no per-line filtering).
   2. **Consume** — process every event in the returned batch **in stream order**. There is no content- or field-based filter over the batch; the batch's ordering IS the dispatch order. Preserving § Invariants #7's intent — no content-based filter that could silently drop legitimate events — is by construction here: the tool server owns event parsing, and the parent consumes the typed batch as-is.
   3. **Advance cursor** — after the batch is fully consumed, advance the in-memory cursor to `batch.nextCursor`.
   4. **Arm next heartbeat + wait** — fall through to step C4 (heartbeat lifecycle) to arm the next `ScheduleWakeup` and wait for the next wake signal. Do NOT re-issue `cockpit_await_events` in a tight loop — the next call happens on the next wake.

   For each event in the batch (in stream order):
   - **(a) Re-check live state** via `cockpit_status(epic=<epic-ref>, json=true)` for actionable dispatch classes (D.1–D.8, D.10, D.11). The batch event is advisory; the live return is authoritative (spec § Loop). Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip the re-check per § Invariants #8's cost contract — a batch containing only ledger-only events is one ledger append per event and zero other tool calls. If the epic's live state is `epic-complete`, go to step 6.
   - **(b) Dispatch** per § Dispatch below, branching on the *live* transition class.
   - **(c) Write one ledger line** per § Ledger (transcript print + append to the run's `.ledger` file). A dispatch without a ledger line is a protocol violation.
   - **(d) Continue** with the next event in the batch.

   **Initial-flagged events** — `issue-transition` events with `initial: true` from `cockpit_await_events`, produced by generacy#935 for connect-time snapshots and mid-run scope joins (e.g., events emitted after `cockpit_scope_add`) — dispatch through the existing table by their carried state class, the same as any other event. The step-4a re-check remains authoritative. **D.10 structurally cannot fire on an initial-flagged event because the state class is known.** No new dispatch row is added; the initial-flag is orthogonal to dispatch (Q5 anchor). Preserved verbatim from pre-#420 semantics.

   **Empty-batch handling**: A wake whose drain returns zero events is a legitimate outcome. Under a Monitor-delivered wake this indicates burst coalescing (the doorbell line's state was already consumed by an earlier drain) or a spurious wake. Under a heartbeat fire it usually indicates a genuine quiet interval (or a superseded prior heartbeat firing after a Monitor wake already drained). In either case: advance the cursor to `batch.nextCursor` (the tool server's connect-time position moved forward even without events), arm the next heartbeat per C4, and wait. Ledger-only cost accounting sees zero appends for an empty-batch wake — that is the SC-001 / SC-002 saving in action. Heartbeat-fire wakes DO write a ledger line per C4 (`heartbeat · schedule-wakeup · fired · drain empty` when the drain was empty) — heartbeat accounting is separate from per-event ledger accounting. Monitor-delivered wakes with an empty drain do NOT write a ledger line (a doorbell that produced no dispatchable event is a no-op).

   **Watch-health reset**: any Monitor-delivered wake whose drain dispatched at least one event resets the C5 re-spawn bookkeeping (`watchRespawnAttemptCounter → 0`, `watchRespawnBackoffSec → 1`). A drain that returns zero events after a heartbeat fire is NOT a health signal — the watch never woke.

   Maps to FR-002, FR-003, FR-007, SC-001, SC-002.

   **C4 — Heartbeat lifecycle (belt-and-braces recovery while `Monitor` silent)**. After each drain (Monitor-delivered wake OR heartbeat fire), if no `ScheduleWakeup` heartbeat is currently outstanding (`heartbeatScheduledWakeupArmed == false`; see `data-model.md § In-memory loop state`), arm one:

   ```text
   ScheduleWakeup(
     delaySeconds = 300,
     prompt = <verbatim /cockpit:auto invocation with the same ref and flags used at run start>,
     reason = "cockpit-auto heartbeat while Monitor silent"
   )
   ```

   Set `heartbeatScheduledWakeupArmed = true`. The 5-minute interval (Q1=A) is fixed; not operator-configurable. `delaySeconds=300` sits at the low end of the harness `[60, 3600]` clamp. Zero token cost until fire — this is the SC-005 saving.

   **On heartbeat fire**: the harness re-invokes the model with the verbatim `/cockpit:auto` prompt. Perform the C3 drain, then write the ledger line:

   ```text
   <ref> · heartbeat · schedule-wakeup · fired · drain empty
   ```

   Or, when the drain returned events:

   ```text
   <ref> · heartbeat · schedule-wakeup · fired · drain complete (<M> events)
   ```

   where `<M>` is the number of events dispatched. Set `heartbeatScheduledWakeupArmed = false` (the outstanding heartbeat fired) and re-arm a fresh one per the shape above.

   **On Monitor-delivered wake** while a heartbeat is outstanding: the outstanding heartbeat is **superseded** — no explicit cancellation is required. Harness semantics allow the stale heartbeat to fire harmlessly later (its drain returns zero events, one extra ledger line accounted as `fired · drain empty`, no correctness impact). The bookkeeping remains `heartbeatScheduledWakeupArmed = true` until either the heartbeat fires (natural) or the current drain completes and re-arms a fresh one (superseded — the newer arm cycle takes over). Do NOT attempt to cancel or reference the outstanding `ScheduleWakeup` — the harness does not expose a cancel primitive, and correctness does not require one.

   Maps to FR-004, SC-005.

5. **Cursor recovery + Watch re-spawn.** Two lifecycle-recovery branches live in step 5: cursor recovery (Branch A / Branch B, unchanged from #924 semantics) and Watch re-spawn (C5, new in #420). Both restore the loop's ability to make progress after a lifecycle event; both are idempotent by construction. **Cursor recovery** is described below; **Watch re-spawn** is described at the end of this step.

   **Cursor recovery.** There is no watch process to re-arm from the cursor's perspective — the cursor is in-memory only, held for the lifetime of the current dispatch loop. Each cursor-error signal returned from `cockpit_await_events` is classified per the post-#924 hardened taxonomy and routed onto one of two branches. The parent maintains a **per-class consecutive-fault counter** — one counter each for `invalid-cursor`, `resetFrom`, `expiry`, `discarded`. Every counter resets to 0 on any **successful cursor reuse**: any `cockpit_await_events` call presenting a non-null cursor and returning no cursor-error signal (empty batches included — an accepted cursor returning zero events is the cursor mechanism working perfectly on a quiet epic). All counters reset together; the `streakOperatorAcknowledged` flag (see Branch B) resets to `false` on the same event.

   **Branch A — recover (unchanged semantics; per-class ledger accounting only):**
   - `resetFrom` reset signal in the returned batch — the tool server signaled a reset in the batch metadata (e.g., server-side event-log rotation). Increment `resetFrom` counter; recover; ledger `<epic-ref> · cursor-recovery · resetFrom · <resetFrom-counter>`.
   - Cursor expiry typed error — the cursor is past the server's retention window. Increment `expiry` counter; recover; ledger `<epic-ref> · cursor-recovery · expiry · <expiry-counter>`.
   - `discarded` signal — post-#924 hardened taxonomy for server restart / eviction. Increment `discarded` counter; recover; ledger `<epic-ref> · cursor-recovery · discarded · <discarded-counter>`.

   None of Branch A's classes ever fires the escalation gate. Their counters are ledger accounting only — the run summary § L.6 identifies reset-churn / expiry-churn / discarded-churn for future finding investigations, but no runtime escalation is triggered from these classes.

   **Branch B — recover once, then escalate on consecutive fault:**
   - `invalid-cursor` typed error — the cursor the parent passed is malformed / never-issued / wrong-epic (post-#924, a reliable caller-bug signal; the class also covers server-restart artifacts that present as `invalid-cursor` before the recovery sweep). Log the typed error's `code`/`message`/`details` verbatim; increment `invalid-cursor` counter; ledger `<epic-ref> · cursor-recovery · invalid-cursor · <invalid-cursor-counter>` (e.g., first consecutive fault writes `cursor-recovery · invalid-cursor · 1`).
     - If counter == 1 → recover (sweep + re-arm cursor-less); continue the loop.
     - If counter ≥ 2 AND the current streak is **not** operator-acknowledged → fire the **G.4(e) escalation gate** (see § Gate contract G.4(e)). The gate's options are `Continue degraded (sweep-per-batch) (Recommended)` and `Stop (exit auto)`.
     - If counter ≥ 2 AND the current streak IS operator-acknowledged (a prior `Continue degraded` on this unhealed streak) → recover; do **not** re-fire the gate (decide-once for the streak that raised it; per Q4=A of the #408 clarifications). The counter continues to increment for ledger accounting.

   All recoveries — Branch A and Branch B alike — converge on the same recovery path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.** Both the sweep (per § Ledger L.5 idempotency rule) and the re-arm are idempotent — the live-state re-check in step 4a catches events already dispatched (state moved on), so no duplicate action can result. **The cursor is in-memory only** — session restart, `invalid-cursor`, `resetFrom`, cursor expiry, and `discarded` all converge on this same recovery path, and no filesystem persistence of the cursor exists (no on-disk cursor file, no ledger re-derivation).

   Q2=A reset semantics (verbatim): any successful cursor reuse resets **ALL** counters to 0 and clears `streakOperatorAcknowledged`. A fresh 2-in-a-row `invalid-cursor` streak after a healed period is a **new** escalation decision — the gate re-fires at count == 2 again (per Q4=A).

   The compound-liveness cross-check (N=4 empty reads + actionable live state) retires with this step. The `maxWaitMs=1` at the tool boundary makes each drain effectively non-blocking; the "no events" case now surfaces as a Monitor-silent interval bounded by the C4 heartbeat, and the tool server owns the "silent stall" detection (a stalled server returns a typed error or fails the tool call, both of which the recovery branches above handle).

   **Watch re-spawn (C5).** On any Monitor-reported exit of the `generacy cockpit watch <epic-ref>` subprocess armed in step 2 (or after a step-2 immediate spawn failure that routed here with `attempt=1 backoff=1s`):

   1. Print the following line verbatim to the transcript (user-visible surface — FR-005):

      ```text
      [watch] Monitor reported exit · code=<c> · backoff=<b>s
      ```

      where `<c>` is the Monitor-reported exit code (or `spawn-failed` on a step-2 immediate spawn failure) and `<b>` is the current `watchRespawnBackoffSec`.

   2. Write the ledger line:

      ```text
      <ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s exit=<code>
      ```

      where `<n>` is `watchRespawnAttemptCounter`, `<b>` is `watchRespawnBackoffSec`, and `<code>` is the exit code (or `spawn-failed`).

   3. Wait `<b>` seconds. When `<b> ≤ 60`, use `Bash sleep <b>` (fits inside a single turn). When `<b> > 60`, use `ScheduleWakeup(delaySeconds=<b>, prompt=<verbatim /cockpit:auto invocation>, reason="cockpit-auto watch re-spawn backoff")` (the wait shouldn't burn a turn's context at longer backoffs — the harness re-invokes the loop when the delay elapses).

   4. Attempt `Monitor.spawn("generacy cockpit watch <epic-ref>")` again.

      - **On spawn success**: write the ledger line

        ```text
        <ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawned
        ```

        Continue the main loop (fall back through to step 4's wake-driven iteration). The updated `monitorHandle` binds to the new subprocess. **Do NOT reset the backoff/attempt counters here** — reset happens only on watch-*health* (per below), not on watch-*re-arm*. A watch that spawns but immediately dies again should walk the same backoff sequence forward.

      - **On spawn failure**: write the ledger line

        ```text
        <ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s spawn failed: <description>
        ```

        Increment `watchRespawnAttemptCounter`, double `watchRespawnBackoffSec` (`b ← min(2b, 300)`), and retry from step 1. **No hard retry cap; retries are unbounded.** No fallback to long-poll mode (Q3=A).

   **Backoff schedule** (fixed, hardcoded in the playbook):

   ```text
   1s → 2s → 4s → 8s → 16s → 32s → 64s → 128s → 256s → 300s (hold)
   ```

   The ceiling at 300s ties the pathological case (persistently-dead watch) to exactly one heartbeat's cost — the C4 heartbeat already accepts that cadence, so a dead watch degrades to *exactly* heartbeat cost, not a multiple of it (Q4=A).

   **Reset rule (watch-health signal)**: any Monitor-delivered wake whose drain (per C3 step 4.i) dispatched at least one event resets both counters:

   ```text
   watchRespawnAttemptCounter ← 0
   watchRespawnBackoffSec     ← 1
   ```

   A drain that returns zero events after a heartbeat fire is NOT a health signal — the watch never woke. A Monitor-delivered wake with an empty drain is also NOT a health signal (the doorbell fired but produced no dispatchable event; the watch is technically alive but not yet demonstrated healthy). Only a real event dispatched from a Monitor-delivered drain proves the watch is producing signal end-to-end.

   Maps to FR-005, SC-005.

6. **Exit.** On `epic-complete`, print the run summary per § Ledger L.6 (including the absolute path of the run's `.ledger` file), and exit zero. Non-`epic-complete` exits (Stop from an escalation gate, unrecoverable error) print an abbreviated summary with the exit reason.

## Dispatch

The following nine event classes are dispatched per this table. The parent **always** re-checks live state on every event (step 4a) — streamed lines are advisory (spec § Loop trust boundary). The re-check is mandatory for every *actionable* dispatch class (D.1–D.8, D.10, D.11); ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip the re-check entirely per § Invariants #8's cost contract. Each dispatch is composed of **CLI verb + optional subagent + optional gate**; no dispatch invokes a `/cockpit:*` slash command (invariant §4).

| # | Event | Action shape |
|---|-------|--------------|
| D.1 | `waiting-for:clarification` | Clarification drafter subagent → single batched-gate `AskUserQuestion` (three options) → post + `cockpit advance` |
| D.2 | `waiting-for:<artifact>-review` | Review-verdict analyzer subagent → fused verdict gate → `cockpit advance` OR `COMMENT` review |
| D.3 | `waiting-for:implementation-review` | Same as D.2 (uses #390 contract for PR-scope analyzer) |
| D.4 | `waiting-for:manual-validation` | Manual-validation summarizer subagent → confirm gate → `cockpit advance` |
| D.5 | `completed:validate` + green | `cockpit merge` (no gate — human verdict was implementation-review) |
| D.6 | `completed:validate` + red / merge red | Bounded fixer subagent (once) → still red → escalation gate (Retry / Skip / Stop) |
| D.7 | `agent:error` / `failed:*` | Fetch evidence → escalation gate (Requeue / Skip / Stop) |
| D.8 | `phase-complete` | Phase-queue confirmation gate → `cockpit queue --yes` |
| D.9 | `waiting-for:address-pr-feedback` | Ledger line only (server-side owns it) |
| D.9a | `waiting-for:pr-feedback` | Ledger line only (legacy alias) |
| D.9b | `waiting-for:children-complete` | Ledger line only (epic-container state) |
| D.9c | `waiting-for:dependencies` | Ledger line only (engine-owned cross-issue wait) |
| D.9d | `phase:*` (prefix-match) | Ledger line only (engine-owned phase transition) |
| D.11 | `waiting-for:merge-conflicts` **or** `blocked:stuck-merge-conflicts` (labels co-occur when the engine escalates; deduplicated per-issue for one incident) | Escalation gate (`I've resolved it` / `Skip` / `Stop`) |
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |

### D.1 — `waiting-for:clarification`

**Trigger**: An issue enters `waiting-for:clarification` (open clarification questions posted, awaiting operator-authored answers). Verbatim event string: `waiting-for:clarification`.

**Dispatch**:
1. **Fetch context**: `cockpit_context(issue=<issue-ref>)` (the same MCP tool `/cockpit:clarify` uses). The return payload's `clarificationComment.body` field carries the engine-authored batch-comment template (raw). Parse it into per-question `{title, context, question, options}` per the shared batch-comment rule (`### Q<n>: <title>` headers + `**Context**:` / `**Question**:` / `**Options**:` labels; option bullets tolerant of `A:` and `A)` styles; free-form questions with no `**Options**:` label yield `options: null`).
2. **Spawn clarification drafter subagent** (see § Gate contract G.1 and the SB.1 return schema below). Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Draft clarifications <issue-ref>"
   prompt: <inlined open-question list + spec/plan bodies + touched-files context + return-schema directive>
   ```
   The subagent MUST NOT invoke any slash command. It returns a single JSON value — either an array of `{question_id, recommendation, justification, provenance}` (one per open question, in order), or `{"error": "<description>"}`. No prose, no fenced block. `recommendation` is the chosen letter + its text (for lettered-option questions) OR the drafted free-form response (for free-form questions); `justification` is 1–3 sentences of *why over alternatives* (rendered under `**Why:**` and posted as `**Rationale:**`).
3. **Present fused batch gate** (see § Gate contract G.1). In one assistant response, merge the parsed batch (step 1) with the drafter return (step 2) into a five-element presentation block per open question — title from the batch header, context/question/options verbatim from the batch, recommendation/why/provenance from the drafter:

   ```markdown
   Drafted answers for <issue-ref> (<N> open questions):

   ### Q<n> — <title from batch comment>
   **Context:** <framing from batch comment, verbatim/condensed>
   **Question:** <question verbatim>
   **Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
   **Recommendation:** <chosen letter + its text, or the drafted free-form response>
   **Why:** <1–3 sentences justifying the recommendation over the other options>
   _provenance: <citation>_

   (repeat per open question — one block per Q, separated by a blank line)
   ```

   Free-form questions render `**Options:** (free-form — no options posted)` verbatim (never drop the line). When a batch header lacks a title, substitute `q.question.split('\n')[0].slice(0, 80)` — canonical path is verbatim from the batch header; truncation is defense-in-depth.

   **Plus** a single `AskUserQuestion` call in the same response (never `ceil(N/4)` and never per-question):
   - **Question text**: `Post all <N> drafted answers to <issue-ref>?`
   - **Header**: `Clarify` (≤ 12 chars)
   - **multiSelect**: `false`
   - **Options** (exactly three, discrete, in this order):
     1. `Approve all & post (Recommended)` — post every drafted answer as-is.
     2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
     3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.

   Built-in "Other" free-text is the **one-turn edit path**: directives typed there are parsed via the same rule (see § Directive grammar) and applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip. The change-collection turn following an explicit `Make changes` selection is NOT the same risk as the #388 turn-split concern — the #388 concern was about splitting a gate's presentation from its decision, which allowed the loop to auto-proceed on an implicit-approve default; the `Make changes` re-loop cannot auto-proceed (zero directives is a no-op re-present, not an implicit approve or skip), and every iteration requires an explicit operator choice.
4. **Assemble comment body**: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per approved (or edited) answer, in ascending question-number order, separated by a single blank line. Each block emits `**Answer:** <recommendation>` on one line and `**Rationale:** <justification>` on the next. Read the `recommendation` and `justification` fields from the drafter return (step 2); the assembly step reads the same fields the presentation renders, so display and posted content cannot drift. For bare-letter operator overrides (a directive whose `rationale` is `null` per § Directive grammar), emit NO `**Rationale:**` line — never retain the draft's justification under an operator-overridden answer. Skipped questions do not appear. Write to `/tmp/cockpit-auto-clarify-<issue>-<unix_ts>.md`. Post via `gh issue comment "$ISSUE" --body-file <tmpfile>` — use `--body-file` exclusively (never `-b` / `--body`; shell quoting risks stripping the marker).
5. **Advance gate**: If every open question received an approved or edited answer, call `cockpit_advance(issue=<issue-ref>, gate="clarification")`. If some were skipped, do not advance — write a ledger line noting the partial state (`posted <k>/<N>, skipped <s>`) and continue.

**Ledger line**: `<issue-ref> · waiting-for:clarification · clarification-batch · <outcome>` where outcome is one of `advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>`.

**Failure modes**:
- Subagent returns `{"error": …}` → **Error handling** class `OTHER`; do not post; do not advance; write ledger line noting the error.
- All answers skipped → do not post; do not advance; ledger line `all answers skipped`.
- Post fails → **Error handling**; ledger line noting the failure (do not attempt retraction).
- Advance fails → **Error handling**; ledger line noting the failure.

### D.2 — `waiting-for:<artifact>-review`

**Trigger**: An issue enters `waiting-for:spec-review`, `waiting-for:clarification-review`, `waiting-for:plan-review`, or `waiting-for:tasks-review`. Verbatim event string: `waiting-for:<artifact>-review`.

**Dispatch**:
1. **Resolve target artifact** — parse `<artifact>` from the transition class; identify the file to review (e.g., `specs/<issue-slug>/spec.md`, `plan.md`, `tasks.md`, `clarifications.md`).
2. **Spawn review-verdict analyzer subagent** — reuses #390's contract verbatim. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Review artifact <name>"
   prompt: <artifact path + gate name + review instructions + return-schema directive>
   ```
   The subagent reads the artifact + surrounding context directly and returns a single JSON value — either an array of `[{file, line, summary, failure_scenario}, ...]`, `[]` for zero findings, or `{"error": "<description>"}`. No prose, no fenced block. **MUST NOT print raw JSON under any circumstance.** The parent renders the parsed array as a findings-summary table; it never restates the JSON verbatim.
3. **Present fused verdict gate** (see § Gate contract G.2). In one assistant response: findings-summary table (per #388 C.3.5 shape) + `Suggested decision: <approve | request-changes>` line + single `AskUserQuestion` with options `approve` / `request-changes` / `abort` (in that order), header `Verdict`, `multiSelect: false`. For zero findings (`[]`), still present the gate — the row is `| (none) | | | |` with `Suggested decision: approve`.
4. **Apply verdict**:
   - `approve` → `cockpit_advance(issue=<issue-ref>, gate=<gate-name>)`.
   - `request-changes` → run the four-step guardrail below. The exact JSON body shape, GraphQL query, marker string, and ledger templates live in `specs/422-summary-auto-md-s/contracts/request-changes-post.md` and `specs/422-summary-auto-md-s/contracts/postcondition-check.md`; the prose here spells out the guardrail steps but never restates those shapes verbatim.
     1. **Pre-validate anchors** — fetch the PR diff via `gh pr diff <owner>/<repo>#<pr-n>`, parse `@@ -A,B +C,D @@` hunk headers into `DiffHunk[]`, and assign each `Finding` an `AnchorCheck` verdict per `data-model.md` (§ AnchorCheck rule: `anchored` iff `finding.line != null` AND ∃ hunk in the same file whose `[headStart, headStart + headCount − 1]` range contains `finding.line`; every other finding is `unanchored`, tagged with reason `analyzer-supplied-null` or `outside-diff-hunks`).
     2. **Compose bundle** — assemble the `ReviewPostBundle` per `contracts/request-changes-post.md` § POST body: one `comments[]` entry per anchored finding (`path`, `line`, `body: <summary> — <failure_scenario>`); unanchored findings render into `body` under the literal marker `<!-- generacy-cockpit:unanchored-findings -->` immediately followed by `## General findings (no file anchor)`, per contract § Unanchored-block shape. **Refuse to POST when `comments.length == 0` AND unanchored count == 0** — a `request-changes` on zero findings is a contract violation (Error handling class `OTHER`).
     3. **POST** — `gh api -X POST /repos/<owner>/<repo>/pulls/<pr-n>/reviews --input <bundle>`; capture the response's `.id`, `.submitted_at`, and `.comments[].length`. Exit 0 is required to proceed.
     4. **Verify (two legs)** per `contracts/postcondition-check.md` § Combined verdict:
        - **Leg 1** — `response.comments.length == bundle.comments.length` (POST accepted every anchored entry).
        - **Leg 2** — run the `reviewThreads(first:50)` GraphQL query from the same contract; filter client-side to nodes matching ALL of: `isResolved == false`, `comments.nodes[0].author.login == <acting-bot-login>`, `comments.nodes[0].createdAt >= response.submitted_at`. Filtered count MUST be `≥ bundle.comments.length`.
        Success ⇔ both legs pass. On failure: sleep 2000 ms, retry the POST once; if the second attempt's postcondition also fails, re-present G.2 (see § Gate contract G.2 — re-presentation shape) with the failure notice prepended. On success (first attempt or after retry), emit the `Feedback posted: N inline comment(s) on PR #<pull_number>` success line (N = anchored count) — this is the only marker downstream steps read to confirm the POST landed.
     5. **No `cockpit_advance`** — unresolved threads own the transition; the server-side `PrFeedbackMonitorService` (generacy#861/#869/#878/#883 lineage) applies `waiting-for:address-pr-feedback` and enqueues fix work. Calling `advance` here races the server.
   - `abort` → do nothing (no post, no advance).

**Ledger line**: `<issue-ref> · waiting-for:<artifact>-review · review-analysis+<verdict> · <outcome>` — outcomes: `approved` / `posted (<anchored> inline, <unanchored> in body)` (first-attempt success) / `postcondition-failed → re-present-gate` (failed after retry) / `aborted` / `advance failed` / `error: <description>`. See § Ledger cheatsheet for the postcondition-passed/failed and review-post-retry line shapes emitted around the request-changes POST.

**Failure modes**: `[]` still prompts the gate (assist-mode contract preserved). `{"error": …}` → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Parse failure or other shape → **Error handling** with the raw return quoted.

### D.3 — `waiting-for:implementation-review`

**Trigger**: A PR enters `waiting-for:implementation-review`. Verbatim event string: `waiting-for:implementation-review`.

**Dispatch**: Structurally identical to D.2; the only difference is the scope passed to the subagent — an artifact file (D.2) vs. a PR reference (D.3). Both use the #390 contract verbatim.

1. **Resolve PR** — from `cockpit status --json`, get the issue's associated PR ref (`<owner>/<repo>#<pr-n>`).
2. **Spawn review-verdict analyzer subagent** — same subagent as D.2, invoked with the PR ref as scope:
   ```
   subagent_type: "general-purpose"
   description: "Code review PR #<n>"
   prompt: <PR ref + review instructions + return-schema directive>
   ```
   The prompt carries only the PR reference; the subagent fetches its own diff via `gh pr diff <owner>/<repo>#<pr-n>` and reads surrounding files as needed. Returns strict JSON per the SB.2 schema. The raw-JSON-suppression clause carried forward from #388 / #390 (canonical inline occurrence is in D.2 prose above) applies here identically — the parent renders the parsed findings as a table; it never restates the JSON verbatim.
3. **Present fused verdict gate** — same as D.2 (see § Gate contract G.2).
4. **Apply verdict** — same as D.2. On `request-changes`, run the D.2 four-step guardrail; the `<acting-bot-login>` used in the Leg-2 GraphQL filter is the PR-author credential (Generacy single-credential rule — the same account that opened the PR posts the review), so it MUST match the `viewer.login` seen by `gh api graphql -f query='{ viewer { login } }'` in the same session. The `<owner>/<repo>/<pr-n>` triple comes from step 1's `cockpit status --json` result.

**Ledger line**: `<issue-ref> · waiting-for:implementation-review · review-analysis+<verdict> · <outcome>` — outcomes as in D.2.

### D.4 — `waiting-for:manual-validation`

**Trigger**: An issue enters `waiting-for:manual-validation` (implementation approved, awaiting manual smoke test). Verbatim event string: `waiting-for:manual-validation`.

**Dispatch**:
1. **Spawn manual-validation summarizer subagent** — the parent MUST NOT read the spec / issue body / PR body inline (Q4=B, AP-9). All artifact reads happen inside the subagent. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Manual val summary <issue-ref>"
   prompt: <issue-ref + PR-ref + read-and-summarize instructions + return-schema directive>
   ```
   The subagent reads spec §Success Criteria + the issue's acceptance criteria + the PR title/body, and returns a single JSON value — either `{scenarios: [...], acceptance_checks: [...]}` (one-line entries in each list) or `{"error": "<description>"}`. No prose, no fenced block.
2. **Present manual-validation gate** (see § Gate contract G.3). In one assistant response: `**Scenarios to test:**` bulleted list + `**Acceptance checks:**` bulleted list (rendered verbatim from the structured return) + single `AskUserQuestion` with options `manually validated` / `not yet`, header `Validated?` (≤ 12 chars), `multiSelect: false`.
3. **Apply verdict**:
   - `manually validated` → `cockpit_advance(issue=<issue-ref>, gate="manual-validation")`.
   - `not yet` → do nothing (the label stays; the event will re-fire when the operator confirms later or takes another action).

**Ledger line**: `<issue-ref> · waiting-for:manual-validation · manual-validation-summary+<verdict> · <outcome>` — outcomes: `manually validated` / `not yet` / `error: <description>`.

**Failure modes**: `{"error": …}` → **Error handling** class `OTHER`; do not invoke gate; ledger line.

### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green. Verbatim event string: `completed:validate`.

**Dispatch**:
1. **Confirm state via `cockpit status --json`** — verify `checks_state == "green"` and no infrastructure/runner failures. A `completed:validate` streamed event whose live state shows red falls through to D.6.
2. **Merge**: `cockpit_merge(issue=<issue-ref>)` (squash, branch delete per the tool's default; the tool resolves the issue's linked PR internally — passing a PR ref directly is a distinct failure mode observed in agency#398).
3. **No gate.** The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt.

**Never merge on red** — the branch exists here strictly on the `result: merged` outcome (invariant §1).

**Ledger line**: `<issue-ref> · completed:validate · merge · <outcome>` — outcomes: `merged (PR #<n>)` / `blocked: missing-approval` / `blocked: draft` / `blocked: pending` / `blocked: missing-label` / `infrastructure failure — <checks>`.

**Failure modes**:
- `cockpit merge` returns `result: "red"` → fall through to D.6 (fixer branch).
- `cockpit merge` returns `result: "blocked"` → handle per `merge.md`'s existing decision tree (missing-label / missing-approval / draft / pending). For `pending`, defer to the watcher (do not poll). For other blocked reasons, ledger line and continue.
- Infrastructure/runner failure → do not burn a fixer attempt; ledger line `infrastructure failure — <check names>` and continue.

### D.6 — `completed:validate` (red) / merge red → bounded fixer subagent

**Trigger**: `completed:validate` with `checks_state == "red"` OR a `cockpit merge` call in D.5 returned `result: "red"`.

**Dispatch**:
1. **Classify failing checks** — infrastructure/runner failures abort without burning an attempt (repo-owned CI classes only: tests / lint / typecheck / build).
2. **Spawn bounded fixer subagent** — runs **once autonomously** per red event. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Fix red checks PR #<n>"
   prompt: <PR ref + failing-check summaries + outcome-scoping directive + return-schema directive>
   ```
   The prompt is **outcome-scoped**, verbatim:
   > "Make this specific red green (the named failing checks: `<check names>`). No refactors, no feature work, no scope expansion, no 'while I'm here' cleanups. If the fix requires design judgment (ambiguous root cause, multiple viable approaches, an architectural decision), stop and return `{fixed: false, reason: '<explanation>'}` instead of guessing."
   The subagent MAY read surrounding files, run local checks, and iterate on its own fix before returning; it MAY push commits to `pr.head_ref`. It MUST NOT call `cockpit_merge` (the parent owns the loop). It MUST NOT invoke any slash command. Return contract: a single JSON value `{fixed: bool, summary, reason?}` — no error shape (errors surface as `{fixed: false, reason: "<error description>"}`).
3. **Re-evaluate**:
   - `{fixed: true, summary: …}` → loop back to D.5 (re-run `cockpit merge`; the re-check catches whether the fix actually turned checks green).
   - `{fixed: false, summary: …, reason: …}` → present escalation gate (see § Gate contract G.4a) with options `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
4. **Apply escalation verdict**:
   - `Retry` → re-run the fixer subagent **once** (operator-approved single re-run; the gate is the bound). Each Retry produces a new ledger line and a new subagent invocation.
   - `Skip` → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.**
   - `Stop` → kill watch; run summary; exit auto cleanly. **No label writes.**

The fixer runs **once autonomously** per red event; each further run requires the escalation gate's Retry. Bounded by outcome scope, not file scope.

**Ledger lines** (mandatory per-attempt):
- Successful fix: `<issue-ref> · completed:validate:red · fixer · fixed`.
- Unfixed (about to escalate): `<issue-ref> · completed:validate:red · fixer · unfixed → escalation`.
- Escalation outcome: `<issue-ref> · completed:validate:red · fixer+escalation-gate · <retry | skip (session-local mute) | stop (exit)>`.

### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch classification**: A D.7 event is a **first dispatch** iff it is the issue's first `agent:error` / `failed:*` event within the current contiguous auto invocation. A D.7 event is a **repeat dispatch** iff it is the issue's second-and-subsequent `agent:error` / `failed:*` event within the current contiguous auto invocation, regardless of `failed:<subtype>` match (any second failure-class event on the same issue in one auto invocation is a repeat — subtype match not required). Session restart resets first-vs-repeat state (session-local grain per #406 Q2).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.** The return payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope.
   - **First dispatch**: call `cockpit_context(issue=<issue-ref>)`; the engine bundle payload is the first-dispatch evidence, forwarded to the subagent per step 2.
   - **Repeat dispatch**: call `cockpit_context(issue=<issue-ref>)` again — same evidence verb as first-dispatch. **No dispatch of a repeat D.7 without the new alert body in hand.** The parent's role at this boundary is pure transport: fetch the fresh alert, and hand it to the subagent verbatim (step 2). **The parent MUST NOT characterize the fresh failure** with a phrase like "requeue failed identically", "same as before", "another `<subtype>`", or any other parent-authored summary of similarity; the subagent — not the parent — determines same-or-different from the evidence. Parent-authored summaries of evidence are forbidden in diagnosis prompts (the loop-trust-boundary principle applied to the parent itself: assertions are advisory, evidence is authoritative).
2. **Spawn diagnosis subagent** — for any further work (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch), dispatch to a diagnosis subagent. The subagent MUST NOT invoke any slash command. On unrecoverable error the subagent returns `{"error": "<description>"}`.
   - **First dispatch invocation** (unchanged from pre-fix):
     ```
     subagent_type: "general-purpose"
     description: "Diagnose <issue-ref> failure"
     prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
     ```
     Return contract on first dispatch: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. `failure_class_changed` and `failure_classes_seen` are absent (or explicitly `null`) on first dispatch — there is no prior evidence to compare against.
   - **Repeat dispatch invocation** — SendMessage to the existing diagnosis subagent if it is still live; **fresh spawn** (same invocation shape as first-dispatch) with **both** the verbatim prior alert body AND the fresh alert body in the prompt if the subagent has already returned or been disposed across the Requeue window. The prior alert is a persistent engine-marked comment on the issue (mechanically identifiable as the previous failure-alert comment) — never lost even when the subagent dies. The parent's job on continuation-miss is pure transport. In either form, the continuation prompt contains:
     - The verbatim **new alert body** (from the fresh `cockpit_context` return payload's failure-alert comment).
     - Either the prior-context reference ("continuing from earlier diagnosis" — SendMessage form; the subagent still holds the prior alert body in-context) OR the verbatim **prior alert body** (fresh-spawn form; the subagent needs the prior evidence in-prompt).
     - **No parent-authored summary of similarity** between fresh and prior. The subagent — not the parent — determines `failure_class_changed` from the two evidences it now holds. Feeding the fresh subagent a prior *verdict* (read from the ledger) instead of the prior *alert body* is also forbidden: a distilled verdict is a diluted form of parent-authored characterization.
     - The verdict-return-schema addendum instruction (see below).
   - **Verdict return-schema addendum on repeat dispatches**: the JSON return payload's shape grows two required fields on repeat dispatches (both absent or `null` on first dispatch). Absence of either field on a repeat dispatch is a contract violation the parent MUST detect and treat as a subagent error (return `{"error": "verdict missing failure_class_changed and/or failure_classes_seen on repeat dispatch"}` to G.4(b) as a subagent-error class).
     - **`failure_class_changed: boolean`** — computed by the subagent from the fresh and **immediately-prior** alert bodies (not the original first-dispatch alert). `failure_class_changed = true` iff *any* of three dimensions differs: (1) `classifier_reason` field (engine-authored, exact string match, absent-vs-present differs); (2) `error_taxonomy` field (engine-authored, exact string match, absent-vs-present differs); (3) canonical failing-test/step identifier (`<file>::<name>` form for test failures; equivalent stable identifier for non-test failing steps — **never raw line text**, which drifts with line numbers and durations across runs of the same failure; absent-vs-present differs).
     - **`failure_classes_seen: string[]`** — running list of failure classifier identifiers observed across this issue's repeat dispatches in the current session. On the second dispatch (first repeat), initialized as `[<class1>, <class2>]` where `<class1>` is the first-dispatch alert's classifier identifier and `<class2>` is the fresh alert's. On the N-th dispatch (N ≥ 3), the subagent takes the running list from the immediately-prior verdict's `failure_classes_seen` and appends the fresh alert's classifier identifier. The `classifier_id` derivation priority: `classifier_reason` if present, else `error_taxonomy` if present, else the canonical failing-test identifier, else the placeholder `<unclassified>`. Rendered at the G.4(b) gate as a "classes this session: `<class1>` → `<class2>` → …" line — cycles like A → B → A are visible in one row.
3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block per § Gate contract G.4b (subtype b) — five-element block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with the unchanged D.7 option set (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`), header `Escalate`, `multiSelect: false`. **On repeat dispatches**, the presentation block gains a sixth element between "Evidence" and "Current state": `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. No in-parent re-analysis.
4. **Apply verdict**:
   - `Requeue` → `cockpit_resume(issue=<issue-ref>)` (engine action per Assumption A2 — clears `agent:error` / `failed:*`, restores the phase's `waiting-for:` / `completed:` resume pair).
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Degradation clause**: If `cockpit_resume` is unavailable (G-S8 did not ship the tool, per Assumption A2), Requeue degrades to Skip with an explicit ledger note: `<issue-ref> · <transition> · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

**Ledger line**: `<issue-ref> · <agent:error | failed:<subtype>> · escalation-gate · <outcome>` — outcomes: `requeue (cockpit resume)` / `requeue failed: <description>` / `skip (session-local mute)` / `skip (cockpit resume unavailable — G-S8 prerequisite)` / `stop (exit)`.

**Failure modes**: `cockpit_resume` returns a typed error → **Error handling** class `OTHER`; ledger line; leave the issue in its failed state (do not retry automatically).

### D.8 — `phase-complete` → phase-queue confirmation gate

**Trigger**: A phase completes (all its issues reached terminal states). S8 emits `phase-complete` when the epic's next phase is ready to queue. Verbatim event string: `phase-complete`. **Only fires in epic mode (`invocationForm: epic`).**

**Dispatch**:
1. **Compute next phase scope** — from `cockpit_status(epic=<epic-ref>, json=true)`, identify the next phase (P<next>) and its N issues.
2. **Compute open ad-hoc issues** — call `openAdHocIssues(<epic-ref>, ledger)` which filters ledger `scope-add` and `filing-gate+scope-add` action lines (with successful outcomes) to the refs whose live state per `cockpit_status` is non-terminal. Order is scope-add order (chronological).
3. **Present phase-queue gate** (see § Gate contract G.5). In one assistant response: presentation block with the next-phase issue list numbered with titles, followed — **only when the ad-hoc list is non-empty** — by a `Open ad-hoc issues in scope (added mid-run):` block enumerating each open ad-hoc ref as `<owner>/<repo>#<n> · <title> · <live-state>`. Empty ad-hoc list omits the block entirely (no `(none)` placeholder). Then a single `AskUserQuestion` with options depending on the ad-hoc list:
   - **Empty ad-hoc list (unchanged behavior)**: options `Queue P<next> (<N> issues) (Recommended)` / `Cancel`.
   - **Non-empty ad-hoc list**: options `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` / `Queue P<next> (<N> issues)` / `Cancel`, where `<M>` is the count of open ad-hoc issues. The recommendation flips to `Hold`; `Queue P<next>` remains selectable (queueing while ad-hoc work is open stays *possible* but never *silent* — the gate text names the open refs and the operator decides).

   Header `QueueP<next>`, `multiSelect: false`.
4. **Apply verdict**:
   - `Queue P<next>` → `cockpit_queue(epic=<epic-ref>, phase="P<next>")` (the `--yes` flag is retired — the tool has no interactive confirm; the gate itself is the sole confirmation). Under a non-empty ad-hoc list, the ledger outcome carries the ad-hoc count.
   - `Hold` (only under non-empty ad-hoc list) → do NOT call `cockpit_queue`; the `phase-complete` state persists; the loop continues (the operator may add more ad-hoc work, complete existing ad-hoc work, or return to this gate later).
   - `Cancel` → ledger line noting the cancellation; continue loop.

**Ledger line**: `<epic-ref> · phase-complete · phase-queue-gate · <queued P<next> (<N> issues) | queued P<next> (<N> issues) with <M> ad-hoc open | held (<M> ad-hoc open) | cancelled>`.

If `cockpit_status` fails for one or more ad-hoc refs during the helper call, omit those refs from the enumeration and write a ledger line noting the omission (`<epic-ref> · phase-complete · openAdHocIssues · error: cockpit_status failed for <ref>: <description>`) before firing the gate; the gate still presents the partial list.

### D.9 — `waiting-for:address-pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:address-pr-feedback`. Verbatim event string: `waiting-for:address-pr-feedback`.

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger line accounts for the event; the loop continues.

**Ledger line**: `<issue-ref> · waiting-for:address-pr-feedback · (no-op) · server-side-owned`.

### D.9a — `waiting-for:pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:pr-feedback`. Verbatim event string: `waiting-for:pr-feedback`. Legacy alias of the engine-owned feedback loop (D.9 `waiting-for:address-pr-feedback` is the modern shape; some pre-migration epics still emit the shorter `pr-feedback` label).

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:pr-feedback · (no-op) · server-side-owned`.

### D.9b — `waiting-for:children-complete` → ledger only

**Trigger**: An epic-container issue enters `waiting-for:children-complete`. Verbatim event string: `waiting-for:children-complete`. Epic-container state — the running auto loop *is* its resolution (children dispatch as they transition; on the last child's completion, this label transitions naturally to `epic-complete` without operator input).

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:children-complete · (no-op) · server-side-owned`.

### D.9c — `waiting-for:dependencies` → ledger only

**Trigger**: An issue enters `waiting-for:dependencies`. Verbatim event string: `waiting-for:dependencies`. Engine-owned cross-issue wait — resolved server-side when the depended-on issue transitions.

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned.

**Ledger line**: `<issue-ref> · waiting-for:dependencies · (no-op) · server-side-owned`.

### D.9d — `phase:*` → ledger only

**Trigger**: An issue enters any `phase:*` state. **Prefix-match**: any transition class whose token begins with the literal `phase:` prefix matches this row (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, and any future workflow-phase addition). The phase set is workflow-dependent and open-ended — speckit-feature and speckit-bugfix already differ; enumeration would break the day a workflow adds a phase.

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` or `blocked:*` still fires D.10).

**Ledger line**: `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`.

### D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)

**Trigger**: An issue enters a merge-conflicts-family state. Verbatim event strings (either fires this row): `waiting-for:merge-conflicts` (base-sync produced a merge conflict; the branch cannot be advanced without an operator-authored resolution) OR `blocked:stuck-merge-conflicts` (engine auto-remedy attempted AND failed; operator resolution is the only path forward). The classifier applies both labels together for a single stuck-merge incident, so the two events co-occur per issue — the dedup rule in step 1 (dispatched-issues set) ensures one incident produces one escalation gate. The label that surfaced first is treated as the `<source-label>` for the ledger and threaded through the subagent prompt and G.4d presentation.

**Dispatch**:
1. **Dedup check.** If `<issue-ref>` is already present in the in-memory `dispatched-issues set` (session-scoped, alongside the session mute set referenced at `auto.md:266`, `:305`, `:391`, `:407`, `:749`), the sibling merge-conflicts-family label has already produced one gate for this incident. Write ledger-only line `<issue-ref> · <source-label> · escalation-gate · already-dispatched` and return to the main loop — do NOT fetch context, spawn a subagent, or present a gate. Otherwise, add `<issue-ref>` to the dispatched-issues set and continue to step 1a.
1a. **Fetch context.** The parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`; the return payload includes the pause-alert comment content and the list of conflicted paths. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.**
1.5. **Spawn diagnosis subagent** — for any conflict-triage work beyond the engine bundle (repro, log reads, `git status` / `git diff` / branch inspection, downstream artifact fetch), dispatch to a diagnosis subagent. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Diagnose <issue-ref> merge conflicts"
   prompt: <issue-ref + <source-label> (verbatim: one of `waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`) + conflicted-paths payload + gate-option-set directive + return-schema directive>
   ```
   When `<source-label>` is `blocked:stuck-merge-conflicts`, the subagent MAY reference "auto-remedy already failed" (engine attempted resolution and escalated) in its `root_cause`/`evidence` fields. The subagent MUST NOT invoke any slash command. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. On unrecoverable error the subagent returns `{"error": "<description>"}`.
2. **Present escalation gate** (see § Gate contract G.4d). In one assistant response: presentation block per § Gate contract G.4d — five-element block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; conflicted paths shown; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. No in-parent re-analysis.
3. **Apply verdict**:
   - `I've resolved it — advance the gate` → call `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`. On success: ledger `advanced`; **remove `<issue-ref>` from the dispatched-issues set** so a genuinely new future conflict on the same issue re-gates; continue. **On typed-error return: re-present the D.11 gate with the tool's `code`/`message` prepended verbatim to the presentation block** (see § Gate contract G.4d re-present shape). The operator may retry, skip, or stop from the re-presented gate; the dispatched-issues set entry remains until either advance succeeds or the session ends.
   - `Skip (session-local mute)` → add `<issue-ref>` to session mute set; **leave the dispatched-issues set entry in place** (session-local mute semantics — the existing session mute set already suppresses further events on this issue, and the dispatched-issues set is aligned with that until session end); ledger line `skip (session-local mute)`; continue.
   - `Stop (exit auto)` → kill watch; summary; exit (dispatched-issues set drops with process exit).

**Future degradation**: Once the engine-side merge-conflicts resolver ships (companion finding in generacy dead-end-gate), this row degrades to ledger-only (D.9-shape) — the label becomes server-side-owned. Until then, this escalation gate is the operator's resolution surface.

**Ledger line**: `<issue-ref> · <source-label> · escalation-gate · <advanced | advance failed: <code>: <message> | skip (session-local mute) | stop (exit) | already-dispatched>`. `<source-label>` is written verbatim from the triggering event and is one of `waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`. The `already-dispatched` outcome is produced by the step 1 dedup check (Entity 3 in `data-model.md`); the four gate-outcome tokens (`advanced` / `advance failed: …` / `skip …` / `stop …`) are produced by the verdict-apply step 3.

### D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)

**Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9 (including D.9a/b/c) or D.11. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape, **(d) any state token (`waiting-for:*` OR `blocked:*`) does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)** — future `blocked:*` labels (e.g. `blocked:stuck-validate-fix` from generacy#943) that lack their own dispatch row land here, not in D.11.

**Any `waiting-for:*` OR `blocked:*` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of `waiting-for:*` and `blocked:*` states the loop may treat as no-ops (via the named ledger-only rows D.9, D.9a, D.9b, D.9c) or dispatch to a dedicated gate (D.11). "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` or `blocked:*` state unless the table explicitly names it ledger-only. If the table does not name it, D.10 fires — verbatim state in the presentation block.

**Dispatch**:
1. **Present escalation gate** (see § Gate contract G.4c). In one assistant response: presentation block including the observed state (verbatim from `cockpit status --json`) + streamed event line + single `AskUserQuestion` with options `Skip (session-local mute) (Recommended)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. **NEVER Retry** (nothing to retry — we don't know what to do).
2. **Apply verdict**:
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Never guess** — the escalation gate is the surface for any state class the playbook cannot dispatch.

**Ledger line**: `<issue-ref> · <observed-state> · unrecognized-state · <skip (session-local mute) | stop (exit)>`.

## Add-issue flow (mid-run)

Between dispatched events, the operator may ask the session to add a ref to the current tracking scope — either an existing issue ("also process X") or a new issue drafted for them ("file an issue for X"). Two **intent classes** are recognized (see `lib/intent-recognition.ts` for the canonical shape used by the fixture-verified reference parser):

1. **Add-existing intent** — the operator's message reads like "also process <ref>", "process <ref> too", "add <ref> to scope", "include <ref>", "queue <ref>", "pull in <ref>", "handle <ref>", or "look at <ref> too", AND contains a parseable explicit ref (`<owner>/<repo>#<n>` or `#<n>` shorthand — the shorthand resolves against the tracking ref's repo at dispatch time).
2. **File-new intent** — the operator's message reads like "file an issue for <topic>", "open a bug for <topic>", "create an issue about <topic>", "raise an issue for <topic>", or "report an issue for <topic>".

Recognition is **generous by design** because the safety net is structural (spec Q2 anchor):

- The **add-existing path requires a parseable explicit ref** — if no ref is present in a message with add-existing phrasing, the parser returns `null` and the session **confirms intent conversationally** ("do you want me to add an issue to scope? which ref?") before acting. A false-positive add-existing dispatch can only happen when the operator actually referenced a ref, which bounds the blast radius.
- The **file-new path always lands on the filing gate G.6** — a misread intent surfaces as a skippable gate, never as an unreviewed outward action. On ambiguous chat-adjacent phrasings (`look at X`, `check X out`, `investigate X`, `let's discuss X`), the parser returns `null` and the session confirms intent before drafting.

Multiple refs in one message: the FIRST parseable ref wins. The operator can re-invoke intent per-ref.

### Add-existing path (no gate)

1. Parse the ref via `parseAddExistingIntent`. On `null`, confirm intent conversationally and re-parse on the operator's confirmation.
2. Resolve shorthand `#<n>` against the tracking ref's `<owner>/<repo>` prefix. The resolved ref is what goes into the ledger and the tool calls.
3. Call `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<resolved-ref>)` (the generacy#935 verb).
4. Call `cockpit_queue(issue=<resolved-ref>)` (the generacy#935 issue-form of `cockpit_queue`).
5. Write ledger line: `<resolved-ref> · scope-add · queued` (or `<resolved-ref> · scope-add · error: <description>` on failure).
6. Return to the main loop. **No gate** — the operator's explicit instruction *is* the approval (Q2 anchor).

On any error from `cockpit_scope_add` or `cockpit_queue`, write the error ledger line and continue the main loop; the operator can retry via a fresh intent.

### File-new path (G.6 filing gate)

1. Parse the topic via `parseFileNewIntent`. On `null`, confirm intent conversationally and re-parse on the operator's confirmation.
2. Spawn a drafter subagent (`subagent_type: "general-purpose"`, description: `Draft issue for <topic>`, prompt: the operator's topic + a return-schema directive) to draft `{title, body, labels}` for the new issue. Return contract: strict JSON `{title: string, body: string, labels: string[]}`; on error `{"error": "<description>"}`.
3. Present the **G.6 filing gate** (see § Gate contract G.6) with the drafted content in the five-element block. Loop the edit branch until `Approve & file` or `Skip (don't file)`.
4. **On `Approve & file`**:
   - Write the assembled body to `/tmp/cockpit-auto-file-<tracking-ref-slug>-<unix_ts>.md`.
   - Create the issue: `gh issue create --title "<title>" --body-file <tmpfile> [--label <labels>]` — `--body-file` only (never `-b` / `--body`; shell quoting risks stripping content).
   - Capture the new ref from `gh issue create` return.
   - Call `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<new-ref>)`.
   - Call `cockpit_queue(issue=<new-ref>)`.
   - Write ledger line: `<new-ref> · filing-gate+scope-add · filed + queued (<new-ref>)`.
5. **On `Skip (don't file)`**: write ledger line `<tracking-ref> · filing-gate · skipped (draft discarded)` (the left slot is the tracking ref because no new ref was ever assigned) and return to the main loop. **No create, no scope-add, no queue.**

On any error from `gh issue create` / `cockpit_scope_add` / `cockpit_queue` after `Approve & file`, write the corresponding error ledger line (`filing-gate+scope-add · error: <description>` / `error: scope-add failed: <description>` / `error: queue failed: <description>`) and continue the main loop. Do **not** attempt retraction on a successful `gh issue create` — closing the just-created issue would compound the failure; the operator can manually add the ref via the add-existing intent flow.

**Restart safety**: scope mutations are ledger-lined and reflected on the tracking issue's task list at the engine boundary. A restarted session re-orients from the tracking ref's live task list (spec § Changes item 5); mutes/cursors stay session-local.

## Gate contract

Four gate types — **clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations** — are the exhaustive human-interaction surface. **Nothing else prompts; none of these auto-proceed.** Every gate is fused with its presentation in one assistant response (#388 pattern applied uniformly). Every gate uses `AskUserQuestion` — never a Bash `read` prompt, never a text-only question the operator answers in prose.

| # | Gate | Options | Presentation |
|---|------|---------|--------------|
| G.1 | Clarification batch | `Approve all & post (Recommended)` / `Make changes` / `Skip this batch` (single call per batch) | Five-element `### Q<n>` block per open question (context/question/options/recommendation/why + provenance) |
| G.2 | Review verdict | `approve` / `request-changes` / `abort` (single call) | Findings-summary table + Suggested decision |
| G.3 | Manual-validation confirm | `manually validated` / `not yet` (single call) | Scenarios + acceptance_checks lists |
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:* | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (d) | Escalation: Merge-conflicts | `I've resolved it — advance the gate` / `Skip` / `Stop` (single call) | Conflicted paths (+ CLI stderr on re-present) |
| G.4 (c) | Escalation: unrecognized state | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
| G.5 | Phase-queue confirmation | `Queue P<next> (Recommended)` / `Cancel` — or `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` / `Queue P<next> (<N> issues)` / `Cancel` when open ad-hoc work exists (single call) | Next-phase issue list + optional `Open ad-hoc issues in scope (added mid-run):` block |
| G.6 | Filing gate (new-issue draft) | `Approve & file (Recommended)` / `Make changes` / `Skip (don't file)` (single call; iterative edit branch) | Five-element block: title, labels, body, filing target, parent tracking ref |
| G.7 | Scope-drained (epic-less exit) | `Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)` (single call) | Tracking ref, refs processed, per-ref disposition (`completed` / `not-planned`) |

### G.1 — Clarification batch gate

**Trigger**: D.1 (`waiting-for:clarification`).

**Presentation** (in the same response as the single `AskUserQuestion` call) — one five-element `### Q<n>` block per open question:

```markdown
Drafted answers for <issue-ref> (<N> open questions):

### Q<n> — <title from batch comment>
**Context:** <framing from batch comment, verbatim/condensed>
**Question:** <question verbatim>
**Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
**Recommendation:** <chosen letter + its text, or the drafted free-form response>
**Why:** <1–3 sentences justifying the recommendation over the other options>
_provenance: <citation>_

(repeat per open question — one block per Q, separated by a blank line)
```

Title comes from the batch comment header verbatim (`ParsedQuestion.title`); when the header lacks a title (`### Q<n>` without colon-title), substitute `q.question.split('\n')[0].slice(0, 80)` — the canonical path uses the header title verbatim; truncation is defense-in-depth. Free-form questions render `**Options:** (free-form — no options posted)` verbatim (never drop the line — the five-element structure is a fixed shape). Context, question, and options come from parsing `clarificationComment.body` (D.1 step 1); recommendation, why, and provenance come from the drafter (SB.1 return, D.1 step 2).

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per batch (single-item `questions` array); when multiple clarification gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)` — post every drafted answer as-is.
  2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
  3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.

**Edit path**: The built-in "Other" free-text channel is the **one-turn edit path**: directives typed there are parsed via the same rule (see § Directive grammar) and applied directly to the drafted answers (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip. The listed `Make changes` option is not the same risk as the #388 turn-split concern. Splitting a gate's presentation from its decision (the #388 concern) allowed the loop to auto-proceed on an implicit-approve default. A change-collection turn that follows an explicit operator selection of `Make changes` cannot auto-proceed — zero directives is a no-op re-present, not an implicit approve or skip. Every iteration requires an explicit operator choice. Keep "Other" documented as the no-extra-turn path.

**Post-gate behavior**:
- `Approve all & post` → post every drafted answer as-is; `cockpit advance --gate clarification`; ledger `advanced`.
- `Make changes` → parse directives via § Directive grammar; if `Directive[]` is empty, re-present the entire batch (no changes) and re-fire the same three-option gate — do NOT auto-approve, do NOT auto-skip; if non-empty, apply directives (edits update the staged answer/rationale, `skip` marks the question excluded), re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip.
- `Skip this batch` → post no comment; do not advance; ledger `all answers skipped`.
- "Other" (one-turn edit) → parse directives via § Directive grammar; apply to the drafted answers (edits overwrite, `skip` excludes); post the resulting subset; advance if every question was posted, else ledger `posted <k>/<N>, skipped <s>`.
- Skipped answers → dropped; do not appear in the comment.
- All approved (including via edits) → `cockpit advance --gate clarification`; ledger `advanced`.
- Some approved, some skipped → post the approved subset; do not advance; ledger `posted <k>/<N>, skipped <s>`.
- All skipped (via directives or `Skip this batch`) → post no comment; do not advance; ledger `all answers skipped`.

### Directive grammar

Both `Make changes` and the "Other" free-text path parse per-question directives identically, using a `Q<n>:` token-anchored rule.

**Rule**: A new directive begins at each `Q<n>:` token. Split the input at `Q<n>:` occurrences; each directive's payload runs from the token to the next token or end of input.

**Documented forms** (both parse identically under the rule):

- Newline-separated (canonical):
  ```
  Q2: B
  Q4: skip
  ```
- Single-line semicolon (a verbatim replacement's text may itself contain semicolons; the token rule doesn't mis-split it):
  ```
  Q2: B; Q4: skip
  ```

**Payload forms**:

- `Q<n>: <letter>` — bare letter (matching an option from the parsed batch comment) resolves to that option's text. The answer posts with **no rationale line** — never retain the draft's justification under an operator-overridden answer, because it would argue for a different choice.
- `Q<n>: <letter> — <reason>` — letter resolves to option text, and `<reason>` replaces the justification.
- `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
- Anything else — treated as verbatim replacement text for the answer, posted as-is.

**Applied identically in two paths**:

- **`Make changes` re-loop** — the operator's turn collects directives typed in a follow-up prompt or in the initial `AskUserQuestion` "Other" field; the loop re-presents only changed questions plus the same batch gate; loops until Approve or Skip.
- **"Other" free-text on the batch gate** — the operator's replacement text is applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.

Zero directives from a `Make changes` turn is a no-op: re-present the entire batch and fire the same gate again (never auto-approve or auto-skip on empty input).

### G.2 — Review verdict gate (artifact and implementation)

**Trigger**: D.2 (`waiting-for:<artifact>-review`) or D.3 (`waiting-for:implementation-review`).

**Presentation** (in the same response as the `AskUserQuestion` call) — the findings-summary table verbatim per #388 C.3.5:

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | <path>:<line> | <one-line finding summary> | Yes |
| 2 | <path>:<line> | <one-line finding summary> | No |
| ... |

Suggested decision: <approve | request-changes>
```

For zero findings (`[]` from the subagent):

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |

Suggested decision: approve
```

**Retained rule** (canonical inline occurrence is in D.2 prose — the raw-JSON-suppression clause carried forward from #388 / #390): the subagent's structured return is parsed and rendered as a table; it is never restated verbatim in the response body.

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per verdict gate (single-item `questions` array); when multiple review gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Verdict for <issue-ref> (<gate-name>)?`
- **Header**: `Verdict` (≤ 12 chars)
- **Options** (exactly three, discrete, in this order):
  1. `approve` — advance the gate
  2. `request-changes` — post via the D.2 guardrail (pre-validate → POST → two-leg verify → retry-once → re-present on failure)
  3. `abort` — do nothing
- **multiSelect**: `false`

**Post-gate behavior**:
- `approve` → `cockpit_advance(issue=<issue-ref>, gate=<gate-name>)`.
- `request-changes` → run the D.2 four-step guardrail; do NOT `advance` (unresolved threads own the transition).
- `abort` → do nothing.

Hard-error subagent returns (`{"error": …}` or unparseable) → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Zero findings still invokes `AskUserQuestion` — no auto-approve smuggled in.

**G.2 re-presentation shape** (fired only when the D.2 request-changes guardrail's second attempt also fails its postcondition — Q3=A per `research.md` R4):

The re-presented gate is a full G.2 re-fire (same table, same `AskUserQuestion` call with the same three options in the same order) with a **failure notice prepended** to the presentation body:

```markdown
> **Postcondition failed after retry.**
> POST/GraphQL error: <verbatim `code` / `message` from the failing leg — quote the response payload>
> postcondition failed after retry (attempt=2 · leg1=<a>/<n> · leg2=<b>/<n>)

<original findings table>

Suggested decision: <approve | request-changes>
```

**Rules**:
- The failure notice is a Markdown blockquote so the operator's eye lands on it first; the original findings table and `Suggested decision:` line follow verbatim from the initial G.2 presentation (no re-analysis — the analyzer's return is unchanged; the failure is in the delivery layer, not the analysis).
- The failure notice quotes the failing leg's error `code`/`message` verbatim inside the blockquote (Leg 1 → mismatch summary from the POST response; Leg 2 → the GraphQL query's response fragment or the timeout error).
- Re-selecting `request-changes` on the re-presented gate starts a **fresh POST with a fresh retry allowance** — the retry counter is per-attempt (per POST bundle), not per-verdict, so operator re-selection does not compound retries.
- The `abort` and `approve` branches on the re-presented gate are unchanged — `approve` still advances the gate (operator's judgment call: they may choose to advance despite the invisible feedback), `abort` still does nothing.

**Invariant**: G.2 `abort` and `approve` branches are unchanged by this branch — only `request-changes` gains the postcondition guardrail and the retry-then-re-present recovery.

### G.3 — Manual-validation confirm gate

**Trigger**: D.4 (`waiting-for:manual-validation`).

**Presentation** (in the same response as the `AskUserQuestion` call) — the subagent's structured summary rendered as bullet lists:

```markdown
Manual validation checklist for <issue-ref> (PR <pr-number>):

**Scenarios to test:**
- <scenario 1>
- <scenario 2>
- ...

**Acceptance checks:**
- <check 1>
- <check 2>
- ...
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per manual-validation gate (single-item `questions` array); when multiple manual-validation gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Have you manually validated <issue-ref>?`
- **Header**: `Validated?` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `manually validated` — advance the gate
  2. `not yet` — do nothing; the event will re-fire when the operator confirms later
- **multiSelect**: `false`

The scenarios and acceptance_checks lists come **only** from the subagent hop — no inline artifact reads in the parent (Q4=B).

### G.4 — Escalation gate (three subtypes)

**Trigger**: One of:
- (a) `completed:validate` red / merge red after fixer runs and returns `{fixed: false, …}` (D.6).
- (b) `agent:error` / `failed:*` (D.7).
- (d) `waiting-for:merge-conflicts` (D.11).
- (c) Unrecognized / ambiguous state (D.10).
- (e) Consecutive `invalid-cursor` fault (§ step 5 Branch B; counter ≥ 2, streak not yet operator-acknowledged).

**Presentation** (in the same response as the `AskUserQuestion` call) — evidence formatted per subtype.

**(a) Validate-red / merge-red**:

```markdown
Fixer could not resolve <issue-ref> (PR <pr-number>):

<fixer summary — the subagent's `summary` field>

Reason (from fixer): <fixer's `reason` field>

Failing checks: <check names>
```

**(b) `agent:error` / `failed:*`**:

Populated verbatim from the diagnosis subagent's verdict (D.7 step 2). No in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged. On **repeat dispatches** (D.7 dispatch classification), the block gains a sixth element between "Evidence" and "Current state" populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields.

First-dispatch presentation:

```markdown
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

Repeat-dispatch presentation (adds the "Failure class changed since prior" row between Evidence and Current state):

```markdown
Agent error on <issue-ref> (repeat dispatch):

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

The `Failure class changed since prior` row is populated verbatim from the verdict's `failure_class_changed` (as `yes` if `true`, `no` if `false`) and `failure_classes_seen` (as a `→`-joined running list). A `yes` value usually means the prior Requeue *made progress* — the recommendation calculus at the gate should reflect that (this incident's Skip recommendations inverted it). The row is absent on first-dispatch presentations (there is no prior evidence to compare against).

**(d) Merge-conflicts**:

Populated verbatim from the diagnosis subagent's verdict (D.11 step 1.5). No in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged.

Initial presentation:

```markdown
Merge conflicts on <issue-ref>:

**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)   ← rendered ONLY when <source-label> is `blocked:stuck-merge-conflicts`; omitted entirely when source is `waiting-for:merge-conflicts`
**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Conflicted paths (from engine pause alert):**
- <path 1>
- <path 2>
- ...
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to call `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`.
```

The `Auto-remedy status` row is a fixed-shape labeled field (D.7 precedent at `auto.md:665–677`); its literal value is `failed (engine escalated via blocked:stuck-merge-conflicts)` when present. The opening line and all other rows are unchanged across both source labels — do not mutate the opening line and do not append trailing prose beyond what is shown.

Re-presentation on typed-error return (Q3=A shape):

```markdown
Advance failed for <issue-ref>:

<typed-error `code`/`message`/`details` verbatim, from `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`>

Merge conflicts on <issue-ref>:

**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)   ← rendered ONLY when <source-label> is `blocked:stuck-merge-conflicts`; omitted entirely when source is `waiting-for:merge-conflicts`
**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Conflicted paths (from engine pause alert):**
- <path 1>
- <path 2>
- ...
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to call `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`.
```

The `Auto-remedy status` row is inserted with identical placement (above `**Root cause:**`) and identical literal value across the initial and re-presentation shapes — the two shapes remain symmetric aside from the prepended typed-error preamble.

**(c) Unrecognized state**:

```markdown
Unrecognized state on <issue-ref>:

Observed: <raw state from cockpit status --json>

Streamed event: <original transition line>
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per escalation gate (single-item `questions` array); when multiple escalation gates fuse into one response, fire one call per gate. The reference applies uniformly to each of the five subtypes G.4a/G.4b/G.4c/G.4d/G.4(e) listed in the Options table below. Parameters:
- **Question text**: `How to proceed on <issue-ref>?` (subtypes a/b/c/d) or `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?` (subtype (e); operates on an epic, not an issue).
- **Header**: `Escalate` (≤ 12 chars)
- **Options** (subtype-specific, in the listed order):

  | Subtype | Options |
  |---------|---------|
  | (a) validate-red / merge-red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (b) agent:error / failed:* | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (d) merge-conflicts | `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (c) unrecognized state | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |
  | (e) consecutive `invalid-cursor` fault | `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** (single call; per-epic, not per-issue) |

- **multiSelect**: `false`

**Post-gate mechanism sentences** (verbatim per Q3=D):
- `Retry` (subtype a only) → re-run the fixer subagent **once**. If `{fixed: true}`, loop back to D.5; if `{fixed: false}`, re-present the escalation gate.
- `Requeue` (subtype b only) → `cockpit_resume(issue=<issue-ref>)` (Assumption A2). If tool missing, degrade to Skip with explicit ledger note.
- `I've resolved it — advance the gate` (subtype d only) → `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`. On success, ledger `advanced` and continue. On typed-error return, re-present the D.11 gate with the tool's `code`/`message` prepended verbatim to the presentation block (see § D.11 dispatch step 3).
- `Continue degraded (sweep-per-batch)` (subtype (e) only) → mark the current unhealed `invalid-cursor` streak as operator-acknowledged; the loop continues; § step 5 Branch B recovers on each subsequent `invalid-cursor` (incrementing the counter and writing a `cursor-recovery · invalid-cursor · <N>` ledger line for accounting), but the G.4(e) gate does **not** re-fire within the same streak (decide-once). On any successful cursor reuse the streak-acknowledged flag AND all counters reset (per § step 5); a fresh 2-in-a-row streak re-fires the gate at count == 2 (Q4=A: new streak = new decision).
- `Skip` (subtypes a/b/c/d) → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.** Subtype (e) does NOT expose `Skip` — the fault is per-epic (cursor mechanism), not per-issue.
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**

### G.4(e) — Escalation: consecutive `invalid-cursor` fault

**Trigger**: § step 5 Branch B evaluates: `invalid-cursor` counter ≥ 2 AND the current streak has not yet been operator-acknowledged (per Q4=A decide-once). Verbatim state anchor: the `invalid-cursor` consecutive-fault counter has reached 2 on the second consecutive `invalid-cursor` typed error from `cockpit_await_events` with no intervening successful cursor reuse (per § step 5's successful-reuse definition — any call presenting a non-null cursor and returning no cursor-error signal, empty batches included). The gate fires exactly once per unhealed streak (at count == 2); subsequent `invalid-cursor` occurrences within the same streak recover silently (with ledger lines) once the streak is operator-acknowledged.

**Presentation** (in the same response as the `AskUserQuestion` call):

```markdown
Consecutive `invalid-cursor` fault on <epic-ref> (consecutive-count: <N>):

**Most recent typed errors** (verbatim from `cockpit_await_events`):
- Occurrence <N-1>: `code`=<code-1>, `message`=<message-1>, `details`=<details-1>
- Occurrence <N>: `code`=<code-2>, `message`=<message-2>, `details`=<details-2>

**Recovery state**: The loop has been running startup-sweep-per-batch since the first `invalid-cursor` occurrence at <timestamp>. Each recovery is idempotent (sweeps see already-dispatched state and no-op), but the dispatch-round reduction the MCP path exists to deliver (SC-003) is not being realized — every batch pays the full startup-sweep cost.

**Options**:
- `Continue degraded (sweep-per-batch) (Recommended)` — accept the degraded loop; decide-once for the current unhealed streak (the gate does NOT re-fire on subsequent `invalid-cursor` within the same streak). The counter continues to increment for ledger accounting.
- `Stop (exit auto)` — kill the auto loop cleanly; print the run summary per § L.6 with the ledger file's absolute path. The operator may investigate offline (server-side incident, epic-configuration mismatch, caller-side race) and restart auto later.
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.4(e) fire (single-item `questions` array). When G.4(e) co-fires with another gate class (rare — cursor recovery is a per-loop event, not per-issue; the only realistic co-fire is a batch-boundary event that also happens to end with an `invalid-cursor`), the standing multi-gate fanout rule applies: one call per gate, never a fused questions array. Parameters:
- **Question text**: `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?`
- **Header**: `Escalate` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly two, discrete, in this order):
  1. `Continue degraded (sweep-per-batch) (Recommended)` — accept degraded loop for the current unhealed streak.
  2. `Stop (exit auto)` — kill loop; print run summary; exit.

**Post-gate behavior**:
- `Continue degraded (sweep-per-batch)` → set `streakOperatorAcknowledged = true` for the current unhealed streak; loop continues; § step 5 Branch B recovers on each subsequent `invalid-cursor` (incrementing the counter and writing a ledger line, but NOT re-firing the gate). Once any successful cursor reuse occurs, `streakOperatorAcknowledged` resets to `false` and all counters reset to 0 (per Q4=A).
- `Stop (exit auto)` → kill the auto loop cleanly; print the run summary per § L.6 (including the persistent ledger file's absolute path); exit cleanly. No label writes.

**Ledger line contract**: two ledger lines per G.4(e) fire — the fault accounting is written by § step 5 Branch B before the gate fires (`<epic-ref> · cursor-recovery · invalid-cursor · <N>` where `<N>` is the counter value that triggered the gate); the operator decision is written by G.4(e) after the response (`<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>`). Together they form the "streak reached N, operator decided X" record.

**Failure modes**:
- `Continue degraded` (operator selected) → no failure mode; the loop continues in degraded state. The ledger records the decision.
- `Stop` (operator selected) → no failure mode; the loop exits cleanly. The ledger records the decision. The run summary § L.6 prints an abbreviated form (non-`epic-complete` exit).
- No operator response → the gate blocks indefinitely per the standing gate contract (§ AskUserQuestion invocation contract, Q3=D). No per-row timeout policy. The block is cheap — no recovery loop spins while waiting — so the cost is bounded by operator return time, not by an arbitrary N.

### G.5 — Phase-queue confirmation gate

**Trigger**: D.8 (`phase-complete`).

**Presentation** (in the same response as the `AskUserQuestion` call):

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per phase-queue gate (single-item `questions` array); phase-queue gates rarely fuse but the fanout rule applies uniformly if they do. Parameters:
- **Question text**: `Queue P<next> (<N> issues)?`
- **Header**: `QueueP<next>` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `Queue P<next> (<N> issues) (Recommended)` — call `cockpit queue`
  2. `Cancel` — do nothing (the phase-complete state persists)
- **multiSelect**: `false`

On `Queue`, the CLI verb is called with `--yes` — the gate itself is the confirmation.

### G.6 — Filing gate (new-issue draft)

**Trigger**: A file-new intent recognized mid-run (via `parseFileNewIntent` returning a `FileNewIntent`) — see § Add-issue flow. Also fires at step 1 under the `--new "<title>"` invocation form to create the initial tracking issue.

**Presentation** (in the same response as the `AskUserQuestion` call) — the five-element block layout, used verbatim on every re-fire (no diff view — what gets filed is exactly what was last shown):

```markdown
Filing new issue for <tracking-ref>:

**Title:** <drafted-title>
**Labels:** <labels or "(none)">
**Body:**

<drafted-body — full markdown, multi-line, verbatim as it will be filed>

**Filing target:** <owner>/<repo> (from tracking ref)
**Parent tracking ref:** <tracking-ref>
```

The five field labels (`**Title:**`, `**Labels:**`, `**Body:**`, `**Filing target:**`, `**Parent tracking ref:**`) are ALWAYS present — even under empty labels (`(none)` placeholder). Missing any label is a presentation-shape drift (416-3 anchor).

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.6 fire (single-item `questions` array). Parameters:

- **Question text**: `File this issue on <owner>/<repo>?`
- **Header**: `File` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve & file (Recommended)` — create + scope-add + queue + ledger.
  2. `Make changes` — enter iterative edit re-loop; the operator provides revised content conversationally, the session redrafts and re-fires this same G.6 gate with the full revised draft.
  3. `Skip (don't file)` — no create, no scope-add, no queue; ledger line noting the skip.

**Iterative edit branch (Q3 anchor — full-draft re-present each round, never a diff view)**:

- **On `Make changes` selection**: the operator's follow-up turn provides change directives (title, body, labels) as free text. The session redrafts the FULL issue and re-presents the full revised draft plus the same G.6 gate. Loop terminates on `Approve & file` or `Skip (don't file)`.
- **On built-in "Other" free-text** (one-turn fast path — matches #400's Q1=A pattern): the operator can type revised content directly on the current G.6 fire without selecting `Make changes` first. The session applies the edit, re-fires G.6 once with the revised draft. Further edits require explicit `Make changes` selection.
- **Zero-directive `Make changes` is a no-op re-present** (matches #400's Q4=A pattern): empty follow-up → the session re-presents the same draft plus the same gate. Never implicit-approve; never implicit-skip. Every iteration requires an explicit operator choice.

**Post-gate behavior**: see § Add-issue flow (file-new path) for the full sequence — `Approve & file` runs `gh issue create --body-file` → `cockpit_scope_add` → `cockpit_queue(issue=…)` → ledger `filing-gate+scope-add · filed + queued (<new-ref>)`; `Skip (don't file)` writes ledger `<tracking-ref> · filing-gate · skipped (draft discarded)`; `Make changes` loops.

Under the `--new "<title>"` invocation form, the initial G.6 fire creates the tracking ref itself. On `Approve & file`, the ledger header is written after the create succeeds. On `Skip (don't file)` at the initial G.6, the run exits cleanly (no tracking ref created; ledger carries `form: tracking-new (abandoned before creation)`).

### G.7 — Scope-drained gate (epic-less exit)

**Trigger**: Under `invocationForm: tracking-existing | tracking-new`, every task-list ref of the tracking issue has a terminal disposition per `cockpit_status`'s classifier (Q1 anchor: `completed | not-planned`). The playbook does NOT re-derive terminality from raw GitHub states. **Does NOT fire under `invocationForm: epic`** — that path exits on `epic-complete`.

**Presentation** (in the same response as the `AskUserQuestion` call). The full epic status table per § L.4 policy is emitted immediately before this block:

```markdown
Scope drained for <tracking-ref> — every ref is terminal.

**Tracking ref:** <tracking-ref>
**Refs processed:** <N>
**Per-ref disposition:**
1. <owner>/<repo>#<m1> · <completed | not-planned>
2. <owner>/<repo>#<m2> · <completed | not-planned>
...

**Session-mute set:** <s> ref(s)
```

Per-ref disposition ordering is the same as the tracking issue's task-list markdown (first task first). Populated from `cockpit_status(issue=<tracking-ref>, json=true)`'s per-ref classifier.

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per G.7 fire (single-item `questions` array). Parameters:

- **Question text**: `Scope drained on <tracking-ref>. How to proceed?`
- **Header**: `Drain` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Keep watching (Recommended)` — return to main loop; re-arm `cockpit_await_events` on the tracking ref.
  2. `Add more work` — return to main loop with a follow-up prose prompt inviting the operator to file or add.
  3. `Finish (close tracking issue + summary)` — close tracking issue via `gh issue close <tracking-ref>`, print run summary per § L.6 (extended with per-ref disposition), exit zero. The G.7 pick IS the outward-facing confirmation (matches G.5's "gate IS the confirmation" pattern — no second gate).

**Default rationale (Q4 anchor)**: `Keep watching` is the reversible option; the mode's premise is that work arrives ad hoc — drained-for-now is not done. `Finish` closes the tracking issue (outward-facing, so gated regardless) and is always one explicit pick away.

**Post-gate behavior**:
- `Keep watching` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · keep-watching`; return to step 4.
- `Add more work` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · add-more-work`; emit prose prompt `What would you like to add? Reference an existing ref (e.g., "also process <ref>") or ask me to file a new issue (e.g., "file an issue for <topic>").`; return to step 4 (operator's next turn is processed by the intent-class recognizer per § Add-issue flow).
- `Finish` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · finish (tracking closed)`; then `gh issue close <tracking-ref>`; then print run summary per § L.6; exit zero. The ledger line is written BEFORE the close so the run summary can read it.

G.7 fires exactly once per drain event; subsequent drains (after `Keep watching` and further ad-hoc work reaching terminal) fire again as fresh gates.

## AskUserQuestion invocation contract

Every gate contract G.1–G.5 above emits an `AskUserQuestion` call. This section states the three general rules that govern every such invocation, so each gate contract can reference them rather than restating them inline. Every future gate G.6+ MUST reference this section as well.

**Rule 1 — Default gate shape.** `AskUserQuestion.questions` is a **single-item array** (one call per gate/batch). Each of G.1–G.5 emits exactly one item in its `questions` array — this is the load-bearing structural default. The array's length is the number of `AskUserQuestion.question` objects the caller wants answered in a single harness call; the default is one per gate.

**Rule 2 — Harness ceiling.** `AskUserQuestion.questions` array MUST NOT exceed **4 items** per call. This is a hard input-validation bound enforced by the Claude Code SDK harness: exceeding it returns the harness error `InputValidationError: Too big: expected array to have <=4 items (questions)` and forces a retry round-trip that costs correctness signal (duplicated presentation block in the transcript, laggy last item as it fires in a subsequent call). The playbook cannot change this bound — it is a property of the harness, not of the playbook — so the playbook must never write shape that violates it.

**Rule 3 — Multi-gate fanout.** When multiple gates fuse into one assistant response (five issues hitting a `waiting-for:*` label simultaneously, or a phase-boundary co-fire of verdict gates, or an escalation-gate co-fire), fire **multiple `AskUserQuestion` calls** in that one response — one call per gate — never a single fused call whose `questions` array carries every gate's item concatenated. The fanout dimension is the *number of `AskUserQuestion` calls*, not the length of a single call's `questions` array.

The three rules compose transitively: default 1 item per call (Rule 1) + ≤4 items per call (Rule 2) → the fanout mechanism is per-call fanout (Rule 3), and each call's `questions` array stays at 1 item per gate. The ceiling is a property of each individual call, not of the response as a whole; a response containing five `AskUserQuestion` calls each with `questions.length === 1` satisfies all three rules simultaneously.

Every gate contract G.1–G.5 in the preceding `## Gate contract` section carries a one-sentence `Per § AskUserQuestion invocation contract — …` reference in its `**Gate invocation**` paragraph. When a future gate G.6+ is added, its gate contract MUST also reference this section — the reference is the discovery path a future author reading only one gate contract follows to find the ceiling and the fanout rule.

## Ledger

**Format sentence** (verbatim):

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

or, using the mnemonic column names: `issue · transition · action · outcome`. The separator is the middle-dot ` · ` (U+00B7) with a single space on each side.

**Mandatory-per-dispatch rule** (#388 enforcement style, verbatim):

> A dispatch without a ledger line is a protocol violation.

**What counts as a "dispatch"**: any event line from `cockpit watch` that the parent processes (branches into the dispatch table); any event synthesized by the startup sweep; any escalation-gate retry that re-runs the fixer or re-presents the escalation gate; any session-mute skip.

**What does NOT count**: re-check calls that don't produce a dispatch decision; pre-flight failures (before the loop begins). Note: watch re-spawns DO ledger — the `watch-lifecycle · watch-respawn` rows in the § Action + outcome vocabulary table are mandatory per-attempt per FR-005 (post-#420 norm-shift; pre-#420 auto.md excluded re-arms from ledger accounting).

**Persistence rule (dual-write, unconditional)**:

Every ledger line is:
1. **Printed to the transcript** on its own line, prefixed with `[ledger] ` for visual scanning.
2. **Appended to the persistent file** at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`, one line per dispatch, in the exact `<issue-ref> · <transition-class> · <action> · <outcome>` format (no `[ledger] ` prefix in the file).

Write mechanism: `echo "<line>" >> .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` — one append per dispatch, no rewriting.

**Epic-ref-slug rule**: the epic reference with `/` replaced by `-` and `#` stripped (e.g., `christrudelpw/epic#42` → `christrudelpw-epic-42`).

**Timestamp format**: `YYYYMMDD-HHMMSS` in the operator's local time, captured at the start of the run (step 1).

**Idempotency rule (L.5 — startup sweep + live-state re-check)**: The startup sweep (step 3) + the live-state re-check (step 4a) guarantee that spawning `cockpit watch` twice on the same live state produces no duplicate action. Each synthetic event from the startup sweep produces its own ledger line, per the mandatory-per-dispatch rule. On watch re-arm (step 5), events streamed for state already dispatched are recognized as no-ops by the re-check step and dispatched only if the live state is still actionable.

### Action + outcome vocabulary (per dispatch row)

Stable strings per dispatch table row, so `grep` recipes on `<action>` / `<outcome>` are reliable.

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| D.1 clarification | `clarification-batch` | `advanced`, `posted <k>/<N>, skipped <s>`, `all answers skipped`, `error: <description>` |
| D.2 artifact-review | `review-analysis+advance` | `approved`, `advance failed`, `error: <description>` |
| D.2 artifact-review | `review-analysis+request-changes` | `posted (<anchored> inline, <unanchored> in body)` |
| D.2 artifact-review | `review-analysis+request-changes` | `postcondition-failed → re-present-gate` |
| D.2/D.3 review-verdict | `postcondition-passed` | `leg1=<n>/<n> · leg2=<m>/<n>` |
| D.2/D.3 review-verdict | `postcondition-failed` | `attempt=<1\|2> · leg1=<a>/<n> · leg2=<b>/<n>` (attempt=2 line appends ` · re-present-gate`) |
| D.2/D.3 review-verdict | `review-post-retry` | `attempt=1 · backoff=2s` |
| D.2 artifact-review | `review-analysis+abort` | `aborted` |
| D.3 implementation-review | (same as D.2) | (same as D.2) |
| D.4 manual-validation | `manual-validation-summary+advance` | `manually validated` |
| D.4 manual-validation | `manual-validation-summary+wait` | `not yet` |
| D.5 merge (green) | `merge` | `merged (PR #<n>)`, `blocked: missing-approval`, `blocked: draft`, `blocked: pending`, `blocked: missing-label`, `infrastructure failure — <checks>` |
| D.6 fixer | `fixer` | `fixed`, `unfixed → escalation` |
| D.6 fixer + escalation | `fixer+escalation-gate` | `retry`, `skip (session-local mute)`, `stop (exit)` |
| D.7 agent-error / failed | `escalation-gate` | `requeue (cockpit resume)`, `requeue failed: <description>`, `skip (session-local mute)`, `skip (cockpit resume unavailable — G-S8 prerequisite)`, `stop (exit)` |
| D.8 phase-complete | `phase-queue-gate` | `queued P<next> (<N> issues)`, `cancelled` |
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.9a pr-feedback | `(no-op)` | `server-side-owned` |
| D.9b children-complete | `(no-op)` | `server-side-owned` |
| D.9c dependencies | `(no-op)` | `server-side-owned` |
| D.9d phase:* | `(no-op)` | `engine-owned phase transition` |
| D.11 merge-conflicts | `escalation-gate` | `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
| § step 5 cursor recovery (Branch A) | `cursor-recovery` | `resetFrom · <N>`, `expiry · <N>`, `discarded · <N>` |
| § step 5 cursor recovery (Branch B) | `cursor-recovery` | `invalid-cursor · <N>` (e.g., `cursor-recovery · invalid-cursor · 1`) |
| § step 5 Branch B escalation | `escalation-gate` | `continue-degraded`, `stop (exit)` — G.4(e) operator decision; transition class is `invalid-cursor-streak` |
| Add-issue (add-existing intent) | `scope-add` | `queued`, `error: <description>` |
| Add-issue (file-new intent) | `filing-gate+scope-add` | `filed + queued (<new-ref>)`, `error: <description>`, `error: scope-add failed: <description>`, `error: queue failed: <description>` |
| G.6 filing gate (skip only — no ref filed) | `filing-gate` | `skipped (draft discarded)` |
| G.7 scope-drained gate | `scope-drained-gate` | `keep-watching`, `add-more-work`, `finish (tracking closed)`, `error: close failed: <description>` |
| D.8 phase-queue hold / queued-with-ad-hoc (non-empty ad-hoc list) | `phase-queue-gate` | `held (<M> ad-hoc open)`, `queued P<next> (<N> issues) with <M> ad-hoc open` |
| D.8 `openAdHocIssues` helper (failure only) | `openAdHocIssues` | `error: cockpit_status failed for <ref>: <description>` |
| mute-set hit | `(muted)` | `skip (session-local mute active)` |
| Watch lifecycle — arm-up (step 2) | `watch-lifecycle · spawn` | `armed`, `spawn failed: <description>` |
| Watch lifecycle — re-spawn (step 5 C5) | `watch-lifecycle · watch-respawn` | `attempt=<n> backoff=<b>s exit=<code>`, `attempt=<n> backoff=<b>s spawned`, `attempt=<n> backoff=<b>s spawn failed: <description>` |
| Heartbeat fire (step 4 C4) | `heartbeat · schedule-wakeup` | `fired · drain empty`, `fired · drain complete (<M> events)` |

The `<issue-ref>` slot of the three rows above carries the **`<epic-ref>`** (or the tracking ref under `--tracking` / `--new`, matching the ledger header line's `Tracking ref:` field) — the watch subprocess and heartbeat are epic-scoped, not per-issue.

### L.4 — Status table policy

The full epic status table (anchor: header row `| Issue | Phase | State |`) is emitted **only** at the following surfaces:

1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
3. **Escalation-gate presentations** (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) — the operator needs orientation before an escalation decision.
4. **Startup-sweep summary** (step 3) — session-start orientation is a real operator need; every resumed run starts with "where are things?". The sweep ends with exactly one full status table, then enters the main loop.
5. **Scope-drained gate G.7 presentation** — operator orientation before an exit decision in epic-less mode. Matches the escalation-gate rationale in surface 3.

Between phase boundaries, the ledger line is the sole record of a dispatch. No status table is emitted after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the five surfaces above.

### L.6 — Run summary at exit

On `epic-complete` exit (step 6), print a run summary paragraph and include the persistent ledger file's absolute path:

```text
Auto run complete.

Epic: <epic-ref> · Exited: epic-complete
Events dispatched: <N>
  · Clarification batches: <k1>
  · Review verdicts: <k2>
  · Manual-validation gates: <k3>
  · Phase-queue confirmations: <k4>
  · Merges: <k5> (<green>/<red>, <fixer runs>)
  · Escalations: <k6>
  · Cursor recoveries: <k7> (by class: invalid-cursor=<a>, resetFrom=<b>, expiry=<c>, discarded=<d>)
  · Cursor-recovery escalations: <k8> (continue-degraded=<x>, stop=<y>)
Scope growth: started with <N>, added <M>, completed <K>
Per-ref disposition:
  · <owner>/<repo>#<m1> · <completed | not-planned>
  · <owner>/<repo>#<m2> · <completed | not-planned>
  ...
Muted issues (session-local): <s>
Ledger file: <absolute path to .ledger file>
```

Counts are derived from the ledger file (or the in-memory count if the file is unavailable). Non-`epic-complete` exits (Stop from an escalation gate, pre-flight failure) print an abbreviated summary with the exit reason.

**`Scope growth:` line (unconditional)**. Emitted in every run summary, including runs with zero scope activity (e.g., an epic-less run closed at the initial G.7 without any adds still prints `Scope growth: started with 0, added 0, completed 0`).
- `started with N` — count of task-list refs at run start. Epic mode: count of synthetic events from step 3 startup sweep. Epic-less: count of task-list refs on the tracking issue at step 3.
- `added M` — count of `scope-add · queued` action lines PLUS count of `filing-gate+scope-add · filed + queued (…)` action lines. **Excludes** `filing-gate · skipped` outcomes and any `filing-gate+scope-add · error: …` outcomes.
- `completed K` — count of `merge · merged (…)` action lines PLUS any `epic-complete` action line for the tracking ref itself. Epic-less mode: count of task-list refs classified `completed | not-planned` per `cockpit_status` at exit time.

**`Per-ref disposition:` block (epic-less only)**. Emitted only under `invocationForm: tracking-existing | tracking-new`. Under epic mode the block is OMITTED entirely (the phase-based structure supplies the "who did what" reading; per-ref disposition would be noise). Ordering matches the tracking issue's task-list markdown; content is the same per-ref list the G.7 gate presented, reused verbatim so the summary and the gate cannot drift.

## Invariants

1. **Never merge on red.** `completed:validate` + green routes straight to `cockpit merge`; anything red routes through the bounded-fixer branch and, if still red, the escalation gate. The branch exits `0` only on `result: merged`.
2. **Cockpit comments marked.** Every comment the playbook posts to an issue or PR carries the `<!-- generacy-cockpit:… -->` prefix marker (e.g., `<!-- generacy-cockpit:clarification-answers -->`).
3. **Add-only advance.** `Skip` in every escalation gate is **session-local mute only** — labels are untouched, `cockpit advance` is never called with a fake-skip flag. A muted issue resurfaces in the next auto run's startup sweep.
4. **No cross-slash-command invocation** from `auto.md`. Cross-command composition is CLI verb (`generacy cockpit …`) + subagent boundary only. No `/cockpit:*`, `/code-review`, or `/speckit:*` invocation from the parent's execution path.
5. **Analysis in subagents** whose contracts end with the subagent — the #390 pattern. All four analysis workloads (clarification drafting, review verdict, manual-validation summary, bounded fixer) live inside `subagent_type: "general-purpose"` hops with strict-JSON returns.
6. **Autonomy *policy* out of scope.** Per-gate auto-approve and "full auto" mode are explicitly out of scope in v1. Every gate prompts; none auto-proceed.
7. **Stream consumption is unfiltered.** Every non-empty line from `cockpit watch` is an event; content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.
8. **Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose. Playbook edits that add per-event output — a `cockpit_status` re-check, an epic status table, a prose recap — on a ledger-only row are efficiency regressions.
9. **MCP-tool-only invariant.** After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form — every dispatch of the six migrated verbs (`status`, `context`, `queue`, `advance`, `resume`, `merge`) goes through its `cockpit_*` MCP tool. Playbook edits that reintroduce the Bash form are drift regressions.

## Examples

### Example 1 — End-to-end run on a synthetic 2-phase epic

Command: `/cockpit:auto christrudelpw/epic#42`

Run shape:

1. **Sensor arm-up** — step 2 spawns `generacy cockpit watch christrudelpw/epic#42` under harness `Monitor`.
   - Ledger: `christrudelpw/epic#42 · watch-lifecycle · spawn · armed`.
2. **Startup sweep** — the parent verifies the seven `cockpit_*` MCP tools are present, then calls `cockpit_status(epic="christrudelpw/epic#42", json=true)` and finds P1 has three actionable children: `#43` in `waiting-for:clarification`, `#44` in `waiting-for:implementation-review`, `#45` in `waiting-for:manual-validation`. Each is dispatched in order.
2. **D.1 for #43** — clarification drafter subagent → fused batch gate with N=3 questions (`ceil(3/4) = 1` `AskUserQuestion` call in one response) → all approved → post + `cockpit_advance(issue="christrudelpw/epic#43", gate="clarification")`.
   - Ledger: `christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · advanced`.
3. **D.3 for #44** — review analyzer subagent (`gh pr diff` inside the subagent) → zero findings → fused verdict gate with `Suggested decision: approve` → operator selects `approve` → `cockpit_advance(issue="christrudelpw/epic#44", gate="implementation-review")`.
   - Ledger: `christrudelpw/epic#44 · waiting-for:implementation-review · review-analysis+advance · approved`.
4. **D.4 for #45** — manual-validation summarizer subagent → confirm gate (scenarios + acceptance_checks) → operator selects `manually validated` → `cockpit_advance(issue="christrudelpw/epic#45", gate="manual-validation")`.
   - Ledger: `christrudelpw/epic#45 · waiting-for:manual-validation · manual-validation-summary+advance · manually validated`.
5. **Main loop begins** — `cockpit_await_events` returns a batch containing `christrudelpw/epic#44 · completed:validate` (checks all green).
6. **D.5 for #44** — `cockpit_merge(issue="christrudelpw/epic#44")` → `result: merged` → PR #<n> merged (squash, branch delete).
   - Ledger: `christrudelpw/epic#44 · completed:validate · merge · merged (PR #46)`.
7. Similar for #43, #45.
8. **Quiet interval** — no watch line arrives for ~5 minutes while the phase's remaining CI runs. The C4 heartbeat fires; the drain returns zero events.
   - Ledger: `christrudelpw/epic#42 · heartbeat · schedule-wakeup · fired · drain empty`.
9. `cockpit_await_events` returns a batch containing `christrudelpw/epic#42 · phase-complete`.
9. **D.8 phase-queue confirmation** — presentation shows P2 with 4 issues → operator selects `Queue P2 (4 issues)` → `cockpit_queue(epic="christrudelpw/epic#42", phase="P2")`.
   - Ledger: `christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (4 issues)`.
10. P2 runs to completion the same way.
11. `cockpit_await_events` returns a batch containing `christrudelpw/epic#42 · epic-complete`.
12. **Exit** — parent prints the run summary per L.6 with the ledger file's absolute path, exits zero.

### Example 2 — Clarification batch gate with N=6 open questions

Trigger: D.1 for `christrudelpw/epic#43` with 6 open clarifications.

The subagent returns 6 drafted answers in one JSON array (`{question_id, recommendation, justification, provenance}` per entry). The parent parses `clarificationComment.body` for the per-question `{title, context, question, options}` and renders a five-element block per question:

```markdown
Drafted answers for christrudelpw/epic#43 (6 open questions):

### Q1 — What auth mode?
**Context:** The client needs to negotiate auth without a shared secret pre-provisioned.
**Question:** Which auth mode should the client default to?
**Options:** A — OAuth device flow, B — API key from environment, C — mTLS
**Recommendation:** A — OAuth device flow
**Why:** Device flow works in headless contexts and doesn't need a pre-shared secret. API key requires operator provisioning per install; mTLS demands certificate distribution.
_provenance: spec.md § Auth_

### Q2 — Timeout policy?
**Context:** ...
**Question:** ...
**Options:** ...
**Recommendation:** ...
**Why:** ...
_provenance: plan.md § Timeouts_

... (Q3 through Q6)
```

Then, **in the same assistant response**, **exactly one** `AskUserQuestion` call fires (never fanned out) with header `Clarify` and options `Approve all & post (Recommended)` / `Make changes` / `Skip this batch`.

Operator responses (illustrative): operator selects `Make changes` and types:

```
Q3: skip
Q5: B — because we validated this shape in the pilot
Q6: skip
```

The parser (§ Directive grammar) produces three directives — `{skip Q3}`, `{edit Q5, answer=<option-B text>, rationale="because we validated this shape in the pilot"}`, `{skip Q6}`. The parent re-presents only Q3, Q5, Q6 (Q3 marked skipped, Q5 with updated recommendation + rationale, Q6 marked skipped) plus the same three-option batch gate. Operator selects `Approve all & post`.

Post-gate: post the assembled comment with Q1/Q2/Q4/Q5 (4 answers, Q5 with the edited answer/rationale); do not advance (2 skipped).

Ledger: `christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · posted 4/6, skipped 2`.

### Example 3 — Validate-red with fixer that returns unfixed, followed by G.4a Retry

Trigger: `christrudelpw/epic#44` enters `completed:validate` with `checks_state: "red"` (one failing test in `packages/foo/tests/bar.test.ts`).

Flow:

1. **D.6** — classify checks (test failure, repo-owned CI class ✓), spawn bounded fixer subagent.
2. Fixer returns:
   ```json
   {"fixed": false, "summary": "attempted to fix bar.test.ts assertion; the underlying failure is a race between two callbacks that requires a design decision on ordering guarantees", "reason": "ambiguous root cause — design judgment required"}
   ```
3. Ledger: `christrudelpw/epic#44 · completed:validate:red · fixer · unfixed → escalation`.
4. **G.4a escalation gate** presentation:
   ```markdown
   Fixer could not resolve christrudelpw/epic#44 (PR christrudelpw/repo#46):

   attempted to fix bar.test.ts assertion; the underlying failure is a race between two callbacks that requires a design decision on ordering guarantees

   Reason (from fixer): ambiguous root cause — design judgment required

   Failing checks: test:bar
   ```
   Single `AskUserQuestion` with options `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
5. Operator selects `Retry`. Fixer re-runs once (new dispatch, new ledger line).
6. Ledger: `christrudelpw/epic#44 · completed:validate:red · fixer+escalation-gate · retry`.

### Example 4 — `agent:error` with G.4b Requeue → `cockpit_resume`

Trigger: `christrudelpw/epic#47` enters `agent:error` (bot-authored alert comment posted with failure trace per #865's shape).

Flow:

1. **D.7** — fetch evidence via `cockpit_context(issue="christrudelpw/epic#47")`.
2. **G.4b escalation gate** presentation:
   ```markdown
   Agent error on christrudelpw/epic#47:

   Runner reported: process exited 137 after 90s (OOM). Retry may succeed on a fresh runner.
   ```
   Single `AskUserQuestion` with options `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`.
3. Operator selects `Requeue`.
4. Parent calls `cockpit_resume(issue="christrudelpw/epic#47")`.
5. Ledger: `christrudelpw/epic#47 · agent:error · escalation-gate · requeue (cockpit resume)`.

If `cockpit_resume` were not available (G-S8 didn't ship the tool, per Assumption A2), Requeue would degrade to Skip with an explicit ledger note: `christrudelpw/epic#47 · agent:error · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

### Example 5 — Epic-less stabilization run with G.6 filing gates and G.7 scope-drained exit

Command: `/cockpit:auto --tracking generacy-ai/agency#100`

Run shape (epic-less, `invocationForm: tracking-existing`):

1. **Startup** — step 1 prints `Tracking ref: generacy-ai/agency#100 · form: tracking-existing`; writes the same as the ledger header. Step 3 startup sweep reads the tracking issue's task list via `cockpit_status(issue="generacy-ai/agency#100", json=true)` and finds it empty (this is a fresh stabilization run). Main loop begins with zero synthetic events.
2. **Add-existing intent (mid-run)** — the operator types `also process generacy-ai/agency#420`. Parser (`parseAddExistingIntent`) returns `{ref: "generacy-ai/agency#420"}`. Session calls `cockpit_scope_add(scopeRoot="generacy-ai/agency#100", addRef="generacy-ai/agency#420")` then `cockpit_queue(issue="generacy-ai/agency#420")`. **No gate.**
   - Ledger: `generacy-ai/agency#420 · scope-add · queued`.
3. **File-new intent #1 (mid-run)** — the operator types `file an issue for the flaky test in module foo`. Parser (`parseFileNewIntent`) returns `{topic: "the flaky test in module foo"}`. Drafter subagent returns `{title, body, labels}`. G.6 fires with the five-element block. Operator selects `Approve & file`.
   - `gh issue create --title "..." --body-file /tmp/cockpit-auto-file-generacy-ai-agency-100-1720905600.md` returns `generacy-ai/agency#421`.
   - `cockpit_scope_add(scopeRoot="generacy-ai/agency#100", addRef="generacy-ai/agency#421")` succeeds; `cockpit_queue(issue="generacy-ai/agency#421")` succeeds.
   - Ledger: `generacy-ai/agency#421 · filing-gate+scope-add · filed + queued (generacy-ai/agency#421)`.
4. **File-new intent #2 skipped at G.6** — the operator types `open a bug for the retry-helper timeout`. Drafter returns a draft; G.6 fires; operator selects `Skip (don't file)` after reading the draft.
   - Ledger: `generacy-ai/agency#100 · filing-gate · skipped (draft discarded)` (the tracking ref sits in the left slot because no new ref was assigned).
5. **All three refs (from steps 2, 3, and one more via a subsequent add-existing) reach terminal** (mix of merges and `not-planned` closures). `cockpit_await_events` returns nothing more actionable; the parent detects scope-drain via `cockpit_status`'s classifier.
6. **G.7 fires (first drain)** — presentation shows `Refs processed: 3`, per-ref disposition `#420 · completed`, `#421 · completed`, `#422 · not-planned`. Operator selects `Keep watching`.
   - Ledger: `generacy-ai/agency#100 · scope-drained · scope-drained-gate · keep-watching`.
7. Loop resumes; the operator does no further adds. `cockpit_await_events` returns no events on the tracking ref for several iterations. `cockpit_status` still reports every ref terminal → **G.7 fires again**.
8. **G.7 (second drain)** — operator selects `Finish (close tracking issue + summary)`.
   - Ledger: `generacy-ai/agency#100 · scope-drained · scope-drained-gate · finish (tracking closed)` (written BEFORE the close so the run summary can read it).
   - `gh issue close generacy-ai/agency#100` succeeds.
   - Run summary per § L.6 with `Scope growth: started with 0, added 3, completed 3` and the per-ref disposition block:
     ```text
     Per-ref disposition:
       · generacy-ai/agency#420 · completed
       · generacy-ai/agency#421 · completed
       · generacy-ai/agency#422 · not-planned
     ```
   - Exit zero.

<!-- BEGIN error-conv -->
**Error handling** — When a Bash CLI exit code is non-zero (or a pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class. This block covers the remaining Bash CLI invocations (`gh` for issue comment posting; `git` for local ledger writes). Cockpit MCP tool typed errors surface at their call sites (`code`/`message`/`details` structured fields), not through this regex classifier — the tool-presence check in step 3 handles tool absence with its own load-bearing ledger line.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight for a required Bash CLI (`gh` for issue comment posting, `git` for local ledger writes) returned non-zero. Print: `A required CLI (\`gh\`, \`git\`) is required but is not on $PATH. In a Generacy cluster session common CLIs are already installed — add them to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install the specific CLI via your platform's package manager.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The required CLI needs GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->
