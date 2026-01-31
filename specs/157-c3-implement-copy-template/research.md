# Research: copy_template Tool Implementation

## Technology Decisions

### 1. Tool Pattern
**Decision**: Follow existing tool pattern from `check-prereqs.ts` and `get-paths.ts`

**Rationale**:
- Consistent with codebase patterns
- Uses established factory function pattern: `createCopyTemplateTool(config, core)`
- Returns `AgencyTool` interface with standard properties

### 2. File Operations
**Decision**: Use existing `utils/fs.ts` utilities

**Available utilities**:
- `exists(path)` - Check if path exists
- `readFile(path)` - Read file as UTF-8 string
- `writeFile(path, content)` - Write file (creates parent dirs)
- `mkdir(path)` - Create directory recursively
- `findRepoRoot(cwd)` - Find repository root

### 3. Path Resolution
**Decision**: Use configuration for template paths

```typescript
// From config.ts
config.paths.templates  // Default: '.specify/templates'
config.paths.specs      // Default: 'specs'
```

### 4. Template Naming Convention
**Decision**: Templates use `-template` suffix

Existing templates in `.specify/templates/`:
- `spec-template.md` → template name: `spec`
- `plan-template.md` → template name: `plan`
- `tasks-template.md` → template name: `tasks`
- `checklist-template.md` → template name: `checklist`
- `agent-file-template.md` → template name: `agent-file`

## Implementation Patterns

### Input Schema
```typescript
inputSchema: {
  type: 'object',
  properties: {
    templates: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['spec', 'plan', 'tasks', 'checklist', 'agent-file']
      },
      minItems: 1,
      description: 'List of template names to copy'
    },
    dest_filename: {
      type: 'string',
      description: 'Optional custom destination filename (single template only)'
    },
    feature_dir: {
      type: 'string',
      description: 'Target feature directory'
    },
    cwd: {
      type: 'string',
      description: 'Working directory (defaults to process.cwd())'
    }
  },
  required: ['templates']
}
```

### Error Handling
Follow existing patterns:
- Return structured JSON with `success: false` and descriptive error
- Use custom error classes from `utils/fs.ts` when appropriate

### Output Format
```typescript
{
  success: true,
  copied: [
    { template: 'spec', destination: '/path/to/spec.md' },
    { template: 'plan', destination: '/path/to/plan.md' }
  ],
  skipped: [] // Templates that already exist
}
```

## Alternatives Considered

### 1. Single Template per Call
**Rejected**: Less efficient for common use cases like initializing a feature with multiple templates.

### 2. Overwrite by Default
**Rejected**: Too dangerous. Tool will check if destination exists and skip with warning.

### 3. Template Variables
**Deferred**: Future enhancement could support variable substitution in templates (e.g., `{feature_name}`, `{date}`).

## Key Sources

- Existing tools: `packages/agency-plugin-spec-kit/src/tools/check-prereqs.ts`
- Config schema: `packages/agency-plugin-spec-kit/src/config.ts`
- FS utilities: `packages/agency-plugin-spec-kit/src/utils/fs.ts`
- Template files: `.specify/templates/*-template.md`
