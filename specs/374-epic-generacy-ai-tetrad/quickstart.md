## Quickstart: publish `@generacy-ai/claude-plugin-cockpit`

**Feature**: 374-epic-generacy-ai-tetrad
**Audience**: A repository maintainer implementing this feature on the `374-epic-generacy-ai-tetrad` branch and verifying the outcome locally + post-merge.

This quickstart walks the reader through the three edits, the local verification, the merge, and the post-merge npm check. It validates SC-001 (tarball contents), SC-002 (npm publish resolves), SC-003 (README documents cluster path), and SC-004 (diff scope).

---

### Prerequisites

1. **Repository checkout on branch `374-epic-generacy-ai-tetrad`**:
   ```bash
   git rev-parse --abbrev-ref HEAD    # should print 374-epic-generacy-ai-tetrad
   git status                          # should be clean before starting
   ```

2. **pnpm installed** (matches `packageManager` field in the root `package.json`):
   ```bash
   pnpm --version                      # any recent v9+
   ```

3. **Dependencies installed**:
   ```bash
   pnpm install --frozen-lockfile
   ```

4. **`.changeset/config.json` unchanged**: no edits required — the workflow reads `baseBranch: develop` and `access: public` from it, both already correct.

---

### Step 1 — Add `packages/claude-plugin-cockpit/package.json`

Create the file with the fields specified in [`contracts/package-json.contract.md`](contracts/package-json.contract.md). A minimal, contract-compliant shape is:

```json
{
  "name": "@generacy-ai/claude-plugin-cockpit",
  "version": "0.0.0",
  "description": "Claude Code plugin providing /cockpit:* commands for running Generacy speckit epics (watch, status, queue, clarify, review, merge)",
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
  },
  "keywords": [
    "claude-plugin",
    "cockpit",
    "generacy",
    "tetrad",
    "workflow"
  ],
  "author": "Generacy AI",
  "license": "Apache-2.0"
}
```

Verify locally:

```bash
node -e "JSON.parse(require('fs').readFileSync('packages/claude-plugin-cockpit/package.json'))"
# no output ⇒ valid JSON.
```

Run the one-shot contract check from [`contracts/package-json.contract.md`](contracts/package-json.contract.md) — it MUST print `OK`.

---

### Step 2 — Add a changeset

Create exactly one new file under `.changeset/`. Filename slug is free (kebab-case, must not be `README.md`); a good practical choice is `publish-claude-plugin-cockpit.md`:

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

Publish claude-plugin-cockpit as @generacy-ai/claude-plugin-cockpit so cluster
setup can deliver /cockpit:* via npm without a manual extraKnownMarketplaces step.
```

Run the one-shot contract check from [`contracts/changeset.contract.md`](contracts/changeset.contract.md) — it MUST print `OK`.

---

### Step 3 — Edit `packages/claude-plugin-cockpit/README.md`

Insert a new `## Distribution` H2 section between the existing `## Installation` and `## Available Commands` sections. Do not touch any other section (see [`contracts/readme-distribution.contract.md`](contracts/readme-distribution.contract.md)).

A shape that satisfies all four required elements:

```markdown
## Distribution

The plugin is published to npm as `@generacy-ai/claude-plugin-cockpit`. Post-merge
publishes on `develop` land under the `preview` dist-tag; promoted stable releases
land under `latest`.

- **Cluster-managed environments**: cluster setup installs the package
  automatically and wires `commands/` into the Claude plugin tree — no manual
  `extraKnownMarketplaces` edit is required.
- **Standalone / non-cluster users**: keep following the `## Installation`
  section above; the marketplace path remains fully supported.
```

Run the one-shot verification from [`contracts/readme-distribution.contract.md`](contracts/readme-distribution.contract.md) — it MUST print `OK`.

---

### Step 4 — Verify the packed tarball locally

```bash
cd packages/claude-plugin-cockpit
TARBALL=$(pnpm pack | tail -1)
echo "Tarball: $TARBALL"
tar tzf "$TARBALL" | grep -v '/$' | sort
```

Expected output (nine lines):

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

Run the one-shot verification from [`contracts/tarball.contract.md`](contracts/tarball.contract.md) — it MUST print `OK`.

Clean up the tarball if desired (`rm "$TARBALL"`) — do not commit it.

---

### Step 5 — Verify the diff scope (SC-004)

```bash
git diff --name-only develop... | sort
```

Expected output (exactly three lines):

```
.changeset/<your-slug>.md
packages/claude-plugin-cockpit/README.md
packages/claude-plugin-cockpit/package.json
```

Any other line ⇒ scope creep — investigate and revert before opening the PR.

---

### Step 6 — Open a PR against `develop`

```bash
git add packages/claude-plugin-cockpit/package.json \
        packages/claude-plugin-cockpit/README.md \
        .changeset/
git commit -m "feat(claude-plugin-cockpit): publish as @generacy-ai/claude-plugin-cockpit"
git push -u origin 374-epic-generacy-ai-tetrad
gh pr create --base develop --title "feat: publish @generacy-ai/claude-plugin-cockpit"
```

Wait for `ci.yml` to go green.

---

### Step 7 — Merge and confirm the npm publish (SC-002)

1. Merge the PR to `develop`.
2. Wait for the `Publish Preview` workflow run triggered by the CI completion to succeed. Watch it with `gh run watch` or in the Actions UI.
3. Query npm:
   ```bash
   npm view @generacy-ai/claude-plugin-cockpit@preview version
   ```
   MUST return a version string of the form `0.1.0-preview-<snapshot>` (exact snapshot suffix depends on Changesets configuration).

If step 3 returns nothing or an error, inspect the workflow logs. Common issues and mitigations:

| Symptom | Likely cause | Mitigation |
|---------|--------------|------------|
| `npm view` returns `E404` | Publish job skipped (Changesets snapshot found no bumps) | Verify the changeset file is present on `develop` and the frontmatter references `@generacy-ai/claude-plugin-cockpit` verbatim. |
| Publish job fails with `E401 Unauthorized` | `NPM_TOKEN` secret missing or expired | Confirm secret in repo settings; the sibling `@generacy-ai/agency-plugin-spec-kit` publishes on the same rail — if its publish succeeded on this merge, the token is fine. |
| Publish job fails with `E403 forbidden` on `@generacy-ai` scope | `publishConfig.access` not set to `"public"` | Verify Step 1 — `publishConfig.access: "public"` MUST be present. |
| Publish job fails with `@generacy-ai/latency@preview not found on npm` warning and skips | Deliberate gate in `publish-preview.yml:52-61` | Wait for the latency package's preview to publish, then re-run the workflow. |

---

### Troubleshooting matrix

| Issue | Where to look |
|-------|---------------|
| `pnpm pack` fails locally | `packages/claude-plugin-cockpit/package.json` — valid JSON? `files` array well-formed? Do listed directories exist under `packages/claude-plugin-cockpit/`? |
| Tarball contains extra files | `files` array — narrow it to exactly `["commands", ".claude-plugin", "README.md"]`. Also check for `.DS_Store` or editor swap files under the source directory. |
| Tarball missing a command file | Are all six files present at `packages/claude-plugin-cockpit/commands/*.md`? `ls packages/claude-plugin-cockpit/commands/` should show six `.md` files. |
| Diff shows more than three files | `git diff --name-only develop... -- packages/claude-plugin-cockpit/` — anything besides `package.json` and `README.md` needs to be reverted. Anything outside the package or `.changeset/` violates FR-006. |
| `publish-preview.yml` didn't fire | Was the CI (`ci.yml`) run on the merge commit successful? The publish workflow triggers on `workflow_run` completion of `CI`. |

---

### Post-publish smoke test (optional but recommended)

Simulate a cluster consumer:

```bash
mkdir /tmp/cockpit-smoke && cd /tmp/cockpit-smoke
npm init -y >/dev/null
npm install @generacy-ai/claude-plugin-cockpit@preview
ls node_modules/@generacy-ai/claude-plugin-cockpit/commands/
# expected: clarify.md merge.md queue.md review.md status.md watch.md
ls node_modules/@generacy-ai/claude-plugin-cockpit/.claude-plugin/
# expected: plugin.json
```

Six command files + `plugin.json` present ⇒ cluster setup can consume the package. SC-003's zero-manual-step outcome is realized once the cluster-setup script (tracked separately in the epic) is updated to install from npm.
