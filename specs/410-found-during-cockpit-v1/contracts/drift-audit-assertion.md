# Contract: 410-1 structural drift audit + 410-2 negative-fixture regression

**Surface**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — new `describe("410 — auto.md D.7 repeat-failure dispatch fetches fresh evidence + failure_class_changed verdict field", …)` block appended to the existing suite.

## 410-1 — Structural drift audit (positive check on current `auto.md`)

**Purpose**: Assert at build time that the load-bearing structural properties of the fix are present in the current `auto.md`. If a future edit drops the first-vs-repeat sub-path split, removes a verdict-schema field name, elides the no-parent-characterization rule, or drops the G.4(b) sixth-element row, the audit fails.

**Input**: `AUTO_MD_PATH` (absolute path to `packages/claude-plugin-cockpit/commands/auto.md`).

**Assertions**:

1. **D.7 extractable** — the audit parser locates the H2 `## Dispatch` heading and, within it, the enumerated H3 subsection `### D.7 —` (or the equivalent post-rewrite anchor `### D.7 — \`agent:error\`…`). Failure → `d7Present: false`; other checks skipped.
2. **First-dispatch sub-path anchor** — within D.7's step 1 body, an anchor matching `first dispatch` / `first-dispatch` / `First dispatch` appears at bullet or paragraph separation from a repeat-dispatch anchor. `cockpit_context` appears in the same line/paragraph or within the sub-path's body. Failure → `firstDispatchSubPath: false`.
3. **Repeat-dispatch sub-path anchor** — within D.7's step 1 body, an anchor matching `repeat dispatch` / `repeat-dispatch` / `Repeat dispatch` appears at bullet or paragraph separation from the first-dispatch anchor. `cockpit_context` appears in the same line/paragraph or within the sub-path's body. Failure → `repeatDispatchSubPath: false`.
4. **`failure_class_changed` verdict-field name** — within D.7's step 2 body, the exact substring `failure_class_changed` appears at least once (as a JSON field name in the return-schema section or a fenced example). Failure → `failureClassChangedField: false`.
5. **`failure_classes_seen` verdict-field name** — within D.7's step 2 body, the exact substring `failure_classes_seen` appears at least once. Failure → `failureClassesSeenField: false`.
6. **No-parent-characterization rule anchor** — within D.7's step 1 or step 2 body, a rule-statement anchor appears matching a tolerant pattern:
   - `MUST NOT characterize`
   - `no parent-authored`
   - `not the parent's role to characterize` (or `not the parent's role to summarize`)
   - `parent MUST NOT summarize`
   - Equivalent structural rule statement matching a regex like `/parent MUST NOT (characterize|summarize|assert similarity)/i`.
   
   Failure → `noParentCharacterizationRule: false`.
7. **G.4(b) sixth-element row anchor** — within the G.4(b) presentation block (locate `**(b) `agent:error` / `failed:*`**` within `### G.4 —` or standalone `### G.4(b)`; extract to the next `**(<letter>)` anchor or the next H3 heading), the exact substring `Failure class changed since prior` appears at least once (as a row label). Failure → `g4bSixthElementRow: false`.

**Output**: `D7AuditReport` object:

```typescript
type D7AuditReport = {
  d7Present: boolean;
  firstDispatchSubPath: boolean;
  repeatDispatchSubPath: boolean;
  failureClassChangedField: boolean;
  failureClassesSeenField: boolean;
  noParentCharacterizationRule: boolean;
  g4bSixthElementRow: boolean;
};
```

**Pass criterion**: all seven fields `true`.

**Failure message** (rendered on any field `false`):

```text
D.7 drift detected in auto.md § D.7:
  d7Present: <bool>
  firstDispatchSubPath: <bool>
  repeatDispatchSubPath: <bool>
  failureClassChangedField: <bool>
  failureClassesSeenField: <bool>
  noParentCharacterizationRule: <bool>
  g4bSixthElementRow: <bool>
```

## 410-2 — Negative-fixture regression (positive check on the drift fixture)

**Purpose**: Assert that the audit is not vacuous — feeding a fixture that reproduces the pre-fix drift MUST report at least one structural failure. If a future refactor of `auditD7` accidentally always returns `all-true`, this test fails and catches the vacuous-audit degradation.

**Input**: `FIXTURE_410_DRIFT_AUTO` (absolute path to `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md`).

**Assertion**: at least one of the six downstream structural fields in the report is `false` (`d7Present` is expected `true` on the fixture — the fixture is well-formed markdown with a D.7 heading; the failure must come from a downstream check).

**Pass criterion**:

```typescript
const anyFailure =
  !report.firstDispatchSubPath ||
  !report.repeatDispatchSubPath ||
  !report.failureClassChangedField ||
  !report.failureClassesSeenField ||
  !report.noParentCharacterizationRule ||
  !report.g4bSixthElementRow;
expect(anyFailure, `expected at least one structural check to fail; observed report: ${JSON.stringify(report)}`).toBe(true);
```

## Audit-parser implementation notes

The parser MUST be structural, not prose-sniffing:

- **DO**: Locate H2 / H3 / bullet-list boundaries; check substring presence within specific extracted-section bodies; check anchor presence via tolerant regex patterns for rule statements.
- **DO NOT**: Regex the vocabulary of "loop-trust-boundary", "context reuse", "fresh evidence", "identical premise", "assertions are advisory", "similarity guess", etc. Those words may or may not appear in future rewrites; the structural properties above are stable.

**Sub-path anchor definition**: two sub-path anchors (e.g., `first dispatch` and `repeat dispatch`) are "at bullet or paragraph separation" iff between them appears at least one of:

- A blank line (paragraph break).
- A bold-heading marker (`**First dispatch**` / `**Repeat dispatch**` / equivalent).
- A separate bullet marker (`- ` / `* ` / `1. ` / `2. `) at the same list depth.

If both anchors appear on the same bullet, in the same paragraph without break, or in the same sentence separated only by commas / conjunctions, they are NOT at bullet or paragraph separation — the sub-path split has drifted back to the pre-fix single-unified shape.

**`cockpit_context` co-location definition**: `cockpit_context` is "co-located with a sub-path anchor" iff it appears within the same paragraph or bullet as the anchor, or in the immediate sub-body of the anchor's bullet (indented content beneath the sub-path bullet). This ensures each sub-path independently names the evidence-fetch verb; a single top-level `cockpit_context` mention outside both sub-paths would fail this check.

**Rule-anchor pattern** (tolerant regex):

```javascript
const RULE_ANCHOR_PATTERN =
  /parent\s+MUST\s+NOT\s+(characterize|summarize|assert\s+similarity)|no\s+parent-authored|not\s+the\s+parent'?s\s+role\s+to\s+(characterize|summarize)/i;
```

The pattern matches variations in whitespace, capitalization, and specific verb (`characterize` / `summarize` / `assert similarity`). It does NOT match generic instructions like "avoid characterizing" — the rule must be strongly worded (MUST NOT / no / not the parent's role) so the model treats it as a hard constraint.

**G.4(b) block extraction**: the parser locates the `**(b) `agent:error` / `failed:*`**` anchor within the `## Gate contract` H2 section (specifically within `### G.4 —` or standalone `### G.4(b)` subsection) and extracts the block from that anchor to the next `**(<letter>)` anchor (`**(a)`, `**(c)`, `**(d)`, `**(e)`) or the next H3 heading (`### G.5 —` or later). The search for `Failure class changed since prior` runs within this extracted block only.

## Precedent match

Same shape as:

- **#398 audit** (`describe("398 — playbook invocations match generacy cockpit <verb> --help", …)` with `398-1` positive audit + `398-2` negative-fixture regression via `tests/fixtures/398-drift-auto.md`).
- **#402 audit** (`describe("402 — playbook AskUserQuestion invocation contract audit", …)` with `402-1` positive audit + `402-2` negative-fixture regression via `tests/fixtures/402-drift-auto.md`).
- **#408 audit** (`describe("408 — auto.md § step 5 cursor-error class split + circuit breaker", …)` with `408-1` positive audit + `408-2` negative-fixture regression via `tests/fixtures/408-drift-auto.md`).

#410 follows the #398 / #402 / #408 shape verbatim (positive audit + negative fixture) with the structural checks specialized to D.7's first-vs-repeat sub-path split + verdict-schema addendum + G.4(b) sixth-element row + no-parent-characterization rule anchor.

## Failure modes the audit catches

- **Someone rewrites D.7 step 1 to collapse first-vs-repeat back to one unified dispatch path** → `firstDispatchSubPath` and/or `repeatDispatchSubPath` false → 410-1 fails.
- **Someone renames `failure_class_changed` to `class_changed` or `is_failure_class_changed` without updating the audit** → `failureClassChangedField` false → 410-1 fails.
- **Someone removes the no-parent-characterization rule** → `noParentCharacterizationRule` false → 410-1 fails.
- **Someone removes the sixth-element row from G.4(b)** → `g4bSixthElementRow` false → 410-1 fails.
- **Someone accidentally makes `auditD7` return `all-true` by scoping a regex too broadly** → the fixture no longer trips a failure → 410-2 fails.

## Failure modes the audit does NOT catch (and why that's OK)

- **Someone rewrites the prose of D.7 step 1 while preserving the structural properties** — structural-check-over-prose-sniff is the whole point (Q3=C precedent from #402); prose rewrites are welcome.
- **Someone changes the exact wording of the sixth-element row's rendering format** (e.g., `<yes/no>` instead of `<yes|no>`) — the audit doesn't check the row's rendering rules, only the row label's presence. The true verifier catches the rendering drift.
- **Someone changes the `failure_class_changed` computation rule** (e.g., all-of-three-must-differ instead of any-of-three-differs) — the audit doesn't check the computation rule because it's a runtime property that can't be extracted from playbook prose alone. The true verifier (T-S13 corpus smoke test) catches semantic regressions.
- **Someone changes `failure_classes_seen` from a running list to a single field** — the audit checks only the field name's presence; the semantics are documented in the contract and verified by the true verifier.
- **Someone weakens the rule anchor from `MUST NOT characterize` to `avoid characterizing`** — the tolerant regex requires strong wording; `avoid` alone would fail. This is intentional: weak wording is less likely to be respected.

## Composition with prior audits

The audit runs alongside the existing 394 / 396 / 398 / 400 / 402 / 403 / 406 / 408 blocks in the same test file. It does NOT depend on any prior block's assertions; it is self-contained (its own `auditD7` helper, its own fixture, its own report shape).

Shared helper dependencies: the audit does NOT reuse `auditStep5` from the 408 block (structurally similar but semantically distinct — different section, different fields, different anchors). If a future refactor extracts a common `extractMarkdownSection(filePath, h2Heading, h3Anchor)` utility, the audit can be refactored to use it, but until then, the audit's parser is self-contained per the #398 / #402 / #408 pattern.
