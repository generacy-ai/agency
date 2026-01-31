# Data Model: copy_template Tool

## Core Types

### Template Names (Enum)
```typescript
type TemplateName = 'spec' | 'plan' | 'tasks' | 'checklist' | 'agent-file';
```

### Input Parameters
```typescript
interface CopyTemplateParams {
  /** List of template names to copy */
  templates: TemplateName[];

  /** Optional custom destination filename (single template only) */
  dest_filename?: string;

  /** Target feature directory. Auto-detected if not provided. */
  feature_dir?: string;

  /** Working directory (defaults to process.cwd()) */
  cwd?: string;
}
```

### Output Result
```typescript
interface CopyTemplateResult {
  success: boolean;

  /** Templates that were copied */
  copied: CopiedTemplate[];

  /** Templates that were skipped (already exist) */
  skipped: SkippedTemplate[];

  /** Error message if success is false */
  error?: string;
}

interface CopiedTemplate {
  template: TemplateName;
  destination: string;
}

interface SkippedTemplate {
  template: TemplateName;
  destination: string;
  reason: 'exists' | 'source_not_found';
}
```

## Template Mapping Configuration

```typescript
interface TemplateMapping {
  /** Template name (used in API) */
  name: TemplateName;

  /** Source filename (without path) */
  sourceFile: string;

  /** Destination resolver */
  getDestination: (
    featureDir: string,
    repoRoot: string,
    destFilename?: string
  ) => string;
}

const TEMPLATE_MAPPINGS: TemplateMapping[] = [
  {
    name: 'spec',
    sourceFile: 'spec-template.md',
    getDestination: (featureDir) => join(featureDir, 'spec.md')
  },
  {
    name: 'plan',
    sourceFile: 'plan-template.md',
    getDestination: (featureDir) => join(featureDir, 'plan.md')
  },
  {
    name: 'tasks',
    sourceFile: 'tasks-template.md',
    getDestination: (featureDir) => join(featureDir, 'tasks.md')
  },
  {
    name: 'checklist',
    sourceFile: 'checklist-template.md',
    getDestination: (featureDir, _, destFilename) =>
      join(featureDir, 'checklists', destFilename || 'checklist.md')
  },
  {
    name: 'agent-file',
    sourceFile: 'agent-file-template.md',
    getDestination: (_, repoRoot) => join(repoRoot, 'CLAUDE.md')
  }
];
```

## Validation Rules

1. **templates array**:
   - Must have at least 1 item
   - Each item must be a valid TemplateName
   - Duplicates are allowed (will be deduplicated)

2. **dest_filename**:
   - Only valid when `templates.length === 1`
   - Must not contain path separators
   - Should end with `.md` (auto-appended if missing)

3. **feature_dir**:
   - Must exist if provided
   - Auto-detected from branch if not provided

## Relationships

```
CopyTemplateParams
       │
       ▼
 TemplateMapping[] ──► Source files in .specify/templates/
       │
       ▼
 CopyTemplateResult
       │
       ├── copied[] ──► Destination files in feature_dir
       │
       └── skipped[] ──► Files that already existed
```
