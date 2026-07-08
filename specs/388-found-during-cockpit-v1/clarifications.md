# Clarifications: Fuse cockpit review findings presentation and approval prompt into one turn to close the gate decay window

**Issue**: [generacy-ai/agency#388](https://github.com/generacy-ai/agency/issues/388)
**Branch**: `388-found-during-cockpit-v1`

---

## Batch 1 — 2026-07-08

### Q1: Operator visibility of the summary in the non-oversized case

**Context**: FR-003 puts the findings-summary table inside `AskUserQuestion`'s `question` text; FR-004 only mandates printing the FULL summary as prose in the same response when the digest fallback is triggered. In the normal case, the summary lives ONLY inside the tool call arguments. Whether an operator actually *sees* the `question` text is client-dependent — some clients render the full `question` string, others show only a short chip. If the summary is invisible in some clients, US1's guarantee ("no turn boundary between summary and prompt") is preserved but the summary itself may not be visible to the operator until they interact with the prompt UI — the operator has nothing to reason from before deciding.

**Question**: In the normal (non-oversized) case, MUST the full summary also be printed as prose in the response body immediately before the `AskUserQuestion` call — belt-and-braces, always operator-visible — or is embedding it inside `question` text sufficient?

**Options**:
- A: Always print the summary as prose in the response body immediately before the `AskUserQuestion` call, in every case (normal AND digest-fallback). The `question` field additionally embeds the table (normal) or the digest (fallback). Rationale: uniform response shape across both cases, operator visibility guaranteed regardless of client, and FR-004's fallback rule becomes a special case of the general rule rather than a divergent branch.
- B: Embed in `question` only in the normal case; print as prose only in the digest-fallback case (as FR-004 already specifies). Rationale: avoids duplicating the table in two places when it fits — reduces response verbosity and honors FR-003's literal "MUST embed ... inside its question text" phrasing.
- C: Client-detect and switch — print as prose when the client is known not to surface `question` text, embed only otherwise. Rationale: minimizes duplication where it isn't needed.
- D: Something else — please specify.

**Answer**: A — always print the summary as prose immediately before the `AskUserQuestion` call, both cases. The operator cannot approve what they cannot see, and question-text rendering is client-dependent; A makes visibility unconditional, gives both cases one uniform shape, and turns FR-004's fallback into a special case instead of a divergent branch. The duplication cost is a few hundred characters against the risk of a blind approval.

---

### Q2: Digest fallback trigger threshold and required digest format

**Context**: FR-004 mandates the header + finding-count digest when the summary payload exceeds `AskUserQuestion`'s size budget, and the Assumptions section rough-guides "~4 KB of question text is sufficient for the vast majority of reviews" while explicitly deferring exact limits to tool-runtime concerns. Two open decisions: (i) is the switch trigger a specific character/byte threshold the playbook must state, or is it left to Claude's judgment at runtime? (ii) FR-004 gives an example digest string (`Review of PR #<n>: 7 findings (3 blocking, 4 non-blocking) — see table above`); is this the required literal template or illustrative-only?

**Question**: What is the digest fallback contract — specifically the trigger and the format?

**Options**:
- A: **Trigger = model judgment; format = illustrative.** The playbook states no numeric threshold; Claude uses judgment (rough guide "> ~4 KB" per the Assumptions) to decide. The digest format is illustrative — any string that carries a header (`Review of PR #<n>` or artifact identifier) + blocking/non-blocking counts + a "see table above" pointer is acceptable.
- B: **Trigger = specific numeric threshold; format = literal template.** The playbook states a hard threshold (e.g., "> 4000 characters in the rendered table") and a required literal template (`Review of PR #<n>: N findings (B blocking, NB non-blocking) — see table above`, with `N`/`B`/`NB` interpolated). Rationale: greppable, testable, no drift across implementations.
- C: **Trigger = specific threshold; format = illustrative.** State a numeric threshold (deterministic switch) but let the digest format be operator-facing prose at Claude's discretion.
- D: Something else — please specify.

**Answer**: A — trigger by judgment (with the ~4 KB rough guide), digest format illustrative with required content (artifact/PR identifier + blocking and non-blocking counts + "see table above" pointer). A playbook executor cannot count bytes accurately, so a hard numeric threshold (B/C) states a precision the runtime cannot honor; and with Q1=A the digest is a secondary surface anyway — the full table is always in the prose above.

---

### Q3: Zero-findings and `/code-review`-error edge cases in the fused step

**Context**: The current step 3 handles zero findings by rendering `| (none) | | | |` and emitting `Suggested decision: approve`; it does not specify behavior when `/code-review` itself errors non-zero or emits malformed output. Post-fusion, both edge cases feed into the same rule "summary is delivered AS PART OF the same response that invokes `AskUserQuestion`." Under the fusion rule, the summary must render before the prompt — but there's no summary to render when `/code-review` errored, and there's a trivial one when it returned zero findings.

**Question**: How does the fused step behave in the zero-findings case and in the `/code-review`-error case?

**Options**:
- A: **Zero-findings: still invoke `AskUserQuestion` with the empty-row table (`| (none) | | | |`) inside `question` text, exactly as step 3 renders today.** `/code-review`-error: apply the existing **Error handling** block (class `OTHER`), do NOT invoke `AskUserQuestion` — the fusion rule doesn't apply when there is no analysis result, and Error handling is a legitimate terminal outcome (it exits non-zero, so the Terminal Outcome Check's markers don't apply). Rationale: zero findings is a normal outcome that still needs an operator decision; `/code-review`-error is a hard failure that must not silently prompt.
- B: **Zero-findings: skip `AskUserQuestion` and auto-approve** (advance directly, since the suggested decision is `approve` and there is nothing for the operator to review). `/code-review`-error: apply Error handling as in A.
- C: **Zero-findings: as A.** `/code-review`-error: still invoke `AskUserQuestion` with an error-notice payload in `question` text so the operator can `abort` cleanly. Rationale: keep the terminal outcome inside the fused step's rule; never silently error out.
- D: Something else — please specify.

**Answer**: A — zero findings still invokes the prompt with the empty-row table (assist-mode means the HUMAN approves gates; auto-approve on zero findings is the deferred autonomy policy sneaking in through a side door), and a `/code-review` hard error routes to the existing Error handling block WITHOUT prompting — a decision prompt with no analysis behind it manufactures consent, and Error handling is already a legitimate non-zero terminal outcome.

---

### Q4: Fused-step structure across the two branches (implementation-review vs. artifact-review)

**Context**: The current `review.md` has step 3 (implementation-review branch) and step 4 (artifact-review branch) as parallel branches, both feeding into step 5 (the shared prompt). FR-001 says the fusion applies to "(current step 3 for implementation-review, current step 4 for artifact gates) with the approval-prompt step (current step 5)." FR-005 says "operators experience one uniform gate shape." Two file-shape realizations are consistent with those requirements: (a) ONE new fused step whose body branches internally on `--gate` and ends with the shared `AskUserQuestion` call; (b) TWO separate fused steps (steps 3 and 4 in the new numbering), each with its own rule-sentence header and its own `AskUserQuestion` invocation. Both preserve the "no turn boundary" property; they differ in file structure and diff shape.

**Question**: How should the fusion be realized in `review.md`'s step structure?

**Options**:
- A: **ONE fused step (new step 3)** whose body branches internally on `--gate`: the implementation-review sub-branch produces the findings-summary table and `Suggested decision:` line; the artifact-review sub-branch produces the three-section summary; both sub-branches converge on the shared `AskUserQuestion` invocation at the end of the single fused step. The rule sentence appears ONCE at the head of this step. Steps 6/7/8 renumber to 5/6/7. Rationale: greppable rule (single occurrence), simplest file shape, one place to maintain the fusion.
- B: **TWO fused steps (new step 3 and new step 4)**, each with its own rule-sentence header and its own `AskUserQuestion` invocation. Step 3 handles implementation-review end-to-end (analysis + summary + prompt); step 4 handles the four artifact gates end-to-end (artifact read + three-section summary + prompt). Steps 6/7/8 renumber to 5/6/7 (or preserve current numbers). Rationale: no internal branching within a step, each step is self-contained and easier to read linearly.
- C: **ONE fused step with SC-003's greppable sentence appearing verbatim TWICE** (once per branch), even inside a single-step realization. Rationale: ensures SC-003 still passes if editors later split the branches, and reinforces the rule at both branch entry points.
- D: Something else — please specify.

**Answer**: A — one fused step, one rule sentence, internal `--gate` branching for the analysis half, converging on ONE `AskUserQuestion` spec. Option B duplicates the prompt specification into two copies that can drift apart — the exact disease this plugin family keeps treating; C duplicates the sentence in anticipation of a split we should simply not do.

---

### Q5: Placement of the retained "MUST NOT print raw JSON" clause and the `Suggested decision:` line

**Context**: FR-006 mandates the existing "MUST NOT print raw JSON under any circumstance" clause is retained verbatim. Post-fusion, the natural home for the clause is inside the fused step's implementation-review section (or sub-branch, depending on Q4). Separately, current step 3 emits a `Suggested decision: <approve|request-changes|abort>` line that the operator sees before step 5's `AskUserQuestion` prompt. Post-fusion, the same three options are the labels of the `AskUserQuestion` options — the `Suggested decision:` line becomes an inline hint about which option Claude thinks is right. It's not required by any FR to survive; it's also not required to be removed.

**Question**: Where does the retained raw-JSON clause live, and does the `Suggested decision:` line survive the fusion?

**Options**:
- A: **Raw-JSON clause: inline within the implementation-review section of the fused step**, immediately before the findings-summary table rendering instruction. **`Suggested decision:` line: retained**, printed as part of the pre-prompt prose (belt-and-braces guidance for the operator; the `AskUserQuestion` options carry the same three names but the line names Claude's recommendation explicitly).
- B: **Raw-JSON clause: as A.** **`Suggested decision:` line: removed** — redundant with the `AskUserQuestion` options, and the fusion's spirit is to reduce prompt-surface duplication. The operator picks from the same three names Claude was recommending.
- C: **Raw-JSON clause: kept as a stand-alone bullet at the top of the implementation-review sub-branch, greppable by first line.** **`Suggested decision:` line: retained as A.**
- D: Something else — please specify.

**Answer**: A — the raw-JSON clause sits inline immediately before the table-rendering instruction (enforcement at the point of behavior, the #384 Q5 principle), and the `Suggested decision:` line survives in the pre-prompt prose. It isn't redundant with the options list: the options name the three choices, the line names Claude's recommendation — that's the assist-mode contract (Claude drafts, human decides) rendered explicitly.

---

## Batch 2 — 2026-07-08

### Q6: Scope of files touched by the fusion change

**Context**: The current spec's Summary describes the fix as "fuse steps 3/4 and 5" but does not name a target file, and the rest of `spec.md` is a placeholder (no explicit file list). The natural target is `packages/claude-plugin-cockpit/commands/review.md`, but similar "analysis then prompt" patterns may exist in other cockpit command playbooks (e.g., `clarify.md`, `merge.md`), and the change may or may not require updates to tests, docs, or a CHANGELOG entry. Ambiguity here materially changes the diff surface and the review burden.

**Question**: What is the file scope of this change?

**Options**:
- A: **Scope = `packages/claude-plugin-cockpit/commands/review.md` only**, including its inlined `## Examples` section. No other files are touched. Rationale: matches the prior specify's "All changes are to `packages/claude-plugin-cockpit/commands/review.md` (plus its inlined examples)" note; keeps the diff minimal and reviewable; retroactive fusion of other cockpit commands (per prior spec's Out of Scope) is deferred.
- B: **Scope = review.md + audit other cockpit playbooks** (e.g., `clarify.md`, `merge.md`) for the same "analysis then prompt" pattern and apply the same fusion where it exists. Rationale: fixes the class of bug, not just the instance; avoids the same regression in a sibling playbook.
- C: **Scope = review.md only + a CHANGELOG or docs note** describing the fusion and why the Terminal Outcome Check's role narrowed. Rationale: preserves the design context for future editors who might otherwise revert the fusion during a routine cleanup.
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q7: `## Examples` section update requirement

**Context**: `review.md` includes a `## Examples` section with worked cases demonstrating the current step 3 → step 5 shape (analysis in one response, prompt in the next). Post-fusion, examples that show the pre-fusion shape model an anti-pattern and act as counter-few-shot reinforcement. The prior spec's FR-009 mandated updating all examples to show the fused shape; the current spec is silent on this.

**Question**: Must the `## Examples` section be updated as part of this change?

**Options**:
- A: **All examples touching the fused step MUST be updated** to show analysis-and-prompt in the same response. Rationale: examples act as few-shot reinforcement; leaving pre-fusion examples in place actively teaches the model to violate the rule the fusion is supposed to enforce.
- B: **Only examples that visibly demonstrate the anti-pattern** (i.e., show a turn boundary between analysis and prompt) must be updated. Illustrative examples that don't touch the boundary can be left alone.
- C: **Examples are illustrative-only and updating them is out of scope** for this change; a follow-up may address them.
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q8: Terminal Outcome Check block modifications

**Context**: The Summary says "Keep the Terminal Outcome Check as the secondary backstop (it still covers steps 6-8), but the primary guarantee moves from 'remember at the end' to 'the deliverable IS the prompt.'" It is not clear whether the block itself is edited (rationale comment, coverage scope, its `re-invoke step 5 only` fallback), or kept byte-identical with only its ROLE reinterpreted. The prior spec's FR-008 mandated a rationale-comment update; the current spec is silent.

**Question**: What modifications, if any, are required to the Terminal Outcome Check block?

**Options**:
- A: **Update its rationale comment** to record that step 5's invocation is now structurally guaranteed by the fusion and that the block's scope is post-decision execution (steps 6-8). Preserve fence markers (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`), the marker list (`Labels:` / `Feedback posted:` / `Aborted:`), and the step-5-only fallback. Rationale: documents the layering so future editors don't conflate the two guarantees; keeps behavior unchanged.
- B: **Keep the block byte-identical** with #384's shipped version; no edits, only reinterpret its role in the surrounding prose. Rationale: minimal diff surface; if the block still functions correctly, don't touch it.
- C: **Update the rationale AND narrow the fallback** — remove the step-5-only re-invocation fallback (which the fusion now makes structurally impossible to need). Rationale: the fallback was a workaround for the exact failure mode the fusion eliminates; dead code invites confusion.
- D: Something else — please specify.

**Answer**: *Pending*

---

### Q9: Success verification method

**Context**: The failure mode is behavioral (a skipped gate under long-investigation conditions), so verification could be static (grep for the rule sentence + fence-marker preservation), behavioral (replay the sniplink#3 scenario and inspect the transcript), or both. The current spec has placeholder Success Criteria; the prior spec's SC-001/SC-002 mandated transcript-inspection replays and SC-003/SC-004 mandated static checks. Whether verification is a static check, a replay, or both determines what evidence the implementer must attach.

**Question**: How is the fix verified?

**Options**:
- A: **Both static AND behavioral**: (i) `grep -n 'protocol violation' packages/claude-plugin-cockpit/commands/review.md` returns the fused-step rule sentence, fence markers intact, no raw-JSON emissions across a replay; (ii) a replay of the sniplink#3-like scenario ends with the `AskUserQuestion` tool call in the same response as the summary table. Rationale: static covers "the source is right," behavioral covers "the source produces the right transcript" — belt-and-braces.
- B: **Static only**: if the file has the rule sentence, the fused-step shape, the retained raw-JSON clause, and preserved Terminal Outcome Check fence markers, the fix is in place. Behavioral replay is validation, not verification. Rationale: this is a source-side structural fix; if the source is right, the behavior follows by construction.
- C: **Behavioral only**: the guarantee is behavioral. Attach a transcript showing the sniplink#3 scenario ending with the tool call in the same response. Rationale: static grep can pass while transcripts still fail; the load-bearing evidence is the transcript.
- D: Something else — please specify.

**Answer**: *Pending*
