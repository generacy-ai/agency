import { z } from 'zod';
import { mkdir, appendFile, readdir, stat, unlink } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { join, basename } from 'node:path';
import { createInterface } from 'node:readline';
import type { TelemetryStorageProvider } from '../types.js';
import type { ToolCallEvent, TelemetryFilter } from '../schemas.js';

/**
 * Configuration options for the file storage provider.
 */
export const FileProviderOptionsSchema = z.object({
  /** Output directory for log files (default: ".agency/telemetry") */
  directory: z.string().default('.agency/telemetry'),

  /** File rotation mode (default: "daily") */
  mode: z.enum(['daily', 'session']).default('daily'),

  /** Session ID for session mode (required if mode is "session") */
  sessionId: z.string().optional(),

  /** Auto-cleanup threshold in days (default: 30) */
  maxAgeDays: z.number().int().positive().default(30),

  /** Enable gzip compression during rotation (default: false) */
  compress: z.boolean().default(false),
}).refine(
  (data) => data.mode !== 'session' || data.sessionId !== undefined,
  { message: 'sessionId is required when mode is "session"' }
);

export type FileProviderOptions = z.infer<typeof FileProviderOptionsSchema>;

/**
 * Result from log rotation operation.
 */
export const RotationResultSchema = z.object({
  /** Number of files deleted */
  deletedCount: z.number().int().nonnegative(),

  /** Number of files compressed */
  compressedCount: z.number().int().nonnegative(),

  /** Paths of deleted files */
  deletedFiles: z.array(z.string()),

  /** Paths of compressed files (new .gz paths) */
  compressedFiles: z.array(z.string()),

  /** Total bytes reclaimed */
  bytesReclaimed: z.number().int().nonnegative(),
});

export type RotationResult = z.infer<typeof RotationResultSchema>;

/**
 * File-based telemetry storage provider.
 * Persists telemetry events to JSONL files with support for daily rotation
 * or per-session file modes. Includes configurable cleanup and optional compression.
 */
export class FileStorageProvider implements TelemetryStorageProvider {
  readonly name = 'file';

  private readonly options: Required<Omit<FileProviderOptions, 'sessionId'>> & { sessionId?: string };
  private initialized = false;

  /**
   * Create a new file storage provider.
   * @param options Configuration options
   * @throws {z.ZodError} If options are invalid
   */
  constructor(options: Partial<FileProviderOptions> = {}) {
    const parsed = FileProviderOptionsSchema.parse(options);
    this.options = parsed;
  }

  /**
   * Initialize the provider by creating the directory structure.
   * For daily mode: creates the main directory.
   * For session mode: creates the main directory and sessions/ subdirectory.
   */
  async initialize(): Promise<void> {
    await mkdir(this.options.directory, { recursive: true });

    if (this.options.mode === 'session') {
      await mkdir(join(this.options.directory, 'sessions'), { recursive: true });
    }

    this.initialized = true;
  }

  /**
   * Shutdown the provider gracefully.
   * Currently a no-op placeholder for future handle cleanup.
   */
  async shutdown(): Promise<void> {
    this.initialized = false;
  }

  /**
   * Record a telemetry event by appending to the current JSONL file.
   * Uses best-effort error handling: logs warnings on failure but does not throw.
   * @param event The telemetry event to record
   */
  async record(event: ToolCallEvent): Promise<void> {
    try {
      const filePath = this.getCurrentFilePath();
      const line = JSON.stringify(event) + '\n';
      await appendFile(filePath, line, 'utf8');
    } catch (error) {
      // Best-effort telemetry: log warning but don't throw
      console.warn('[telemetry] Failed to write event:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Query stored events by scanning relevant files.
   * @param filter Filter criteria for events
   * @returns Array of matching events
   */
  async query(filter: TelemetryFilter = {}): Promise<ToolCallEvent[]> {
    const files = await this.getRelevantFiles(filter.startTime, filter.endTime);
    const results: ToolCallEvent[] = [];

    for (const file of files) {
      for await (const event of this.readJsonlFile(file)) {
        if (this.matchesFilter(event, filter)) {
          results.push(event);
        }
      }
    }

    // Apply pagination
    const offset = filter.offset ?? 0;
    const limit = filter.limit;

    if (limit !== undefined) {
      return results.slice(offset, offset + limit);
    } else if (offset > 0) {
      return results.slice(offset);
    }

    return results;
  }

  /**
   * Get list of all log files in the directory.
   * @returns Array of file paths
   */
  async getLogFiles(): Promise<string[]> {
    try {
      const entries = await readdir(this.options.directory, { withFileTypes: true });
      const files: string[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          files.push(join(this.options.directory, entry.name));
        }
      }

      // Also check sessions directory if it exists
      try {
        const sessionsDir = join(this.options.directory, 'sessions');
        const sessionEntries = await readdir(sessionsDir, { withFileTypes: true });

        for (const entry of sessionEntries) {
          if (entry.isFile() && entry.name.endsWith('.jsonl')) {
            files.push(join(sessionsDir, entry.name));
          }
        }
      } catch {
        // Sessions directory doesn't exist, ignore
      }

      return files.sort();
    } catch {
      // Directory doesn't exist
      return [];
    }
  }

  /**
   * Rotate and optionally compress old log files.
   * @param maxAgeDays Days threshold for deletion (uses config if not provided)
   * @returns Result object with processed file details
   */
  async rotateOldLogs(maxAgeDays?: number): Promise<RotationResult> {
    const threshold = maxAgeDays ?? this.options.maxAgeDays;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - threshold);

    const result: RotationResult = {
      deletedCount: 0,
      compressedCount: 0,
      deletedFiles: [],
      compressedFiles: [],
      bytesReclaimed: 0,
    };

    const files = await this.getLogFiles();

    for (const file of files) {
      const fileDate = this.extractDateFromFilename(basename(file));
      if (!fileDate || fileDate >= cutoffDate) {
        continue;
      }

      const fileStat = await stat(file);

      if (this.options.compress && !file.endsWith('.gz')) {
        // Compress the file
        const compressedPath = await this.compressFile(file);
        result.compressedCount++;
        result.compressedFiles.push(compressedPath);
        result.bytesReclaimed += fileStat.size;
      } else {
        // Delete the file
        await unlink(file);
        result.deletedCount++;
        result.deletedFiles.push(file);
        result.bytesReclaimed += fileStat.size;
      }
    }

    return result;
  }

  /**
   * Get the current file path based on mode.
   * Daily mode: {directory}/YYYY-MM-DD.jsonl
   * Session mode: {directory}/sessions/{sessionId}.jsonl
   */
  getCurrentFilePath(): string {
    if (this.options.mode === 'session') {
      return join(this.options.directory, 'sessions', `${this.options.sessionId}.jsonl`);
    }

    // Daily mode: use current date
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
    return join(this.options.directory, `${dateStr}.jsonl`);
  }

  /**
   * Check if the provider has been initialized.
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Async generator that reads a JSONL file line by line.
   * Skips corrupted lines and logs warnings.
   * @param filePath Path to the JSONL file
   */
  private async *readJsonlFile(filePath: string): AsyncGenerator<ToolCallEvent> {
    const fileStream = createReadStream(filePath, { encoding: 'utf8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber++;
      if (!line.trim()) continue;

      try {
        const event = JSON.parse(line) as ToolCallEvent;
        yield event;
      } catch {
        // Skip corrupted lines and log warning
        console.warn(`[telemetry] Skipping corrupted line ${lineNumber} in ${filePath}`);
      }
    }
  }

  /**
   * Extract date from a daily log filename.
   * @param filename Filename like "2025-01-16.jsonl"
   * @returns Date object or null if not parseable
   */
  private extractDateFromFilename(filename: string): Date | null {
    // Match YYYY-MM-DD pattern
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.jsonl(\.gz)?$/);
    if (!match) return null;

    const date = new Date(match[1]!);
    return isNaN(date.getTime()) ? null : date;
  }

  /**
   * Get files relevant to a date range query.
   * For daily mode, filters files by their date in the filename.
   * @param startTime ISO timestamp for range start
   * @param endTime ISO timestamp for range end
   */
  private async getRelevantFiles(startTime?: string, endTime?: string): Promise<string[]> {
    const files = await this.getLogFiles();

    if (this.options.mode === 'session') {
      // Session mode: return all session files (no date filtering possible)
      return files.filter((f) => f.includes('/sessions/'));
    }

    // Daily mode: filter by date range
    const startDate = startTime ? new Date(startTime) : null;
    const endDate = endTime ? new Date(endTime) : null;

    return files.filter((file) => {
      const filename = basename(file);
      const fileDate = this.extractDateFromFilename(filename);

      if (!fileDate) return false;

      // Set fileDate to start of day for comparison
      fileDate.setHours(0, 0, 0, 0);

      if (startDate) {
        const startDay = new Date(startDate);
        startDay.setHours(0, 0, 0, 0);
        if (fileDate < startDay) return false;
      }

      if (endDate) {
        const endDay = new Date(endDate);
        endDay.setHours(23, 59, 59, 999);
        if (fileDate > endDay) return false;
      }

      return true;
    });
  }

  /**
   * Compress a file using gzip.
   * @param filePath Path to the file to compress
   * @returns Path to the compressed file
   */
  private async compressFile(filePath: string): Promise<string> {
    const compressedPath = `${filePath}.gz`;
    const source = createReadStream(filePath);
    const destination = createWriteStream(compressedPath);
    const gzip = createGzip();

    await pipeline(source, gzip, destination);
    await unlink(filePath); // Remove original after compression

    return compressedPath;
  }

  /**
   * Check if an event matches the given filter criteria.
   */
  private matchesFilter(event: ToolCallEvent, filter: TelemetryFilter): boolean {
    if (filter.toolName !== undefined && event.toolName !== filter.toolName) {
      return false;
    }

    if (filter.serverName !== undefined && event.serverName !== filter.serverName) {
      return false;
    }

    if (filter.sessionId !== undefined && event.sessionId !== filter.sessionId) {
      return false;
    }

    if (filter.success !== undefined && event.success !== filter.success) {
      return false;
    }

    if (filter.startTime !== undefined) {
      const startDate = new Date(filter.startTime);
      if (new Date(event.timestamp) < startDate) return false;
    }

    if (filter.endTime !== undefined) {
      const endDate = new Date(filter.endTime);
      if (new Date(event.timestamp) > endDate) return false;
    }

    return true;
  }
}
