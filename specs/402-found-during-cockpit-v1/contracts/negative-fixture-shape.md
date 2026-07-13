# Contract: `packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md` shape

**Consumers**: `402-2` (negative-fixture regression assertion); future authors extending the audit with additional drift shapes.

## Purpose

Minimal markdown reproduction of the pre-fix state — the state finding #57's session encountered when it read G.1's `**Gate invocation**` paragraph (post-#400 but pre-#402) and concatenated all fused-gate items into a single `AskUserQuestion.questions` array.

The load-bearing property of this fixture: feeding it through the audit MUST produce `sectionExists: false`. This is the machine-checkable proof that the audit's parser correctly identifies the absence of the contract section — the positive-signal counterpart to `402-1`'s positive-drift audit.

## File location

`packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md`

## Naming convention

Follows the `<finding>-drift-<command>.md` pattern established by #398's `398-drift-auto.md`. Future drift regressions for other findings targeting `auto.md` follow `<N>-drift-auto.md`; findings targeting other playbooks follow `<N>-drift-<command>.md`.

## Content (canonical shape)

```markdown
# Auto Command (drift fixture for #402 — DO NOT EDIT prose semantics)

This is a MINIMAL FIXTURE reproducing the pre-#402 state of `commands/auto.md`.
The audit (`402-2`) feeds this file through the same structural check as `402-1`
and asserts `sectionExists: false` — the specific failure the fix is defined to
correct.

DO NOT add `## AskUserQuestion invocation contract` to this file. The fixture's
value is its absence of the section.

## Gate contract

Four gate types — clarification batches, review/validation verdicts, phase-queue
confirmations, red/error escalations — are the exhaustive human-interaction
surface. **Nothing else prompts; none of these auto-proceed.**

### G.1 — Clarification batch gate

**Trigger**: D.1 (`waiting-for:clarification`).

**Presentation**: (elided in this fixture — irrelevant to the drift audit; the audit
checks structural properties of the surrounding sections, not the presentation
block's content).

**Gate invocation**: **Exactly one** `AskUserQuestion` call per batch in the same response (never `ceil(N/4)`, never per-question). Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)` — post every drafted answer as-is.
  2. `Make changes` — enter the re-loop.
  3. `Skip this batch` — post nothing.

<!-- No `## AskUserQuestion invocation contract` section follows. The audit MUST report sectionExists=false on this file. -->
```

## Constraints

- **The file MUST NOT contain any heading matching `## AskUserQuestion invocation contract` at any depth.** Any accidental addition breaks `402-2`'s expected failure mode (the assertion is `sectionExists === false`).
- **The file DOES contain the pre-fix G.1 `**Gate invocation**: **Exactly one**` phrasing.** This documents the pre-fix state directly; a reader of the fixture sees the exact prose that finding #57's session read.
- **The file is MINIMAL** (~15-25 lines). Q4=C (from #398's precedent, `398-drift-auto.md`) rejected full-file snapshots as noise-around-defect. The audit's failure signal is per-file, not per-line — the fixture needs only enough context to parse (one `## Gate contract` H2 heading + one G.1 H3 heading) and the missing-section signal.
- **The file is CHECKED IN** (not generated at test time). This mirrors the audit's real input mode (markdown files read from disk); a generated-at-test-time fixture would exercise a different code path (Q2=A precedent from #398).
- **The file is EDITED ONLY BY DELIBERATE UPDATE.** A refactor of `auto.md`'s H2 depth scheme (say, changing `## Gate contract` → `# Gate contract`) requires the fixture be updated to match — otherwise the audit's parser walks the fixture and can't find the section boundaries it expects. Add a comment at the top of the fixture reminding future authors of this.

## Interaction with `402-1`

`402-1` audits `auto.md` (positive drift audit); `402-2` audits `402-drift-auto.md` (negative-fixture regression). Both use the same audit function (`auditContract(filePath)`). If a future refactor breaks the parser, both assertions likely fail together — but `402-2`'s failure is more diagnostic because the fixture is stable (it should ALWAYS produce `sectionExists: false`); if `402-2` starts passing, the audit's structural check broke.

## Interaction with future drift fixtures

Future drift regressions can add fixtures like `403-drift-auto.md` (say, a different finding on `auto.md`) or `404-drift-clarify.md` (a finding on `clarify.md`). Each drift fixture:

1. Follows the `<finding>-drift-<command>.md` naming pattern.
2. Ships with a companion `<finding>-<N>` assertion in `playbook-verification.test.ts` that feeds it through an appropriate audit and asserts the specific expected failure.
3. Includes a top-of-file comment documenting what it's the negative case for.

This pattern is scale-friendly: adding a drift fixture is a drop-in operation (add a file, add an assertion), no test-file schema change required.

## Rationale

Machine-checkable proof against silent degradation of the audit. If someone refactors the audit's parser and accidentally introduces a bug that always returns `sectionExists: true`, `402-1` still passes on the current (post-fix) `auto.md` (which does have the section), but `402-2` fails on the negative fixture (which should always report `sectionExists: false`). The fixture is the second half of the fault-detection surface.

Without a negative fixture, `402-1`'s positive check can silently degrade to "assertion passes because the parser is broken" — the negative fixture blocks that failure mode by requiring a specific known-negative outcome.
