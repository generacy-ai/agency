# Implementation Plan: Configuration Schema & File Management

**Feature**: [#44] [US1] Configuration Schema & File Management
**Branch**: `095-tg-005-44-us1`
**Status**: Complete

## Summary

Implement the configuration foundation for the Agency VS Code extension, including Zod schemas for type-safe configuration, file I/O for `.agency/agency.config.json`, file watching for external changes, and default configuration values. This is a foundational task for Phase 2 of the epic.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| Zod | 3.x | Runtime schema validation |
| VS Code API | 1.85+ | File system and workspace APIs |
| Node.js | 20+ | Runtime environment |
| vitest | 3.x | Testing framework |

## Project Structure

```
packages/agency-extension/
├── src/
│   ├── config/
│   │   ├── index.ts                      # Public exports
│   │   ├── ConfigSchema.ts               # Zod schemas for all config types
│   │   ├── ConfigFile.ts                 # File read/write operations
│   │   └── defaults.ts                   # Default configuration values
│   └── __tests__/
│       └── services/
│           └── ConfigService.test.ts     # Unit tests
```

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     ConfigService                            │
│                    (future integration)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
        ▼                               ▼
┌───────────────┐              ┌───────────────┐
│  ConfigFile   │              │ ConfigSchema  │
│  - read()     │              │  (Zod)        │
│  - write()    │◄─────────────┤  - validate() │
│  - watch()    │              │  - parse()    │
└───────┬───────┘              └───────────────┘
        │                               ▲
        ▼                               │
┌───────────────┐              ┌───────────────┐
│ .agency/      │              │  defaults.ts  │
│ agency.config │              │  - DEFAULT_   │
│ .json         │              │    CONFIG     │
└───────────────┘              └───────────────┘
```

## Key Interfaces

### Configuration Schema (from parent epic plan)

```typescript
interface AgencyConfig {
  version: string;
  plugins: PluginConfig[];
  modes: ModeConfig[];
  containers: ContainerConfig[];
}

interface PluginConfig {
  id: string;
  enabled: boolean;
  settings: Record<string, unknown>;
}

interface ModeConfig {
  id: string;
  name: string;
  description?: string;
  enabledPlugins: string[];
}

interface ContainerConfig {
  id: string;
  name: string;
  type: 'devcontainer' | 'docker';
  mcpServerPath?: string;
}
```

### ConfigFile API

```typescript
class ConfigFile {
  constructor(private readonly configPath: string);

  async read(): Promise<AgencyConfig>;
  async write(config: AgencyConfig): Promise<void>;
  watch(callback: (config: AgencyConfig) => void): vscode.Disposable;
  exists(): Promise<boolean>;
  getPath(): string;
}
```

## Implementation Details

### 1. ConfigSchema.ts (Zod Schemas)

Define schemas with:
- Strict validation rules
- Clear error messages
- Default values where appropriate
- Type exports via `z.infer<>`

### 2. ConfigFile.ts (File I/O)

Implement:
- **read()**: Parse JSON, validate with schema, handle missing files by returning defaults
- **write()**: Stringify config, create parent directories if needed, write atomically
- **watch()**: Use `vscode.workspace.createFileSystemWatcher()` to detect external changes
- **Error handling**: Wrap all I/O in try-catch, provide clear error messages

### 3. defaults.ts (Default Values)

Export:
- `DEFAULT_CONFIG`: Complete valid configuration
- `DEFAULT_PLUGIN_SETTINGS`: Per-plugin defaults (if needed)
- Version constant matching extension version

### 4. Testing

Test coverage:
- Schema validation (valid/invalid inputs)
- File read with missing file (returns defaults)
- File read with invalid JSON (throws error)
- File read with valid JSON (parses correctly)
- File write creates directories
- File write preserves formatting
- File watcher triggers on external changes

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Validation library | Zod | Type-safe, runtime validation with TypeScript integration |
| Config location | `.agency/agency.config.json` | Explicit, versionable, shareable across team |
| File watcher | VS Code FileSystemWatcher | Native integration, cross-platform support |
| Error handling | Try-catch with typed errors | Clear error messages for debugging |
| Default handling | Return defaults on missing file | Zero-config experience for new users |

## Dependencies

Runtime:
- `zod`: ^3.24.0 (already in parent package.json)
- `vscode`: ^1.85.0 (peer dependency)

Dev:
- `vitest`: ^3.0.0 (already in parent package.json)

## Success Criteria

- [ ] All Zod schemas defined and exported
- [ ] ConfigFile class implements read/write/watch
- [ ] File watcher correctly detects external changes
- [ ] Default configuration is valid and complete
- [ ] Unit tests achieve >90% coverage
- [ ] No runtime dependencies beyond zod and vscode

## Out of Scope

- ConfigService integration (future task)
- UI for editing configuration (future task)
- Migration logic for config version changes (future task)
- Validation of plugin-specific settings (plugin responsibility)

---

*Generated by speckit*
