# Feature Specification: Plugin: @generacy-ai/agency-plugin-git

**Branch**: `014-plugin-generacy-ai-agency` | **Date**: 2026-01-18 | **Status**: Draft

## Summary

Implement the Git plugin providing source control tools for agents.

## Parent Epic

#13 - Agency Official Plugins

## Dependencies

- #6 - Agency Core Package

## Tools

| Tool | Description |
|------|-------------|
| `source_control.status` | Get working tree status |
| `source_control.diff` | Show changes (staged, unstaged, or between refs) |
| `source_control.log` | View commit history |
| `source_control.commit` | Create a commit |
| `source_control.push` | Push to remote |
| `source_control.pull` | Pull from remote |
| `source_control.checkout` | Switch branches or restore files |
| `source_control.branch` | Create, list, or delete branches |
| `source_control.stash` | Stash/unstash changes |
| `source_control.blame` | Show line-by-line authorship |
| `source_control.merge` | Merge branches |
| `source_control.rebase` | Rebase current branch |

## Example Tool Implementations

```typescript
// source_control.commit
async function commit(params: {
  message: string;
  files?: string[];
  amend?: boolean;
}): Promise<ToolResult> {
  const args = ['commit', '-m', params.message];
  if (params.files) args.push('--', ...params.files);
  if (params.amend) args.push('--amend');
  
  const result = await exec('git', args);
  return TerseOutput.fromExec(result, 'Committed successfully.');
}

// source_control.status
async function status(): Promise<ToolResult> {
  const result = await exec('git', ['status', '--porcelain']);
  if (result.exitCode !== 0) {
    return TerseOutput.failure(result);
  }
  // Return structured status, not raw output
  return TerseOutput.success(parseGitStatus(result.stdout));
}
```

## Mode Affiliations

- `research`: status, log, diff, blame
- `coding`: all tools
- `review`: status, diff, log, blame

## Configuration

```json
{
  "plugins": {
    "git": {
      "defaultRemote": "origin",
      "signCommits": false,
      "allowForcePush": false
    }
  }
}
```

## Acceptance Criteria

- [ ] All 12 tools implemented
- [ ] Terse output pattern followed
- [ ] Mode affiliations declared
- [ ] Conflict detection with Humancy escalation
- [ ] Tests with mock git repository

## Clarified Requirements

### Conflict Resolution (Q1)
- Provide structured conflict information (file, conflict type, conflicting content)
- Let agent decide per-case whether to resolve autonomously or escalate
- Respects "agents are primary workers" principle

### Error Handling (Q2)
- Hybrid approach: categorize common errors, pass through uncommon ones
- Standard error types: `AuthError`, `NetworkError`, `ConflictError`, `DetachedHeadError`
- Supports terse output pattern while preserving full error details

### Force Push Safety (Q3)
- Escalate to human via Humancy when force push is required but disabled
- Use `blocking_now` urgency level for escalation
- Aligns with "humans as specialist consultants" model for destructive operations

### Working Directory Scope (Q4)
- All tools accept optional `cwd` parameter
- When omitted, uses `process.cwd()`
- Enables multi-repo scenarios (monorepos, submodules)

### Authentication (Q5)
- Rely on system git credential helper (no plugin-level auth)
- Expected deployment is container environments with pre-configured credentials
- Avoids duplicating authentication infrastructure

## User Stories

### US1: Agent Commits Code Changes

**As an** AI agent,
**I want** to commit code changes with structured status feedback,
**So that** I can track my work and respond to errors programmatically.

**Acceptance Criteria**:
- [ ] Commit returns structured result with commit hash
- [ ] Errors are categorized (AuthError, ConflictError, etc.)
- [ ] Partial staging supported via files parameter

### US2: Agent Handles Merge Conflicts

**As an** AI agent,
**I want** structured conflict information when merges fail,
**So that** I can decide whether to resolve or escalate.

**Acceptance Criteria**:
- [ ] Conflict details include file, conflict type, and content
- [ ] Agent can attempt resolution or escalate to Humancy
- [ ] Successful resolution completes the merge

### US3: Human Reviews Force Push

**As a** human reviewer,
**I want** force push operations to require my approval,
**So that** destructive operations don't lose team history.

**Acceptance Criteria**:
- [ ] Force push blocked when `allowForcePush: false`
- [ ] Humancy escalation with `blocking_now` urgency
- [ ] Clear explanation of why force push is needed

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | All tools accept optional `cwd` parameter | P1 | Multi-repo support |
| FR-002 | Categorized error types for common failures | P1 | AuthError, NetworkError, ConflictError, DetachedHeadError |
| FR-003 | Structured conflict info on merge/rebase failures | P1 | File, type, content |
| FR-004 | Force push escalation via Humancy | P2 | blocking_now urgency |
| FR-005 | System credential helper for auth | P1 | No plugin-level credentials |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Tool coverage | 12/12 tools | Implementation count |
| SC-002 | Error categorization | 4 error types | Code inspection |
| SC-003 | Test coverage | 80%+ | jest --coverage |

## Assumptions

- Git is available in the execution environment
- System credential helper is configured for remote operations
- Humancy integration exists for escalation callbacks

## Out of Scope

- Plugin-level credential management
- GUI conflict resolution
- Git LFS support (future enhancement)
- Submodule management beyond cwd parameter

---

*Generated by speckit*
