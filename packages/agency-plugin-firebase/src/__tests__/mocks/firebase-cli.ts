/**
 * Firebase CLI Mock for Testing
 *
 * Provides mock implementations of Firebase CLI behavior for unit tests.
 */

import type { EmulatorType, DeployTarget } from '../../config/types.js';

/**
 * Mock spawn result
 */
export interface MockSpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Emulator startup output simulation
 */
const EMULATOR_STARTUP_OUTPUT: Record<EmulatorType, string> = {
  auth: 'i  emulators: Starting emulators: auth\ni  auth: Auth emulator started at http://localhost:9099',
  firestore: 'i  emulators: Starting emulators: firestore\ni  firestore: Firestore emulator started at http://localhost:8080',
  database: 'i  emulators: Starting emulators: database\ni  database: Database emulator started at http://localhost:9000',
  functions: 'i  emulators: Starting emulators: functions\ni  functions: Functions emulator started at http://localhost:5001',
  hosting: 'i  emulators: Starting emulators: hosting\ni  hosting: Hosting emulator started at http://localhost:5000',
  pubsub: 'i  emulators: Starting emulators: pubsub\ni  pubsub: Pub/Sub emulator started at http://localhost:8085',
  storage: 'i  emulators: Starting emulators: storage\ni  storage: Storage emulator started at http://localhost:9199',
};

/**
 * Generate emulator start output for multiple emulators
 */
export function generateEmulatorStartOutput(
  emulators: EmulatorType[] = ['auth', 'firestore', 'functions']
): string {
  const lines = ['i  emulators: Starting emulators...'];

  for (const emulator of emulators) {
    const output = EMULATOR_STARTUP_OUTPUT[emulator];
    if (output) {
      lines.push(output);
    }
  }

  lines.push('i  emulators: All emulators ready! View status at http://localhost:4000');
  return lines.join('\n');
}

/**
 * Generate deploy output for multiple targets
 */
export function generateDeployOutput(
  targets: DeployTarget[] = ['functions']
): string {
  const lines = ['=== Deploying to project...'];

  for (const target of targets) {
    lines.push(`i  deploying ${target}...`);
    lines.push(`✔  ${target} deployed successfully`);
  }

  lines.push('');
  lines.push('✔  Deploy complete!');
  lines.push('');
  lines.push('Project Console: https://console.firebase.google.com/project/my-project/overview');

  return lines.join('\n');
}

/**
 * Generate functions log output
 */
export function generateFunctionsLogOutput(
  lines = 20,
  functionNames?: string[]
): string {
  const logLines: string[] = [];
  const functions = functionNames ?? ['helloWorld', 'processData', 'onUserCreate'];

  for (let i = 0; i < lines; i++) {
    const fn = functions[i % functions.length] ?? 'unknown';
    const level = i % 5 === 0 ? 'ERROR' : i % 3 === 0 ? 'WARN' : 'INFO';
    const timestamp = new Date(Date.now() - (lines - i) * 60000).toISOString();
    logLines.push(`${level} ${timestamp} ${fn} - Log entry ${i + 1}`);
  }

  return logLines.join('\n');
}

/**
 * Mock error responses
 */
export const MOCK_ERRORS: Record<string, MockSpawnResult> = {
  notAuthenticated: {
    stdout: '',
    stderr: 'Error: Not authenticated. Run `firebase login` to sign in.',
    exitCode: 1,
  },
  projectNotFound: {
    stdout: '',
    stderr: 'Error: Project "unknown-project" does not exist.',
    exitCode: 1,
  },
  portInUse: {
    stdout: '',
    stderr: 'Error: Could not start emulator. Port 8080 is already in use.',
    exitCode: 1,
  },
  configNotFound: {
    stdout: '',
    stderr: 'Error: firebase.json not found. Run `firebase init` to initialize.',
    exitCode: 1,
  },
  networkError: {
    stdout: '',
    stderr: 'Error: Network error connecting to Firebase. Check your internet connection.',
    exitCode: 1,
  },
};

/**
 * Mock Firebase CLI command results
 */
export class MockFirebaseCLI {
  private emulatorRunning = false;
  private runningEmulators: EmulatorType[] = [];

  /**
   * Mock emulators:start command
   */
  async emulatorsStart(
    emulators?: EmulatorType[]
  ): Promise<MockSpawnResult> {
    if (this.emulatorRunning) {
      return {
        stdout: '',
        stderr: 'Error: Emulators are already running',
        exitCode: 1,
      };
    }

    this.emulatorRunning = true;
    this.runningEmulators = emulators ?? ['auth', 'firestore', 'functions'];

    return {
      stdout: generateEmulatorStartOutput(this.runningEmulators),
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Mock emulators:stop command (via SIGTERM)
   */
  async emulatorsStop(): Promise<MockSpawnResult> {
    if (!this.emulatorRunning) {
      return {
        stdout: 'No emulators running.',
        stderr: '',
        exitCode: 0,
      };
    }

    this.emulatorRunning = false;
    this.runningEmulators = [];

    return {
      stdout: 'Emulators shut down successfully.',
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Mock deploy command
   */
  async deploy(
    targets?: DeployTarget[],
    project?: string
  ): Promise<MockSpawnResult> {
    if (project === 'unknown-project') {
      return MOCK_ERRORS['projectNotFound']!;
    }

    return {
      stdout: generateDeployOutput(targets ?? ['functions']),
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Mock functions:log command
   */
  async functionsLog(
    options?: { only?: string[]; lines?: number }
  ): Promise<MockSpawnResult> {
    const lines = options?.lines ?? 20;
    const only = options?.only;

    return {
      stdout: generateFunctionsLogOutput(lines, only),
      stderr: '',
      exitCode: 0,
    };
  }

  /**
   * Get current emulator status
   */
  isEmulatorRunning(): boolean {
    return this.emulatorRunning;
  }

  /**
   * Get list of running emulators
   */
  getRunningEmulators(): EmulatorType[] {
    return [...this.runningEmulators];
  }

  /**
   * Reset mock state
   */
  reset(): void {
    this.emulatorRunning = false;
    this.runningEmulators = [];
  }
}

/**
 * Create a fresh mock instance
 */
export function createMockFirebaseCLI(): MockFirebaseCLI {
  return new MockFirebaseCLI();
}
