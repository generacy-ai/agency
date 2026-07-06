# Contract: `packages/claude-plugin-cockpit/package.json`

Shape of the file this feature creates. This is the source of truth for the reviewer.

## Full expected file

```json
{
  "name": "@generacy-ai/claude-plugin-cockpit",
  "version": "0.0.0",
  "description": "Claude Code plugin providing /cockpit:* commands for Tetrad workflows",
  "keywords": [
    "claude-plugin",
    "cockpit",
    "generacy",
    "tetrad",
    "workflow"
  ],
  "author": "Generacy AI",
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/generacy-ai/agency.git",
    "directory": "packages/claude-plugin-cockpit"
  },
  "files": [
    "commands",
    ".claude-plugin",
    "README.md"
  ],
  "publishConfig": {
    "access": "public"
  }
}
```

## Field-by-field contract

| Field | Required | Fixed value | Test / gate |
|-------|----------|-------------|-------------|
| `name` | yes | `@generacy-ai/claude-plugin-cockpit` | FR-001; `npm view` after merge (SC-002) |
| `version` | yes | `0.0.0` (see Q1 default) | Changesets consumes this on release; first published version will be `0.1.0` |
| `description` | yes | Fixed string above | Q5 default |
| `keywords` | yes | Array above | Q5 default |
| `author` | yes | `Generacy AI` | Q5 default |
| `license` | yes | `Apache-2.0` | Q5 default |
| `repository.type` | yes | `git` | Q5 default |
| `repository.url` | yes | `git+https://github.com/generacy-ai/agency.git` | Q5 default |
| `repository.directory` | yes | `packages/claude-plugin-cockpit` | Q5 default |
| `files` | yes | `["commands", ".claude-plugin", "README.md"]` | FR-002; verified via `pnpm pack --dry-run` (FR-007) |
| `publishConfig.access` | yes | `public` | FR-004 |
| `private` | MUST NOT be `true` | — | `publish-preview.yml` filters on `!p.private` |
| `type` / `main` / `module` / `types` / `exports` / `bin` | MUST be absent | — | Q3 default; FR-003 (no build step) |
| `scripts` | MUST be absent | — | Q3 default; add later only if root `pnpm build` requires it |
| `agency` | MUST be absent | — | Q2 default |
| `dependencies` / `peerDependencies` / `devDependencies` | MUST be absent | — | Nothing to depend on |

# Contract: `.changeset/publish-cockpit-plugin.md`

## Full expected file

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

Initial preview release of the cockpit Claude Code plugin, delivering the /cockpit:* commands (clarify, merge, queue, review, status, watch) via npm.
```

## Field-by-field contract

| Position | Required | Value | Test / gate |
|----------|----------|-------|-------------|
| Frontmatter key | yes | `"@generacy-ai/claude-plugin-cockpit"` (quoted) | Must match `name` in package.json exactly |
| Frontmatter value | yes | `minor` | Q1 default → first publish is `0.1.0` |
| Body | yes | Non-empty release note | Becomes CHANGELOG.md entry |
| Filename | yes | `publish-cockpit-plugin.md` under `.changeset/` | Must not collide with `README.md` in `.changeset/` |

# Contract: Packed tarball (verification)

After running `pnpm pack` in `packages/claude-plugin-cockpit`, the tarball MUST contain exactly:

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

Verification commands (per FR-007 / SC-001):

```bash
cd packages/claude-plugin-cockpit
pnpm pack --dry-run
# expect 9 files listed above

# OR against the actual tarball:
pnpm pack
tar tzf generacy-ai-claude-plugin-cockpit-*.tgz | sort
# expect the same 9 files
```

Any extra file (e.g., `.turbo/`, `docs/`, `tests/`, `dist/`) is an FR-007 failure.
