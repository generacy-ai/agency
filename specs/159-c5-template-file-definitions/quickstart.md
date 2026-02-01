# Quickstart: C5 Template File Definitions

**Feature**: Template file definitions and defaults
**Date**: 2026-02-01

## Overview

The templates module provides centralized template management for spec-kit. It handles:
- Template type definitions
- Default template content
- Template resolution (custom → default fallback)
- Variable substitution

## Installation

Templates are built into the `@generacy-ai/agency-plugin-spec-kit` package. No additional installation required.

## Usage

### Resolving a Template

```typescript
import { resolveTemplate, TEMPLATES } from '@generacy-ai/agency-plugin-spec-kit/templates';
import type { SpecKitConfig } from '@generacy-ai/agency-plugin-spec-kit';

const config: SpecKitConfig = {
  paths: { templates: '.specify/templates' }
};

// Resolve template - checks custom path first, falls back to default
const content = await resolveTemplate('spec', config, '/path/to/repo');
```

### Variable Substitution

```typescript
import { substituteVariables } from '@generacy-ai/agency-plugin-spec-kit/templates';

const template = '# {{feature_name}}\n\nCreated: {{date}}';
const result = substituteVariables(template, {
  feature_name: 'My Feature',
  date: '2026-02-01'
});
// Result: '# My Feature\n\nCreated: 2026-02-01'
```

### Getting Destination Paths

```typescript
import { getDestinationPath, TEMPLATES } from '@generacy-ai/agency-plugin-spec-kit/templates';

// Regular template - goes to feature directory
const specPath = getDestinationPath('spec', '/repo/specs/123-feature', '/repo');
// Result: '/repo/specs/123-feature/spec.md'

// Checklist - goes to checklists subdirectory
const checklistPath = getDestinationPath('checklist', '/repo/specs/123-feature', '/repo');
// Result: '/repo/specs/123-feature/checklists/checklist.md'

// Agent file - goes to repo root
const agentPath = getDestinationPath('agent-file', '/repo/specs/123-feature', '/repo');
// Result: '/repo/CLAUDE.md'
```

### Accessing Template Definitions

```typescript
import { TEMPLATES, TEMPLATE_TYPES, isTemplateType } from '@generacy-ai/agency-plugin-spec-kit/templates';

// Get all template types
console.log(TEMPLATE_TYPES); // ['spec', 'plan', 'tasks', 'checklist', 'agent-file']

// Get a specific template definition
const specTemplate = TEMPLATES.spec;
console.log(specTemplate.defaultFilename); // 'spec.md'
console.log(specTemplate.sourceFile);      // 'spec-template.md'

// Validate template type
if (isTemplateType(userInput)) {
  // userInput is narrowed to TemplateType
}
```

## Available Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{feature_name}}` | Feature name from branch | `template-file-definitions` |
| `{{description}}` | Feature description | `Define template files...` |
| `{{date}}` | Current date (ISO) | `2026-02-01` |
| `{{branch}}` | Full branch name | `159-c5-template-file-definitions` |

## Customizing Templates

### Override Defaults

1. Create a custom template file in your templates directory:
   ```
   .specify/templates/spec-template.md
   ```

2. The template module will automatically use your custom file instead of the default.

### Template File Names

| Template Type | Source File Name |
|---------------|------------------|
| `spec` | `spec-template.md` |
| `plan` | `plan-template.md` |
| `tasks` | `tasks-template.md` |
| `checklist` | `checklist-template.md` |
| `agent-file` | `agent-file-template.md` |

### Custom Templates Directory

Configure via `speckit.config.json`:
```json
{
  "paths": {
    "templates": "my-custom-templates"
  }
}
```

## Troubleshooting

### Template Not Found

If `resolveTemplate` returns the default content when you expected custom:
1. Check that the custom template file exists at the expected path
2. Verify the filename matches `sourceFile` in the template definition
3. Check config `paths.templates` is set correctly

### Variables Not Substituted

If `{{variable}}` remains in output:
1. Ensure variable name matches exactly (case-sensitive)
2. Check that the variable is passed to `substituteVariables`
3. Escape literal `{{` as `\{\{` if needed in templates

### Copy Template Fails

If `copy_template` tool fails:
1. Check the destination directory exists
2. Verify file permissions
3. Check that the template type is valid

## API Reference

See `data-model.md` for complete type definitions and function signatures.
