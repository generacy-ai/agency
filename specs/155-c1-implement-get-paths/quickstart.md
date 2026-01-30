# Quickstart: get_paths Tool

## Overview

The `spec_kit.get_paths` tool resolves all file paths associated with a feature. It's typically used at the start of speckit workflows to determine where spec artifacts should be read from or written to.

## Basic Usage

### From Current Branch

When on a feature branch (e.g., `155-c1-implement-get-paths`):

```typescript
const result = await toolRegistry.execute('spec_kit.get_paths', {});
// Returns paths based on current git branch
```

### With Explicit Branch

```typescript
const result = await toolRegistry.execute('spec_kit.get_paths', {
  branch: '042-user-auth'
});
// Returns paths for specified feature
```

### With Environment Variable

```bash
export SPECIFY_FEATURE="155-c1-implement-get-paths"
```

```typescript
const result = await toolRegistry.execute('spec_kit.get_paths', {});
// Uses SPECIFY_FEATURE env var instead of git branch
```

## Response Structure

### Success Response

```json
{
  "success": true,
  "exists": true,
  "repoRoot": "/workspaces/agency",
  "branch": "155-c1-implement-get-paths",
  "hasGit": true,
  "featureDir": "/workspaces/agency/specs/155-c1-implement-get-paths",
  "specFile": "/workspaces/agency/specs/155-c1-implement-get-paths/spec.md",
  "planFile": "/workspaces/agency/specs/155-c1-implement-get-paths/plan.md",
  "tasksFile": "/workspaces/agency/specs/155-c1-implement-get-paths/tasks.md",
  "researchFile": "/workspaces/agency/specs/155-c1-implement-get-paths/research.md",
  "dataModelFile": "/workspaces/agency/specs/155-c1-implement-get-paths/data-model.md",
  "quickstartFile": "/workspaces/agency/specs/155-c1-implement-get-paths/quickstart.md",
  "contractsDir": "/workspaces/agency/specs/155-c1-implement-get-paths/contracts",
  "checklistsDir": "/workspaces/agency/specs/155-c1-implement-get-paths/checklists",
  "clarificationsFile": "/workspaces/agency/specs/155-c1-implement-get-paths/clarifications.md"
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "INVALID_BRANCH_NAME",
    "message": "Branch name 'main' does not match required pattern ###-name",
    "context": {
      "pattern": "^\\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$"
    }
  }
}
```

## Path Resolution Priority

1. **Explicit `branch` parameter** - If provided, used directly
2. **SPECIFY_FEATURE environment variable** - Checked next
3. **Current git branch** - Falls back to git branch detection
4. **Most recent feature directory** - Last resort fallback

## Configuration

Custom file names can be configured via plugin configuration:

```typescript
// In agency config
{
  plugins: {
    speckit: {
      specDirectory: 'specs',        // Default
      fileNames: {
        spec: 'specification.md',    // Override default 'spec.md'
        plan: 'implementation.md'    // Override default 'plan.md'
      }
    }
  }
}
```

## Common Patterns

### Check if Feature Exists

```typescript
const result = await toolRegistry.execute('spec_kit.get_paths', { branch });
if (result.success && result.exists) {
  // Feature directory exists, can read files
} else if (result.success && !result.exists) {
  // Valid branch but no directory yet - create it
}
```

### Use in Other Tools

The `get_paths` tool is typically called first, then its output is used by other tools:

```typescript
// 1. Get paths
const paths = await toolRegistry.execute('spec_kit.get_paths', {});

// 2. Use paths in subsequent operations
const specContent = await fs.readFile(paths.specFile, 'utf-8');
```

## Troubleshooting

| Error Code | Cause | Solution |
|------------|-------|----------|
| `FEATURE_DIR_NOT_FOUND` | Not in a git repo or no specs/ dir | Ensure you're in a valid repository |
| `INVALID_BRANCH_NAME` | Branch doesn't match `###-name` pattern | Use a feature branch or set SPECIFY_FEATURE |

## Available Commands

This tool is part of the spec_kit plugin and is registered automatically when the plugin loads.

```typescript
import { createSpecKitPlugin } from '@generacy-ai/agency-plugin-spec-kit';

const plugin = createSpecKitPlugin();
await agency.loadPlugin(plugin);

// Tool is now available as 'spec_kit.get_paths'
```
