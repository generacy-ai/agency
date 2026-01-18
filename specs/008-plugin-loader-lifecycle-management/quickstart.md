# Quickstart: Plugin Development for Agency

## Creating a Plugin

### 1. Initialize Plugin Package

```bash
mkdir agency-plugin-example
cd agency-plugin-example
pnpm init
```

### 2. Configure package.json

```json
{
  "name": "@generacy-ai/agency-plugin-example",
  "version": "1.0.0",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "type": "module",
  "agency": {
    "id": "@generacy-ai/agency-plugin-example",
    "name": "Example Plugin",
    "description": "An example Agency plugin",
    "dependencies": [],
    "tools": ["example.hello"],
    "modes": ["example"],
    "channels": ["example.events"],
    "critical": false
  },
  "peerDependencies": {
    "@generacy-ai/agency": "^1.0.0"
  }
}
```

### 3. Implement the Plugin

```typescript
// src/index.ts
import type { AgencyPlugin, AgencyCoreAPI, ToolDefinition } from '@generacy-ai/agency';

const helloTool: ToolDefinition = {
  name: 'example.hello',
  description: 'Say hello from the example plugin',
  namespace: 'example',
  outputPattern: 'terse',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' }
    },
    required: ['name']
  },
  async execute(params: { name: string }) {
    return {
      content: [{ type: 'text', text: `Hello, ${params.name}!` }]
    };
  }
};

export function createPlugin(): AgencyPlugin {
  let core: AgencyCoreAPI;
  let unsubscribe: (() => void) | undefined;

  return {
    manifest: {
      id: '@generacy-ai/agency-plugin-example',
      name: 'Example Plugin',
      version: '1.0.0',
      main: './dist/index.js',
      dependencies: [],
      critical: false
    },

    async initialize(coreApi: AgencyCoreAPI) {
      core = coreApi;

      // Register tools
      core.registerTool(helloTool);

      // Register custom mode
      core.registerMode('example');

      // Register channel
      core.registerChannel({
        name: 'example.events',
        description: 'Example plugin events',
        owner: core.getPluginId()
      });

      // Subscribe to mode changes
      unsubscribe = core.onModeChange((mode) => {
        console.log(`Mode changed to: ${mode}`);
      });
    },

    async shutdown() {
      // Cleanup subscriptions
      unsubscribe?.();

      // Unregister tools
      core.unregisterTool('example.hello');
    },

    onModeChange(mode: string) {
      // Handle mode changes
      if (mode === 'example') {
        console.log('Example mode activated!');
      }
    }
  };
}

export default createPlugin;
```

### 4. Build the Plugin

```bash
pnpm add -D typescript
npx tsc --init
pnpm build
```

## Installing Plugins

### From npm

```bash
pnpm add @generacy-ai/agency-plugin-example
```

Plugins matching `@generacy-ai/agency-plugin-*` are discovered automatically.

### From Local Path

Add to your Agency configuration:

```json
{
  "pluginPaths": ["./local-plugins/my-plugin"]
}
```

### Explicit Loading

```typescript
import { AgencyServer } from '@generacy-ai/agency';
import { createPlugin } from './my-plugin';

const server = await AgencyServer.create();
await server.loadPlugin(createPlugin());
```

## Plugin Communication

### Sending Messages

```typescript
core.sendMessage('example.events', {
  type: 'custom-event',
  data: { foo: 'bar' }
});
```

### Receiving Messages

```typescript
const unsubscribe = core.onMessage('example.events', (envelope) => {
  console.log('Received:', envelope.payload);
});

// Later: cleanup
unsubscribe();
```

## Plugin Dependencies

Declare dependencies in manifest:

```json
{
  "agency": {
    "dependencies": ["@generacy-ai/agency-plugin-base"]
  }
}
```

Dependencies are loaded first in topological order.

## Critical Plugins

Mark plugins that must succeed:

```json
{
  "agency": {
    "critical": true
  }
}
```

If a critical plugin fails, the entire system stops.

## Testing Plugins

```typescript
import { createTestCore } from '@generacy-ai/agency/testing';
import { createPlugin } from './my-plugin';

describe('Example Plugin', () => {
  it('registers tools on initialize', async () => {
    const core = createTestCore();
    const plugin = createPlugin();

    await plugin.initialize(core);

    expect(core.getRegisteredTools()).toContain('example.hello');
  });
});
```

## Troubleshooting

### Plugin Not Discovered

- Verify package name matches `@generacy-ai/agency-plugin-*`
- Check `main` field points to built output
- Ensure plugin is installed in `node_modules`

### Dependency Errors

- Check all dependencies are installed
- Verify no circular dependencies
- Ensure dependency version compatibility

### Initialization Failures

- Check logs for detailed error messages
- Verify AgencyCoreAPI methods are called correctly
- Non-critical plugins are disabled on failure; check server still runs
