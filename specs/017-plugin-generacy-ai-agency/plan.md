# Implementation Plan: Plugin: @generacy-ai/agency-plugin-npm

**Feature**: NPM Plugin for Node.js build and test operations
**Branch**: `017-plugin-generacy-ai-agency`
**Status**: Complete

## Summary

Implement the `@generacy-ai/agency-plugin-npm` package that provides MCP tools for npm-ecosystem operations. The plugin auto-detects the package manager (npm, yarn, pnpm) from lockfiles and provides 8 tools for dependency management, building, linting, formatting, and testing. All tools follow the terse output pattern with minimal success messages and detailed failure output.

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Module System | ES2022 (ESM) |
| Build Tool | tsc |
| Test Framework | vitest |
| Package Manager | pnpm (workspace) |
| Core Dependency | @generacy-ai/agency (workspace:*) |

## Project Structure

```
packages/agency-plugin-npm/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                    # Plugin entry point, exports AgencyPlugin
│   ├── manifest.ts                 # Plugin manifest definition
│   ├── config.ts                   # Configuration types and defaults
│   ├── pm/                         # Package manager detection
│   │   ├── index.ts
│   │   ├── types.ts                # PackageManager type, detection result
│   │   ├── detect.ts               # Lockfile-based detection
│   │   └── commands.ts             # PM-specific command builders
│   ├── scripts/                    # Script validation
│   │   ├── index.ts
│   │   └── validate.ts             # Check package.json for scripts
│   ├── exec/                       # Command execution
│   │   ├── index.ts
│   │   └── runner.ts               # Spawn process, capture output
│   └── tools/                      # Tool implementations
│       ├── index.ts                # Tool registration
│       ├── schemas.ts              # Zod schemas for tool params
│       ├── build/
│       │   ├── install-dependencies.ts
│       │   ├── compile.ts
│       │   ├── lint.ts
│       │   └── format.ts
│       └── test/
│           ├── run-unit.ts
│           ├── run-integration.ts
│           ├── run-e2e.ts
│           └── run-coverage.ts
└── tests/
    ├── pm/
    │   └── detect.test.ts
    ├── scripts/
    │   └── validate.test.ts
    ├── tools/
    │   ├── build.test.ts
    │   └── test.test.ts
    └── fixtures/
        ├── npm-project/            # package-lock.json
        ├── yarn-project/           # yarn.lock
        ├── pnpm-project/           # pnpm-lock.yaml
        └── monorepo/               # Workspace setup
```

## Implementation Approach

### Phase 1: Foundation

1. **Package Setup** - Create package.json, tsconfig.json, vitest.config.ts with proper workspace dependencies
2. **Plugin Manifest** - Define the plugin manifest with tool list and mode affiliations
3. **Configuration Types** - Define NpmPluginConfig interface with packageManager and scripts options

### Phase 2: Package Manager Detection

1. **Detection Logic** - Check for lockfiles in order: pnpm-lock.yaml, yarn.lock, package-lock.json
2. **Command Builders** - Map generic operations to PM-specific commands (install, run, exec)
3. **Workspace Support** - Handle --filter (pnpm), --scope (yarn), -w (npm) flags

### Phase 3: Core Utilities

1. **Script Validation** - Read package.json and verify script exists before execution
2. **Command Execution** - Spawn child process, capture stdout/stderr, handle exit codes
3. **Output Formatting** - Apply terse output pattern with recovery suggestions

### Phase 4: Tool Implementation

1. **Build Tools** - install_dependencies, compile, lint, format
2. **Test Tools** - run_unit, run_integration, run_e2e, run_coverage
3. **Common Parameters** - All tools accept cwd and workspace optional params

### Phase 5: Integration

1. **Plugin Entry Point** - Initialize function registers all tools with AgencyCoreAPI
2. **Mode Registration** - Register mode affiliations (coding: all, review: lint only)
3. **Testing** - Unit tests for detection, validation, and tool execution

## Key Technical Decisions

| Decision | Rationale |
|----------|-----------|
| Lockfile-based detection | Most reliable indicator of which PM is actually used |
| No Bun support | Per spec - deferred to future version |
| Explicit script names | Fail clearly if script not found vs guessing variants |
| Child process spawn | Direct spawning gives best control over output capture |
| Zod for param validation | Consistent with core package patterns |

## Dependencies

### Runtime
- `@generacy-ai/agency` (workspace:*) - Core package for plugin APIs

### Development
- `typescript` - Type checking and compilation
- `vitest` - Unit testing framework
- `@types/node` - Node.js type definitions

## Tool Specifications

### Common Parameters (all tools)

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| cwd | string | No | Working directory (defaults to process.cwd()) |
| workspace | string | No | Target specific workspace in monorepo |

### build.install_dependencies

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| production | boolean | No | Install only production dependencies |
| frozen | boolean | No | Use lockfile without updating |

**PM Command Mapping:**
- npm: `npm install [--production] [--frozen-lockfile]`
- yarn: `yarn install [--production] [--frozen-lockfile]`
- pnpm: `pnpm install [--prod] [--frozen-lockfile]`

### build.compile

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| script | string | No | Build script name (default: configured value) |

### build.lint

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| fix | boolean | No | Auto-fix linting issues |
| script | string | No | Lint script name (default: configured value) |

### build.format

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| check | boolean | No | Check formatting only, don't write |
| script | string | No | Format script name (default: configured value) |

### test.run_unit / test.run_integration / test.run_e2e

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pattern | string | No | Test file pattern to run |
| watch | boolean | No | Run in watch mode |
| script | string | No | Test script name (default varies by type) |

### test.run_coverage

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| pattern | string | No | Test file pattern to run |
| threshold | number | No | Minimum coverage percentage |
| script | string | No | Coverage script name |

## Output Patterns

### Success Examples
```
Dependencies installed.
Build completed.
Lint passed.
All tests passed.
Coverage: 85.2%
```

### Failure Examples
```
Build failed (exit code 1):

> tsc

src/index.ts:42:5 - error TS2322: Type 'string' is not assignable to type 'number'.

Recovery: Fix the type error and run again.
```

```
Script not found: 'build:custom'

Available scripts in package.json:
  - build
  - test
  - lint

Recovery: Update configuration to use an existing script name.
```

## Mode Affiliations

```typescript
const modeAffiliations = {
  'coding': ['build.*', 'test.*'],
  'review': ['build.lint']
};
```

## Configuration Schema

```typescript
interface NpmPluginConfig {
  /** Package manager to use. 'auto' for lockfile detection. */
  packageManager: 'auto' | 'npm' | 'yarn' | 'pnpm';

  /** Script name mappings */
  scripts: {
    build?: string;      // Default: 'build'
    test?: string;       // Default: 'test'
    lint?: string;       // Default: 'lint'
    format?: string;     // Default: 'format'
    'test:integration'?: string;
    'test:e2e'?: string;
    'test:coverage'?: string;
  };
}
```

## Testing Strategy

1. **Unit Tests**
   - Package manager detection from lockfiles
   - Script validation logic
   - Command building for each PM

2. **Integration Tests**
   - Tool execution in fixture projects
   - Success and failure output formatting
   - Workspace parameter handling

3. **Fixtures**
   - Minimal projects with different PMs
   - Monorepo structure for workspace tests
   - Projects with missing scripts for error testing

## Next Steps

Run `/speckit:tasks` to generate the detailed task list from this plan.

---

*Generated by speckit*
