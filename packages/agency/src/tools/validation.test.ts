import { describe, it, expect } from 'vitest';
import { validateToolName } from './validation.js';
import { STANDARD_PREFIXES, LENGTH_THRESHOLDS } from './prefixes.js';
import {
  ToolPrefixValues,
  ToolPrefixSchema,
  ActionNameSchema,
  ToolNameSchema,
  parseToolName,
  createToolName,
  ToolValidationErrorCode,
  ToolValidationErrorCodeSchema,
  ToolValidationErrorSchema,
  createInvalidPrefixError,
  createInvalidActionNameError,
  createMissingPrefixError,
  createMalformedNameError,
  validateToolNameStructured,
  validateToolNameWithResult,
} from './naming/index.js';

// ─── Existing agency tests: validateToolName public API ─────────────────────

describe('validateToolName', () => {
  describe('valid standard prefix names', () => {
    it('should accept valid tool names with standard prefixes', () => {
      const result = validateToolName('source_control.commit');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it.each(STANDARD_PREFIXES)(
      'should accept %s prefix without warning',
      (prefix) => {
        const result = validateToolName(`${prefix}.some_action`);

        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.warnings).toHaveLength(0);
      }
    );

    it('should accept multi-word action names in snake_case', () => {
      const result = validateToolName('build.run_all_tests');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('custom prefix warning (permissive mode)', () => {
    it('should warn but validate custom prefix in permissive mode', () => {
      const result = validateToolName('custom.action');

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('Using custom prefix: custom');
      expect(result.warnings[0]).toContain('Standard prefixes');
    });

    it('should include all standard prefixes in warning message', () => {
      const result = validateToolName('myprefix.do_something');

      expect(result.warnings[0]).toContain(STANDARD_PREFIXES.join(', '));
    });
  });

  describe('custom prefix error (strict mode)', () => {
    it('should reject custom prefix in strict mode', () => {
      const result = validateToolName('custom.action', { strict: true });

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain(
        'Custom prefix not allowed in strict mode: custom'
      );
    });

    it('should accept standard prefix in strict mode', () => {
      const result = validateToolName('build.compile', { strict: true });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('invalid formats (no dot, multiple dots, empty parts)', () => {
    it('should reject name without dot', () => {
      const result = validateToolName('nodothere');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe(
        'Tool name must contain exactly one dot separator'
      );
    });

    it('should reject name with multiple dots', () => {
      const result = validateToolName('too.many.dots');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toBe(
        'Tool name must contain exactly one dot separator'
      );
    });

    it('should reject empty prefix', () => {
      const result = validateToolName('.action');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prefix cannot be empty');
    });

    it('should reject empty action', () => {
      const result = validateToolName('prefix.');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Action name cannot be empty');
    });

    it('should reject completely empty name', () => {
      const result = validateToolName('');

      expect(result.valid).toBe(false);
    });

    it('should reject just a dot', () => {
      const result = validateToolName('.');

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Prefix cannot be empty');
      expect(result.errors).toContain('Action name cannot be empty');
    });
  });

  describe('snake_case validation', () => {
    it('should reject uppercase in prefix', () => {
      const result = validateToolName('Build.action');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Prefix must be snake_case');
    });

    it('should reject uppercase in action', () => {
      const result = validateToolName('build.RunTests');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Action must be snake_case');
    });

    it('should reject hyphens (kebab-case)', () => {
      const result = validateToolName('source-control.commit');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Prefix must be snake_case');
    });

    it('should reject leading underscore', () => {
      const result = validateToolName('_hidden.action');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Prefix must be snake_case');
    });

    it('should reject starting with number', () => {
      const result = validateToolName('123start.action');

      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Prefix must be snake_case');
    });

    it('should accept numbers after first character', () => {
      const result = validateToolName('tool2.action3');

      expect(result.valid).toBe(true);
    });

    it('should accept underscores between words', () => {
      const result = validateToolName('my_custom.do_the_thing');

      expect(result.valid).toBe(true);
    });
  });

  describe('length threshold warnings', () => {
    it('should warn when prefix exceeds threshold', () => {
      const longPrefix = 'a'.repeat(LENGTH_THRESHOLDS.prefix + 1);
      const result = validateToolName(`${longPrefix}.action`);

      expect(result.valid).toBe(true);
      expect(result.warnings.some((w) => w.includes('Prefix exceeds'))).toBe(
        true
      );
    });

    it('should warn when action exceeds threshold', () => {
      const longAction = 'a'.repeat(LENGTH_THRESHOLDS.action + 1);
      // Use a standard prefix to avoid custom prefix warning
      const result = validateToolName(`build.${longAction}`);

      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('Action name exceeds'))
      ).toBe(true);
    });

    it('should warn when total name exceeds threshold', () => {
      // Create a name that exceeds total but not individual thresholds
      const prefix = 'a'.repeat(15);
      const action = 'b'.repeat(LENGTH_THRESHOLDS.total - 15);
      const result = validateToolName(`${prefix}.${action}`);

      expect(result.valid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('Tool name exceeds'))
      ).toBe(true);
    });

    it('should not warn when within all thresholds', () => {
      const result = validateToolName('build.compile');

      expect(result.warnings).toHaveLength(0);
    });

    it('should include actual lengths in warning message', () => {
      const longPrefix = 'a'.repeat(LENGTH_THRESHOLDS.prefix + 5);
      const result = validateToolName(`${longPrefix}.action`);

      const warning = result.warnings.find((w) => w.includes('Prefix exceeds'));
      expect(warning).toContain(`${longPrefix.length}`);
      expect(warning).toContain(`${LENGTH_THRESHOLDS.prefix}`);
    });
  });

  describe('combined scenarios', () => {
    it('should accumulate multiple warnings', () => {
      // Custom prefix (warning) + long action (warning)
      const longAction = 'a'.repeat(LENGTH_THRESHOLDS.action + 1);
      const result = validateToolName(`custom.${longAction}`);

      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThanOrEqual(2);
    });

    it('should stop at format errors before checking prefix standard', () => {
      const result = validateToolName('INVALID.ALSO_INVALID');

      expect(result.valid).toBe(false);
      // Should have snake_case errors, not custom prefix error
      expect(
        result.errors.some((e) => e.includes('Prefix must be snake_case'))
      ).toBe(true);
    });
  });
});

// ─── Migrated from contracts: ToolPrefixSchema ──────────────────────────────

describe('ToolPrefixSchema', () => {
  describe('valid prefixes', () => {
    it('accepts "source_control" prefix', () => {
      const result = ToolPrefixSchema.safeParse('source_control');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('source_control');
      }
    });

    it('accepts "build" prefix', () => {
      const result = ToolPrefixSchema.safeParse('build');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('build');
      }
    });

    it('accepts "run" prefix', () => {
      const result = ToolPrefixSchema.safeParse('run');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('run');
      }
    });

    it('accepts "test" prefix', () => {
      const result = ToolPrefixSchema.safeParse('test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test');
      }
    });

    it('accepts "debug" prefix', () => {
      const result = ToolPrefixSchema.safeParse('debug');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('debug');
      }
    });

    it('accepts "deploy" prefix', () => {
      const result = ToolPrefixSchema.safeParse('deploy');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('deploy');
      }
    });

    it('accepts "humancy" prefix', () => {
      const result = ToolPrefixSchema.safeParse('humancy');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('humancy');
      }
    });

    it('accepts "file" prefix', () => {
      const result = ToolPrefixSchema.safeParse('file');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('file');
      }
    });

    it('accepts "database" prefix', () => {
      const result = ToolPrefixSchema.safeParse('database');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('database');
      }
    });

    it('accepts "docs" prefix', () => {
      const result = ToolPrefixSchema.safeParse('docs');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('docs');
      }
    });

    it('accepts all 10 valid prefixes from ToolPrefixValues', () => {
      expect(ToolPrefixValues).toHaveLength(10);
      for (const prefix of ToolPrefixValues) {
        const result = ToolPrefixSchema.safeParse(prefix);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid prefixes', () => {
    it('rejects arbitrary invalid prefix', () => {
      const result = ToolPrefixSchema.safeParse('invalid');
      expect(result.success).toBe(false);
    });

    it('rejects camelCase variant "sourceControl"', () => {
      const result = ToolPrefixSchema.safeParse('sourceControl');
      expect(result.success).toBe(false);
    });

    it('rejects uppercase variant "SOURCE_CONTROL"', () => {
      const result = ToolPrefixSchema.safeParse('SOURCE_CONTROL');
      expect(result.success).toBe(false);
    });

    it('rejects prefix with leading whitespace', () => {
      const result = ToolPrefixSchema.safeParse(' build');
      expect(result.success).toBe(false);
    });

    it('rejects prefix with trailing whitespace', () => {
      const result = ToolPrefixSchema.safeParse('build ');
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = ToolPrefixSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('rejects non-string values', () => {
      expect(ToolPrefixSchema.safeParse(123).success).toBe(false);
      expect(ToolPrefixSchema.safeParse(null).success).toBe(false);
      expect(ToolPrefixSchema.safeParse(undefined).success).toBe(false);
      expect(ToolPrefixSchema.safeParse({}).success).toBe(false);
      expect(ToolPrefixSchema.safeParse([]).success).toBe(false);
    });

    it('rejects prefix with hyphen instead of underscore', () => {
      const result = ToolPrefixSchema.safeParse('source-control');
      expect(result.success).toBe(false);
    });

    it('rejects mixed case variants', () => {
      expect(ToolPrefixSchema.safeParse('Build').success).toBe(false);
      expect(ToolPrefixSchema.safeParse('BUILD').success).toBe(false);
      expect(ToolPrefixSchema.safeParse('Database').success).toBe(false);
    });
  });
});

// ─── Migrated from contracts: ActionNameSchema ──────────────────────────────

describe('ActionNameSchema', () => {
  describe('valid action names', () => {
    it('accepts simple lowercase action name', () => {
      const result = ActionNameSchema.safeParse('commit');
      expect(result.success).toBe(true);
    });

    it('accepts snake_case action name', () => {
      const result = ActionNameSchema.safeParse('run_unit_tests');
      expect(result.success).toBe(true);
    });

    it('accepts multi-word snake_case action name', () => {
      const result = ActionNameSchema.safeParse('install_dependencies');
      expect(result.success).toBe(true);
    });

    it('accepts single character action name', () => {
      const result = ActionNameSchema.safeParse('a');
      expect(result.success).toBe(true);
    });

    it('accepts action name with numbers', () => {
      const result = ActionNameSchema.safeParse('test123');
      expect(result.success).toBe(true);
    });
  });

  describe('invalid action names - camelCase', () => {
    it('rejects camelCase action name', () => {
      const result = ActionNameSchema.safeParse('runTests');
      expect(result.success).toBe(false);
    });

    it('rejects camelCase with multiple words', () => {
      const result = ActionNameSchema.safeParse('commitAndPush');
      expect(result.success).toBe(false);
    });
  });

  describe('invalid action names - starting with number', () => {
    it('rejects action name starting with number', () => {
      const result = ActionNameSchema.safeParse('1test');
      expect(result.success).toBe(false);
    });

    it('rejects action name that is only numbers', () => {
      const result = ActionNameSchema.safeParse('123');
      expect(result.success).toBe(false);
    });
  });

  describe('invalid action names - containing hyphens', () => {
    it('rejects kebab-case action name', () => {
      const result = ActionNameSchema.safeParse('run-tests');
      expect(result.success).toBe(false);
    });
  });

  describe('invalid action names - containing uppercase', () => {
    it('rejects PascalCase action name', () => {
      const result = ActionNameSchema.safeParse('RunTests');
      expect(result.success).toBe(false);
    });

    it('rejects all uppercase action name', () => {
      const result = ActionNameSchema.safeParse('TEST');
      expect(result.success).toBe(false);
    });
  });

  describe('invalid action names - empty string', () => {
    it('rejects empty string', () => {
      const result = ActionNameSchema.safeParse('');
      expect(result.success).toBe(false);
    });
  });
});

// ─── Migrated from contracts: ToolNameSchema ────────────────────────────────

describe('ToolNameSchema', () => {
  describe('valid tool names', () => {
    it('accepts source_control.commit', () => {
      const result = ToolNameSchema.safeParse('source_control.commit');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('source_control.commit');
      }
    });

    it('accepts test.run_unit_tests', () => {
      const result = ToolNameSchema.safeParse('test.run_unit_tests');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('test.run_unit_tests');
      }
    });

    it('accepts build.install_dependencies', () => {
      const result = ToolNameSchema.safeParse('build.install_dependencies');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('build.install_dependencies');
      }
    });

    it('accepts all valid prefixes', () => {
      for (const prefix of ToolPrefixValues) {
        const result = ToolNameSchema.safeParse(`${prefix}.action_name`);
        expect(result.success).toBe(true);
      }
    });
  });

  describe('invalid tool names', () => {
    it('rejects missing prefix (just action)', () => {
      const result = ToolNameSchema.safeParse('commit');
      expect(result.success).toBe(false);
    });

    it('rejects invalid prefix', () => {
      const result = ToolNameSchema.safeParse('invalid.commit');
      expect(result.success).toBe(false);
    });

    it('rejects camelCase action', () => {
      const result = ToolNameSchema.safeParse('source_control.commitCode');
      expect(result.success).toBe(false);
    });

    it('rejects multiple dots', () => {
      const result = ToolNameSchema.safeParse('source.control.commit');
      expect(result.success).toBe(false);
    });

    it('rejects empty string', () => {
      const result = ToolNameSchema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('rejects action starting with number', () => {
      const result = ToolNameSchema.safeParse('build.1invalid');
      expect(result.success).toBe(false);
    });

    it('rejects action with uppercase letters', () => {
      const result = ToolNameSchema.safeParse('build.Install');
      expect(result.success).toBe(false);
    });

    it('rejects trailing dot', () => {
      const result = ToolNameSchema.safeParse('build.');
      expect(result.success).toBe(false);
    });

    it('rejects leading dot', () => {
      const result = ToolNameSchema.safeParse('.commit');
      expect(result.success).toBe(false);
    });
  });
});

// ─── Migrated from contracts: parseToolName ─────────────────────────────────

describe('parseToolName', () => {
  it('returns correct prefix and action for valid tool name', () => {
    const result = parseToolName('source_control.commit');
    expect(result).toEqual({
      prefix: 'source_control',
      action: 'commit',
    });
  });

  it('parses tool name with underscores in action', () => {
    const result = parseToolName('test.run_unit_tests');
    expect(result).toEqual({
      prefix: 'test',
      action: 'run_unit_tests',
    });
  });

  it('parses all valid prefixes correctly', () => {
    for (const prefix of ToolPrefixValues) {
      const result = parseToolName(`${prefix}.some_action`);
      expect(result).toBeDefined();
      expect(result?.prefix).toBe(prefix);
      expect(result?.action).toBe('some_action');
    }
  });

  it('returns undefined for invalid tool name format', () => {
    const result = parseToolName('invalid');
    expect(result).toBeUndefined();
  });

  it('returns undefined for invalid prefix', () => {
    const result = parseToolName('unknown.action');
    expect(result).toBeUndefined();
  });

  it('returns undefined for camelCase action', () => {
    const result = parseToolName('build.installDependencies');
    expect(result).toBeUndefined();
  });

  it('returns undefined for multiple dots', () => {
    const result = parseToolName('source.control.commit');
    expect(result).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    const result = parseToolName('');
    expect(result).toBeUndefined();
  });
});

// ─── Migrated from contracts: createToolName ────────────────────────────────

describe('createToolName', () => {
  it('creates valid tool name from prefix and action', () => {
    const result = createToolName('source_control', 'commit');
    expect(result).toBe('source_control.commit');
  });

  it('creates tool name with underscores in action', () => {
    const result = createToolName('test', 'run_unit_tests');
    expect(result).toBe('test.run_unit_tests');
  });

  it('creates tool name with numbers in action', () => {
    const result = createToolName('build', 'install_v2');
    expect(result).toBe('build.install_v2');
  });

  it('works with all valid prefixes', () => {
    for (const prefix of ToolPrefixValues) {
      const result = createToolName(prefix, 'action');
      expect(result).toBe(`${prefix}.action`);
    }
  });

  it('throws for invalid action (camelCase)', () => {
    expect(() => createToolName('build', 'installDependencies')).toThrow();
  });

  it('throws for invalid action (starts with number)', () => {
    expect(() => createToolName('build', '1invalid')).toThrow();
  });

  it('throws for invalid action (uppercase)', () => {
    expect(() => createToolName('build', 'Install')).toThrow();
  });

  it('created tool name passes schema validation', () => {
    const toolName = createToolName('deploy', 'push_to_prod');
    const result = ToolNameSchema.safeParse(toolName);
    expect(result.success).toBe(true);
  });
});

// ─── Migrated from contracts: Structured validation errors ──────────────────

describe('ToolValidationErrorCode', () => {
  it('has all expected error codes', () => {
    expect(ToolValidationErrorCode.INVALID_PREFIX).toBe('INVALID_PREFIX');
    expect(ToolValidationErrorCode.INVALID_ACTION_NAME).toBe('INVALID_ACTION_NAME');
    expect(ToolValidationErrorCode.MISSING_PREFIX).toBe('MISSING_PREFIX');
    expect(ToolValidationErrorCode.MALFORMED_NAME).toBe('MALFORMED_NAME');
  });
});

describe('ToolValidationErrorCodeSchema', () => {
  it('accepts valid error codes', () => {
    Object.values(ToolValidationErrorCode).forEach((code) => {
      const result = ToolValidationErrorCodeSchema.safeParse(code);
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid error codes', () => {
    const result = ToolValidationErrorCodeSchema.safeParse('INVALID_CODE');
    expect(result.success).toBe(false);
  });
});

describe('ToolValidationErrorSchema', () => {
  it('accepts valid error with code and message', () => {
    const result = ToolValidationErrorSchema.safeParse({
      code: 'INVALID_PREFIX',
      message: 'Invalid prefix "foo"',
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid error with suggestions', () => {
    const result = ToolValidationErrorSchema.safeParse({
      code: 'INVALID_PREFIX',
      message: 'Invalid prefix "foo"',
      suggestions: ['Use a valid prefix', 'Example: source_control.foo'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing code', () => {
    const result = ToolValidationErrorSchema.safeParse({
      message: 'Some error message',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing message', () => {
    const result = ToolValidationErrorSchema.safeParse({
      code: 'INVALID_PREFIX',
    });
    expect(result.success).toBe(false);
  });
});

// ─── Migrated from contracts: Error creator functions ───────────────────────

describe('createInvalidPrefixError', () => {
  it('creates error with INVALID_PREFIX code', () => {
    const error = createInvalidPrefixError('foo');
    expect(error.code).toBe('INVALID_PREFIX');
  });

  it('includes the invalid prefix in message', () => {
    const error = createInvalidPrefixError('unknown');
    expect(error.message).toContain('unknown');
  });

  it('includes valid prefixes in suggestions', () => {
    const error = createInvalidPrefixError('foo');
    expect(error.suggestions).toBeDefined();
    const suggestionsText = error.suggestions!.join(' ');
    ToolPrefixValues.forEach((prefix) => {
      expect(suggestionsText).toContain(prefix);
    });
  });

  it('provides an example suggestion', () => {
    const error = createInvalidPrefixError('commit');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('Example'))).toBe(true);
  });
});

describe('createInvalidActionNameError', () => {
  it('creates error with INVALID_ACTION_NAME code', () => {
    const error = createInvalidActionNameError('invalidAction');
    expect(error.code).toBe('INVALID_ACTION_NAME');
  });

  it('includes the invalid action in message', () => {
    const error = createInvalidActionNameError('badName');
    expect(error.message).toContain('badName');
  });

  it('suggests snake_case conversion for camelCase names', () => {
    const error = createInvalidActionNameError('runTests');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('run_tests'))).toBe(true);
  });

  it('suggests underscores instead of hyphens', () => {
    const error = createInvalidActionNameError('run-tests');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('run_tests'))).toBe(true);
  });

  it('handles names starting with a number', () => {
    const error = createInvalidActionNameError('1test');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.toLowerCase().includes('start with a lowercase letter'))).toBe(true);
  });

  it('provides general snake_case guidance for unknown issues', () => {
    const error = createInvalidActionNameError('');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('snake_case'))).toBe(true);
  });
});

describe('createMissingPrefixError', () => {
  it('creates error with MISSING_PREFIX code', () => {
    const error = createMissingPrefixError('commit');
    expect(error.code).toBe('MISSING_PREFIX');
  });

  it('includes the tool name in message', () => {
    const error = createMissingPrefixError('my_action');
    expect(error.message).toContain('my_action');
  });

  it('suggests adding a prefix', () => {
    const error = createMissingPrefixError('commit');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('source_control.commit') || s.includes('build.commit'))).toBe(true);
  });

  it('includes valid prefixes in suggestions', () => {
    const error = createMissingPrefixError('action');
    expect(error.suggestions).toBeDefined();
    const suggestionsText = error.suggestions!.join(' ');
    expect(suggestionsText).toContain('source_control');
    expect(suggestionsText).toContain('build');
  });
});

describe('createMalformedNameError', () => {
  it('creates error with MALFORMED_NAME code', () => {
    const error = createMalformedNameError('foo.bar.baz');
    expect(error.code).toBe('MALFORMED_NAME');
  });

  it('includes the tool name in message', () => {
    const error = createMalformedNameError('bad.name.here');
    expect(error.message).toContain('bad.name.here');
  });

  it('mentions single dot separator for multiple dots', () => {
    const error = createMalformedNameError('a.b.c');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('exactly one dot'))).toBe(true);
  });

  it('provides format guidance', () => {
    const error = createMalformedNameError('malformed.name.test');
    expect(error.suggestions).toBeDefined();
    expect(error.suggestions!.some((s) => s.includes('{prefix}.{action}'))).toBe(true);
  });
});

// ─── Migrated from contracts: validateToolNameStructured ────────────────────

describe('validateToolNameStructured', () => {
  describe('valid tool names', () => {
    it('returns undefined for valid tool names', () => {
      expect(validateToolNameStructured('source_control.commit')).toBeUndefined();
      expect(validateToolNameStructured('build.compile')).toBeUndefined();
      expect(validateToolNameStructured('run.execute')).toBeUndefined();
      expect(validateToolNameStructured('test.run_tests')).toBeUndefined();
      expect(validateToolNameStructured('debug.inspect')).toBeUndefined();
      expect(validateToolNameStructured('deploy.release')).toBeUndefined();
      expect(validateToolNameStructured('humancy.prompt')).toBeUndefined();
      expect(validateToolNameStructured('file.read')).toBeUndefined();
      expect(validateToolNameStructured('database.query')).toBeUndefined();
      expect(validateToolNameStructured('docs.generate')).toBeUndefined();
    });

    it('accepts action names with underscores', () => {
      expect(validateToolNameStructured('source_control.push_changes')).toBeUndefined();
      expect(validateToolNameStructured('build.run_all_tests')).toBeUndefined();
    });

    it('accepts action names with numbers', () => {
      expect(validateToolNameStructured('test.run_v2')).toBeUndefined();
      expect(validateToolNameStructured('build.compile123')).toBeUndefined();
    });
  });

  describe('INVALID_PREFIX errors', () => {
    it('returns INVALID_PREFIX for unknown prefixes', () => {
      const error = validateToolNameStructured('unknown.action');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_PREFIX');
    });

    it('returns INVALID_PREFIX for typos in prefix', () => {
      const error = validateToolNameStructured('soure_control.commit');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_PREFIX');
    });

    it('returns INVALID_PREFIX for camelCase prefix', () => {
      const error = validateToolNameStructured('sourceControl.commit');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_PREFIX');
    });
  });

  describe('INVALID_ACTION_NAME errors', () => {
    it('returns INVALID_ACTION_NAME for camelCase action', () => {
      const error = validateToolNameStructured('source_control.runTests');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('returns INVALID_ACTION_NAME for hyphenated action', () => {
      const error = validateToolNameStructured('build.run-tests');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('returns INVALID_ACTION_NAME for action starting with number', () => {
      const error = validateToolNameStructured('test.123test');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('returns INVALID_ACTION_NAME for action starting with underscore', () => {
      const error = validateToolNameStructured('test._hidden');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });

    it('returns INVALID_ACTION_NAME for empty action', () => {
      const error = validateToolNameStructured('build.');
      expect(error).toBeDefined();
      expect(error!.code).toBe('INVALID_ACTION_NAME');
    });
  });

  describe('MISSING_PREFIX errors', () => {
    it('returns MISSING_PREFIX for names without dots', () => {
      const error = validateToolNameStructured('commit');
      expect(error).toBeDefined();
      expect(error!.code).toBe('MISSING_PREFIX');
    });

    it('returns MISSING_PREFIX for single word names', () => {
      const error = validateToolNameStructured('run_tests');
      expect(error).toBeDefined();
      expect(error!.code).toBe('MISSING_PREFIX');
    });
  });

  describe('MALFORMED_NAME errors', () => {
    it('returns MALFORMED_NAME for names with multiple dots', () => {
      const error = validateToolNameStructured('source_control.git.commit');
      expect(error).toBeDefined();
      expect(error!.code).toBe('MALFORMED_NAME');
    });

    it('returns MALFORMED_NAME for names with many dots', () => {
      const error = validateToolNameStructured('a.b.c.d');
      expect(error).toBeDefined();
      expect(error!.code).toBe('MALFORMED_NAME');
    });

    it('returns MALFORMED_NAME for empty string', () => {
      const error = validateToolNameStructured('');
      expect(error).toBeDefined();
      expect(error!.code).toBe('MALFORMED_NAME');
    });

    it('returns MALFORMED_NAME for whitespace only', () => {
      const error = validateToolNameStructured('   ');
      expect(error).toBeDefined();
      expect(error!.code).toBe('MALFORMED_NAME');
    });
  });
});

// ─── Migrated from contracts: validateToolNameWithResult ────────────────────

describe('validateToolNameWithResult', () => {
  describe('success cases', () => {
    it('returns success object for valid names', () => {
      const result = validateToolNameWithResult('source_control.commit');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('source_control.commit');
      }
    });

    it('returns the validated name as value', () => {
      const result = validateToolNameWithResult('build.compile');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe('build.compile');
      }
    });
  });

  describe('failure cases', () => {
    it('returns failure object for invalid prefix', () => {
      const result = validateToolNameWithResult('invalid.action');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_PREFIX');
      }
    });

    it('returns failure object for invalid action', () => {
      const result = validateToolNameWithResult('build.invalidAction');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_ACTION_NAME');
      }
    });

    it('returns failure object for missing prefix', () => {
      const result = validateToolNameWithResult('noprefix');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('MISSING_PREFIX');
      }
    });

    it('returns failure object for malformed name', () => {
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
