# Quickstart: apply and verify the cockpit review.md approve-path + terminal-check fix

**Feature**: 384-found-during-cockpit-v1
**Audience**: Maintainer applying the fix before opening a PR against `develop`.
**Time**: ~25 minutes (one file edited in four sections + 9 greps + 1 diff check + 3 smoke tests on an epic with an open PR).

This is not a runtime feature and has no install step. What follows is the apply-and-verify sequence.

## Prerequisites

- Local checkout of `generacy-ai/agency` on branch `384-found-during-cockpit-v1`.
- `grep`, `sed`, `diff` available (any POSIX shell).
- For the smoke tests only: a Claude Code session with the `@generacy-ai/claude-plugin-cockpit` plugin installed (locally linked from this checkout, or installed from a preview publish), the `generacy` CLI on `$PATH`, and `gh` authenticated as an account that is BOTH the author of a test PR AND the credential the plugin uses (i.e., single-credential cluster shape). Plus write access to a test repo with an active epic that has an open impl PR — the smoke test in [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) used `christrudelpw/sniplink`.

## Overview of the change

One file, one PR:

- **`packages/claude-plugin-cockpit/commands/review.md`** — four edits:
  1. **Step 3** — add a new bullet: `MUST NOT print raw JSON …` (contract §5). Placement: between the existing "Capture /code-review's output verbatim" bullet and the "Classify each finding" bullet.
  2. **Step 6** — inside the first sub-branch (the `implementation-review AND non-blocking findings present` case), change `event: APPROVE` to `event: COMMENT`, drop the "Do NOT post an accompanying `event: COMMENT` review" clause (obsolete because the primary event IS `COMMENT`), and replace the inline `<!-- ... -->` rationale comment with the new self-APPROVE-forbidden wording (contract §8).
  3. **Step 8** — replace the current one-sentence step with the new emission-including sentence: keep the "no `Labels:` / no state / no PR review" clauses, add a literal `Aborted: no changes to gate <gate>; no PR review posted.` line, add an inline rationale comment (contract §10).
  4. **Examples** — update ONE sentence: `event: APPROVE` → `event: COMMENT`, with the `(no inline threads, so PrFeedbackMonitorService stays quiet)` clarification added (contract §13).
  5. **NEW section at end of file** — add `## Terminal Outcome Check` wrapped in `<!-- BEGIN terminal-check -->` … `<!-- END terminal-check -->` fence markers, after the existing `## Examples` section (contract §14).

The `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` block is **NOT** touched — see `contracts/review-command.contract.md §12`.

## Apply the fix

The canonical string content for each section is in `contracts/review-command.contract.md`. Open that file and the current `packages/claude-plugin-cockpit/commands/review.md` side by side, then perform the edits below. Suggested order: bottom-up (Terminal Outcome Check first, then Examples, then step 8, then step 6, then step 3), which minimizes line-number churn between edits.

### Edit 1 of 5 — Add the `## Terminal Outcome Check` block at the end of the file

Copy the block from `contracts/review-command.contract.md §14` verbatim and append it after the `## Examples` section, following the last line of the current file. The block includes the `## Terminal Outcome Check` heading, the `<!-- BEGIN terminal-check -->` fence marker, the prose body (marker enumeration, no-state-probe prohibition, loop-back rules, passive raw-JSON reminder), the inline `<!-- Rationale: ... -->` comment, and the `<!-- END terminal-check -->` closing marker.

### Edit 2 of 5 — Update the ONE Examples reference to `event: APPROVE`

Current file, line 89 area. The current sentence is:

> On `approve` with only non-blocking findings, POSTs an `event: APPROVE` PR review whose body lists those findings (no inline threads) AND runs the CLI advance.

Replace with:

> On `approve` with only non-blocking findings, POSTs an `event: COMMENT` PR review whose body lists those findings (no inline threads, so `PrFeedbackMonitorService` stays quiet) AND runs the CLI advance.

Match the block byte-for-byte from `contracts/review-command.contract.md §13`.

### Edit 3 of 5 — Replace step 8 with the emission-including form

Current file, step 8 (`packages/claude-plugin-cockpit/commands/review.md:75`). Replace the current one-sentence step with the exact block from `contracts/review-command.contract.md §10`. The replacement adds the literal `Aborted: no changes to gate <gate>; no PR review posted.` emission and an inline rationale comment; the "no Labels: / no state / no PR review" narrative is preserved but now precedes the emission clause.

### Edit 4 of 5 — Flip step 6's event value and replace the inline rationale comment

Current file, step 6, first sub-branch (`packages/claude-plugin-cockpit/commands/review.md:60`). Replace the current bullet with the exact block from `contracts/review-command.contract.md §8`. The changes:

- `event: APPROVE` → `event: COMMENT` (the payload event value).
- The prose "POST an `event: APPROVE` PR review" → "POST an `event: COMMENT` PR review".
- The `Do NOT post an accompanying event: COMMENT review` clause is REMOVED (redundant now that the primary event is `COMMENT`).
- The inline `<!-- Rationale: ... -->` comment is REPLACED with the new wording from §8, which explains why `APPROVE` fails on self-PRs, why `COMMENT` is permitted, why the semantic contract is preserved, and — the FR-002 language — "Self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship."

The other sub-branches of step 6 (`If the gate is implementation-review AND no findings were present…`, `For non-implementation-review gates…`, and the CLI-advance bullet) are UNCHANGED.

### Edit 5 of 5 — Add the `MUST NOT print raw JSON` bullet to step 3

Current file, step 3, between the `Capture /code-review's output verbatim as the review summary body.` bullet (line 34) and the `Classify each finding.` bullet (line 35). Insert a new bullet exactly as specified in `contracts/review-command.contract.md §5`:

> **MUST NOT print raw JSON under any circumstance.** If `/code-review` returns JSON, parse it and render the required summary table (below) before printing anything else. Raw JSON output from this step is a defect: the operator must see the findings-summary table, never `{"findings": …}` prose.

## Verify — local (deterministic) checks

Run each of the following from the repo root and check the expected result. Any failure indicates the edit is incomplete or incorrect.

```bash
# 1. No `event: APPROVE` remains as a payload value on the approve path.
grep -n "^[^<]*event: APPROVE" packages/claude-plugin-cockpit/commands/review.md
# Expected: (empty output)

# 2. Two occurrences of `event: COMMENT` — step 6 (approve path) + step 7 (request-changes).
grep -c "event: COMMENT" packages/claude-plugin-cockpit/commands/review.md
# Expected: 2 (or more, if the Examples section quotes it)

# 3. Inline rationale comment includes the self-APPROVE-forbidden language (FR-002).
grep -c "self-APPROVE is forbidden by GitHub" packages/claude-plugin-cockpit/commands/review.md
# Expected: >= 1

# 4. Terminal Outcome Check section is present, fence-marked, exactly once.
grep -c "^## Terminal Outcome Check" packages/claude-plugin-cockpit/commands/review.md
# Expected: 1
grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md
# Expected: 1
grep -c "<!-- END terminal-check -->" packages/claude-plugin-cockpit/commands/review.md
# Expected: 1

# 5. Step 8's `Aborted:` line is present.
grep -c "Aborted: no changes to gate" packages/claude-plugin-cockpit/commands/review.md
# Expected: >= 1
grep -n "Aborted:" packages/claude-plugin-cockpit/commands/review.md
# Expected: >= 2 hits (step 8 emission + Terminal Outcome Check enumeration)

# 6. Step 3's raw-JSON forbidden bullet is present.
grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md
# Expected: >= 1

# 7. Terminal Outcome Check block prohibits state probes explicitly (FR-008).
grep -c "no \`gh api\` calls, no \`generacy cockpit status\` calls" packages/claude-plugin-cockpit/commands/review.md
# Expected: >= 1

# 8. Terminal Outcome Check block loops back to step 5 only, unbounded (FR-004/FR-009).
grep -c "re-invoke step 5 only" packages/claude-plugin-cockpit/commands/review.md
# Expected: exactly 1

# 9. Error-conv block byte-identical between review.md and watch.md (regression guard from #378).
diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) \
     <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)
# Expected: (empty output)

# 10. Only review.md is modified in this PR — one file changed, no other files touched.
git diff --stat --name-only develop...HEAD -- packages/claude-plugin-cockpit/
# Expected: packages/claude-plugin-cockpit/commands/review.md   (single line)

# 11. Terminal-check block is `review.md`-only in this PR — no clarify.md retrofit.
grep -rl "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/
# Expected: packages/claude-plugin-cockpit/commands/review.md   (single line)
```

If any check fails, re-open the corresponding section of `contracts/review-command.contract.md` and reconcile against the file.

## Verify — manual smoke tests

Each of the three smoke tests below corresponds to one of the three success criteria in `spec.md`. Run them in order.

### Smoke test A (US1, SC-001) — approve path advances without 422 on single-credential cluster

Prerequisite: an epic in the test repo with an open `implementation-review` PR that (a) was authored by the same credential the plugin uses to POST reviews (single-credential cluster shape), and (b) has at least one PR-diff finding that `/code-review` will classify as non-blocking (a style suggestion or nit — e.g., a stray semicolon or long line).

1. In a Claude Code session with the plugin installed and pointed at the test epic's branch, run:

   ```
   /cockpit:review <epic-ref> --gate implementation-review
   ```

2. Step 3 runs `/code-review`, renders the findings-summary table with the non-blocking finding as `Blocking? No`, and prints `Suggested decision: approve`.

3. At step 5's `AskUserQuestion`, select `approve`.

4. Confirm the following text emission at the end of the session:

   ```
   Labels: waiting-for:implementation-review → completed:implementation-review
   ```

   No `Can not approve your own pull request` error. No error-handling block firing. No `Aborted:` line.

5. Confirm on GitHub:

   ```bash
   gh api "repos/<owner>/<repo>/pulls/<n>/reviews" | jq '.[] | select(.body | contains("<finding-text-snippet>")) | {state, body}'
   ```

   Expected: `state: "COMMENTED"` (NOT `"APPROVED"`), `body` includes the non-blocking findings as human-readable text.

6. Confirm no PR review threads were opened alongside:

   ```bash
   gh api "repos/<owner>/<repo>/pulls/<n>/comments" | jq 'length'
   ```

   Expected: 0 (or unchanged from before the smoke test, if the PR already had unrelated review threads).

**Pass criterion**: the `Labels:` line printed; the review event on GitHub is `COMMENTED`, not `APPROVED`; no review threads opened; the epic advanced from `waiting-for:implementation-review` to `completed:implementation-review`.

### Smoke test B (US2, SC-002) — terminal check catches the missing-outcome case and loops back unbounded

Prerequisite: same epic as smoke test A (or a fresh one), open impl PR present.

1. Run `/cockpit:review <epic-ref> --gate implementation-review`.

2. Step 3 runs `/code-review` and renders the findings-summary table.

3. At step 5's `AskUserQuestion`, dismiss the prompt without selecting an option. (In Claude Code, this typically means canceling the prompt via the UI's dismiss button, or providing an out-of-set input.)

4. Confirm the following terminal-check text emission:

   ```
   [Terminal Outcome Check message text — the block's prose about missing markers and loop-back to step 5]
   ```

   And confirm that step 5's `AskUserQuestion` is re-invoked with the same three options, showing the findings-summary table from session context (not a fresh `/code-review` invocation — verify by observing that the second table's contents match the first's byte-for-byte and the sub-invocation was not repeated).

5. Repeat step 3-4 twice more (dismiss without selecting, verify loop-back). Confirm no retry cap fires: the loop should continue indefinitely as long as the operator does not select an option.

6. On the fourth iteration, select `abort`. Confirm the emission:

   ```
   Aborted: no changes to gate implementation-review; no PR review posted.
   ```

   And confirm the session exits zero without further loop-backs.

**Pass criterion**: three consecutive dismissals produce three loop-backs to step 5; the fourth iteration's `abort` selection produces the `Aborted:` line and the session exits.

### Smoke test C (US3, SC-003) — step 3 does not print raw JSON

Prerequisite: any epic with an open impl PR that `/code-review` will emit findings on.

1. Run `/cockpit:review <epic-ref> --gate implementation-review`.

2. Step 3 runs `/code-review`.

3. Inspect step 3's output before the `AskUserQuestion` prompt fires. The findings-summary table MUST be present. Raw JSON output MUST NOT appear anywhere in step 3's printed text — no `{"findings": [...]}` prefix, no JSON dump inline with prose.

4. If `/code-review` happened to return prose (not JSON) in this session, the smoke test does not exercise the raw-JSON path — repeat with a different PR or a different `/code-review` invocation until a JSON return is obtained. If no JSON return is reproducible in the current session, note that as a limitation and rely on the local check `grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md` (≥ 1) as the strongest deterministic guard.

**Pass criterion**: step 3's output shows the findings-summary table only, never raw JSON — regardless of what `/code-review` returned.

### Optional smoke test — AUTH_FAILURE parity

To confirm the error-conv block is untouched and the `gh api` invocation with the new `COMMENT`-event payload still participates in the three-class classification:

1. Export `GH_TOKEN=""` (or otherwise invalidate the `gh` credential) before running `/cockpit:review <epic-ref> --gate implementation-review`.

2. At step 5, select `approve`.

3. Step 6's `gh api .../reviews` POST fails with an auth error. The error-conv block's `AUTH_FAILURE` branch fires and prints exactly the block's canonical message:

   ```
   Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.
   ```

**Pass criterion**: the AUTH_FAILURE text matches `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim; the byte-identical `<!-- BEGIN error-conv -->` block is confirmed intact.

## Troubleshooting

**Q: The Terminal Outcome Check block fires even after I selected `approve` and the CLI advance succeeded.**
A: Check that step 6 printed a line matching `Labels: waiting-for:<gate> → completed:<gate>` in the session's OWN output. If the CLI printed the line but the plugin swallowed it (e.g., ran the `Bash` tool with output suppression), the check has no marker to observe. Fix: ensure step 6's Bash invocation of `generacy cockpit advance` shows its stdout in the session.

**Q: After the loop-back, the second step 5 prompt is missing the findings-summary table.**
A: Verify the loop-back re-invokes ONLY step 5, not step 5 + step 3. The findings-summary table should be re-shown from session context (step 3's output is still visible above the prompt). If the table is missing, the loop-back is over-scoped — verify against `contracts/review-command.contract.md §14`.

**Q: I want to also add the block to `clarify.md` — should I include that here?**
A: No. That is Out of Scope §1 for this PR — the block shape is defined here, but `clarify.md`'s outcome markers are different (per-question `Approve`/`Edit`/`Skip`, not per-command approve/request-changes/abort) and adopting the block there needs its own scoping. File a follow-up issue.

**Q: The step 8 `Aborted:` line seems redundant — the abort branch was already a no-op.**
A: The line is the Terminal Outcome Check's marker for the abort outcome. Without it, the check cannot distinguish "abort was chosen and executed" from "no terminal outcome was reached at all"; both would show empty step-8 output. See `research.md §Decision 3` for the full argument.

**Q: Can I change the exact marker strings (e.g., `Aborted:` → `ABORT:`)?**
A: No. The Terminal Outcome Check block enumerates the specific strings each step must emit. Any change requires updating both the step's emission AND the check's enumeration in the same commit. Both markers appear in `contracts/review-command.contract.md §10 and §14`.

## After this PR merges

- The plugin republishes on next preview cycle; no manual publish step is needed.
- Watch for another live smoke test on `christrudelpw/sniplink` (or a comparable epic with an open impl PR) via the tetrad-development#88 cadence.
- If the Terminal Outcome Check's `Aborted:` marker's specific wording proves inconvenient in operator sessions, tune it in a follow-up PR — but touch step 8 AND the block's enumeration in the same commit.

---

*Quickstart for /plan on issue [generacy-ai/agency#384](https://github.com/generacy-ai/agency/issues/384)*
