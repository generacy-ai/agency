# Implementation Plan: Publish claude-plugin-cockpit as @generacy-ai/claude-plugin-cockpit

**Feature**: Make `packages/claude-plugin-cockpit` npm-publishable via the existing `publish-preview.yml` rail so `/cockpit:*` commands ship without a manual `extraKnownMarketplaces` step.
**Branch**: `375-publish-cockpit-plugin`
**Status**: Complete

## Summary

Add the two artifacts required for the Changesets-driven `publish-preview.yml` workflow to pick up the cockpit plugin as a non-private workspace package:

1. `packages/claude-plugin-cockpit/package.json` — declares the package name, files whitelist, and public publish access; declares NO build step (ships static markdown + JSON).
2. `.changeset/<slug>.md` — a Changesets entry that triggers the initial preview release on the next merge to `develop`.

Optionally (per Q4 pending clarification), update `packages/claude-plugin-cockpit/README.md` to document the new npm install path and remove the manual `extraKnownMarketplaces` instruction. Everything else — the `publish-preview.yml` workflow, the Changesets config, the `.claude-plugin/plugin.json`, and the six `commands/*.md` files — remains untouched.

## Technical Context

- **Language / runtime**: none required — the package ships only markdown (`commands/*.md`, `README.md`) and JSON (`.claude-plugin/plugin.json`). No TypeScript, no build step, no runtime dependencies.
- **Package manager**: pnpm workspaces (root `pnpm-workspace.yaml`); scoped publish to npm as `@generacy-ai/claude-plugin-cockpit` with public access.
- **Release tooling**: Changesets (`.changeset/config.json`, baseBranch `develop`, access `public`, changelog `@changesets/cli/changelog`). Preview snapshot publishing runs from `.github/workflows/publish-preview.yml` on successful CI runs against `develop`.
- **Distribution**: preview dist-tag on npm. Stable/latest publish is out of scope.
- **Sibling reference**: `packages/agency-plugin-spec-kit/package.json` (already published as `@generacy-ai/agency-plugin-spec-kit@preview`) is the working template for repository/publishConfig/author/license fields.

### Pending clarifications (defaults applied for the plan)

The following clarifications from `clarifications.md` are still marked *Pending*. The plan proceeds with the defaults noted here; if the answers land elsewhere before `/tasks`, revisit the affected sections:

| Q | Assumed default in this plan | Rationale |
|---|------------------------------|-----------|
| Q1 initial version + bump | `version: "0.0.0"` + `minor` changeset → first publish `0.1.0` | Matches the spec's Assumption "Version 0.1.0 (or as decided by Changesets)". Lowest-risk pick for a new package. |
| Q2 agency metadata block | Omit the `agency` block | Cockpit is a Claude Code plugin, not an Agency runtime plugin — its identity is `.claude-plugin/plugin.json`. Sibling `agency-plugin-spec-kit` needs it because it registers with the Agency runtime. |
| Q3 TS-oriented fields | Omit `type`, `main`, `module`, `types`, `exports`, `bin`, `scripts` | FR-003: no build step; nothing to import or execute from the tarball. |
| Q4 README update in scope | **Include** a small README update replacing the manual `extraKnownMarketplaces` install step with the npm-based path | SC-003 explicitly measures success by "Documented in README + confirmed by cluster setup dry-run". |
| Q5 package metadata | Mirror sibling for `author`, `license`, `repository{directory}`; `description: "Claude Code plugin providing /cockpit:* commands for Tetrad workflows"`; `keywords: ["claude-plugin", "cockpit", "generacy", "tetrad", "workflow"]` | Consistent with sibling's public surface. |

## Project Structure

Files created or modified by this feature (isolation window per FR-006):

```
packages/claude-plugin-cockpit/
├── package.json               # CREATED — subject of FR-001..FR-005
├── README.md                  # MODIFIED — replace manual extraKnownMarketplaces step (SC-003, Q4-default)
├── .claude-plugin/
│   └── plugin.json            # unchanged (out of scope)
└── commands/                  # unchanged (FR-006 forbids edits)
    ├── clarify.md
    ├── merge.md
    ├── queue.md
    ├── review.md
    ├── status.md
    └── watch.md

.changeset/
└── publish-cockpit-plugin.md  # CREATED — minor bump for @generacy-ai/claude-plugin-cockpit
```

Files that MUST remain untouched:

- `.github/workflows/publish-preview.yml`
- `.changeset/config.json`
- `packages/claude-plugin-cockpit/.claude-plugin/plugin.json`
- `packages/claude-plugin-cockpit/commands/*.md`
- Every file outside `packages/claude-plugin-cockpit/` except the one new `.changeset/*.md`

## Constitution Check

No `.specify/memory/constitution.md` present in this repo — no project-level constitution rules to check against. The feature is bounded by:

- **FR-006 isolation** (spec): only `packages/claude-plugin-cockpit/**` and one new `.changeset/*.md` may be edited. The plan respects this.
- **Existing publish rail contract** (`publish-preview.yml`): the workflow enumerates non-private workspace packages, so making cockpit non-private is *sufficient* — no workflow edit needed. This is a load-bearing invariant; do not touch the workflow.
- **Tarball == source of truth for acceptance** (FR-007 + SC-001): validate by extracting the actual `pnpm pack` output, not by inspecting the source tree.

## Key Technical Decisions

1. **No build step, no scripts.** The tarball contents (`commands/`, `.claude-plugin/`, `README.md`) exist on disk as-is; `pnpm pack` needs no preparation. Omit `scripts` entirely.
2. **`files` whitelist over `.npmignore`.** Matches sibling and gives an explicit, reviewable list.
3. **`publishConfig.access: "public"` in the package.json**, even though `.changeset/config.json` also sets `access: "public"`. The changesets config is the effective setting for the publish step, but the redundant `publishConfig` protects against accidental scope defaults on a manual `npm publish`.
4. **Do not add `agency` metadata block.** Cockpit is a Claude Code plugin, not a runtime-loaded Agency plugin. Adding the block would falsely advertise it as an Agency plugin.
5. **Version starts at `0.0.0`.** Changesets applies the bump on top; a `minor` bump lands the first preview at `0.1.0`, matching the spec assumption.
6. **README documents the new path in the same PR.** Cheap edit, satisfies SC-003 measurement, and avoids shipping a preview with stale install instructions.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| `publish-preview.yml` runs `pnpm build` before publishing — a package with no `build` script may fail. | Verified: `agency-plugin-spec-kit` has a `build` script but many workspace packages don't. `pnpm build` at the workspace root passes as long as `turbo`/pnpm's own filter tolerates packages with no build script (they no-op). Confirm during `/tasks` by inspecting the root `pnpm build` recipe and the turbo pipeline. If needed, add a no-op `build` script (`"build": "true"` or `"build": "echo skip"`). |
| A stale local `dist/` in the source tree would leak into the tarball. | The `files` whitelist excludes it. Also, no build step means no `dist/` is produced. |
| npm namespace already taken. | Name mirrors the sibling under `@generacy-ai`; the org owns the scope. First publish will succeed. |
| Changeset file forgotten. | `publish-preview.yml` has a synthetic-changeset fallback, but the spec requires an explicit one (FR-005). Include it in this PR. |

## Post-Plan Next Step

Run `/speckit:tasks` to generate the ordered task list from this plan.
