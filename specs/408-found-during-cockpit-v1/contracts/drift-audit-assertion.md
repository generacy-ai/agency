# Contract: 408-1 structural drift audit + 408-2 negative-fixture regression

**Surface**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — new `describe("408 — auto.md § step 5 cursor-error class split + circuit breaker", …)` block appended to the existing suite.

## 408-1 — Structural drift audit (positive check on current `auto.md`)

**Purpose**: Assert at build time that the load-bearing structural properties of the fix are present in the current `auto.md`. If a future edit drops the class split, removes a G.4(e) option, or elides the ledger shape, the audit fails.

**Input**: `AUTO_MD_PATH` (absolute path to `packages/claude-plugin-cockpit/commands/auto.md`).

**Assertions**:

1. **§ step 5 extractable** — the audit parser locates the H2 `## Instructions` heading and, within it, the enumerated list item `5. **Cursor recovery.**` (or the equivalent post-rewrite anchor `5. **Cursor recovery`). Failure → `step5Present: false`; other checks skipped.
2. **Class split — Branch A anchor present** — within § step 5's body, at least one of the tokens `resetFrom`, `expiry`, `discarded` appears in a distinct branch (identified structurally by a paragraph break, bullet marker, or bold-heading separator from the `invalid-cursor` token). Failure → `branchAResetFrom: false`.
3. **Class split — Branch B anchor present** — within § step 5's body, the token `invalid-cursor` appears in a distinct branch (separate paragraph or bullet from Branch A's tokens). Failure → `branchBInvalidCursor: false`.
4. **G.4(e) option: Continue degraded** — within § step 5's body (Branch B's escalation reference) OR within § Gate contract G.4(e)'s presentation block, the exact substring `Continue degraded (sweep-per-batch)` appears verbatim. Failure → `optionContinueDegraded: false`.
5. **G.4(e) option: Stop (exit auto)** — within § step 5's body OR within § Gate contract G.4(e)'s presentation block, the exact substring `Stop (exit auto)` appears verbatim. Failure → `optionStopExit: false`.
6. **Ledger-line shape** — within § step 5's body OR within § Ledger's action+outcome vocabulary table, a code span (inline `` ` `` or fenced block) matches one of: `cursor-recovery · <class> · <consecutive-count>` (templated shape) OR `cursor-recovery · invalid-cursor · 1` (concrete Branch B example) OR `cursor-recovery · resetFrom · 1` (concrete Branch A example). Failure → `ledgerShapePresent: false`.

**Output**: `Step5AuditReport` object:

```typescript
type Step5AuditReport = {
  step5Present: boolean;
  branchAResetFrom: boolean;
  branchBInvalidCursor: boolean;
  optionContinueDegraded: boolean;
  optionStopExit: boolean;
  ledgerShapePresent: boolean;
};
```

**Pass criterion**: all six fields `true`.

**Failure message** (rendered on any field `false`):

```text
Cursor-recovery drift detected in auto.md § step 5:
  step5Present: <bool>
  branchAResetFrom: <bool>
  branchBInvalidCursor: <bool>
  optionContinueDegraded: <bool>
  optionStopExit: <bool>
  ledgerShapePresent: <bool>
```

## 408-2 — Negative-fixture regression (positive check on the drift fixture)

**Purpose**: Assert that the audit is not vacuous — feeding a fixture that reproduces the pre-fix drift MUST report at least one structural failure. If a future refactor of `auditStep5` accidentally always returns `all-true`, this test fails and catches the vacuous-audit degradation.

**Input**: `FIXTURE_408_DRIFT_AUTO` (absolute path to `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md`).

**Assertion**: at least one of the six structural fields in the report is `false`.

**Pass criterion**:

```typescript
const anyFailure =
  !report.branchAResetFrom ||
  !report.branchBInvalidCursor ||
  !report.optionContinueDegraded ||
  !report.optionStopExit ||
  !report.ledgerShapePresent;
expect(anyFailure, `expected at least one structural check to fail; observed report: ${JSON.stringify(report)}`).toBe(true);
```

(`step5Present` is expected `true` on the fixture — the fixture is well-formed markdown with a step 5 heading; the failure must come from a downstream check.)

## Audit-parser implementation notes

The parser MUST be structural, not prose-sniffing:

- **DO**: Locate H2 / H3 / bullet-list boundaries; check substring presence within specific extracted-section bodies; check code-span presence via inline `` ` `` or fenced-block markdown patterns.
- **DO NOT**: Regex the vocabulary of "class split", "circuit breaker", "consecutive-fault", "escalation", "branch", "fanout", "successfully reused", etc. Those words may or may not appear in future rewrites; the structural properties above are stable.

**Distinct-branch definition**: two class tokens (e.g., `invalid-cursor` and `resetFrom`) are on "distinct branches" iff between them appears at least one of:
- A blank line (paragraph break).
- A bold-heading marker (`**Branch A**` / `**Branch B**` / equivalent).
- A separate bullet marker (`- ` / `* ` / `1. ` / `2. `) at the same list depth.

If both tokens appear on the same bullet, in the same paragraph without break, or in the same sentence separated only by commas / conjunctions, they are NOT on distinct branches — the class split has drifted back to the pre-fix converged shape.

**Ledger-shape recognition**: a code span matches iff the middle-dot separator ` · ` (U+00B7, three-byte UTF-8 sequence C2 B7) appears between the tokens. Regex-friendly form: `` /`[^`]*cursor-recovery\s+·\s+[a-z-]+\s+·\s+\d+[^`]*` `` for inline code; equivalent multi-line pattern for fenced blocks.

## Precedent match

Same shape as:

- **#398 audit** (`describe("398 — playbook invocations match generacy cockpit <verb> --help", …)` with `398-1` positive audit + `398-2` negative-fixture regression via `tests/fixtures/398-drift-auto.md`).
- **#402 audit** (`describe("402 — playbook AskUserQuestion invocation contract audit", …)` with `402-1` positive audit + `402-2` negative-fixture regression via `tests/fixtures/402-drift-auto.md`).
- **#403 audit** (`describe("403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract", …)` with structural anchor checks on § D.9 family + § D.9d prefix-match + § Invariants §8).

#408 follows the #398 / #402 shape verbatim (positive audit + negative fixture) with the structural checks specialized to § step 5's class split + G.4(e)'s options + § Ledger's cursor-recovery shape.

## Failure modes the audit catches

- **Someone rewrites § step 5 to collapse Branch A and Branch B back to one converged path** → `branchAResetFrom` and/or `branchBInvalidCursor` false → 408-1 fails.
- **Someone renames `Continue degraded (sweep-per-batch)` to `Keep going degraded` without updating the audit** → `optionContinueDegraded` false → 408-1 fails.
- **Someone removes the ledger-shape example from § step 5's body** → `ledgerShapePresent` false → 408-1 fails (assuming no code-span elsewhere in the searched region).
- **Someone accidentally makes `auditStep5` return `all-true` by scoping a regex too broadly** → the fixture no longer trips a failure → 408-2 fails.

## Failure modes the audit does NOT catch (and why that's OK)

- **Someone rewrites the prose of § step 5's Branch A introduction while preserving the structural properties** — structural-check-over-prose-sniff is the whole point (Q3=C precedent from #402); prose rewrites are welcome.
- **Someone changes the exact wording of the presentation block's evidence rows** — the audit doesn't check the presentation block's prose beyond the two option strings, so evidence-row wording drift is invisible. This is intentional: the presentation block's prose is operator-facing UX, and forcing a specific wording via audit would over-constrain future authors.
- **Someone changes the counter reset semantics** (e.g., only reset the resetting class's counter, not all four) — the audit doesn't check counter semantics because those are runtime semantics that can't be extracted from playbook prose alone. This is a known gap; the true verifier (T-S13 corpus smoke test) catches semantic regressions.
