<!-- generacy-cockpit:clarification-batch -->

### Q1: Directive splitter rule
**Context**: The operator's follow-up may use newline separators or a single-line semicolon form. Verbatim replacement text may itself contain a semicolon.
**Question**: Which splitter rule is safe under both forms?
**Options**:
- A: Semicolon-only
- B: `Q<n>:` token-anchored
- C: Structured input only

### Q2: Naming for the new fixture directory
**Context**: The fixtures live under `tests/fixtures/`. Follow-on findings might add more. The prefix convention `<issue-number>-<slug>` is already established.
**Question**: What naming convention should this issue's fixtures adopt? Answer in free-form prose (no letter options).

### Q3: Approval gate options
**Context**: The batch-gate replaces the pre-fix per-question gate. Three options are shortlisted.
**Question**: Which option list is correct?
**Options**:
- A) Approve / Skip
- B) Approve all & post / Make changes / Skip this batch
