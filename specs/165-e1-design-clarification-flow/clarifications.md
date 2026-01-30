# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 22:23

### Q1: Question Batching Strategy
**Context**: The design lists 'question batching' as undecided. This affects the Humancy tool call pattern and user experience.
**Question**: Should clarification questions be presented to the user all at once (batch mode) or one at a time (sequential mode)?
**Options**:
- A: Batch mode - all questions queued in decision queue, user can answer in any order
- B: Sequential mode - one question at a time, wait for answer before showing next
- C: Hybrid - batch questions but require answers in order

**Answer**: *Pending*

### Q2: Timeout Behavior
**Context**: The design lists timeout handling as undecided. This determines workflow behavior when users don't respond.
**Question**: What should happen when a clarification question times out without an answer?
**Options**:
- A: Block workflow - require answer before proceeding
- B: Skip question - mark as 'skipped' and continue workflow
- C: Use default - apply a predefined default answer and continue
- D: Configurable - let each question specify its timeout behavior

**Answer**: *Pending*

### Q3: Partial Answers
**Context**: Related to timeout handling - can the workflow proceed if only some questions are answered?
**Question**: Can the clarify phase complete with some questions still unanswered (pending)?
**Options**:
- A: Yes - proceed with partial answers, pending questions remain in clarifications.md
- B: No - all questions must be answered before phase completes
- C: Threshold - allow proceeding if ≥N% of questions answered

**Answer**: *Pending*

### Q4: Deliverable Location
**Context**: The spec mentions 'docs/clarification-flow.md' as a deliverable but doesn't specify the repository or path structure.
**Question**: Where should the design documentation be created - in this repo (agency) or in the speckit plugin repo?
**Options**:
- A: In agency repo at docs/clarification-flow.md
- B: In speckit plugin repo as part of plugin docs
- C: In the feature's spec directory (specs/165-*/)
- D: Split across both repos (architecture in agency, implementation details in speckit)

**Answer**: *Pending*

### Q5: Humancy Dependency
**Context**: The acceptance criteria mention identifying Humancy plugin dependency requirements. Need to clarify the relationship.
**Question**: Should Humancy be a required dependency (clarify fails without it) or optional (fallback to GitHub comments/CLI)?
**Options**:
- A: Required - Humancy must be available for clarify to work
- B: Optional with fallback - use GitHub comments if Humancy unavailable
- C: Optional with CLI fallback - prompt in terminal if Humancy unavailable

**Answer**: *Pending*

