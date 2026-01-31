# Data Model: check_prereqs Tool

## Core Interfaces

### CheckPrereqsParams
Input parameters for the tool.

```typescript
interface CheckPrereqsParams {
  /** Whether spec.md is required (default: true) */
  require_spec?: boolean;

  /** Whether plan.md is required (default: false) */
  require_plan?: boolean;

  /** Whether tasks.md is required (default: false) */
  require_tasks?: boolean;

  /** Include tasks.md in available_docs if it exists */
  include_tasks?: boolean;

  /** Optional branch/feature name. If not provided, uses current. */
  branch?: string;

  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}
```

### PrerequisiteResult (existing)
Output format from the tool. Already defined in `types/feature.ts`.

```typescript
interface PrerequisiteResult {
  /** Whether all required prerequisites are met */
  valid: boolean;

  /** Feature directory path (if found) */
  featureDir: string;

  /** List of available optional documentation files */
  availableDocs: string[];

  /** List of missing required files (if valid=false) */
  missingRequired?: string[];

  /** Error message if valid is false */
  error?: string;
}
```

## Type Extensions

### Extended PrerequisiteResult
The current `PrerequisiteResult` in `types/feature.ts` needs the `missingRequired` field added.

```typescript
// Update types/feature.ts
export interface PrerequisiteResult {
  valid: boolean;
  featureDir: string;
  availableDocs: string[];
  missingRequired?: string[];  // ADD: List of missing required files
  error?: string;
}
```

## File Naming Conventions

### Required Files (configurable names)
| Default Name | Config Path | Description |
|-------------|-------------|-------------|
| spec.md | - | Feature specification |
| plan.md | - | Implementation plan |
| tasks.md | - | Task list |

### Optional Files (hardcoded)
| Name | Description |
|------|-------------|
| research.md | Technology research |
| data-model.md | Data/type definitions |
| quickstart.md | Getting started guide |
| clarifications.md | Requirement clarifications |

### Optional Directories
| Name | Description |
|------|-------------|
| contracts/ | API/interface contracts |
| checklists/ | Quality checklists |

## Validation Rules

### Feature Name Pattern
```typescript
// From types/patterns.ts
const FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Valid examples:
// - "001-user-auth"
// - "042-api-v2"
// - "156-c2-implement-check-prereqs"

// Invalid examples:
// - "1-invalid" (not 3 digits)
// - "001-Invalid" (uppercase)
```

### Directory Structure
```
specs/
└── {feature-name}/
    ├── spec.md          # Primary (usually required)
    ├── plan.md          # Secondary (optional by default)
    ├── tasks.md         # Secondary (optional by default)
    ├── research.md      # Optional
    ├── data-model.md    # Optional
    ├── quickstart.md    # Optional
    ├── clarifications.md # Optional
    ├── contracts/       # Optional directory
    │   └── *.json       # Contract files
    └── checklists/      # Optional directory
        └── *.md         # Checklist files
```

## Relationships

```
┌─────────────────┐     ┌─────────────────────┐
│ CheckPrereqsParams │──>│ check_prereqs tool  │
└─────────────────┘     └─────────────────────┘
                               │
                               v
                        ┌─────────────────────┐
                        │ PrerequisiteResult  │
                        └─────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              v                v                v
      ┌───────────┐    ┌───────────┐    ┌───────────────┐
      │   valid   │    │ featureDir│    │ availableDocs │
      │ (boolean) │    │  (string) │    │   (string[])  │
      └───────────┘    └───────────┘    └───────────────┘
```
