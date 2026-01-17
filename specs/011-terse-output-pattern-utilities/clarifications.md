# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-17 23:23

### Q1: ToolResult type definition
**Context**: The code examples show ToolResult as the return type, but this type is not defined. The MCP SDK uses CallToolResult which has a different structure. This affects the public API surface.
**Question**: Should TerseOutput return the MCP SDK's CallToolResult type, or should we define a custom ToolResult type that gets converted to CallToolResult at the MCP boundary?
**Options**:
- A: Use MCP SDK's CallToolResult directly (tighter coupling, less abstraction)
- B: Define custom ToolResult and convert at MCP boundary (looser coupling, more portable)

**Answer**: *Pending*

### Q2: NORMAL verbosity output
**Context**: The spec defines TERSE (minimal success) and VERBOSE (full output always), but NORMAL says 'medium output always' without clarifying what medium means. This affects implementation.
**Question**: For NORMAL verbosity, what should success output include beyond the short message?
**Options**:
- A: Include short message plus timing information
- B: Include short message plus a summary of what was done (e.g., '3 files compiled')
- C: Include first N lines of full output (configurable truncation)

**Answer**: *Pending*

### Q3: Configuration loading source
**Context**: The spec shows a JSON configuration example but doesn't specify where this configuration is read from. Agency uses different config patterns for different purposes.
**Question**: Where should TerseOutput configuration be loaded from?
**Options**:
- A: Read from package.json 'agency' field
- B: Read from .agencyrc.json or similar dedicated config file
- C: Accept configuration via constructor/initialization, no file reading

**Answer**: *Pending*

### Q4: ExecResult type source
**Context**: The fromExec helper references ExecResult type with exitCode, shortMessage, stderr, stdout properties. This type needs to be defined or imported.
**Question**: Should ExecResult be a new type defined in this utility, or should it match an existing type from Node.js child_process or another library?
**Options**:
- A: Define minimal ExecResult interface in this package
- B: Use/extend execa's result type (if execa is a dependency)
- C: Accept a generic object and extract known properties with fallbacks

**Answer**: *Pending*

### Q5: Context serialization in errors
**Context**: The failure method accepts context?: unknown but doesn't specify how non-string context values should be serialized in the error output.
**Question**: How should the context parameter be serialized when it's not a string?
**Options**:
- A: JSON.stringify with 2-space indentation
- B: util.inspect with depth limit
- C: Only accept string context, require caller to serialize

**Answer**: *Pending*

