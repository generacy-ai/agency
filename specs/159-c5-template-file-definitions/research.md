# Research: C5 Template File Definitions

**Feature**: Template file definitions and defaults
**Date**: 2026-02-01

## Technology Decisions

### 1. Template Storage: Embedded Strings vs. File Imports

**Decision**: Embedded strings (template literals)

**Rationale**:
- Eliminates runtime file I/O for defaults
- Easier to bundle and distribute
- Content is visible in source code for review
- No path resolution issues across different environments

**Alternatives Considered**:
- **File imports with `fs.readFileSync`**: Requires file system access at runtime, path resolution complexity
- **JSON files**: Poor readability for multiline markdown content
- **ESM imports of .md files**: Requires bundler configuration, non-standard

### 2. Variable Substitution Approach

**Decision**: Mustache-style `{{variable}}` with simple regex replacement

**Rationale**:
- Familiar syntax (Mustache, Handlebars, Jinja)
- Simple to implement with regex
- No external dependency required
- Sufficient for current needs (no conditionals, loops)

**Alternatives Considered**:
- **Handlebars**: Overkill for simple string replacement, adds dependency
- **Template literals with eval**: Security risk
- **Custom DSL**: Unnecessary complexity

### 3. Resolution Strategy

**Decision**: Custom path first, embedded fallback

**Rationale**:
- Matches user expectation (local customization wins)
- Zero-config experience with sensible defaults
- Already implemented pattern in spec (aligns with acceptance criteria)

**Pattern**:
```typescript
async function resolveTemplate(type: TemplateType, config: SpecKitConfig): Promise<string> {
  const customPath = join(config.paths.templates, TEMPLATES[type].sourceFile);
  if (await exists(customPath)) {
    return readFile(customPath);
  }
  return TEMPLATES[type].defaultContent;
}
```

### 4. Integration Strategy

**Decision**: Refactor `copy-template.ts` to import from `templates/index.ts`

**Rationale**:
- Single source of truth for template definitions
- Eliminates duplicate `TEMPLATE_MAPPINGS` structure
- Cleaner separation of concerns
- Maintains backward compatibility of tool API

**Implementation**:
- Keep `copy_template` tool interface unchanged
- Replace internal `TEMPLATE_MAPPINGS` with imports from templates module
- Add variable substitution step before writing

## Implementation Patterns

### Type-Safe Template Registry

```typescript
export const TEMPLATE_TYPES = ['spec', 'plan', 'tasks', 'checklist', 'agent-file'] as const;
export type TemplateType = typeof TEMPLATE_TYPES[number];

// Ensures all template types have definitions
export const TEMPLATES: Record<TemplateType, TemplateDefinition> = { ... };
```

### Content Organization

Default content stored in separate files for maintainability:
```text
src/templates/defaults/
├── spec.ts      # export const SPEC_TEMPLATE = `...`
├── plan.ts      # export const PLAN_TEMPLATE = `...`
└── ...
```

This keeps the main index.ts file clean while allowing easy editing of individual templates.

### Variable Substitution

```typescript
export interface TemplateVariables {
  feature_name: string;
  description: string;
  date: string;
  branch: string;
}

export function substituteVariables(
  content: string,
  variables: Partial<TemplateVariables>
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in variables ? String(variables[key]) : match;
  });
}
```

## Key Sources

- Existing implementation: `packages/agency-plugin-spec-kit/src/tools/copy-template.ts`
- Existing templates: `.specify/templates/*.md`
- Configuration: `packages/agency-plugin-spec-kit/src/config.ts`
- Issue specification: #159

## Decisions Deferred

- **Template inheritance/extending**: Out of scope, add if needed later
- **Conditional sections in templates**: Use simple replacement for now
- **Template versioning**: Not needed for initial implementation
