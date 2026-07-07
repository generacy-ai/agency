# Contract: `commands/watch.md` — required strings after rewrite

**Feature**: 382-found-during-cockpit-v1
**File under contract**: `packages/claude-plugin-cockpit/commands/watch.md`
**Consumers**: The Claude Code harness (reads the file as a slash-command prompt at invocation time), the user (reads the printed suggestion lines).
**Purpose**: Capture the exact rewritten mapping table and confirm which parts of `watch.md` are NOT touched. This file's scope is narrower than the review-command contract — only the mapping table changes.

## §1 Sections unchanged (by exclusion)

The following are preserved byte-for-byte from the current file:

- Frontmatter (`description:` line).
- H1 heading (`# Watch Command`).
- H1 body paragraph.
- Instructions §1 (`$ARGUMENTS` gate + MISSING_BINARY pre-flight).
- Instructions §2 (spawn `generacy cockpit watch $ARGUMENTS`; per-line suggestion lookup).
- Instructions §3 (watcher exit line).
- Instructions §4 (error handling routing).
- The entire `<!-- BEGIN error-conv -->` … `<!-- END error-conv -->` block.

Verification: `git diff --stat packages/claude-plugin-cockpit/commands/watch.md` on the resulting commit MUST show the file modified. `git diff packages/claude-plugin-cockpit/commands/watch.md` MUST show the diff hunks confined to the mapping table (§2 below).

## §2 Mapping table (Instructions §2's lookup table)

Replace the current four-row table:

```markdown
| Transition line contains… | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify` |
| `waiting-for:<gate>-review` | `/cockpit:review --gate <gate>` |
| `completed:validate` or all green checks | `/cockpit:merge` |
| any `error` / `failed` state | (no suggestion) |
```

with the rewritten table (seven rows):

```markdown
| Transition line contains… | Suggested next command |
|---|---|
| `waiting-for:clarification` | `/cockpit:clarify` |
| `waiting-for:spec-review` | `/cockpit:review --gate spec-review` |
| `waiting-for:clarification-review` | `/cockpit:review --gate clarification-review` |
| `waiting-for:plan-review` | `/cockpit:review --gate plan-review` |
| `waiting-for:tasks-review` | `/cockpit:review --gate tasks-review` |
| `waiting-for:implementation-review` | `/cockpit:review --gate implementation-review` |
| `completed:validate` or all green checks | `/cockpit:merge` |
| any `error` / `failed` state | (no suggestion) |
```

Notes:
- **Order matters**: `waiting-for:clarification` is listed BEFORE `waiting-for:clarification-review` so a substring-match-based lookup at runtime does not misfire (`waiting-for:clarification-review` also contains the substring `waiting-for:clarification`; a plain `contains()` lookup that scans top-to-bottom would classify `-review` transitions as answering-gate transitions if the order were reversed). The current file's substring-lookup semantics (per `commands/watch.md:12` — "look up the next verb in the mapping table") is preserved; the rows are ordered to make substring matching resolve correctly.
- No `waiting-for:manual-validation` row: clarification Q5 explicitly excludes it — transitions to that state print without the ` · suggested: …` segment (see current step 2's fallback for error-state rows; extend the same "no suggestion" behavior to `manual-validation` by leaving it absent from the table).
- No substitution-pattern row: five explicit rows replace the pattern `waiting-for:<gate>-review → /cockpit:review --gate <gate>` per Q5. The pattern is a mini parsing DSL — precisely what this rewrite exists to eliminate.

Verification:
- `grep -c "waiting-for:spec-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "waiting-for:clarification-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "waiting-for:plan-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "waiting-for:tasks-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "waiting-for:implementation-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "/cockpit:review --gate spec-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "/cockpit:review --gate implementation-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 1.
- `grep -c "waiting-for:<gate>-review" packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 (the substitution-pattern row is gone).
- `grep -c "\-\-gate impl$\|--gate impl " packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 (no bare `impl` shorthand anywhere).
- `grep -c "waiting-for:clarification" packages/claude-plugin-cockpit/commands/watch.md` MUST report ≥ 2 (the answering-gate row plus the `-review` row match this substring).

## §3 Row ordering rationale (byte-fidelity note)

The row ordering in §2 is not stylistic. The current step 2 says (line 12): "look up the next verb in the mapping table and print `<line> · suggested: <verb>`". A natural implementation of that lookup is a top-to-bottom substring match. Because `waiting-for:clarification` is a proper substring of `waiting-for:clarification-review`, the answering-gate row MUST be listed BEFORE the review-gate row to make a top-to-bottom substring match resolve to the correct verb.

If a future change swaps to a strict token-boundary match, the row ordering becomes cosmetic and could be alphabetized. That change is not part of this fix.

## §4 Removed strings

The following strings from the current file MUST NOT appear in the rewritten file:

| Removed | Why |
|---|---|
| `` `waiting-for:<gate>-review` `` (as a mapping-table row entry) | The substitution pattern that ambiguously implied `impl` vs `implementation` at runtime (spec Summary §1, FR-005). |
| `/cockpit:review --gate <gate>` (as a mapping-table row entry with `<gate>` as a substitution placeholder) | Same reason. |
| Any bare `impl` shorthand in a suggestion string | Wrong CLI vocabulary. |

Verification: `grep -nE 'waiting-for:<gate>-review|--gate <gate>' packages/claude-plugin-cockpit/commands/watch.md` MUST report 0 hits (the substitution pattern is gone).

## §5 Byte-fidelity notes

- ASCII quotes and hyphens throughout. The middle dot `·` in existing output-format strings (`… · suggested: …`) is unchanged from the current file.
- Table syntax uses pipes and hyphens per CommonMark. No smart hyphens or figure dashes.
- The rows in §2 are in the order shown: answering-gate first, then five review rows in `WORKFLOW_LABELS` order (`spec-review`, `clarification-review`, `plan-review`, `tasks-review`, `implementation-review`), then `completed:validate`, then the error-state fallback. The `WORKFLOW_LABELS` order is derived from the CLI's `--help-gates` output (see `/workspaces/generacy/packages/generacy/src/cli/commands/cockpit/gate-vocabulary.ts:44-47`).
