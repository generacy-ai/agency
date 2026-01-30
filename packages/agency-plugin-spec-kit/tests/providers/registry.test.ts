/**
 * Tests for Provider Registry functions
 *
 * Tests createProvider, getProvider, getConfiguredProvider, and clearProviderCache
 * from the providers module.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createProvider,
  getProvider,
  getConfiguredProvider,
  clearProviderCache,
  ProviderNotFoundError,
  type BacklogConfig,
  type BacklogProvider,
} from '../../src/providers/index.js';

describe('Provider Registry', () => {
  // Clear the cache before each test to ensure isolation
  beforeEach(() => {
    clearProviderCache();
  });

  describe('createProvider', () => {
    describe('known provider types (not yet implemented)', () => {
      it('should throw ProviderNotFoundError for github provider', () => {
        const config: BacklogConfig = {
          provider: 'github',
          github: {},
        };

        expect(() => createProvider(config)).toThrow(ProviderNotFoundError);
        expect(() => createProvider(config)).toThrow("Provider 'github' not found");
      });

      it('should throw ProviderNotFoundError for jira provider', () => {
        const config: BacklogConfig = {
          provider: 'jira',
          jira: {
            baseUrl: 'https://jira.example.com',
            projectKey: 'PROJ',
          },
        };

        expect(() => createProvider(config)).toThrow(ProviderNotFoundError);
        expect(() => createProvider(config)).toThrow("Provider 'jira' not found");
      });

      it('should throw ProviderNotFoundError for shortcut provider', () => {
        const config: BacklogConfig = {
          provider: 'shortcut',
          shortcut: {
            workspaceSlug: 'my-workspace',
          },
        };

        expect(() => createProvider(config)).toThrow(ProviderNotFoundError);
        expect(() => createProvider(config)).toThrow("Provider 'shortcut' not found");
      });

      it('should throw ProviderNotFoundError for local provider', () => {
        const config: BacklogConfig = {
          provider: 'local',
        };

        expect(() => createProvider(config)).toThrow(ProviderNotFoundError);
        expect(() => createProvider(config)).toThrow("Provider 'local' not found");
      });
    });

    describe('unknown provider types', () => {
      it('should throw ProviderNotFoundError for unknown provider', () => {
        // Cast to bypass TypeScript type checking for testing unknown providers
        const config = {
          provider: 'unknown-provider',
        } as BacklogConfig;

        expect(() => createProvider(config)).toThrow(ProviderNotFoundError);
        expect(() => createProvider(config)).toThrow("Provider 'unknown-provider' not found");
      });

      it('should include provider name in error', () => {
        const config = {
          provider: 'custom-system',
        } as BacklogConfig;

        try {
          createProvider(config);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ProviderNotFoundError);
          expect((error as ProviderNotFoundError).provider).toBe('custom-system');
        }
      });
    });

    describe('error properties', () => {
      it('should set correct error name', () => {
        const config: BacklogConfig = { provider: 'github', github: {} };

        try {
          createProvider(config);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ProviderNotFoundError);
          expect((error as ProviderNotFoundError).name).toBe('ProviderNotFoundError');
        }
      });

      it('should set provider property on error', () => {
        const config: BacklogConfig = { provider: 'jira', jira: { baseUrl: 'https://jira.example.com', projectKey: 'TEST' } };

        try {
          createProvider(config);
          expect.fail('Should have thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(ProviderNotFoundError);
          expect((error as ProviderNotFoundError).provider).toBe('jira');
        }
      });
    });
  });

  describe('getProvider', () => {
    it('should throw ProviderNotFoundError when provider not in cache', () => {
      expect(() => getProvider('github')).toThrow(ProviderNotFoundError);
      expect(() => getProvider('github')).toThrow("Provider 'github' not found");
    });

    it('should throw ProviderNotFoundError for any unknown name', () => {
      expect(() => getProvider('nonexistent')).toThrow(ProviderNotFoundError);
      expect(() => getProvider('nonexistent')).toThrow("Provider 'nonexistent' not found");
    });

    it('should throw for empty string provider name', () => {
      expect(() => getProvider('')).toThrow(ProviderNotFoundError);
    });

    it('should include provider name in error', () => {
      try {
        getProvider('my-custom-provider');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderNotFoundError);
        expect((error as ProviderNotFoundError).provider).toBe('my-custom-provider');
      }
    });
  });

  describe('getConfiguredProvider', () => {
    it('should throw ProviderNotFoundError since createProvider throws', () => {
      const config: BacklogConfig = { provider: 'github', github: {} };

      expect(() => getConfiguredProvider(config)).toThrow(ProviderNotFoundError);
    });

    it('should throw for all known provider types', () => {
      const configs: BacklogConfig[] = [
        { provider: 'github', github: {} },
        { provider: 'jira', jira: { baseUrl: 'https://jira.example.com', projectKey: 'PROJ' } },
        { provider: 'shortcut', shortcut: { workspaceSlug: 'workspace' } },
        { provider: 'local' },
      ];

      for (const config of configs) {
        expect(() => getConfiguredProvider(config)).toThrow(ProviderNotFoundError);
      }
    });
  });

  describe('clearProviderCache', () => {
    it('should not throw when cache is empty', () => {
      expect(() => clearProviderCache()).not.toThrow();
    });

    it('should be callable multiple times', () => {
      clearProviderCache();
      clearProviderCache();
      clearProviderCache();
      // Should not throw
      expect(true).toBe(true);
    });

    it('should cause getProvider to throw after clearing', () => {
      // First ensure cache is clear
      clearProviderCache();
      // getProvider should throw
      expect(() => getProvider('github')).toThrow(ProviderNotFoundError);
    });
  });

  describe('caching behavior (with mocked createProvider)', () => {
    // To test caching behavior, we need to mock the internal behavior
    // Since we can't easily inject providers into the cache without calling
    // getConfiguredProvider (which calls createProvider), we test the observable
    // behavior through the public API

    it('should clear cache between tests (isolation check)', () => {
      // This test verifies that beforeEach clearProviderCache works
      expect(() => getProvider('github')).toThrow(ProviderNotFoundError);
      expect(() => getProvider('jira')).toThrow(ProviderNotFoundError);
      expect(() => getProvider('shortcut')).toThrow(ProviderNotFoundError);
      expect(() => getProvider('local')).toThrow(ProviderNotFoundError);
    });
  });

  describe('ProviderNotFoundError', () => {
    it('should be an instance of Error', () => {
      const error = new ProviderNotFoundError('test');
      expect(error).toBeInstanceOf(Error);
    });

    it('should have correct name property', () => {
      const error = new ProviderNotFoundError('test');
      expect(error.name).toBe('ProviderNotFoundError');
    });

    it('should have correct message format', () => {
      const error = new ProviderNotFoundError('my-provider');
      expect(error.message).toBe("Provider 'my-provider' not found");
    });

    it('should have provider property matching input', () => {
      const error = new ProviderNotFoundError('github');
      expect(error.provider).toBe('github');
    });

    it('should handle special characters in provider name', () => {
      const error = new ProviderNotFoundError('special/chars@test');
      expect(error.provider).toBe('special/chars@test');
      expect(error.message).toBe("Provider 'special/chars@test' not found");
    });
  });

  describe('integration: error flow', () => {
    it('should propagate ProviderNotFoundError from createProvider through getConfiguredProvider', () => {
      const config: BacklogConfig = { provider: 'github', github: {} };

      let caughtError: Error | null = null;
      try {
        getConfiguredProvider(config);
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError).toBeInstanceOf(ProviderNotFoundError);
      expect((caughtError as ProviderNotFoundError).provider).toBe('github');
    });

    it('should maintain error type through catch and rethrow patterns', () => {
      const config: BacklogConfig = { provider: 'jira', jira: { baseUrl: 'https://jira.example.com', projectKey: 'TEST' } };

      const wrappedCall = () => {
        try {
          return getConfiguredProvider(config);
        } catch (error) {
          if (error instanceof ProviderNotFoundError) {
            throw error; // Re-throw same error
          }
          throw new Error('Unexpected error type');
        }
      };

      expect(wrappedCall).toThrow(ProviderNotFoundError);
    });
  });
});
