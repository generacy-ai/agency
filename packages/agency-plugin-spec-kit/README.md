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
