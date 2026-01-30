# Implementation Plan: F4: Plugin manifest, config schema, plugin.ts skeleton

**Feature**: Create the plugin manifest, configuration schema, and main plugin class skeleton for the SpecKit plugin
**Branch**: `143-f4-plugin-manifest-config`
**Status**: Complete

## Summary

This feature implements the foundational plugin structure for the SpecKit plugin, including:
- Plugin manifest with metadata and tool declarations
- Zod-based configuration schema with sensible defaults
- Plugin class skeleton implementing AgencyPlugin interface
- Index module with proper exports

## Technical Context

| Aspect | Details |
|--------|---------|
| Language | TypeScript 5.x |
| Framework | Agency Plugin System |
| Package | `@generacy-ai/agency-plugin-spec-kit` |
| Dependencies | `@generacy-ai/agency`, `@generacy-ai/agency-plugin-humancy`, `zod` |
| Location | `packages/agency-plugin-spec-kit/src/` |

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── manifest.ts          # PluginManifest definition
│   ├── config.ts            # Zod schema and config utilities
│   ├── plugin.ts            # SpecKitPlugin class
│   └── index.ts             # Public exports
└── package.json             # Package configuration
```

## Implementation Approach

### 1. manifest.ts

Create the plugin manifest following the established pattern from npm/humancy plugins:

```typescript
import type { PluginManifest } from '@generacy-ai/agency';

export const manifest: PluginManifest = {
  id: '@generacy-ai/agency-plugin-spec-kit',
  name: 'Spec Kit',
  version: '0.0.1',
  description: 'Specification-driven development toolkit with backlog provider abstraction',
  main: './dist/index.js',
  types: './dist/index.d.ts',
  dependencies: ['@generacy-ai/agency-plugin-humancy'],
  tools: [
    'spec_kit.git_ops',
    'spec_kit.create_feature',
    'spec_kit.get_paths',
    'spec_kit.check_prereqs',
    'spec_kit.copy_template',
    'spec_kit.update_agent',
    'spec_kit.get_ticket',
    'spec_kit.create_ticket',
    'spec_kit.update_ticket',
    'spec_kit.tasks_to_issues',
    'spec_kit.manage_clarifications',
  ],
  modes: ['coding', 'research'],
  critical: false,
};

export const modeAffiliations: Record<string, string[]> = {
  coding: [/* all tools */],
  research: ['spec_kit.get_ticket', 'spec_kit.get_paths', 'spec_kit.check_prereqs'],
};
```

### 2. config.ts

Create Zod-based configuration schema following the pattern from spec:

```typescript
import { z } from 'zod';

export const SpecKitConfigSchema = z.object({
  paths: z.object({
    specs: z.string().default('specs'),
    templates: z.string().default('.specify/templates'),
  }).default({}),

  branches: z.object({
    pattern: z.string().default('{paddedNumber}-{slug}'),
    numberPadding: z.number().default(3),
    maxSlugWords: z.number().default(4),
  }).default({}),

  backlog: z.object({
    provider: z.enum(['github', 'jira', 'shortcut', 'local']).default('github'),
    github: z.object({}).optional(),
    jira: z.object({
      baseUrl: z.string(),
      projectKey: z.string(),
    }).optional(),
    shortcut: z.object({
      workspaceSlug: z.string(),
    }).optional(),
  }).default({}),
});

export type SpecKitConfig = z.infer<typeof SpecKitConfigSchema>;

export const DEFAULT_CONFIG: SpecKitConfig = SpecKitConfigSchema.parse({});

export function parseConfig(raw?: unknown): SpecKitConfig {
  return SpecKitConfigSchema.parse(raw ?? {});
}
```

### 3. plugin.ts

Create the plugin class following HumancyPlugin pattern:

```typescript
import type { AgencyPlugin, AgencyCoreAPI, PluginManifest } from '@generacy-ai/agency';
import { manifest } from './manifest.js';
import { parseConfig, type SpecKitConfig } from './config.js';

const CONFIG_KEY = 'plugins.speckit';

export class SpecKitPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest = manifest;

  private coreAPI?: AgencyCoreAPI;
  private config?: SpecKitConfig;
  private cleanups: Array<() => void> = [];

  async initialize(core: AgencyCoreAPI): Promise<void> {
    this.coreAPI = core;

    // Parse configuration
    const rawConfig = core.getConfig<unknown>(CONFIG_KEY);
    this.config = parseConfig(rawConfig);

    // Tools will be registered in subsequent features (F5-F9)
    // For now, initialization completes successfully with empty tool list
  }

  async shutdown(): Promise<void> {
    for (const cleanup of this.cleanups) {
      try { cleanup(); } catch { /* ignore */ }
    }
    this.cleanups = [];
    this.coreAPI = undefined;
  }

  onModeChange?(mode: string): void {
    // Mode-specific behavior will be implemented with tools
  }

  getConfig(): SpecKitConfig | undefined {
    return this.config;
  }
}

export function createSpecKitPlugin(): SpecKitPlugin {
  return new SpecKitPlugin();
}
```

### 4. index.ts

Create the public exports module:

```typescript
export { SpecKitPlugin, createSpecKitPlugin } from './plugin.js';
export { manifest } from './manifest.js';
export { SpecKitConfigSchema, parseConfig, DEFAULT_CONFIG } from './config.js';
export type { SpecKitConfig } from './config.js';

export { createSpecKitPlugin as default } from './plugin.js';
```

## Key Decisions

| Decision | Rationale |
|----------|-----------|
| Class-based plugin | Matches HumancyPlugin pattern, allows state management |
| Zod for config | Type-safe validation with runtime checking, generates TypeScript types |
| Factory function export | Consistent with humancy plugin (`createHumancyPlugin`) |
| Empty tools initially | Tools are added in subsequent features (F5-F9) |
| Mode affiliations | Separates research-only tools from full coding tools |

## Dependencies

- **F1**: Package structure must exist (package.json, tsconfig.json)
- **F2**: Type imports from `@generacy-ai/agency`
- **F3**: BacklogProvider interface (not directly used here, but referenced in config)

## Testing Strategy

- Unit tests for config parsing with valid/invalid inputs
- Unit tests for plugin initialization/shutdown lifecycle
- Integration test: plugin loads without errors

## Success Criteria

- [ ] `src/manifest.ts` exports valid PluginManifest
- [ ] `src/config.ts` exports working Zod schema
- [ ] `src/plugin.ts` implements AgencyPlugin interface
- [ ] `src/index.ts` exports all public APIs
- [ ] Plugin initializes without errors
- [ ] TypeScript compilation succeeds
