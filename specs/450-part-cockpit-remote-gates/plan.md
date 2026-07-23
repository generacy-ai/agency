# Implementation Plan: Cockpit Remote Gates — End-to-End Dogfood

**Feature**: P4 integration / dogfood run driving a real epic with `/cockpit:auto --gates=ui`, answering every reachable gate type from the generacy.ai inbox
**Branch**: `450-part-cockpit-remote-gates`
**Status**: Complete
**Spec**: [spec.md](./spec.md)
**Epic doc**: [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)

## Summary

This is the P4 integration issue for the **Cockpit Remote Gates** epic. P1–P3 build the contracts, cluster plumbing, cloud backend, and operator inbox UI. P4 does not add product code: it exercises the completed stack end-to-end on a real epic, verifies each gate type behaves per the wire contracts, and produces a written run report with defects filed against the epic.

Because the deliverable is evidence (report + filed defects) rather than merged code, this plan describes an **execution strategy** — how the operator picks the epic, triggers each gate type, captures evidence, and decides when the run is complete — rather than a build.

## Technical Context

**Language/Version**: N/A — no product code changes in this feature.
**Primary Dependencies** (exercised, not built):
- `agency/packages/claude-plugin-cockpit` — `/cockpit:auto` playbook with `--gates=ui` (P4 skill rework, issue #14 in epic).
- `generacy/packages/cockpit/src/gates/` — wire contracts (P1).
- `generacy` orchestrator gate routes + doorbell (P1).
- `generacy-cloud` gates collection, REST/SSE, relay integration, inbox UI, context endpoint (P2, P3).
**Storage**: Firestore `gates` collection (cloud); NDJSON at `/workspaces/.generacy/cockpit/answers.ndjson` (cluster); GitHub labels + marker comments (audit).
**Testing**: Manual driven run + evidence capture. No new automated tests in this issue; defects surface either as fixes rolled into P1–P3 issues or as new epic children.
**Target Platform**: A cloud-activated cluster (tetrad-development or equivalent) with `/cockpit:auto --gates=ui` reachable, plus the operator's browser on generacy.ai.
**Project Type**: Integration / dogfood.
**Performance Goals**: The session must not block on any gate — dispatch loop keeps advancing other issues while gates are pending (goal 1 of the epic).
**Constraints**:
- Answers must ride the authenticated relay WS (never the smee channel).
- Every applied answer must produce GitHub audit artifacts carrying the UI actor attribution.
- Cluster-offline answers must be delivered on reconnect without duplication (deliveryId dedup).
**Scale/Scope**: One driving session on one epic; a bounded synthetic follow-up epic if live coverage is incomplete.

## Approach

Per the clarifications:
- **Epic selection (Q1 → C)**: start with a live in-flight epic on generacy-ai/generacy-cloud (or another product repo). If any gate type has not fired by the time all others are covered, seed a synthetic follow-up epic on a scratch branch engineered to trigger the missing types deterministically.
- **Completion criterion (Q2 → A)**: coverage-complete. The run ends when every gate type (clarification batch incl. free-text "Make changes", review approve, review request-changes, phase-queue confirm, escalation, supersession, offline delivery) has been exercised at least once. The driven epic may still be in-flight; that is noted in the report.
- **Escalation trigger (Q3 → B)**: force an unfixable red-check on a merge so the bounded fixer subagent runs once, stays red, and the driver escalates. Confirm the UI presenter renders the `escalation` gateType before the run; file a gap if not.
- **Supersession recipe (Q4 → B)**: while a gate is open in the inbox, advance the underlying phase by a separate route (CLI `cockpit_advance`, a GitHub label flip, or answering a different gate). Submit the inbox answer against the now-stale generation; the session validates against live state and acks `superseded`.
- **Offline mechanism (Q5 → A)**: network-level — block the cluster's outbound relay WS to generacy.ai (firewall rule / interface down) while the process keeps running. Answer from the inbox during the outage. Restore connectivity and verify the answer is redelivered exactly once via `deliveryId` dedup.

The run is human-driven; no additional automation is added. Evidence capture (timestamps, gate ids, screenshots, GitHub audit artifact links) is manual and lives in the run report.

## Constitution Check

No `.specify/memory/constitution.md` present in this repo (`find /workspaces/agency/.specify -type f` returned only templates). No gates to evaluate.

## Project Structure

### Documentation (this feature)

```text
specs/450-part-cockpit-remote-gates/
├── spec.md              # Feature specification (read-only)
├── clarifications.md    # Q1–Q5 answers (Q1 hybrid, Q2 coverage-complete, Q3 red-check, Q4 separate advance, Q5 network-level)
├── plan.md              # This file
├── research.md          # Prerequisites, gate trigger recipes, offline mechanism decision
├── data-model.md        # Wire contracts (gate record, answer NDJSON, ack) mirrored from cockpit-remote-gates-plan.md
├── quickstart.md        # Operator step-by-step for the dogfood run
├── contracts/
│   └── run-report-template.md   # Structured template for the report attached to issue #450
├── checklists/          # (empty; populated by /checklist if invoked)
└── tasks.md             # Generated by /speckit:tasks
```

### Source Code (repository root)

No product code changes in this feature. Dogfood exercises code shipped by:

```text
# Exercised — not modified in this issue
agency/packages/claude-plugin-cockpit/commands/auto.md   # --gates=ui flag, D.12 gate-answer dispatch
generacy/packages/cockpit/src/gates/                     # wire contract module
generacy/                                                 # orchestrator routes, doorbell, MCP tools
generacy-cloud/services/api/                              # gates collection, REST/SSE, relay integration
generacy-cloud/apps/web/                                  # /dashboard/inbox page and gate detail
```

**Structure Decision**: No new source directories. The feature's artifacts live under `specs/450-part-cockpit-remote-gates/`. The eventual run report (attached to the GitHub issue) is the durable deliverable; the template lives in `contracts/`.

## Complexity Tracking

No constitution violations.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |
