# Data Model: #445

**Status**: N/A — this feature is documentation-only.

## Scope

This spec introduces no new runtime entities, no new TypeScript types, no new schemas, and no new state. All changes are prose or JSON strings inside three existing files:

- `packages/claude-plugin-cockpit/commands/auto.md` (Markdown frontmatter + new H2 section)
- `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` (one string field: `description`)
- `packages/claude-plugin-cockpit/README.md` (new prose sections)

## Existing entities referenced by the new content

The new prose in `auto.md § Offering auto` and the README sections **describe** behaviors that involve these already-defined entities. Nothing here is new; the pointers exist so the tasks phase can cite the right source-of-truth locations.

| Entity | Defined in | Referenced by the new content |
|--------|------------|-------------------------------|
| `AddExistingIntent`, `FileNewIntent` | `packages/claude-plugin-cockpit/lib/intent-recognition.ts` | README `### Growing scope mid-run` (example only; parsing rules stay in auto.md) |
| G.6 filing gate | `auto.md § Gate contract G.6` | README `### Growing scope mid-run` (mentions G.6 as the safety net for file-new intents) |
| Tracking ref, ledger file, scope | `auto.md § Instructions step 1`, `data-model.md` in prior epics | README quick-start walk-through |
| Issue-list invocation form (Form 4 or equivalent) | Delivered by dependency #444 in `auto.md § Instructions step 1` | auto.md frontmatter, README quick-start, `## Offering auto` guidance |

## Offer-guidance rules (prose invariants, not entities)

The `## Offering auto` section's rules are English-language invariants a session applies, not data structures. Named here for cross-referencing from tasks and reviews:

- **R1 (trigger)**: any 1+ issues successfully filed to the workspace's repo during the current session.
- **R2 (concrete numbers)**: the offer MUST include the resolved issue-number list, never a placeholder.
- **R3 (confirmation-gated)**: the offer MUST be a suggestion the developer confirms; never auto-run.
- **R4 (no re-nag)**: the offer SHOULD fire at most once per batch of filed issues.

These are enforced by the session, not by code. There is nothing to validate at a runtime boundary.
