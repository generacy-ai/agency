# Data Model: Workflow YAML Schema

**Feature**: 244-problem-every-repository-using

## Workflow YAML Schema

The bundled workflow files follow a consistent schema. This document describes the structure validated by tests (one level deep, per Q2 decision).

### Top-Level Structure

```yaml
name: string              # Workflow identifier (e.g. "speckit-feature")
description: string       # Multi-line description of the workflow
version: string           # Semantic version (e.g. "1.3.0")
inputs: Input[]           # Array of input parameter definitions
phases: Phase[]           # Array of execution phases
```

### Input Definition

```yaml
inputs:
  - name: string          # Input parameter name (e.g. "description")
    description: string   # Human-readable description
    type: string          # Data type: "string" | "number"
    required: boolean     # Whether input is mandatory
```

### Phase Definition

```yaml
phases:
  - name: string          # Phase identifier (e.g. "setup", "specification")
    steps: Step[]         # Array of steps within this phase
```

### Step Definition

```yaml
steps:
  - name: string          # Step identifier (e.g. "create-feature", "commit-spec")
    uses: string          # Action type (e.g. "speckit.create_feature", "shell", "pr.create")
    with: object          # (optional) Parameters passed to the action
    command: string       # (optional, for shell actions) Shell command to execute
    timeout: number       # (optional) Timeout in milliseconds
    continueOnError: bool # (optional) Whether to continue on failure
```

### Action Types

| `uses` Value | Description |
|-------------|-------------|
| `speckit.create_feature` | Create feature branch and directory |
| `speckit.specify` | Generate specification |
| `speckit.clarify` | Run clarification protocol |
| `speckit.plan` | Generate implementation plan |
| `speckit.tasks` | Generate task breakdown |
| `speckit.implement` | Run implementation |
| `shell` | Execute a shell command (uses `command` field) |
| `pr.create` | Create a pull request |
| `verification.check` | Run a verification command |

### Template Expressions

Workflow YAML uses `${{ ... }}` template expressions for variable interpolation:

- `${{ inputs.<name> }}` — references an input parameter
- `${{ steps.<step-name>.output.<field> }}` — references output from a previous step

### Current Canonical Versions

| Workflow | Version | Phases |
|----------|---------|--------|
| `speckit-feature` | 1.3.0 | setup, specification, clarification, planning, task-generation, implementation, verification |
| `speckit-bugfix` | 1.3.0 | setup, specification, planning, task-generation, implementation, verification |

## TypeScript Types

### New Types (src/workflows.ts)

```typescript
/** Names of bundled workflows */
type BuiltinWorkflowName = 'speckit-feature' | 'speckit-bugfix';

/** Map of workflow names to absolute file paths */
const BUILTIN_WORKFLOWS: Record<BuiltinWorkflowName, string>;
```

### No Runtime Schema Validation

Per Q5 decision, bundled workflow files are not validated at runtime. Path correctness is verified by unit tests. The workflow YAML schema is enforced by the generacy engine at execution time, not by this plugin.
