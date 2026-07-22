# Feature Specification: Cockpit Remote Gates — End-to-end Dogfood (P4, human-run)

**Branch**: `450-part-cockpit-remote-gates` | **Date**: 2026-07-22 | **Status**: Draft
**GitHub Issue**: [generacy-ai/agency#450](https://github.com/generacy-ai/agency/issues/450)
**Epic**: Cockpit Remote Gates (tracked in generacy-ai/generacy-cloud)
**Design contract**: [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)

## Summary

Human-run integration dogfood of the Cockpit Remote Gates system: drive a real epic end-to-end using `/cockpit:auto --gates=ui`, answering every reachable gate type from the generacy.ai operator inbox. The purpose is to prove — under realistic conditions — that the driving session never blocks on human input, that gate answers round-trip cleanly through the inbox, and that the audit trail on GitHub reflects UI-actor attribution correctly.

This is a P4 phase task in the epic (integration / dogfood tier). It follows completion of the P1–P3 work that established the gate record contract, NDJSON answer line, outcome ack, and gateId/generation rules. This spec produces a run report and follow-up issues, not new production code (defect fixes discovered during the run land as their own PRs).

## Context

The Cockpit Remote Gates epic introduces a central operator inbox on generacy.ai for answering `/cockpit:auto` human gates so the driving Claude Code session never blocks waiting for a human. Prior phases delivered the underlying wire contracts and delivery machinery; this phase exercises the whole stack against a real epic under a live operator.

Operating mode: **human-run**. A human operator (the person filing this issue) sits at generacy.ai and answers gates as they arrive, while `/cockpit:auto --gates=ui` drives the epic. The system under test is the composition — driver session, gate transport, inbox UI, GitHub audit — not any single component in isolation.

## User Stories

### US1: Operator drives an epic without blocking the driver session

**As** a cockpit operator running `/cockpit:auto --gates=ui` on a real epic,
**I want** the driving Claude Code session to keep dispatching work while human gates are open in the generacy.ai inbox,
**So that** operator response latency does not stall epic progress and I can answer gates asynchronously from a central place.

**Acceptance Criteria**:
- [ ] Session shows continued dispatch activity (non-gate work advancing) while at least one gate is unanswered in the inbox.
- [ ] Answers submitted from the inbox apply to the driver session and unblock the corresponding gate.
- [ ] Inbox shows accurate delivery state (pending / delivered / acked / superseded) for each gate.

### US2: Every reachable gate type is exercised via the inbox

**As** a validator of the remote-gates system,
**I want** to exercise each gate type — clarification batch (including a "Make changes" free-text round), review verdicts (approve and request-changes), phase-queue confirm, at least one escalation, and a supersession case — from the inbox,
**So that** we have evidence each contract path works end-to-end and can catch gaps before we ask other operators to rely on it.

**Acceptance Criteria**:
- [ ] Clarification batch answered from the inbox, including at least one round that uses the free-text "Make changes" affordance.
- [ ] Review gate answered with **approve** on at least one artifact and **request-changes** on at least one artifact.
- [ ] Phase-queue confirm gate answered from the inbox.
- [ ] At least one escalation gate exercised.
- [ ] At least one supersession case exercised: a gate is answered from the inbox **after** its underlying state has moved on, and the delivery layer records it as superseded rather than silently applying.

### US3: Audit trail carries UI-actor attribution

**As** a reviewer auditing epic activity after the run,
**I want** GitHub artifacts (clarification markers, advance comments, phase labels) that resulted from UI-answered gates to be attributed to the UI actor,
**So that** it is clear from the audit trail which decisions came through the inbox vs. inline in the Claude Code session.

**Acceptance Criteria**:
- [ ] Clarification answer comments posted to GitHub during the run include UI-actor attribution.
- [ ] Advance comments and phase-label transitions triggered by UI answers include UI-actor attribution.

### US4: Offline-cluster answers deliver on reconnect

**As** an operator whose driving cluster briefly loses connectivity,
**I want** gate answers submitted from the inbox during the offline window to deliver once the cluster reconnects,
**So that** transient disconnects do not force a re-answer or leave the epic stuck.

**Acceptance Criteria**:
- [ ] At least one gate is answered from the inbox while the driver cluster is offline; on reconnect, the answer is delivered and applied without operator retry.

### US5: Defects and rough edges captured for follow-up

**As** the epic owner,
**I want** rough edges observed during the run recorded as follow-up issues on the epic and operator-facing doc drift corrected,
**So that** the dogfood produces durable value beyond the run itself.

**Acceptance Criteria**:
- [ ] Every non-blocking rough edge filed as a follow-up issue against the epic with severity.
- [ ] Every blocking defect either fixed in-run (linked PR) or filed with severity, blocking the run report.
- [ ] Cockpit walkthrough / operator docs updated wherever the run exposed drift between docs and observed behavior.

## Functional Requirements

| ID     | Requirement                                                                                                                                         | Priority | Notes                                                                       |
|--------|-----------------------------------------------------------------------------------------------------------------------------------------------------|----------|-----------------------------------------------------------------------------|
| FR-001 | Select a real epic (scratch or live) suitable for exercising every listed gate type, and record the choice in the run report.                        | P1       | Choice must justify coverage of all gate types.                             |
| FR-002 | Launch `/cockpit:auto --gates=ui` against the selected epic.                                                                                        | P1       |                                                                             |
| FR-003 | Answer every clarification batch that appears during the run from the inbox, and include at least one free-text "Make changes" round.               | P1       | Free-text round is explicitly called out in the issue scope.                |
| FR-004 | Answer review gates from the inbox, exercising both **approve** and **request-changes** verdicts across the run.                                    | P1       |                                                                             |
| FR-005 | Answer the phase-queue confirm gate from the inbox.                                                                                                 | P1       |                                                                             |
| FR-006 | Exercise at least one escalation gate from the inbox.                                                                                               | P1       |                                                                             |
| FR-007 | Exercise at least one supersession case: submit an answer after the gate's underlying state has already advanced, and confirm the layer supersedes. | P1       |                                                                             |
| FR-008 | Verify the driver session continues dispatching non-gate work while gates are unanswered.                                                            | P1       | Evidence: session log or timing observation.                                |
| FR-009 | Verify answers submitted from the inbox arrive and apply on the driver side, and that acks / outcomes render in the inbox delivery state.           | P1       |                                                                             |
| FR-010 | Verify GitHub audit artifacts triggered by UI answers carry UI-actor attribution.                                                                    | P1       | Clarification markers, advance comments, phase labels.                      |
| FR-011 | Exercise offline-cluster delivery: cause the driving cluster to be offline while at least one answer is submitted; verify delivery on reconnect.     | P1       |                                                                             |
| FR-012 | Capture timings for each gate type: gate-open → inbox-render, operator-submit → driver-apply, driver-apply → inbox-ack.                              | P2       | Provides baseline for future latency work.                                  |
| FR-013 | File each rough edge as a follow-up issue against the epic with severity; fix or file each blocking defect with severity.                            | P1       |                                                                             |
| FR-014 | Update cockpit walkthrough / operator-facing docs where operator-facing behavior observed in the run differed from docs.                             | P1       |                                                                             |
| FR-015 | Post a written run report as a comment on this issue: epic driven, gates exercised, timings, defects filed, docs touched.                            | P1       | This is the primary deliverable.                                            |

## Success Criteria

| ID    | Metric                                     | Target                                                                                                             | Measurement                                          |
|-------|--------------------------------------------|--------------------------------------------------------------------------------------------------------------------|------------------------------------------------------|
| SC-01 | Gate-type coverage                          | Every gate type listed in FR-003 through FR-007 exercised end-to-end at least once.                                | Checked off in the run report.                       |
| SC-02 | Session non-blocking                        | Driver session shows dispatch of non-gate work while ≥1 gate is unanswered for a non-trivial window (≥30s).        | Session log excerpt in the run report.               |
| SC-03 | UI-actor attribution correctness            | 100% of GitHub artifacts triggered by UI answers during the run carry UI-actor attribution.                        | Audit of the epic's GitHub timeline after the run.   |
| SC-04 | Offline delivery                            | ≥1 answer submitted during driver-cluster offline window applies on reconnect without operator retry.              | Recorded in the run report with reconnect timing.    |
| SC-05 | Blocking-defect closure                     | 100% of blocking defects observed are either fixed in-run (linked PR) or filed as issues with severity by report.  | Run report enumerates all blocking defects.          |
| SC-06 | Follow-up issue capture                     | ≥1 follow-up issue filed per rough edge observed (or explicit statement of "none observed").                       | Run report links follow-up issues.                   |
| SC-07 | Run report published                        | Run report comment attached to this issue.                                                                          | GitHub comment on #450.                              |

## Assumptions

- The Cockpit Remote Gates P1–P3 phases (contracts, transport, inbox UI, driver integration) are complete and available in `develop` at the time of the run; this spec does not re-implement them.
- generacy.ai inbox is reachable by the operator during the run.
- A candidate epic exists that will produce at least one instance of every listed gate type, or one can be constructed on a scratch branch; if no such epic exists, seeding a synthetic epic that triggers each gate type is acceptable.
- The operator running `/cockpit:auto --gates=ui` has permissions to comment on the driven epic and file follow-up issues against the tracking epic.
- Escalation gates require an escalation path to be reachable; if the current implementation cannot generate an escalation on demand, this is itself a rough edge to file rather than a spec failure.

## Out of Scope

- Building or modifying the gate record contract, NDJSON answer line, outcome ack, gateId/generation rules, or any P1–P3 remote-gates plumbing. Contract changes must be proposed on the epic (per the epic's directive) rather than made here.
- Any operator-inbox UX work beyond what is needed to verify the acceptance criteria (visual polish, new affordances, etc.).
- Multi-operator or concurrent-driver scenarios; the dogfood is single-operator, human-run.
- Automated / CI-driven runs of `/cockpit:auto --gates=ui`; this is an explicitly human-run exercise.
- Load or stress testing of the inbox or transport.

## Deliverables

1. **Run report** posted as a comment on issue #450: epic driven (link), gate types exercised with pass/fail, timings for FR-012, defects filed with links and severity, docs updated with links.
2. **Follow-up issues** filed against the epic for every rough edge observed (or explicit "none observed" in the report).
3. **Doc updates** to the cockpit walkthrough / operator-facing docs where observed behavior diverged from docs.
4. **PRs** for any blocking defects fixed in-run (linked from the run report).

---

*Generated by speckit; enhanced from GitHub issue #450.*
