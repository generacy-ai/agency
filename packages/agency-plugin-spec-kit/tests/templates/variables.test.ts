/**
 * Tests for variable substitution utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  substituteVariables,
  createTemplateVariables,
} from '../../src/templates/variables.js';

describe('substituteVariables', () => {
  describe('single variable substitution', () => {
    it('should replace single variable correctly', () => {
      const result = substituteVariables('Hello {{feature_name}}!', {
        feature_name: 'my-feature',
      });
      expect(result).toBe('Hello my-feature!');
    });

    it('should replace variable at the beginning', () => {
      const result = substituteVariables('{{feature_name}} is great', {
        feature_name: 'test-feature',
      });
      expect(result).toBe('test-feature is great');
    });

    it('should replace variable at the end', () => {
      const result = substituteVariables('Feature: {{feature_name}}', {
        feature_name: 'cool-feature',
      });
      expect(result).toBe('Feature: cool-feature');
    });
  });

  describe('multiple variable substitution', () => {
    it('should replace multiple different variables correctly', () => {
      const result = substituteVariables(
        'Feature: {{feature_name}} ({{date}})',
        { feature_name: 'my-feature', date: '2026-02-01' }
      );
      expect(result).toBe('Feature: my-feature (2026-02-01)');
    });

    it('should replace all occurrences of same variable', () => {
      const result = substituteVariables(
        '{{feature_name}} and {{feature_name}} again',
        { feature_name: 'test' }
      );
      expect(result).toBe('test and test again');
    });

    it('should replace all template variables', () => {
      const result = substituteVariables(
        'Name: {{feature_name}}, Desc: {{description}}, Date: {{date}}, Branch: {{branch}}',
        {
          feature_name: 'my-feature',
          description: 'A cool feature',
          date: '2026-02-01',
          branch: '159-c5-my-feature',
        }
      );
      expect(result).toBe(
        'Name: my-feature, Desc: A cool feature, Date: 2026-02-01, Branch: 159-c5-my-feature'
      );
    });
  });

  describe('unknown variables handling', () => {
    it('should leave unknown variables unchanged', () => {
      const result = substituteVariables(
        'Name: {{feature_name}}, Unknown: {{unknown}}',
        { feature_name: 'test' }
      );
      expect(result).toBe('Name: test, Unknown: {{unknown}}');
    });

    it('should preserve multiple unknown variables', () => {
      const result = substituteVariables(
        '{{foo}} and {{bar}} and {{baz}}',
        {}
      );
      expect(result).toBe('{{foo}} and {{bar}} and {{baz}}');
    });

    it('should handle mix of known and unknown variables', () => {
      const result = substituteVariables(
        '{{feature_name}} {{unknown}} {{date}}',
        { feature_name: 'test', date: '2026-02-01' }
      );
      expect(result).toBe('test {{unknown}} 2026-02-01');
    });
  });

  describe('empty variables object', () => {
    it('should handle empty variables object', () => {
      const result = substituteVariables('Hello {{feature_name}}!', {});
      expect(result).toBe('Hello {{feature_name}}!');
    });

    it('should leave all variables unchanged with empty object', () => {
      const result = substituteVariables(
        '{{feature_name}} {{date}} {{branch}}',
        {}
      );
      expect(result).toBe('{{feature_name}} {{date}} {{branch}}');
    });
  });

  describe('content with no variables', () => {
    it('should handle content with no variables', () => {
      const result = substituteVariables('Hello World!', {
        feature_name: 'test',
      });
      expect(result).toBe('Hello World!');
    });

    it('should return empty string for empty content', () => {
      const result = substituteVariables('', { feature_name: 'test' });
      expect(result).toBe('');
    });

    it('should handle content with similar but invalid syntax', () => {
      const result = substituteVariables('{ feature_name } and {feature_name}', {
        feature_name: 'test',
      });
      expect(result).toBe('{ feature_name } and {feature_name}');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined variable values', () => {
      const result = substituteVariables('Name: {{feature_name}}', {
        feature_name: undefined,
      } as any);
      expect(result).toBe('Name: {{feature_name}}');
    });

    it('should convert non-string values to strings', () => {
      const result = substituteVariables('Count: {{feature_name}}', {
        feature_name: 'test-123',
      });
      expect(result).toBe('Count: test-123');
    });

    it('should handle multiline content', () => {
      const content = `# Feature: {{feature_name}}

Date: {{date}}

Description: {{description}}`;
      const result = substituteVariables(content, {
        feature_name: 'test',
        date: '2026-02-01',
        description: 'A test feature',
      });
      expect(result).toBe(`# Feature: test

Date: 2026-02-01

Description: A test feature`);
    });
  });
});

describe('createTemplateVariables', () => {
  describe('feature name extraction from branch', () => {
    it('should extract feature_name from branch with issue number and prefix', () => {
      const vars = createTemplateVariables({
        branch: '159-c5-feature-name',
      });
      expect(vars.feature_name).toBe('feature-name');
    });

    it('should extract feature_name from branch with issue number only', () => {
      const vars = createTemplateVariables({
        branch: '123-my-feature',
      });
      expect(vars.feature_name).toBe('my-feature');
    });

    it('should handle longer feature names', () => {
      const vars = createTemplateVariables({
        branch: '99-c2-template-file-definitions',
      });
      expect(vars.feature_name).toBe('template-file-definitions');
    });

    it('should handle branch with different prefix format', () => {
      const vars = createTemplateVariables({
        branch: '42-a1-test-branch',
      });
      expect(vars.feature_name).toBe('test-branch');
    });

    it('should use entire branch as feature name if pattern does not match', () => {
      const vars = createTemplateVariables({
        branch: 'feature-branch-no-number',
      });
      expect(vars.feature_name).toBe('feature-branch-no-number');
    });

    it('should handle empty branch', () => {
      const vars = createTemplateVariables({
        branch: '',
      });
      expect(vars.feature_name).toBe('');
    });
  });

  describe('default date', () => {
    let mockDate: Date;

    beforeEach(() => {
      mockDate = new Date('2026-02-01T12:00:00Z');
      vi.useFakeTimers();
      vi.setSystemTime(mockDate);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should set default date to today', () => {
      const vars = createTemplateVariables({});
      expect(vars.date).toBe('2026-02-01');
    });

    it('should use today date when only branch is provided', () => {
      const vars = createTemplateVariables({
        branch: '123-feature',
      });
      expect(vars.date).toBe('2026-02-01');
    });
  });

  describe('provided values', () => {
    it('should use provided featureName when given', () => {
      const vars = createTemplateVariables({
        branch: '159-c5-branch-name',
        featureName: 'custom-feature',
      });
      expect(vars.feature_name).toBe('custom-feature');
    });

    it('should use provided date when given', () => {
      const vars = createTemplateVariables({
        date: '2025-12-25',
      });
      expect(vars.date).toBe('2025-12-25');
    });

    it('should use provided description', () => {
      const vars = createTemplateVariables({
        description: 'My feature description',
      });
      expect(vars.description).toBe('My feature description');
    });

    it('should use all provided values', () => {
      const vars = createTemplateVariables({
        branch: '100-test',
        featureName: 'my-feature',
        description: 'A description',
        date: '2026-01-15',
      });
      expect(vars.feature_name).toBe('my-feature');
      expect(vars.description).toBe('A description');
      expect(vars.date).toBe('2026-01-15');
      expect(vars.branch).toBe('100-test');
    });

    it('should preserve branch in output', () => {
      const vars = createTemplateVariables({
        branch: '159-c5-template-file-definitions',
      });
      expect(vars.branch).toBe('159-c5-template-file-definitions');
    });
  });

  describe('edge cases', () => {
    it('should handle empty options object', () => {
      const vars = createTemplateVariables({});
      expect(vars.feature_name).toBe('');
      expect(vars.description).toBe('');
      expect(vars.branch).toBe('');
      // date should be set to today
      expect(vars.date).toBeDefined();
    });

    it('should handle numeric-only branch prefix', () => {
      const vars = createTemplateVariables({
        branch: '999-simple',
      });
      expect(vars.feature_name).toBe('simple');
    });
  });
});
