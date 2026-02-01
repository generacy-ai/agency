# Data Model: C5 Template File Definitions

**Feature**: Template file definitions and defaults
**Date**: 2026-02-01

## Core Types

### TemplateType

The set of valid template types. Defined as a const array for runtime validation with inferred type.

```typescript
// src/templates/types.ts

/**
 * Valid template type names
 */
export const TEMPLATE_TYPES = [
  'spec',
  'plan',
  'tasks',
  'checklist',
  'agent-file'
] as const;

/**
 * Template type - union of valid template names
 */
export type TemplateType = typeof TEMPLATE_TYPES[number];

/**
 * Type guard for template type validation
 */
export function isTemplateType(value: string): value is TemplateType {
  return TEMPLATE_TYPES.includes(value as TemplateType);
}
```

### TemplateDefinition

Complete definition for a single template type.

```typescript
// src/templates/types.ts

/**
 * Definition of a template with its metadata and default content
 */
export interface TemplateDefinition {
  /** Template type identifier */
  type: TemplateType;

  /** Default filename when copied to destination */
  defaultFilename: string;

  /** Source filename in templates directory (for custom templates) */
  sourceFile: string;

  /** Embedded default content (used when no custom template exists) */
  defaultContent: string;

  /** Optional subdirectory within feature dir (e.g., 'checklists') */
  destSubdir?: string;
}
```

### TemplateVariables

Variables available for substitution in templates.

```typescript
// src/templates/variables.ts

/**
 * Variables that can be substituted in templates
 */
export interface TemplateVariables {
  /** Feature name extracted from branch (e.g., 'template-file-definitions') */
  feature_name: string;

  /** Feature description provided during creation */
  description: string;

  /** Current date in ISO format (YYYY-MM-DD) */
  date: string;

  /** Full branch name (e.g., '159-c5-template-file-definitions') */
  branch: string;
}
```

### TemplateRegistry

Registry mapping template types to their definitions.

```typescript
// src/templates/index.ts

/**
 * Registry of all template definitions
 * Ensures every TemplateType has a corresponding definition
 */
export const TEMPLATES: Record<TemplateType, TemplateDefinition> = {
  spec: {
    type: 'spec',
    defaultFilename: 'spec.md',
    sourceFile: 'spec-template.md',
    defaultContent: SPEC_TEMPLATE_CONTENT,
  },
  plan: {
    type: 'plan',
    defaultFilename: 'plan.md',
    sourceFile: 'plan-template.md',
    defaultContent: PLAN_TEMPLATE_CONTENT,
  },
  tasks: {
    type: 'tasks',
    defaultFilename: 'tasks.md',
    sourceFile: 'tasks-template.md',
    defaultContent: TASKS_TEMPLATE_CONTENT,
  },
  checklist: {
    type: 'checklist',
    defaultFilename: 'checklist.md',
    sourceFile: 'checklist-template.md',
    defaultContent: CHECKLIST_TEMPLATE_CONTENT,
    destSubdir: 'checklists',
  },
  'agent-file': {
    type: 'agent-file',
    defaultFilename: 'CLAUDE.md',
    sourceFile: 'agent-file-template.md',
    defaultContent: AGENT_FILE_TEMPLATE_CONTENT,
  },
};
```

## Function Signatures

### resolveTemplate

Resolves template content with custom/default fallback.

```typescript
// src/templates/index.ts

/**
 * Resolve template content with fallback to defaults
 *
 * @param type - Template type to resolve
 * @param config - SpecKit configuration
 * @param repoRoot - Repository root path
 * @returns Template content string
 */
export async function resolveTemplate(
  type: TemplateType,
  config: SpecKitConfig,
  repoRoot: string
): Promise<string>;
```

### substituteVariables

Performs variable substitution on template content.

```typescript
// src/templates/variables.ts

/**
 * Substitute variables in template content
 *
 * @param content - Template content with {{variable}} placeholders
 * @param variables - Variables to substitute
 * @returns Content with variables substituted
 */
export function substituteVariables(
  content: string,
  variables: Partial<TemplateVariables>
): string;
```

### getDestinationPath

Calculates the destination path for a template.

```typescript
// src/templates/index.ts

/**
 * Get destination path for a template
 *
 * @param type - Template type
 * @param featureDir - Feature directory path
 * @param repoRoot - Repository root path
 * @param customFilename - Optional custom filename override
 * @returns Full destination path
 */
export function getDestinationPath(
  type: TemplateType,
  featureDir: string,
  repoRoot: string,
  customFilename?: string
): string;
```

## Relationships

```
SpecKitConfig
    │
    └─── paths.templates ──────────────────────┐
                                               │
                                               ▼
                                    ┌──────────────────┐
                                    │ Custom Templates │
                                    │ (.specify/...)   │
                                    └────────┬─────────┘
                                             │
                                             │ resolveTemplate()
                                             │ (check custom first)
                                             ▼
┌─────────────────────────────────────────────────────────────┐
│                      TEMPLATES Registry                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ TemplateDefinition                                   │    │
│  │   type: TemplateType                                │    │
│  │   defaultFilename: string                           │    │
│  │   sourceFile: string  ◄───── matches custom file   │    │
│  │   defaultContent: string ◄── fallback content      │    │
│  │   destSubdir?: string                              │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                                             │
                                             │ substituteVariables()
                                             ▼
                                    ┌──────────────────┐
                                    │ TemplateVariables│
                                    │   feature_name   │
                                    │   description    │
                                    │   date           │
                                    │   branch         │
                                    └──────────────────┘
                                             │
                                             ▼
                                    ┌──────────────────┐
                                    │  Final Content   │
                                    │  (substituted)   │
                                    └──────────────────┘
```

## Validation Rules

1. **Template Type**: Must be one of the defined `TEMPLATE_TYPES`
2. **Custom Template Path**: Must be a valid file path relative to repo root
3. **Variable Names**: Must match `\w+` pattern (alphanumeric + underscore)
4. **Destination Path**: Must be within feature directory or repo root (for agent-file)

## Extensibility Points

- New template types can be added to `TEMPLATE_TYPES` array
- New variables can be added to `TemplateVariables` interface
- Custom destination logic can be added via `destSubdir` or custom getDestinationPath implementations
