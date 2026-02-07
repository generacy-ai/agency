# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-02-01 17:10

### Q1: Test Environment
**Context**: End-to-end tests can either hit a live Jira instance (requiring real credentials and test data) or use mocked/stubbed responses. This affects test reliability, setup complexity, and CI/CD integration.
**Question**: Should these end-to-end tests connect to a real Jira instance, use mocked Jira API responses, or support both modes?
**Options**:
- A: Real Jira instance only (true E2E but requires credentials)
- B: Mocked responses only (faster, no credentials needed)
- C: Both modes with environment variable to switch

**Answer**: *Pending*

### Q2: Error Handling Tests
**Context**: The spec only shows happy-path scenarios. Robust E2E tests typically validate error handling (invalid keys, auth failures, network issues).
**Question**: Should the test suite include error scenario tests (e.g., invalid Jira key, authentication failure, rate limiting)?
**Options**:
- A: Yes, include comprehensive error handling tests
- B: No, focus only on happy-path scenarios for this iteration

**Answer**: *Pending*

### Q3: Test Data Management
**Context**: Tests referencing PROJ-123 need actual test issues. These could be pre-existing fixtures or created/cleaned up by the test suite.
**Question**: Should tests use pre-existing Jira issues as fixtures, or should the test suite create/delete its own test issues?
**Options**:
- A: Pre-existing fixtures (simpler but requires manual setup)
- B: Test-managed issues (self-contained but more complex)
- C: Use mocked data only (no real Jira dependency)

**Answer**: *Pending*

### Q4: Jira Project Configuration
**Context**: Different Jira projects have different issue types, custom fields, and workflows. Tests need to know which configurations to validate.
**Question**: What Jira project key and issue types should the tests target (e.g., PROJ with Bug/Task/Story)?
**Options**:
- A: Use a configurable project key via environment variable
- B: Use a specific test project (specify which one)
- C: Support any project by making issue type optional

**Answer**: *Pending*

