# Data Model: agency-plugin-spec-kit

**Date**: 2026-01-30
**Feature**: F1: Scaffold agency-plugin-spec-kit package structure

## Core Entities

### PluginManifest

The static plugin metadata used for registration and discovery.

```typescript
interface PluginManifest {
  id: string;                  // '@generacy-ai/agency-plugin-spec-kit'
  name: string;                // 'Spec Kit Plugin'
  version: string;             // '0.0.0'
  description: string;         // Plugin description
  main: string;                // './dist/index.js'
  types: string;               // './dist/index.d.ts'
  dependencies: string[];      // Required plugin IDs
  tools: string[];             // Tool IDs provided
  modes: string[];             // Supported modes
  critical: boolean;           // Whether failure blocks startup
}
```

### SpecKitPluginConfig

Configuration options for the plugin.

```typescript
interface SpecKitPluginConfig {
  /** Directory where feature specs are stored. Default: 'specs' */
  specDirectory: string;

  /** Directory containing spec templates. Default: '.specify/templates' */
  templateDirectory: string;
}
```

### BaseToolParams

Shared parameters for all tools (following git plugin pattern).

```typescript
interface BaseToolParams {
  /** Working directory. Defaults to process.cwd() */
  cwd?: string;
}
```

## Type Definitions

### Plugin Types

```typescript
// Re-exported from @generacy-ai/agency
type AgencyPlugin = import('@generacy-ai/agency').AgencyPlugin;
type AgencyCoreAPI = import('@generacy-ai/agency').AgencyCoreAPI;
type AgencyTool = import('@generacy-ai/agency').AgencyTool;
```

### Internal Types (Skeleton)

```typescript
// Placeholder for future tool types
// These will be defined when tools are implemented

// Example structure for future spec tools:
interface SpecInfo {
  id: string;
  name: string;
  path: string;
  status: 'draft' | 'complete';
  createdAt: string;
  updatedAt: string;
}

interface CreateSpecParams extends BaseToolParams {
  name: string;
  template?: string;
}

interface ValidateSpecParams extends BaseToolParams {
  specPath: string;
}

interface ListSpecsParams extends BaseToolParams {
  status?: 'draft' | 'complete' | 'all';
}
```

## Validation Rules

### Configuration Validation

| Field | Rule | Default |
|-------|------|---------|
| specDirectory | Non-empty string | 'specs' |
| templateDirectory | Non-empty string | '.specify/templates' |

### Tool Parameter Validation

| Field | Rule |
|-------|------|
| cwd | If provided, must be a valid directory path |

## Relationships

```
SpecKitPlugin
    │
    ├── manifest: PluginManifest
    │
    ├── config: SpecKitPluginConfig
    │
    └── tools: AgencyTool[]
            │
            └── (registered via AgencyCoreAPI)
```

## Agency Integration

### Plugin Registration Flow

```
1. AgencyCore.loadPlugin(SpecKitPlugin)
2. SpecKitPlugin.initialize(core)
   ├── Load config from core.getConfig('plugins.spec-kit')
   ├── Resolve config with defaults
   └── Register tools via core.registerTool()
3. Plugin is active and tools available
```

### Tool Registration

Tools are registered with the AgencyCoreAPI during initialization:

```typescript
// Pattern from agency-plugin-git
for (const tool of tools) {
  core.registerTool(tool);
}
```

Tools are unregistered during shutdown:

```typescript
for (const toolName of this.manifest.tools ?? []) {
  core.unregisterTool(toolName);
}
```
