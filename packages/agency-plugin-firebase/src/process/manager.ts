/**
 * Process Manager for Firebase Plugin
 *
 * Manages background process lifecycle for Firebase emulators.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import type { ProcessHandle, ProcessOptions, ProcessStatus, EmulatorInfo } from './types.js';
import type { CleanupMode, EmulatorType } from '../config/types.js';

/**
 * Default emulator ports from Firebase
 */
const DEFAULT_PORTS: Record<EmulatorType, number> = {
  auth: 9099,
  firestore: 8080,
  database: 9000,
  functions: 5001,
  hosting: 5000,
  pubsub: 8085,
  storage: 9199,
};

/**
 * Default ready timeout in milliseconds
 */
const DEFAULT_READY_TIMEOUT = 60000;

/**
 * Internal state for a managed process
 */
interface ManagedProcess {
  handle: ProcessHandle;
  process: ChildProcess;
  output: string;
  cleanupMode: CleanupMode;
}

/**
 * Process Manager
 *
 * Manages background Firebase CLI processes with lifecycle control.
 */
export class ProcessManager {
  private processes: Map<number, ManagedProcess> = new Map();
  private nextId = 1;

  /**
   * Start a background process
   *
   * @param cmd - Command to execute
   * @param args - Command arguments
   * @param opts - Process options
   * @returns Promise resolving to process handle when ready (or started if no readyPattern)
   */
  async start(
    cmd: string,
    args: string[],
    opts: ProcessOptions
  ): Promise<ProcessHandle> {
    const startedAt = new Date();
    const pid = this.nextId++;

    const handle: ProcessHandle = {
      pid,
      startedAt,
      command: cmd,
      args,
      status: 'starting',
    };

    const childProcess = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const managed: ManagedProcess = {
      handle,
      process: childProcess,
      output: '',
      cleanupMode: opts.cleanup,
    };

    this.processes.set(pid, managed);

    // Collect output
    childProcess.stdout?.on('data', (data: Buffer) => {
      managed.output += data.toString();
    });

    childProcess.stderr?.on('data', (data: Buffer) => {
      managed.output += data.toString();
    });

    // Handle process exit
    childProcess.on('exit', (code) => {
      handle.status = code === 0 ? 'stopped' : 'failed';
      handle.exitCode = code ?? undefined;
    });

    childProcess.on('error', (err) => {
      handle.status = 'failed';
      handle.error = err.message;
    });

    // Wait for ready pattern if specified
    if (opts.readyPattern) {
      const timeout = opts.readyTimeout ?? DEFAULT_READY_TIMEOUT;
      await this.waitForReady(managed, opts.readyPattern, timeout);
    }

    handle.status = 'running';
    return handle;
  }

  /**
   * Wait for a process to match the ready pattern
   */
  private waitForReady(
    managed: ManagedProcess,
    pattern: RegExp,
    timeout: number
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Process did not become ready within ${timeout}ms`));
      }, timeout);

      const checkOutput = () => {
        if (pattern.test(managed.output)) {
          clearTimeout(timer);
          resolve();
          return true;
        }
        return false;
      };

      // Check immediately
      if (checkOutput()) return;

      // Check on new output
      const onData = () => {
        if (checkOutput()) {
          managed.process.stdout?.off('data', onData);
          managed.process.stderr?.off('data', onData);
        }
      };

      managed.process.stdout?.on('data', onData);
      managed.process.stderr?.on('data', onData);

      // Handle early exit
      managed.process.on('exit', (code) => {
        clearTimeout(timer);
        if (!pattern.test(managed.output)) {
          reject(new Error(`Process exited with code ${code} before becoming ready`));
        }
      });
    });
  }

  /**
   * Stop a running process
   *
   * @param handle - Process handle to stop
   * @param force - If true, use SIGKILL instead of SIGTERM
   */
  async stop(handle: ProcessHandle, force = false): Promise<void> {
    const managed = this.processes.get(handle.pid);
    if (!managed) {
      return; // Already stopped or never existed
    }

    handle.status = 'stopping';

    const signal = force ? 'SIGKILL' : 'SIGTERM';
    managed.process.kill(signal);

    // Wait for process to exit
    await new Promise<void>((resolve) => {
      if (managed.process.exitCode !== null) {
        resolve();
        return;
      }

      managed.process.on('exit', () => {
        resolve();
      });

      // Force kill after timeout if graceful shutdown fails
      if (!force) {
        setTimeout(() => {
          if (managed.process.exitCode === null) {
            managed.process.kill('SIGKILL');
          }
        }, 5000);
      }
    });

    handle.status = 'stopped';
    this.processes.delete(handle.pid);
  }

  /**
   * Get status of a process
   *
   * @param handle - Process handle to check
   * @returns Process status
   */
  status(handle: ProcessHandle): ProcessStatus {
    const managed = this.processes.get(handle.pid);

    if (!managed) {
      return {
        running: false,
        exitCode: handle.exitCode,
      };
    }

    const running = handle.status === 'running' || handle.status === 'starting';
    const uptime = running
      ? Date.now() - handle.startedAt.getTime()
      : undefined;

    return {
      running,
      pid: handle.pid,
      uptime,
      exitCode: handle.exitCode,
    };
  }

  /**
   * Get emulator info from process output
   *
   * @param handle - Process handle for the emulator
   * @param emulatorType - Type of emulator to get info for
   * @returns Emulator info if available
   */
  getEmulatorInfo(handle: ProcessHandle, emulatorType: EmulatorType): EmulatorInfo | undefined {
    const managed = this.processes.get(handle.pid);
    if (!managed) {
      return undefined;
    }

    const defaultPort = DEFAULT_PORTS[emulatorType];
    const portMatch = managed.output.match(
      new RegExp(`${emulatorType}.*:.*?(\\d+)`, 'i')
    );
    const port = portMatch ? parseInt(portMatch[1] ?? String(defaultPort), 10) : defaultPort;

    return {
      port,
      url: `http://localhost:${port}`,
      ready: handle.status === 'running',
    };
  }

  /**
   * Clean up all processes
   *
   * Called on plugin shutdown. Only cleans up processes based on their cleanup mode.
   */
  async cleanup(): Promise<void> {
    const stopPromises: Promise<void>[] = [];

    for (const [, managed] of this.processes) {
      // Only clean up 'session' mode processes
      if (managed.cleanupMode === 'session') {
        stopPromises.push(this.stop(managed.handle, true));
      }
    }

    await Promise.all(stopPromises);
  }

  /**
   * Get all running process handles
   */
  getRunningProcesses(): ProcessHandle[] {
    return Array.from(this.processes.values())
      .filter((m) => m.handle.status === 'running')
      .map((m) => m.handle);
  }

  /**
   * Get collected output from a process
   *
   * @param handle - Process handle
   * @returns Collected stdout/stderr output
   */
  getOutput(handle: ProcessHandle): string {
    const managed = this.processes.get(handle.pid);
    return managed?.output ?? '';
  }
}
