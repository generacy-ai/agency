# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 23:23

### Q1: Type Definitions Scope
**Context**: The spec references several undefined types (ToolCatalog, ValidationResult, ParameterDefinition, ReturnDefinition, ToolHandler). These need to be defined for implementation, but could be minimal placeholders or full specifications.
**Question**: Should we define comprehensive types for ParameterDefinition, ReturnDefinition, and ToolHandler now, or use minimal interfaces that can be extended later?
**Options**:
- A: Minimal interfaces now - define just the essential fields needed for the registry
- B: Comprehensive types - fully specify parameter validation, return types, and handler signatures

**Answer**: *Pending*

### Q2: Custom Prefix Policy
**Context**: The spec says custom prefixes are 'allowed with warning' but doesn't specify what makes a custom prefix valid or how the warning should be surfaced.
**Question**: What validation rules should apply to custom prefixes, and how should warnings be communicated?
**Options**:
- A: Any prefix allowed, warning logged to console/telemetry
- B: Custom prefixes must match a pattern (e.g., plugin name prefix), warning returned in ValidationResult
- C: Strict mode option - reject custom prefixes entirely in strict mode, warn in permissive mode

**Answer**: *Pending*

### Q3: Name Length Limits
**Context**: The validation mentions 'total length limits' but doesn't specify values. This affects both UX (tool discoverability) and technical constraints.
**Question**: What should the maximum lengths be for tool names?
**Options**:
- A: Prefix max 20 chars, action max 30 chars, total max 50 chars
- B: No hard limits, only warnings above recommended thresholds
- C: Different limits for different contexts (shorter for CLI display, longer allowed internally)

**Answer**: *Pending*

### Q4: Duplicate Tool Handling
**Context**: The registry has register() and unregister() but doesn't specify what happens if a tool with the same name is registered twice.
**Question**: How should the registry handle duplicate tool name registrations?
**Options**:
- A: Throw error - duplicates are not allowed
- B: Replace silently - later registration wins
- C: Replace with warning - log that a tool was overwritten

**Answer**: *Pending*

### Q5: Catalog Export Formats
**Context**: The spec mentions exporting as JSON/Markdown but doesn't clarify if both are required or the structure of the exports.
**Question**: Which catalog export formats are required for the initial implementation?
**Options**:
- A: JSON only - structured data for programmatic use
- B: Both JSON and Markdown - JSON for tools, Markdown for documentation
- C: JSON with optional Markdown renderer - single source of truth, formatting on demand

**Answer**: *Pending*

