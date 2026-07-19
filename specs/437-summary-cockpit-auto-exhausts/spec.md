# Feature Specification: ## Summary

`/cockpit:auto` exhausts the GitHub GraphQL rate limit (5000 pts/hr) despite low event volume, because on every wake the skill re-queries GitHub to find out *what* happened — state that (after generacy-ai/generacy#985) the doorbell wake line will carry directly

**Branch**: `437-summary-cockpit-auto-exhausts` | **Date**: 2026-07-17 | **Status**: Draft

## Summary

## Summary

`/cockpit:auto` exhausts the GitHub GraphQL rate limit (5000 pts/hr) despite low event volume, because on every wake the skill re-queries GitHub to find out *what* happened — state that (after generacy-ai/generacy#985) the doorbell wake line will carry directly.

This issue covers the **agency skill** side (`packages/claude-plugin-cockpit/commands/auto.md`). It **depends on** generacy-ai/generacy#985, which makes the doorbell line content-ful; this change teaches the skill to read it instead of re-querying.

## Problem

- `auto.md` step 4.1 re-checks live state via `cockpit_status(epic, json=true)` for **every** actionable event in the drained batch. That call fans out ~28 GraphQL calls for a mid-size epic; a 3-event wake ≈ ~95 calls. This is the dominant rate-limit consumer.
- `auto.md:53` currently mandates the doorbell line be treated as opaque: *"The stdout content is a doorbell only: the parent NEVER parses lines for content."* That mandate is the thing to remove.

## Proposed change (depends on generacy-ai/generacy#985)

1. **Parse the NDJSON event line** the doorbell now emits: `{ type, repo, kind, number, event, to, labels, url, checks? }`.
2. **Dispatch directly from the line** for the label-driven classes — clarification (D.1), reviews (D.2–D.4), error (D.7), ledger-only (D.9), and the ledger-only variants D.9a–D.9d (`pr-feedback`, `children-complete`, `dependencies`, `phase:*`): the `to` state + `labels` on the line are authoritative, so drop the per-event `cockpit_status` re-check for these classes. **Retain the per-event re-check** for D.8 (`phase-complete` → phase-queue gate), D.10 (unrecognized/ambiguous → escalation gate), and D.11 (`merge-conflicts` → escalation gate): those open human/consequential gates and are low-frequency, so authoritative re-check costs almost nothing while removing stale-state risk. (Clarification Q1: A.)
3. **Merge gate (D.5/D.6):** consult the `checks` verdict baked into the event; if it is absent — or present with value `pending` — fall back to a **single** authoritative `cockpit_status` / `cockpit_merge` query. Defer-on-pending was rejected because smee doorbell delivery is best-effort and a lost follow-up event would silently stall the merge. (Clarification Q4: B.)
4. **Enriched-vs-bare detection:** a line is treated as enriched iff it JSON-parses to an object AND carries both `to` and `labels`. Missing either → treat as bare and re-query (graceful degradation for older engines / content-less modes). `checks` presence is NOT part of the enriched-vs-bare gate — a legitimate label-change line has no `checks` — it is handled inside the D.5/D.6 path per FR-003. (Clarification Q2: B.)
5. **Step-4a contract:** step 4a stays as a single "resolve authoritative state" step whose implementation is "prefer the enriched line; fall back to one `cockpit_status` on absence." One unified source-of-truth priority covers both label-driven and merge-gate paths and folds FR-005 graceful degradation in naturally. (Clarification Q3: B.)
6. **Ledger rows for enriched-line dispatch** are written from the doorbell line as-received (no extra query), plus a `source: enriched-line` marker column so post-mortems can distinguish enriched-line rows from fallback re-query rows. (Clarification Q5: C.)
7. Update the step-4 narration and **remove** the `auto.md:53` "never parses lines for content" mandate.

## Acceptance criteria

- The per-event `cockpit_status` re-check is removed for D.1–D.4, D.7, D.9, and D.9a–D.9d; those dispatch off the line content.
- D.8, D.10, and D.11 retain the current per-event `cockpit_status` re-check.
- Merge-gate classes (D.5/D.6) use the baked-in `checks` verdict; fall back to a single authoritative query when the verdict is absent OR `pending`.
- **Enriched-vs-bare gate:** a line is treated as enriched only if it JSON-parses to an object AND carries `to` and `labels`; otherwise the skill falls back to today's re-query behaviour. No hard runtime ordering dependency on generacy-ai/generacy#985.
- **Step 4a** is retained as a unified "resolve authoritative state" contract (prefer enriched line; single `cockpit_status` fallback on absence) covering both label-driven and merge-gate paths.
- Ledger rows for label-driven dispatch reflect the doorbell line as-received and carry a `source: enriched-line` marker column distinguishing them from fallback re-query rows.
- `playbook-verification` pinning tests updated to match the new dispatch (re-pin to the new expected behaviour; do **not** weaken the assertions).

## Cross-repo coordination

Per our one-issue-per-repo rule, the engine change lives in generacy-ai/generacy#985 (content-ful `lineForEvent` + local `to`-classification + baked `checks` verdict). Land in lockstep.

## Context

Follow-up to the doorbell real-time work (agency #431 / generacy #970 / #978 / #980). The root-cause trace and the generacy-side plan are in generacy-ai/generacy#985.


## User Stories

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
