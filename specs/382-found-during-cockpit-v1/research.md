# Phase 0 Research: Align cockpit review/watch playbooks with CLI gate vocabulary and the `PrFeedbackMonitor` flow

**Feature**: 382-found-during-cockpit-v1
**Status**: Complete
**Scope**: This is a prompt-copy fix in three Markdown files (`review.md`, `watch.md`, `README.md § Available Commands` cell). Research is scoped to (a) which `--gate` values the plugin accepts and how it rejects the rest, (b) the mechanism by which `request-changes` delivers findings to the worker, (c) how blocking/non-blocking findings are classified without a machine-readable marker, (d) the interlock between the `approve` path's findings-delivery mechanism and `PrFeedbackMonitorService`'s trigger, (e) the mapping-table shape in `watch.md`, and (f) why the change is bundled across three files.

## Decision 1 — `--gate` accepts exactly five CLI review tokens verbatim; everything else is rejected with a Usage line that also names `clarification → /cockpit:clarify`

**Decision**: The rewritten `review.md` frontmatter enumerates `--gate <name>` as `<name>` ∈ `{ spec-review, clarification-review, plan-review, tasks-review, implementation-review }`. Step 1's parse-arguments block emits, on any other value:

```text
Usage: /cockpit:review --gate <spec-review|clarification-review|plan-review|tasks-review|implementation-review>
For `clarification`, use `/cockpit:clarify` — the answering gate is a different verb.
```

and exits non-zero without reading any file or calling any CLI.

**Rationale**:
- The CLI's `--help-gates` derives gate names from label pairs in `WORKFLOW_LABELS` (see `/workspaces/generacy/packages/generacy/src/cli/commands/cockpit/gate-vocabulary.ts:22-42`). The nine tokens it emits — `spec-review`, `clarification`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`, `manual-validation`, `children-complete`, `epic-approval` — cover more than review-verb semantics. Five of them are artifact-or-PR review gates that the `/cockpit:review` verb serves; the other four are not.
- `clarification` is the *answering* gate (the epic is waiting for the operator to answer a clarification question); the reviewing verb for that gate's *output* is `clarification-review`. Accepting `--gate clarification` at `/cockpit:review` would collapse the two verbs and duplicate `/cockpit:clarify`'s scope. The Usage line's `clarification → /cockpit:clarify` sub-line is a targeted redirect for the one substitution likely to happen ("I meant clarification-*review*").
- `manual-validation` is a human exercising the deployed environment — no artifact review, no PR diff. `/cockpit:review` has no verb for it in v1.
- `children-complete` and `epic-approval` are epic-lifecycle gates driven by the CLI's own state machine, not by an operator running a review.
- Naming the five accepted tokens verbatim in the frontmatter, the usage line, every example, and every mapping-row lookup means the vocabulary lives in exactly one place (the CLI) and is copied byte-for-byte where the plugin needs to reference it. If a short alias is wanted, it belongs in the CLI (`gate-vocabulary.ts`), not in the markdown — the plugin then inherits it automatically.

**Alternatives considered**:
- **Option B (Q1): five tokens + `manual-validation`**. Rejected because `manual-validation` has no review semantics — the reviewer is not reviewing an artifact or a diff, they are exercising a deployed environment. Adding it to `/cockpit:review` would either (a) branch to a third code path (`--gate manual-validation` → do what?) or (b) accept the token and no-op, which is exactly the "silent no-op" bug this rewrite fixes elsewhere. If manual validation grows a verb later, it belongs in a new numbered issue.
- **Option C (Q1): accept every token `--help-gates` emits, let the CLI reject the ones it doesn't support**. Rejected because it leaks a confusing "sometimes works, sometimes errors" surface to the user. Silent-until-CLI-fails is worse than explicit-with-known-list. Also, the CLI's rejection would surface as an OTHER-class error message ("unknown gate"), which reads as a CLI defect rather than a user-input mistake.
- **Plugin-side alias map (`impl → implementation-review`, `plan → plan-review`, …)**. Rejected — it creates a second vocabulary that must stay in sync with `WORKFLOW_LABELS`. Every time the CLI adds or renames a gate, two files change. Same "drift site" argument that killed plugin-side `epic-ref` parsing in [#380](https://github.com/generacy-ai/agency/issues/380) Decision 3.

**References**:
- Clarifications Q1 (2026-07-07).
- CLI gate source: `/workspaces/generacy/packages/generacy/src/cli/commands/cockpit/gate-vocabulary.ts:22-42`.
- CLI `--help-gates` option: `/workspaces/generacy/packages/generacy/src/cli/commands/cockpit/advance.ts:51`.
- Spec Summary §1, FR-001, FR-002.

## Decision 2 — `request-changes` posts a `event: COMMENT` PR review with per-finding inline comments; top-level body is one summary line

**Decision**: Step 7's `request-changes` branch runs, from the repository root:

```bash
gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews \
  -X POST \
  -f event=COMMENT \
  -f body='N finding(s) requiring changes; see inline comments.' \
  -f comments[…]  # one entry per finding, each { path, line, body }
```

with `N` interpolated to the actual finding count and one `comments[]` entry per `/code-review` finding. Each comment's `path` and `line` are the anchors `/code-review` already produces; the comment `body` is the finding text.

**Rationale**:
- **Why `event: COMMENT`, not `event: REQUEST_CHANGES`**: GitHub blocks `APPROVE` and `REQUEST_CHANGES` reviews on one's own PR (only the `COMMENT` event is permitted). The Generacy cluster runs the coder and the reviewer under a single credential, so `REQUEST_CHANGES` would 422 on every non-blocking finding. Empirically this constraint drives the whole downstream flow: the plugin has to use `COMMENT` and rely on the *unresolved thread* signal, not the review event, to gate the PR.
- **Why this triggers the existing `waiting-for:address-pr-feedback` flow**: `PrFeedbackMonitorService` polls PRs for unresolved review threads. `COMMENT`-event reviews with `pull_request_review_comments` create such threads. On detection, the monitor applies `waiting-for:address-pr-feedback` and enqueues fix work — which is exactly the outcome the reviewer wants when selecting `request-changes`. No new label, no protocol change: the plugin connects to an existing handler by producing the signal it already watches for.
- **Why a top-level `body` summary line (Q3 option B) rather than empty (A) or a full recap (C)**: Empty body is hostile to humans scanning the PR conversation view — they see `N inline comments` on a hover but no reason for the review. Full recap duplicates every inline comment into a second surface that can drift from it (edit an inline comment, forget the body). The one-line summary `N finding(s) requiring changes; see inline comments.` gives the human enough to decide whether to open the review while keeping every actual finding on the surface it lives on (the anchored inline thread).
- **Why the `top-level PR comment` workaround the smoke-test session improvised does not work**: `PrFeedbackMonitorService` triggers on unresolved *review threads*, not on top-level issue comments. A top-level `gh pr comment` produces no review thread, so the monitor sees nothing, `waiting-for:address-pr-feedback` is never applied, and the worker never sees the feedback. The observed behavior in tetrad-development#88 finding #13 was exactly this: the session agent posted a top-level comment, and the epic sat in `waiting-for:implementation-review` indefinitely.
- **Why anchoring at `path` + `line` (not `path` + `line` + `side` + `start_line`)**: `/code-review`'s existing anchors are single-line file:line pairs. GitHub's `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` accepts `comments[].path` + `comments[].line` (the line the comment is anchored to in the PR head SHA's version of the file); `side` defaults to `RIGHT` (the head side) which is correct for review findings on new/modified code. Multi-line ranges would require `start_line` + `line`; single-line is sufficient for what `/code-review` produces today.

**Alternatives considered**:
- **Introduce a new label `changes-requested` and have the CLI drive `waiting-for:address-pr-feedback` from it**. Rejected explicitly in spec Summary §2: the thread-based signal already exists, already drives the whole downstream handler, and does not require a CLI-side change. Adding a label would (a) require CLI + workflow-engine edits (Out of Scope §1), (b) duplicate the existing signal, and (c) still leave the plugin needing to *also* post the review-body-or-inline content the operator wants the worker to see.
- **Post the findings as one big `pull_request_review_comment` on the first changed file**. Rejected because `/code-review`'s findings are per-file:line-anchored — collapsing them loses the anchoring, which is precisely the signal `PrFeedbackMonitorService`'s thread-based trigger uses.
- **Post the review body only, no inline comments**. Rejected because a `COMMENT`-event review with no `comments[]` produces no thread. The monitor would still not see the signal.

**References**:
- GitHub REST reference: `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` (event, body, comments[] with path/line/body).
- `PrFeedbackMonitorService` source: `/workspaces/generacy/packages/orchestrator/src/services/pr-feedback-monitor-service.ts`.
- Spec Summary §2.
- Clarification Q3 (2026-07-07).

## Decision 3 — Blocking / non-blocking classification is Claude's judgment at review time; the summary table at the `AskUserQuestion` gate shows it per-finding

**Decision**: The rewritten step 3 (a) instructs Claude to classify each `/code-review` finding by judgment — correctness / security / data-integrity failure scenarios ⇒ blocking; style / simplification / nit ⇒ non-blocking — and (b) MUST render a summary table at the `AskUserQuestion` gate with columns `| Finding | File:line | Blocking? |` so the operator sees the classification before selecting a decision. The `Suggested decision:` line is derived from the table's `Blocking?` column: any Yes ⇒ suggest `request-changes`; all No (findings present) ⇒ suggest `approve`; empty (no findings) ⇒ suggest `approve`.

**Rationale**:
- `/code-review` emits severity-ranked findings with failure scenarios but does not carry a stable machine-readable blocking marker. Parsing a header (Q4 option A — `## Blocking`) or a per-finding severity marker (option B — `severity: blocking|nit|suggestion`) requires guarantees `/code-review`'s output does not currently provide. A keyword heuristic (option C — treat `must`, `bug`, `security`, `breaks` as blocking) is fragile in exactly the way Q4's own text suspects.
- Judgment is acceptable because the classification only *feeds a suggestion* — the human approves or overrides at the `AskUserQuestion` gate. Assist-mode: Claude drafts, human decides. This is the same authority model the rest of the cockpit plugin uses.
- Rendering the classification per-finding at the gate is load-bearing: the operator's override signal ("this style nit is actually a bug") depends on being able to see the reasoning. A single `Suggested decision:` line without the per-finding breakdown is opaque and reduces the operator to guessing whether Claude's classification is defensible.

**Alternatives considered**:
- **Option A (Q4): parse `## Blocking` header**. Rejected — not a documented `/code-review` output contract.
- **Option B (Q4): parse per-line severity marker**. Rejected — same.
- **Option C (Q4): keyword heuristic**. Rejected — fragile and produces false positives on findings that discuss why a change *isn't* a security bug ("does not break auth").
- **Option D (Q4): point at `/code-review`'s schema**. Rejected — no such stable schema exists today. If one is introduced later, this decision would be revisited (the plan gate would parse instead of judge).

**References**:
- Clarification Q4 (2026-07-07).
- Spec Summary §3, FR-006.

## Decision 4 — On `approve` with non-blocking findings, findings are surfaced in the *approval-review body* only; never as inline COMMENT threads

**Decision**: Step 6's `approve` branch, when non-blocking findings are present, POSTs the `APPROVE`-event review with a `body` containing the findings text (rendered readably — one paragraph per finding). It does NOT post an accompanying `event: COMMENT` review, does NOT post `pull_request_review_comments`, and does NOT create any review threads. The CLI's `advance --gate implementation-review` still runs after the review is posted.

**Rationale**:
- Inline COMMENT-review threads are precisely what `PrFeedbackMonitorService` watches. Posting them on `approve` would trip the monitor into applying `waiting-for:address-pr-feedback` and enqueuing fix work on the PR we just approved — the machinery racing the merge. Empirically this is the failure mode Q2 rejects.
- The clean semantic this establishes across the plugin: **inline threads = actionable, monitored feedback; review-body text = information.** Non-blocking findings on `approve` are information. If the reviewer wanted them tracked, they would have classified them blocking and selected `request-changes`.
- Rendering the findings in the approval body preserves discoverability (the findings are visible to anyone scrolling the PR conversation) without engaging the tracking mechanism.

**Alternatives considered**:
- **Option B (Q2): inline COMMENT threads only, posted before the APPROVE-event review**. Rejected — the two reviews land in whichever order GitHub processes them, and even in the intended order the COMMENT threads are unresolved the moment they're posted, so `PrFeedbackMonitorService` sees them and applies `waiting-for:address-pr-feedback` — regardless of the subsequent `APPROVE`. Both events would fire.
- **Option C (Q2): both — body summary AND inline threads**. Rejected — same trigger problem as B, plus content duplication.
- **Delete the finding text from the approve path entirely (no findings in body, no threads)**. Rejected — the operator classified those findings as worth flagging; silently discarding them wastes the reviewer's work. Body-only threads that needle.

**References**:
- Clarification Q2 (2026-07-07).
- `PrFeedbackMonitorService` trigger semantics: unresolved review threads on the PR (checked periodically; label applied on match).
- Spec Summary §3, FR-006.

## Decision 5 — `watch.md` mapping table lists five explicit review-token rows; `waiting-for:clarification → /cockpit:clarify` is preserved unchanged; no v1 row for `manual-validation`

**Decision**: Rewrite the mapping table's `waiting-for:<gate>-review → /cockpit:review --gate <gate>` row to five explicit rows:

```text
| waiting-for:spec-review          | /cockpit:review --gate spec-review          |
| waiting-for:clarification-review | /cockpit:review --gate clarification-review |
| waiting-for:plan-review          | /cockpit:review --gate plan-review          |
| waiting-for:tasks-review         | /cockpit:review --gate tasks-review         |
| waiting-for:implementation-review| /cockpit:review --gate implementation-review|
```

Keep the `waiting-for:clarification → /cockpit:clarify` row unchanged. Keep the `completed:validate` and `error / failed` rows unchanged. Do NOT add a `manual-validation` row.

**Rationale**:
- A substitution-pattern row like `waiting-for:<X>-review → /cockpit:review --gate <X>` (Q5 option B) is a mini parsing DSL embedded in markdown — precisely the English-state-machine smell this rewrite exists to eliminate. It requires the reader (Claude, at runtime) to substitute the capture group correctly, and it breaks on tokens whose "root" isn't a single word: `waiting-for:clarification-review` does not decompose into a `<clarification>-review` root under the pattern.
- Enumerating five explicit rows costs five lines. They are greppable, diffable, and wrong-proof. The cost of not enumerating (session agents having to reason about substitution) is exactly the bug tetrad-development#88 finding #12 documents.
- `manual-validation` gets no row in v1 (Q1 rejected it from `--gate`, Q5 confirmed no `watch` suggestion for it). The transition line still prints; only the ` · suggested: …` segment is omitted. If a `manual-validation` verb is added later, both `--gate` acceptance and the mapping row would be updated together in a new numbered issue.
- The `waiting-for:clarification → /cockpit:clarify` row survives because the answering gate is a different verb, not `--gate clarification`.

**Alternatives considered**:
- **Option B (Q5): one substitution-pattern row for the reviews**. Rejected per rationale above.
- **Option C (Q5): five explicit rows + a `manual-validation` row**. Rejected — no verb to point `manual-validation` at in v1; would either 404 or duplicate `/cockpit:review`'s scope.
- **Add a `waiting-for:address-pr-feedback → (no suggestion)` row**. Rejected — the current error-state row already covers "no suggestion" transitions; `address-pr-feedback` is not an error state (it is expected after `request-changes`) and gets no explicit row. If future v1 usage shows operators wanting a suggested verb for that state, it belongs in a follow-up.

**References**:
- Clarification Q5 (2026-07-07).
- Existing `commands/watch.md:16-21` (the mapping table being rewritten).

## Decision 6 — Only `review.md`, `watch.md`, and one cell of `README.md § Available Commands` change; sibling cockpit commands are out of scope

**Decision**: The fix touches:

- `packages/claude-plugin-cockpit/commands/review.md` — multi-section rewrite (frontmatter, step 1 usage-line gate, step 3 `--gate impl` branch narrative + Suggested-decision rules + findings table, step 6 approve-body wording, step 7 request-changes payload, Examples section).
- `packages/claude-plugin-cockpit/commands/watch.md` — mapping-table rewrite only.
- `packages/claude-plugin-cockpit/README.md` — the `/cockpit:review` row in § Available Commands (`impl PR diff` → `implementation-review PR diff` or equivalent verbiage per the contract).

`/cockpit:queue`, `/cockpit:status`, `/cockpit:merge`, `/cockpit:clarify` are not touched. Neither is `README.md § Error Handling`.

**Rationale**:
- The three findings share a single set of files (`review.md`, `watch.md`) and a single conceptual root (gate vocabulary + review-side signaling). Bundling them is the smaller review surface and prevents transient mid-split desynchronization (a `watch.md` suggesting `--gate implementation-review` while an un-updated `review.md` still says the accepted set is `{ specify, clarify, plan, tasks, impl }`).
- Sibling commands wrap distinct CLI verbs with distinct argument shapes and separate downstream flows. `/cockpit:queue`'s fix landed as [#380](https://github.com/generacy-ai/agency/issues/380) — a different scope. `/cockpit:merge`'s red-check subagent flow is untouched by this fix and is scope-adjacent (fixer agents, not review agents).
- `README.md § Error Handling` is the byte-identical canonical source for the error-conv block in seven files ([#378](https://github.com/generacy-ai/agency/issues/378) invariant). It is not touched.
- The one-cell edit to `README.md § Available Commands` is required because that table's `impl PR diff` phrasing is user-facing and would be actively wrong post-fix. The edit is `impl PR diff` → `implementation-review PR diff` (exact phrasing named in the contract).

**Alternatives considered**:
- **Skip the `README.md` edit**. Rejected — the wrong `impl` name would remain visible on the plugin's front page, misleading anyone reading the README before opening `review.md`.
- **Also touch `/cockpit:merge` "while we're in there"**. Rejected — `/cockpit:merge` has its own scope (red-check auto-fix subagent, PR merge orchestration) and its own smoke-test data points. Each verb requires its own clarification pass. Same logic as [#380](https://github.com/generacy-ai/agency/issues/380) Decision 4.
- **Split into three PRs (one per finding)**. Rejected — the vocabulary must be updated atomically. A staged rollout would leave `watch.md` suggesting `--gate implementation-review` while `review.md` still accepts `impl` (or vice versa), which is exactly the confusion state tetrad-development#88 finding #12 documents.

**References**:
- Spec `Owns:` line (Summary §last paragraph).
- [#378](https://github.com/generacy-ai/agency/issues/378) byte-identical error-conv invariant.
- [#380](https://github.com/generacy-ai/agency/issues/380) plan Decision 4 (per-verb scope discipline).
- Existing files: `commands/review.md`, `commands/watch.md`, `README.md` (all read at plan time).

## Decision 7 — MISSING_BINARY / AUTH_FAILURE / OTHER blocks stay byte-identical; the new `gh api` invocation participates in the same three-class classification

**Decision**: The rewrite does not touch the `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block in either `review.md` or `watch.md`. The `Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling` marker line and the three error-class list items are preserved byte-for-byte. The new `gh api repos/{owner}/{repo}/pulls/{n}/reviews` invocation in step 7 of `review.md` participates in the same three-class classification when it fails: exit ≠ 0 + stderr matching `/auth|unauthorized|401|gh auth/i` → `AUTH_FAILURE`; else → `OTHER`. `MISSING_BINARY` is impossible for `gh api` in a session that already passed the `command -v generacy` pre-flight (both binaries are cluster prerequisites), but the pre-flight remains at the top of step 2 regardless.

**Rationale**:
- [#378](https://github.com/generacy-ai/agency/issues/378) established a byte-identical invariant across seven files. Editing the block in `review.md` — even to change surrounding context — risks introducing drift that #378's grep check catches only after the fact.
- The failure classes and their remedies are independent of what the CLI or `gh` invocation does. Any command that shells out through the Bash tool and produces a non-zero exit code falls through the same three-class classifier. The new `gh api .../reviews` call is just another such shell-out.
- FR-008 codifies this constraint. Spec Out of Scope §5 reinforces it.

**Alternatives considered**:
- **Add a fourth error class `GITHUB_API_FAILURE` for `gh api` non-zero exits**. Rejected — the existing `OTHER` class already covers this, and `AUTH_FAILURE` already covers the specific case of a missing / expired token. Adding a class fragments the classifier and forces every command file to grow one more list item.
- **Refresh the error block "while we're in there"**. Rejected — any edit inside the byte-identical zone can cascade into a drift-check failure. Same logic as [#380](https://github.com/generacy-ai/agency/issues/380) Decision 5.

**References**:
- Spec FR-008, Out of Scope §5.
- [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 4 (byte-identical text scope).
- Existing `commands/review.md:51-57`, `commands/watch.md:23-29` (the untouched blocks).
