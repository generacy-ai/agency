# Research: /cockpit:status command

**Feature**: 352-epic-generacy-ai-tetrad
**Date**: 2026-06-26

## Decisions

### D1: Mirror sibling slash-command shape (`claude-plugin-agency-spec-kit/commands/*.md`)

**Decision**: Copy the frontmatter and instruction-body conventions of the sibling `/speckit:*` commands (e.g., `specify.md`, `plan.md`) verbatim — adjusted to the cockpit verb's behavior.

**Rationale**:
- FR-007 requires conformance to the Claude Code plugin command schema. The sibling plugin is already installed via the same marketplace, so its shape is known-good.
- Mirroring shrinks reviewer surface area: anything wrong in `status.md` that isn't wrong in the reference commands is a real bug, not a shape question.
- The frontmatter keys actually used by the loader (`description`, `arguments`) are observable in this repo and not formally schema-documented — copying a working sibling is safer than inferring from a schema URL.

**Alternatives considered**:
- Author from a published Claude Code command schema. Rejected: no canonical schema is referenced by the sibling plugin's manifest; mirroring observed shape is lower-risk.
- Borrow shape from a third-party plugin. Rejected: would import unrelated conventions and break parity within this repo.

### D2: Output rendering — fenced code block with optional one-line header (clarification Q1)

**Decision**: Surface the CLI's default text stdout inside a triple-backtick fenced code block, optionally prefixed with a single line like `**Status:** <epic-ref>`. No further transformation.

**Rationale**:
- Clarification Q1 explicitly chose option B.
- Monospaced rendering preserves the CLI's column alignment, ASCII tree characters, and any color-stripping the CLI does for non-TTY output.
- The slash command remains a thin wrapper — no parsing means no risk of drifting from the CLI's evolving formatter.

**Alternatives considered**:
- Pure passthrough (no code fence). Rejected per Q1 — Claude Code would re-flow whitespace and break the dashboard.
- Light post-processing to highlight blocked items. Rejected per Q1 — duplicates work the CLI already owns.
- Parse `--json` and re-render markdown. Rejected per Q1/Q2 — punted to a future structured-renderer command if/when needed.

### D3: CLI output format — default text, NOT `--json` (clarification Q2)

**Decision**: Invoke `generacy cockpit status <epic-ref>` with no flags and consume the default text output.

**Rationale**:
- Clarification Q2 chose option D and explicitly assigned the text form to this command.
- Per #787 FR-013, the CLI supports `--json`, but slash-command parsing of structured output is a separate concern; coupling this command to `--json` would prematurely fork two consumers (the CLI's text rendering and the slash command's renderer) and double-implement the dashboard.

**Alternatives considered**:
- Consume `--json` and render markdown. Rejected per Q2 — reserved for a future structured-renderer variant.
- Always pass `--no-color`. Deferred — assumed the CLI already strips ANSI when stdout is not a TTY (subprocess context); revisit if smoke tests show stray escape codes.

### D4: No-arg resolution chain (clarification Q3)

**Decision**: With no argument, the command resolves the epic in this order:
1. Parse the current branch's `spec.md` `**Epic**:` line (e.g., `Epic: generacy-ai/tetrad-development#85`).
2. If no `spec.md` exists for the current branch or the line is absent/unparseable, look for a single epic directory under `.generacy/epics/`.
3. If neither resolves, print a usage hint listing how to specify an epic explicitly.

**Rationale**:
- Clarification Q3 chose option A and explicitly added the `.generacy/epics/` fallback.
- Branch alone is insufficient — branch names follow the `<issue#>-<slug>` convention where the issue is a CHILD of the epic, not the epic itself.
- `spec.md` `**Epic**:` is the canonical pointer from a child branch to its parent epic and is already present on every branch produced by `/speckit:specify` (visible on this branch's own `spec.md`).
- `.generacy/epics/` is the engine-side artifact; falling through to it preserves the no-arg ergonomics outside child branches (e.g., from `develop`).

**Alternatives considered**:
- Defer entirely to the CLI's own no-arg resolution. Rejected per Q3 — the CLI doesn't (yet) know about speckit's `spec.md` convention.
- Read a `.cockpit.yml` declaring the active epic. Rejected per Q3 — extra config surface for no real win when `spec.md` already encodes it.
- Prompt the user to pick from known epics. Rejected per Q3 — interactive prompts inside a slash command degrade the "type and go" UX.

### D5: `#N` shorthand is opaque (clarification Q4)

**Decision**: The slash command does NOT reinterpret bare `#N` references. The argument is passed through verbatim to the CLI/engine resolver. Repository defaulting is the resolver's responsibility, mirroring generacy#788.

**Rationale**:
- Clarification Q4 chose option C.
- The repo a `#N` resolves against is ambiguous at the slash-command layer (epic repo vs. current working tree's origin), and centralizing that decision in the engine resolver (generacy#788) ensures the CLI, slash command, and any future entrypoints agree.
- Reinterpreting at the slash-command layer would risk silent disagreement between `generacy cockpit status #5` (terminal) and `/cockpit:status #5` (Claude Code).

**Alternatives considered**:
- Resolve against `git remote get-url origin`. Rejected per Q4 — produces wrong results when working in `agency` against an epic in `tetrad-development`.
- Hard-code `generacy-ai/tetrad-development`. Rejected per Q4 — couples the slash command to one customer's repo layout.
- Reject bare `#N` with a usage hint. Rejected per Q4 — over-strict; the engine resolver handles it.

### D6: Tailored errors for the three named failure modes (clarification Q5)

**Decision**: Detect three specific CLI-failure shapes and emit tailored, actionable messages:

| Mode | Detection | Message shape |
|------|-----------|---------------|
| Missing binary | `command -v generacy` returns non-zero | "The `generacy` CLI is required. Install it with `npm install -g @generacy-ai/cli` (or see <doc-link>)." |
| Auth failure | CLI exits non-zero AND stderr matches `/auth|unauthorized|401|gh auth/i` | "Authentication failed. Run `gh auth login` to re-authenticate, then retry." |
| Unknown epic | CLI exits non-zero AND stderr matches `/not found|unknown epic|no such/i` | "Could not resolve epic `<ref>`. Check the reference (try `owner/repo#N`)." |
| Everything else | Any other non-zero exit | Surface raw stderr verbatim inside the fenced code block. |

In all cases the command MUST print something — never silently no-op.

**Rationale**:
- Clarification Q5 chose option D.
- Missing-binary is the most common early-adopter failure; the tailored hint converts a confusing "command not found" into a one-step fix.
- Auth and unknown-epic patterns are predictable from `gh`/CLI conventions; matching on stderr keeps the slash command CLI-version-tolerant (string matches, not exit-code dependence).
- The "surface raw stderr otherwise" arm preserves diagnostic value for unanticipated failures without requiring the slash command to catalog every error.

**Alternatives considered**:
- Raw stderr only. Rejected per Q5 — leaves the missing-binary case unhelpfully cryptic.
- Tailor every error mode. Rejected per Q5 — over-fits and forces churn whenever the CLI introduces a new error.

## Implementation Patterns

### P1: Frontmatter-and-instructions slash-command file

- A Claude Code slash command is a single markdown file with YAML frontmatter declaring `description` and `arguments`, followed by a markdown body that instructs the model on how to execute the verb.
- The body is rendered as an instruction at invocation time. The model interprets it and calls the Bash tool (or others) to produce the actual output.
- Pattern reference: `packages/claude-plugin-agency-spec-kit/commands/specify.md`.

### P2: Single-argument verbatim pass-through

- Frontmatter declares one optional `arguments` entry — the epic reference — marked `required: false`.
- The body's "Argument handling" section instructs the model to pass `$ARGUMENTS` directly to the CLI, without parsing or reinterpretation (FR-004 / clarification Q4).

### P3: No-arg fallback via on-disk file reads

- The body instructs the model to read the current branch's `spec.md` and grep for the literal pattern `**Epic**:` (per the `/speckit:specify` template).
- If absent, list `.generacy/epics/` and resolve to the single directory there.
- If both resolution attempts fail, print a usage hint that includes the canonical argument shapes (`owner/repo#N`, `#N`, URL).

### P4: Bash subprocess with stderr capture

- Invoke `generacy cockpit status <epic-ref>` via the Bash tool, capturing stdout and stderr separately (or at minimum, the combined output and exit code).
- The body's "Error handling" section uses the detection table from D6 to choose a response branch.
- Stdout is rendered inside a fenced code block; stderr is rendered inside a fenced code block only on the "raw stderr" arm.

### P5: Markdown-only — no compiled code

- The deliverable is one `.md` file. No `package.json`, no TypeScript, no tests directory, no CI changes.
- Aligns with the static-asset plugin pattern established for `claude-plugin-cockpit` in #350 (research P1 there).

## Key Sources / References

- `packages/claude-plugin-agency-spec-kit/commands/specify.md`, `…/plan.md`, `…/tasks.md` — canonical slash-command files in this repo (frontmatter + instruction-body convention).
- `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` — confirms the `cockpit` namespace is registered with empty `commands/` (#350 deliverable).
- `packages/claude-plugin-cockpit/commands/.gitkeep` — present from #350; `status.md` lands alongside it.
- `specs/352-epic-generacy-ai-tetrad/spec.md` — feature requirements and acceptance criteria.
- `specs/352-epic-generacy-ai-tetrad/clarifications.md` — answered questions Q1–Q5.
- `specs/350-epic-generacy-ai-tetrad/research.md` — sibling scaffold's decisions (D1, D5) inform the parity argument here.
- generacy-ai/generacy#787 (G1.1 — `cockpit watch + status` CLI) — produces the text output this command consumes.
- generacy-ai/generacy#788 (CLI resolver for `#N` shorthand) — owns repo defaulting per D5.
- `tetrad-development#85` — the Epic Cockpit epic; smoke-test target per SC-002.
