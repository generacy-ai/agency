# Contract: `402-1` structural drift audit + `402-2` negative-fixture regression assertion

**Consumers**: The `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` suite; future authors debugging audit failures.

## `402-1` — Structural drift audit

### Purpose

Assert that `commands/auto.md` carries the load-bearing architecture the fix creates: the top-level `## AskUserQuestion invocation contract` section exists, its body states the ≤4 harness ceiling, and every gate contract G.1–G.5 (including G.4a/b/c/d) references it.

### Input

`packages/claude-plugin-cockpit/commands/auto.md` file contents (utf-8 string).

### Parser stages

1. **Section parse**: split the file into H2/H3 sections tracked by `depth`, `startLine`, `endLine`, `header`, `body`.
2. **Find contract section**: find the H2 section whose header contains the substring `AskUserQuestion invocation contract` (case-insensitive). If not found, fail with `sectionExists: false`.
3. **Bound-present check** on `contractSection.body`: match `≤ ?4 ?items? ?per ?call` regex OR co-occurrence of literal tokens `4 items` and `per call`. If neither matches, fail with `boundPresent: false`.
4. **Gate-references check**: find all H3 sections whose header matches `^### G\.\d(a|b|c|d)? — ` (regex — captures `G.1`, `G.2`, `G.3`, `G.4a`, `G.4b`, `G.4c`, `G.4d`, `G.5`). For each, assert `body.includes("AskUserQuestion invocation contract")`. If any lacks the substring, fail with `missing-reference-from-<gate-name>`.

### Output on pass

The `it()` assertion passes; no output written.

### Output on failure

```
Contract-audit drift detected:
  sectionExists: <true|false>
  boundPresent: <true|false>
  gateReferences:
    G.1: <true|false>
    G.2: <true|false>
    G.3: <true|false>
    G.4a: <true|false>
    G.4b: <true|false>
    G.4c: <true|false>
    G.4d: <true|false>
    G.5: <true|false>
```

Assertion failure includes the specific failing check(s) and the offending file line ranges for each.

### Structural — not prose-sniffing

The audit checks structural properties:

- **Section existence**: exact H2 heading substring.
- **Bound presence**: literal-token or regex-hit within a bounded section body.
- **Cross-references**: substring within each gate-contract section body.

The audit NEVER regexes fusion vocabulary (`fused`, `fanout`, `same response`, `simultaneously`). Q3=C's decision explicitly rejects dialect-pinned regex — the exact failure mode generacy#909 instanced at the classification surface.

### Composability with future audits

If a future finding adds a top-level `## <Other> invocation contract` section (e.g., `## Bash tool invocation contract` covering shell-out shape), the same parser walks the same file and applies the same structural checks — different section header substring, different bound-token, different cross-reference substring. The audit's parser stages (section parse → find target section → bound-present → cross-references) generalize.

## `402-2` — Negative-fixture regression assertion

### Purpose

Positive-signal check that `402-1`'s parser correctly identifies the *absence* of the contract section. Guards against a future refactor accidentally scoping the parser to a different depth, a different section-header substring, or silently degrading to no-op.

### Input

`packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md` — a minimal checked-in fixture (~15-25 lines) reproducing the pre-fix state:

- Contains `## Gate contract` at H2 depth.
- Contains `### G.1 — Clarification batch gate` at H3 depth with the pre-fix `**Gate invocation**: **Exactly one** ... never ceil(N/4)` phrasing.
- Does NOT contain `## AskUserQuestion invocation contract` at any depth.

See [`contracts/negative-fixture-shape.md`](./negative-fixture-shape.md) for the fixture's canonical layout.

### Expected audit output

```
sectionExists: false
```

The other checks (`boundPresent`, `gateReferences`) are not reached — the audit short-circuits on `sectionExists: false` because the other checks depend on the section existing.

### Assertion

```typescript
it("402-2 (regression check): audit reports missing-contract-section on 402-drift-auto.md fixture", () => {
  const report = auditContract(FIXTURE_402_DRIFT_AUTO);
  expect(
    report.sectionExists,
    `expected sectionExists:false; fixture: 402-drift-auto.md; observed report: ${JSON.stringify(report)}`,
  ).toBe(false);
});
```

### Why this assertion exists

Without `402-2`, a future refactor of `402-1`'s section-parser could silently degrade to no-op (e.g., a regex-scope bug that always returns `sectionExists: true` regardless of input). `402-1` would still pass day one (the current `auto.md` has the section) but would false-pass on any future removal. `402-2` catches the degradation at build time: if the parser degrades, `402-2` fails immediately on the negative fixture.

This is the same failure-mode-defense-in-depth pattern #398 established with `398-2` (positive-signal regression against the pre-fix drift fixture).

## Combined test file layout

The new block is appended to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` after the existing `describe("400 — clarification batch parser + directive grammar", ...)` block:

```typescript
// -----------------------------------------------------------------------------
// 402 — playbook AskUserQuestion invocation contract audit
//
// Structural check that commands/auto.md carries the load-bearing architecture:
// top-level `## AskUserQuestion invocation contract` section (Q1=B/Q4=C), ≤4
// harness ceiling stated in that section's body (finding #57 root cause),
// and cross-references from every gate contract G.1-G.5 (Q3=C). Prose-sniffing
// (fusion-vocabulary regex) is explicitly rejected; the audit is structural.
//
// 402-1: positive drift audit on current auto.md
// 402-2: negative-fixture regression against 402-drift-auto.md
// -----------------------------------------------------------------------------

type AuditReport = { ... };
function auditContract(filePath: string): AuditReport { ... }

describe("402 — playbook AskUserQuestion invocation contract audit", () => {
  it("402-1 (structural drift audit): auto.md has the contract section, the ≤4 bound, and cross-references from every gate contract", () => {
    const report = auditContract(AUTO_MD_PATH);
    // ... assertions per the four structural checks
  });

  it("402-2 (regression check): audit reports missing-contract-section on 402-drift-auto.md fixture", () => {
    const report = auditContract(FIXTURE_402_DRIFT_AUTO);
    expect(report.sectionExists).toBe(false);
  });
});
```

Helper functions (`auditContract`, `parseSections`, `findContractSection`, `findGateSections`, `boundPresent`) are defined inline in the test file — following the `398-1`/`400-1` pattern of inline audit helpers, not exported from `lib/`. The audit is test-only infrastructure; it has no runtime consumer.

## Failure diagnosis paths

- **`402-1` fails, `402-2` passes**: The runtime prose regressed. Check `auto.md` for the specific missing element (`sectionExists`, `boundPresent`, or `missing-reference-from-G.<n>`).
- **`402-1` passes, `402-2` fails**: The audit parser silently degraded, or the fixture was accidentally edited. Check that `402-drift-auto.md` doesn't contain `## AskUserQuestion invocation contract`; if it doesn't, then `402-1`'s parser has a bug.
- **Both fail**: A structural refactor of `auto.md` broke the parser's assumptions (e.g., someone changed the heading depth scheme). Reconcile the parser and the prose in the same commit.
- **Both pass but the runtime session still hits `InputValidationError: Too big`**: The audit's structural checks are green but the runtime prose doesn't compose the rules the way the model interprets them. This is a genuinely-behavioral drift the structural audit cannot catch by construction; escalate to a follow-up finding with the T-S evidence.
