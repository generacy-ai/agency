/**
 * Tests for ProviderNotFoundError class
 */

import { describe, it, expect } from 'vitest';
import { ProviderNotFoundError, ProviderError } from '../../src/providers/errors.js';

describe('ProviderNotFoundError', () => {
  describe('constructor', () => {
    it('should create error with correct message format', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.message).toBe("Provider 'github' not found");
    });

    it('should format message correctly for different provider names', () => {
      const jiraError = new ProviderNotFoundError('jira');
      expect(jiraError.message).toBe("Provider 'jira' not found");

      const shortcutError = new ProviderNotFoundError('shortcut');
      expect(shortcutError.message).toBe("Provider 'shortcut' not found");

      const unknownError = new ProviderNotFoundError('unknown-provider');
      expect(unknownError.message).toBe("Provider 'unknown-provider' not found");
    });
  });

  describe('error name', () => {
    it('should have name set to ProviderNotFoundError', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.name).toBe('ProviderNotFoundError');
    });
  });

  describe('provider property', () => {
    it('should have provider property set to the provider name', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.provider).toBe('github');
    });

    it('should set provider for various provider names', () => {
      const jiraError = new ProviderNotFoundError('jira');
      expect(jiraError.provider).toBe('jira');

      const localError = new ProviderNotFoundError('local');
      expect(localError.provider).toBe('local');
    });
  });

  describe('instanceof checks', () => {
    it('should be instanceof ProviderNotFoundError', () => {
      const error = new ProviderNotFoundError('github');
      expect(error).toBeInstanceOf(ProviderNotFoundError);
    });

    it('should be instanceof ProviderError (base class)', () => {
      const error = new ProviderNotFoundError('github');
      expect(error).toBeInstanceOf(ProviderError);
    });

    it('should be instanceof Error', () => {
      const error = new ProviderNotFoundError('github');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('stack trace', () => {
    it('should capture stack trace', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.stack).toBeDefined();
      expect(typeof error.stack).toBe('string');
    });

    it('should include error message in stack trace', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.stack).toContain("Provider 'github' not found");
    });

    it('should include error name in stack trace', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.stack).toContain('ProviderNotFoundError');
    });
  });
});
