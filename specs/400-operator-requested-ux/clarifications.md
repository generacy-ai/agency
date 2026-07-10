# Clarifications

## Batch 1 — 2026-07-10

### Q1: Directive syntax
**Context**: Both `Make changes` and the "Other" free-text path collect per-question directives (example: `Q2: B instead — <reason>; Q4: skip`), but no grammar is specified. Without one, the parser in `clarify.md` and `auto.md` will diverge, and operator input will be ambiguous.
**Question**: What is the formal directive syntax the two surfaces must parse identically?
**Options**:
- A: Semicolon-separated, format `Q<n>: <letter-or-verbatim-text>` for edit and `Q<n>: skip` for skip; letter references (`B`) resolve to the option text from the context payload
- B: One directive per line, same edit/skip forms as (A)
- C: Loose natural language, drafter subagent re-parses into structured directives
- D: Structured (JSON/YAML) — operator must type valid structure

**Answer**: *Pending*

### Q2: Cockpit context payload fields
**Context**: The Assumptions section states the `generacy cockpit context` payload already returns per-question `context`, `question`, and `options` fields verbatim. If it doesn't, the five-element presentation block cannot render as designed and the scope needs to expand.
**Question**: Does the current payload already expose these fields, or is a payload schema change (upstream in `generacy cockpit`) in scope for this issue?
**Options**:
- A: Payload already provides all three fields — no upstream change; verify then implement
- B: Payload is missing one or more — add the schema change to this issue's scope
- C: Fields are missing but out of scope here — parse them from the GitHub issue body via `gh api` inside `clarify.md` / `auto.md`

**Answer**: *Pending*

### Q3: Posted body structure per question
**Context**: Line 47 says the posted body per question is "the recommendation + its justification". The presentation block has separate `Recommendation` and `Why` fields. The posted body's structure (single blob vs. labeled fields) is not specified and affects downstream readers (workflow agents parsing the marker comment).
**Question**: What is the exact per-question body format inside the `<!-- generacy-cockpit:clarification-answers -->` comment?
**Options**:
- A: `### Q<n>` header, then recommendation paragraph, then `**Why:** <justification>` on the next line
- B: `### Q<n>` header, then two labeled fields: `**Answer:** <recommendation>` and `**Rationale:** <justification>`
- C: `### Q<n>` header, then a single paragraph joining recommendation and justification with `—`
- D: `### Q<n>` header, recommendation only; justification stays presentation-only and is not posted

**Answer**: *Pending*

### Q4: `Make changes` with zero directives
**Context**: FR-005 says the `Make changes` loop continues until Approve or Skip. If the operator selects `Make changes` but supplies no directives (empty text / empty collection), behavior is undefined and the loop could stall.
**Question**: What happens when a `Make changes` turn collects zero directives?
**Options**:
- A: Treat as no-op → re-present the entire batch and fire the same batch gate again
- B: Treat as implicit Approve → post all drafts as-is and advance
- C: Treat as implicit Skip this batch → post nothing, ledger line, don't advance
- D: Prompt again for directives (loop within the change-collection turn until non-empty or operator aborts)

**Answer**: *Pending*

### Q5: Header title/summary source
**Context**: The presentation block header is `### Q<n> — <question title/summary>` (line 23). Context/question/options come verbatim from the payload, but the header's "title/summary" is a shortened form and its origin is not specified.
**Question**: Where does `<question title/summary>` come from?
**Options**:
- A: Drafter subagent generates a short (≤80 char) title as part of the SB.1 return schema
- B: Extract the first line of the payload's `question` field (truncate at N chars)
- C: Drop it — header is just `### Q<n>` with no summary

**Answer**: *Pending*
