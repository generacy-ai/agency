/**
 * File system utilities for spec-kit
 *
 * Provides async file operations with custom error classes for
 * robust error handling in spec-kit operations.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// ============================================================================
// Custom Error Classes
// ============================================================================

/**
 * Options for error construction with cause chaining.
 */
interface FsErrorOptions {
  cause?: unknown;
}

/**
 * Error thrown when a file or directory is not found.
 *
 * @example
 * ```typescript
 * throw new FileNotFoundError('Configuration file not found', '/path/to/config.json');
 * ```
 */
export class FileNotFoundError extends Error {
  override readonly name = 'FileNotFoundError';
  override readonly cause?: unknown;

  constructor(
    message: string,
    public readonly path?: string,
    options?: FsErrorOptions
  ) {
    super(message);
    this.cause = options?.cause;
  }
}

/**
 * Error thrown when file access is denied due to permissions.
 *
 * @example
 * ```typescript
 * throw new PermissionError('Cannot write to read-only file', '/path/to/file');
 * ```
 */
export class PermissionError extends Error {
  override readonly name = 'PermissionError';
  override readonly cause?: unknown;

  constructor(
    message: string,
    public readonly path?: string,
    options?: FsErrorOptions
  ) {
    super(message);
    this.cause = options?.cause;
  }
}

/**
 * Error thrown when no repository root is found.
 *
 * @example
 * ```typescript
 * throw new RepoNotFoundError('No git repository found', '/current/path');
 * ```
 */
export class RepoNotFoundError extends Error {
  override readonly name = 'RepoNotFoundError';
  override readonly cause?: unknown;

  constructor(
    message: string,
    public readonly path?: string,
    options?: FsErrorOptions
  ) {
    super(message);
    this.cause = options?.cause;
  }
}

// ============================================================================
// File System Functions
// ============================================================================

/**
 * Check if a path exists.
 *
 * @param filePath - Path to check
 * @returns True if the path exists, false otherwise
 *
 * @example
 * ```typescript
 * if (await exists('/path/to/file')) {
 *   console.log('File exists');
 * }
 * ```
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory.
 *
 * @param filePath - Path to check
 * @returns True if the path is a directory, false otherwise (including if path doesn't exist)
 *
 * @example
 * ```typescript
 * if (await isDirectory('/path/to/dir')) {
 *   console.log('Path is a directory');
 * }
 * ```
 */
export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a regular file.
 *
 * @param filePath - Path to check
 * @returns True if the path is a file, false otherwise (including if path doesn't exist)
 *
 * @example
 * ```typescript
 * if (await isFile('/path/to/file.txt')) {
 *   console.log('Path is a file');
 * }
 * ```
 */
export async function isFile(filePath: string): Promise<boolean> {
  try {
    const stats = await fs.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Read a file as a UTF-8 string.
 *
 * @param filePath - Path to the file to read
 * @returns File contents as a string
 * @throws {FileNotFoundError} If the file doesn't exist
 * @throws {PermissionError} If access to the file is denied
 *
 * @example
 * ```typescript
 * const content = await readFile('/path/to/file.txt');
 * console.log(content);
 * ```
 */
export async function readFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      throw new FileNotFoundError(`File not found: ${filePath}`, filePath, {
        cause: error,
      });
    }
    if (errno.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${filePath}`, filePath, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Write content to a file, creating parent directories if needed.
 *
 * @param filePath - Path to the file to write
 * @param content - Content to write
 * @throws {PermissionError} If access to the file is denied
 *
 * @example
 * ```typescript
 * await writeFile('/path/to/file.txt', 'Hello, world!');
 * ```
 */
export async function writeFile(
  filePath: string,
  content: string
): Promise<void> {
  try {
    // Ensure parent directory exists
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });

    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${filePath}`, filePath, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Create a directory, optionally with all parent directories.
 *
 * @param dirPath - Path to the directory to create
 * @param recursive - Whether to create parent directories (default: true)
 * @throws {PermissionError} If access is denied
 *
 * @example
 * ```typescript
 * await mkdir('/path/to/new/dir');
 * await mkdir('/path/to/new/dir', false); // Non-recursive
 * ```
 */
export async function mkdir(
  dirPath: string,
  recursive: boolean = true
): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive });
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${dirPath}`, dirPath, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * List the contents of a directory.
 *
 * @param dirPath - Path to the directory to read
 * @returns Array of file and directory names
 * @throws {FileNotFoundError} If the directory doesn't exist
 * @throws {PermissionError} If access is denied
 *
 * @example
 * ```typescript
 * const files = await readDir('/path/to/dir');
 * console.log(files); // ['file1.txt', 'file2.txt', 'subdir']
 * ```
 */
export async function readDir(dirPath: string): Promise<string[]> {
  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    const errno = error as NodeJS.ErrnoException;
    if (errno.code === 'ENOENT') {
      throw new FileNotFoundError(
        `Directory not found: ${dirPath}`,
        dirPath,
        { cause: error }
      );
    }
    if (errno.code === 'EACCES') {
      throw new PermissionError(`Permission denied: ${dirPath}`, dirPath, {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Find the repository root by looking for a .git directory.
 *
 * Traverses up from the start path looking for a .git directory.
 *
 * @param startPath - Path to start searching from (default: process.cwd())
 * @returns Absolute path to the repository root
 * @throws {RepoNotFoundError} If no repository root is found
 *
 * @example
 * ```typescript
 * const repoRoot = await findRepoRoot();
 * console.log(repoRoot); // '/path/to/repo'
 *
 * const otherRepo = await findRepoRoot('/path/to/subdir');
 * ```
 */
export async function findRepoRoot(startPath?: string): Promise<string> {
  let currentPath = path.resolve(startPath ?? process.cwd());
  const root = path.parse(currentPath).root;

  while (currentPath !== root) {
    const gitPath = path.join(currentPath, '.git');
    if (await isDirectory(gitPath)) {
      return currentPath;
    }
    currentPath = path.dirname(currentPath);
  }

  // Check root directory as well
  const rootGitPath = path.join(root, '.git');
  if (await isDirectory(rootGitPath)) {
    return root;
  }

  throw new RepoNotFoundError(
    `No git repository found starting from: ${startPath ?? process.cwd()}`,
    startPath ?? process.cwd()
  );
}
