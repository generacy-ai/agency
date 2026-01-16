# Research: Bootstrap: CLAUDE.md, .speckit templates, .mcp.json

**Feature**: `001-bootstrap-claude-md-speckit`
**Date**: 2026-01-16

## Technology Decisions

### 1. CLAUDE.md Structure

**Decision**: Follow claude-plugins CLAUDE.md format with Generacy-specific adaptations

**Rationale**:
- Proven structure from existing speckit/autodev development
- Consistent with other generacy-ai repositories
- Includes all required sections: technologies, structure, commands, code style

**Key Sections**:
1. Active Technologies - TypeScript 5.x, Node.js 20+, pnpm, turborepo
2. Project Structure - Monorepo layout with packages/
3. Commands - Build/test/dev commands
4. Code Style - TypeScript conventions, terse output pattern
5. MCP Tools - (placeholder for future plugins)

### 2. Template Selection

**Decision**: Copy all 5 templates from claude-plugins without modification

**Source Templates**:
| Template | Purpose |
|----------|---------|
| `spec-template.md` | Feature specification with user stories, requirements |
| `plan-template.md` | Implementation plan with technical context |
| `tasks-template.md` | Phased task breakdown with estimates |
| `checklist-template.md` | Quality validation checklists |
| `agent-file-template.md` | CLAUDE.md generation pattern |

**Rationale**:
- Templates are generic and project-agnostic
- No agency-specific modifications needed at bootstrap
- Can be customized later if needed

### 3. MCP Server Selection

**Decision**: Configure Context7 and Playwright

| Server | Use Case | Priority |
|--------|----------|----------|
| Context7 | Documentation lookup, code context | P1 |
| Playwright | Browser automation, testing | P2 |

**Alternatives Considered**:
- Firebase MCP - Not needed until backend features implemented
- Additional servers - Can be added per-feature as needed

## Implementation Patterns

### File Copying Strategy

For templates, use direct file copy from `/workspaces/claude-plugins/.specify/templates/`:
```
cp -r /workspaces/claude-plugins/.specify/templates/* .specify/templates/
```

### CLAUDE.md Generation

Start from claude-plugins CLAUDE.md structure but:
1. Replace plugin-specific content with placeholder monorepo structure
2. Update technologies section for agency
3. Clear "Recent Changes" section (no features yet)
4. Keep "Manual Additions" structure for future customization

## References

- Source templates: `/workspaces/claude-plugins/.specify/templates/`
- Reference CLAUDE.md: `/workspaces/claude-plugins/CLAUDE.md`
- Generacy vision: `/workspaces/triad-development/docs/` (external)
- speckit commands: `/workspaces/claude-plugins/plugins/speckit/commands/`
