# Contract: `cockpit_await_events` long-poll loop

**Feature**: #406
**Owning surface**: `commands/auto.md` § Instructions steps 2, 4, 5
**Owned by**: This branch (`406-follow-up-generacy-ai`)
**Anchored FRs**: FR-002, FR-003
**Anchored SCs**: SC-003

## Summary

Replaces `auto.md`'s Bash-`run_in_background` `cockpit watch` + Monitor tool primitive event-plumbing with a single-turn `cockpit_await_events` long-poll loop. One tool call per iteration returns a coalesced batch of events; each batch is one dispatch round. The cursor is in-memory only; recovery paths converge on the startup sweep.

## Tool-call shape

```
cockpit_await_events(
    epic: <epic-ref>,
    cursor?: <string | null>,     # null on first call and after any recovery
    maxWaitMs?: 55000,            # generacy#917 default
    coalesceWindowMs?: 3000,      # generacy#917 default — events within this window are batched
    maxBatchSize?: 256            # soft-cap; the server may return fewer even when more are queued
)

Returns: { events: Event[], nextCursor: string, resetFrom?: true }
    or:  Typed error (invalid-cursor / expired / other)
```

## Loop shape

```
# Step 3 (startup sweep) has already run and armed the operator's session.
cursor = null   # in-memory only

loop:
    result = cockpit_await_events(epic, cursor, maxWaitMs=55000, coalesceWindowMs=3000, maxBatchSize=256)

    if result is typed error:
        if result.code == "invalid-cursor":
            # Fail-loud (caller bug — cursor from a prior loop leaked). Run recovery.
            recover()
            cursor = null
            continue
        else:
            # Any other typed error is a hard fault at the event-consumption boundary.
            apply § Error handling class OTHER; ledger line; continue.

    if result.resetFrom:
        recover()
        cursor = null
        continue

    if result.events is empty:
        # Long-poll returned without new events after maxWaitMs. Not a dispatch round; loop.
        continue

    # One batch = one dispatch round.
    for event in result.events (in stream order — no field-based filter):
        (a) if event's transition class ∈ {D.9, D.9a, D.9b, D.9c, D.9d} (ledger-only):
                write one ledger line per § Ledger; do NOT re-check live state per § Invariants §8
                continue
        (b) re-check live state via cockpit_status(epic, json=true)
        (c) if live state == "epic-complete": break outer loop; go to step 6
        (d) dispatch per § Dispatch, branching on live transition class
        (e) write one ledger line per § Ledger

    cursor = result.nextCursor
```

**Where `recover()` is**:

```
recover():
    # Same mechanism as step 3's startup sweep, run mid-loop.
    call cockpit_status(epic, json=true)
    for each issue in D.1–D.9 transition class in the returned state:
        treat as synthetic event; dispatch (per § Dispatch); write ledger line
```

## Cursor lifecycle

**States** (per `data-model.md` § CursorState):

- `cursorless` — session start or post-recovery. Next `cockpit_await_events` call sends `cursor: null`.
- `armed` — a successful `cockpit_await_events` return has provided `nextCursor`. Next call sends `cursor: <value>`.
- `invalid` — the tool boundary returned `invalid-cursor` OR the tool returned `resetFrom: true` OR the cursor expired. Trigger recovery.

**Transitions**:

- Session start → `cursorless`.
- Successful call returns non-empty batch → `cursorless` or `armed` → `armed { value: batch.nextCursor }`.
- Successful call returns empty batch (long-poll timeout) → cursor state unchanged.
- `invalid-cursor` typed error → `invalid { reason: "invalid-cursor" }` → run `recover()` → `cursorless`.
- `resetFrom: true` in return → `invalid { reason: "resetFrom" }` → run `recover()` → `cursorless`.
- Cursor expiry (typed error) → `invalid { reason: "expired" }` → run `recover()` → `cursorless`.

**Forbidden**: any transition that writes the cursor to disk. Any transition that reconstructs the cursor from the ledger file. See `data-model.md` § VR-4 and 406-4 for the machine-checkable anchor.

## Batch semantics

- **Batch = one dispatch round.** The parent's turn accounting is per-batch, not per-event. This is what cuts SC-003's dispatch rounds from ~100 to ~50 on a comparable 12-issue epic — events that would have arrived as separate NDJSON lines within the `coalesceWindowMs=3000` window are consumed as one batch.
- **Order preservation.** Events within a batch are dispatched in the order the tool returned them. No re-sorting. No field-based filtering.
- **Ledger-only events under §8's cost contract.** A batch containing only ledger-only events (D.9, D.9a, D.9b, D.9c, D.9d transition classes) is exactly N ledger appends and nothing else — no per-event `cockpit_status` re-check. This preserves #403's cost contract.
- **Mixed batches.** A batch may contain both ledger-only and actionable events. Actionable events trigger the re-check per §8; ledger-only events skip the re-check. The `for event in result.events` loop above encodes this uniformly.

## Live-state re-check (step 4a)

Preserved from pre-#406 auto.md. On actionable events (D.1–D.8, D.10, D.11), the re-check is mandatory. This is the loop-trust-boundary principle from #394: streamed lines (now, batched events) are advisory; live state is authoritative.

**One re-check per actionable event** in the batch. When multiple actionable events share a live state (unlikely but possible under coalescing), the re-check per event still fires — the deduplication is idempotency-driven (the dispatch's action is a no-op if state moved on), not skipped by design. This preserves the "state moved on" catch that motivates the re-check.

## What's retired

- **Step 2's `run_in_background: true` `generacy cockpit watch` spawn.** No background process; no process handle to capture.
- **Step 4's stream reader.** No NDJSON line-buffered read; no 30-second bounded per-iteration read; no `.+` unfiltered-line pattern.
- **Step 4's Monitor tool primitive.** Not used.
- **Step 5's process-death re-arm branch.** No process to die; no re-spawn.
- **Step 5's compound liveness cross-check (N=4 empty reads + actionable live state).** The tool server owns "silent stall" detection at the `maxWaitMs` boundary; the parent's N=4 counter is unnecessary.

## What's preserved (verbatim, from #394 / #396 / #403)

- **§ Invariants #7 (unfiltered stream)**: annotated to note the event-consumption boundary now runs through `cockpit_await_events`'s typed batch return. The rule's intent — no content-based filtering that could silently drop legitimate events — is preserved by consuming every event in the returned batch in stream order (no field- or shape-based filter over batch elements). The rule still applies to `watch.md`'s NDJSON consumption (out-of-scope for #406).
- **§ Invariants #8 (ledger-only cost contract)**: a batch of only ledger-only events is one ledger append per event and no other tool calls. See `contracts/mcp-tool-migration.md` § Playbook-level integration rules R3.
- **§ Ledger L.4 (status table policy)**: unchanged. The four permitted surfaces (phase-complete, epic-complete, escalation-gate presentations, startup-sweep summary) remain the only places a full epic status table is emitted.
- **§ Ledger mandatory-per-dispatch rule**: unchanged. Each event dispatched writes exactly one ledger line, including ledger-only events.

## Interaction with recovery

**Trigger**: any `invalid` cursor state.

**Effect**: run the recovery per the loop shape above. The recovery is the same mechanism as step 3's startup sweep, so the code path is byte-identical.

**Idempotency**: the recovery + subsequent cursor-less `cockpit_await_events` call is safe against duplicate delivery. Any event the tool server re-sends after a recovery whose state already moved on is caught by the re-check at step 4a — the dispatch's action is a no-op.

**Ledger line for the recovery event**: the recovery is not a per-event dispatch; it's a synthetic-event burst driven by the startup sweep. Each synthetic event produces its own ledger line per § Ledger's mandatory-per-dispatch rule. There is no separate "recovery" ledger action — the recovery IS the sweep.

## What's out of scope for this contract

- Tool server implementation of `cockpit_await_events` (owned by generacy#917).
- The exact `nextCursor` encoding (opaque to the playbook).
- Retention policy for cursors (owned by generacy#917).
- The `watch` verb (out-of-scope per Q4 clarification).
