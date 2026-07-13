<!-- generacy-cockpit:clarification-batch -->

### Q1
**Context**: Some future engine template might emit batch headers without titles. The parser must not blow up; the renderer substitutes a first-line truncation of the question field.
**Question**: Which fallback title rule should the renderer apply when the batch header lacks a title?
**Options**:
- A: Invent a title in the drafter subagent
- B: First-line truncation of the question, 80 chars, no ellipsis
- C: Drop the title entirely
