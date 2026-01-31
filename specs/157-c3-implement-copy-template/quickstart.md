# Quickstart: copy_template Tool

## Installation

The tool is part of the `@generacy-ai/agency-plugin-spec-kit` package. No separate installation required.

## Basic Usage

### Copy a Single Template
```typescript
// Copy spec template to feature directory
const result = await copyTemplate({
  templates: ['spec'],
  feature_dir: '/path/to/specs/042-my-feature'
});
```

### Copy Multiple Templates
```typescript
// Initialize a feature with all standard templates
const result = await copyTemplate({
  templates: ['spec', 'plan', 'tasks'],
  feature_dir: '/path/to/specs/042-my-feature'
});
```

### Copy with Custom Filename
```typescript
// Copy checklist with a specific name
const result = await copyTemplate({
  templates: ['checklist'],
  dest_filename: 'security-review.md',
  feature_dir: '/path/to/specs/042-my-feature'
});
// Creates: /path/to/specs/042-my-feature/checklists/security-review.md
```

### Auto-detect Feature Directory
```typescript
// Uses current branch to determine feature directory
const result = await copyTemplate({
  templates: ['spec', 'plan']
});
// On branch 042-my-feature, creates files in specs/042-my-feature/
```

## Available Templates

| Template | Description | Destination |
|----------|-------------|-------------|
| `spec` | Feature specification | `{feature_dir}/spec.md` |
| `plan` | Implementation plan | `{feature_dir}/plan.md` |
| `tasks` | Task list | `{feature_dir}/tasks.md` |
| `checklist` | Quality checklist | `{feature_dir}/checklists/{name}.md` |
| `agent-file` | AI agent guidelines | `{repo_root}/CLAUDE.md` |

## MCP Tool Call

```json
{
  "name": "spec_kit.copy_template",
  "arguments": {
    "templates": ["spec", "plan"],
    "feature_dir": "/workspaces/project/specs/042-my-feature"
  }
}
```

## Response Format

### Success
```json
{
  "success": true,
  "copied": [
    { "template": "spec", "destination": "/path/to/spec.md" },
    { "template": "plan", "destination": "/path/to/plan.md" }
  ],
  "skipped": []
}
```

### Partial Success (some files exist)
```json
{
  "success": true,
  "copied": [
    { "template": "plan", "destination": "/path/to/plan.md" }
  ],
  "skipped": [
    { "template": "spec", "destination": "/path/to/spec.md", "reason": "exists" }
  ]
}
```

### Error
```json
{
  "success": false,
  "copied": [],
  "skipped": [],
  "error": "dest_filename can only be used when copying a single template"
}
```

## Common Patterns

### Feature Initialization (in /speckit:specify)
```typescript
await copyTemplate({
  templates: ['spec'],
  feature_dir: paths.featureDir
});
```

### Planning Phase (in /speckit:plan)
```typescript
await copyTemplate({
  templates: ['plan'],
  feature_dir: paths.featureDir
});
```

### Task Generation (in /speckit:tasks)
```typescript
await copyTemplate({
  templates: ['tasks'],
  feature_dir: paths.featureDir
});
```

### Custom Checklist
```typescript
await copyTemplate({
  templates: ['checklist'],
  dest_filename: 'pre-launch-checklist.md',
  feature_dir: paths.featureDir
});
```

## Troubleshooting

### "Feature directory not found"
- Ensure you're on a feature branch (###-name pattern)
- Or provide explicit `feature_dir` parameter

### "Template source not found"
- Verify `.specify/templates/` directory exists
- Check template files are present with `-template.md` suffix

### "File already exists"
- Template files are not overwritten by default
- Existing files appear in `skipped` array
- Delete the file manually to allow copying
