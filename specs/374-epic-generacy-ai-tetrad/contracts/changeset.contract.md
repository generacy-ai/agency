## Contract: `.changeset/<slug>.md`

**Feature**: 374-epic-generacy-ai-tetrad
**Phase**: 1 (design)
**Applies to**: exactly one new file added under `.changeset/` by this feature.

### Required shape

The file MUST have the following structure (Changesets v2 format):

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

<one-to-three-line changelog summary>
```

### Required rules

| # | Rule | Source | Verification |
|---|------|--------|--------------|
| 1 | Exactly one new file is added under `.changeset/` on the branch, matching `.changeset/*.md` and not named `README.md`. | FR-005, SC-004 | `git diff --name-only --diff-filter=A develop... -- .changeset/` returns exactly one path, matching `.changeset/.+\.md$` and `basename != README.md`. |
| 2 | The frontmatter contains exactly one bump line referencing `"@generacy-ai/claude-plugin-cockpit"`. | FR-005 | `grep -c '"@generacy-ai/claude-plugin-cockpit"' <changeset>` equals `1`. |
| 3 | The bump type is `minor`. | FR-005 (Q1 answer A) | The frontmatter line MUST match `"@generacy-ai/claude-plugin-cockpit": minor` (exact string, single space after colon). |
| 4 | The changeset frontmatter does NOT reference any other package. | FR-006 (isolation) | `grep -E '":\s*(patch\|minor\|major)' <changeset> \| wc -l` equals `1`. |
| 5 | The body (post-frontmatter) is non-empty and describes the addition. | FR-005 (audit trail) | The file has at least one non-blank line after the second `---`. |
| 6 | The filename slug is kebab-case and does not collide with an existing `.changeset/*.md`. | Changesets convention | `git ls-files .changeset/*.md` before this feature returns zero matches (verified against `develop`); the added file is a fresh slug. |

### Forbidden

- Multiple bump lines in the frontmatter — the addition is isolated to a single package.
- Non-`minor` bumps — `major` claims stability not yet earned; `patch` combined with `version: "0.0.0"` would produce `0.0.1`, contradicting FR-005.
- References to any other `@generacy-ai/*` package.

### Interaction with `publish-preview.yml`

- The workflow's line 32 (`find .changeset -name '*.md' ! -name 'README.md'`) will detect this file and skip the synthetic-changeset fallback (lines 36-50).
- `pnpm changeset version --snapshot preview` (line 86) applies the `minor` bump to `package.json`'s `version: "0.0.0"`, producing base `0.1.0`, then appends a snapshot suffix.
- `pnpm changeset publish --tag preview --provenance` (line 87) publishes the resulting version to npm under dist-tag `preview`.

### Example (illustrative — actual body wording is not fixed)

```markdown
---
"@generacy-ai/claude-plugin-cockpit": minor
---

Publish claude-plugin-cockpit as @generacy-ai/claude-plugin-cockpit so cluster
setup can deliver /cockpit:* via npm without a manual extraKnownMarketplaces step.
```

### One-shot verification command

```bash
NEW_FILES=$(git diff --name-only --diff-filter=A develop... -- .changeset/ | grep -Ev '(^|/)README\.md$' || true)
COUNT=$(echo "$NEW_FILES" | grep -c '^\.changeset/.*\.md$' || true)
[ "$COUNT" = "1" ] || { echo "expected exactly 1 new changeset, got $COUNT"; exit 1; }
FILE="$NEW_FILES"
grep -qE '^"@generacy-ai/claude-plugin-cockpit": minor$' "$FILE" || { echo "bump line missing/wrong in $FILE"; exit 1; }
LINES=$(grep -cE '":\s*(patch|minor|major)' "$FILE")
[ "$LINES" = "1" ] || { echo "expected exactly 1 bump line, got $LINES"; exit 1; }
BODY=$(awk '/^---$/{c++; next} c==2 && NF' "$FILE" | head -1)
[ -n "$BODY" ] || { echo "changeset body is empty"; exit 1; }
echo OK
```

Exit code `0` and stdout `OK` ⇒ the contract holds.
