# Research: Agency VS Code Extension

## Technology Decisions

### 1. Build Tool: esbuild

**Choice**: esbuild for bundling the extension

**Rationale**:
- VS Code extensions require bundling for marketplace distribution
- esbuild is extremely fast (10-100x faster than webpack)
- Native support for TypeScript without additional configuration
- VS Code's official extension template now recommends esbuild
- Tree-shaking for minimal bundle size

**Alternatives Considered**:
- **webpack**: Industry standard, but slower and more complex configuration
- **rollup**: Good for libraries, less ideal for applications
- **unbundled**: Not viable for marketplace distribution

### 2. MCP Transport: stdio via docker exec

**Choice**: Use stdio transport with `docker exec` to communicate with MCP server in dev containers

**Rationale**:
- Aligns with MCP protocol design (stdio is the primary transport)
- No additional HTTP/WebSocket endpoints needed in the server
- Direct communication with container process
- Lower latency than HTTP-based approaches
- Works with existing Agency MCP server implementation

**Implementation**:
```typescript
// DockerExecTransport spawns: docker exec -i <container> <mcp-command>
// Communicates via stdin/stdout JSON-RPC
```

**Alternatives Considered**:
- **HTTP transport**: Would require Agency core changes, adds complexity
- **WebSocket**: Overkill for request-response pattern
- **Named pipes**: Platform-specific complications

### 3. Configuration Storage: .agency/agency.config.json

**Choice**: Store configuration in `.agency/agency.config.json` in workspace root

**Rationale**:
- Versionable in git (team can share configurations)
- Explicit file that users can edit manually
- Follows pattern established by other tools (.vscode/, .github/)
- JSON format is widely understood and tooling-friendly
- Zod schema ensures type safety and validation

**Structure**:
```json
{
  "version": "1.0",
  "plugins": [...],
  "modes": [...],
  "containers": [...]
}
```

**Alternatives Considered**:
- **VS Code settings**: Less portable, harder to version
- **Separate files per plugin**: More files to manage
- **YAML**: Less tooling support in TypeScript

### 4. Container Discovery: VS Code Remote API + Docker Fallback

**Choice**: Primary discovery via VS Code Remote Containers extension API, with Docker API fallback

**Rationale**:
- Integrates naturally with existing dev container workflows
- Remote Containers extension already tracks container state
- Docker API fallback ensures functionality without Remote Containers
- Two-layer approach maximizes compatibility

**Implementation Order**:
1. Check if Remote Containers extension is installed
2. If yes, use its API for container discovery
3. If no, fall back to Docker API (docker ps, docker inspect)

**Alternatives Considered**:
- **Docker API only**: Misses integration benefits of Remote Containers
- **Remote Containers only**: Would fail without the extension

### 5. Activity Data Source: Agency Event Stream

**Choice**: Subscribe to Agency core event stream for real-time tool invocation monitoring

**Rationale**:
- Single source of truth for all tool activity
- Enables real-time updates without polling
- Agency core already processes all tool calls
- Event-driven architecture scales well

**Requirements**:
- Agency core must emit tool invocation events
- Events should include: tool name, parameters, result, timing, success/failure

**Event Format**:
```typescript
interface ToolCallEvent {
  id: string;
  timestamp: number;
  tool: string;
  namespace: string;
  params: unknown;
  result?: unknown;
  error?: string;
  duration: number;
  status: 'pending' | 'success' | 'error';
}
```

### 6. State Management: Service Classes

**Choice**: Plain TypeScript service classes for state management

**Rationale**:
- No external framework dependencies
- Easy to test with dependency injection
- Matches existing Agency plugin patterns
- VS Code's disposable pattern integrates naturally
- Minimal bundle size impact

**Alternatives Considered**:
- **Redux/MobX**: Overkill for extension complexity
- **RxJS**: Learning curve, bundle size
- **Zustand**: Good option, but adds dependency

### 7. Webview Framework: Plain HTML/CSS/JS

**Choice**: Use vanilla HTML/CSS/JavaScript for webview panels

**Rationale**:
- Minimal bundle size
- No framework overhead
- VS Code webview API is straightforward
- Webviews are relatively simple (forms, lists, syntax highlighting)
- Easier to maintain long-term (no framework migrations)

**Alternatives Considered**:
- **React**: Popular, but adds ~40KB+ to bundle
- **Svelte**: Compiled away, but adds build complexity
- **Vue**: Similar concerns to React

## Implementation Patterns

### VS Code Extension Pattern

```typescript
// extension.ts
export function activate(context: vscode.ExtensionContext) {
  // Initialize services (singleton pattern)
  const configService = new ConfigService(context);
  const mcpClient = new McpClientService();
  const containerService = new ContainerService();

  // Register providers (tree views)
  const pluginProvider = new PluginTreeProvider(configService);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('agency.plugins', pluginProvider)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('agency.configurePlugin',
      (plugin) => PluginConfigPanel.show(context, plugin))
  );
}

export function deactivate() {
  // Cleanup handled by disposables
}
```

### MCP Client Pattern

```typescript
class McpClientService implements Disposable {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;

  async connect(containerInfo: ContainerInfo): Promise<void> {
    this.transport = new DockerExecTransport(containerInfo);
    this.client = new Client({ name: 'agency-extension', version: '1.0.0' }, {});
    await this.client.connect(this.transport);
  }

  async listTools(): Promise<ToolInfo[]> {
    const result = await this.client.listTools();
    return result.tools;
  }

  async executeTool(name: string, params: unknown): Promise<ToolResult> {
    return await this.client.callTool({ name, arguments: params });
  }
}
```

### Tree Provider Pattern

```typescript
class PluginTreeProvider implements vscode.TreeDataProvider<PluginItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<PluginItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private configService: ConfigService) {
    configService.onConfigChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: PluginItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: PluginItem): Promise<PluginItem[]> {
    if (!element) {
      return this.configService.getPlugins().map(p => new PluginItem(p));
    }
    return [];
  }
}
```

### Webview Communication Pattern

```typescript
// Extension side
panel.webview.onDidReceiveMessage(async (message) => {
  switch (message.command) {
    case 'saveConfig':
      await configService.savePluginConfig(message.pluginId, message.config);
      panel.webview.postMessage({ command: 'configSaved' });
      break;
  }
});

// Webview side (JavaScript)
const vscode = acquireVsCodeApi();

function saveConfig(config) {
  vscode.postMessage({ command: 'saveConfig', pluginId: currentPlugin, config });
}

window.addEventListener('message', event => {
  const message = event.data;
  if (message.command === 'configSaved') {
    showNotification('Configuration saved');
  }
});
```

## Key References

### VS Code Extension Development
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Extension Guides](https://code.visualstudio.com/api/extension-guides/overview)
- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)

### MCP Protocol
- [MCP Specification](https://modelcontextprotocol.io/specification)
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)
- [MCP TypeScript SDK Docs](https://modelcontextprotocol.io/sdk/typescript)

### Docker Integration
- [Docker Engine API](https://docs.docker.com/engine/api/)
- [dockerode (Node.js Docker client)](https://github.com/apocas/dockerode)

### VS Code Remote Development
- [Remote Development API](https://code.visualstudio.com/api/advanced-topics/remote-extensions)
- [Dev Containers Extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

---

*Generated by speckit*
