# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 19:55

### Q1: TicketRef Extensibility
**Context**: The spec shows a fixed union type for providers, but new ticket systems may need to be supported in the future.
**Question**: Should TicketRef.provider be a strict union type ('github' | 'jira' | 'shortcut' | 'local') or allow string extension for future providers?
**Options**:
- A: Strict union type (compile-time safety, requires code change to add providers)
- B: String with known values as constants (flexible, less type safety)
- C: Discriminated union with 'other' fallback (balance of safety and flexibility)

**Answer**: B: String with known values as constants (flexible, less type safety) - We will want to open up allowing new/custom providers to be defined/registered via Agency plugins.

### Q2: Config Schema Scope
**Context**: The spec mentions 'SpecKitConfig schema with Zod' but the existing speckit config has many options. Defining scope prevents over/under-engineering.
**Question**: What configuration options should be included in the initial SpecKitConfig schema?
**Options**:
- A: Minimal: file paths and basic settings only
- B: Full parity: port all existing speckit config options
- C: Core + extensible: essential options with room for plugins to extend

**Answer**: C: Core + extensible - Essential options with room for plugins to extend.

### Q3: Type Porting Strategy
**Context**: Existing speckit types include utility functions (buildTaskId, escapeRegex, etc.) alongside type definitions. This affects package scope and maintenance.
**Question**: Should this package include only TypeScript type definitions, or also the associated utility functions from speckit?
**Options**:
- A: Types only: pure type definitions, utilities in separate package
- B: Types + utilities: include related helper functions
- C: Types + core utilities: only fundamental utilities like ID builders

**Answer**: B: Types + utilities - Include related helper functions alongside type definitions.

