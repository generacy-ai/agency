# @generacy-ai/agency-plugin-spec-kit

[![npm version](https://img.shields.io/npm/v/@generacy-ai/agency-plugin-spec-kit.svg)](https://www.npmjs.com/package/@generacy-ai/agency-plugin-spec-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Specification management plugin for Agency - a specification-driven development toolkit with backlog provider abstraction.

## Overview

This plugin provides MCP (Model Context Protocol) tools for managing feature specifications, coordinating with backlog systems, and automating development workflows. It supports multiple backlog providers (GitHub, Jira, Shortcut, Local) through a unified abstraction layer.

## Installation

```bash
# Using pnpm
pnpm add @generacy-ai/agency-plugin-spec-kit

# Using npm
npm install @generacy-ai/agency-plugin-spec-kit
```

## Quick Start

Register the plugin with your Agency MCP server:

```typescript
import { createAgencyServer } from '@generacy-ai/agency';
import { createSpecKitPlugin } from '@generacy-ai/agency-plugin-spec-kit';

const server = createAgencyServer({
  plugins: [createSpecKitPlugin()],
});

server.start();
```

## Available Tools

The plugin exposes 11 MCP tools for specification-driven development:

| Tool | Description |
|------|-------------|
| `get_paths` | Get feature directory paths for current branch |
| `get_ticket` | Fetch ticket details from backlog provider |
| `create_ticket` | Create new tickets in backlog system |
| `update_ticket` | Update existing tickets |
| `check_prereqs` | Validate prerequisites for commands |
| `manage_clarifications` | Handle clarification questions (read, append, update answers) |
| `copy_template` | Copy template files (spec, plan, tasks, checklist) to feature directory |
| `git_ops` | Git operations: create_branch, checkout, fetch, status, current_branch |
| `update_agent` | Update AI agent context files with technology information |
| `create_feature` | Create feature branches with initialized spec directory |
| `tasks_to_issues` | Convert tasks.md to GitHub issues with configurable grouping |

## Backlog Providers

The plugin supports multiple backlog systems through a provider abstraction:

| Provider | Description | Configuration |
|----------|-------------|---------------|
| `github` | GitHub Issues integration | Requires `GITHUB_TOKEN` |
| `jira` | Jira Cloud/Server integration | Requires Jira API credentials |
| `shortcut` | Shortcut (formerly Clubhouse) | Requires `SHORTCUT_API_TOKEN` |
| `local` | Local file-based backlog | No external dependencies |

## Bundled Workflows

The plugin ships with canonical workflow YAML files for spec-driven development. These bundled workflows eliminate version drift across repositories — instead of each repo maintaining its own copy of `speckit-feature.yaml` and `speckit-bugfix.yaml` in `.generacy/`, they are distributed automatically with the plugin package.

### Included workflows

| Workflow | File | Description |
|----------|------|-------------|
| `speckit-feature` | `workflows/speckit-feature.yaml` | Full feature development: specify, clarify, plan, tasks, implement |
| `speckit-bugfix` | `workflows/speckit-bugfix.yaml` | Streamlined bugfix: specify, plan, tasks, implement, verify |

### Local overrides

Local workflow files in your repository take priority over bundled ones. When `resolveWorkflow()` is called, it checks:

1. `<repoRoot>/.generacy/<name>.yaml` — local override (highest priority)
2. Bundled workflow from this package — fallback

This means you can customize a workflow for a specific repo by placing a modified copy in `.generacy/`.

### Migration

If your repo has `.generacy/speckit-feature.yaml` or `.generacy/speckit-bugfix.yaml` files that are unmodified copies of the canonical workflows, you can delete them. The plugin will automatically fall back to the bundled versions.

```bash
# Remove local copies to use bundled defaults
rm .generacy/speckit-feature.yaml .generacy/speckit-bugfix.yaml
```

To check which version is currently bundled, look at the `version` field in the YAML files (currently `1.3.0`).

### Workflow API

#### `BUILTIN_WORKFLOWS`

Map of bundled workflow names to their absolute file paths.

```typescript
import { BUILTIN_WORKFLOWS } from '@generacy-ai/agency-plugin-spec-kit';

// { 'speckit-feature': '/abs/path/to/workflows/speckit-feature.yaml',
//   'speckit-bugfix': '/abs/path/to/workflows/speckit-bugfix.yaml' }
```

#### `getBuiltinWorkflowPath(name: string): string | undefined`

Get the absolute path to a bundled workflow file. Returns `undefined` for unknown names.

```typescript
import { getBuiltinWorkflowPath } from '@generacy-ai/agency-plugin-spec-kit';

const path = getBuiltinWorkflowPath('speckit-feature');
// '/abs/path/to/workflows/speckit-feature.yaml'

const unknown = getBuiltinWorkflowPath('unknown');
// undefined
```

#### `resolveWorkflow(name: string, repoRoot: string): string | undefined`

Resolve a workflow by name with local-first override semantics. Checks `<repoRoot>/.generacy/<name>.yaml` first, then falls back to the bundled workflow. Returns `undefined` if the name is not known and no local file exists.

```typescript
import { resolveWorkflow } from '@generacy-ai/agency-plugin-spec-kit';

// Uses local override if .generacy/speckit-feature.yaml exists,
// otherwise returns the bundled path
const path = resolveWorkflow('speckit-feature', '/path/to/repo');
```

#### `BuiltinWorkflowName` (type)

Type union of known bundled workflow names: `'speckit-feature' | 'speckit-bugfix'`.

```typescript
import type { BuiltinWorkflowName } from '@generacy-ai/agency-plugin-spec-kit';
```

## Configuration

Configuration is managed through environment variables and the `.speckit/` directory. For detailed configuration options, see [docs/configuration.md](./docs/configuration.md).

Basic environment variables:

```bash
# GitHub provider (default)
GITHUB_TOKEN=your_github_token

# Jira provider
JIRA_HOST=your-domain.atlassian.net
JIRA_EMAIL=your-email@example.com
JIRA_API_TOKEN=your_jira_token

# Shortcut provider
SHORTCUT_API_TOKEN=your_shortcut_token
```

## Related Packages

- [`@generacy-ai/agency`](../agency) - Core Agency MCP server

## License

MIT
