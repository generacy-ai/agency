# Implementation Plan: Integrate Label Protocol for Clarification and Phase Management

**Feature**: Update spec-kit plugin to post structured clarification comments to GitHub issues and read answers back
**Branch**: `226-update-spec-kit-agency`
**Status**: Complete

## Summary

Extend the `manage_clarifications` tool in `agency-plugin-spec-kit` to support GitHub issue comments as the primary clarification channel. When `issue_number` is provided, the `append` operation posts structured clarification comments to GitHub issues (with `<!-- generacy-clarification:batch-N -->` markers), and the `read` operation fetches answers from issue comments. Humancy integration is preserved as an optional fallback. Label and stage comment management remain in the autodev orchestrator per clarification Q1.

## Scope Boundary (from Clarifications)

- **Spec-kit owns**: Clarification comments only (post questions, read answers)
- **Autodev/orchestrator owns**: Stage comments, label management (phase/completed/waiting-for labels)
- **IssueTracker facet**: Used for all GitHub operations (per Q2)
- **Humancy**: Kept as optional soft dependency (per Q4)
- **Answer format**: Structured `Q1: [answer]` format per label-protocol.md (per Q3)

## Technical Context

- **Language**: TypeScript (ES modules)
- **Framework**: Agency plugin architecture (`@generacy-ai/agency`)
- **Key dependency**: `IssueTracker` facet from Latency (`@generacy-ai/latency`)
- **Build**: `tsc`, pnpm workspaces
- **Test**: vitest

## Architecture

### Current Flow
```
manage_clarifications(append) → write clarifications.md → invoke Humancy (optional)
manage_clarifications(read)   → parse clarifications.md → return batches
```

### New Flow
```
manage_clarifications(append, issue_number) →
  1. Write clarifications.md (unchanged)
  2. Post structured comment to GitHub issue via IssueTracker facet
  3. Invoke Humancy (optional, unchanged)

manage_clarifications(read, issue_number) →
  1. Parse clarifications.md (unchanged baseline)
  2. Fetch issue comments via IssueTracker facet
  3. Parse answers from comments matching Q1:/Q2: format
  4. Merge answers into clarifications data
  5. Optionally update clarifications.md with discovered answers
```

### IssueTracker Facet Integration

The `IssueTracker` facet provides:
- `addComment(issueId, comment)` → Post clarification questions
- `getIssue(id)` → Not directly useful for comments

**Gap**: The facet does NOT provide `listComments` or `editComment`. We need to either:
1. Extend the IssueTracker facet to add comment listing (preferred long-term)
2. Use `gh` CLI for reading comments as a short-term bridge

**Decision**: Add a `listComments` method to the IssueTracker facet interface and implement it in the GitHub provider. This aligns with Q2's answer to use the facet for all operations. If the facet extension is blocked, fall back to `gh` CLI with a TODO marker.

### Comment Format (per label-protocol.md)

**Posted by agent (clarification question):**
```markdown
<!-- generacy-clarification:batch-1 -->

## 🔍 Clarification Questions (Batch 1)

The following questions need to be answered before we can proceed:

### Q1: [Topic]
**Context**: [Why this matters]
**Question**: [The question]
**Options**:
- A: [Option A description]
- B: [Option B description]

### Q2: [Topic]
...

---

**How to answer**: Reply to this issue with your answers using the format:
```
Q1: [your answer]
Q2: [your answer]
```
Then add the `completed:clarification` label.
```

**Reviewer answer format:**
```
Q1: Answer B — Use the facet approach
Q2: Structured format with question references
```

## Project Structure

```
packages/agency-plugin-spec-kit/src/
├── tools/
│   └── manage-clarifications.ts     # MODIFY: Add issue_number param, GitHub comment posting/reading
├── utils/
│   ├── clarification-parser.ts      # MODIFY: Add comment formatting and answer parsing helpers
│   └── issue-comment.ts             # NEW: GitHub issue comment utilities (format, parse answers)
├── types/
│   └── clarification.ts             # MODIFY: Add GitHub comment output types
├── manifest.ts                      # MODIFY: Remove hard Humancy dependency
└── plugin.ts                        # MODIFY: Resolve IssueTracker facet

packages/latency/packages/latency/src/facets/
└── issue-tracker.ts                 # MODIFY: Add listComments method
```

## Key Technical Decisions

1. **IssueTracker facet for all operations** — Per Q2, use the facet rather than raw `gh` CLI. This means extending the facet with `listComments`.

2. **Dual-mode operation** — When `issue_number` is provided, post to GitHub AND write to `clarifications.md`. When omitted, file-only mode (backward compatible).

3. **Facet resolution via AgencyCoreAPI** — The plugin resolves the IssueTracker facet through `core.getFacet?.('IssueTracker')` at tool creation time, similar to how Humancy is resolved via `core.getTool`.

4. **Answer parsing is best-effort** — Parse `Q1:`, `Q2:` patterns from issue comments. If parsing fails, log a warning and return `pending` status for unparsed questions.

5. **Humancy remains optional** — The `invokeHumancyForQuestions` function is unchanged. It fires after GitHub comment posting (both can coexist).

## Implementation Phases

### Phase 1: IssueTracker Facet Extension
- Add `listComments(issueId)` to the IssueTracker facet interface
- Implement in the GitHub IssueTracker provider

### Phase 2: Comment Formatting & Parsing Utilities
- Create `issue-comment.ts` with comment body formatting
- Add answer parsing logic (regex-based Q1:/Q2: extraction)
- Add HTML marker generation (`<!-- generacy-clarification:batch-N -->`)

### Phase 3: Extend manage_clarifications Tool
- Add `issue_number` optional parameter to the tool schema
- Modify `append` to post GitHub comment when `issue_number` given
- Modify `read` to fetch and parse answers from GitHub comments
- Update `update_answer` to work with GitHub-sourced answers

### Phase 4: Manifest & Dependency Cleanup
- Change Humancy from hard to soft dependency in manifest
- Ensure IssueTracker facet requirement is properly declared

### Phase 5: Tests
- Unit tests for comment formatting
- Unit tests for answer parsing
- Integration tests for the full append → read cycle with mocked IssueTracker
