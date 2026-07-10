# Quickstart: Batched clarification gate + five-element presentation

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-07-10

Verification runbook. Read alongside [plan.md § Verification Layering](./plan.md#verification-layering).

## Prerequisites

- Repo checked out on branch `400-operator-requested-ux`.
- `pnpm install` completed at the repo root (`/workspaces/agency`).
- No `generacy cockpit` CLI dependency for the static + Vitest checks — those run offline from checked-in fixtures. The true-verifier smoke-test step needs `generacy` on `$PATH` and `gh auth status` green (inside a cluster session, `/shared-packages/node_modules/.bin` is already there).

## Static checks

All checks are Bash one-liners, run from `/workspaces/agency`. Expected outcome noted per line.

**Five-element presentation block is present in both playbooks**:

```bash
grep -c '\*\*Context:\*\*' packages/claude-plugin-cockpit/commands/clarify.md   # ≥ 1
grep -c '\*\*Question:\*\*' packages/claude-plugin-cockpit/commands/clarify.md  # ≥ 1
grep -c '\*\*Options:\*\*' packages/claude-plugin-cockpit/commands/clarify.md   # ≥ 1
grep -c '\*\*Recommendation:\*\*' packages/claude-plugin-cockpit/commands/clarify.md  # ≥ 1
grep -c '\*\*Why:\*\*' packages/claude-plugin-cockpit/commands/clarify.md       # ≥ 1

grep -c '\*\*Context:\*\*' packages/claude-plugin-cockpit/commands/auto.md      # ≥ 1
grep -c '\*\*Question:\*\*' packages/claude-plugin-cockpit/commands/auto.md     # ≥ 1
grep -c '\*\*Options:\*\*' packages/claude-plugin-cockpit/commands/auto.md      # ≥ 1
grep -c '\*\*Recommendation:\*\*' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1
grep -c '\*\*Why:\*\*' packages/claude-plugin-cockpit/commands/auto.md          # ≥ 1
```

**Old two-option per-question pair is gone** (smoking-gun negative anchors):

```bash
grep -c 'Approve draft (Recommended)' packages/claude-plugin-cockpit/commands/clarify.md  # 0
grep -c 'Approve draft (Recommended)' packages/claude-plugin-cockpit/commands/auto.md     # 0
```

Note: bare `Skip this question` may still appear in explanatory prose (e.g., historical description of the pre-fix shape when comparing with §Escape). The grep-based check we care about is that `Approve draft (Recommended)` — the exact old primary-option label — no longer appears anywhere in either playbook.

**New three-option batch-gate primary is present**:

```bash
grep -c 'Approve all & post (Recommended)' packages/claude-plugin-cockpit/commands/clarify.md  # ≥ 1
grep -c 'Approve all & post (Recommended)' packages/claude-plugin-cockpit/commands/auto.md     # ≥ 1
grep -c 'Make changes' packages/claude-plugin-cockpit/commands/clarify.md                       # ≥ 1
grep -c 'Make changes' packages/claude-plugin-cockpit/commands/auto.md                          # ≥ 1
grep -c 'Skip this batch' packages/claude-plugin-cockpit/commands/clarify.md                    # ≥ 1
grep -c 'Skip this batch' packages/claude-plugin-cockpit/commands/auto.md                       # ≥ 1
```

**SB.1 field rename (drafter contract)**:

```bash
grep -c 'recommendation' packages/claude-plugin-cockpit/commands/clarify.md      # ≥ 1
grep -c 'justification' packages/claude-plugin-cockpit/commands/clarify.md       # ≥ 1
grep -c 'recommendation' packages/claude-plugin-cockpit/commands/auto.md         # ≥ 1
grep -c 'justification' packages/claude-plugin-cockpit/commands/auto.md          # ≥ 1

grep -c 'drafted_answer' packages/claude-plugin-cockpit/commands/clarify.md      # 0
grep -c 'drafted_answer' packages/claude-plugin-cockpit/commands/auto.md         # 0
```

**§ Directive grammar subsection is byte-identical between the two playbooks**:

```bash
diff \
  <(sed -n '/^### Directive grammar/,/^\(##\|###\) /p' packages/claude-plugin-cockpit/commands/clarify.md | sed '$d') \
  <(sed -n '/^### Directive grammar/,/^\(##\|###\) /p' packages/claude-plugin-cockpit/commands/auto.md | sed '$d')
# Expected: no output (exit 0). Any diff output is a drift bug — fix it in the same PR.
```

**Parser module exists and exports the expected names**:

```bash
test -f packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts && echo "OK: file exists"
grep -c 'export function parseBatchComment' packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts  # ≥ 1
grep -c 'export function parseDirectives' packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts    # ≥ 1
grep -c 'export interface ParsedBatch' packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts       # ≥ 1
grep -c 'export interface ParsedQuestion' packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts    # ≥ 1
grep -c 'export type Directive' packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts              # ≥ 1
```

**No new invariant added to auto.md**:

```bash
grep -c '^## Invariants' packages/claude-plugin-cockpit/commands/auto.md  # 1 (unchanged)
awk '/^## Invariants/,/^## /' packages/claude-plugin-cockpit/commands/auto.md | grep -c '^[0-9]\+\. \*\*'  # 7 (unchanged — same enumerated list as before this branch)
```

**Historical spec directories untouched**:

```bash
git diff --stat origin/develop -- specs/384-found-during-cockpit-v1/  # empty
git diff --stat origin/develop -- specs/388-found-during-cockpit-v1/  # empty
git diff --stat origin/develop -- specs/390-found-during-cockpit-v1/  # empty
git diff --stat origin/develop -- specs/394-found-during-cockpit-v1/  # empty
git diff --stat origin/develop -- specs/396-found-during-cockpit-v1/  # empty
git diff --stat origin/develop -- specs/398-found-during-cockpit-v1/  # empty
```

**Sibling playbooks untouched**:

```bash
git diff --stat origin/develop -- packages/claude-plugin-cockpit/commands/{merge,queue,review,status,watch}.md  # empty
```

## Behavioral checks (Vitest)

From the repo root:

```bash
pnpm --filter @generacy-ai/claude-plugin-cockpit test
```

Expected: **all existing tests pass** (394-1 through 394-3, 396-1 through 396-3, 398-1, 398-2) **plus five new tests pass**:

- **400-1** — batch-comment parse tolerates option-bullet variations (`A:` and `A)`).
- **400-2** — title fallback fires only when the batch header lacks a title.
- **400-3** — free-form question renders the no-options placeholder rather than omitting the element.
- **400-4** — directive grammar payload shapes (bare letter → no rationale; letter + reason → reason; skip → excluded; verbatim with embedded semicolon → not mis-split).
- **400-5** — single-line semicolon form parses identically to newline-separated form.

Run a single test at a time (useful during implementation):

```bash
pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --run playbook-verification.test.ts -t '400-1'
```

## Manual smoke test (true verifier)

Live-test the batch-gate presentation on a real epic that has entered `waiting-for:clarification` with ≥ 4 open questions. Two flavors:

**Flavor A — `/cockpit:clarify` (interactive assist)**:

```bash
# Cluster session with `generacy` on $PATH and `gh auth status` green:
/cockpit:clarify <owner>/<repo>#<child-issue>
```

Expected:
1. The presentation block renders each open question with all five elements (context, question, options, recommendation, why), title reused verbatim from the batch header, provenance line under each block.
2. **Exactly one** `AskUserQuestion` fires (with three options: `Approve all & post (Recommended)` / `Make changes` / `Skip this batch`), not `ceil(N/4)` and not N.
3. Selecting `Approve all & post` posts a single marker-prefixed comment with N answers using the `**Answer:**` + `**Rationale:**` shape, and advances the clarification gate.
4. Selecting `Make changes` and typing directives like `Q2: B — because X\nQ4: skip` re-presents only Q2 and Q4 (with Q2's answer/rationale replaced and Q4 marked skipped), then re-fires the same three-option gate.
5. Typing directives into the "Other" free-text field of the initial gate applies them in a single turn (no `Make changes` round-trip).
6. Zero-directive `Make changes` re-presents the entire batch and re-fires the same gate (no auto-approve, no auto-skip).

**Flavor B — `/cockpit:auto` (D.1 dispatch)**:

```bash
/cockpit:auto <owner>/<repo>#<epic-issue>
```

Expected: When any child issue enters `waiting-for:clarification`, the D.1 dispatch runs the same batch-gate flow as flavor A. The ledger line shape matches the vocabulary in `auto.md` § Ledger (unchanged): `<issue-ref> · waiting-for:clarification · clarification-batch · <advanced | posted <k>/<N>, skipped <s> | all answers skipped | error: <description>>`.

## Troubleshooting

**"Test 400-4 fails on the verbatim-with-semicolon fixture"** — parser is naive-splitting on `;`. Check `parseDirectives`: the token-anchored split must use `/(?=Q\d+:)/` lookahead, not `/;\s*/`. See [contracts/directive-parser.md § Splitter rule](./contracts/directive-parser.md).

**"Test 400-1 fails on the `A)` fixture"** — regex is too strict. Should be `/^\s*([A-Z])[:)]\s+(.+)$/` (colon OR paren), not `/^\s*([A-Z]):\s+(.+)$/`.

**"Test 400-2 fails on the no-title fixture with 'Cannot read properties of null (reading slice)'"** — renderer's fallback path isn't handling `title: null`. Wrap: `const displayTitle = q.title ?? q.question.split('\n')[0].slice(0, 80);`.

**"Static check `diff <(sed …) <(sed …)` reports a divergence between the two playbooks' § Directive grammar blocks"** — one of the two playbook edits didn't apply the same text. Re-copy the block verbatim from [data-model.md § Directive grammar](./data-model.md#-directive-grammar-byte-identical-block-in-both-playbooks).

**"Grep for `drafted_answer` returns > 0"** — the SB.1 field rename missed a spot. Check both files' step 4 / step 6 assembly-rule prose (the field appears in the old drafting contract, the old return-schema block, and the old assembly step).

**"Grep for `Approve draft (Recommended)` returns > 0"** — the old two-option per-question pair is still documented somewhere. Check the § Gate contract table row for G.1 (must be updated to reflect the three-option batch shape), the D.1 step-3 prose, and any example blocks (like `auto.md` Example 2 — the N=6 example — which references the pre-fix `ceil(6/4) = 2` fan-out and needs a rewrite consistent with the new one-call shape).

**"Manual smoke test in flavor A shows two `AskUserQuestion` calls for N=6, not one"** — the playbook prose still says `ceil(N/4)`. Check clarify.md step 5 (batched to one call) and auto.md D.1 step 3 (batched to one call) — the single-call rule is load-bearing across both surfaces.

## One-line commands (copy-paste reference)

```bash
# All static checks at once (bail on first failure):
set -e
for pattern in 'Context:' 'Question:' 'Options:' 'Recommendation:' 'Why:'; do
  for file in packages/claude-plugin-cockpit/commands/{clarify,auto}.md; do
    grep -q "\\*\\*${pattern}\\*\\*" "$file" || { echo "MISSING: **${pattern}** in $file"; exit 1; }
  done
done
grep -L 'drafted_answer' packages/claude-plugin-cockpit/commands/{clarify,auto}.md >/dev/null || { echo "drafted_answer still present"; exit 1; }
grep -L 'Approve draft (Recommended)' packages/claude-plugin-cockpit/commands/{clarify,auto}.md >/dev/null || { echo "old option label still present"; exit 1; }
echo "All static checks passed."

# Vitest — plugin package only:
pnpm --filter @generacy-ai/claude-plugin-cockpit test

# Vitest — just the 400 block:
pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --run playbook-verification.test.ts -t '400'
```
