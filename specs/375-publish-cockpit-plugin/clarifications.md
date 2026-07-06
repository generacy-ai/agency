# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-06 20:37

### Q1: Initial version + changeset bump
**Context**: The spec says "Version 0.1.0 (or as decided by Changesets) is acceptable", but the sibling @generacy-ai/agency-plugin-spec-kit is at 1.0.1. Changesets computes the next published version by applying a bump (patch/minor/major) to whatever `version` field is in package.json. Because this is a brand-new package, the starting version and the semver bump type together determine what actually appears on npm.
**Question**: What should the initial `version` field in package.json be, and what semver bump should the accompanying changeset use (which together determine the first published preview version)?
**Options**:
- A: version "0.0.0" + minor bump → first publish is 0.1.0
- B: version "0.1.0" + patch bump → first publish is 0.1.1
- C: version "0.0.0" + major bump → first publish is 1.0.0
- D: version "1.0.0" + minor bump (mirror sibling's stable line) → first publish is 1.1.0

**Answer**: *Pending*

### Q2: agency metadata block
**Context**: The sibling @generacy-ai/agency-plugin-spec-kit package.json declares an `agency` block with id/name/tools/modes/dependencies/critical, which appears to be how the Agency runtime discovers plugins. The cockpit plugin is primarily a Claude plugin (its identity lives in `.claude-plugin/plugin.json`), so it's unclear whether the Agency-side metadata block is also required.
**Question**: Should packages/claude-plugin-cockpit/package.json include an `agency` metadata block similar to the sibling package?
**Options**:
- A: Yes — include an `agency` block with cockpit-appropriate values (id: @generacy-ai/claude-plugin-cockpit, name: "Cockpit Plugin", tools: [], modes: [], dependencies: [], critical: false)
- B: No — cockpit is a Claude-side plugin only; identity is fully carried by .claude-plugin/plugin.json, so no `agency` block is needed in package.json

**Answer**: *Pending*

### Q3: TS-oriented package.json fields
**Context**: The sibling package.json declares `type: "module"`, `main`, `module`, `types`, `exports`, `bin`, and build/test/lint/typecheck scripts because it ships compiled TypeScript. FR-003 says cockpit has no build step and ships markdown-only. It's unclear whether the TS-oriented fields should be omitted, mirrored empty, or replaced with a minimal set.
**Question**: Which shape should packages/claude-plugin-cockpit/package.json use for TypeScript/module-oriented fields?
**Options**:
- A: Omit `type`, `main`, `module`, `types`, `exports`, `bin`, and `scripts` entirely — package ships static files only, nothing to run
- B: Include only a minimal `scripts` block (e.g., a no-op prepack or a pack sanity check) and omit the module/entry-point fields
- C: Mirror the sibling's structure closely with placeholder/empty values where inapplicable, to keep package.json shape consistent across the monorepo

**Answer**: *Pending*

### Q4: README updates in scope
**Context**: FR-006 says isolation is only packages/claude-plugin-cockpit/ + one changeset file, and forbids `commands/*.md` edits — but is silent about README.md. Meanwhile SC-003 says the "no manual marketplace step" outcome is measured by "Documented in README + confirmed by cluster setup dry-run", which implies README should describe the new npm-based distribution path.
**Question**: Is updating packages/claude-plugin-cockpit/README.md to document the new npm install / no-manual-marketplace path part of this feature?
**Options**:
- A: Yes — add a short section to README documenting the npm install path and the removal of the manual extraKnownMarketplaces step (satisfies SC-003 in this feature)
- B: No — leave README as-is; SC-003's README documentation is tracked separately and does not gate this feature

**Answer**: *Pending*

### Q5: Package metadata values
**Context**: The sibling package uses `author: "Generacy AI"`, `license: "Apache-2.0"`, and a `repository` block pointing to git+https://github.com/generacy-ai/agency.git with a `directory` subpath. The spec does not specify description, keywords, author, license, or repository fields for the new package, which npm surfaces publicly.
**Question**: Should the new package mirror the sibling for author/license/repository, and what description + keywords should it publish?
**Options**:
- A: Mirror sibling exactly for author ("Generacy AI"), license ("Apache-2.0"), and repository (with directory: "packages/claude-plugin-cockpit"); use description "Claude Code plugin providing /cockpit:* commands for Tetrad workflows" and keywords ["claude-plugin", "cockpit", "generacy", "tetrad", "workflow"]
- B: Mirror sibling for author/license/repository but use a different description or keyword list (please specify)
- C: Use different author/license/repository values entirely (please specify)

**Answer**: *Pending*

