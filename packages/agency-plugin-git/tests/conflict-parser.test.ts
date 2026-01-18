/**
 * Tests for conflict-parser utility
 */

import { describe, it, expect } from 'vitest';
import {
  parseConflictMarkers,
  hasConflictMarkers,
  getConflictType,
} from '../src/utils/conflict-parser.js';

describe('parseConflictMarkers', () => {
  it('should parse standard conflict markers', () => {
    const content = `Line 1
<<<<<<< HEAD
Our change
=======
Their change
>>>>>>> feature
Line 3
`;
    const result = parseConflictMarkers(content);
    expect(result).not.toBeNull();
    expect(result?.ours).toBe('Our change');
    expect(result?.theirs).toBe('Their change');
    expect(result?.ancestor).toBeUndefined();
  });

  it('should parse diff3-style conflicts with ancestor', () => {
    const content = `<<<<<<< HEAD
Our version
||||||| base
Original version
=======
Their version
>>>>>>> feature
`;
    const result = parseConflictMarkers(content);
    expect(result).not.toBeNull();
    expect(result?.ours).toBe('Our version');
    expect(result?.ancestor).toBe('Original version');
    expect(result?.theirs).toBe('Their version');
  });

  it('should handle multi-line conflict sections', () => {
    const content = `<<<<<<< HEAD
Line 1
Line 2
Line 3
=======
Different 1
Different 2
>>>>>>> feature
`;
    const result = parseConflictMarkers(content);
    expect(result?.ours).toBe('Line 1\nLine 2\nLine 3');
    expect(result?.theirs).toBe('Different 1\nDifferent 2');
  });

  it('should return null for content without conflicts', () => {
    const content = 'Normal file content\nNo conflicts here\n';
    const result = parseConflictMarkers(content);
    expect(result).toBeNull();
  });

  it('should handle empty conflict sections', () => {
    const content = `<<<<<<< HEAD
=======
Their content
>>>>>>> feature
`;
    const result = parseConflictMarkers(content);
    expect(result?.ours).toBe('');
    expect(result?.theirs).toBe('Their content');
  });
});

describe('hasConflictMarkers', () => {
  it('should return true for content with conflict markers', () => {
    expect(hasConflictMarkers('<<<<<<< HEAD\n')).toBe(true);
  });

  it('should return false for content without conflict markers', () => {
    expect(hasConflictMarkers('Normal content')).toBe(false);
  });
});

describe('getConflictType', () => {
  it('should identify add-add conflicts', () => {
    expect(getConflictType('AA')).toBe('add-add');
  });

  it('should identify delete-modify conflicts', () => {
    expect(getConflictType('DD')).toBe('delete-modify');
    expect(getConflictType('AU')).toBe('delete-modify');
    expect(getConflictType('UD')).toBe('delete-modify');
    expect(getConflictType('UA')).toBe('delete-modify');
    expect(getConflictType('DU')).toBe('delete-modify');
  });

  it('should identify content conflicts', () => {
    expect(getConflictType('UU')).toBe('content');
  });
});
