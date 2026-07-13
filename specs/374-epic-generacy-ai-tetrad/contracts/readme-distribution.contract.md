## Contract: `packages/claude-plugin-cockpit/README.md` — "Distribution" section

**Feature**: 374-epic-generacy-ai-tetrad
**Phase**: 1 (design)
**Applies to**: `packages/claude-plugin-cockpit/README.md` (edited by this feature).

### Preservation rules (existing content)

The following sections MUST remain present, with their content byte-identical to `develop`:

1. H1 title `# cockpit`.
2. `## Overview` — the paragraph describing `/cockpit:*` namespace, six assist-mode commands, and lack of `specs/**` / autonomy-policy dependencies.
3. `## Installation` — the marketplace instructions (`extraKnownMarketplaces: ["generacy-ai/agency"]`) and the runtime-dependency block for `generacy` CLI and `gh` CLI. This section is preserved for standalone / non-cluster users (Q4 rationale — npm delivery adds a rail, does not replace one).
4. `## Available Commands` — the six-row table.
5. `## Error Handling` — the canonical three-class block (`MISSING_BINARY` / `AUTH_FAILURE` / `OTHER`) inherited from issue #372.
6. `## Related` — the two-item bullet list.
7. `## License` — the `MIT` line (a follow-up may reconcile this with `package.json`'s `Apache-2.0`; that reconciliation is **out of scope** for this feature).

### Additive change — "Distribution" section

**Location**: The new `## Distribution` H2 MUST be inserted between the existing `## Installation` section and the existing `## Available Commands` section. (Rationale: distribution is a peer of installation and belongs adjacent to it.)

**Required content elements** (all four MUST be present in the section body; wording is not fixed):

| # | Element | Notes |
|---|---------|-------|
| 1 | Names the published package coordinate `@generacy-ai/claude-plugin-cockpit`. | Must match the `name` field in Entity 1. |
| 2 | States that the package is available on the `preview` dist-tag from post-merge publishes on `develop`, and (implicitly, once promoted) `latest` for stable releases. | Aligns with `publish-preview.yml` behavior. |
| 3 | Documents that cluster setup consumes the package automatically — no manual `extraKnownMarketplaces` edit is required in cluster-managed environments. | This is the core outcome of the feature (SC-003). |
| 4 | Explicitly notes that the manual `extraKnownMarketplaces` marketplace path documented in `## Installation` above remains valid for standalone / non-cluster users. | Q4 clarification — npm does not replace the marketplace path. |

### Forbidden changes

- MUST NOT delete or reword any content in the sections listed under "Preservation rules".
- MUST NOT introduce additional H2 headings beyond `## Distribution`.
- MUST NOT reference feature branches, `specs/**` paths, or issue numbers in the section body — the README is user-facing docs, not epic-scoped.

### Structural rules

- File remains a single Markdown document (no split into multiple files).
- New section MUST be renderable as CommonMark (no unclosed code fences, no orphaned list items).
- File MUST end with a trailing newline (matches sibling packages and repo hygiene).

### Verification checklist

```bash
README="packages/claude-plugin-cockpit/README.md"
# Preservation checks
grep -q '^# cockpit$' "$README" || { echo "H1 missing"; exit 1; }
grep -q '^## Overview$' "$README" || { echo "Overview missing"; exit 1; }
grep -q '^## Installation$' "$README" || { echo "Installation missing"; exit 1; }
grep -q '^## Available Commands$' "$README" || { echo "Available Commands missing"; exit 1; }
grep -q '^## Error Handling$' "$README" || { echo "Error Handling missing"; exit 1; }
grep -q '^## Related$' "$README" || { echo "Related missing"; exit 1; }
grep -q '^## License$' "$README" || { echo "License missing"; exit 1; }
grep -q 'extraKnownMarketplaces' "$README" || { echo "marketplace instructions missing"; exit 1; }
# Additive check
grep -q '^## Distribution$' "$README" || { echo "Distribution section missing"; exit 1; }
grep -q '@generacy-ai/claude-plugin-cockpit' "$README" || { echo "npm package coordinate missing"; exit 1; }
echo OK
```

### Relationship to acceptance criteria

- SC-003 (no manual step in documented install path) — verified by (1) the presence of the "Distribution" section documenting the zero-step cluster path AND (2) preservation of the existing marketplace instructions for non-cluster users.
- FR-006 (isolation, as amended by Q4) — the only files changed on the merge commit are `package.json` (added), `README.md` (edited to add this section), and one `.changeset/*.md` (added).
