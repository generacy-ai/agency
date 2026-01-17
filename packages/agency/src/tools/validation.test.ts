import { describe, it, expect } from 'vitest';
import { validateToolName } from './validation.js';
import { STANDARD_PREFIXES, LENGTH_THRESHOLDS } from './prefixes.js';

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
