import { describe, it, expect } from 'vitest';
import { TerseOutput, toMcpToolResult } from './terse-output.js';
import { Verbosity, type ExecResult } from './types.js';

describe('TerseOutput', () => {
  describe('static success()', () => {
    it('should return a success result with the message', () => {
      const result = TerseOutput.success('Done.');

      expect(result.success).toBe(true);
      expect(result.output).toBe('Done.');
    });

    it('should handle empty message', () => {
      const result = TerseOutput.success('');

      expect(result.success).toBe(true);
      expect(result.output).toBe('');
    });
  });

  describe('static failure()', () => {
    it('should return a failure result with error string', () => {
      const result = TerseOutput.failure('Something went wrong');

      expect(result.success).toBe(false);
      expect(result.output).toContain('Something went wrong');
    });

    it('should include Error message and stack trace', () => {
      const error = new Error('Test error');
      const result = TerseOutput.failure(error);

      expect(result.success).toBe(false);
      expect(result.output).toContain('Test error');
      expect(result.output).toContain('Stack trace:');
    });

    it('should include serialized context', () => {
      const result = TerseOutput.failure('Error', { key: 'value', count: 42 });

      expect(result.success).toBe(false);
      expect(result.output).toContain('Context:');
      expect(result.output).toContain('"key": "value"');
      expect(result.output).toContain('"count": 42');
    });

    it('should handle circular references in context', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj['self'] = obj;

      const result = TerseOutput.failure('Error', obj);

      expect(result.success).toBe(false);
      // Should not throw, should fallback to string representation
      expect(result.output).toContain('Context:');
    });

    it('should handle undefined context', () => {
      const result = TerseOutput.failure('Error', undefined);

      expect(result.success).toBe(false);
      expect(result.output).not.toContain('Context:');
    });
  });

  describe('static fromExec()', () => {
    it('should return success for exit code 0', () => {
      const execResult: ExecResult = {
        exitCode: 0,
        stdout: 'output',
        stderr: '',
      };

      const result = TerseOutput.fromExec(execResult);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Completed successfully.');
    });

    it('should use shortMessage when provided', () => {
      const execResult: ExecResult = {
        exitCode: 0,
        stdout: 'output',
        stderr: '',
        shortMessage: 'Build completed.',
      };

      const result = TerseOutput.fromExec(execResult);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Build completed.');
    });

    it('should return failure for non-zero exit code', () => {
      const execResult: ExecResult = {
        exitCode: 1,
        stdout: '',
        stderr: 'Error: file not found',
      };

      const result = TerseOutput.fromExec(execResult);

      expect(result.success).toBe(false);
      expect(result.output).toContain('Error: file not found');
    });

    it('should include both stdout and stderr on failure', () => {
      const execResult: ExecResult = {
        exitCode: 1,
        stdout: 'partial output',
        stderr: 'error message',
      };

      const result = TerseOutput.fromExec(execResult);

      expect(result.success).toBe(false);
      expect(result.output).toContain('error message');
      expect(result.output).toContain('partial output');
    });

    it('should handle empty stderr and stdout on failure', () => {
      const execResult: ExecResult = {
        exitCode: 127,
        stdout: '',
        stderr: '',
      };

      const result = TerseOutput.fromExec(execResult);

      expect(result.success).toBe(false);
      expect(result.output).toContain('exited with code 127');
    });
  });

  describe('instance methods', () => {
    describe('success()', () => {
      it('should respect maxSuccessLength', () => {
        const output = new TerseOutput({ maxSuccessLength: 20 });
        const result = output.success('This is a very long message that exceeds the limit');

        expect(result.success).toBe(true);
        expect(result.output.length).toBeLessThanOrEqual(20);
        expect(result.output.endsWith('...')).toBe(true);
      });

      it('should not truncate short messages', () => {
        const output = new TerseOutput({ maxSuccessLength: 100 });
        const result = output.success('Short');

        expect(result.output).toBe('Short');
      });
    });

    describe('successWithSummary()', () => {
      it('should show only message in TERSE mode', () => {
        const output = new TerseOutput({ verbosity: Verbosity.TERSE });
        const result = output.successWithSummary('Done.', '3 files processed');

        expect(result.success).toBe(true);
        expect(result.output).toBe('Done.');
        expect(result.output).not.toContain('3 files processed');
      });

      it('should show message and summary in NORMAL mode', () => {
        const output = new TerseOutput({ verbosity: Verbosity.NORMAL });
        const result = output.successWithSummary('Done.', '3 files processed');

        expect(result.success).toBe(true);
        expect(result.output).toBe('Done. (3 files processed)');
      });

      it('should show expanded output in VERBOSE mode', () => {
        const output = new TerseOutput({ verbosity: Verbosity.VERBOSE });
        const result = output.successWithSummary('Done.', '3 files processed');

        expect(result.success).toBe(true);
        expect(result.output).toContain('Done.');
        expect(result.output).toContain('Summary:');
        expect(result.output).toContain('3 files processed');
      });
    });

    describe('failure()', () => {
      it('should always show full error regardless of verbosity', () => {
        const output = new TerseOutput({ verbosity: Verbosity.TERSE });
        const result = output.failure(new Error('Test error'), { context: 'value' });

        expect(result.success).toBe(false);
        expect(result.output).toContain('Test error');
        expect(result.output).toContain('Stack trace:');
        expect(result.output).toContain('Context:');
      });
    });

    describe('fromExec() with verbosity', () => {
      const successExec: ExecResult = {
        exitCode: 0,
        stdout: 'Line 1\nLine 2\nLine 3',
        stderr: 'warning: something',
        shortMessage: 'Build completed.',
      };

      it('should show only shortMessage in TERSE mode', () => {
        const output = new TerseOutput({ verbosity: Verbosity.TERSE });
        const result = output.fromExec(successExec);

        expect(result.success).toBe(true);
        expect(result.output).toBe('Build completed.');
        expect(result.output).not.toContain('Line 1');
      });

      it('should show message and summary in NORMAL mode', () => {
        const output = new TerseOutput({ verbosity: Verbosity.NORMAL });
        const result = output.fromExec(successExec);

        expect(result.success).toBe(true);
        expect(result.output).toContain('Build completed.');
        expect(result.output).toContain('Line 1');
      });

      it('should show full output in VERBOSE mode', () => {
        const output = new TerseOutput({ verbosity: Verbosity.VERBOSE });
        const result = output.fromExec(successExec);

        expect(result.success).toBe(true);
        expect(result.output).toContain('Build completed.');
        expect(result.output).toContain('stdout:');
        expect(result.output).toContain('Line 1');
        expect(result.output).toContain('Line 2');
        expect(result.output).toContain('stderr:');
        expect(result.output).toContain('warning: something');
      });

      it('should show full error on failure regardless of verbosity', () => {
        const output = new TerseOutput({ verbosity: Verbosity.TERSE });
        const failExec: ExecResult = {
          exitCode: 1,
          stdout: 'partial output',
          stderr: 'error details',
        };

        const result = output.fromExec(failExec);

        expect(result.success).toBe(false);
        expect(result.output).toContain('error details');
        expect(result.output).toContain('partial output');
      });
    });
  });
});

describe('toMcpToolResult()', () => {
  it('should convert success result to MCP format', () => {
    const terseResult = TerseOutput.success('Done.');
    const mcpResult = toMcpToolResult(terseResult);

    expect(mcpResult.content).toHaveLength(1);
    expect(mcpResult.content[0]).toEqual({ type: 'text', text: 'Done.' });
    expect(mcpResult.isError).toBe(false);
  });

  it('should convert failure result to MCP format', () => {
    const terseResult = TerseOutput.failure('Error message');
    const mcpResult = toMcpToolResult(terseResult);

    expect(mcpResult.content).toHaveLength(1);
    expect(mcpResult.content[0].type).toBe('text');
    expect((mcpResult.content[0] as { type: 'text'; text: string }).text).toContain('Error message');
    expect(mcpResult.isError).toBe(true);
  });

  it('should handle empty output', () => {
    const terseResult = TerseOutput.success('');
    const mcpResult = toMcpToolResult(terseResult);

    expect(mcpResult.content).toHaveLength(1);
    expect(mcpResult.content[0]).toEqual({ type: 'text', text: '' });
    expect(mcpResult.isError).toBe(false);
  });
});
