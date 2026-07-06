## Data Model: publish `@generacy-ai/claude-plugin-cockpit`

**Feature**: 374-epic-generacy-ai-tetrad
**Phase**: 1 (design)
**Date**: 2026-07-06

This feature ships no runtime code, no database schema, no serialized wire format, and no persisted state. The "data model" is the shape of three files (one added `package.json`, one added `.changeset/*.md`, one edited `README.md`) plus the shape of the packed tarball that these files together produce. This document specifies those shapes so the tasks phase can enforce them mechanically.

The four per-file contracts under [`contracts/`](contracts/) capture the same shapes as executable checklists; this document is the narrative view.

---

### Entity 1: `packages/claude-plugin-cockpit/package.json` (added)

**Path**: `packages/claude-plugin-cockpit/package.json`
**State**: Added by this feature. Currently does not exist.
**Content-type**: JSON (npm `package.json` v2).

**Required fields** (top-level):

| Field | Type | Value | Source |
|-------|------|-------|--------|
| `name` | string | `"@generacy-ai/claude-plugin-cockpit"` | FR-001 |
| `version` | string | `"0.0.0"` | FR-005 (Q1 answer A) |
| `description` | string | `"Claude Code plugin providing /cockpit:* commands for running Generacy speckit epics (watch, status, queue, clarify, review, merge)"` | FR-008 (Q5 amendment) |
| `keywords` | string[] | `["claude-plugin", "cockpit", "generacy", "tetrad", "workflow"]` | FR-008 |
| `author` | string | `"Generacy AI"` | FR-008 |
| `license` | string | `"Apache-2.0"` | FR-008 |
| `repository` | object | `{ "type": "git", "url": "git+https://github.com/generacy-ai/agency.git", "directory": "packages/claude-plugin-cockpit" }` | FR-008 |
| `files` | string[] | `["commands", ".claude-plugin", "README.md"]` (order not significant) | FR-002 |
| `publishConfig` | object | `{ "access": "public" }` | FR-004 |

**Forbidden fields** (MUST NOT appear at top level):

| Field | Reason | Source |
|-------|--------|--------|
| `private` | `publish-preview.yml` filters by `!p.private`; presence with `true` blocks discovery. If included with `false` it merely restates the default — omit for a smaller manifest. | FR-001 |
| `type`, `main`, `module`, `types`, `exports`, `bin` | Package ships static Markdown — no code entry points. | FR-011 (Q3 answer A) |
| `scripts` | No build; `pnpm -r run --if-present build` skips script-less packages cleanly. | FR-011 (Q3 answer A) |
| `dependencies`, `devDependencies`, `peerDependencies`, `peerDependenciesMeta` | No code, no build, no runtime consumers of a JS module. | FR-011 |
| `agency` | Cockpit is Claude-side only; Agency runtime never reads this package.json. | FR-010 (Q2 answer B) |

**Validity rules**:
- JSON MUST parse (no trailing commas, no comments).
- Field order SHOULD follow the sibling `@generacy-ai/agency-plugin-spec-kit` where fields overlap (name → version → description → repository → files → publishConfig → keywords → author → license), but strict order is not required by npm.
- File MUST end with a newline (matches sibling and repo hygiene).

---

### Entity 2: `.changeset/<slug>.md` (added)

**Path**: `.changeset/<slug>.md` where `<slug>` is any kebab-case string (Changesets convention; the CLI would normally generate a random word-pair like `funny-dogs-run`).
**State**: Added by this feature. Exactly one new file (FR-005, SC-004).
**Content-type**: Markdown with YAML-like frontmatter (Changesets format).

**Structure**:

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

<one-to-three-line changelog summary — e.g. "Publish claude-plugin-cockpit as
@generacy-ai/claude-plugin-cockpit so cluster setup can deliver /cockpit:* via npm.">
```

**Validity rules**:
- The frontmatter block MUST reference exactly `@generacy-ai/claude-plugin-cockpit` (the name declared in Entity 1) — no typos, no siblings.
- The bump MUST be `minor` (FR-005, Q1 answer A).
- The body MUST be non-empty (Changesets will emit an empty section otherwise).
- The filename slug MUST NOT be `README.md` (the workflow's discovery excludes that reserved name — see `publish-preview.yml:32`).

**Interaction with `publish-preview.yml`**:
- Detected by `find .changeset -name '*.md' ! -name 'README.md'` (line 32), which suppresses the synthetic-changeset fallback.
- Consumed by `pnpm changeset version --snapshot preview` (line 86), which converts the `minor` bump into a snapshot version derived from base `0.1.0` plus a snapshot suffix (e.g. `0.1.0-preview-<timestamp>` or `0.1.0-preview-<sha>` depending on Changesets configuration).

---

### Entity 3: `packages/claude-plugin-cockpit/README.md` (edited)

**Path**: `packages/claude-plugin-cockpit/README.md`
**State**: Edited. The file already exists (see current content on `develop`).
**Content-type**: Markdown (CommonMark).

**Structural invariants** (existing content preserved):
- H1 title, "Overview" section, "Installation" section (marketplace instructions), "Available Commands" table, "Error Handling" section, "Related" section, "License" section — all remain.
- No content removed from any existing section.

**Additive change** — new "Distribution" section:
- Location: after "Installation", before "Available Commands" (rationale: distribution is a peer of installation and belongs adjacent to it).
- H2 heading: `## Distribution`.
- Content requirements (FR-006 as amended by Q4):
  - Documents the npm install path: package is `@generacy-ai/claude-plugin-cockpit`, available on the `preview` dist-tag from post-merge publishes and `latest` for stable releases.
  - Explains that cluster setup consumes the package automatically (installs it and copies `commands/` into the cluster-side plugin tree) — no manual `extraKnownMarketplaces` step required.
  - Explicitly notes the marketplace instructions remain valid for standalone/non-cluster users.

**Validity rules**:
- All existing content lines remain byte-identical.
- Exactly one new section added; no other headings introduced.
- Markdown remains renderable as CommonMark (no unclosed code fences, no broken tables).

---

### Entity 4: Packed tarball (derived)

**Produced by**: `cd packages/claude-plugin-cockpit && pnpm pack`
**Filename**: `generacy-ai-claude-plugin-cockpit-<version>.tgz` (npm's canonical mangled scope form).
**Content-type**: gzipped tar archive.

**Required contents** — the tarball MUST contain exactly these nine paths (all prefixed `package/` per npm convention) and no others (FR-007, SC-001):

```
package/package.json
package/README.md
package/.claude-plugin/plugin.json
package/commands/watch.md
package/commands/status.md
package/commands/queue.md
package/commands/clarify.md
package/commands/review.md
package/commands/merge.md
```

**Forbidden contents**:
- Any file under `packages/claude-plugin-cockpit/` not in the list above.
- `.DS_Store`, editor swap files, `.git/`, `node_modules/`, `.turbo/`, `.pnpm-debug.log`, etc.
- Any `plan.md`, `breakdown.md`, `bug.md`, or other markdown files that were deleted from `commands/` under issue #372.

**Validity rules**:
- Path count MUST equal 9 exactly.
- Verification command: `tar tzf <tarball> | sort` — output MUST match the required list sorted.
- Version segment in the filename SHOULD be `0.0.0` locally (since `pnpm pack` uses the current `package.json` version); CI's snapshot publish will rewrite this before the actual publish.

---

### Entity 5: Published npm artifact (derived, post-merge)

**Produced by**: `pnpm changeset publish --tag preview --provenance` inside `publish-preview.yml`, invoked after `pnpm changeset version --snapshot preview` (which reads Entity 2).
**Registry coordinate**: `@generacy-ai/claude-plugin-cockpit@preview`.
**First base version**: derived from `0.0.0` + `minor` = `0.1.0`, with a snapshot suffix appended (format determined by Changesets; e.g. `0.1.0-preview-<snap>`).

**Validity check** (SC-002):

```bash
npm view @generacy-ai/claude-plugin-cockpit@preview version
```

MUST return a resolvable version string within the runtime of the post-merge `publish-preview.yml` run (typically a few minutes after the run reports success).

**Non-goals**:
- Promotion to `latest` (out of scope — normal release pipeline handles this).
- Consumption by cluster setup (out of scope — tracked separately in the epic).

---

### Relationships

```text
Entity 1 (package.json)  ─┬─► Entity 4 (tarball)  ─► Entity 5 (npm artifact)
                          │
Entity 2 (changeset)    ──┼─► Entity 5 (npm artifact, version resolution)
                          │
Entity 3 (README)       ──┴─► Entity 4 (tarball, as a listed file)
```

- Entity 1 defines the shape of Entity 4 (via `files`) and the identity of Entity 5 (via `name`, `version`, `publishConfig`).
- Entity 2 controls the version segment of Entity 5.
- Entity 3 is consumed by Entity 4 as a payload file and is visible on npm as the package README.
