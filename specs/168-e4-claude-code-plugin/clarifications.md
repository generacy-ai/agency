# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 18:35

### Q1: Ticket Sources
**Context**: The command needs to parse ticket URLs/identifiers but the spec doesn't clarify which ticket systems are supported. This affects URL parsing and `get_ticket` tool integration.
**Question**: Which ticket/issue tracking systems should be supported?
**Options**:
- A: GitHub Issues only (URL or #123 format)
- B: GitHub + Linear (URL or PROJ-123 format)
- C: GitHub + Linear + Jira (all major systems)
- D: Only GitHub for MVP, design for extensibility

**Answer**: *Pending*

### Q2: No Ticket Behavior
**Context**: The workflow shows ticket as optional, but the reference specify command requires a description. Need to define behavior when no ticket is provided.
**Question**: What should happen when the user runs `/agency-spec-kit:specify` without a ticket argument?
**Options**:
- A: Prompt for a feature description (match reference behavior)
- B: Return an error requiring a ticket
- C: Create a blank spec with just a template

**Answer**: *Pending*

### Q3: MCP Tool Namespace
**Context**: The issue uses `spec_kit.*` tool names but existing tools use different names like `create_feature`. Tool naming affects how the command orchestrates MCP calls.
**Question**: What is the correct MCP tool namespace/naming convention to use?
**Options**:
- A: Use existing tool names directly (create_feature, copy_template, etc.)
- B: Create a spec_kit namespace wrapper (spec_kit.create_feature)
- C: Use the names from the speckit MCP server as-is

**Answer**: *Pending*

### Q4: Ticket Linking
**Context**: Step 4 mentions 'Link to ticket (optional)' but doesn't specify the mechanism. This requires API calls to update external systems.
**Question**: Should the specify command automatically update the source ticket/issue with the created branch reference?
**Options**:
- A: Yes, add a comment to the source issue with branch info
- B: No, manual linking only (simpler, fewer API dependencies)
- C: Yes, but only for GitHub issues (our primary system)

**Answer**: *Pending*

