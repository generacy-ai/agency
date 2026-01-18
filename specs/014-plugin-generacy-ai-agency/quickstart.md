# Quickstart: @generacy-ai/agency-plugin-git

## Installation

```bash
pnpm add @generacy-ai/agency-plugin-git
```

## Configuration

Add to your Agency configuration:

```json
{
  "plugins": {
    "git": {
      "defaultRemote": "origin",
      "signCommits": false,
      "allowForcePush": false
    }
  }
}
```

## Available Tools

### Read-Only Operations

| Tool | Description | Modes |
|------|-------------|-------|
| `source_control.status` | Get working tree status | research, coding, review |
| `source_control.diff` | Show changes between refs | research, coding, review |
| `source_control.log` | View commit history | research, coding, review |
| `source_control.blame` | Show line-by-line authorship | research, coding, review |

### Write Operations

| Tool | Description | Modes |
|------|-------------|-------|
| `source_control.commit` | Create a commit | coding |
| `source_control.push` | Push to remote | coding |
| `source_control.pull` | Pull from remote | coding |
| `source_control.checkout` | Switch branches or restore files | coding |
| `source_control.branch` | Create, list, or delete branches | coding |
| `source_control.stash` | Stash/unstash changes | coding |
| `source_control.merge` | Merge branches | coding |
| `source_control.rebase` | Rebase current branch | coding |

## Usage Examples

### Check Repository Status

```typescript
// Get current status
const result = await source_control.status();
// Returns: { branch: 'main', staged: [...], unstaged: [...] }
```

### Commit Changes

```typescript
// Commit all staged changes
const result = await source_control.commit({
  message: 'feat: Add user authentication'
});
// Returns: { hash: 'abc1234', branch: 'main', filesChanged: 3 }

// Commit specific files
const result = await source_control.commit({
  message: 'fix: Resolve login bug',
  files: ['src/auth.ts', 'src/login.ts']
});
```

### View History

```typescript
// Get recent commits
const result = await source_control.log({ limit: 5 });
// Returns: { commits: [{ hash, subject, author, date }, ...] }

// Get commits for specific file
const result = await source_control.log({
  file: 'src/index.ts',
  limit: 10
});
```

### Branch Operations

```typescript
// List branches
const result = await source_control.branch({ action: 'list' });

// Create new branch
const result = await source_control.branch({
  action: 'create',
  name: 'feature/new-feature'
});

// Delete branch
const result = await source_control.branch({
  action: 'delete',
  name: 'feature/old-feature',
  force: true
});
```

### Handle Merge Conflicts

```typescript
// Attempt merge
const result = await source_control.merge({ branch: 'feature/updates' });

// If conflicts occur, result includes structured conflict info:
// {
//   success: false,
//   conflicts: [{
//     file: 'src/config.ts',
//     type: 'content',
//     ours: '...',
//     theirs: '...'
//   }]
// }
```

### Multi-Repository Support

All tools accept an optional `cwd` parameter:

```typescript
// Work in different repository
const result = await source_control.status({
  cwd: '/path/to/other/repo'
});
```

## Error Handling

The plugin categorizes errors for programmatic handling:

```typescript
try {
  await source_control.push({ force: true });
} catch (error) {
  if (error.type === 'auth') {
    // Authentication failed - check credentials
  } else if (error.type === 'network') {
    // Network issue - retry later
  } else if (error.type === 'conflict') {
    // Conflicts need resolution
    console.log(error.conflicts); // Structured conflict info
  }
}
```

## Force Push Escalation

When `allowForcePush: false` (default), force push attempts trigger human escalation:

1. Agent requests force push
2. Plugin sends escalation to Humancy with `blocking_now` urgency
3. Human approves or rejects
4. Agent receives response and proceeds accordingly

If Humancy is not available, the operation fails with instructions for manual intervention.

## Troubleshooting

### "Git not found"

Ensure git is installed and in PATH:
```bash
git --version
```

### "Authentication failed"

The plugin relies on system git credential helpers. Configure credentials:
```bash
git config --global credential.helper store
# or for macOS
git config --global credential.helper osxkeychain
```

### "Detached HEAD" errors

Some operations require being on a branch. Check out a branch:
```typescript
await source_control.checkout({ ref: 'main' });
```

### Conflict resolution

When conflicts occur, the tool returns structured conflict information. The agent can:
1. Parse the conflict info
2. Determine resolution strategy
3. Edit conflicted files
4. Mark as resolved with `git add`
5. Complete the merge/rebase
