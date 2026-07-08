# Feature Specification: Fuse cockpit review findings presentation and approval prompt into one turn to close the gate decay window

**Branch**: `388-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Draft

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #25 — second occurrence of the skipped approval gate, this time WITH #384's fixes deployed and previously observed working (the same session ran an approve flow and a request-changes flow correctly earlier in its history).

Observed: `/cockpit:review 3 --gate implementation-review` performed a long free-form investigation (git merge-tree conflict analysis across several Bash calls), printed findings as raw JSON (violating #384's strengthened step 3), and ended its turn — no `AskUserQuestion`, no action, no terminal-outcome marker. The #384 Terminal Outcome Check block never fired because it is passive text at the end of the playbook: it constrains a model that re-reads its instructions before ending, and long investigations are precisely when that re-read doesn't happen. Pattern: gate adherence is inversely correlated with the length of the step-3 analysis; the backstop fails exactly when it's needed.

**Fix — make the gate structural rather than positional: fuse steps 3/4 and 5.** The findings presentation and the approval prompt become ONE step with the rule: *"The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt."* The `AskUserQuestion`'s question text carries the compact findings table (or its header + count when size-limited, with the full table printed immediately before the tool call in the same response). This leaves no turn boundary between analysis and gate — the decay window is closed by construction, and the raw-JSON regression is fixed by the same fusion (the table must be rendered to feed the prompt).

Keep the Terminal Outcome Check as the secondary backstop (it still covers steps 6-8), but the primary guarantee moves from "remember at the end" to "the deliverable IS the prompt."

Live evidence: the `christrudelpw/sniplink#3` re-review session (2026-07-08); first occurrence was agency#384's trigger. Both had long step-3 analyses; the short-analysis runs in between adhered perfectly.

All changes are to `packages/claude-plugin-cockpit/commands/review.md` (plus its inlined examples).

## User Stories

### US1: Long `/code-review` investigations cannot strand the operator

**As a** cockpit operator running `/cockpit:review --gate implementation-review` where `/code-review` runs a long, context-heavy sub-investigation,
**I want** the findings presentation and the approval prompt to occupy a single response,
**So that** instruction decay across a turn boundary cannot silently skip the approval gate — because there is no turn boundary to cross.

**Acceptance Criteria**:
- [ ] `review.md` fuses steps 3 (or 4) and 5 into one step. The findings-summary table (implementation-review) or three-section summary (other gates) is emitted in the same response as the `AskUserQuestion` invocation.
- [ ] The fused step carries an explicit rule sentence at its head: *"The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt."*
- [ ] The `AskUserQuestion` `question` text embeds the findings-summary table (or a header + finding-count digest when the payload exceeds the tool's size budget; in the digest case, the full table is printed in the same response, immediately before the tool call).
- [ ] Replaying the `sniplink#3` scenario (long merge-tree conflict investigation) results in the response ending WITH the `AskUserQuestion` tool call, not before it — verified by transcript inspection.

### US2: Raw-JSON findings regression is closed by construction

**As a** cockpit operator watching the approval gate output,
**I want** the fusion to make it structurally impossible for raw `/code-review` JSON to reach the operator before the summary table,
**So that** the operator never sees `{"findings": …}` prose and #384's "MUST NOT print raw JSON" clause is not the sole line of defense.

**Acceptance Criteria**:
- [ ] Because the `AskUserQuestion` payload embeds the findings-summary table, the table MUST be rendered before the tool call. Raw JSON in the response would leave no rendered table to embed → the payload is invalid → the fusion rule is violated.
- [ ] The existing step-3 "MUST NOT print raw JSON" clause (#384 FR-006) is retained verbatim as belt-and-braces reinforcement, not as the primary enforcement.

### US3: Terminal Outcome Check remains a scoped secondary backstop

**As a** cockpit operator whose session survives to steps 6-8 (the execution of the operator's decision),
**I want** the Terminal Outcome Check block to continue guarding those emission markers (`Labels:`, `Feedback posted:`, `Aborted:`),
**So that** decay after step 5 — e.g., between `AskUserQuestion` returning and the corresponding side effect running — still has a fail-closed guard.

**Acceptance Criteria**:
- [ ] The Terminal Outcome Check block from #384 remains at the end of `review.md`, `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` fence markers intact.
- [ ] The block's marker list (`Labels:` / `Feedback posted:` / `Aborted:`) and its re-invoke-step-5-only fallback are unchanged.
- [ ] The block's rationale comment is amended to record that step 5's invocation is now structurally guaranteed by the fusion in the fused findings-and-prompt step, and the check exists to cover post-decision execution (steps 6-8), not the pre-decision presentation step.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `review.md` MUST fuse the findings-presentation step (current step 3 for implementation-review, current step 4 for artifact gates) with the approval-prompt step (current step 5) into ONE step. The rendered summary (table or three-section) MUST be emitted in the same response as the `AskUserQuestion` tool call. | P1 | Structural fix — the decay window is closed by construction, not by "remember at the end." |
| FR-002 | The fused step MUST open with a rule sentence, verbatim or semantically equivalent: *"The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt."* | P1 | Named the protocol violation so it is greppable and reviewable. |
| FR-003 | The `AskUserQuestion` invocation MUST embed the findings-summary table (implementation-review) or the three-section summary (artifact gates) inside its `question` text. | P1 | Turns the summary into a required payload of the gate prompt — no summary, no valid prompt. |
| FR-004 | When the summary payload exceeds `AskUserQuestion`'s size budget, the `question` text MUST carry a header + finding-count digest (e.g., `Review of PR #<n>: 7 findings (3 blocking, 4 non-blocking) — see table above`), and the FULL summary MUST be printed in the same response, immediately before the tool call. | P1 | Preserves the "no turn boundary" guarantee even for large findings sets; the operator still sees the full table in-context. |
| FR-005 | The fusion MUST apply to BOTH the implementation-review branch (with `/code-review` findings) and the artifact-review branches (`spec-review`, `clarification-review`, `plan-review`, `tasks-review`), so operators experience one uniform gate shape. | P1 | Consistency — the failure mode is not implementation-review-specific; long artifact-summary steps could exhibit it too. |
| FR-006 | The existing "MUST NOT print raw JSON under any circumstance" clause in step 3 MUST be retained verbatim as belt-and-braces reinforcement. | P2 | Retained but no longer load-bearing; the fusion (FR-003) makes table rendering a hard prerequisite for a valid prompt payload. |
| FR-007 | The Terminal Outcome Check block MUST remain at the end of `review.md`, with its fence markers, marker list, and unbounded step-5-only fallback unchanged. | P1 | Secondary backstop for steps 6-8 (post-decision execution). |
| FR-008 | The Terminal Outcome Check block's rationale comment MUST be updated to record that step 5's invocation is now structurally guaranteed by the fusion, and that the check's job scope is post-decision execution (steps 6-8). | P2 | Documents the layering so future edits do not conflate the two guarantees. |
| FR-009 | The playbook's `## Examples` section MUST be updated so all examples show findings emitted in the same response as the `AskUserQuestion` tool call, not as a separate prior turn. | P2 | Examples double as few-shot reinforcement of the fusion rule. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | The `sniplink#3` scenario (long merge-tree conflict investigation) no longer strands the operator | The response containing the findings analysis ends WITH the `AskUserQuestion` tool call | Replay the smoke-test scenario; inspect transcript to confirm the tool call is present in the same response as the summary table. |
| SC-002 | Raw-JSON `/code-review` output never appears before the findings-summary table | Zero raw-JSON emissions across a replay of both the `sniplink#3` and prior long-investigation cases | Transcript inspection during smoke test. |
| SC-003 | The fusion rule is greppable in the command file | `grep -n 'protocol violation' packages/claude-plugin-cockpit/commands/review.md` returns the fused-step rule sentence | Static check on the repo. |
| SC-004 | The Terminal Outcome Check block still covers steps 6-8 | The block remains at end-of-file with intact fence markers and no marker removals | Static diff review vs. #384's shipped block. |

## Assumptions

- The failure mode is structural (turn boundary between analysis and prompt), not motivational. Making the prompt a required part of the analysis response eliminates the boundary, so no additional "reminder" text is needed to make the fix work.
- `AskUserQuestion` accepts a `question` text large enough to carry a compact findings-summary table for typical PR review sizes. Only oversized payloads require the header+digest fallback (FR-004); a rough working budget of ~4 KB of question text is sufficient for the vast majority of reviews. Exact limits are tool-runtime concerns and not fixed in this spec.
- The playbook's authors and reviewers treat the "protocol violation" sentence as a hard rule, not a suggestion. This mirrors the tone of existing hard rules in the cockpit command files.
- `/code-review`'s JSON-emitting behavior is unchanged by this work; the fusion routes around it by requiring the table before the prompt call, which forces rendering.

## Out of Scope

- Changing `/code-review`'s output format or teaching it to emit tables directly. The fusion routes around the JSON format at the caller side.
- Removing the Terminal Outcome Check block. It is retained as a secondary backstop for steps 6-8.
- Retroactively fusing analysis-and-prompt steps in other cockpit command files (e.g., `clarify.md`). Sensible follow-up but out of scope here.
- Adding runtime probes (`gh api`, `generacy cockpit status`) to detect the missing-prompt condition. Fusion is a source-side fix; detection is not needed if the boundary is gone.
- Rewriting steps 6-8 (the post-decision execution branches). They remain as shipped in #384.
- Changing the three-option `AskUserQuestion` shape (`approve` / `request-changes` / `abort`) or their order.

---

*Generated by speckit*
