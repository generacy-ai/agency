# Clarifications

## Batch 1 — 2026-06-26

### Q1: Partial-approval semantics
**Context**: US1 acceptance says the developer "may approve all, approve a subset, edit individual answers, or reject the batch," and FR-006 limits posting to one comment per run. FR-007 says `cockpit advance` runs "only when at least one approved answer was posted." It is unclear whether a partial approval (e.g. 3 of 5 answers approved) (a) posts only the approved subset and advances the gate, leaving the unapproved questions still pending on the next clarify cycle, or (b) treats partial approval as non-advancing and only advances when every open question has an approved answer.
**Question**: When the developer approves only a subset of drafted answers, should the command post the approved subset and advance the gate, or hold the comment+advance until every open question has an approved answer?
**Options**:
- A: Post the approved subset and advance the gate; remaining questions stay open and surface on the next `/cockpit:clarify` invocation.
- B: Post the approved subset but do not advance the gate; gate advance only fires when all open questions are answered in this run.
- C: Block posting entirely on partial approval (all-or-nothing); require either full approval or rejection.

**Answer**: B — Post the approved subset, but advance the gate (`completed:clarification`) only when every open question has an approved answer in this run; no premature resume with gaps. (The common "approve all" case posts + advances in one go.)

### Q2: Canonical HTML marker string
**Context**: FR-005 and the Assumptions section both reference the marker `<!-- generacy-cockpit:clarification-answers -->` but Assumptions also says "the exact marker string is finalized at implementation time against the cockpit engine." Resume tooling must locate the comment deterministically, so the marker must be settled before implementation can land or be tested.
**Question**: Is `<!-- generacy-cockpit:clarification-answers -->` the canonical marker that the cockpit engine's resume path will key off, or should the spec lock in a different exact string?
**Options**:
- A: Use `<!-- generacy-cockpit:clarification-answers -->` exactly as written in FR-005.
- B: Use a different exact string (please specify in the answer).

**Answer**: A — Use `<!-- generacy-cockpit:clarification-answers -->` as the cockpit-comment marker. Note: the **`completed:clarification` label** is what triggers the orchestrator's resume, not the marker — the marker just identifies cockpit-authored answers (consistent with the plan's comment-marker convention).

### Q3: Branch-resolution failure behavior
**Context**: FR-002 resolves the target issue from the current git branch using the `###-*` convention and notes that an `--issue <n>` argument "may be supported for off-branch use." The spec does not state what happens if the developer runs `/cockpit:clarify` on a branch that does not match `###-*` and no explicit issue is provided. This affects whether the command must implement an `--issue` argument in v1 or can defer it.
**Question**: When the current branch does not match `###-*` and no explicit issue is provided, what is the required v1 behavior?
**Options**:
- A: Hard error: exit non-zero with "no child issue resolvable; pass --issue <n>" and require `--issue` to be implemented in v1.
- B: Hard error without `--issue` support in v1: developer must check out a `###-*` branch to use the command; `--issue` deferred to a later iteration.
- C: Soft prompt: interactively ask the developer for an issue number.

**Answer**: A — Accept an explicit issue argument in v1 (`/cockpit:watch` invokes `/cockpit:clarify <issue>`); branch inference (`###-*`) is a fallback. Hard error with guidance if neither resolves.

### Q4: Drafting fallback when context is insufficient
**Context**: FR-004 requires drafts to cite a spec section, plan section, or file path as provenance. The spec is silent on what to do when the local artifacts do not give the agent enough evidence to draft a confident answer for a specific question (e.g., the question concerns a design decision not yet captured in `spec.md` or `plan.md`). This drives whether a low-confidence draft blocks the whole batch or is rendered as a clearly-marked stub.
**Question**: When the agent cannot ground a draft for one of the open questions, how should the command behave for that question?
**Options**:
- A: Render an explicitly-marked stub (e.g., "_no draft — insufficient context_") so the developer can either supply an answer manually, edit, or skip; the rest of the batch proceeds normally.
- B: Omit that question from the draft entirely so only confidently-drafted questions are presented; un-drafted questions remain pending.
- C: Block the entire batch with an error until the developer supplies additional context or files; nothing is presented.

**Answer**: A — For a question the agent can't ground, render a marked stub (`_no draft — insufficient context_`) so the developer can fill/edit/skip it; the rest of the batch proceeds.

### Q5: Comment-posting transport
**Context**: FR-005/FR-006 require posting a single marked comment on the issue, and the Assumptions section says "GitHub authentication is handled by the developer's existing `gh` / cockpit CLI configuration." The spec does not state which executable the verb shells out to for the post. This matters because it determines whether the verb depends on `gh` being installed, or whether posting is a third subcommand of `generacy cockpit` (alongside `clarify-context` and `advance`), which would be a scope addition for G1.2.
**Question**: Which CLI is responsible for posting the marked answer comment to the GitHub issue?
**Options**:
- A: `gh issue comment` — the verb shells out to the `gh` CLI directly and `gh` becomes a hard runtime dependency of the command.
- B: A `generacy cockpit` subcommand (e.g., `generacy cockpit post-clarification-answers`) — pushes the GitHub mechanics into the cockpit engine and adds scope to G1.2.
- C: Either is acceptable; the verb auto-detects (`generacy cockpit` first, fall back to `gh`).

**Answer**: A — Post via `gh issue comment` from the command, then advance via the existing `generacy cockpit advance` verb. (#788 is already implemented, so we don't add a posting verb to it retroactively; the slash layer using `gh` for the comment is fine.)
