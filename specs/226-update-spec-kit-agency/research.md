# Research: Integrate Label Protocol for Clarification and Phase Management

## Technology Decisions

### 1. IssueTracker Facet vs gh CLI

**Decision**: Use IssueTracker facet for all operations

**Rationale**: Per clarification Q2 answer, agents should call Agency tools/facets rather than raw CLI commands. The facet provides backlog-system-agnostic abstraction.

**Trade-off**: The facet currently lacks `listComments`. This requires extending the Latency interface, which is a cross-package change. However, the interface extension is small and well-defined.

**Alternative considered**: Using `gh` CLI directly (simpler, no cross-package changes). Rejected because it breaks the abstraction layer and wouldn't work with Jira/Shortcut.

### 2. Dual-Mode Operation

**Decision**: `manage_clarifications` operates in file-only mode (backward compatible) when `issue_number` is omitted, and file+GitHub mode when `issue_number` is provided.

**Rationale**: Preserves backward compatibility. Existing tests and workflows that don't use GitHub comments continue working unchanged.

**Alternative considered**: Always posting to GitHub. Rejected because not all environments have GitHub access, and file-based mode is useful for offline/local development.

### 3. Answer Parsing Strategy

**Decision**: Regex-based parsing of `Q<N>: <answer>` patterns from issue comments.

**Pattern**: `/^Q(\d+)\s*:\s*(.+?)$/gm` — Matches lines starting with Q followed by a number and colon.

**Robustness**: Parse all comments after the clarification batch comment. Multiple comments can contain answers (incremental answering). Later answers override earlier ones for the same question number.

**Edge cases**:
- Multi-line answers: Everything between `Q1:` and `Q2:` (or end of comment)
- Bold formatting: `**Q1**: answer` should also match
- Option references: `Q1: B` or `Q1: Answer B — explanation` are valid

### 4. Comment Identification via HTML Markers

**Decision**: Use `<!-- generacy-clarification:batch-N -->` as the first line of each clarification comment.

**Rationale**: Follows the pattern established in label-protocol.md. Hidden HTML comments don't render in GitHub UI but are machine-parseable.

**Implementation**: When reading answers, scan all issue comments. Find the clarification batch comment by marker. Then scan subsequent comments for `Q<N>:` answer patterns.

### 5. Facet Resolution Pattern

**Decision**: Resolve IssueTracker facet via `core.getFacet?.('IssueTracker')` at tool execution time (lazy resolution).

**Rationale**: The facet may not be available in all deployments. Lazy resolution with graceful fallback matches the existing Humancy pattern.

**Pattern**:
```typescript
interface ExtendedCoreAPI extends AgencyCoreAPI {
  getTool?(name: string): AgencyTool | undefined;
  getFacet?(name: string): IssueTracker | undefined;
}
```

If `getFacet` is not available or returns undefined, fall back to constructing a GitHubCliProvider directly (maintains backward compatibility).

## Implementation Patterns

### Comment Body Formatting

The clarification comment follows a structured markdown template:
1. Hidden HTML marker for machine identification
2. Heading with batch number
3. Numbered questions with context, options
4. Answer instructions footer

### Answer Merging

When `read` is called with `issue_number`:
1. First read `clarifications.md` for the canonical question list
2. Fetch issue comments via IssueTracker
3. Parse answers from comments posted after the batch marker comment
4. Merge: file answers take precedence, then GitHub answers fill gaps
5. Return unified result with source attribution (`file` vs `github`)

## Key Sources

- [label-protocol.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/label-protocol.md) — Authoritative protocol for comment markers and answer format
- Latency IssueTracker facet: `/workspaces/latency/packages/latency/src/facets/issue-tracker.ts`
- Existing manage-clarifications tool: `/workspaces/agency/packages/agency-plugin-spec-kit/src/tools/manage-clarifications.ts`
- Clarification types: `/workspaces/agency/packages/agency-plugin-spec-kit/src/types/clarification.ts`
