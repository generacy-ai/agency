# Feature Specification: Isolate implementation-review's `/code-review` invocation in a subagent to prevent gate-skip contract collision

**Branch**: `390-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Draft

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #30. Third occurrence of the implementation-review gate skip, after #384 (Terminal Outcome Check) and #388 (structural fusion of findings + `AskUserQuestion`).

## Observed

`/cockpit:review christrudelpw/sniplink#4 --gate implementation-review` (post-#388 build, fresh cluster). The session ran the review correctly — read the diff, empirically verified a real bug with a `node -e` repro — then ended the turn by printing a **raw JSON findings array** (`file` / `line` / `summary` / `failure_scenario` — the built-in code-review reporting schema) with **no findings table, no `AskUserQuestion`, no action**. Issue #4 still holds `waiting-for:implementation-review` + `agent:paused`; nothing was posted to PR #14.

Both behaviors are explicitly prohibited by the deployed `review.md` step 3 ("MUST NOT print raw JSON under any circumstance"; "presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation"). The instructions were in context and lost anyway.

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
**So that** the sub-skill's "report and stop" terminal instruction cannot compete with the outer playbook's `AskUserQuestion` gate, and the third-occurrence skip pattern (finding #30, prior #384/#388 recurrences) is closed by construction rather than by another prompt patch.

**Acceptance Criteria**:
- [ ] `review.md`'s implementation-review branch invokes `/code-review` (or its equivalent) via the Agent tool, not inline in the parent turn.
- [ ] The parent turn never contains the raw output of `/code-review`; the subagent returns findings as a structured result the parent consumes.
- [ ] After the subagent returns, the parent proceeds deterministically into the #388 fused step (findings table + `AskUserQuestion`) in a single response.
- [ ] No third prompt-side mitigation is added to the outer playbook to compensate for sub-skill contract collision — the isolation is the fix.

### US2: The subagent produces findings in the exact schema the fused #388 step consumes

**As a** cockpit playbook author,
**I want** the subagent to return findings in the schema `{file, line, summary, failure_scenario}` — the same shape `/code-review` already emits and the same shape the #388 findings-summary table renders from,
**So that** the parent's post-subagent step is a pure format transform (structured result → table row + blocking classification), not a re-analysis, and the subagent boundary is transparent to the rest of the playbook.

**Acceptance Criteria**:
- [ ] The subagent invocation prompt (or the `code-reviewer` agent type's contract) specifies the findings schema `{file, line, summary, failure_scenario}` verbatim.
- [ ] The subagent invocation prompt specifies the review scope (the PR diff being reviewed) and the "verify empirically before reporting" instruction that `/code-review` currently carries.
- [ ] The parent's fused #388 step consumes the structured findings without re-invoking any analysis; the table and the `AskUserQuestion` payload are pure renders of the subagent's return value.
- [ ] Zero-findings and error paths from the subagent map cleanly onto #388's existing zero-findings and error branches (no new terminal states introduced).

### US3: The design principle that produced this bug is amended in the plan doc

**As a** cockpit playbook maintainer,
**I want** the plan doc's §self-contained commands principle updated to remove the "except built-in `/code-review`" exception and to state that cross-command composition happens via subagent boundary, never via shared context,
**So that** future gates cannot reintroduce this class of failure by inline-invoking another slash command, and reviewers of future PRs have a written principle to point at.

**Acceptance Criteria**:
- [ ] The plan doc's principle is amended to state: cross-command composition uses the Agent tool (subagent boundary); no slash command is invoked inline in another command's shared context.
- [ ] The prior exception ("except built-in `/code-review`") is explicitly removed, with a one-line rationale linking to this issue (#390) and the two prior recurrences (#384, #388) as the empirical grounds.
- [ ] The principle applies uniformly to `review.md` and any future cockpit command that would otherwise call another skill inline; there is no per-skill carve-out.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `review.md`'s implementation-review branch replaces the inline `/code-review` invocation with an Agent-tool invocation of the code review, using the `code-reviewer` agent type if available and a general agent with an inline review prompt otherwise. | P1 | The subagent boundary is the fix — its terminal contract ends the subagent's turn, not the parent's. |
| FR-002 | The subagent invocation prompt specifies the review scope (target PR + diff), the verify-before-report instruction, and the required findings return schema `{file, line, summary, failure_scenario}`. | P1 | Same schema the plugin already renders the findings-summary table from — the subagent boundary is a format-preserving hop, not a re-design. |
| FR-003 | After the subagent returns, the parent playbook proceeds unconditionally into the #388 fused step (findings-summary table as prose + `AskUserQuestion` in the same response). No new turn boundary is introduced between subagent return and the fused step. | P1 | Preserves #388's structural gate guarantee end-to-end. |
| FR-004 | Zero-findings return from the subagent maps to #388's existing zero-findings branch (empty-row table + `AskUserQuestion` per assist-mode). Subagent hard-error return maps to #388's existing Error handling block (no `AskUserQuestion`). | P1 | No new terminal state introduced by the isolation; existing decision paths are reused as-is. |
| FR-005 | The plan doc's §self-contained commands principle is amended to remove the "except built-in `/code-review`" exception. New wording: cross-command composition happens via subagent boundary; no slash command is invoked inline in another command's shared context. | P1 | The design-principle amendment prevents future gates from reintroducing this failure class. |
| FR-006 | The change touches `packages/claude-plugin-cockpit/commands/review.md` and the referenced plan doc only. Sibling cockpit playbooks (`clarify.md`, `merge.md`, `queue.md`) are out of scope; a one-line PR-description assessment confirms none of them inline-invoke another slash command today. | P1 | Scoped to the observed defect and the shared principle governing it. |
| FR-007 | Any examples in `review.md`'s `## Examples` section that touched the old inline `/code-review` shape are updated to show the subagent invocation followed by the fused #388 step. No pre-isolation examples remain. | P2 | Examples are few-shot reinforcement — a pre-isolation example demonstrates the exact anti-pattern. |
| FR-008 | The retained "MUST NOT print raw JSON" clause (from #384/#388) stays inline before the findings-summary table rendering instruction. Isolation removes the primary trigger for the raw-JSON regression, but the clause is retained as defense-in-depth. | P2 | Belt-and-suspenders: the parent never receives raw JSON from the subagent boundary, but the clause costs nothing to keep. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Implementation-review gate skip rate on the smoke-test corpus that triggered #384 / #388 / #390 | 0 skips across the replayed corpus after the change lands | Manual review of a curated set of long-analysis implementation-review sessions after the change lands. |
| SC-002 | Parent turn never contains raw `/code-review` output | The parent transcript for an implementation-review session shows the Agent tool call, then the structured result, then the fused #388 step — never raw JSON or free-form analysis prose from the sub-skill | Visual inspection of a replayed transcript; grep the parent's post-subagent response for the raw-JSON schema keys as a negative check. |
| SC-003 | Findings schema round-trip | The subagent's returned findings match the schema `{file, line, summary, failure_scenario}` and the parent's #388 table renders directly from that schema without re-analysis | Static check of the subagent prompt and the table-rendering step; behavioral check on one replayed session. |
| SC-004 | Zero-findings and error paths preserved | Zero-findings still prompts the operator via `AskUserQuestion`; subagent hard-error still routes to Error handling without prompting | Smoke test with a synthetic zero-findings case and a synthetic subagent error return. |
| SC-005 | Plan-doc principle amendment is present and coherent | The "except built-in `/code-review`" exception is removed from the plan doc's §self-contained commands; the replacement wording specifies subagent-boundary composition | Grep the plan doc for the removed phrase (must not appear) and the new wording (must appear once). |
| SC-006 | No third prompt-side mitigation is added to the outer playbook | The change adds no new "MUST" clauses, checklists, or terminal-outcome extensions to `review.md` beyond what #384/#388 shipped | Diff review of `review.md`: the fix is structural (subagent boundary), not textual reinforcement. |
| SC-007 | Sibling cockpit playbooks confirmed uninfluenced | A one-line PR-description assessment records that `clarify.md`, `merge.md`, `queue.md` do not inline-invoke another slash command today | Grep sibling playbooks for slash-command-invocation patterns; record result in the PR body. |

## Assumptions

- The Agent tool is available inside cockpit playbook sessions and can be invoked from within `review.md`'s execution context (matches the tool availability observed in current smoke-test sessions).
- A `code-reviewer` agent type may or may not exist in the target environment; the playbook falls back to a general agent with an inline review prompt when it does not, and this fallback carries the same findings schema.
- The subagent's environment has access to the PR diff being reviewed (equivalent to what inline `/code-review` sees today) via the review scope carried in the invocation prompt.
- The `AskUserQuestion` tool remains the gate primitive on the parent side — the isolation does not change the gate shape, only the analysis boundary.
- Cockpit v1 continues to operate in assist mode (human approves gates). Any auto-approval on zero findings would be a policy change out of scope for this fix.
- The plan doc governs future cockpit commands as a normative principle; amending it here is sufficient to bind future authors, without a separate migration of already-shipped sibling playbooks (they don't exhibit the anti-pattern today).

## Out of Scope

- Any change to the `/code-review` skill itself, or to its output schema. The fix consumes `/code-review`'s existing shape.
- Retroactive isolation of sibling cockpit playbooks (`clarify.md`, `merge.md`, `queue.md`) — none of them inline-invoke another slash command today; a one-line PR-description assessment records that.
- Changing the `AskUserQuestion` three-option shape (`approve` / `request-changes` / `abort`) or the fused step's structure from #388.
- Post-decision execution branches (steps 5-7 post-#388 renumber). They remain as shipped.
- Auto-approval on zero findings (deferred autonomy policy).
- Runtime probes to detect the missing-prompt condition — isolation removes the trigger; detection is not needed.
- Adding a third prompt-side mitigation to the outer playbook as a hedge against isolation not working. If isolation fails, that is a new observed defect and a new issue, not a pre-emptive belt in this one.

---

*Generated by speckit*
