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

## Clarifications

Resolved in Batch 1 (2026-06-26) — see `clarifications.md` for full Q/A context.

- **Rendering split (Q1)**: The slash command wraps the CLI's text output in a fenced code block (optionally prefixed with a one-line header). Structure, grouping, and visual decoration remain the CLI's responsibility.
- **CLI output contract (Q2)**: `generacy cockpit status` (G1.1 / generacy#787) defaults to human-readable text and supports `--json` for structured output (per #787 FR-013). This command consumes the default text form.
- **No-arg epic resolution (Q3)**: With no arguments, parse the current branch's `spec.md` `**Epic**:` line (e.g. `generacy-ai/tetrad-development#85`). Fall back to the single epic under `.generacy/epics/` if the working directory is not on a child branch. If neither resolves, print a usage hint.
- **`#N` shorthand (Q4)**: The slash command does not reinterpret bare `#N` references. The argument is passed through verbatim to the CLI/engine resolver (consistent with generacy#788).
- **Error UX (Q5)**: Detect common failures and emit tailored messages — missing binary → install hint; auth failure → `gh auth` hint; unknown epic → resolution guidance. Surface raw stderr for any other failure. Never silently no-op.

## User Stories

### US1: Check epic status from inside Claude Code

**As a** developer driving a speckit epic,
**I want** to type `/cockpit:status <epic>` in Claude Code and immediately see a readable dashboard of every child issue, its current gate, and what is blocking,
**So that** I can decide what to work on or unblock next without leaving the conversation to read GitHub tabs or shell into the CLI.

**Acceptance Criteria**:
- [ ] Typing `/cockpit:status <epic-ref>` in Claude Code triggers `generacy cockpit status <epic-ref>` and renders the result.
- [ ] The rendered output identifies the epic, lists each child issue grouped by phase, and shows each child's current speckit phase/gate and state (open/in-progress/blocked/done).
- [ ] Blocked or stuck items are visually distinct from items making progress (delivered by the CLI's text formatting; the slash command preserves it via the fenced code block).
- [ ] When the CLI is not installed or the epic ref is invalid, the command prints an actionable error rather than failing silently.

### US2: Quick check across multiple epics

**As a** developer juggling more than one epic,
**I want** `/cockpit:status` (without arguments) to default to the epic of the current branch,
**So that** the common case requires no arguments.

**Acceptance Criteria**:
- [ ] Invoking `/cockpit:status` with no arguments resolves the epic by parsing the current branch's `spec.md` `**Epic**:` line.
- [ ] If the branch has no `spec.md` (or no `**Epic**:` line), the command falls back to the single epic in `.generacy/epics/`.
- [ ] If no epic can be resolved, the command prints a usage hint listing how to specify an epic explicitly.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Ship `packages/claude-plugin-cockpit/commands/status.md` as a Claude Code slash command file. | P1 | Owns this single file per epic isolation rule. |
| FR-002 | The command invokes the `generacy cockpit status` CLI (from G1.1) with the user-supplied epic reference. | P1 | Wrapper only — does not reimplement status logic. |
| FR-003 | Render the CLI's text output inside a fenced code block in the Claude Code conversation, optionally prefixed with a one-line header identifying the epic. | P1 | Phase grouping / per-child state / blocker decoration are produced by the CLI; the slash command preserves them by wrapping the output verbatim. |
| FR-004 | Accept an epic reference argument (`owner/repo#N`, `#N`, or URL) and pass it through verbatim to the CLI. | P1 | Bare `#N` is NOT reinterpreted by the slash command — the CLI/engine resolver owns repo defaulting (consistent with generacy#788). |
| FR-005 | When invoked without arguments, resolve the epic by parsing the current branch's `spec.md` `**Epic**:` line; fall back to the single epic in `.generacy/epics/`; otherwise print a usage hint. | P2 | Branch alone is insufficient — branch names are child-issue scoped. |
| FR-006 | On CLI failure, detect missing-binary / auth-failure / unknown-epic cases and emit tailored, actionable messages; surface raw stderr for unrecognized failures. Must never silently no-op. | P1 | Missing binary → install hint; auth failure → `gh auth` hint; unknown epic → resolution guidance. |
| FR-007 | Command file conforms to the Claude Code plugin command schema and is loadable via the agency marketplace. | P1 | Must round-trip through `claude-plugin-cockpit` installation. |
| FR-008 | The slash command consumes the CLI's default text output (not `--json`). | P2 | `--json` exists per #787 FR-013 but is reserved for future structured renderers; out of scope here. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Command is discoverable in Claude Code after installing the cockpit plugin. | `/cockpit:status` appears in the slash-command palette. | Manual: install the plugin from the agency marketplace, list commands. |
| SC-002 | Status dashboard renders for a real epic. | Running `/cockpit:status generacy-ai/tetrad-development#85` prints all 19 children grouped by phase, with state per child, inside a fenced code block. | Manual run against the Epic Cockpit epic itself. |
| SC-003 | No-arg resolution works on a child branch. | Running `/cockpit:status` (no args) from this branch renders the Epic Cockpit dashboard. | Manual on `352-epic-generacy-ai-tetrad`. |
| SC-004 | Error path is actionable. | Invoking against a non-existent epic returns an error naming the missing ref and the next step; invoking without the CLI installed returns the install hint. | Manual: pass a bogus epic ref; uninstall CLI and rerun. |
| SC-005 | No regression in sibling cockpit commands. | Other `/cockpit:*` files in the plugin remain loadable. | Smoke-test the plugin after the new file lands. |

## Assumptions

- The `generacy cockpit status` CLI (G1.1 / generacy#787) lands first and emits a stable, human-readable text output that this command can wrap verbatim in a fenced code block.
- The `claude-plugin-cockpit` scaffold (A1.4 / #350) is already merged — `packages/claude-plugin-cockpit/commands/.gitkeep` confirms the empty directory exists ready for `status.md`.
- The slash command is a markdown file (per the existing plugin convention) that Claude Code executes via its standard plugin runtime — no TypeScript / compiled code is added by this issue.
- The dashboard rendering (phase grouping, blocker highlighting, formatting) is the CLI's responsibility; this command's responsibility is invocation, argument plumbing, fenced-block presentation, and surfacing errors.
- Repository defaulting for bare `#N` references lives in the CLI/engine resolver (generacy#788), so the slash command treats `#N` as opaque pass-through.

## Out of Scope

- The `generacy cockpit status` CLI itself (delivered by generacy#787).
- Any other `/cockpit:*` commands (`watch`, `clarify`, `review`, `merge` — each has its own P2 issue: #351, #353, #354, #355).
- A reactive / streaming variant of status (covered by `/cockpit:watch` in #351).
- A structured-JSON renderer that consumes `generacy cockpit status --json`; this command consumes the default text form.
- The polished orchestrator API status tier and stuck detection (P5 — generacy#792, #793).
- Marketplace publication / versioning of the cockpit plugin (handled by the scaffold issue #350 and its release flow).

---

*Generated by speckit*
