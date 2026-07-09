# Data Model: Isolate implementation-review's `/code-review` invocation in a subagent

**Feature**: 390-found-during-cockpit-v1
**Date**: 2026-07-09

This feature is a **playbook-document edit** (like #388), so the "data model" describes the structural layout of the fused step 3 in `packages/claude-plugin-cockpit/commands/review.md` — its sub-branches, the subagent invocation contract, the return schema, and the parent mapping — plus the one-line replacement in `packages/claude-plugin-cockpit/README.md`.

---

## Entities

### 1. `Instructions` — fused step 3 (from #388)

The core body of the playbook remains a numbered step list (post-#388: 7 steps). Step 3 is the fused analysis + `AskUserQuestion` step. This feature modifies **only Sub-branch A** (implementation-review) of step 3. The convergence into the shared `AskUserQuestion` invocation and Sub-branch B (artifact-review) are unchanged.

**Pre-390 shape (deployed today, post-#388)**:

```text
### Step 3. Fused analysis + approval prompt

<rule sentence — fusion rule from #388>

Sub-branch A (--gate implementation-review):
  1. Invoke Claude Code's built-in /code-review slash command.
  2. Capture output verbatim.
  3. Classify each finding.
  4. MUST NOT print raw JSON under any circumstance. [inline]
  5. Render findings-summary table as prose.
  6. Append Suggested decision: line.

Sub-branch B (--gate ∈ artifact-review set): unchanged from #388.

Convergence: AskUserQuestion(three options).
```

**Post-390 shape (target)**:

```text
### Step 3. Fused analysis + approval prompt

<rule sentence — fusion rule from #388, unchanged>

Sub-branch A (--gate implementation-review):
  1. Invoke the Agent tool with subagent_type: "general-purpose", carrying:
       - the PR reference (owner/repo#<n>) from the parent's Bash resolution
         of the epic's open PR;
       - the review instructions inlined into the prompt (see contracts/subagent-boundary.md):
           * verify empirically before reporting;
           * findings return schema {file, line, summary, failure_scenario};
           * allow reading surrounding files and running bounded verification;
           * fetch own diff via `gh pr diff <owner>/<repo>#<n>`;
           * ENTIRE return message MUST be a single JSON value, one of two shapes.
  2. Parse the subagent's return message:
       - array of {file, line, summary, failure_scenario} → findings-table branch;
       - [] → zero-findings branch;
       - {"error": "<description>"} → hard-error branch;
       - anything else (unparseable, other shape) → hard-error branch, quoting raw.
  3. Classify each finding (Blocking? Yes / No) — Claude's judgment, on the parsed array.
  4. MUST NOT print raw JSON under any circumstance. [inline, RETAINED — defense-in-depth]
  5. Render findings-summary table as prose.
  6. Append Suggested decision: line.

Sub-branch B (--gate ∈ artifact-review set): unchanged from #388.

Convergence: AskUserQuestion(three options) — same response as the summary prose. Unchanged from #388.

Edge cases:
  - Zero findings (empty array): render | (none) | | | |; Suggested decision: approve;
    STILL invoke AskUserQuestion.
  - Hard error ({"error": …} or unparseable): route to Error handling block class OTHER;
    do NOT invoke AskUserQuestion; do NOT emit Terminal Outcome Check markers.
```

**Post-390 invariants**:
- Sub-branch A's step 1 is an Agent tool invocation with `subagent_type: "general-purpose"` — no direct `/code-review` invocation appears in step 3 anywhere (SC-002).
- The subagent invocation prompt states the return schema verbatim and both parse-error and error-object mappings.
- The fusion rule sentence from #388 still appears exactly once (retained #388 invariant C1).
- The `MUST NOT print raw JSON` clause remains inline immediately before the table rendering instruction (retained #388 invariant C2; FR-009).
- The shared `AskUserQuestion` invocation still lives at the tail of step 3 in the same response as the summary prose (retained #388 invariant C5).
- No new terminal state introduced (FR-005): the four return shapes map onto exactly two existing branches — findings-table (arrays with content), zero-findings (`[]`), Error handling class `OTHER` (`{"error"…}` or unparseable).

### 2. `Examples` section

The `## Examples` block in `review.md` retains its structure; the implementation-review example is updated to show the subagent invocation followed by the fused #388 step.

**Post-390 invariants**:
- No example depicts the pre-390 shape (inline `/code-review` in the parent turn) (FR-008).
- The implementation-review example shows the Agent tool call, then the structured JSON return, then the fused findings-summary table + `AskUserQuestion` in one response.

### 3. `Terminal Outcome Check` block

Fence-marked block at end-of-file (`<!-- BEGIN terminal-check -->` / `<!-- END terminal-check -->`) — unchanged from #388.

**Post-390 invariants**:
- Fence markers preserved verbatim (retained #388 invariant C3).
- Marker list preserved verbatim: `Labels:` / `Feedback posted:` / `Aborted:` (retained #388 invariant C4).
- Re-invocation fallback preserved with step-number reference to the fused step (retained #388 invariant).
- Rationale comment unchanged — the block still covers the post-decision execution window (steps 5–7 post-#388 renumber); this feature does not change that layering.

### 4. `Error handling` block

Fence-marked block (`<!-- BEGIN error-conv -->` / `<!-- END error-conv -->`) with three classes: `MISSING_BINARY`, `AUTH_FAILURE`, `OTHER` — unchanged.

**Post-390 invariants**:
- Block byte-identical.
- Subagent hard-error (`{"error": …}` return or unparseable return) routes to class `OTHER` from within sub-branch A (FR-005).

### 5. `README.md` line 7 (governance surface)

The plugin README's overview paragraph that currently ends with:

> There are no dependencies on `specs/**` contracts, no autonomy-policy lookup, and no cross-slash-command invocation (with a single documented exception: `/cockpit:review --gate implementation-review` invokes Claude Code's built-in `/code-review`).

**Post-390 shape**: the parenthetical exception language is removed and replaced with a subagent-boundary statement + one-line rationale referencing #390 and the two prior recurrences (#384, #388). Illustrative shape (final wording lives in the contract):

> There are no dependencies on `specs/**` contracts, no autonomy-policy lookup, and no cross-slash-command invocation. Cross-command composition happens via the Agent tool (subagent boundary); no slash command is invoked inline in another command's shared context. (See #390 for the recurrence pattern this rule closes: #384, #388, #390.)

**Post-390 invariants** (SC-005):
- The exact substring "single documented exception" no longer appears in the README.
- The new wording appears exactly once.
- The rationale reference to `#390` (and the prior two) appears in the same paragraph or an immediately following line.

---

## Contracts / invariants (SC-derived)

### C1. Subagent invocation directive present (SC-002, FR-001)

`review.md` step 3 sub-branch A contains a directive that instructs the model to invoke the Agent tool with `subagent_type: "general-purpose"` for the code review, and that names the return schema. Greppable check: a phrase like `Agent tool` or `subagent_type: "general-purpose"` co-located inside sub-branch A of the fused step.

### C2. No inline `/code-review` invocation in the parent (SC-002)

The greppable substring `/code-review` (or `Claude Code's built-in /code-review`) no longer appears inside `review.md` step 3 sub-branch A's parent-execution path. It MAY still appear inside a quoted subagent prompt block (as documentation of what the subagent is instructed to do) — the invariant is about the *parent's* turn, not the sub-turn.

*Note*: to keep the grep unambiguous, this feature ships without an inline `/code-review` invocation anywhere in the parent's execution path of `review.md`. If a documentation-only mention remains, it must be inside a fenced quotation of the subagent prompt.

### C3. Return-schema directive verbatim (FR-003)

The following statements appear verbatim in `review.md` step 3 sub-branch A's subagent invocation prompt (or in a fenced quotation of it inside the playbook):
- "The entire return message MUST be a single JSON value."
- The schema `{file, line, summary, failure_scenario}` is named.
- The error-object shape `{"error": "<description>"}` is named.
- The mapping "no prose wrapper, no fenced code block, no additional text" is present.

### C4. Parent mapping directive present (FR-004)

`review.md` step 3 sub-branch A contains a mapping table or equivalent prose stating:
- non-empty JSON array → findings-table branch;
- `[]` → zero-findings branch;
- `{"error": …}` → hard-error (Error handling class `OTHER`);
- unparseable / other-shape → hard-error, quoting the raw message.

### C5. Retained `MUST NOT print raw JSON` clause (FR-009)

`grep -c "MUST NOT print raw JSON" packages/claude-plugin-cockpit/commands/review.md` returns exactly `1`. The occurrence is inline within step 3 sub-branch A, immediately before the findings-summary table rendering instruction (unchanged from #388's placement).

### C6. Retained fusion rule sentence (#388 C1, still holds)

`grep -c "delivered AS PART OF the same response that invokes AskUserQuestion" packages/claude-plugin-cockpit/commands/review.md` returns exactly `1`.

### C7. Terminal Outcome Check fence-marker preservation (#388 C3, still holds)

`grep -c "<!-- BEGIN terminal-check -->" packages/claude-plugin-cockpit/commands/review.md` returns exactly `1`. Same for `<!-- END terminal-check -->`.

### C8. Marker-list preservation (#388 C4, still holds)

The Terminal Outcome Check block still names `Labels:`, `Feedback posted:`, and `Aborted:` as its three markers, in unchanged text.

### C9. README exception-phrase removal + replacement (SC-005, FR-006)

`grep -c "single documented exception" packages/claude-plugin-cockpit/README.md` returns exactly `0`. The replacement wording (subagent-boundary statement + `#390` reference) appears exactly once — a single greppable phrase from the new wording is chosen at implementation time as the anchor.

### C10. Historical artifact preservation (SC-006)

`git diff origin/develop -- specs/372-epic-generacy-ai-tetrad/plan.md` returns empty (zero bytes changed on this branch).

### C11. Sibling playbook non-modification (FR-007)

`git diff origin/develop -- packages/claude-plugin-cockpit/commands/clarify.md packages/claude-plugin-cockpit/commands/merge.md packages/claude-plugin-cockpit/commands/queue.md packages/claude-plugin-cockpit/commands/status.md packages/claude-plugin-cockpit/commands/watch.md` returns empty (no changes).

### C12. No third prompt-side mitigation (SC-007)

Diff review of `review.md` on this branch shows no new "MUST" clauses, no new checklists, no new terminal-outcome extensions beyond what #384 and #388 shipped. Any wording change in `review.md` is either (a) the subagent invocation directive itself, (b) the return-schema and parent-mapping directives, or (c) the example-shape update — no adjacent hedge prose.

### C13. Sibling assessment recorded (SC-008)

The PR description contains a one-line assessment of siblings confirming that `clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md` do not inline-invoke another slash command today. This is a PR-body artifact, not a repo file.

---

## Relationships

```text
Instructions.steps[3].subBranchA (--gate implementation-review)
  ├─ contains: Agent tool invocation with subagent_type: "general-purpose" ──► C1
  ├─ does NOT contain: inline /code-review invocation in parent path ────────► C2
  ├─ contains: subagent return schema directive (JSON, two shapes) ──────────► C3
  ├─ contains: parent mapping directive (4-way) ─────────────────────────────► C4
  ├─ contains: retained MUST NOT print raw JSON clause ──────────────────────► C5
  └─ terminates in: shared AskUserQuestion (via #388 convergence) ───────────► #388 C5

Instructions.steps[3] (fused, from #388)
  ├─ retained rule sentence (exactly once) ─────────────────────────────────► C6
  └─ shared AskUserQuestion convergence unchanged ─────────────────────────► #388 C5, C6

Examples[*] (touching implementation-review sub-branch)
  └─ MUST show subagent invocation + fused step, NOT inline /code-review ──► FR-008

TerminalOutcomeCheck (block at end-of-file)
  ├─ fence markers preserved ───────────────────────────────────────────────► C7
  ├─ marker list preserved ─────────────────────────────────────────────────► C8
  └─ rationale + step-references unchanged (still covers post-decision) ──► #388 (unchanged)

ErrorHandling (block)
  └─ subagent hard errors ({"error":…} or unparseable) route here class OTHER► FR-005

README.md line 7
  ├─ "single documented exception" phrase removed ─────────────────────────► C9 (removal half)
  ├─ replacement wording present exactly once ─────────────────────────────► C9 (addition half)
  └─ rationale reference to #390 (with #384/#388) present ─────────────────► FR-006

Historical: specs/372-epic-generacy-ai-tetrad/plan.md
  └─ byte-identical across branch ─────────────────────────────────────────► C10

Sibling playbooks
  └─ untouched ────────────────────────────────────────────────────────────► C11

PR body
  └─ one-line sibling assessment recorded ─────────────────────────────────► C13
```

---

## Validation rules (non-normative summary)

- The parent turn after subagent return contains: the Agent tool call trace, the structured JSON result (visible in the transcript as tool output — not restated in prose), the findings-summary table as prose, the `Suggested decision:` line, and the `AskUserQuestion` invocation — in this order, in one response.
- The parent's turn NEVER contains free-form review analysis prose from inside the sub-turn (the sub-skill's terminal contract ends the sub-turn; nothing of the sub-skill's shape reaches the parent's shared context).
- The subagent's return JSON is parsed exactly once by the parent; parse failure is a hard error routed to Error handling class `OTHER`.
- Zero-findings (`[]`) still prompts the operator via `AskUserQuestion` — no auto-approval smuggled in.
- `{"error": …}` return skips `AskUserQuestion` — no consent manufactured from an empty analysis (preserves #388's edge-case decision).
- The `AskUserQuestion` options are still exactly `approve` / `request-changes` / `abort` in that order (spec § Out of Scope explicitly excludes changes to the three-option shape).
