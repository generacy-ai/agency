# Research: C4: Implement update_agent tool

## Technology Decisions

### Agent File Formats

Different AI agents use different context file formats and locations:

| Agent | File Path | Format |
|-------|-----------|--------|
| Claude Code | `CLAUDE.md` | Markdown |
| Cursor Agent | `.cursor/rules/agent.mdc` | Markdown variant |
| GitHub Copilot | `.github/agents/copilot-instructions.md` | Markdown |
| Windsurf | `.windsurfrules` | Plain text |
| Amazon Q | `.amazonq/rules.md` | Markdown |

All files can be treated as markdown for section updates, with content injection happening after specific headers or between comment markers.

### Technology Extraction Patterns

The plan.md format uses consistent markdown patterns for technology information:

```markdown
**Language/Version**: TypeScript 5.x
**Primary Dependencies**: React 18, TailwindCSS
**Storage**: PostgreSQL, Redis
**Testing**: Vitest, Playwright
**Project Type**: Web Application
```

Regex patterns used:
- `/\*\*Language\/Version\*\*:\s*(.+?)(?:\n|$)/`
- `/\*\*Primary Dependencies\*\*:\s*(.+?)(?:\n|$)/`
- etc.

### Content Injection Approach

Two strategies for updating content:

1. **Marker-based** (preferred): Use HTML comments as boundaries
   ```markdown
   <!-- TECHNOLOGIES START -->
   - Feature X: TypeScript + React
   <!-- TECHNOLOGIES END -->
   ```

2. **Header-based** (fallback): Insert after section headers
   ```markdown
   ## Active Technologies

   - Feature X: TypeScript + React
   ```

The marker-based approach is more reliable as it allows precise content replacement without affecting manually-added content.

## Alternatives Considered

### 1. AST-based Markdown Parsing

**Considered**: Using a markdown parser like `marked` or `remark` to parse and modify the AST.

**Decision**: Use regex-based extraction instead.

**Rationale**:
- Plan.md structure is predictable and simple
- Regex is lighter weight with no additional dependencies
- The reference implementation uses this approach successfully

### 2. Separate Config File for Agent Mappings

**Considered**: Loading agent configurations from an external JSON/YAML file.

**Decision**: Use hardcoded TypeScript constants.

**Rationale**:
- Agent types are stable and rarely change
- Type safety with TypeScript enums
- No file I/O needed at runtime
- Easier testing

### 3. Template Engine for File Generation

**Considered**: Using Handlebars or similar for template processing.

**Decision**: Use simple string replacement.

**Rationale**:
- Template content is simple (just section markers)
- No complex conditionals or loops needed
- Avoids additional dependencies

## Implementation Patterns

### Factory Pattern

Following the established pattern in the codebase:

```typescript
export function createUpdateAgentTool(
  config: SpecKitConfig,
  core: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.update_agent',
    // ...
  };
}
```

### Result Structure

Consistent with other tools, return a typed result:

```typescript
interface UpdateAgentResult {
  success: boolean;
  updated: UpdateResult[];
  skipped?: string[];
  errors?: UpdateError[];
  plan_data: Record<string, string>;
}
```

## Key Sources

1. Reference implementation: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/agent.ts`
2. Agent types: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/types/agent.ts`
3. Existing tools pattern: `packages/agency-plugin-spec-kit/src/tools/get-paths.ts`
4. FS utilities: `packages/agency-plugin-spec-kit/src/utils/fs.ts`
