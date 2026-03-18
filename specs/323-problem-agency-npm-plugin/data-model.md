# Data Model: build.validate Tool

## Core Types

### ValidateParams (Input)

```typescript
/** build.validate parameters */
interface ValidateParams {
  /** Working directory (defaults to process.cwd()) */
  cwd?: string;

  /** Target specific workspace in monorepo */
  workspace?: string;

  /** Override which scripts to discover/run */
  scripts?: string[];
}
```

Zod schema:
```typescript
export const ValidateSchema = BaseParamsSchema.extend({
  scripts: z.array(z.string()).optional(),
});
```

### ValidationCandidate (Internal)

```typescript
/** A script candidate resolved for execution */
interface ValidationCandidate {
  /** Display name (e.g., 'lint', 'format:check') */
  name: string;

  /** Actual script to run in package.json */
  script: string;

  /** Additional args to append (e.g., ['--check'] for format fallback) */
  additionalArgs?: string[];
}
```

### ValidationResult (Internal)

```typescript
/** Result of running a single validation script */
interface ValidationResult {
  /** Script name that was run */
  name: string;

  /** Whether it passed */
  passed: boolean;

  /** Exit code from execution */
  exitCode: number;

  /** Stdout from execution */
  stdout: string;

  /** Stderr from execution */
  stderr: string;
}
```

### Default Discovery Candidates

```typescript
const DEFAULT_CANDIDATES: ValidationCandidate[] = [
  { name: 'lint', script: 'lint' },
  { name: 'format:check', script: 'format:check' },
  { name: 'typecheck', script: 'typecheck' },
];

/** Fallback: if format:check missing, use format with --check */
const FORMAT_FALLBACK: ValidationCandidate = {
  name: 'format',
  script: 'format',
  additionalArgs: ['--check'],
};
```

## Config Extension

### ScriptConfig (Modified)

```typescript
interface ScriptConfig {
  build?: string;
  test?: string;
  lint?: string;
  format?: string;
  validate?: string;          // NEW — short-circuit script name
  'test:integration'?: string;
  'test:e2e'?: string;
  'test:coverage'?: string;
}
```

Default: `validate: 'validate'`

## Schema Extension

### zodToJsonSchema Enhancement

The `getJsonSchemaType` function needs to handle `ZodArray`:

```typescript
if (zodType instanceof z.ZodArray) {
  return {
    type: 'array',
    items: getJsonSchemaType(zodType.element),
    description: zodType.description,
  };
}
```

## Tool Metadata

```typescript
{
  name: 'build.validate',
  namespace: 'build',
  outputPattern: 'terse',
  modes: ['default', 'coding', 'review'],
}
```

## Relationships

```
ValidateSchema (input)
    │
    ├─► scripts param provided? ──► Use explicit list (DD-2)
    │
    └─► No scripts param
         │
         ├─► 'validate' script in package.json? ──► Short-circuit (single script)
         │
         └─► Auto-discover from DEFAULT_CANDIDATES
              │
              ├─► Check format:check existence
              │    └─► Missing? Use FORMAT_FALLBACK
              │
              └─► Filter to scripts that exist in package.json
                   │
                   └─► Run sequentially → ValidationResult[]
                        │
                        └─► Aggregate → TerseOutput (success/failure)
```
