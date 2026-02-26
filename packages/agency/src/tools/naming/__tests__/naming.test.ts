import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  ToolPrefixValues,
  ToolPrefixSchema,
  type ToolPrefix,
} from '../prefix.js';
import { ActionNameSchema } from '../action.js';
import {
  ToolNameSchema,
  parseToolName,
  createToolName,
} from '../tool-name.js';
import {
  ToolValidationErrorCode,
  ToolValidationErrorCodeSchema,
  ToolValidationErrorSchema,
  createInvalidPrefixError,
  createInvalidActionNameError,
  createMissingPrefixError,
  createMalformedNameError,
  validateToolNameStructured,
  validateToolNameWithResult,
} from '../validation-error.js';
import { ToolDefinitionSchema, type ToolDefinition } from '../tool-definition.js';
import type { ToolCatalogOptions, AliasMap } from '../tool-catalog.js';

// =============================================================================
// ToolPrefixSchema
// =============================================================================

describe('ToolPrefixSchema', () => {
  const ALL_PREFIXES: readonly string[] = [
    'source_control',
    'build',
    'run',
    'test',
    'debug',
    'deploy',
    'humancy',
    'file',
    'database',
    'docs',
  ];

  it('has exactly 10 prefixes', () => {
    expect(ToolPrefixValues).toHaveLength(10);
  });

  it.each(ALL_PREFIXES)('accepts valid prefix "%s"', (prefix) => {
    const result = ToolPrefixSchema.safeParse(prefix);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(prefix);
    }
  });

  it('ToolPrefixValues matches expected prefixes', () => {
    expect([...ToolPrefixValues]).toEqual(ALL_PREFIXES);
  });

  describe('invalid prefixes', () => {
    it.each([
      ['invalid', 'arbitrary string'],
      ['sourceControl', 'camelCase variant'],
      ['SOURCE_CONTROL', 'uppercase variant'],
      ['source-control', 'kebab-case variant'],
      ['Build', 'capitalized'],
      ['', 'empty string'],
    ])('rejects "%s" (%s)', (value) => {
      expect(ToolPrefixSchema.safeParse(value).success).toBe(false);
    });

    it.each([
      [' build', 'leading whitespace'],
      ['build ', 'trailing whitespace'],
      [' build ', 'surrounding whitespace'],
    ])('rejects "%s" (%s)', (value) => {
      expect(ToolPrefixSchema.safeParse(value).success).toBe(false);
    });

    it.each([123, null, undefined, {}, [], true])(
      'rejects non-string value %j',
      (value) => {
        expect(ToolPrefixSchema.safeParse(value).success).toBe(false);
      }
    );
  });
});

// =============================================================================
// ActionNameSchema
// =============================================================================

describe('ActionNameSchema', () => {
  describe('valid action names', () => {
    it.each([
      ['commit', 'simple lowercase'],
      ['run_unit_tests', 'multi-word snake_case'],
      ['install_dependencies', 'long snake_case'],
      ['a', 'single character'],
      ['test123', 'with trailing numbers'],
      ['run_v2', 'with version number'],
      ['x1y2z3', 'mixed letters and numbers'],
      ['a_b_c_d', 'many underscores'],
    ])('accepts "%s" (%s)', (value) => {
      const result = ActionNameSchema.safeParse(value);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(value);
      }
    });
  });

  describe('invalid action names', () => {
    it.each([
      ['runTests', 'camelCase'],
      ['commitAndPush', 'camelCase multi-word'],
      ['RunTests', 'PascalCase'],
      ['TEST', 'all uppercase'],
      ['Install', 'capitalized'],
      ['1test', 'starts with number'],
      ['123', 'all numbers'],
      ['run-tests', 'kebab-case (hyphens)'],
      ['', 'empty string'],
      ['_hidden', 'leading underscore'],
      ['test action', 'contains space'],
      ['test.action', 'contains dot'],
    ])('rejects "%s" (%s)', (value) => {
      expect(ActionNameSchema.safeParse(value).success).toBe(false);
    });

    it('provides descriptive error message', () => {
      const result = ActionNameSchema.safeParse('RunTests');
      expect(result.success).toBe(false);
      if (!result.success) {
        const message = result.error.issues[0].message;
        expect(message).toContain('snake_case');
      }
    });
  });
});

// =============================================================================
// ToolNameSchema
// =============================================================================

describe('ToolNameSchema', () => {
  describe('valid tool names', () => {
    it.each([
      'source_control.commit',
      'build.compile',
      'run.execute',
      'test.run_unit_tests',
      'debug.inspect',
      'deploy.release',
      'humancy.prompt',
      'file.read',
      'database.query',
      'docs.generate',
    ])('accepts "%s"', (name) => {
      const result = ToolNameSchema.safeParse(name);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(name);
      }
    });

    it('accepts action with underscores', () => {
      expect(ToolNameSchema.safeParse('build.run_all_tests').success).toBe(true);
    });

    it('accepts action with numbers', () => {
      expect(ToolNameSchema.safeParse('build.install_v2').success).toBe(true);
    });

    it('accepts all prefix+action combinations', () => {
      for (const prefix of ToolPrefixValues) {
        const result = ToolNameSchema.safeParse(`${prefix}.some_action`);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid tool names', () => {
    it('rejects missing prefix (bare action)', () => {
      expect(ToolNameSchema.safeParse('commit').success).toBe(false);
    });

    it('rejects invalid prefix', () => {
      expect(ToolNameSchema.safeParse('invalid.commit').success).toBe(false);
    });

    it('rejects camelCase action', () => {
      expect(ToolNameSchema.safeParse('source_control.commitCode').success).toBe(false);
    });

    it('rejects multiple dots', () => {
      expect(ToolNameSchema.safeParse('source.control.commit').success).toBe(false);
    });

    it('rejects empty string', () => {
      expect(ToolNameSchema.safeParse('').success).toBe(false);
    });

    it('rejects action starting with number', () => {
      expect(ToolNameSchema.safeParse('build.1invalid').success).toBe(false);
    });

    it('rejects action with uppercase', () => {
      expect(ToolNameSchema.safeParse('build.Install').success).toBe(false);
    });

    it('rejects trailing dot (empty action)', () => {
      expect(ToolNameSchema.safeParse('build.').success).toBe(false);
    });

    it('rejects leading dot (empty prefix)', () => {
      expect(ToolNameSchema.safeParse('.commit').success).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(ToolNameSchema.safeParse(123).success).toBe(false);
      expect(ToolNameSchema.safeParse(null).success).toBe(false);
    });
  });
});

// =============================================================================
// parseToolName
// =============================================================================

describe('parseToolName', () => {
  it('extracts prefix and action from valid tool name', () => {
    const result = parseToolName('source_control.commit');
    expect(result).toEqual({ prefix: 'source_control', action: 'commit' });
  });

  it('parses action with underscores', () => {
    const result = parseToolName('test.run_unit_tests');
    expect(result).toEqual({ prefix: 'test', action: 'run_unit_tests' });
  });

  it.each(ToolPrefixValues)('parses all valid prefixes: %s', (prefix) => {
    const result = parseToolName(`${prefix}.some_action`);
    expect(result).toBeDefined();
    expect(result!.prefix).toBe(prefix);
    expect(result!.action).toBe('some_action');
  });

  it('returns undefined for invalid format (no dot)', () => {
    expect(parseToolName('invalid')).toBeUndefined();
  });

  it('returns undefined for invalid prefix', () => {
    expect(parseToolName('unknown.action')).toBeUndefined();
  });

  it('returns undefined for camelCase action', () => {
    expect(parseToolName('build.installDependencies')).toBeUndefined();
  });

  it('returns undefined for multiple dots', () => {
    expect(parseToolName('source.control.commit')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(parseToolName('')).toBeUndefined();
  });

  it('round-trips with createToolName for all prefixes', () => {
    for (const prefix of ToolPrefixValues) {
      const name = createToolName(prefix, 'test_action');
      const parsed = parseToolName(name);
      expect(parsed).toEqual({ prefix, action: 'test_action' });
    }
  });
});

// =============================================================================
// createToolName
// =============================================================================

describe('createToolName', () => {
  it('creates valid tool name from prefix and action', () => {
    expect(createToolName('source_control', 'commit')).toBe('source_control.commit');
  });

  it('creates name with underscored action', () => {
    expect(createToolName('test', 'run_unit_tests')).toBe('test.run_unit_tests');
  });

  it('creates name with numbered action', () => {
    expect(createToolName('build', 'install_v2')).toBe('build.install_v2');
  });

  it.each(ToolPrefixValues)('works with prefix "%s"', (prefix) => {
    const result = createToolName(prefix, 'action');
    expect(result).toBe(`${prefix}.action`);
  });

  it('throws for camelCase action', () => {
    expect(() => createToolName('build', 'installDependencies')).toThrow();
  });

  it('throws for action starting with number', () => {
    expect(() => createToolName('build', '1invalid')).toThrow();
  });

  it('throws for uppercase action', () => {
    expect(() => createToolName('build', 'Install')).toThrow();
  });

  it('throws for empty action', () => {
    expect(() => createToolName('build', '')).toThrow();
  });

  it('produced name passes ToolNameSchema validation', () => {
    const name = createToolName('deploy', 'push_to_prod');
    expect(ToolNameSchema.safeParse(name).success).toBe(true);
  });

  it('produced name is parseable by parseToolName', () => {
    const name = createToolName('file', 'read_contents');
    const parsed = parseToolName(name);
    expect(parsed).toEqual({ prefix: 'file', action: 'read_contents' });
  });
});

// =============================================================================
// ToolValidationErrorCode
// =============================================================================

describe('ToolValidationErrorCode', () => {
  it('defines INVALID_PREFIX', () => {
    expect(ToolValidationErrorCode.INVALID_PREFIX).toBe('INVALID_PREFIX');
  });

  it('defines INVALID_ACTION_NAME', () => {
    expect(ToolValidationErrorCode.INVALID_ACTION_NAME).toBe('INVALID_ACTION_NAME');
  });

  it('defines MISSING_PREFIX', () => {
    expect(ToolValidationErrorCode.MISSING_PREFIX).toBe('MISSING_PREFIX');
  });

  it('defines MALFORMED_NAME', () => {
    expect(ToolValidationErrorCode.MALFORMED_NAME).toBe('MALFORMED_NAME');
  });

  it('has exactly 4 error codes', () => {
    expect(Object.keys(ToolValidationErrorCode)).toHaveLength(4);
  });
});

// =============================================================================
// ToolValidationErrorCodeSchema
// =============================================================================

describe('ToolValidationErrorCodeSchema', () => {
  it.each(['INVALID_PREFIX', 'INVALID_ACTION_NAME', 'MISSING_PREFIX', 'MALFORMED_NAME'])(
    'accepts valid code "%s"',
    (code) => {
      expect(ToolValidationErrorCodeSchema.safeParse(code).success).toBe(true);
    }
  );

  it.each(['INVALID_CODE', 'unknown', '', 'invalid_prefix'])(
    'rejects invalid code "%s"',
    (code) => {
      expect(ToolValidationErrorCodeSchema.safeParse(code).success).toBe(false);
    }
  );
});

// =============================================================================
// ToolValidationErrorSchema
// =============================================================================

describe('ToolValidationErrorSchema', () => {
  it('accepts error with code and message', () => {
    const result = ToolValidationErrorSchema.safeParse({
      code: 'INVALID_PREFIX',
      message: 'Invalid prefix "foo"',
    });
    expect(result.success).toBe(true);
  });

  it('accepts error with suggestions array', () => {
    const result = ToolValidationErrorSchema.safeParse({
      code: 'INVALID_PREFIX',
      message: 'Invalid prefix "foo"',
      suggestions: ['Use a valid prefix'],
    });
    expect(result.success).toBe(true);
  });

  it('accepts error without suggestions (optional)', () => {
    const result = ToolValidationErrorSchema.safeParse({
      code: 'MISSING_PREFIX',
      message: 'Missing prefix',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing code', () => {
    expect(
      ToolValidationErrorSchema.safeParse({ message: 'Some error' }).success
    ).toBe(false);
  });

  it('rejects missing message', () => {
    expect(
      ToolValidationErrorSchema.safeParse({ code: 'INVALID_PREFIX' }).success
    ).toBe(false);
  });

  it('rejects invalid code value', () => {
    expect(
      ToolValidationErrorSchema.safeParse({
        code: 'NOT_A_CODE',
        message: 'Some error',
      }).success
    ).toBe(false);
  });

  it('validates errors produced by factory functions', () => {
    const error = createInvalidPrefixError('foo');
    expect(ToolValidationErrorSchema.safeParse(error).success).toBe(true);
  });
});

// =============================================================================
// Error factory functions
// =============================================================================

describe('createInvalidPrefixError', () => {
  it('returns INVALID_PREFIX code', () => {
    expect(createInvalidPrefixError('foo').code).toBe('INVALID_PREFIX');
  });

  it('includes the invalid prefix in message', () => {
    expect(createInvalidPrefixError('unknown').message).toContain('unknown');
  });

  it('includes valid prefixes in suggestions', () => {
    const error = createInvalidPrefixError('foo');
    const text = error.suggestions!.join(' ');
    for (const prefix of ToolPrefixValues) {
      expect(text).toContain(prefix);
    }
  });

  it('provides an example suggestion', () => {
    const error = createInvalidPrefixError('commit');
    expect(error.suggestions!.some((s) => s.includes('Example'))).toBe(true);
  });

  it('passes ToolValidationErrorSchema', () => {
    expect(ToolValidationErrorSchema.safeParse(createInvalidPrefixError('x')).success).toBe(true);
  });
});

describe('createInvalidActionNameError', () => {
  it('returns INVALID_ACTION_NAME code', () => {
    expect(createInvalidActionNameError('RunTests').code).toBe('INVALID_ACTION_NAME');
  });

  it('includes the invalid action in message', () => {
    expect(createInvalidActionNameError('badName').message).toContain('badName');
  });

  it('suggests snake_case for camelCase input', () => {
    const error = createInvalidActionNameError('runTests');
    expect(error.suggestions!.some((s) => s.includes('run_tests'))).toBe(true);
  });

  it('suggests underscores for hyphens', () => {
    const error = createInvalidActionNameError('run-tests');
    expect(error.suggestions!.some((s) => s.includes('run_tests'))).toBe(true);
  });

  it('handles names starting with number', () => {
    const error = createInvalidActionNameError('1test');
    expect(
      error.suggestions!.some((s) => s.toLowerCase().includes('start with a lowercase letter'))
    ).toBe(true);
  });

  it('provides general guidance for unrecognized patterns', () => {
    const error = createInvalidActionNameError('');
    expect(error.suggestions!.some((s) => s.includes('snake_case'))).toBe(true);
  });

  it('passes ToolValidationErrorSchema', () => {
    expect(
      ToolValidationErrorSchema.safeParse(createInvalidActionNameError('Bad')).success
    ).toBe(true);
  });
});

describe('createMissingPrefixError', () => {
  it('returns MISSING_PREFIX code', () => {
    expect(createMissingPrefixError('commit').code).toBe('MISSING_PREFIX');
  });

  it('includes the name in message', () => {
    expect(createMissingPrefixError('my_action').message).toContain('my_action');
  });

  it('suggests adding a prefix', () => {
    const error = createMissingPrefixError('commit');
    const text = error.suggestions!.join(' ');
    expect(text).toMatch(/source_control\.commit|build\.commit/);
  });

  it('lists valid prefixes', () => {
    const error = createMissingPrefixError('action');
    const text = error.suggestions!.join(' ');
    expect(text).toContain('source_control');
  });

  it('passes ToolValidationErrorSchema', () => {
    expect(
      ToolValidationErrorSchema.safeParse(createMissingPrefixError('x')).success
    ).toBe(true);
  });
});

describe('createMalformedNameError', () => {
  it('returns MALFORMED_NAME code', () => {
    expect(createMalformedNameError('a.b.c').code).toBe('MALFORMED_NAME');
  });

  it('includes the name in message', () => {
    expect(createMalformedNameError('bad.name.here').message).toContain('bad.name.here');
  });

  it('mentions single dot for multiple-dot names', () => {
    const error = createMalformedNameError('a.b.c');
    expect(error.suggestions!.some((s) => s.includes('exactly one dot'))).toBe(true);
  });

  it('provides format guidance', () => {
    const error = createMalformedNameError('x.y.z');
    expect(error.suggestions!.some((s) => s.includes('{prefix}.{action}'))).toBe(true);
  });

  it('handles zero-dot names', () => {
    const error = createMalformedNameError('nodots');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.length).toBeGreaterThan(0);
  });

  it('passes ToolValidationErrorSchema', () => {
    expect(
      ToolValidationErrorSchema.safeParse(createMalformedNameError('x')).success
    ).toBe(true);
  });
});

// =============================================================================
// validateToolNameStructured
// =============================================================================

describe('validateToolNameStructured', () => {
  describe('valid tool names return undefined', () => {
    it.each([
      'source_control.commit',
      'build.compile',
      'run.execute',
      'test.run_tests',
      'debug.inspect',
      'deploy.release',
      'humancy.prompt',
      'file.read',
      'database.query',
      'docs.generate',
      'source_control.push_changes',
      'test.run_v2',
      'build.compile123',
    ])('returns undefined for "%s"', (name) => {
      expect(validateToolNameStructured(name)).toBeUndefined();
    });
  });

  describe('INVALID_PREFIX errors', () => {
    it('returns INVALID_PREFIX for unknown prefix', () => {
      const error = validateToolNameStructured('unknown.action');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_PREFIX');
    });

    it('returns INVALID_PREFIX for typo in prefix', () => {
      const error = validateToolNameStructured('soure_control.commit');
      expect(error!.code).toBe('INVALID_PREFIX');
    });

    it('returns INVALID_PREFIX for camelCase prefix', () => {
      const error = validateToolNameStructured('sourceControl.commit');
      expect(error!.code).toBe('INVALID_PREFIX');
    });
  });

  describe('INVALID_ACTION_NAME errors', () => {
    it('detects camelCase action', () => {
      const error = validateToolNameStructured('source_control.runTests');
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('detects hyphenated action', () => {
      const error = validateToolNameStructured('build.run-tests');
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('detects action starting with number', () => {
      const error = validateToolNameStructured('test.123test');
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('detects action starting with underscore', () => {
      const error = validateToolNameStructured('test._hidden');
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('detects empty action (trailing dot)', () => {
      const error = validateToolNameStructured('build.');
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });
  });

  describe('MISSING_PREFIX errors', () => {
    it('detects names without dots', () => {
      const error = validateToolNameStructured('commit');
      expect(error!.code).toBe('MISSING_PREFIX');
    });

    it('detects multi-word names without dots', () => {
      const error = validateToolNameStructured('run_tests');
      expect(error!.code).toBe('MISSING_PREFIX');
    });
  });

  describe('MALFORMED_NAME errors', () => {
    it('detects multiple dots', () => {
      const error = validateToolNameStructured('source_control.git.commit');
      expect(error!.code).toBe('MALFORMED_NAME');
    });

    it('detects many dots', () => {
      const error = validateToolNameStructured('a.b.c.d');
      expect(error!.code).toBe('MALFORMED_NAME');
    });

    it('detects empty string', () => {
      const error = validateToolNameStructured('');
      expect(error!.code).toBe('MALFORMED_NAME');
    });

    it('detects whitespace only', () => {
      const error = validateToolNameStructured('   ');
      expect(error!.code).toBe('MALFORMED_NAME');
    });
  });
});

// =============================================================================
// validateToolNameWithResult
// =============================================================================

describe('validateToolNameWithResult', () => {
  describe('success cases', () => {
    it('returns success with value for valid name', () => {
      const result = validateToolNameWithResult('source_control.commit');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('source_control.commit');
      }
    });

    it('returns success for all valid prefixes', () => {
      for (const prefix of ToolPrefixValues) {
        const result = validateToolNameWithResult(`${prefix}.action`);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('failure cases', () => {
    it('returns failure with INVALID_PREFIX error', () => {
      const result = validateToolNameWithResult('invalid.action');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PREFIX');
      }
    });

    it('returns failure with INVALID_ACTION_NAME error', () => {
      const result = validateToolNameWithResult('build.invalidAction');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ACTION_NAME');
      }
    });

    it('returns failure with MISSING_PREFIX error', () => {
      const result = validateToolNameWithResult('noprefix');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_PREFIX');
      }
    });

    it('returns failure with MALFORMED_NAME error', () => {
      const result = validateToolNameWithResult('too.many.dots');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MALFORMED_NAME');
      }
    });

    it('includes suggestions in error', () => {
      const result = validateToolNameWithResult('invalid.action');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.suggestions).toBeDefined();
        expect(result.error.suggestions!.length).toBeGreaterThan(0);
      }
    });
  });
});

// =============================================================================
// ToolDefinitionSchema
// =============================================================================

describe('ToolDefinitionSchema', () => {
  function createValidDefinition(overrides: Partial<ToolDefinition> = {}): Record<string, unknown> {
    return {
      name: 'source_control.commit',
      prefix: 'source_control',
      action: 'commit',
      description: 'Commit staged changes to the repository',
      parameters: z.object({ message: z.string() }),
      returns: z.object({ hash: z.string() }),
      ...overrides,
    };
  }

  describe('valid definitions', () => {
    it('accepts a minimal valid tool definition', () => {
      const result = ToolDefinitionSchema.safeParse(createValidDefinition());
      expect(result.success).toBe(true);
    });

    it('accepts definition with aliases', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ aliases: ['build.compile' as ToolDefinition['name']] })
      );
      expect(result.success).toBe(true);
    });

    it('accepts definition with deprecation info', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({
          deprecated: true,
          deprecatedMessage: 'Use source_control.push instead',
        })
      );
      expect(result.success).toBe(true);
    });

    it('accepts definition with modes', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ modes: ['development', 'staging'] })
      );
      expect(result.success).toBe(true);
    });

    it('accepts definition with all optional fields', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({
          aliases: ['build.compile' as ToolDefinition['name']],
          deprecated: false,
          deprecatedMessage: 'Not deprecated but has message',
          modes: ['production'],
        })
      );
      expect(result.success).toBe(true);
    });

    it('accepts various prefix/action combinations', () => {
      for (const prefix of ToolPrefixValues) {
        const result = ToolDefinitionSchema.safeParse(
          createValidDefinition({
            name: `${prefix}.test_action` as ToolDefinition['name'],
            prefix: prefix as ToolDefinition['prefix'],
            action: 'test_action',
          })
        );
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid definitions — missing required fields', () => {
    it('rejects missing name', () => {
      const def = createValidDefinition();
      delete def.name;
      expect(ToolDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects missing prefix', () => {
      const def = createValidDefinition();
      delete def.prefix;
      expect(ToolDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects missing action', () => {
      const def = createValidDefinition();
      delete def.action;
      expect(ToolDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects missing description', () => {
      const def = createValidDefinition();
      delete def.description;
      expect(ToolDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects missing parameters', () => {
      const def = createValidDefinition();
      delete def.parameters;
      expect(ToolDefinitionSchema.safeParse(def).success).toBe(false);
    });

    it('rejects missing returns', () => {
      const def = createValidDefinition();
      delete def.returns;
      expect(ToolDefinitionSchema.safeParse(def).success).toBe(false);
    });
  });

  describe('invalid definitions — wrong field values', () => {
    it('rejects invalid tool name', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ name: 'badname' as ToolDefinition['name'] })
      );
      expect(result.success).toBe(false);
    });

    it('rejects invalid prefix', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ prefix: 'invalid_prefix' as ToolDefinition['prefix'] })
      );
      expect(result.success).toBe(false);
    });

    it('rejects camelCase action', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ action: 'commitCode' })
      );
      expect(result.success).toBe(false);
    });

    it('rejects empty description', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ description: '' })
      );
      expect(result.success).toBe(false);
    });

    it('rejects non-Zod-schema parameters', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ parameters: { type: 'object' } as unknown })
      );
      expect(result.success).toBe(false);
    });

    it('rejects non-Zod-schema returns', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ returns: 'string' as unknown })
      );
      expect(result.success).toBe(false);
    });

    it('rejects null parameters', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ parameters: null as unknown })
      );
      expect(result.success).toBe(false);
    });

    it('rejects invalid alias in aliases array', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ aliases: ['not_valid_name' as ToolDefinition['name']] })
      );
      expect(result.success).toBe(false);
    });
  });

  describe('Zod schema detection for parameters/returns', () => {
    it('accepts z.string() as parameters', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ parameters: z.string() })
      );
      expect(result.success).toBe(true);
    });

    it('accepts z.array() as returns', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ returns: z.array(z.string()) })
      );
      expect(result.success).toBe(true);
    });

    it('accepts z.void() as returns', () => {
      const result = ToolDefinitionSchema.safeParse(
        createValidDefinition({ returns: z.void() })
      );
      expect(result.success).toBe(true);
    });
  });
});

// =============================================================================
// ToolCatalogOptions and AliasMap types (compile-time checks)
// =============================================================================

describe('ToolCatalogOptions', () => {
  it('type allows all optional fields', () => {
    const opts: ToolCatalogOptions = {};
    expect(opts.allowDuplicates).toBeUndefined();
    expect(opts.validateOnRegister).toBeUndefined();
  });

  it('type allows setting fields', () => {
    const opts: ToolCatalogOptions = {
      allowDuplicates: true,
      validateOnRegister: false,
    };
    expect(opts.allowDuplicates).toBe(true);
    expect(opts.validateOnRegister).toBe(false);
  });
});

describe('AliasMap', () => {
  it('is a Map from ToolName to ToolName', () => {
    const map: AliasMap = new Map();
    const alias = createToolName('build', 'compile');
    const target = createToolName('build', 'install');
    map.set(alias, target);
    expect(map.get(alias)).toBe(target);
    expect(map.size).toBe(1);
  });
});

// =============================================================================
// Integration: full round-trip validation
// =============================================================================

describe('naming module integration', () => {
  it('createToolName -> parseToolName -> validateToolNameStructured round-trip', () => {
    const name = createToolName('deploy', 'push_to_staging');
    const parsed = parseToolName(name);
    expect(parsed).toEqual({ prefix: 'deploy', action: 'push_to_staging' });
    expect(validateToolNameStructured(name)).toBeUndefined();
  });

  it('createToolName -> ToolNameSchema -> ToolDefinitionSchema round-trip', () => {
    const name = createToolName('test', 'run_integration');
    expect(ToolNameSchema.safeParse(name).success).toBe(true);

    const def = {
      name,
      prefix: 'test' as ToolPrefix,
      action: 'run_integration',
      description: 'Run integration tests',
      parameters: z.object({ suite: z.string() }),
      returns: z.object({ passed: z.boolean() }),
    };
    expect(ToolDefinitionSchema.safeParse(def).success).toBe(true);
  });

  it('validateToolNameWithResult agrees with validateToolNameStructured', () => {
    const testCases = [
      'source_control.commit',
      'invalid.action',
      'noprefix',
      'too.many.dots',
      'build.RunTests',
      '',
    ];

    for (const name of testCases) {
      const structured = validateToolNameStructured(name);
      const result = validateToolNameWithResult(name);

      if (structured === undefined) {
        expect(result.success).toBe(true);
      } else {
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(structured.code);
        }
      }
    }
  });
});
