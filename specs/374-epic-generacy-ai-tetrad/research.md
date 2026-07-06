## Research: publish `@generacy-ai/claude-plugin-cockpit`

**Feature**: 374-epic-generacy-ai-tetrad
**Phase**: 0 (research / decisions)
**Date**: 2026-07-06

This document captures the technology / design decisions that shape the package.json, changeset, and README edits. All open questions were resolved during `/clarify` (see [clarifications.md](clarifications.md)); no `NEEDS CLARIFICATION` items remain.

---

### Decision 1: Delivery rail — reuse the existing `publish-preview.yml` path

**Decision**: Publish `@generacy-ai/claude-plugin-cockpit` via the existing `publish-preview.yml` workflow, with **zero workflow edits**. Discovery is automatic: the workflow enumerates `packages/*/package.json`, filters `!p.private && p.name && !ignore.has(p.name)`, and includes the package unconditionally once its `package.json` lands and is not marked `private`.

**Rationale**:
- The workflow file at `.github/workflows/publish-preview.yml:37-49` explicitly implements a non-private-package filter, meaning **any** newly-added, non-private `packages/*/package.json` is picked up on the next merge-to-`develop` publish run. This is the same rail that ships `@generacy-ai/agency-plugin-spec-kit`.
- Modifying the workflow would violate the isolation constraint (FR-006 / FR-009) and the spec's Out of Scope list.
- The workflow already handles the "no explicit changeset" case by generating a synthetic one; adding our own changeset (FR-005) makes the snapshot bump explicit and coherent instead of leaning on the fallback.

**Alternatives considered**:
- **Add a bespoke publish job for cockpit** — rejected: duplicates existing logic and violates FR-009 by touching workflow files.
- **Rely on the synthetic changeset fallback alone** — rejected: FR-005 mandates an explicit changeset for a coherent audit trail and to control the initial semver bump (Q1: `minor`, not the fallback's `patch`).

**Sources**: `.github/workflows/publish-preview.yml`, `packages/agency-plugin-spec-kit/package.json` (sibling precedent), `.changeset/config.json` (`baseBranch: develop`, `access: public`).

---

### Decision 2: Initial version + changeset bump — `0.0.0` + `minor` ⇒ base `0.1.0`

**Decision**: Option A from Clarifications Q1. Set `version: "0.0.0"` in `package.json` and add a `minor` bump in the changeset, so the first published preview resolves from a base of `0.1.0` (mangled with a snapshot suffix per `pnpm changeset version --snapshot preview`).

**Rationale**:
- The package is new and pre-stable. Mirroring the sibling's `1.0.x` stable line (Option D) would claim a stability we haven't earned, and the smoke test at generacy-ai/tetrad-development#88 is still ahead.
- Changesets computes the next version by applying the bump to whatever `version` field is in `package.json`; the combination is the only thing that determines what actually lands on npm.
- Starting at `0.1.0` leaves room for `0.1.x` patches and `0.2.0` minor evolutions before the first stable `1.0.0` — a normal pre-stable trajectory.

**Alternatives considered**:
- **B (`0.1.0` + patch ⇒ `0.1.1`)** — rejected: skips `0.1.0` entirely, which is idiomatic for "first pre-stable minor."
- **C (`0.0.0` + major ⇒ `1.0.0`)** — rejected: claims stability we don't have.
- **D (`1.0.0` + minor ⇒ `1.1.0`)** — rejected: mirrors sibling but overstates maturity.

**Sources**: Clarifications Q1; `.changeset/config.json`; `publish-preview.yml:83-87` (`pnpm changeset version --snapshot preview` + `pnpm changeset publish --tag preview`).

---

### Decision 3: No `agency` metadata block in `package.json`

**Decision**: Option B from Clarifications Q2. `packages/claude-plugin-cockpit/package.json` does NOT include an `agency` object (FR-010). The sibling `@generacy-ai/agency-plugin-spec-kit` does declare one because it is discovered by the Agency runtime — cockpit is not.

**Rationale**:
- Cockpit is a Claude-side plugin only. Its identity lives in `.claude-plugin/plugin.json` (name, description, author) and its commands live in `commands/*.md`; the Agency runtime never reads its `package.json`.
- The delivery path (cluster setup copies `commands/` and `.claude-plugin/` out of `node_modules/@generacy-ai/claude-plugin-cockpit/`) does not touch the `agency` block.
- An empty `agency: {}` block would be dead surface — it would imply Agency-runtime discovery that doesn't exist and invite readers to grep for wiring that isn't there.

**Alternatives considered**:
- **Include a stub `agency` block for shape consistency** — rejected on the "no dead surface" principle. A block that isn't read is worse than no block.

**Sources**: Clarifications Q2; sibling `packages/agency-plugin-spec-kit/package.json:75-85`.

---

### Decision 4: Omit all TS / module fields

**Decision**: Option A from Clarifications Q3. Omit `type`, `main`, `module`, `types`, `exports`, `bin`, `scripts`, `dependencies`, `devDependencies`, `peerDependencies` entirely (FR-011).

**Rationale**:
- The package ships static Markdown — there is no code entry point, so `main`/`module`/`types`/`exports` would each point at nothing.
- No build step is needed; the sibling `agency-plugin-spec-kit`'s `scripts.build: "tsc"` exists because it emits `dist/`. Cockpit ships source verbatim.
- The `publish-preview` workflow's `pnpm -r run --if-present build` step (line 81) skips packages without a `scripts.build` cleanly — no failure, no warning.
- Placeholder fields would be dead surface (same reasoning as Decision 3).

**Alternatives considered**:
- **B — include a no-op `prepack` or sanity-check `scripts` block** — rejected: adds a script whose only purpose is to exist. If verification is needed, do it in CI or the acceptance run, not as a placeholder in `package.json`.
- **C — mirror sibling structure with empty placeholders** — rejected: dead surface, and it would falsely imply a build step exists.

**Sources**: Clarifications Q3; `publish-preview.yml:79-81`; sibling `packages/agency-plugin-spec-kit/package.json:10-40`.

---

### Decision 5: `files` array — three entries, source-tree paths

**Decision**: `files: ["commands", ".claude-plugin", "README.md"]`. `package.json` is always included by npm regardless of the `files` array (FR-007).

**Rationale**:
- pnpm honors the `files` array as the tarball whitelist; anything not listed is excluded (subject to always-included files like `package.json`, `README.md` — README is listed anyway for clarity).
- Directory entries (`commands`, `.claude-plugin`) include their contents recursively, so all six `commands/*.md` files and `.claude-plugin/plugin.json` ship without needing per-file entries.
- Explicitly listing `README.md` is redundant but improves readability; npm always ships it.
- The three-entry list matches FR-002 verbatim.

**Alternatives considered**:
- **Per-file entries** (`commands/watch.md`, ..., `.claude-plugin/plugin.json`, `README.md`) — rejected: brittle. Any future rename or split of `plugin.json` would silently drop from the tarball. Directory entries are self-maintaining.
- **Include everything by default** (omit `files`) — rejected: `.DS_Store`, `.git/`, editor swap files, and other stray content in the source directory would ship. Explicit whitelist is the norm for publishable packages in this monorepo.

**Sources**: Clarifications Q4 (README stays in scope), FR-002, FR-007; pnpm/npm `files` field semantics.

---

### Decision 6: Package metadata — mirror sibling for author/license/repository; amended description; new keywords

**Decision**: Option A (amended) from Clarifications Q5. Mirror `@generacy-ai/agency-plugin-spec-kit` for:
- `author: "Generacy AI"`
- `license: "Apache-2.0"`
- `repository: { type: "git", url: "git+https://github.com/generacy-ai/agency.git", directory: "packages/claude-plugin-cockpit" }`
- `publishConfig: { access: "public" }`

Use the amended description: `"Claude Code plugin providing /cockpit:* commands for running Generacy speckit epics (watch, status, queue, clarify, review, merge)"`.

Use keywords: `["claude-plugin", "cockpit", "generacy", "tetrad", "workflow"]`.

**Rationale**:
- Mirroring author/license/repository keeps consistency with the rest of the `@generacy-ai/*` scope on npm — anyone reading the sibling and this package side-by-side will see the same provenance metadata.
- `publishConfig.access: "public"` is required (FR-004) because scoped packages default to `restricted` and `npm publish` would fail on a fresh CI environment without it.
- The `directory` subpath tells npm's provenance system where in the monorepo the source lives; the publish job is invoked with `--provenance`.
- The amended description avoids "Tetrad workflows" — the plugin works for any team running a cluster, not just Tetrad projects.
- Keywords match the taxonomy npm uses for discovery (`claude-plugin` is emerging as a de-facto convention; `generacy` and `tetrad` cluster it with sibling packages; `workflow` and `cockpit` describe function).

**Alternatives considered**:
- **Original description** ("Claude Code plugin providing /cockpit:* commands for Tetrad workflows") — rejected in clarify (user amendment): undersells breadth.
- **Fewer / more keywords** — no signal that either helps or hurts discovery for such a niche package.

**Sources**: Clarifications Q5; sibling `packages/agency-plugin-spec-kit/package.json:1-53`.

---

### Decision 7: Verify against the packed tarball, not the source tree

**Decision**: Acceptance for FR-002 / FR-007 / SC-001 is verified by running `pnpm pack` inside `packages/claude-plugin-cockpit/` and inspecting the produced `.tgz` with `tar tzf`. The **source tree** is not the contract.

**Rationale**:
- pnpm rewrites paths at pack time (all entries are prefixed `package/`), applies the `files` whitelist, and drops development-only files. The tarball is what actually ships to npm and to `node_modules` on install; source-tree assumptions can silently diverge.
- Historical failure modes in this monorepo have included `.DS_Store` files shipping, missing top-level assets due to an incomplete `files` array, and duplicate content from `.npmignore` interacting with `files`. The tarball is the only ground truth.
- `tar tzf <tarball>` is deterministic, portable, and requires no additional tooling.

**Alternatives considered**:
- **Verify via `git ls-files` on the package directory** — rejected: doesn't reflect the `files` whitelist and doesn't catch `.npmignore` interactions.
- **Publish first, then `npm view files`** — rejected: pushes the check past the point of no return.

**Sources**: FR-002, FR-007, SC-001; pnpm `pack` semantics.

---

### Decision 8: README "Distribution" section — additive, keeps marketplace instructions

**Decision**: Add a short "Distribution" section to `packages/claude-plugin-cockpit/README.md` documenting the npm install path (cluster setup installs it; `generacy setup build` wires commands); keep the existing "Installation" section describing the manual `extraKnownMarketplaces` marketplace path for standalone / non-cluster users.

**Rationale**:
- npm delivery does not replace the marketplace path — it adds a zero-step cluster rail. Removing the marketplace instructions would break the standalone install flow for users not running a cluster.
- SC-003's "documented in README" verification requires this section to exist somewhere in the README of the published package.
- The addition amends FR-006's isolation to include `README.md` per Clarifications Q4. `commands/*.md` and `.claude-plugin/plugin.json` remain untouched.

**Alternatives considered**:
- **Rewrite the README to lead with the npm path** — rejected: unnecessary churn, and it demotes the marketplace path unfairly for standalone users.
- **Leave README as-is** — rejected in clarify (Q4 answer A): SC-003 requires documentation.

**Sources**: Clarifications Q4, SC-003; existing `packages/claude-plugin-cockpit/README.md`.

---

## Summary of Referenced Sources

- `packages/agency-plugin-spec-kit/package.json` — sibling precedent for author/license/repository/publishConfig; `agency` block precedent explicitly not mirrored (Decision 3).
- `.github/workflows/publish-preview.yml:32-90` — non-private package discovery filter (lines 37-49), snapshot version + publish invocation (lines 83-87).
- `.changeset/config.json` — `baseBranch: develop`, `access: public`; no edits required.
- `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` — Claude-side plugin identity; unchanged by this feature.
- `packages/claude-plugin-cockpit/commands/*.md` — the six command files that must ship in the tarball; unchanged by this feature.
- `packages/claude-plugin-cockpit/README.md` — target of the "Distribution" section addition.
- Clarifications Q1–Q5 in `clarifications.md` — resolve initial version/bump, `agency` block, TS fields, README scope, and metadata values.
