# Quickstart: Fused-step verification for `/cockpit:review`

**Feature**: 388-found-during-cockpit-v1

This runbook shows how to (i) understand the change, (ii) verify the change locally with static and behavioral checks, and (iii) troubleshoot the most likely regression patterns.

---

## What changed

`packages/claude-plugin-cockpit/commands/review.md` was restructured to fuse the findings-analysis step and the approval prompt into ONE step. The findings summary and the `AskUserQuestion` invocation now live in the same response by construction.

Before:
```
step 3 (analysis) → response ends → step 5 (AskUserQuestion) → response ends
                     ^^^^^^^^^^^^
                     decay window — sometimes step 5 never fires
```

After:
```
step 3 (analysis + AskUserQuestion in ONE response) → operator answers → step 4/5/6
```

The Terminal Outcome Check block at end-of-file is retained as a **secondary backstop** for post-decision execution (renumbered steps 5–7).

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
# In a Claude Code session with the cockpit plugin installed:
/cockpit:review --gate implementation-review
/cockpit:review --gate spec-review
/cockpit:review --gate clarification-review
/cockpit:review --gate plan-review
/cockpit:review --gate tasks-review
```

Options remain `approve` / `request-changes` / `abort`, in that order. What changes is the **response shape**: the summary and the prompt now arrive together, so you can read the findings and pick an option in the same UI turn.

---

## Verification — static checks

Run these greps against the target file:

```bash
FILE=packages/claude-plugin-cockpit/commands/review.md

# SC-003: fusion rule sentence present exactly once
grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" "$FILE"
# Expected: 1

# SC-004: raw-JSON clause retained (verbatim wording — adjust to match the actual clause text if wording drifted)
grep -n "MUST NOT print raw JSON" "$FILE"
# Expected: exactly one match, positioned INSIDE the fused step (new step 3),
# immediately before the findings-summary table rendering instruction.

# FR-010: Terminal Outcome Check fence markers intact
grep -c "<!-- BEGIN terminal-check -->" "$FILE"
grep -c "<!-- END terminal-check -->" "$FILE"
# Expected: 1 and 1.

# FR-010: marker list preserved
grep -E "Labels:|Feedback posted:|Aborted:" "$FILE"
# Expected: these three markers still referenced by the Terminal Outcome Check block.

# FR-007: Suggested decision line survives
grep -c "Suggested decision:" "$FILE"
# Expected: at least 1 (in the fused step body).
```

Sibling-file non-modification check (FR-011 / C9):

```bash
# From the branch tip, diff siblings against develop
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/merge.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/status.md \
  packages/claude-plugin-cockpit/commands/watch.md
# Expected: empty (no changes).
```

Examples-section check (SC-007 / FR-012 / C7):

```bash
# Read the ## Examples section end-to-end and confirm no example shows a
# turn boundary between analysis and prompt. There is no single-command grep
# for this — it is a targeted read.
awk '/^## Examples/,/^## /' "$FILE" | head -80
```

For each example that touches the fused step, confirm the analysis and the `AskUserQuestion` (or equivalent narration) appear in the same worked response block.

---

## Verification — behavioral check (one replayed transcript)

Per SC-006, run one long-investigation scenario end-to-end and capture the transcript:

1. Open a Claude Code session with the updated cockpit plugin.
2. Reproduce a long-analysis case similar to `christrudelpw/sniplink#3` — i.e., a `/cockpit:review --gate implementation-review` invocation where `/code-review` returns non-trivial findings and requires model reasoning (blocking classification, cross-file reasoning, etc.).
3. Confirm the response that contains the findings-summary table ALSO contains the `AskUserQuestion` tool invocation, in the same turn.

**Failure mode**: if the model presents the findings and ends its turn without invoking `AskUserQuestion`, the fix has not landed. Re-check the static grep for the rule sentence and its position at the head of the fused step.

**Note on epistemics** (per Q9): a single passing transcript is evidence, not proof. Adherence is probabilistic. Continued live usage of `/cockpit:review` across a variety of PRs is the true verifier — the smoke-test pattern that caught tetrad-development#88 findings #24 and #25 in the first place.

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
| Findings summary appears but no `AskUserQuestion` prompt fires | Rule sentence missing from fused-step head, OR fused step split back into two steps | Re-check C.1 (rule sentence exactly once, at the head of step 3). Ensure the shared `AskUserQuestion` invocation is at the tail of the same step. |
| Raw JSON appears in the response body | Retained `MUST NOT print raw JSON` clause is missing or misplaced | Confirm the clause sits INLINE inside the fused step's implementation-review sub-branch, immediately before the table rendering instruction (C.2, FR-006). |
| `AskUserQuestion` `question` field is empty or a placeholder | Digest fallback triggered but digest is malformed | Confirm the digest carries artifact/PR identifier + blocking count + non-blocking count + "see table above" pointer (C.5 fallback). The full prose summary in the response body is still required. |
| Terminal Outcome Check re-invocation loop fires unexpectedly | Post-decision step (advance / feedback-post / abort) did not emit its marker | Check the marker step's exit code and the emission line; the loop's job is to prompt again if no marker was emitted. |
| Grep for the rule sentence returns > 1 | Rule sentence duplicated in the file (an editor split the step or copy-pasted the head) | Reduce to exactly one occurrence at the head of the fused step (AP-4, SC-003). |
| `/code-review` errors, but an `AskUserQuestion` is still invoked | Error path bypassed | Route `/code-review` non-zero exits to Error handling class `OTHER` from within the fused step, WITHOUT invoking the prompt (C.3 error clause, FR-009). |
| Pre-fusion example lingering in `## Examples` | Editor updated the step body but forgot the examples | Update every example touching the fused step to render analysis-and-prompt in the same response block (SC-007, FR-012, AP-8). |

---

## Related documents

- [spec.md](./spec.md) — the specification.
- [clarifications.md](./clarifications.md) — Q1–Q9 with resolved answers.
- [research.md](./research.md) — design decisions and rationale.
- [data-model.md](./data-model.md) — pre/post step layout and invariants.
- [contracts/fused-step.md](./contracts/fused-step.md) — the structural contract.
