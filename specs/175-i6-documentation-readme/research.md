# Research: Documentation and README

## Technology Decisions

### Documentation Format

**Decision**: Use GitHub-flavored Markdown (GFM)

**Rationale**:
- Standard format for npm package documentation
- Renders natively on GitHub and npm
- Supports code blocks with syntax highlighting
- Supports tables for structured data

### Documentation Structure

**Decision**: Modular documentation with separate files for configuration and providers

**Rationale**:
- Main README stays focused on getting started
- Configuration reference can be detailed without overwhelming new users
- Provider guides can include provider-specific screenshots/examples
- Easier to maintain and update individual sections

### Code Example Style

**Decision**: TypeScript examples with explicit types

**Rationale**:
- Matches the codebase implementation
- Provides better developer experience with IDE hints
- Shows expected types for configuration options

## Alternatives Considered

### 1. Single README vs. Multiple Files

| Approach | Pros | Cons |
|----------|------|------|
| Single README | Everything in one place, easy to search | Can become overwhelming, harder to maintain |
| **Multiple files** (chosen) | Modular, easier to update, better UX | Requires navigation between files |

### 2. Auto-generated API Docs

| Approach | Pros | Cons |
|----------|------|------|
| TypeDoc generation | Always in sync with code | Requires build step, less curated |
| **Manual docs** (chosen) | Better narrative, focused content | May drift from implementation |

Decision: Manual docs for now since the API surface is stable and a curated guide is more valuable than exhaustive API docs.

## Implementation Patterns

### Configuration Documentation Pattern

For each config option, document:
1. **Path**: Full dotted path (e.g., `paths.specs`)
2. **Type**: TypeScript type (e.g., `string`)
3. **Default**: Default value if any
4. **Description**: What it controls
5. **Example**: Practical usage example

### Provider Documentation Pattern

For each provider, document:
1. **Prerequisites**: What's needed before setup
2. **Authentication**: How to configure auth
3. **Configuration**: Required settings
4. **Example**: Complete working configuration
5. **Troubleshooting**: Common issues and solutions

## Key Sources

### Codebase Files
- `packages/agency-plugin-spec-kit/src/config.ts` - Configuration schema
- `packages/agency-plugin-spec-kit/src/tools/index.ts` - Tool exports
- `packages/agency-plugin-spec-kit/src/providers/types.ts` - Provider interface
- `packages/agency-plugin-spec-kit/package.json` - Package metadata
- `packages/claude-plugin-agency-spec-kit/commands/*.md` - Command definitions

### External References
- [MCP Specification](https://spec.modelcontextprotocol.io/) - MCP server requirements
- [Claude Code Plugins](https://docs.anthropic.com/claude-code) - Plugin structure
- [GitHub CLI Auth](https://cli.github.com/manual/gh_auth_login) - gh authentication
- [Jira API Tokens](https://support.atlassian.com/atlassian-account/docs/manage-api-tokens-for-your-atlassian-account/) - Jira auth
