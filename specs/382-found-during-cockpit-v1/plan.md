# Implementation Plan: Align cockpit `review`/`watch` playbooks with CLI gate vocabulary and the `PrFeedbackMonitor` flow

**Feature**: Rewrite `packages/claude-plugin-cockpit/commands/review.md` and `commands/watch.md` so (a) `--gate` accepts exactly the five CLI review tokens verbatim (`spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`); (b) `request-changes` posts a `COMMENT`-event PR review with one inline anchored comment per `/code-review` finding, driving the existing `PrFeedbackMonitorService` flow; and (c) the suggested-decision rule for non-blocking-only findings is `approve` (findings surfaced in the approval-review body), not `request-changes`.
**Branch**: `382-found-during-cockpit-v1`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Three concurrent bugs in `commands/review.md` and `commands/watch.md`, all surfaced by the first live `/cockpit:review --gate impl` run in the cockpit v1 smoke test ([generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88), findings #12–14). Fixed as one bounded change because they share the same file set and their fixes interlock:

1. **Gate-token misalignment (finding #12).** `review.md`'s frontmatter and body accept the shorthand `impl`; its own `waiting-for:<gate>-review → --gate <gate>` mapping row implies the token is `implementation`; and `watch.md` emitted both `impl` and `implementation` in one session. The CLI (`generacy cockpit advance`) requires `implementation-review` verbatim. Fix: use the CLI's tokens byte-for-byte in every markdown surface. Per clarification Q1, `--gate` accepts exactly five values: `spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`. Everything else — including `clarification` (which is `/cockpit:clarify`'s job), `manual-validation`, `children-complete`, `epic-approval` — prints usage listing the five, with a single special case in the usage text: `clarification → use /cockpit:clarify`.

2. **`request-changes` silent no-op (finding #13).** Current step 7 says "on `request-changes`, emit no `Labels:` line, mutate no state, exit zero" — the reviewer's findings never reach the worker. The observed workaround (a top-level PR comment) is invisible to `PrFeedbackMonitorService`, which triggers only on unresolved review *threads*. Fix: on `request-changes`, POST a `event: COMMENT` PR review via `gh api repos/{owner}/{repo}/pulls/{n}/reviews` with (a) a top-level `body` of one summary line (`N finding(s) requiring changes; see inline comments.`) per clarification Q3, and (b) one inline `comments[]` entry per finding, `path`- and `line`-anchored from `/code-review`'s existing anchors. `event: COMMENT` reviews are permitted on one's own PR — only `APPROVE` / `REQUEST_CHANGES` are blocked — so this works on the single-credential Generacy cluster. Unresolved threads trip the existing `PrFeedbackMonitorService`, which applies `waiting-for:address-pr-feedback` and enqueues fix work. No new label, no protocol change: the thread-based signal is the existing contract this fix connects to.

3. **Suggested-decision derivation makes every finding blocking (finding #14).** Current step 3 says "any blockers → request-changes; non-blocking findings only → request-changes; no findings → approve" — the middle branch contradicts the blocking/non-blocking distinction. Fix: non-blocking findings only → `approve`, with findings surfaced in the approval-review body (not as inline threads — see interlock below). Per clarification Q4, `/code-review` findings do not carry a stable machine-readable blocking marker, so Claude classifies each finding by judgment at review time (correctness / security / data-integrity failure scenarios ⇒ blocking; style / simplification / nit ⇒ non-blocking) and MUST show the per-finding classification in the summary table it presents at the `AskUserQuestion` gate. Assist-mode: Claude drafts, human decides.

**Interlock**: fixes 2 and 3 constrain each other. Clarification Q2 pins the mechanism: non-blocking findings on `approve` are surfaced in the *approval-review body only*, never as inline COMMENT threads. Inline threads are precisely what `PrFeedbackMonitorService` watches, so posting them alongside an approval would trip the monitor into applying `waiting-for:address-pr-feedback` and enqueuing fix work on the PR we just approved — the machinery racing the merge. The semantic this establishes across the plugin: inline threads = actionable, monitored feedback; review-body text = information.

**Ownership**: `packages/claude-plugin-cockpit/{commands/review.md, commands/watch.md, README.md}`. The rev 3 catalog's `--gate impl` shorthand (origin of vocabulary #1) is corrected in `tetrad-development`'s plan doc separately (Out of Scope §1). No CLI edits, no changes to `PrFeedbackMonitorService`, no changes to the `waiting-for:address-pr-feedback` label. Zero code changes — three Markdown files edited.

## Technical Context

**Language/Version**: Markdown (CommonMark) — Claude Code prompt commands are Markdown files consumed by the harness at command-invocation time. No JavaScript, TypeScript, or shell scripts change.
**Primary Dependencies**: None. This feature ships no runtime code.
- The `generacy` CLI (`@generacy-ai/generacy`) is a *subject* of the invocation string, not a dependency of this change. Its gate vocabulary — derived from `WORKFLOW_LABELS` in `@generacy-ai/workflow-engine` via `packages/generacy/src/cli/commands/cockpit/gate-vocabulary.ts` — is the source of truth the plugin conforms to. Any change to the CLI itself is Out of Scope §1.
- `gh` CLI is invoked from step 7 of the rewritten `review.md` via the Bash tool to POST the `event: COMMENT` review; the `gh api` sub-command is authenticated by the same `gh auth login` the plugin already requires (see `README.md § Error Handling / AUTH_FAILURE`).
- Claude Code's built-in `/code-review` slash command remains the sole documented cross-slash-command invocation (unchanged from the current `review.md` head-note).
**Storage**: None. The `gh api .../reviews` POST is a state-changing side effect on GitHub, not a local write.
**Testing**:
- **Local (deterministic)** — greps from repo root:
  1. `grep -n "impl" packages/claude-plugin-cockpit/commands/review.md packages/claude-plugin-cockpit/commands/watch.md` MUST show ZERO hits of the bare token `impl` used as a gate value (word-boundary check needed — the word "implementation" contains no `impl` substring at a word boundary; the word "implicit" would false-positive but is not expected in either file). See quickstart §V4 for the precise word-boundary check. FR-001, FR-002.
  2. `grep -c "implementation-review\|spec-review\|clarification-review\|plan-review\|tasks-review" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 6 (each of five tokens in the usage-line enumeration, and `implementation-review` again in the `--gate impl` branch narrative that is being renamed). FR-002.
  3. `grep -c "event: COMMENT\|gh api repos" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 2 — the `event: COMMENT` string in step 7's payload description AND the `gh api repos/{owner}/{repo}/pulls/{n}/reviews` invocation string. FR-004.
  4. `grep -c "waiting-for:address-pr-feedback" packages/claude-plugin-cockpit/commands/review.md` MUST report ≥ 1 in step 7's rationale note (documenting the intent that the COMMENT-event review's unresolved threads trip the existing `PrFeedbackMonitorService` handler). FR-004.
  5. `grep -n "waiting-for:spec-review\|waiting-for:clarification-review\|waiting-for:plan-review\|waiting-for:tasks-review\|waiting-for:implementation-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report exactly five distinct rows in the mapping table, plus the unchanged `waiting-for:clarification` row (Q5). FR-005.
  6. `diff <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/review.md) <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/watch.md)` MUST return empty output — the byte-identical MISSING_BINARY / AUTH_FAILURE / OTHER block established in [#378](https://github.com/generacy-ai/agency/issues/378) is preserved across both files.
- **Manual smoke test (US1, US2, US3, SC-001..SC-003)** — replay [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) findings #12–14 against `christrudelpw/sniplink` or a comparable epic with an open impl PR:
  1. `/cockpit:review --gate implementation-review` on the PR: `/code-review` runs, findings are presented in an `AskUserQuestion`-visible table with a per-finding `Blocking? Yes|No` column, and a `Suggested decision:` line follows the observed classifications (all No → `approve`; any Yes → `request-changes`). No `impl` shorthand anywhere in the printed output.
  2. Select `request-changes` on a PR with two contrived findings (one blocking-classified, one non-blocking-classified per the on-screen table). Verify with `gh api repos/christrudelpw/sniplink/pulls/{n}/reviews` that a new review was posted with `state: "COMMENTED"`, a top-level body of `2 finding(s) requiring changes; see inline comments.`, and two `pull_request_review_comments` anchored to the file:line pairs from `/code-review`. Verify with the orchestrator that `waiting-for:address-pr-feedback` is applied within one `PrFeedbackMonitorService` poll cycle.
  3. Select `approve` on a PR with two non-blocking-only findings. Verify with `gh api .../reviews` that (a) an APPROVE-event review was posted, (b) its body contains the two non-blocking findings as text (Q2: body-only, not inline), (c) NO inline `pull_request_review_comments` were posted alongside, (d) the CLI's `advance --gate implementation-review` ran and stdout printed the `Labels: waiting-for:implementation-review → completed:implementation-review` line.
  4. Run `/cockpit:review --gate impl` (the old shorthand). Verify: usage line lists the five verbatim tokens (no `impl` among them), the `clarification → use /cockpit:clarify` special-case line appears, exit non-zero, no `/code-review` invocation.
- **Manual smoke test — watch mapping (US4, SC-004)** — from a `/cockpit:watch <epic-ref>` session on the same epic:
  1. Trigger a transition to `waiting-for:implementation-review` on a child issue. Expected suggestion line: `… · suggested: /cockpit:review --gate implementation-review`. No `impl` shorthand.
  2. Trigger `waiting-for:clarification`. Expected suggestion: `… · suggested: /cockpit:clarify` (unchanged).
  3. Trigger `waiting-for:manual-validation`. Expected: notification line printed WITHOUT the ` · suggested: …` segment (Q5: no v1 row for `manual-validation`).
- **Error-handling parity spot-check (FR-008)** — force `MISSING_BINARY` by temporarily removing `generacy` from `$PATH`; force `AUTH_FAILURE` on the `gh api .../reviews` sub-invocation by exporting `GH_TOKEN=""` before running `/cockpit:review --gate implementation-review` → `request-changes`. Emitted text MUST match `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim. This confirms both (a) the error-conv block is untouched, and (b) the new `gh api` invocation participates in the same three-class classification (its non-zero exit + stderr matching `/auth|unauthorized|401|gh auth/i` falls into `AUTH_FAILURE`).
- **No unit tests to add**: prompt commands are not code; correctness is prompt-level and is verified by grep + manual replay.

**Target Platform**: The `@generacy-ai/claude-plugin-cockpit` npm package (shipped from `packages/claude-plugin-cockpit/`) and its consumers (Claude Code sessions). The package's `files` array already includes `commands/`, so the corrected `review.md` and `watch.md` ship in the next preview publish automatically — no workflow or `package.json` edits needed.

**Project Type**: Documentation-only fix inside a publishable pnpm workspace package (Claude Code prompt-command plugin).

**Performance Goals**: N/A. The added `gh api .../reviews` POST is one HTTP round-trip per `request-changes` invocation; this replaces a silent no-op and does not affect the `approve` path.

**Constraints**:
- **CLI vocabulary verbatim, no plugin-side aliasing** (FR-001, FR-002, clarification Q1): the plugin does not translate `impl → implementation-review`, `plan → plan-review`, etc. The five accepted `--gate` values are the CLI's own tokens — `spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review` — used verbatim in the frontmatter, the usage-line gate, every example, and every mapping-row lookup in `watch.md`. If a short alias is wanted in the future, it belongs in the CLI (`gate-vocabulary.ts`), not in the markdown.
- **`request-changes` uses `event: COMMENT`, not `REQUEST_CHANGES`** (FR-004, spec Summary §2): the observed constraint is that GitHub blocks `APPROVE` and `REQUEST_CHANGES` on one's own PR but permits `COMMENT`-event reviews. The Generacy cluster uses one credential for both the coder and the reviewer, so `REQUEST_CHANGES` would fail with 422 on every non-blocking finding. `COMMENT`-event reviews with unresolved threads produce the same downstream signal (`PrFeedbackMonitorService` → `waiting-for:address-pr-feedback`), so no new label or protocol is needed.
- **On `approve` with non-blocking findings, use body-only, never inline threads** (FR-006, clarification Q2): this is a semantic invariant, not a stylistic preference. The plugin's contract with `PrFeedbackMonitorService` is "inline threads = actionable feedback that gates the PR"; posting inline threads on `approve` would enqueue fix work on a PR we just approved. Body-only preserves the semantic. This constraint is duplicated as an inline `<!-- ... -->` note in `review.md` step 6 so future readers do not "improve" it into inline threads.
- **Classification is Claude's judgment, shown per-finding at the gate** (FR-006, clarification Q4): `/code-review` emits severity-ranked findings with failure scenarios but no stable machine-readable blocking marker; parsing a header (option A in Q4) or a per-line marker (option B) is not guaranteed by `/code-review`'s output contract. Claude classifies each finding at review time (correctness/security/data-integrity ⇒ blocking; style/simplification/nit ⇒ non-blocking) AND MUST render the per-finding classification in the summary table presented at the `AskUserQuestion` gate so the operator can override before advancing. Assist-mode: draft-then-approve.
- **`watch.md` mapping uses five explicit review rows, not a substitution pattern** (FR-005, clarification Q5): one row per token — `waiting-for:spec-review → /cockpit:review --gate spec-review` etc. A substitution-pattern row like `waiting-for:<X> → /cockpit:review --gate <X>` is a mini parsing DSL embedded in markdown — precisely the English-state-machine smell that this rewrite exists to eliminate — and it breaks anyway on tokens whose "root" isn't a single word. Five lines are greppable, diffable, and wrong-proof. `waiting-for:clarification → /cockpit:clarify` is preserved unchanged (the answering gate is `/cockpit:clarify`, not `--gate clarification`).
- **`manual-validation`, `children-complete`, `epic-approval` get no `--gate` acceptance and no watch-suggestion row in v1** (Q1, Q5): `manual-validation` is a human exercising the deployed environment; `children-complete` / `epic-approval` are epic-lifecycle gates. Neither has artifact-or-PR review semantics. If either grows a verb later, it belongs in a new numbered issue with its own clarifications.
- **Error-handling blocks unchanged** (FR-008, Out of Scope §5): the byte-identical MISSING_BINARY / AUTH_FAILURE / OTHER block established across seven files by [#378](https://github.com/generacy-ai/agency/issues/378) is preserved in both `review.md` and `watch.md`. The Canonical-source-of-truth marker line remains the sole `packages/claude-plugin-cockpit/README.md § Error Handling`.
- **README's command description gets one word-level edit** (FR-007, Out of Scope §5): the row for `/cockpit:review` in `README.md § Available Commands` says `impl PR diff` today; it becomes `implementation-review PR diff` (or the equivalent phrasing that names the actual gate token). No other README section is touched — the § Error Handling section in particular is untouched.

**Scale/Scope**: Three files edited: `packages/claude-plugin-cockpit/commands/review.md`, `packages/claude-plugin-cockpit/commands/watch.md`, and `packages/claude-plugin-cockpit/README.md`. No files added, no files removed, no sibling `commands/*.md` edited, no other packages touched. `git diff --stat` on the resulting commit MUST show exactly three files modified, all under `packages/claude-plugin-cockpit/`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this change honors implicitly:

- **Scope discipline**: The change owns only `packages/claude-plugin-cockpit/commands/{review,watch}.md` and `packages/claude-plugin-cockpit/README.md § Available Commands` (one-cell edit). `git diff --stat` on the resulting commit MUST show exactly three files modified.
- **Root-cause fix, not bandaid**: The three findings share a single underlying cause — the plugin's markdown vocabulary diverged from the CLI's canonical labels, and the `request-changes` path was designed without knowledge of `PrFeedbackMonitorService`'s trigger semantics. The plan fixes both root causes directly (CLI vocabulary → verbatim; `request-changes` → post a review that trips the existing monitor). It does not add a plugin-side alias map, does not introduce a new `waiting-for:*` label, and does not touch `PrFeedbackMonitorService`. Each of those would be a workaround.
- **Preserve load-bearing conventions**:
  - **[#378](https://github.com/generacy-ai/agency/issues/378) byte-identical error-conv invariant**: the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block in both `review.md` and `watch.md` is not touched. `diff` between the two blocks post-fix MUST remain empty.
  - **[#380](https://github.com/generacy-ai/agency/issues/380) inline-verbatim convention**: no shared "gate vocabulary helper" is introduced. Each command file lists the five tokens directly. Analogous to #380's inline-verbatim convention: prompt commands do not import; they inline.
- **One-issue-per-repo boundary**: The rev 3 catalog fix (origin of vocabulary bug #1) lives in `generacy-ai/tetrad-development` and is Out of Scope §1. This feature ships the plugin-side text fix only.
- **PR-side semantics honor `PrFeedbackMonitorService`'s existing contract**: the fix connects to the existing `waiting-for:address-pr-feedback` flow by posting review-thread signals the monitor is already looking for. It does not modify the monitor, its polling cadence, or its label transitions. Any monitor-side change would be a separate spec (`generacy-ai/generacy` scope) and is Out of Scope §1.

**Result**: PASS. No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/382-found-during-cockpit-v1/
├── spec.md                            # Feature specification (read-only for /plan)
├── clarifications.md                  # Q1–Q5 answers (read-only for /plan)
├── plan.md                            # This file
├── research.md                        # Phase 0 — vocabulary, COMMENT-review mechanism, classification policy,
│                                      #           approve-body-vs-thread interlock, watch-mapping style
├── quickstart.md                      # Phase 1 — the multi-section rewrite walkthrough + verification
├── contracts/
│   ├── review-command.contract.md     # Exact byte-level strings the rewritten review.md must contain
│   └── watch-command.contract.md      # Exact byte-level strings for watch.md's mapping table
├── checklists/                        # (empty; no /checklist run for this feature)
└── conversation-log.jsonl
```

No `data-model.md` — this feature introduces no runtime entities, types, or state. The only "data" is (a) prompt copy in three Markdown files, captured section-by-section in `contracts/*.contract.md`, and (b) the `gh api .../reviews` request payload, whose shape is defined by GitHub's REST API (`POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` — `event`, `body`, and `comments[]` with `path` + `line` + `body`). The contract file for `review.md` documents the exact payload the plugin constructs; the API-side schema is GitHub's, not ours.

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── review.md   # EDIT: frontmatter --gate values (5 verbatim tokens); step 1 usage line;
│   │               #        step 3 --gate impl branch renamed to --gate implementation-review;
│   │               #        step 3 Suggested-decision rule rewritten (non-blocking-only → approve);
│   │               #        step 3 findings table with per-finding Blocking? column added;
│   │               #        step 6 approve-body wording for non-blocking findings;
│   │               #        step 7 request-changes branch rewritten to POST event: COMMENT review;
│   │               #        Examples section rewritten to use `implementation-review` verbatim.
│   │               #        MISSING_BINARY / AUTH_FAILURE / OTHER block UNCHANGED.
│   └── watch.md    # EDIT: mapping table — replace `waiting-for:<gate>-review → /cockpit:review --gate <gate>`
│                   #        with five explicit rows, one per review token; keep the `waiting-for:clarification`
│                   #        row unchanged; keep the `completed:validate` and error-state rows unchanged.
│                   #        MISSING_BINARY / AUTH_FAILURE / OTHER block UNCHANGED.
└── README.md       # EDIT: § Available Commands — the row for `/cockpit:review` changes `impl PR diff` to
                    #        `implementation-review PR diff` (or the exact phrasing named in the contract).
                    #        § Error Handling UNCHANGED (canonical source of truth).
```

**Structure Decision**: The cockpit plugin is a Claude Code prompt-command package (Markdown-only, no `src/`, no build step). Prompt commands under `commands/` are the shipped surface. Rewriting `review.md` and `watch.md` in place preserves the plugin's inline-verbatim convention (see [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 1 and [#380](https://github.com/generacy-ai/agency/issues/380) plan §Structure Decision) and keeps the change reviewable as a three-file diff.

## Phase 0: Research

See [research.md](research.md). Summary of decisions:

- **Why five verbatim CLI tokens for `--gate`, not a plugin-side alias table (option A over C in Q1)**: any translation layer (`impl → implementation-review`) creates a second vocabulary that must stay in sync with the CLI's `WORKFLOW_LABELS`. The CLI's `gate-vocabulary.ts` is already the single source of truth for `--help-gates`; the plugin's markdown must mirror it. Clarification Q1.
- **Why `clarification`, `manual-validation`, `children-complete`, `epic-approval` are *rejected* by `--gate`, not passed through**: three of these have no artifact-or-PR review semantics; `clarification` is served by a different verb (`/cockpit:clarify`). Accepting them and letting the CLI reject (option C in Q1) leaks a confusing "sometimes it works, sometimes it errors" surface to the user; explicit rejection with a Usage line naming the five accepted tokens plus the `clarification → use /cockpit:clarify` special case is a smaller cognitive load. Q1.
- **Why `event: COMMENT` (not `REQUEST_CHANGES`) on `request-changes`**: GitHub blocks `APPROVE` and `REQUEST_CHANGES` reviews on one's own PR; the Generacy cluster uses a single credential for both coder and reviewer. `COMMENT` is permitted, and its unresolved threads produce the same `PrFeedbackMonitorService` signal (via `waiting-for:address-pr-feedback`), so no new label or protocol is needed. Spec Summary §2.
- **Why classification is Claude's judgment, not a parser (option E over A/B/C in Q4)**: `/code-review`'s output does not carry a stable machine-readable blocking marker. Parsing a header (A) or a per-finding severity marker (B) requires guarantees `/code-review` does not currently provide; a keyword heuristic (C) is fragile. Judgment is acceptable because the classification only *feeds a suggestion* — the human approves or overrides at the `AskUserQuestion` gate, and the per-finding classification is rendered in the summary table so the operator sees the reasoning. Q4.
- **Why body-only on `approve` with non-blocking findings (option A over B/C in Q2)**: inline COMMENT-review threads are exactly what `PrFeedbackMonitorService` watches. Posting them on `approve` would trip the monitor into applying `waiting-for:address-pr-feedback` and enqueuing fix work on the PR we just approved — the machinery racing the merge. Body-only preserves the semantic "inline threads = actionable feedback; body text = information." Q2.
- **Why five explicit `watch.md` rows, not a substitution pattern (option A over B in Q5)**: substitution-pattern rows are a mini parsing DSL embedded in markdown — the same English-state-machine smell this rewrite is fixing — and they break on tokens whose "root" isn't a single word (`clarification-review` cannot be spelled as `waiting-for:clarification-review` under a pattern rooted at `clarification`). Five lines cost five lines and are greppable/diffable/wrong-proof. Q5.
- **Why one PR against three files, not three PRs**: the three findings share a single vocabulary that must be updated atomically. Splitting would leave `review.md`, `watch.md`, and `README.md` transiently out of sync, and a `watch → review` handoff mid-split would suggest a gate value the just-shipped `review.md` doesn't accept. Bundling is the smaller review surface.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete.

Artifacts produced in this phase:

- **[contracts/review-command.contract.md](contracts/review-command.contract.md)** — the exact strings the rewritten `review.md` must contain, section by section: frontmatter `arguments` (`--gate` `<name>` description enumerating the five tokens), step 1 usage-line gate + `clarification → /cockpit:clarify` special-case line, step 3 `--gate implementation-review` branch narrative, step 3 findings-summary table shape (`| Finding | File:line | Blocking? |`), step 3 Suggested-decision derivation rules (blockers → request-changes; non-blocking-only → approve; none → approve), step 6 approve-body wording for non-blocking findings, step 7 `request-changes` `gh api .../reviews` payload description (event, body, comments[]), Examples section using `--gate implementation-review` verbatim, error-handling block byte-preservation notice.
- **[contracts/watch-command.contract.md](contracts/watch-command.contract.md)** — the exact mapping-table rows: five explicit `waiting-for:<review-token> → /cockpit:review --gate <review-token>` rows, the unchanged `waiting-for:clarification → /cockpit:clarify` row, the unchanged `completed:validate` row, the unchanged error-state row. No `manual-validation` row (Q5), no substitution-pattern row.
- **[quickstart.md](quickstart.md)** — a copy-paste-ready walkthrough for a maintainer to apply the multi-section rewrites and verify them before opening a PR. Written as a section-by-section replace-with checklist because the fix is prescriptive.

No `data-model.md` — see Project Structure §Documentation.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

*Empty — Constitution Check passed with no violations.*

---

*Generated by /plan for issue [generacy-ai/agency#382](https://github.com/generacy-ai/agency/issues/382)*
