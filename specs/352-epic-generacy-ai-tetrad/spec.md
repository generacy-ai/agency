# Feature Specification: /cockpit:status command

**Branch**: `352-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft

**Epic**: generacy-ai/tetrad-development#85 — Epic Cockpit | **Phase**: P2 | **Tier**: v1-core | **Issue ID**: A2.2

## Summary

Ship the `/cockpit:status` Claude Code slash command in the `claude-plugin-cockpit` plugin. The command invokes the underlying `generacy cockpit status` CLI (delivered in G1.1 / generacy#787) against a given epic and renders the output as a readable epic dashboard inline in the Claude Code conversation — child issues with their phase/state, blocking dependencies, gate progress, and any items requiring human attention.

This is one of the five P2 core commands (`watch`, `status`, `clarify`, `review`, `merge`) that together constitute v1 of the Epic Cockpit developer-side workflow automation layer. It is a thin slash-command wrapper: the actual data and rendering logic live in the `@generacy-ai/cockpit` engine; this command's job is to surface that output ergonomically to a developer driving an epic from Claude Code.

**Owns (isolation)**: `packages/claude-plugin-cockpit/commands/status.md`

**Depends on**:
- G1.1 — generacy-ai/generacy#787 (CLI: `cockpit watch + status`) — provides the `generacy cockpit status` command this wraps
- A1.4 — generacy-ai/agency#350 (claude-plugin-cockpit scaffold + marketplace entry) — provides the plugin and `commands/` directory this drops into (already merged)

**Plan**: `docs/epic-cockpit-plan.md` in `tetrad-development` (P2 / A2.2).

## User Stories

### US1: Check epic status from inside Claude Code

**As a** developer driving a speckit epic,
**I want** to type `/cockpit:status <epic>` in Claude Code and immediately see a readable dashboard of every child issue, its current gate, and what is blocking,
**So that** I can decide what to work on or unblock next without leaving the conversation to read GitHub tabs or shell into the CLI.

**Acceptance Criteria**:
- [ ] Typing `/cockpit:status <epic-ref>` in Claude Code triggers `generacy cockpit status <epic-ref>` and renders the result.
- [ ] The rendered output identifies the epic, lists each child issue grouped by phase, and shows each child's current speckit phase/gate and state (open/in-progress/blocked/done).
- [ ] Blocked or stuck items are visually distinct from items making progress.
- [ ] When the CLI is not installed or the epic ref is invalid, the command prints an actionable error rather than failing silently.

### US2: Quick check across multiple epics

**As a** developer juggling more than one epic,
**I want** `/cockpit:status` (without arguments) to default to the epic of the current branch (or list known epics),
**So that** the common case requires no arguments.

**Acceptance Criteria**:
- [ ] Invoking `/cockpit:status` with no arguments resolves the epic from the current git branch / spec directory when possible.
- [ ] If no epic can be resolved, the command prints a usage hint listing how to specify an epic.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Ship `packages/claude-plugin-cockpit/commands/status.md` as a Claude Code slash command file. | P1 | Owns this single file per epic isolation rule. |
| FR-002 | The command invokes the `generacy cockpit status` CLI (from G1.1) with the user-supplied epic reference. | P1 | Wrapper only — does not reimplement status logic. |
| FR-003 | Render the CLI output as a readable epic dashboard (phase grouping, per-child state, dependency / blocker flags). | P1 | "Prints the epic dashboard" — primary acceptance from issue body. |
| FR-004 | Accept an epic reference argument (`owner/repo#N`, `#N`, or URL) and pass it through to the CLI. | P1 | Argument shape must match the CLI contract from G1.1. |
| FR-005 | When invoked without arguments, infer the epic from the current branch / spec directory. | P2 | Falls back to a usage hint if inference fails. |
| FR-006 | Surface CLI errors (missing binary, auth failure, unknown epic) as actionable messages in the conversation. | P1 | Must not silently no-op. |
| FR-007 | Command file conforms to the Claude Code plugin command schema and is loadable via the agency marketplace. | P1 | Must round-trip through `claude-plugin-cockpit` installation. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Command is discoverable in Claude Code after installing the cockpit plugin. | `/cockpit:status` appears in the slash-command palette. | Manual: install the plugin from the agency marketplace, list commands. |
| SC-002 | Status dashboard renders for a real epic. | Running `/cockpit:status generacy-ai/tetrad-development#85` prints all 19 children grouped by phase, with state per child. | Manual run against the Epic Cockpit epic itself. |
| SC-003 | Error path is actionable. | Invoking against a non-existent epic returns an error naming the missing ref and the next step. | Manual: pass a bogus epic ref. |
| SC-004 | No regression in sibling cockpit commands. | Other `/cockpit:*` files in the plugin remain loadable. | Smoke-test the plugin after the new file lands. |

## Assumptions

- The `generacy cockpit status` CLI (G1.1 / generacy#787) lands first and exposes a stable text output that this command can render verbatim or lightly format.
- The `claude-plugin-cockpit` scaffold (A1.4 / #350) is already merged — `packages/claude-plugin-cockpit/commands/.gitkeep` confirms the empty directory exists ready for `status.md`.
- The slash command is a markdown file (per the existing plugin convention) that Claude Code executes via its standard plugin runtime — no TypeScript / compiled code is added by this issue.
- The dashboard rendering is the CLI's responsibility; this command's responsibility is invocation, argument plumbing, and surfacing errors.

## Out of Scope

- The `generacy cockpit status` CLI itself (delivered by generacy#787).
- Any other `/cockpit:*` commands (`watch`, `clarify`, `review`, `merge` — each has its own P2 issue: #351, #353, #354, #355).
- A reactive / streaming variant of status (covered by `/cockpit:watch` in #351).
- The polished orchestrator API status tier and stuck detection (P5 — generacy#792, #793).
- Marketplace publication / versioning of the cockpit plugin (handled by the scaffold issue #350 and its release flow).

---

*Generated by speckit*
