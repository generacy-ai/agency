# Implementation Plan: Bootstrap Monorepo Structure

**Feature**: Initialize Agency monorepo with pnpm workspaces, turborepo, and package scaffolds
**Branch**: `020-bootstrap-monorepo-structure-turbo`
**Status**: Complete

## Summary

This plan establishes the foundational monorepo infrastructure for the Agency project. It creates the build tooling, shared configurations, and package scaffolds needed to support `@generacy-ai/agency` (core) and five plugin packages. The goal is a working monorepo where `pnpm install && pnpm build && pnpm test` passes with minimal scaffolds.

## Technical Context

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| Package Manager | pnpm 9.x | Workspace support, disk efficiency, strict dependency resolution |
| Build Orchestration | Turborepo | Caching, parallel execution, dependency-aware task ordering |
| Language | TypeScript 5.x | Type safety, ES2022 target, Node16 module resolution |
| Test Runner | Vitest | Fast, ESM-native, TypeScript support out of the box |
| Linting | ESLint 9.x (flat config) | TypeScript support, modern configuration format |
| Runtime | Node.js ≥20 | LTS support, native ESM, modern APIs |
| Versioning | Changesets | Monorepo-aware version management and changelogs |

## Project Structure

```
agency/
├── .changeset/                          # Changesets configuration
│   └── config.json
├── .github/
│   └── workflows/
│       └── ci.yml                       # Build/test/lint CI workflow
├── packages/
│   ├── agency/                          # @generacy-ai/agency (core)
│   │   ├── src/
│   │   │   └── index.ts                 # Empty export (scaffold)
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── agency-plugin-git/               # @generacy-ai/agency-plugin-git
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── agency-plugin-docker/            # @generacy-ai/agency-plugin-docker
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── agency-plugin-firebase/          # @generacy-ai/agency-plugin-firebase
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── agency-plugin-npm/               # @generacy-ai/agency-plugin-npm
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── agency-plugin-humancy/           # @generacy-ai/agency-plugin-humancy
│       ├── src/
│       │   └── index.ts
│       ├── package.json
│       └── tsconfig.json
├── eslint.config.mjs                    # ESLint flat config (shared)
├── package.json                         # Root workspace package.json
├── pnpm-workspace.yaml                  # pnpm workspace configuration
├── tsconfig.base.json                   # Shared TypeScript configuration
├── turbo.json                           # Turborepo pipeline configuration
└── vitest.config.ts                     # Shared Vitest configuration
```

## Implementation Phases

### Phase 1: Root Configuration (Foundation)

1. Create `pnpm-workspace.yaml` defining `packages/*`
2. Create root `package.json` with:
   - `"private": true` (not published)
   - `"type": "module"` (ESM)
   - Workspace scripts (build, test, lint, typecheck, clean)
   - Root devDependencies (turbo, typescript, eslint, vitest, changesets)
3. Create `tsconfig.base.json` with shared compiler options:
   - ES2022 target
   - Node16 module resolution
   - Strict mode enabled
   - Path mappings for workspace packages
4. Create `eslint.config.mjs` (flat config):
   - TypeScript ESLint integration
   - Recommended rules
   - Custom rules for agency conventions

### Phase 2: Build Orchestration

1. Create `turbo.json` with pipelines:
   - `build`: depends on `^build` (topological)
   - `test`: depends on `build`
   - `lint`: no dependencies (parallel)
   - `typecheck`: depends on `^typecheck`
   - `clean`: no dependencies
2. Configure caching and outputs for each task

### Phase 3: Core Package Scaffold

1. Create `packages/agency/` directory
2. Create `packages/agency/package.json`:
   - Name: `@generacy-ai/agency`
   - Version: `0.0.0` (pre-release)
   - Main/module/types exports
   - Dependencies: `@modelcontextprotocol/sdk`, `zod`
   - Build scripts
3. Create `packages/agency/tsconfig.json` extending base
4. Create `packages/agency/src/index.ts` (empty export)

### Phase 4: Plugin Package Scaffolds

For each plugin (git, docker, firebase, npm, humancy):
1. Create `packages/agency-plugin-{name}/` directory
2. Create `package.json`:
   - Name: `@generacy-ai/agency-plugin-{name}`
   - Version: `0.0.0`
   - Peer dependency on `@generacy-ai/agency`
3. Create `tsconfig.json` extending base
4. Create `src/index.ts` (empty export)

### Phase 5: Testing Infrastructure

1. Create root `vitest.config.ts`:
   - Workspace mode for monorepo
   - TypeScript support
   - Coverage configuration
2. Add test scripts to each package

### Phase 6: Version Management

1. Initialize changesets with `.changeset/config.json`:
   - Fixed versioning for related packages
   - Changelog generation settings
   - Access level (public for @generacy-ai org)

### Phase 7: CI/CD

1. Create `.github/workflows/ci.yml`:
   - Triggers: push to main/develop, all PRs
   - Steps: checkout, setup pnpm, setup node (LTS), install, build, test, lint
   - Cache pnpm store for performance

## Key Decisions

| Decision | Choice | Alternatives Considered |
|----------|--------|------------------------|
| ESLint config format | Flat config (9.x) | Legacy .eslintrc - migrating to deprecated format |
| TypeScript module | Node16 | NodeNext (too new), CommonJS (legacy) |
| Test runner | Vitest | Jest (slower, more config), Node test runner (fewer features) |
| Package exports | ESM + CJS | ESM-only (broader compatibility needed) |
| Version strategy | 0.0.0 start | 0.1.0 (implies more stability than scaffold) |

## Dependencies

### Root devDependencies
- `turbo` - Build orchestration
- `typescript` ~5.x - Language
- `eslint` ~9.x - Linting
- `@typescript-eslint/eslint-plugin` - TS lint rules
- `@typescript-eslint/parser` - TS parsing
- `vitest` - Testing
- `@changesets/cli` - Version management

### Core Package Dependencies
- `@modelcontextprotocol/sdk` - MCP server implementation
- `zod` - Runtime validation

### Deferred Dependencies
- `@generacy-ai/contracts` - Not yet published, will add when available

## Verification

After implementation, verify:
1. `pnpm install` completes without errors
2. `pnpm build` compiles all packages
3. `pnpm test` runs (passes with no tests)
4. `pnpm lint` passes
5. `pnpm typecheck` passes
6. CI workflow runs successfully on PR

## Notes

- Plugin packages are minimal scaffolds; actual implementation deferred to issues #14-#18
- Core package src structure (core/, utils/) deferred to implementation issues #7-#12
- @generacy-ai/contracts dependency skipped per clarification (separate repo)
