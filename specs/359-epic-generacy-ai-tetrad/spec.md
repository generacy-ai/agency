# Feature Specification: /cockpit:queue command

**Branch**: `359-epic-generacy-ai-tetrad` | **Date**: 2026-06-29 | **Status**: Draft
**Epic**: generacy-ai/tetrad-development#85 | Phase: P4 | Tier: v2-pipeline | Issue: A4.4

## Summary

Add a `/cockpit:queue <phase>` slash command to the `claude-plugin-cockpit` package that wraps the `generacy cockpit queue <phase>` CLI verb behind an explicit confirmation step. The command lets a developer queue a speckit phase for execution from inside Claude Code without bypassing the human-in-the-loop checkpoint that the v2 pipeline tier requires.

Owns (isolation): `packages/claude-plugin-cockpit/commands/queue.md`

Acceptance: Queues a phase after confirmation.

Depends on: G3.2 (CLI `cockpit queue` verb), A1.4 (shared argument/resolver scaffolding). See the epic checklist for current issue numbers.

---
Part of the Epic Cockpit. Plan: `docs/epic-cockpit-plan.md` in tetrad-development (P4 / A4.4).

## User Stories

### US1: Queue a phase with a guard-rail

**As a** developer driving a speckit epic from Claude Code,
**I want** a `/cockpit:queue <phase>` slash command that asks me to confirm before it submits the phase to the cockpit queue,
**So that** I can stage P4 pipeline work without risking an accidental autonomous run when I am still iterating on the spec, plan, or tasks.

**Acceptance Criteria**:
- [ ] `/cockpit:queue <phase>` parses the `<phase>` argument and surfaces it back in the confirmation prompt verbatim.
- [ ] The command does NOT invoke `generacy cockpit queue` until the user explicitly confirms.
- [ ] On confirmation, the command runs `generacy cockpit queue <phase>` and renders the CLI's output.
- [ ] On rejection (or any non-affirmative response), the command exits without invoking the CLI and prints a single terse line that the queue was not submitted.
- [ ] Missing `<phase>` argument produces a usage hint and exits without prompting.

### US2: Discoverable via the cockpit namespace

**As a** plugin consumer who has already installed `claude-plugin-cockpit`,
**I want** `/cockpit:queue` to be listed in the plugin README alongside the existing `/cockpit:*` verbs,
**So that** I can discover it without reading source.

**Acceptance Criteria**:
- [ ] The cockpit plugin README lists `/cockpit:queue` in its commands table with a one-line description.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Ship `packages/claude-plugin-cockpit/commands/queue.md` as the slash-command definition. | P1 | Owns this file per isolation rule. |
| FR-002 | Accept a single positional `<phase>` argument; treat it opaquely and pass it through to the CLI byte-for-byte (matching the `/cockpit:status` pattern for argument handling). | P1 | Do not validate or normalize the phase value inside the slash command — defer to the CLI. |
| FR-003 | Before invoking the CLI, prompt the user with a confirmation request that echoes back the resolved command (`generacy cockpit queue <phase>`). | P1 | Confirmation is the differentiator vs a thin wrapper. |
| FR-004 | Only invoke `generacy cockpit queue <phase>` on an affirmative confirmation. | P1 | "Affirmative" = explicit yes; any other response, including ambiguous responses, aborts. |
| FR-005 | On abort, emit a single terse line (e.g. `Aborted: queue not submitted`) and exit non-zero. | P1 | Mirrors the terse-output convention used by `/cockpit:merge`. |
| FR-006 | On successful CLI invocation, render the CLI's stdout verbatim inside a fenced code block, preceded by a single header line identifying the queued phase. | P1 | Same rendering convention as `/cockpit:status`. |
| FR-007 | Pre-flight `command -v generacy` and produce a `MISSING_BINARY` error message identical in shape to `/cockpit:status` when the CLI is not on `$PATH`. | P1 | Consistency across cockpit verbs. |
| FR-008 | Classify CLI failures (exit ≠ 0) into the same four error classes as `/cockpit:status` (`MISSING_BINARY`, `AUTH_FAILURE`, `UNKNOWN_*`, `OTHER`) with messages adapted to the queue verb. | P1 | Reuse the established error taxonomy. |
| FR-009 | Add a row for `/cockpit:queue` to the Available Commands table in `packages/claude-plugin-cockpit/README.md`. | P2 | Discoverability. |
| FR-010 | Missing `<phase>` argument prints `Usage: /cockpit:queue <phase>` and exits non-zero without prompting. | P1 | Match `/cockpit:merge` usage-error convention. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Confirmation is mandatory | 100% of invocations prompt for confirmation before any CLI call | Verified by manual test + the slash-command file's documented control flow |
| SC-002 | No silent no-ops | Every code path (success, rejection, missing arg, CLI failure) emits exactly one terse line or one fenced output block | Reviewed against the FR list during PR review |
| SC-003 | Argument pass-through fidelity | `<phase>` reaches the CLI byte-for-byte | Manual smoke test with each speckit phase name and at least one bogus value |
| SC-004 | Discoverability | `/cockpit:queue` appears in the cockpit plugin README's command table | Visual inspection of the rendered README |

## Assumptions

- The `generacy cockpit queue <phase>` CLI verb is delivered by dependency G3.2 and accepts a single positional phase argument.
- Shared argument-handling and error-classification patterns (FR-007/FR-008) are already established by `/cockpit:status` and `/cockpit:merge` and can be reused without modification.
- The Claude Code confirmation primitive available to slash commands (e.g. `AskUserQuestion` or equivalent in-context prompt) is acceptable for the confirm gate — this spec does not require a TTY-level confirmation.
- Phase names (`specify`, `clarify`, `plan`, `tasks`, `implement`, etc.) are validated by the CLI, not by the slash command.

## Out of Scope

- Implementing or modifying the `generacy cockpit queue` CLI verb itself (owned by G3.2).
- Batch queueing of multiple phases in one invocation.
- Cancelling or inspecting an already-queued phase (separate cockpit verbs if needed).
- Autonomous-mode bypass of the confirmation gate — this command is explicitly confirm-gated by design; an autonomous variant, if ever required, is a separate issue.
- Phase-name validation, normalization, or default resolution inside the slash command.

---

*Generated by speckit*
