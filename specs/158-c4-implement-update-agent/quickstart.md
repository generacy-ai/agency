# Quickstart: update_agent Tool

## Installation

The tool is part of the `@generacy-ai/agency-plugin-spec-kit` package. No additional installation required.

## Usage

### Update All Existing Agent Files

Updates all agent context files that exist in the repository with technology info from the current feature's plan.md.

```typescript
// MCP Tool Call
{
  "tool": "spec_kit.update_agent",
  "params": {
    "feature_dir": "/workspaces/agency/specs/042-my-feature"
  }
}
```

### Update Specific Agent

Update only the Claude context file:

```typescript
{
  "tool": "spec_kit.update_agent",
  "params": {
    "agent_type": "claude",
    "feature_dir": "/workspaces/agency/specs/042-my-feature"
  }
}
```

### Create Agent File If Missing

Create a new agent file from template if it doesn't exist:

```typescript
{
  "tool": "spec_kit.update_agent",
  "params": {
    "agent_type": "claude",
    "create_if_missing": true,
    "feature_dir": "/workspaces/agency/specs/042-my-feature"
  }
}
```

## Supported Agent Types

| Agent Type | Context File |
|------------|--------------|
| `claude` | `CLAUDE.md` |
| `gemini` | `GEMINI.md` |
| `copilot` | `.github/agents/copilot-instructions.md` |
| `cursor-agent` | `.cursor/rules/agent.mdc` |
| `windsurf` | `.windsurfrules` |
| `qwen` | `QWEN.md` |
| `opencode` | `OPENCODE.md` |
| `codex` | `CODEX.md` |
| `kilocode` | `.kilocode/rules.md` |
| `auggie` | `.augment/agent.md` |
| `roo` | `.roo/rules.md` |
| `codebuddy` | `.codebuddy/agent.md` |
| `qoder` | `.qoder/agent.md` |
| `amp` | `AGENT.md` |
| `shai` | `.shai/instructions.md` |
| `q` | `.amazonq/rules.md` |
| `bob` | `.bob/agent.md` |

## Expected plan.md Format

The tool extracts technology information from these fields in plan.md:

```markdown
**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 18, TailwindCSS
**Storage**: PostgreSQL
**Testing**: Vitest
**Project Type**: Web Application
```

## Output Format

```json
{
  "success": true,
  "updated": [
    {
      "agent": "claude",
      "filePath": "/workspaces/agency/CLAUDE.md",
      "created": false
    }
  ],
  "skipped": ["gemini", "copilot"],
  "plan_data": {
    "language": "TypeScript 5.x",
    "dependencies": "React 18, TailwindCSS"
  }
}
```

## Troubleshooting

### "plan.md not found"

Ensure the `feature_dir` parameter points to a directory containing a `plan.md` file. Run `/speckit:plan` first if needed.

### "File does not exist" for specific agent

When `agent_type` is specified but the file doesn't exist:
- Set `create_if_missing: true` to create from template
- Or manually create the agent file first

### No files updated

When updating all agents (no `agent_type` specified), only existing files are updated. Check `skipped` array in response to see which agents were skipped.
