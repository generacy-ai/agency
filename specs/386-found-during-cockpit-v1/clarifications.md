# Clarifications

## Batch 1 — 2026-07-08

### Q1: Initial-state table origin
**Context**: US2 and FR-005/FR-006 mandate updating an "initial-state table" with a Suggested-next cell and a preserved Child column. However, the current `packages/claude-plugin-cockpit/commands/watch.md` does not emit any such table — step 2 streams CLI stdout and appends a suggestion per line. The Assumptions section says the table is "produced or annotated by the playbook itself (not by the underlying CLI)." Without knowing where this table lives today, US2 cannot be implemented.
**Question**: Where does the initial-state table come from, and what should this spec's implementation assume about producing it?
**Options**:
- A: The table already exists — I've missed it. Point to the file/section that renders it today.
- B: Producing the initial-state table is OUT of scope for #386; a separate feature adds the table, and this spec only mandates the ref-interpolation format when it lands.
- C: Producing the table is IN scope for #386 — extend `watch.md` to fetch initial state (e.g., call `generacy cockpit status <epic-ref>` or similar) and render a table before streaming transitions.

**Answer**: *Pending*

### Q2: How the playbook detects "transition's repo" for the cwd-origin match
**Context**: FR-003 requires the bare `N` form when "the transition's repo matches the session's cwd origin" and `owner/repo#N` otherwise. But the current watch step is a thin pass-through — the playbook doesn't inspect per-line repo metadata today. The spec doesn't say how the playbook obtains the transition's repo or how it obtains the cwd origin for comparison.
**Question**: How should the playbook determine (a) the transition's repo and (b) the cwd origin, and where does the comparison logic live?
**Options**:
- A: The CLI already emits a qualified `owner/repo#N` in every transition line; the playbook parses it and compares to `git config --get remote.origin.url` on the session's cwd. Playbook owns the comparison.
- B: The CLI does the resolution — it emits either the bare form or qualified form pre-decided based on its own cwd/context — and the playbook just uses whatever the CLI provides verbatim. FR-003 becomes a CLI contract, not a playbook rule.
- C: The playbook always emits the qualified `owner/repo#N` (safest default; drops the bare-form optimization for now).

**Answer**: *Pending*

### Q3: What "the ref" refers to per transition line
**Context**: FR-001 and the acceptance criteria show examples like `/cockpit:merge 2` and `/cockpit:review 3 --gate implementation-review`, implying every non-error transition has a single unambiguous ref to interpolate. But transitions may target different subjects — child gates (`waiting-for:clarification` on a child spec), epic-level rollups (`completed:validate` for the epic), or merge readiness (which could be per-child or per-epic).
**Question**: For each row in the verb mapping table (Q1 of the spec: waiting-for:* gates + `completed:validate`/`/cockpit:merge`), which ref should be interpolated — the child ref, the epic ref, or something else?
**Options**:
- A: All gates interpolate the CHILD ref (gates are per-child); `/cockpit:merge` interpolates the CHILD ref (the child PR to merge).
- B: Gates interpolate the CHILD ref; `/cockpit:merge` interpolates the EPIC ref (merge the epic-level rollup PR).
- C: Whatever ref the CLI names on the transition line — the playbook trusts and interpolates it verbatim without knowing whether it's child- or epic-scoped.

**Answer**: *Pending*

### Q4: Verb mapping table placeholder convention
**Context**: FR-004 requires the "Suggested next command" column of the verb mapping table to show the interpolated shape "with a placeholder (e.g. `<ref>`)". The example uses `<ref>`, but the spec text elsewhere uses `<epic-ref>` and `<child-ref>` in different contexts.
**Question**: Which placeholder token should appear in the updated verb mapping table?
**Options**:
- A: `<ref>` — matches the FR-004 example; kept short.
- B: `<child-ref>` — explicit about scope (assumes A's answer to Q3 above).
- C: `N` — bare-number style, matching what typical output actually looks like.

**Answer**: *Pending*

### Q5: Behavior when a non-error transition line lacks a ref
**Context**: FR-007 preserves today's behavior of omitting the ` · suggested: …` segment on error rows. But there may be non-error transition lines that don't carry a ref at all (e.g., "watcher started" banners, epic-level rollup summaries, or format anomalies). The spec doesn't specify behavior for these.
**Question**: When a non-error transition line has no ref to interpolate, what should the playbook emit?
**Options**:
- A: Omit the ` · suggested: …` segment entirely (safest — mirrors error-row behavior).
- B: Emit the verb-only suggestion as today (fallback, preserves the pre-#386 behavior for these edge cases).
- C: This case should not occur — treat as a CLI contract violation and log/warn, then omit the suggestion.

**Answer**: *Pending*
