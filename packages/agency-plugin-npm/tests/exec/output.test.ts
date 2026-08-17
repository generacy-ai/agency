/**
 * Tests for failure-output shaping
 */

import { describe, it, expect } from 'vitest';
import {
  combineStreams,
  clampTail,
  formatFailureOutput,
  MAX_FAILURE_CHARS,
  MAX_FAILURE_LINES,
} from '../../src/exec/output.js';

describe('combineStreams', () => {
  it('returns stdout alone when stderr is empty', () => {
    expect(combineStreams({ stdout: 'out\n', stderr: '' })).toBe('out');
  });

  it('returns stderr alone when stdout is empty', () => {
    expect(combineStreams({ stdout: '', stderr: 'err\n' })).toBe('err');
  });

  it('labels and includes both streams when both are non-empty', () => {
    const combined = combineStreams({ stdout: 'the real error', stderr: 'one warning' });
    expect(combined).toContain('the real error');
    expect(combined).toContain('--- stderr ---');
    expect(combined).toContain('one warning');
  });

  it('returns a placeholder when both streams are empty', () => {
    expect(combineStreams({ stdout: '', stderr: '' })).toBe('(no output)');
  });
});

describe('clampTail', () => {
  it('returns short text unchanged with no marker', () => {
    expect(clampTail('a\nb\nc')).toBe('a\nb\nc');
  });

  it('keeps only the last maxLines lines', () => {
    const text = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
    const clamped = clampTail(text);
    expect(clamped).toContain('[output truncated');
    expect(clamped).toContain('line 499');
    expect(clamped).not.toContain('line 0\n');
  });

  it('caps total characters, keeping the tail', () => {
    const text = 'x'.repeat(MAX_FAILURE_CHARS * 3) + '\nfinal summary';
    const clamped = clampTail(text);
    expect(clamped.length).toBeLessThanOrEqual(MAX_FAILURE_CHARS + 100);
    expect(clamped).toContain('[output truncated');
    expect(clamped).toContain('final summary');
  });

  it('respects explicit limits', () => {
    const clamped = clampTail('a\nb\nc\nd', 2, 100);
    expect(clamped).toContain('c\nd');
    expect(clamped).not.toContain('a\nb');
  });

  it('exports sane default limits', () => {
    expect(MAX_FAILURE_LINES).toBeGreaterThan(0);
    expect(MAX_FAILURE_CHARS).toBeGreaterThan(0);
  });
});

describe('formatFailureOutput', () => {
  it('combines streams then clamps', () => {
    const stdout = Array.from({ length: 1000 }, (_, i) => `test ${i} failed`).join('\n');
    const formatted = formatFailureOutput({ stdout, stderr: 'runner exited 1' });
    expect(formatted).toContain('[output truncated');
    expect(formatted).toContain('test 999 failed');
    expect(formatted).toContain('runner exited 1');
  });
});
