# Data Model: Monorepo Bootstrap

This document defines the configuration schemas and structures for the monorepo infrastructure.

## Configuration Schemas

### pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
```

### Root package.json

```typescript
interface RootPackageJson {
  name: string;              // "agency"
  private: true;             // Not publishable
  type: "module";            // ESM
  packageManager: string;    // "pnpm@9.x.x"
  engines: {
    node: ">=20";
  };
  scripts: {
    build: string;           // "turbo run build"
    test: string;            // "turbo run test"
    lint: string;            // "turbo run lint"
    typecheck: string;       // "turbo run typecheck"
    clean: string;           // "turbo run clean"
  };
  devDependencies: Record<string, string>;
}
```

### turbo.json

```typescript
interface TurboConfig {
  $schema: string;
  tasks: {
    build: {
      dependsOn: ["^build"];
      outputs: ["dist/**"];
    };
    test: {
      dependsOn: ["build"];
    };
    lint: {};
    typecheck: {
      dependsOn: ["^typecheck"];
    };
    clean: {
      cache: false;
    };
  };
}
```

### tsconfig.base.json

```typescript
interface TSConfigBase {
  compilerOptions: {
    target: "ES2022";
    module: "Node16";
    moduleResolution: "Node16";
    strict: true;
    esModuleInterop: true;
    skipLibCheck: true;
    forceConsistentCasingInFileNames: true;
    declaration: true;
    declarationMap: true;
    sourceMap: true;
    outDir: string;
    rootDir: string;
  };
}
```

### Package tsconfig.json

```typescript
interface PackageTSConfig {
  extends: "../../tsconfig.base.json";
  compilerOptions: {
    outDir: "./dist";
    rootDir: "./src";
  };
  include: ["src/**/*"];
  exclude: ["node_modules", "dist"];
}
```

### Package package.json

```typescript
interface PackageJson {
  name: string;              // "@generacy-ai/agency" or "@generacy-ai/agency-plugin-*"
  version: "0.0.0";
  type: "module";
  exports: {
    ".": {
      types: "./dist/index.d.ts";
      import: "./dist/index.js";
    };
  };
  main: "./dist/index.js";
  types: "./dist/index.d.ts";
  files: ["dist"];
  scripts: {
    build: "tsc -b";
    test: "vitest run";
    lint: "eslint src";
    typecheck: "tsc --noEmit";
    clean: "rm -rf dist";
  };
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}
```

## Package Structure

### Core Package (@generacy-ai/agency)

```
packages/agency/
├── src/
│   └── index.ts            # Export entry point
├── package.json
└── tsconfig.json
```

**Dependencies**:
- `@modelcontextprotocol/sdk`: MCP server implementation
- `zod`: Runtime validation

### Plugin Packages

```
packages/agency-plugin-{name}/
├── src/
│   └── index.ts            # Export entry point
├── package.json
└── tsconfig.json
```

**Peer Dependencies**:
- `@generacy-ai/agency`: Core package

## CI Configuration

### GitHub Actions Workflow

```typescript
interface CIWorkflow {
  name: "CI";
  on: {
    push: { branches: ["main", "develop"] };
    pull_request: {};
  };
  jobs: {
    build: {
      "runs-on": "ubuntu-latest";
      steps: Step[];
    };
  };
}

interface Step {
  name: string;
  uses?: string;
  with?: Record<string, string>;
  run?: string;
}
```

## Changeset Configuration

```typescript
interface ChangesetConfig {
  $schema: string;
  changelog: string;
  commit: false;
  fixed: string[][];         // Packages versioned together
  linked: string[][];        // Packages with linked versions
  access: "public";
  baseBranch: "main";
  updateInternalDependencies: "patch";
  ignore: string[];          // Packages to ignore
}
```
