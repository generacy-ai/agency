# Feature Specification: `/cockpit:auto` accepts bare issue-number lists with repo inferred from workspace

**Branch**: `444-summary-cockpit-auto-accept` | **Date**: 2026-07-21 | **Status**: Draft | **Issue**: [#444](https://github.com/generacy-ai/agency/issues/444)

## Summary

`/cockpit:auto` should accept one or more bare issue numbers — e.g. `/cockpit:auto 223, 224, 226` — with the repository inferred from the workspace the command is invoked in. Under the hood the skill auto-creates a lightweight tracking issue seeded with those refs and runs the existing epic-less tracking-mode loop. This removes the requirement that developers author an epic in a specific format before they can use auto, and enables the "Claude found two bugs in conversation → file them → process them" flow.

## Current Behavior

`packages/claude-plugin-cockpit/commands/auto.md` step 1 accepts exactly three invocation forms:

1. `/cockpit:auto <epic-ref>` — one positional `owner/repo#N` (epic mode)
2. `/cockpit:auto --tracking <issue-ref>` — existing tracking issue (epic-less)
3. `/cockpit:auto --new "<title>"` — files a tracking issue via the G.6 gate, then proceeds epic-less

Anything else (multiple refs, bare numbers) prints usage and exits. Repo is never inferred — every form requires a fully qualified `owner/repo#N` ref.

## Proposed Change

Add a fourth invocation form: **issue-number list** (Form 4).

- Accept comma- and/or space-separated tokens; each token is either a bare number `223` or a qualified `owner/repo#N` ref.
- Bare numbers resolve against the workspace repo: parse `owner/repo` from `git remote get-url origin` in the invocation cwd. Resolution MUST happen plugin-side in the operator's session (the cockpit MCP server runs in the orchestrator container and its cwd is meaningless).
- The skill creates a tracking issue seeded with the resolved refs (reusing the Form-3 `--new` path, minus the title prompt), then enters the standard tracking-mode loop against it.
- Update the usage string and ambiguity rules so a single qualified `owner/repo#N` keeps its epic-mode meaning, while bare numbers and multi-token lists route to Form 4.

## User Stories

### US1: Developer processes an ad-hoc pair of bugs found mid-conversation

**As a** developer working with Claude who has just identified two bugs during a debugging session,
**I want** to file them as issues and immediately kick off `/cockpit:auto 512 513` from my workspace,
**So that** I can hand them to the cockpit engine without first authoring a formal epic or looking up my repo slug.

**Acceptance Criteria**:
- [ ] `/cockpit:auto 512 513` in a workspace with origin `generacy-ai/agency` creates a tracking issue with body containing `- [ ] generacy-ai/agency#512` and `- [ ] generacy-ai/agency#513`.
- [ ] The tracking issue title follows the convention `Tracking: auto session YYYY-MM-DD — #512 #513`.
- [ ] The tracking issue carries the `cockpit:tracking` label.
- [ ] Auto proceeds exactly as if the operator had invoked `/cockpit:auto --tracking <new-ref>`.

### US2: Developer runs auto against a single ad-hoc issue

**As a** developer,
**I want** `/cockpit:auto 512` to work the same way as the list form,
**So that** single-issue ad-hoc runs don't require a qualified `owner/repo#N` ref.

**Acceptance Criteria**:
- [ ] `/cockpit:auto 512` creates a single-item tracking issue and enters the standard auto loop.
- [ ] Output messaging clearly indicates the tracking issue was auto-created.

### US3: Developer mixes bare numbers with cross-repo qualified refs

**As a** developer coordinating work that spans repos,
**I want** `/cockpit:auto 512 other-org/other-repo#41` to accept the mixed form,
**So that** I can pull in cross-repo issues without dropping the ergonomic shortcut for workspace-local ones.

**Acceptance Criteria**:
- [ ] Bare numbers resolve against workspace origin; qualified refs pass through unchanged.
- [ ] Tracking issue body lists all refs fully qualified.

### US4: Operator invocation outside a git repo fails loudly

**As an** operator,
**I want** a clear error when I invoke `/cockpit:auto 512` from a cwd that is not a git repo with a GitHub origin,
**So that** I don't accidentally target the wrong repo or see a cryptic downstream failure.

**Acceptance Criteria**:
- [ ] Invocation from a non-git cwd exits with a diagnostic before any MCP tool is called and before any issue is filed.
- [ ] Invocation from a git repo whose `origin` is not a GitHub URL exits with a diagnostic.
- [ ] The error message names the cwd and the resolution step that failed.

### US5: Existing Forms 1–3 continue to work

**As an** existing user of `/cockpit:auto`,
**I want** epic mode, `--tracking`, and `--new` to keep behaving exactly as they do today,
**So that** the new form is additive and does not break my current workflows.

**Acceptance Criteria**:
- [ ] A single qualified `owner/repo#N` token still enters epic mode.
- [ ] `--tracking` and `--new` behavior is unchanged.
- [ ] Ambiguity rules documented in step 1 are updated to reflect Form 4 without altering Form 1's meaning.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Parse invocation args as a list of tokens, splitting on commas and whitespace. | P1 | Empty list after `/cockpit:auto` continues to print usage. |
| FR-002 | Classify each token as either bare number (`^\d+$`) or qualified ref (`owner/repo#N`). Reject anything else with usage. | P1 | |
| FR-003 | For bare numbers, resolve `owner/repo` by running `git remote get-url origin` in the invocation cwd (plugin-side, before any MCP call) and parsing the GitHub URL. | P1 | Support both `git@github.com:owner/repo(.git)?` and `https://github.com/owner/repo(.git)?` forms. |
| FR-004 | If resolution fails (not a git repo, no `origin`, non-GitHub origin), exit with a clear diagnostic naming the cwd and the failure reason. Do not create any issue. | P1 | |
| FR-005 | When the token list contains multiple tokens OR any bare number, route to Form 4 (issue-number list). | P1 | |
| FR-006 | When the token list is a single qualified `owner/repo#N`, keep Form 1 (epic mode) semantics. | P1 | Preserves backward compatibility. |
| FR-007 | Form 4 creates a tracking issue with title `Tracking: auto session YYYY-MM-DD — #N1 #N2 …`, truncated sensibly for long lists. | P1 | Date is the invocation date in the operator's local TZ. |
| FR-008 | The tracking issue body is a flat task list of fully qualified refs (one `- [ ] owner/repo#N` per line), with no phase headings. | P1 | Engine resolver rejects bare `#N` in bodies today. |
| FR-009 | Apply the `cockpit:tracking` label to the tracking issue. Create the label if it does not exist in the tracking-issue's repo. | P1 | |
| FR-010 | After creation, proceed exactly as `invocationForm: tracking-existing`: doorbell/await-events keyed on the new tracking ref; mid-run `cockpit_scope_add` additions land under `## Ad-hoc`. | P1 | |
| FR-011 | Terminal condition is the existing G.7 scope-drained gate; on completion the tracking issue is closed. | P1 | |
| FR-012 | Update `packages/claude-plugin-cockpit/commands/auto.md` step 1 usage string and ambiguity rules to document Form 4. | P1 | |
| FR-013 | Re-pin the playbook-verification tests to the updated `auto.md` contract — do not weaken assertions. | P1 | Per CLAUDE.md guidance on pinning tests. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Adoption: fraction of `/cockpit:auto` invocations that use Form 4 within 30 days of merge. | ≥ 30% | Grep operator session logs / cockpit telemetry for Form 4 marker. |
| SC-002 | Time-to-first-loop-iteration for an ad-hoc bug pair (issues already filed → auto running). | ≤ 30 seconds from `/cockpit:auto <numbers>` to first doorbell wait. | Operator-side timing during acceptance walkthrough. |
| SC-003 | Regressions in Forms 1–3. | Zero — all existing pinning assertions still pass after re-pin. | `pnpm test` on `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. |
| SC-004 | Clarity of "not a git repo" failure. | 100% of test invocations from a non-git cwd fail before any MCP call. | Manual verification + a targeted unit/integration test. |

## Assumptions

- The operator's session runs in a shell environment where `git remote get-url origin` is available and returns a GitHub URL for supported workspaces.
- The engine's flat-scope body parser (already used by Form 3 `--new`) accepts the same body format we intend to write.
- The `cockpit:tracking` label convention does not collide with existing labels; if it exists, we reuse it as-is.
- Tracking-issue creation happens against the workspace-origin repo; cross-repo qualified refs in the token list do not change *where* the tracking issue lives.

## Out of Scope

- Engine or MCP schema changes — all ref-resolution and tracking-issue mechanics live in the plugin playbook.
- Inline phase grouping for issue lists (flat scope only for now).
- Parallel execution of concurrent auto sessions (cluster worker lease is a separate concern).
- Interactive prompts for confirming the resolved `owner/repo` — resolution is silent on success, loud on failure.

---

*Generated by speckit — enhanced from issue #444*
