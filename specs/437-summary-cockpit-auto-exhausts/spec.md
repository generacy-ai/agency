# Feature Specification: /cockpit:auto dispatches from doorbell event content instead of re-querying GitHub

**Branch**: `437-summary-cockpit-auto-exhausts` | **Date**: 2026-07-17 | **Status**: Draft
**Issue**: [generacy-ai/agency#437](https://github.com/generacy-ai/agency/issues/437)
**Depends on**: [generacy-ai/generacy#985](https://github.com/generacy-ai/generacy/issues/985) (engine-side change that makes the doorbell line content-ful)

## Summary

`/cockpit:auto` exhausts the GitHub GraphQL rate limit (5000 pts/hr) despite low event volume because on every wake the skill re-queries GitHub to find out *what* happened — state that (after generacy-ai/generacy#985) the doorbell wake line will carry directly.

This spec covers the **agency skill side** (`packages/claude-plugin-cockpit/commands/auto.md`). The engine-side companion (content-ful `lineForEvent`, local `to`-classification, baked `checks` verdict) lives in generacy-ai/generacy#985. This change teaches the skill to read the enriched doorbell line instead of re-querying.

## Problem

- `auto.md` step 4.1 re-checks live state via `cockpit_status(epic, json=true)` for **every** actionable event in the drained batch. That call fans out ~28 GraphQL calls for a mid-size epic; a 3-event wake ≈ ~95 calls. This is the dominant rate-limit consumer.
- `auto.md:53` currently mandates that the doorbell line be treated as opaque: *"The stdout content is a doorbell only: the parent NEVER parses lines for content."* That mandate is what must be removed so the skill can act on the enriched payload.

## User Stories

### US1: Operator running /cockpit:auto against a busy epic

**As an** operator driving an epic through `/cockpit:auto`,
**I want** each wake to dispatch off the doorbell line's content when the engine provides it,
**So that** a normal-cadence run does not blow through the 5000 pts/hr GraphQL budget and stall the epic.

**Acceptance Criteria**:
- [ ] For clarification (D.1), review (D.2–D.4), error (D.7), and ledger-only (D.9) events, the skill dispatches from the doorbell line's `to`/`labels` fields with no per-event `cockpit_status` call.
- [ ] For merge-gate events (D.5, D.6), the skill uses the `checks` verdict baked into the line when present; falls back to a single authoritative query only when it is absent.
- [ ] When the doorbell line is a bare event type (older engine or a mode with no content), the skill falls back to today's re-query behaviour without erroring — no hard runtime ordering with generacy-ai/generacy#985.

### US2: Skill maintainer updating auto.md contract

**As a** maintainer of `auto.md`,
**I want** the "never parses lines for content" mandate at `auto.md:53` removed and the step-4 narration updated to describe the new dispatch,
**So that** future changes have a single accurate contract to reason about, and playbook-verification pins the new behaviour instead of the old.

**Acceptance Criteria**:
- [ ] `auto.md:53` no longer forbids parsing the doorbell line for content.
- [ ] Step-4 narration in `auto.md` describes the enriched-line dispatch and the graceful-degradation fallback.
- [ ] `playbook-verification` pinning tests are updated to match the new dispatch. Assertions are re-pinned to the new contract, not weakened or deleted (per repo CLAUDE.md).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Parse the NDJSON doorbell line into `{ type, repo, kind, number, event, to, labels, url, checks? }`. | P1 | Schema comes from generacy-ai/generacy#985. |
| FR-002 | Dispatch label-driven classes (D.1 clarification, D.2–D.4 reviews, D.7 error, D.9 ledger-only) directly from the line's `to` + `labels`. | P1 | Drops the per-event `cockpit_status` re-check for these classes. |
| FR-003 | For merge-gate classes (D.5, D.6), consult the line's `checks` verdict; only if absent, fall back to a single authoritative `cockpit_status` / `cockpit_merge` query. | P1 | Not one query per event — one query, only on absence. |
| FR-004 | Update `auto.md` step-4 narration to describe the enriched-line dispatch and remove the `auto.md:53` "never parses lines for content" mandate. | P1 | Contract text must match runtime behaviour. |
| FR-005 | Fall back to today's re-query behaviour when the doorbell line lacks enriched fields (bare event type from older engine or a content-less mode). | P1 | No hard runtime ordering dependency on generacy-ai/generacy#985. |
| FR-006 | Re-pin `playbook-verification` assertions to match the new dispatch. Do not weaken or delete assertions to make tests pass. | P1 | Per repo CLAUDE.md drift-audit rule. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | GraphQL calls per actionable event (label-driven classes) | 0 per-event `cockpit_status` calls | Trace/log inspection during a `/cockpit:auto` run against a mid-size epic. |
| SC-002 | GraphQL calls per actionable event (merge-gate classes) | 0 when `checks` verdict is baked; 1 fallback when absent | Same trace/log inspection, with fixtures for both paths. |
| SC-003 | End-to-end regression | An epic that today exhausts the 5000 pts/hr budget completes without hitting the rate limit under the same event pattern. | Run against a representative epic or replayed event stream. |
| SC-004 | Graceful degradation | A run with a bare-event doorbell (simulated older engine) completes with today's behaviour and no runtime error. | Fixture / integration test that forces the fallback path. |
| SC-005 | Playbook-verification | All `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` assertions pass, re-pinned to the new contract. | `pnpm test` on the plugin package. |

## Cross-repo coordination

Per the one-issue-per-repo rule, the engine change (content-ful `lineForEvent` + local `to`-classification + baked `checks` verdict) lives in generacy-ai/generacy#985. The two PRs are designed to land in lockstep, but graceful degradation (FR-005) removes any hard ordering requirement.

## Context

Follow-up to the doorbell real-time work: agency #431, generacy #970, #978, #980. The root-cause trace and the engine-side plan are in generacy-ai/generacy#985.

## Assumptions

- generacy-ai/generacy#985 will land the enriched line schema described in FR-001; this spec's schema tracks that PR.
- The current `auto.md` step-4 dispatch classes (D.1–D.9) are the correct taxonomy — no new classes added by this change.
- `playbook-verification.test.ts` is the authoritative pin surface for `auto.md` contract changes.

## Out of Scope

- Engine-side changes to `lineForEvent`, `to`-classification, or the `checks` verdict — those belong to generacy-ai/generacy#985.
- Changes to non-`auto.md` skills / commands in `packages/claude-plugin-cockpit/commands/`.
- Any new GraphQL calls or new `cockpit_*` MCP tools; this change removes calls, it does not add new endpoints.
- Broader rate-limit strategy (backoff, caching, budget accounting) beyond removing the re-query fan-out.

---

*Generated by speckit*
