# Tasks: Configuration Schema & File Management

**Input**: Design documents from `/specs/044-tg-005-us1-configuration/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Complete
**Parent Epic**: #38 (TG-005)

## Format: `[ID] Description`

---

## Phase 1: Schema Definition

### T001 Implement Zod schemas in ConfigSchema.ts
**Files**: `packages/agency-extension/src/config/ConfigSchema.ts`

- [X] Create `PluginConfigSchema` with id, enabled, settings fields
- [X] Create `ModeConfigSchema` with id, name, inherits, tools fields
- [X] Create `ContainerConfigSchema` with id, name, workspacePath, dockerComposePath fields
- [X] Create `AgencyConfigSchema` combining all schemas with version field
- [X] Export TypeScript types inferred from schemas
- [X] Add validation helpers for individual configs

---

### T002 Define default configuration in defaults.ts
**Files**: `packages/agency-extension/src/config/defaults.ts`

- [X] Define `DEFAULT_CONFIG_VERSION` constant
- [X] Create `createDefaultConfig()` function returning empty but valid AgencyConfig
- [X] Export default values for use in ConfigFile

---

## Phase 2: File Operations

### T003 [P] Implement ConfigFile.ts for read/write operations
**Files**: `packages/agency-extension/src/config/ConfigFile.ts`

- [X] Implement `readConfig(configPath)` with JSON parsing and schema validation
- [X] Implement `writeConfig(configPath, config)` with directory creation
- [X] Implement `configExists(configPath)` check
- [X] Handle file not found, invalid JSON, and schema validation errors
- [X] Add logging for debugging

---

### T004 [P] Implement file watcher for external changes
**Files**: `packages/agency-extension/src/config/ConfigFile.ts`

- [X] Implement `watchConfig(configPath, callback)` using VS Code FileSystemWatcher
- [X] Debounce rapid changes to prevent excessive reloads
- [X] Return Disposable for cleanup
- [X] Handle watcher errors gracefully

---

### T005 Create config module exports in index.ts
**Files**: `packages/agency-extension/src/config/index.ts`

- [X] Export all schemas from ConfigSchema.ts
- [X] Export all types from ConfigSchema.ts
- [X] Export all functions from ConfigFile.ts
- [X] Export defaults from defaults.ts

---

## Phase 3: Testing

### T006 Write unit tests for schema validation and file operations
**Files**: `packages/agency-extension/src/__tests__/config/ConfigSchema.test.ts`, `packages/agency-extension/src/__tests__/config/defaults.test.ts`, `packages/agency-extension/src/__tests__/config/ConfigFile.test.ts`

- [X] Test valid config parsing through schema
- [X] Test invalid config rejection with proper errors
- [X] Test default config generation
- [X] Test file read with valid config file
- [X] Test file read with missing file (returns null)
- [X] Test file read with invalid JSON
- [X] Test file write creates directories if needed
- [X] Test file write produces valid JSON

---

## Dependencies

- T001 and T002 can run in parallel (no dependencies)
- T003 and T004 depend on T001, T002 (schemas must exist first)
- T003 and T004 can run in parallel with each other
- T005 depends on T001, T002, T003, T004
- T006 depends on T005 (needs complete module to test)

## Execution Order

```
[T001] ──┬──> [T003] ──┬
         │             │
[T002] ──┤   [T004] ──┼──> [T005] ──> [T006]
         │             │
         └─────────────┘
```

---

*Generated for epic child issue #44*
