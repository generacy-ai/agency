# Implementation Plan: /cockpit:status command

**Feature**: Ship the `/cockpit:status` Claude Code slash command in `claude-plugin-cockpit`, wrapping `generacy cockpit status` and rendering its text output verbatim
**Branch**: `352-epic-generacy-ai-tetrad`
**Date**: 2026-06-26
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Add a single markdown file — `packages/claude-plugin-cockpit/commands/status.md` — to the already-scaffolded `claude-plugin-cockpit` package (#350). The file is a Claude Code slash-command definition that:

1. Accepts an optional epic reference (`owner/repo#N`, `#N`, or URL).
2. If no argument is supplied, parses the current branch's `spec.md` `**Epic**:` line, falling back to the single epic in `.generacy/epics/`, otherwise prints a usage hint.
3. Invokes `generacy cockpit status <epic-ref>` (from G1.1 / generacy#787) via the Bash tool.
4. Wraps the CLI's stdout in a fenced code block (optionally with a one-line header).
5. Detects three failure modes — missing binary, auth failure, unknown epic — and emits tailored, actionable error messages; surfaces raw stderr for anything else; never silently no-ops.

No TypeScript, no compiled code, no MCP coupling, no build step. The deliverable is one committed markdown file that round-trips through `claude-plugin-cockpit` installation. Issue isolation per spec: this branch owns and modifies only `packages/claude-plugin-cockpit/commands/status.md`.

## Technical Context

**Language/Version**: None (markdown slash-command definition; runtime behavior is delegated to Claude Code's tool runtime)
**Primary Dependencies**:
- Runtime: the `generacy` CLI on `$PATH` (from G1.1 / generacy#787) — checked at invocation time, not at install time
- Plugin host: Claude Code's plugin loader and Bash tool
**Storage**: Repository file only
**Testing**: Manual end-to-end against `generacy-ai/tetrad-development#85` once G1.1 lands; bogus-epic and uninstalled-CLI smoke tests for the error path
**Target Platform**: Claude Code (any OS where the `generacy` CLI runs)
**Project Type**: Monorepo package (`packages/claude-plugin-cockpit`); no `package.json` participates in this issue
**Performance Goals**: N/A — perceived latency is dominated by the CLI subprocess
**Constraints**:
- Wrapper-only: the slash command MUST NOT reimplement status logic, MUST NOT transform per-child structure, MUST NOT reinterpret `#N` shorthand (FR-002 / FR-004; clarifications Q1, Q4)
- Output rendering: CLI stdout wrapped verbatim in a fenced code block, optionally prefixed with a one-line header (FR-003; clarification Q1)
- Output contract: the CLI's default text output (NOT `--json`) is the consumed format (FR-008; clarification Q2)
- No-arg resolution path: branch `spec.md` `**Epic**:` line → `.generacy/epics/` single-epic fallback → usage hint (FR-005; clarification Q3)
- Errors: tailored messages for missing-binary / auth-failure / unknown-epic; raw stderr otherwise; MUST never silently no-op (FR-006; clarification Q5)
- File location is fixed: `packages/claude-plugin-cockpit/commands/status.md` — directory exists from #350
**Scale/Scope**: 1 new file; ~100–150 lines of markdown (frontmatter + instructions); no edits to other files

## Constitution Check

No `.specify/memory/constitution.md` is present in this repository — no gates apply.

## Project Structure

### Documentation (this feature)

```text
specs/352-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (existing, read-only)
├── clarifications.md    # Q1–Q5 (existing)
├── plan.md              # This file
├── research.md          # Technology / pattern decisions
├── data-model.md        # Frontmatter + behavioral shape of status.md
├── quickstart.md        # Implementer + end-user verification steps
├── contracts/
│   ├── slash-command.schema.md    # Shape of the status.md slash-command file
│   └── cli-invocation.md          # The CLI surface this command depends on (G1.1)
└── checklists/          # (empty — not produced by this plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── .claude-plugin/
│   └── plugin.json                  # Existing from #350 — unchanged
├── commands/
│   └── status.md                    # NEW — this issue's sole deliverable
└── README.md                        # Existing from #350 — unchanged

# No other files in this repo are touched by this issue.
```

**Structure Decision**: Single-file delivery into the existing `claude-plugin-cockpit/commands/` directory (created and `.gitkeep`-preserved by #350). Style and frontmatter conventions mirror the sibling `claude-plugin-agency-spec-kit/commands/*.md` family — the Claude Code plugin loader has a known-good shape there, and reviewers compare against it pattern-for-pattern.

## Implementation Phases

### Phase 0: Verify reference shape and dependency status
- Re-read `packages/claude-plugin-agency-spec-kit/commands/specify.md` (or any sibling) to confirm the frontmatter keys (`description`, `arguments`) and instruction-body conventions in this repo.
- Re-read `.gitkeep` status of `packages/claude-plugin-cockpit/commands/` to confirm the directory is present and empty.
- Re-read the `**Epic**:` line format in this branch's `spec.md` to lock the no-arg resolver's grammar (`generacy-ai/tetrad-development#85`).
- Confirm that G1.1 (`generacy cockpit status`) is NOT yet a hard install-time prerequisite — the slash command must degrade gracefully when the CLI is absent (FR-006 / clarification Q5).

### Phase 1: Author `status.md`
1. Write frontmatter (`description`, optional single `arguments` entry for the epic ref).
2. Write the instruction body covering, in order:
   - **Argument handling** — pass through verbatim; bare `#N` is opaque (FR-004).
   - **No-arg epic resolution** — parse current branch's `spec.md` `**Epic**:` line; fall back to a single `.generacy/epics/*`; otherwise emit a usage hint (FR-005).
   - **CLI invocation** — `generacy cockpit status <epic-ref>` via Bash; consume stdout (FR-002, FR-008).
   - **Output rendering** — one-line header `**Status:** <epic-ref>` followed by stdout in a fenced code block (FR-003 / Q1).
   - **Error handling** — detect-and-tailor for the three named modes; surface raw stderr otherwise (FR-006).

### Phase 2: Validate
3. Run `node -e "require('js-yaml').load(require('fs').readFileSync('packages/claude-plugin-cockpit/commands/status.md','utf8').split('---')[1])"` (or equivalent) to confirm the frontmatter parses.
4. List `packages/claude-plugin-cockpit/commands/` and confirm only `status.md` and `.gitkeep` are present.
5. Diff the frontmatter shape against `packages/claude-plugin-agency-spec-kit/commands/specify.md` and confirm parity.
6. Manual smoke (once G1.1 ships): install the plugin, run `/cockpit:status generacy-ai/tetrad-development#85`, run `/cockpit:status` with no args from this branch, and run `/cockpit:status bogus/repo#9999` to confirm the error path.

## Complexity Tracking

No constitution violations; no complexity entries.

## Open Risks

| Risk | Mitigation |
|------|------------|
| G1.1 (`generacy cockpit status`) does not land before this issue is verified end-to-end. | Land the file regardless — its install-time behavior is independent of the CLI. End-to-end verification (SC-002, SC-003) blocks on G1.1, not on this issue's merge. |
| The CLI's stdout shape changes after this command ships (e.g., switches default to `--json`). | This command consumes the CLI's *default* output. If the CLI ever changes its default, both this command and the contract in `cli-invocation.md` must be revisited — this is a contract-level break, not a silent regression. |
| The no-arg `spec.md` parser is too strict and misses an `**Epic**:` line with unusual whitespace or unicode. | Match the literal pattern observed in this branch's `spec.md` (`**Epic**: <owner>/<repo>#<N>`); if the line is missing or unparseable, fall through to the `.generacy/epics/` fallback rather than crashing. |
| The "missing binary" check is shell-dependent and fails on systems with non-standard `command -v`. | Use a portable check (`command -v generacy >/dev/null 2>&1 \|\| { ... }`); document the exact check in `contracts/cli-invocation.md`. |
| A future variant of this command tries to consume `--json` and parse structured output — diverging from clarification Q2. | Out of scope here per FR-008; spec'd explicitly so a future structured-renderer variant is a NEW command file, not a mutation of this one. |
