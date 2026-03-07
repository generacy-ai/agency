# Quickstart: Speckit Commands via npm

## Installation

```bash
# Install the package (if not already in your project)
pnpm add @generacy-ai/agency-plugin-spec-kit

# Copy commands to ~/.claude/commands/agency-spec-kit/
npx agency-spec-kit install-commands
```

## Usage

After running `install-commands`, speckit commands are available in Claude Code:

```
/agency-spec-kit:specify   - Create a new feature spec
/agency-spec-kit:clarify   - Identify underspecified areas
/agency-spec-kit:plan      - Generate implementation plan
/agency-spec-kit:tasks     - Generate task list
/agency-spec-kit:implement - Execute tasks
/agency-spec-kit:checklist - Generate quality checklist
/agency-spec-kit:analyze   - Run consistency analysis
/agency-spec-kit:constitution - Manage governance principles
/agency-spec-kit:taskstoissues - Convert tasks to GitHub issues
```

## Programmatic Access

```typescript
import { commandsDir } from '@generacy-ai/agency-plugin-spec-kit/commands';

console.log(commandsDir);
// => /path/to/node_modules/@generacy-ai/agency-plugin-spec-kit/commands
```

## Custom Target Directory

```bash
npx agency-spec-kit install-commands --target /custom/path/agency-spec-kit
```

## Troubleshooting

### Commands not appearing in Claude Code
1. Verify files were copied: `ls ~/.claude/commands/agency-spec-kit/`
2. Re-run: `npx agency-spec-kit install-commands`
3. Restart Claude Code session

### Permission errors
Ensure write access to `~/.claude/commands/`. The directory is created automatically if it doesn't exist.
