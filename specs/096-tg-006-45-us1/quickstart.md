# Quickstart: ConfigService

## Overview

The ConfigService provides centralized configuration management for the Agency VS Code extension. It handles plugins, modes, and containers configuration with automatic persistence, version migration, and change notifications.

## Installation

Already installed as part of `@generacy-ai/agency-extension`.

```typescript
import { ConfigService } from '@generacy-ai/agency-extension';
```

## Basic Usage

### 1. Initialize the Service

```typescript
import * as vscode from 'vscode';
import { ConfigService } from './services';

export async function activate(context: vscode.ExtensionContext) {
  const configService = ConfigService.getInstance();
  await configService.initialize(vscode);

  // Service is now ready to use
  console.log('ConfigService initialized');
}
```

**Important**:
- Call `initialize()` once during extension activation
- All other operations require initialization first
- The service uses a singleton pattern

### 2. Get Configuration

```typescript
const configService = ConfigService.getInstance();

// Get full config
const config = configService.getConfig();
console.log('Current version:', config?.version);

// Get all plugins
const plugins = configService.getPlugins();
console.log('Installed plugins:', plugins.length);

// Get specific plugin
const plugin = configService.getPlugin('my-plugin-id');
if (plugin) {
  console.log('Plugin enabled:', plugin.enabled);
}

// Get all modes
const modes = configService.getModes();

// Get specific mode
const debugMode = configService.getMode('debug');

// Get all containers
const containers = configService.getContainers();

// Get specific container
const container = configService.getContainer('dev-container');
```

### 3. Save Configuration

```typescript
const configService = ConfigService.getInstance();

// Add or update a plugin
await configService.savePluginConfig({
  id: 'my-plugin',
  enabled: true,
  settings: {
    apiKey: 'xxx',
    timeout: 30000
  }
});

// Add or update a mode
await configService.saveModeConfig({
  id: 'debug',
  name: 'Debug Mode',
  tools: ['debugger', 'profiler', 'logger'],
  inherits: 'default'
});

// Add or update a container
await configService.saveContainerConfig({
  id: 'dev',
  name: 'Development Container',
  workspacePath: '/workspace'
});
```

**Note**: Save operations automatically persist to `.agency/agency.config.json` and emit change events.

### 4. Listen for Changes

```typescript
const configService = ConfigService.getInstance();

// Listen for any config changes
const disposable = configService.onConfigChange((config) => {
  console.log('Configuration changed!');
  console.log('New plugin count:', config?.plugins.length);

  // React to changes (e.g., reload UI, update services)
  refreshPluginUI();
});

// Later: stop listening
context.subscriptions.push(disposable);
```

**When does onConfigChange fire?**
- Initial config load
- After any save operation
- When `.agency/agency.config.json` is modified externally
- After config migration

### 5. Remove Configuration

```typescript
const configService = ConfigService.getInstance();

// Remove a plugin
const removed = await configService.removePlugin('my-plugin');
if (removed) {
  console.log('Plugin removed');
}

// Remove a mode (except 'default')
await configService.removeMode('custom-mode');

// Remove a container
await configService.removeContainer('old-container');
```

**Note**: The 'default' mode cannot be removed.

## Advanced Usage

### Testing with ConfigService

The service can be reset for testing:

```typescript
import { ConfigService } from './services';

describe('My Feature', () => {
  beforeEach(() => {
    ConfigService.reset(); // Get fresh instance
  });

  afterEach(() => {
    ConfigService.reset(); // Clean up
  });

  it('should work with config', async () => {
    const service = ConfigService.getInstance();
    await service.initialize(mockVscode);

    // Test your feature
  });
});
```

### Handling Initialization State

```typescript
const configService = ConfigService.getInstance();

if (!configService.isInitialized()) {
  console.warn('Service not ready yet');
  return;
}

// Safe to use
const plugins = configService.getPlugins();
```

### Config Migration

When the config version changes, migrations run automatically:

```typescript
// In ConfigService.ts
const MIGRATIONS: ConfigMigration[] = [
  {
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    migrate(config) {
      // Add new field with default
      return { ...config, newField: 'default' };
    }
  },
  {
    fromVersion: '1.1.0',
    toVersion: '1.2.0',
    migrate(config) {
      // Rename field
      const { oldField, ...rest } = config;
      return { ...rest, newField: oldField };
    }
  }
];
```

Migrations apply automatically when:
- Loading a config with older version
- External changes detect older version

## Common Patterns

### Pattern 1: React to Plugin Enable/Disable

```typescript
const configService = ConfigService.getInstance();

configService.onConfigChange((config) => {
  const enabledPlugins = config?.plugins.filter(p => p.enabled) ?? [];

  // Load/unload plugins based on enabled state
  for (const plugin of enabledPlugins) {
    loadPlugin(plugin.id, plugin.settings);
  }
});
```

### Pattern 2: Validate Before Save

```typescript
async function updatePluginSetting(pluginId: string, key: string, value: unknown) {
  const configService = ConfigService.getInstance();
  const plugin = configService.getPlugin(pluginId);

  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  // Validate the setting
  if (!isValidSetting(key, value)) {
    throw new Error(`Invalid setting: ${key}`);
  }

  // Update and save
  plugin.settings[key] = value;
  await configService.savePluginConfig(plugin);
}
```

### Pattern 3: Mode Tool Resolution

```typescript
function getActiveTools(modeId: string): string[] {
  const configService = ConfigService.getInstance();
  const mode = configService.getMode(modeId);

  if (!mode) {
    return [];
  }

  // Collect tools from inheritance chain
  const tools = new Set<string>(mode.tools);

  let currentMode = mode;
  while (currentMode.inherits) {
    currentMode = configService.getMode(currentMode.inherits);
    if (!currentMode) break;

    for (const tool of currentMode.tools) {
      tools.add(tool);
    }
  }

  return Array.from(tools);
}
```

## Configuration File Location

The config file is stored at:

```
{workspace-root}/.agency/agency.config.json
```

**Example**:
```json
{
  "version": "1.0.0",
  "plugins": [
    {
      "id": "autodev",
      "enabled": true,
      "settings": {
        "autoCommit": false
      }
    }
  ],
  "modes": [
    {
      "id": "default",
      "name": "Default",
      "tools": ["read", "write", "bash"]
    },
    {
      "id": "debug",
      "name": "Debug Mode",
      "tools": ["debugger", "profiler"],
      "inherits": "default"
    }
  ],
  "containers": [
    {
      "id": "dev",
      "name": "Development",
      "workspacePath": "/workspace"
    }
  ]
}
```

## Troubleshooting

### Error: "ConfigService not initialized"

**Cause**: Trying to use the service before calling `initialize()`.

**Solution**:
```typescript
const service = ConfigService.getInstance();
await service.initialize(vscode);
```

### Config Changes Not Persisting

**Cause**: File write permissions or invalid path.

**Solution**:
- Check workspace has `.agency/` directory
- Verify write permissions
- Check VS Code workspace configuration

### External Changes Not Detected

**Cause**: File watcher not setup or disposed.

**Solution**:
- Ensure `initialize()` completed successfully
- Check if service was disposed prematurely
- Verify workspace is opened (not just folder)

### Migration Issues

**Cause**: Invalid migration logic or incompatible versions.

**Solution**:
- Check migration functions return valid config
- Ensure version strings are correct
- Review logs for migration errors
- Service falls back to minimal valid config

## API Reference

### ConfigService Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `getInstance()` | Get singleton instance | `ConfigService` |
| `reset()` | Reset singleton (testing) | `void` |
| `initialize(vscode)` | Initialize service | `Promise<void>` |
| `isInitialized()` | Check init status | `boolean` |
| `getConfig()` | Get full config | `AgencyConfig \| null` |
| `getPlugins()` | Get all plugins | `PluginConfig[]` |
| `getPlugin(id)` | Get plugin by ID | `PluginConfig \| undefined` |
| `getModes()` | Get all modes | `ModeConfig[]` |
| `getMode(id)` | Get mode by ID | `ModeConfig \| undefined` |
| `getContainers()` | Get all containers | `ContainerConfig[]` |
| `getContainer(id)` | Get container by ID | `ContainerConfig \| undefined` |
| `savePluginConfig(plugin)` | Save plugin | `Promise<void>` |
| `saveModeConfig(mode)` | Save mode | `Promise<void>` |
| `saveContainerConfig(container)` | Save container | `Promise<void>` |
| `removePlugin(id)` | Remove plugin | `Promise<boolean>` |
| `removeMode(id)` | Remove mode | `Promise<boolean>` |
| `removeContainer(id)` | Remove container | `Promise<boolean>` |
| `onConfigChange` | Event listener | `(listener) => Disposable` |
| `dispose()` | Clean up | `void` |

### Type Definitions

See [data-model.md](./data-model.md) for complete type definitions.

---

*Generated by speckit /plan command*
