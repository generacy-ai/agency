# Implementation Plan: Plugin: @generacy-ai/agency-plugin-docker

**Feature**: Docker plugin for container and service management
**Branch**: `015-plugin-generacy-ai-agency`
**Status**: Complete

## Summary

Implement the `@generacy-ai/agency-plugin-docker` plugin providing 8 Docker/Docker Compose tools following the Agency plugin architecture and terse output pattern. The plugin enables AI agents to manage containers and services through well-defined MCP tools.

## Technical Context

- **Language**: TypeScript 5.x (ES2022 target, Node16 module resolution)
- **Runtime**: Node.js 20+
- **Package Manager**: pnpm (monorepo workspace)
- **Key Dependencies**:
  - `@generacy-ai/agency` (core) - plugin types, tool registry, terse output
  - `execa` - process execution for Docker CLI
  - `zod` - runtime validation for tool parameters

## Project Structure

```
packages/agency-plugin-docker/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                    # Plugin entry point, exports AgencyPlugin
│   ├── manifest.ts                 # PluginManifest definition
│   ├── config.ts                   # Plugin configuration schema
│   ├── tools/
│   │   ├── index.ts                # Tool exports
│   │   ├── compose-up.ts           # run.docker_compose_up
│   │   ├── compose-down.ts         # run.docker_compose_down
│   │   ├── compose-logs.ts         # run.docker_compose_logs
│   │   ├── compose-ps.ts           # run.docker_compose_ps
│   │   ├── docker-build.ts         # run.docker_build
│   │   ├── docker-run.ts           # run.docker_run
│   │   ├── docker-stop.ts          # run.docker_stop
│   │   └── docker-exec.ts          # run.docker_exec
│   ├── utils/
│   │   ├── exec.ts                 # Docker CLI execution wrapper
│   │   └── error-classifier.ts     # Error categorization (network, permission, etc.)
│   └── __tests__/
│       ├── tools/
│       │   ├── compose-up.test.ts
│       │   ├── compose-down.test.ts
│       │   ├── compose-logs.test.ts
│       │   ├── compose-ps.test.ts
│       │   ├── docker-build.test.ts
│       │   ├── docker-run.test.ts
│       │   ├── docker-stop.test.ts
│       │   └── docker-exec.test.ts
│       ├── utils/
│       │   └── error-classifier.test.ts
│       └── integration/
│           └── docker.integration.test.ts
└── dist/                           # Build output
```

## Tool Specifications

### Compose Tools (run.docker_compose_*)

| Tool | Parameters | Output |
|------|------------|--------|
| `run.docker_compose_up` | `file?`, `services?[]`, `detach?`, `build?` | "Services started." / error summary |
| `run.docker_compose_down` | `file?`, `volumes?`, `removeOrphans?` | "Services stopped." / error summary |
| `run.docker_compose_logs` | `file?`, `services?[]`, `tail?`, `timestamps?` | Log snapshot (tail N lines) |
| `run.docker_compose_ps` | `file?`, `services?[]`, `format?` | Service status list |

### Container Tools (run.docker_*)

| Tool | Parameters | Output |
|------|------------|--------|
| `run.docker_build` | `context`, `tag?`, `dockerfile?`, `buildArgs?{}` | "Image built: <tag>" / error summary |
| `run.docker_run` | `image`, `name?`, `ports?[]`, `env?{}`, `volumes?[]`, `detach?`, `rm?`, `cmd?[]` | "Container started: <id>" / error summary |
| `run.docker_stop` | `container`, `time?` | "Container stopped." / error summary |
| `run.docker_exec` | `container`, `cmd[]`, `workdir?`, `user?`, `interactive?` | Command output / error summary |

## Mode Affiliations

```typescript
const modeAffiliations = {
  debug: ['compose_up', 'compose_down', 'compose_logs', 'compose_ps',
          'docker_build', 'docker_run', 'docker_stop', 'docker_exec'],
  coding: ['compose_up', 'compose_down', 'compose_logs'],
};
```

## Error Handling Strategy

Errors are categorized and summarized (per clarification Q1, option B):

```typescript
type DockerErrorCategory =
  | 'daemon'      // Docker daemon not running
  | 'permission'  // Permission denied
  | 'not_found'   // Image/container not found
  | 'network'     // Network issues (pull failures, etc.)
  | 'resource'    // Resource constraints (disk, memory)
  | 'config'      // Configuration errors (invalid compose file)
  | 'unknown';    // Unclassified errors
```

Output format:
```
[<CATEGORY>] <summarized_message>
Exit code: <code>
```

## Testing Strategy

Per clarification Q4, option C (both unit and integration):

- **Unit Tests** (mocked): Fast CI, mock execa calls
- **Integration Tests** (real Docker): Require Docker daemon, run locally or in Docker-enabled CI

Test helpers:
- `mockExeca()` - Jest mock for execa
- `skipIfNoDocker()` - Conditional skip for integration tests

## Configuration Schema

```typescript
interface DockerPluginConfig {
  composeFile?: string;     // Default: 'docker-compose.yml'
  projectName?: string;     // Default: null (use directory name)
  defaultTimeout?: number;  // Default stop timeout in seconds
}
```

## Implementation Notes

1. **Stateless Design** (per Q3): Each tool call queries Docker directly, no state caching
2. **Logs as Snapshot** (per Q2): `compose_logs` returns tail N lines, no streaming
3. **CLI Conventions** (per Q5): Optional params follow Docker CLI flags

## Dependencies

- Requires `@generacy-ai/agency` core package (#6)
- Part of Agency Official Plugins epic (#13)

## Next Steps

Run `/speckit:tasks` to generate the task list from this plan.
