# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-02-18 20:01

### Q1: Spec-kit vs Autodev Boundary
**Context**: The autodev plugin already implements update_stage_comment, update_phase_labels, and manage_clarification_labels MCP tools. The issue description says spec-kit should handle stage comments, label management, and clarification comments. This creates ambiguity about which plugin owns these responsibilities.
**Question**: Should spec-kit implement its own stage comment and label management tools, or should it rely on the existing autodev tools for these? Specifically: does spec-kit need new tools, or should it just ensure its existing manage-clarifications tool works with the autodev orchestration?
**Options**:
- A: Spec-kit implements all three (clarification comments, stage comments, label management) as its own tools, independent of autodev
- B: Spec-kit only handles clarification comments (extend manage-clarifications); autodev continues owning stage comments and label management
- C: Migrate autodev's stage/label tools INTO spec-kit (since they're spec-workflow concerns), and autodev calls spec-kit's tools

**Answer**: **B** — Spec-kit only handles clarification comments (extend manage-clarifications); the orchestrator owns stage comments and label management. Autodev is temporary scaffolding — these capabilities will ultimately live in the Generacy orchestrator, not spec-kit. Spec-kit should focus on clarification content: posting structured questions to GitHub issues and reading answers back via the `manage-clarifications` tool.

### Q2: IssueTracker Facet Usage
**Context**: The spec says to use the IssueTracker facet for backlog-system-agnostic operations. However, the existing manage-clarifications tool uses gh CLI directly via github-cli.ts utility, and the autodev tools also use gh CLI. Using the facet would require resolving it from the AgencyFacetRegistry at runtime.
**Question**: Should the new/modified tools use the IssueTracker facet abstraction, or continue using the gh CLI directly? The facet adds flexibility for Jira/Shortcut but adds complexity and is marked P2 in the requirements.
**Options**:
- A: Use IssueTracker facet for all operations (future-proof but more complex)
- B: Continue using gh CLI directly for MVP, add facet abstraction later
- C: Use facet for label operations only (since BacklogProvider already has setLabels/getLabels), gh CLI for comments

**Answer**: **A** — Use the IssueTracker facet for all operations. Agents should call Agency tools/facets, not raw CLI commands like `gh`. The facet is the proper abstraction layer that the Agency plugin architecture provides. This ensures backlog-system-agnostic operation and aligns with the Latency architecture.

### Q3: Answer Format in Comments
**Context**: FR-004 requires reading and parsing answers from subsequent issue comments. The current manage-clarifications tool reads answers from the clarifications.md file. For GitHub comments, we need a strategy for matching answers in free-form comments back to specific questions.
**Question**: What answer format should reviewers use when responding to clarification questions on the GitHub issue? How should the agent match answers to specific questions?
**Options**:
- A: Require structured format: reviewers quote or reference question numbers (e.g., 'Q1: answer, Q2: answer')
- B: Parse any reply to the clarification comment as answers in question order
- C: Use a template in the clarification comment that reviewers fill in (e.g., checkboxes or labeled fields)

**Answer**: **A** — Structured format with question number references, as already defined in `label-protocol.md`. Reviewers answer in a separate comment using `Q1: [answer]`, `Q2: [answer]` format, then add the `completed:clarification` label. The clarification comment includes these instructions for the reviewer.

### Q4: Humancy Removal Scope
**Context**: FR-010 says to remove the Humancy dependency from the clarification flow. The plugin manifest declares '@generacy-ai/agency-plugin-humancy' as a dependency. The manage-clarifications tool has conditional Humancy integration. It's unclear if this means removing all Humancy code or just making it optional.
**Question**: Should Humancy integration be completely removed from spec-kit, or should it remain as an optional/fallback path that's just not used in the MVP workflow?
**Options**:
- A: Complete removal: delete all Humancy references, imports, and conditional logic from spec-kit
- B: Make optional: keep Humancy code but make it a soft/optional dependency that's not required for MVP

**Answer**: **B** — Keep Humancy as an optional/soft dependency, not required for MVP. The `DecisionHandler` facet remains in Latency core (unimplemented) for future Humancy integration. Spec-kit makes GitHub-native clarification the primary path, with Humancy hooks preserved for post-MVP.

