# Implementation Plan: Configuration Schema & File Management

**Feature**: TG-005 - Configuration Schema & File Management
**Branch**: `044-tg-005-us1-configuration`
**Status**: In Progress
**Parent Epic**: #38 - Agency VS Code Extension

## Summary

Implement the configuration schema and file management layer for the Agency VS Code extension. This includes Zod schemas for type-safe configuration, file read/write operations for `.agency/agency.config.json`, and a file watcher for external changes.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| zod | 3.x | Runtime schema validation |
| VS Code Extension API | 1.85+ | FileSystemWatcher, workspace API |
| Node.js | 20+ | Runtime environment |

## Project Structure

```
packages/agency-extension/src/
├── config/
│   ├── index.ts              # Config module exports
│   ├── ConfigSchema.ts       # Zod schemas for all config types
│   ├── ConfigFile.ts         # File read/write operations
│   └── defaults.ts           # Default configuration values
└── __tests__/
    └── services/
        └── ConfigService.test.ts  # Unit tests (schema + file ops)
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   ConfigFile                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   read()    │  │   write()   │  │   watch()   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
└─────────┼────────────────┼────────────────┼─────────┘
          │                │                │
          ▼                ▼                ▼
     ┌─────────────────────────────────────────┐
     │           ConfigSchema (Zod)            │
     │  ┌─────────┐ ┌─────────┐ ┌───────────┐ │
     │  │ Agency  │ │ Plugin  │ │   Mode    │ │
     │  │ Config  │ │ Config  │ │  Config   │ │
     │  └─────────┘ └─────────┘ └───────────┘ │
     └─────────────────────────────────────────┘
                        │
                        ▼
              ┌─────────────────┐
              │   defaults.ts   │
              │ (default values)│
              └─────────────────┘
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
  inherits?: string;
  tools: string[];
}

interface ContainerConfig {
  id: string;
  name: string;
  workspacePath: string;
  dockerComposePath?: string;
}
```

### ConfigFile Interface

```typescript
interface ConfigFile {
  read(configPath: string): Promise<AgencyConfig | null>;
  write(configPath: string, config: AgencyConfig): Promise<void>;
  exists(configPath: string): Promise<boolean>;
  watch(configPath: string, callback: (config: AgencyConfig | null) => void): vscode.Disposable;
}
```

## Implementation Steps

1. **ConfigSchema.ts**: Define Zod schemas with proper validation
2. **defaults.ts**: Define sensible defaults for new installations
3. **ConfigFile.ts**: Implement file operations with error handling
4. **index.ts**: Export all config module components
5. **Tests**: Unit tests for schema validation and file operations

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema library | Zod | Type-safe, good inference, already in dependencies |
| File format | JSON | Human-readable, standard, VS Code compatible |
| Config path | `.agency/agency.config.json` | Explicit, versionable, per-workspace |
| Watcher | VS Code FileSystemWatcher | Native integration, handles platform differences |

## Error Handling

- Invalid JSON: Return null, log warning
- Schema validation failure: Return null, log validation errors
- File not found: Return null (expected for new workspaces)
- Write failures: Throw with descriptive error message

## Success Criteria

- All Zod schemas compile and validate correctly
- File read/write operations handle all edge cases
- File watcher triggers on external changes
- Default config can be written and read back successfully
- Unit tests cover all schema types and file operations

---

*Generated for epic child issue #44*
