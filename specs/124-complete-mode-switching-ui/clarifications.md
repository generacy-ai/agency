# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-23 20:40

### Q1: Mode Persistence Scope
**Context**: The spec says 'persist last-used mode' but doesn't specify if this should be workspace-scoped or global user setting. This affects implementation significantly.
**Question**: Should mode persistence be per-workspace (each project remembers its mode) or global (one mode across all workspaces)?
**Options**:
- A: Per-workspace (stored in .vscode/settings.json)
- B: Global user setting (stored in user settings)
- C: Both - user sets default, workspace can override

**Answer**: *Pending*

### Q2: Error Handling UX
**Context**: When mode switching fails (e.g., MCP server unavailable, invalid config), the spec doesn't define the expected user experience.
**Question**: How should mode switching failures be communicated to the user?
**Options**:
- A: Show error notification with details and retry option
- B: Show minimal error notification, log details to output channel
- C: Silent fallback to previous mode with subtle indicator

**Answer**: *Pending*

### Q3: Initial Mode Selection
**Context**: The spec doesn't specify what happens on first launch when no mode has been persisted yet. This affects the initial user experience.
**Question**: What mode should be selected on first launch when no mode is persisted?
**Options**:
- A: First mode defined in agency.config.json
- B: A mode explicitly marked as 'default' in config
- C: Show mode picker on first activation, require explicit selection

**Answer**: *Pending*

### Q4: Status Bar Priority
**Context**: VS Code status bar has limited space and items compete for position. The spec doesn't specify where the mode indicator should appear.
**Question**: Where in the status bar should the mode indicator appear?
**Options**:
- A: Left side (higher visibility, near other VS Code indicators)
- B: Right side (less prominent, typical for extension status)
- C: Configurable by user preference

**Answer**: *Pending*

### Q5: Mode Switch Confirmation
**Context**: Switching modes could affect currently running operations or tool availability. The spec doesn't address whether users need to confirm disruptive mode changes.
**Question**: Should mode switching require confirmation, especially if it would disable currently active tools?
**Options**:
- A: No confirmation - switch immediately
- B: Confirm only if it would disable active tools
- C: Always show confirmation with impact summary

**Answer**: *Pending*

