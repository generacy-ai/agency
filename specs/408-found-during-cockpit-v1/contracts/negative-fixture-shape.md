# Contract: `tests/fixtures/408-drift-auto.md` negative fixture shape

**Surface**: `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md` — a new checked-in markdown fixture reproducing the pre-fix § step 5 drift.

## Purpose

Feeding this file through the 408-1 `auditStep5` parser MUST report at least one structural failure. This proves the audit's structural logic isn't vacuous — if a future refactor of the parser accidentally always returns `all-true`, the 408-2 assertion catches the degradation.

Follows the `398-drift-auto.md` / `402-drift-auto.md` shape and `<finding>-drift-<command>.md` naming pattern.

## Content

A minimal markdown file (~20-30 lines) containing:

- A top-level `## Instructions` H2 heading (so the audit-parser can find § step 5).
- An enumerated list item `5. **Cursor recovery.**` (so the audit-parser identifies the target list item).
- The pre-fix § step 5 body verbatim OR a compressed equivalent — three signals converged onto one recovery path, no branches, no counter, no escalation gate, no `cursor-recovery` ledger shape.
- NO `Continue degraded (sweep-per-batch)` substring anywhere in the file.
- NO `Stop (exit auto)` substring anywhere in the file.
- NO code span matching `cursor-recovery · <class> · <consecutive-count>` or its concrete equivalents.

## Reference content (illustrative — the exact prose can vary as long as the drift is preserved)

```markdown
## Instructions

5. **Cursor recovery.** There is no watch process to re-arm; the cursor is in-memory only, held for the lifetime of the current dispatch loop. On any of the following signals from `cockpit_await_events`, converge on the same recovery path — run the startup sweep (step 3) again and re-arm the cursor from the tool server's connect-time position (cursor-less):
   1. **`invalid-cursor` typed error** — the cursor the parent passed is stale/corrupted (fail loud — this is a caller bug on this side of the boundary; the parent must not swallow it). Log the typed error's `code`/`message`/`details` verbatim, then trigger recovery.
   2. **`resetFrom` reset signal in the returned batch** — the tool server signaled a reset in the batch metadata (e.g., server-side event-log rotation). Trigger recovery.
   3. **Cursor expiry** — a typed error indicating the cursor is past the server's retention window. Trigger recovery.

   All three signals converge on the same recovery convergence path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.**
```

## Audit-parser expected output on the fixture

```typescript
{
  step5Present: true,           // the anchor `5. **Cursor recovery.**` is present
  branchAResetFrom: false,      // resetFrom appears but NOT on a distinct branch from invalid-cursor
                                //   (both are enumerated list items under the same converged-path bullet)
  branchBInvalidCursor: false,  // invalid-cursor appears but NOT on a distinct branch
  optionContinueDegraded: false, // 'Continue degraded (sweep-per-batch)' substring absent
  optionStopExit: false,         // 'Stop (exit auto)' substring absent
  ledgerShapePresent: false,     // no code span matching cursor-recovery · <class> · <count>
}
```

At least one of `branchAResetFrom`, `branchBInvalidCursor`, `optionContinueDegraded`, `optionStopExit`, `ledgerShapePresent` must be `false` for the 408-2 assertion to pass.

Note on the distinct-branch check: the pre-fix wording has both `invalid-cursor` and `resetFrom` on numbered list items (1. and 2.) under the same converged-path preamble. Whether the audit-parser's distinct-branch heuristic classifies these as "distinct" depends on the parser's implementation — one reasonable interpretation is that separate list items count as distinct branches (in which case the fixture's failures come from the option-strings and ledger-shape checks); another is that "converge on the same recovery path" wording explicitly declares them non-distinct (in which case the fixture's failure includes the class-split check). Either interpretation is acceptable; the 408-2 assertion needs only one failed check.

The simpler and more robust choice for the audit-parser: treat separate numbered/bulleted list items as distinct branches structurally, and let the `optionContinueDegraded`, `optionStopExit`, `ledgerShapePresent` checks carry the fixture's failure signal. This decouples the branch-split heuristic from the fixture's specific formatting.

## File location and naming

- Path: `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md`
- Naming pattern: `<finding>-drift-<command>.md` (matches `398-drift-auto.md`, `402-drift-auto.md`).
- Location: same fixtures directory as prior drift fixtures (co-located with `394-*`, `396-*`, `398-drift-auto.md`, `400-*`, `402-drift-auto.md`, `403-*`).

## What the fixture is NOT

- **NOT a full auto.md replica**. The fixture contains just the minimum context to trigger the audit's step-5 parser and its downstream checks. Cross-section content (`## Dispatch`, `## Gate contract`, `## Ledger`, etc.) is omitted.
- **NOT a working playbook**. If loaded into a Claude session, this file would fail at multiple runtime checks (missing dispatch table, missing invariants, etc.). It exists solely as a static input to the audit.
- **NOT versioned by fix**. The fixture is a one-time snapshot of the pre-fix drift; future finding fixes that also touch § step 5 (hypothetically #414, #418, ...) would create their own drift fixtures (`414-drift-auto.md`, ...) reproducing *their* pre-fix drifts, not modifying this one.

## Precedent match

Same shape and content strategy as:

- **`tests/fixtures/398-drift-auto.md`** — minimal markdown with the pre-#398 playbook wording that used `<pr-ref>` in an invocation the CLI's `--help` uses `<issue>` for. Audit trips on the mismatched token.
- **`tests/fixtures/402-drift-auto.md`** — minimal markdown with the pre-#402 G.1 paragraph (`never ceil(N/4)` phrasing) and no `## AskUserQuestion invocation contract` section. Audit trips on the missing section.

`408-drift-auto.md` follows the same shape: pre-fix wording of the specific rule being fixed, no forward-looking edits, minimum context to exercise the audit.

## Failure modes the fixture guards against

- **Vacuous audit regression** — if `auditStep5` is refactored and accidentally always returns `all-true` (e.g., a scope bug in the section-extraction regex), the 408-2 assertion fails because the fixture no longer trips any check.
- **Silent-passing degradation** — if a future refactor of the plugin's fixture-loading utility changes the input the audit receives (e.g., strips markdown frontmatter, normalizes whitespace, resolves inline includes), the fixture's specific structural properties (converged-path wording, absent option strings, absent ledger shape) still trip failures because the audit's structural checks anchor on well-defined markdown constructs, not on whitespace or metadata.
