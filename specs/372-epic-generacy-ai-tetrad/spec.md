# Feature Specification: Epic: generacy-ai/tetrad-development#85 | Phase: S4 | Tier: v1-simplification | Issue: A-S1

Rewrite claude-plugin-cockpit to exactly six commands per plan rev 3: watch, status, queue, clarify, review, merge — all assist-mode, each self-contained (contract = the CLI verb's --help + the @generacy-ai/cockpit README; no references to specs/** contracts, no invoking other slash commands)

**Branch**: `372-epic-generacy-ai-tetrad` | **Date**: 2026-07-06 | **Status**: Draft

## Summary

Epic: generacy-ai/tetrad-development#85 | Phase: S4 | Tier: v1-simplification | Issue: A-S1

Rewrite claude-plugin-cockpit to exactly six commands per plan rev 3: watch, status, queue, clarify, review, merge — all assist-mode, each self-contained (contract = the CLI verb's --help + the @generacy-ai/cockpit README; no references to specs/** contracts, no invoking other slash commands). watch: Monitor runs `generacy cockpit watch <epic-ref>`; per transition line print one notification with the suggested next /cockpit:* command; no policy lookup, no dedupe/baseline handling, no PushNotification; on watcher exit report and stop (~20 lines). review: runs /code-review for --gate impl, summarizes the artifact otherwise, and on approval calls `generacy cockpit advance --gate <g>` directly (fixes the unshipped /cockpit:advance reference). merge: keeps the bounded fixer subagent (--max-fix-attempts default 1; never merges on red). Delete plan.md, breakdown.md, file.md, bug.md. One short shared error convention (missing binary / gh auth / other). README: current command table + marketplace install via extraKnownMarketplaces; remove the stale "coming in #351–#360" copy.

Owns (isolation): packages/claude-plugin-cockpit/**

Acceptance: six command files only; no reference to autonomy policy, transition/policy schemas, feature-branch specs, or unshipped verbs; each command runnable in a fresh session with only the plugin + gh auth + generacy CLI installed.

Depends on: G-S2, G-S3 (context verb, epic-body discovery, queue signature) (see the epic checklist for issue numbers)

---
Part of the Epic Cockpit. Plan: docs/epic-cockpit-plan.md in tetrad-development (S4 / A-S1).


## User Stories

### US1: Simplified assist-mode cockpit for epic operators

**As an** epic operator using claude-plugin-cockpit,
**I want** exactly six self-contained assist-mode commands (watch, status, queue, clarify, review, merge),
**So that** I can drive an epic end-to-end using only the plugin, `gh` auth, and the `generacy` CLI in a fresh session — with no hidden dependencies on other slash commands or specs/** contracts.

**Acceptance Criteria**:
- [ ] `packages/claude-plugin-cockpit/commands/` contains exactly six files: `watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md`.
- [ ] `plan.md`, `breakdown.md`, `file.md`, and `bug.md` are removed.
- [ ] No command references autonomy policy, transition/policy schemas, `specs/**` feature-branch contracts, or unshipped verbs (e.g., `/cockpit:advance`).
- [ ] Each command's contract is limited to the corresponding `generacy cockpit <verb> --help` output + the `@generacy-ai/cockpit` README.
- [ ] No command invokes another `/cockpit:*` slash command; commands compose only via the `generacy` CLI.
- [ ] Every command runs successfully in a fresh Claude session with only the plugin + `gh auth` + `generacy` CLI installed.

### US2: Watch surfaces suggested next command per transition

**As an** operator running `/cockpit:watch <epic-ref>`,
**I want** each transition line from `generacy cockpit watch` printed as a single notification suggesting the next `/cockpit:*` command,
**So that** I always know what to run next without policy lookup, dedupe/baseline logic, or push notifications.

**Acceptance Criteria**:
- [ ] `watch.md` uses `Monitor` to stream `generacy cockpit watch <epic-ref>`.
- [ ] For each transition line emitted by the CLI, exactly one notification is printed that suggests the next `/cockpit:*` command.
- [ ] No policy lookup, no dedupe/baseline handling, no `PushNotification` calls.
- [ ] When the watcher process exits, the command reports the exit and stops.
- [ ] Command body is approximately 20 lines.

### US3: Review runs code-review for impl gate and advances directly on approval

**As an** operator running `/cockpit:review --gate <g>`,
**I want** the command to invoke `/code-review` for the `impl` gate (and summarize the artifact for other gates), then call `generacy cockpit advance --gate <g>` directly on my approval,
**So that** review→advance flows without touching the unshipped `/cockpit:advance` verb.

**Acceptance Criteria**:
- [ ] For `--gate impl`, `review.md` runs `/code-review` against the current branch.
- [ ] For all other gates, `review.md` summarizes the gate artifact.
- [ ] On operator approval, the command calls `generacy cockpit advance --gate <g>` directly (no `/cockpit:advance` reference).

### US4: Merge keeps a bounded fixer subagent and never merges on red

**As an** operator running `/cockpit:merge`,
**I want** a bounded fixer subagent with `--max-fix-attempts` defaulting to 1 that never merges when CI is red,
**So that** merge is safe by default and does not spin indefinitely on failures.

**Acceptance Criteria**:
- [ ] `merge.md` supports `--max-fix-attempts` with default `1`.
- [ ] The command never merges while CI status is red.
- [ ] The fixer subagent runs at most `--max-fix-attempts` times before giving up and reporting.

### US5: Shared error convention across all six commands

**As an** operator hitting a missing-binary, `gh` auth, or other prerequisite failure,
**I want** every command to surface the same short error convention,
**So that** the failure mode is predictable and the fix is obvious across the plugin.

**Acceptance Criteria**:
- [ ] All six commands share one short error convention covering: missing `generacy` binary, missing/expired `gh` auth, other prerequisite failures.
- [ ] The convention is documented once (README or shared snippet) and referenced consistently.

### US6: README reflects current command table and marketplace install

**As a** new user installing `@generacy-ai/cockpit`,
**I want** the README to show the six-command table and the marketplace install via `extraKnownMarketplaces`,
**So that** I can install and use the plugin without hitting stale copy about unshipped commands.

**Acceptance Criteria**:
- [ ] README lists the six commands (watch, status, queue, clarify, review, merge) with one-line descriptions.
- [ ] README documents marketplace install via `extraKnownMarketplaces`.
- [ ] All "coming in #351–#360" copy is removed.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `packages/claude-plugin-cockpit/commands/` contains exactly six command files: `watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md`. | P1 | |
| FR-002 | Delete `plan.md`, `breakdown.md`, `file.md`, `bug.md` from `packages/claude-plugin-cockpit/commands/`. | P1 | |
| FR-003 | All six commands are assist-mode and each is self-contained. | P1 | Contract = CLI verb `--help` + README only. |
| FR-004 | No command references `specs/**` contracts, autonomy policy, transition/policy schemas, or feature-branch specs. | P1 | |
| FR-005 | No command invokes another `/cockpit:*` slash command. | P1 | Composition happens via `generacy` CLI only. |
| FR-006 | `watch.md` runs `Monitor generacy cockpit watch <epic-ref>` and prints one notification per transition line with the suggested next `/cockpit:*` command. | P1 | ~20 lines. |
| FR-007 | `watch.md` performs no policy lookup, no dedupe/baseline handling, no `PushNotification`. | P1 | |
| FR-008 | `watch.md` reports and stops when the watcher process exits. | P1 | |
| FR-009 | `review.md` runs `/code-review` when `--gate impl`, otherwise summarizes the gate artifact. | P1 | |
| FR-010 | `review.md` calls `generacy cockpit advance --gate <g>` directly on operator approval. | P1 | No reference to unshipped `/cockpit:advance`. |
| FR-011 | `merge.md` supports `--max-fix-attempts` with default `1` and never merges on red CI. | P1 | Bounded fixer subagent. |
| FR-012 | All six commands share one short error convention (missing binary, `gh` auth, other). | P2 | |
| FR-013 | README shows the current six-command table and documents marketplace install via `extraKnownMarketplaces`. | P1 | |
| FR-014 | README removes all "coming in #351–#360" copy. | P1 | |
| FR-015 | Every command is runnable in a fresh Claude session with only the plugin + `gh` auth + `generacy` CLI installed. | P1 | Acceptance gate. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Command file count under `packages/claude-plugin-cockpit/commands/` | Exactly 6 | `ls packages/claude-plugin-cockpit/commands/*.md \| wc -l` |
| SC-002 | Occurrences of `specs/`, autonomy-policy terms, or `/cockpit:advance` in command files | 0 | `grep` sweep across the six command files |
| SC-003 | Fresh-session runnability | 100% of six commands run without error | Manual walk-through in a clean environment with only plugin + `gh` + `generacy` CLI |
| SC-004 | `watch.md` line count | ≈20 lines | `wc -l packages/claude-plugin-cockpit/commands/watch.md` |
| SC-005 | `merge.md` never merges when CI is red | 0 red-CI merges | Verified by CI-red scenario walk-through |
| SC-006 | README references to unshipped `#351–#360` copy | 0 | `grep -c` against README |

## Assumptions

- The `generacy` CLI already provides `cockpit watch`, `cockpit advance --gate <g>`, and the other verbs the commands depend on (per dependencies G-S2, G-S3).
- The `@generacy-ai/cockpit` README is the canonical operator reference; command bodies do not duplicate its content.
- `Monitor` is the sanctioned tool for streaming long-running CLI output inside a slash command.
- Operators run these commands from within a Claude session with `gh` authenticated and the `generacy` CLI on `PATH`.

## Out of Scope

- Autonomy policy, transition schemas, or any policy-lookup logic in `/cockpit:watch`.
- `PushNotification` / AFK push behavior in `watch` (previously in scope for issue #360; explicitly removed in this rewrite).
- Any new `/cockpit:*` command beyond the six listed.
- Any reference to or reintroduction of `plan.md`, `breakdown.md`, `file.md`, `bug.md`.
- Dedupe/baseline handling in `watch`.
- Cross-command invocation via `/cockpit:*` (composition is via the `generacy` CLI only).

---

*Generated by speckit*
