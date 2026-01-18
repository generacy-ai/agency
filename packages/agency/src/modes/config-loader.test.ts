import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadModeConfig, DEFAULT_MODES } from './config-loader.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

describe('loadModeConfig', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `agency-mode-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe('DEFAULT_MODES constant', () => {
    it('should have research, coding, review, and debug modes', () => {
      expect(DEFAULT_MODES.research).toBeDefined();
      expect(DEFAULT_MODES.coding).toBeDefined();
      expect(DEFAULT_MODES.review).toBeDefined();
      expect(DEFAULT_MODES.debug).toBeDefined();
    });

    it('should have coding extend research', () => {
      expect(DEFAULT_MODES.coding.extends).toBe('research');
    });

    it('should have review extend research', () => {
      expect(DEFAULT_MODES.review.extends).toBe('research');
    });

    it('should have debug extend coding', () => {
      expect(DEFAULT_MODES.debug.extends).toBe('coding');
    });

    it('should have research as base mode with no extends', () => {
      expect(DEFAULT_MODES.research.extends).toBeUndefined();
    });
  });

  describe('YAML loading', () => {
    it('should load configuration from .agency/modes.yaml', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  custom:
    name: custom
    includes:
      - "custom.*"
defaultMode: custom
`
      );

      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('custom');
      expect(config.modes.custom).toBeDefined();
      expect(config.modes.custom.includes).toContain('custom.*');
    });

    it('should parse YAML with multiple modes', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  base:
    name: base
    description: Base mode
    includes:
      - "base.*"
  extended:
    name: extended
    description: Extended mode
    extends: base
    includes:
      - "extended.*"
defaultMode: extended
`
      );

      const config = loadModeConfig(testDir);

      expect(config.modes.base).toBeDefined();
      expect(config.modes.extended).toBeDefined();
      expect(config.modes.extended.extends).toBe('base');
    });

    it('should throw MODE_CONFIG_INVALID for malformed YAML', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  invalid: [this is not valid: yaml: syntax
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
        expect((error as AgencyError).message).toContain('Failed to parse modes.yaml');
      }
    });

    it('should include path in error context for YAML parse errors', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(join(agencyDir, 'modes.yaml'), '{ invalid yaml');

      try {
        loadModeConfig(testDir);
      } catch (error) {
        const agencyError = error as AgencyError;
        expect(agencyError.context?.path).toBe(join(agencyDir, 'modes.yaml'));
      }
    });
  });

  describe('JSON fallback', () => {
    it('should fall back to .agency/config.json when YAML does not exist', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          modes: {
            jsonMode: {
              name: 'jsonMode',
              includes: ['json.*'],
            },
          },
          defaultMode: 'jsonMode',
        })
      );

      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('jsonMode');
      expect(config.modes.jsonMode).toBeDefined();
      expect(config.modes.jsonMode.includes).toContain('json.*');
    });

    it('should extract modes section from config.json', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          name: 'test-agency',
          plugins: ['some-plugin'],
          modes: {
            test: {
              name: 'test',
              includes: ['test.*'],
            },
          },
          defaultMode: 'test',
        })
      );

      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('test');
      expect(config.modes.test).toBeDefined();
    });

    it('should prefer YAML over JSON when both exist', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);

      // Create both files
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  yamlMode:
    name: yamlMode
    includes:
      - "yaml.*"
defaultMode: yamlMode
`
      );
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          modes: {
            jsonMode: {
              name: 'jsonMode',
              includes: ['json.*'],
            },
          },
          defaultMode: 'jsonMode',
        })
      );

      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('yamlMode');
      expect(config.modes.yamlMode).toBeDefined();
      expect(config.modes.jsonMode).toBeUndefined();
    });

    it('should throw MODE_CONFIG_INVALID for malformed JSON', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(join(agencyDir, 'config.json'), '{ invalid json');

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
        expect((error as AgencyError).message).toContain('Failed to parse config.json');
      }
    });

    it('should include path in error context for JSON parse errors', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(join(agencyDir, 'config.json'), '{ invalid json');

      try {
        loadModeConfig(testDir);
      } catch (error) {
        const agencyError = error as AgencyError;
        expect(agencyError.context?.path).toBe(join(agencyDir, 'config.json'));
      }
    });

    it('should use defaults when config.json has no modes section', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'config.json'),
        JSON.stringify({
          name: 'test-agency',
          plugins: ['some-plugin'],
        })
      );

      const config = loadModeConfig(testDir);

      // Should fall back to defaults since no modes section
      expect(config.defaultMode).toBe('coding');
      expect(config.modes.coding).toBeDefined();
    });
  });

  describe('built-in defaults', () => {
    it('should return DEFAULT_MODES when no config exists', () => {
      const config = loadModeConfig(testDir);

      expect(config.modes.research).toBeDefined();
      expect(config.modes.coding).toBeDefined();
      expect(config.modes.review).toBeDefined();
      expect(config.modes.debug).toBeDefined();
    });

    it('should have coding as default mode when no config exists', () => {
      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('coding');
    });

    it('should include humancy.* in research mode', () => {
      const config = loadModeConfig(testDir);

      expect(config.modes.research.includes).toContain('humancy.*');
    });

    it('should resolve inheritance for default modes', () => {
      const config = loadModeConfig(testDir);

      // Coding extends research, so should include both patterns
      // After inheritance resolution, coding should have research patterns + its own
      expect(config.modes.coding.includes).toContain('source_control.*');
    });

    it('should add name property to each mode', () => {
      const config = loadModeConfig(testDir);

      expect(config.modes.research.name).toBe('research');
      expect(config.modes.coding.name).toBe('coding');
      expect(config.modes.review.name).toBe('review');
      expect(config.modes.debug.name).toBe('debug');
    });
  });

  describe('validation errors', () => {
    it('should throw MODE_CONFIG_INVALID for missing includes', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  invalid:
    description: No includes
defaultMode: invalid
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
        expect((error as AgencyError).message).toContain('Invalid mode configuration');
      }
    });

    it('should throw MODE_CONFIG_INVALID for empty includes array', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  invalid:
    includes: []
defaultMode: invalid
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
      }
    });

    it('should throw MODE_CONFIG_INVALID for invalid mode structure', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  invalid: "not an object"
defaultMode: invalid
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
      }
    });

    it('should include validation errors in context', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  invalid:
    description: Missing includes
defaultMode: invalid
`
      );

      try {
        loadModeConfig(testDir);
      } catch (error) {
        const agencyError = error as AgencyError;
        expect(agencyError.context?.errors).toBeDefined();
        expect(Array.isArray(agencyError.context?.errors)).toBe(true);
      }
    });
  });

  describe('inheritance validation', () => {
    it('should throw for circular inheritance A -> B -> A', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  modeA:
    name: modeA
    extends: modeB
    includes:
      - "a.*"
  modeB:
    name: modeB
    extends: modeA
    includes:
      - "b.*"
defaultMode: modeA
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(
          ErrorCodes.MODE_CIRCULAR_INHERITANCE
        );
      }
    });

    it('should throw for circular inheritance A -> B -> C -> A', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  modeA:
    name: modeA
    extends: modeC
    includes:
      - "a.*"
  modeB:
    name: modeB
    extends: modeA
    includes:
      - "b.*"
  modeC:
    name: modeC
    extends: modeB
    includes:
      - "c.*"
defaultMode: modeA
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(
          ErrorCodes.MODE_CIRCULAR_INHERITANCE
        );
      }
    });

    it('should throw for self-referencing mode', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  selfRef:
    name: selfRef
    extends: selfRef
    includes:
      - "*"
defaultMode: selfRef
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(
          ErrorCodes.MODE_CIRCULAR_INHERITANCE
        );
      }
    });

    it('should throw for non-existent parent mode', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  orphan:
    name: orphan
    extends: nonExistent
    includes:
      - "*"
defaultMode: orphan
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
        expect((error as AgencyError).message).toContain('nonExistent');
      }
    });

    it('should include mode and parent in error context for non-existent parent', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  child:
    name: child
    extends: missingParent
    includes:
      - "*"
defaultMode: child
`
      );

      try {
        loadModeConfig(testDir);
      } catch (error) {
        const agencyError = error as AgencyError;
        expect(agencyError.context?.mode).toBe('child');
        expect(agencyError.context?.extends).toBe('missingParent');
      }
    });
  });

  describe('invalid default mode', () => {
    it('should throw MODE_CONFIG_INVALID when defaultMode references non-existent mode', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  existing:
    name: existing
    includes:
      - "*"
defaultMode: nonExistent
`
      );

      expect(() => loadModeConfig(testDir)).toThrow(AgencyError);

      try {
        loadModeConfig(testDir);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
        expect((error as AgencyError).message).toContain("Default mode 'nonExistent'");
        expect((error as AgencyError).message).toContain('not defined in modes');
      }
    });

    it('should include defaultMode and availableModes in error context', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  modeA:
    name: modeA
    includes:
      - "a.*"
  modeB:
    name: modeB
    includes:
      - "b.*"
defaultMode: modeC
`
      );

      try {
        loadModeConfig(testDir);
      } catch (error) {
        const agencyError = error as AgencyError;
        expect(agencyError.context?.defaultMode).toBe('modeC');
        expect(agencyError.context?.availableModes).toContain('modeA');
        expect(agencyError.context?.availableModes).toContain('modeB');
      }
    });

    it('should accept valid defaultMode', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  custom:
    name: custom
    includes:
      - "*"
defaultMode: custom
`
      );

      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('custom');
    });
  });

  describe('edge cases', () => {
    it('should handle empty .agency directory', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);

      const config = loadModeConfig(testDir);

      expect(config.defaultMode).toBe('coding');
      expect(config.modes.coding).toBeDefined();
    });

    it('should handle valid inheritance chain', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  level0:
    name: level0
    includes:
      - "a"
  level1:
    name: level1
    extends: level0
    includes:
      - "b"
  level2:
    name: level2
    extends: level1
    includes:
      - "c"
defaultMode: level2
`
      );

      const config = loadModeConfig(testDir);

      expect(config.modes.level2).toBeDefined();
      expect(config.modes.level2.extends).toBe('level1');
    });

    it('should handle modes with excludes', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  restricted:
    name: restricted
    includes:
      - "*"
    excludes:
      - "dangerous.*"
      - "admin.*"
defaultMode: restricted
`
      );

      const config = loadModeConfig(testDir);

      expect(config.modes.restricted.excludes).toContain('dangerous.*');
      expect(config.modes.restricted.excludes).toContain('admin.*');
    });

    it('should handle modes with description', async () => {
      const agencyDir = join(testDir, '.agency');
      await mkdir(agencyDir);
      await writeFile(
        join(agencyDir, 'modes.yaml'),
        `
modes:
  documented:
    name: documented
    description: A well-documented mode
    includes:
      - "*"
defaultMode: documented
`
      );

      const config = loadModeConfig(testDir);

      expect(config.modes.documented.description).toBe('A well-documented mode');
    });
  });
});
