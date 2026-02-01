# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-02-01 17:11

### Q1: Test Environment
**Context**: Tests that create GitHub issues/branches need isolation from production data. Running against the main repo risks polluting the issue tracker.
**Question**: Should tests run against a dedicated test repository, or use the current repo with a cleanup strategy?
**Options**:
- A: Use dedicated test repo (e.g., generacy-ai/speckit-test-fixtures)
- B: Use current repo with mandatory cleanup after tests
- C: Use mock/stub GitHub API responses (no real API calls)

**Answer**: *Pending*

### Q2: Test Data Fixtures
**Context**: Tests reference issue #1 for fetching. If running against a test repo, specific test fixtures need to exist.
**Question**: What test fixtures should exist in the test environment (e.g., specific issues, labels, milestones)?
**Options**:
- A: Minimal: Just a few numbered issues (#1, #2, #3) with known titles
- B: Comprehensive: Issues, labels, milestones, and projects mimicking real usage
- C: Dynamic: Tests create their own fixtures before each run

**Answer**: *Pending*

### Q3: Tool Name Verification
**Context**: The test scenarios reference 'spec_kit.get_ticket' but spec-kit MCP tools may use different naming conventions.
**Question**: What is the actual MCP tool name for fetching ticket information - is it 'get_ticket', 'fetch_issue', or something else?
**Options**:
- A: Verify against actual spec-kit plugin source code
- B: Use naming from existing integration tests as reference

**Answer**: *Pending*

### Q4: Cleanup Strategy
**Context**: Tests that create issues and branches need a cleanup approach to avoid resource accumulation.
**Question**: Should tests automatically clean up created resources (delete test issues/branches), or leave them for inspection?
**Options**:
- A: Always clean up - delete all test-created resources in afterEach/afterAll
- B: Clean up by default, but provide flag to preserve for debugging
- C: Never auto-delete - rely on manual or scheduled cleanup

**Answer**: *Pending*

