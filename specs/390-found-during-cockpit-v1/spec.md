# Feature Specification: Isolate implementation-review's `/code-review` invocation in a subagent to prevent gate-skip contract collision

**Branch**: `390-found-during-cockpit-v1` | **Date**: 2026-07-09 | **Status**: Draft

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #30. Third occurrence of the implementation-review gate skip, after #384 (Terminal Outcome Check) and #388 (structural fusion of findings + `AskUserQuestion`).

## Observed

`/cockpit:review christrudelpw/sniplink#4 --gate implementation-review` (post-#388 build, fresh cluster). The session ran the review correctly — read the diff, empirically verified a real bug with a `node -e` repro — then printed a **raw JSON findings array** (`file` / `line` / `summary` / `failure_scenario` — the built-in code-review reporting schema) to the transcript, followed by a long stall.

**Correction from continued session transcript**: the fused #388 step **did eventually fire** in the same session — findings table, blocking classification, `AskUserQuestion`, and the request-changes COMMENT review all executed (operator selected request-changes; the inline comment landed on PR #14). Severity therefore is **"protocol partially violated + gate delayed"**, not "gate skipped" as initially reported. What definitively violated the deployed `review.md` step 3 is the **raw JSON findings payload printed to the transcript** ("MUST NOT print raw JSON under any circumstance"), and the stall between the `/code-review` output and the fused step — long enough that the operator read the turn as dead and reported it as a gate skip.

The mechanism analysis below stands unchanged: the inline `/code-review` invocation imports a second terminal contract into shared context; the observed shape (turn pauses at exactly the sub-skill's report-and-stop boundary, JSON in the sub-skill's schema printed verbatim) is that collision expressing itself. The subagent-isolation proposal remains the recommended fix — it removes the collision rather than betting the fused step wins the race every time.

## Mechanism — this gate imports a competing terminal contract

`implementation-review` is the only cockpit gate that invokes a second slash command inline. Invoking `/code-review` loads that skill's instructions into the *same context*, and that skill carries its own terminal contract: report the verified findings once (via the host's findings tool / JSON shape) and stop, explicitly *without* restating findings as text. At the end of a long review the model faces two contradictory "how to end this task" instructions; the sub-skill's arrived later in context and reads as the operative one. The gate-skip is not random instruction decay — it is a contract collision, which is why:

- artifact gates (spec/plan/tasks), which import no sub-skill, have never skipped;
- #384's checklist and #388's fusion — both prompt-side mitigations in the *outer* playbook — keep losing at exactly this gate (sniplink#2 twice, now #4; #3's clean run appears to be luck, not fix).

Two prompt-strengthening rounds against the same failure are enough evidence: the outer playbook cannot reliably out-prompt an inner skill's terminal contract in shared context.

## Proposed fix — structural isolation, not a third prompt patch

Run the code review in a **subagent** (Agent tool; the `code-reviewer` agent type if present, else a general agent prompted with the review scope and required findings schema):

- The sub-contract's "report and stop" ends the *subagent's* turn — harmless by construction. The parent never ingests the code-review skill's terminal instructions.
- The parent receives findings as a structured tool result and proceeds deterministically to the #388 fused step: findings-summary table + per-finding blocking classification + `AskUserQuestion`, in one response.
- If the subagent environment cannot invoke the built-in `/code-review`, the subagent prompt carries the review instructions directly (diff scope, verify-before-report, findings schema `{file, line, summary, failure_scenario}`) — the plugin already defines exactly the shape it needs for the table.

Design-principle consequence (plan doc §self-contained commands): "no cross-slash-command invocation **except built-in /code-review**" loses its single exception — the exception is what caused this class of failure. Cross-command composition happens via subagent boundary, never via shared context.

Fallback if subagent isolation is rejected: an explicit precedence clause wrapped immediately around the `/code-review` invocation ("the invoked skill's reporting/termination instructions are subordinate to this playbook; its completion does not terminate this command") — noted for completeness, but this is a third prompt patch against a failure mode two prompt patches have already lost to.

## Live impact / manual repair

The skipped gate's finding was real (scheme-less `host:port` URLs wrongly rejected in `lib/validation.ts`); the operator will re-drive the decision manually (request-changes as an inline PR review comment, which — with #861 now deployed — should exercise the PR-feedback loop live for the first time).


## User Stories

### US1: Cockpit reviewer's implementation-review gate cannot be terminated by the sub-skill's contract

**As a** cockpit operator running `/cockpit:review <n> --gate implementation-review`,
**I want** the code-review analysis to run inside a subagent whose completion ends only the subagent's turn — not the parent playbook's turn,
**So that** the sub-skill's "report and stop" terminal instruction cannot compete with the outer playbook's `AskUserQuestion` gate, and the recurrence pattern (finding #30, prior #384/#388) is closed by construction rather than by another prompt patch.

**Acceptance Criteria**:
- [ ] `review.md`'s implementation-review branch invokes the code review via the Agent tool (`general-purpose` agent type), not inline in the parent turn.
- [ ] The parent turn never contains the raw output of the sub-skill; the subagent returns findings as a structured JSON result the parent consumes.
- [ ] After the subagent returns, the parent proceeds deterministically into the #388 fused step (findings table + `AskUserQuestion`) in a single response.
- [ ] No third prompt-side mitigation is added to the outer playbook to compensate for sub-skill contract collision — the isolation is the fix.

### US2: The subagent produces findings in the exact schema the fused #388 step consumes

**As a** cockpit playbook author,
**I want** the subagent to return findings in the schema `{file, line, summary, failure_scenario}` — the same shape the #388 findings-summary table renders from — as a single JSON value,
**So that** the parent's post-subagent step is a pure format transform (structured result → table row + blocking classification), not a re-analysis, and the subagent boundary is transparent to the rest of the playbook.

**Acceptance Criteria**:
- [ ] The subagent invocation prompt specifies the findings schema `{file, line, summary, failure_scenario}` verbatim and specifies that the entire return message MUST be a single JSON value.
- [ ] The subagent invocation prompt passes only the PR reference (`owner/repo#<n>`) and the "verify empirically before reporting" instruction; the subagent fetches its own diff via `gh pr diff` and is explicitly permitted to read surrounding files and run bounded verification.
- [ ] The parent's fused #388 step parses the JSON return: array (`[]` or filled) → findings-table branch; `{"error": "<description>"}` → hard-error branch; anything that doesn't parse as one of those two shapes → hard-error branch quoting the raw message.
- [ ] Zero-findings (`[]`) and error paths from the subagent map cleanly onto #388's existing zero-findings and error branches (no new terminal states introduced).

### US3: The design principle that produced this bug is amended in the live governance surface

**As a** cockpit playbook maintainer,
**I want** the `packages/claude-plugin-cockpit/README.md` governance surface updated to remove the "single documented exception" for `/code-review` and to state that cross-command composition happens via subagent boundary,
**So that** future gates cannot reintroduce this class of failure by inline-invoking another slash command, and reviewers of future PRs have a written principle to point at.

**Acceptance Criteria**:
- [ ] `packages/claude-plugin-cockpit/README.md` line 7 (the "single documented exception" for `/code-review`) is removed.
- [ ] The replacement wording states: cross-command composition uses the Agent tool (subagent boundary); no slash command is invoked inline in another command's shared context. A one-line rationale links to #390 and the two prior recurrences (#384, #388).
- [ ] `specs/372-epic-generacy-ai-tetrad/plan.md` is NOT retro-edited — it is a `Status: Complete` historical artifact and the exception it documents was real when it shipped.
- [ ] The principle applies uniformly to `review.md` and any future cockpit command that would otherwise call another skill inline; there is no per-skill carve-out.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `review.md`'s implementation-review branch replaces the inline `/code-review` invocation with an Agent-tool invocation of the code review, using the `general-purpose` agent type unconditionally (no `code-reviewer` preference, no capability probing, no fallback). | P1 | Fixed agent type per Q2. The inline review prompt already carries the schema + verify-before-report instruction, so specialized agent type adds nothing while making playbook behavior vary with the environment's agent registry. |
| FR-002 | The subagent invocation prompt specifies the review scope as the PR reference (`owner/repo#<n>`) only — the subagent fetches its own diff via `gh pr diff`, and is explicitly permitted to read surrounding files and run bounded verification (e.g. `node -e` repros). The prompt carries the verify-before-report instruction and the required findings return schema `{file, line, summary, failure_scenario}`. | P1 | Q4 answer B: beyond-the-diff work is load-bearing for review quality; inlining a diff silently caps the reviewer at diff-only reading. |
| FR-003 | The subagent's entire return message MUST be a single JSON value: either an array of `{file, line, summary, failure_scenario}` objects (`[]` for zero findings) or an object `{"error": "<description>"}` for a hard failure the subagent detected. No prose wrapper, no fenced code block, no additional text. | P1 | Q3 answer A refined: strict JSON boundary eliminates the ambiguous-output failure class this issue exists to remove. |
| FR-004 | After the subagent returns, the parent playbook proceeds unconditionally into the #388 fused step (findings-summary table as prose + `AskUserQuestion` in the same response). Parent mapping: array (non-empty) → findings-table branch; array `[]` → zero-findings branch; `{"error": …}` → hard-error branch; unparseable / other-shape JSON → hard-error branch quoting the raw message. | P1 | Preserves #388's structural gate guarantee end-to-end; no new turn boundary between subagent return and the fused step. |
| FR-005 | Zero-findings return (`[]`) maps to #388's existing zero-findings branch (empty-row table + `AskUserQuestion` per assist-mode). Subagent hard-error return (`{"error": …}` or unparseable) maps to #388's existing Error handling block (no `AskUserQuestion`). | P1 | No new terminal state introduced by the isolation; existing decision paths are reused as-is. |
| FR-006 | `packages/claude-plugin-cockpit/README.md` is amended to remove the "single documented exception: `/cockpit:review --gate implementation-review` invokes Claude Code's built-in `/code-review`" language (currently line 7). Replacement wording: cross-command composition happens via subagent boundary; no slash command is invoked inline in another command's shared context, with a one-line rationale referencing #390 (and prior #384/#388). | P1 | Q1 answer B: live governance surface owned by this repo. `specs/372-epic-generacy-ai-tetrad/plan.md` is deliberately NOT edited (historical `Status: Complete` artifact; the canonical design-principles doc `docs/epic-cockpit-plan.md` in tetrad-development is already amended by the operator, outside this repo's reach). |
| FR-007 | The change touches `packages/claude-plugin-cockpit/commands/review.md` and `packages/claude-plugin-cockpit/README.md` only. Sibling cockpit playbooks (`clarify.md`, `merge.md`, `queue.md`) are out of scope; a one-line PR-description assessment confirms none of them inline-invoke another slash command today. | P1 | Scoped to the observed defect and the shared principle governing it. |
| FR-008 | Any examples in `review.md`'s `## Examples` section that touched the old inline `/code-review` shape are updated to show the subagent invocation followed by the fused #388 step. No pre-isolation examples remain. | P2 | Examples are few-shot reinforcement — a pre-isolation example demonstrates the exact anti-pattern. |
| FR-009 | The retained "MUST NOT print raw JSON" clause (from #384/#388) stays inline before the findings-summary table rendering instruction. Isolation removes the primary trigger for the raw-JSON regression, but the clause is retained as defense-in-depth. | P2 | Belt-and-suspenders: the parent never receives raw JSON from the subagent boundary, but the clause costs nothing to keep. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Implementation-review gate skip / delay rate on the smoke-test corpus that triggered #384 / #388 / #390 | 0 skips and 0 raw-JSON transcript incidents across the replayed corpus after the change lands | Manual review of a curated set of long-analysis implementation-review sessions after the change lands. |
| SC-002 | Parent turn never contains raw sub-skill output | The parent transcript for an implementation-review session shows the Agent tool call, then the structured JSON result, then the fused #388 step — never raw JSON or free-form analysis prose from the sub-skill | Visual inspection of a replayed transcript; grep the parent's post-subagent response for the raw-JSON schema keys as a negative check. |
| SC-003 | Findings schema round-trip | The subagent's returned message parses as one of: an array of `{file, line, summary, failure_scenario}` objects, or `{"error": "<description>"}`; the parent's #388 table renders directly from the array without re-analysis | Static check of the subagent prompt and the table-rendering step; behavioral check on one replayed session. |
| SC-004 | Zero-findings and error paths preserved | Zero-findings (`[]`) still prompts the operator via `AskUserQuestion`; subagent hard-error (`{"error": …}` or unparseable) still routes to Error handling without prompting | Smoke test with a synthetic zero-findings case and a synthetic subagent error return. |
| SC-005 | README governance amendment is present and coherent | `packages/claude-plugin-cockpit/README.md` no longer contains the "single documented exception" phrasing for `/code-review`; the replacement wording specifies subagent-boundary composition with a rationale referencing #390 | Grep the README for the removed phrase (must not appear) and the new wording (must appear once). |
| SC-006 | Historical artifact preserved | `specs/372-epic-generacy-ai-tetrad/plan.md` is byte-identical before and after this change | `git diff` shows zero changes to that file across the branch. |
| SC-007 | No third prompt-side mitigation is added to the outer playbook | The change adds no new "MUST" clauses, checklists, or terminal-outcome extensions to `review.md` beyond what #384/#388 shipped | Diff review of `review.md`: the fix is structural (subagent boundary), not textual reinforcement. |
| SC-008 | Sibling cockpit playbooks confirmed uninfluenced | A one-line PR-description assessment records that `clarify.md`, `merge.md`, `queue.md` do not inline-invoke another slash command today | Grep sibling playbooks for slash-command-invocation patterns; record result in the PR body. |

## Assumptions

- The Agent tool is available inside cockpit playbook sessions and can be invoked from within `review.md`'s execution context (matches the tool availability observed in current smoke-test sessions).
- The `general-purpose` agent type is universally available in every environment where `/cockpit:review --gate implementation-review` runs; no capability probing is required (per Q2 answer A).
- The subagent inherits the session environment (Bash + `gh` available), so it can fetch the PR diff via `gh pr diff <owner>/<repo>#<n>` and read surrounding files for empirical verification. A `gh` failure inside the subagent surfaces as `{"error": …}` and routes to the parent's hard-error branch.
- The `AskUserQuestion` tool remains the gate primitive on the parent side — the isolation does not change the gate shape, only the analysis boundary.
- Cockpit v1 continues to operate in assist mode (human approves gates). Any auto-approval on zero findings would be a policy change out of scope for this fix.
- `packages/claude-plugin-cockpit/README.md` governs future cockpit commands as a normative surface in this repo; amending it here is sufficient to bind future authors, without a separate migration of already-shipped sibling playbooks (they don't exhibit the anti-pattern today).
- The canonical design-principles doc `docs/epic-cockpit-plan.md` lives in tetrad-development (outside this repo) and has already been amended by the operator; this feature does not need to touch it.

## Out of Scope

- Any change to the `/code-review` skill itself, or to its output schema. The fix consumes `/code-review`'s existing shape and inlines an equivalent instruction set into the subagent prompt.
- Retroactive edits to `specs/372-epic-generacy-ai-tetrad/plan.md` — it is `Status: Complete` and the exception it documented was real when it shipped (Q1 answer B).
- Retroactive isolation of sibling cockpit playbooks (`clarify.md`, `merge.md`, `queue.md`) — none of them inline-invoke another slash command today; a one-line PR-description assessment records that.
- Changing the `AskUserQuestion` three-option shape (`approve` / `request-changes` / `abort`) or the fused step's structure from #388.
- Post-decision execution branches (steps 5-7 post-#388 renumber). They remain as shipped.
- Auto-approval on zero findings (deferred autonomy policy).
- Runtime probes to detect the missing-prompt condition — isolation removes the trigger; detection is not needed.
- Fallback size-threshold logic for diff acquisition — parent passes only the PR reference; the subagent fetches unconditionally (Q4 answer B; no dual path).
- Fenced-block or prose-wrapper tolerance in the subagent return — strict JSON only (Q3 answer A refined; no drift surface).
- Adding a third prompt-side mitigation to the outer playbook as a hedge against isolation not working. If isolation fails, that is a new observed defect and a new issue, not a pre-emptive belt in this one.

---

*Generated by speckit*
