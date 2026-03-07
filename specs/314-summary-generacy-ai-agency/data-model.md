# Data Model: Distribute Speckit Commands via npm

## Module Interfaces

### commands.ts

```typescript
/**
 * Absolute path to the commands/ directory within the installed package.
 * Resolved at import time using import.meta.url.
 */
export const commandsDir: string;

/**
 * Copies all command .md files from the package's commands/ directory
 * to the target directory.
 *
 * @param targetDir - Destination directory. Defaults to ~/.claude/commands/agency-spec-kit/
 * @returns Array of filenames that were copied
 */
export function installCommands(targetDir?: string): Promise<string[]>;
```

### cli.ts

```typescript
#!/usr/bin/env node

/**
 * CLI entry point. Supports:
 *   agency-spec-kit install-commands [--target <dir>]
 *
 * Exits with code 0 on success, 1 on error.
 */
```

### Updated index.ts exports

```typescript
// Add to existing exports:
export { commandsDir, installCommands } from './commands.js';
```

### Updated package.json fields

```jsonc
{
  "files": ["dist", "workflows", "commands"],
  "bin": {
    "agency-spec-kit": "./dist/cli.js"
  },
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./commands": { "import": "./dist/commands.js", "types": "./dist/commands.d.ts" },
    "./package.json": "./package.json"
  }
}
```

## File Artifacts

### Command files (moved, not modified)

| File | Description |
|------|------------|
| `commands/analyze.md` | Run consistency analysis |
| `commands/checklist.md` | Generate quality checklist |
| `commands/clarify.md` | Identify underspecified areas |
| `commands/constitution.md` | Manage governance principles |
| `commands/implement.md` | Execute tasks with progress tracking |
| `commands/plan.md` | Generate implementation plan |
| `commands/specify.md` | Create new feature spec |
| `commands/tasks.md` | Generate task list |
| `commands/taskstoissues.md` | Convert tasks to GitHub issues |

## Validation Rules

- `commandsDir` must resolve to an existing directory
- Directory must contain at least 1 `.md` file
- `installCommands` creates target directory recursively if it doesn't exist
- File copy always overwrites (no existence check)
