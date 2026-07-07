# Clarifications

<!-- Batch: 2026-07-07 -->

### Q1: `--yes` flag / gate policy

**Context**: FR-008 (and the Assumptions section) explicitly mark the double-prompt policy as `[NEEDS CLARIFICATION]`. The CLI verb (`packages/generacy/src/cli/commands/cockpit/queue.ts:392`) accepts `--yes` and, when the flag is absent, runs its own interactive confirmation before assigning + labeling. FR-003 mandates the plugin's `AskUserQuestion` gate. If both fire the user is double-prompted; if neither, there is no confirm.

**Question**: Which gate policy should the rewritten `commands/queue.md` implement to avoid double-prompting?

**Options**:
- A: Plugin `AskUserQuestion` is the sole gate. Step 4's Bash invocation becomes `generacy cockpit queue <epic-ref> <phase> --yes` so the CLI's own confirm is suppressed. FR-003 and FR-004 stay as written; FR-005 is amended to include `--yes` in the invocation string.
- B: CLI's own confirm is the sole gate. Drop `--yes` and also remove step 2's `AskUserQuestion` from the command file — only the tokenization gate (FR-002) remains in the plugin. FR-003 and FR-004 (Cancelled message) are removed since no plugin-level cancel path exists.

**Answer**: **A** — Plugin `AskUserQuestion` is the sole gate; step 4's Bash invocation becomes `generacy cockpit queue <epic-ref> <phase> --yes`. Rationale: the plugin runs the CLI through Claude Code's Bash tool, which is non-interactive and has no TTY, so the CLI's stdin confirmation cannot function there (option B is unworkable in that environment). The CLI's own confirm remains correct for humans invoking the verb directly; `--yes` exists precisely for programmatic callers that provide their own gate, which is what the plugin is. Wording note (in scope for this fix): with `--yes`, the confirm fires on intent rather than on a resolved preview of exactly which issues get assigned/labeled — the `AskUserQuestion` text should therefore state the *action* plainly (e.g. "assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add `process:speckit-feature`") rather than only echoing the argv. A true preview-then-confirm would require a `--dry-run` mode on the CLI verb (a generacy enhancement, out of scope for this agency-only issue).
