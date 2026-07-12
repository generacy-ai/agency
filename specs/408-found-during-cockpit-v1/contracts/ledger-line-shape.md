# Contract: `cursor-recovery` ledger-line shape

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` — `## Ledger` section's action+outcome vocabulary table, plus the ledger-line format sentence.

## Line shape

Per the § Ledger format sentence:

```text
<issue-ref-or-epic-ref> · <transition-class> · <action> · <outcome>
```

For cursor-recovery lines (§ step 5 Branch A and Branch B), the shape is:

```text
<epic-ref> · cursor-recovery · <class> · <consecutive-count>
```

Where:

- `<epic-ref>` — the epic reference (`owner/repo#N`) passed to `/cockpit:auto` at run start.
- `cursor-recovery` — the fixed literal action verb.
- `<class>` — one of: `invalid-cursor`, `resetFrom`, `expiry`, `discarded`. The four typed-error classes returned by `cockpit_await_events` per the post-#924 hardened taxonomy.
- `<consecutive-count>` — a non-negative integer. The value of the per-class consecutive counter at recovery time, per Q1=C's per-class-count semantics.

## Interpretation

Each ledger line reads naturally as "<Nth> consecutive <class>":

- `christrudelpw/epic#42 · cursor-recovery · resetFrom · 1` — first consecutive `resetFrom` in the current streak.
- `christrudelpw/epic#42 · cursor-recovery · resetFrom · 3` — third consecutive `resetFrom` with no successful cursor reuse between them (server-side rotation-churn signal).
- `christrudelpw/epic#42 · cursor-recovery · invalid-cursor · 1` — first consecutive `invalid-cursor` (recover; do not escalate).
- `christrudelpw/epic#42 · cursor-recovery · invalid-cursor · 2` — second consecutive `invalid-cursor` (recover AND fire G.4(e) escalation gate — unless streak already operator-acknowledged).

## Counter semantics (Q1=C + Q2=A)

- **Per-class** — each of the four classes has its own consecutive counter, incremented on each recovery of that class.
- **Reset on any successful cursor reuse** — Q2=A defines successful reuse as any `cockpit_await_events` call presenting a non-null cursor and returning no cursor-error signal (empty batches included). All four counters reset to 0 on such a call.
- **Only `invalid-cursor` drives escalation** — the `resetFrom`, `expiry`, `discarded` counters are ledger accounting only. Their consecutive counts are recorded for future finding investigations (churn detection) but never fire the G.4(e) gate.

## Escalation-gate ledger line

When G.4(e) fires, a second ledger line records the operator's decision:

```text
<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>
```

This line is distinct from the fault-accounting `cursor-recovery · invalid-cursor · N` line — the two together form the "streak reached N, operator decided X" record. `grep escalation-gate <ledger-file>` finds all G.4(e) operator decisions; `grep cursor-recovery <ledger-file>` finds all recoveries.

## § Ledger action+outcome vocabulary table entries (new rows)

Insert into the existing `## Ledger` → `### Action + outcome vocabulary (per dispatch row)` table:

```markdown
| § step 5 cursor recovery (Branch A) | `cursor-recovery` | `resetFrom · <N>`, `expiry · <N>`, `discarded · <N>` |
| § step 5 cursor recovery (Branch B) | `cursor-recovery` | `invalid-cursor · <N>` |
| § step 5 Branch B escalation        | `escalation-gate` | `continue-degraded`, `stop (exit)` |
```

The `<action>` column matches the fourth column of the line-shape (the verb: `cursor-recovery` or `escalation-gate`). The `<outcome>` column matches the fifth+ columns (the class name plus the consecutive count).

Alternative single-row form (more compact):

```markdown
| § step 5 cursor recovery | `cursor-recovery` | `<class> · <N>` where `<class>` ∈ {`invalid-cursor`, `resetFrom`, `expiry`, `discarded`} |
| § step 5 Branch B escalation | `escalation-gate` | `continue-degraded`, `stop (exit)` |
```

Either form satisfies the audit; the two-row form is preferred because it makes the escalation-eligible class explicit in the vocabulary table (Branch B).

## § L.6 run-summary section

Add to the § L.6 counted-events list:

```text
  · Cursor recoveries: <k7> (by class: invalid-cursor=<a>, resetFrom=<b>, expiry=<c>, discarded=<d>)
  · Cursor-recovery escalations: <k8> (continue-degraded=<x>, stop=<y>)
```

Counts derived from the ledger file: `grep -c "· cursor-recovery ·" <ledger-file>` for the total; per-class from `grep -c "· cursor-recovery · <class> ·" <ledger-file>`; escalation outcomes from `grep -c "· invalid-cursor-streak · escalation-gate · <outcome>" <ledger-file>`.

## Grep recipes (verification)

Post-fix, the ledger supports these operator-invoked queries:

- **"How many degraded rounds did this run have?"** → `grep -c "· cursor-recovery ·" <ledger-file>` (total recoveries; each represents one dispatch round that ran a full startup sweep instead of long-polling).
- **"Did the `invalid-cursor` fault reach the escalation threshold?"** → `grep "· cursor-recovery · invalid-cursor · [0-9]" <ledger-file> | awk '{print $NF}' | sort -n | tail -1` (the max count reached in the run; if ≥ 2 the gate fired).
- **"What did the operator decide when the gate fired?"** → `grep "· invalid-cursor-streak · escalation-gate ·" <ledger-file>` (all G.4(e) decisions in the run).
- **"Was there reset-churn?"** → `grep "· cursor-recovery · resetFrom · [0-9]" <ledger-file> | awk '{print $NF}' | sort -n | tail -1` (max `resetFrom` count; if > 1 the run had at least one un-healed reset streak — future finding investigation trigger).

## Non-goals

- **No new invariant number** for the ledger shape. The rule lives in § step 5's revised text and the audit's assertion.
- **No on-disk cursor persistence** — the `cursor-recovery` line records the counter value, not the cursor value. Recovering the cursor after a session restart is out of scope (matches § step 5's "in-memory only" property).
- **No cross-run counter merging** — each auto run starts fresh (all counters at 0). If a run exits and the operator restarts, the counters do NOT resume from the prior run's state. This is intentional: the counter is about *this* dispatch loop's healthiness; a fresh run starts with a fresh assessment.
- **No structured JSON emission for cursor-recovery** — the ledger is plain text with the middle-dot separator. If future work needs structured queries (Prometheus counters, dashboards), the fix is a separate ledger-format contract, not this one.

## Failure modes the contract prevents

- **Flat `resetFrom · 0` (Q1=A rejected)** — the ledger throws away churn signals. The `<consecutive-count>` field MUST be per-class-count, not the `invalid-cursor` counter's value.
- **All-class escalation (Q1=B rejected in spirit)** — `resetFrom · 2` firing the gate would be noise (routine server rotations). Only `invalid-cursor · 2` fires the gate.
- **Missing counter emission** (recovery without a ledger line) — a Branch A or Branch B recovery MUST write the corresponding `cursor-recovery · <class> · <count>` line. § Ledger's "dispatch without ledger line is a protocol violation" rule extends to cursor-recovery events.
- **Ambiguous separator** — the ledger uses the middle-dot ` · ` (U+00B7) with single spaces, per the existing § Ledger format sentence. New cursor-recovery lines follow the same separator.
