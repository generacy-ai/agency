# Technology Research: Extension Package Setup

**Feature**: Extension Package Setup
**Date**: 2026-01-22

## Overview

This document captures the technology decisions, alternatives considered, and rationale for the `@generacy-ai/agency-extension` package configuration.

## Key Technology Decisions

### 1. Build Tool: esbuild

**Decision**: Use esbuild for bundling the extension

**Rationale**:
- **Performance**: 10-100x faster than webpack/rollup for large codebases
- **Zero Config**: Simple API, minimal configuration needed
- **VS Code Optimized**: Produces CommonJS bundles required by VS Code
- **Watch Mode**: Fast incremental rebuilds during development
- **Tree Shaking**: Eliminates unused code for smaller bundle sizes
- **Industry Adoption**: Used by VS Code team and recommended in extension guides

**Alternatives Considered**:
- **webpack**: More mature plugin ecosystem, but slower build times and complex config
- **rollup**: Better for libraries, but less optimized for Node.js applications
- **tsup**: Wrapper around esbuild with more opinions, but adds unnecessary abstraction

**References**:
- [VS Code Extension Samples using esbuild](https://github.com/microsoft/vscode-extension-samples)
- [esbuild Documentation](https://esbuild.github.io/)

### 2. Testing Framework: Vitest

**Decision**: Use Vitest for unit testing

**Rationale**:
- **Speed**: Vite-powered, extremely fast test execution
- **Modern**: First-class TypeScript and ESM support
- **Jest-Compatible API**: Easy migration for developers familiar with Jest
- **Watch Mode**: Intelligent test re-running on file changes
- **Coverage**: Built-in code coverage via v8/istanbul
- **No Config**: Works out of the box with TypeScript

**Alternatives Considered**:
- **Jest**: More mature, but slower and requires complex TypeScript setup
- **Mocha + Chai**: Too low-level, requires more boilerplate
- **Node Test Runner**: Too basic, lacks features like watch mode and coverage

**Configuration**:
```typescript
{
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',  // No browser/DOM needed
    globals: false,       // Explicit imports for clarity
  }
}
```

**References**:
- [Vitest Documentation](https://vitest.dev/)
- [Why Vitest](https://vitest.dev/guide/why.html)

### 3. TypeScript Configuration Strategy

**Decision**: Extend monorepo `tsconfig.base.json` with extension-specific overrides

**Rationale**:
- **Consistency**: Shared strict mode, ESM settings across all packages
- **Override for VS Code**: Extension requires CommonJS module format
- **Type Safety**: Inherit strict null checks, index signature guards
- **Maintainability**: Update base config once, applies to all packages

**Extension Overrides**:
- `module: "CommonJS"` - Required by VS Code runtime
- `moduleResolution: "Node"` - CommonJS compatibility
- `verbatimModuleSyntax: false` - Allow CommonJS interop
- `lib: ["ES2022"]` - No DOM types needed
- `types: ["node"]` - Node.js types only

**Base Config Provides**:
- `strict: true` - All strict checks enabled
- `noUncheckedIndexedAccess: true` - Prevents index access bugs
- `isolatedModules: true` - Ensures each file can be compiled independently
- `declaration: true` - Generate .d.ts files for type checking

**Alternatives Considered**:
- **Standalone tsconfig**: Duplicates settings, creates config drift
- **More permissive settings**: Reduces type safety, leads to runtime errors

**References**:
- [TypeScript Monorepo Best Practices](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [VS Code Extension TypeScript Guide](https://code.visualstudio.com/api/working-with-extensions/bundling-extension#typescript-compilation)

### 4. VS Code Extension Activation

**Decision**: Use `workspaceContains:.agency/agency.config.json` activation event

**Rationale**:
- **Explicit**: Only activates when Agency config file is present
- **Performance**: Avoids unnecessary extension loading in non-Agency projects
- **User Experience**: Extension appears only when relevant
- **Convention**: Aligns with config file location decision from parent epic

**Alternatives Considered**:
- **`onStartupFinished`**: Activates in all workspaces, increases VS Code startup time
- **`onCommand`**: Requires user to explicitly run command, poor UX
- **Multiple Activation Events**: Could also activate on `.agency/` folder, but config file is more reliable signal

**References**:
- [VS Code Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [Extension Performance Best Practices](https://code.visualstudio.com/api/advanced-topics/extension-performance)

### 5. Package Manager: pnpm with Workspaces

**Decision**: Use pnpm workspaces (inherited from monorepo)

**Rationale**:
- **Disk Efficiency**: Hard links to global store, saves ~50% disk space
- **Speed**: Faster installs than npm/yarn due to content-addressable storage
- **Strictness**: Doesn't hoist dependencies by default, prevents phantom dependencies
- **Workspace Support**: First-class monorepo support with `pnpm-workspace.yaml`
- **Compatibility**: Drop-in replacement for npm, same package.json format

**Alternatives Considered**:
- **npm workspaces**: Standard, but slower and uses more disk space
- **yarn workspaces**: Good, but Yarn 1 is deprecated and Yarn 2+ has breaking changes
- **lerna**: Outdated, most features now in native workspace tools

**References**:
- [pnpm Workspaces Documentation](https://pnpm.io/workspaces)
- [Why pnpm](https://pnpm.io/motivation)

### 6. Monorepo Task Orchestration: turborepo

**Decision**: Use turborepo for build orchestration (inherited from monorepo)

**Rationale**:
- **Caching**: Local and remote caching of task outputs
- **Parallelization**: Runs independent tasks concurrently
- **Dependency Awareness**: Builds packages in correct order via `^build` syntax
- **Incremental Builds**: Only rebuilds changed packages
- **Simple Config**: Single `turbo.json` defines all tasks

**Key turbo.json Tasks**:
- `build`: Depends on `^build` (builds dependencies first), outputs `dist/**`
- `test`: Depends on `build`, not cached (always runs fresh)
- `lint`: Cached, can run independently
- `typecheck`: Depends on `^typecheck`, cached

**Alternatives Considered**:
- **Lerna**: Outdated, less efficient caching
- **Nx**: More powerful but more complex, overkill for current needs
- **Custom scripts**: Manual dependency ordering, no caching

**References**:
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Monorepo Handbook](https://monorepo.tools/)

### 7. Marketplace Packaging: .vscodeignore

**Decision**: Exclude source files and dev dependencies from published extension

**Rationale**:
- **Bundle Size**: Reduces .vsix from ~5MB to ~500KB
- **Performance**: Faster downloads and installs for users
- **Security**: Doesn't expose source code or sensitive config
- **Standard Practice**: Recommended by VS Code extension guides

**Excluded Patterns**:
- Source: `src/**`, `*.ts` (only ship compiled `dist/`)
- Config: `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.ts`
- Dev artifacts: `.turbo/`, `node_modules/`, `*.log`
- VCS: `.git/`, `.github/` (marketplace adds these automatically)

**Included**:
- `dist/extension.js` (bundled code)
- `media/` (icons, assets)
- `package.json`, `README.md`, `CHANGELOG.md`, `LICENSE`

**References**:
- [VS Code Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [.vscodeignore Documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#vscodeignore)

## Dependencies Analysis

### Production Dependencies

| Dependency | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| @modelcontextprotocol/sdk | ^1.5.0 | MCP client for in-situ testing | Official MCP SDK, ensures protocol compatibility |
| execa | ^8.0.0 | Process execution | Modern `child_process` wrapper, used for `docker exec` to connect to containers |
| zod | ^3.24.0 | Runtime validation | Type-safe schema validation for config files and API responses |

### Development Dependencies

| Dependency | Version | Purpose | Rationale |
|------------|---------|---------|-----------|
| @types/node | ^20.17.0 | Node.js type definitions | Required for TypeScript compilation |
| @types/vscode | ^1.85.0 | VS Code API types | Provides VS Code extension API types |
| @vscode/vsce | ^2.24.0 | Marketplace packaging | Official VS Code extension packaging tool |
| esbuild | ^0.20.0 | Bundler | Fast bundling for extension |
| typescript | ^5.7.0 | Type system | Compiler (inherited from monorepo root) |
| vitest | ^3.0.0 | Testing framework | Fast unit testing |

**Dependency Strategy**:
- Minimize production dependencies (only 3) to reduce bundle size
- Use caret ranges (`^`) for automatic minor/patch updates
- Share devDependencies with monorepo where possible (TypeScript, Vitest)
- Pin major versions to avoid breaking changes

## Implementation Patterns

### 1. CommonJS + VS Code API

VS Code extensions must use CommonJS format, not ESM:

```typescript
// esbuild.config.mjs
{
  format: 'cjs',           // CommonJS output
  platform: 'node',        // Node.js runtime
  external: ['vscode'],    // VS Code API provided by host
}
```

```typescript
// tsconfig.json
{
  "module": "CommonJS",
  "moduleResolution": "Node",
  "verbatimModuleSyntax": false  // Allow require() interop
}
```

**Rationale**: VS Code runtime doesn't support ESM in extensions (as of v1.85).

### 2. Bundling Strategy

**Single Bundle Approach**:
- Entry: `src/extension.ts`
- Output: `dist/extension.js` (single file)
- All dependencies bundled except `vscode` module
- Tree-shaking eliminates unused code

**Benefits**:
- Faster extension activation (one require() vs many)
- Smaller on-disk size
- No dependency resolution at runtime

**Trade-offs**:
- Source maps needed for debugging (enabled in dev builds)
- Some dynamic imports may break (use static imports)

### 3. Testing Strategy

**Unit Tests Only** (for package setup phase):
- Tests in `src/__tests__/`
- Mock VS Code API where needed
- Focus on logic, not UI (webview testing in later phases)

**Test Structure**:
```
src/__tests__/
├── views/           # Webview panel tests
├── commands/        # Command handler tests
└── providers/       # Tree view provider tests
```

**Integration Testing**:
- Deferred to later phases
- Requires VS Code Extension Test Runner
- More complex setup (headless VS Code instance)

## Performance Considerations

### Build Performance

| Task | Time (cold) | Time (cached) | Notes |
|------|-------------|---------------|-------|
| `pnpm install` | ~10s | ~2s | pnpm hard links, very fast |
| `pnpm build` | ~1s | ~0.1s | esbuild is extremely fast |
| `pnpm test` | ~2s | ~0.5s | Vitest watch mode even faster |
| `pnpm typecheck` | ~3s | ~1s | TypeScript incremental mode |

**Optimization**: Turbo caching means rebuilds are near-instant if nothing changed.

### Extension Activation Performance

Target: < 2 seconds from workspace open to extension active

**Strategies**:
- Lazy load views (only create when first shown)
- Defer MCP connection until user requests tool testing
- Use activation event (not `onStartupFinished`)
- Bundle code to minimize require() calls

**Monitoring**: VS Code performance profiler can track activation time.

## Security Considerations

### 1. Config File Validation

Use Zod schemas to validate `.agency/agency.config.json`:
- Prevents injection attacks via malformed JSON
- Ensures config structure matches expectations
- Provides clear error messages for invalid config

### 2. Process Execution Safety

`execa` usage for container interactions:
- Always validate container IDs before exec
- Sanitize user input for command parameters
- Use stdio streams (not shell) to prevent command injection

### 3. Marketplace Publishing

`.vscodeignore` prevents exposure of:
- Source code (intellectual property)
- Development credentials or secrets
- Internal tooling configurations

## Future Considerations

### Potential Upgrades

1. **esbuild → Vite**: If we need HMR for webview development
2. **Vitest → VS Code Extension Test Runner**: For integration tests
3. **pnpm → Bun**: If Bun's workspace support matures and speed becomes critical
4. **Manual bundling → vsce --bundle**: VS Code's built-in bundling (uses esbuild under hood)

### Breaking Changes to Watch

- **VS Code ESM support**: If/when VS Code supports ESM extensions, consider migrating
- **TypeScript 6.x**: May require tsconfig updates
- **Node.js 22 LTS**: Update target to Node 22 when released

## References

### Official Documentation
- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [pnpm Documentation](https://pnpm.io/)
- [turborepo Documentation](https://turbo.build/repo)

### Community Resources
- [VS Code Extension Development Best Practices](https://code.visualstudio.com/api/references/extension-guidelines)
- [esbuild Performance Benchmarks](https://esbuild.github.io/)
- [Vitest Guide](https://vitest.dev/guide/)

---

*Generated by speckit*
