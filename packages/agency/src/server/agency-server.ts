/**
 * Agency Server - Core MCP server implementation
 *
 * A thin wrapper around the MCP SDK's low-level Server that adds:
 * - Plugin-based tool registration
 * - Mode-based tool filtering
 * - Multi-source configuration loading
 * - Graceful lifecycle management
 *
 * Enhanced to support:
 * - CoreAPI for plugin initialization
 * - ChannelManager for inter-plugin communication
 * - Plugin discovery and automatic loading
 * - Mode change notifications to plugins
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
import { PluginLoader, type AgencyPlugin, type LegacyAgencyPlugin, type PluginLoadOptions } from '../plugins/index.js';
import { ToolRegistry, type AgencyTool } from '../tools/index.js';
import { ChannelManager } from '../channels/index.js';
import { CoreAPIFactory } from '../core-api/index.js';
import { AgencyFacetRegistry, FacetBinder, type FacetBindingResult } from '../facets/index.js';
import type { TelemetryEvent, PluginManifest } from '../plugins/types.js';

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

  /** Whether to auto-discover and load plugins on start */
  autoLoadPlugins?: boolean;
}

/**
 * Main Agency server class
 *
 * Provides MCP protocol support with Agency-specific features:
 * - Mode-based tool filtering
 * - Plugin system for extensibility
 * - Multi-source configuration
 * - Inter-plugin communication via channels
 * - CoreAPI for plugin initialization
 */
export class AgencyServer {
  private readonly config: AgencyConfig;
  private readonly projectRoot: string;
  private readonly registry: ToolRegistry;
  private readonly modeManager: ModeManager;
  private readonly pluginLoader: PluginLoader;
  private readonly channelManager: ChannelManager;
  private readonly coreAPIFactory: CoreAPIFactory;
  private readonly facetRegistry: AgencyFacetRegistry;
  private readonly autoLoadPlugins: boolean;

  private server: Server | null = null;
  private transport: StdioServerTransport | null = null;
  private state: ServerState = 'stopped';
  private modeChangeUnsubscribe?: () => void;

  private constructor(config: AgencyConfig, options: AgencyServerOptions = {}) {
    this.config = config;
    this.projectRoot = options.projectRoot ?? process.cwd();
    this.autoLoadPlugins = options.autoLoadPlugins ?? false;

    // Initialize components
    this.registry = new ToolRegistry();
    this.registry.setModePatterns(config.modes);

    this.modeManager = new ModeManager(config.modes, config.defaultMode);
    this.channelManager = new ChannelManager();
    this.facetRegistry = new AgencyFacetRegistry();

    // Create CoreAPI factory with dependencies
    this.coreAPIFactory = new CoreAPIFactory({
      toolRegistry: this.registry,
      modeManager: {
        getMode: () => this.modeManager.getMode(),
        registerMode: (mode: string) => this.modeManager.registerMode(mode),
        onModeChange: (callback) => this.modeManager.onModeChange(callback),
      },
      channelManager: this.channelManager,
      config: config as unknown as Record<string, unknown>,
      recordEvent: (event: TelemetryEvent) => this.recordTelemetryEvent(event),
      facetRegistry: this.facetRegistry,
    });

    // Create plugin loader with enhanced dependencies
    this.pluginLoader = new PluginLoader({
      toolRegistry: this.registry,
      coreAPIFactory: this.coreAPIFactory,
      channelManager: this.channelManager,
      modeManager: this.modeManager,
    });

    // Subscribe to mode changes to notify plugins
    this.modeChangeUnsubscribe = this.modeManager.onModeChange((mode) => {
      this.pluginLoader.notifyModeChange(mode);
    });
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

    return new AgencyServer(config, options);
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
      // Auto-load plugins if enabled
      if (this.autoLoadPlugins) {
        await this.discoverAndLoadPlugins();
      }

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
      // Unsubscribe from mode changes
      if (this.modeChangeUnsubscribe) {
        this.modeChangeUnsubscribe();
        this.modeChangeUnsubscribe = undefined;
      }

      // Shutdown all plugins
      await this.pluginLoader.shutdownAll();

      // Clear channels
      this.channelManager.clear();

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
   * Discover and load plugins from configured sources
   *
   * After plugins are loaded, validates all facet requirements are satisfied.
   * Fails fast if required facets are missing.
   *
   * @param options Optional load options to override config
   * @returns Array of loaded plugin IDs
   */
  async discoverAndLoadPlugins(options?: Partial<PluginLoadOptions>): Promise<string[]> {
    const loadedPluginIds = await this.pluginLoader.discoverAndLoad({
      projectRoot: this.projectRoot,
      pluginPaths: this.config.pluginPaths,
      plugins: this.config.plugins,
      pluginOptions: this.config.pluginOptions,
      ...options,
    });

    // Run facet binding validation after all plugins are loaded
    const bindingResult = this.bindFacets();
    this.logFacetBindingResult(bindingResult);

    if (!bindingResult.success) {
      // Fail fast if required facets are missing
      const errorMessages = bindingResult.errors.map(
        (e) => `Plugin ${e.plugin} requires facet '${e.facet}'${e.qualifier ? ` (${e.qualifier})` : ''}: ${e.error.message}`
      );
      throw new AgencyError(
        ErrorCodes.FACET_BINDING_FAILED,
        `Facet binding failed:\n${errorMessages.join('\n')}`
      );
    }

    return loadedPluginIds;
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
  async loadPlugin(plugin: AgencyPlugin | LegacyAgencyPlugin): Promise<void> {
    await this.pluginLoader.loadPlugin(plugin);
  }

  /**
   * Unload a plugin by name or ID
   */
  async unloadPlugin(name: string): Promise<boolean> {
    return this.pluginLoader.unloadPlugin(name);
  }

  /**
   * Set the current mode
   *
   * Mode change is automatically broadcast to all plugins.
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
   * Get the channel manager for testing or advanced usage
   */
  getChannelManager(): ChannelManager {
    return this.channelManager;
  }

  /**
   * Get the mode manager for testing or advanced usage
   */
  getModeManager(): ModeManager {
    return this.modeManager;
  }

  /**
   * Get the plugin loader for testing or advanced usage
   */
  getPluginLoader(): PluginLoader {
    return this.pluginLoader;
  }

  /**
   * Get the facet registry for testing or advanced usage
   */
  getFacetRegistry(): AgencyFacetRegistry {
    return this.facetRegistry;
  }

  /**
   * Record a telemetry event
   *
   * This is called by plugins via CoreAPI. Override or extend
   * to integrate with telemetry providers.
   */
  private recordTelemetryEvent(_event: TelemetryEvent): void {
    // Base implementation does nothing
    // Can be extended to integrate with TelemetryManager
  }

  /**
   * Run facet binding validation after plugins are loaded.
   *
   * Validates that all required facets declared by plugins are satisfied.
   */
  private bindFacets(): FacetBindingResult {
    const binder = new FacetBinder(this.facetRegistry);
    const pluginManifests = this.pluginLoader.getLoadedPlugins().map((p) => p.manifest);
    return binder.bindAll(pluginManifests as PluginManifest[]);
  }

  /**
   * Log facet binding results for debugging.
   */
  private logFacetBindingResult(result: FacetBindingResult): void {
    // Log bound facets (debug level - omitted in production)
    if (result.bound.length > 0) {
      // In production, this could be logged at debug level
      // For now we just collect the info silently
    }

    // Log warnings to stderr so they're visible
    for (const warning of result.warnings) {
      console.error(`[agency] Facet warning: ${warning}`);
    }

    // Log errors (these will also throw, but log for debugging)
    for (const error of result.errors) {
      const qual = error.qualifier ? ` (${error.qualifier})` : '';
      console.error(
        `[agency] Facet error: Plugin ${error.plugin} requires ${error.facet}${qual} - ${error.error.message}`
      );
    }
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

        // Notify plugins of tool call
        this.pluginLoader.notifyToolCall(name, args);

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
