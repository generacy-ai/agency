# Clarifications

<!-- Batch: 2026-07-07 -->

### Q1: `--yes` flag / gate policy

**Context**: FR-008 (and the Assumptions section) explicitly mark the double-prompt policy as `[NEEDS CLARIFICATION]`. The CLI verb (`packages/generacy/src/cli/commands/cockpit/queue.ts:392`) accepts `--yes` and, when the flag is absent, runs its own interactive confirmation before assigning + labeling. FR-003 mandates the plugin's `AskUserQuestion` gate. If both fire the user is double-prompted; if neither, there is no confirm.

**Question**: Which gate policy should the rewritten `commands/queue.md` implement to avoid double-prompting?

**Options**:
- A: Plugin `AskUserQuestion` is the sole gate. Step 4's Bash invocation becomes `generacy cockpit queue <epic-ref> <phase> --yes` so the CLI's own confirm is suppressed. FR-003 and FR-004 stay as written; FR-005 is amended to include `--yes` in the invocation string.
- B: CLI's own confirm is the sole gate. Drop `--yes` and also remove step 2's `AskUserQuestion` from the command file — only the tokenization gate (FR-002) remains in the plugin. FR-003 and FR-004 (Cancelled message) are removed since no plugin-level cancel path exists.

**Answer**: *Pending*
