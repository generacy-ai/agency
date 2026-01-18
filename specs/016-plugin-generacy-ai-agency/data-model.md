# Data Model: Firebase Plugin

## Configuration Types

### Plugin Configuration

```typescript
/**
 * Firebase plugin configuration
 * Loaded from agency.config.json under plugins.firebase
 */
interface FirebasePluginConfig {
  /** Firebase project ID */
  project?: string;

  /** Process cleanup behavior */
  cleanup: 'session' | 'persist' | 'explicit';

  /** Emulator configuration */
  emulators?: {
    /** Which emulators to start by default */
    only?: EmulatorType[];
  };

  /** Deploy configuration */
  deploy?: {
    /** Default deploy targets */
    targets: DeployTarget[];
  };
}

type EmulatorType =
  | 'auth'
  | 'firestore'
  | 'database'
  | 'functions'
  | 'hosting'
  | 'pubsub'
  | 'storage';

type DeployTarget =
  | 'functions'
  | 'rules'
  | 'hosting'
  | 'storage'
  | 'firestore'
  | 'database';
```

## Process Management Types

### Process Handle

```typescript
/**
 * Handle for a running emulator process
 */
interface ProcessHandle {
  /** Process ID */
  pid: number;

  /** Process spawn timestamp */
  startedAt: Date;

  /** Command that was executed */
  command: string;

  /** Arguments passed to command */
  args: string[];

  /** Current process status */
  status: 'starting' | 'running' | 'stopping' | 'stopped' | 'failed';

  /** Exit code if stopped */
  exitCode?: number;

  /** Error message if failed */
  error?: string;
}
```

### Process Options

```typescript
/**
 * Options for starting a background process
 */
interface ProcessOptions {
  /** Working directory */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Pattern to detect when process is ready */
  readyPattern?: RegExp;

  /** Timeout for ready detection (ms) */
  readyTimeout?: number;

  /** Cleanup mode */
  cleanup: 'session' | 'persist' | 'explicit';
}
```

### Process Status

```typescript
/**
 * Status of a background process
 */
interface ProcessStatus {
  /** Whether process is running */
  running: boolean;

  /** Process ID if running */
  pid?: number;

  /** Uptime in seconds if running */
  uptime?: number;

  /** Exit code if stopped */
  exitCode?: number;
}
```

## Tool Parameter Types

### Emulators Start

```typescript
interface EmulatorsStartParams {
  /** Specific emulators to start */
  only?: EmulatorType[];

  /** Path to import emulator data from */
  import?: string;

  /** Path to export emulator data on exit */
  export?: string;

  /** Override project ID */
  project?: string;
}
```

### Emulators Stop

```typescript
interface EmulatorsStopParams {
  /** Force kill without graceful shutdown */
  force?: boolean;
}
```

### Emulators Status

```typescript
interface EmulatorsStatusParams {
  // No parameters - returns status of all running emulators
}
```

### Deploy

```typescript
interface DeployParams {
  /** Specific targets to deploy */
  only?: DeployTarget[];

  /** Override project ID */
  project?: string;

  /** Deploy message/description */
  message?: string;
}
```

### Functions Log

```typescript
interface FunctionsLogParams {
  /** Specific function names to view logs for */
  only?: string[];

  /** Number of log entries to return */
  lines?: number;
}
```

## Tool Result Types

### Emulator Status Result

```typescript
interface EmulatorStatusResult {
  /** Whether any emulators are running */
  running: boolean;

  /** Status of each emulator type */
  emulators: Record<EmulatorType, EmulatorInfo | undefined>;
}

interface EmulatorInfo {
  /** Port the emulator is running on */
  port: number;

  /** URL to access the emulator */
  url: string;

  /** Whether emulator is fully started */
  ready: boolean;
}
```

### Deploy Result

```typescript
interface DeployResult {
  /** Whether deploy was successful */
  success: boolean;

  /** Targets that were deployed */
  deployed: DeployTarget[];

  /** Hosting URL if hosting was deployed */
  hostingUrl?: string;

  /** Functions URLs if functions were deployed */
  functionUrls?: Record<string, string>;
}
```

## Validation Schemas

### Zod Schemas

```typescript
import { z } from 'zod';

const EmulatorTypeSchema = z.enum([
  'auth', 'firestore', 'database', 'functions',
  'hosting', 'pubsub', 'storage'
]);

const DeployTargetSchema = z.enum([
  'functions', 'rules', 'hosting', 'storage',
  'firestore', 'database'
]);

const CleanupModeSchema = z.enum(['session', 'persist', 'explicit']);

const FirebasePluginConfigSchema = z.object({
  project: z.string().optional(),
  cleanup: CleanupModeSchema.default('session'),
  emulators: z.object({
    only: z.array(EmulatorTypeSchema).optional(),
  }).optional(),
  deploy: z.object({
    targets: z.array(DeployTargetSchema).default(['functions']),
  }).optional(),
});

const EmulatorsStartParamsSchema = z.object({
  only: z.array(EmulatorTypeSchema).optional(),
  import: z.string().optional(),
  export: z.string().optional(),
  project: z.string().optional(),
});

const EmulatorsStopParamsSchema = z.object({
  force: z.boolean().optional(),
});

const DeployParamsSchema = z.object({
  only: z.array(DeployTargetSchema).optional(),
  project: z.string().optional(),
  message: z.string().optional(),
});

const FunctionsLogParamsSchema = z.object({
  only: z.array(z.string()).optional(),
  lines: z.number().int().positive().max(1000).optional(),
});
```

## Entity Relationships

```
FirebasePluginConfig
    │
    ├── cleanup mode ──────────── ProcessManager (determines cleanup strategy)
    │
    ├── emulators.only ────────── EmulatorsStartParams (default value)
    │
    └── deploy.targets ────────── DeployParams (default value)

ProcessManager
    │
    └── manages ──────────────── ProcessHandle[]
                                      │
                                      └── provides ── ProcessStatus

EmulatorStatusResult
    │
    └── emulators ────────────── EmulatorInfo (per emulator type)
```
