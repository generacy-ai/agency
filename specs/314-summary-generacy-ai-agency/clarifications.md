# Clarifications

## Batch 1 — 2026-03-07

### Q1: Installation Mechanism
**Context**: FR-003 lists "postinstall script or exported CLI utility" as options. Postinstall scripts run automatically but have security concerns (some registries/tools skip them). A CLI utility requires explicit invocation but is more predictable.
**Question**: Should the package use a `postinstall` script (automatic, runs on `npm/pnpm install`) or an exported CLI command (e.g., `npx agency-spec-kit install-commands`) that must be run explicitly?
**Options**:
- A: Postinstall script (automatic, zero-config)
- B: Exported CLI utility (explicit invocation required)
- C: Both (postinstall by default, CLI for manual re-install)

**Answer**: *Pending*

### Q2: Command Namespace Prefix
**Context**: The marketplace plugin exposes commands as `agency-spec-kit:analyze`, `agency-spec-kit:clarify`, etc. When copying files to `~/.claude/commands/`, the filename determines the command name. Placing files directly would create `/analyze`, `/clarify` — conflicting with any other plugin's commands.
**Question**: Should commands be placed in `~/.claude/commands/agency-spec-kit/` (preserving the `agency-spec-kit:` namespace) or directly in `~/.claude/commands/` (flat, potentially conflicting)?

**Answer**: *Pending*

### Q3: Coexistence with Marketplace Plugin
**Context**: During the transition period, some developers may have both the marketplace plugin and the npm package installed. If both write to `~/.claude/commands/`, there could be conflicts or duplicate commands.
**Question**: Should the npm install mechanism check for existing marketplace-plugin-installed commands and skip/overwrite them? Or should it always overwrite regardless?
**Options**:
- A: Always overwrite (npm package is authoritative)
- B: Skip if files already exist (marketplace plugin takes precedence)
- C: Overwrite only if npm package version is newer

**Answer**: *Pending*

### Q4: Source of Truth for Command Files
**Context**: FR-001 says to "copy or symlink" commands into `packages/agency-plugin-spec-kit/commands/`. Having two copies of the same files (in both `claude-plugin-agency-spec-kit` and `agency-plugin-spec-kit`) creates maintenance risk. Alternatively, one package could reference the other's files.
**Question**: Should the command `.md` files be duplicated into `packages/agency-plugin-spec-kit/commands/`, or should they remain in `packages/claude-plugin-agency-spec-kit/commands/` with the npm package referencing them (e.g., via workspace symlink or build-time copy)?
**Options**:
- A: Duplicate files into agency-plugin-spec-kit (simple, self-contained)
- B: Symlink from agency-plugin-spec-kit to claude-plugin-agency-spec-kit (single source, workspace-only)
- C: Build-time copy from claude-plugin to agency-plugin (single source, works in published package)

**Answer**: *Pending*

### Q5: Export Path for Programmatic Access
**Context**: FR-004 (P2) mentions adding an export path so consumers can programmatically locate the commands directory. The exact export format matters for TypeScript consumers.
**Question**: What should the export path resolve to — the directory path as a string (e.g., `import { commandsDir } from '@generacy-ai/agency-plugin-spec-kit/commands'`) or individual command file paths/contents?
**Options**:
- A: Single export returning the directory path string
- B: Named exports for each command file path
- C: Skip FR-004 for now (P2, defer to follow-up)

**Answer**: *Pending*
