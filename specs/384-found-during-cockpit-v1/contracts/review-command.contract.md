# Contract: `commands/review.md` — required strings after rewrite (issue #384)

**Feature**: 384-found-during-cockpit-v1
**File under contract**: `packages/claude-plugin-cockpit/commands/review.md`
**Consumers**: The Claude Code harness (reads the file as a slash-command prompt at invocation time), the operator (reads the printed output), and — indirectly — `PrFeedbackMonitorService` (observes the review threads this command posts, or the deliberate absence thereof on the approve path).
**Purpose**: Capture, section by section, the exact strings the rewritten file MUST contain for the #384 fixes. This is the reference the quickstart, code review, and any future drift check hangs off. Sections **not touched** by this feature reference the #382 contract's byte-preservation notice; the reader should treat those sections as "leave alone" during the edit pass.

Backticks in this document are Markdown code spans; every literal that must appear in `review.md` byte-for-byte is enclosed in a fenced code block. The prompt text uses ASCII quotes and a single em dash `—` where indicated; smart quotes / en dashes are drift.

## §1 Frontmatter — unchanged from #382

The YAML frontmatter is NOT modified. It remains byte-for-byte the block established in the #382 contract §1 (five verbatim `--gate` CLI tokens in the description). Any edit to this section is out of scope for #384.

Verification:
- `head -n 7 packages/claude-plugin-cockpit/commands/review.md` MUST byte-match the frontmatter block established in `specs/382-found-during-cockpit-v1/contracts/review-command.contract.md §1`.

## §2 H1 body — unchanged from #382

The paragraph immediately under `# Review Command` is NOT modified. It remains byte-for-byte the block established in the #382 contract §2. Any edit to this section is out of scope for #384.

## §3 Step 1 — Parse arguments — unchanged from #382

Not modified. Preserved from #382 contract §3.

## §4 Step 2 — Pre-flight — unchanged from #382

Not modified. Preserved from #382 contract §4.

## §5 Step 3 — `--gate implementation-review` branch — ONE new sentence added; rest preserved from #382

The full step remains as specified in the #382 contract §5, except that one new sentence is inserted immediately after the current second bullet (`Capture /code-review's output verbatim as the review summary body.`) and before the current third bullet (`Classify each finding.`). The inserted sentence is a new stand-alone bullet:

```markdown
   - **MUST NOT print raw JSON under any circumstance.** If `/code-review` returns JSON, parse it and render the required summary table (below) before printing anything else. Raw JSON output from this step is a defect: the operator must see the findings-summary table, never `{"findings": …}` prose.
```

Rationale for placement (a) after the verbatim-capture bullet: capture is what may return JSON, so the guard follows the operation that produces the JSON; (b) before the classification bullet: classification operates on parsed findings, so the parse-or-forbid rule must apply first.

Verification:
- `grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.
- `grep -n "Capture .code-review.'s output verbatim\|Classify each finding" packages/claude-plugin-cockpit/commands/review.md` MUST show the "Capture …" bullet BEFORE the new "MUST NOT print raw JSON …" bullet BEFORE the "Classify each finding" bullet — in that top-to-bottom order.
- All other bullets in step 3 (classification, findings-summary table shape, `Suggested decision:` derivation) are UNCHANGED from #382. `diff` of the untouched sub-bullets against the #382 contract §5 corresponding sub-bullets MUST show no differences.

## §6 Step 4 — Non-`implementation-review` gate branch — unchanged from #382

Not modified. Preserved from #382 contract §6.

## §7 Step 5 — Approval prompt — unchanged from #382

Not modified. Preserved from #382 contract §7. The three-option `AskUserQuestion` and its findings-summary display remain byte-for-byte as established by #382.

## §8 Step 6 — Advance on approval — the sub-branch's `event` value flips from `APPROVE` to `COMMENT`; the inline rationale comment is replaced

The full step 6 remains structurally as specified in the #382 contract §8, with two changes inside the first sub-branch (the sub-branch that fires when the gate is `implementation-review` AND non-blocking findings were present in step 3's table).

**Change 1**: The `event` value in the payload description changes from `APPROVE` to `COMMENT`. The prose "POST an `event: APPROVE` PR review" becomes "POST an `event: COMMENT` PR review". Every other structural element of the sentence — the `gh api` URL, the body-payload description, the `Do NOT include comments[]` clause, the `Do NOT post an accompanying event: COMMENT review` clause — is REPLACED with the phrasing below (which drops the now-redundant accompanying-COMMENT prohibition because the primary event IS `COMMENT`, and updates the rationale wording).

**Change 2**: The existing inline `<!-- ... -->` rationale comment is replaced with the new self-APPROVE-forbidden wording per Q3 / FR-002.

The rewritten first sub-branch (replacing the current bullet at `packages/claude-plugin-cockpit/commands/review.md:60`) MUST read:

```markdown
   - If the gate is `implementation-review` AND non-blocking findings were present in step 3's table, POST an `event: COMMENT` PR review via `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews` with a `body` that lists the non-blocking findings as human-readable text (one paragraph per finding: `- <file>:<line> — <finding text>`). Do NOT include `comments[]`. <!-- Rationale: event: APPROVE is forbidden by GitHub on one's own PR (422 "Can not approve your own pull request") and is semantically empty on a self-PR anyway — approval on your own PR does not count toward branch-protection thresholds. event: COMMENT is permitted on one's own PR and, with no comments[], produces zero review threads, so PrFeedbackMonitorService stays quiet: the #382 semantic contract "inline threads = actionable feedback; body text = information" is preserved verbatim. Self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship. -->
```

The second sub-branch (`If the gate is implementation-review AND no findings were present, no PR review is posted (the CLI advance below is the only side effect).`), the third sub-branch (`For non-implementation-review gates, no PR review is posted (there is no PR at these gates).`), and the final CLI-advance bullet (`Run generacy cockpit advance --gate <name> via the Bash tool. On exit 0, print one line Labels: waiting-for:<name> → completed:<name>. On non-zero CLI exit, apply the Error handling block below.`) are UNCHANGED from #382 contract §8.

Verification:
- `grep -n "event: APPROVE" packages/claude-plugin-cockpit/commands/review.md` MUST report 0 hits. (The substring `APPROVE` remains only inside the inline rationale comment via the phrases `event: APPROVE is forbidden` and `Self-APPROVE is forbidden` — those are prose narrating the rejection, not payload values. A stricter check that avoids false negatives on the rationale wording is `grep -n "^[^<]*event: APPROVE" packages/claude-plugin-cockpit/commands/review.md` — any line that mentions `event: APPROVE` OUTSIDE a `<!-- ... -->` comment is a defect. This alternative form MUST also report 0 hits.)
- `grep -c "event: COMMENT" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 (this step's first sub-branch AND step 7's payload description).
- `grep -c "self-APPROVE is forbidden by GitHub" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the inline rationale comment.
- `grep -c "PrFeedbackMonitorService stays quiet" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the inline rationale comment's semantic-contract clause. (Preserves the connection to the #382 invariant so the reader sees why body-only is load-bearing.)
- Preserved from #382 (regression guard): `grep -c "comments\\[\\]" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 in step 6 alone (the `Do NOT include comments[]` clause). Step 7's own `comments[]` payload description also matches; the count across the file is ≥ 2.

## §9 Step 7 — Post feedback on `request-changes` — unchanged from #382

Not modified. Preserved from #382 contract §9. The `event: COMMENT` review with per-finding inline anchored comments, the `Feedback posted: N inline comment(s) on PR #<pull_number>` emission on exit 0, and the "do NOT run generacy cockpit advance" clause all remain byte-for-byte as established by #382.

## §10 Step 8 — No-op on `abort` — narrative unchanged; new `Aborted:` emission added

Step 8's current narrative (`packages/claude-plugin-cockpit/commands/review.md:75`) is:

```markdown
8. **No-op on `abort`** — On `abort`, emit no `Labels:` line, mutate no state, post no PR review, and exit zero.
```

This is replaced with:

```markdown
8. **No-op on `abort`** — On `abort`, emit no `Labels:` line, mutate no state, post no PR review, print a literal single line `Aborted: no changes to gate <gate>; no PR review posted.` (with `<gate>` interpolated to the argument's value), and exit zero. <!-- The `Aborted:` line is the Terminal Outcome Check's marker for the abort branch (FR-005); it is emitted only on this code path, so its presence transitively verifies the abort outcome without any state probe. -->
```

Rationale (captured in the inline `<!-- ... -->` for future readers): the emission is what makes the Terminal Outcome Check work without a state probe. Removing or making it conditional on future edit would silently break the check.

Verification:
- `grep -n "Aborted:" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 hits — this step's emission instruction AND the Terminal Outcome Check block's enumeration (§12).
- `grep -c "Aborted: no changes to gate" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the exact emission wording from step 8.
- The line ordering `emit no Labels: line` before `Aborted: no changes to gate <gate>` MUST be preserved so the reader sees the "no-op" contract before the emission requirement (the `Aborted:` line is the ONLY thing printed on the abort branch — it doesn't contradict the "no Labels: / no state / no PR review" clauses).

## §11 Step 9 — Error-handling delegation — unchanged from #382

Not modified. Preserved from #382 contract §11.

## §12 `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block — untouched

BYTE-for-BYTE preserved from the current file. The three-class MISSING_BINARY / AUTH_FAILURE / OTHER block established across seven files by [#378](https://github.com/generacy-ai/agency/issues/378) is not modified.

Verification:
- `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)` MUST return empty output.
- The Canonical-source-of-truth marker line (`<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->`) remains inside this block, unchanged.

## §13 `## Examples` section — unchanged from #382

Not modified. Preserved from #382 contract §13.

Note (Q3-driven, cross-references §8): the current #382 Examples section mentions the approve path posting an `APPROVE` review. This is one line of prose in the examples, at line 89 of the current file. Since the Examples section text describes what the plugin does, and the plugin now posts `event: COMMENT` on that path, the ONE reference must be updated for narrative accuracy:

- The current sentence "On `approve` with only non-blocking findings, POSTs an `event: APPROVE` PR review whose body lists those findings (no inline threads) AND runs the CLI advance." becomes "On `approve` with only non-blocking findings, POSTs an `event: COMMENT` PR review whose body lists those findings (no inline threads, so `PrFeedbackMonitorService` stays quiet) AND runs the CLI advance."

Verification:
- `grep -c "POSTs an .event: COMMENT. PR review whose body lists those findings" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1.
- `grep -n "POSTs an .event: APPROVE. PR review" packages/claude-plugin-cockpit/commands/review.md` MUST report 0 hits — the old wording is fully replaced.

## §14 NEW `## Terminal Outcome Check` section — new to the file (issue #384, FR-003, FR-004, FR-007, FR-008, FR-009)

A NEW top-level section is added at the end of `review.md`, after the `## Examples` section. The section is wrapped in fence markers following the `error-conv` convention. The section MUST be structured EXACTLY as follows:

```markdown
## Terminal Outcome Check

<!-- BEGIN terminal-check -->
**Terminal Outcome Check** — Before this command ends, exactly one of the following three markers MUST have been emitted in this session's output. Detection is text-emission-only: no `gh api` calls, no `generacy cockpit status` calls, no `gh pr view` calls, no state probes of any kind. Each marker is emitted by its own step only after that step's real side effect succeeds (or, in the abort case, only when the abort branch is taken), so verifying the emission verifies the outcome transitively.

- **approve** — Step 6 executed and printed a line matching `Labels: waiting-for:<gate> → completed:<gate>`.
- **request-changes** — Step 7 executed and printed a line matching `Feedback posted: N inline comment(s) on PR #<pull_number>`.
- **abort** — Step 8 executed and printed a line matching `Aborted: no changes to gate <gate>; no PR review posted.`.

If none of the three markers has been emitted, the command MUST NOT exit. Instead, re-invoke step 5 only (`AskUserQuestion` with the same three options) — do NOT re-invoke `/code-review`, do NOT restart from step 3, do NOT restart from step 1. The findings-summary table from step 3 (or the three-section summary from step 4) is re-shown from session context; the sub-invocation is not repeated. The loop is unbounded: each iteration blocks on a human answer, so there is no runaway risk, and a retry cap would convert operator hesitation into a silent non-outcome — exactly this bug's failure mode.

Passive reminder for the operator (not an active check): step 3's findings are rendered via the required summary table, never as raw JSON. Raw-JSON prevention is enforced at step 3 itself (see the `MUST NOT print raw JSON` bullet in that step); this reminder is here only so an operator who lands on this block via the loop-back understands what step 3's correct output should look like.
<!-- Rationale: this block exists because the observed cockpit v1 smoke test session (tetrad-development#88 finding #16) ran /code-review, presented findings, and ended without ever reaching step 5's AskUserQuestion — instruction decay after a long sub-invocation. Text-emission markers keyed to each terminal step's own side-effect-coupled emission provide a network-free fail-closed backstop. Retroactively adopting the same block in clarify.md (per Q1) is a sensible follow-up but is out of scope for this PR. -->
<!-- END terminal-check -->
```

Rationale for placement AT END of file (after Examples): the terminal outcome is by definition the last thing to check before the session ends. Placing it last matches the order of narration and separates it visually from the step-by-step instructions.

Verification:
- `grep -c "^## Terminal Outcome Check" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1.
- `grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1.
- `grep -c "<!-- END terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1.
- `grep -c "Detection is text-emission-only" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1.
- `grep -c "MUST NOT exit" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1 (the loop-back branch — no other `MUST NOT exit` occurs in the file).
- `grep -c "re-invoke step 5 only" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1 (the Q4/FR-004 constraint).
- `grep -c "do NOT re-invoke .\`code-review\`.\\|do NOT re-invoke .\`/code-review\`." packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (the Q4/FR-009 constraint; the character-class tolerates whichever spelling of the command reference the final file uses).
- `grep -c "no .gh api. calls, no .generacy cockpit status. calls" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (the FR-008 no-state-probe constraint).
- `grep -c "Passive reminder for the operator" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 (the FR-007 passive raw-JSON reminder).
- The block's three-marker enumeration MUST appear in the order approve → request-changes → abort. This ordering mirrors step 5's `AskUserQuestion` option ordering (Q1 answer: `approve` first, `request-changes` second, `abort` third).

## §15 File-level cross-file invariants

The following invariants MUST hold across `packages/claude-plugin-cockpit/commands/` after the edit:

- `grep -r "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/` MUST report exactly 1 result — `review.md` only. `clarify.md` retrofit is Out of Scope §1 for this PR.
- `grep -r "<!-- BEGIN error-conv -->" packages/claude-plugin-cockpit/commands/` MUST report ≥ 6 results — the error-conv block established by [#378](https://github.com/generacy-ai/agency/issues/378) is present in every command file and this feature does not touch that invariant.
- `git diff --stat` on the resulting commit MUST show exactly one file modified: `packages/claude-plugin-cockpit/commands/review.md`. No other file in the repo is edited. In particular: `packages/claude-plugin-cockpit/README.md` is NOT touched by #384 (the § Available Commands cell that #382 updated to say "implementation-review PR diff" already covers the operator-visible description; no wording there changes because of the event value change on the approve path).

## §16 Semantic contract preservation (cross-references #382)

The following contracts established by [#382](https://github.com/generacy-ai/agency/issues/382) MUST remain intact:

1. **inline threads = actionable feedback; review-body text = information** — preserved. Step 6's approve-with-findings path posts `event: COMMENT` with body-only text and no `comments[]`; `PrFeedbackMonitorService` sees no thread; the semantic holds.
2. **Five verbatim `--gate` CLI tokens** — preserved. This feature does not touch the frontmatter or step 1.
3. **Byte-identical `<!-- BEGIN error-conv -->` block across `review.md` and `watch.md`** — preserved. This feature does not touch the error-conv block.
4. **`request-changes` posts `event: COMMENT` with per-finding inline threads** — preserved. Step 7 is unchanged.
5. **`generacy cockpit advance --gate <name>` runs on the approve path via Bash** — preserved. The CLI-advance bullet in step 6 is unchanged.

---

*Contract for /plan on issue [generacy-ai/agency#384](https://github.com/generacy-ai/agency/issues/384)*
