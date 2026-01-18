import { describe, it, expect } from 'vitest';
import { matchesTool } from './pattern-matcher.js';

describe('matchesTool', () => {
  describe('glob patterns', () => {
    it('should match tool with wildcard suffix pattern', () => {
      const result = matchesTool('source_control.status', ['source_control.*'], []);

      expect(result).toBe(true);
    });

    it('should match different tools with same prefix pattern', () => {
      const pattern = ['source_control.*'];

      expect(matchesTool('source_control.status', pattern, [])).toBe(true);
      expect(matchesTool('source_control.diff', pattern, [])).toBe(true);
      expect(matchesTool('source_control.commit', pattern, [])).toBe(true);
      expect(matchesTool('source_control.log', pattern, [])).toBe(true);
    });

    it('should not match tool with different prefix', () => {
      const result = matchesTool('build.compile', ['source_control.*'], []);

      expect(result).toBe(false);
    });

    it('should match partial wildcard patterns', () => {
      const result = matchesTool('test.integration_suite', ['test.integration_*'], []);

      expect(result).toBe(true);
    });

    it('should not match partial wildcard for non-matching suffix', () => {
      const result = matchesTool('test.unit_tests', ['test.integration_*'], []);

      expect(result).toBe(false);
    });

    it('should match with question mark single character wildcard', () => {
      const result = matchesTool('build.task1', ['build.task?'], []);

      expect(result).toBe(true);
    });

    it('should not match question mark with multiple characters', () => {
      const result = matchesTool('build.task12', ['build.task?'], []);

      expect(result).toBe(false);
    });
  });

  describe('exact matches', () => {
    it('should match exact tool name', () => {
      const result = matchesTool('build.compile', ['build.compile'], []);

      expect(result).toBe(true);
    });

    it('should not match similar but different tool name', () => {
      const result = matchesTool('build.compiler', ['build.compile'], []);

      expect(result).toBe(false);
    });

    it('should not match when tool name is prefix of pattern', () => {
      const result = matchesTool('build.comp', ['build.compile'], []);

      expect(result).toBe(false);
    });

    it('should not match when tool name contains pattern', () => {
      const result = matchesTool('build.compile_all', ['build.compile'], []);

      expect(result).toBe(false);
    });

    it('should match case-sensitively', () => {
      const result = matchesTool('Build.Compile', ['build.compile'], []);

      expect(result).toBe(false);
    });
  });

  describe('negation patterns', () => {
    it('should exclude tool matching negation pattern in includes', () => {
      const result = matchesTool('test.integration_suite', ['test.*', '!test.integration_*'], []);

      expect(result).toBe(false);
    });

    it('should include tool not matching negation pattern', () => {
      const result = matchesTool('test.unit_tests', ['test.*', '!test.integration_*'], []);

      expect(result).toBe(true);
    });

    it('should handle multiple negation patterns', () => {
      const includes = ['test.*', '!test.integration_*', '!test.e2e_*'];

      expect(matchesTool('test.unit_tests', includes, [])).toBe(true);
      expect(matchesTool('test.integration_suite', includes, [])).toBe(false);
      expect(matchesTool('test.e2e_browser', includes, [])).toBe(false);
    });

    it('should handle negation-only patterns (exclude from otherwise matched)', () => {
      const result = matchesTool('build.debug', ['build.*', '!build.debug'], []);

      expect(result).toBe(false);
    });
  });

  describe('excludes precedence', () => {
    it('should exclude tool that matches both includes and excludes', () => {
      const result = matchesTool('build.compile', ['build.*'], ['build.compile']);

      expect(result).toBe(false);
    });

    it('should exclude when glob pattern in excludes matches', () => {
      const result = matchesTool('test.integration_suite', ['test.*'], ['test.integration_*']);

      expect(result).toBe(false);
    });

    it('should include tool that matches includes but not excludes', () => {
      const result = matchesTool('test.unit_tests', ['test.*'], ['test.integration_*']);

      expect(result).toBe(true);
    });

    it('should exclude with wildcard excludes taking precedence over exact includes', () => {
      const result = matchesTool('source_control.push', ['source_control.push'], ['source_control.*']);

      expect(result).toBe(false);
    });

    it('should exclude with exact excludes taking precedence over wildcard includes', () => {
      const result = matchesTool('build.deploy', ['*'], ['build.deploy']);

      expect(result).toBe(false);
    });

    it('should handle complex overlap scenarios with excludes winning', () => {
      const includes = ['build.*', 'test.*'];
      const excludes = ['build.deploy', 'test.integration_*'];

      expect(matchesTool('build.compile', includes, excludes)).toBe(true);
      expect(matchesTool('build.deploy', includes, excludes)).toBe(false);
      expect(matchesTool('test.unit', includes, excludes)).toBe(true);
      expect(matchesTool('test.integration_api', includes, excludes)).toBe(false);
    });
  });

  describe('empty patterns', () => {
    it('should return false when includes array is empty', () => {
      const result = matchesTool('build.compile', [], []);

      expect(result).toBe(false);
    });

    it('should return false when includes is empty even if excludes is also empty', () => {
      const result = matchesTool('any.tool', [], []);

      expect(result).toBe(false);
    });

    it('should include tool when excludes array is empty and includes matches', () => {
      const result = matchesTool('build.compile', ['build.*'], []);

      expect(result).toBe(true);
    });

    it('should not exclude any tools when excludes is empty', () => {
      const includes = ['build.*', 'test.*'];

      expect(matchesTool('build.compile', includes, [])).toBe(true);
      expect(matchesTool('test.unit', includes, [])).toBe(true);
    });
  });

  describe('wildcard patterns', () => {
    it('should match everything with single asterisk', () => {
      const result = matchesTool('any.tool', ['*'], []);

      expect(result).toBe(true);
    });

    it('should match various tool names with single asterisk', () => {
      const includes = ['*'];

      expect(matchesTool('build.compile', includes, [])).toBe(true);
      expect(matchesTool('test.unit', includes, [])).toBe(true);
      expect(matchesTool('source_control.commit', includes, [])).toBe(true);
      expect(matchesTool('humancy.ask', includes, [])).toBe(true);
    });

    it('should allow excludes to filter from wildcard includes', () => {
      const result = matchesTool('build.deploy', ['*'], ['build.deploy']);

      expect(result).toBe(false);
    });

    it('should allow glob excludes to filter from wildcard includes', () => {
      const includes = ['*'];
      const excludes = ['build.*'];

      expect(matchesTool('build.compile', includes, excludes)).toBe(false);
      expect(matchesTool('test.unit', includes, excludes)).toBe(true);
    });

    it('should handle double asterisk pattern', () => {
      const result = matchesTool('deeply.nested.tool.name', ['**'], []);

      expect(result).toBe(true);
    });
  });

  describe('multiple patterns', () => {
    it('should match when any include pattern matches', () => {
      const includes = ['build.*', 'test.*', 'source_control.*'];

      expect(matchesTool('build.compile', includes, [])).toBe(true);
      expect(matchesTool('test.unit', includes, [])).toBe(true);
      expect(matchesTool('source_control.commit', includes, [])).toBe(true);
    });

    it('should not match when no include pattern matches', () => {
      const includes = ['build.*', 'test.*'];

      expect(matchesTool('source_control.commit', includes, [])).toBe(false);
    });

    it('should match with mix of exact and glob patterns', () => {
      const includes = ['build.compile', 'test.*'];

      expect(matchesTool('build.compile', includes, [])).toBe(true);
      expect(matchesTool('build.deploy', includes, [])).toBe(false);
      expect(matchesTool('test.unit', includes, [])).toBe(true);
    });

    it('should handle multiple exclude patterns', () => {
      const includes = ['*'];
      const excludes = ['build.deploy', 'test.integration_*', 'source_control.push'];

      expect(matchesTool('build.compile', includes, excludes)).toBe(true);
      expect(matchesTool('build.deploy', includes, excludes)).toBe(false);
      expect(matchesTool('test.integration_api', includes, excludes)).toBe(false);
      expect(matchesTool('test.unit', includes, excludes)).toBe(true);
      expect(matchesTool('source_control.push', includes, excludes)).toBe(false);
      expect(matchesTool('source_control.pull', includes, excludes)).toBe(true);
    });

    it('should match first applicable include pattern', () => {
      // Even if later patterns would not match, early match is sufficient
      const includes = ['build.compile', 'build.*'];

      expect(matchesTool('build.compile', includes, [])).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('should not match empty tool name (minimatch behavior)', () => {
      // minimatch does not match empty strings with '*'
      const result = matchesTool('', ['*'], []);

      expect(result).toBe(false);
    });

    it('should handle pattern with special regex characters', () => {
      // Patterns should be treated as glob, not regex
      const result = matchesTool('build.test', ['build.test'], []);

      expect(result).toBe(true);
    });

    it('should handle tool name with dots in action', () => {
      const result = matchesTool('api.v1.users', ['api.*'], []);

      expect(result).toBe(true);
    });

    it('should handle underscore patterns correctly', () => {
      const result = matchesTool('source_control.status', ['source_control.*'], []);

      expect(result).toBe(true);
    });

    it('should handle patterns ending with underscore and wildcard', () => {
      const result = matchesTool('test.integration_api', ['test.integration_*'], []);

      expect(result).toBe(true);
    });

    it('should handle exclude pattern identical to include pattern', () => {
      // Excludes always win, so this should be excluded
      const result = matchesTool('build.compile', ['build.compile'], ['build.compile']);

      expect(result).toBe(false);
    });

    it('should not match when tool name has extra prefix', () => {
      const result = matchesTool('my_build.compile', ['build.*'], []);

      expect(result).toBe(false);
    });
  });

  describe('built-in mode patterns (spec examples)', () => {
    // Test patterns from the spec's built-in modes
    describe('research mode patterns', () => {
      const includes = ['humancy.*', 'source_control.status', 'source_control.log'];

      it('should include humancy tools', () => {
        expect(matchesTool('humancy.ask', includes, [])).toBe(true);
        expect(matchesTool('humancy.confirm', includes, [])).toBe(true);
      });

      it('should include specific source_control tools', () => {
        expect(matchesTool('source_control.status', includes, [])).toBe(true);
        expect(matchesTool('source_control.log', includes, [])).toBe(true);
      });

      it('should not include other source_control tools', () => {
        expect(matchesTool('source_control.commit', includes, [])).toBe(false);
        expect(matchesTool('source_control.push', includes, [])).toBe(false);
      });
    });

    describe('coding mode patterns (extends research)', () => {
      // Simulating flattened includes from research + coding
      const includes = [
        'humancy.*',
        'source_control.status',
        'source_control.log',
        'source_control.*',
        'build.*',
        'test.*',
      ];

      it('should include all source_control tools', () => {
        expect(matchesTool('source_control.commit', includes, [])).toBe(true);
        expect(matchesTool('source_control.push', includes, [])).toBe(true);
        expect(matchesTool('source_control.status', includes, [])).toBe(true);
      });

      it('should include build and test tools', () => {
        expect(matchesTool('build.compile', includes, [])).toBe(true);
        expect(matchesTool('test.unit', includes, [])).toBe(true);
      });
    });

    describe('debug mode patterns', () => {
      // debug extends coding, adds run.*
      const includes = [
        'humancy.*',
        'source_control.*',
        'build.*',
        'test.*',
        'run.*',
      ];

      it('should include run tools', () => {
        expect(matchesTool('run.debug', includes, [])).toBe(true);
        expect(matchesTool('run.execute', includes, [])).toBe(true);
      });
    });
  });
});
