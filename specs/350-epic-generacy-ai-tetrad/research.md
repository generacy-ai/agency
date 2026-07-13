# Research: claude-plugin-cockpit scaffold

**Feature**: 350-epic-generacy-ai-tetrad
**Date**: 2026-06-26

## Decisions

### D1: Mirror the existing `claude-plugin-agency-spec-kit` package shape

**Decision**: Copy the structural shape (manifest path, README presence, commands/ dir) of `packages/claude-plugin-agency-spec-kit/` exactly, with content adjusted to the cockpit's empty-namespace state.

**Rationale**:
- SC-004 explicitly requires structural parity with the reference plugin.
- The reference plugin is already installed via the same marketplace, so its shape is known-good for the Claude Code plugin loader.
- Mirroring reduces the surface area for "novel" mistakes — anything wrong in the cockpit scaffold that isn't wrong in the reference plugin is a real bug, not a shape question.

**Alternatives considered**:
- Build a minimal manifest from scratch by reading the Claude Code plugin schema. Rejected: more work, more risk, and the schema URL referenced in `marketplace.json` (`https://anthropic.com/claude-code/marketplace.schema.json`) covers the marketplace entry but not the per-plugin manifest format definitively — copying from a working sibling is safer.
- Defer the README until the first verb ships. Rejected: FR-003 requires a README in this issue, and US2 anchors on it.

### D2: Preserve empty `commands/` via `.gitkeep` (not a placeholder `.md`)

**Decision**: Use `commands/.gitkeep` (empty file) as the placeholder.

**Rationale**:
- Clarification Q3 chose this option.
- The Claude Code plugin loader globs `commands/*.md`. Any `.md` file inside `commands/` would register as a runnable `/cockpit:<name>` verb — surfacing a junk command in `/help` and potentially in marketplace listings.
- `.gitkeep` is the conventional pattern across the wider git ecosystem; reviewers understand it immediately.

**Alternatives considered**:
- `commands/README.md` explaining "verbs land here". Rejected: would register as `/cockpit:README`.
- A stub command file that ships disabled. Rejected: still globbed by the loader, more code to remove later.

### D3: Marketplace identifier in README is GitHub shorthand `generacy-ai/agency`

**Decision**: The README install snippet uses `generacy-ai/agency` as the `extraKnownMarketplaces` value.

**Rationale**:
- Clarification Q4 chose this option.
- Cross-verified: the same identifier is already used by `.claude/settings.json` to register the marketplace, so users following the README will end up with the same registration the developers use.
- Shorthand is shorter and harder to mistype than a full URL.

**Alternatives considered**:
- Full URL `https://github.com/generacy-ai/agency`. Rejected: clarification Q4 selected the shorthand; both are equivalent when fetched, but consistency with `settings.json` wins.

### D4: Marketplace `category` value is `"development"`

**Decision**: Use `"development"` to match the existing `agency-spec-kit` entry.

**Rationale**:
- Clarification Q2 chose this option.
- Consistency reduces taxonomy fragmentation in the marketplace listing UX.
- Trivial to change later if a `"workflow"` category is introduced.

**Alternatives considered**:
- `"workflow"`. Rejected per Q2 — defer until a real taxonomy decision is made.

### D5: Plugin description string is fixed verbatim

**Decision**: `"Developer-side workflow automation commands for speckit epics"` — used identically in both `plugin.json` and the `marketplace.json` entry.

**Rationale**:
- Clarification Q1 chose this string.
- FR-001 / FR-004 require both call sites to match — single source of truth via copy-paste.

**Alternatives considered**:
- "Slash commands for the cockpit watch-and-approve loop". Rejected per Q1 — first option ("Developer-side workflow automation commands for speckit epics") was selected.

### D6: README "Available Commands" section lists planned verbs marked as forthcoming

**Decision**: Populate the table with `/cockpit:watch`, `:status`, `:clarify`, `:review`, `:merge` (and the closing `…`), each annotated `(coming in #351–#360)`.

**Rationale**:
- Clarification Q5 chose this option.
- Communicates roadmap to evaluators (US2) without misrepresenting current capability.
- Re-using the table structure from the reference README keeps the cockpit README parseable with the same eye-pattern.

**Alternatives considered**:
- Empty placeholder section. Rejected per Q5 — less useful to evaluators.
- Omit the section. Rejected per Q5 — breaks structural parity with the reference README.

## Implementation Patterns

### P1: Static-asset plugin (no build)
- No `package.json`, no TypeScript, no bundler — `.md` files in `commands/` are the runtime artifact.
- pnpm workspaces auto-discovers `packages/*` directories with a `package.json`; the absence of one here means the package is invisible to `pnpm install` / `pnpm build`, which is the intent for this issue (FR-006 explicitly defers the `package.json`).

### P2: Marketplace JSON edit, not regeneration
- Append a single object to the existing `plugins` array. Preserve key order, existing whitespace, and trailing newline conventions of the file.
- Do not touch the `$schema`, `name`, `description`, `owner`, or existing `agency-spec-kit` entry.

### P3: JSON manifest authoring conventions
- Indent with 2 spaces (matches existing `marketplace.json` and `claude-plugin-agency-spec-kit/.claude-plugin/plugin.json`).
- End files with a newline.
- Match the author block format used by the reference plugin (`{ name, email }` only — no `url`).

## Key Sources / References

- `packages/claude-plugin-agency-spec-kit/.claude-plugin/plugin.json` — manifest shape reference.
- `packages/claude-plugin-agency-spec-kit/README.md` — README structure reference (FR-003 / Q5).
- `.claude-plugin/marketplace.json` — target file for the new entry; `$schema` URL is `https://anthropic.com/claude-code/marketplace.schema.json`.
- `.claude/settings.json` — source of truth for the `generacy-ai/agency` marketplace identifier referenced in clarification Q4.
- `specs/350-epic-generacy-ai-tetrad/spec.md` — feature requirements and acceptance criteria.
- `specs/350-epic-generacy-ai-tetrad/clarifications.md` — answered questions Q1–Q5.
