# Quickstart: verifying #396

Runbook for the reviewer / operator to confirm the fix behaves as intended. Layered static + behavioral checks; the true verifier is a re-run of the cockpit v1.5 auto-mode integration smoke test.

## Prerequisites

- Repo at branch `396-found-during-cockpit-v1`.
- `pnpm install` at repo root (installs `vitest` for the plugin's test suite).
- `git` on `PATH`, `grep` available.

## Static checks

Run from repo root. Each command is expected to succeed (or return the noted output) — a failure here indicates the corresponding structural contract invariant has drifted.

### § Dispatch table structure (contract C.1 – C.3, C.9, C.12)

```bash
# C.1: § Dispatch table ends with D.10 (catch-all last).
grep -n '^| D\.10 |' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one line, further from the top than any other D.<n> row.

# C.2: D.9a, D.9b, D.9c present, between D.9 and D.11.
grep -n '^| D\.9[abc] |' packages/claude-plugin-cockpit/commands/auto.md
# Expected: three lines (D.9a, D.9b, D.9c) in ascending order.

# C.3: D.11 present, between D.9c and D.10.
grep -n '^| D\.11 |' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one line, positioned between D.9c and D.10 in file order.
```

Visual check: `grep -n '^| D\.' packages/claude-plugin-cockpit/commands/auto.md | head -20` should show:

```
D.1 → D.2 → D.3 → D.4 → D.5 → D.6 → D.7 → D.8 → D.9 → D.9a → D.9b → D.9c → D.11 → D.10
```

(D.10 is the last row.)

### § Dispatch prose subheadings (contract C.6)

```bash
# D.11 subheading present.
grep -n '^### D\.11 — `waiting-for:merge-conflicts`' packages/claude-plugin-cockpit/commands/auto.md
# Expected: one match.

# D.9a/b/c subheadings present.
grep -n '^### D\.9[abc] — `waiting-for:' packages/claude-plugin-cockpit/commands/auto.md
# Expected: three matches (pr-feedback, children-complete, dependencies).
```

### D.10 tightened trigger (contract C.4, C.5, D10-C.1 – D10-C.5)

```bash
# D10-C.1: primary anchor phrase.
grep -F 'Any `waiting-for:*` label without a matching dispatch row IS an unrecognized state.' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match.

# D10-C.2: "known but not actionable" anti-pattern named.
grep -F '"Known but not actionable" is not a permissible classification outcome' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match.

# D10-C.3: "wait for someone else" anti-pattern named.
grep -F '"Wait for someone else to handle it" is never a permissible dispatch outcome' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match.

# D10-C.4: trigger case list includes case (d).
grep -F '(d) the `waiting-for:*` label' packages/claude-plugin-cockpit/commands/auto.md
# Expected: at least one match.

# D10-C.5: exhaustive enumeration D.1–D.9c or D.11.
grep -F 'D.1–D.9 (including D.9a/b/c) or D.11' packages/claude-plugin-cockpit/commands/auto.md
# Expected: at least one match (appears in D.10 trigger prose).
```

### D.11 dispatch prose (contract C.7, C.8, D11-C.1 – D11-C.4)

```bash
# D11-C.3 / C.7: re-present-on-non-zero prose.
grep -F 'On non-zero exit: re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match (D.11 dispatch step 3).

# D.11 ledger row lists the four outcomes.
grep -F '| D.11 merge-conflicts | `escalation-gate` | `advanced`, `advance failed:' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match (Action + outcome vocabulary table).
```

### § Gate contract G.4 (d) (contract C.9, C.10, C.11)

```bash
# C.9: G.4 (d) row in contract table between (b) and (c).
grep -n '^| G\.4 (' packages/claude-plugin-cockpit/commands/auto.md
# Expected: four lines in order — G.4 (a), G.4 (b), G.4 (d), G.4 (c).

# C.10: G.4 (d) presentation-block heading between (b) and (c).
grep -n '^\*\*(a) \|^\*\*(b) \|^\*\*(c) \|^\*\*(d) ' packages/claude-plugin-cockpit/commands/auto.md
# Expected: four lines in order — (a), (b), (d), (c).

# C.11: G.4 (d) re-presentation shape has "Advance failed for" prefix.
grep -F 'Advance failed for <issue-ref>:' packages/claude-plugin-cockpit/commands/auto.md
# Expected: exactly one match (inside G.4 (d) re-presentation shape).

# G.4 § Options-per-subtype table row for (d).
grep -F "| (d) merge-conflicts" packages/claude-plugin-cockpit/commands/auto.md
# Expected: one match.

# G.4 § Post-gate mechanism sentence for `I've resolved it`.
grep -F "\`I've resolved it — advance the gate\` (subtype d only) → \`generacy cockpit advance --gate merge-conflicts <issue-ref>\`" packages/claude-plugin-cockpit/commands/auto.md
# Expected: one match.
```

### `lib/gate-vocabulary.ts` (contract GV-C.1 – GV-C.6)

```bash
# GV-C.1: file exists.
test -f packages/claude-plugin-cockpit/lib/gate-vocabulary.ts && echo OK

# GV-C.2: exports GATE_VOCABULARY with `as const`.
grep -F 'export const GATE_VOCABULARY' packages/claude-plugin-cockpit/lib/gate-vocabulary.ts
# Expected: one match with `as const` on the trailing bracket.

# GV-C.3: 12 tokens, first is clarification, last is merge-conflicts.
grep -c '"waiting-for:' packages/claude-plugin-cockpit/lib/gate-vocabulary.ts
# Expected: 12.

# GV-C.4: type export.
grep -F 'export type GateVocabularyToken' packages/claude-plugin-cockpit/lib/gate-vocabulary.ts
# Expected: one match.

# GV-C.5: upstream-source paths in header comment.
grep -F '/workspaces/tetrad-development/.github/labels.yml' packages/claude-plugin-cockpit/lib/gate-vocabulary.ts
grep -F '/workspaces/tetrad-development/docs/label-protocol.md' packages/claude-plugin-cockpit/lib/gate-vocabulary.ts
# Expected: one match each.

# GV-C.6: sync-obligation prose.
grep -F 'runtime safety' packages/claude-plugin-cockpit/lib/gate-vocabulary.ts
# Expected: at least one match (part of the sync-obligation clause).
```

### Sibling playbook byte-identity

```bash
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/review.md \
  packages/claude-plugin-cockpit/commands/merge.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/watch.md \
  packages/claude-plugin-cockpit/commands/status.md
# Expected: empty output.
```

### Invariants section unchanged

```bash
# Grep the § Invariants heading and count numbered items in it.
sed -n '/^## Invariants$/,/^## /p' packages/claude-plugin-cockpit/commands/auto.md | grep -c '^[0-9]\+\.'
# Expected: 7 (unchanged from #394; no new §8 added by this fix).
```

### Historical spec directories unchanged

```bash
git diff origin/develop -- \
  specs/372-epic-generacy-ai-tetrad/ \
  specs/384-found-during-cockpit-v1/ \
  specs/388-found-during-cockpit-v1/ \
  specs/390-found-during-cockpit-v1/ \
  specs/394-found-during-cockpit-v1/
# Expected: empty output.
```

## Vitest suite (behavioral checks)

```bash
pnpm --filter claude-plugin-cockpit test
```

Expected output includes:

- `✓ 394 — auto.md unfiltered stream consumption + liveness cross-check` (2 assertions, unchanged from #394).
- `✓ 396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit` (3 assertions, new):
  - `✓ 396-1 (SC parallel to #394 SC-002): D.11 escalation gate fires on waiting-for:merge-conflicts`
  - `✓ 396-2 (SC parallel to #394 SC-005): D.10 escalation gate fires on novel waiting-for:someday-gate`
  - `✓ 396-3 (FR-011): drift audit — every GATE_VOCABULARY token has a Trigger match in auto.md`

If any 396-* assertion fails, see the specific contract file in [contracts/](./contracts/) for the failure mode and remediation.

If a 394-* assertion regresses, the branch has accidentally broken the #394 suite; investigate before proceeding.

## Live-run smoke test (true verifier)

Re-run the cockpit v1.5 auto-mode integration smoke test that surfaced the finding:

1. Start a fresh epic run: `/cockpit:auto <owner>/<repo>#<epic-n>` on a test epic with at least one P2 issue expected to hit `waiting-for:merge-conflicts`.
2. Deliberately introduce a base-sync conflict on one of the P2 branches (`git rebase origin/main` in the branch's checkout after a conflicting merge to `main`).
3. Wait for the engine to set `waiting-for:merge-conflicts` on the P2 issue.
4. Observe the auto session's behavior:
   - **Expected**: the D.11 escalation gate fires within one iteration of the re-check step. Presentation block shows the conflicted paths.
   - **Not expected (T-S5 regression)**: the auto session logs *"worker-owned transient state, not one of the D.1–D.9 actionable dispatch classes, so no dispatch and no ledger line … Continuing to wait"* and stalls.
5. Select `I've resolved it — advance the gate`. Because the branch still has conflicts (not actually resolved), the CLI returns non-zero.
   - **Expected**: the D.11 gate re-presents with the CLI stderr inline in the presentation block. The operator sees the specific error mid-decision.
6. Resolve the conflicts locally (`git rebase --continue`, push), re-select `I've resolved it`.
   - **Expected**: CLI returns zero; ledger line `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · advanced`; loop continues.

## Companion operator-side edit (traceability)

Confirm the operator has registered `waiting-for:merge-conflicts` and `completed:merge-conflicts` in `tetrad-development`:

```bash
grep -F 'waiting-for:merge-conflicts' /workspaces/tetrad-development/.github/labels.yml
grep -F 'completed:merge-conflicts' /workspaces/tetrad-development/.github/labels.yml
grep -F 'waiting-for:merge-conflicts' /workspaces/tetrad-development/docs/label-protocol.md
grep -F 'completed:merge-conflicts' /workspaces/tetrad-development/docs/label-protocol.md
# Expected: one match each. Missing matches indicate the companion edit hasn't been made yet.
```

Missing companion edits do NOT block this PR from merging (per Q1=C decoupling), but they leave an observable "the engine emits this label but it's not documented" gap that should be closed same-day.

## Troubleshooting

**"grep found more than one match for anchor phrase X"**: someone duplicated the anchor. Deduplicate — the audit-invariant relies on exactly one occurrence in one clear location.

**"grep found zero matches for anchor phrase X"**: the anchor was accidentally reworded during a subsequent edit. Restore the verbatim wording per the contract file.

**"396-3 fails with 'token X not found as a Trigger'"**: someone added a token to `GATE_VOCABULARY` without adding the corresponding dispatch row. Either add the row or remove the token.

**"396-3 fails with 'row token X not in vocabulary'"**: someone added a Trigger row token to `auto.md` without adding it to `GATE_VOCABULARY`. Sync the vocabulary.

**"D.11 gate fires but ledger has two lines instead of one"**: the re-present-on-non-zero shape wrote an intermediate ledger line, violating D11-C.4. The re-presented gate's terminal verdict is the sole ledgerable event.

**"Auto session stalls on a `waiting-for:*` label anyway"**: the D.10 tightened trigger prose has drifted. Check D10-C.1/C.2/C.3 anchor phrases; if the phrasing is intact and the stall reproduces, escalate as a new finding.

## Available commands (context for reviewers)

No new commands are introduced by this fix. Existing commands consumed:
- `/cockpit:auto <epic-ref>` — the top-level slash command whose playbook is edited.
- `generacy cockpit watch <epic-ref>` — spawned by step 2 of the auto playbook.
- `generacy cockpit status --json <epic-ref>` — spawned by startup sweep + step 4a re-check.
- `generacy cockpit advance --gate merge-conflicts <issue-ref>` — spawned by D.11 dispatch step 3 on `I've resolved it` verdict. Existing verb pattern applied to a new gate name.
- `gh issue view <issue-ref> --comments` — spawned by D.11 dispatch step 1 to fetch the engine's pause-alert comment.

No new dev-dependencies; `vitest` was added in #394.
