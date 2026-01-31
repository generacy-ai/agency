# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 23:24

### Q1: GitStatus Type Definition
**Context**: The spec lists `getStatus()` returning `GitStatus` but this type is not defined. The implementation needs a concrete type structure.
**Question**: What should the GitStatus type contain? Should it include staged files, unstaged files, untracked files, current branch, and ahead/behind counts?
**Options**:
- A: Minimal: isClean, currentBranch, hasChanges
- B: Full: staged[], unstaged[], untracked[], currentBranch, ahead/behind counts, isClean

**Answer**: A - Minimal: isClean, currentBranch, hasChanges

### Q2: Error Handling Strategy
**Context**: Different functions may fail for various reasons (not a git repo, network issues, branch doesn't exist). A consistent strategy is needed.
**Question**: How should errors be handled across the git utility functions?
**Options**:
- A: Return null/undefined for queries, throw for mutations
- B: Throw errors for all failures with descriptive messages
- C: Return Result<T, Error> discriminated union type

**Answer**: B - Throw errors for all failures with descriptive messages

### Q3: branchExists Scope
**Context**: The function `branchExists(name)` needs to know where to check for the branch.
**Question**: Should branchExists() check local branches only, remote branches only, or both?
**Options**:
- A: Local only (refs/heads/)
- B: Both local and remote (check local first, then origin/)

**Answer**: B - Both local and remote (check local first, then origin/)

### Q4: Target Package Location
**Context**: There's already a git.ts in packages/agency-plugin-spec-kit. The spec says to create src/utils/git.ts but the package structure has packages/agency/.
**Question**: Where exactly should the new git.ts be created? packages/agency/src/utils/git.ts or extend the existing packages/agency-plugin-spec-kit/src/utils/git.ts?
**Options**:
- A: Create new packages/agency/src/utils/git.ts (separate from spec-kit)
- B: Extend existing packages/agency-plugin-spec-kit/src/utils/git.ts

**Answer**: A - Create new packages/agency/src/utils/git.ts (separate from spec-kit)

