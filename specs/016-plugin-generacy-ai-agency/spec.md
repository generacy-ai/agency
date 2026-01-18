# Feature Specification: Plugin: @generacy-ai/agency-plugin-firebase

**Branch**: `016-plugin-generacy-ai-agency` | **Date**: 2026-01-18 | **Status**: Draft

## Summary

Implement the Firebase plugin for Firebase emulator management, providing agent-optimized tools for starting, stopping, and managing Firebase emulators along with deployment capabilities.

## Parent Epic

#13 - Agency Official Plugins

## Dependencies

- #6 - Agency Core Package

## Tools

| Tool | Description |
|------|-------------|
| `run.firebase_emulators_start` | Start Firebase emulators |
| `run.firebase_emulators_stop` | Stop Firebase emulators |
| `run.firebase_emulators_status` | Check emulator status (returns: running/stopped, ports, URLs) |
| `run.firebase_deploy` | Deploy to Firebase (configurable targets) |
| `run.firebase_functions_log` | View functions logs |

## Technical Decisions

### Process Lifecycle (Clarified)
- **Decision**: Configurable cleanup behavior
- Add a `cleanup` option with values: `"session"` | `"persist"` | `"explicit"`
- Default: `"session"` (auto-cleanup when agent session ends, safer for ephemeral dev containers)

### Error Handling (Clarified)
- **Decision**: Standard error detail (error type + Firebase error message)
- Aligns with Terse Output Pattern: "Minimal success, detailed failure"
- Provides actionable error info without dumping full stderr

### Authentication (Clarified)
- **Decision**: No auth check on load (lazy initialization)
- Don't fail plugin load due to auth; let Firebase CLI errors propagate naturally at point of failure
- Clear feedback when tools are invoked without proper auth

### Deploy Scope (Clarified)
- **Decision**: Configurable deploy targets
- Mirror the `emulators.only` pattern with a `targets` array
- Default: `["functions"]` (most common use case)
- Allowed: `["functions", "rules", "hosting", "storage", "firestore", "database"]`

### Status Output (Clarified)
- **Decision**: Standard output (status + ports + URLs)
- Returns: running/stopped status, port numbers, emulator URLs
- Provides actionable info for agents without noise (no PIDs/memory usage)

## Example Implementation

```typescript
// run.firebase_emulators_start
async function emulatorsStart(params: {
  only?: string[];        // e.g., ["firestore", "auth"]
  import?: string;        // Import data from path
  export?: string;        // Export data on exit
}): Promise<ToolResult> {
  const args = ['emulators:start'];
  if (params.only) args.push('--only', params.only.join(','));
  if (params.import) args.push('--import', params.import);
  if (params.export) args.push('--export-on-exit', params.export);

  // Start in background, return when ready
  const result = await execBackground('firebase', args, {
    readyPattern: /All emulators ready/
  });
  return TerseOutput.fromExec(result, 'Emulators started.');
}
```

## Mode Affiliations

- `debug`: all tools
- `coding`: emulators_start, emulators_stop

## Configuration

```json
{
  "plugins": {
    "firebase": {
      "project": "my-project",
      "cleanup": "session",
      "emulators": {
        "only": ["firestore", "auth", "functions"]
      },
      "deploy": {
        "targets": ["functions"]
      }
    }
  }
}
```

## Acceptance Criteria

- [ ] All 5 tools implemented
- [ ] Emulator lifecycle properly managed with configurable cleanup
- [ ] Background process handling
- [ ] Data import/export support
- [ ] Standard error handling (error type + Firebase message)
- [ ] Status output includes running state, ports, and URLs
- [ ] Configurable deploy targets
- [ ] Tests with Firebase CLI mock

## User Stories

### US1: Agent Starts Firebase Emulators

**As an** AI agent,
**I want** to start Firebase emulators with specific services,
**So that** I can test Firebase-dependent code locally.

**Acceptance Criteria**:
- [ ] Can specify which emulators to start (firestore, auth, functions, etc.)
- [ ] Can import data from a path
- [ ] Can configure export-on-exit behavior
- [ ] Returns success with emulator URLs or failure with actionable error

### US2: Agent Deploys to Firebase

**As an** AI agent,
**I want** to deploy specific Firebase resources,
**So that** I can push changes to production safely.

**Acceptance Criteria**:
- [ ] Can deploy functions only (default)
- [ ] Can configure additional deploy targets
- [ ] Returns success message or detailed error

### US3: Agent Checks Emulator Status

**As an** AI agent,
**I want** to check the status of running emulators,
**So that** I can make decisions based on current state.

**Acceptance Criteria**:
- [ ] Returns running/stopped status per emulator
- [ ] Returns port numbers for each running emulator
- [ ] Returns URLs for API access

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Implement `firebase_emulators_start` tool | P1 | Background process, ready detection |
| FR-002 | Implement `firebase_emulators_stop` tool | P1 | Clean shutdown |
| FR-003 | Implement `firebase_emulators_status` tool | P1 | Status, ports, URLs |
| FR-004 | Implement `firebase_deploy` tool | P1 | Configurable targets |
| FR-005 | Implement `firebase_functions_log` tool | P2 | Log viewing |
| FR-006 | Configurable cleanup behavior | P1 | session/persist/explicit |
| FR-007 | Standard error output format | P1 | error type + message |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Tools implemented | 5/5 | All tools functional |
| SC-002 | Test coverage | >80% | Unit test coverage |
| SC-003 | Emulator lifecycle | Works | Start/stop/status cycle |

## Assumptions

- Firebase CLI is installed in the environment
- Firebase project is initialized in the workspace
- Network ports for emulators are available

## Out of Scope

- Firebase project initialization
- Firebase CLI installation
- Firebase authentication setup (uses existing credentials)
- Real-time database emulator (can be added later)

---

*Generated by speckit*
