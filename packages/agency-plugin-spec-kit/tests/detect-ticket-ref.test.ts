/**
 * Tests for detectTicketRef utility
 */

import { describe, it, expect } from 'vitest';
import { detectTicketRef } from '../src/utils/detect-ticket-ref.js';

describe('detectTicketRef', () => {
  describe('GitHub URL parsing', () => {
    it('should parse GitHub issue URL', () => {
      const result = detectTicketRef(
        'https://github.com/owner/repo/issues/123',
        'github'
      );
      expect(result).toEqual({
        provider: 'github',
        id: '123',
        url: 'https://github.com/owner/repo/issues/123',
        raw: 'https://github.com/owner/repo/issues/123',
      });
    });

    it('should parse GitHub pull request URL', () => {
      const result = detectTicketRef(
        'https://github.com/owner/repo/pull/456',
        'github'
      );
      expect(result).toEqual({
        provider: 'github',
        id: '456',
        url: 'https://github.com/owner/repo/pull/456',
        raw: 'https://github.com/owner/repo/pull/456',
      });
    });

    it('should parse HTTP GitHub URLs', () => {
      const result = detectTicketRef(
        'http://github.com/owner/repo/issues/789',
        'github'
      );
      expect(result).toEqual({
        provider: 'github',
        id: '789',
        url: 'http://github.com/owner/repo/issues/789',
        raw: 'http://github.com/owner/repo/issues/789',
      });
    });

    it('should handle URLs with extra path segments', () => {
      const result = detectTicketRef(
        'https://github.com/my-org/my-repo/issues/42',
        'github'
      );
      expect(result?.provider).toBe('github');
      expect(result?.id).toBe('42');
    });
  });

  describe('GitHub shorthand parsing', () => {
    it('should parse #123 format', () => {
      const result = detectTicketRef('#123', 'github');
      expect(result).toEqual({
        provider: 'github',
        id: '123',
        raw: '#123',
      });
    });

    it('should parse owner/repo#123 format', () => {
      const result = detectTicketRef('owner/repo#123', 'github');
      expect(result).toEqual({
        provider: 'github',
        id: '123',
        url: 'https://github.com/owner/repo/issues/123',
        raw: 'owner/repo#123',
      });
    });

    it('should parse org/project#456 format', () => {
      const result = detectTicketRef('my-org/my-project#456', 'github');
      expect(result).toEqual({
        provider: 'github',
        id: '456',
        url: 'https://github.com/my-org/my-project/issues/456',
        raw: 'my-org/my-project#456',
      });
    });
  });

  describe('Jira format parsing', () => {
    it('should parse PROJ-123 format', () => {
      const result = detectTicketRef('PROJ-123', 'github');
      expect(result).toEqual({
        provider: 'jira',
        id: 'PROJ-123',
        raw: 'PROJ-123',
      });
    });

    it('should parse ABC-1 format (single digit)', () => {
      const result = detectTicketRef('ABC-1', 'github');
      expect(result).toEqual({
        provider: 'jira',
        id: 'ABC-1',
        raw: 'ABC-1',
      });
    });

    it('should parse PROJECT_KEY-999 format (with underscore)', () => {
      const result = detectTicketRef('PROJECT_KEY-999', 'github');
      expect(result).toEqual({
        provider: 'jira',
        id: 'PROJECT_KEY-999',
        raw: 'PROJECT_KEY-999',
      });
    });

    it('should not match lowercase jira format', () => {
      // Jira keys are uppercase
      const result = detectTicketRef('proj-123', 'github');
      expect(result?.provider).not.toBe('jira');
    });

    it('should parse Jira URL', () => {
      const result = detectTicketRef(
        'https://company.atlassian.net/browse/PROJ-456',
        'github'
      );
      expect(result).toEqual({
        provider: 'jira',
        id: 'PROJ-456',
        url: 'https://company.atlassian.net/browse/PROJ-456',
        raw: 'https://company.atlassian.net/browse/PROJ-456',
      });
    });
  });

  describe('Shortcut format parsing', () => {
    it('should parse sc-123 format', () => {
      const result = detectTicketRef('sc-123', 'github');
      expect(result).toEqual({
        provider: 'shortcut',
        id: '123',
        raw: 'sc-123',
      });
    });

    it('should parse SC-456 format (uppercase)', () => {
      const result = detectTicketRef('SC-456', 'github');
      expect(result).toEqual({
        provider: 'shortcut',
        id: '456',
        raw: 'SC-456',
      });
    });

    it('should parse Shortcut URL', () => {
      const result = detectTicketRef(
        'https://app.shortcut.com/my-workspace/story/789',
        'github'
      );
      expect(result).toEqual({
        provider: 'shortcut',
        id: '789',
        url: 'https://app.shortcut.com/my-workspace/story/789',
        raw: 'https://app.shortcut.com/my-workspace/story/789',
      });
    });
  });

  describe('bare number parsing', () => {
    it('should parse bare number with default provider', () => {
      const result = detectTicketRef('123', 'github');
      expect(result).toEqual({
        provider: 'github',
        id: '123',
        raw: '123',
      });
    });

    it('should use specified default provider', () => {
      const result = detectTicketRef('456', 'jira');
      expect(result).toEqual({
        provider: 'jira',
        id: '456',
        raw: '456',
      });
    });
  });

  describe('invalid input handling', () => {
    it('should return null for invalid input', () => {
      expect(detectTicketRef('invalid', 'github')).toBeNull();
      expect(detectTicketRef('not-a-ticket', 'github')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(detectTicketRef('', 'github')).toBeNull();
    });

    it('should return null for whitespace-only string', () => {
      expect(detectTicketRef('   ', 'github')).toBeNull();
    });

    it('should trim whitespace before parsing', () => {
      const result = detectTicketRef('  #123  ', 'github');
      expect(result?.id).toBe('123');
    });

    it('should return null for null/undefined input', () => {
      expect(detectTicketRef(null as any, 'github')).toBeNull();
      expect(detectTicketRef(undefined as any, 'github')).toBeNull();
    });
  });

  describe('ambiguous input uses default provider', () => {
    it('should use github as default for #123', () => {
      const result = detectTicketRef('#123', 'github');
      expect(result?.provider).toBe('github');
    });

    it('should use specified default for bare numbers', () => {
      const result = detectTicketRef('123', 'shortcut');
      expect(result?.provider).toBe('shortcut');
    });
  });
});
