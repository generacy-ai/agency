# Feature Specification: File telemetry storage provider

**Branch**: `005-file-telemetry-storage-provider` | **Date**: 2026-01-17 | **Status**: Draft

## Summary

Implement a file-based storage provider for persistent telemetry logs. This provider enables local storage and querying of tool call telemetry events using JSONL files, supporting both daily rotation and per-session file modes.

## Parent Epic

#2 - Tool Call Telemetry & Observability

## Dependencies

- #3 - Core telemetry capture (storage provider interface)

## Requirements

### Storage Format

- JSONL (JSON Lines) format for append-only writes
- One file per day or per session (configurable)
- Configurable output directory (default: `.agency/telemetry/`)

### File Structure

```
.agency/telemetry/
├── 2025-01-16.jsonl      # Daily log
├── 2025-01-15.jsonl
└── sessions/
    ├── abc123.jsonl      # Per-session log (optional mode)
    └── def456.jsonl
```

### Query Support

```typescript
interface FileTelemetryProvider extends TelemetryStorageProvider {
  // Query with file scanning
  query(filter: TelemetryFilter): Promise<ToolCallEvent[]>;

  // File management
  getLogFiles(): Promise<string[]>;
  rotateOldLogs(maxAgeDays: number): Promise<void>;
}
```

### Configuration

```typescript
interface FileTelemetryConfig {
  directory: string;        // Output directory (default: ".agency/telemetry")
  mode: "daily" | "session"; // File rotation mode (default: "daily")
  sessionId?: string;       // Required for session mode - passed via configuration
  maxAgeDays: number;       // Auto-cleanup threshold (default: 30)
  compress: boolean;        // Gzip old files (default: false)
}
```

```json
{
  "telemetry": {
    "providers": ["file"],
    "file": {
      "directory": ".agency/telemetry",
      "mode": "daily",
      "sessionId": "optional-session-id",
      "maxAgeDays": 30,
      "compress": false
    }
  }
}
```

### Error Handling

On write failure (disk full, permission denied, I/O error):
- **Log a warning** and continue operation (best-effort telemetry)
- Telemetry is observability infrastructure—it should help debug issues, not become one
- A full disk should not crash an agent mid-task

### Session ID Management

In session mode, the session ID is **passed via configuration**:
- Allows Generacy to inject the session ID it's already tracking
- Enables correlation across the system
- Supports adoption path: Level 1 users pass simple identifiers; Level 3+ uses orchestrator session tracking

### Compression Behavior

File compression is triggered **only during `rotateOldLogs()` calls**:
- Explicit control lets consuming code decide when disk I/O happens
- Can be called during idle time or by background jobs
- Plugin does one thing well; orchestration layers decide maintenance timing

### Concurrency Model

**Single-process only** (no concurrent write support):
- Agency runs as an MCP server in a dev container—typically one agent per container
- Multi-process concurrent writes would add complexity for an unusual scenario
- Start simple; add complexity when there's demonstrated need

## Acceptance Criteria

- [ ] Events persisted to JSONL files
- [ ] Daily rotation by default
- [ ] Session mode with configurable session ID
- [ ] Query support with date range filtering
- [ ] Auto-cleanup of old logs via rotateOldLogs()
- [ ] Configurable output directory
- [ ] Compression during rotation (when enabled)
- [ ] Warning logged on write failures (not thrown)
- [ ] Registered by default when telemetry enabled

## User Stories

### US1: Daily Telemetry Logging

**As a** developer using Agency,
**I want** tool call events automatically persisted to daily log files,
**So that** I can review and debug agent interactions after the fact.

**Acceptance Criteria**:
- [ ] Events written to `{directory}/YYYY-MM-DD.jsonl`
- [ ] Files created automatically on first write
- [ ] Each line is valid JSON (ToolCallEvent format)

### US2: Session-Based Logging

**As a** platform operator (Generacy),
**I want** to configure session-based log files with my own session IDs,
**So that** I can correlate telemetry with my workflow tracking.

**Acceptance Criteria**:
- [ ] Session mode uses `{directory}/sessions/{sessionId}.jsonl`
- [ ] Session ID passed via configuration
- [ ] Validation error if session mode enabled without sessionId

### US3: Log Rotation and Cleanup

**As a** developer,
**I want** old telemetry files automatically cleaned up,
**So that** disk space is managed without manual intervention.

**Acceptance Criteria**:
- [ ] `rotateOldLogs(maxAgeDays)` deletes files older than threshold
- [ ] If compression enabled, compresses before deleting
- [ ] Returns list of files processed

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Implement `store(event)` writing to JSONL | P1 | Append-only |
| FR-002 | Implement `query(filter)` reading from JSONL | P1 | Date range filtering |
| FR-003 | Support daily file rotation | P1 | Default mode |
| FR-004 | Support session file mode | P2 | Configurable sessionId |
| FR-005 | Implement `getLogFiles()` | P2 | List available logs |
| FR-006 | Implement `rotateOldLogs()` | P2 | Cleanup + compression |
| FR-007 | Log warnings on write failure | P1 | Best-effort telemetry |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Write latency | < 5ms p99 | Benchmark append operation |
| SC-002 | Query performance | < 100ms for 10k events | Date range query |
| SC-003 | Disk efficiency | < 500 bytes/event avg | Measure file sizes |

## Assumptions

- Single-process writes only (no file locking needed)
- File system supports atomic append operations
- Directory permissions are properly configured
- Sufficient disk space for telemetry storage

## Out of Scope

- Multi-process concurrent write support
- Real-time streaming/tailing of logs
- Remote storage backends (S3, GCS, etc.)
- Log aggregation or shipping
- Schema versioning/migration

---

*Generated by speckit*
