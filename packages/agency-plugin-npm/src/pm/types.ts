/**
 * Package manager types for npm plugin
 */

/** Supported package managers */
export type PackageManager = 'npm' | 'yarn' | 'pnpm';

/** Result of package manager detection */
export interface DetectionResult {
  /** Detected package manager */
  packageManager: PackageManager;

  /** Lockfile that was found */
  lockfile: string;

  /** Full path to lockfile */
  lockfilePath: string;
}

/** Result when no package manager is detected */
export interface DetectionError {
  /** No lockfile found */
  packageManager: null;

  /** Error message */
  error: string;
}

/** Union type for detection result */
export type DetectionOutcome = DetectionResult | DetectionError;

/** Command type for package manager operations */
export type CommandType = 'install' | 'run' | 'exec';

/** Options for building commands */
export interface CommandOptions {
  /** Target workspace in monorepo */
  workspace?: string;

  /** Production dependencies only (install) */
  production?: boolean;

  /** Use frozen lockfile (install) */
  frozen?: boolean;

  /** Script name to run */
  script?: string;

  /** Additional arguments to pass */
  args?: string[];
}

/** Built command ready for execution */
export interface BuiltCommand {
  /** Command to execute (npm, yarn, pnpm) */
  command: string;

  /** Command arguments */
  args: string[];
}
