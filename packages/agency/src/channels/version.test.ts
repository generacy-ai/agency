import { describe, expect, it } from 'vitest';
import { isVersionCompatible } from './version.js';

describe('isVersionCompatible', () => {
  describe('same major, same minor', () => {
    it('returns true for identical versions', () => {
      expect(isVersionCompatible('1.0.0', '1.0.0')).toBe(true);
    });

    it('returns true when available patch is higher', () => {
      expect(isVersionCompatible('1.0.5', '1.0.0')).toBe(true);
    });

    it('returns false when available patch is lower', () => {
      expect(isVersionCompatible('1.0.0', '1.0.5')).toBe(false);
    });
  });

  describe('same major, different minor', () => {
    it('returns true when available minor is higher', () => {
      expect(isVersionCompatible('1.2.0', '1.0.0')).toBe(true);
    });

    it('returns false when available minor is lower', () => {
      expect(isVersionCompatible('1.0.0', '1.2.0')).toBe(false);
    });

    it('returns true when minor is higher even with lower patch', () => {
      expect(isVersionCompatible('1.2.0', '1.1.5')).toBe(true);
    });
  });

  describe('major mismatch', () => {
    it('returns false when major versions differ (higher available)', () => {
      expect(isVersionCompatible('2.0.0', '1.0.0')).toBe(false);
    });

    it('returns false when major versions differ (lower available)', () => {
      expect(isVersionCompatible('1.0.0', '2.0.0')).toBe(false);
    });
  });

  describe('invalid versions', () => {
    it('returns false for invalid available version', () => {
      expect(isVersionCompatible('invalid', '1.0.0')).toBe(false);
    });

    it('returns false for invalid required version', () => {
      expect(isVersionCompatible('1.0.0', 'invalid')).toBe(false);
    });

    it('returns false for empty strings', () => {
      expect(isVersionCompatible('', '')).toBe(false);
    });

    it('returns false for partial versions', () => {
      expect(isVersionCompatible('1.0', '1.0.0')).toBe(false);
    });
  });

  describe('prerelease versions', () => {
    it('handles prerelease versions correctly', () => {
      expect(isVersionCompatible('1.0.0-alpha', '1.0.0')).toBe(false);
      expect(isVersionCompatible('1.0.0', '1.0.0-alpha')).toBe(true);
    });
  });
});
