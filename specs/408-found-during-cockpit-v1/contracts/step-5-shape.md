# Contract: post-fix `auto.md` § step 5 shape

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` — the enumerated list item `5. **Cursor recovery.**` within the `## Instructions` section.

## Structural contract

§ step 5 body MUST contain:

1. **Two named branches** (Branch A and Branch B, or equivalent-shape distinct paragraphs / distinct bullet lists) — the class split.
2. **Per-class consecutive counter** — one counter each for `invalid-cursor`, `resetFrom`, `expiry`, `discarded`; all reset on any successful cursor reuse (Q2=A definition).
3. **Cross-reference to § Gate contract G.4(e)** — the runtime discovery path from § step 5 Branch B to the presentation block.

## Branch A — recover (unchanged semantics; ledger accounting only)

Contains the three unchanged-semantics classes:

- `resetFrom` reset signal in the returned batch → increment `resetFrom` counter; recover (sweep + re-arm cursor-less); ledger `<epic-ref> · cursor-recovery · resetFrom · <resetFrom-counter>`.
- Cursor expiry typed error → increment `expiry` counter; recover; ledger `<epic-ref> · cursor-recovery · expiry · <expiry-counter>`.
- `discarded` signal (post-#924 hardened taxonomy for server restart / eviction) → increment `discarded` counter; recover; ledger `<epic-ref> · cursor-recovery · discarded · <discarded-counter>`.

None of Branch A's classes ever fires the G.4(e) escalation gate. Their counters are ledger accounting only — the run summary § L.6 can identify reset-churn / expiry-churn / discarded-churn in future finding investigations, but no runtime escalation is triggered from these classes.

## Branch B — recover once, then escalate on consecutive fault

Contains the one class that drives escalation:

- `invalid-cursor` typed error (post-#924: malformed / never-issued / wrong-epic reliably means caller bug, but the class also covers server-restart artifacts that present as `invalid-cursor` before the recovery sweep) → log the typed error's `code`/`message`/`details` verbatim; increment `invalid-cursor` counter; ledger `<epic-ref> · cursor-recovery · invalid-cursor · <invalid-cursor-counter>`.
  - If counter == 1 → recover (sweep + re-arm cursor-less); continue the loop.
  - If counter ≥ 2 AND the current streak is not operator-acknowledged → fire the G.4(e) escalation gate (see § Gate contract G.4(e)).
  - If counter ≥ 2 AND the current streak IS operator-acknowledged (via a prior `Continue degraded`) → recover; do NOT re-fire the gate (Q4=A decide-once within one unhealed streak).

## Successful-cursor-reuse definition

Any `cockpit_await_events` call that:

- was called with a non-null cursor argument (the parent *presented* the cursor to the tool server), AND
- returned a normal batch response (no `invalid-cursor` typed error, no `resetFrom` reset signal, no cursor-expiry typed error, no `discarded` signal).

Empty batches count as success — a call presenting a cursor and returning `{events: [], nextCursor: <new>}` is the cursor mechanism working perfectly on a quiet epic. The counter measures consecutive failures of the *cursor mechanism*, not of dispatch traffic (Q2=A).

On any successful cursor reuse: **ALL counters reset to 0** AND the `streakOperatorAcknowledged` flag resets to `false`. This lets a fresh streak after a healed period re-fire the gate at count=2 (Q4=A).

## Convergence path

Both Branch A and Branch B call the same recovery convergence path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.** The startup sweep is idempotent (per § Ledger L.5 rule) — the live-state re-check catches events already dispatched. The cursor is in-memory only; no filesystem persistence.

## Post-fix wording (illustrative reference; the exact prose may vary as long as the structural contract is met)

```markdown
5. **Cursor recovery.** There is no watch process to re-arm; the cursor is in-memory only, held for the lifetime of the current dispatch loop. Each cursor-error signal returned from `cockpit_await_events` is classified per the post-#924 hardened taxonomy and routed onto one of two branches. The parent maintains a per-class consecutive-fault counter (one counter each for `invalid-cursor`, `resetFrom`, `expiry`, `discarded`); every counter resets to 0 on any successful cursor reuse (any `cockpit_await_events` call presenting a non-null cursor and returning no cursor-error signal — empty batches included).

   **Branch A — recover (unchanged semantics; ledger accounting only):**
   - `resetFrom` reset signal in the returned batch → increment `resetFrom` counter; recover (sweep + re-arm cursor-less); ledger `<epic-ref> · cursor-recovery · resetFrom · <resetFrom-counter>`.
   - Cursor expiry typed error → increment `expiry` counter; recover; ledger `<epic-ref> · cursor-recovery · expiry · <expiry-counter>`.
   - `discarded` signal → increment `discarded` counter; recover; ledger `<epic-ref> · cursor-recovery · discarded · <discarded-counter>`.

   **Branch B — recover once, then escalate on consecutive fault:**
   - `invalid-cursor` typed error → log the typed error's `code`/`message`/`details` verbatim; increment `invalid-cursor` counter; ledger `<epic-ref> · cursor-recovery · invalid-cursor · <invalid-cursor-counter>`.
     - If counter == 1 → recover (sweep + re-arm cursor-less); continue the loop.
     - If counter ≥ 2 AND streak not yet operator-acknowledged → fire the G.4(e) escalation gate (see § Gate contract G.4(e)).
     - If streak has been operator-acknowledged (prior `Continue degraded`) → recover; do NOT re-fire the gate within the same unhealed streak (decide-once).

   All recoveries — Branch A and Branch B alike — call the same convergence path: re-run step 3's startup sweep + re-arm cursor-less from connect-time position. The startup sweep is idempotent (§ Ledger L.5); the live-state re-check catches events already dispatched. Cursor is in-memory only; no filesystem persistence.
```

## Non-goals (things this contract does NOT constrain)

- The exact prose of Branch A / Branch B headers (may be `Branch A —` / `Branch B —` or `Recover` / `Recover + escalate` or any other separator-marked heading). Structural check: two distinct branches, not one converged path.
- The exact wording of "successful cursor reuse" (may be phrased as "cursor acceptance", "cursor round-trip", "healthy poll", etc.). Structural check: the Q2=A semantics are stated (presented + no cursor-error signal, empty batches included).
- The exact list of typed-error class names beyond the four core classes. If the tool server adds a fifth class (e.g., `deferred`), that class is added to Branch A or Branch B per its semantic (recover-only vs. recover-then-escalate); the audit accommodates the addition without changing shape.

## Failure modes the contract prevents

- **Pre-fix wording** (three signals converged onto one recovery path with no branches) fails the structural check for "distinct branches" — either the audit's parser cannot find two branch anchors, or one class token appears in both branches (meaning they're not truly distinct).
- **Pure fail-loud on `invalid-cursor`** (abort the run on the first occurrence with no ledger) fails the structural check for "log verbatim + ledger" on Branch B's first occurrence — the ledger-shape substring isn't emitted, and the audit's `ledgerShapePresent` check fails.
- **No counter tracked** (recover each `invalid-cursor` unconditionally) fails the structural check because no ledger-shape substring `cursor-recovery · invalid-cursor · <N>` exists — the counter must exist to write the ledger line.
- **No escalation gate reference from Branch B** fails the audit's cross-reference check to § Gate contract G.4(e).
