# Quickstart: F4: Plugin manifest, config schema, plugin.ts skeleton

## Installation

The SpecKit plugin is installed as part of the Agency monorepo:

```bash
# From repository root
pnpm install
pnpm build
```

## Configuration

Add SpecKit configuration to your Agency config file (`agency.config.json` or equivalent):

```json
{
  "plugins": {
    "speckit": {
      "paths": {
        "specs": "specs",
        "templates": ".specify/templates"
      },
      "branches": {
        "pattern": "{paddedNumber}-{slug}",
        "numberPadding": 3,
        "maxSlugWords": 4
      },
      "backlog": {
        "provider": "github"
      }
    }
  }
}
```

All configuration options have sensible defaults and can be omitted.

## Usage

### Import the Plugin

```typescript
import { createSpecKitPlugin } from '@generacy-ai/agency-plugin-spec-kit';

// Create plugin instance
const specKitPlugin = createSpecKitPlugin();

// Register with Agency
agency.registerPlugin(specKitPlugin);
```

### Alternative: Default Export

```typescript
import createSpecKitPlugin from '@generacy-ai/agency-plugin-spec-kit';

const plugin = createSpecKitPlugin();
```

## Available Tools

The plugin declares these tools (implementation in subsequent features):

| Tool | Description |
|------|-------------|
| `spec_kit.git_ops` | Git operations (branch, checkout, etc.) |
| `spec_kit.create_feature` | Create new feature branch and spec directory |
| `spec_kit.get_paths` | Get paths to spec artifacts |
| `spec_kit.check_prereqs` | Check prerequisites for commands |
| `spec_kit.copy_template` | Copy template files to feature directory |
| `spec_kit.update_agent` | Update agent context files |
| `spec_kit.get_ticket` | Get ticket details from backlog |
| `spec_kit.create_ticket` | Create new ticket in backlog |
| `spec_kit.update_ticket` | Update existing ticket |
| `spec_kit.tasks_to_issues` | Convert tasks.md to GitHub issues |
| `spec_kit.manage_clarifications` | Manage clarifications.md |

## Modes

The plugin registers for these modes:

- **coding**: All tools available
- **research**: Read-only tools only (`get_ticket`, `get_paths`, `check_prereqs`)

## Configuration Options

### paths

| Option | Default | Description |
|--------|---------|-------------|
| `specs` | `"specs"` | Directory for specification files |
| `templates` | `".specify/templates"` | Directory for template files |

### branches

| Option | Default | Description |
|--------|---------|-------------|
| `pattern` | `"{paddedNumber}-{slug}"` | Branch naming pattern |
| `numberPadding` | `3` | Zero-padding for issue numbers |
| `maxSlugWords` | `4` | Maximum words in branch slug |

### backlog

| Option | Default | Description |
|--------|---------|-------------|
| `provider` | `"github"` | Backlog provider type |
| `jira.baseUrl` | - | Jira instance URL (if provider is jira) |
| `jira.projectKey` | - | Jira project key (if provider is jira) |
| `shortcut.workspaceSlug` | - | Shortcut workspace (if provider is shortcut) |

## Troubleshooting

### Plugin fails to initialize

1. Check that `@generacy-ai/agency-plugin-humancy` is installed (required dependency)
2. Verify configuration is valid JSON
3. Check Agency logs for initialization errors

### Configuration not applied

1. Ensure config key is `plugins.speckit` (not `plugins.spec-kit`)
2. Restart Agency server after config changes
3. Validate Jira/Shortcut config if using those providers

### Tools not available

1. Verify plugin is registered before starting MCP server
2. Check current mode - some tools are mode-restricted
3. Tool implementations will be added in features F5-F9
