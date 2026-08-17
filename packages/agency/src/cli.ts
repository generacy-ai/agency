#!/usr/bin/env node
/**
 * Agency CLI - Start the Agency MCP server
 *
 * This is the main entry point for running Agency as an MCP server.
 * It loads configuration from the project and starts the server with
 * auto-discovery of plugins.
 *
 * Usage:
 *   npx @generacy-ai/agency [--mode <name>]
 *
 * Flags:
 *   --mode <name> - Start in the named mode (e.g. "speckit"), overriding
 *                   defaultMode from every config source
 *
 * Environment variables:
 *   AGENCY_NAME - Server name (default: "agency")
 *   AGENCY_PLUGINS - Comma-separated list of plugins to load
 *   AGENCY_DEFAULT_MODE - Default mode (default: "coding"; overridden by
 *                         .agency/config.json and by --mode)
 */

import { AgencyServer } from './server/index.js';

/** Extract the value of a `--flag value` pair from argv, if present */
function argValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx !== -1 ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  try {
    // Create server with auto-plugin discovery
    const server = await AgencyServer.create({
      projectRoot: process.cwd(),
      autoLoadPlugins: true,
      modeOverride: argValue(process.argv.slice(2), '--mode'),
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      await server.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Start the server
    await server.start();
  } catch (error) {
    // Output error to stderr in a format MCP clients can understand
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Agency server failed to start: ${message}\n`);
    process.exit(1);
  }
}

main();
