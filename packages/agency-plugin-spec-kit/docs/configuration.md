# Configuration Reference

This document provides a complete reference for configuring the SpecKit plugin.

## Configuration File

SpecKit configuration can be specified in your project's configuration file (e.g., `speckit.config.yaml`, `speckit.config.json`, or within your agency configuration).

## SpecKitConfig Structure

```typescript
interface SpecKitConfig {
  paths: PathsConfig;
  branches: BranchesConfig;
  backlog: BacklogConfig;
}
```

All configuration sections are optional and will use sensible defaults if not specified.

---

## PathsConfig

Configure where spec artifacts and templates are stored.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `specs` | string | `'specs'` | Directory for spec artifacts |
| `templates` | string | `'.specify/templates'` | Directory for templates |

### Example

```yaml
paths:
  specs: 'features'
  templates: '.speckit/templates'
```

---

## BranchesConfig

Configure how feature branch names are generated.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pattern` | string | `'{paddedNumber}-{slug}'` | Branch name pattern |
| `numberPadding` | number (1-10) | `3` | Zero-padding for issue numbers |
| `maxSlugWords` | number (1-10) | `4` | Maximum words in slug |

### Pattern Variables

The `pattern` option supports the following variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `{number}` | Raw issue number | `42` |
| `{paddedNumber}` | Zero-padded issue number | `042` |
| `{slug}` | Slugified issue title | `add-user-authentication` |

### Example

```yaml
branches:
  pattern: 'feature/{paddedNumber}-{slug}'
  numberPadding: 4
  maxSlugWords: 3
```

With issue #42 titled "Add user authentication flow", this produces:
`feature/0042-add-user-authentication`

---

## BacklogConfig

Configure the backlog provider for issue tracking integration.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | `'github'` \| `'jira'` \| `'shortcut'` \| `'local'` | `'github'` | Backlog provider type |
| `github` | object | `{}` | GitHub-specific config |
| `jira` | JiraConfig | - | Jira-specific config |
| `shortcut` | ShortcutConfig | - | Shortcut-specific config |

### Provider Types

- **github**: Uses GitHub Issues (default, requires no additional configuration)
- **jira**: Uses Jira Cloud or Server
- **shortcut**: Uses Shortcut (formerly Clubhouse)
- **local**: Local-only mode with no external backlog integration

---

## JiraConfig

Configuration for Jira integration. Required when `provider` is set to `'jira'`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `baseUrl` | string | Yes | Jira base URL (e.g., `https://company.atlassian.net`) |
| `projectKey` | string | Yes | Jira project key (e.g., `PROJ`) |
| `email` | string | No | Jira user email (or use `JIRA_EMAIL` env var) |
| `apiToken` | string | No | Jira API token (or use `JIRA_API_TOKEN` env var) |

### Example

```yaml
backlog:
  provider: 'jira'
  jira:
    baseUrl: 'https://mycompany.atlassian.net'
    projectKey: 'MYPROJ'
```

---

## ShortcutConfig

Configuration for Shortcut integration. Required when `provider` is set to `'shortcut'`.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `workspaceSlug` | string | Yes | Shortcut workspace slug |

### Example

```yaml
backlog:
  provider: 'shortcut'
  shortcut:
    workspaceSlug: 'my-workspace'
```

---

## Environment Variables

Sensitive configuration values can be provided via environment variables:

| Environment Variable | Description | Used By |
|---------------------|-------------|---------|
| `JIRA_EMAIL` | Jira user email for authentication | Jira provider |
| `JIRA_API_TOKEN` | Jira API token for authentication | Jira provider |
| `SHORTCUT_API_TOKEN` | Shortcut API token | Shortcut provider |
| `GITHUB_TOKEN` | GitHub personal access token | GitHub provider |

Environment variables take precedence over configuration file values for authentication credentials.

---

## Validation Rules

The configuration is validated using Zod schemas with the following rules:

### Branches

- `numberPadding`: Must be between 1 and 10 (inclusive)
- `maxSlugWords`: Must be between 1 and 10 (inclusive)

### Jira

When using Jira provider, `baseUrl` and `projectKey` are required.

### Shortcut

When using Shortcut provider, `workspaceSlug` is required.

---

## Complete Configuration Examples

### YAML Format

```yaml
# speckit.config.yaml

paths:
  specs: 'specs'
  templates: '.specify/templates'

branches:
  pattern: '{paddedNumber}-{slug}'
  numberPadding: 3
  maxSlugWords: 4

backlog:
  provider: 'github'
```

### JSON Format

```json
{
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
```

### Jira Configuration (YAML)

```yaml
paths:
  specs: 'features'

branches:
  pattern: 'feature/{paddedNumber}-{slug}'
  numberPadding: 4
  maxSlugWords: 3

backlog:
  provider: 'jira'
  jira:
    baseUrl: 'https://mycompany.atlassian.net'
    projectKey: 'MYPROJ'
    # email and apiToken should be set via environment variables
```

### Shortcut Configuration (YAML)

```yaml
paths:
  specs: 'stories'

branches:
  pattern: 'sc-{number}-{slug}'
  numberPadding: 1
  maxSlugWords: 5

backlog:
  provider: 'shortcut'
  shortcut:
    workspaceSlug: 'my-team'
```

### Minimal Configuration (Using Defaults)

```yaml
# Empty config uses all defaults
# Equivalent to:
# paths:
#   specs: 'specs'
#   templates: '.specify/templates'
# branches:
#   pattern: '{paddedNumber}-{slug}'
#   numberPadding: 3
#   maxSlugWords: 4
# backlog:
#   provider: 'github'
```

---

## Common Configuration Patterns

### Enterprise Jira Setup

```yaml
paths:
  specs: 'docs/specifications'
  templates: '.speckit/enterprise-templates'

branches:
  pattern: '{projectKey}-{paddedNumber}-{slug}'
  numberPadding: 5
  maxSlugWords: 3

backlog:
  provider: 'jira'
  jira:
    baseUrl: 'https://jira.enterprise.com'
    projectKey: 'PLATFORM'
```

### Open Source GitHub Project

```yaml
paths:
  specs: 'specs'

branches:
  pattern: 'issue-{number}-{slug}'
  numberPadding: 1
  maxSlugWords: 6

backlog:
  provider: 'github'
```

### Local Development (No Backlog)

```yaml
paths:
  specs: 'local-specs'
  templates: 'templates'

branches:
  pattern: 'dev-{paddedNumber}-{slug}'
  numberPadding: 2
  maxSlugWords: 4

backlog:
  provider: 'local'
```

### Monorepo with Custom Spec Directory

```yaml
paths:
  specs: 'packages/core/specs'
  templates: '.shared/templates'

branches:
  pattern: 'feat/{paddedNumber}/{slug}'
  numberPadding: 4
  maxSlugWords: 3

backlog:
  provider: 'github'
```

---

## TypeScript Usage

When using SpecKit programmatically:

```typescript
import { parseConfig, SpecKitConfig, DEFAULT_CONFIG } from '@generacy-ai/agency-plugin-spec-kit';

// Parse and validate configuration
const config: SpecKitConfig = parseConfig({
  paths: { specs: 'features' },
  backlog: {
    provider: 'jira',
    jira: {
      baseUrl: 'https://jira.example.com',
      projectKey: 'PROJ'
    }
  },
});

// Use default configuration
const defaultConfig: SpecKitConfig = DEFAULT_CONFIG;

// Access configuration values
console.log(config.paths.specs);           // 'features'
console.log(config.branches.numberPadding); // 3 (default)
console.log(config.backlog.provider);       // 'jira'
```

### Configuration Validation

Configuration is validated at runtime using Zod. Invalid configurations will throw a `ZodError`:

```typescript
import { parseConfig } from '@generacy-ai/agency-plugin-spec-kit';

try {
  const config = parseConfig({
    branches: {
      numberPadding: 15, // Invalid: exceeds max of 10
    },
  });
} catch (error) {
  // ZodError: branches.numberPadding must be <= 10
  console.error(error.message);
}
```
