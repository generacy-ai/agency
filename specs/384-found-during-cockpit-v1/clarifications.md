# Clarifications: Fix cockpit review approve path (422 on own PR) and enforce approval gate terminal check

**Issue**: [generacy-ai/agency#384](https://github.com/generacy-ai/agency/issues/384)
**Branch**: `384-found-during-cockpit-v1`

---

## Batch 1 — 2026-07-08

### Q1: Post-Command Check pattern to mirror

**Context**: FR-003 and the Assumptions section say `review.md` MUST end with a Post-Command Check block that "mirrors the pattern used in `clarify.md`" and treats that pattern as canonical. Two clarify.md files live in the tree and neither matches what US2 describes: `packages/claude-plugin-cockpit/commands/clarify.md` (the cockpit playbook, the same file family as `review.md`) has **no** Post-Command Check block at all; `packages/agency-plugin-spec-kit/commands/clarify.md` has one, but it is a workflow-continuation hint (`## Post-Command Check ... If this command was invoked as part of a larger workflow ... proceed to the next task in your todo list`), not a fail-closed terminal-outcome check that loops back to a prior step. The block US2 wants — enumerate three outcomes, return to step 5 if none has occurred — does not yet exist in either file.

**Question**: Which pattern should `review.md`'s new Post-Command Check block mirror?

**Options**:
- A: The spec-kit `clarify.md` continuation-hint shape (a `## Post-Command Check` heading with an IMPORTANT note and numbered list), rewritten to enumerate the three terminal outcomes and instruct return to step 5. In effect: keep the surface shape (heading + IMPORTANT + numbered guidance) but repurpose the content — this is a new pattern, not a literal mirror.
- B: Define a new block shape here (name it something like `## Terminal Outcome Check`) with its own explicit structure — a "one of the following MUST have occurred" list plus a "return to step 5" fail-closed branch. Retroactively adopt this in `clarify.md` in a follow-up.
- C: Mirror the cockpit playbook's existing `<!-- BEGIN error-conv -->` / `<!-- END error-conv -->` fenced-block convention (used for the Error handling section in every command file) so the check is discoverable and greppable across commands.
- D: Something else — please specify.

**Answer**: B, plus option C's greppability — define the new block properly (`## Terminal Outcome Check`: a "exactly one of the following MUST have occurred" list and a fail-closed "if none: return to step 5" branch), and wrap it in fence markers following the existing error-conv convention (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`) so it's discoverable across command files. The spec's "mirror clarify.md" premise was wrong — thanks for checking rather than mirroring a block that doesn't exist. Adopting the same block in `clarify.md` (which has approval-shaped outcomes of its own) is a sensible follow-up, not this fix.

---

### Q2: How the Post-Command Check detects that a terminal outcome occurred

**Context**: US2 AC #2 keys the three outcomes off observable emissions: `(a) approve → step 6 executed and \`Labels:\` line printed; (b) request-changes → step 7's COMMENT review posted; (c) abort → \`Aborted:\` line printed`. Two problems: (i) step 8 of the current `review.md` explicitly says `On \`abort\`, emit no \`Labels:\` line, mutate no state, post no PR review, and exit zero` — no `Aborted:` line is emitted today, so the check would false-negative on every abort unless step 8 is changed; (ii) "step 7's COMMENT review posted" is a side effect, not a text emission — the check needs a detectable signal to key off.

**Question**: What is the detection contract?

**Options**:
- A: Text-emission markers only. Update step 8 to emit a literal `Aborted:` line on abort. Update step 7 to emit a literal `Feedback posted: N inline comment(s) on PR #<n>` line (already required by current step 7). The Post-Command Check verifies that exactly one of `Labels: waiting-for:… → completed:…`, `Feedback posted: …`, or `Aborted:` appeared in the session's own output.
- B: State-check based. The check calls `gh api` or `generacy cockpit status` to verify (a) the gate advanced, (b) a review was posted with `comments[]` non-empty, or (c) neither, in which case it prompts abort. No new text emissions required, but adds CLI/HTTP calls at the end of every session.
- C: Hybrid — text-emission for (a) and (c) via the `Labels:` / new `Aborted:` lines, plus a state check for (b) since posting is a network side effect that could partially fail.
- D: Something else — please specify.

**Answer**: A — text-emission markers only, and step 8 gains the literal `Aborted:` line. The markers aren't decorative: each is emitted by its step only after the real side effect succeeds (`Labels:` on CLI exit 0, `Feedback posted:` after the `gh api` call returns), so verifying the emission verifies the outcome transitively. Option B's end-of-command state probes add network calls to every review and can false-positive on concurrent actors; C buys almost nothing over A once the emissions are side-effect-coupled.

---

### Q3: Multi-credential cluster behavior

**Context**: The Assumptions section reads "Single-credential clusters remain the primary deployment shape; multi-credential clusters are not required to preserve the `APPROVE` event." This can be read two ways with very different implementation shapes: (a) the fix applies uniformly — always emit `event: COMMENT`, and multi-credential clusters simply lose the (semantic-only) `APPROVE` event with no consequence; (b) the fix branches — detect single- vs multi-credential at runtime and emit `COMMENT` only where `APPROVE` would 422. Option (b) requires the playbook to know how to detect cluster shape, which today it has no signal for.

**Question**: Should step 6's event choice be uniform or conditional on cluster shape?

**Options**:
- A: Uniform — always emit `event: COMMENT`, on all clusters. Drop the `APPROVE` event entirely. Rationale: single-credential is the primary shape; multi-credential doesn't gain enforcement from a self-`APPROVE` because approval on your own PR is semantically meaningless on GitHub anyway. Simple, no detection code, aligned with Q2's answer in #382 (body-only is the semantic contract).
- B: Conditional — detect cluster shape (e.g., by checking whether the current `gh` credential authored the PR, or via a cluster-config lookup). Emit `APPROVE` when the reviewer is a distinct account, `COMMENT` otherwise. Rationale: preserve the `APPROVE` event where it is semantically meaningful and GitHub accepts it.
- C: Uniform for v1 (option A), and file a follow-up issue to add multi-credential detection in a later PR if/when a multi-credential cluster ships.
- D: Something else — please specify.

**Answer**: A — uniform `event: COMMENT`, drop APPROVE entirely, with an inline rationale comment in the playbook noting the decision ("self-APPROVE is forbidden by GitHub and semantically empty; revisit if multi-credential reviewer identities ever ship"). Not B: cluster-shape detection for a deployment shape that doesn't exist is speculative machinery. Not C: a tracking issue for the same nonexistent shape is a dead issue — the inline comment travels with the code and surfaces exactly when someone touches this line again.

---

### Q4: Loop-back semantics and retry cap when no terminal outcome is observed

**Context**: US2 AC #3 says "If none has occurred, the command must return to step 5 rather than exiting." Two things are unspecified: (i) the return scope — does "return to step 5" mean re-invoke only step 5's `AskUserQuestion`, or restart the sequence step 5 → 6/7/8? (ii) the loop bound — if the operator repeatedly reaches the check without producing a recognizable outcome (e.g., dismisses `AskUserQuestion` without selecting an option), does the loop run unbounded, cap at N retries and force a specific outcome, or emit a distinct error?

**Question**: What is the exact return-and-retry contract?

**Options**:
- A: Re-invoke step 5 only, unbounded. The findings-summary table from step 3 is re-shown (cached in the session context; no re-invocation of `/code-review`). Trust the operator to eventually select an option; there is no runaway risk because each iteration requires a human action at `AskUserQuestion`.
- B: Re-invoke step 5 only, capped at 3 retries. On the 4th miss, the check emits `Aborted: no terminal outcome after 3 retries` and exits zero. Rationale: bound the loop against Claude misfiring the outcome detection.
- C: Restart from step 3 (re-run `/code-review` and rebuild the table) whenever the check bounces control back. Rationale: the sub-invocation may have been the source of instruction decay; re-establishing state from scratch is safer than trusting cached context. Unbounded.
- D: Something else — please specify.

**Answer**: A — re-invoke step 5 only, unbounded. Every iteration requires a human answer at `AskUserQuestion`, so there is no runaway loop without an operator driving it — and an operator who dismisses the prompt is thinking, not stuck; force-aborting after 3 misses (B) converts hesitation into a silent non-outcome, which is this bug's failure mode wearing a different hat. Not C: re-running `/code-review` re-executes the expensive sub-invocation that caused the decay in the first place; the findings table is rebuilt from session context, and the raw-JSON case is handled upstream per Q5.

---

### Q5: FR-004 — passive reminder or active regression check for raw-JSON findings

**Context**: FR-004 says the block must "restate ... that step-3 findings are presented via the required summary table, never as raw JSON." The observed regression on the live run was that findings printed as raw JSON *from* step 3, meaning the failure happened before the operator ever reached the Post-Command Check. A passive prose reminder inside the check block does not prevent a repeat — the operator has already seen the JSON by the time the check fires. An active detection ("if you rendered raw JSON in step 3, return to step 3") requires the check to introspect its own prior output.

**Question**: What role should FR-004 play?

**Options**:
- A: Passive prose reminder only. The Post-Command Check restates the table-not-JSON rule as documentation for the operator; if step 3 misfired, the operator sees the reminder and re-runs the command manually. No self-introspection.
- B: Active check — the Post-Command Check reads its own prior session output and, if step-3 findings appeared as raw JSON (e.g., a `{"findings":` prefix without the required table), routes control back to step 3 rather than step 5. Bounded (share Q4's retry cap if applied).
- C: Move the enforcement upstream: strengthen step 3's instruction to render the table (e.g., "MUST NOT print raw JSON under any circumstance; if `/code-review` returns JSON, parse and rebuild the table before printing"). Keep FR-004's Post-Command Check text as a passive reminder only.
- D: Something else — please specify.

**Answer**: C — enforce at the point of behavior: strengthen step 3 to "MUST NOT print raw JSON; if `/code-review` returns JSON, parse it and render the required summary table before printing anything else," and keep the check-block mention as a passive reminder. Option B's self-introspection ("read your own prior output and route back") is exactly the English-state-machine meta-machinery this plugin family exists to avoid, and it fires after the operator has already seen the JSON — the harm it prevents is already done.

---
