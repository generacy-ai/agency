# Contract: phase-decomposition doc section grammar

**Feature**: 357-epic-generacy-ai-tetrad
**Consumes**: tetrad-development#790 (decomposition grammar)
**Produced by**: `/cockpit:breakdown` (this command)
**Parsed by**: `generacy cockpit manifest init/sync` (G3.1)

This contract codifies the markdown shape that lives inside the bounded section in the epic doc. The slash command emits this shape; the manifest CLI parses it. If tetrad-development#790's grammar ships differently, this contract must be updated and `breakdown.md` must be updated to match.

## Marker invariant

The section is bounded by these exact byte strings, each on its own line, with no leading or trailing whitespace inside the comment:

```
<!-- cockpit:phase-decomposition:start -->
<!-- cockpit:phase-decomposition:end -->
```

- Markers are section-scoped (not verb-scoped), per clarification Q2 / research D2.
- Variations (different spacing, attributes, casing) MUST NOT be treated as a match. Strict equality only.

## Body grammar (between the markers)

```markdown
<!-- cockpit:phase-decomposition:start -->
## Phase decomposition

### P1 — <Phase title>

<One-sentence phase summary.>

- **<slug>** — <Issue title>. <One-sentence issue summary.>
- **<slug>** — <Issue title>. <One-sentence issue summary.>

### P2 — <Phase title>

<One-sentence phase summary.>

- **<slug>** — <Issue title>. <One-sentence issue summary.>

<!-- cockpit:phase-decomposition:end -->
```

### Required shape

| Element | Shape | Notes |
|---------|-------|-------|
| Section heading | `## Phase decomposition` | Exact text, level `h2`. |
| Phase heading | `### P<n> — <title>` | Level `h3`. `P<n>` MUST start at `P1`, increment sequentially, no gaps. Em-dash `—` (U+2014) between id and title. |
| Phase summary | One paragraph, one sentence | Between the phase heading and the issue list. Optional only if the engine grammar allows; required by this contract for human readability. |
| Issue list | Unordered list (`-`) | Each item is one issue. |
| Issue item | `- **<slug>** — <title>. <summary>` | Bold slug, em-dash, title (period-terminated), one-sentence summary. |

### Identity

- **Phase identity**: the `P<n>` token in the phase heading is the stable phase id. Other tools reference it as-is.
- **Issue identity**: the bolded `<slug>` token at the start of each list item is the issue's identity within this manifest's scope. Slugs follow the parent-epic-doc convention (`A`/`G`/`P` prefix + phase digit + sub-index, e.g., `A4.2`, `G3.1`).

### Forbidden shapes

- HTML comments inside the body (other than the bounding markers themselves).
- Code fences (the section is plain markdown for human reading + engine parsing).
- Nested lists for issues (one flat list per phase).
- Phase headings without a `P<n>` token (e.g., `### Phase 1 — Foo` is NOT valid; must be `### P1 — Foo`).
- Out-of-order or gapped phase ids (e.g., `P1`, `P3` with no `P2`).

## Example: valid section

```markdown
<!-- cockpit:phase-decomposition:start -->
## Phase decomposition

### P1 — Foundations

Land the scaffold and the shared resolver so later phases have a stable substrate.

- **A1.4** — claude-plugin-cockpit scaffold. Plugin.json, marketplace entry, empty commands/ dir.
- **G1.1** — generacy cockpit status. Read-only dashboard CLI verb.

### P2 — Core verbs

Ship the cockpit's read+act verbs: status, watch, clarify, review, merge.

- **A2.1** — /cockpit:watch. Persistent Monitor loop with autonomy policy.
- **A2.2** — /cockpit:status. Render dashboard.
- **A2.3** — /cockpit:clarify. Drive clarification flow.
- **A2.4** — /cockpit:review. Code review + gate advance.
- **A2.5** — /cockpit:merge. Merge with fixer subagent loop.

<!-- cockpit:phase-decomposition:end -->
```

## Example: invalid section (and why)

```markdown
<!-- cockpit:phase-decomposition:start -->
## Phase decomposition

### Phase 1 — Foundations          ← invalid: missing P<n> token
...

### P3 — Skipped                    ← invalid: P2 missing (gapped ids)
...
<!-- cockpit:phase-decomposition:end -->
```

## Re-write semantics

- On re-run, the slash command replaces *everything between* the markers (exclusive of the marker lines themselves) with the freshly rendered body.
- A re-run with an unchanged proposal MUST produce a byte-identical body, so the doc diff is empty (SC-002).
- This implies the slash command's renderer is deterministic: no timestamps, no machine-generated comments, no environment-dependent strings.

## Versioning

- This contract has no explicit version field; the grammar evolves in lockstep with tetrad-development#790. If #790 introduces an incompatible change (e.g., level-4 phase headings), this contract MUST be updated and the slash command's renderer MUST be updated in the same PR.
- Additive extensions (new optional fields the engine learns to parse) MAY ship in #790 ahead of this contract; the slash command keeps emitting the v1 shape until a deliberate update lands here.
