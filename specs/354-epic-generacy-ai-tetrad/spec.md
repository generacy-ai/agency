# Feature Specification: `/cockpit:review` command (Epic Cockpit A2.4)

**Branch**: `354-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft

## Summary

Epic: generacy-ai/tetrad-development#85 | Phase: P2 | Tier: v1-core | Issue: A2.4

Ship the `/cockpit:review` slash command as `packages/claude-plugin-cockpit/commands/review.md`. The command reviews the artifact for a given speckit gate on the current child issue/PR, summarises it, and — on developer approval — advances the gate label by delegating to `/cockpit:advance --gate <name>`.

Behaviour splits by gate:

- **`impl` gate**: locate the open PR for the child issue, gather review context via `/cockpit:review-context`, run `/code-review` against the diff, and surface a structured summary (findings, blockers, suggested decision). On approval, call `/cockpit:advance --gate impl`.
- **All other gates** (`specify`, `clarify`, `plan`, `tasks`, etc.): read the relevant artifact (e.g. `specs/<feature>/spec.md`, `plan.md`, `tasks.md`), produce a structured summary, and on approval call `/cockpit:advance --gate <name>`.

Owns (isolation): `packages/claude-plugin-cockpit/commands/review.md`

Depends on: A1.4 (cockpit plugin scaffold — #350, landed), G1.2 (`/cockpit:advance`), G1.3 (`/cockpit:review-context`).

---
Part of the Epic Cockpit. Plan: docs/epic-cockpit-plan.md in tetrad-development (P2 / A2.4).

## User Stories

### US1: Review a child PR before advancing the `impl` gate

**As a** developer running an epic with the cockpit plugin,
**I want** to invoke `/cockpit:review --gate impl` against a child issue,
**So that** I get a `/code-review` summary of the open PR and can approve the `impl` gate in one step without context-switching to another tool.

**Acceptance Criteria**:
- [ ] Command resolves the open PR for the current child issue via review-context.
- [ ] Runs `/code-review` against the PR diff and produces a structured summary (findings grouped by severity, suggested decision).
- [ ] Prompts the developer to approve, request changes, or abort.
- [ ] On approval, delegates to `/cockpit:advance --gate impl` and reports the resulting label change.
- [ ] If no open PR exists, fails fast with a clear message — does not advance the label.

### US2: Review a non-`impl` artifact gate

**As a** developer iterating through speckit phases,
**I want** to invoke `/cockpit:review --gate <name>` for `specify`, `clarify`, `plan`, or `tasks`,
**So that** the agent summarises the corresponding artifact (`spec.md`, `clarifications.md`, `plan.md`, `tasks.md`) and advances the gate label once I approve.

**Acceptance Criteria**:
- [ ] Maps each non-`impl` gate to its canonical artifact path under `specs/<feature>/`.
- [ ] Produces a summary of the artifact (scope, key decisions, gaps).
- [ ] On approval, delegates to `/cockpit:advance --gate <name>`; on rejection, leaves labels untouched and returns the open issues.

### US3: Discoverable gate set

**As a** new user of the cockpit plugin,
**I want** `/cockpit:review` to list the supported gates when called with no arguments or `--help`,
**So that** I can learn the workflow without reading external docs.

**Acceptance Criteria**:
- [ ] Bare invocation prints the supported gate names and one-line descriptions.
- [ ] Unknown gate values fail with a message listing the valid values.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Ship `/cockpit:review` as `packages/claude-plugin-cockpit/commands/review.md`, callable as a Claude Code slash command once the plugin is installed. | P1 | |
| FR-002 | Accept a required `--gate <name>` argument matching a known gate. | P1 | Gate set: `specify`, `clarify`, `plan`, `tasks`, `impl` (extensible). |
| FR-003 | For `--gate impl`, invoke `/cockpit:review-context` to fetch PR + diff context, then `/code-review` to produce findings. | P1 | Depends on G1.3. |
| FR-004 | For non-`impl` gates, read the canonical artifact for the current feature and produce a structured summary. | P1 | Artifact paths derived from active branch / current spec dir. |
| FR-005 | Produce a structured summary (severity-grouped findings, blockers, suggested decision) and prompt the developer for approve / changes-requested / abort. | P1 | Output format identical across gates to keep the UX consistent. |
| FR-006 | On approval, invoke `/cockpit:advance --gate <name>` and report the resulting label transition. | P1 | Depends on G1.2. |
| FR-007 | On rejection or abort, leave gate labels untouched and surface the open items. | P1 | Never mutate labels without explicit approval. |
| FR-008 | Fail fast with actionable messages when prerequisites are missing (no PR for `impl`, no artifact for other gates, unknown gate name). | P1 | |
| FR-009 | Bare/`--help` invocation lists the supported gates with one-line descriptions. | P2 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Plugin installation surfaces `/cockpit:review` in the Claude Code slash-command palette. | Visible after install | Manual smoke after `pnpm install` + plugin install. |
| SC-002 | `/cockpit:review --gate impl` on a real PR produces a `/code-review` summary and (on approval) advances the `gate:impl` label. | End-to-end on one real epic child PR | Manual run on a fixture child issue/PR. |
| SC-003 | `/cockpit:review --gate <non-impl>` summarises the right artifact and advances the matching label on approval. | One run per non-impl gate | Manual run against an in-progress feature branch. |
| SC-004 | Rejected reviews never mutate labels. | 0 unauthorised label changes | Inspect `gh issue view` after a rejected run. |

## Assumptions

- A1.4 (the cockpit plugin scaffold from #350) is landed and provides the plugin manifest, marketplace entry, and `commands/` directory.
- G1.2 (`/cockpit:advance`) and G1.3 (`/cockpit:review-context`) ship before or alongside this command and expose stable contracts.
- `/code-review` is available in the host Claude Code environment (it is — see `code-review` in the skill list).
- The current branch / working directory unambiguously identifies the active speckit feature and its `specs/<feature>/` directory.
- Gate labels follow the `gate:<name>` convention used elsewhere in the cockpit epic.

## Out of Scope

- Implementing `/cockpit:advance` (G1.2) or `/cockpit:review-context` (G1.3) — this issue only consumes them.
- Posting review summaries as PR comments (handled by the `code-review --comment` flag on the host skill, not by this command).
- Multi-gate batch review in a single invocation.
- Automated (non-interactive) approval — every gate transition requires explicit developer confirmation.
- Changes to the cockpit plugin manifest, marketplace entry, or any package outside `packages/claude-plugin-cockpit/commands/review.md`.

---

*Generated by speckit*
