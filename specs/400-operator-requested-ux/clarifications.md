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

**Answer**: B, generalized to a token-anchored rule — the grammar both surfaces implement is "a new directive starts at each `Q<n>:` token": split the input at `Q<n>:` occurrences, each directive's payload runs to the next token or end of input. Newline-separated (B) is the canonical documented form; the single-line semicolon form (A — the spec's own example) parses identically under the token rule, so both arrive for free from one rule stated once. A alone is brittle: an edit directive's verbatim replacement text can legitimately contain semicolons, and a naive semicolon split corrupts it — the token-anchored rule doesn't care. Keep A's letter-resolution: `Q<n>: <letter>` resolves to that option's text from the parsed batch comment; `Q<n>: <letter> — <reason>` also replaces the justification, and a bare letter with no reason posts the answer with no rationale line — never retain the draft's justification under an operator-overridden answer (it would be a rationale arguing for a different choice). Anything that is neither a bare letter nor `skip` is verbatim replacement text. C is the decay surface this grammar exists to prevent (two playbooks' models re-interpreting loose prose will diverge) and adds a subagent round-trip per edit; D is operator-hostile in a free-text box.

### Q2: Cockpit context payload fields
**Context**: The Assumptions section states the `generacy cockpit context` payload already returns per-question `context`, `question`, and `options` fields verbatim. If it doesn't, the five-element presentation block cannot render as designed and the scope needs to expand.
**Question**: Does the current payload already expose these fields, or is a payload schema change (upstream in `generacy cockpit`) in scope for this issue?
**Options**:
- A: Payload already provides all three fields — no upstream change; verify then implement
- B: Payload is missing one or more — add the schema change to this issue's scope
- C: Fields are missing but out of scope here — parse them from the GitHub issue body via `gh api` inside `clarify.md` / `auto.md`

**Answer**: C, with one mechanical correction — no `gh api` call is needed. Verified against generacy origin/develop: the payload's `clarificationComment` is the raw comment (`clarification-comment-finder.ts` returns the first comment after the `waiting-for:clarification` label event; `context.ts` emits it unparsed), so A's premise is false — correct the spec's Assumptions line in-branch as part of this work. But the body *is* the engine-authored batch template (`### Q<n>: <title>` / `**Context**:` / `**Question**:` / `**Options**:`), so the playbooks parse the five elements from `clarificationComment.body` already in hand — this is parsing our own wire format, not scraping. Make the parse mildly tolerant (the two live clarification comments on this very issue differ in option bullet style, `A:` vs `A)`). B (upstream structured emission) is the eventual hardening if parse fragility ever shows up in practice, but it is a generacy-side schema change that should not gate this playbook improvement.

### Q3: Posted body structure per question
**Context**: Line 47 says the posted body per question is "the recommendation + its justification". The presentation block has separate `Recommendation` and `Why` fields. The posted body's structure (single blob vs. labeled fields) is not specified and affects downstream readers (workflow agents parsing the marker comment).
**Question**: What is the exact per-question body format inside the `<!-- generacy-cockpit:clarification-answers -->` comment?
**Options**:
- A: `### Q<n>` header, then recommendation paragraph, then `**Why:** <justification>` on the next line
- B: `### Q<n>` header, then two labeled fields: `**Answer:** <recommendation>` and `**Rationale:** <justification>`
- C: `### Q<n>` header, then a single paragraph joining recommendation and justification with `—`
- D: `### Q<n>` header, recommendation only; justification stays presentation-only and is not posted

**Answer**: B — `### Q<n>` then `**Answer:** <recommendation>` and `**Rationale:** <justification>`. It maps one-to-one onto the SB.1 fields, so assembly is trivial and the displayed and posted content cannot drift — the same reason the schema was split in the first place. The labeled `**Answer:**` line makes the operative choice extractable without prose-reading, which matters to the real downstream reader (the workflow agent resuming from clarification, and any future engine-side parsing). A leaves the recommendation as an unlabeled paragraph — ambiguous when the answer is free-form prose rather than a letter; C re-fuses into a blob what the schema deliberately separated; D discards the rationale, which the tetrad-development#92 runs showed is load-bearing (implementing agents used the why to make aligned micro-decisions).

### Q4: `Make changes` with zero directives
**Context**: FR-005 says the `Make changes` loop continues until Approve or Skip. If the operator selects `Make changes` but supplies no directives (empty text / empty collection), behavior is undefined and the loop could stall.
**Question**: What happens when a `Make changes` turn collects zero directives?
**Options**:
- A: Treat as no-op → re-present the entire batch and fire the same batch gate again
- B: Treat as implicit Approve → post all drafts as-is and advance
- C: Treat as implicit Skip this batch → post nothing, ledger line, don't advance
- D: Prompt again for directives (loop within the change-collection turn until non-empty or operator aborts)

**Answer**: A — zero directives is a no-op: re-present the entire batch and fire the same gate again. B is disqualified on principle: empty input must never trigger the publish-and-advance action — an accidental submit would post to GitHub (the irreversible-ish verb never fires on ambiguity). C silently converts "Make changes" into its opposite — the operator explicitly signaled they want something different, so discarding the batch discards their stated intent. D's inner retry loop adds a second prompting mechanism for marginal benefit; A reuses the one existing gate (one mechanism per job), keeps the full batch in view for the decision the operator was trying to make, and cannot stall — every iteration requires an explicit operator choice, so it is an idle loop with an exit on every face.

### Q5: Header title/summary source
**Context**: The presentation block header is `### Q<n> — <question title/summary>` (line 23). Context/question/options come verbatim from the payload, but the header's "title/summary" is a shortened form and its origin is not specified.
**Question**: Where does `<question title/summary>` come from?
**Options**:
- A: Drafter subagent generates a short (≤80 char) title as part of the SB.1 return schema
- B: Extract the first line of the payload's `question` field (truncate at N chars)
- C: Drop it — header is just `### Q<n>` with no summary

**Answer**: B, amended — reuse the engine-posted title, don't truncate. The batch comment's `### Q<n>: <title>` headers already carry a short title for every question (this issue's own batch demonstrates it); the Q2 parse captures it, so the presentation header reuses it verbatim. First-line truncation is the fallback only if a batch comment ever arrives without titles. A is rejected for the names-that-lie reason: a drafter-invented title creates a second name for a question that already has one on the GitHub issue, and the operator cross-reads both surfaces — divergent titles would make Q-numbers the only common key. C throws away a genuinely useful scanning affordance in a six-question batch.
