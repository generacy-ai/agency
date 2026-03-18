# Data Model: Update canonical workflow templates to use build.validate

## Workflow Step Schema

This feature modifies workflow YAML templates — there are no runtime data models or database entities. The relevant "data model" is the workflow step structure.

### Workflow Step Definition

```yaml
# A step within a workflow phase
Step:
  name: string          # Unique step identifier within the phase
  uses: string          # Tool reference in namespace.tool format
  with?: object         # Tool-specific parameters (optional)
  continueOnError?: boolean  # Whether to continue workflow on step failure
```

### Verification Phase (Before)

```yaml
verification:
  steps:
    - name: run-tests
      uses: verification.check
      with:
        command: "pnpm run test"    # Hardcoded package manager
      continueOnError: true

    - name: run-lint
      uses: verification.check
      with:
        command: "pnpm run lint"    # Hardcoded package manager
      continueOnError: true
```

### Verification Phase (After)

```yaml
verification:
  steps:
    - name: run-tests
      uses: verification.check
      with:
        command: "pnpm run test"    # Unchanged — test step preserved
      continueOnError: true

    - name: run-validate
      uses: build.validate          # Discovery-based, no parameters
      continueOnError: true
```

## build.validate Tool Interface

```typescript
// Input schema (from agency-plugin-npm)
interface ValidateParams {
  cwd?: string;          // Working directory (defaults to project root)
  scripts?: string[];    // Explicit script list override (omitted = auto-discover)
}

// Default discovery candidates (when scripts is omitted)
const DEFAULT_CANDIDATES = ['lint', 'format:check', 'typecheck'];

// Discovery behavior:
// 1. If scripts param provided → run exactly those
// 2. If package.json has "validate" script → run only that
// 3. Otherwise → discover from DEFAULT_CANDIDATES
// 4. Fallback: if no "format:check", try "format" with --check flag
```

## Relationships

```
speckit-feature.yaml ──uses──▶ build.validate (from agency-plugin-npm)
speckit-bugfix.yaml  ──uses──▶ build.validate (from agency-plugin-npm)
                                    │
                                    ▼
                              package.json (target project)
                              ├── scripts.lint
                              ├── scripts.format:check
                              └── scripts.typecheck
```
