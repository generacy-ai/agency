# Quickstart: #402 — Verify the `AskUserQuestion invocation contract` fix

Verification runbook for the fix specified in [plan.md](./plan.md). Three surfaces to check: static grep on `auto.md`, Vitest `402-1` + `402-2` assertions, and an operator smoke-test one-liner for the true verifier.

## Prerequisites

- Repository checked out on branch `402-found-during-cockpit-v1`.
- `pnpm install` completed (Vitest available).
- (For the true verifier) A Generacy cluster session with `generacy` on `$PATH` and a target epic that fanouts ≥5 issues into the same `waiting-for:*` transition class.

## Static checks (fast; run before the test suite)

The static checks are necessary but not sufficient — they catch obvious regressions (someone deleted the section, someone reintroduced `ceil(N/4)`, someone forgot to add a reference). They do not catch behavioral drift; that's `402-1`'s job.

### Positive anchors

Run from the repo root:

```bash
# 1. The contract section header exists at H2 depth.
grep -n '^## AskUserQuestion invocation contract' packages/claude-plugin-cockpit/commands/auto.md

# Expected: exactly one match, on the line where the new section begins.
# If zero matches: the fix regressed; the section was removed or downgraded.
# If ≥2 matches: the fix is malformed; duplicate section headers are a bug.

# 2. The ≤4 harness ceiling appears in the section body.
awk '/^## AskUserQuestion invocation contract/,/^## /' packages/claude-plugin-cockpit/commands/auto.md \
  | grep -c '4 items'

# Expected: ≥1.
# Companion check:
awk '/^## AskUserQuestion invocation contract/,/^## /' packages/claude-plugin-cockpit/commands/auto.md \
  | grep -c 'per call'

# Expected: ≥1.

# 3. Each gate contract references the section.
for gate in 'G\.1' 'G\.2' 'G\.3' 'G\.4' 'G\.5'; do
  awk -v g="^### $gate" '$0 ~ g,/^### G\./' packages/claude-plugin-cockpit/commands/auto.md \
    | grep -c 'AskUserQuestion invocation contract'
done

# Expected: each iteration prints ≥1.
# If any iteration prints 0: that gate contract lost its reference.
```

### Negative anchors

```bash
# 1. The pre-fix `never ceil(N/4)` wording is gone from G.1's Gate invocation paragraph.
grep -n 'never ceil(N/4)' packages/claude-plugin-cockpit/commands/auto.md

# Expected: zero matches. Any match means G.1 still carries the pre-#400/#402 wording.

# 2. The pre-fix `Exactly one` inline phrasing at G.1's Gate invocation is gone.
awk '/^### G\.1 —/,/^### / {print}' packages/claude-plugin-cockpit/commands/auto.md \
  | grep -n '\*\*Gate invocation\*\*: \*\*Exactly one\*\*'

# Expected: zero matches. G.1's `**Gate invocation**` paragraph should now open with
# `Per § AskUserQuestion invocation contract — …`, not `**Exactly one** ...`.

# 3. No new invariant §8 was added.
grep -n '^8\.' packages/claude-plugin-cockpit/commands/auto.md

# Expected: zero matches within the `## Invariants` section (any hits outside are unrelated).
```

### Sibling-playbook untouched check

```bash
# The fix is auto.md-only. Sibling playbooks (Q1=B out of scope) should have zero diffs.
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/review.md \
  packages/claude-plugin-cockpit/commands/merge.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/status.md \
  packages/claude-plugin-cockpit/commands/watch.md

# Expected: empty diff. Any hunks here mean the fix touched an out-of-scope surface.
```

### Historical spec directories untouched check

```bash
git diff origin/develop -- 'specs/384-*' 'specs/388-*' 'specs/390-*' 'specs/394-*' 'specs/396-*' 'specs/398-*' 'specs/400-*'

# Expected: empty diff. Historical spec directories are deliberately byte-identical across this branch.
```

### Fixture existence check

```bash
# The negative fixture exists and does NOT contain the contract section (that's what makes it "negative").
test -f packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md \
  && ! grep -q '^## AskUserQuestion invocation contract' packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md \
  && echo "OK: fixture exists and reproduces the pre-fix drift (no contract section)"

# Expected: prints `OK: …`. Any other output means the fixture is missing or accidentally contains the contract section.
```

## Behavioral checks — Vitest suite

The behavioral checks catch drift the static grep can't (e.g., someone factored the section into a sub-file and the header no longer appears verbatim; someone renamed the contract section and forgot to update the references). Run from the repo root:

```bash
pnpm --filter @generacy-ai/claude-plugin-cockpit test tests/playbook-verification.test.ts
```

The suite runs the existing `394 — …`, `396 — …`, `398 — …`, `400 — …` describe blocks plus the new `402 — …` block.

Expected output (abbreviated):

```
 ✓ 394 — auto.md unfiltered stream consumption + liveness cross-check (2 tests)
 ✓ 396 — waiting-for:* vocabulary + D.10 catch-all (N tests)
 ✓ 398 — playbook invocations match generacy cockpit <verb> --help (2 tests)
 ✓ 400 — clarification batch parser + directive grammar (5 tests)
 ✓ 402 — playbook AskUserQuestion invocation contract audit
   ✓ 402-1 (structural drift audit): auto.md has the contract section, the ≤4 bound, and cross-references from every gate contract
   ✓ 402-2 (negative-fixture regression): audit reports missing-contract-section on 402-drift-auto.md
```

### Failure diagnosis

- **`402-1` fails with `sectionExists: false`**: The `## AskUserQuestion invocation contract` heading is missing at H2 depth. Check for typos in the header, wrong depth (`###` vs `##`), or that the section was accidentally deleted.
- **`402-1` fails with `boundPresent: false`**: The section exists but doesn't state the ≤4 bound. Check the section body for the tokens `4 items` and `per call`; the audit accepts either the regex `≤ ?4 ?items? ?per ?call` or the co-occurrence of those two literal tokens on adjacent lines.
- **`402-1` fails with `missing-reference-from-G.<n>`**: The gate contract `G.<n>` doesn't contain the substring `AskUserQuestion invocation contract`. Check that gate's `**Gate invocation**` paragraph — it should reference the section by name.
- **`402-2` fails**: The negative fixture is broken (someone accidentally added the contract section to it) or the audit's parser silently degraded to no-op. Check the fixture is still missing the section; if it is, `402-1`'s parser has a bug.

## True verifier — cockpit v1.5 auto-mode smoke test

The corrected prose + audit backstop remove the class of failure by construction, but empirical confirmation across a variety of P-scale fanout events is the true verifier (SC pattern parallel to #398's 0 CLI-contract-drift diagnosis-round-burns and #400's 0 mid-batch-splits).

### Corpus requirements

At least one epic that fanouts ≥5 issues into the same `waiting-for:*` transition class simultaneously. The exact shape:

- ≥5 issues transition to `waiting-for:clarification` on the same phase-queue event, OR
- ≥5 issues transition to `waiting-for:*-review` on the same phase-queue event, OR
- ≥5 issues fuse into any escalation gate.

The finding #57 P3 event burst is the canonical target: `generacy queue P3` on an epic where P3 has ≥5 issues, each entering `waiting-for:clarification` when the runner catches up.

### Verifier one-liner

```bash
# In a cluster session, on a target epic:
generacy cockpit auto <owner>/<repo>#<epic> 2>&1 | tee auto-smoke-402.log

# After the run, check the transcript for the failure mode this fix closes:
grep -c 'InputValidationError: Too big: expected array to have <=4 items (questions)' auto-smoke-402.log

# Expected: 0. Any match means the fix regressed — the session fired a >4-item AskUserQuestion call.
```

### Expected behavior

Under a ≥5-way P3 fanout:

- The auto session's response to the fanout event contains one `[Presentation block for <issue-ref>]` per fused gate.
- The response fires **N `AskUserQuestion` calls**, one per gate (never a single fused call with `questions.length ≥ 5`).
- The harness accepts each call (no `InputValidationError`).
- No retry round-trip (no duplicated presentation block in the transcript).
- No gate-decision lag (the last gate isn't 15 minutes behind the first — they all fire in one response).

## Refresh script (unchanged from #398)

No `--help` snapshot refresh is required for this fix; the audit is a structural check on `auto.md` prose, not against a CLI contract. If future work extends the audit to cover a CLI contract, use the existing `packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh` script (introduced by #398).

## Troubleshooting

**"The test file doesn't find `parseSections`"**: The section-parsing helper (see `data-model.md § Section-parsing helper`) lives in the test file itself (following the `398-1`/`400-1` pattern where audit helpers are inline in the test module, not exported from `lib/`). If the helper is missing, the fix wasn't implemented per plan.

**"The audit passes locally but fails in CI"**: Check for line-ending differences (`\r\n` vs `\n`) or BOM markers in `auto.md`. The audit's parser normalizes line endings before splitting; if a copy-paste introduced a BOM, the H2-heading match on the first line can fail silently.

**"Q1=B says the fix is auto.md-only, but the audit reports drift in clarify.md"**: Not possible — the audit only reads `auto.md` for `402-1` and `402-drift-auto.md` for `402-2`. If some future extension adds `clarify.md` to the audit's inputs, that's a follow-up finding, not this fix's shape.

**"I want to add the ≤4 bound as an invariant §8"**: Explicitly rejected in Q3=C's rationale and the plan's Complexity Tracking. The bound is stated once in the contract section and cross-referenced from each gate contract; adding it to `## Invariants` would duplicate the rule at a third surface. If a future finding shows the invariants surface is needed, that's a follow-up.
