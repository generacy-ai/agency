/**
 * Package manager specific command builders
 */

import type { PackageManager, CommandType, CommandOptions, BuiltCommand } from './types.js';

/**
 * Build install command for a package manager
 */
function buildInstallCommand(
  pm: PackageManager,
  options: CommandOptions
): BuiltCommand {
  const args: string[] = ['install'];

  switch (pm) {
    case 'npm':
      if (options.production) args.push('--production');
      if (options.frozen) args.push('--frozen-lockfile');
      if (options.workspace) args.push('-w', options.workspace);
      break;

    case 'yarn':
      if (options.production) args.push('--production');
      if (options.frozen) args.push('--frozen-lockfile');
      if (options.workspace) args.push('--scope', options.workspace);
      break;

    case 'pnpm':
      if (options.production) args.push('--prod');
      if (options.frozen) args.push('--frozen-lockfile');
      if (options.workspace) args.push('--filter', options.workspace);
      break;
  }

  return { command: pm, args };
}

/**
 * Build run command for a package manager
 */
function buildRunCommand(
  pm: PackageManager,
  options: CommandOptions
): BuiltCommand {
  if (!options.script) {
    throw new Error('Script name is required for run command');
  }

  const args: string[] = [];

  switch (pm) {
    case 'npm':
      args.push('run', options.script);
      if (options.workspace) {
        args.unshift('-w', options.workspace);
      }
      break;

    case 'yarn':
      if (options.workspace) {
        args.push('workspace', options.workspace, 'run', options.script);
      } else {
        args.push('run', options.script);
      }
      break;

    case 'pnpm':
      if (options.workspace) {
        args.push('--filter', options.workspace, 'run', options.script);
      } else {
        args.push('run', options.script);
      }
      break;
  }

  // Append additional arguments after --
  if (options.args && options.args.length > 0) {
    args.push('--', ...options.args);
  }

  return { command: pm, args };
}

/**
 * Build command for specified package manager and operation
 */
export function buildCommand(
  pm: PackageManager,
  type: CommandType,
  options: CommandOptions = {}
): BuiltCommand {
  switch (type) {
    case 'install':
      return buildInstallCommand(pm, options);

    case 'run':
      return buildRunCommand(pm, options);

    case 'exec':
      // Exec is similar to run but executes binaries directly
      return buildRunCommand(pm, options);

    default:
      throw new Error(`Unknown command type: ${type}`);
  }
}

/**
 * Get workspace flag for a package manager
 */
export function getWorkspaceFlag(pm: PackageManager): string {
  switch (pm) {
    case 'npm':
      return '-w';
    case 'yarn':
      return '--scope';
    case 'pnpm':
      return '--filter';
  }
}
