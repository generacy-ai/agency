# Data Model: get_paths Tool

## Core Entities

### FeaturePaths (existing in types/feature.ts)

The primary return type for the `get_paths` tool:

```typescript
interface FeaturePaths {
  /** Repository root directory */
  repoRoot: string;

  /** Current branch name or feature name */
  branch: string;

  /** Whether git is available */
  hasGit: boolean;

  /** Feature directory under specs/ */
  featureDir: string;

  /** Path to spec file (configurable, default: spec.md) */
  specFile: string;

  /** Path to plan file (configurable, default: plan.md) */
  planFile: string;

  /** Path to tasks file (configurable, default: tasks.md) */
  tasksFile: string;

  /** Path to research file */
  researchFile: string;

  /** Path to data model file */
  dataModelFile: string;

  /** Path to quickstart file */
  quickstartFile: string;

  /** Path to contracts directory */
  contractsDir: string;

  /** Path to checklists directory */
  checklistsDir: string;

  /** Path to clarifications file */
  clarificationsFile: string;
}
```

### Tool Input Parameters

```typescript
interface GetPathsParams {
  /** Optional branch/feature name override */
  branch?: string;

  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}
```

### Tool Response Types

**Success Response**:
```typescript
interface GetPathsSuccessResponse {
  success: true;
  exists: boolean;  // Whether feature directory exists on disk
  repoRoot: string;
  branch: string;
  hasGit: boolean;
  featureDir: string;
  specFile: string;
  planFile: string;
  tasksFile: string;
  researchFile: string;
  dataModelFile: string;
  quickstartFile: string;
  contractsDir: string;
  checklistsDir: string;
  clarificationsFile: string;
}
```

**Error Response**:
```typescript
interface GetPathsErrorResponse {
  success: false;
  error: McpError;
}

interface McpError {
  code: ErrorCode;
  message: string;
  context?: Record<string, unknown>;
}
```

## Configuration Types (from types/config.ts)

### FileNamesType

```typescript
interface FileNamesType {
  spec: string;           // default: 'spec.md'
  plan: string;           // default: 'plan.md'
  tasks: string;          // default: 'tasks.md'
  research: string;       // default: 'research.md'
  dataModel: string;      // default: 'data-model.md'
  quickstart: string;     // default: 'quickstart.md'
  clarifications: string; // default: 'clarifications.md'
}
```

### DirectoryNamesType

```typescript
interface DirectoryNamesType {
  contracts: string;   // default: 'contracts'
  checklists: string;  // default: 'checklists'
}
```

## Error Codes

| Code | Description | When Used |
|------|-------------|-----------|
| `FEATURE_DIR_NOT_FOUND` | Repository root not found | No .git or specs/ directory found |
| `INVALID_BRANCH_NAME` | Branch doesn't match pattern | Branch doesn't match `###-short-name` |

## Validation Rules

### Feature Name Pattern

```typescript
const FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/;
```

**Valid Examples**:
- `001-user-auth`
- `042-api-v2`
- `155-c1-implement-get-paths`

**Invalid Examples**:
- `1-invalid` (not 3 digits)
- `001-Invalid` (uppercase)
- `feature-001` (wrong format)

### Branch Name Maximum Length

```typescript
const MAX_BRANCH_LENGTH = 244;
```

## Relationships

```
SpecKitConfig
├── specDirectory (string)
├── fileNames (FileNamesType)
│   ├── spec → specFile path
│   ├── plan → planFile path
│   ├── tasks → tasksFile path
│   ├── research → researchFile path
│   ├── dataModel → dataModelFile path
│   ├── quickstart → quickstartFile path
│   └── clarifications → clarificationsFile path
└── directoryNames (DirectoryNamesType)
    ├── contracts → contractsDir path
    └── checklists → checklistsDir path

FeaturePaths
├── repoRoot (from findRepoRoot)
├── branch (from input OR env OR git)
├── hasGit (from isGitRepo check)
├── featureDir = repoRoot + specDirectory + branch
└── all file/dir paths = featureDir + configured names
```
