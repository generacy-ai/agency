# Research: Firebase Plugin

## Technology Decisions

### Process Management

**Decision**: Use Node.js `child_process.spawn` with detached mode

**Rationale**:
- Emulators run as long-lived background processes
- Need stdout/stderr streaming for ready detection
- Detached mode allows cleanup on parent exit
- Cross-platform compatible (macOS, Linux, Windows via WSL)

**Alternatives considered**:
- `exec`: Too simple, no streaming
- `fork`: Only for Node.js modules
- External process managers (PM2): Too heavy for agent use case

### Ready Detection

**Decision**: Pattern match on stdout for "All emulators ready"

**Rationale**:
- Firebase CLI outputs this consistent message
- Polling (e.g., HTTP health checks) adds complexity
- Pattern matching is fast and reliable

**Implementation**:
```typescript
const spawn = child_process.spawn('firebase', args);
return new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('Timeout')), 60000);
  spawn.stdout.on('data', (data) => {
    if (/All emulators ready/.test(data.toString())) {
      clearTimeout(timeout);
      resolve({ pid: spawn.pid, status: 'running' });
    }
  });
});
```

### Configuration Storage

**Decision**: Use Agency CoreAPI `getConfig` for plugin configuration

**Rationale**:
- Consistent with other Agency plugins
- Configuration loaded from agency.config.json
- Zod validation ensures type safety

### Error Classification

**Decision**: Parse Firebase CLI stderr for error types

**Rationale**:
- Firebase CLI has consistent error message formats
- Agents benefit from categorized errors
- Terse output pattern requires structured failures

**Error patterns**:
```typescript
const ERROR_PATTERNS = {
  auth: /not authorized|permission denied/i,
  project: /project.*not found|no active project/i,
  port: /port.*in use|EADDRINUSE/i,
  network: /network error|ECONNREFUSED/i,
  config: /firebase.json.*not found|configuration error/i,
};
```

## Firebase CLI Interface

### Emulator Commands

| Command | Purpose | Key flags |
|---------|---------|-----------|
| `firebase emulators:start` | Start emulators | `--only`, `--import`, `--export-on-exit` |
| `firebase emulators:exec` | Run command then exit | Not used (we need long-running) |

### Deploy Commands

| Command | Purpose | Key flags |
|---------|---------|-----------|
| `firebase deploy` | Deploy all/specific | `--only`, `--project` |
| `firebase deploy --only functions` | Deploy functions only | |

### Log Commands

| Command | Purpose | Key flags |
|---------|---------|-----------|
| `firebase functions:log` | View logs | `--only`, `--lines` |

## Emulator Port Defaults

| Emulator | Default Port | Config key |
|----------|--------------|------------|
| Auth | 9099 | `emulators.auth.port` |
| Firestore | 8080 | `emulators.firestore.port` |
| Functions | 5001 | `emulators.functions.port` |
| Hosting | 5000 | `emulators.hosting.port` |
| Database | 9000 | `emulators.database.port` |
| Storage | 9199 | `emulators.storage.port` |
| UI | 4000 | `emulators.ui.port` |

## Implementation Patterns

### Tool Naming Convention

Following Agency tool naming (`namespace.action`):
- `run.firebase_emulators_start`
- `run.firebase_emulators_stop`
- `run.firebase_emulators_status`
- `run.firebase_deploy`
- `run.firebase_functions_log`

The `run` namespace indicates tools that execute external commands.

### Terse Output Examples

**Success cases:**
```
Emulators started.
Emulators stopped.
Deploy complete.
```

**Status output (structured):**
```json
{
  "running": true,
  "emulators": {
    "firestore": { "port": 8080, "url": "http://localhost:8080" },
    "auth": { "port": 9099, "url": "http://localhost:9099" }
  }
}
```

**Failure cases:**
```
FirebaseError: Project not found
AuthError: Not authenticated. Run 'firebase login'
PortError: Port 8080 in use
```

## Testing Strategy

### Mock Firebase CLI

Create a mock that simulates Firebase CLI behavior:

```typescript
// Mock successful emulator start
mockFirebase.emulators.start = async () => ({
  stdout: 'i  emulators: Starting emulators...\ni  All emulators ready',
  exitCode: 0
});

// Mock failure
mockFirebase.deploy = async () => ({
  stderr: 'Error: Project not found',
  exitCode: 1
});
```

### Integration Testing

For CI, use Firebase Emulator Suite in Docker:
- `firebase emulators:start --project demo-test`
- Demo projects don't require authentication

## References

- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Firebase Emulator Suite](https://firebase.google.com/docs/emulator-suite)
- [Agency Plugin Types](../../../packages/agency/src/plugins/types.ts)
- [TerseOutput Pattern](../../../packages/agency/src/output/terse-output.ts)
