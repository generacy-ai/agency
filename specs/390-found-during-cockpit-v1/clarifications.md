# Clarifications: Isolate implementation-review's `/code-review` invocation in a subagent

## Batch 1 — 2026-07-08

### Q1: Plan-doc amendment target
**Context**: FR-005 / SC-005 require amending "the plan doc's §self-contained commands principle" to remove the "except built-in `/code-review`" exception. The exception language currently appears in two places: (a) the completed epic plan at `specs/372-epic-generacy-ai-tetrad/plan.md` (marked Status: Complete, historical), and (b) the live playbook `packages/claude-plugin-cockpit/commands/review.md` (which FR-001 already edits). No single canonical "plan doc" is named in the spec. This blocks FR-005 execution because the target file cannot be located deterministically.
**Question**: Which file(s) receive the §self-contained commands amendment for FR-005?
**Options**:
- A: `specs/372-epic-generacy-ai-tetrad/plan.md` only — amend the historical epic's plan doc in place (retroactive edit of a `Status: Complete` artifact).
- B: `packages/claude-plugin-cockpit/README.md` only — treat the plugin README as the live governance surface and remove the exception there; leave the 372 plan doc unchanged.
- C: Both `specs/372-epic-generacy-ai-tetrad/plan.md` and the plan.md that this feature (`specs/390-…`) will produce — historical archive + forward record.
- D: A new location (please specify path in the answer).

**Answer**: *Pending*

### Q2: Agent-type selection strategy in `review.md`
**Context**: FR-001 says the playbook should invoke the review "using the `code-reviewer` agent type if available and a general agent with an inline review prompt otherwise". `review.md` is static markdown executed in the model's turn; there is no runtime capability check the playbook can perform before choosing an agent type. The phrasing "if available … otherwise" is ambiguous when it must be encoded as deterministic playbook prose.
**Question**: How should the "if `code-reviewer` available else general" rule be expressed in `review.md`?
**Options**:
- A: Always use a single fixed agent type — no branching in the playbook. Pick one now (which one — `code-reviewer` or `general-purpose`?) and drop the fallback path entirely.
- B: Instruct the model to prefer `code-reviewer` and fall back to `general-purpose` if the first Agent call errors with an unknown-agent-type error (behavioral fallback, one attempt at a time).
- C: Instruct the model to inspect the available-agents list in its own system reminders and pick `code-reviewer` if listed, else `general-purpose`, before making any Agent call.

**Answer**: *Pending*

### Q3: Findings return format from subagent to parent
**Context**: FR-002 pins the schema `{file, line, summary, failure_scenario}`, and FR-004 says zero-findings and hard-error paths must map onto the existing #388 branches. But the Agent tool returns a single free-form string message — the spec does not fix HOW the subagent formats that message so the parent can (a) recognize findings vs. zero-findings vs. error and (b) parse individual finding rows for the summary table. This is a load-bearing protocol contract; without it the parent's post-subagent step is not implementable as a "pure format transform" (per US2 acceptance criterion).
**Question**: What is the required shape of the subagent's return message?
**Options**:
- A: The entire return message is a single JSON array (findings), or an empty array `[]` for zero findings; any non-JSON message is treated as a hard error.
- B: The return message is prose ending with a single fenced ` ```json … ``` ` code block containing the array (or `[]` for zero findings); absence of the fenced block ⇒ hard error.
- C: The return message is free-form prose; the parent extracts findings by regex/heuristic against the schema field names. Absence of parseable findings ⇒ treat as zero findings; a subagent-emitted `ERROR:` prefix ⇒ hard error.
- D: A specific delimiter/marker convention (please specify in the answer).

**Answer**: *Pending*

### Q4: PR diff acquisition — parent-inlines vs. subagent-fetches
**Context**: FR-002 says the subagent's prompt "specifies the review scope (target PR + diff)". Two implementations satisfy this literally: (i) the parent runs `gh pr diff <n>` first and embeds the diff text inline in the subagent prompt, or (ii) the parent passes only the PR reference (`owner/repo#n`) and the subagent runs its own `gh pr diff`. These differ in reliability (subagent tool availability, prompt-size limits, one round-trip vs. two) and in whether the subagent needs Bash/gh access.
**Question**: How does the subagent obtain the PR diff?
**Options**:
- A: Parent fetches the diff via `gh pr diff <owner>/<repo>#<n>` and inlines the diff text inside the Agent-tool prompt. Subagent receives the diff as literal text; needs no `gh` access. Cost: larger prompt payload; parent must handle large diffs.
- B: Parent passes only the PR reference and instructs the subagent to fetch the diff itself via `gh pr diff`. Subagent needs Bash + `gh` access in its tool set. Cost: extra hop; failure surface on the subagent side.
- C: Parent inlines the diff by default (option A), but falls back to option B when the diff exceeds a size threshold (specify threshold in the answer).

**Answer**: *Pending*
