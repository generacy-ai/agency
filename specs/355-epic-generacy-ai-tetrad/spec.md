# Feature Specification: /cockpit:merge command

**Branch**: `355-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft
**Issue**: generacy-ai/agency#355 | **Epic**: generacy-ai/tetrad-development#85 (P2 / A2.5, v1-core)

## Summary

Add the `/cockpit:merge` slash command to the `claude-plugin-cockpit` Claude Code plugin. The command invokes `generacy cockpit merge` for the PR associated with the current branch. When checks are green and approval is in place, the PR is merged. When checks are red, the command spawns a fixer subagent to resolve them, then re-evaluates status. Under no circumstances does the command merge while checks are red.

**Owns (isolation):** `packages/claude-plugin-cockpit/commands/merge.md` (single file)

**Depends on:**
- G1.3 — the `generacy cockpit merge` CLI verb exists and exposes the underlying merge/fix workflow.
- A1.4 (#350) — the `claude-plugin-cockpit` plugin is scaffolded with a `/cockpit` namespace and `commands/` directory.

Part of the Epic Cockpit. Plan: `docs/epic-cockpit-plan.md` in tetrad-development (P2 / A2.5).

## User Stories

### US1: Safely merge an approved PR from inside Claude Code

**As a** developer working in Claude Code with an open, approved PR,
**I want** to run `/cockpit:merge` and have it merge the PR when checks are green, or attempt to fix and re-evaluate when they are red,
**So that** I don't have to leave the editor, manually triage CI failures, or risk merging while checks are failing.

**Acceptance Criteria**:
- [ ] Running `/cockpit:merge` against a branch with an approved PR and green checks results in the PR being merged.
- [ ] Running `/cockpit:merge` against a branch with red checks does NOT merge; instead it routes to a fixer subagent.
- [ ] After the fixer subagent runs, status is re-evaluated and the merge proceeds only if checks are now green.
- [ ] If checks remain red after the fixer attempt, the command stops and reports the failing checks rather than merging.

### US2: Guarantee no red merges from the cockpit workflow

**As a** repository maintainer,
**I want** the `/cockpit:merge` command to be incapable of merging while any required check is red,
**So that** the cockpit workflow can be trusted to uphold branch-protection invariants even when used unattended.

**Acceptance Criteria**:
- [ ] The command has no flag or path that bypasses the red-check guard.
- [ ] On red, the only outcomes are: (a) route to fixer and re-evaluate, or (b) stop and report.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Provide a `/cockpit:merge` slash command at `packages/claude-plugin-cockpit/commands/merge.md`. | P1 | Single-file isolation per epic. |
| FR-002 | The command invokes `generacy cockpit merge` for the PR associated with the current branch. | P1 | CLI verb is owned by G1.3. |
| FR-003 | When checks are green and approval is in place, the command merges the PR. | P1 | Honors the approval gate from the underlying verb. |
| FR-004 | When checks are red, the command spawns a fixer subagent tasked with resolving the failing checks. | P1 | Fixer prompt/contract referenced, not defined here. |
| FR-005 | After the fixer subagent finishes, the command re-evaluates check status before deciding to merge. | P1 | Loop guard: see FR-007. |
| FR-006 | The command never merges while any required check is red. | P1 | Hard invariant — no override. |
| FR-007 | The command terminates without merging if checks remain red after the fixer pass, reporting the failing checks. | P1 | Prevents unbounded fix/re-evaluate loops. |
| FR-008 | The command emits terse, structured output describing the path taken (merged, fixed-then-merged, or stopped-on-red). | P2 | Aligned with existing cockpit command style. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Green-path merges complete via `/cockpit:merge` without manual intervention. | 100% of approved+green PRs in test scenarios merge on first invocation. | Manual + scripted plugin tests against fixture PRs. |
| SC-002 | Red-path PRs are never merged by the command. | 0 red merges across all test scenarios. | Plugin test: red CI state → assert no merge call. |
| SC-003 | Red-path PRs are routed to a fixer subagent. | 100% of red invocations spawn the fixer. | Plugin test: red CI state → assert fixer subagent invoked. |
| SC-004 | Post-fixer re-evaluation gates the merge. | Merge only occurs if post-fix status is green. | Plugin test: simulate fixer success vs. failure → assert merge only on success. |

## Assumptions

- The `generacy cockpit merge` CLI verb (G1.3) handles PR lookup, status checks, approval verification, and the actual merge call.
- The `claude-plugin-cockpit` plugin scaffold (A1.4 / #350) is merged before this work starts; the `/cockpit` namespace is already registered.
- A fixer subagent contract exists (or is being delivered alongside this) — this command only needs to know how to spawn it and read back its completion signal.
- The current branch has an associated PR. Handling of "no PR found" is delegated to the underlying verb.

## Out of Scope

- Implementing or modifying the `generacy cockpit merge` CLI verb itself (owned by G1.3).
- Implementing the fixer subagent's prompt, tools, or fix logic.
- Defining what counts as a "required check" — this comes from branch protection and the CLI verb.
- Other cockpit commands (e.g., `/cockpit:open`, `/cockpit:status`); each is owned by a separate issue.
- UI surfaces outside Claude Code (VS Code extension, CLI-only flows).

---

*Generated by speckit*
