# Quickstart: apply and verify the cockpit review/watch playbook rewrite

**Feature**: 382-found-during-cockpit-v1
**Audience**: Maintainer applying the fix before opening a PR against `develop`.
**Time**: ~35 minutes (three files rewritten + 8 greps + 1 diff check + 1 smoke test on an epic with an open PR + 3 usage/error-class checks).

This is not a runtime feature and has no install step. What follows is the apply-and-verify sequence.

## Prerequisites

- Local checkout of `generacy-ai/agency` on branch `382-found-during-cockpit-v1`.
- `grep`, `sed`, `diff` available (any POSIX shell).
- For the smoke test only: a Claude Code session with the `@generacy-ai/claude-plugin-cockpit` plugin installed (locally linked from this checkout, or installed from a preview publish), the `generacy` CLI on `$PATH`, and `gh` authenticated. Plus write access to a test repo with an active epic that has an open impl PR — the smoke test in [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) used `christrudelpw/sniplink`.

## Overview of the change

Three files, one PR:

- **`packages/claude-plugin-cockpit/commands/review.md`** — multi-section rewrite:
  1. Frontmatter — `--gate <name>` description enumerates the five verbatim CLI tokens.
  2. H1 body — mentions the `event: COMMENT` PR review path.
  3. Instructions §1 — new usage line + `clarification → /cockpit:clarify` special-case sub-line.
  4. Instructions §3 — the branch is renamed from `--gate impl` to `--gate implementation-review`; a per-finding classification instruction is added; a findings-summary table shape is defined; the Suggested-decision derivation rules are corrected so `non-blocking findings only → approve`.
  5. Instructions §5 (approval prompt) — the prompt MUST display the findings-summary table so the operator sees the per-finding classification before deciding.
  6. Instructions §6 (advance on approve) — new sub-branch: when non-blocking findings are present on `--gate implementation-review`, POST an `event: APPROVE` review with the findings in the body (no inline threads).
  7. Instructions §7 (new step, replacing the current step 7's silent no-op) — on `request-changes` at `--gate implementation-review`, POST an `event: COMMENT` review via `gh api .../pulls/{n}/reviews` with a one-line body and one inline anchored comment per finding.
  8. Instructions §8 (renumbered from §7) — `abort` remains a no-op.
  9. Examples — rewritten to use `--gate implementation-review` verbatim and to document the invalid-value case.
- **`packages/claude-plugin-cockpit/commands/watch.md`** — mapping-table rewrite only (five explicit review rows, in the order shown in `contracts/watch-command.contract.md §2`).
- **`packages/claude-plugin-cockpit/README.md`** — one cell of the § Available Commands table: `impl PR diff` → `implementation-review PR diff`.

The MISSING_BINARY / AUTH_FAILURE / OTHER block in both `review.md` and `watch.md` is **NOT** touched — see `contracts/review-command.contract.md §12`. The § Error Handling section of `README.md` is **NOT** touched.

## Apply the fix

The canonical string content for each section is in `contracts/review-command.contract.md` and `contracts/watch-command.contract.md`. Open those files and the current `packages/claude-plugin-cockpit/commands/{review,watch}.md` side by side, then perform the edits below.

### Edit set A — `commands/review.md`

Apply the nine edits in `contracts/review-command.contract.md §1–§13`. Suggested order (bottom-up minimizes line-number churn between edits):

1. **§13 Examples** — replace the two example paragraphs at the bottom of the current file with the three-paragraph block from the contract.
2. **§11 Step 9 / §12 error-conv block** — do NOTHING. Confirm the block is untouched by leaving the region alone.
3. **§10 Step 8** (`abort` no-op) — the current file's step 7 becomes the new step 8, renumbered. The narrative is unchanged aside from renumbering.
4. **§9 Step 7** (new `request-changes` post-review-body step) — insert the block from contract §9 between the current step 6 (approve) and the renumbered abort step. This is the largest single addition.
5. **§8 Step 6** (advance on approval) — replace the current step 6 with the block from contract §8. Note the new `event: APPROVE`-with-body sub-branch and the inline `<!-- ... -->` rationale note.
6. **§7 Step 5** (approval prompt) — add the sentence requiring the prompt to display the findings-summary table / three-section summary before options are shown.
7. **§6 Step 4** (non-implementation-review branch) — rename from "non-`impl` gate branch" to "non-`implementation-review` gate branch"; update the list of accepted gates to `spec-review`, `clarification-review`, `plan-review`, `tasks-review`.
8. **§5 Step 3** (implementation-review branch) — rename from `--gate impl branch` to `--gate implementation-review branch`; add the classification instruction; add the findings-summary table shape; rewrite the Suggested-decision derivation rules (fix the middle branch — non-blocking-only → approve).
9. **§4 Step 2** (pre-flight) — do NOTHING. Preserved byte-for-byte.
10. **§3 Step 1** (usage-line gate) — replace the current step 1 with the block from contract §3. The gate values change from `{ specify, clarify, plan, tasks, impl }` to the five verbatim CLI tokens, and the special-case `clarification → /cockpit:clarify` sub-line is added.
11. **§2 H1 body** — replace with the block from contract §2 (mentions `event: COMMENT`).
12. **§1 Frontmatter** — replace with the block from contract §1 (enumerates the five verbatim CLI tokens).

### Edit set B — `commands/watch.md`

Apply the single edit in `contracts/watch-command.contract.md §2`: replace the current four-row mapping table with the eight-row rewritten table. No other section of `watch.md` is edited.

Row ordering matters — `waiting-for:clarification` MUST precede `waiting-for:clarification-review` so top-to-bottom substring matching resolves correctly. See contract §3.

### Edit set C — `README.md`

Open `packages/claude-plugin-cockpit/README.md`. In the § Available Commands table, find the `/cockpit:review` row:

```markdown
| `/cockpit:review` | Review a speckit gate — artifact (`specify`/`clarify`/`plan`/`tasks`) or `impl` PR diff — and advance on approval |
```

Replace with:

```markdown
| `/cockpit:review` | Review a speckit gate — artifact (`spec-review`/`clarification-review`/`plan-review`/`tasks-review`) or `implementation-review` PR diff — and advance on approval |
```

No other line of `README.md` is touched. In particular, the § Error Handling section is preserved byte-for-byte.

## Verify (eight greps + one diff)

Run from the repo root. All must pass.

### V1 — five verbatim CLI tokens present in `review.md` frontmatter and body (FR-002)

```bash
grep -c "spec-review\|clarification-review\|plan-review\|tasks-review\|implementation-review" packages/claude-plugin-cockpit/commands/review.md
```

Expected: ≥ 5. Actual count will be higher (each token appears in multiple sections: frontmatter, usage line, examples, mapping references).

### V2 — no bare `impl` shorthand used as a gate value in review.md or watch.md (FR-001, FR-005)

```bash
grep -nE "\\-\\-gate impl( |$|>|\\|)" packages/claude-plugin-cockpit/commands/review.md packages/claude-plugin-cockpit/commands/watch.md
```

Expected: 0 hits from either file. The pattern excludes `--gate impl` followed by any word character (which would match `--gate implementation-review` and is fine); it flags standalone `impl` and shorthand-with-delimiters.

Also check the README:

```bash
grep -nE "\\bimpl\\b" packages/claude-plugin-cockpit/README.md
```

Expected: 0 hits.

### V3 — new `Usage:` line present in review.md gate and Examples (FR-002)

```bash
grep -c "Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>" packages/claude-plugin-cockpit/commands/review.md
```

Expected: ≥ 1 (once in the step 1 gate; may be repeated in the Examples section).

### V4 — `clarification → /cockpit:clarify` special-case line present in review.md (Q1)

```bash
grep -c "For \`clarification\`, use \`/cockpit:clarify\`" packages/claude-plugin-cockpit/commands/review.md
```

Expected: ≥ 1.

### V5 — `event: COMMENT` request-changes payload described in review.md step 7 (FR-004)

```bash
grep -c "event: COMMENT" packages/claude-plugin-cockpit/commands/review.md
grep -c "gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews" packages/claude-plugin-cockpit/commands/review.md
grep -c "N finding(s) requiring changes; see inline comments." packages/claude-plugin-cockpit/commands/review.md
grep -c "waiting-for:address-pr-feedback" packages/claude-plugin-cockpit/commands/review.md
grep -c "PrFeedbackMonitorService" packages/claude-plugin-cockpit/commands/review.md
```

Expected:
- `event: COMMENT` — ≥ 1.
- `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` — ≥ 1.
- Summary-body literal — ≥ 1.
- `waiting-for:address-pr-feedback` — ≥ 1 (inside the inline `<!-- ... -->` rationale note documenting the intent).
- `PrFeedbackMonitorService` — ≥ 2 (once in step 6's approve-body rationale, once in step 7's request-changes rationale).

### V6 — corrected Suggested-decision rule for non-blocking findings (FR-006, Q4)

```bash
grep -nE "non-blocking findings only.*request-changes" packages/claude-plugin-cockpit/commands/review.md
grep -nE "non-blocking.*approve|All \`No\`.*approve" packages/claude-plugin-cockpit/commands/review.md
```

Expected:
- First grep — 0 hits (the pre-fix contradictory rule must be gone).
- Second grep — ≥ 1 hit (the corrected rule is present).

### V7 — findings-summary table with `Blocking?` column (FR-006, Q4)

```bash
grep -c "Blocking?" packages/claude-plugin-cockpit/commands/review.md
grep -c "^| # | File:line | Finding | Blocking? |" packages/claude-plugin-cockpit/commands/review.md
```

Expected:
- `Blocking?` — ≥ 2 (in the table header AND in the derivation-rules narrative).
- Table header row — 1 (the exact header from the contract).

### V8 — five explicit mapping-table rows present in watch.md; substitution pattern gone (FR-005, Q5)

```bash
for token in spec-review clarification-review plan-review tasks-review implementation-review; do
  grep -c "waiting-for:${token}" packages/claude-plugin-cockpit/commands/watch.md
  grep -c "/cockpit:review --gate ${token}" packages/claude-plugin-cockpit/commands/watch.md
done
grep -c "waiting-for:<gate>-review" packages/claude-plugin-cockpit/commands/watch.md
```

Expected: each `waiting-for:<token>` and each `/cockpit:review --gate <token>` count is ≥ 1; the substitution-pattern count is 0.

Also check row ordering: `waiting-for:clarification` MUST appear before `waiting-for:clarification-review` on line number (top-to-bottom substring resolution):

```bash
grep -n "waiting-for:clarification" packages/claude-plugin-cockpit/commands/watch.md
```

Expected: the first hit is the answering-gate row (`|` … `/cockpit:clarify` `|`), on a lower line number than the row containing `waiting-for:clarification-review`.

### V9 — error-conv block byte-identical between review.md and watch.md (FR-008, [#378](https://github.com/generacy-ai/agency/issues/378) invariant)

```bash
diff \
  <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) \
  <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)
```

Expected: no output (the two blocks are byte-identical). Any diff means an accidental edit inside the untouched zone — revert.

Also spot-check byte-identity against a sibling that was not touched by this PR:

```bash
diff \
  <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) \
  <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/status.md)
```

Expected: no output.

## Smoke test

Use an epic with an open impl PR — for reproducibility, replay the flow from [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) findings #12–14 against `christrudelpw/sniplink`.

### Case A — Vocabulary alignment (finding #12, SC-001)

1. From a Claude Code session with the plugin installed:
   ```
   /cockpit:review --gate implementation-review
   ```
2. Expected: `/code-review` runs on the PR, findings are printed, a `| # | File:line | Finding | Blocking? |` table is rendered, a `Suggested decision:` line follows the table, and an `AskUserQuestion` gate appears with three options `approve` / `request-changes` / `abort`.
3. Cancel the prompt. Rerun with an invalid gate:
   ```
   /cockpit:review --gate impl
   ```
4. Expected: literal line `Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>` followed by `For \`clarification\`, use \`/cockpit:clarify\` — the answering gate is a different verb.`. Exit non-zero, no `/code-review` invocation.

### Case B — `request-changes` posts an inline-anchored review (finding #13, SC-002)

Preconditions: the PR must have at least two changes that will produce `/code-review` findings (one contrived-blocking, one contrived-non-blocking — e.g. an unhandled null and a naming nit).

1. `/cockpit:review --gate implementation-review` on the PR.
2. Verify the findings-summary table shows the per-finding `Blocking?` column — at least one `Yes` and at least one `No`.
3. Select `request-changes`.
4. Expected in the session: one line `Feedback posted: 2 inline comment(s) on PR #<n>`.
5. Verify on GitHub (or via `gh api`):
   ```bash
   gh api repos/christrudelpw/sniplink/pulls/{n}/reviews --jq '.[-1] | {state, body}'
   gh api repos/christrudelpw/sniplink/pulls/{n}/comments --jq '.[-2:] | map({path, line, body: .body[:60]})'
   ```
   Expected:
   - Last review has `state == "COMMENTED"` and `body == "2 finding(s) requiring changes; see inline comments."`.
   - Last two review comments are file:line-anchored to the two findings' locations, bodies match the finding text.
6. Wait one poll cycle (usually < 60s). Verify `waiting-for:address-pr-feedback` is applied to the epic issue:
   ```bash
   gh issue view <epic-issue-number> --repo christrudelpw/sniplink --json labels --jq '.labels[].name' | grep waiting-for
   ```
   Expected: `waiting-for:address-pr-feedback`.
7. Verify NO `Labels:` line was printed by the plugin (step 7's rationale note requires the CLI advance is skipped).
8. Verify NO `event: REQUEST_CHANGES` review was posted (would be a 422 anyway on the single-credential cluster).

### Case C — `approve` with non-blocking findings surfaces them body-only (finding #14, SC-003)

Preconditions: `/code-review` on the PR emits only non-blocking findings (contrived nits — variable naming, docstring polish).

1. `/cockpit:review --gate implementation-review` on the PR.
2. Verify the findings-summary table shows all rows as `Blocking? No` and the `Suggested decision:` line is `approve`.
3. Select `approve`.
4. Verify on GitHub:
   ```bash
   gh api repos/christrudelpw/sniplink/pulls/{n}/reviews --jq '.[-1] | {state, body}'
   gh api repos/christrudelpw/sniplink/pulls/{n}/comments --jq 'length'
   ```
   Expected:
   - Last review has `state == "APPROVED"` and `body` lists the non-blocking findings as text (one paragraph per finding, `- <file>:<line> — <finding text>` form).
   - The `comments` count is unchanged from before the invocation (NO inline threads added by the approve path).
5. Verify the CLI advance ran: the session should have printed `Labels: waiting-for:implementation-review → completed:implementation-review`.
6. Verify `PrFeedbackMonitorService` does NOT apply `waiting-for:address-pr-feedback` (no unresolved threads to trigger it). Wait one poll cycle and re-check:
   ```bash
   gh issue view <epic-issue-number> --repo christrudelpw/sniplink --json labels --jq '.labels[].name' | grep waiting-for
   ```
   Expected: NO `waiting-for:address-pr-feedback`. The epic transitions to whatever gate follows `completed:implementation-review` (typically `waiting-for:manual-validation` or `waiting-for:children-complete`).

### Case D — Watch mapping suggests `implementation-review` verbatim (finding #12 watch side, SC-004)

1. From a fresh session (or the same one with `watch` running):
   ```
   /cockpit:watch christrudelpw/sniplink#<epic-number>
   ```
2. Cause a transition to `waiting-for:implementation-review` on a child issue (e.g. by completing tasks-review on a queued issue).
3. Expected line in the watch stream: `... waiting-for:implementation-review ... · suggested: /cockpit:review --gate implementation-review`. No `impl` shorthand.
4. Cause a transition to `waiting-for:clarification` (e.g. by re-opening a clarification). Expected suggestion: `... · suggested: /cockpit:clarify` (unchanged from pre-fix).
5. Cause a transition to `waiting-for:manual-validation` (if applicable). Expected: the transition line is printed WITHOUT the ` · suggested: …` segment (Q5: no v1 row for `manual-validation`).

### Error-class parity spot-check (SC-004 / #378 invariant)

- **MISSING_BINARY** (either `generacy` or `gh` missing): temporarily unset `PATH`. Run `/cockpit:review --gate implementation-review` and select any option. Expected: the printed remedy matches `packages/claude-plugin-cockpit/README.md § Error Handling § MISSING_BINARY` verbatim.
- **AUTH_FAILURE** on the new `gh api .../reviews` call: `unset GH_TOKEN; gh auth logout` before running `/cockpit:review --gate implementation-review` → `request-changes`. Expected: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER**: contrive a `gh api` failure (e.g. pass a nonexistent PR number in a local scratch fork). Expected: `CLI failed with exit code <N>.` followed by stderr in a fenced block.

## Open the PR

Once V1–V9 all pass, the four smoke-test cases pass, and the three error-class checks pass:

```bash
git add packages/claude-plugin-cockpit/commands/review.md \
        packages/claude-plugin-cockpit/commands/watch.md \
        packages/claude-plugin-cockpit/README.md
git status  # should show exactly 3 modified files, all under packages/claude-plugin-cockpit/
git commit -m "fix: #382 align cockpit review/watch playbooks with CLI vocabulary and PrFeedbackMonitor flow"
git push -u origin 382-found-during-cockpit-v1
gh pr create --base develop \
  --title "fix: #382 align cockpit review/watch playbooks with CLI vocabulary and PrFeedbackMonitor flow" \
  --body "..."
```

The PR body should reference the spec, the five clarifications (Q1–Q5), and link to [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) findings #12–14.

## Troubleshooting

**V1 reports fewer than 5** — a token is missing from the frontmatter enumeration or the usage line. Re-open Edit 12 and Edit 10 in Edit set A.

**V2 reports > 0** — a stale `impl` shorthand leaked through. Check the Examples section (Edit 1 in Edit set A), the H1 body (Edit 11), and the step 3 branch header (Edit 8).

**V3 reports 0** — the usage line was rewritten with the wrong delimiter or wrong token order. Copy it byte-for-byte from `contracts/review-command.contract.md §3`.

**V4 reports 0** — the special-case sub-line for `clarification` is missing. It is a separate line under the usage line — see contract §3.

**V5 reports 0 on any grep** — the `request-changes` step 7 was not added or was added without one of the mandatory strings. Re-open Edit 4 in Edit set A and copy the block byte-for-byte from contract §9.

**V6 first grep reports > 0** — the pre-fix contradictory rule is still present in step 3. Re-open Edit 8 and verify the middle branch reads `All \`No\` (findings present, none blocking) → \`Suggested decision: approve\``.

**V7 reports fewer than 2 for `Blocking?`** — the findings-summary table shape is missing or the derivation-rules narrative uses a different column name. Copy the table shape from contract §5.

**V8 substitution-pattern count is > 0** — the current `waiting-for:<gate>-review` row was not replaced. Re-open Edit set B and copy the eight-row table from contract §2.

**V8 row-ordering check fails** — `waiting-for:clarification` appears after `waiting-for:clarification-review`. The lookup would misfire at runtime. Reorder per contract §3.

**V9 diffs non-empty** — the error-conv block was edited inadvertently in one of the two files. Copy the block byte-for-byte from `commands/status.md` (or any sibling untouched by this PR) to restore the [#378](https://github.com/generacy-ai/agency/issues/378) invariant.

**Smoke test Case B — no `waiting-for:address-pr-feedback` applied after `request-changes`** — either (a) the `event: COMMENT` review was not posted (check `gh api .../reviews`), (b) inline `comments[]` were empty so no thread was created, or (c) `PrFeedbackMonitorService` is not running / not observing this repo. Rule out (a) and (b) first with `gh api`; if the review + comments are present but the label never applies, the fault is on the monitor side (Out of Scope §1 of this fix).

**Smoke test Case C — `waiting-for:address-pr-feedback` incorrectly applied after `approve`** — the approve path posted inline threads instead of body-only. Re-open Edit 5 in Edit set A and confirm the step 6 block has `Do NOT include \`comments[]\`` and does NOT POST an accompanying `event: COMMENT` review.

**Smoke test Case D — watch stream suggests `--gate impl`** — either (a) the `watch.md` mapping-table rewrite was not applied, or (b) the plugin was not rebuilt / re-linked from this checkout. Rerun `pnpm build` if needed, restart the Claude Code session, and re-check `commands/watch.md` post-install.
