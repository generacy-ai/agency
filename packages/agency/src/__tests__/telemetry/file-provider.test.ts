import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { FileStorageProvider, FileProviderOptionsSchema } from '../../telemetry/providers/file.js';
import type { ToolCallEvent } from '../../telemetry/schemas.js';

describe('FileStorageProvider', () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = join(tmpdir(), `telemetry-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  function createTestEvent(overrides: Partial<ToolCallEvent> = {}): ToolCallEvent {
    return {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      toolName: 'test_tool',
      serverName: 'test_server',
      durationMs: 100,
      success: true,
      ...overrides,
    };
  }

  describe('FileProviderOptionsSchema', () => {
    it('should accept valid options with defaults', () => {
      const result = FileProviderOptionsSchema.parse({});
      expect(result.directory).toBe('.agency/telemetry');
      expect(result.mode).toBe('daily');
      expect(result.maxAgeDays).toBe(30);
      expect(result.compress).toBe(false);
    });

    it('should accept custom options', () => {
      const result = FileProviderOptionsSchema.parse({
        directory: '/custom/path',
        mode: 'daily',
        maxAgeDays: 7,
        compress: true,
      });
      expect(result.directory).toBe('/custom/path');
      expect(result.mode).toBe('daily');
      expect(result.maxAgeDays).toBe(7);
      expect(result.compress).toBe(true);
    });

    it('should require sessionId for session mode', () => {
      expect(() => {
        FileProviderOptionsSchema.parse({ mode: 'session' });
      }).toThrow(/sessionId is required/);
    });

    it('should accept session mode with sessionId', () => {
      const result = FileProviderOptionsSchema.parse({
        mode: 'session',
        sessionId: 'test-session-123',
      });
      expect(result.mode).toBe('session');
      expect(result.sessionId).toBe('test-session-123');
    });

    it('should reject invalid mode', () => {
      expect(() => {
        FileProviderOptionsSchema.parse({ mode: 'invalid' });
      }).toThrow();
    });

    it('should reject negative maxAgeDays', () => {
      expect(() => {
        FileProviderOptionsSchema.parse({ maxAgeDays: -1 });
      }).toThrow();
    });
  });

  describe('daily mode file path generation', () => {
    it('should generate correct daily file path', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });

      const filePath = provider.getCurrentFilePath();
      const today = new Date().toISOString().split('T')[0];

      expect(filePath).toBe(join(testDir, `${today}.jsonl`));
    });

    it('should use YYYY-MM-DD format', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });

      const filePath = provider.getCurrentFilePath();
      const filename = filePath.split('/').pop()!;

      // Check format: YYYY-MM-DD.jsonl
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
    });
  });

  describe('session mode file path generation', () => {
    it('should generate correct session file path', async () => {
      const sessionId = 'my-session-123';
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'session',
        sessionId,
      });

      const filePath = provider.getCurrentFilePath();

      expect(filePath).toBe(join(testDir, 'sessions', `${sessionId}.jsonl`));
    });

    it('should include sessions subdirectory', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'session',
        sessionId: 'test-session',
      });

      const filePath = provider.getCurrentFilePath();

      expect(filePath).toContain('/sessions/');
    });
  });

  describe('record() and query() integration', () => {
    it('should record and query events round-trip', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      const event1 = createTestEvent({ toolName: 'tool_a' });
      const event2 = createTestEvent({ toolName: 'tool_b' });

      await provider.record(event1);
      await provider.record(event2);

      const results = await provider.query({});

      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ id: event1.id, toolName: 'tool_a' });
      expect(results[1]).toMatchObject({ id: event2.id, toolName: 'tool_b' });
    });

    it('should filter events by toolName', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      await provider.record(createTestEvent({ toolName: 'tool_a' }));
      await provider.record(createTestEvent({ toolName: 'tool_b' }));
      await provider.record(createTestEvent({ toolName: 'tool_a' }));

      const results = await provider.query({ toolName: 'tool_a' });

      expect(results).toHaveLength(2);
      expect(results.every((e) => e.toolName === 'tool_a')).toBe(true);
    });

    it('should filter events by success status', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      await provider.record(createTestEvent({ success: true }));
      await provider.record(createTestEvent({ success: false }));
      await provider.record(createTestEvent({ success: true }));

      const results = await provider.query({ success: false });

      expect(results).toHaveLength(1);
      expect(results[0]!.success).toBe(false);
    });

    it('should apply pagination with limit and offset', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      for (let i = 0; i < 10; i++) {
        await provider.record(createTestEvent({ toolName: `tool_${i}` }));
      }

      const results = await provider.query({ limit: 3, offset: 2 });

      expect(results).toHaveLength(3);
      expect(results[0]!.toolName).toBe('tool_2');
      expect(results[2]!.toolName).toBe('tool_4');
    });
  });

  describe('corrupted JSONL line handling', () => {
    it('should skip corrupted lines and continue', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      // Write valid event
      const validEvent = createTestEvent({ toolName: 'valid_tool' });
      await provider.record(validEvent);

      // Manually write corrupted line to the file
      const filePath = provider.getCurrentFilePath();
      const fileContent = await readFile(filePath, 'utf8');
      const corruptedContent = fileContent + 'this is not valid json\n' + JSON.stringify(createTestEvent({ toolName: 'another_valid' })) + '\n';
      await writeFile(filePath, corruptedContent, 'utf8');

      // Query should return both valid events, skipping corrupted line
      const results = await provider.query({});

      expect(results).toHaveLength(2);
      expect(results[0]!.toolName).toBe('valid_tool');
      expect(results[1]!.toolName).toBe('another_valid');
    });
  });

  describe('rotateOldLogs() deletion', () => {
    it('should delete files older than maxAgeDays', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
        maxAgeDays: 7,
        compress: false,
      });
      await provider.initialize();

      // Create old files manually
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const oldFilename = oldDate.toISOString().split('T')[0] + '.jsonl';
      const oldFilePath = join(testDir, oldFilename);
      await writeFile(oldFilePath, JSON.stringify(createTestEvent()) + '\n');

      // Create recent file
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 3);
      const recentFilename = recentDate.toISOString().split('T')[0] + '.jsonl';
      const recentFilePath = join(testDir, recentFilename);
      await writeFile(recentFilePath, JSON.stringify(createTestEvent()) + '\n');

      const result = await provider.rotateOldLogs(7);

      expect(result.deletedCount).toBe(1);
      expect(result.deletedFiles).toContain(oldFilePath);
      expect(result.compressedCount).toBe(0);

      // Verify recent file still exists
      const remainingFiles = await provider.getLogFiles();
      expect(remainingFiles).toContain(recentFilePath);
      expect(remainingFiles).not.toContain(oldFilePath);
    });
  });

  describe('rotateOldLogs() compression', () => {
    it('should compress old files when compress option is enabled', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
        maxAgeDays: 7,
        compress: true,
      });
      await provider.initialize();

      // Create old file manually
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10);
      const oldFilename = oldDate.toISOString().split('T')[0] + '.jsonl';
      const oldFilePath = join(testDir, oldFilename);
      await writeFile(oldFilePath, JSON.stringify(createTestEvent()) + '\n');

      const result = await provider.rotateOldLogs(7);

      expect(result.compressedCount).toBe(1);
      expect(result.compressedFiles[0]).toBe(oldFilePath + '.gz');
      expect(result.deletedCount).toBe(0);
    });
  });

  describe('best-effort error handling', () => {
    it('should not throw on write failure', async () => {
      const provider = new FileStorageProvider({
        directory: '/nonexistent/path/that/should/fail',
        mode: 'daily',
      });
      // Don't initialize - directory won't exist

      const event = createTestEvent();

      // Should not throw, just log warning
      await expect(provider.record(event)).resolves.toBeUndefined();
    });
  });

  describe('initialize()', () => {
    it('should create directory in daily mode', async () => {
      const subDir = join(testDir, 'daily-subdir');
      const provider = new FileStorageProvider({
        directory: subDir,
        mode: 'daily',
      });

      await provider.initialize();

      expect(provider.isInitialized()).toBe(true);
    });

    it('should create sessions subdirectory in session mode', async () => {
      const subDir = join(testDir, 'session-subdir');
      const provider = new FileStorageProvider({
        directory: subDir,
        mode: 'session',
        sessionId: 'test-session',
      });

      await provider.initialize();

      // Should be able to write to session file
      await provider.record(createTestEvent());
      const files = await provider.getLogFiles();

      expect(files.length).toBeGreaterThan(0);
      expect(files[0]).toContain('sessions');
    });
  });

  describe('getLogFiles()', () => {
    it('should return all jsonl files', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      // Create multiple files
      await writeFile(join(testDir, '2025-01-15.jsonl'), '{}');
      await writeFile(join(testDir, '2025-01-16.jsonl'), '{}');
      await writeFile(join(testDir, 'not-a-log.txt'), 'text');

      const files = await provider.getLogFiles();

      expect(files).toHaveLength(2);
      expect(files.every((f) => f.endsWith('.jsonl'))).toBe(true);
    });

    it('should include session files', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'session',
        sessionId: 'test-session',
      });
      await provider.initialize();

      await provider.record(createTestEvent());

      const files = await provider.getLogFiles();

      expect(files.length).toBeGreaterThan(0);
      expect(files.some((f) => f.includes('sessions'))).toBe(true);
    });

    it('should return empty array for non-existent directory', async () => {
      const provider = new FileStorageProvider({
        directory: '/nonexistent/path',
        mode: 'daily',
      });

      const files = await provider.getLogFiles();

      expect(files).toEqual([]);
    });
  });

  describe('shutdown()', () => {
    it('should mark provider as not initialized', async () => {
      const provider = new FileStorageProvider({
        directory: testDir,
        mode: 'daily',
      });
      await provider.initialize();

      expect(provider.isInitialized()).toBe(true);

      await provider.shutdown();

      expect(provider.isInitialized()).toBe(false);
    });
  });
});
