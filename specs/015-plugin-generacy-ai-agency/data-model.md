# Data Model: @generacy-ai/agency-plugin-docker

## Core Types

### Plugin Configuration

```typescript
/**
 * Docker plugin configuration from agency.config.json
 */
interface DockerPluginConfig {
  /** Path to compose file (default: 'docker-compose.yml') */
  composeFile?: string;

  /** Docker Compose project name (default: directory name) */
  projectName?: string | null;

  /** Default stop timeout in seconds (default: 10) */
  defaultTimeout?: number;
}
```

### Error Categories

```typescript
/**
 * Docker error classification categories
 */
type DockerErrorCategory =
  | 'daemon'      // Docker daemon not running
  | 'permission'  // Permission denied (socket, image registry)
  | 'not_found'   // Image, container, or network not found
  | 'network'     // Network failures (pull, push, connect)
  | 'resource'    // Resource constraints (disk, memory)
  | 'config'      // Configuration errors (invalid YAML, bad args)
  | 'unknown';    // Unclassified errors

/**
 * Classified Docker error for terse output
 */
interface ClassifiedDockerError {
  /** Error category */
  category: DockerErrorCategory;

  /** Summarized error message (first line of stderr or formatted) */
  summary: string;

  /** Original exit code */
  exitCode: number;
}
```

## Tool Parameter Schemas

### Compose Tools

```typescript
/** run.docker_compose_up */
interface ComposeUpParams {
  /** Compose file path */
  file?: string;

  /** Specific services to start */
  services?: string[];

  /** Run in detached mode (default: true) */
  detach?: boolean;

  /** Build images before starting */
  build?: boolean;
}

/** run.docker_compose_down */
interface ComposeDownParams {
  /** Compose file path */
  file?: string;

  /** Remove named volumes */
  volumes?: boolean;

  /** Remove orphan containers */
  removeOrphans?: boolean;
}

/** run.docker_compose_logs */
interface ComposeLogsParams {
  /** Compose file path */
  file?: string;

  /** Specific services to show logs for */
  services?: string[];

  /** Number of lines to tail (default: 100) */
  tail?: number;

  /** Show timestamps */
  timestamps?: boolean;
}

/** run.docker_compose_ps */
interface ComposePsParams {
  /** Compose file path */
  file?: string;

  /** Specific services to list */
  services?: string[];

  /** Output format (table, json) */
  format?: 'table' | 'json';
}
```

### Container Tools

```typescript
/** run.docker_build */
interface DockerBuildParams {
  /** Build context path (required) */
  context: string;

  /** Image tag */
  tag?: string;

  /** Dockerfile path (relative to context) */
  dockerfile?: string;

  /** Build arguments */
  buildArgs?: Record<string, string>;
}

/** run.docker_run */
interface DockerRunParams {
  /** Image to run (required) */
  image: string;

  /** Container name */
  name?: string;

  /** Port mappings (host:container) */
  ports?: string[];

  /** Environment variables */
  env?: Record<string, string>;

  /** Volume mounts (host:container) */
  volumes?: string[];

  /** Run in detached mode (default: true) */
  detach?: boolean;

  /** Remove container when it exits */
  rm?: boolean;

  /** Command to run */
  cmd?: string[];
}

/** run.docker_stop */
interface DockerStopParams {
  /** Container ID or name (required) */
  container: string;

  /** Timeout in seconds before killing */
  time?: number;
}

/** run.docker_exec */
interface DockerExecParams {
  /** Container ID or name (required) */
  container: string;

  /** Command to execute (required) */
  cmd: string[];

  /** Working directory inside container */
  workdir?: string;

  /** User to run as */
  user?: string;

  /** Keep STDIN open */
  interactive?: boolean;
}
```

## Validation Schemas (Zod)

```typescript
import { z } from 'zod';

// Common schemas
const portMapping = z.string().regex(/^\d+:\d+$/, 'Port mapping must be host:container');
const volumeMapping = z.string().regex(/^.+:.+$/, 'Volume mapping must be host:container');

// Compose Up
export const composeUpSchema = z.object({
  file: z.string().optional(),
  services: z.array(z.string()).optional(),
  detach: z.boolean().default(true),
  build: z.boolean().optional(),
});

// Compose Down
export const composeDownSchema = z.object({
  file: z.string().optional(),
  volumes: z.boolean().optional(),
  removeOrphans: z.boolean().optional(),
});

// Compose Logs
export const composeLogsSchema = z.object({
  file: z.string().optional(),
  services: z.array(z.string()).optional(),
  tail: z.number().int().positive().default(100),
  timestamps: z.boolean().optional(),
});

// Compose Ps
export const composePsSchema = z.object({
  file: z.string().optional(),
  services: z.array(z.string()).optional(),
  format: z.enum(['table', 'json']).optional(),
});

// Docker Build
export const dockerBuildSchema = z.object({
  context: z.string(),
  tag: z.string().optional(),
  dockerfile: z.string().optional(),
  buildArgs: z.record(z.string()).optional(),
});

// Docker Run
export const dockerRunSchema = z.object({
  image: z.string(),
  name: z.string().optional(),
  ports: z.array(portMapping).optional(),
  env: z.record(z.string()).optional(),
  volumes: z.array(volumeMapping).optional(),
  detach: z.boolean().default(true),
  rm: z.boolean().optional(),
  cmd: z.array(z.string()).optional(),
});

// Docker Stop
export const dockerStopSchema = z.object({
  container: z.string(),
  time: z.number().int().positive().optional(),
});

// Docker Exec
export const dockerExecSchema = z.object({
  container: z.string(),
  cmd: z.array(z.string()).nonempty(),
  workdir: z.string().optional(),
  user: z.string().optional(),
  interactive: z.boolean().optional(),
});
```

## Tool Name Mapping

| Tool Name | Namespace | Action |
|-----------|-----------|--------|
| `run.docker_compose_up` | `run` | `docker_compose_up` |
| `run.docker_compose_down` | `run` | `docker_compose_down` |
| `run.docker_compose_logs` | `run` | `docker_compose_logs` |
| `run.docker_compose_ps` | `run` | `docker_compose_ps` |
| `run.docker_build` | `run` | `docker_build` |
| `run.docker_run` | `run` | `docker_run` |
| `run.docker_stop` | `run` | `docker_stop` |
| `run.docker_exec` | `run` | `docker_exec` |
