# Feature Specification: D.7 repeat-failure dispatch must fetch fresh evidence

**Branch**: `410-found-during-cockpit-v1` | **Date**: 2026-07-12 | **Status**: Draft
**Source issue**: [#410](https://github.com/generacy-ai/agency/issues/410)
**Target playbook**: `packages/claude-plugin-cockpit/commands/auto.md` § D.7 (line 260)

## Summary

Cockpit `auto` mode's D.7 escalation contract (`agent:error` / `failed:*`) currently describes only the **first** dispatch: parent fetches evidence via `cockpit_context` → spawns a diagnosis subagent. The **repeat-failure** path — when the same issue re-enters `failed:*` after a Requeue — is unspecified, and in practice the parent has been continuing the existing diagnosis subagent with its own *characterization* of the second failure ("requeue failed identically") rather than with the new alert's evidence. When the failure class actually changes across the requeue, this steers verdicts, confidence labels, and the escalation-gate presentation off ground truth.

This feature closes that gap: on a repeat D.7 dispatch, the parent must fetch fresh evidence before any subagent continuation, must not paraphrase or summarize that evidence into the continuation prompt, and the diagnosis verdict schema must gain a `failure_class_changed` boolean so the escalation gate can present the fact that a Requeue made progress (or did not).

## Background

Observed in cockpit v1.5 auto-mode integration smoke test (`generacy-ai/tetrad-development#92`, finding #62, snappoll-1 run 11):

1. First failure (`#3`/`#4` `failed:validate`): diagnosis subagents correctly identified a stale-base `npm ci` EUSAGE (branches forked pre-scaffold). Operator chose Requeue.
2. Requeue re-ran validate → `failed:validate` again ~90 s later.
3. Parent's dispatch prompt: *"Rather than re-run full diagnosis, I'll continue the two existing diagnosis subagents with the new fact (requeue failed identically)"* — but no one had read the new alert. `"failed identically"` was injected into the subagents' context as fact.
4. Both subagents returned Skip verdicts built on the false premise ("requeue can't fix the stale base; needs an out-of-band branch sync").
5. Ground truth from the fresh `#915` reason-bearing alerts: the requeue had **worked** (the `#914` base-merge brought the scaffold in; `npm ci` passed). The new `failed:validate` events were two distinct in-branch defects (`#3`: `@prisma/client` missing from the epic's dependency plan; `#4`: a source-guard test tripped by the implementation's own doc comment). "Needs out-of-band branch sync" was wrong for both.

Cost: the operator was steered toward Skip (which would have wedged P1 and the epic) when the actual remedies were a one-line dependency addition and a comment reword. The misdiagnosis was caught only by out-of-band operator review of the alert comments.

## Root cause

`auto.md` D.7's evidence contract covers the first dispatch and is silent on the repeat-failure path. The session's continuation pattern (SendMessage to the existing subagent) is correct — context reuse is exactly right — but the continuation prompt carried the parent's *conclusion* ("identical") instead of *evidence*. Similarity between two failures is a determination only evidence can support: the engine now ships classifier reasons and output tails in every alert (#915) precisely so this comparison never has to be guessed by the parent.

The loop-trust-boundary principle applies to the parent itself: **assertions are advisory, evidence is authoritative.** A parent-authored characterization of the failure ("identical", "same class", "same root cause") is an assertion; the alert body is evidence.

## User Stories

### US1: Auto-mode parent, on repeat D.7 dispatch

**As a** cockpit auto-mode session parent,
**I want** an explicit contract for the repeat-failure D.7 path that mirrors the first dispatch's evidence-fetch obligation,
**So that** I never characterize a failure to a diagnosis subagent without evidence in hand and the subagent can determine same-or-different from primary sources.

**Acceptance Criteria**:
- [ ] Auto.md D.7 has an explicit "Repeat failure" subsection covering the second-and-subsequent trigger of the same `agent:error` / `failed:*` state on the same issue within one auto session.
- [ ] The subsection names `cockpit_context(issue=<issue-ref>)` as the sole evidence verb (same as the first dispatch) and forbids dispatch of a repeat D.7 without the new alert body in hand.
- [ ] The subsection forbids parent-authored summaries of the failure in the continuation prompt ("failed identically", "same root cause", "same class") — the continuation prompt carries the verbatim new evidence (alert body / classifier reason / output tail) alongside the prior context.

### US2: Diagnosis subagent, receiving a repeat-dispatch continuation

**As a** diagnosis subagent already holding first-failure context,
**I want** the parent's continuation message to hand me the verbatim new alert evidence,
**So that** I determine whether the failure class changed rather than accepting the parent's assertion of similarity.

**Acceptance Criteria**:
- [ ] Continuation prompt shape is specified: prior-context reference (subagent already holds it) + verbatim new alert body + return-schema directive.
- [ ] Return contract on repeat dispatch extends the JSON schema with `failure_class_changed: boolean`.
- [ ] Subagent is instructed to set `failure_class_changed = true` when classifier reason, error taxonomy, or the failing test/step differs from the first failure; false when they match.

### US3: Operator, at the D.7 escalation gate after a Requeue

**As a** cockpit operator staring at a repeat-failure escalation gate,
**I want** the presentation to state whether the failure class changed across the requeue,
**So that** I can distinguish "requeue did nothing" from "requeue made progress and revealed a new problem" before choosing Requeue again, Skip, or Stop.

**Acceptance Criteria**:
- [ ] G.4b presentation block for repeat dispatches includes a "Failure class" row: `changed` vs `unchanged`, sourced verbatim from the verdict's `failure_class_changed` field.
- [ ] When `failure_class_changed = true`, the recommendation-calculus guidance notes that the requeue made progress and Skip should not be assumed to be the safe default.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Add a "Repeat failure" subsection to auto.md § D.7 covering the second-and-subsequent `agent:error` / `failed:*` transition for the same issue within one auto session. | P1 | Sits under existing § D.7 (auto.md:260). |
| FR-002 | Repeat-failure dispatch MUST fetch fresh evidence via `cockpit_context(issue=<issue-ref>)` before any subagent continuation. | P1 | Same evidence verb as first dispatch. No ad-hoc `gh` chains. |
| FR-003 | Parent-authored characterizations of the failure ("identical", "same class", etc.) are prohibited in the continuation prompt. | P1 | Loop-trust-boundary principle applied to the parent. |
| FR-004 | Continuation prompt MUST carry the verbatim new alert body (classifier reason + output tail) alongside the prior context reference. | P1 | Prior context stays in the subagent; new evidence is what the parent forwards. |
| FR-005 | Diagnosis verdict JSON schema gains `failure_class_changed: boolean` on repeat dispatches. | P1 | Determined by the subagent from evidence, not by the parent. |
| FR-006 | Gate contract G.4b presentation block gains a "Failure class" row on repeat dispatches, populated verbatim from `failure_class_changed`. | P1 | See auto.md § Gate contract (search for G.4b). |
| FR-007 | Recommendation-calculus guidance in D.7 notes that `failure_class_changed = true` after a Requeue means the requeue made progress; Skip is not the default in that case. | P2 | Guidance text — does not change the option set. |
| FR-008 | Playbook-verification regression: D.7 section text asserts the repeat-dispatch evidence-fetch requirement AND the no-parent-characterization rule. | P1 | Positive fixture. |
| FR-009 | Playbook-verification negative fixture: a D.7 variant whose repeat path passes a similarity assertion instead of evidence is flagged. | P1 | Guards against regression to the observed shape. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Repeat D.7 dispatches with no fresh-evidence fetch | 0 across a cockpit auto session | Ledger inspection — each repeat D.7 must show a preceding `cockpit_context` call in the same dispatch turn. |
| SC-002 | Diagnosis-verdict verdicts containing `failure_class_changed` on repeat dispatch | 100% | Verdict JSON parsed from ledger / subagent return; field required on repeat dispatches. |
| SC-003 | Playbook-verification suite passes both new fixtures (positive + negative). | Pass | CI run of the playbook-verification suite. |
| SC-004 | On a snappoll-1-shape re-run of the observed scenario, the escalation-gate presentation shows "Failure class: changed" and does NOT recommend Skip. | Verified | Manual smoke on a scripted repeat-failure fixture. |

## Assumptions

- The engine's `#915` alert format (classifier reason + output tail in every alert body) is stable and available at the time of the repeat dispatch. No change to the engine bundle is required as part of this feature.
- The auto-mode parent continues to use SendMessage to continue the existing diagnosis subagent across repeat failures — context reuse is right; only what the continuation prompt carries is being tightened.
- The gate option set (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`) is unchanged. Only the presentation gains a "Failure class" row.

## Out of Scope

- Changes to first-dispatch D.7 behavior (already correct).
- Changes to other escalation gates (D.10 unrecognized-state, D.11 merge-conflicts) — their evidence contracts are separate work.
- Any engine-side change to the alert payload shape (#915 already ships what is needed).
- Automatic re-classification or auto-Requeue when `failure_class_changed = true` — the operator still decides at the gate.
- Cross-session memory of prior failures — the repeat-dispatch rule scopes to "within one auto session".

---

*Generated by speckit*
