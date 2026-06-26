# Feature Specification: claude-plugin-cockpit scaffold + marketplace entry

**Branch**: `350-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft
**Issue**: [generacy-ai/agency#350](https://github.com/generacy-ai/agency/issues/350)
**Epic**: generacy-ai/tetrad-development#85 (Epic Cockpit) | **Phase**: P1 | **Tier**: v1-core | **Issue**: A1.4

## Summary

Scaffold the `claude-plugin-cockpit` Claude Code plugin package within the agency monorepo and register it in the generacy marketplace. This delivers the empty plugin shell — `.claude-plugin/plugin.json`, an empty `commands/` directory, and a README documenting marketplace installation via `extraKnownMarketplaces` — and adds one entry to `.claude-plugin/marketplace.json`. The structure mirrors the existing `claude-plugin-agency-spec-kit` package. Subsequent issues in the Epic Cockpit (the `/cockpit` verbs) will populate the `commands/` directory; this scaffold creates the namespace they will land in.

**Owns (isolation)**: `packages/claude-plugin-cockpit/**` and one entry added to `.claude-plugin/marketplace.json`.

**Acceptance (from issue)**: Plugin installs from the marketplace and registers an (empty) `/cockpit` namespace.

**Depends on**: none (independent of generacy verbs).

## User Stories

### US1: Plugin available from the marketplace

**As a** Claude Code user with the generacy marketplace registered via `extraKnownMarketplaces`,
**I want** to install the `cockpit` plugin from the marketplace,
**So that** I can later use `/cockpit:*` commands as they are added in subsequent Epic Cockpit issues.

**Acceptance Criteria**:
- [ ] `claude-plugin-cockpit` appears as an installable plugin in the generacy marketplace listing.
- [ ] Installation succeeds without errors.
- [ ] After installation, the `/cockpit` namespace is registered (even though it contains no commands yet).
- [ ] Uninstall cleanly removes the plugin.

### US2: README guides marketplace install

**As a** developer evaluating the cockpit plugin,
**I want** the package README to document the marketplace install path,
**So that** I can add the marketplace via `extraKnownMarketplaces` and install the plugin without reading source code.

**Acceptance Criteria**:
- [ ] README includes the marketplace URL/identifier to add to `extraKnownMarketplaces`.
- [ ] README shows the install command for the `cockpit` plugin.
- [ ] README mirrors the structure and tone of `claude-plugin-agency-spec-kit/README.md`.

### US3: Epic Cockpit downstream issues have a landing zone

**As a** developer implementing a downstream Epic Cockpit issue (e.g., a `/cockpit` verb),
**I want** the plugin package and namespace to already exist,
**So that** I can drop my command file into `packages/claude-plugin-cockpit/commands/` without first having to scaffold the plugin.

**Acceptance Criteria**:
- [ ] `packages/claude-plugin-cockpit/commands/` directory exists in the repo.
- [ ] `.claude-plugin/plugin.json` declares the `cockpit` plugin name correctly.
- [ ] No verb commands are added in this issue (scope boundary).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Create `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` declaring `name: cockpit` with a description and author block matching the generacy convention. | P1 | Mirrors `claude-plugin-agency-spec-kit/.claude-plugin/plugin.json`. |
| FR-002 | Create an empty `packages/claude-plugin-cockpit/commands/` directory (committed via `.gitkeep` if necessary). | P1 | Verbs added in later issues. |
| FR-003 | Create `packages/claude-plugin-cockpit/README.md` documenting the plugin purpose and marketplace install via `extraKnownMarketplaces`. | P1 | Structure mirrors `claude-plugin-agency-spec-kit/README.md`. |
| FR-004 | Add a new entry for `cockpit` to the `plugins` array in `.claude-plugin/marketplace.json`, with `source: ./packages/claude-plugin-cockpit` and an appropriate category. | P1 | Single entry; do not modify the existing `agency-spec-kit` entry. |
| FR-005 | Plugin manifest must not declare any `commands` or MCP `requires` block — the namespace registers empty. | P1 | Avoids coupling to verbs not yet implemented. |
| FR-006 | Package must follow the monorepo's existing `packages/*` conventions (location, naming) so it is picked up by pnpm workspaces if/when a `package.json` is added later. | P2 | No `package.json` is required by this issue. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Plugin installs from marketplace | Success on a clean Claude Code environment | Add marketplace via `extraKnownMarketplaces`, install `cockpit`, observe success. |
| SC-002 | `/cockpit` namespace registered after install | Namespace listed; zero commands | `/help` or equivalent lists `cockpit` namespace with no commands. |
| SC-003 | Marketplace manifest valid | Validates against `marketplace.schema.json` | JSON schema validation passes. |
| SC-004 | Scaffold matches reference plugin shape | Structural parity | Directory layout matches `claude-plugin-agency-spec-kit` (manifest path, commands dir, README presence). |
| SC-005 | Downstream verb issues are unblocked | Zero scaffold work required in next Epic Cockpit issue | Next `/cockpit:*` issue adds only a file under `commands/`. |

## Assumptions

- The generacy marketplace at `.claude-plugin/marketplace.json` is the canonical source registered by users via `extraKnownMarketplaces`.
- Claude Code allows a plugin to register a namespace with zero commands without erroring.
- No build step (TypeScript compile, bundling, etc.) is required for a commands-only plugin — `.md` files in `commands/` are the runtime artifact.
- The `cockpit` plugin will not require an MCP server in its scaffold; any future MCP coupling will be added by a subsequent issue.

## Out of Scope

- Implementing any `/cockpit:*` verbs or command files. Those land in subsequent Epic Cockpit issues.
- Adding a `package.json` or wiring the package into pnpm build/test scripts.
- Publishing the plugin to a public/npm registry.
- Changes to `claude-plugin-agency-spec-kit` or any other existing plugin.
- Documentation outside `packages/claude-plugin-cockpit/README.md` (e.g., root `README.md`, top-level docs).
- CI changes specific to the cockpit plugin.

---

*Generated by speckit*
