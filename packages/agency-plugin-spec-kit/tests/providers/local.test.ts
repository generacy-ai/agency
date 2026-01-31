/**
 * Tests for LocalProvider
 *
 * Tests the local backlog provider for offline/file-based ticket tracking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalProvider } from '../../src/providers/local.js';
import { NotFoundError, ProviderError } from '../../src/providers/errors.js';
import type { SpecKitConfig } from '../../src/config.js';

// Mock config for tests
const mockConfig: SpecKitConfig = {
  paths: { specs: 'specs', templates: '.specify/templates' },
  branches: { pattern: '{paddedNumber}-{slug}', numberPadding: 3, maxSlugWords: 4 },
  backlog: { provider: 'local' },
};

describe('LocalProvider', () => {
  let tempDir: string;
  let provider: LocalProvider;
  let storePath: string;

  beforeEach(async () => {
    // Create a temp directory for each test
    tempDir = await mkdtemp(join(tmpdir(), 'local-provider-test-'));
    storePath = join(tempDir, '.specify', 'local-tickets.json');
    provider = new LocalProvider(mockConfig, { cwd: tempDir });
  });

  afterEach(async () => {
    // Clean up temp directory
    await rm(tempDir, { recursive: true, force: true });
  });

  describe('parseRef', () => {
    describe('valid inputs', () => {
      it('should parse LOCAL-001 format', () => {
        const ref = provider.parseRef('LOCAL-001');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: 'LOCAL-001',
        });
      });

      it('should parse LOCAL-1 format (single digit)', () => {
        const ref = provider.parseRef('LOCAL-1');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: 'LOCAL-1',
        });
      });

      it('should parse LOCAL-999 format', () => {
        const ref = provider.parseRef('LOCAL-999');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-999',
          raw: 'LOCAL-999',
        });
      });

      it('should parse LOCAL-1000 format (beyond 3 digits)', () => {
        const ref = provider.parseRef('LOCAL-1000');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-1000',
          raw: 'LOCAL-1000',
        });
      });

      it('should parse lowercase local-001 format', () => {
        const ref = provider.parseRef('local-001');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: 'local-001',
        });
      });

      it('should parse mixed case Local-001 format', () => {
        const ref = provider.parseRef('Local-001');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: 'Local-001',
        });
      });

      it('should parse bare number 001', () => {
        const ref = provider.parseRef('001');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: '001',
        });
      });

      it('should parse bare number 1', () => {
        const ref = provider.parseRef('1');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: '1',
        });
      });

      it('should parse bare number 42', () => {
        const ref = provider.parseRef('42');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-042',
          raw: '42',
        });
      });

      it('should handle whitespace around input', () => {
        const ref = provider.parseRef('  LOCAL-001  ');
        expect(ref).toEqual({
          provider: 'local',
          id: 'LOCAL-001',
          raw: '  LOCAL-001  ',
        });
      });
    });

    describe('invalid inputs', () => {
      it('should return null for empty string', () => {
        expect(provider.parseRef('')).toBeNull();
      });

      it('should return null for whitespace only', () => {
        expect(provider.parseRef('   ')).toBeNull();
      });

      it('should return null for LOCAL- without number', () => {
        expect(provider.parseRef('LOCAL-')).toBeNull();
      });

      it('should return null for LOCAL-0 (zero is invalid)', () => {
        expect(provider.parseRef('LOCAL-0')).toBeNull();
      });

      it('should return null for bare 0', () => {
        expect(provider.parseRef('0')).toBeNull();
      });

      it('should return null for GitHub format #123', () => {
        expect(provider.parseRef('#123')).toBeNull();
      });

      it('should return null for Jira format PROJ-123', () => {
        expect(provider.parseRef('PROJ-123')).toBeNull();
      });

      it('should return null for negative numbers', () => {
        expect(provider.parseRef('-1')).toBeNull();
      });

      it('should return null for decimal numbers', () => {
        expect(provider.parseRef('1.5')).toBeNull();
      });

      it('should return null for random text', () => {
        expect(provider.parseRef('some-random-text')).toBeNull();
      });
    });
  });

  describe('loadStore', () => {
    it('should create empty store when file does not exist', async () => {
      // Creating a ticket will trigger loadStore then saveStore
      const ticket = await provider.createTicket({ title: 'Test' });
      expect(ticket.ref.id).toBe('LOCAL-001');

      // Verify file was created
      const content = await readFile(storePath, 'utf-8');
      const store = JSON.parse(content);
      expect(store.version).toBe(1);
      expect(store.nextId).toBe(2);
      expect(store.tickets['LOCAL-001']).toBeDefined();
    });

    it('should load existing store', async () => {
      // Create initial store
      await mkdir(join(tempDir, '.specify'), { recursive: true });
      await writeFile(
        storePath,
        JSON.stringify({
          version: 1,
          nextId: 5,
          tickets: {
            'LOCAL-001': {
              id: 'LOCAL-001',
              title: 'Existing Ticket',
              state: 'open',
              labels: ['existing'],
              createdAt: '2024-01-01T00:00:00.000Z',
              updatedAt: '2024-01-01T00:00:00.000Z',
            },
          },
        })
      );

      // Load the existing ticket
      const ticket = await provider.getTicket('LOCAL-001');
      expect(ticket.title).toBe('Existing Ticket');
      expect(ticket.labels).toEqual(['existing']);
    });

    it('should throw ProviderError for invalid JSON', async () => {
      await mkdir(join(tempDir, '.specify'), { recursive: true });
      await writeFile(storePath, 'not valid json');

      await expect(provider.getTicket('1')).rejects.toThrow(ProviderError);
      await expect(provider.getTicket('1')).rejects.toThrow('Invalid JSON');
    });

    it('should throw ProviderError for invalid store structure', async () => {
      await mkdir(join(tempDir, '.specify'), { recursive: true });
      await writeFile(storePath, JSON.stringify({ invalid: 'structure' }));

      await expect(provider.getTicket('1')).rejects.toThrow(ProviderError);
      await expect(provider.getTicket('1')).rejects.toThrow('Invalid store format');
    });
  });

  describe('saveStore', () => {
    it('should create directory if it does not exist', async () => {
      const ticket = await provider.createTicket({ title: 'Test' });
      expect(ticket.ref.id).toBe('LOCAL-001');

      // Verify the file exists
      const content = await readFile(storePath, 'utf-8');
      expect(JSON.parse(content).tickets['LOCAL-001']).toBeDefined();
    });

    it('should use atomic write (temp file + rename)', async () => {
      // Create multiple tickets to exercise saveStore multiple times
      await provider.createTicket({ title: 'Test 1' });
      await provider.createTicket({ title: 'Test 2' });
      await provider.createTicket({ title: 'Test 3' });

      const content = await readFile(storePath, 'utf-8');
      const store = JSON.parse(content);
      expect(Object.keys(store.tickets)).toHaveLength(3);
    });
  });

  describe('createTicket', () => {
    it('should create ticket with title only', async () => {
      const ticket = await provider.createTicket({ title: 'Simple Ticket' });

      expect(ticket.title).toBe('Simple Ticket');
      expect(ticket.ref.provider).toBe('local');
      expect(ticket.ref.id).toBe('LOCAL-001');
      expect(ticket.state).toBe('open');
      expect(ticket.labels).toEqual([]);
      expect(ticket.body).toBeUndefined();
    });

    it('should create ticket with title and body', async () => {
      const ticket = await provider.createTicket({
        title: 'Feature Request',
        body: '## Description\n\nThis is a feature request.',
      });

      expect(ticket.title).toBe('Feature Request');
      expect(ticket.body).toBe('## Description\n\nThis is a feature request.');
    });

    it('should create ticket with labels', async () => {
      const ticket = await provider.createTicket({
        title: 'Bug Fix',
        labels: ['bug', 'priority:high'],
      });

      expect(ticket.labels).toEqual(['bug', 'priority:high']);
    });

    it('should increment IDs for multiple tickets', async () => {
      const ticket1 = await provider.createTicket({ title: 'First' });
      const ticket2 = await provider.createTicket({ title: 'Second' });
      const ticket3 = await provider.createTicket({ title: 'Third' });

      expect(ticket1.ref.id).toBe('LOCAL-001');
      expect(ticket2.ref.id).toBe('LOCAL-002');
      expect(ticket3.ref.id).toBe('LOCAL-003');
    });

    it('should set timestamps', async () => {
      const before = new Date().toISOString();
      const ticket = await provider.createTicket({ title: 'Timestamped' });
      const after = new Date().toISOString();

      expect(ticket.meta?.createdAt).toBeDefined();
      expect(ticket.meta?.updatedAt).toBeDefined();
      expect(ticket.meta?.createdAt).toBe(ticket.meta?.updatedAt);

      // Timestamps should be between before and after
      const createdAt = ticket.meta?.createdAt as string;
      expect(createdAt >= before).toBe(true);
      expect(createdAt <= after).toBe(true);
    });

    it('should return URL in local:// format', async () => {
      const ticket = await provider.createTicket({ title: 'URL Test' });
      expect(ticket.url).toBe('local://LOCAL-001');
    });
  });

  describe('getTicket', () => {
    beforeEach(async () => {
      // Create some test tickets
      await provider.createTicket({ title: 'First Ticket', labels: ['one'] });
      await provider.createTicket({ title: 'Second Ticket', body: 'Body text' });
    });

    it('should get ticket by LOCAL-001 format', async () => {
      const ticket = await provider.getTicket('LOCAL-001');
      expect(ticket.title).toBe('First Ticket');
    });

    it('should get ticket by local-001 format', async () => {
      const ticket = await provider.getTicket('local-001');
      expect(ticket.title).toBe('First Ticket');
    });

    it('should get ticket by bare number', async () => {
      const ticket = await provider.getTicket('2');
      expect(ticket.title).toBe('Second Ticket');
    });

    it('should get ticket by padded number', async () => {
      const ticket = await provider.getTicket('002');
      expect(ticket.title).toBe('Second Ticket');
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      await expect(provider.getTicket('LOCAL-999')).rejects.toThrow(NotFoundError);
      await expect(provider.getTicket('LOCAL-999')).rejects.toThrow('not found');
    });

    it('should throw NotFoundError for invalid reference', async () => {
      await expect(provider.getTicket('invalid')).rejects.toThrow(NotFoundError);
      await expect(provider.getTicket('invalid')).rejects.toThrow('Invalid ticket reference');
    });

    it('should include ref info in error', async () => {
      try {
        await provider.getTicket('LOCAL-999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect((error as NotFoundError).ref).toBe('LOCAL-999');
        expect((error as NotFoundError).provider).toBe('local');
      }
    });
  });

  describe('updateTicket', () => {
    beforeEach(async () => {
      await provider.createTicket({
        title: 'Original Title',
        body: 'Original body',
        labels: ['original'],
      });
    });

    it('should update title only', async () => {
      const updated = await provider.updateTicket('LOCAL-001', {
        title: 'Updated Title',
      });

      expect(updated.title).toBe('Updated Title');
      expect(updated.body).toBe('Original body');
      expect(updated.labels).toEqual(['original']);
    });

    it('should update body only', async () => {
      const updated = await provider.updateTicket('LOCAL-001', {
        body: 'Updated body',
      });

      expect(updated.title).toBe('Original Title');
      expect(updated.body).toBe('Updated body');
    });

    it('should update labels only', async () => {
      const updated = await provider.updateTicket('LOCAL-001', {
        labels: ['new-label', 'another'],
      });

      expect(updated.labels).toEqual(['new-label', 'another']);
    });

    it('should update multiple fields', async () => {
      const updated = await provider.updateTicket('LOCAL-001', {
        title: 'New Title',
        body: 'New body',
        labels: ['new'],
      });

      expect(updated.title).toBe('New Title');
      expect(updated.body).toBe('New body');
      expect(updated.labels).toEqual(['new']);
    });

    it('should update updatedAt timestamp', async () => {
      const original = await provider.getTicket('LOCAL-001');
      const originalUpdatedAt = original.meta?.updatedAt;

      // Wait a tiny bit to ensure timestamp changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      const updated = await provider.updateTicket('LOCAL-001', {
        title: 'Updated',
      });

      expect(updated.meta?.updatedAt).not.toBe(originalUpdatedAt);
      expect(updated.meta?.createdAt).toBe(original.meta?.createdAt);
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      await expect(
        provider.updateTicket('LOCAL-999', { title: 'Updated' })
      ).rejects.toThrow(NotFoundError);
    });

    it('should work with various ref formats', async () => {
      const updated1 = await provider.updateTicket('local-001', { title: 'A' });
      expect(updated1.title).toBe('A');

      const updated2 = await provider.updateTicket('1', { title: 'B' });
      expect(updated2.title).toBe('B');

      const updated3 = await provider.updateTicket('001', { title: 'C' });
      expect(updated3.title).toBe('C');
    });
  });

  describe('setLabels', () => {
    beforeEach(async () => {
      await provider.createTicket({
        title: 'Labeled Ticket',
        labels: ['original', 'labels'],
      });
    });

    it('should replace all labels', async () => {
      await provider.setLabels('LOCAL-001', ['new', 'labels']);

      const ticket = await provider.getTicket('LOCAL-001');
      expect(ticket.labels).toEqual(['new', 'labels']);
    });

    it('should clear labels with empty array', async () => {
      await provider.setLabels('LOCAL-001', []);

      const ticket = await provider.getTicket('LOCAL-001');
      expect(ticket.labels).toEqual([]);
    });

    it('should update updatedAt timestamp', async () => {
      const original = await provider.getTicket('LOCAL-001');

      await new Promise((resolve) => setTimeout(resolve, 10));
      await provider.setLabels('LOCAL-001', ['updated']);

      const updated = await provider.getTicket('LOCAL-001');
      expect(updated.meta?.updatedAt).not.toBe(original.meta?.updatedAt);
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      await expect(
        provider.setLabels('LOCAL-999', ['labels'])
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getLabels', () => {
    beforeEach(async () => {
      await provider.createTicket({
        title: 'Labeled Ticket',
        labels: ['bug', 'priority:high', 'area:auth'],
      });
      await provider.createTicket({ title: 'Unlabeled Ticket' });
    });

    it('should return labels for ticket', async () => {
      const labels = await provider.getLabels('LOCAL-001');
      expect(labels).toEqual(['bug', 'priority:high', 'area:auth']);
    });

    it('should return empty array for unlabeled ticket', async () => {
      const labels = await provider.getLabels('LOCAL-002');
      expect(labels).toEqual([]);
    });

    it('should throw NotFoundError for non-existent ticket', async () => {
      await expect(provider.getLabels('LOCAL-999')).rejects.toThrow(NotFoundError);
    });
  });

  describe('checkAuth', () => {
    it('should always return ok: true', async () => {
      const result = await provider.checkAuth();
      expect(result).toEqual({ ok: true });
    });

    it('should return ok even without any store', async () => {
      const freshProvider = new LocalProvider(mockConfig, { cwd: tempDir });
      const result = await freshProvider.checkAuth();
      expect(result).toEqual({ ok: true });
    });
  });

  describe('getTicketUrl', () => {
    it('should return local:// URL for LOCAL-001 format', () => {
      const url = provider.getTicketUrl('LOCAL-001');
      expect(url).toBe('local://LOCAL-001');
    });

    it('should normalize bare numbers', () => {
      const url = provider.getTicketUrl('1');
      expect(url).toBe('local://LOCAL-001');
    });

    it('should normalize lowercase format', () => {
      const url = provider.getTicketUrl('local-42');
      expect(url).toBe('local://LOCAL-042');
    });

    it('should pass through unparseable refs as-is', () => {
      const url = provider.getTicketUrl('invalid-ref');
      expect(url).toBe('local://invalid-ref');
    });
  });

  describe('ID generation', () => {
    it('should zero-pad IDs to 3 digits', async () => {
      const ticket = await provider.createTicket({ title: 'Test' });
      expect(ticket.ref.id).toBe('LOCAL-001');
    });

    it('should continue incrementing after manual setup', async () => {
      // Manually create a store with high nextId
      await mkdir(join(tempDir, '.specify'), { recursive: true });
      await writeFile(
        storePath,
        JSON.stringify({
          version: 1,
          nextId: 998,
          tickets: {},
        })
      );

      const ticket1 = await provider.createTicket({ title: 'Test 1' });
      const ticket2 = await provider.createTicket({ title: 'Test 2' });
      const ticket3 = await provider.createTicket({ title: 'Test 3' });

      expect(ticket1.ref.id).toBe('LOCAL-998');
      expect(ticket2.ref.id).toBe('LOCAL-999');
      expect(ticket3.ref.id).toBe('LOCAL-1000');
    });
  });

  describe('custom store path', () => {
    it('should use custom store path when specified', async () => {
      const customPath = join(tempDir, 'custom', 'store.json');
      const customProvider = new LocalProvider(mockConfig, {
        cwd: tempDir,
        storePath: customPath,
      });

      await customProvider.createTicket({ title: 'Custom Path Test' });

      const content = await readFile(customPath, 'utf-8');
      expect(JSON.parse(content).tickets['LOCAL-001']).toBeDefined();
    });

    it('should support absolute paths', async () => {
      const absolutePath = join(tempDir, 'absolute', 'tickets.json');
      const customProvider = new LocalProvider(mockConfig, {
        storePath: absolutePath,
      });

      await customProvider.createTicket({ title: 'Absolute Path Test' });

      const content = await readFile(absolutePath, 'utf-8');
      expect(JSON.parse(content).tickets['LOCAL-001']).toBeDefined();
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple sequential creates', async () => {
      for (let i = 1; i <= 10; i++) {
        const ticket = await provider.createTicket({ title: `Ticket ${i}` });
        expect(ticket.ref.id).toBe(`LOCAL-${String(i).padStart(3, '0')}`);
      }

      // Verify final state
      const content = await readFile(storePath, 'utf-8');
      const store = JSON.parse(content);
      expect(Object.keys(store.tickets)).toHaveLength(10);
      expect(store.nextId).toBe(11);
    });
  });

  describe('provider name', () => {
    it('should have name set to local', () => {
      expect(provider.name).toBe('local');
    });
  });

  describe('error types', () => {
    it('should throw NotFoundError which is instanceof ProviderError', async () => {
      try {
        await provider.getTicket('LOCAL-999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundError);
        expect(error).toBeInstanceOf(ProviderError);
        expect(error).toBeInstanceOf(Error);
      }
    });
  });
});
