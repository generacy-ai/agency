# Implementation Plan: Scaffold agency-plugin-spec-kit Package Structure

**Feature**: Create initial package structure for `@generacy-ai/agency-plugin-spec-kit`
**Branch**: `140-f1-scaffold-agency-plugin`
**Status**: Complete

## Summary

Create the foundational package structure for the Agency spec-kit plugin, following the established patterns from `@generacy-ai/agency-plugin-git`. This plugin will provide specification management tools for agents, enabling structured feature development workflows.

## Technical Context

| Aspect | Details |
|--------|---------|
| Language | TypeScript 5.7+ |
| Runtime | Node.js 20+ |
| Module System | ES Modules (type: "module") |
| Build Tool | TypeScript compiler (tsc) |
| Package Manager | pnpm 9.15+ with workspaces |
| Test Framework | Vitest 3.0+ |
| Monorepo Tool | Turborepo |

## Dependencies

### Peer Dependencies
- `@generacy-ai/agency` - Core Agency framework (workspace:*)

### Dev Dependencies
- `@generacy-ai/agency` - For development (workspace:*)
- `typescript` - ^5.7.3
- `@types/node` - ^20.17.12
- `vitest` - ^3.0.4

## Project Structure

```
packages/agency-plugin-spec-kit/
├── package.json              # Package config with agency metadata
├── tsconfig.json             # TypeScript config extending base
├── vitest.config.ts          # Vitest configuration
├── src/
│   ├── index.ts              # Public API exports
│   ├── plugin.ts             # SpecKitPlugin class (skeleton)
│   ├── manifest.ts           # Plugin manifest definition
│   ├── config.ts             # Configuration schema and defaults
│   ├── types/
│   │   └── index.ts          # Shared type definitions
│   ├── providers/
│   │   └── index.ts          # Provider interfaces (future)
│   ├── tools/
│   │   └── index.ts          # Tool exports (skeleton)
│   └── utils/
│       └── index.ts          # Utility functions
└── tests/
    └── plugin.test.ts        # Basic plugin tests
```

## Key Design Decisions

### 1. Package Naming Convention
- Package name: `@generacy-ai/agency-plugin-spec-kit`
- Plugin ID: `@generacy-ai/agency-plugin-spec-kit`
- Directory: `packages/agency-plugin-spec-kit/`

### 2. Plugin Architecture
Following the `AgencyPlugin` interface pattern from agency-plugin-git:
- `manifest` - Static plugin metadata
- `initialize(core)` - Register tools with core API
- `shutdown()` - Cleanup and unregister tools
- `onModeChange(mode)` - React to mode switches

### 3. Tool Namespace
Tool IDs will use the `spec.` prefix:
- `spec.create` - Create new feature spec
- `spec.validate` - Validate spec structure
- `spec.list` - List feature specs
- Future tools as needed

### 4. Mode Affiliations
The plugin will be available in modes:
- `research` - Spec exploration and analysis
- `coding` - Spec-driven development

## Implementation Order

1. **Package configuration** (package.json, tsconfig.json)
2. **Entry point** (src/index.ts)
3. **Plugin skeleton** (src/plugin.ts, src/manifest.ts)
4. **Configuration** (src/config.ts)
5. **Directory structure** (types/, providers/, tools/, utils/)
6. **Basic tests** (tests/plugin.test.ts)
7. **Workspace integration** (verify pnpm install)

## Acceptance Criteria Mapping

| Criterion | Implementation |
|-----------|----------------|
| Create `packages/agency-plugin-spec-kit/` directory | Create directory structure |
| Set up `package.json` with correct agency metadata | Copy pattern from agency-plugin-git |
| Create `tsconfig.json` extending base config | Extend `../../tsconfig.base.json` |
| Set up basic directory structure | Create all required directories and files |
| Add to workspace in root `package.json` | Workspace already uses `packages/*` glob |
| Verify `pnpm install` works | Run `pnpm install` after setup |

## Notes

- The workspace configuration (`pnpm-workspace.yaml`) already includes `packages/*`, so no root changes needed
- Following the established error handling patterns from agency-plugin-git
- Initial implementation is a skeleton - actual tools will be added in subsequent features
