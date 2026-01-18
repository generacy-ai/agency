# Data Model: Plugin: @generacy-ai/agency-plugin-npm

## Core Types

### PackageManager

```typescript
/**
 * Supported package managers
 */
type PackageManager = 'npm' | 'yarn' | 'pnpm';
```

### NpmPluginConfig

```typescript
/**
 * Plugin configuration options
 */
interface NpmPluginConfig {
  /**
   * Package manager to use.
   * - 'auto': Detect from lockfiles (default)
   * - 'npm' | 'yarn' | 'pnpm': Force specific PM
   */
  packageManager: 'auto' | PackageManager;

  /**
   * Script name mappings.
   * Keys are logical names, values are actual script names in package.json.
   */
  scripts: ScriptConfig;
}

interface ScriptConfig {
  build?: string;           // Default: 'build'
  test?: string;            // Default: 'test'
  lint?: string;            // Default: 'lint'
  format?: string;          // Default: 'format'
  'test:integration'?: string;  // Default: 'test:integration'
  'test:e2e'?: string;      // Default: 'test:e2e'
  'test:coverage'?: string; // Default: 'coverage'
}
```

### Detection Result

```typescript
/**
 * Result of package manager detection
 */
interface DetectionResult {
  /** Detected package manager */
  packageManager: PackageManager;

  /** Path to the lockfile that was found */
  lockfilePath: string;

  /** Whether this is a monorepo/workspace setup */
  isWorkspace: boolean;

  /** Workspace root (if different from cwd) */
  workspaceRoot?: string;
}
```

### Execution Context

```typescript
/**
 * Context for command execution
 */
interface ExecutionContext {
  /** Working directory */
  cwd: string;

  /** Detected or configured package manager */
  packageManager: PackageManager;

  /** Target workspace (for monorepos) */
  workspace?: string;

  /** Plugin configuration */
  config: NpmPluginConfig;
}
```

### Execution Result

```typescript
/**
 * Result of command execution
 */
interface ExecutionResult {
  /** Exit code from the process */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Whether execution succeeded (exitCode === 0) */
  success: boolean;

  /** Command that was executed */
  command: string;

  /** Arguments passed to command */
  args: string[];

  /** Duration in milliseconds */
  durationMs: number;
}
```

## Tool Parameter Schemas

### Base Parameters (Common to All Tools)

```typescript
const BaseParamsSchema = z.object({
  /** Working directory for command execution */
  cwd: z.string().optional(),

  /** Target specific workspace in monorepo */
  workspace: z.string().optional(),
});
```

### build.install_dependencies

```typescript
const InstallDependenciesSchema = BaseParamsSchema.extend({
  /** Install only production dependencies */
  production: z.boolean().optional(),

  /** Use lockfile without updating (CI mode) */
  frozen: z.boolean().optional(),
});

type InstallDependenciesParams = z.infer<typeof InstallDependenciesSchema>;
```

### build.compile

```typescript
const CompileSchema = BaseParamsSchema.extend({
  /** Build script name override */
  script: z.string().optional(),
});

type CompileParams = z.infer<typeof CompileSchema>;
```

### build.lint

```typescript
const LintSchema = BaseParamsSchema.extend({
  /** Auto-fix linting issues */
  fix: z.boolean().optional(),

  /** Lint script name override */
  script: z.string().optional(),
});

type LintParams = z.infer<typeof LintSchema>;
```

### build.format

```typescript
const FormatSchema = BaseParamsSchema.extend({
  /** Check formatting only, don't write changes */
  check: z.boolean().optional(),

  /** Format script name override */
  script: z.string().optional(),
});

type FormatParams = z.infer<typeof FormatSchema>;
```

### test.run_unit / test.run_integration / test.run_e2e

```typescript
const RunTestSchema = BaseParamsSchema.extend({
  /** Test file pattern to run */
  pattern: z.string().optional(),

  /** Run in watch mode */
  watch: z.boolean().optional(),

  /** Test script name override */
  script: z.string().optional(),
});

type RunTestParams = z.infer<typeof RunTestSchema>;
```

### test.run_coverage

```typescript
const RunCoverageSchema = BaseParamsSchema.extend({
  /** Test file pattern to run */
  pattern: z.string().optional(),

  /** Minimum coverage percentage to pass */
  threshold: z.number().min(0).max(100).optional(),

  /** Coverage script name override */
  script: z.string().optional(),
});

type RunCoverageParams = z.infer<typeof RunCoverageSchema>;
```

## Internal Types

### Command Builder

```typescript
/**
 * Builds PM-specific command arrays
 */
interface CommandBuilder {
  /** Build install command */
  install(options: { production?: boolean; frozen?: boolean }): string[];

  /** Build run script command */
  run(script: string, args?: string[]): string[];

  /** Build workspace-scoped command */
  inWorkspace(workspace: string, command: string[]): string[];
}
```

### Script Validator

```typescript
/**
 * Result of script validation
 */
interface ScriptValidationResult {
  /** Whether the script exists */
  exists: boolean;

  /** List of available scripts (for error messages) */
  availableScripts: string[];

  /** Path to package.json that was checked */
  packageJsonPath: string;
}
```

### Recovery Hint

```typescript
/**
 * Recovery suggestion for error output
 */
interface RecoveryHint {
  /** Short description of what to try */
  suggestion: string;

  /** Optional command to run */
  command?: string;
}
```

## Validation Rules

| Field | Rule | Error Message |
|-------|------|---------------|
| cwd | Must be absolute path or relative to process.cwd() | "Invalid working directory: {value}" |
| workspace | Must match workspace name in package.json | "Workspace not found: {value}" |
| script | Must exist in package.json scripts | "Script not found: {value}" |
| threshold | Must be 0-100 | "Coverage threshold must be 0-100" |
| pattern | Must be valid glob pattern | "Invalid test pattern: {value}" |

## Entity Relationships

```
NpmPluginConfig
    │
    ├── packageManager: 'auto' | PackageManager
    │       │
    │       └── DetectionResult (when 'auto')
    │               │
    │               └── lockfilePath, isWorkspace, workspaceRoot
    │
    └── scripts: ScriptConfig
            │
            └── ScriptValidationResult
                    │
                    └── exists, availableScripts

ExecutionContext
    │
    ├── cwd (from params or process.cwd())
    ├── packageManager (from config or detection)
    ├── workspace (from params)
    └── config (from core.getConfig())

CommandBuilder (per PackageManager)
    │
    └── ExecutionResult
            │
            └── TerseToolResult → ToolResult
```

---

*Generated by speckit*
