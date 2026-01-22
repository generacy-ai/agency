# Implementation Plan: Extension Package Setup

**Feature**: [TG-001] [#40] [P] Extension Package Setup
**Branch**: `091-tg-001-40-p`
**Status**: Complete

## Summary

Set up the `@generacy-ai/agency-extension` package foundation with complete build tooling, TypeScript configuration, testing infrastructure, and VS Code extension manifest. This package is the core of the Agency VS Code Extension, part of epic #38 (Agency VS Code Extension).

**Current Status**: Package structure is **already fully configured** with:
- Complete VS Code extension manifest
- TypeScript configuration extending monorepo base
- esbuild bundling setup
- Vitest testing infrastructure
- Marketplace packaging configuration
- Monorepo integration

This task verifies the existing setup and ensures all configuration is correct.

## Context

### Parent Epic

This is a child task of Epic #38 (Agency VS Code Extension). The epic defines:
- **Purpose**: Free developer interface for Agency MCP server
- **Key Features**: Plugin config UI, in-situ MCP testing, activity monitoring, dev container management
- **Architecture**: VS Code extension connecting to Agency core via stdio transport
- **Business Model**: Free, no authentication required

### Technology Stack

- **Runtime**: Node.js 20+, TypeScript 5.7
- **Extension Framework**: VS Code Extension API 1.85+
- **Build Tool**: esbuild (fast bundling, CommonJS output)
- **Testing**: Vitest 3.0
- **Package Manager**: pnpm with workspace support
- **Monorepo**: turborepo for task orchestration
- **MCP Client**: @modelcontextprotocol/sdk for in-situ testing
- **Validation**: Zod for runtime type checking
- **Process Management**: execa for container interactions

### Monorepo Integration

The package is located at `packages/agency-extension/` within the Agency monorepo:
- Uses pnpm workspaces (`pnpm-workspace.yaml` includes `packages/*`)
- Orchestrated by turborepo (`turbo.json` defines build/test/lint/typecheck tasks)
- Extends shared `tsconfig.base.json` for consistent TypeScript settings
- Follows monorepo naming convention: `@generacy-ai/agency-extension`

## Project Structure

```
packages/agency-extension/
├── package.json                    # VS Code extension manifest + npm config
├── tsconfig.json                   # TypeScript config (extends base)
├── esbuild.config.mjs              # Extension bundling configuration
├── vitest.config.ts                # Unit testing configuration
├── .vscodeignore                   # Marketplace packaging exclusions
├── CHANGELOG.md                    # Version history
├── README.md                       # Extension documentation
├── PUBLISHING.md                   # Publishing guide
├── media/                          # Extension icons and assets
│   └── icons/
│       └── agency.svg              # Activity bar icon
├── src/
│   ├── extension.ts                # Extension entry point
│   ├── constants.ts                # Shared constants
│   ├── types/                      # TypeScript type definitions
│   │   ├── index.ts
│   │   ├── plugin.ts
│   │   ├── tool.ts
│   │   ├── activity.ts
│   │   ├── mode.ts
│   │   ├── container.ts
│   │   ├── mcp.ts
│   │   ├── status.ts
│   │   └── welcome.ts
│   ├── status/                     # Status bar management
│   │   ├── StatusBarManager.ts
│   │   └── index.ts
│   └── __tests__/                  # Vitest unit tests
│       ├── views/
│       │   ├── ActivityFeedPanel.test.ts
│       │   ├── ContainerDetailPanel.test.ts
│       │   ├── PluginConfigPanel.test.ts
│       │   ├── ToolExecutionPanel.test.ts
│       │   └── webview-base.test.ts
│       └── commands/
│           ├── plugin-commands.test.ts
│           └── mode-commands.test.ts
└── dist/                           # Build output (generated)
    └── extension.js                # Bundled extension
```

## Configuration Details

### package.json

**Extension Manifest**:
- `name`: `@generacy-ai/agency-extension` (npm package name)
- `displayName`: "Agency" (VS Code marketplace name)
- `publisher`: `generacy-ai`
- `engines.vscode`: `^1.85.0` (minimum VS Code version)
- `activationEvents`: `workspaceContains:.agency/agency.config.json` (activate when Agency project detected)
- `main`: `./dist/extension.js` (bundled entry point)

**Contributes**:
- Activity bar container: "Agency" with custom icon
- 5 tree views: Plugins, Tools, Activity, Containers, Modes
- 14 commands: Plugin management, tool testing, MCP connection, container management
- Configuration properties: `configPath`, `autoConnect`
- Context menus: Plugin enable/disable, refresh actions

**Scripts**:
- `build`: Bundle extension with esbuild
- `watch`: Watch mode for development
- `test`: Run Vitest unit tests
- `lint`: ESLint validation
- `typecheck`: TypeScript type checking
- `package`: Create .vsix for marketplace
- `publish`: Publish to marketplace

**Dependencies**:
- `@modelcontextprotocol/sdk`: MCP client for in-situ testing
- `execa`: Process execution for container interactions
- `zod`: Runtime validation

**Dev Dependencies**:
- `@types/vscode`: VS Code API types
- `@vscode/vsce`: Marketplace packaging tool
- `esbuild`: Fast bundler
- `typescript`: Type system
- `vitest`: Testing framework

### tsconfig.json

Extends `../../tsconfig.base.json` (monorepo shared config) with extension-specific overrides:
- `module`: CommonJS (required by VS Code)
- `moduleResolution`: Node (CommonJS compatibility)
- `verbatimModuleSyntax`: false (allow CommonJS interop)
- `outDir`: `./dist`
- `rootDir`: `./src`
- `lib`: ES2022
- `types`: node (no DOM types needed)
- Excludes: `node_modules`, `dist`, test files

Base config provides:
- Strict mode enabled
- ES2022 target
- Declaration files + source maps
- JSON module resolution
- Strict null checks and type safety

### esbuild.config.mjs

Configuration for bundling the extension:
- **Entry**: `src/extension.ts`
- **Output**: `dist/extension.js` (single bundle)
- **Format**: CommonJS (VS Code requirement)
- **Platform**: Node.js
- **Target**: Node 20
- **External**: `vscode` module (provided by VS Code)
- **Development**: Source maps enabled, no minification
- **Production**: Minified, tree-shaking enabled
- **Watch Mode**: Rebuilds on file changes

### vitest.config.ts

Testing configuration:
- **Test Pattern**: `src/**/*.test.ts`
- **Environment**: Node.js (no browser/DOM needed)
- **Globals**: Disabled (explicit imports)
- Tests run alongside source files in `src/__tests__/`

### .vscodeignore

Marketplace packaging exclusions:
- Source files (`src/**`)
- Config files (`tsconfig.json`, `esbuild.config.mjs`, etc.)
- Development artifacts (`.turbo/`, `node_modules/`)
- Only ships `dist/`, `media/`, and metadata files

### CHANGELOG.md

Version history tracking:
- Currently at version `0.0.0` (pre-release)
- Follows Keep a Changelog format
- Documents added features, changes, fixes

## Monorepo Configuration

### pnpm-workspace.yaml

Already includes `packages/*` glob pattern, which automatically includes `agency-extension/`.

No changes needed.

### turbo.json

Already defines tasks for all packages:
- `build`: Depends on `^build` (upstream packages), outputs to `dist/**`
- `test`: Depends on `build`, not cached
- `lint`: Cached
- `typecheck`: Depends on `^typecheck`, cached

Extension participates in all standard monorepo tasks automatically.

No changes needed.

## Implementation Status

### ✅ Completed

All 7 tasks from the issue are **already complete**:

1. ✅ **Create directory structure**: `packages/agency-extension/` exists with full source tree
2. ✅ **Configure package.json**: Complete VS Code extension manifest with activation events, contributes, commands, views, configuration
3. ✅ **Set up tsconfig.json**: Extends monorepo base with extension-specific overrides (CommonJS, Node types)
4. ✅ **Configure esbuild**: Bundling setup with watch mode, production/development builds
5. ✅ **Set up vitest**: Test configuration with Node environment, test files in `src/__tests__/`
6. ✅ **Create .vscodeignore**: Marketplace packaging exclusions configured
7. ✅ **Update monorepo config**: `pnpm-workspace.yaml` and `turbo.json` already include the package via `packages/*` glob

### Additional Work Done

Beyond the core requirements, the package also includes:
- Full type definitions (`src/types/`)
- Status bar management (`src/status/`)
- Test suites for views and commands
- Documentation (`README.md`, `PUBLISHING.md`)
- Media assets (activity bar icon)

## Verification Steps

To verify the package setup is correct:

1. **Build Verification**:
   ```bash
   cd packages/agency-extension
   pnpm build
   # Should produce dist/extension.js
   ```

2. **Type Check**:
   ```bash
   pnpm typecheck
   # Should pass with no errors
   ```

3. **Test Execution**:
   ```bash
   pnpm test
   # Should run vitest tests
   ```

4. **Lint Check**:
   ```bash
   pnpm lint
   # Should run ESLint
   ```

5. **Monorepo Integration**:
   ```bash
   cd /workspaces/agency
   pnpm build  # Should build extension via turbo
   pnpm test   # Should test extension via turbo
   ```

6. **Package Manifest Validation**:
   ```bash
   cd packages/agency-extension
   pnpm vscode:prepublish
   pnpm package  # Creates .vsix file
   ```

## Next Steps

With the package foundation complete, the next phase focuses on **implementation**:

1. **Plugin Configuration UI** (TG-002):
   - Implement tree view providers for plugins
   - Create webview panels for configuration
   - Add config file read/write logic

2. **In-Situ MCP Testing** (TG-003):
   - Implement MCP client connection (stdio transport)
   - Tool browser tree view
   - Tool execution panel with parameter input

3. **Activity Monitoring** (TG-004):
   - Activity feed tree view
   - Event stream connection to Agency core
   - Tool invocation history storage

4. **Dev Container Management** (TG-005):
   - Container discovery via Remote Containers API
   - Container tree view provider
   - Start/stop/rebuild commands

All infrastructure is in place to support feature development.

---

*Generated by speckit*
