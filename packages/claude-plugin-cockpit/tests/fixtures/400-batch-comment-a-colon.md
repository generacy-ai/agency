<!-- generacy-cockpit:clarification-batch -->

### Q1: Directive grammar shape
**Context**: The operator provides per-question overrides via a free-text channel. Two documented forms observed on real T-S4 runs: newline-separated (`Q2: B\nQ4: skip`) and single-line semicolon (`Q2: B; Q4: skip`). Naive semicolon-split corrupts verbatim replacement text containing a legitimate semicolon.
**Question**: Which directive-parsing rule should both playbooks apply?
**Options**:
- A: Semicolon-only split
- B: `Q<n>:` token-anchored split, newline OR semicolon separators both parse identically
- C: Loose natural-language routed back through a drafter subagent
- D: Structured JSON/YAML directive input

### Q2: Option-bullet tolerance
**Context**: Two live clarification comments on this very issue differ in option bullet style — one uses `A:` / `B:` and the other uses `A)` / `B)`. The parser must not care.
**Question**: How strict should option-bullet parsing be?
**Options**:
- A: Strict `A:` only
- B: Mildly tolerant — accept both `A:` and `A)`
- C: Fully permissive — any letter followed by any punctuation
- D: Regex-per-line-then-glue

### Q3: Posted-body shape per question
**Context**: The workflow agent that resumes from clarification needs to read the operative choice without prose-reading. Labeled fields make it extractable; unlabeled paragraphs re-fuse what the schema separated.
**Question**: What is the posted-comment shape per approved answer?
**Options**:
- A: Unlabeled paragraph + `**Why:**` footer
- B: `### Q<n>` + `**Answer:** <recommendation>` + `**Rationale:** <justification>`
- C: Single-blob paragraph with em-dash between answer and rationale
- D: Recommendation only, no rationale

### Q4: Zero-directive `Make changes` behavior
**Context**: The operator has explicitly selected `Make changes` but submits an empty follow-up. Empty input must never trigger publish-and-advance (accidental submit → GitHub post) and never trigger implicit-skip (discards stated intent).
**Question**: What happens when a `Make changes` turn produces zero directives?
**Options**:
- A: No-op re-present — the entire batch renders again and the same three-option gate re-fires
- B: Implicit approve — post all as-is
- C: Implicit skip — post nothing
- D: Inner retry-loop within the change-collection turn

### Q5: Title source for the presentation-block header
**Context**: The engine emits `### Q<n>: <title>` in every batch comment. Divergent titles between the presentation and the GitHub issue would make Q-numbers the only common key.
**Question**: Where does the presentation block's per-question title come from?
**Options**:
- A: Drafter-invented title in the SB.1 return
- B: Verbatim from the batch comment header; first-line truncation is the fallback only when the header lacks a title
- C: Drop the title entirely
- D: Truncated title with ellipsis (always)
