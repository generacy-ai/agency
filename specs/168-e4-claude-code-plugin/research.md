# Research: E4: Claude Code plugin: specify command

## Technology Decisions

### 1. Git Operations Library: simple-git

**Decision**: Use `simple-git` npm package

**Rationale**:
- Already used in `git-ops.ts` for branch operations
- Provides promise-based API
- Handles edge cases well (detached HEAD, dirty state)
- No additional dependency needed

**Alternatives Considered**:
- Raw `child_process.exec` - Lower level, more error handling needed
- isomorphic-git - Overkill for simple operations

### 2. Feature Number Generation Strategy

**Decision**: Scan existing branch names and directories, find max number, increment

**Implementation**:
```typescript
// Scan for existing features
const branches = await git.branch();
const existingNumbers = branches.all
  .map(b => b.match(/^(\d{3})-/)?.[1])
  .filter(Boolean)
  .map(Number);

const specDirs = await fs.readdir(specsPath);
const dirNumbers = specDirs
  .map(d => d.match(/^(\d{3})-/)?.[1])
  .filter(Boolean)
  .map(Number);

const maxNumber = Math.max(0, ...existingNumbers, ...dirNumbers);
const nextNumber = maxNumber + 1;
```

**Edge Cases**:
- Empty repo (no branches/dirs): Start at 001
- Gaps in numbers: Use next after max (don't fill gaps)
- Number > 999: Return error (3-digit limit)

### 3. Short Name Generation Algorithm

**Decision**: Simple word extraction with stop-word removal

**Implementation**:
```typescript
function generateShortName(description: string): string {
  const stopWords = new Set(['a', 'an', 'the', 'is', 'are', 'for', 'to', 'and', 'or', 'with']);

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')  // Remove special chars
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w))
    .slice(0, 4);  // Max 4 words

  return words.join('-') || 'feature';
}
```

**Examples**:
- "Add user authentication" → "add-user-authentication"
- "Fix the login bug for admin users" → "fix-login-bug-admin"
- "E4: Claude Code plugin: specify command" → "e4-claude-code-plugin"

### 4. Template Initialization Approach

**Decision**: Use spec-template.md from templates directory, same as copy_template tool

**Location**: `{repoRoot}/{config.paths.templates}/spec-template.md`

**Template Variables** (to replace):
- `{feature_name}` → Feature description (first line or truncated)
- `{branch_name}` → Generated branch name
- `{date}` → Current date (YYYY-MM-DD)

## Implementation Patterns

### Pattern: Tool Result Structure

Following established pattern from other tools:

```typescript
// Success result
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      success: true,
      // ... result fields
    })
  }]
};

// Error result
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      success: false,
      error: createError('ERROR_CODE', 'Human readable message')
    })
  }]
};
```

### Pattern: Directory Creation

Using Node.js fs.mkdir with recursive option:

```typescript
import { mkdir } from 'node:fs/promises';

await mkdir(featureDir, { recursive: true });
await mkdir(join(featureDir, 'checklists'), { recursive: true });
await mkdir(join(featureDir, 'contracts'), { recursive: true });
```

### Pattern: Git Branch Validation

Branches should not contain special characters:

```typescript
function isValidBranchName(name: string): boolean {
  // Git branch naming rules (simplified)
  return /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(name);
}
```

## References

- `git-ops.ts`: Git operation patterns (L99-L109 for executeCurrentBranch)
- `copy-template.ts`: Template handling patterns (L130-L166 for path resolution)
- `get-paths.ts`: Feature directory path conventions
- Agency plugin docs: Tool registration and result formatting
