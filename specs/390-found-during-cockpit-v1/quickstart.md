# Quickstart: Subagent-boundary code review for `/cockpit:review --gate implementation-review`

**Feature**: 390-found-during-cockpit-v1

This runbook shows how to (i) understand the change, (ii) verify the change locally with static and behavioral checks, and (iii) troubleshoot the most likely regression patterns.

---

## What changed

`packages/claude-plugin-cockpit/commands/review.md`'s fused step 3, sub-branch A (`--gate implementation-review`) was restructured so the code review runs **inside a subagent** (Agent tool, `subagent_type: "general-purpose"`) instead of inline via Claude Code's built-in `/code-review`. The subagent returns findings as a single strict JSON value; the parent parses and renders the summary table + `AskUserQuestion` in the same response, per #388.

`packages/claude-plugin-cockpit/README.md` line 7 was amended to remove the "single documented exception" language for `/code-review` and to state that cross-command composition happens via the subagent boundary.

Before (post-#388):
```
step 3 sub-branch A: Parent invokes /code-review inline
                     → shared context now carries /code-review's terminal contract
                     → parent's own AskUserQuestion contract sometimes loses the race
                     → observed defects: raw JSON printed, gate delayed, operator reads as skipped
```

After (post-#390):
```
step 3 sub-branch A: Parent invokes Agent tool (subagent_type: "general-purpose")
                     → subagent fetches its own diff, verifies findings, returns strict JSON
                     → parent parses, renders table + AskUserQuestion in one response
                     → sub-skill's terminal contract stays in the sub-turn; no collision
```

The Terminal Outcome Check block at end-of-file is unchanged and still covers post-decision execution (steps 5–7).

---

## Installation

No installation step. The change is a documentation edit inside the `claude-plugin-cockpit` package. To pick up the change, install/link the package as you normally would:

```bash
cd /workspaces/agency
pnpm install
pnpm build
```

If the plugin is already installed in your Claude Code session, restart the session (or re-source your plugin config) so the updated playbook is loaded.

---

## Usage — no operator-facing change

The command shape is unchanged:

```bash
/cockpit:review --gate implementation-review
/cockpit:review --gate spec-review
/cockpit:review --gate clarification-review
/cockpit:review --gate plan-review
/cockpit:review --gate tasks-review
```

Options remain `approve` / `request-changes` / `abort`, in that order. What changes is what happens *before* the operator sees the summary + prompt: the review runs in a subagent instead of inline. The visible operator experience — findings-summary table + three-option prompt in one response — is the same shape #388 shipped.

---

## Verification — static checks

Run these greps against the target files:

```bash
REVIEW=packages/claude-plugin-cockpit/commands/review.md
README=packages/claude-plugin-cockpit/README.md

# C1 / SC-002: subagent invocation directive present in sub-branch A
grep -n 'subagent_type: "general-purpose"' "$REVIEW"
# Expected: >= 1 match, located inside step 3 sub-branch A (--gate implementation-review).

# C2 / SC-002: no inline /code-review invocation in the parent's execution path
grep -n "/code-review" "$REVIEW"
# Expected: EITHER zero matches, OR any matches appear ONLY inside a quoted /
#   fenced subagent-prompt block that documents what the sub-turn is instructed
#   to do (NOT an instruction to the parent to invoke /code-review).
# A defensible implementation ships with zero occurrences in review.md.

# C3 / FR-003: return-schema directive verbatim
grep -n "single JSON value" "$REVIEW"
grep -n "file, line, summary, failure_scenario" "$REVIEW"
grep -n '"error"' "$REVIEW"
# Expected: matches present in sub-branch A's subagent-prompt directive.

# C4 / FR-004: parent mapping directive present (four-way branch)
grep -n "zero-findings\|hard-error\|Error handling" "$REVIEW"
# Expected: matches present in sub-branch A, adjacent to the return-schema directive.

# C5 / FR-009: retained MUST NOT print raw JSON clause (#388 defense-in-depth)
grep -c "MUST NOT print raw JSON" "$REVIEW"
# Expected: exactly 1 (unchanged from #388).

# C6 (retained #388): fusion rule sentence exactly once
grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" "$REVIEW"
# Expected: exactly 1 (unchanged from #388).

# C7 (retained #388): Terminal Outcome Check fence markers intact
grep -c "<!-- BEGIN terminal-check -->" "$REVIEW"
grep -c "<!-- END terminal-check -->" "$REVIEW"
# Expected: 1 and 1.

# C8 (retained #388): marker list preserved
grep -E "Labels:|Feedback posted:|Aborted:" "$REVIEW"
# Expected: all three still referenced by the Terminal Outcome Check block.

# C9 / SC-005: README exception phrase removed
grep -c "single documented exception" "$README"
# Expected: exactly 0.

# C9 / SC-005: README replacement wording present (anchor phrase — adjust to match)
grep -n "Cross-command composition\|subagent boundary" "$README"
# Expected: >= 1 match; the amended sentence(s) also reference #390.
grep -n "#390" "$README"
# Expected: >= 1 match in the amended paragraph or immediately adjacent line.
```

Historical-artifact preservation check (SC-006 / C10):

```bash
git diff origin/develop -- specs/372-epic-generacy-ai-tetrad/plan.md
# Expected: empty (zero bytes changed on this branch).
```

Sibling-file non-modification check (FR-007 / C11):

```bash
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/merge.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/status.md \
  packages/claude-plugin-cockpit/commands/watch.md
# Expected: empty (no changes).
```

No-third-prompt-patch check (SC-007 / C12):

```bash
# Diff review of review.md on this branch — new MUST clauses, new checklists,
# new terminal-outcome extensions beyond #384/#388 should be ZERO. Any wording
# change must be either the subagent invocation directive itself, the return-schema
# and parent-mapping directives, or the example-shape update.
git diff origin/develop -- packages/claude-plugin-cockpit/commands/review.md \
  | grep -E "^\+.*(MUST|SHALL|MAY NOT)" | grep -v "MUST NOT print raw JSON"
# Manual read: any added MUST/SHALL line should be part of the subagent-boundary
# contract (invocation directive, return schema, parent mapping), NOT a new
# outer-playbook hedge.
```

Examples-section check (FR-008):

```bash
awk '/^## Examples/,/^## /' "$REVIEW" | head -80
# Read: no example depicts the pre-390 shape (inline /code-review in parent turn).
# The implementation-review example shows the Agent tool call, structured JSON
# return, then findings-summary table + AskUserQuestion in one response.
```

---

## Verification — behavioral check (one replayed transcript)

Per SC-002, run one long-analysis scenario end-to-end and capture the transcript:

1. Open a Claude Code session with the updated cockpit plugin.
2. Reproduce a long-analysis case similar to `christrudelpw/sniplink#4` — i.e., a `/cockpit:review --gate implementation-review` invocation where the PR has non-trivial changes and the review requires beyond-the-diff verification (reading surrounding files, empirical repros).
3. Confirm the parent's response after subagent return contains, in order:
   - The Agent tool call summary (harness-rendered).
   - No free-form prose from inside the sub-turn (the sub-turn's terminal contract ended the sub-turn).
   - No raw JSON restated from the subagent's return (the retained `MUST NOT print raw JSON` clause).
   - The findings-summary table as prose.
   - The `Suggested decision:` line.
   - The `AskUserQuestion` invocation — in the same response as the table.

**Failure mode**: if the parent's response contains any of (a) raw JSON matching the subagent's return schema, (b) free-form review analysis prose from inside the sub-turn, (c) the findings without an `AskUserQuestion` invocation in the same response, the isolation has not landed correctly. Re-check the static greps for the subagent invocation directive and the retained clauses.

**Note on epistemics**: a single passing transcript is evidence, not proof. Adherence is probabilistic — the isolation removes the class of failure by construction, but empirical confirmation across a variety of PRs is the true verifier. Continued live usage on the smoke-test corpus that triggered tetrad-development#88 findings #24, #25, #30 is what closes SC-001.

---

## Available commands (unchanged)

- `/cockpit:review --gate spec-review`
- `/cockpit:review --gate clarification-review`
- `/cockpit:review --gate plan-review`
- `/cockpit:review --gate tasks-review`
- `/cockpit:review --gate implementation-review`

Related (untouched by this change):
- `/cockpit:clarify` — the answering gate.
- `/cockpit:merge`, `/cockpit:queue`, `/cockpit:status`, `/cockpit:watch`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Findings-summary table appears but no `AskUserQuestion` prompt fires | #388 fusion rule sentence removed or sub-branch split back into two steps | Re-verify #388's C1 (fusion rule sentence exactly once at the head of step 3) and #388's C5 (shared `AskUserQuestion` at the tail). Both are retained #388 invariants; #390 does not touch them. |
| Raw JSON appears in the parent's response body | (a) Parent restated the subagent's structured return verbatim (defense-in-depth clause failure), OR (b) subagent violated its return contract (returned prose or fenced JSON), and the parent parsed tolerantly | (a) Confirm the retained `MUST NOT print raw JSON` clause sits inline before the table rendering instruction (C5 / FR-009). (b) Confirm the parent parses strictly and routes unparseable / other-shape returns to Error handling class `OTHER` per C.4 unparseable branch. |
| Free-form review analysis prose appears in the parent's turn | The subagent's terminal contract leaked into the parent's shared context — either the invocation is still inline (no Agent tool boundary) or the subagent was instructed to invoke `/code-review` from inside the sub-turn | Confirm C.1 (Agent tool with `subagent_type: "general-purpose"`) and C.2 (subagent prompt does NOT invoke `/code-review`). AP-1 / AP-8 recurrence. |
| Zero-findings run auto-advances without prompting the operator | AP-5 violation — the parent's `[]` branch skipped `AskUserQuestion` | Confirm C.4's `[]` row: zero-findings STILL invokes `AskUserQuestion` with the empty-row table. Assist mode is preserved. |
| Hard-error return still triggers an `AskUserQuestion` prompt | AP-6 violation — the parent's `{"error":…}` branch did not route to Error handling | Confirm C.4's `{"error":…}` and unparseable rows: both route to Error handling class `OTHER` and do NOT invoke `AskUserQuestion`. |
| Parent inlines `gh pr diff` and embeds the diff in the Agent prompt | AP-7 violation — Q4=B decision ignored | Confirm the subagent prompt passes only the PR reference; the sub-turn fetches its own diff. |
| Agent tool call uses a non-`general-purpose` `subagent_type` (e.g., `code-reviewer`) or has a fallback branch | AP-2 violation — Q2=A decision ignored | Confirm C.1: fixed `general-purpose`, no fallback, no capability probing. `code-reviewer` is not universally shipped and adds nothing the inline prompt doesn't already carry. |
| README still contains "single documented exception" phrase | AP-10 violation — governance amendment not applied | Amend `packages/claude-plugin-cockpit/README.md` per C.6: remove the substring, add the subagent-boundary sentence, reference `#390`. |
| `specs/372-epic-generacy-ai-tetrad/plan.md` was edited on this branch | AP-11 violation — SC-006 / Q1=B failure | `git checkout origin/develop -- specs/372-epic-generacy-ai-tetrad/plan.md` and re-verify empty diff. |
| A sibling cockpit playbook was edited on this branch | AP-12 violation — FR-007 / C11 failure | Restore the sibling from `origin/develop` and re-verify empty diff. |

---

## Related documents

- [spec.md](./spec.md) — the specification.
- [clarifications.md](./clarifications.md) — Q1–Q4 with resolved answers.
- [research.md](./research.md) — design decisions and rationale.
- [data-model.md](./data-model.md) — pre/post sub-branch layout and invariants.
- [contracts/subagent-boundary.md](./contracts/subagent-boundary.md) — the structural contract (invocation, return schema, parent mapping).

Prior features in the same gate-adherence family:
- [specs/384-found-during-cockpit-v1/](../384-found-during-cockpit-v1/) — Terminal Outcome Check (positional guarantee).
- [specs/388-found-during-cockpit-v1/](../388-found-during-cockpit-v1/) — Fused analysis + `AskUserQuestion` (structural guarantee inside the parent turn).
