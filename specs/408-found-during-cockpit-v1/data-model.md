# Data Model: #408 — `auto.md` § step 5 cursor-error class split + circuit breaker + ledger accounting

Structural model of the four surfaces this fix touches:

1. `packages/claude-plugin-cockpit/commands/auto.md` — the § step 5 body (pre/post branching layout), the § Gate contract table row + G.4(e) presentation block for the new escalation-gate subtype, and the § Ledger action+outcome vocabulary row for the `cursor-recovery` action.
2. `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — the new `describe("408 — …")` block's inputs/outputs (audit parser input, mismatch report shape).
3. `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md` — the negative fixture's minimal structure.
4. (Read-only) The auto session's in-memory state — the per-class consecutive counter map that the § step 5 prose describes but is not persisted anywhere on disk.

## Surface 1: `packages/claude-plugin-cockpit/commands/auto.md`

### Pre-fix § step 5 (relevant excerpt)

```markdown
5. **Cursor recovery.** There is no watch process to re-arm; the cursor is in-memory only, held for the lifetime of the current dispatch loop. On any of the following signals from `cockpit_await_events`, converge on the same recovery path — run the startup sweep (step 3) again and re-arm the cursor from the tool server's connect-time position (cursor-less):
   1. **`invalid-cursor` typed error** — the cursor the parent passed is stale/corrupted (fail loud — this is a caller bug on this side of the boundary; the parent must not swallow it). Log the typed error's `code`/`message`/`details` verbatim, then trigger recovery.
   2. **`resetFrom` reset signal in the returned batch** — the tool server signaled a reset in the batch metadata (e.g., server-side event-log rotation). Trigger recovery.
   3. **Cursor expiry** — a typed error indicating the cursor is past the server's retention window. Trigger recovery.

   All three signals converge on the same recovery convergence path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.** …
```

Three key drifts from the intended semantics:

- **All three signals converge on the same recovery path.** No class split; `invalid-cursor` is treated the same as `resetFrom`/expiry after logging the typed error.
- **No consecutive-fault tracking.** Nothing counts how many recoveries have happened in a row.
- **No escalation gate.** Nothing surfaces the recovery streak to the operator.

### Post-fix § step 5 (target layout)

```markdown
5. **Cursor recovery.** There is no watch process to re-arm; the cursor is in-memory only, held for the lifetime of the current dispatch loop. Each cursor-error signal returned from `cockpit_await_events` is classified per the post-#924 hardened taxonomy and routed onto one of two branches. The parent maintains a per-class consecutive-fault counter (one counter each for `invalid-cursor`, `resetFrom`, `expiry`, `discarded`); every counter resets to 0 on any successful cursor reuse (Q2 shape: any `cockpit_await_events` call presenting a non-null cursor and returning no cursor-error signal — empty batches included).

   **Branch A — recover (unchanged semantics; ledger accounting only):**
   - **`resetFrom` reset signal in the returned batch** — the tool server signaled a reset in the batch metadata (e.g., server-side event-log rotation). Increment the `resetFrom` counter. Run the startup sweep (step 3) again + re-arm the cursor cursor-less from the tool server's connect-time position. Write a `<epic-ref> · cursor-recovery · resetFrom · <resetFrom-counter>` ledger line.
   - **Cursor expiry typed error** — the cursor is past the server's retention window. Increment the `expiry` counter. Recover as above. Write a `<epic-ref> · cursor-recovery · expiry · <expiry-counter>` ledger line.
   - **`discarded` signal** — post-#924, restarts/evictions classify as `discarded`. Increment the `discarded` counter. Recover as above. Write a `<epic-ref> · cursor-recovery · discarded · <discarded-counter>` ledger line.

   **Branch B — recover once, then escalate on consecutive fault:**
   - **`invalid-cursor` typed error** — post-#924, `never-issued` reliably means caller bug; the typed error's `code`/`message`/`details` identify malformed / never-issued / wrong-epic. Log the typed error's `code`/`message`/`details` verbatim. Increment the `invalid-cursor` counter. Write a `<epic-ref> · cursor-recovery · invalid-cursor · <invalid-cursor-counter>` ledger line.
     - If `invalid-cursor` counter == 1 → recover (sweep + re-arm cursor-less) and continue the loop.
     - If `invalid-cursor` counter ≥ 2 → fire the **G.4(e) escalation gate** (see § Gate contract G.4(e)) with options `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)`. On `Continue degraded`, the current streak is decide-once — the gate does NOT re-fire on subsequent `invalid-cursor` occurrences within the same unhealed streak. Only if the counter resets on a successful reuse AND accumulates a fresh 2-in-a-row streak does the gate re-fire at count=2 (per Q4).

   All recoveries — Branch A and Branch B alike — call the same convergence path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.** Both the sweep (per § Ledger L.5 idempotency rule) and the re-arm are idempotent — the live-state re-check in step 4a catches events already dispatched (state moved on), so no duplicate action can result. **The cursor is in-memory only** — session restart, `invalid-cursor`, `resetFrom`, expiry, and `discarded` all converge on this same recovery path, and no filesystem persistence of the cursor exists (no on-disk cursor file, no ledger re-derivation).

   The compound-liveness cross-check (N=4 empty reads + actionable live state) retires with this step. The `maxWaitMs=55000` at the tool boundary bounds the "no events" case at each iteration, and the tool server owns the "silent stall" detection (a stalled server returns a typed error or fails the tool call, both of which the recovery path handles above).
```

Three key structural properties of the post-fix layout:

- **Two named branches** (`Branch A — recover` and `Branch B — recover once, then escalate on consecutive fault`) — the class split.
- **Per-class consecutive counter** — one counter each for the four classes, all resetting on any successful cursor reuse.
- **Escalation gate reference** at Branch B's second bullet — the runtime path from § step 5 to § Gate contract G.4(e).

### Pre-fix § Gate contract table row (G.4 section)

Current table has four G.4 subtypes:

```markdown
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:* | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (d) | Escalation: Merge-conflicts | `I've resolved it — advance the gate` / `Skip` / `Stop` (single call) | Conflicted paths (+ CLI stderr on re-present) |
| G.4 (c) | Escalation: unrecognized state | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
```

### Post-fix § Gate contract table row (new G.4(e))

Add:

```markdown
| G.4 (e) | Escalation: consecutive `invalid-cursor` fault | `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)` (single call, no Retry) | Verbatim `code`/`message`/`details` from the two most recent `invalid-cursor` typed errors + consecutive-count |
```

### Post-fix § Gate contract G.4(e) presentation block (new subsection)

```markdown
### G.4(e) — Escalation: consecutive `invalid-cursor` fault

**Trigger**: A second consecutive `invalid-cursor` typed error from `cockpit_await_events` with no intervening successful cursor reuse (per § step 5 Branch B). Verbatim state anchor: the `invalid-cursor` consecutive-fault counter has reached 2 or has grown past 2 while unhealed but this is the first re-check within the unhealed streak (decide-once semantics — only fires at count=2).

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

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.4(e) fire (single-item `questions` array). Parameters:
- **Question text**: `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?`
- **Header**: `Escalate` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly two, discrete, in this order):
  1. `Continue degraded (sweep-per-batch) (Recommended)` — accept degraded loop for the current unhealed streak.
  2. `Stop (exit auto)` — kill loop; summary; exit.

**Post-gate behavior**:
- `Continue degraded (sweep-per-batch)` → mark the current streak as operator-acknowledged; loop continues; the gate does NOT re-fire within the same unhealed streak. On any successful cursor reuse the counter resets; a fresh 2-in-a-row streak re-fires the gate at count=2 (Q4=A: new streak = new decision).
- `Stop (exit auto)` → kill loop; run summary per § L.6; exit cleanly.

**Ledger line**: `<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>` written in addition to the two most recent `cursor-recovery · invalid-cursor · N` lines that led to the escalation. The escalation-gate ledger line is the operator-decision record; the `cursor-recovery` lines are the fault accounting.

**Failure modes**:
- `Continue degraded` (operator selected) → no failure mode; the loop continues in degraded state.
- `Stop` (operator selected) → clean exit; run summary printed.
- No operator response → the gate blocks indefinitely per the standing gate contract (§ AskUserQuestion invocation contract, Q3=D). No per-row timeout policy.
```

### Pre-fix § Ledger action+outcome vocabulary table

Current table has rows for D.1–D.11 plus a `mute-set hit` row. No row for `cursor-recovery`.

### Post-fix § Ledger action+outcome vocabulary table (new rows)

Insert two rows (positioned between D.11 merge-conflicts row and the `mute-set hit` row, or at the end grouped by cursor recovery):

```markdown
| § step 5 cursor recovery (Branch A) | `cursor-recovery` | `resetFrom · <N>`, `expiry · <N>`, `discarded · <N>` |
| § step 5 cursor recovery (Branch B) | `cursor-recovery` | `invalid-cursor · <N>` |
| § step 5 Branch B escalation | `escalation-gate` | `continue-degraded`, `stop (exit)` |
```

(Or a single-row form covering all four classes; the two-row form makes the escalation semantics explicit in the vocabulary table.)

### Post-fix § L.6 run-summary update

Add to the § L.6 counted-events list:

```text
  · Cursor recoveries: <k7> (<by class: invalid-cursor=<a>, resetFrom=<b>, expiry=<c>, discarded=<d>>)
  · Cursor-recovery escalations: <k8> (<continue-degraded=<x>, stop=<y>>)
```

## Surface 2: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`

### New `describe("408 — …")` block shape

```typescript
describe("408 — auto.md § step 5 cursor-error class split + circuit breaker", () => {
  it("408-1 (structural drift audit): § step 5 has the class split, both G.4(e) options, and the new ledger-line shape", () => {
    const report = auditStep5(AUTO_MD_PATH);
    // report shape:
    //   {
    //     step5Present: boolean,           // § step 5 body was extractable
    //     branchAInvalidCursor: boolean,   // 'invalid-cursor' appears on its own branch
    //     branchBResetFrom: boolean,       // 'resetFrom' or 'expiry' or 'discarded' appears on a distinct branch
    //     optionContinueDegraded: boolean, // 'Continue degraded (sweep-per-batch)' present verbatim
    //     optionStopExit: boolean,         // 'Stop (exit auto)' present verbatim
    //     ledgerShapePresent: boolean,     // 'cursor-recovery · <class> · <consecutive-count>' or concrete equivalent present
    //   }
    expect(report.step5Present, "step 5 extraction failed").toBe(true);
    expect(report.branchAInvalidCursor, "invalid-cursor branch missing").toBe(true);
    expect(report.branchBResetFrom, "resetFrom/expiry/discarded branch missing").toBe(true);
    expect(report.optionContinueDegraded, "Continue degraded option missing").toBe(true);
    expect(report.optionStopExit, "Stop (exit auto) option missing").toBe(true);
    expect(report.ledgerShapePresent, "cursor-recovery ledger shape missing").toBe(true);
  });

  it("408-2 (regression check): audit reports missing-class-split on 408-drift-auto.md fixture", () => {
    const report = auditStep5(FIXTURE_408_DRIFT_AUTO);
    // Fixture reproduces pre-fix drift: three signals converged, no class split.
    // Expected: at least one of the class-split checks is false.
    const anyFailure =
      !report.branchAInvalidCursor ||
      !report.branchBResetFrom ||
      !report.optionContinueDegraded ||
      !report.optionStopExit ||
      !report.ledgerShapePresent;
    expect(
      anyFailure,
      `expected at least one structural check to fail; observed report: ${JSON.stringify(report)}`,
    ).toBe(true);
  });
});
```

### `auditStep5` helper input/output

**Input**: file path to a markdown file (either `AUTO_MD_PATH` or `FIXTURE_408_DRIFT_AUTO`).

**Output**: `Step5AuditReport` object per the shape above.

**Extraction logic** (structural, not prose-sniffing):

1. Read the file. Locate the `## Instructions` H2 heading. Within that section, locate the enumerated list item beginning with `5. **Cursor recovery.**` (or equivalent post-rewrite anchor).
2. Extract the body from that anchor to the next enumerated list item (item 6) or the next H2 heading.
3. Structural checks over the extracted body:
   - `branchAInvalidCursor`: the exact substring `invalid-cursor` appears in the body AND is under a distinct branch header (identified by a preceding paragraph break or bullet marker that also occurs before a different signal class name).
   - `branchBResetFrom`: at least one of `resetFrom`, `expiry`, `discarded` appears in the body under a distinct branch header (per the same distinct-branch definition as above).
   - `optionContinueDegraded`: the substring `Continue degraded (sweep-per-batch)` appears verbatim in the body.
   - `optionStopExit`: the substring `Stop (exit auto)` appears verbatim in the body.
   - `ledgerShapePresent`: the body contains a code span (inline `` ` `` or fenced block) matching one of: `cursor-recovery · <class> · <consecutive-count>` (the templated shape) OR `cursor-recovery · invalid-cursor · 1` (concrete example, matching post-fix Branch B ledger emission) OR `cursor-recovery · resetFrom · 1` (concrete example, matching post-fix Branch A).

**Never prose-sniff**: the audit does NOT regex the vocabulary of "class split", "circuit breaker", "consecutive-fault", "escalation", "branch", "fanout". Those words may or may not appear in future rewrites; the structural properties (class names on distinct branches, option strings verbatim, ledger shape as a code span) are stable across prose rewrites.

## Surface 3: `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md`

### Fixture shape

A minimal markdown file (~20-30 lines) reproducing the pre-fix drift. Contains:

- A top-level `## Instructions` H2 heading.
- An enumerated list beginning with `5. **Cursor recovery.**` (matching the § step 5 anchor).
- The pre-fix step 5 body verbatim (or a compressed equivalent) — all three signals converged on one recovery path, no branches, no counter, no escalation gate, no `cursor-recovery` ledger shape.
- NO `Continue degraded (sweep-per-batch)` substring anywhere.
- NO `Stop (exit auto)` substring anywhere.
- NO code span matching `cursor-recovery · <class> · <consecutive-count>` or its concrete equivalents.

Feeding this file through `auditStep5` MUST report at minimum:

- `step5Present: true` (the anchor exists — the fixture is well-formed markdown with a step 5 heading).
- `branchAInvalidCursor: true` (the pre-fix wording did name `invalid-cursor` — the fixture includes it).
- `branchBResetFrom: true` (the pre-fix wording did name `resetFrom`, `expiry` — the fixture includes them).
- BUT the branches are NOT distinct (a stricter parser variant checks that the three class names appear under a "converged on the same path" wording; the primary check is that both branch-A and branch-B tokens exist under their own paragraph/bullet — the fixture's converged wording collapses them onto one bullet list, so the distinct-branch check fails).
- `optionContinueDegraded: false`.
- `optionStopExit: false`.
- `ledgerShapePresent: false`.

Which specific check fails is a design choice for the audit-parser: the primary failure the fixture must reliably trigger is `missing-class-split` (both classes appear but not under distinct branches) OR `missing-escalation-options` (neither option string appears) OR `missing-ledger-shape` (no `cursor-recovery` code span). Any of these three failures satisfies the 408-2 assertion.

### Fixture naming and location

- File: `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md`
- Naming pattern: `<finding>-drift-<command>.md` (matches `398-drift-auto.md`, `402-drift-auto.md`).
- Location: same fixtures directory as prior drift fixtures.

## Surface 4: In-memory per-class counter state

This is not persisted; it's runtime state the § step 5 prose describes and the auto session maintains for the duration of the dispatch loop.

### Counter shape

Conceptually (not implemented as TypeScript in the plugin — this is prose-described runtime state the model maintains between `cockpit_await_events` calls):

```typescript
type CursorConsecutiveFaultCounters = {
  invalidCursor: number;    // consecutive `invalid-cursor` occurrences with no successful reuse between
  resetFrom: number;        // consecutive `resetFrom` occurrences
  expiry: number;           // consecutive `expiry` occurrences
  discarded: number;        // consecutive `discarded` occurrences
};
```

### State transitions

- **Initial state (session start)**: all counters = 0.
- **On `cockpit_await_events` return with cursor-error signal of class C**: increment `counters[C]`. All *other* counters remain at their current values (they don't reset — only a successful reuse resets any counter).

  Wait — this is subtle. Q2=A says a successful reuse resets *the* counter. Does it reset all counters or just the class that had a streak?

  Re-reading Q2's answer text: "the counter" (singular). And Q4=A says "any successful reuse" resets — after which a new streak starts. Consistent with per-class independence: a successful reuse resets the counter for the class that had been climbing, but if another class was also climbing, that too resets on the same successful reuse.

  Interpretation: **any successful reuse resets ALL counters to 0.** This aligns with the Q2 clarification's "the counter" language (singular but generic, meaning "the fault counters as a whole") and with the anti-fragility property — a successful reuse means the cursor mechanism is healthy across all failure classes for that moment.

  Alternative: **any successful reuse resets only the counter for the most recently incremented class.** This preserves per-class independence but is harder to state ("only class X's counter resets on a successful reuse when class X was the last incrementing class"), and has a subtle edge case: if `resetFrom · 3` was the state and the next call succeeds, `resetFrom` resets to 0 but `invalid-cursor` was already at 1 from earlier in the session — that 1 is a stale count that would false-escalate if a subsequent `invalid-cursor` bumps it to 2 later.

  Q4=A implicitly answers this: "a new streak after an intervening successful reuse is a new decision; the gate re-fires at count=2." The word "new" implies a fresh streak starting from 0 — the whole counter map resets on any successful reuse.

  **Chosen semantics**: any successful reuse resets ALL counters to 0. This is the simpler rule, and it composes correctly with the Q4=A anti-nag / anti-silence property.

- **On successful cursor reuse** (Q2=A: presented + no cursor-error signal, empty batches included): ALL counters reset to 0.
- **On session end** (auto exit): counters are discarded; state doesn't persist to disk. Next session starts fresh at 0.

### The escalation-gate trigger predicate

```typescript
// Called after incrementing counters[C] on a cursor-error signal of class C.
function shouldFireG4eEscalation(
  C: "invalidCursor" | "resetFrom" | "expiry" | "discarded",
  counters: CursorConsecutiveFaultCounters,
  streakOperatorAcknowledged: boolean, // Q4=A: reset when the streak ends (all counters → 0)
): boolean {
  // Only invalid-cursor drives escalation (Q1=C).
  if (C !== "invalidCursor") return false;
  // Decide-once within the current unhealed streak (Q4=A).
  if (streakOperatorAcknowledged) return false;
  // First occurrence: recover; second consecutive: escalate.
  return counters.invalidCursor >= 2;
}
```

The `streakOperatorAcknowledged` flag is set to `true` when the operator selects `Continue degraded` and is reset to `false` on any successful cursor reuse (so a fresh streak after a healed period can re-fire the gate — Q4=A). Q3=D's "gate blocks" semantics means the loop pauses at the `AskUserQuestion` call until the operator responds, so the flag is either `true` after `Continue degraded` or the session exits after `Stop`.

## Cross-surface invariants (structural, not run-time)

1. **§ step 5 body distinct branches**: both `invalid-cursor` and (at least one of `resetFrom` / `expiry` / `discarded`) appear on *distinct* branches (separated by a paragraph break or a distinct bullet marker), not converged onto one recovery path. Structural: the audit-parser identifies branches by looking for paragraph or bullet-level separation between the two class tokens.
2. **§ step 5 body cross-references § Gate contract G.4(e)**: Branch B's escalation bullet contains the substring `G.4(e)` (or `G.4e` or `§ Gate contract G.4(e)`), so a reader following Branch B can find the presentation block.
3. **§ Gate contract G.4(e) presentation block exists at H3 depth** with the exact options `Continue degraded (sweep-per-batch)` and `Stop (exit auto)` in its Options list.
4. **§ Ledger action+outcome vocabulary has a `cursor-recovery` action row** with outcomes including at least `invalid-cursor · <N>` and `resetFrom · <N>` (or equivalent parametrized-class outcomes).
5. **§ L.6 run summary includes cursor-recovery counts** at least by class (invalid-cursor / resetFrom / expiry / discarded) and by outcome (continue-degraded / stop).

The audit's structural checks (408-1) enforce properties 1, 3, 4 directly (extract § step 5, check for distinct branches; extract § Gate contract, check for the G.4(e) block with both options; extract § Ledger action+outcome table, check for the cursor-recovery row). Properties 2 and 5 are checked by static grep in the quickstart runbook — they're stable-anchored so a build-time regex is sufficient.
