# Data Model: File System Utilities

## Error Classes

### FileNotFoundError

Thrown when a file operation targets a non-existent path.

```typescript
export class FileNotFoundError extends Error {
  /** Error name for instanceof checks */
  name: 'FileNotFoundError';

  /** The path that was not found */
  path?: string;

  constructor(message: string, path?: string, options?: ErrorOptions);
}
```

**Usage**:
```typescript
throw new FileNotFoundError(`File not found: ${path}`, path);
```

### PermissionError

Thrown when file access is denied due to permissions.

```typescript
export class PermissionError extends Error {
  /** Error name for instanceof checks */
  name: 'PermissionError';

  /** The path with permission issues */
  path?: string;

  constructor(message: string, path?: string, options?: ErrorOptions);
}
```

**Usage**:
```typescript
throw new PermissionError(`Permission denied: ${path}`, path);
```

### RepoNotFoundError

Thrown when `findRepoRoot()` cannot locate a repository root.

```typescript
export class RepoNotFoundError extends Error {
  /** Error name for instanceof checks */
  name: 'RepoNotFoundError';

  /** The starting path where search began */
  startPath?: string;

  constructor(message: string, startPath?: string, options?: ErrorOptions);
}
```

**Usage**:
```typescript
throw new RepoNotFoundError('No repository root found', startPath);
```

## Function Signatures

```typescript
// Existence checks
export async function exists(path: string): Promise<boolean>;
export async function isDirectory(path: string): Promise<boolean>;
export async function isFile(path: string): Promise<boolean>;

// File operations
export async function readFile(path: string): Promise<string>;
export async function writeFile(path: string, content: string): Promise<void>;

// Directory operations
export async function mkdir(path: string, recursive?: boolean): Promise<void>;
export async function readDir(path: string): Promise<string[]>;

// Repository detection
export async function findRepoRoot(startPath?: string): Promise<string>;
```

## Error Conditions

| Function | Error Type | Condition |
|----------|------------|-----------|
| `readFile` | `FileNotFoundError` | File doesn't exist |
| `readFile` | `PermissionError` | Read access denied |
| `writeFile` | `PermissionError` | Write access denied |
| `mkdir` | `PermissionError` | Cannot create directory |
| `readDir` | `FileNotFoundError` | Directory doesn't exist |
| `findRepoRoot` | `RepoNotFoundError` | No `.git/` found in path hierarchy |

## Type Exports

All types and functions should be exported from `src/utils/index.ts`:

```typescript
export {
  // Error classes
  FileNotFoundError,
  PermissionError,
  RepoNotFoundError,

  // Functions
  exists,
  isDirectory,
  isFile,
  readFile,
  writeFile,
  mkdir,
  readDir,
  findRepoRoot,
} from './fs.js';
```
