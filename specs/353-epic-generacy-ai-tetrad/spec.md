# Feature Specification: /cockpit:clarify command

**Branch**: `353-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft
**Issue**: [generacy-ai/agency#353](https://github.com/generacy-ai/agency/issues/353)
**Parent Epic**: [generacy-ai/tetrad-development#85](https://github.com/generacy-ai/tetrad-development/issues/85) — Epic Cockpit
**Phase / Tier / Issue**: P2 / v1-core / A2.3
**Depends on**: G1.2 (`generacy cockpit clarify-context` CLI verb), A1.4 (`claude-plugin-cockpit` scaffold)

## Summary

Ship a Claude Code slash command, `/cockpit:clarify`, that runs the developer side of the speckit clarification gate against an open epic-child issue. Within the cockpit plugin, this command pulls the live clarification context for the active child issue via `generacy cockpit clarify-context`, drafts answers using the local spec, plan, and code as evidence, presents the drafted answers to the developer for approval, and on approval posts a marked answer comment to the issue and advances the gate by invoking `generacy cockpit advance --gate clarification`.

This is one of the five P2 v1-core verbs that complete the daily "watch and approve" loop on top of the cockpit engine (sibling commands: `/cockpit:watch`, `/cockpit:status`, `/cockpit:review`, `/cockpit:merge`). The verb lives entirely in `packages/claude-plugin-cockpit/commands/clarify.md` and does not change any shared package.

## User Stories

### US1: Developer drafts and approves clarification answers from the editor

**As a** developer driving a speckit epic in Claude Code,
**I want** to run `/cockpit:clarify` against the active child issue and get a draft of answers grounded in the repo,
**So that** I can review and approve the answers in place instead of context-switching to the issue, reading the spec, and typing them by hand.

**Acceptance Criteria**:
- [ ] Running `/cockpit:clarify` with no arguments resolves the active child issue from the current branch (pattern `###-*`) and calls `generacy cockpit clarify-context` to obtain the open questions and their context.
- [ ] If `generacy cockpit clarify-context` reports no open clarification questions, the command exits successfully with a "nothing to clarify" message and does not post anything.
- [ ] For each open question, the command drafts an answer using `spec.md`, `plan.md` (if present), and a targeted read of relevant code, and renders the drafts in the conversation in the canonical `Q[N]: answer` answer format expected by the speckit clarify resume flow.
- [ ] The drafts are presented for explicit approval before any external side effect; the developer may approve all, approve a subset, edit individual answers, or reject the batch.
- [ ] On approval, the command posts a single issue comment containing only the approved answers, marked with the `<!-- generacy-cockpit:clarification-answers -->` HTML marker so resume tooling can identify it deterministically.
- [ ] After the comment posts, the command invokes `generacy cockpit advance --gate clarification` to advance the workflow gate, and surfaces the resulting state back to the developer.

### US2: Safe failure when nothing should be posted

**As a** developer running `/cockpit:clarify`,
**I want** the command to never post a comment or advance the gate unless I explicitly approved,
**So that** an aborted run, a rejected draft, or a failed draft step leaves the issue and the gate untouched.

**Acceptance Criteria**:
- [ ] If the developer rejects the drafted batch, no comment is posted and `generacy cockpit advance` is not called.
- [ ] If `generacy cockpit clarify-context` fails or the underlying CLI is missing, the command reports the error and exits non-zero without attempting to post or advance.
- [ ] If the post-comment step fails, the command does not call `generacy cockpit advance --gate clarification`.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | The command file lives at `packages/claude-plugin-cockpit/commands/clarify.md` and registers as `/cockpit:clarify` via the existing plugin scaffold (A1.4). | P1 | Owns-isolation boundary from the epic plan. |
| FR-002 | The command resolves the target issue number from the current git branch using the `###-*` convention, matching the convention used by `/speckit:*`. | P1 | Optional explicit `--issue <n>` argument may be supported for off-branch use. |
| FR-003 | The command obtains clarification context exclusively via `generacy cockpit clarify-context` (no direct GitHub API calls for question retrieval). | P1 | Depends on G1.2 from the parent epic. |
| FR-004 | Drafted answers cite the source they came from (spec section, plan section, or file path) inline so the developer can review provenance. | P1 | Keeps drafts auditable. |
| FR-005 | The posted comment uses the canonical answer format `Q[N]: <answer>` and includes the `<!-- generacy-cockpit:clarification-answers -->` HTML marker on the first line. | P1 | Required so the speckit clarify resume path can locate the comment unambiguously. |
| FR-006 | The command posts at most one comment per invocation, regardless of how many questions are answered. | P1 | Avoids comment-spam on the issue. |
| FR-007 | The command calls `generacy cockpit advance --gate clarification` only after a successful comment post and only when at least one approved answer was posted. | P1 | Gate advance is a side effect of approval, not of running. |
| FR-008 | The command surfaces the post URL and the result of `cockpit advance` back to the developer at the end of the run. | P2 | Lets the developer verify in one glance. |
| FR-009 | The command supports a dry-run mode (e.g., `--dry-run`) that renders the draft and the comment body but skips the post and advance. | P2 | Useful for previewing without engaging the gate. |
| FR-010 | The command is fully developer-driven and does not run in `--headless` mode; the headless clarification flow remains owned by `/speckit:clarify`. | P1 | Cockpit verbs are the developer-side counterpart; no agent-only path is in scope here. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Correctly-formatted answer drafted from spec+plan+code for a representative open clarification question. | 100% on the acceptance fixture in the epic plan. | Manual run against a fixture issue; verify the posted comment parses cleanly through the speckit clarify resume flow. |
| SC-002 | No issue comment is posted and no gate is advanced unless the developer approves. | 0 unintended posts across the acceptance fixtures (approve / edit / reject paths). | Inspect issue comments after rejection and abort scenarios in fixture testing. |
| SC-003 | A successful approval produces exactly one issue comment with the cockpit marker, and the gate advances to the next state on the same invocation. | 1 marked comment + gate state changes to the post-clarification state in the same run. | Read back issue comments and `generacy cockpit status` (sibling A2.2) after a successful run. |
| SC-004 | A failure in either `clarify-context` or `cockpit advance` is reported with a clear error and does not leave the issue in an inconsistent state. | 100% on failure-injection fixtures. | Inject CLI failure for each leg; verify no partial side effect remains. |

## Assumptions

- The `generacy cockpit` CLI (epic phase P1, generacy-ai/generacy#788) is installed and on `PATH` at the time the command runs, exposing both `clarify-context` and `advance --gate clarification`. The verb file does not vendor its own copy of either subcommand.
- The `claude-plugin-cockpit` scaffold (#350 / A1.4) is in place, so dropping `commands/clarify.md` is sufficient to register the verb.
- The active child issue follows the speckit branch convention `###-short-name`, matching what `/speckit:*` already assumes.
- The speckit clarify resume path keys off an HTML marker on the comment; this spec assumes the marker `<!-- generacy-cockpit:clarification-answers -->`. The exact marker string is finalized at implementation time against the cockpit engine.
- GitHub authentication is handled by the developer's existing `gh` / cockpit CLI configuration; the verb does not manage tokens.
- Drafting uses only on-disk artifacts (spec.md, plan.md, repository code) plus the context returned by `clarify-context`; it does not call out to other CLIs or services for evidence.

## Out of Scope

- Headless/agent-mode clarification (owned by `/speckit:clarify` and the orchestrator gate system).
- Changes to the `generacy cockpit` engine or its `clarify-context` / `advance` subcommands (those land in generacy-ai/generacy#788 — G1.2).
- Implementation of any of the other `/cockpit:*` verbs (`watch`, `status`, `review`, `merge`, and the P4/P5 verbs).
- Modifications to `/speckit:clarify` or the underlying `manage_clarifications` MCP tool.
- New label semantics — this command uses the existing clarification gate labels; it does not introduce new labels.
- Posting follow-up clarification questions or re-running the clarify generation step; this verb only answers existing open questions.
- Multi-issue / multi-epic batch operation; one invocation targets one child issue.

---

*Generated by speckit*
