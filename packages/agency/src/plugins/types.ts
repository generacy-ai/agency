/**
 * Plugin type definitions for Agency
 *
 * Plugins extend the server with additional tools and lifecycle hooks.
 * This interface is defined locally for forward compatibility with the
 * contracts repo (generacy-ai/contracts#7).
 */

import type { AgencyTool } from '../tools/types.js';

/**
 * Plugin interface for extending the Agency server
 *
 * Plugins provide tools and optional lifecycle hooks for initialization
 * and cleanup.
 */
export interface AgencyPlugin {
  /** Unique plugin identifier */
  name: string;

  /** Semantic version */
  version: string;

  /** Tools provided by this plugin */
  tools: AgencyTool[];

  /** Called when plugin is loaded */
  initialize?(): Promise<void>;

  /** Called when plugin is unloaded or server shuts down */
  shutdown?(): Promise<void>;
}
