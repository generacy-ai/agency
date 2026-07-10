# Contract: FR-011 drift audit (assertion 396-3)

Structural contract for the drift-audit assertion appended to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. The audit is completeness hygiene — a bug here fails the audit at build time; it does not cause a T-S5 silent stall (that's the tightened D.10 trigger's job).

## What the audit checks

Given:
- `GATE_VOCABULARY` from `lib/gate-vocabulary.ts` (a `readonly string[]` of `waiting-for:*` tokens).
- `auto.md` from `commands/auto.md` (a raw string containing prose + markdown tables).

Assert:
- **A1**: `GATE_VOCABULARY.length === 12` (matches the 11 `labels.yml` tokens + `waiting-for:merge-conflicts`).
- **A2**: For every `token` in `GATE_VOCABULARY`, there exists at least one Trigger match in `auto.md`'s § Dispatch table.
- **A3**: For every named dispatch row (D.1 through D.9c and D.11 — but NOT D.10), the row's Trigger token(s) are present in `GATE_VOCABULARY`. (Reverse-direction check: rows can't add tokens the vocabulary doesn't declare.)

## Trigger-match definition (A2)

A token is considered "present as a Trigger" in `auto.md` if EITHER:

- **(a) A subheading exists**: `### D.<n>[a-z]? — \`<token>\`` regex-matches somewhere in the § Dispatch prose (e.g., `### D.11 — \`waiting-for:merge-conflicts\``).

OR:

- **(b) The token appears in the § Dispatch table row**: the first column of `| D.<n>[a-z]? | \`<token>\` | ... |` regex-matches somewhere in the table (accounts for tokens that share a subheading, e.g., D.2 covers 4 `<artifact>-review` tokens under one heading).

The audit implementation SHOULD prefer (a) for exact-match tokens and (b) for grouped tokens (D.2's four `waiting-for:<artifact>-review` variants). Either match satisfies A2.

## Explicit non-goals

- **The audit does NOT check that D.10 catches out-of-vocabulary tokens.** That's the runtime safety net, tested by assertion 396-2. The audit is a static build-time check on the declared vocabulary; it says nothing about runtime dispatch behavior.
- **The audit does NOT check ordering (D.9 before D.10, catch-all last).** Those are contract invariants C.1–C.3 in [../data-model.md § 1.2](../data-model.md#12-post-state-proposed); they're covered by separate static greps in [../quickstart.md § Static checks](../quickstart.md#static-checks).
- **The audit does NOT check dispatch-row shape (ledger-only vs. escalation-gate).** The row's shape is prose the operator writes when adding the row; the audit only checks that the row exists.
- **The audit does NOT read `tetrad-development/.github/labels.yml`.** Cross-repo reads are rejected (Q1=A/B); the vocabulary source is the plugin-local `lib/gate-vocabulary.ts` declared list.

## Pseudo-implementation

```typescript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GATE_VOCABULARY } from "../lib/gate-vocabulary.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTO_MD = resolve(__dirname, "..", "commands", "auto.md");

describe("396-3 (FR-011): drift audit — vocabulary ⊆ auto.md § Dispatch triggers", () => {
  it("A1: GATE_VOCABULARY has exactly 12 tokens", () => {
    expect(GATE_VOCABULARY.length).toBe(12);
  });

  it("A2: every vocabulary token has a Trigger match in auto.md", () => {
    const autoMd = readFileSync(AUTO_MD, "utf-8");
    const dispatchSection = extractDispatchSection(autoMd);
    for (const token of GATE_VOCABULARY) {
      const hasSubheading = new RegExp(
        `^###\\s+D\\.\\d+[a-z]?\\s+—\\s+\`${escapeRegExp(token)}\``,
        "m",
      ).test(dispatchSection);
      const hasTableRow = new RegExp(
        `^\\|\\s*D\\.\\d+[a-z]?\\s*\\|\\s*\`${escapeRegExp(token)}\``,
        "m",
      ).test(dispatchSection);
      expect(hasSubheading || hasTableRow, `token ${token} not found as a Trigger`).toBe(true);
    }
  });

  it("A3: every named dispatch row's Trigger token is in GATE_VOCABULARY", () => {
    const autoMd = readFileSync(AUTO_MD, "utf-8");
    const dispatchSection = extractDispatchSection(autoMd);
    const rowTokens = extractDispatchRowTokens(dispatchSection);
    // rowTokens: string[] — tokens claimed by any D.1–D.9c or D.11 row.
    // Exclude D.10 (catch-all — no specific token).
    for (const token of rowTokens) {
      expect(GATE_VOCABULARY, `row token ${token} not in vocabulary`).toContain(token);
    }
  });
});

function extractDispatchSection(md: string): string { /* ... */ }
function extractDispatchRowTokens(section: string): string[] { /* ... */ }
function escapeRegExp(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
```

The helper functions (`extractDispatchSection`, `extractDispatchRowTokens`) are inline in the test file; they parse the `## Dispatch` section (between the `## Dispatch` heading and the next `## ` heading) and extract Trigger tokens from either the table's first column or the subheading tokens.

## Failure modes and how to interpret them

**A1 fails**: someone added or removed a token from `GATE_VOCABULARY` without updating this test's expected count. Read the diff on `lib/gate-vocabulary.ts` — either the count assertion needs updating (intentional sync) or the vocabulary edit was accidental.

**A2 fails**: a token in `GATE_VOCABULARY` has no matching dispatch row in `auto.md`. Either:
- The vocabulary was updated (new engine label) but the corresponding dispatch row wasn't added → add the row (D.9-shape for server-side-owned, D.11-shape for operator-authorable) OR remove the token from the vocabulary if it should be caught by D.10.
- A dispatch row was accidentally deleted → restore it.

**A3 fails**: a dispatch row lists a Trigger token that isn't in `GATE_VOCABULARY`. Either:
- The vocabulary needs updating (upstream label was added) → sync `GATE_VOCABULARY` from `labels.yml`.
- The dispatch row was added with a typo → fix the typo.
- The dispatch row was added for a token that shouldn't be dispatched → remove the row (D.10 will catch it at runtime).

## Coordination with the runtime safety net

The audit and the tightened D.10 trigger cover disjoint failure modes:

| Failure | Audit signal | Runtime signal |
|---------|--------------|----------------|
| Vocabulary drift (new engine label, vocabulary not updated) | A2 passes (audit doesn't see the label); build stays green | D.10 fires on the unknown label at runtime; escalation gate to operator |
| Dispatch-row deletion (row removed without vocabulary edit) | A2 fails at build time; PR blocked | Would fire D.10 at runtime if the label came in; but the audit catches it first |
| Typo in a row's Trigger token | A3 fails at build time; PR blocked | Depends on the typo — could fire D.10 or dispatch to the wrong row |
| Classification drift (playbook prose changes such that D.10 doesn't fire on unknown labels) | Audit doesn't detect (prose-level, not schema-level) | D.10's tightened trigger prose contains the anchor phrases that make regression visible on prose-review |

The audit catches **schema-level drift** (vocabulary vs. dispatch table alignment). The tightened trigger catches **classification drift at runtime**. Neither is a superset of the other; both are needed.

## Verification of the audit itself

Meta-check (not part of assertion 396-3; part of `/quickstart.md § Vitest run`):
- Run the full `pnpm --filter claude-plugin-cockpit test` suite.
- Confirm all three 396 assertions pass on the branch's `auto.md` + `lib/gate-vocabulary.ts`.
- Confirm the two 394 assertions still pass (regression check — the audit's new imports must not break the existing suite).

Local check to verify the audit catches drift:
1. Temporarily add a fake token to `GATE_VOCABULARY` (e.g., `"waiting-for:test-drift"`).
2. Run the tests — A1 fails first (count mismatch); once A1's expected count is bumped, A2 should fail (no matching dispatch row).
3. Revert.

This is a smoke test to confirm the audit's regex logic is not vacuous.
