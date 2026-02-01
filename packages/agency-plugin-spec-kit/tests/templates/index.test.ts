/**
 * Tests for templates module
 *
 * Tests the main template registry and helper functions including:
 * - TEMPLATES registry containing all template types
 * - resolveTemplate for template content resolution
 * - getDestinationPath for calculating output paths
 * - getTemplateDefinition for retrieving template definitions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';

// Mock the fs utilities before importing the module under test
vi.mock('../../src/utils/index.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/utils/index.js')>(
    '../../src/utils/index.js'
  );
  return {
    ...actual,
    exists: vi.fn(),
    readFile: vi.fn(),
  };
});

import {
  TEMPLATES,
  TEMPLATE_TYPES,
  resolveTemplate,
  getDestinationPath,
  getTemplateDefinition,
} from '../../src/templates/index.js';
import { exists, readFile } from '../../src/utils/index.js';
import type { SpecKitConfig } from '../../src/config.js';
import type { TemplateType } from '../../src/templates/types.js';

describe('templates module', () => {
  // Mock config with default paths
  const mockConfig: SpecKitConfig = {
    paths: {
      specs: 'specs',
      templates: '.specify/templates',
    },
    branches: {
      pattern: '{paddedNumber}-{slug}',
      numberPadding: 3,
      maxSlugWords: 4,
    },
    backlog: {
      provider: 'github',
    },
  };

  const mockRepoRoot = '/test/repo';
  const mockFeatureDir = '/test/repo/specs/001-my-feature';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('TEMPLATES registry', () => {
    it('should contain all template types', () => {
      for (const templateType of TEMPLATE_TYPES) {
        expect(TEMPLATES).toHaveProperty(templateType);
      }
    });

    it('should have exactly the expected number of templates', () => {
      const templateKeys = Object.keys(TEMPLATES);
      expect(templateKeys).toHaveLength(TEMPLATE_TYPES.length);
    });

    it.each(TEMPLATE_TYPES)(
      'should have required fields for %s template',
      (templateType) => {
        const definition = TEMPLATES[templateType as TemplateType];

        // Check required fields exist
        expect(definition).toHaveProperty('type');
        expect(definition).toHaveProperty('defaultFilename');
        expect(definition).toHaveProperty('sourceFile');
        expect(definition).toHaveProperty('defaultContent');

        // Verify type matches key
        expect(definition.type).toBe(templateType);

        // Verify defaultFilename ends with .md
        expect(definition.defaultFilename).toMatch(/\.md$/);

        // Verify sourceFile ends with .md
        expect(definition.sourceFile).toMatch(/\.md$/);

        // Verify defaultContent is a non-empty string
        expect(typeof definition.defaultContent).toBe('string');
        expect(definition.defaultContent.length).toBeGreaterThan(0);
      }
    );

    it('should have spec template with correct filename', () => {
      expect(TEMPLATES.spec.defaultFilename).toBe('spec.md');
      expect(TEMPLATES.spec.sourceFile).toBe('spec-template.md');
    });

    it('should have plan template with correct filename', () => {
      expect(TEMPLATES.plan.defaultFilename).toBe('plan.md');
      expect(TEMPLATES.plan.sourceFile).toBe('plan-template.md');
    });

    it('should have tasks template with correct filename', () => {
      expect(TEMPLATES.tasks.defaultFilename).toBe('tasks.md');
      expect(TEMPLATES.tasks.sourceFile).toBe('tasks-template.md');
    });

    it('should have checklist template with destSubdir', () => {
      expect(TEMPLATES.checklist.defaultFilename).toBe('checklist.md');
      expect(TEMPLATES.checklist.sourceFile).toBe('checklist-template.md');
      expect(TEMPLATES.checklist.destSubdir).toBe('checklists');
    });

    it('should have agent-file template with CLAUDE.md filename', () => {
      expect(TEMPLATES['agent-file'].defaultFilename).toBe('CLAUDE.md');
      expect(TEMPLATES['agent-file'].sourceFile).toBe('agent-file-template.md');
    });
  });

  describe('resolveTemplate', () => {
    it('should return embedded default when no custom template exists', async () => {
      const mockExists = vi.mocked(exists);
      mockExists.mockResolvedValue(false);

      const content = await resolveTemplate('spec', mockConfig, mockRepoRoot);

      // Should have checked for custom template
      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'spec-template.md')
      );

      // Should return the embedded default content
      expect(content).toBe(TEMPLATES.spec.defaultContent);
    });

    it('should return custom template content when it exists', async () => {
      const mockExists = vi.mocked(exists);
      const mockReadFile = vi.mocked(readFile);
      const customContent = '# Custom Spec Template\n\nCustom content here';

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(customContent);

      const content = await resolveTemplate('spec', mockConfig, mockRepoRoot);

      // Should have checked for custom template
      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'spec-template.md')
      );

      // Should have read the custom template
      expect(mockReadFile).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'spec-template.md')
      );

      // Should return custom content
      expect(content).toBe(customContent);
    });

    it('should resolve plan template from custom location when exists', async () => {
      const mockExists = vi.mocked(exists);
      const mockReadFile = vi.mocked(readFile);
      const customContent = '# Custom Plan Template';

      mockExists.mockResolvedValue(true);
      mockReadFile.mockResolvedValue(customContent);

      const content = await resolveTemplate('plan', mockConfig, mockRepoRoot);

      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'plan-template.md')
      );
      expect(content).toBe(customContent);
    });

    it('should resolve tasks template to default when no custom exists', async () => {
      const mockExists = vi.mocked(exists);
      mockExists.mockResolvedValue(false);

      const content = await resolveTemplate('tasks', mockConfig, mockRepoRoot);

      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'tasks-template.md')
      );
      expect(content).toBe(TEMPLATES.tasks.defaultContent);
    });

    it('should resolve checklist template correctly', async () => {
      const mockExists = vi.mocked(exists);
      mockExists.mockResolvedValue(false);

      const content = await resolveTemplate('checklist', mockConfig, mockRepoRoot);

      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'checklist-template.md')
      );
      expect(content).toBe(TEMPLATES.checklist.defaultContent);
    });

    it('should resolve agent-file template correctly', async () => {
      const mockExists = vi.mocked(exists);
      mockExists.mockResolvedValue(false);

      const content = await resolveTemplate('agent-file', mockConfig, mockRepoRoot);

      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, '.specify/templates', 'agent-file-template.md')
      );
      expect(content).toBe(TEMPLATES['agent-file'].defaultContent);
    });

    it('should use custom templates path from config', async () => {
      const mockExists = vi.mocked(exists);
      mockExists.mockResolvedValue(false);

      const customConfig: SpecKitConfig = {
        ...mockConfig,
        paths: {
          ...mockConfig.paths,
          templates: 'custom/templates/path',
        },
      };

      await resolveTemplate('spec', customConfig, mockRepoRoot);

      expect(mockExists).toHaveBeenCalledWith(
        join(mockRepoRoot, 'custom/templates/path', 'spec-template.md')
      );
    });
  });

  describe('getDestinationPath', () => {
    it('should return correct path for standard templates', () => {
      const specPath = getDestinationPath('spec', mockFeatureDir, mockRepoRoot);
      expect(specPath).toBe(join(mockFeatureDir, 'spec.md'));

      const planPath = getDestinationPath('plan', mockFeatureDir, mockRepoRoot);
      expect(planPath).toBe(join(mockFeatureDir, 'plan.md'));

      const tasksPath = getDestinationPath('tasks', mockFeatureDir, mockRepoRoot);
      expect(tasksPath).toBe(join(mockFeatureDir, 'tasks.md'));
    });

    it('should return path in checklists/ for checklist template', () => {
      const path = getDestinationPath('checklist', mockFeatureDir, mockRepoRoot);
      expect(path).toBe(join(mockFeatureDir, 'checklists', 'checklist.md'));
    });

    it('should return repo root path for agent-file template', () => {
      const path = getDestinationPath('agent-file', mockFeatureDir, mockRepoRoot);
      expect(path).toBe(join(mockRepoRoot, 'CLAUDE.md'));
    });

    it('should use custom filename when provided', () => {
      const path = getDestinationPath('spec', mockFeatureDir, mockRepoRoot, 'custom-spec.md');
      expect(path).toBe(join(mockFeatureDir, 'custom-spec.md'));
    });

    it('should add .md extension if not provided', () => {
      const path = getDestinationPath('spec', mockFeatureDir, mockRepoRoot, 'custom-spec');
      expect(path).toBe(join(mockFeatureDir, 'custom-spec.md'));
    });

    it('should not duplicate .md extension if already present', () => {
      const path = getDestinationPath('spec', mockFeatureDir, mockRepoRoot, 'my-file.md');
      expect(path).toBe(join(mockFeatureDir, 'my-file.md'));
    });

    it('should use custom filename for checklist in checklists subdirectory', () => {
      const path = getDestinationPath('checklist', mockFeatureDir, mockRepoRoot, 'ux-checklist.md');
      expect(path).toBe(join(mockFeatureDir, 'checklists', 'ux-checklist.md'));
    });

    it('should add .md extension to custom checklist filename', () => {
      const path = getDestinationPath('checklist', mockFeatureDir, mockRepoRoot, 'ux-checklist');
      expect(path).toBe(join(mockFeatureDir, 'checklists', 'ux-checklist.md'));
    });

    it('should use custom filename for agent-file at repo root', () => {
      const path = getDestinationPath('agent-file', mockFeatureDir, mockRepoRoot, 'AGENT.md');
      expect(path).toBe(join(mockRepoRoot, 'AGENT.md'));
    });

    it('should add .md extension to custom agent-file filename', () => {
      const path = getDestinationPath('agent-file', mockFeatureDir, mockRepoRoot, 'AGENT');
      expect(path).toBe(join(mockRepoRoot, 'AGENT.md'));
    });
  });

  describe('getTemplateDefinition', () => {
    it('should return definition for valid types', () => {
      for (const templateType of TEMPLATE_TYPES) {
        const definition = getTemplateDefinition(templateType);

        expect(definition).toBeDefined();
        expect(definition?.type).toBe(templateType);
      }
    });

    it('should return undefined for invalid types', () => {
      expect(getTemplateDefinition('invalid')).toBeUndefined();
      expect(getTemplateDefinition('not-a-template')).toBeUndefined();
      expect(getTemplateDefinition('')).toBeUndefined();
      expect(getTemplateDefinition('SPEC')).toBeUndefined(); // case sensitive
    });

    it('should return the same definition as TEMPLATES registry', () => {
      for (const templateType of TEMPLATE_TYPES) {
        const definition = getTemplateDefinition(templateType);
        expect(definition).toBe(TEMPLATES[templateType as TemplateType]);
      }
    });

    it('should return spec definition with all properties', () => {
      const definition = getTemplateDefinition('spec');

      expect(definition).toBeDefined();
      expect(definition?.type).toBe('spec');
      expect(definition?.defaultFilename).toBe('spec.md');
      expect(definition?.sourceFile).toBe('spec-template.md');
      expect(definition?.defaultContent).toBeDefined();
      expect(definition?.destSubdir).toBeUndefined();
    });

    it('should return checklist definition with destSubdir', () => {
      const definition = getTemplateDefinition('checklist');

      expect(definition).toBeDefined();
      expect(definition?.destSubdir).toBe('checklists');
    });
  });
});
