# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 23:30

### Q1: Repository Context
**Context**: The getTicketUrl and parseRef methods need to generate/parse URLs containing owner/repo. The reference implementation doesn't show how repository context is determined.
**Question**: How should GitHubProvider obtain the owner/repo context? Should it use `gh repo view --json nameWithOwner` at construction, accept config parameters, or infer from git remote?
**Options**:
- A: Auto-detect from git remote using `gh repo view --json nameWithOwner`
- B: Require configuration via constructor parameters
- C: Lazy detection on first use, then cache

**Answer**: A - Auto-detect from git remote using `gh repo view --json nameWithOwner`

### Q2: Error Type Usage
**Context**: The BacklogProvider interface specifies NotFoundError, AuthError, ProviderError but the spec doesn't indicate where these error types are defined.
**Question**: Should GitHubProvider use the existing error types from the BacklogProvider interface spec (F3), or define its own error handling?
**Options**:
- A: Use centralized error types from types.ts (must be defined in F3 first)
- B: Define GitHub-specific error classes in github.ts
- C: Use simple Error with descriptive messages for now, refine later

**Answer**: B - Define GitHub-specific error classes in github.ts

### Q3: Sync vs Async gh CLI
**Context**: The reference implementation uses sync execFileSync wrapped in async. The BacklogProvider interface methods are async.
**Question**: Should the gh CLI execution use synchronous calls (simpler, blocks) or fully async with spawn (more complex, non-blocking)?
**Options**:
- A: Sync execFileSync wrapped in async (matches reference implementation)
- B: Full async with child_process.spawn
- C: Use execa or similar library for cleaner async handling

**Answer**: A - Sync execFileSync wrapped in async (matches reference implementation)

