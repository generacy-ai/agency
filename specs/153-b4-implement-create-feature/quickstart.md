# Quickstart: create_feature Tool

## Installation

The `spec_kit.create_feature` tool is part of `@generacy-ai/agency-plugin-spec-kit`. It's automatically registered when the plugin is loaded.

## Usage

### Basic Feature Creation

Create a new feature with auto-generated number and slug:

```typescript
// MCP tool call
{
  "tool": "spec_kit.create_feature",
  "params": {
    "description": "Implement user authentication with OAuth2 support"
  }
}

// Result
{
  "success": true,
  "branch_name": "154-implement-user-auth",
  "feature_num": "154",
  "spec_file": "/workspaces/project/specs/154-implement-user-auth/spec.md",
  "feature_dir": "/workspaces/project/specs/154-implement-user-auth",
  "git_branch_created": true,
  "branched_from_epic": false
}
```

### Feature with Explicit Number

```typescript
{
  "tool": "spec_kit.create_feature",
  "params": {
    "description": "Add payment processing",
    "number": 200
  }
}
```

### Feature with Custom Short Name

Override the auto-generated slug:

```typescript
{
  "tool": "spec_kit.create_feature",
  "params": {
    "description": "Implement comprehensive user authentication system with OAuth2 and SAML support",
    "short_name": "user-auth"
  }
}

// Result: branch_name = "155-user-auth" (instead of auto-generated slug)
```

### Epic Child Feature

Create a feature that branches from a parent epic:

```typescript
{
  "tool": "spec_kit.create_feature",
  "params": {
    "description": "Implement login form component",
    "parent_epic_branch": "100-user-management"
  }
}

// Result
{
  "success": true,
  "branch_name": "156-implement-login-form",
  "branched_from_epic": true,
  "parent_epic_branch": "100-user-management"
}
```

## Configuration

Configure branch naming in `.specify/speckit.json`:

```json
{
  "branches": {
    "pattern": "{paddedNumber}-{slug}",
    "numberPadding": 3,
    "maxSlugWords": 4
  },
  "paths": {
    "specs": "specs",
    "templates": ".specify/templates"
  }
}
```

### Available Pattern Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{number}` | Raw feature number | `42` |
| `{paddedNumber}` | Zero-padded number | `042` |
| `{slug}` | Auto-generated slug | `user-auth` |
| `{type}` | Feature type | `feature` |

### Example Patterns

- `{paddedNumber}-{slug}` → `042-user-auth`
- `{type}/{paddedNumber}-{slug}` → `feature/042-user-auth`
- `feature-{number}-{slug}` → `feature-42-user-auth`

## Directory Structure Created

```
specs/
└── 154-implement-user-auth/
    └── spec.md              # Auto-generated from template
```

**Note**: Subdirectories (`checklists/`, `contracts/`) are created lazily when needed, not during initial creation.

## Error Handling

### Common Errors

| Error Code | Cause | Solution |
|------------|-------|----------|
| `FEATURE_DIR_NOT_FOUND` | Not in a git repository | Run from within a git repo |
| `BRANCH_EXISTS` | Directory already exists | Use different number/name |
| `BRANCH_EXISTS_FOR_ISSUE` | Branch exists for number | Use existing branch |
| `INVALID_BRANCH_NAME` | Bad generated name | Use `short_name` override |
| `INVALID_FEATURE_NUMBER` | Number > 999 | Use number 1-999 |

### Example Error Response

```typescript
{
  "success": false,
  "error": {
    "code": "BRANCH_EXISTS_FOR_ISSUE",
    "message": "A branch already exists for issue #153: 153-b4-implement-create-feature",
    "context": {
      "existing_branches": ["153-b4-implement-create-feature"]
    }
  }
}
```

## Workflow Integration

This tool integrates with the autodev workflow:

```bash
# Start development on a new feature
/autodev:start https://github.com/owner/repo/issues/42

# The workflow calls create_feature internally:
# 1. Extracts issue number (42)
# 2. Generates slug from issue title
# 3. Creates branch and spec directory
# 4. Runs /speckit:specify
```

## Troubleshooting

### Branch Not Created
- Check if you have git write permissions
- Verify you're in a git repository
- Check for uncommitted changes that might conflict

### Wrong Feature Number
- The tool scans both `specs/` directory and git branches
- Ensure no stale directories exist with high numbers
- Use explicit `number` parameter if needed

### Slug Too Long
- Default max is 4 words
- Configure `maxSlugWords` in config
- Use `short_name` parameter for explicit override
