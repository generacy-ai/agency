# Research: Monitor-driven wake-ups for `/cockpit:auto`

Technology and design decisions with rationale. This document backs the choices summarized in `plan.md § Key Technical Decisions`.

## Context

The pre-#406 design of `/cockpit:auto` used the harness `Monitor` tool as a background sensor: `generacy cockpit watch <epic-ref>` ran under Monitor, and the model was re-invoked only when the child process emitted a stdout line. Idle waiting cost zero tokens. #406 replaced this with a per-iteration long-poll of `cockpit_await_events(maxWaitMs=55000)` — which brought stronger typed-event semantics (cursor bookkeeping, ordering, coalescing, `initial: true` handling) but made every poll a full model turn.

The dogfood run (snappoll epic, 12/12 issues merged) proved the cost: 110 polling turns of which 34 (31%) returned zero events, totalling ~41.8M cache-read tokens (~$13) for a *small* epic. Cost scales linearly with wall-clock quiet time *and* with session length (context re-read grows with the run).

This feature restores the pre-#406 sensor model without giving up the post-#406 typed-batch semantics.

## Decision 1: Doorbell + typed-batch fetcher (vs. NDJSON-only rewrite)

**Chosen**: Monitor wakes the loop on each NDJSON line, and the loop then calls `cockpit_await_events` to drain the typed batch. The NDJSON content is a doorbell only — never parsed by the loop.

**Alternatives considered**:

- **Full NDJSON parser in the loop** — would require reintroducing the field-based filter that #394 documents as the failure mode #406 was designed to fix (an "ill-shaped consumer" of the NDJSON stream). Rejected: this feature is explicitly a wake-source swap, not an event-protocol rewrite (US3).
- **Hybrid: NDJSON classifies, MCP fetches only for actionable classes** — introduces a content-based filter over the stream, violating `auto.md § Invariants #7`. Rejected on invariant grounds.

**Rationale**: The MCP typed-batch is already the source of truth for events (cursors, coalescing, `initial: true`, dispatch shape). Monitor's job is to eliminate token cost during quiet time. Keeping the two orthogonal — Monitor = "something happened," MCP = "here's what" — is the smallest possible change that solves the token-cost problem.

## Decision 2: `ScheduleWakeup` heartbeat (vs. long `cockpit_await_events`)

**Chosen**: 5-minute `ScheduleWakeup` fires as a belt-and-braces heartbeat when Monitor is silent. Zero token cost until fire.

**Alternatives considered**:

- **55s long `cockpit_await_events` heartbeat** — every fire burns one polling turn, reintroducing the ~1-turn/minute cost the run measured. Rejected on the same grounds as the whole rewrite: it undermines SC-001 (≥90% drop in polling turns).
- **15-minute `ScheduleWakeup`** — saves a handful of heartbeat turns but triples watch-death detection time (~15m30s worst case). Rejected: the additional stranding time isn't worth the marginal savings.

**Rationale**: Per Q1=A clarification, ScheduleWakeup is the only mechanism that costs nothing until it fires — which *is* the point of the rewrite. At 5-minute cadence, a 30-minute quiet phase costs at most 6 heartbeat turns vs. ~33 today (-82% on the heartbeat channel alone). Detection of a dead watch is bounded at ~5m30s (heartbeat + one drain).

**Implementation note**: `ScheduleWakeup(delaySeconds=300, prompt=..., reason=...)` — the harness clamps to `[60, 3600]`; 300 is at the low end. The `prompt` field re-enters the auto loop verbatim. The `reason` field surfaces to the operator ("armed 5-minute heartbeat while Monitor silent") for user-visible accounting.

## Decision 3: `maxWaitMs=1` on wake-driven drains (vs. `maxWaitMs=0` engine change)

**Chosen**: Use the smallest currently-accepted `maxWaitMs` value (e.g., `1` ms) on wake-driven drains. No engine change required.

**Alternatives considered**:

- **`maxWaitMs=0` (true non-blocking)** — would require a one-line change in the generacy MCP engine, plus a companion-issue dependency train blocking this PR. Rejected: Q2=C — one millisecond is negligible against the polling-turn savings.
- **In-scope engine tweak in the same PR** — the engine lives in `generacy`, not this repo. Cross-repo PRs aren't a shape this project ships. Rejected on repo boundaries alone.

**Rationale**: The functional difference between `maxWaitMs=0` and `maxWaitMs=1` is 1ms per wake-driven drain. On a session with tens of wakes, this is single-digit milliseconds total — invisible against the token savings. If the engine gains true zero later, the playbook can adopt it as a one-line follow-up; no blocker here.

## Decision 4: Hard-fail pre-flight (vs. graceful fallback)

**Chosen**: Pre-flight check for harness `Monitor` availability runs before any state-changing tool calls. On absence: print a clear error naming the requirement, direct operators to `/cockpit:watch`, `/cockpit:status`, `/cockpit:advance` as the manual path, exit non-zero.

**Alternatives considered**:

- **Graceful fallback to long-poll `cockpit_await_events` with a warning banner** — resurrects the code path this feature is meant to retire. Rejected on the Q3=A rationale: the #86/#800/#801 chain was born from a "graceful fallback" that lived on forever as rarely-exercised dark surface, silently masking defects.
- **Reduced-polling mode (heartbeat only, no Monitor)** — an intermediate fallback that still ships the dark surface. Rejected on the same grounds.

**Rationale**: Rev 3 of the epic-cockpit plan learned this the hard way. A pre-flight check is cheap, runs at startup before any state changes, and the assist commands are a fully supported manual path. Better to force an upgrade than to ship two subtly-different execution modes forever.

**Implementation note**: The check runs at the top of step 1, before ledger creation. It complements the existing cockpit-MCP-tools presence check at the top of step 3 (see `auto.md` lines 39–44). Both checks share the fail-loud pattern: ledger + print + exit; no operator prompt (a prompt whose every option means "abort" is not a decision).

## Decision 5: Unbounded exponential-backoff re-spawn, ceiling at heartbeat interval

**Chosen**: On Monitor exit, re-spawn `generacy cockpit watch <epic-ref>` under Monitor with exponential backoff starting at 1s and doubling (1s → 2s → 4s → 8s → …), capping at 5 minutes (the heartbeat interval). Unlimited retries. Each re-spawn attempt and its outcome print in the user-visible output.

**Alternatives considered**:

- **Bounded retries (e.g., 3 attempts within one heartbeat, then fail the run)** — any hard cap eventually kills a healthy long run over a transient. Rejected: watch exits are documented-normal (session tool timeouts; re-arms are idempotent).
- **Bounded + fallback to long-poll after N failures** — resurrects the code path being deleted. Rejected on the same dark-surface argument as Decision 4.
- **60-second backoff ceiling** — traditional but arbitrary. Rejected in favor of tying the ceiling to the heartbeat interval so pathological cases can't cost more than what the fallback already accepts.

**Rationale**: The ceiling at heartbeat interval is the load-bearing detail. Even if the watch is persistently broken (e.g., binary missing, auth wedged), re-spawn attempts fire at most once every 5 minutes — the same cadence as the heartbeat, which is already the accepted worst-case cost. A pathologically-dead watch degrades to *exactly* heartbeat cost, not multiples of it.

**User-visibility requirement**: FR-005 mandates that re-spawn attempts and outcomes are printed. The transcript output is the user-visible surface (the ledger also captures the record for post-run analysis). A persistently-broken watch stays loud — the operator sees `[watch] respawn attempt 5 · backoff 60s · exited immediately with code 127` and can intervene.

## Decision 6: No client-side debounce; reuse `coalesceWindowMs`

**Chosen**: On each Monitor-delivered wake, call `cockpit_await_events(..., coalesceWindowMs=3000)`. Bursts are batched at the MCP layer. No client-side debounce.

**Alternatives considered**:

- **Fixed 500ms client-side debounce** — after a watch line, hold for the debounce window; fold in any lines that arrive. Rejected: waiting is itself a turn in a playbook (there's no free background sleep between tool calls). The debounce would cost what it was supposed to save.
- **No coalescing at all** — each watch line triggers one wake, each wake is a full model turn. Rejected on burst-amplification grounds: a phase transition that stamps many labels in seconds would blow past the SC-001 target.

**Rationale**: Q5=C — Monitor already semi-coalesces naturally (lines arriving during a turn are delivered with the next wake), and the MCP layer already owns burst-batching via `coalesceWindowMs`. Reusing the existing mechanism adds zero new machinery — "the plugin narrates, the engine decides."

## Implementation Patterns

Three patterns govern the edits to `auto.md`:

### Pattern A: Pre-flight tool-presence checks

Two presence checks fire before any state-changing tool calls:

1. **Harness `Monitor` availability** (NEW in this feature) — at the top of step 1, before ledger directory creation. Fail path: ledger not yet created; print error + exit non-zero. Guidance points to `/cockpit:watch`, `/cockpit:status`, `/cockpit:advance` as the manual path.
2. **Cockpit MCP tools binding** (EXISTING, unchanged) — at the top of step 3, before startup-sweep dispatch. Fail path: ledger already created; append `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` + print + exit.

Both follow the "ledger + print + exit only; no operator prompt" contract.

### Pattern B: Wake-driven main loop

Post-#420, step 4's iteration shape is:

```
per iteration:
  wait for wake signal (Monitor line OR ScheduleWakeup fire)
  arm ScheduleWakeup(delaySeconds=300, ...) to fire again in 5m if still silent
  call cockpit_await_events(epic, cursor, maxWaitMs=1, coalesceWindowMs=3000)
  consume batch in stream order (dispatch table unchanged)
  advance in-memory cursor to batch.nextCursor
  (fall through to next wake wait)
```

The `maxWaitMs=1` is the load-bearing choice — the drain is effectively non-blocking. The only per-iteration blocking is the harness's own wake-wait, which costs zero tokens.

### Pattern C: Watch process lifecycle

Step 2's Monitor arm-up and step 5's re-spawn form a single lifecycle:

```
arm-up (step 2):
  Monitor.spawn("generacy cockpit watch <epic-ref>")
  print "[watch] armed under Monitor"
  ledger: "<epic-ref> · watch-lifecycle · spawn · armed"

per Monitor-exit event:
  print "[watch] Monitor reported exit · code=<c> · backoff=<b>s"
  ledger: "<epic-ref> · watch-lifecycle · watch-respawn · attempt=<n> backoff=<b>s"
  sleep <b> seconds (via ScheduleWakeup or inline Bash sleep — see note)
  Monitor.spawn("generacy cockpit watch <epic-ref>") again
  double the backoff (1 → 2 → 4 → 8 → …), cap at 300
```

**Backoff-sleep note**: The 1s / 2s / 4s / 8s / 16s / 32s / 64s / 128s / 256s / 300s ceiling means initial retries fit inside a single turn (Bash sleep is fine and typical). Once the backoff climbs past ~60s, `ScheduleWakeup` becomes preferable so the wait doesn't burn a turn's context. The prose in `auto.md` will name both mechanisms and let the model pick based on the current backoff.

**Reset rule**: On any successful `cockpit_await_events` return following a Monitor-delivered wake with events dispatched, reset the backoff counter to 1s. A watch that came back to life resets the ceiling walk.

## Sources and References

- **Regression origin**: `agency#406` — replaced Monitor sensor with MCP long-poll loop.
- **Original sensor/actuator intent**: tetrad-development `docs/epic-cockpit-plan.md` rev 3, §Architecture ("Monitor runs `generacy cockpit watch`").
- **Snappoll dogfood transcript + ledger**: `snappoll-orchestrator-1` session file `~/.claude/projects/-workspaces-snappoll/1d0df76b….jsonl` — the 110-poll / 34-empty / 41.8M-token baseline.
- **Dark-surface fallback lineage**: `#86 → #800 → #801` chain, cited in the Q3 clarification rationale.
- **Existing pre-flight pattern**: `packages/claude-plugin-cockpit/commands/auto.md` lines 39–44 (cockpit-MCP-tools check), lines 31 (git-repo + `mkdir -p` ledger dir check).
- **Existing NDJSON emission contract**: `packages/claude-plugin-cockpit/commands/watch.md` §Instructions (one line per state transition on stdout; exit handling).
