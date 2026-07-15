# Feature Specification: Enforce inline-thread posting on request-changes review verdict

**Branch**: `422-summary-auto-md-s` | **Date**: 2026-07-15 | **Status**: Draft
**Source**: [generacy-ai/agency#422](https://github.com/generacy-ai/agency/issues/422)
**Workflow**: `workflow:speckit-bugfix`

## Summary

The `auto.md` D.2/D.3 and `review.md` playbooks specify that on a `request-changes` verdict the executor must POST a `COMMENT`-event PR review whose findings are carried as inline anchored `comments[]` — each finding becoming a resolvable review thread on `file:line`. Those threads are the signal `PrFeedbackMonitorService` (generacy#861/#869/#878/#883 lineage) keys on to apply `waiting-for:address-pr-feedback` and enqueue fix work.

On the snappoll dogfood run (christrudelpw/snappoll PR #14, 2026-07-14), two consecutive request-changes verdicts were instead posted as single top-level COMMENT bodies with `comments[]` empty. `reviewThreads(first:30)` on PR #14 returned `[]`. With no unresolved threads the monitor never fired, no `waiting-for:address-pr-feedback` label was applied, and the round-2 remediation steps (`git rm -r --cached node_modules .env`) were never executed by any agent — an operator ran them manually 26 minutes later at 23:15:43.

This spec captures the fix that makes the contract self-enforcing: the request-changes side-effect must produce ≥1 inline thread when findings exist, and the workflow must fail-closed if it does not.

## Evidence

- 2026-07-14T22:07:46Z — PR #14 review 1 (`generacy-ai`, event `COMMENTED`): one body containing "3 blocking findings" as markdown sections. Zero inline comments.
- 2026-07-14T22:49:54Z — PR #14 review 2 (event `COMMENTED`): body "previous request-changes findings are not actually resolved". Zero inline comments.
- GraphQL: `pullRequest(number:14).reviewThreads(first:30)` → empty.
- Contract source at `packages/claude-plugin-cockpit/commands/auto.md:181,586,592` and `packages/claude-plugin-cockpit/commands/review.md:11,97,117-123,143`.
- Related upstream gate-race bug filed on generacy (server-side flow advancing `implementation-review` after a request-changes review) — must land alongside this fix; neither alone is sufficient.

## User Stories

### US1 — Operator running `/cockpit:auto` on a PR that needs changes

**As an** operator driving an epic through `/cockpit:auto`,
**I want** a `request-changes` verdict to produce one resolvable inline thread per finding,
**So that** `PrFeedbackMonitorService` picks up the threads, transitions the PR to `waiting-for:address-pr-feedback`, and the fix loop runs autonomously instead of stalling until I notice.

**Acceptance Criteria**:
- [ ] After a `request-changes` verdict with N ≥ 1 findings, `reviewThreads` on the PR returns exactly N new unresolved threads within the same command turn.
- [ ] Each thread is anchored to the `file:line` from the corresponding finding.
- [ ] The playbook's Terminal Outcome Check fails and re-prompts if the post produced zero inline threads while findings > 0.
- [ ] The `Feedback posted: N inline comment(s) on PR #<n>` marker line reflects the actual `comments[]` count from the POST response, not the intended count.

### US2 — Fix-loop agent responding to feedback threads

**As a** fix-loop agent awakened by `waiting-for:address-pr-feedback`,
**I want** each finding as a distinct resolvable thread,
**So that** the re-review step can check per-finding thread resolution state rather than re-deriving the entire verdict from the diff.

**Acceptance Criteria**:
- [ ] Each finding is a resolvable thread the fix-loop can mark resolved after addressing.
- [ ] Re-review reads `isResolved` per thread and only re-verifies findings whose threads are still open (or reopened).

### US3 — Findings without a file anchor

**As an** analyzer subagent producing findings,
**I want** a documented fallback for findings that cannot be anchored to `file:line`,
**So that** the executor is never forced to silently drop a finding or fabricate an anchor.

**Acceptance Criteria**:
- [ ] The subagent return contract permits `file: null` / `line: null` for genuinely diff-level findings.
- [ ] The POST body carries anchor-less findings in the review body (with an explicit marker) while still carrying anchored findings as `comments[]`.
- [ ] The Terminal Outcome Check passes as long as (inline threads created) ≥ (findings with a valid anchor).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | On `request-changes` with ≥1 anchored finding, the POST to `repos/{owner}/{repo}/pulls/{n}/reviews` MUST include a non-empty `comments[]` with one entry per anchored finding (`path`, `line`, `body`). | P1 | Restates the existing contract as an enforceable requirement. |
| FR-002 | The playbook MUST verify post-condition: after the POST returns, query `reviewThreads` (or the review's `comments` count from the POST response) and confirm inline-thread count equals anchored-finding count. | P1 | Fail-closed guardrail — the missing check in today's flow. |
| FR-003 | If the verification in FR-002 fails, the playbook MUST NOT emit the `Feedback posted:` terminal marker; instead it emits an `Error handling` line and re-presents the verdict gate. | P1 | Prevents silent completion. |
| FR-004 | The subagent JSON return schema MUST allow `file: null` / `line: null` for un-anchorable findings; the executor renders these in the review body under a clearly labeled "General findings (no file anchor)" section. | P2 | Explicit escape hatch — the current schema is implicitly single-line-anchored. |
| FR-005 | The re-review step (after a fix loop turn) MUST check `reviewThread.isResolved` per finding and skip re-verification of resolved threads. | P2 | Reduces churn and gives the fix loop credit for what it already addressed. |
| FR-006 | The `Feedback posted: N inline comment(s) on PR #<n>` marker MUST report the count returned by the POST response, not the intended count from the analyzer's finding list. | P1 | Removes the divergence that made the snappoll incident invisible in the ledger. |
| FR-007 | This fix ships together with — or is explicitly gated behind — the paired generacy gate-race fix. Landing FR-001…FR-003 without the gate fix leaves the label transition racy; landing the gate fix without this leaves the fix loop blind. | P1 | Coordination requirement, not a technical dependency of a single package. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | On a synthetic PR with N ≥ 1 findings, a `request-changes` verdict produces N inline resolvable threads. | 100% (N of N) | Post-turn `gh api graphql` on `reviewThreads(first:50)`; count = N; each `isResolved=false`. |
| SC-002 | `PrFeedbackMonitorService` applies `waiting-for:address-pr-feedback` within its normal poll window after a request-changes verdict with anchored findings. | Applied within monitor's poll window (measured on the generacy side; this repo's success is producing the threads that trigger it). | Observe label on PR within monitor's poll window in an integration dogfood run. |
| SC-003 | Zero silent failures: the playbook never emits `Feedback posted:` when the POST created zero inline threads. | 100% | Grep the run's transcript for `Feedback posted:` and cross-reference with the `reviewThreads` count from the same PR. |
| SC-004 | Rerunning the snappoll scenario end-to-end reproduces neither the missing threads nor the manual-intervention step. | 0 manual `git rm --cached` interventions | Repeat the snappoll dogfood run and observe the fix loop executes the round-2 remediation autonomously. |

## Assumptions

- The analyzer subagent's return schema is already single-line-anchored (`{file, line, summary, failure_scenario}`) per `packages/claude-plugin-cockpit/commands/review.md:121`. Extending it to allow nullable anchors is additive and does not break existing callers.
- `gh api` POSTing a review with both `body` and `comments[]` on one's own PR remains permitted under GitHub's self-PR rules for `event: COMMENT` (documented rationale at `review.md:112`).
- `PrFeedbackMonitorService` on the generacy side keys on `reviewThreads`, not on review body text — confirmed by the incident (bodies posted → monitor silent).
- The paired generacy gate-race fix is or will be tracked in the generacy repo; this spec references it as a coordination point but does not implement it.

## Out of Scope

- Fixing the server-side gate-race that lets `implementation-review` advance despite a request-changes review (filed separately in the generacy repo; called out in FR-007).
- Changing the human verdict UX (three-option `AskUserQuestion` with `approve` / `request-changes` / `abort` stays as-is).
- Introducing `event: REQUEST_CHANGES` on self-PRs — GitHub still blocks that on single-credential setups; the `event: COMMENT` + inline threads pattern remains the mechanism.
- Multi-line thread anchors (`start_line` / `side` variants) — findings anchor to a single line as today.
- Retroactive re-posting of the snappoll #14 threads (that PR has already been resolved manually).

---

*Generated by speckit*
