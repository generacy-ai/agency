# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 23:24

### Q1: Humancy Dependency
**Context**: The spec references a HumancyChannel type and requires integration with humancy.ask_question and humancy.request_decision. However, the reference implementation uses direct GitHub posting without Humancy.
**Question**: Should this implementation actually depend on Humancy for human input, or should it follow the reference implementation pattern that posts questions directly to GitHub issues?
**Options**:
- A: Use Humancy plugin for human input (as spec says)
- B: Use direct GitHub posting like the reference implementation
- C: Support both modes (Humancy when available, GitHub fallback)

**Answer**: *Pending*

### Q2: Tool Namespace
**Context**: The spec shows the tool name as spec_kit.manage_clarifications with namespace: 'spec_kit', but the reference implementation registers it simply as manage_clarifications.
**Question**: Which naming convention should be used for the tool registration?
**Options**:
- A: spec_kit.manage_clarifications (matches spec)
- B: manage_clarifications (matches reference)
- C: speckit.manage_clarifications (matches other speckit tools)

**Answer**: *Pending*

### Q3: Package Location
**Context**: The spec says create src/tools/clarifications.ts which implies the agency core package, but this functionality seems related to the speckit plugin.
**Question**: Should this tool be implemented in the agency core package (packages/agency/src/tools/) or in the speckit plugin (plugins/speckit/)?
**Options**:
- A: Agency core package as stated in spec
- B: Speckit plugin to match related functionality

**Answer**: *Pending*

### Q4: Question Status Model
**Context**: The spec mentions tracking question status as (pending, answered). The reference implementation uses null for pending and actual text for answered, displayed as *Pending* in markdown.
**Question**: Should we follow the reference implementation's status model, or implement explicit status enums as the spec suggests?
**Options**:
- A: Follow reference: null = pending, string = answered
- B: Explicit status field with enum values

**Answer**: *Pending*

