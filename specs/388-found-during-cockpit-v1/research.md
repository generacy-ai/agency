# Research: Fuse cockpit review findings presentation and approval prompt

**Feature**: 388-found-during-cockpit-v1
**Date**: 2026-07-08

This document restates the decisions taken in `clarifications.md` as design conclusions, records the alternatives considered, and captures the sources of evidence that motivated the fix.

---

## R1. Primary problem statement

**Decision**: The approval gate in `/cockpit:review` is currently *positional* — a "remember at the end" Terminal Outcome Check text block at the end of the playbook. Positional guarantees fail exactly when they are needed most: long step-3 analyses (git merge-tree conflict investigations, deep `/code-review` follow-ups) push the block out of the model's near-context, and the block is not re-read before the model ends its turn. Move the guarantee to *structural*: the findings summary and the `AskUserQuestion` invocation live in the same response by construction.

**Rationale**: Live evidence — two separate skipped-gate incidents:
- generacy-ai/tetrad-development#88 finding #16 (motivated #384's Terminal Outcome Check).
- generacy-ai/tetrad-development#88 finding #25, 2026-07-08 (`christrudelpw/sniplink#3` re-review session) — the same session had previously executed approve and request-changes flows correctly with #384's fixes deployed. Long step-3 analyses correlated with the skip; short-analysis runs adhered.

**Alternatives rejected**:
- **Add more end-of-file reminders**: More passive text at the tail is defeated by the same instruction-decay pathway.
- **Introduce a runtime probe** (`gh api`, `generacy cockpit status`) to detect the missing prompt: adds a network hop and doesn't fix source. Explicitly out of scope (spec.md § Out of Scope).
- **Reword the existing Terminal Outcome Check to be more emphatic**: same class of positional fix; addresses tone, not structure.

**Sources**:
- generacy-ai/tetrad-development#88 findings #16, #24, #25.
- agency#384 (Terminal Outcome Check as previous positional fix).
- `christrudelpw/sniplink#3` re-review session transcript (2026-07-08).

---

## R2. Where to place the fusion

**Decision (Q4=A)**: ONE fused step (new step 3) whose body branches internally on `--gate`. The implementation-review sub-branch produces the findings-summary table + `Suggested decision:` line. The artifact-review sub-branch produces the three-section summary. Both sub-branches converge on ONE shared `AskUserQuestion` invocation at the end. The fusion rule sentence appears ONCE at the head of the fused step.

**Rationale**: Duplicating the prompt spec (Option B — two fused steps) creates two copies that drift apart — the exact anti-pattern this plugin family keeps re-treating. Duplicating the rule sentence (Option C) anticipates a split we should simply not do.

**Alternatives rejected**:
- **B: Two fused steps, one per gate class.** Rejected: prompt spec duplication.
- **C: One fused step, but the rule sentence appears twice.** Rejected: intentionally duplicating text as insurance-against-future-split is a design smell.

---

## R3. Response shape — where does the summary live?

**Decision (Q1=A)**: Always print the summary as prose in the response body immediately before the `AskUserQuestion` call, in every non-error case (normal AND digest-fallback). The `question` field additionally embeds the table (normal) or the digest (fallback).

**Rationale**: `AskUserQuestion` clients differ in how they render `question` text — some show a short chip only. Making the summary visible as prose sidesteps client-render variance and gives both cases (normal and digest-fallback) one uniform response shape. FR-004 becomes a special case of FR-003, not a divergent branch.

**Alternatives rejected**:
- **B: Embed in `question` only in the normal case; prose only in fallback.** Rejected: an operator cannot approve what they cannot see.
- **C: Client-detect and switch.** Rejected: playbook cannot reliably detect the client, and the duplication cost (a few hundred characters) is trivial next to the risk of a blind approval.

---

## R4. Digest fallback trigger and format

**Decision (Q2=A)**: Trigger by model judgment (with the ~4 KB rough guide from Assumptions); digest format is illustrative with **required content elements**: artifact/PR identifier + blocking count + non-blocking count + a "see table above" pointer.

**Rationale**: A playbook executor cannot count bytes accurately. Stating a hard numeric threshold (Options B or C) would claim a precision the runtime cannot honor. With R3's decision (Q1=A), the digest is a secondary surface — the full table is always in the prose above — so exact format is less critical than the content elements.

**Alternatives rejected**:
- **B: Hard numeric threshold + literal template.** Rejected: precision mismatch with runtime.
- **C: Hard threshold, illustrative format.** Rejected: same precision-mismatch problem for the trigger half.

---

## R5. Edge cases

**Decision (Q3=A)**:
- **Zero findings**: still invoke `AskUserQuestion` with the empty-row table (`| (none) | | | |`) inside `question` text, exactly as current step 3 renders today. The `Suggested decision:` line will read `approve`.
- **`/code-review` hard error**: route to the existing **Error handling** block (class `OTHER`); do NOT invoke `AskUserQuestion`. The fusion rule does not apply when there is no analysis result.

**Rationale**: Assist-mode (cockpit v1) means the human approves gates. Auto-approving zero findings would smuggle in the deferred autonomy policy. A decision prompt with no analysis behind it manufactures consent — Error handling is a legitimate non-zero terminal outcome (Terminal Outcome Check's markers don't apply to that exit path).

**Alternatives rejected**:
- **B: Auto-approve zero findings.** Rejected: policy change, out of scope.
- **C: Prompt on error with an error-notice payload.** Rejected: manufactures consent from an empty analysis.

---

## R6. Placement of retained text

**Decision (Q5=A)**:
- The `MUST NOT print raw JSON under any circumstance` clause is retained VERBATIM, placed INLINE within the implementation-review section of the fused step, IMMEDIATELY BEFORE the findings-summary table rendering instruction.
- The `Suggested decision: <approve|request-changes|abort>` line is RETAINED in the pre-prompt prose, alongside the `AskUserQuestion` options.

**Rationale**: Enforcement at the point of behavior (the #384 Q5 principle). The `Suggested decision:` line names Claude's recommendation; the `AskUserQuestion` options name the three choices — that's the assist-mode contract (Claude drafts, human decides) rendered explicitly. Not redundant.

**Alternatives rejected**:
- **B: Remove `Suggested decision:` line.** Rejected: names the recommendation, not the choices.
- **C: Raw-JSON clause as stand-alone bullet.** Rejected: distant preambles are what led to the observed defect.

---

## R7. File scope

**Decision (Q6=A, amended)**: Scope is `packages/claude-plugin-cockpit/commands/review.md` only, including its inlined `## Examples` section. The PR description records a one-line assessment of siblings:
- `clarify.md`: prompts are per-item and immediately follow each draft (no analysis-then-prompt boundary to fuse).
- `merge.md`, `queue.md`: no analysis phase preceding their gates.

**Rationale**: Answers the "fix the class, not the instance" concern (Option B) without inflating a bugfix into a three-playbook refactor. If the sibling assessment turns out wrong in practice, that's a new observed defect and a new issue.

**Alternatives rejected**:
- **B: Audit and fuse all cockpit playbooks.** Rejected: sibling assessment shows no analysis-then-prompt boundary exists in them; expanding scope invites regressions in files unrelated to the observed defect.
- **C: review.md + CHANGELOG note.** Rejected: no CHANGELOG in this package; the design context lives in this speckit directory and the PR body.

---

## R8. Examples-section update

**Decision (Q7=A)**: Every example in `## Examples` that touches the fused step MUST be updated to show analysis-and-prompt in the same response.

**Rationale**: Examples in a playbook are few-shot reinforcement. A pre-fusion example is a worked demonstration of the exact violation this fix exists to prevent, sitting in the model's context every run. Option B's narrower filter is illusory: any example of the old shape IS the anti-pattern.

**Alternatives rejected**:
- **B: Only visible-anti-pattern examples updated.** Rejected: the entire pre-fusion shape is the anti-pattern.
- **C: Examples out of scope.** Rejected: leaving them is actively worse than the pre-fix state.

---

## R9. Terminal Outcome Check block modifications

**Decision (Q8=A)**: Update the rationale comment to record the new layering (fusion structurally guarantees REACHING the prompt; Terminal Outcome Check backstops EXECUTING the operator's decision across steps 6-8 → post-renumber 5-7). Preserve fence markers (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`), the marker list (`Labels:` / `Feedback posted:` / `Aborted:`), and the step-5-only re-invocation fallback (renamed if steps renumber).

**Rationale**: The fallback is NOT dead code. The fusion closes the decay window BEFORE the prompt, but a model can still stall between the operator's answer and the advance/post/abort execution — re-invoking the prompt step is the correct recovery there. Removing it would reopen a window we know how to cover.

**Alternatives rejected**:
- **B: Keep block byte-identical.** Rejected: leaves the rationale comment misleading about which failure mode is covered.
- **C: Remove step-5-only fallback.** Rejected: incorrectly assumes the fallback was covering the pre-fusion decay window only.

---

## R10. Verification method

**Decision (Q9=A)**: Both static AND behavioral, with an honest epistemic note:
- **Static** (necessary but proven insufficient by this very bug — #384's text was present while behavior failed): rule sentence present at exactly one location, fence markers intact, no pre-fusion examples remain, `MUST NOT print raw JSON` clause verbatim and correctly placed, `Suggested decision:` line retained.
- **Behavioral**: one replayed long-investigation transcript (a sniplink#3-like scenario) ends with the `AskUserQuestion` call in the same response as the summary table. Evidence, not proof — adherence is probabilistic.
- **True verifier**: continued live usage of `/cockpit:review`, per the smoke-test pattern that caught both occurrences.

**Rationale**: The failure mode is behavioral, so static-only is not sufficient. The load-bearing evidence is the transcript, but a single transcript is not proof. Being honest about that in the criteria avoids over-claiming.

**Alternatives rejected**:
- **B: Static only.** Rejected: proven insufficient by #384's history.
- **C: Behavioral only.** Rejected: static grep is a cheap first line of defense; skipping it invites drift.

---

## Implementation patterns

- **Structural gate over positional guarantee**: the pattern generalizes — when a positional "remember at the end" rule fails under instruction decay, restructure so the deliverable IS the guarantee. This project has now applied the pattern twice (#384 introduced the positional guarantee; #388 promotes it to structural).
- **Enforcement at the point of behavior**: retained clauses (`MUST NOT print raw JSON`, `Suggested decision:` line) live immediately adjacent to the instruction they govern, not in a distant preamble. Same principle as #384's Q5 resolution.
- **Layered backstops**: after the fusion, the Terminal Outcome Check backstops post-decision execution only (renumbered steps 5-7). The layering is documented in the block's rationale comment so future editors understand what each guarantee covers.

## Key sources / references

- `spec.md` (this directory) — the current specification.
- `clarifications.md` (this directory) — Q1–Q9 with resolved answers.
- `packages/claude-plugin-cockpit/commands/review.md` — the target file.
- Prior issue: agency#384 (Terminal Outcome Check).
- Prior incidents: tetrad-development#88 findings #16, #24, #25.
- Live re-review session: `christrudelpw/sniplink#3` (2026-07-08).
