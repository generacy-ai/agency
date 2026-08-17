/**
 * Command execution with output capture
 */

import { spawn } from 'node:child_process';

/** Result of command execution */
export interface ExecResult {
  /** Exit code (0 = success) */
  exitCode: number;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Short message for success */
  shortMessage?: string;
}

/** Options for command execution */
export interface ExecOptions {
  /** Working directory */
  cwd: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Short message to use on success */
  shortMessage?: string;
}

/**
 * Default timeout applied when the caller does not set one. Package scripts
 * (builds, test suites) that run longer than this are killed rather than
 * hanging the MCP call forever.
 */
export const DEFAULT_EXEC_TIMEOUT_MS = 600_000;

/**
 * Execute a command and capture output
 *
 * @param command - Command to execute
 * @param args - Command arguments
 * @param options - Execution options
 * @returns Execution result
 */
export async function exec(
  command: string,
  args: string[],
  options: ExecOptions
): Promise<ExecResult> {
  const timeoutMs = options.timeout ?? DEFAULT_EXEC_TIMEOUT_MS;

  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      shell: true,
      timeout: timeoutMs,
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    child.stdout?.on('data', (data: Buffer) => {
      stdout.push(data.toString());
    });

    child.stderr?.on('data', (data: Buffer) => {
      stderr.push(data.toString());
    });

    child.on('error', (error) => {
      resolve({
        exitCode: 1,
        stdout: stdout.join(''),
        stderr: error.message,
        shortMessage: options.shortMessage,
      });
    });

    child.on('close', (code, signal) => {
      // A null exit code with a signal means the process was killed — with
      // shell: true the most likely cause is our own timeout SIGTERM.
      const signalNote =
        code === null && signal
          ? `\nProcess terminated by ${signal} — the command may have exceeded the ${timeoutMs}ms timeout.`
          : '';
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.join(''),
        stderr: stderr.join('') + signalNote,
        shortMessage: options.shortMessage,
      });
    });
  });
}

/**
 * Format command for display
 */
export function formatCommand(command: string, args: string[]): string {
  return `${command} ${args.join(' ')}`;
}
