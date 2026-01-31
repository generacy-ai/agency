# Research: create_feature Tool Implementation

## Reference Implementation Analysis

### Existing claude-plugins Implementation
Location: `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/tools/feature.ts`

**Key Patterns Observed**:
1. Uses `simple-git` via dynamic import for git operations
2. Configuration loaded from `.claude/autodev.json` with `DEFAULT_BRANCH_CONFIG`
3. Stop words list for slug generation
4. Branch name validation using regex patterns
5. Defense-in-depth: checks for existing branches before creation

**Configuration Structure**:
```typescript
{
  pattern: "{paddedNumber}-{slug}",
  numberPadding: 3,
  types: ["epic", "feature", "bug", "task"],
  defaultType: "feature",
  slugOptions: {
    maxLength: 30,
    separator: "-",
    removeStopWords: true,
    maxWords: 4,
  },
}
```

## Agency Plugin Architecture

### Tool Structure
Tools in agency-plugin-spec-kit follow this pattern:
```typescript
export function createXxxTool(config: SpecKitConfig, core: AgencyCoreAPI): AgencyTool {
  return {
    name: 'spec_kit.xxx',
    description: '...',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: {
      type: 'object',
      properties: { ... },
      required: [...],
    },
    async execute(params: unknown): Promise<ToolResult> {
      // Implementation
    },
  };
}
```

### Existing Utilities Available

**From `utils/fs.ts`**:
- `exists(path)` - Check if path exists
- `readDir(path)` - List directory contents
- `writeFile(path, content)` - Write file with parent mkdir
- `mkdir(path, recursive)` - Create directory
- `findRepoRoot(startPath)` - Find .git root

**From `utils/git.ts`**:
- `isGitRepo(path)` - Check for .git directory
- `getCurrentBranch(repoPath)` - Get current branch name

**From `types/patterns.ts`**:
- `FEATURE_NAME_PATTERN = /^\d{3}-[a-z0-9]+(?:-[a-z0-9]+)*$/`

**From `types/errors.ts`**:
- `createError(code, message, context)` - Factory for MCP errors
- Error codes: `BRANCH_EXISTS`, `FEATURE_DIR_NOT_FOUND`, etc.

### Configuration
From `config.ts`:
```typescript
BranchesConfigSchema = z.object({
  pattern: z.string().default('{paddedNumber}-{slug}'),
  numberPadding: z.number().min(1).max(10).default(3),
  maxSlugWords: z.number().min(1).max(10).default(4),
});
```

## Slug Generation Research

### Stop Words List
Common English stop words to remove:
```
a, an, and, are, as, at, be, been, being, by, can, could, did, do, does,
for, had, has, have, i, if, in, is, it, its, may, might, of, on, or,
should, so, that, the, their, them, then, these, this, those, to, was,
we, were, what, when, which, while, will, with, would, you
```

### Slug Best Practices
1. Lowercase only
2. Replace special characters with spaces
3. Collapse multiple spaces
4. Replace spaces with hyphens
5. Remove leading/trailing hyphens
6. Limit word count for readability
7. Truncate at word boundary if too long

## Git Branch Detection Patterns

### Patterns to Match
1. Legacy: `###-short-name` (e.g., `153-create-feature`)
2. Typed: `type/###-short-name` (e.g., `feature/153-create-feature`)
3. With underscore: `###_short-name` (e.g., `153_create_feature`)

### Branch Scanning Strategy
```typescript
// Local branches
const localBranches = await git.branchLocal();

// Remote branches
const remoteBranches = await git.branch(['-r']);
// Filter for origin/* and strip prefix
```

## Alternatives Considered

### Auto-Numbering Approaches
| Approach | Pros | Cons |
|----------|------|------|
| Scan dirs only | Simple | Misses branches without dirs |
| Scan branches only | Catches all branches | Dirs might have higher numbers |
| **Both (chosen)** | Most comprehensive | Slightly more complex |
| UUID-based | No collisions | Not human-readable |

### Slug Generation Approaches
| Approach | Pros | Cons |
|----------|------|------|
| First N words | Simple, readable | May lose context |
| TF-IDF keywords | Better keywords | Complex, dependencies |
| **First N after stop words (chosen)** | Good balance | Stop word list maintenance |
| Hash-based | Unique | Not human-readable |

## Implementation Considerations

### Concurrency Safety
- Check for branch existence immediately before creation
- Use atomic operations where possible
- Re-fetch remote branches to catch race conditions

### Template Handling
Priority order:
1. `config.paths.templates/spec.md` (project-specific)
2. Bundled default template (fallback)

### Epic Branch Support
When `parent_epic_branch` is provided:
1. Fetch all remotes first
2. Check if epic branch exists (local or remote)
3. Checkout/create tracking branch if needed
4. Pull latest changes
5. Create new branch from epic
6. Mark `branched_from_epic: true` in result
