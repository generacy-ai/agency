# Implementation Plan: I2: End-to-end test: GitHub provider flow

**Feature**: End-to-end integration tests for spec-kit GitHub provider workflow
**Branch**: `171-i2-end-end-test`
**Status**: Complete

## Summary

Create comprehensive end-to-end tests for the GitHub provider flow in `@generacy-ai/agency-plugin-spec-kit`. These tests validate the complete spec-kit workflow using real GitHub API calls (via `gh` CLI), following the established pattern from `local-flow.test.ts`. Tests will use a dedicated test repository or the current repository with dynamic fixtures that are created and cleaned up during test runs.

## Technical Context

- **Language**: TypeScript
- **Framework**: Vitest (test runner)
- **Package**: `packages/agency-plugin-spec-kit`
- **GitHub Integration**: Uses `gh` CLI for API operations (not Octokit directly)
- **Test Pattern**: Integration tests following `local-flow.test.ts` structure

### Key Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| vitest | ^1.0.0 | Test runner |
| gh CLI | - | GitHub API operations |
| @generacy-ai/agency | workspace | Core types (AgencyTool, ToolResult) |

### Tool Names (from manifest.ts)

- `spec_kit.get_ticket` - Retrieve issue details
- `spec_kit.create_ticket` - Create new GitHub issue
- `spec_kit.create_feature` - Create feature branch from issue
- `spec_kit.tasks_to_issues` - Convert tasks.md to GitHub issues

## Project Structure

```
packages/agency-plugin-spec-kit/
├── tests/
│   └── integration/
│       ├── local-flow.test.ts          # Existing - reference pattern
│       └── github-flow.test.ts         # NEW - GitHub provider E2E tests
├── src/
│   ├── providers/
│   │   ├── github.ts                   # GitHubProvider (Octokit-based)
│   │   └── github-cli.ts               # gh CLI wrapper (used by tools)
│   ├── tools/
│   │   ├── get-ticket.ts               # get_ticket tool
│   │   ├── create-ticket.ts            # create_ticket tool
│   │   ├── create-feature.ts           # create_feature tool
│   │   └── tasks-to-issues.ts          # tasks_to_issues tool
│   └── utils/
│       └── github-cli.ts               # Low-level gh CLI utilities
└── vitest.config.ts                    # Test configuration
```

## Design Decisions

### 1. Test Repository Strategy

**Decision**: Use the current repository (`generacy-ai/agency`) with dynamic fixtures
**Rationale**:
- Simpler CI/CD setup (no cross-repo permissions needed)
- Consistent with `local-flow.test.ts` pattern of creating/destroying test data
- Test issues are easily identifiable via `[E2E Test]` prefix

### 2. Test Isolation Approach

**Decision**: Each test creates unique fixtures with timestamp-based identifiers
**Pattern**:
```typescript
const testId = `e2e-${Date.now()}`;
const testIssue = await createTestIssue(`[E2E Test ${testId}] Feature title`);
// Test runs...
afterEach: cleanup test resources (unless PRESERVE_TEST_RESOURCES=true)
```

### 3. GitHub Provider vs gh CLI

**Decision**: Use tools directly (which internally use gh CLI) rather than GitHubProvider class
**Rationale**:
- Tests actual user-facing behavior
- Tools handle the gh CLI integration
- More realistic end-to-end coverage

### 4. Cleanup Strategy

**Decision**: Cleanup by default with opt-out via environment variable
**Implementation**:
- `PRESERVE_TEST_RESOURCES=true` - Keep test issues/branches for debugging
- Default: Close test issues, delete test branches

## Test Scenarios

### Phase 1: Basic Operations

| Test | Tool | Description |
|------|------|-------------|
| T001 | get_ticket | Fetch issue by #N reference |
| T002 | get_ticket | Fetch issue by full URL |
| T003 | get_ticket | Handle non-existent issue (404) |
| T004 | create_ticket | Create issue with title only |
| T005 | create_ticket | Create issue with title, body, labels |

### Phase 2: Feature Creation

| Test | Tool | Description |
|------|------|-------------|
| T010 | create_feature | Create feature from issue |
| T011 | create_feature | Verify branch naming pattern |
| T012 | create_feature | Verify spec directory structure |

### Phase 3: Tasks to Issues

| Test | Tool | Description |
|------|------|-------------|
| T020 | tasks_to_issues | Dry run preview |
| T021 | tasks_to_issues | Create issues (per-task grouping) |
| T022 | tasks_to_issues | Verify issue linkage in tasks.md |

### Phase 4: Full Workflow

| Test | Description |
|------|-------------|
| T030 | Complete flow: issue → feature → tasks → child issues |

## Implementation Notes

### Test Utilities Required

```typescript
// Create test issue for use in other tests
async function createTestIssue(title: string, body?: string): Promise<number>

// Close/cleanup test issue
async function closeTestIssue(number: number): Promise<void>

// Delete test branch if it exists
async function deleteTestBranch(name: string): Promise<void>
```

### Environment Requirements

- `gh` CLI authenticated with repo access
- `GITHUB_TOKEN` environment variable (for GitHubProvider)
- Network access to GitHub API

### CI Considerations

- Tests may be slow (GitHub API calls)
- Should be in separate test group (not run by default)
- Consider rate limiting between tests

## Constitution Check

No constitution.md found - no governance constraints to verify.

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Rate limiting | Medium | Add delays between tests, use test batching |
| Orphaned resources | Low | Cleanup in afterAll, prefix test resources |
| Flaky tests | Medium | Retry logic, adequate timeouts |
| CI permissions | Medium | Document required gh auth scopes |

---

*Generated by speckit*
