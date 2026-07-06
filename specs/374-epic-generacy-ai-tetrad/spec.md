# Feature Specification: Epic: generacy-ai/tetrad-development#85 | Phase: S6 | Tier: v1-delivery | Issue: A-S2

Make packages/claude-plugin-cockpit npm-publishable so cluster setup can deliver /cockpit:* without the manual extraKnownMarketplaces step — the same delivery rail @generacy-ai/agency-plugin-spec-kit uses

**Branch**: `374-epic-generacy-ai-tetrad` | **Date**: 2026-07-06 | **Status**: Draft

## Summary

Epic: generacy-ai/tetrad-development#85 | Phase: S6 | Tier: v1-delivery | Issue: A-S2

Make packages/claude-plugin-cockpit npm-publishable so cluster setup can deliver /cockpit:* without the manual extraKnownMarketplaces step — the same delivery rail @generacy-ai/agency-plugin-spec-kit uses. Add a package.json (name @generacy-ai/claude-plugin-cockpit, not private, files: ["commands", ".claude-plugin", "README.md"], no build step) plus a changeset. The existing publish-preview.yml publishes every non-private package on merge to develop, so @preview delivery becomes automatic; verify the packed tarball contains the six commands/*.md, .claude-plugin/plugin.json, and README (check the tarball, not source — pnpm rewrites at pack time).

Owns (isolation): packages/claude-plugin-cockpit/{package.json} + one changeset file (no command edits)

Acceptance: `pnpm pack` tarball contains the 6 command files + plugin.json + README; the package appears on npm with dist-tag preview after the next develop merge.

Depends on: none (see the epic checklist for issue numbers)

---
Part of the Epic Cockpit. Plan: docs/epic-cockpit-plan.md in tetrad-development (S6 / A-S2).


## User Stories

### US1: Cluster setup installs cockpit via npm without manual marketplace configuration

**As a** cluster / workspace operator setting up a new Tetrad development environment,
**I want** the cockpit Claude plugin to be installable straight from the npm registry (like `@generacy-ai/agency-plugin-spec-kit`),
**So that** I do not have to manually append `generacy-ai/agency` to `extraKnownMarketplaces` in Claude Code settings and the `/cockpit:*` slash commands are delivered automatically by the same rail every other Generacy plugin uses.

**Acceptance Criteria**:
- [ ] `packages/claude-plugin-cockpit/package.json` exists with `name: "@generacy-ai/claude-plugin-cockpit"` and is NOT marked `private`.
- [ ] Running `pnpm pack` inside `packages/claude-plugin-cockpit/` produces a tarball whose payload contains all six `commands/*.md` files (`watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md`), `.claude-plugin/plugin.json`, and `README.md` — and excludes everything else.
- [ ] After the next merge to `develop`, `.github/workflows/publish-preview.yml` publishes the package to npm under dist-tag `preview` with no additional workflow changes.
- [ ] `npm view @generacy-ai/claude-plugin-cockpit@preview` returns a valid version manifest.

### US2: Release engineer records the change with a Changesets entry

**As a** release engineer relying on Changesets to drive the monorepo's versioning and publish pipeline,
**I want** the addition of the new publishable package to be accompanied by a single changeset file,
**So that** the next `pnpm changeset version --snapshot preview` (invoked by `publish-preview.yml`) produces a coherent preview version for `@generacy-ai/claude-plugin-cockpit` and the eventual promotion to stable has a clean audit trail.

**Acceptance Criteria**:
- [ ] Exactly one new file is added under `.changeset/*.md` describing the addition of `@generacy-ai/claude-plugin-cockpit` as a publishable package.
- [ ] The changeset's semver bump is compatible with the initial `version` field chosen in `package.json` so that the first preview publish yields a well-formed version.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Add `packages/claude-plugin-cockpit/package.json` with `name: "@generacy-ai/claude-plugin-cockpit"` and the `private` field either omitted or explicitly `false`, so `publish-preview.yml`'s "non-private packages" filter picks it up. | P1 | The workflow discovers publishable packages by reading each `packages/*/package.json` and filtering `!p.private`. |
| FR-002 | Set `files: ["commands", ".claude-plugin", "README.md"]` so `pnpm pack` bundles the six command files, the plugin manifest, and the README — and nothing else. | P1 | Tarball contents are the contract — pnpm rewrites paths at pack time, so verification must inspect the tarball, not the source tree. |
| FR-003 | Do not add a `build` script or produce any compiled output; the package is markdown-only and must ship its source `commands/*.md` and `.claude-plugin/plugin.json` verbatim. | P1 | Contrast with sibling `@generacy-ai/agency-plugin-spec-kit`, which ships compiled TypeScript from `dist/`. |
| FR-004 | Set `publishConfig.access: "public"` so the scoped package can be published to the public npm registry by CI. | P1 | Sibling package precedent; scoped packages default to restricted access without this. |
| FR-005 | Add exactly one changeset file under `.changeset/` describing the addition of `@generacy-ai/claude-plugin-cockpit` as a publishable package. | P1 | The exact bump type (patch/minor/major) is coupled with the initial `version` field — see Clarifications Q1 in the issue thread. |
| FR-006 | Change scope is strictly `packages/claude-plugin-cockpit/package.json` plus one new file under `.changeset/`. No edits to any of the six `commands/*.md`, `.claude-plugin/plugin.json`, or files outside `packages/claude-plugin-cockpit/`. | P1 | Isolation guarantee stated in the issue body; README updates are addressed separately in Clarifications Q4. |
| FR-007 | The packed tarball must contain exactly: `commands/watch.md`, `commands/status.md`, `commands/queue.md`, `commands/clarify.md`, `commands/review.md`, `commands/merge.md`, `.claude-plugin/plugin.json`, `README.md`, and `package.json`. | P1 | `package.json` is always included by pack; the `files` array controls the rest. |
| FR-008 | Package metadata (description, keywords, author, license, repository) should follow the sibling `@generacy-ai/agency-plugin-spec-kit` conventions so the npm listing is coherent with the rest of the Generacy monorepo. | P2 | Concrete values pending Clarifications Q5. |
| FR-009 | The addition must not break any existing CI job (`ci.yml`, `publish-preview.yml`, `release.yml`) on the branch prior to merge. | P1 | Pre-existing gate; new publishable packages have historically flowed through unchanged. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Tarball contents match the acceptance list (six command files + plugin.json + README + package.json). | 100% match, zero extraneous files, zero missing files | Run `pnpm pack` in `packages/claude-plugin-cockpit/`, list the tarball with `tar tzf`, diff against the expected file set. |
| SC-002 | Package is published to npm under dist-tag `preview` automatically on merge to `develop`. | Version resolves via `npm view @generacy-ai/claude-plugin-cockpit@preview` within the runtime of the post-merge `publish-preview.yml` run. | Wait for the workflow run to succeed, then run `npm view @generacy-ai/claude-plugin-cockpit@preview`. |
| SC-003 | Cluster setup no longer requires a manual `extraKnownMarketplaces` step to deliver `/cockpit:*`. | Zero manual steps in the documented install path. | Cluster-setup dry-run installs the plugin purely via `npm`; documented in README (see Clarifications Q4). |
| SC-004 | The change touches only `packages/claude-plugin-cockpit/package.json` plus one new `.changeset/*.md` file. | Diff scope matches. | `git diff --stat` on the merge commit lists only these two files. |

## Assumptions

- The existing `.github/workflows/publish-preview.yml` requires no modification; its "non-private packages" filter (see `publish-preview.yml:37-49`) will automatically pick up `@generacy-ai/claude-plugin-cockpit` once its `package.json` is committed.
- `pnpm pack` honors the `files` array in `package.json` as the contract for tarball contents, and `commands/`, `.claude-plugin/`, and `README.md` all currently exist under `packages/claude-plugin-cockpit/`.
- `NPM_TOKEN` and `@generacy-ai` scope credentials in the repository secrets are already configured (they publish sibling packages such as `@generacy-ai/agency-plugin-spec-kit`).
- The `.claude-plugin/plugin.json` file present under source will be included verbatim in the tarball at the same relative path; consumers of the plugin discover it there.
- The six commands (`watch`, `status`, `queue`, `clarify`, `review`, `merge`) authored under issue #372 are stable and do not change under this issue.
- Preview publishes tolerate a brand-new package appearing in the workspace without prior npm history; the workflow's synthetic changeset generator and the explicit changeset added in this feature are jointly sufficient.

## Out of Scope

- Editing any of the six `commands/*.md` files or the `.claude-plugin/plugin.json` (isolation is enforced by FR-006).
- Introducing a build step, TypeScript sources, or any generated `dist/` output for this package.
- Modifying `publish-preview.yml`, `ci.yml`, `release.yml`, or any other GitHub Actions workflow.
- Cluster-setup script changes to actually consume the newly-published package (tracked separately in the epic).
- Promotion of the preview tag to `latest` / a stable version — that is a follow-up step handled by the normal release pipeline.
- Any Agency-runtime plugin integration (this package is a Claude-side plugin only; whether an `agency` metadata block is also required is addressed in Clarifications Q2).
- README rewrites beyond what may be needed to satisfy SC-003 (see Clarifications Q4 for scope decision).

---

*Generated by speckit*
