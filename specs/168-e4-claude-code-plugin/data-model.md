# Data Model: E4: Claude Code plugin: specify command

## Core Interfaces

### CreateFeatureParams

Input parameters for the `spec_kit.create_feature` tool.

```typescript
/**
 * Parameters for the create_feature tool
 */
interface CreateFeatureParams {
  /** Feature description - used to generate spec content and short name */
  description: string;

  /** Optional explicit feature number (1-999). If not provided, auto-generated. */
  number?: number;

  /** Optional explicit short name. If not provided, generated from description. */
  short_name?: string;

  /** Parent epic branch to branch from (for epic children) */
  parent_epic_branch?: string;

  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}
```

### CreateFeatureResult

Output from the `spec_kit.create_feature` tool.

```typescript
/**
 * Result of the create_feature operation
 */
interface CreateFeatureResult {
  /** Whether the operation succeeded */
  success: boolean;

  /** Feature number as string (e.g., "168") */
  feature_number: string;

  /** Full branch name (e.g., "168-e4-claude-code-plugin") */
  branch: string;

  /** Absolute path to feature directory */
  feature_dir: string;

  /** Absolute path to created spec.md file */
  spec_file: string;

  /** Git status - whether a new branch was created */
  branch_created: boolean;

  /** Error message if success is false */
  error?: string;
}
```

### SpecTemplate

Structure of the spec template used for initialization.

```typescript
/**
 * Variables available for template substitution
 */
interface SpecTemplateVars {
  /** Feature title (from description) */
  feature_name: string;

  /** Generated branch name */
  branch_name: string;

  /** Current date in ISO format */
  date: string;

  /** Status (always "Draft" for new specs) */
  status: string;
}
```

## Validation Rules

### Feature Number

- Range: 1-999 (3-digit when padded)
- Must not already exist as a branch or directory
- Auto-generated numbers are max(existing) + 1

```typescript
const isValidFeatureNumber = (n: number): boolean =>
  Number.isInteger(n) && n >= 1 && n <= 999;
```

### Short Name

- Must be lowercase
- Must use hyphens as separators (no underscores, spaces)
- Must start and end with alphanumeric character
- Maximum 50 characters
- Minimum 1 character

```typescript
const isValidShortName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9-]{0,48}[a-z0-9]$|^[a-z0-9]$/.test(name);
```

### Description

- Required, non-empty
- Maximum 1000 characters
- Used for spec.md Summary section

```typescript
const isValidDescription = (desc: string): boolean =>
  typeof desc === 'string' && desc.trim().length > 0 && desc.length <= 1000;
```

## Error Types

```typescript
/**
 * Error codes specific to create_feature
 */
type CreateFeatureErrorCode =
  | 'INVALID_DESCRIPTION'      // Empty or too long description
  | 'INVALID_FEATURE_NUMBER'   // Number out of range or invalid
  | 'INVALID_SHORT_NAME'       // Short name doesn't match pattern
  | 'FEATURE_NUMBER_EXISTS'    // Number already used by branch/directory
  | 'GIT_NOT_INITIALIZED'      // Not in a git repository
  | 'GIT_OPERATION_FAILED'     // Git command failed
  | 'DIRECTORY_CREATE_FAILED'  // Could not create feature directory
  | 'TEMPLATE_NOT_FOUND'       // Spec template file not found
  | 'WRITE_FAILED';            // Could not write spec.md
```

## Type Exports

These types should be exported from the package for consumers:

```typescript
// In types/index.ts
export type {
  CreateFeatureParams,
  CreateFeatureResult,
  CreateFeatureErrorCode,
};
```
