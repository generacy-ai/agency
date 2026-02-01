# Research: E5: Claude Code plugin: clarify command

## Technology Decisions

### 1. User Input Mechanism

**Decision**: Use AskUserQuestion tool and direct prompts instead of Humancy SDK

**Rationale**:
- Humancy VS Code panel integration adds unnecessary complexity
- Direct prompts work natively within Claude Code session
- No external dependencies required
- Immediate feedback loop with user

**Alternatives Considered**:
- Humancy SDK/API - Requires additional setup and documentation
- File-based async questions - Poor user experience, no immediate interaction

### 2. Plugin Directory Structure

**Decision**: Create `commands/` directory if missing

**Rationale**:
- Self-contained implementation without blocking dependencies
- Plugin scaffold may not exist from F5 task
- Creating missing directories is non-destructive

**Alternatives Considered**:
- Block on F5 dependency - Would delay implementation unnecessarily
- Assume scaffold exists - Risk of failure if not present

### 3. MCP Tool Namespace

**Decision**: Use `agency_spec_kit.*` as plugin-specific namespace

**Rationale**:
- Clean separation from existing `speckit` namespace
- Matches plugin naming convention (`agency-spec-kit`)
- Provides clear identity for Claude Code plugin tools

**Alternatives Considered**:
- Full MCP names (`mcp__plugin_speckit_speckit__*`) - Verbose, hard to read
- Simplified `spec_kit.*` - Could conflict with existing implementation

## Implementation Patterns

### Command File Structure

Claude Code plugin commands follow this pattern:

```markdown
---
description: Short description for command listing
---

# Command Name

Brief explanation of what the command does.

## Arguments

- `$ARGUMENTS`: Description of arguments

## Instructions

### Step N: Step Title

Detailed instructions for each step with MCP tool calls.

## Constraints

- List of limitations and boundaries

## Post-Command Check

Standard check for workflow continuation.
```

### Question Persistence Pattern

Questions are persisted to `clarifications.md` before presenting to users:
1. Prevents data loss if session ends
2. Enables GitHub posting for async workflows
3. Supports iterative clarification across sessions

### Label State Machine

```
Start → Questions Persisted → waiting-for:clarification
                                     ↓
                            User Answers Questions
                                     ↓
                            completed:clarification (set by user)
                                     ↓
                            Labels cleaned up → End
```

## Key Sources

1. **Existing speckit clarify command**: `/workspaces/claude-plugins/plugins/speckit/commands/clarify.md`
   - Reference implementation for question format and workflow

2. **MCP Tool Documentation**: The manage_clarifications tool provides:
   - `read` - Get existing questions and answers
   - `append` - Add new questions with batch headers
   - `update_answer` - Store user answers

3. **Plugin Manifest**: `.claude-plugin/plugin.json`
   - Declares MCP server dependency
   - Defines plugin metadata

## Integration Points

### With Other Commands

| Command | Integration |
|---------|-------------|
| `/specify` | Clarify runs after specify to resolve ambiguities |
| `/plan` | Plan uses clarified spec as input |
| `/implement` | May trigger clarify if implementation questions arise |

### With Workflow System

The clarify command integrates with `/autodev:continue`:
- Checks todo list for parent workflow tasks
- Updates labels for workflow state tracking
- Continues to next phase automatically
