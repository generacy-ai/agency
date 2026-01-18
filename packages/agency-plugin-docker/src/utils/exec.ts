/**
 * Docker CLI execution wrapper using execa
 */

import { execa } from 'execa';
import { classifyDockerError } from './error-classifier.js';
import type { ClassifiedDockerError } from './error-classifier.js';

/**
 * Result of Docker command execution
 */
export interface DockerExecResult {
  /** Whether the command succeeded (exit code 0) */
  success: boolean;

  /** Standard output */
  stdout: string;

  /** Standard error */
  stderr: string;

  /** Exit code */
  exitCode: number;

  /** Short message for terse output (on success) */
  shortMessage?: string;

  /** Classified error (on failure) */
  error?: ClassifiedDockerError;
}

/**
 * Options for Docker command execution
 */
export interface DockerExecOptions {
  /** Working directory for the command */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Timeout in milliseconds */
  timeout?: number;

  /** Short message to use on success */
  shortMessage?: string;
}

/**
 * Execute a Docker command
 *
 * @param args - Command arguments (without 'docker' prefix)
 * @param options - Execution options
 * @returns Execution result with classified errors
 */
export async function execDocker(
  args: string[],
  options: DockerExecOptions = {}
): Promise<DockerExecResult> {
  const { cwd, env, timeout, shortMessage } = options;

  try {
    const result = await execa('docker', args, {
      cwd,
      env: { ...process.env, ...env },
      timeout,
      reject: false,
    });

    const stdout = typeof result.stdout === 'string' ? result.stdout : '';
    const stderr = typeof result.stderr === 'string' ? result.stderr : '';
    const exitCode = result.exitCode ?? 0;

    if (exitCode === 0) {
      return {
        success: true,
        stdout,
        stderr,
        exitCode: 0,
        shortMessage,
      };
    }

    // Command failed with non-zero exit code
    const error = classifyDockerError(stderr, exitCode);
    return {
      success: false,
      stdout,
      stderr,
      exitCode,
      error,
    };
  } catch (err) {
    // Handle execa errors (timeout, spawn errors, etc.)
    const execaError = err as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      message?: string;
      exitCode?: number;
    };

    const stderr =
      typeof execaError.stderr === 'string'
        ? execaError.stderr
        : execaError.message ?? 'Unknown error';
    const stdout =
      typeof execaError.stdout === 'string' ? execaError.stdout : '';
    const exitCode = execaError.exitCode ?? 1;

    const error = classifyDockerError(stderr, exitCode);

    return {
      success: false,
      stdout,
      stderr,
      exitCode,
      error,
    };
  }
}

/**
 * Execute a Docker Compose command
 *
 * @param args - Command arguments (without 'docker compose' prefix)
 * @param options - Execution options
 * @returns Execution result with classified errors
 */
export async function execDockerCompose(
  args: string[],
  options: DockerExecOptions = {}
): Promise<DockerExecResult> {
  return execDocker(['compose', ...args], options);
}
