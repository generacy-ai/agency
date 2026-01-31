/**
 * Tests for slug generation utilities
 */

import { describe, it, expect } from 'vitest';
import { generateSlug, STOP_WORDS } from '../../src/utils/slug.js';

describe('generateSlug', () => {
  describe('basic slug generation', () => {
    it('should convert simple text to slug', () => {
      expect(generateSlug('Hello World')).toBe('hello-world');
    });

    it('should lowercase all characters', () => {
      expect(generateSlug('UPPERCASE TEXT')).toBe('uppercase-text');
    });

    it('should handle mixed case', () => {
      expect(generateSlug('MiXeD CaSe TeXt')).toBe('mixed-case-text');
    });
  });

  describe('stop word removal', () => {
    it('should remove common stop words', () => {
      expect(generateSlug('Add a new feature for handling errors')).toBe(
        'add-new-feature-handling'
      );
    });

    it('should remove "the", "a", "an"', () => {
      expect(generateSlug('the quick brown fox')).toBe('quick-brown-fox');
    });

    it('should remove prepositions', () => {
      expect(generateSlug('feature for users in production')).toBe(
        'feature-users-production'
      );
    });

    it('should handle text with only stop words', () => {
      expect(generateSlug('the a an to for of')).toBe('feature');
    });

    it('should preserve non-stop words', () => {
      // Default maxLength is 30, 'implement-user-authentication-system' is 37 chars
      // So it gets truncated at word boundary
      expect(generateSlug('implement user authentication system')).toBe(
        'implement-user-authentication'
      );
    });

    it('should not remove stop words when disabled', () => {
      expect(
        generateSlug('add a feature', { removeStopWords: false })
      ).toBe('add-a-feature');
    });
  });

  describe('special character handling', () => {
    it('should remove special characters', () => {
      // Apostrophe splits the word, resulting in "user" and "s" (s becomes a stop word "s" not in the list)
      expect(generateSlug("feature: user's auth!")).toBe('feature-user-s-auth');
    });

    it('should replace punctuation with spaces', () => {
      expect(generateSlug('hello.world,foo;bar')).toBe('hello-world-foo-bar');
    });

    it('should handle multiple consecutive spaces', () => {
      expect(generateSlug('hello    world')).toBe('hello-world');
    });

    it('should handle numbers', () => {
      expect(generateSlug('feature 123 test')).toBe('feature-123-test');
    });

    it('should handle parentheses and brackets', () => {
      expect(generateSlug('feature (v2) [beta]')).toBe('feature-v2-beta');
    });
  });

  describe('max words truncation', () => {
    it('should limit to default 4 words', () => {
      // After removing stop word 'with', we have 6 words, limited to 4: implement-user-authentication-system
      // But maxLength (30) truncates to 'implement-user-authentication'
      expect(
        generateSlug('implement user authentication system with oauth support')
      ).toBe('implement-user-authentication');
    });

    it('should respect custom maxWords', () => {
      expect(
        generateSlug('implement user authentication system', { maxWords: 2 })
      ).toBe('implement-user');
    });

    it('should handle maxWords of 1', () => {
      expect(generateSlug('hello world foo', { maxWords: 1 })).toBe('hello');
    });

    it('should return all words if fewer than maxWords', () => {
      expect(generateSlug('hello world', { maxWords: 10 })).toBe('hello-world');
    });
  });

  describe('max length truncation', () => {
    it('should truncate at word boundary', () => {
      expect(
        generateSlug('implement-user-authentication-system', { maxLength: 20 })
      ).toBe('implement-user');
    });

    it('should handle very short maxLength', () => {
      expect(generateSlug('hello world', { maxLength: 5 })).toBe('hello');
    });

    it('should not truncate short slugs', () => {
      expect(generateSlug('hello', { maxLength: 30 })).toBe('hello');
    });

    it('should remove trailing separator after truncation', () => {
      // This tests that we don't get "hello-" when truncating
      const result = generateSlug('hello world foo bar', { maxLength: 6 });
      expect(result.endsWith('-')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return "feature" for empty string', () => {
      expect(generateSlug('')).toBe('feature');
    });

    it('should return "feature" for whitespace only', () => {
      expect(generateSlug('   ')).toBe('feature');
    });

    it('should return "feature" for very short input', () => {
      expect(generateSlug('a')).toBe('feature');
    });

    it('should handle single word', () => {
      expect(generateSlug('authentication')).toBe('authentication');
    });

    it('should handle leading/trailing whitespace', () => {
      expect(generateSlug('  hello world  ')).toBe('hello-world');
    });

    it('should handle special characters only', () => {
      expect(generateSlug('!@#$%^&*()')).toBe('feature');
    });
  });

  describe('custom separator', () => {
    it('should use custom separator', () => {
      expect(generateSlug('hello world', { separator: '_' })).toBe(
        'hello_world'
      );
    });

    it('should handle multi-char separator', () => {
      expect(generateSlug('hello world', { separator: '--' })).toBe(
        'hello--world'
      );
    });
  });

  describe('combined options', () => {
    it('should apply multiple options together', () => {
      expect(
        generateSlug('The Quick Brown Fox Jumps Over The Lazy Dog', {
          maxWords: 3,
          maxLength: 15,
          separator: '_',
          removeStopWords: true,
        })
      ).toBe('quick_brown_fox');
    });
  });
});

describe('STOP_WORDS', () => {
  it('should be a Set', () => {
    expect(STOP_WORDS).toBeInstanceOf(Set);
  });

  it('should contain common stop words', () => {
    expect(STOP_WORDS.has('the')).toBe(true);
    expect(STOP_WORDS.has('a')).toBe(true);
    expect(STOP_WORDS.has('an')).toBe(true);
    expect(STOP_WORDS.has('for')).toBe(true);
    expect(STOP_WORDS.has('of')).toBe(true);
    expect(STOP_WORDS.has('to')).toBe(true);
  });

  it('should not contain meaningful words', () => {
    expect(STOP_WORDS.has('feature')).toBe(false);
    expect(STOP_WORDS.has('implement')).toBe(false);
    expect(STOP_WORDS.has('user')).toBe(false);
  });
});
