# Data Model: create_feature Tool

## Input Schema

### CreateFeatureParams
```typescript
interface CreateFeatureParams {
  /**
   * Feature description used to generate spec content and branch name slug.
   * Required field.
   * @example "Implement user authentication with OAuth2"
   */
  description: string;

  /**
   * Optional 2-4 word short name for the branch.
   * If provided, overrides auto-generated slug from description.
   * Must match pattern: ^[a-z0-9]+(?:-[a-z0-9]+)*$
   * @example "user-oauth-auth"
   */
  short_name?: string;

  /**
   * Optional explicit branch/feature number (1-999).
   * If not provided, auto-generates next available number.
   * @example 153
   */
  number?: number;

  /**
   * Parent epic branch name for creating child features.
   * If provided, new branch is created from this branch instead of current.
   * @example "epic/100-user-management"
   */
  parent_epic_branch?: string;

  /**
   * Working directory for the operation.
   * Defaults to process.cwd() if not specified.
   * @example "/workspaces/agency"
   */
  cwd?: string;
}
```

## Output Schema

### CreateFeatureResult (Success)
```typescript
interface CreateFeatureResult {
  /** Always true for successful operations */
  success: true;

  /**
   * Generated branch name following configured pattern.
   * @example "153-implement-user-auth"
   */
  branch_name: string;

  /**
   * Zero-padded feature number.
   * @example "153"
   */
  feature_num: string;

  /**
   * Absolute path to the created spec.md file.
   * @example "/workspaces/agency/specs/153-implement-user-auth/spec.md"
   */
  spec_file: string;

  /**
   * Absolute path to the feature directory.
   * @example "/workspaces/agency/specs/153-implement-user-auth"
   */
  feature_dir: string;

  /**
   * Whether a git branch was created.
   * False if branch already existed.
   */
  git_branch_created: boolean;

  /**
   * Whether the branch was created from a parent epic branch.
   */
  branched_from_epic: boolean;

  /**
   * Parent epic branch name (only present if branched_from_epic is true).
   * @example "epic/100-user-management"
   */
  parent_epic_branch?: string;
}
```

### CreateFeatureResult (Error)
```typescript
interface CreateFeatureError {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    context?: Record<string, unknown>;
  };
}

type ErrorCode =
  | 'FEATURE_DIR_NOT_FOUND'    // Cannot find repo root
  | 'BRANCH_EXISTS'            // Feature directory already exists
  | 'BRANCH_EXISTS_FOR_ISSUE'  // Branch exists for issue number
  | 'INVALID_BRANCH_NAME'      // Generated name fails validation
  | 'INVALID_FEATURE_NUMBER'   // Number > 999
  | 'GIT_OPERATION_FAILED';    // Git operation error
```

## Configuration Types

### BranchConfig
```typescript
interface BranchConfig {
  /**
   * Branch name pattern with placeholders.
   * Available placeholders: {type}, {number}, {paddedNumber}, {slug}
   * @default "{paddedNumber}-{slug}"
   */
  pattern: string;

  /**
   * Zero-padding width for feature numbers.
   * @default 3
   * @min 1
   * @max 10
   */
  numberPadding: number;

  /**
   * Maximum words to include in slug.
   * @default 4
   * @min 1
   * @max 10
   */
  maxSlugWords: number;
}
```

### SlugOptions
```typescript
interface SlugOptions {
  /**
   * Maximum length for the generated slug.
   * @default 30
   */
  maxLength: number;

  /**
   * Separator character between words.
   * @default "-"
   */
  separator: string;

  /**
   * Whether to remove common stop words.
   * @default true
   */
  removeStopWords: boolean;

  /**
   * Maximum number of words to include.
   * @default 4
   */
  maxWords: number;
}
```

## Internal Types

### BranchInfo
```typescript
/**
 * Information extracted from an existing branch name.
 */
interface BranchInfo {
  /** Branch name as-is */
  name: string;

  /** Extracted feature number (if matched pattern) */
  number: number | null;

  /** Whether this is a local branch */
  isLocal: boolean;

  /** Whether this is a remote branch */
  isRemote: boolean;
}
```

### SpecTemplate
```typescript
/**
 * Template for generating spec.md content.
 */
interface SpecTemplate {
  /** Title extracted from description */
  title: string;

  /** Branch name for header */
  branchName: string;

  /** Full description text */
  description: string;

  /** ISO date string */
  date: string;
}
```

## Validation Rules

### Branch Name Pattern
```
FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/
```
- Must start with 3 digits
- Followed by hyphen
- Then lowercase alphanumeric segments separated by hyphens

### Short Name Pattern
```
SHORT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
```
- Lowercase alphanumeric
- Segments separated by hyphens
- No leading/trailing hyphens

### Number Range
- Minimum: 1
- Maximum: 999
- Padded to 3 digits (configurable)

## Relationships

```
CreateFeatureParams
    │
    ├── description ──────► SlugGenerator ──► slug
    │
    ├── number ──────────► OR ──► featureNumber
    │                       │
    │   (auto-generate) ◄───┘
    │       │
    │       ├── scan specs/
    │       └── scan branches
    │
    ├── short_name ──────► override slug
    │
    └── parent_epic_branch ──► git checkout epic first

BranchConfig.pattern + featureNumber + slug
    │
    └──► branch_name ──► feature_dir ──► spec_file
```
