/**
 * Agency Server - Core MCP server implementation
 *
 * A thin wrapper around the MCP SDK's low-level Server that adds:
 * - Plugin-based tool registration
 * - Mode-based tool filtering
 * - Multi-source configuration loading
 * - Graceful lifecycle management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';

import { ConfigLoader, type AgencyConfig } from '../config/index.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';
import { ModeManager } from '../modes/index.js';
import { PluginLoader, type AgencyPlugin } from '../plugins/index.js';
import { ToolRegistry, type AgencyTool } from '../tools/index.js';

/**
 * Server state
 */
type ServerState = 'stopped' | 'starting' | 'running' | 'stopping';

/**
 * AgencyServer configuration options
 */
export interface AgencyServerOptions {
  /** Configuration to use (if not provided, loaded from config sources) */
  config?: AgencyConfig;

  /** Project root for config loading (defaults to cwd) */
  projectRoot?: string;
}

/**
 * Main Agency server class
 *
 * Provides MCP protocol support with Agency-specific features:
 * - Mode-based tool filtering
 * - Plugin system for extensibility
 * - Multi-source configuration
 */
export class AgencyServer {
  private readonly config: AgencyConfig;
  private readonly registry: ToolRegistry;
  private readonly modeManager: ModeManager;
  private readonly pluginLoader: PluginLoader;

  private server: Server | null = null;
  private transport: StdioServerTransport | null = null;
  private state: ServerState = 'stopped';

  private constructor(config: AgencyConfig) {
    this.config = config;

    // Initialize components
    this.registry = new ToolRegistry();
    this.registry.setModePatterns(config.modes);

    this.modeManager = new ModeManager(config.modes, config.defaultMode);
    this.pluginLoader = new PluginLoader(this.registry);
  }

  /**
   * Create a new AgencyServer instance
   *
   * @param options Server options
   * @returns Promise resolving to the server instance
   */
  static async create(options: AgencyServerOptions = {}): Promise<AgencyServer> {
    let config: AgencyConfig;

    if (options.config) {
      config = options.config;
    } else {
      const loader = new ConfigLoader(options.projectRoot);
      config = await loader.load();
    }

    return new AgencyServer(config);
  }

  /**
   * Start the server
   *
   * Sets up the MCP server with stdio transport and registers handlers
   * for tools/list, tools/call, and ping.
   */
  async start(): Promise<void> {
    if (this.state !== 'stopped') {
      throw new AgencyError(
        ErrorCodes.SERVER_ALREADY_RUNNING,
        'Server is already running or starting'
      );
    }

    this.state = 'starting';

    try {
      // Create the MCP server
      this.server = new Server(
        {
          name: this.config.name,
          version: '1.0.0',
        },
        {
          capabilities: {
            tools: {},
          },
        }
      );

      // Set up request handlers
      this.setupHandlers();

      // Create stdio transport
      this.transport = new StdioServerTransport();

      // Connect the server to the transport
      await this.server.connect(this.transport);

      this.state = 'running';
    } catch (error) {
      this.state = 'stopped';
      throw error;
    }
  }

  /**
   * Stop the server gracefully
   */
  async stop(): Promise<void> {
    if (this.state !== 'running') {
      return;
    }

    this.state = 'stopping';

    try {
      // Shutdown all plugins
      await this.pluginLoader.shutdownAll();

      // Close the server
      if (this.server) {
        await this.server.close();
        this.server = null;
      }

      this.transport = null;
    } finally {
      this.state = 'stopped';
    }
  }

  /**
   * Register a tool directly (without a plugin)
   */
  registerTool(tool: AgencyTool): void {
    this.registry.register(tool);
  }

  /**
   * Unregister a tool by name
   */
  unregisterTool(name: string): boolean {
    return this.registry.unregister(name);
  }

  /**
   * Load a plugin
   */
  async loadPlugin(plugin: AgencyPlugin): Promise<void> {
    await this.pluginLoader.loadPlugin(plugin);
  }

  /**
   * Unload a plugin by name
   */
  async unloadPlugin(name: string): Promise<boolean> {
    return this.pluginLoader.unloadPlugin(name);
  }

  /**
   * Set the current mode
   */
  setMode(mode: string): void {
    this.modeManager.setMode(mode);
  }

  /**
   * Get the current mode
   */
  getMode(): string {
    return this.modeManager.getMode();
  }

  /**
   * Get the server configuration
   */
  getConfig(): Readonly<AgencyConfig> {
    return this.config;
  }

  /**
   * Check if the server is running
   */
  isRunning(): boolean {
    return this.state === 'running';
  }

  /**
   * Set up MCP request handlers
   */
  private setupHandlers(): void {
    if (!this.server) {
      return;
    }

    // Handle tools/list - return tools filtered by current mode
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const mode = this.modeManager.getMode();
      const tools = this.registry.getMcpToolsForMode(mode);
      return { tools };
    });

    // Handle tools/call - execute a tool
    this.server.setRequestHandler(
      CallToolRequestSchema,
      async (request): Promise<CallToolResult> => {
        const { name, arguments: args } = request.params;

        // Find the tool
        const tool = this.registry.get(name);
        if (!tool) {
          throw new AgencyError(
            ErrorCodes.TOOL_NOT_FOUND,
            `Tool not found: ${name}`,
            { toolName: name }
          );
        }

        // Check if tool is available in current mode
        const mode = this.modeManager.getMode();
        const availableTools = this.registry.getToolsForMode(mode);
        if (!availableTools.some((t) => t.name === name)) {
          throw new AgencyError(
            ErrorCodes.TOOL_NOT_FOUND,
            `Tool not available in current mode: ${name}`,
            { toolName: name, mode }
          );
        }

        try {
          // Execute the tool
          const result = await tool.execute(args);
          // Convert our ToolResult to MCP's CallToolResult format
          return {
            content: result.content.map((c) => {
              if (c.type === 'text') {
                return { type: 'text' as const, text: c.text };
              } else if (c.type === 'image') {
                return {
                  type: 'image' as const,
                  data: c.data,
                  mimeType: c.mimeType,
                };
              } else {
                return {
                  type: 'resource' as const,
                  resource: c.resource,
                };
              }
            }),
            isError: result.isError,
          };
        } catch (error) {
          if (error instanceof AgencyError) {
            throw error;
          }
          throw new AgencyError(
            ErrorCodes.TOOL_EXEC_FAILED,
            `Tool execution failed: ${name}`,
            {
              toolName: name,
              originalError:
                error instanceof Error ? error.message : String(error),
            }
          );
        }
      }
    );

    // Handle ping - health check
    this.server.setRequestHandler(PingRequestSchema, async () => {
      return {};
    });
  }
}
