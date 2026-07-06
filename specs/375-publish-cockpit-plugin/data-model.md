# Data Model: Publish claude-plugin-cockpit

This feature has no runtime data model — the package ships static markdown and JSON. The "data model" here describes the shape of the two authored artifacts (`package.json` and `.changeset/*.md`) and the invariants the packed tarball must satisfy.

## Entity: `package.json` for `@generacy-ai/claude-plugin-cockpit`

### Required fields

| Field | Type | Value / constraint |
|-------|------|---------------------|
| `name` | string | `"@generacy-ai/claude-plugin-cockpit"` (FR-001) |
| `version` | string | `"0.0.0"` (initial; Q1 default — first Changesets minor bump publishes `0.1.0`) |
| `description` | string | `"Claude Code plugin providing /cockpit:* commands for Tetrad workflows"` (Q5 default) |
| `keywords` | string[] | `["claude-plugin", "cockpit", "generacy", "tetrad", "workflow"]` (Q5 default) |
| `author` | string | `"Generacy AI"` (Q5 default; mirrors sibling) |
| `license` | string | `"Apache-2.0"` (Q5 default; mirrors sibling) |
| `repository` | object | `{ type: "git", url: "git+https://github.com/generacy-ai/agency.git", directory: "packages/claude-plugin-cockpit" }` (Q5 default) |
| `files` | string[] | Exactly `["commands", ".claude-plugin", "README.md"]` (FR-002) |
| `publishConfig` | object | `{ "access": "public" }` (FR-004) |

### Forbidden fields (per Q3 default and FR-003)

Do NOT include:

- `type`, `main`, `module`, `types`, `exports`, `bin`
- `scripts` (unless during `/tasks` the root `pnpm build` recipe requires a no-op `build` — decide there, not here)
- `dependencies`, `peerDependencies`, `devDependencies` (nothing to depend on)
- `private` — MUST NOT be `true` (FR-001)
- `agency` metadata block (Q2 default)

### Validation rules

1. `"private"` key MUST NOT be present, or if present MUST be `false`. `publish-preview.yml` filters on `!p.private`.
2. `name` MUST start with `@generacy-ai/` scope — required by `publishConfig.access: "public"` and the org publish token.
3. `version` MUST be valid semver.
4. `files` MUST NOT include glob patterns that could pull in `node_modules`, `.turbo`, or `dist`.

## Entity: `.changeset/<slug>.md`

### Shape

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

<one-line release note>
```

### Fields

| Field | Type | Value / constraint |
|-------|------|---------------------|
| Frontmatter key | string | Package name exactly as it appears in `package.json` (`"@generacy-ai/claude-plugin-cockpit"`). Quotes required — Changesets parses YAML frontmatter. |
| Frontmatter value | enum | One of `"patch" | "minor" | "major"`. Use `minor` (Q1 default). |
| Body | markdown | Non-empty release note. Changesets uses this as changelog copy. |

### Validation rules

1. Filename MUST be under `.changeset/` and MUST end in `.md`.
2. Filename MUST NOT be `README.md` (excluded by `publish-preview.yml`'s discovery: `find .changeset -name '*.md' ! -name 'README.md'`).
3. Exactly one bump type per package per file.

## Invariant: Packed tarball contents

Extracting `pnpm pack`'s output MUST yield exactly this set of files under `package/`:

```
package/.claude-plugin/plugin.json
package/README.md
package/commands/clarify.md
package/commands/merge.md
package/commands/queue.md
package/commands/review.md
package/commands/status.md
package/commands/watch.md
package/package.json
```

Verified per FR-007 / SC-001 by running `pnpm pack --dry-run` or `tar tzf` against the produced tarball. No `dist/`, no `node_modules/`, no `.turbo/`, no `docs/`, no `tests/`, no `spec.md`, no `tsconfig.json`, no `vitest.config.ts`.

## Relationships

- The `.changeset/<slug>.md` references the `package.json` by `name`. Rename the package → the changeset stops matching.
- `publish-preview.yml` reads every `packages/*/package.json` at run time, filters `!private && name && !ignore`, and either publishes it (if a changeset exists) or writes a synthetic patch changeset. This feature's changeset overrides the synthetic path with an explicit `minor` for the initial release.
- `.claude-plugin/plugin.json` is unrelated to npm identity — it is Claude Code's plugin manifest. Both files coexist; do not confuse them.
