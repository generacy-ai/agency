# Implementation Plan: C4: Implement update_agent tool

**Feature**: Implement the `spec_kit.update_agent` MCP tool that updates AI agent context files with technology information from plan.md
**Branch**: `158-c4-implement-update-agent`
**Status**: Complete

## Summary

This tool extracts technology information from a feature's `plan.md` file and updates AI agent context files (like `CLAUDE.md`, `.cursorrules`, etc.) with that information. It supports 17+ agent types, can update existing files or create new ones from templates, and maintains "Active Technologies" and "Recent Changes" sections with auto-updated timestamps.

## Technical Context

**Language/Version**: TypeScript 5.x
**Primary Dependencies**: Node.js fs/promises, path
**Testing**: Vitest
**Project Type**: MCP Tool Plugin

## Project Structure

```text
packages/agency-plugin-spec-kit/
├── src/
│   ├── tools/
│   │   ├── update-agent.ts        # New: Main tool implementation
│   │   └── index.ts               # Modified: Export new tool
│   ├── types/
│   │   ├── agent.ts               # New: Agent types and configs
│   │   └── index.ts               # Modified: Export agent types
│   └── utils/
│       └── fs.ts                  # Existing: File operations
├── tests/
│   └── tools/
│       └── update-agent.test.ts   # New: Unit tests
└── .specify/templates/
    └── agent-file-template.md     # Existing: Template for new agent files
```

## Dependencies (Internal)

- **C1 (get_paths)**: Used to resolve feature directory paths
- **C2 (check_prereqs)**: Validates plan.md exists before extraction
- **B1 (fs utilities)**: File read/write operations via `src/utils/fs.ts`

## Design Decisions

### 1. Agent Configuration Registry

Use a static configuration map (`AGENT_CONFIGS`) defining:
- Agent type identifier
- File path relative to repo root
- Display name for logging

This follows the pattern from the reference implementation and allows easy addition of new agent types.

### 2. Technology Extraction Strategy

Parse `plan.md` using regex patterns to extract:
- **Language/Version** from `**Language/Version**:` line
- **Primary Dependencies** from `**Primary Dependencies**:` line
- **Storage** from `**Storage**:` line
- **Testing** from `**Testing**:` line
- **Project Type** from `**Project Type**:` line

### 3. Content Update Markers

Use HTML comment markers for auto-generated sections:
```markdown
<!-- TECHNOLOGIES START -->
[auto-generated content]
<!-- TECHNOLOGIES END -->

<!-- CHANGES START -->
[auto-generated content]
<!-- CHANGES END -->
```

When markers aren't present, fall back to inserting after section headers:
- `## Active Technologies`
- `## Recent Changes`

### 4. File Creation Strategy

When `create_if_missing: true`:
1. Check for template at configured path (`.specify/templates/agent-file-template.md`)
2. If template exists, copy and populate
3. If no template, generate minimal content with required sections
4. Ensure parent directories exist

### 5. Error Handling

Return structured errors using `McpError` type:
- `FEATURE_DIR_NOT_FOUND`: Can't find repo root
- `PLAN_NOT_FOUND`: plan.md doesn't exist in feature directory
- `AGENT_FILE_NOT_FOUND`: Specific agent file doesn't exist (when not creating)
- `FILE_WRITE_FAILED`: Write operation failed

## API Contract

### Input Parameters

```typescript
interface UpdateAgentParams {
  agent_type?: AgentType;          // Specific agent or all existing
  create_if_missing?: boolean;     // Default: false
  feature_dir?: string;            // Required: Feature directory with plan.md
  cwd?: string;                    // Working directory
}
```

### Output

```typescript
interface UpdateAgentResult {
  success: boolean;
  updated: Array<{
    agent: AgentType;
    filePath: string;
    created: boolean;
  }>;
  skipped?: string[];              // Agents with non-existent files (when updating all)
  errors?: Array<{
    agent: AgentType;
    error: { code: string; message: string };
  }>;
  plan_data: Record<string, string>;  // Extracted technology info
}
```

## Implementation Notes

1. **Follow existing tool patterns** from `get-paths.ts` and `check-prereqs.ts`
2. **Use existing utilities** from `utils/fs.ts` for file operations
3. **Export via index.ts** using factory pattern `createUpdateAgentTool`
4. **Register in createTools** alongside other tools

## Test Plan

1. **Unit tests** for technology extraction from plan.md
2. **Unit tests** for content update with markers
3. **Unit tests** for content update without markers (fallback)
4. **Unit tests** for file creation from template
5. **Unit tests** for file creation without template
6. **Integration test** for full tool execution
7. **Error case tests** for missing files and write failures

## Constitution Check

- ✅ Uses existing file utilities from `utils/fs.ts`
- ✅ Follows MCP tool factory pattern
- ✅ Returns structured JSON responses
- ✅ Uses typed error codes
