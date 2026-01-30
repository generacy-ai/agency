# Quickstart: Provider Registry

## Installation

The provider registry is part of `agency-plugin-spec-kit`. No separate installation needed.

## Usage

### Get or Create a Provider

```typescript
import { getConfiguredProvider } from 'agency-plugin-spec-kit';
import type { BacklogConfig } from 'agency-plugin-spec-kit';

const config: BacklogConfig = {
  provider: 'github',
  github: {}
};

// Creates provider on first call, returns cached instance on subsequent calls
const provider = getConfiguredProvider(config);
```

### Create a New Provider Instance

```typescript
import { createProvider } from 'agency-plugin-spec-kit';

// Always creates a new instance (not cached)
const provider = createProvider(config);
```

### Get Cached Provider by Name

```typescript
import { getProvider } from 'agency-plugin-spec-kit';

// Throws ProviderNotFoundError if not in cache
const provider = getProvider('github');
```

## Error Handling

```typescript
import { ProviderNotFoundError } from 'agency-plugin-spec-kit';

try {
  const provider = getProvider('unknown');
} catch (error) {
  if (error instanceof ProviderNotFoundError) {
    console.log(`Provider ${error.provider} not found`);
  }
}
```

## Available Providers

| Name | Description |
|------|-------------|
| `github` | GitHub Issues integration |
| `jira` | Jira Software integration |
| `shortcut` | Shortcut (formerly Clubhouse) integration |
| `local` | Local file-based backlog |

## API Reference

### `createProvider(config: BacklogConfig): BacklogProvider`
Factory function that creates a new provider instance based on config.

### `getProvider(name: string): BacklogProvider`
Returns a cached provider by name. Throws if not found.

### `getConfiguredProvider(config: BacklogConfig): BacklogProvider`
Gets or creates a provider, caching by provider name.

## Troubleshooting

### "Provider not found: xyz"
The provider name is not recognized. Valid names: github, jira, shortcut, local.

### "Provider not found" when calling getProvider()
The provider has not been initialized yet. Call `getConfiguredProvider(config)` first to initialize it.
