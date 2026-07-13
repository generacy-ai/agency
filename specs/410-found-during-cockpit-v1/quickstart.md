# Quickstart: #410 verification runbook

Verification playbook for the `auto.md` D.7 repeat-failure dispatch fresh-evidence rule + verdict-schema `failure_class_changed` / `failure_classes_seen` addendum + G.4(b) sixth-element row fix. Three verification tiers:

1. **Static checks** — grep-based anchor checks; run at any commit-time gate.
2. **Vitest suite** — `410-1` structural drift audit + `410-2` negative-fixture regression.
3. **Operator smoke test** — a T-S13-style run with an induced 2-failure-class D.7 repeat on the same issue.

## Installation

The fix requires only the `packages/claude-plugin-cockpit` package (playbook prose + one test file + one fixture — no new dependencies). Standard dev setup:

```bash
cd /workspaces/agency
pnpm install
pnpm --filter @generacy-ai/claude-plugin-cockpit build
```

## Tier 1 — Static checks (post-edit sanity)

### Positive anchors (all MUST match)

```bash
# The D.7 step 1 body distinguishes first-vs-repeat sub-paths
grep -c 'first dispatch\|first-dispatch\|First dispatch' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (first-dispatch sub-path anchor)
grep -c 'repeat dispatch\|repeat-dispatch\|Repeat dispatch' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (repeat-dispatch sub-path anchor)

# The verdict-schema addendum names both new fields
grep -c 'failure_class_changed' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 2 (D.7 step 2 + G.4(b) row)
grep -c 'failure_classes_seen' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (D.7 step 2 verdict schema)

# The G.4(b) presentation block contains the sixth-element row
grep -c 'Failure class changed since prior' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1

# The no-parent-characterization rule appears in D.7 step 2 (tolerant of prose variation)
grep -E 'MUST NOT characterize|no parent-authored|not the parent'"'"'s role to characterize|parent MUST NOT summarize' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 match

# cockpit_context is named on both sub-paths (D.7 step 1)
grep -c 'cockpit_context' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 3 (first-dispatch + repeat-dispatch + G.4(b) Current state row + potentially D.11)
```

### Negative anchors (all MUST NOT match)

```bash
# The pre-fix single-unified-dispatch wording is gone (no first-vs-repeat branching keyword absent)
# (Structural check: if BOTH the first-dispatch and repeat-dispatch anchors are missing, the pre-fix drift persists)
if ! grep -q 'first dispatch\|first-dispatch\|First dispatch' packages/claude-plugin-cockpit/commands/auto.md \
   && ! grep -q 'repeat dispatch\|repeat-dispatch\|Repeat dispatch' packages/claude-plugin-cockpit/commands/auto.md; then
  echo "ERROR: D.7 has no first-vs-repeat branching keyword"
  exit 1
fi

# No parent-authored characterization phrasing survives from the incident transcript
# (These are the exact patterns the fix forbids)
grep 'requeue failed identically' packages/claude-plugin-cockpit/commands/auto.md
# Expected: no match, OR match only inside quoted historical explanation blocks (e.g., a note documenting the anti-pattern)

grep 'same as before' packages/claude-plugin-cockpit/commands/auto.md
# Expected: no match, OR match only in quoted explanation
```

### Fixture presence

```bash
test -f packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md  # exists

# Fixture MUST NOT contain the post-fix field names or G.4(b) row
grep -c 'failure_class_changed' packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md  # = 0
grep -c 'failure_classes_seen' packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md  # = 0
grep -c 'Failure class changed since prior' packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md  # = 0

# Fixture MUST NOT contain first-vs-repeat branching keyword
grep -c 'first dispatch\|repeat dispatch\|first-dispatch\|repeat-dispatch' packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md  # = 0
```

### Sibling playbooks untouched

```bash
git diff develop -- packages/claude-plugin-cockpit/commands/clarify.md   # empty
git diff develop -- packages/claude-plugin-cockpit/commands/merge.md     # empty
git diff develop -- packages/claude-plugin-cockpit/commands/queue.md     # empty
git diff develop -- packages/claude-plugin-cockpit/commands/review.md    # empty
git diff develop -- packages/claude-plugin-cockpit/commands/status.md    # empty
git diff develop -- packages/claude-plugin-cockpit/commands/watch.md     # empty
```

### Library files untouched

```bash
git diff develop -- packages/claude-plugin-cockpit/lib/  # empty (or empty for the three library files this fix's scope excludes)
```

### Historical specs untouched

```bash
for d in specs/384-* specs/388-* specs/390-* specs/394-* specs/396-* specs/398-* specs/400-* specs/402-* specs/403-* specs/406-* specs/408-*; do
  git diff develop -- "$d"  # empty
done
```

## Tier 2 — Vitest suite (build-time regression enforcement)

### Running the suite

```bash
cd /workspaces/agency
pnpm --filter @generacy-ai/claude-plugin-cockpit test
```

Expected output:

```
✓ 394 — auto.md unfiltered stream consumption + liveness cross-check (…)
✓ 396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit (…)
✓ 398 — playbook invocations match generacy cockpit <verb> --help (…)
✓ 400 — clarification batch parser + directive grammar (…)
✓ 402 — playbook AskUserQuestion invocation contract audit (…)
✓ 403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract (…)
✓ 406 — cockpit MCP tool migration + await-events loop (…)
✓ 408 — auto.md § step 5 cursor-error class split + circuit breaker (…)
✓ 410 — auto.md D.7 repeat-failure dispatch fetches fresh evidence + failure_class_changed verdict field
  ✓ 410-1 (structural drift audit): D.7 has first-vs-repeat sub-path split, verdict-schema addendum, no-parent-characterization rule, and G.4(b) sixth-element row
  ✓ 410-2 (regression check): audit reports at least one structural failure on 410-drift-auto.md fixture
```

Both 410 assertions MUST pass. If 410-1 fails, the failure message names the missing structural check(s):

```
D.7 drift detected in auto.md § D.7:
  d7Present: true
  firstDispatchSubPath: true
  repeatDispatchSubPath: true
  failureClassChangedField: true
  failureClassesSeenField: false      ← failing check
  noParentCharacterizationRule: true
  g4bSixthElementRow: true
```

If 410-2 fails, the audit has become vacuous — the fixture doesn't trip any structural failure. Investigate the `auditD7` implementation for a scope bug.

### Isolated invocation

```bash
cd /workspaces/agency
pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --grep "410 — auto.md D.7"
```

## Tier 3 — Operator smoke test (true verifier)

The static and Vitest tiers are necessary but not sufficient (the #384–#408 experience proved static-only fails at behavioral drift). The true verifier is a re-run of the cockpit v1.5 auto-mode integration smoke test with an induced 2-failure-class D.7 repeat on the same issue.

### Prerequisites

- Post-#915 (engine-side reason-bearing alert bodies) — the fields the subagent's `failure_class_changed` computation reads (`classifier_reason`, `error_taxonomy`, failing test/step) must be present in `cockpit_context` return payloads.
- A cluster session with the seven `cockpit_*` MCP tools registered (per cluster-base#75).
- An epic ref with an issue that can be steered through two distinct failure classes in succession via Requeue (e.g., a synthetic issue with a first-fault that a Requeue heals, exposing a second-fault of a different class).

### Smoke-test one-liner (illustrative)

```bash
# 1. Start an auto run on the test epic.
generacy cockpit auto christrudelpw/test-epic#47 &
AUTO_PID=$!

# 2. Watch the ledger file for D.7 dispatches.
LEDGER_FILE=$(ls -t .generacy/cockpit/auto-runs/*.ledger | head -1)
tail -f "$LEDGER_FILE" &
TAIL_PID=$!

# 3. Expect (in this order):
#    - First D.7 dispatch on issue #47 (some failure class, e.g., npm-ci-EUSAGE)
#      → parent calls cockpit_context, spawns subagent, subagent returns first-dispatch verdict
#      → G.4(b) presents 5-element block (no "Failure class changed since prior" row)
#      → operator selects Requeue
#      → ledger line: <issue-ref> · failed:validate · escalation-gate · requeue (cockpit resume)

# 4. Requeue heals the first fault; a second, different-class failure emerges (e.g., prisma-client-missing).

# 5. Expect (in this order):
#    - Second D.7 dispatch on issue #47 (different failure class)
#      → parent calls cockpit_context AGAIN (fresh evidence fetch)
#      → parent does NOT characterize similarity (no "failed identically" in the transcript)
#      → parent spawns subagent (SendMessage to existing, or fresh spawn with both alert bodies verbatim)
#      → subagent returns verdict with failure_class_changed=true, failure_classes_seen=[<class1>, <class2>]
#      → G.4(b) presents 6-element block WITH "Failure class changed since prior: yes  (classes this session: <class1> → <class2>)" row
#      → operator's recommendation calculus reflects changed class (usually = prior Requeue made progress)

# 6. Verify the transcript never contains parent-authored characterization:
grep -i 'requeue failed identically\|same as before\|the fresh alert is the same' <auto-transcript>
# Expected: no matches (only in quoted historical explanation, if any)

# Cleanup
kill $AUTO_PID $TAIL_PID
```

### Success criteria (SC-001 measurement)

- **0 repeat D.7 dispatches without a fresh `cockpit_context` evidence fetch** — every repeat dispatch has a fresh evidence-fetch call in the transcript before the subagent invocation.
- **100% of repeat D.7 verdicts carry `failure_class_changed` field** — the field is present with a boolean value; the running list is present with at least 2 entries on second dispatch.
- **0 parent-authored characterizations of similarity** — the transcript contains no "failed identically", "same as before", or equivalent parent-authored summaries of failure similarity between fresh and prior alerts.
- **G.4(b) sixth-element row rendered on all repeat dispatches** — the operator-facing gate presentation shows the "Failure class changed since prior" row and the running list on every repeat dispatch's G.4(b) fire.

## Troubleshooting

### 410-1 fails with `firstDispatchSubPath: false` or `repeatDispatchSubPath: false`

The exact anchor "first dispatch" or "repeat dispatch" (or equivalent branching keyword) is missing from D.7's step 1 body. Common causes:
- The rewrite left the pre-fix single-unified-dispatch wording in place; step 1 needs an explicit sub-path structure.
- The rewrite used alternative branching phrasing not covered by the tolerant grep pattern; update the audit's expected pattern to match, or use the canonical `**First dispatch**` / `**Repeat dispatch**` bold headings.

### 410-1 fails with `failureClassChangedField: false` or `failureClassesSeenField: false`

The exact substring `failure_class_changed` or `failure_classes_seen` is missing from D.7's step 2 body. Common causes:
- The verdict-schema addendum was added but named the fields differently (e.g., `classChanged`, `seenClasses`); the exact snake_case JSON field names are load-bearing (they're the actual JSON contract with the subagent).
- The addendum was placed in G.4(b) alone without step 2 documentation; the schema declaration belongs in D.7 step 2 (the subagent's return contract), G.4(b) merely renders the value.

### 410-1 fails with `noParentCharacterizationRule: false`

The rule anchor is missing from D.7 step 2 (or step 1). Common causes:
- The rewrite implicitly assumes parent-transport shape without stating the prohibition; the rule needs an explicit statement matching the tolerant pattern (`MUST NOT characterize`, `no parent-authored`, `not the parent's role`, `parent MUST NOT summarize`, or equivalent).
- The rule was placed elsewhere (e.g., § AskUserQuestion invocation contract's parent-boundary section); the rule needs to live at D.7 step 2 to constrain the subagent-invocation prompt shape.

### 410-1 fails with `g4bSixthElementRow: false`

The exact substring `Failure class changed since prior` is missing from § Gate contract G.4(b) presentation block. Common causes:
- The row label was worded differently (e.g., "Failure class shift", "Class changed"); the exact label is load-bearing for the audit to recognize the row.
- The row was added to D.7 step 3's presentation excerpt but not to the § Gate contract G.4(b) canonical block; both surfaces need the row (D.7 references G.4(b); G.4(b) authors the shape).

### 410-2 fails (the fixture no longer trips)

The audit has become vacuous — the fixture no longer produces any structural failure. Investigate:
- Did someone add the field names, row label, or first-vs-repeat branching keyword to `410-drift-auto.md`? (They shouldn't — the fixture is the pre-fix state.)
- Did `auditD7` change its return shape / scope to always return `all-true`? Re-read the audit-parser implementation notes in `contracts/drift-audit-assertion.md`.

### Operator smoke test: G.4(b) six-element row missing on repeat dispatch

The subagent returned a verdict without the `failure_class_changed` / `failure_classes_seen` fields, or the parent didn't render them at G.4(b). Check:
- The subagent invocation prompt on the repeat dispatch — is the verdict-return-schema addendum included in the prompt? Without the schema instruction, the subagent may return the first-dispatch shape.
- The parent's G.4(b) presentation composition — is it conditional on repeat dispatch (`if verdict.failure_class_changed !== undefined`)? Without the conditional, the row may be omitted even when the fields are present.

### Operator smoke test: parent characterizes similarity anyway

The rule is stated but not observed. Check:
- The parent's continuation prompt (SendMessage form or fresh-spawn form) — is the fresh alert body verbatim, or is it wrapped in a parent-authored summary?
- The rule anchor in D.7 step 2 — is it strongly worded (e.g., MUST NOT) or weakly worded (e.g., "consider avoiding")? Weak wording is less likely to be respected by the model.

## Post-verification

Once all three tiers pass, commit the changes and open a PR referencing:

- Spec: `specs/410-found-during-cockpit-v1/spec.md`
- Plan: `specs/410-found-during-cockpit-v1/plan.md`
- Incident evidence: tetrad-development#92 finding #62 (snappoll-1 run 11)

The PR should include the following files:

- `packages/claude-plugin-cockpit/commands/auto.md` (modified — D.7 step 1 body + step 2 verdict-schema addendum + G.4(b) presentation-block sixth-element row)
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (extended — new `describe("410 — …")` block)
- `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md` (new)
- `specs/410-found-during-cockpit-v1/*` (spec, clarifications, plan, research, data-model, quickstart, contracts/*)
