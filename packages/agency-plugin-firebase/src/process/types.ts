/**
 * Process Management Types for Firebase Plugin
 */

import type { CleanupMode } from '../config/types.js';

/**
 * Status of a managed process
 */
export type ProcessStatusType =
  | 'starting'
  | 'running'
  | 'stopping'
  | 'stopped'
  | 'failed';

/**
 * Handle to a managed process
 */
export interface ProcessHandle {
  /** Operating system process ID */
  pid: number;

  /** Timestamp when process was started */
  startedAt: Date;

  /** Command that was executed */
  command: string;

  /** Arguments passed to the command */
  args: string[];

  /** Current status of the process */
  status: ProcessStatusType;

  /** Exit code if process has terminated */
  exitCode?: number;

  /** Error message if process failed */
  error?: string;
}

/**
 * Options for spawning a managed process
 */
export interface ProcessOptions {
  /** Working directory for the process */
  cwd?: string;

  /** Environment variables to set */
  env?: Record<string, string>;

  /** Pattern to match in output indicating process is ready */
  readyPattern?: RegExp;

  /** Timeout in milliseconds to wait for ready pattern */
  readyTimeout?: number;

  /** When to clean up process resources */
  cleanup: CleanupMode;
}

/**
 * Runtime status information for a process
 */
export interface ProcessStatus {
  /** Whether the process is currently running */
  running: boolean;

  /** Process ID if running */
  pid?: number;

  /** Uptime in milliseconds if running */
  uptime?: number;

  /** Exit code if process has terminated */
  exitCode?: number;
}

/**
 * Information about a running emulator instance
 */
export interface EmulatorInfo {
  /** Port the emulator is listening on */
  port: number;

  /** URL to access the emulator */
  url: string;

  /** Whether the emulator is ready to accept connections */
  ready: boolean;
}
