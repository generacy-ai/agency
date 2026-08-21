# Feature Specification: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract

**Branch**: `504-severity-major-p1-playbook` | **Date**: 2026-08-21 | **Status**: Draft

## Summary

**Severity: major (P1).** Playbook logic gaps against the engine's actual behavior at the final-approval boundary, plus the undefined findings-fetch step:

1. **D.5 can merge past an unanswered G.8.** The engine grants `completed:validate` AT the on-ci-green pause, before the operator answers (phase-loop.ts:1513-1531; end state is explicitly `completed:validate` + `waiting-for:implementation-review` + `agent:paused`). D.5 (auto.md:815-828) merges on `completed:validate` + green with no co-presence guard on `waiting-for:implementation-review` — its justification (":824 operator judgment was recorded at D.3") is false at that moment, and `cockpit_merge` won't block (validate label present, CI green by gate construction). The `completed:validate` label event lands first → merge before G.8 is ever presented. Add a `waiting-for:implementation-review`-absent guard to D.5.
2. **The "gate body" findings source is undefined.** What the engine writes is a best-effort plain issue comment headed `## Remediation limit reached` with `- <file>:<line> — <title>` bullets (phase-loop.ts:1411-1421). auto.md D.13/G.9 (:1050, :1506-1512) says only "parse the findings from the gate body" — no fetch procedure, no comment-heading anchor, no bullet shape. Pin the retrieval step (latest issue comment matching the heading) and the format contract.
3. Minor stale bits: G.8 prose claims the engine "wrote its remaining findings into the gate body" for implementation-review — the on-ci-green branch posts no comment at all (phase-loop.ts:1435-1453; the `(none)` fallback covers it, but the prose describes a nonexistent artifact); gate-status-check.ts:164-165 docstring still names the removed D.6/G.4a row; `cockpit.auto.agents` still documents a `fixer` role key no playbook path uses (auto.md:278); stale test comment playbook-verification.test.ts:2839 ("10-row table").


---
Filed from a post-merge code review of epic generacy-ai/generacy#1120 / agency#500. Part of follow-up epic generacy-ai/generacy#1153. auto.md refs at agency develop 1455ce5; engine refs at generacy develop 155b3464.

## User Stories

### US1: Never merge before the final-approval gate is answered (P0 within this P1)

**As an** operator running `auto` against a post-validate (#1120) engine,
**I want** the D.5 merge row to stand down while an issue is still waiting on the G.8 implementation-review gate,
**So that** a PR is never squash-merged before I have recorded my final human approval.

**Context**: At the engine's on-ci-green pause the issue ends up in `completed:validate` + `waiting-for:implementation-review` + `agent:paused` simultaneously (engine `phase-loop.ts:1513-1531`). The `completed:validate` label event reaches the doorbell first, so D.5 (`auto.md:813-831`) fires and calls `cockpit_merge` — which does not block, because the `validate` label is present and CI is green by gate construction. The merge lands before G.8 is ever presented. D.5's stated justification (":822 operator judgment was recorded at D.3") is false at that instant, because D.3 has not yet been answered.

**Acceptance Criteria**:
- [ ] D.5 does NOT merge when the enriched line / status shows `waiting-for:implementation-review` co-present with `completed:validate`.
- [ ] When both labels co-occur, the event is deferred to D.3 / G.8 (the operator answers the final-approval gate; `approve` then routes into the merge path per `auto.md:1494`).
- [ ] D.5 continues to merge on `completed:validate` + green when `waiting-for:implementation-review` is absent (legacy / already-approved path is unchanged).

### US2: Deterministic retrieval of remediation-limit findings

**As an** operator answering the remediation-limit gate (G.9 / D.13),
**I want** the playbook to specify exactly where and in what shape the engine's remaining findings live,
**So that** the findings I see are rendered from the real engine artifact rather than an undefined "gate body".

**Context**: The engine writes a best-effort plain issue comment headed `## Remediation limit reached` with `- <file>:<line> — <title>` bullets (engine `phase-loop.ts:1411-1421`). D.13 (`auto.md:1048`) and G.9 (`auto.md:1506-1512`) only say "parse the findings from the gate body" — no fetch procedure, no comment-heading anchor, no bullet shape.

**Acceptance Criteria**:
- [ ] D.13 / G.9 pin the retrieval step: read the latest issue comment on the linked issue whose body starts with the heading `## Remediation limit reached`.
- [ ] The bullet format contract is documented: `- <file>:<line> — <title>` per finding.
- [ ] A fallback is specified for when no matching comment exists (render an explicit empty/`(none)` state rather than failing).

### US3: Remove stale prose, docstrings, config keys, and test comments

**As a** maintainer reading the playbook and its pins,
**I want** the documentation to describe only artifacts the engine actually produces,
**So that** the playbook stays trustworthy as a contract and readers are not misled by references to removed rows or nonexistent artifacts.

**Acceptance Criteria**:
- [ ] G.8 prose (`auto.md:1478`, `:1480`) no longer claims the engine "wrote its remaining findings into the gate body" for implementation-review — the on-ci-green branch posts no comment (engine `phase-loop.ts:1435-1453`); the `(none)` fallback stays and covers the empty case.
- [ ] `gate-status-check.ts:164-165` docstring no longer names the removed D.6/G.4a escalation row; it lists only the escalation rows that still open gates (D.7 G.4b, D.10 G.4c, D.11 G.4d).
- [ ] The `cockpit.auto.agents` role-selector list (`auto.md:262`) drops the `fixer` key, since no playbook path spawns a `cockpit-fixer` subagent (red validate is engine-owned per `auto.md:841`).
- [ ] The stale test comment at `playbook-verification.test.ts:2839` ("10-row table") is corrected to the current mapping-table shape.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | D.5 MUST add a `waiting-for:implementation-review`-absent guard: when that label co-occurs with `completed:validate`, D.5 does not merge and defers to D.3 / G.8. When the enriched line is NOT decisive about the label (labels absent / bare / malformed), D.5 MUST fail safe — do an authoritative `cockpit_status(json=true)` re-query and only merge if `waiting-for:implementation-review` is confirmed absent (mirrors the `checks` fallback). | P0 | Core safety fix; `auto.md:813-831`; [Clarify Q1] |
| FR-002 | The deferral MUST be observable in the ledger as a passive no-op D.5 row with outcome token `deferred: implementation-review pending` (D.5 writes the row and drops the event; the co-present `waiting-for:implementation-review` transition is its own D.3 trigger that presents G.8, and G.8 `approve` performs the merge). D.5 does NOT itself invoke the G.8 presentation path. | P1 | Ledger line at `auto.md:826`; [Clarify Q2] |
| FR-003 | D.13 and G.9 MUST specify the findings retrieval procedure: client-side `gh issue view <issue-ref> --json comments`, selecting the latest linked-issue comment whose body starts with `## Remediation limit reached`. This is identical in local and UI gate modes (the source is the engine's issue comment, not the gate record — `cockpit_gate_status` carries no findings). | P1 | `auto.md:1048`, `:1506-1512`; [Clarify Q3] |
| FR-004 | D.13 and G.9 MUST document the bullet format contract `- <file>:<line> — <title>` and an explicit empty/`(none)` fallback. Comment selection MUST be the single most-recent comment (by `createdAt`) whose body `startsWith` the exact, case-sensitive string `## Remediation limit reached`; if none match, render the `(none)` fallback. | P1 | Mirrors engine `phase-loop.ts:1411-1421`; [Clarify Q4] |
| FR-005 | G.8 prose MUST stop asserting a per-implementation-review gate-body findings artifact that the on-ci-green branch never writes; G.8 MUST render `(none)` in all cases (no findings artifact exists on either the post-validate or legacy path), keeping its single unconditional `| (none) | | | |` row. | P2 | `auto.md:1478`, `:1480`; [Clarify Q5] |
| FR-006 | `gate-status-check.ts` docstring MUST be updated to drop D.6/G.4a and name only the live escalation gate rows. | P2 | `gate-status-check.ts:164-165` |
| FR-007 | The `cockpit.auto.agents` selector documentation MUST drop the unused `fixer` role key. | P2 | `auto.md:262` |
| FR-008 | The stale `playbook-verification.test.ts` comment MUST reflect the current table shape. | P2 | `playbook-verification.test.ts:2839` |
| FR-009 | `playbook-verification.test.ts` pins MUST be re-pinned to the NEW D.5 / D.13 / G.8 / G.9 contract in the same change (per CLAUDE.md drift-audit rule); no assertion is weakened or deleted. | P1 | Contract drift audit |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | No merge occurs while `waiting-for:implementation-review` is co-present with `completed:validate`. | 100% | Trace/scenario: co-present labels → D.5 defers, no `cockpit_merge` call until G.8 answered |
| SC-002 | Green-checks merge path with the gate already answered/absent still merges. | No regression | Scenario: `completed:validate` + green, no `implementation-review` label → D.5 merges |
| SC-003 | Remediation-limit findings are rendered from the `## Remediation limit reached` comment with the documented bullet shape. | Deterministic | D.13 / G.9 walkthrough resolves to a concrete fetch + parse |
| SC-004 | No playbook/docstring/config/test text references a removed row or nonexistent artifact. | 0 stale refs | grep for `fixer`, `10-row`, `D.6 (G.4a)`, and the G.8 gate-body claim |
| SC-005 | `playbook-verification.test.ts` passes with assertions re-pinned to the new contract. | Green | `pnpm test` on the plugin package |

## Assumptions

- The engine (generacy `develop`) behaves as described at commit `155b3464`: `completed:validate` + `waiting-for:implementation-review` + `agent:paused` co-occur at the on-ci-green pause, and the remediation-limit comment is written as `## Remediation limit reached` with `- <file>:<line> — <title>` bullets.
- The engine's on-ci-green implementation-review branch posts NO findings comment; the `(none)` fallback is the correct rendering.
- This work is playbook/documentation and pin corrections against `auto.md` (agency `develop` `1455ce5`), one library docstring, and one test comment — no engine (generacy) changes.

## Out of Scope

- Any change to the engine (`phase-loop.ts`, generacy repo) — this feature only aligns the client playbook and pins to existing engine behavior.
- The legacy (pre-relocation / flag-off) engine gate model beyond the existing D.3 detection already in `auto.md`.
- Reintroducing a `cockpit-fixer` subagent path — red validate remains engine-owned.
- The UI-mode gate-query drift machinery beyond correcting the stale docstring row list.

---

*Generated by speckit*
