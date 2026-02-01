# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 19:34

### Q1: Humancy Integration
**Context**: The spec mentions 'Use Humancy for human input' but doesn't explain how this works. Understanding Humancy's role is critical for implementing the wait/collect answers flow.
**Question**: What is Humancy, and how does the Claude Code plugin interact with it? Is there an existing SDK, API, or does this command need to use a different mechanism (e.g., direct prompts to user)?
**Options**:
- A: Use Humancy SDK/API (need documentation link)
- B: Use AskUserQuestion tool or direct prompts instead
- C: Humancy integration is out of scope - just persist questions to file

**Answer**: B - Use AskUserQuestion tool or direct prompts instead of Humancy SDK. The clarify command should use direct prompts to the user within the Claude Code session rather than relying on external Humancy integration.

### Q2: Plugin Scaffold Status
**Context**: Dependency F5 (plugin scaffold) needs to exist before creating command files. The target path is packages/claude-plugin-agency-spec-kit/commands/clarify.md.
**Question**: Has the F5 plugin scaffold been completed? Does the packages/claude-plugin-agency-spec-kit directory and commands folder exist, or should this task also create them?
**Options**:
- A: Scaffold exists - just create the command file
- B: Create the commands directory if missing
- C: This task depends on F5 - block until scaffold exists

**Answer**: B - Create the commands directory if missing. The task should create packages/claude-plugin-agency-spec-kit/commands/ if it doesn't exist, rather than blocking on the F5 dependency.

### Q3: MCP Tool Namespace
**Context**: The command definition uses spec_kit.* namespace (e.g., spec_kit.check_prereqs), but the actual MCP tools in this codebase use mcp__plugin_speckit_speckit__* namespace.
**Question**: What MCP tool namespace should the clarify command reference? Should it use the exact MCP tool names, or is spec_kit.* a simplified alias that Claude Code resolves?
**Options**:
- A: Use full MCP names (mcp__plugin_speckit_speckit__*)
- B: Use simplified spec_kit.* - Claude Code resolves these
- C: Use agency_spec_kit.* - new plugin-specific namespace

**Answer**: C - Use agency_spec_kit.* as the new plugin-specific namespace for MCP tools. This provides a clean namespace for the Claude Code plugin that's distinct from the existing speckit plugin.

