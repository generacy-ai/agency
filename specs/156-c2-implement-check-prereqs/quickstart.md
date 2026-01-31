# Quickstart: check_prereqs Tool

## Overview

The `spec_kit.check_prereqs` tool validates that required specification files exist before workflow operations proceed.

## Usage

### Basic Usage (default: require spec.md)

```typescript
// MCP call
const result = await mcp.callTool('spec_kit.check_prereqs', {});
```

### Require Multiple Files

```typescript
// Require spec.md, plan.md, and tasks.md
const result = await mcp.callTool('spec_kit.check_prereqs', {
  require_spec: true,
  require_plan: true,
  require_tasks: true,
});
```

### Include tasks.md in Available Docs

```typescript
// Include tasks.md in the available_docs list if it exists
const result = await mcp.callTool('spec_kit.check_prereqs', {
  require_spec: true,
  include_tasks: true,
});
```

### Specify Branch/Feature

```typescript
// Check prerequisites for a specific feature
const result = await mcp.callTool('spec_kit.check_prereqs', {
  branch: '042-user-auth',
});
```

## Response Examples

### Success (all prerequisites met)

```json
{
  "valid": true,
  "featureDir": "/workspace/specs/042-user-auth",
  "availableDocs": ["research.md", "contracts/"]
}
```

### Failure (missing required files)

```json
{
  "valid": false,
  "featureDir": "/workspace/specs/042-user-auth",
  "availableDocs": [],
  "missingRequired": ["plan.md"],
  "error": "Missing required files: plan.md"
}
```

### Failure (feature not found)

```json
{
  "valid": false,
  "featureDir": "",
  "availableDocs": [],
  "error": "Could not determine feature name. Use a feature branch (###-name) or set SPECIFY_FEATURE env var."
}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| require_spec | boolean | true | Whether spec.md is required |
| require_plan | boolean | false | Whether plan.md is required |
| require_tasks | boolean | false | Whether tasks.md is required |
| include_tasks | boolean | false | Include tasks.md in available_docs |
| branch | string | - | Feature name (auto-detected if not provided) |
| cwd | string | process.cwd() | Working directory |

## Available Documents

The tool checks for these optional documents:
- `research.md` - Technology research
- `data-model.md` - Data model definitions
- `quickstart.md` - Getting started guide
- `contracts/` - Directory with contract files
- `checklists/` - Directory with checklist files

## Workflow Integration

```typescript
// Example: Gate /speckit:plan command
const prereqs = await mcp.callTool('spec_kit.check_prereqs', {
  require_spec: true,
});

if (!prereqs.valid) {
  console.error(`Cannot proceed: ${prereqs.error}`);
  return;
}

// Proceed with planning...
```

## Troubleshooting

### "Could not determine feature name"
- Ensure you're on a feature branch (e.g., `042-feature-name`)
- Or set `SPECIFY_FEATURE` environment variable
- Or pass explicit `branch` parameter

### "Branch name does not match required pattern"
- Branch must follow `###-short-name` format
- Example: `001-user-auth`, `042-api-v2`

### "Feature directory does not exist"
- Run `/speckit:specify` first to create the feature directory
- Check that specs/ directory exists in repository root
