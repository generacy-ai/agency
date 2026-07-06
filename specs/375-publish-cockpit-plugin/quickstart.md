# Quickstart: Publish claude-plugin-cockpit

This quickstart walks a developer through the local changes and the verification steps that gate this feature. There is no runtime to install — the outputs are two authored files and a validated tarball.

## Prerequisites

- Working tree on branch `375-publish-cockpit-plugin`.
- `pnpm` installed and `pnpm install` has succeeded in the repo root.
- npm registry access is not needed locally (publishing happens in CI after merge).

## Step 1 — Create `packages/claude-plugin-cockpit/package.json`

Write the file exactly as shown in `contracts/package.json.schema.md`. Key points:

- `name` MUST be `"@generacy-ai/claude-plugin-cockpit"`.
- `"private"` MUST NOT be `true`.
- `files` MUST be `["commands", ".claude-plugin", "README.md"]`.
- No `scripts`, no `type`, no `main`/`module`/`types`/`exports`/`bin`, no `agency` block.

## Step 2 — Add the Changesets entry

Create `.changeset/publish-cockpit-plugin.md`:

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

Initial preview release of the cockpit Claude Code plugin, delivering the /cockpit:* commands (clarify, merge, queue, review, status, watch) via npm.
```

## Step 3 — Update the README (Q4 default: in scope)

In `packages/claude-plugin-cockpit/README.md`, replace the "Installation" section that currently instructs adding `extraKnownMarketplaces` with the npm-based install path. Keep the wording concise and consistent with the sibling plugin's README pattern.

## Step 4 — Verify the tarball contents

```bash
cd packages/claude-plugin-cockpit
pnpm pack --dry-run
```

Expected file list (order may vary):

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

If any extra file appears (e.g. `.turbo/`, `docs/`, `tests/`, `dist/`), fix the `files` whitelist before proceeding.

## Step 5 — Confirm workspace-level build still passes

```bash
cd /workspaces/agency
pnpm install --frozen-lockfile
pnpm build
```

The cockpit package has no build script; the root `pnpm build` should skip it cleanly. If turbo/pnpm complains that no `build` script exists on the cockpit package, add a no-op `build` script to `packages/claude-plugin-cockpit/package.json` (`"scripts": { "build": "true" }`) — this is the only condition under which Q3's "no scripts" default may be relaxed.

## Step 6 — Confirm changeset discovery

The publish workflow uses this find command:

```bash
find .changeset -name '*.md' ! -name 'README.md' | head -1
```

Run it locally to confirm your new changeset is picked up:

```bash
find .changeset -name '*.md' ! -name 'README.md'
# expect to see: .changeset/publish-cockpit-plugin.md
```

## Step 7 — Commit and open the PR

```bash
git add packages/claude-plugin-cockpit/package.json \
        packages/claude-plugin-cockpit/README.md \
        .changeset/publish-cockpit-plugin.md
git commit -m "feat(cockpit): publish claude-plugin-cockpit to npm"
git push -u origin 375-publish-cockpit-plugin
gh pr create --base develop
```

## Step 8 — After merge to develop, verify the npm release

CI's `Publish Preview` job runs `pnpm changeset version --snapshot preview` and `pnpm changeset publish --tag preview`. After it completes:

```bash
npm view @generacy-ai/claude-plugin-cockpit dist-tags
# expect the "preview" tag to point at 0.1.0-preview-<snapshot>
```

Success = SC-002.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `pnpm pack --dry-run` lists `.turbo/` or `dist/` | `files` field missing or wrong | Restore exact `files` array from Step 1 |
| `pnpm build` fails at root complaining about missing `build` script on cockpit | Root pipeline requires all packages to have `build` | Add `"scripts": { "build": "true" }` (see Step 5) |
| Changeset file not found by workflow | Filename is `README.md` or file lives outside `.changeset/` | Rename per Step 2 |
| `npm view` shows nothing after merge | `@generacy-ai/latency@preview` gate in `publish-preview.yml` was skipped (missing latency preview release) | Not this feature's problem — the workflow prints a warning and skips. Rerun the workflow after latency is published. |
| npm returns 402/403 on publish | Scope publish attempted as private | Confirm `publishConfig.access: "public"` in package.json |
| First published version is not `0.1.0` | Changeset bump was `patch` instead of `minor`, or `version` in package.json was not `0.0.0` | Fix the changeset file or `package.json` version and re-run |

## Rollback

If the preview publish is wrong (e.g., accidentally shipped an extra file), publish a fixed patch release rather than unpublishing:

1. Fix the offending file / `files` whitelist.
2. Add a new changeset with `patch` bump.
3. Merge to `develop`. The next preview snapshot supersedes the bad one on the `preview` dist-tag.

npm's 72-hour unpublish window is a last resort; prefer superseding.
