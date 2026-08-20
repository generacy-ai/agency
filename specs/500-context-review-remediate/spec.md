# Feature Specification: Slim cockpit:auto to gates/queue/clarify/merge

**Branch**: `500-context-review-remediate` | **Date**: 2026-08-20 | **Status**: Draft

## Summary

The workflow engine now owns the review→remediate loop for implementation PRs (epic
generacy-ai/generacy#1120). The `cockpit:auto` playbook (`packages/claude-plugin-cockpit/commands/auto.md`)
must stop driving implementation review rounds from the cluster conversation. Its remaining
duties are: queueing, clarification relays, artifact-gate reviews (spec/plan/tasks), the two
new/moved engine gates (`waiting-for:remediation-limit` and the post-validate
`waiting-for:implementation-review` final approval), and merge on green. Removing the
review-round driving also cuts the PR-state polling that is a large share of the GitHub GraphQL
5k/hr rate-limit exhaustion.

## Context

Today `auto.md` drives review→request-changes→fix rounds itself: it dispatches reviewer/fixer
subagents against implementation PRs (D.3 `waiting-for:implementation-review`, D.6
`completed:validate` red → bounded fixer, G.2 implementation review-verdict gate) and polls PR
state to converge those rounds. With review/remediate engine-native, that driving is redundant
and harmful — the engine now emits a structured verdict, loops delta-scoped re-reviews, and
raises a remediation-cap gate. `auto` should react to engine gates, not run the loop.

Full design: `docs/engine-review-remediate-plan.md` in generacy-ai/tetrad-development; condensed
summary in the epic body. This is P5 (rollout) issue generacy-ai/agency#500.

## User Stories

### US1: auto no longer drives implementation review rounds

**As a** cluster operator running `cockpit:auto` over an epic,
**I want** `auto` to leave implementation PR review/remediate entirely to the engine,
**So that** review rounds converge in-engine, test suites don't re-run per round, and the cluster
stops exhausting the GitHub GraphQL rate limit.

**Acceptance Criteria**:
- [ ] No reviewer or fixer subagent is dispatched against an implementation PR.
- [ ] `auto` does not poll PR review/check state to converge review rounds.
- [ ] Artifact-gate reviews (spec/plan/tasks) still work exactly as before.

### US2: remediation-limit gate surfaces to the human

**As a** cluster operator,
**I want** `waiting-for:remediation-limit` handled as a fused human gate that surfaces the
remaining findings from the gate body,
**So that** I can decide whether to resume remediation (which resets the engine's counter) without
digging into the PR myself.

**Acceptance Criteria**:
- [ ] `waiting-for:remediation-limit` is recognized and routed to a human gate.
- [ ] The gate presentation includes the remaining findings parsed from the gate body.
- [ ] The human answer resumes the issue into remediation via the engine gate path.

### US3: final approval gate feeds merge

**As a** cluster operator,
**I want** the post-validate `waiting-for:implementation-review` final-approval gate to feed the
existing cockpit merge path on approval,
**So that** approved PRs merge on green through the same merge flow as today.

**Acceptance Criteria**:
- [ ] The post-validate `implementation-review` gate is handled as a final human approval gate.
- [ ] Approval routes into the cockpit merge path (merge on green; never merge on red).

### US4: playbook-verification re-pinned, not weakened

**As a** maintainer of the cockpit playbook,
**I want** the `playbook-verification` pin suite re-pinned to the slimmed `auto.md`,
**So that** the drift audit still guards the new contract instead of being loosened to pass.

**Acceptance Criteria**:
- [ ] `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` is green.
- [ ] Pins are re-pinned to the new headings/contract, with no assertion weakened or deleted.

### US5: graceful behavior under version skew

**As a** cluster operator during rollout,
**I want** the slimmed playbook to define the minimum generacy package version it requires and
degrade gracefully below it,
**So that** old-engine + new-auto (and new-engine + old-auto) combinations don't strand the loop.

**Acceptance Criteria**:
- [ ] The minimum generacy package version the slimmed playbook depends on is documented.
- [ ] Below that version, `auto` degrades gracefully rather than silently mis-driving the loop.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Remove reviewer/fixer subagent dispatch against implementation PRs from `auto.md`. | P1 | Affects D.3, D.6, G.2 (implementation branch). |
| FR-002 | Keep artifact-gate reviews (spec/plan/tasks) unchanged. | P1 | D.2 and artifact branch of G.2 stay as-is. |
| FR-003 | Handle `waiting-for:remediation-limit` as a fused human gate surfacing remaining findings from the gate body. | P1 | New gate; parse findings for presentation. |
| FR-004 | Route the post-validate `waiting-for:implementation-review` final-approval gate into the cockpit merge path. | P1 | Gate moved post-validate by engine. |
| FR-005 | Reduce PR-state polling tied to review-round driving. | P1 | Directly targets GraphQL 5k/hr exhaustion. |
| FR-006 | Stop routing external PR feedback via auto's fixer; the engine's remediate loop absorbs it. | P2 | D.9/D.9a pr-feedback paths become ledger-only or removed per engine ownership. |
| FR-007 | Re-pin `playbook-verification.test.ts` to the slimmed `auto.md` contract without weakening assertions. | P1 | Per CLAUDE.md pin policy. |
| FR-008 | Define the minimum generacy package version the slimmed playbook requires and degrade gracefully below it. | P1 | Version-skew handling both directions. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | `playbook-verification` suite | Green | `pnpm --filter claude-plugin-cockpit test` (or repo test runner). |
| SC-002 | Review-round dispatch in an engine-native dry-run | Zero | Dry-run transcript of `auto` over an engine-native epic shows no reviewer/fixer dispatch. |
| SC-003 | Both new/moved gates handled correctly in dry-run | Both handled | Same transcript shows correct `remediation-limit` and post-validate `implementation-review` handling. |
| SC-004 | GraphQL polling volume during a run | Reduced vs. pre-change | Compare PR-state poll frequency before/after (qualitative from transcript / poll cadence). |

## Assumptions

- The engine changes (P1–P4, issues #1121–#1135) are merged and available in the generacy package
  the cluster runs; this issue is P5 rollout of the client playbook only.
- The engine emits `waiting-for:remediation-limit` with remaining findings in the gate body, and
  moves the `implementation-review` gate to post-validate, per the design doc.
- Artifact-gate review handling (spec/plan/tasks) is out of scope for change and stays as-is "for now".
- The cockpit merge path (merge on green, never on red) already exists and is reused unchanged.

## Out of Scope

- Any engine-side changes (review/remediate executors, config schema, CI/validate orchestration) —
  those are the P1–P4 issues in the epic.
- Changing artifact-gate (spec/plan/tasks) review behavior.
- The migration-notes/docs/rollout-checklist deliverable (generacy-ai/generacy#1136).
- Standing up cross-repo monitoring of the agency repo by the driving cluster (noted in the epic
  as a separate concern).

---

*Generated by speckit*
