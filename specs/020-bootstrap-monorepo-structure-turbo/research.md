# Research: Monorepo Bootstrap

## Technology Decisions

### Package Manager: pnpm

**Choice**: pnpm 9.x with workspaces

**Rationale**:
- Native workspace support with `pnpm-workspace.yaml`
- Efficient disk usage via content-addressable store
- Strict dependency resolution prevents phantom dependencies
- Excellent Turborepo integration
- Wide adoption in TypeScript monorepos

**Alternatives Considered**:
- npm workspaces: Slower, less strict, no content-addressable store
- yarn 4.x: Good but pnpm has better turborepo integration
- bun: Promising but less mature workspace support

### Build Orchestration: Turborepo

**Choice**: Turborepo via `turbo` package

**Rationale**:
- Purpose-built for JS/TS monorepos
- Intelligent caching (local and remote)
- Parallel task execution with dependency awareness
- Minimal configuration for common patterns
- Vercel-backed with active development

**Configuration Pattern**:
```json
{
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^typecheck"]
    }
  }
}
```

### TypeScript Configuration

**Choice**: TypeScript 5.x with shared base config

**Key Settings**:
- `target`: ES2022 (modern Node.js)
- `module`: Node16 (ESM with interop)
- `moduleResolution`: Node16
- `strict`: true
- `declaration`: true (for library packages)
- `declarationMap`: true (for IDE navigation)

**Project References**:
- Each package has own tsconfig.json extending base
- Enables incremental builds
- Clear dependency boundaries

### ESLint Configuration

**Choice**: ESLint 9.x with flat config

**Rationale**:
- Flat config is the future (legacy deprecated)
- Simpler, more explicit configuration
- Better TypeScript integration
- Easier to share across packages

**Config Structure** (`eslint.config.mjs`):
```javascript
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // Agency-specific rules
    }
  }
);
```

### Testing: Vitest

**Choice**: Vitest with workspace mode

**Rationale**:
- Native ESM support (no transforms needed)
- TypeScript support out of box
- Jest-compatible API (familiar)
- Fast watch mode
- Built-in coverage

**Workspace Config**:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts']
  }
});
```

### Version Management: Changesets

**Choice**: @changesets/cli

**Rationale**:
- Designed for monorepos
- Pull request workflow friendly
- Automatic changelog generation
- Supports fixed and independent versioning
- GitHub Actions integration available

**Configuration** (`.changeset/config.json`):
```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main"
}
```

## Implementation Patterns

### Package Exports

Modern dual ESM/CJS package exports pattern:

```json
{
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts"
}
```

### Workspace Dependencies

Use `workspace:*` protocol for internal dependencies:

```json
{
  "dependencies": {
    "@generacy-ai/agency": "workspace:*"
  }
}
```

### Scripts Pattern

Each package follows same script interface:

```json
{
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run",
    "lint": "eslint src",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  }
}
```

## References

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [Turborepo Docs](https://turbo.build/repo/docs)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [ESLint Flat Config](https://eslint.org/docs/latest/use/configure/configuration-files-new)
- [Vitest Workspace](https://vitest.dev/guide/workspace.html)
- [Changesets](https://github.com/changesets/changesets)
