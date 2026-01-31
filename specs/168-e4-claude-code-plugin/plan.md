# Implementation Plan: E4: Claude Code plugin: specify command

**Feature**: Implement the `/agency-spec-kit:specify` slash command for the Claude Code plugin
**Branch**: `168-e4-claude-code-plugin`
**Status**: Complete

## Summary

This feature implements the `/agency-spec-kit:specify` command that creates a new feature specification from a description. The Claude Code plugin command file (`commands/specify.md`) already exists with the command definition. The missing piece is the `spec_kit.create_feature` MCP tool that the command orchestrates.

The command workflow:
1. User provides a feature description
2. Command calls `create_feature` MCP tool which:
   - Auto-generates next feature number (###)
   - Generates short name from description
   - Creates git branch `###-short-name`
   - Creates feature directory `specs/###-short-name/`
   - Initializes spec.md with description and template
   - Creates checklists/ and contracts/ subdirectories
3. Command enhances the generated spec.md with user stories and requirements
4. Reports results to user

## Technical Context

- **Language**: TypeScript
- **Runtime**: Node.js
- **Framework**: Agency plugin architecture
- **Dependencies**: simple-git (for git operations)

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── create-feature.ts    # NEW - To implement
│   │   ├── index.ts             # MODIFY - Register new tool
│   │   ├── git-ops.ts           # Reference for git patterns
│   │   └── copy-template.ts     # Reference for template handling
│   └── manifest.ts              # Already declares create_feature
└── tests/
    └── tools/
        └── create-feature.test.ts  # NEW - Unit tests

packages/claude-plugin-agency-spec-kit/
└── commands/
    └── specify.md               # EXISTING - Command definition
```

## Implementation Approach

### Clarification Decisions

Based on the clarification questions (clarifications assumed to be approved given `completed:clarification` label):

| Question | Decision | Rationale |
|----------|----------|-----------|
| Q1: Ticket Sources | GitHub Issues only for MVP | Simpler scope, extensible later |
| Q2: No Ticket Behavior | Prompt for description | Match reference behavior, require input |
| Q3: MCP Tool Namespace | Use existing tool names | Follow established patterns in codebase |
| Q4: Ticket Linking | Skip automatic linking | Simpler implementation, manual linking |

### Key Decisions

1. **Feature Number Generation**: Scan existing branches/directories for highest number, increment by 1, zero-pad to 3 digits
2. **Short Name Generation**: Extract meaningful words from description, lowercase, hyphenate (max 4 words)
3. **Branch Creation**: Use `git checkoutLocalBranch` via simple-git (same pattern as git-ops.ts)
4. **Directory Structure**: Use `mkdir` with recursive flag for nested directories
5. **Template Initialization**: Call existing `copy_template` logic internally or duplicate pattern

### Tool Interface

```typescript
interface CreateFeatureParams {
  description: string;           // Feature description (required)
  number?: number;              // Optional explicit feature number (1-999)
  short_name?: string;          // Optional explicit short name
  cwd?: string;                 // Working directory
}

interface CreateFeatureResult {
  success: boolean;
  feature_number: string;       // "168" (not padded in result)
  branch: string;               // "168-short-name"
  feature_dir: string;          // "/workspaces/.../specs/168-short-name/"
  spec_file: string;            // Full path to spec.md
  error?: string;               // Error message if failed
}
```

## Testing Strategy

1. **Unit Tests**: Mock file system and git operations
2. **Test Cases**:
   - Happy path: Create feature with description
   - Explicit number: Provide custom feature number
   - Explicit short name: Provide custom short name
   - Number collision: Handle existing feature numbers
   - Not in git repo: Error gracefully
   - Invalid description: Handle empty/invalid input

## Dependencies

- Depends on: `git-ops.ts` patterns for git operations
- Depends on: `copy-template.ts` patterns for template handling
- Depends on: `get-paths.ts` for path resolution
- Used by: `commands/specify.md` command

## Risk Considerations

1. **Race Conditions**: If multiple create_feature calls happen simultaneously, could get duplicate numbers
   - Mitigation: Use atomic operations or advisory locking (defer for MVP)
2. **Git State**: If git is in dirty state, branch creation may fail
   - Mitigation: Check git status before operations, return clear error
