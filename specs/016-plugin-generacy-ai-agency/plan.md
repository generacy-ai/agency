# Implementation Plan: @generacy-ai/agency-plugin-firebase

**Feature**: Firebase emulator management and deployment plugin for Agency
**Branch**: `016-plugin-generacy-ai-agency`
**Status**: Complete

## Summary

This plugin provides agent-optimized tools for managing Firebase emulators and deployments. It implements 5 tools following the Agency plugin pattern with the terse output pattern for agent-friendly responses.

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Framework | Agency Plugin System |
| Dependencies | `@generacy-ai/agency` (peer), `zod` (validation) |
| External CLI | Firebase CLI (`firebase`) |
| Build | TypeScript with ES modules |
| Testing | Vitest with Firebase CLI mocking |

## Project Structure

```
packages/agency-plugin-firebase/
├── src/
│   ├── index.ts                 # Plugin entry point and manifest
│   ├── plugin.ts                # Plugin implementation (AgencyPlugin)
│   ├── tools/
│   │   ├── index.ts             # Tool exports
│   │   ├── emulators-start.ts   # run.firebase_emulators_start
│   │   ├── emulators-stop.ts    # run.firebase_emulators_stop
│   │   ├── emulators-status.ts  # run.firebase_emulators_status
│   │   ├── deploy.ts            # run.firebase_deploy
│   │   └── functions-log.ts     # run.firebase_functions_log
│   ├── process/
│   │   ├── manager.ts           # Background process lifecycle
│   │   └── types.ts             # Process management types
│   ├── config/
│   │   ├── schema.ts            # Zod schemas for plugin config
│   │   └── types.ts             # Configuration types
│   └── __tests__/
│       ├── plugin.test.ts       # Plugin lifecycle tests
│       ├── emulators.test.ts    # Emulator tool tests
│       ├── deploy.test.ts       # Deploy tool tests
│       └── mocks/
│           └── firebase-cli.ts  # Firebase CLI mock
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Implementation Phases

### Phase 1: Core Infrastructure

**Files to create/modify:**
- `src/config/types.ts` - Configuration type definitions
- `src/config/schema.ts` - Zod validation schemas
- `src/process/types.ts` - Process management types
- `src/process/manager.ts` - Background process manager

**Key decisions:**
- Use Node.js `child_process.spawn` for background process management
- Track emulator processes by PID for cleanup
- Support configurable cleanup modes: session/persist/explicit

### Phase 2: Tool Implementation

**Files to create/modify:**
- `src/tools/emulators-start.ts` - Start emulators with ready detection
- `src/tools/emulators-stop.ts` - Stop emulators gracefully
- `src/tools/emulators-status.ts` - Query emulator status
- `src/tools/deploy.ts` - Deploy to Firebase
- `src/tools/functions-log.ts` - View function logs
- `src/tools/index.ts` - Export all tools

**Key patterns:**
- All tools follow `AgencyTool` interface
- Namespace: `run` prefix (e.g., `run.firebase_emulators_start`)
- Output: Terse output pattern via `TerseOutput` class
- Error handling: Error type + Firebase CLI message

### Phase 3: Plugin Integration

**Files to create/modify:**
- `src/plugin.ts` - Plugin class implementing `AgencyPlugin`
- `src/index.ts` - Entry point with manifest export

**Key aspects:**
- Manifest with tool/mode declarations
- Initialize registers all tools with CoreAPI
- Shutdown cleans up running emulator processes
- Mode affiliations: debug (all), coding (start/stop)

### Phase 4: Testing

**Files to create:**
- `src/__tests__/mocks/firebase-cli.ts` - Mock Firebase CLI responses
- `src/__tests__/plugin.test.ts` - Plugin lifecycle tests
- `src/__tests__/emulators.test.ts` - Emulator tool tests
- `src/__tests__/deploy.test.ts` - Deploy tool tests

**Test coverage targets:**
- >80% coverage on all tool implementations
- Process lifecycle: start → status → stop
- Error scenarios for each tool

## Key Technical Decisions

### 1. Process Lifecycle Management

Background emulator processes require careful lifecycle management:

```typescript
interface ProcessManager {
  start(cmd: string, args: string[], opts: ProcessOptions): Promise<ProcessHandle>;
  stop(handle: ProcessHandle): Promise<void>;
  status(handle: ProcessHandle): ProcessStatus;
  cleanup(): Promise<void>; // Cleanup all on shutdown
}
```

Cleanup modes:
- `session`: Auto-cleanup when agent session ends (default)
- `persist`: Keep running across sessions
- `explicit`: Only stop on explicit `emulators_stop` call

### 2. Ready Detection

Emulator startup uses pattern matching on stdout to detect readiness:

```typescript
const READY_PATTERNS = {
  all: /All emulators ready/,
  firestore: /Firestore emulator started/,
  auth: /Authentication emulator started/,
  functions: /Functions emulator started/,
};
```

### 3. Error Output Format

Following the terse output pattern for failures:

```typescript
// Success: Short confirmation
"Emulators started."

// Failure: Error type + actionable message
"FirebaseError: Project 'my-project' not found. Run 'firebase init' to initialize."
```

### 4. Configuration Schema

```typescript
const FirebasePluginConfigSchema = z.object({
  project: z.string().optional(),
  cleanup: z.enum(['session', 'persist', 'explicit']).default('session'),
  emulators: z.object({
    only: z.array(z.enum([
      'auth', 'firestore', 'database', 'functions',
      'hosting', 'pubsub', 'storage'
    ])).optional(),
  }).optional(),
  deploy: z.object({
    targets: z.array(z.enum([
      'functions', 'rules', 'hosting', 'storage',
      'firestore', 'database'
    ])).default(['functions']),
  }).optional(),
});
```

## Mode Affiliations

| Mode | Tools |
|------|-------|
| `debug` | All 5 tools |
| `coding` | `emulators_start`, `emulators_stop` |

## Dependencies

| Dependency | Purpose |
|------------|---------|
| `@generacy-ai/agency` | Core API, types, TerseOutput |
| `zod` | Runtime config validation |

## Success Criteria

1. All 5 tools implemented and passing tests
2. Emulator lifecycle works: start → status → stop
3. Cleanup happens on plugin shutdown
4. Error messages are actionable
5. Test coverage >80%

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Firebase CLI not installed | Clear error message, not plugin load failure |
| Port conflicts | Report which ports are in use |
| Zombie processes | Track PIDs, kill on shutdown |
| Slow emulator startup | Timeout with configurable wait |
