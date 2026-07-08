# Phase 0 Research: Fix cockpit review approve path (422 on own PR) and enforce approval gate terminal check

**Feature**: 384-found-during-cockpit-v1
**Status**: Complete
**Scope**: This is a prompt-copy fix in one Markdown file (`packages/claude-plugin-cockpit/commands/review.md`). Research is scoped to (a) which `event` value the approve path posts and why the choice is uniform on all clusters, (b) what shape the new terminal-outcome block takes and where it lives in the file, (c) how the check detects that a terminal outcome occurred, (d) what "return to step 5" means precisely and what the retry bound is, and (e) how to prevent step 3's raw-JSON regression at its source rather than downstream.

## Decision 1 — Approve-with-findings sub-branch posts `event: COMMENT`, not `APPROVE`, uniformly on all clusters

**Decision**: Step 6's approve-with-findings sub-branch (added by [#382](https://github.com/generacy-ai/agency/issues/382)) is edited to POST `event: COMMENT` via `gh api repos/{owner}/{repo}/pulls/{pull_number}/reviews`. The `body` payload remains a human-readable list of non-blocking findings (one paragraph per finding). `comments[]` remains absent. The change is uniform on all clusters — no branch on cluster shape, no probe of the current `gh` credential's identity. An inline `<!-- ... -->` comment adjacent to the event value records the rationale: "self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship."

**Rationale**:
- **Why `APPROVE` fails on the primary deployment shape**: GitHub returns HTTP 422 ("Can not approve your own pull request") on `POST /repos/.../pulls/{n}/reviews` when the authenticating credential is the PR's author. The Generacy cluster uses a single credential for both coder and reviewer, so `APPROVE` 422s on every self-authored PR — which is every PR the cluster produces today. This is precisely what surfaced on the first live post-#382 run (tetrad-development#88 finding #16). The error-handling block then fired, the command exited without advancing, and the operator had to manually run `generacy cockpit advance --gate implementation-review`.
- **Why `COMMENT` is permitted and semantically equivalent for the plugin's needs**: GitHub blocks only `APPROVE` and `REQUEST_CHANGES` on one's own PR; `COMMENT`-event reviews are always permitted. A `COMMENT`-event review with a body but no `comments[]` produces zero review threads — `PrFeedbackMonitorService` polls for unresolved review threads and sees nothing. The #382 semantic contract "inline threads = actionable, monitored feedback; review-body text = information" is preserved exactly: only the event field name changes, the payload shape does not. The body text is the actual payload for the operator scanning the PR conversation view — the event name is metadata.
- **Why `APPROVE` on a self-PR is semantically empty even where GitHub permits it (multi-credential future)**: GitHub's approval semantics gate the *merge button* through branch-protection rules that require review-count thresholds. An approval on your own PR does not count toward those thresholds — the API preserves the event only for record-keeping. In a hypothetical multi-credential cluster where the reviewer identity differs from the coder identity, `APPROVE` would clear the 422 and would count toward branch-protection thresholds, but the plugin's current invocation model (single credential for everything) means we can't detect that case without infrastructure the plugin does not have.
- **Why uniform (option A in Q3), not conditional (option B)**: cluster-shape detection requires a signal the plugin does not have today. Detecting "is the current `gh` credential the PR's author" requires a `gh api` call to fetch the PR's author, plus a `gh api user` call to fetch the current credential's login, then a string compare. That is a two-call round-trip per session for a branch that fires for zero cluster shapes that exist today. The Q3 answer is direct: "cluster-shape detection for a deployment shape that doesn't exist is speculative machinery." When a multi-credential cluster ships (if ever), the inline rationale comment surfaces the assumption at exactly the line that would need to change.
- **Why an inline comment travels better than a follow-up tracking issue (option C in Q3)**: a tracking issue for a nonexistent deployment shape has no owner, no due date, no forcing function — it sits open until someone triages it and closes it. The inline comment is co-located with the line it explains; anyone who touches this line sees the rationale in-context. Q3's answer names this directly: "the inline comment travels with the code and surfaces exactly when someone touches this line again."

**Alternatives considered**:
- **Option B (Q3): conditional branching on cluster shape**. Rejected — see rationale above. Speculative machinery for a hypothetical shape.
- **Option C (Q3): uniform for v1, file a tracking issue for a follow-up**. Rejected — dead-issue anti-pattern. The inline comment does the same discoverability work without the tracking overhead.
- **Post body-only WITHOUT changing the event to `COMMENT`**: not an option — the whole point of the 422 fix is that `event: APPROVE` on a self-PR is the API-level rejection, not the payload shape. Body-only APPROVE still 422s.

**References**:
- GitHub REST reference: `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews` — `event` accepts `APPROVE | REQUEST_CHANGES | COMMENT`; `APPROVE` and `REQUEST_CHANGES` return 422 on one's own PR.
- Live 422 reproduction: [generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #16 (`/cockpit:review 2 --gate implementation-review` on `christrudelpw/sniplink`).
- `PrFeedbackMonitorService` source: `/workspaces/generacy/packages/orchestrator/src/services/pr-feedback-monitor-service.ts` — trigger is unresolved review threads.
- Spec Summary §1, FR-001, FR-002; Clarifications Q3 (2026-07-08).

## Decision 2 — A new `## Terminal Outcome Check` block, wrapped in `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` fence markers, at the end of `review.md`

**Decision**: A new section `## Terminal Outcome Check` is added at the end of `review.md`, after the existing `## Examples` section, wrapped in `<!-- BEGIN terminal-check -->` and `<!-- END terminal-check -->` fence markers that mirror the `error-conv` convention. The block's body enumerates the three valid terminal outcomes keyed to text-emission markers, includes a passive prose reminder about the step-3 table-not-JSON rule, and specifies the fail-closed loop-back to step 5.

**Rationale**:
- **Why a new block, not a mirror of `clarify.md`**: the spec's original phrasing was "mirror `clarify.md`", but the Q1 investigation found that neither `clarify.md` in the tree matches what US2 describes. `packages/claude-plugin-cockpit/commands/clarify.md` has no Post-Command Check block at all; `packages/agency-plugin-spec-kit/commands/clarify.md` has a Post-Command Check block that is a *workflow-continuation hint* ("If this command was invoked as part of a larger workflow, proceed to the next task in your todo list"), not a fail-closed terminal check that loops back to a prior step on a missing outcome. The Q1 answer accepts this: "the spec's 'mirror clarify.md' premise was wrong — thanks for checking rather than mirroring a block that doesn't exist."
- **Why `## Terminal Outcome Check` as the heading**: it describes what the block does — verify that exactly one of the three terminal outcomes was reached — without hinting at any particular mechanism. "Post-Command Check" was ambiguous with the spec-kit `clarify.md` block, which does something different. "Outcome Assertion" would suggest a language-level assertion. "Terminal Outcome Check" makes the fail-closed intent explicit.
- **Why `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` fence markers, mirroring `error-conv`'s convention**: the existing `error-conv` block in every cockpit command file (`review.md`, `watch.md`, `clarify.md`, `queue.md`, `merge.md`, `status.md`) uses this fence-marker convention so it is greppable across files with `grep -r '<!-- BEGIN error-conv -->' packages/claude-plugin-cockpit/commands/`. The Q1 answer combines option B (define a new block) with option C (adopt the greppable fence convention). Naming the fence `terminal-check` uses the same kebab-case pattern as `error-conv` and reads naturally in prose ("the terminal-check block").
- **Why the block lives at the end of the file, after `## Examples`**: the terminal outcome is by definition the last thing to check before the session ends; placing the block last matches the order of narration. The `error-conv` block is inside `## Instructions` because errors can be raised at any step; the terminal check is a whole-session invariant, so it gets its own top-level section at the file's tail.
- **Why not embed inside `error-conv`**: the two blocks solve different problems. `error-conv` classifies a specific CLI/HTTP failure into one of three failure classes and prints the corresponding message. Terminal Outcome Check verifies that *any* terminal outcome (including successful ones — approve, request-changes) was reached. Combining them would conflate error handling with outcome verification and would make the `error-conv` block's byte-identical invariant (`diff`-clean between `review.md` and `watch.md` per FR-008 of #378) impossible to preserve.
- **Why the same block is not adopted in `clarify.md` in this PR**: `clarify.md`'s outcome shape is per-question (`Approve` / `Edit` / `Skip` per drafted question) rather than per-command, so the marker set is different. Retroactively adopting the same block there is a sensible follow-up per Q1's answer — but it belongs in its own scoping conversation because the marker enumeration and the definition of "terminal" are different. Explicitly listed as Out of Scope §1 in the spec.

**Alternatives considered**:
- **Option A (Q1): mirror the spec-kit `clarify.md` continuation-hint shape**. Rejected — that block is a workflow-continuation hint, not a fail-closed terminal check. Rewriting its content to enumerate three terminal outcomes and loop back on miss would produce something that has the surface shape but different semantics, causing confusion for anyone who greps for the pattern.
- **Option B alone (Q1): define a new block, no fence markers**. Rejected — loses cross-file greppability. `error-conv` established the fence-marker convention specifically for this reason.
- **Option C alone (Q1): use `error-conv`-style fences on the existing (nonexistent) block**. Rejected — cannot mirror a block that doesn't exist. This is precisely the ambiguity Q1 investigated.

**References**:
- Existing `error-conv` block: `packages/claude-plugin-cockpit/commands/review.md:79-85`, `packages/claude-plugin-cockpit/commands/clarify.md:51-57`, and the same block in the other command files under `packages/claude-plugin-cockpit/commands/`.
- Non-matching `clarify.md` variants surveyed: `packages/claude-plugin-cockpit/commands/clarify.md` (no such block), `packages/agency-plugin-spec-kit/commands/clarify.md` (workflow-continuation hint).
- Spec FR-003; Clarifications Q1 (2026-07-08).

## Decision 3 — Detection is text-emission-only via three markers (`Labels:`, `Feedback posted:`, `Aborted:`); step 8 gains a literal `Aborted:` emission

**Decision**: The Terminal Outcome Check verifies exactly one of the following three markers has been emitted in the session's own output:

- `Labels: waiting-for:<gate> → completed:<gate>` — emitted by step 6 after `generacy cockpit advance` returns exit 0 on the approve path.
- `Feedback posted: N inline comment(s) on PR #<pull_number>` — emitted by step 7 after `gh api .../reviews` returns exit 0 on the request-changes path.
- `Aborted:` — a new literal emission added to step 8's abort branch. Currently step 8 emits nothing; the spec's FR-005 requires this addition so the abort outcome is detectable via text emission.

The check MUST NOT invoke `gh api`, `generacy cockpit status`, `gh pr view`, or any other HTTP/CLI probe. If none of the three markers is present, the check routes control back to step 5 only (see Decision 4).

**Rationale**:
- **Why text-emission-only (option A in Q2), not state-check based (B) or hybrid (C)**: each marker is emitted by its step only after the real side effect succeeds. `Labels:` is emitted after the CLI exit-0 return of `generacy cockpit advance`; `Feedback posted:` is emitted after the `gh api` exit-0 return. Adding step 8's `Aborted:` — printed on the abort branch only, after the "no state mutation, no PR review post" decision has been taken — closes the marker set. This makes emission a reliable proxy for outcome, and lets the check operate on session-local text without a network call. Q2's answer: "the markers aren't decorative: each is emitted by its step only after the real side effect succeeds, so verifying the emission verifies the outcome transitively."
- **Why not state-check based (Q2 option B)**: end-of-command state probes add network calls to every review session. They can also false-positive on concurrent actors — if another operator or the orchestrator advances the gate between the plugin's side effect and the check's probe, the state probe sees the advanced gate and confirms an outcome that wasn't the current session's. False-positives on concurrent actors are exactly the class of bug the emission-only design deliberately avoids.
- **Why not hybrid (Q2 option C)**: option C uses text-emission for approve/abort and a state check for request-changes on the theory that `gh api` posting is a network side effect that could partially fail. In practice, `gh api` returns exit 0 only when the API responded 2xx, so a step-7 exit-0 already means the review was accepted. Adding a state probe to re-verify buys nothing over trusting the exit code — and re-introduces the concurrent-actor false-positive problem.
- **Why step 8 needs the new `Aborted:` line (FR-005)**: current step 8 says "On abort, emit no `Labels:` line, mutate no state, post no PR review, and exit zero." No literal `Aborted:` line is emitted today. Without it, the terminal check has no way to distinguish "abort was chosen and executed correctly" from "no terminal outcome was reached at all". Both would look like empty output. Adding a literal `Aborted:` line makes abort a first-class detectable outcome. The emission is coupled to the abort branch's execution (printed only when abort is the chosen path), so its presence still implies the outcome transitively.
- **Why the three-marker set is complete**: `AskUserQuestion` at step 5 offers exactly three options — `approve` / `request-changes` / `abort`. Each option maps to exactly one downstream step (6 / 7 / 8) that emits exactly one marker. Missing marker ⇒ session ended before reaching any of the three downstream steps, which is the failure mode the check exists to detect.

**Alternatives considered**:
- **Option B (Q2): state-check based**. Rejected — see rationale. Adds latency, adds a concurrent-actor false-positive class.
- **Option C (Q2): hybrid**. Rejected — adds complexity without addressing a real failure mode; `gh api` exit-0 already implies the post succeeded.
- **Emit the same marker (`Terminal outcome: <name>`) from all three steps and check for that single string**. Considered and rejected because the marker would decouple from the semantically meaningful lines each step already emits, and would require every future edit to remember to emit both the semantic line and the marker. The current three lines (`Labels:`, `Feedback posted:`, `Aborted:`) already carry outcome information; the check keys off them directly.

**References**:
- Current step 6 emission: `packages/claude-plugin-cockpit/commands/review.md:63` (`Labels: waiting-for:<name> → completed:<name>`).
- Current step 7 emission: `packages/claude-plugin-cockpit/commands/review.md:70` (`Feedback posted: N inline comment(s) on PR #<pull_number>`).
- Current step 8 (no emission): `packages/claude-plugin-cockpit/commands/review.md:75`.
- Spec FR-004, FR-005, FR-008; Clarifications Q2 (2026-07-08).

## Decision 4 — Loop-back re-invokes step 5 only, unbounded, and MUST NOT re-invoke `/code-review`

**Decision**: On a missing-terminal-outcome branch, the Terminal Outcome Check instructs control to return to step 5 only — re-invoke `AskUserQuestion` with the same three-option prompt. The findings-summary table from step 3 (or the three-section summary from step 4) is re-shown from session context; `/code-review` is not re-invoked. The loop is unbounded — no retry cap, no forced abort after N misses.

**Rationale**:
- **Why re-invoke step 5 only, not restart from step 3 (option A in Q4, not option C)**: step 3's `/code-review` invocation is the expensive part of the flow — it re-analyzes the PR diff, produces new findings, and can take tens of seconds to minutes of session time. If the check bounces to step 5 because instruction decay after a long `/code-review` sub-invocation was the cause of the missed outcome (which is exactly the observed failure mode from tetrad-development#88 finding #16), re-invoking `/code-review` would re-trigger the same decay. The findings-summary table from the first pass is already in session context; step 5's `AskUserQuestion` re-shows it directly.
- **Why unbounded (option A in Q4), not capped at N (option B)**: every iteration of the loop blocks on a human answer at `AskUserQuestion`. There is no runaway loop without an operator driving one. An operator who dismisses the prompt is thinking or looking something up, not stuck. Q4's answer names this directly: "force-aborting after 3 misses converts hesitation into a silent non-outcome, which is this bug's failure mode wearing a different hat." A cap would let a hesitating operator inadvertently trigger the exact non-advancement the check exists to prevent.
- **Why the raw-JSON regression case is handled by Decision 5, not by the loop-back**: an operator who saw raw JSON in step 3 and wants a proper table should re-run the command manually. Attempting to auto-detect the raw-JSON case at the terminal check and route to step 3 is self-introspection of prior output, which is exactly the meta-machinery the plugin avoids. Enforcement is upstream in step 3 (Decision 5) — the check doesn't need to catch what step 3 should never emit.
- **Why not "route to the last step that failed"**: the check would need to introspect which step ran last, adding meta-machinery. The simple invariant "on missing outcome, go to step 5 and let the operator decide again" is enough — the operator has visibility into what happened and can `abort` if they want to end the session cleanly, which now emits `Aborted:` and satisfies the check.
- **Why "return to step 5 rather than exiting" is the fail-closed direction**: exiting on a missing outcome would silently drop the session — the failure mode we're fixing. Returning to step 5 forces an operator decision. The check is only "fail-closed" in the sense of "does not allow the session to end without an outcome"; it does not force a specific outcome.

**Alternatives considered**:
- **Option B (Q4): re-invoke step 5, capped at 3**. Rejected — see rationale. Cap converts hesitation into silent non-outcome.
- **Option C (Q4): restart from step 3 (re-run `/code-review`)**. Rejected — re-runs the expensive sub-invocation that caused the decay in the first place; the findings table is already in session context.
- **Restart the whole command from step 1**. Rejected — same argument as C, plus resets `--gate` parsing and pre-flight for no reason.

**References**:
- Current step 5 (`AskUserQuestion`): `packages/claude-plugin-cockpit/commands/review.md:52-57`.
- Spec FR-004, FR-009; Clarifications Q4 (2026-07-08).

## Decision 5 — Step 3 forbids raw-JSON output at the source; the Terminal Outcome Check's mention of the rule is passive prose only

**Decision**: Step 3's instructions are strengthened with the sentence: "MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else." The sentence is placed immediately after the current "Capture `/code-review`'s output verbatim as the review summary body." bullet, before the classification instruction. The Terminal Outcome Check block includes a passive prose reminder that step-3 findings are rendered via the summary table, never as raw JSON — for the operator to see if they scan the block, not as an active regression detector.

**Rationale**:
- **Why enforce at the point of behavior (option C in Q5), not by passive prose (A) or active regression check (B)**: the observed regression printed raw JSON *from* step 3, before the operator ever reached the terminal check. By the time any check fires, the operator has already seen the JSON — the harm the check would prevent is already done. Q5's answer names this: "keep the check-block mention as a passive reminder … Option B's self-introspection ('read your own prior output and route back') is exactly the English-state-machine meta-machinery this plugin family exists to avoid, and it fires after the operator has already seen the JSON."
- **Why passive prose alone (option A) is insufficient**: a reminder inside the terminal check block does not prevent step 3 from misfiring. It documents the rule for the operator, but the raw JSON already appeared in the session output before the terminal check ran. The operator sees the JSON, and the reminder is a post-mortem.
- **Why active regression detection (option B) is the wrong shape**: it requires the check to read its own prior session output and pattern-match for a `{"findings":` prefix. This is self-introspection — the plugin looking at its own transcript to decide what to do next. That is exactly the meta-machinery this plugin family avoids: the "English state machine" pattern where a prompt-command decides its next action based on reading its own text. The plugin's contract is that steps run in order and each step's instructions determine that step's behavior; a check that looks backward at prior output breaks that contract.
- **Why the strengthened wording lives in step 3, not step 5**: step 3 is the step that captures `/code-review`'s output and renders the findings-summary table. The rule "MUST NOT print raw JSON" applies to step 3's own output, so it belongs in step 3's instructions where it can be applied at the point of emission. Moving it to step 5 would rely on step 3 having already misfired.
- **Why the check still mentions the rule as passive prose (FR-007)**: an operator who lands on the terminal check block via the missing-outcome loop-back may be trying to understand why they're seeing the fail-closed message. The passive prose reminder tells them (i) the correct step-3 output is a table, and (ii) if they see raw JSON above, that is the bug the reminder documents. It's a lens for the operator, not a self-check for the plugin.

**Alternatives considered**:
- **Option A (Q5): passive reminder only**. Rejected — insufficient, does not prevent the regression at its source.
- **Option B (Q5): active self-introspection**. Rejected — meta-machinery anti-pattern; fires after the operator has already seen the JSON.
- **Have step 3 refuse to proceed if `/code-review` returned malformed output**. Considered and set aside because "malformed" is ill-defined — `/code-review`'s output shape is prose plus optional JSON. The rule the fix targets is narrower: don't PRINT raw JSON; parse it if that's what came back, and render the table.

**References**:
- Current step 3 (findings table rendering): `packages/claude-plugin-cockpit/commands/review.md:32-46`.
- Observed regression: [generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #16.
- Spec FR-006, FR-007; Clarifications Q5 (2026-07-08).

## Cross-cutting notes

- **Coupling between decisions**: Decision 3's `Aborted:` emission (FR-005) is coupled to Decision 4's loop-back — step 8's abort branch must emit `Aborted:` so the check can see the outcome and stop looping. If step 8's emission were moved elsewhere or made conditional, Decision 4's unbounded loop would never terminate on abort.
- **What is NOT researched here (out of scope)**: (i) retroactive adoption of `## Terminal Outcome Check` in `clarify.md` or other command files (Q1 answer names this as a follow-up); (ii) cluster-shape detection for multi-credential deployments (Q3 rejected); (iii) retry caps on the step-5 loop (Q4 rejected); (iv) self-introspection of prior output for raw-JSON detection (Q5 rejected); (v) end-of-session `gh api` / `generacy cockpit status` state probes (Q2 rejected).
- **Preserved from #382**: the payload shape (`body` present, `comments[]` absent) on the approve path; the semantic contract "inline threads = actionable, monitored feedback; review-body text = information"; the byte-identical `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block. Only the `event` value changes on the approve path.

---

*Generated by /plan for issue [generacy-ai/agency#384](https://github.com/generacy-ai/agency/issues/384)*
