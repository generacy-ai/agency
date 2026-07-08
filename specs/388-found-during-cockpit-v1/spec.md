# Feature Specification: Fuse cockpit review findings presentation and approval prompt into one turn to close the gate decay window

**Branch**: `388-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Draft

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #25 — second occurrence of the skipped approval gate, this time WITH #384's fixes deployed and previously observed working (the same session ran an approve flow and a request-changes flow correctly earlier in its history).

Observed: `/cockpit:review 3 --gate implementation-review` performed a long free-form investigation (git merge-tree conflict analysis across several Bash calls), printed findings as raw JSON (violating #384's strengthened step 3), and ended its turn — no `AskUserQuestion`, no action, no terminal-outcome marker. The #384 Terminal Outcome Check block never fired because it is passive text at the end of the playbook: it constrains a model that re-reads its instructions before ending, and long investigations are precisely when that re-read doesn't happen. Pattern: gate adherence is inversely correlated with the length of the step-3 analysis; the backstop fails exactly when it's needed.

**Fix — make the gate structural rather than positional: fuse steps 3/4 and 5.** The findings presentation and the approval prompt become ONE step with the rule: *"The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt."* The `AskUserQuestion`'s question text carries the compact findings table (or its header + count when size-limited, with the full table printed immediately before the tool call in the same response). This leaves no turn boundary between analysis and gate — the decay window is closed by construction, and the raw-JSON regression is fixed by the same fusion (the table must be rendered to feed the prompt).

Keep the Terminal Outcome Check as the secondary backstop (it still covers steps 6-8), but the primary guarantee moves from "remember at the end" to "the deliverable IS the prompt."

Live evidence: the `christrudelpw/sniplink#3` re-review session (2026-07-08); first occurrence was agency#384's trigger. Both had long step-3 analyses; the short-analysis runs in between adhered perfectly.

All changes are to `packages/claude-plugin-cockpit/commands/review.md` (plus its inlined `## Examples` section). Sibling cockpit playbooks (e.g., `clarify.md`, `merge.md`) are out of scope for this pass.

## User Stories

### US1: Cockpit reviewer never ends a turn between findings and the approval prompt

**As a** cockpit operator running `/cockpit:review <n> --gate <phase>`,
**I want** the findings summary and the approval prompt to arrive in the same response — the summary always visible as prose, the `AskUserQuestion` call in the same turn,
**So that** the approval gate cannot be skipped by a long step-3 analysis (as observed in generacy-ai/tetrad-development#88 finding #25) and I always see what I'm approving before I decide.

**Acceptance Criteria**:
- [ ] `review.md` contains ONE fused step (per Q4=A) covering both `--gate implementation-review` and the four artifact gates; the "summary is delivered AS PART OF the same response that invokes `AskUserQuestion`" rule sentence appears exactly once at the head of that step.
- [ ] In every non-error case (including zero-findings, per Q3=A), the fused step produces a response that contains the full summary as prose AND the `AskUserQuestion` invocation — never one without the other, never in separate turns.
- [ ] For `/code-review` hard errors (per Q3=A), the fused step routes to the existing Error handling block and does NOT invoke `AskUserQuestion`; the fusion rule does not apply when there is no analysis result.
- [ ] The "MUST NOT print raw JSON under any circumstance" clause (per Q5=A) sits inline immediately before the findings-summary table rendering instruction inside the implementation-review section of the fused step.
- [ ] The `Suggested decision: <approve|request-changes|abort>` line (per Q5=A) is retained in the pre-prompt prose, alongside the `AskUserQuestion` options.

### US2: Raw-JSON findings regression is closed by construction

**As a** cockpit operator watching the approval gate output,
**I want** the fusion to make it structurally impossible for raw `/code-review` JSON to reach me before the summary table,
**So that** I never see `{"findings": …}` prose and #384's "MUST NOT print raw JSON" clause is not the sole line of defense.

**Acceptance Criteria**:
- [ ] Because the `AskUserQuestion` payload embeds the findings-summary table (or the digest that points back to it), the table MUST be rendered before the tool call. Raw JSON in the response would leave no rendered table to embed → the payload is invalid → the fusion rule is violated.
- [ ] The retained "MUST NOT print raw JSON" clause is placed inline immediately before the table-rendering instruction (per Q5=A), enforcing at the point of behavior, not as a distant preamble.

### US3: Terminal Outcome Check remains a scoped secondary backstop

**As a** cockpit operator whose session survives to steps 6-8 (execution of the operator's decision),
**I want** the Terminal Outcome Check block to continue guarding those emission markers (`Labels:`, `Feedback posted:`, `Aborted:`),
**So that** decay after the fused gate step — e.g., between `AskUserQuestion` returning and the corresponding side effect running — still has a fail-closed guard.

**Acceptance Criteria**:
- [ ] The Terminal Outcome Check block from #384 remains at the end of `review.md`, `<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->` fence markers intact.
- [ ] The block's marker list (`Labels:` / `Feedback posted:` / `Aborted:`) is unchanged.
- [ ] Whether the block's rationale comment and the re-invoke-only-step-5 fallback are modified is deferred to Batch 2 clarifications (Q8, still open); this US does not lock either decision.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Fuse current step 3 (implementation-review analysis) and current step 4 (artifact-review analysis) with the approval-prompt step (current step 5) into ONE new fused step whose body branches internally on `--gate` and terminates in a shared `AskUserQuestion` invocation. | P1 | Q4=A: one fused step, one rule sentence, internal branching, ONE prompt spec — no two prompt copies that can drift apart. Steps 6/7/8 renumber to 5/6/7. |
| FR-002 | The fused step's rule sentence: *"The findings summary is delivered AS PART OF the same response that invokes `AskUserQuestion` — presenting findings in a response that does not invoke `AskUserQuestion` is a protocol violation. Do not end a response between completing the analysis and invoking the prompt."* | P1 | Appears exactly ONCE at the head of the fused step (Q4=A). Greppable via SC-003. |
| FR-003 | In every non-error case (normal AND digest-fallback), the full summary MUST be printed as prose in the response body immediately before the `AskUserQuestion` call. The `question` field additionally embeds the table (normal) or the digest (fallback). | P1 | Q1=A: uniform response shape; operator visibility is unconditional and client-independent. FR-004's fallback becomes a special case of this general rule, not a divergent branch. |
| FR-004 | When the summary payload exceeds `AskUserQuestion`'s size budget, the `question` field carries a compact digest instead of the full table. The digest MUST include: the artifact/PR identifier, blocking finding count, non-blocking finding count, and a pointer such as "see table above" (which references the always-present prose from FR-003). | P2 | Q2=A: trigger is model judgment (~4 KB rough guide from Assumptions), NOT a hard numeric threshold — a playbook executor cannot count bytes accurately. Digest format is illustrative with the required content elements; the example `Review of PR #<n>: N findings (B blocking, NB non-blocking) — see table above` is one valid rendering. |
| FR-005 | Operators experience one uniform gate shape across all five gate types (implementation-review + four artifact gates): findings/artifact summary as prose, then `AskUserQuestion` with `approve` / `request-changes` / `abort` options — always in the same turn. | P1 | Delivered by FR-001 (one fused step) + FR-003 (prose always visible). |
| FR-006 | The existing "MUST NOT print raw JSON under any circumstance" clause is retained VERBATIM, placed INLINE within the implementation-review section of the fused step, immediately before the findings-summary table rendering instruction. | P1 | Q5=A: enforcement at the point of behavior — same principle as #384's Q5 resolution. |
| FR-007 | The `Suggested decision: <approve|request-changes|abort>` line is retained in the pre-prompt prose. | P2 | Q5=A: not redundant with the `AskUserQuestion` options — the options name the three choices, the line names Claude's recommendation. Assist-mode contract (Claude drafts, human decides) rendered explicitly. |
| FR-008 | Zero-findings case: the fused step still invokes `AskUserQuestion` with the empty-row table (`\| (none) \| \| \| \|`) inside `question` text, exactly as current step 3 renders today. | P1 | Q3=A: assist-mode means the human approves gates; auto-approving zero-findings would be the deferred autonomy policy sneaking in through a side door. |
| FR-009 | `/code-review`-error case: apply the existing Error handling block (class `OTHER`), do NOT invoke `AskUserQuestion`. The fusion rule does not apply when there is no analysis result. | P1 | Q3=A: a decision prompt with no analysis behind it manufactures consent. Error handling is already a legitimate non-zero terminal outcome; the Terminal Outcome Check's markers don't apply to that exit path. |
| FR-010 | The existing Terminal Outcome Check block is retained at end-of-file with fence markers and marker list intact, functioning as a secondary backstop covering steps 6-8 (post-renumber: 5-7). | P2 | Primary guarantee moves from "remember at the end" (positional) to "the deliverable IS the prompt" (structural, via FR-001+FR-003). Rationale-comment and fallback edits remain open pending Batch 2 Q8. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Approval-gate skip rate on long step-3 analyses | 0 skips across the cockpit v1 smoke test population that previously triggered generacy-ai/tetrad-development#88 findings #24 and #25 | Manual review of a curated corpus of long-analysis review sessions after the change lands. |
| SC-002 | Findings-summary visibility to the operator | The full findings summary is visible as prose in the response body in 100% of non-error cases (normal AND digest-fallback), independent of client rendering of `AskUserQuestion.question` text | Grep the resulting `review.md` for the FR-003 prose-first instruction; smoke-test on a client that does not render `question` text. |
| SC-003 | Greppability of the fusion rule | The FR-002 rule sentence appears exactly ONCE in `review.md` and is grep-recoverable via a stable phrase (e.g., `delivered AS PART OF the same response that invokes AskUserQuestion`) | `grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" review.md` returns 1. |
| SC-004 | Raw-JSON regression check | The retained "MUST NOT print raw JSON" clause remains verbatim and is located inline before the findings-summary table rendering instruction | Grep for the clause phrase; visual inspection confirms placement. |
| SC-005 | Zero-findings and error-path preservation | Zero-findings still prompts the operator; `/code-review` hard error routes to Error handling without prompting | Smoke test with a synthetic zero-findings case and a synthetic `/code-review` non-zero exit. |

## Assumptions

- `AskUserQuestion` clients differ in how they render `question` text; some show only a short chip. FR-003's prose-first requirement makes summary visibility independent of that client behavior.
- `~4 KB` of `question` text is sufficient for the vast majority of reviews; the exact `AskUserQuestion` size budget is a tool-runtime concern, so the digest fallback trigger (FR-004) is model judgment rather than a numeric threshold.
- The Terminal Outcome Check remains useful as a secondary backstop for post-gate steps but is no longer the primary guarantee for gate adherence.
- Cockpit v1 continues to operate in assist mode (human approves gates); any auto-approval on zero findings would be a policy change out of scope for this fix.
- The playbook's authors and reviewers treat the "protocol violation" sentence as a hard rule, not a suggestion — mirroring the tone of existing hard rules in the cockpit command files.

## Out of Scope

- Any change to the deferred autonomy policy (e.g., auto-approving zero-findings runs).
- Changes to `/code-review` itself, or to its output schema.
- Retroactive fusion of analysis-and-prompt steps in sibling cockpit command files (e.g., `clarify.md`, `merge.md`). Sensible follow-up but not part of this change.
- Client-side rendering fixes for `AskUserQuestion.question` — FR-003 sidesteps this via prose-first delivery instead of trying to normalize clients.
- Adding runtime probes (`gh api`, `generacy cockpit status`) to detect the missing-prompt condition. Fusion is a source-side fix; detection is not needed if the boundary is gone.
- Rewriting the post-decision execution branches (current steps 6-8). They remain as shipped in #384.
- Changing the three-option `AskUserQuestion` shape (`approve` / `request-changes` / `abort`) or their order.

---

*Generated by speckit*
