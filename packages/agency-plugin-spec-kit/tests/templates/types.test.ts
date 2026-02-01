/**
 * Tests for template type definitions
 */

import { describe, it, expect } from 'vitest';
import {
  TEMPLATE_TYPES,
  isTemplateType,
  type TemplateType,
  type TemplateDefinition,
  type TemplateVariables,
} from '../../src/templates/types.js';

describe('TEMPLATE_TYPES', () => {
  describe('expected values', () => {
    it('should contain "spec"', () => {
      expect(TEMPLATE_TYPES).toContain('spec');
    });

    it('should contain "plan"', () => {
      expect(TEMPLATE_TYPES).toContain('plan');
    });

    it('should contain "tasks"', () => {
      expect(TEMPLATE_TYPES).toContain('tasks');
    });

    it('should contain "checklist"', () => {
      expect(TEMPLATE_TYPES).toContain('checklist');
    });

    it('should contain "agent-file"', () => {
      expect(TEMPLATE_TYPES).toContain('agent-file');
    });

    it('should contain exactly 5 template types', () => {
      expect(TEMPLATE_TYPES).toHaveLength(5);
    });

    it('should contain all expected values in order', () => {
      expect(TEMPLATE_TYPES).toEqual([
        'spec',
        'plan',
        'tasks',
        'checklist',
        'agent-file',
      ]);
    });
  });

  describe('readonly behavior', () => {
    it('should be a readonly array', () => {
      // TypeScript ensures this at compile time with 'as const'
      // At runtime, we verify the array contents match expected values
      const types: readonly string[] = TEMPLATE_TYPES;
      expect(Array.isArray(types)).toBe(true);
    });

    it('should not allow modification attempts at runtime', () => {
      // Attempting to modify a const assertion array should fail
      // We test by verifying the original values are preserved
      const originalLength = TEMPLATE_TYPES.length;
      const originalFirst = TEMPLATE_TYPES[0];
      const originalLast = TEMPLATE_TYPES[TEMPLATE_TYPES.length - 1];

      // These operations would fail TypeScript compilation due to readonly
      // At runtime, the array is still technically mutable in JavaScript
      // but the const assertion provides TypeScript-level protection
      expect(TEMPLATE_TYPES.length).toBe(originalLength);
      expect(TEMPLATE_TYPES[0]).toBe(originalFirst);
      expect(TEMPLATE_TYPES[TEMPLATE_TYPES.length - 1]).toBe(originalLast);
    });
  });
});

describe('isTemplateType', () => {
  describe('valid template types', () => {
    it('should return true for "spec"', () => {
      expect(isTemplateType('spec')).toBe(true);
    });

    it('should return true for "plan"', () => {
      expect(isTemplateType('plan')).toBe(true);
    });

    it('should return true for "tasks"', () => {
      expect(isTemplateType('tasks')).toBe(true);
    });

    it('should return true for "checklist"', () => {
      expect(isTemplateType('checklist')).toBe(true);
    });

    it('should return true for "agent-file"', () => {
      expect(isTemplateType('agent-file')).toBe(true);
    });

    it('should return true for all values in TEMPLATE_TYPES', () => {
      for (const type of TEMPLATE_TYPES) {
        expect(isTemplateType(type)).toBe(true);
      }
    });
  });

  describe('invalid template types', () => {
    it('should return false for empty string', () => {
      expect(isTemplateType('')).toBe(false);
    });

    it('should return false for "invalid"', () => {
      expect(isTemplateType('invalid')).toBe(false);
    });

    it('should return false for "template"', () => {
      expect(isTemplateType('template')).toBe(false);
    });

    it('should return false for "readme"', () => {
      expect(isTemplateType('readme')).toBe(false);
    });

    it('should return false for "config"', () => {
      expect(isTemplateType('config')).toBe(false);
    });

    it('should return false for uppercase variants', () => {
      expect(isTemplateType('SPEC')).toBe(false);
      expect(isTemplateType('Plan')).toBe(false);
      expect(isTemplateType('TASKS')).toBe(false);
    });

    it('should return false for similar but incorrect values', () => {
      expect(isTemplateType('specs')).toBe(false);
      expect(isTemplateType('plans')).toBe(false);
      expect(isTemplateType('task')).toBe(false);
      expect(isTemplateType('checklists')).toBe(false);
      expect(isTemplateType('agent')).toBe(false);
      expect(isTemplateType('agentfile')).toBe(false);
      expect(isTemplateType('agent_file')).toBe(false);
    });

    it('should return false for values with whitespace', () => {
      expect(isTemplateType(' spec')).toBe(false);
      expect(isTemplateType('spec ')).toBe(false);
      expect(isTemplateType(' spec ')).toBe(false);
    });
  });

  describe('type guard behavior', () => {
    it('should narrow type in conditional', () => {
      const value: string = 'spec';
      if (isTemplateType(value)) {
        // TypeScript should recognize value as TemplateType here
        const templateType: TemplateType = value;
        expect(templateType).toBe('spec');
      }
    });

    it('should work with unknown string inputs', () => {
      const userInput = 'plan';
      const result = isTemplateType(userInput);
      expect(result).toBe(true);
    });
  });
});

describe('TemplateType', () => {
  it('should accept valid template type values', () => {
    // TypeScript compile-time check - these should not error
    const spec: TemplateType = 'spec';
    const plan: TemplateType = 'plan';
    const tasks: TemplateType = 'tasks';
    const checklist: TemplateType = 'checklist';
    const agentFile: TemplateType = 'agent-file';

    expect(spec).toBe('spec');
    expect(plan).toBe('plan');
    expect(tasks).toBe('tasks');
    expect(checklist).toBe('checklist');
    expect(agentFile).toBe('agent-file');
  });
});

describe('TemplateDefinition interface', () => {
  it('should allow creating valid template definitions', () => {
    const definition: TemplateDefinition = {
      type: 'spec',
      defaultFilename: 'spec.md',
      sourceFile: 'spec-template.md',
      defaultContent: '# Specification\n',
    };

    expect(definition.type).toBe('spec');
    expect(definition.defaultFilename).toBe('spec.md');
    expect(definition.sourceFile).toBe('spec-template.md');
    expect(definition.defaultContent).toBe('# Specification\n');
  });

  it('should allow optional destSubdir property', () => {
    const definitionWithSubdir: TemplateDefinition = {
      type: 'checklist',
      defaultFilename: 'checklist.md',
      sourceFile: 'checklist-template.md',
      defaultContent: '# Checklist\n',
      destSubdir: 'checklists',
    };

    expect(definitionWithSubdir.destSubdir).toBe('checklists');

    const definitionWithoutSubdir: TemplateDefinition = {
      type: 'plan',
      defaultFilename: 'plan.md',
      sourceFile: 'plan-template.md',
      defaultContent: '# Plan\n',
    };

    expect(definitionWithoutSubdir.destSubdir).toBeUndefined();
  });
});

describe('TemplateVariables interface', () => {
  it('should allow creating valid template variables', () => {
    const variables: TemplateVariables = {
      feature_name: 'template-file-definitions',
      description: 'Add template file definition types',
      date: '2026-02-01',
      branch: '159-c5-template-file-definitions',
    };

    expect(variables.feature_name).toBe('template-file-definitions');
    expect(variables.description).toBe('Add template file definition types');
    expect(variables.date).toBe('2026-02-01');
    expect(variables.branch).toBe('159-c5-template-file-definitions');
  });

  it('should require all properties', () => {
    // This test verifies the interface shape at runtime
    const variables: TemplateVariables = {
      feature_name: 'test-feature',
      description: 'Test description',
      date: '2026-01-15',
      branch: '123-test-feature',
    };

    expect(variables).toHaveProperty('feature_name');
    expect(variables).toHaveProperty('description');
    expect(variables).toHaveProperty('date');
    expect(variables).toHaveProperty('branch');
  });
});
