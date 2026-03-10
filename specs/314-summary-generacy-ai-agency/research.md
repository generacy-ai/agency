# Research: Distribute Speckit Commands via npm

## Technology Decisions

### 1. File Resolution Strategy

**Decision**: Use `import.meta.url` + `fileURLToPath` to resolve the `commands/` directory relative to the package.

**Rationale**: The package uses ESM (`"type": "module"`). `import.meta.url` gives the URL of the current module, which we convert to a filesystem path and resolve `../commands/` relative to it. This works correctly whether the package is installed from npm or used via workspace link.

**Alternatives considered**:
- `__dirname`: Not available in ESM modules
- `require.resolve`: Not available in ESM without `createRequire`
- Hardcoded path: Breaks when package location changes

### 2. CLI Approach

**Decision**: Single bin script with subcommand (`agency-spec-kit install-commands`).

**Rationale**: A subcommand pattern allows future CLI extensions without adding more bin entries. The bin name `agency-spec-kit` matches the package's short name.

**Alternatives considered**:
- Separate bin per command: Pollutes `node_modules/.bin/` namespace
- No CLI, just programmatic API: Spec requires explicit CLI invocation

### 3. File Copy Strategy

**Decision**: Always overwrite, no version checking.

**Rationale**: Per clarification Q3, the npm package is authoritative. Checking versions adds complexity with no benefit since the marketplace plugin is being deprecated.

### 4. No External Dependencies

**Decision**: Use only Node.js built-in modules (`fs/promises`, `path`, `url`, `os`).

**Rationale**: The copy logic is simple (read directory, copy files). Adding a dependency like `fs-extra` is unnecessary for this scope.

## Implementation Patterns

### Path Resolution Pattern
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export const commandsDir = join(__dirname, '..', 'commands');
```

### Install Pattern
```typescript
import { mkdir, readdir, copyFile } from 'node:fs/promises';
import { homedir } from 'node:os';

export async function installCommands(targetDir?: string): Promise<string[]> {
  const dest = targetDir ?? join(homedir(), '.claude', 'commands', 'agency-spec-kit');
  await mkdir(dest, { recursive: true });
  const files = (await readdir(commandsDir)).filter(f => f.endsWith('.md'));
  await Promise.all(files.map(f => copyFile(join(commandsDir, f), join(dest, f))));
  return files;
}
```

## Key References

- Node.js ESM `import.meta.url`: https://nodejs.org/api/esm.html#importmetaurl
- Claude Code commands directory convention: `~/.claude/commands/<namespace>/`
