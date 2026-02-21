/**
 * Tests for workflow bundling and resolution
 */

import { existsSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, it, expect, afterEach } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  BUILTIN_WORKFLOWS,
  getBuiltinWorkflowPath,
  resolveWorkflow,
} from '../src/workflows.js';

describe('BUILTIN_WORKFLOWS', () => {
  it('should contain an entry for speckit-feature', () => {
    expect(BUILTIN_WORKFLOWS).toHaveProperty('speckit-feature');
  });

  it('should contain an entry for speckit-bugfix', () => {
    expect(BUILTIN_WORKFLOWS).toHaveProperty('speckit-bugfix');
  });

  it('should point to files that exist on disk', () => {
    for (const [name, filePath] of Object.entries(BUILTIN_WORKFLOWS)) {
      expect(existsSync(filePath), `${name} at ${filePath} should exist`).toBe(true);
    }
  });
});

describe('YAML validity and schema', () => {
  const workflowEntries = Object.entries(BUILTIN_WORKFLOWS);

  for (const [name, filePath] of workflowEntries) {
    describe(name, () => {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseYaml(content);

      it('should parse as valid YAML', () => {
        expect(parsed).toBeDefined();
        expect(typeof parsed).toBe('object');
      });

      it('should have a name field (string)', () => {
        expect(typeof parsed.name).toBe('string');
      });

      it('should have a version field (string)', () => {
        expect(typeof parsed.version).toBe('string');
      });

      it('should have an inputs array', () => {
        expect(Array.isArray(parsed.inputs)).toBe(true);
      });

      it('should have a phases array', () => {
        expect(Array.isArray(parsed.phases)).toBe(true);
      });

      it('should have inputs with name and description', () => {
        for (const input of parsed.inputs) {
          expect(typeof input.name, `input should have string name`).toBe('string');
          expect(typeof input.description, `input "${input.name}" should have string description`).toBe('string');
        }
      });

      it('should have phases with name and steps', () => {
        for (const phase of parsed.phases) {
          expect(typeof phase.name, `phase should have string name`).toBe('string');
          expect(Array.isArray(phase.steps), `phase "${phase.name}" should have steps array`).toBe(true);
        }
      });

      it('should have steps with name and uses', () => {
        for (const phase of parsed.phases) {
          for (const step of phase.steps) {
            expect(typeof step.name, `step should have string name`).toBe('string');
            expect(typeof step.uses, `step "${step.name}" should have string uses`).toBe('string');
          }
        }
      });
    });
  }
});

describe('getBuiltinWorkflowPath', () => {
  it('should return a string for speckit-feature', () => {
    const result = getBuiltinWorkflowPath('speckit-feature');
    expect(result).toBeTypeOf('string');
  });

  it('should return a string for speckit-bugfix', () => {
    const result = getBuiltinWorkflowPath('speckit-bugfix');
    expect(result).toBeTypeOf('string');
  });

  it('should return undefined for unknown-workflow', () => {
    const result = getBuiltinWorkflowPath('unknown-workflow');
    expect(result).toBeUndefined();
  });
});

describe('resolveWorkflow', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('should return local override path when .generacy/<name>.yaml exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'workflow-test-'));
    const generacyDir = join(tempDir, '.generacy');
    mkdirSync(generacyDir, { recursive: true });
    const localFile = join(generacyDir, 'speckit-feature.yaml');
    writeFileSync(localFile, 'name: local-override\n');

    const result = resolveWorkflow('speckit-feature', tempDir);
    expect(result).toBe(localFile);
  });

  it('should fall back to bundled path when no local override exists', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'workflow-test-'));

    const result = resolveWorkflow('speckit-feature', tempDir);
    expect(result).toBe(BUILTIN_WORKFLOWS['speckit-feature']);
  });

  it('should return undefined for unknown names with no local override', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'workflow-test-'));

    const result = resolveWorkflow('unknown-workflow', tempDir);
    expect(result).toBeUndefined();
  });
});
