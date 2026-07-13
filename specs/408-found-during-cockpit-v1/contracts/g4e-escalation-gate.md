# Contract: § Gate contract G.4(e) — consecutive `invalid-cursor` fault escalation

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` — new H3 subsection `### G.4(e) — Escalation: consecutive \`invalid-cursor\` fault` within the `## Gate contract` H2 section, plus a row in the `## Gate contract` opening table.

## Trigger

Fires when § step 5 Branch B evaluates: `invalid-cursor` counter ≥ 2 AND the current streak has not yet been operator-acknowledged (Q4=A decide-once). Verbatim state anchor: the `invalid-cursor` consecutive-fault counter reaches 2 on the second consecutive `invalid-cursor` typed error from `cockpit_await_events` with no intervening successful cursor reuse.

## Options

Exactly two, discrete, in this order:

1. `Continue degraded (sweep-per-batch) (Recommended)` — accept the degraded loop; decide-once for the current unhealed streak (the gate does NOT re-fire on subsequent `invalid-cursor` within the same streak). The counter continues to increment for ledger accounting.
2. `Stop (exit auto)` — kill the auto loop cleanly; print the run summary per § L.6 with the ledger file's absolute path.

**No Retry option.** The G.4(e) gate is a policy decision, not a retryable action — there's nothing to retry (the fault has already occurred twice consecutively, and each recovery attempt runs the same sweep + re-arm). The only two answers are "keep going degraded" or "stop."

## Gate invocation

Per § AskUserQuestion invocation contract (from #402) — one `AskUserQuestion` call per G.4(e) fire (single-item `questions` array). Parameters:

- **Question text**: `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?`
- **Header**: `Escalate` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly two, discrete, in the order above).

Fanout: When G.4(e) co-fires with another gate class (rare — cursor recovery is a per-loop event, not a per-issue event; the only realistic co-fire is a batch-boundary event that also happened to end with an `invalid-cursor`), the standing multi-gate fanout rule applies — one `AskUserQuestion` call per gate, never a fused questions array.

## Presentation

In the same response as the `AskUserQuestion` call:

```markdown
Consecutive `invalid-cursor` fault on <epic-ref> (consecutive-count: <N>):

**Most recent typed errors** (verbatim from `cockpit_await_events`):
- Occurrence <N-1>: `code`=<code-1>, `message`=<message-1>, `details`=<details-1>
- Occurrence <N>: `code`=<code-2>, `message`=<message-2>, `details`=<details-2>

**Recovery state**: The loop has been running startup-sweep-per-batch since the first `invalid-cursor` occurrence at <timestamp>. Each recovery is idempotent (sweeps see already-dispatched state and no-op), but the dispatch-round reduction the MCP path exists to deliver (SC-003) is not being realized — every batch pays the full startup-sweep cost.

**Options**:
- `Continue degraded (sweep-per-batch) (Recommended)` — accept the degraded loop; decide-once for the current unhealed streak (the gate does NOT re-fire on subsequent `invalid-cursor` within the same streak). The counter continues to increment for ledger accounting.
- `Stop (exit auto)` — kill the auto loop cleanly; print the run summary per § L.6 with the ledger file's absolute path.
```

## Post-gate behavior

- `Continue degraded (sweep-per-batch)` → set `streakOperatorAcknowledged = true` for the current unhealed streak. Loop continues; § step 5 Branch B recovers on each subsequent `invalid-cursor` (incrementing the counter and writing a ledger line, but NOT re-firing the gate). Once any successful cursor reuse occurs, `streakOperatorAcknowledged` resets to `false` and the counter resets to 0 (Q4=A).
- `Stop (exit auto)` → kill the auto loop cleanly; print the run summary per § L.6; exit zero (or non-zero — see the Ledger line section for the exit-code semantics matching the Stop convention from other G.4 subtypes).

## Ledger lines

Two lines per G.4(e) fire — the fault accounting and the operator decision:

- **Fault accounting** (already written by § step 5 Branch B before the gate fires): `<epic-ref> · cursor-recovery · invalid-cursor · <N>` where `<N>` is the counter value at recovery time (2 or greater; the value that triggered the gate).
- **Operator decision** (written by G.4(e) after the operator responds): `<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>`.

The two lines together let a `grep escalation-gate <ledger-file>` recipe find all G.4(e) fires, and a `grep cursor-recovery <ledger-file>` recipe find all recovery lines. The run summary § L.6's cursor-recovery-count section can independently classify by class (invalid-cursor / resetFrom / expiry / discarded) and by outcome (continue-degraded / stop).

## Failure modes

- **Operator selects `Continue degraded`**: no failure mode; the loop continues in degraded state. The ledger records the decision.
- **Operator selects `Stop`**: no failure mode; the loop exits cleanly. The ledger records the decision. The run summary § L.6 prints an abbreviated form (non-`epic-complete` exit).
- **No operator response (indefinite block)**: the gate blocks indefinitely per the standing gate contract (§ AskUserQuestion invocation contract, Q3=D). No per-row timeout policy. The block is cheap — no recovery loop spins while waiting — so the cost is bounded by operator return time, not by an arbitrary N.

## Re-fire semantics (Q4=A)

The gate is **decide-once for the streak that raised it**:

- After operator chooses `Continue degraded`, the flag `streakOperatorAcknowledged = true` prevents G.4(e) from re-firing on subsequent `invalid-cursor` within the same unhealed streak.
- On any successful cursor reuse (Q2=A definition), the flag resets to `false` AND all counters reset to 0.
- If a fresh 2-in-a-row `invalid-cursor` streak then accumulates, the gate re-fires at count=2 again — a new streak is a new decision.

The anti-nag property: within one unhealed streak (counter climbs 2, 3, 4, ...) the gate fires only once (at 2); subsequent recoveries in the same streak do NOT re-fire.

The anti-silence property: after a healed period, a fresh streak IS a distinct episode with possibly a distinct cause. Silence about the second episode (a hypothetical `Continue degraded` sticky-for-session) would rebuild the exact silent-degradation hole this fix closes.

## Non-goals

- **No `Retry` option.** There is nothing to retry — each recovery attempt runs the same sweep + re-arm, and the fault has already occurred twice consecutively.
- **No per-row timeout policy.** Inherits the standing gate contract (Q3=D). If timeout policy ever ships, it ships via #402's home for all gates uniformly.
- **No auto-approve variant.** § Invariant #6 explicitly puts autonomy policy out of scope in v1; G.4(e) inherits this.
- **No implicit escalation of other cursor-error classes.** Only `invalid-cursor` drives G.4(e). If future work needs a separate escalation for `resetFrom · N` (server-side rotation-churn detection) or `expiry · N` (retention-window churn detection), those are follow-up findings with their own gate subtypes G.4(f), G.4(g), etc.

## Precedent

Modeled on § Gate contract G.4(c) (unrecognized state escalation) which also has no Retry option and just two options (Skip / Stop). G.4(e) uses `Continue degraded` in place of `Skip` because the semantic is different — `Skip` in G.4(c) means "add this issue to the session mute set", whereas `Continue degraded` in G.4(e) means "accept the degraded loop state." The two share the shape of "operator accepts a compromised state and the loop continues" but differ in what's being compromised (single-issue mute vs. whole-loop cursor mechanism).
