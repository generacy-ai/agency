# Quickstart: File System Utilities

## Installation

The fs utilities are part of `@generacy-ai/agency-plugin-spec-kit`. Once implemented, they're available via:

```typescript
import {
  findRepoRoot,
  readFile,
  writeFile,
  exists,
  isDirectory,
  isFile,
  mkdir,
  readDir,
  FileNotFoundError,
  PermissionError,
  RepoNotFoundError,
} from '@generacy-ai/agency-plugin-spec-kit';
```

## Usage Examples

### Find Repository Root

```typescript
import { findRepoRoot, RepoNotFoundError } from '@generacy-ai/agency-plugin-spec-kit';

try {
  const root = await findRepoRoot();
  console.log(`Repository root: ${root}`);
} catch (error) {
  if (error instanceof RepoNotFoundError) {
    console.error('Not inside a git repository');
  }
}
```

### Read and Write Files

```typescript
import { readFile, writeFile, FileNotFoundError } from '@generacy-ai/agency-plugin-spec-kit';

// Read file
try {
  const content = await readFile('/path/to/file.txt');
  console.log(content);
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.error(`File not found: ${error.path}`);
  }
}

// Write file (creates parent directories automatically)
await writeFile('/path/to/new/file.txt', 'Hello, World!');
```

### Check Path Existence

```typescript
import { exists, isDirectory, isFile } from '@generacy-ai/agency-plugin-spec-kit';

if (await exists('/path/to/something')) {
  if (await isDirectory('/path/to/something')) {
    console.log('It is a directory');
  } else if (await isFile('/path/to/something')) {
    console.log('It is a file');
  }
}
```

### Directory Operations

```typescript
import { mkdir, readDir } from '@generacy-ai/agency-plugin-spec-kit';

// Create nested directories
await mkdir('/path/to/new/directory');

// List directory contents
const files = await readDir('/path/to/directory');
console.log('Files:', files);
```

## Error Handling

All error classes include:
- `name` - Error type name
- `message` - Human-readable description
- `path` or `startPath` - The path that caused the error
- `cause` - Original error (if wrapping another error)

```typescript
try {
  const content = await readFile('/nonexistent/file.txt');
} catch (error) {
  if (error instanceof FileNotFoundError) {
    console.error(`Path: ${error.path}`);
    console.error(`Message: ${error.message}`);
    if (error.cause) {
      console.error(`Original error:`, error.cause);
    }
  }
}
```

## Troubleshooting

### "RepoNotFoundError: No repository root found"

The `findRepoRoot()` function looks for a `.git/` directory by traversing up from the starting path. If you're not inside a git repository, this error will be thrown.

**Solutions**:
1. Ensure you're inside a git repository
2. Pass an explicit starting path: `findRepoRoot('/path/to/repo')`
3. Catch the error and handle the no-repo case

### "PermissionError: Permission denied"

File system permissions prevent the operation.

**Solutions**:
1. Check file/directory permissions with `ls -la`
2. Ensure the process has appropriate access rights
3. Run with elevated permissions if necessary
