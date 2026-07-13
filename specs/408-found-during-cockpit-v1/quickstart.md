# Quickstart: #408 verification runbook

Verification playbook for the `auto.md` § step 5 cursor-error class split + G.4(e) circuit breaker + `cursor-recovery` ledger accounting fix. Three verification tiers:

1. **Static checks** — grep-based anchor checks; run at any commit-time gate.
2. **Vitest suite** — `408-1` structural drift audit + `408-2` negative-fixture regression.
3. **Operator smoke test** — a T-S13-style run with an induced `invalid-cursor` streak.

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
# The § step 5 body distinguishes the two branches
grep -c 'Branch A' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (Branch A anchor)
grep -c 'Branch B' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (Branch B anchor)

# The G.4(e) options appear verbatim (in § step 5's reference and/or § Gate contract G.4(e)'s presentation block)
grep -c 'Continue degraded (sweep-per-batch)' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1
grep -c 'Stop (exit auto)' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 — note this string is already in G.4a/b/d, so total will be ≥ 2 post-fix

# The cursor-recovery ledger shape appears as a code span
grep -c 'cursor-recovery ·' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1

# The § Gate contract table has a G.4(e) row
grep -c 'G.4 (e)' packages/claude-plugin-cockpit/commands/auto.md  # = 1 (table row)
grep -c 'G.4(e)' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (subsection heading and/or cross-references)

# § step 5 references G.4(e) (cross-reference from Branch B to the presentation block)
grep 'G.4(e)' packages/claude-plugin-cockpit/commands/auto.md | grep -c 'Gate contract\|escalation'  # ≥ 1

# The per-class classes are all named in § step 5's body
grep -c 'invalid-cursor' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 3 (Branch B name + cross-refs)
grep -c 'resetFrom' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 2 (Branch A + ledger row)
grep -c 'expiry' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (Branch A)
grep -c 'discarded' packages/claude-plugin-cockpit/commands/auto.md  # ≥ 1 (Branch A)
```

### Negative anchors (all MUST NOT match)

```bash
# The pre-fix "converge on the same recovery path" collapsed-all-three wording is gone
grep 'converge on the same recovery' packages/claude-plugin-cockpit/commands/auto.md
# Expected: no match, OR a match only inside quoted historical explanation blocks (e.g., a comment or example noting "the pre-#408 wording said 'converge on the same recovery' — do NOT reintroduce")
```

### Fixture presence

```bash
test -f packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md  # exists

# Fixture MUST NOT contain the post-fix option strings or ledger shape
grep -c 'Continue degraded' packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md  # = 0
grep -c 'Stop (exit auto)' packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md  # = 0
grep -c 'cursor-recovery ·' packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md  # = 0
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
git diff develop -- packages/claude-plugin-cockpit/lib/  # empty (or empty for the four library files this fix's scope excludes)
```

### Historical specs untouched

```bash
for d in specs/384-* specs/388-* specs/390-* specs/394-* specs/396-* specs/398-* specs/400-* specs/402-* specs/403-* specs/406-*; do
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
✓ 408 — auto.md § step 5 cursor-error class split + circuit breaker
  ✓ 408-1 (structural drift audit): § step 5 has the class split, both G.4(e) options, and the new ledger-line shape
  ✓ 408-2 (regression check): audit reports missing-class-split (or equivalent) on 408-drift-auto.md fixture
```

Both 408 assertions MUST pass. If 408-1 fails, the failure message names the missing structural check(s):

```
Cursor-recovery drift detected in auto.md § step 5:
  step5Present: true
  branchAResetFrom: true
  branchBInvalidCursor: true
  optionContinueDegraded: false      ← failing check
  optionStopExit: true
  ledgerShapePresent: true
```

If 408-2 fails, the audit has become vacuous — the fixture doesn't trip any structural failure. Investigate the `auditStep5` implementation for a scope bug.

### Isolated invocation

```bash
cd /workspaces/agency
pnpm --filter @generacy-ai/claude-plugin-cockpit test -- --grep "408 — auto.md § step 5"
```

## Tier 3 — Operator smoke test (true verifier)

The static and Vitest tiers are necessary but not sufficient (the #384–#406 experience proved static-only fails at behavioral drift). The true verifier is a re-run of the cockpit v1.5 auto-mode integration smoke test with an induced consecutive `invalid-cursor` streak.

### Prerequisites

- Post-#924 (server-side bus-lifetime fix) — the hardened error taxonomy this fix's class split relies on is available.
- A cluster session with the seven `cockpit_*` MCP tools registered (per cluster-base#75).
- An epic ref with open work (any of the existing test epics used for T-S12/T-S13 runs).
- A way to induce the tool server to return `invalid-cursor` on two consecutive `cockpit_await_events` calls (for testing purposes; e.g., a dev harness that intercepts the tool response and forges the typed error twice in a row).

### Smoke-test one-liner (illustrative)

```bash
# 1. Start an auto run on the test epic.
generacy cockpit auto christrudelpw/test-epic#42 &
AUTO_PID=$!

# 2. Wait for the loop to enter the main event-await phase (post-startup-sweep).
sleep 30

# 3. Induce two consecutive invalid-cursor responses on the next two cockpit_await_events calls
#    (mechanism: dev harness override; specifics per test infra).
export COCKPIT_TEST_FORCE_INVALID_CURSOR_COUNT=2

# 4. Watch the ledger file for the streak + escalation-gate line.
LEDGER_FILE=$(ls -t .generacy/cockpit/auto-runs/*.ledger | head -1)
tail -f "$LEDGER_FILE" &
TAIL_PID=$!

# 5. Expect (in this order):
#    - <epic-ref> · cursor-recovery · invalid-cursor · 1     (first fault; recover; do not escalate)
#    - <epic-ref> · cursor-recovery · invalid-cursor · 2     (second fault; recover AND fire gate)
#    - The auto session presents the G.4(e) escalation gate presentation block in the operator's transcript.
#    - The AskUserQuestion prompts with options `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)`.

# 6. Select `Continue degraded` at the gate.
#    Expect the ledger to append:
#    - <epic-ref> · invalid-cursor-streak · escalation-gate · continue-degraded

# 7. Verify decide-once: the tool server should keep returning invalid-cursor (via the dev harness), and the counter continues to climb, but the gate does NOT re-fire:
#    - <epic-ref> · cursor-recovery · invalid-cursor · 3   (ledger accounting continues)
#    - <epic-ref> · cursor-recovery · invalid-cursor · 4   (still no re-fire; within same unhealed streak)

# 8. Clear the dev-harness override so a successful cursor reuse can occur.
unset COCKPIT_TEST_FORCE_INVALID_CURSOR_COUNT

# 9. Verify counter reset: the next `cockpit_await_events` call succeeds → counter resets to 0.
#    Follow-up faults must reach count=2 again before the gate re-fires.

# Cleanup
kill $AUTO_PID $TAIL_PID
```

### Success criteria (SC-003 measurement)

- **0 silent sweep-per-batch runs** on the T-S13 corpus — every `invalid-cursor` streak of length ≥ 2 fires G.4(e) at count=2 (first firing per unhealed streak).
- **Ledger-driven degraded-run detection** — `grep -c '· cursor-recovery · invalid-cursor ·' <ledger-file>` gives the number of `invalid-cursor` recoveries; if > 1 the run was degraded for at least part of its lifespan, and the run summary § L.6 flags it.
- **G.4(e) response < 60s p95** (informal — depends on operator responsiveness, not on the playbook). While the gate blocks awaiting the operator, no recovery loop spins; the cost of the block is bounded by operator return time.

## Troubleshooting

### 408-1 fails with `optionContinueDegraded: false`

The exact substring `Continue degraded (sweep-per-batch)` is missing from § step 5's body AND from § Gate contract G.4(e)'s presentation block. Common causes:
- Typo — check `(sweep-per-batch)` for parenthesis / hyphen consistency.
- Rewording — the audit checks the exact substring; if you renamed the option, update both the playbook and the audit's expected substring together.

### 408-1 fails with `ledgerShapePresent: false`

No code span matching `cursor-recovery · <class> · <count>` (or a concrete equivalent) appears in § step 5's body or § Ledger's action+outcome vocabulary. Common causes:
- The code span uses a different middle-dot character (U+2027 hyphenation point, U+00B7 middle dot) — must be U+00B7 (three-byte UTF-8 C2 B7).
- The ledger example was moved out of § step 5's body without adding one to § Ledger's vocabulary table.

### 408-2 fails (the fixture no longer trips)

The audit has become vacuous — the fixture no longer produces any structural failure. Investigate:
- Did someone add the option strings or ledger shape to `408-drift-auto.md`? (They shouldn't — the fixture is the pre-fix state.)
- Did `auditStep5` change its return shape / scope to always return `all-true`? Re-read the audit-parser implementation notes in `contracts/drift-audit-assertion.md`.

### Operator smoke test: G.4(e) re-fires within one unhealed streak

The playbook is not respecting decide-once semantics. Check § step 5's Branch B text — it must explicitly state that once `Continue degraded` is chosen, subsequent `invalid-cursor` within the same streak do NOT re-fire the gate (only recover + ledger). If the text is present, the runtime state (`streakOperatorAcknowledged` flag) is being tracked incorrectly — but since the flag lives in playbook prose (the model maintains it between calls), verify the prose describes the flag's lifetime clearly.

### Operator smoke test: G.4(e) does NOT re-fire after a healed period + new streak

The playbook is over-applying decide-once (Q4=B behavior, not Q4=A). Check § step 5's Branch B — it must explicitly state that any successful cursor reuse resets the counter AND the `streakOperatorAcknowledged` flag, so a fresh 2-in-a-row streak re-fires the gate at count=2 (Q4=A).

## Post-verification

Once all three tiers pass, commit the changes and open a PR referencing:

- Spec: `specs/408-found-during-cockpit-v1/spec.md`
- Plan: `specs/408-found-during-cockpit-v1/plan.md`
- Companion server-side fix (sequenced first): generacy-ai/generacy#924

The PR should include the following files:

- `packages/claude-plugin-cockpit/commands/auto.md` (modified — § step 5 body + § Gate contract G.4(e) + § Ledger vocabulary row)
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (extended — new `describe("408 — …")` block)
- `packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md` (new)
- `specs/408-found-during-cockpit-v1/*` (spec, clarifications, plan, research, data-model, quickstart, contracts/*)
