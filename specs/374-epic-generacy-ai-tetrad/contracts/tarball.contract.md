## Contract: packed tarball produced by `pnpm pack`

**Feature**: 374-epic-generacy-ai-tetrad
**Phase**: 1 (design)
**Applies to**: the `.tgz` archive produced by running `pnpm pack` inside `packages/claude-plugin-cockpit/` after the added `package.json` (see [package-json.contract.md](package-json.contract.md)) and the edited `README.md` (see [readme-distribution.contract.md](readme-distribution.contract.md)) are in place.

### Required contents (exact list)

The tarball MUST contain exactly these nine entries (all prefixed `package/` per npm's canonical mangled scope form) and nothing else (FR-007, SC-001):

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

### Verification command

```bash
cd packages/claude-plugin-cockpit
TARBALL=$(pnpm pack 2>/dev/null | tail -1)
# `pnpm pack` prints the tarball path on the last line of stdout.
[ -f "$TARBALL" ] || { echo "tarball not produced"; exit 1; }
ACTUAL=$(tar tzf "$TARBALL" | grep -v '/$' | sort)
EXPECTED=$(cat <<'EOF' | sort
package/package.json
package/README.md
package/.claude-plugin/plugin.json
package/commands/watch.md
package/commands/status.md
package/commands/queue.md
package/commands/clarify.md
package/commands/review.md
package/commands/merge.md
EOF
)
if [ "$ACTUAL" != "$EXPECTED" ]; then
  echo "Tarball contents mismatch."
  echo "--- expected ---"; echo "$EXPECTED"
  echo "--- actual   ---"; echo "$ACTUAL"
  diff <(echo "$EXPECTED") <(echo "$ACTUAL") || true
  exit 1
fi
echo OK
```

`grep -v '/$'` strips directory-only entries (tar records both `package/commands/` and `package/commands/watch.md` on some tar implementations); we compare against the leaf-file list only.

### Forbidden entries

The tarball MUST NOT contain any of the following (non-exhaustive, indicative of failures seen in the monorepo before):

- `.DS_Store`, `._*` (macOS Finder metadata).
- `*.swp`, `*~`, `.*.swp`, `#*#` (editor swap files).
- `node_modules/**`.
- `.git/**`, `.gitignore`.
- `.turbo/**`, `.next/**`, `dist/**`, `build/**`.
- `.pnpm-debug.log`, `npm-debug.log`.
- Any file under `commands/` beyond the six listed (e.g. leftover `plan.md`, `breakdown.md`, `bug.md`, `file.md` from before issue #372).
- Any file at the package root beyond `package.json` and `README.md` (e.g. `tsconfig.json`, `vitest.config.ts`).

### Notes on npm's always-included files

npm always includes `package.json` regardless of the `files` array. `README.md` is listed explicitly in `files` for clarity, though npm would include it anyway. A `LICENSE` file is also always included by npm if present, but the package does not have one (the license is declared via the `license` field only, mirroring the sibling package's approach).

### Relationship to acceptance criteria

- SC-001 (tarball contents match) — this contract is the operational form of SC-001.
- FR-002, FR-007 — the `files` array in `package.json` is the input; this contract is the output.
