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
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: {
        ...process.env,
        ...options.env,
      },
      shell: true,
      timeout: options.timeout,
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

    child.on('close', (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
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
