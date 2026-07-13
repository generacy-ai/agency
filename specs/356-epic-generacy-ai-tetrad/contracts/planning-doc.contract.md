# Contract: `docs/epic-<slug>-plan.md` skeleton

**Feature**: 356-epic-generacy-ai-tetrad

This codifies the on-disk shape of the planning doc that `/cockpit:plan` writes in the US1 (fresh-scaffold) flow, and the rules `/cockpit:plan` follows when appending in the US2 (assist) flow.

The skeleton is the **acceptance criterion** for FR-003 — any deviation (extra section, missing section, reordered sections) is a contract violation.

## Canonical structure

A freshly written planning doc has exactly the following structure, in this order:

```markdown
# <Epic Title>

**Epic**: <epic-ref>  ·  **Phase**: <phase>  ·  **Tier**: <tier>

## Context

<!-- TODO: Why this epic exists. The problem statement, the prior art, and the user/business impact. -->

## Goals

<!-- TODO: What success looks like. Concrete, measurable outcomes — not implementation tasks. -->

## Non-Goals

<!-- TODO: Explicit out-of-scope statements. What we will NOT do in this epic. -->

## Phases

<!-- TODO: The sequenced phases (P1, P2, …) and what lands in each. Cross-link to child issues / specs. -->

## Ownership / Isolation

<!-- TODO: Per-phase or per-child-issue isolation boundaries — which package, file, or surface each piece owns. -->

## Sequencing & Dependencies

<!-- TODO: Dependency graph between child issues. What blocks what; what can land in parallel. -->

## Risks

<!-- TODO: Known risks, their impact, and the mitigation strategy. -->

## Open Questions

<!-- TODO: Unresolved questions blocking progress; link to any clarification issues / threads. -->
```

## Element-by-element rules

### H1: `# <Epic Title>`

- `<Epic Title>` is the epic's raw `title` from `gh issue view` (per `data-model.md` E2) — written verbatim, **before** any slug-derivation normalization.
- The H1 is the doc's only H1. No additional H1s anywhere.

### Metadata block

A single markdown paragraph immediately under the H1, separated by one blank line.

- Format: `**Epic**: <epic-ref>  ·  **Phase**: <phase>  ·  **Tier**: <tier>`
- The separator is two spaces, a middle dot (`·`), two spaces. Same shape as `spec.md` line 5.
- **Partial rendering**: if any of `phase`, `tier` was not extractable from the epic body, omit that pair entirely. Examples:
  - All three present → `**Epic**: 356  ·  **Phase**: P4  ·  **Tier**: v2-pipeline`
  - Only epic + phase → `**Epic**: 356  ·  **Phase**: P4`
  - Only epic → `**Epic**: 356`
- **Empty rendering**: if `<epic-ref>` itself is somehow unavailable (it MUST always be available — the command exited earlier otherwise), omit the metadata block entirely. In that case, the H1 is directly followed by `## Context` with one blank line between them.
- The metadata block MUST NOT be wrapped in YAML `---` delimiters or HTML comments. Markdown bold + middle-dot only (clarification Q5).

### H2 sections — names, order, count

The skeleton has exactly **eight** H2 sections in this order:

1. `## Context`
2. `## Goals`
3. `## Non-Goals`
4. `## Phases`
5. `## Ownership / Isolation`
6. `## Sequencing & Dependencies`
7. `## Risks`
8. `## Open Questions`

- Names MUST appear verbatim (including the ` / ` separator in `Ownership / Isolation` and the ` & ` in `Sequencing & Dependencies`).
- Order MUST match. The order encodes the recommended reading flow for an epic plan.
- Each section MUST be separated from the previous one by exactly one blank line.

### H2 section bodies (placeholders)

Each H2 in the freshly written skeleton has exactly one body line: an HTML comment placeholder.

- Format: `<!-- TODO: <one-line hint> -->`
- The hint text is provided in the canonical example above and is part of this contract — a developer who clears the placeholder and writes real content has consumed the hint; the next re-run of `/cockpit:plan` finds the section present (regardless of body content) and leaves it alone.
- The placeholder is NEVER re-introduced on re-run. Once removed, it stays removed.

## US2 (append-only) rules

When `/cockpit:plan` runs against an existing doc and the developer confirms `Append` via `AskUserQuestion`:

1. The existing file is read verbatim into memory.
2. A single marker line is appended after the existing content (with exactly one blank line above the marker if the file does not already end with a blank line):

   ```markdown
   <!-- generacy-cockpit:appended -->
   ```

3. For each canonical section in the *missing* list (in canonical order — `data-model.md` E4), the section is appended in the same form as the skeleton: `## <Canonical Name>` followed by a blank line, followed by the same `<!-- TODO: <hint> -->` placeholder used in US1.
4. Sections appended in a single run are separated from each other by one blank line; the block as a whole ends with a single trailing newline.
5. The marker is appended **once per run**, regardless of how many sections are appended. Multiple separate runs each append their own marker line; markers are never deduplicated.
6. No existing byte above the marker may be modified, truncated, or reordered. The append is a strict suffix-extension.

## Append marker

- Literal string: `<!-- generacy-cockpit:appended -->` (no leading/trailing whitespace inside the comment).
- Placed on its own line.
- The marker is a tooling-visible signal: future cockpit verbs MAY scan for it to identify which sections were machine-appended vs. authored by hand. Today, only `/cockpit:plan` writes it; no verb consumes it.
- The marker MUST NOT appear in the skeleton's US1 output. It is appended-flow only.

## Skeleton-comparator invariant

The canonical section list in this contract is the single source of truth for:

- The US1 skeleton's section names and order.
- The US2 comparator's canonical list (`data-model.md` E4).

If the list changes, both the command body and `data-model.md` E4 MUST be updated atomically. A drift between this contract and the comparator would cause the command to mistakenly re-append sections that ARE present (or vice versa).

## Versioning

This contract is at v1. Adding a new canonical H2 section is a breaking change for downstream tooling that pattern-matches the section list — it requires a major bump. Renaming a section to an existing alias (e.g., promoting `Objectives` to canonical) is a cosmetic change; the alias table absorbs the rename without user-visible breakage.
