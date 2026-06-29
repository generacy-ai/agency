# Clarifications

## Batch 1 — 2026-06-29

### Q1: Confirmation primitive
**Context**: FR-003/FR-004 require an explicit confirmation gate before invoking the CLI, and Assumption 3 names `AskUserQuestion` as an acceptable primitive but does not commit to it. The choice drives both the implementation (button-driven vs. free-text turn) and the exact semantics of FR-004's "affirmative = explicit yes; any other response aborts" rule. With buttons, the affirmative set collapses to a single click; with free text, the slash command needs an exact accepted-string list.
**Question**: Which primitive should the slash command use for the confirm gate?
**Options**:
- A: `AskUserQuestion` with two options labelled `Confirm` and `Cancel` — affirmative = the `Confirm` option selected; any other selection (including `Cancel` or "Other") aborts.
- B: Free-text prompt — emit the resolved command and a yes/no question, then read the user's next message. Affirmative = `yes` (case-insensitive, trimmed); anything else aborts.
- C: Free-text prompt with a permissive affirmative set (`yes`, `y`, `confirm`, case-insensitive); anything else aborts.

**Answer**: *Pending*

### Q2: Success-output header format
**Context**: FR-006 mandates "a single header line identifying the queued phase" before the fenced CLI output, and SC-002 requires every code path emit "exactly one terse line or one fenced output block." `/cockpit:status` sets the precedent with `**Status:** <epic-ref>`. The exact header text is implementation-visible (it is what the user actually sees) but is not pinned by the spec.
**Question**: What is the literal header line emitted on a successful queue?
**Options**:
- A: `**Queued:** <phase>` — mirrors `/cockpit:status`'s `**Status:** <epic-ref>` convention.
- B: `**Queue:** <phase>` — noun parallel to `**Status:**`.
- C: `**Queued phase:** <phase>` — more explicit.

**Answer**: *Pending*

### Q3: Extra positional arguments
**Context**: FR-002 specifies "a single positional `<phase>` argument" treated opaquely and passed through byte-for-byte; FR-010 covers the zero-arg case. Neither requirement says what to do when the user supplies more than one token (e.g. `/cockpit:queue specify clarify`). The three plausible behaviours differ in whether the slash command, the CLI, or neither rejects the input — and SC-003 ("argument pass-through fidelity") arguably points toward letting the CLI decide.
**Question**: How should the slash command handle `$ARGUMENTS` containing more than one whitespace-separated token?
**Options**:
- A: Reject with `Usage: /cockpit:queue <phase>` and exit non-zero without prompting — strict, matches FR-010's missing-arg behaviour.
- B: Pass the entire `$ARGUMENTS` string through to the CLI verbatim — maximum fidelity; CLI is sole validator (per Assumption 4).
- C: Take only the first token as `<phase>`, silently discard the rest — lenient.

**Answer**: *Pending*

### Q4: Confirmation prompt copy
**Context**: FR-003 requires the confirm prompt to "echo back the resolved command (`generacy cockpit queue <phase>`)" but does not specify the surrounding question or wording. This is the most user-visible string in the command, and its precise wording affects SC-001 (confirmation is mandatory and unambiguous to the user). Answer is partially dependent on Q1 (AskUserQuestion has a `question` field plus option labels; free text is a single emitted line).
**Question**: What is the exact confirmation prompt text shown to the user?
**Options**:
- A: `Run \`generacy cockpit queue <phase>\`?` — single-line question with the resolved command in backticks.
- B: A two-line prompt: line 1 = `About to run: \`generacy cockpit queue <phase>\``, line 2 = `Confirm?`
- C: Other wording — author's discretion, subject only to the FR-003 echo requirement.

**Answer**: *Pending*
