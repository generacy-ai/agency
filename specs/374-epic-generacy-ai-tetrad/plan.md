## Implementation Plan: publish `@generacy-ai/claude-plugin-cockpit`

**Feature**: Epic: generacy-ai/tetrad-development#85 | Phase: S6 | Tier: v1-delivery | Issue: A-S2 — make `packages/claude-plugin-cockpit` npm-publishable so cluster setup can deliver `/cockpit:*` without the manual `extraKnownMarketplaces` step, using the same publish rail as `@generacy-ai/agency-plugin-spec-kit`.
**Branch**: `374-epic-generacy-ai-tetrad`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Add a `package.json` to `packages/claude-plugin-cockpit/` (name `@generacy-ai/claude-plugin-cockpit`, not private, `publishConfig.access: public`, `files: ["commands", ".claude-plugin", "README.md"]`, no build step, no TS/module fields, no `agency` block), a single `.changeset/*.md` file specifying a `minor` bump on that name, and a short "Distribution" section in the package's `README.md`. On the next merge to `develop`, the existing `.github/workflows/publish-preview.yml` picks up the non-private package, runs `pnpm changeset version --snapshot preview` followed by `pnpm changeset publish --tag preview --provenance`, and publishes `@generacy-ai/claude-plugin-cockpit@preview` to npm — with `0.0.0` + `minor` yielding `0.1.0` as the base semver (mangled with a snapshot suffix by Changesets).

The technical approach is a pure metadata / distribution change: three files added (one `package.json`, one changeset, and README edits are additions in the "Distribution" section), zero runtime code, zero build output, zero workflow edits. Acceptance is verified against the **packed tarball** (not the source tree), because `pnpm pack` is the contract with npm — the `files` array plus `.claude-plugin/plugin.json`, `commands/*.md`, `README.md`, and `package.json` are what actually ship.

## Technical Context

**Language/Version**: JSON (npm `package.json` v2, Changesets v2 format) + Markdown (CommonMark) for the README section and changeset body.
**Primary Dependencies**:
- `pnpm` (workspace tool; provides `pnpm pack` — the acceptance contract).
- `@changesets/cli` (already installed at the monorepo root; drives version + publish inside `publish-preview.yml`).
- Existing `.github/workflows/publish-preview.yml` (runs on `workflow_run` for CI on `develop`; publishes every non-private `packages/*` on green).
- Sibling `@generacy-ai/agency-plugin-spec-kit` (`packages/agency-plugin-spec-kit/package.json`) — the shape / metadata reference (author, license, repository, `publishConfig`).
**Storage**: None. This feature ships no runtime state.
**Testing**:
- **Local (deterministic)** — `cd packages/claude-plugin-cockpit && pnpm pack` and inspect the produced `.tgz` with `tar tzf`. The listing MUST be exactly:
  - `package/package.json`
  - `package/README.md`
  - `package/.claude-plugin/plugin.json`
  - `package/commands/watch.md`
  - `package/commands/status.md`
  - `package/commands/queue.md`
  - `package/commands/clarify.md`
  - `package/commands/review.md`
  - `package/commands/merge.md`
- **Post-merge (indirect)** — `npm view @generacy-ai/claude-plugin-cockpit@preview version` after the `publish-preview.yml` run on the merge commit finishes. First successful preview will resolve to `0.1.0-preview-<sha>` (Changesets snapshot format).
- **Nothing to unit-test**: no code paths are added.
**Target Platform**: npm registry (public scope `@generacy-ai`), consumed by cluster setup tooling that reads the tarball's `commands/` and `.claude-plugin/`.
**Project Type**: Publishable monorepo package inside a pnpm workspace — Markdown assets only, no `src/`, no `dist/`.
**Performance Goals**: N/A (metadata change). Tarball payload should stay under ~10 KB (six small Markdown files + one JSON manifest + a small README + a small `package.json`).
**Constraints**:
- Isolation (FR-006): only three files may change on the merge commit — `packages/claude-plugin-cockpit/package.json` (added), `packages/claude-plugin-cockpit/README.md` (edited, gains "Distribution" section), and one new `.changeset/*.md`. `commands/*.md`, `.claude-plugin/plugin.json`, and every file outside this package MUST remain untouched.
- No `agency` metadata block (FR-010) — cockpit is Claude-side only.
- No TS / module fields (FR-011) — omit `type`, `main`, `module`, `types`, `exports`, `bin`, `scripts` entirely.
- No build step; no `dist/` output; `pnpm -r run --if-present build` skips the package cleanly because there is no `scripts.build`.
- Tarball contents are the contract (FR-002 / FR-007 / SC-001); source-tree layout is not sufficient because pnpm rewrites paths at pack time.
- Initial `version: "0.0.0"` + changeset `minor` bump ⇒ first published preview resolves from base `0.1.0` (FR-005).
- `.changeset/config.json`'s `baseBranch: develop` and `access: public` already match the publish path — no config edits.
**Scale/Scope**: One package, three touched files, zero workflow edits, zero code changes. Downstream cluster-setup consumption is tracked separately in the epic (Out of Scope).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this change honors implicitly:

- **Scope discipline**: The change owns only `packages/claude-plugin-cockpit/**` + one new `.changeset/*.md`, per the spec's `Owns (isolation)` line as amended by Clarifications Q4. `git diff --stat` on the merge commit MUST show exactly three files (SC-004).
- **No dead surface**: TS/module fields (Q3 → FR-011) and an `agency` block (Q2 → FR-010) are deliberately omitted rather than mirrored empty, because empty placeholders would imply capabilities that don't exist (Agency-runtime discovery, entry points that never load).
- **One-repo-per-issue rule**: Cluster-setup script changes to actually consume the newly-published package are tracked separately in the epic (spec Out of Scope) and MUST NOT leak into this feature.
- **Workflow immutability**: `publish-preview.yml`, `ci.yml`, and `release.yml` are explicitly out of scope; discovery of the new package happens via the workflow's existing `!p.private` filter over `packages/*/package.json`.

**Result**: PASS. No violations. Complexity Tracking table left empty below.

## Project Structure

### Documentation (this feature)

```text
specs/374-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (read-only for /plan)
├── clarifications.md    # Q1–Q5 answers integrated into spec (read-only for /plan)
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions + rationale
├── data-model.md        # Phase 1 — file-shape contracts (no runtime entities)
├── quickstart.md        # Phase 1 — publish path walkthrough and verification
├── contracts/           # Phase 1 — file-shape contracts
│   ├── package-json.contract.md      # Required/forbidden fields in the new package.json
│   ├── changeset.contract.md         # Frontmatter + body shape of the .changeset/*.md file
│   ├── tarball.contract.md           # Exact file set the packed .tgz must contain
│   └── readme-distribution.contract.md # Shape of the new README "Distribution" section
├── checklists/          # From /clarify or /checklist runs (pre-existing)
├── conversation-log.jsonl
└── tasks.md             # Phase 2 output — created by /speckit:tasks, NOT by /speckit:plan
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── .claude-plugin/
│   └── plugin.json                # UNCHANGED — Claude-side plugin identity (name/desc/author).
├── commands/                       # UNCHANGED — six .md files: watch, status, queue,
│   ├── watch.md                    #             clarify, review, merge.
│   ├── status.md
│   ├── queue.md
│   ├── clarify.md
│   ├── review.md
│   └── merge.md
├── package.json                    # ADDED — the crux of this feature.
│                                   #   { name: "@generacy-ai/claude-plugin-cockpit",
│                                   #     version: "0.0.0",
│                                   #     description: "Claude Code plugin providing /cockpit:* ...",
│                                   #     keywords: ["claude-plugin","cockpit","generacy",
│                                   #                "tetrad","workflow"],
│                                   #     author: "Generacy AI",
│                                   #     license: "Apache-2.0",
│                                   #     repository: { type: "git",
│                                   #                   url: "git+https://github.com/generacy-ai/agency.git",
│                                   #                   directory: "packages/claude-plugin-cockpit" },
│                                   #     files: ["commands", ".claude-plugin", "README.md"],
│                                   #     publishConfig: { access: "public" } }
│                                   #   No: private, type, main, module, types, exports, bin,
│                                   #        scripts, dependencies, devDependencies, peerDependencies,
│                                   #        agency block.
└── README.md                       # EDITED — new "Distribution" section documenting the npm
                                    # install path for cluster setup; existing marketplace
                                    # instructions retained for standalone/non-cluster users.

.changeset/
└── <slug>.md                       # ADDED — one changeset:
                                    #   ---
                                    #   "@generacy-ai/claude-plugin-cockpit": minor
                                    #   ---
                                    #
                                    #   Publish claude-plugin-cockpit as
                                    #   @generacy-ai/claude-plugin-cockpit so cluster setup can
                                    #   deliver /cockpit:* via npm.
```

**Structure Decision**: Single package, three touched files. All source changes are confined to `packages/claude-plugin-cockpit/` (per FR-006 as amended by Clarifications Q4) plus one new `.changeset/*.md` file at the monorepo root. No new directories under the package; no `src/`, no `dist/`, no tests directory. Acceptance is entirely static (tarball contents, file diff, npm view) — the four SC-00N criteria in the spec map 1:1 to the four contract files in `contracts/`.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

_(No violations — table intentionally empty.)_

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                             |
