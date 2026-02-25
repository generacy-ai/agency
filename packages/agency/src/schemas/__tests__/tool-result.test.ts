import { describe, it, expect } from 'vitest';
import {
  TerseToolResultSchema,
  type TerseToolResult,
  type TerseToolOptions,
  parseTerseToolResult,
  safeParseTerseToolResult,
} from '../tool-result.js';

describe('TerseToolResultSchema', () => {
  describe('valid TerseToolResult shapes', () => {
    it('accepts minimal success result', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Done.',
      });
      expect(result.success).toBe(true);
    });

    it('accepts success result with output message', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Committed: abc1234',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(true);
        expect(result.data.output).toBe('Committed: abc1234');
      }
    });

    it('accepts success result with data', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Found 3 issues.',
        data: {
          issues: [
            { number: 1, title: 'Bug in login' },
            { number: 2, title: 'Feature request' },
            { number: 3, title: 'Documentation' },
          ],
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data).toEqual({
          issues: [
            { number: 1, title: 'Bug in login' },
            { number: 2, title: 'Feature request' },
            { number: 3, title: 'Documentation' },
          ],
        });
      }
    });

    it('accepts failure result', () => {
      const result = TerseToolResultSchema.safeParse({
        success: false,
        output: 'Error: Connection failed\n\nStack trace:\n...',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
      }
    });

    it('accepts failure result with error context data', () => {
      const result = TerseToolResultSchema.safeParse({
        success: false,
        output: 'Error: Git push failed',
        data: {
          exitCode: 1,
          stderr: 'Permission denied',
        },
      });
      expect(result.success).toBe(true);
    });

    it('accepts data as null', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Done.',
        data: null,
      });
      expect(result.success).toBe(true);
    });

    it('accepts data as primitive value', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Count: 42',
        data: 42,
      });
      expect(result.success).toBe(true);
    });

    it('accepts data as array', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Found items.',
        data: ['a', 'b', 'c'],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data).toEqual(['a', 'b', 'c']);
      }
    });

    it('accepts empty output string', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: '',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('invalid TerseToolResult shapes', () => {
    it('rejects missing success field', () => {
      const result = TerseToolResultSchema.safeParse({
        output: 'Done.',
      });
      expect(result.success).toBe(false);
    });

    it('rejects missing output field', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
      });
      expect(result.success).toBe(false);
    });

    it('rejects success as string', () => {
      const result = TerseToolResultSchema.safeParse({
        success: 'true',
        output: 'Done.',
      });
      expect(result.success).toBe(false);
    });

    it('rejects output as number', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 123,
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty object', () => {
      const result = TerseToolResultSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('rejects null', () => {
      const result = TerseToolResultSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it('rejects undefined', () => {
      const result = TerseToolResultSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it('rejects string input', () => {
      const result = TerseToolResultSchema.safeParse('not an object');
      expect(result.success).toBe(false);
    });

    it('rejects number input', () => {
      const result = TerseToolResultSchema.safeParse(42);
      expect(result.success).toBe(false);
    });

    it('rejects array input', () => {
      const result = TerseToolResultSchema.safeParse([1, 2, 3]);
      expect(result.success).toBe(false);
    });
  });

  describe('passthrough behavior', () => {
    it('allows unknown properties to pass through', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Ok',
        customField: 'allowed',
        metrics: { duration: 100 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty('customField', 'allowed');
        expect(result.data).toHaveProperty('metrics', { duration: 100 });
      }
    });

    it('preserves plugin-specific extensions', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'File created.',
        filePath: '/path/to/file.ts',
        lineCount: 42,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>)['filePath']).toBe(
          '/path/to/file.ts'
        );
        expect((result.data as Record<string, unknown>)['lineCount']).toBe(42);
      }
    });

    it('preserves nested extra objects', () => {
      const result = TerseToolResultSchema.safeParse({
        success: true,
        output: 'Done.',
        context: {
          nested: { deeply: { value: true } },
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>)['context']).toEqual({
          nested: { deeply: { value: true } },
        });
      }
    });
  });
});

describe('parseTerseToolResult', () => {
  it('parses valid data', () => {
    const result = parseTerseToolResult({
      success: true,
      output: 'Done.',
    });
    expect(result.success).toBe(true);
    expect(result.output).toBe('Done.');
  });

  it('parses valid data with all fields', () => {
    const result = parseTerseToolResult({
      success: false,
      output: 'Error occurred.',
      data: { code: 'ERR_001' },
    });
    expect(result.success).toBe(false);
    expect(result.output).toBe('Error occurred.');
    expect(result.data).toEqual({ code: 'ERR_001' });
  });

  it('throws on missing required fields', () => {
    expect(() => parseTerseToolResult({ success: true })).toThrow();
    expect(() => parseTerseToolResult({ output: 'Done.' })).toThrow();
  });

  it('throws on invalid types', () => {
    expect(() =>
      parseTerseToolResult({ success: 'true', output: 'Done.' })
    ).toThrow();
  });

  it('throws on null input', () => {
    expect(() => parseTerseToolResult(null)).toThrow();
  });

  it('throws on undefined input', () => {
    expect(() => parseTerseToolResult(undefined)).toThrow();
  });
});

describe('safeParseTerseToolResult', () => {
  it('returns success result for valid data', () => {
    const result = safeParseTerseToolResult({
      success: true,
      output: 'Done.',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.success).toBe(true);
      expect(result.data.output).toBe('Done.');
    }
  });

  it('returns error result for invalid data', () => {
    const result = safeParseTerseToolResult({ success: true });
    expect(result.success).toBe(false);
  });

  it('returns error result for null', () => {
    const result = safeParseTerseToolResult(null);
    expect(result.success).toBe(false);
  });

  it('provides Zod error details on failure', () => {
    const result = safeParseTerseToolResult({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThan(0);
    }
  });
});

describe('TerseToolOptions interface', () => {
  it('allows all optional fields', () => {
    const options1: TerseToolOptions = {};
    const options2: TerseToolOptions = { verbose: true };
    const options3: TerseToolOptions = { includeStackTrace: false };
    const options4: TerseToolOptions = {
      verbose: true,
      includeStackTrace: false,
    };

    expect(options1).toBeDefined();
    expect(options2.verbose).toBe(true);
    expect(options3.includeStackTrace).toBe(false);
    expect(options4.verbose).toBe(true);
  });
});

describe('structural compatibility with old TerseToolResult interface', () => {
  it('matches the original interface shape: { success, output, data? }', () => {
    // The old interface was:
    //   interface TerseToolResult { success: boolean; output: string; data?: unknown; }
    // Verify the Zod-inferred type is structurally compatible
    const result: TerseToolResult = {
      success: true,
      output: 'Committed: abc1234',
    };
    expect(result.success).toBe(true);
    expect(result.output).toBe('Committed: abc1234');
    expect(result.data).toBeUndefined();
  });

  it('supports optional data field', () => {
    const result: TerseToolResult = {
      success: true,
      output: 'Done.',
      data: { count: 5 },
    };
    expect(result.data).toEqual({ count: 5 });
  });

  it('can be used where the old interface was expected', () => {
    // Simulate a function that accepted the old interface shape
    function processResult(r: { success: boolean; output: string; data?: unknown }): string {
      return r.success ? `OK: ${r.output}` : `FAIL: ${r.output}`;
    }

    const parsed = parseTerseToolResult({
      success: true,
      output: 'Build passed.',
    });

    // The Zod-inferred type should be assignable to the old interface shape
    expect(processResult(parsed)).toBe('OK: Build passed.');
  });

  it('preserves extra properties from passthrough when cast', () => {
    const raw = {
      success: true,
      output: 'Done.',
      extra: 'preserved',
    };
    const parsed = parseTerseToolResult(raw);

    // Extra fields survive parsing due to .passthrough()
    expect((parsed as Record<string, unknown>)['extra']).toBe('preserved');
  });
});
