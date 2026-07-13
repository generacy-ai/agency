# Implementation Plan: Fix cockpit review approve path (422 on own PR) and enforce approval gate terminal check

**Feature**: Rewrite affected sections of `packages/claude-plugin-cockpit/commands/review.md` so (a) step 6's approval-with-findings sub-branch posts `event: COMMENT` (not `APPROVE`), eliminating the 422 on single-credential clusters; (b) a new `## Terminal Outcome Check` block wrapped in `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` fence markers fail-closes if none of the three text-emission outcome markers (`Labels:`, `Feedback posted:`, `Aborted:`) has been emitted, routing control back to step 5 only (unbounded); (c) step 8's `abort` branch emits a literal `Aborted:` line; and (d) step 3's instructions structurally forbid raw-JSON output from `/code-review`.
**Branch**: `384-found-during-cockpit-v1`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Two concurrent defects in `packages/claude-plugin-cockpit/commands/review.md`, surfaced on the first live post-#382 run (`/cockpit:review 2 --gate implementation-review` on `christrudelpw/sniplink`) of the cockpit v1 integration smoke test ([generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88), finding #16). Fixed as one bounded change against a single file because the fixes interlock through the same approval-path narrative.

1. **The approve path posts an APPROVE-event PR review — which GitHub forbids on one's own PR (Defect 1).** Step 6 (added by #382) POSTs `event: APPROVE` with a body listing non-blocking findings. Single-credential clusters — the primary Generacy deployment shape — hit the 422 "Can not approve your own pull request", the error-handling block fires, and the command exits WITHOUT advancing: approve-with-findings is structurally broken on exactly the clusters that exist today. **Fix**: post `event: COMMENT` with body-only text. `COMMENT`-event reviews are permitted on one's own PR, and with no `comments[]` they produce zero review threads, so `PrFeedbackMonitorService` stays quiet — the #382 Q2 semantic (inline threads = actionable; body = information) is preserved verbatim. GitHub's `APPROVE` semantics are meaningless on a self-PR anyway; the body text is the payload. Per Q3, the fix is uniform on all clusters — no cluster-shape detection branch — with an inline rationale comment travelling with the code (no follow-up tracking issue for a nonexistent multi-credential shape).

2. **The approval gate is skippable in practice (Defect 2).** The observed session ran step 3's `/code-review`, presented findings as raw JSON rather than the required summary table, and ended — never invoking step 5's `AskUserQuestion`, never advancing. The playbook text is correct but has no structural backstop against instruction decay after a long sub-invocation. **Fix**: add a terminal `## Terminal Outcome Check` block wrapped in fence markers (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`) following the existing `error-conv` convention (Q1). The block enumerates "exactly one of the following MUST have occurred", keyed to text-emission markers: `Labels:` (approve), `Feedback posted:` (request-changes), `Aborted:` (abort). Detection is text-emission-only — no `gh api` probes, no `generacy cockpit status` probes (Q2) — because each marker is emitted by its own step only after that step's real side effect succeeds, so verifying the emission verifies the outcome transitively. If none has been emitted, the check routes control back to step 5 only (re-invoke `AskUserQuestion`), unbounded (Q4): each iteration blocks on a human answer, so there is no runaway risk, and a cap would convert operator hesitation into a silent non-outcome — the same failure this fix exists to prevent.

**Interlock (raw-JSON regression at the source, Q5)**: Defect 2's observed instance surfaced as raw-JSON output from `/code-review` in step 3. A passive prose reminder inside the terminal check fires after the operator has already seen the JSON — the harm it prevents is already done, and self-introspection of prior session output ("read your own prior output and route back if it looked wrong") is exactly the English-state-machine meta-machinery this plugin family exists to avoid. The fix moves enforcement upstream: step 3's instructions are strengthened to state "MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else." The Terminal Outcome Check block includes a passive prose reminder that step-3 findings are rendered via the summary table, never as raw JSON — for the operator, not for self-introspection.

**Coupled edits (step 8 emits `Aborted:`, FR-005)**: Step 8 currently emits nothing on `abort` ("emit no `Labels:` line, mutate no state, post no PR review, and exit zero"). For the Terminal Outcome Check's abort branch to be detectable via text emission, step 8 gains the literal `Aborted:` line. Emission still occurs after the side effect (or rather, the deliberate absence of side effect) — the `Aborted:` line is printed on the abort path only, so its presence implies the abort outcome transitively, matching the marker-per-outcome invariant that lets FR-004 skip network probes.

**Ownership**: `packages/claude-plugin-cockpit/commands/review.md` only. No CLI edits, no changes to `PrFeedbackMonitorService`, no changes to any `waiting-for:*` label, no changes to any sibling `commands/*.md` file. Zero code changes — one Markdown file edited. The `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` block established by [#378](https://github.com/generacy-ai/agency/issues/378) is preserved byte-for-byte. Retroactively adopting the `## Terminal Outcome Check` block in `commands/clarify.md` (which has approval-shaped outcomes of its own) is a sensible follow-up per Q1, explicitly Out of Scope §1.

## Technical Context

**Language/Version**: Markdown (CommonMark) — Claude Code prompt commands are Markdown files consumed by the harness at command-invocation time. No JavaScript, TypeScript, or shell scripts change.

**Primary Dependencies**: None. This feature ships no runtime code.
- The `generacy` CLI (`@generacy-ai/generacy`) is invoked by `review.md`'s step 6 (`generacy cockpit advance --gate <name>`), unchanged from the current file; this feature does not modify that invocation.
- `gh` CLI is invoked from step 6's `implementation-review` sub-branch via the Bash tool to POST the review — the current file already uses `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews`. This feature changes the payload's `event` from `APPROVE` to `COMMENT` and updates the accompanying inline rationale comment; it does not add new dependencies.
- Claude Code's built-in `/code-review` slash command remains the sole documented cross-slash-command invocation (unchanged from the current `review.md` head-note). Step 3's strengthened instructions constrain how its output is rendered, not what it is invoked as.

**Storage**: None. The `gh api .../reviews` POST is a state-changing side effect on GitHub, not a local write.

**Testing**:
- **Local (deterministic)** — greps from repo root:
  1. `grep -n "event: APPROVE" packages/claude-plugin-cockpit/commands/review.md` MUST report 0 hits. The event value in step 6's payload description is now `COMMENT`; the substring `APPROVE` remains only inside the inline rationale comment (`self-APPROVE is forbidden by GitHub …`), which is prose, not a payload. FR-001, SC-001.
  2. `grep -c "event: COMMENT" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 — step 6's approve-with-findings sub-branch AND step 7's request-changes branch (unchanged). FR-001.
  3. `grep -c "self-APPROVE is forbidden by GitHub" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the inline rationale comment in step 6. FR-002.
  4. `grep -c "BEGIN terminal-check" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1, and `grep -c "END terminal-check" packages/claude-plugin-cockpit/commands/review.md` MUST report exactly 1. FR-003, SC-004.
  5. `grep -n "Aborted:" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 hits — once in step 8's emission instruction, once (at minimum) inside the Terminal Outcome Check block's enumeration. FR-005.
  6. `grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the strengthened step 3 instruction. FR-006.
  7. `grep -c "MUST NOT invoke \`gh api\`\\|MUST NOT invoke .gh api." packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 — the explicit prohibition inside the Terminal Outcome Check block matching FR-008. (The character-class variant tolerates whichever backtick/no-backtick form the final prose uses.)
  8. `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)` MUST return empty output — the byte-identical MISSING_BINARY / AUTH_FAILURE / OTHER block established in [#378](https://github.com/generacy-ai/agency/issues/378) is preserved. This feature MUST NOT touch that block.
  9. `grep -c "BEGIN terminal-check" packages/claude-plugin-cockpit/commands/` (or the equivalent grep -r) MUST report 1 — the block is new to `review.md` only in this PR; `clarify.md` retrofit is Out of Scope §1. SC-004.
- **Manual smoke test (US1, SC-001)** — re-run the tetrad-development#88 finding #16 scenario against `christrudelpw/sniplink`:
  1. On an `implementation-review` PR authored by the same single-credential account, run `/cockpit:review 2 --gate implementation-review`. Choose `approve` at step 5. Verify with `gh api repos/christrudelpw/sniplink/pulls/{n}/reviews` that (a) a review with `state: "COMMENTED"` was posted, (b) its `body` contains the non-blocking findings as text (one paragraph per finding), (c) no inline `pull_request_review_comments` were posted alongside (so `PrFeedbackMonitorService` sees no thread and applies no `waiting-for:address-pr-feedback`), (d) the CLI's `advance --gate implementation-review` ran and stdout printed the `Labels: waiting-for:implementation-review → completed:implementation-review` line — no 422, no error-handling detour.
- **Manual smoke test (US2, SC-002)** — force the missing-terminal-outcome path:
  1. Run `/cockpit:review 2 --gate implementation-review` on any epic with an open impl PR. When `AskUserQuestion` prompts at step 5, dismiss it without selecting an option. Verify: the Terminal Outcome Check block fires, prints its "none of the three markers observed" branch, and re-invokes step 5's `AskUserQuestion`. Repeat the dismissal three times to confirm unbounded loop-back per Q4 (no cap, no forced abort). Then select `abort`. Verify: step 8 emits a literal `Aborted:` line and exits zero; on the next check pass, the block sees `Aborted:` in the session output and does not loop.
- **Manual smoke test (US3, SC-003)** — verify step 3 does not print raw JSON:
  1. Run `/cockpit:review 2 --gate implementation-review` on an epic with a PR that `/code-review` will emit findings on. Inspect step 3's output before the `AskUserQuestion` prompt fires: the findings-summary table MUST be present; the raw JSON returned by `/code-review` MUST NOT appear in the printed output. If Claude does emit JSON, step 3's instruction should catch it and re-render as the table — verify the smoke session does not print the JSON at any point.
- **Error-handling parity spot-check (FR-008)** — force `AUTH_FAILURE` on the `gh api .../reviews` sub-invocation by exporting `GH_TOKEN=""` before running `/cockpit:review 2 --gate implementation-review` → `approve`. Emitted text MUST match `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim. This confirms both (a) the error-conv block is untouched by this feature, and (b) the `gh api` invocation with the new `COMMENT`-event payload participates in the same three-class classification (its non-zero exit + stderr matching `/auth|unauthorized|401|gh auth/i` falls into `AUTH_FAILURE`).
- **No unit tests to add**: prompt commands are not code; correctness is prompt-level and is verified by grep + manual replay.

**Target Platform**: The `@generacy-ai/claude-plugin-cockpit` npm package (shipped from `packages/claude-plugin-cockpit/`) and its consumers (Claude Code sessions). The package's `files` array already includes `commands/`, so the corrected `review.md` ships in the next preview publish automatically — no workflow or `package.json` edits needed.

**Project Type**: Documentation-only fix inside a publishable pnpm workspace package (Claude Code prompt-command plugin).

**Performance Goals**: N/A. The `gh api .../reviews` POST is still one HTTP round-trip per invocation on the `approve` path (unchanged from #382). The Terminal Outcome Check adds no CLI/HTTP calls per Q2/FR-008 — detection is text-emission-only.

**Constraints**:
- **Uniform `COMMENT`-event on all clusters, no plugin-side cluster-shape detection** (FR-001, Q3): the plugin does not branch on `single-credential vs multi-credential` and does not check whether the current `gh` credential authored the PR. Rationale for the choice travels with the code as an inline `<!-- ... -->` comment near the event value; no follow-up tracking issue is filed, because a tracking issue for a deployment shape that doesn't exist is a dead issue that surfaces on nobody's dashboard. If a multi-credential reviewer identity ever ships, the inline comment surfaces exactly when someone touches this line again.
- **Body-only on `approve` with non-blocking findings; the `PrFeedbackMonitorService` invariant is preserved verbatim from #382** (FR-001, spec Summary): the switch from `APPROVE` to `COMMENT` MUST NOT introduce any `comments[]` array. A `COMMENT`-event review with no `comments[]` produces no review thread, so `PrFeedbackMonitorService` sees no signal to trip on. The semantic contract "inline threads = actionable, monitored feedback; review-body text = information" is preserved byte-for-byte; only the `event` field changes.
- **Terminal Outcome Check is text-emission-only, no state probes** (FR-004, FR-008, Q2): the check MUST NOT call `gh api`, `generacy cockpit status`, `gh pr view`, or any other HTTP/CLI probe. Each of the three markers is emitted by its own step only after that step's real side effect succeeds (or, in the `Aborted:` case, only when the abort branch is taken), so verifying the emission verifies the outcome transitively. Adding a state probe would (a) charge every session a network round-trip, (b) false-positive on concurrent actors mutating GitHub state between the side effect and the probe, and (c) reintroduce failure modes the emission-only design deliberately eliminates.
- **Terminal Outcome Check loops back to step 5 only, unbounded, and MUST NOT re-invoke `/code-review`** (FR-004, FR-009, Q4): the check re-invokes step 5's `AskUserQuestion` — nothing before it, nothing after it. Re-running `/code-review` from step 3 would (i) re-execute the expensive sub-invocation that was the source of the instruction decay this check exists to catch, and (ii) require rebuilding the findings-summary table from scratch when it is already available in session context. The retry count is unbounded because each iteration blocks on a human answer at `AskUserQuestion`, so there is no runaway loop without an operator driving one. A cap (`abort after N misses`) would convert operator hesitation into a silent non-outcome — the same failure mode this fix exists to prevent, wearing a different hat.
- **Raw-JSON prevention is enforced at the point of behavior, not by post-hoc self-introspection** (FR-006, FR-007, Q5): step 3's instructions gain the sentence "MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else." The Terminal Outcome Check block MUST NOT read its own prior session output to detect raw-JSON regressions; that would be exactly the English-state-machine meta-machinery this plugin family exists to avoid, and would fire after the operator has already seen the JSON — the harm the check would prevent is already done. The check's mention of the table-not-JSON rule is passive prose for the operator (FR-007), not an active regression detector.
- **Fence marker naming follows the existing `error-conv` convention** (FR-003, Q1): the block is wrapped in `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` so it is greppable across command files with the same tool (`grep -r 'BEGIN terminal-check' packages/claude-plugin-cockpit/commands/`) that already surfaces `error-conv` blocks. The kebab-case suffix mirrors `error-conv`'s form; no other block naming convention is introduced.
- **Error-handling block unchanged** (spec Assumptions §5, Out of Scope §5 of #382): the byte-identical MISSING_BINARY / AUTH_FAILURE / OTHER block between `<!-- BEGIN error-conv -->` and `<!-- END error-conv -->` is preserved verbatim. `diff` between `review.md`'s error-conv block and `watch.md`'s error-conv block post-fix MUST remain empty. The new Terminal Outcome Check block is a separate fence, added after the `error-conv` block, not embedded within it.
- **`clarify.md` is not touched** (spec Out of Scope §1): retroactively adopting `## Terminal Outcome Check` in `commands/clarify.md` — which has approval-shaped outcomes of its own (Approve / Edit / Skip per drafted question) — is a sensible follow-up per Q1. It is explicitly out of scope for this PR because (a) `clarify.md`'s outcome shape is per-question, not per-command, so the marker set is different (`posted <k> answers; clarification gate advanced …` and `all answers were skipped; no comment posted` and status summaries), and it belongs in its own scoping conversation; (b) bundling would leak this feature's fix beyond the file that has the defect.

**Scale/Scope**: One file edited: `packages/claude-plugin-cockpit/commands/review.md`. No files added, no files removed, no other packages touched, no other `commands/*.md` edited. `git diff --stat` on the resulting commit MUST show exactly one file modified, under `packages/claude-plugin-cockpit/commands/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this change honors implicitly:

- **Scope discipline**: The change owns only `packages/claude-plugin-cockpit/commands/review.md`. `git diff --stat` on the resulting commit MUST show exactly one file modified.
- **Root-cause fix, not bandaid**: Both defects have direct root causes and direct fixes. Defect 1's root cause is that #382 chose an `event` value GitHub forbids on self-PRs; the fix is to pick the permitted value (`COMMENT`) with a body-only payload that preserves #382's semantic contract. Defect 2's root cause is that `review.md` had no structural backstop for the "operator reaches end of session without emitting an outcome" case; the fix adds the backstop as a fenced block at the file's end, with detection keyed to the same text-emission markers each outcome step already emits. Neither fix reaches into `PrFeedbackMonitorService`, the CLI, or a sibling command file — the scope stays inside the one file that has the defect.
- **Preserve load-bearing conventions**:
  - **[#378](https://github.com/generacy-ai/agency/issues/378) byte-identical error-conv invariant**: the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block in `review.md` is not touched. `diff` between the block in `review.md` and the block in `watch.md` post-fix MUST remain empty.
  - **[#380](https://github.com/generacy-ai/agency/issues/380) inline-verbatim convention**: no shared "outcome-check helper" or partial include is introduced. The Terminal Outcome Check block lives verbatim inside `review.md`; the marker list is spelled out in prose. Analogous to #380's inline-verbatim convention: prompt commands do not import; they inline.
  - **[#382](https://github.com/generacy-ai/agency/issues/382) semantic contract**: "inline threads = actionable, monitored feedback; review-body text = information" is preserved verbatim. The `event: COMMENT` on the approve path uses body-only text, no `comments[]`, so `PrFeedbackMonitorService` sees no thread to trip on. Only the `event` value changes.
- **One-issue-per-repo boundary**: The change lives entirely in `generacy-ai/agency`. No CLI, workflow-engine, or orchestrator edits. `clarify.md` retrofit lives in its own future issue per Out of Scope §1.
- **Emission-outcome coupling for the Terminal Outcome Check**: FR-004 relies on each marker being emitted only when its corresponding outcome has occurred. The spec's Assumptions §3 states this explicitly. The plan honors this by (a) requiring step 8 to emit `Aborted:` only on the abort branch (not, e.g., during error handling), (b) preserving step 6's `Labels: …` emission after CLI exit 0 only, (c) preserving step 7's `Feedback posted: N inline comment(s) on PR #<pull_number>` emission after `gh api` exit 0 only. Any future edit that decouples an emission from its side effect would silently break the check; a repo-level `grep -n "Aborted:\|Labels: waiting-for\|Feedback posted:" packages/claude-plugin-cockpit/commands/review.md` remains ≤ the count of steps that emit them.

**Result**: PASS. No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/384-found-during-cockpit-v1/
├── spec.md                            # Feature specification (read-only for /plan)
├── clarifications.md                  # Q1–Q5 answers (read-only for /plan)
├── plan.md                            # This file
├── research.md                        # Phase 0 — event value choice, terminal-check block shape,
│                                      #           detection contract, loop-back semantics, raw-JSON policy
├── quickstart.md                      # Phase 1 — the multi-section rewrite walkthrough + verification
├── contracts/
│   └── review-command.contract.md     # Exact byte-level strings the rewritten review.md must contain
├── checklists/                        # (empty; no /checklist run for this feature)
└── conversation-log.jsonl
```

No `data-model.md` — this feature introduces no runtime entities, types, or state. The only "data" is (a) prompt copy in one Markdown file, captured section-by-section in `contracts/review-command.contract.md`, and (b) the `gh api .../reviews` request payload, whose shape is defined by GitHub's REST API (`POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` — `event`, `body`, and — pointedly — the absence of `comments[]` on the approve path). The contract file documents the exact payload shape the plugin constructs; the API-side schema is GitHub's, not ours.

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
└── commands/
    └── review.md   # EDIT: step 3 — add "MUST NOT print raw JSON …" sentence (contract §5);
                    #        step 6 — change `event: APPROVE` to `event: COMMENT`, replace the existing
                    #                  inline rationale comment with the new self-APPROVE-forbidden
                    #                  wording (contract §6);
                    #        step 8 — add literal `Aborted:` line emission on abort (contract §7);
                    #        NEW after error-conv block — <!-- BEGIN terminal-check --> …
                    #                  <!-- END terminal-check --> fenced block (contract §9).
                    #        MISSING_BINARY / AUTH_FAILURE / OTHER (`<!-- BEGIN error-conv -->` … block) UNCHANGED.
                    #        Examples section — unchanged from #382; the fixes do not alter the operator-visible
                    #                  narratives in the examples (event value name inside the prose
                    #                  is updated wherever it is quoted verbatim in an example).
```

**Structure Decision**: The cockpit plugin is a Claude Code prompt-command package (Markdown-only, no `src/`, no build step). Prompt commands under `commands/` are the shipped surface. Editing `review.md` in place preserves the plugin's inline-verbatim convention (see [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 1, [#380](https://github.com/generacy-ai/agency/issues/380) plan §Structure Decision, and [#382](https://github.com/generacy-ai/agency/issues/382) plan §Structure Decision) and keeps the change reviewable as a one-file diff.

## Phase 0: Research

See [research.md](research.md). Summary of decisions:

- **Why `event: COMMENT` (not a conditional `APPROVE`/`COMMENT` branch) on the approve path (Q3, spec Summary §1)**: `APPROVE` is forbidden on one's own PR by GitHub; single-credential clusters are the only deployment shape that exists today; and `APPROVE` on a self-PR is semantically empty even where GitHub permits it. A cluster-shape detection branch would introduce a code path for a deployment shape that does not exist and would need to be verified for a hypothetical multi-credential future. A follow-up tracking issue for the same hypothetical shape is a dead issue that surfaces on nobody's dashboard. The inline rationale comment travels with the code and surfaces exactly when someone touches this line again.
- **Why the block is named `## Terminal Outcome Check` and wrapped in `terminal-check` fence markers (Q1)**: `clarify.md` in the same directory has no such block (the spec's original "mirror `clarify.md`" premise was wrong); the spec-kit `clarify.md` has a differently-shaped Post-Command Check that is a workflow-continuation hint, not a fail-closed terminal check. This is a new block for the cockpit plugin, so it gets a name that describes what it does — "Terminal Outcome Check" — and a fence-marker convention that matches the existing `error-conv` block for cross-file greppability. Retroactively adopting the same block in `clarify.md` is a sensible follow-up per Out of Scope §1.
- **Why detection is text-emission-only, no state probes (Q2)**: each marker (`Labels:`, `Feedback posted:`, `Aborted:`) is emitted by its own step only after that step's real side effect succeeds. Verifying the emission verifies the outcome transitively without a network round-trip. A state probe (`gh api`, `generacy cockpit status`) would charge every review session an HTTP call and false-positive on concurrent actors between the side effect and the probe. The emission approach requires only one additional emission (step 8's new `Aborted:` line — FR-005) to close the outcome-marker gap.
- **Why re-invoke step 5 only, unbounded, no `/code-review` re-run (Q4)**: each `AskUserQuestion` iteration blocks on a human answer, so there is no runaway risk. A retry cap would convert operator hesitation into a silent non-outcome — the failure mode this fix exists to prevent, wearing a different hat. Re-running `/code-review` from step 3 would (i) re-execute the expensive sub-invocation that was the source of the instruction decay this check exists to catch, and (ii) require rebuilding the findings-summary table from scratch when it is already in session context.
- **Why raw-JSON prevention is enforced upstream in step 3, not by the terminal check (Q5)**: the observed regression printed raw JSON *from* step 3, before the operator ever reached the terminal check. A passive prose reminder inside the terminal check fires after the operator has already seen the JSON. Self-introspection ("read your own prior session output and route back if step 3 looked wrong") is exactly the English-state-machine meta-machinery this plugin family exists to avoid. Strengthening step 3's instruction ("MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else") enforces at the point of behavior; the check's mention of the rule remains passive prose for the operator.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete.

Artifacts produced in this phase:

- **[contracts/review-command.contract.md](contracts/review-command.contract.md)** — the exact strings the rewritten `review.md` must contain in the sections this feature touches: step 3 raw-JSON-forbidden sentence (§5), step 6 `event: COMMENT` sub-branch with the new inline rationale comment (§6), step 8 `Aborted:` line emission (§7), and the new `## Terminal Outcome Check` fenced block (§9) with its three-outcome enumeration, marker list, no-network-probe prohibition, unbounded step-5-only re-invocation branch, and passive raw-JSON prose reminder. Sections not touched by this feature (frontmatter, H1 body, step 1, step 2, step 4, step 5, step 7, step 9, examples, `<!-- BEGIN error-conv -->` block) reference the #382 contract's byte-preservation notice.
- **[quickstart.md](quickstart.md)** — a copy-paste-ready walkthrough for a maintainer to apply the four edits and verify them before opening a PR. Written as a section-by-section replace-with checklist because the fix is prescriptive.

No `data-model.md` — see Project Structure §Documentation.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

*Empty — Constitution Check passed with no violations.*

---

*Generated by /plan for issue [generacy-ai/agency#384](https://github.com/generacy-ai/agency/issues/384)*
