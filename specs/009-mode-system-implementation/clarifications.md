# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-18 02:47

### Q1: Default Mode
**Context**: When ModeManager is created or no mode is explicitly set, a default behavior is needed. The acceptance criteria mention 'Default mode configuration provided' but don't specify what it should be.
**Question**: What should the default mode be when no mode is explicitly set?
**Options**:
- A: research - most permissive of the built-in modes
- B: coding - the most commonly used mode for agents
- C: A special 'all' mode that enables all tools
- D: No default - require explicit mode setting before tool use

**Answer**: *Pending*

### Q2: Invalid Mode Error Handling
**Context**: When setMode() is called with a mode name that doesn't exist in the configuration, the system needs defined behavior to prevent silent failures.
**Question**: What should happen when setMode() is called with an unknown mode name?
**Options**:
- A: Throw an error immediately
- B: Log a warning and keep the current mode
- C: Log a warning and fall back to default mode

**Answer**: *Pending*

### Q3: Circular Extension Detection
**Context**: Mode definitions can extend other modes. If A extends B, B extends C, and C extends A, this creates a circular dependency that could cause infinite loops.
**Question**: How should circular mode inheritance be handled?
**Options**:
- A: Validate at config load time and throw an error
- B: Detect at runtime and stop inheritance chain at first repeat

**Answer**: *Pending*

### Q4: Pattern Conflict Resolution
**Context**: A tool like 'test.integration_api' could match both an includes pattern ('test.*') and an excludes pattern ('!test.integration_*'). The resolution order affects which tools are available.
**Question**: When a tool matches both includes and excludes patterns, which takes precedence?
**Options**:
- A: Excludes always win (safer default)
- B: More specific pattern wins
- C: Last pattern in the list wins

**Answer**: *Pending*

### Q5: Mode Configuration Source
**Context**: ModeManager requires a ModeConfig object. Understanding where this configuration comes from affects the API design and integration points.
**Question**: Where should ModeConfig be loaded from?
**Options**:
- A: YAML/JSON file in a standard location (e.g., .agency/modes.yaml)
- B: Passed programmatically via API only
- C: Both - file-based with API override capability

**Answer**: *Pending*

