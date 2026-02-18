# Feature Specification: Integrate Label Protocol for Clarification and Phase Management

**Branch**: `226-update-spec-kit-agency` | **Date**: 2026-02-18 | **Status**: Draft

## Summary

Update the spec-kit Agency plugin to work with the label-driven workflow protocol. Instead of routing clarifications through Humancy, the plugin posts structured comments to GitHub issues and manages labels via the IssueTracker facet. This enables fully automated phase transitions orchestrated by labels, removing the Humancy dependency for MVP.

## User Stories

### US1: Automated Clarification via GitHub Comments

**As a** developer using the autodev workflow,
**I want** clarification questions posted as structured GitHub issue comments,
**So that** I can answer them directly on the issue without a separate Humancy interface.

**Acceptance Criteria**:
- [ ] Clarification questions are posted as numbered GitHub issue comments with `<!-- generacy-clarification:batch-N -->` HTML markers
- [ ] Follow-up batches increment batch number (batch-2, batch-3, etc.)
- [ ] Comments include answer format instructions for the reviewer
- [ ] Agent can read answers from subsequent issue comments

### US2: In-Place Stage Progress Comments

**As a** project manager or reviewer,
**I want** consolidated stage comments on each issue showing specification, planning, and implementation progress,
**So that** I can see the current status at a glance without scrolling through many comments.

**Acceptance Criteria**:
- [ ] Three stage comments are created per issue: specification, planning, implementation
- [ ] Each stage comment uses `<!-- generacy-stage:<stage> -->` HTML markers for identification
- [ ] Stage comments are updated in-place (edited, not re-posted) as phases progress
- [ ] Each comment shows command progress (pending/in_progress/complete) and next step

### US3: Label-Driven Phase Management

**As a** workflow orchestrator (autodev plugin),
**I want** the spec-kit plugin to manage phase and completion labels on issues,
**So that** phase transitions and review gates can be driven by label state.

**Acceptance Criteria**:
- [ ] `waiting-for:clarification` label added when questions are posted, removed when answered
- [ ] `completed:specify`, `completed:clarify`, `completed:plan`, `completed:tasks`, `completed:implement` labels added after each phase
- [ ] `phase:*` labels updated to reflect the current working phase
- [ ] Label operations use the IssueTracker facet (backlog-system-agnostic)

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Post structured clarification comments with `<!-- generacy-clarification:batch-N -->` markers | P1 | Replaces Humancy routing |
| FR-002 | Support follow-up clarification batches (batch-2, batch-3, etc.) | P1 | Sequential batch numbering |
| FR-003 | Include answer format instructions in clarification comments | P1 | Guide reviewers on how to respond |
| FR-004 | Read and parse answers from subsequent issue comments | P1 | Match answers to questions |
| FR-005 | Create and update three stage comments per issue (specification, planning, implementation) | P1 | In-place updates via HTML markers |
| FR-006 | Add `waiting-for:clarification` label when questions posted | P1 | Signals reviewer action needed |
| FR-007 | Add `completed:<phase>` labels after each phase completes | P1 | Enables review gate checks |
| FR-008 | Update `phase:*` labels through phase transitions | P1 | Shows current workflow phase |
| FR-009 | Use IssueTracker facet for all label and comment operations | P2 | Backlog-system-agnostic |
| FR-010 | Remove Humancy dependency from clarification flow | P1 | MVP scope reduction |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Clarification comments follow structured format | 100% of batches | Manual review of posted comments |
| SC-002 | Labels correctly managed through phase transitions | All transitions correct | Automated label state verification |
| SC-003 | Stage comments updated in-place | No duplicate stage comments | Check issue comment count per stage |
| SC-004 | Works with GitHub Issues via IssueTracker facet | All operations succeed via facet | Integration test against GitHub API |
| SC-005 | No Humancy dependencies remain in clarification path | Zero Humancy imports in clarify flow | Static analysis of imports |

## Assumptions

- GitHub CLI (`gh`) is authenticated and available in the environment
- The IssueTracker facet interface is stable and supports label and comment operations
- The autodev plugin handles orchestration and calls spec-kit tools in sequence
- Label names follow the convention: `phase:<name>`, `completed:<name>`, `waiting-for:<name>`
- The existing `manage-clarifications` tool will be extended (not replaced) to support GitHub comment mode

## Out of Scope

- Humancy integration (deferred to post-MVP)
- Jira or Shortcut label/comment support (GitHub-only for now)
- Review gate enforcement logic (handled by autodev plugin)
- Label creation/configuration (assumes labels already exist on the repo)
- Comment notification/webhook handling

## Technical Context

### Existing Code

- **manage-clarifications tool** (`packages/agency-plugin-spec-kit/src/tools/manage-clarifications.ts`): Currently supports read/append/update_answer operations on `clarifications.md` file. Needs extension for GitHub comment posting mode.
- **GitHub provider** (`packages/agency-plugin-spec-kit/src/providers/github.ts`): Already has `setLabels()` and `getLabels()` methods via BacklogProvider interface.
- **Clarification types** (`packages/agency-plugin-spec-kit/src/types/clarification.ts`): Existing type definitions for questions, batches, and status tracking.
- **Plugin manifest** (`packages/agency-plugin-spec-kit/src/manifest.ts`): Currently declares Humancy as a dependency.

### Related

- Parent epic: agency#139 (Rebuild spec-kit as Agency plugin)
- Protocol spec: [label-protocol.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/label-protocol.md)

---

*Generated by speckit*
