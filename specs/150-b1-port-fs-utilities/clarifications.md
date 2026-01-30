# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 22:23

### Q1: Target Package Location
**Context**: The spec references `src/utils/fs.ts` but this is a monorepo with multiple packages. The Agent Assignment mentions 'spec-kit Agency plugin'. Need to confirm the correct package location.
**Question**: Should the fs utilities be created in `packages/agency-plugin-spec-kit/src/utils/fs.ts`?
**Options**:
- A: Yes, in agency-plugin-spec-kit (as mentioned in Agent Assignment)
- B: Different package location (please specify)

**Answer**: *Pending*

### Q2: findRepoRoot Return Type
**Context**: The spec signature shows `Promise<string>` but the reference implementation returns `Promise<string | null>` when no repo root is found. This affects error handling behavior.
**Question**: What should `findRepoRoot()` return when no repository root is found?
**Options**:
- A: Return `null` (matching reference implementation)
- B: Throw an error (requiring custom error type)

**Answer**: *Pending*

### Q3: Custom Error Types
**Context**: The spec requires 'Proper error handling with custom error types' but the reference implementation uses simple try/catch without custom errors. Need clarity on error handling approach.
**Question**: Should we implement custom error classes (e.g., `FileNotFoundError`, `PermissionError`) or use standard error handling like the reference?
**Options**:
- A: Create custom error classes for different failure modes
- B: Use standard error handling (match reference implementation)

**Answer**: *Pending*

### Q4: Include copyFile Function
**Context**: The reference implementation includes `copyFile()` which is not listed in the spec's function signatures. It may be useful for template operations.
**Question**: Should we include the `copyFile()` function that exists in the reference implementation?
**Options**:
- A: Yes, include copyFile() for completeness
- B: No, stick to the spec's function list only

**Answer**: *Pending*

