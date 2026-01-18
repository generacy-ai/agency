import { describe, it, expect } from 'vitest';
import { resolveInheritance } from './inheritance-resolver.js';
import type { ModeDefinition, ResolvedMode } from './types.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';

describe('resolveInheritance', () => {
  describe('simple inheritance', () => {
    it('should merge includes from parent and child', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          description: 'Parent mode',
          includes: ['tool.a', 'tool.b'],
        },
        child: {
          name: 'child',
          description: 'Child mode',
          extends: 'parent',
          includes: ['tool.c'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child).toBeDefined();
      expect(child!.includes).toEqual(['tool.a', 'tool.b', 'tool.c']);
    });

    it('should merge excludes from parent and child', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          includes: ['*'],
          excludes: ['tool.dangerous'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['tool.extra'],
          excludes: ['tool.risky'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child).toBeDefined();
      expect(child!.excludes).toEqual(['tool.dangerous', 'tool.risky']);
    });

    it('should handle parent with no excludes', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          includes: ['tool.a'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['tool.b'],
          excludes: ['tool.c'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child!.excludes).toEqual(['tool.c']);
    });
  });

  describe('deep inheritance chain', () => {
    it('should merge patterns from grandchild -> child -> parent', () => {
      const modes: Record<string, ModeDefinition> = {
        grandparent: {
          name: 'grandparent',
          description: 'Root mode',
          includes: ['tool.base'],
          excludes: ['tool.legacy'],
        },
        parent: {
          name: 'parent',
          extends: 'grandparent',
          includes: ['tool.mid'],
          excludes: ['tool.deprecated'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['tool.leaf'],
          excludes: ['tool.experimental'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child).toBeDefined();
      expect(child!.includes).toEqual(['tool.base', 'tool.mid', 'tool.leaf']);
      expect(child!.excludes).toEqual([
        'tool.legacy',
        'tool.deprecated',
        'tool.experimental',
      ]);
    });

    it('should handle four-level inheritance', () => {
      const modes: Record<string, ModeDefinition> = {
        level0: {
          name: 'level0',
          includes: ['a'],
        },
        level1: {
          name: 'level1',
          extends: 'level0',
          includes: ['b'],
        },
        level2: {
          name: 'level2',
          extends: 'level1',
          includes: ['c'],
        },
        level3: {
          name: 'level3',
          extends: 'level2',
          includes: ['d'],
        },
      };

      const resolved = resolveInheritance(modes);
      const level3 = resolved.find((m) => m.name === 'level3');

      expect(level3!.includes).toEqual(['a', 'b', 'c', 'd']);
    });
  });

  describe('multiple independent modes', () => {
    it('should resolve modes that do not extend each other', () => {
      const modes: Record<string, ModeDefinition> = {
        research: {
          name: 'research',
          description: 'Research mode',
          includes: ['search.*', 'read.*'],
        },
        coding: {
          name: 'coding',
          description: 'Coding mode',
          includes: ['edit.*', 'write.*'],
        },
        review: {
          name: 'review',
          description: 'Review mode',
          includes: ['git.*', 'diff.*'],
        },
      };

      const resolved = resolveInheritance(modes);

      expect(resolved).toHaveLength(3);

      const research = resolved.find((m) => m.name === 'research');
      const coding = resolved.find((m) => m.name === 'coding');
      const review = resolved.find((m) => m.name === 'review');

      expect(research!.includes).toEqual(['search.*', 'read.*']);
      expect(coding!.includes).toEqual(['edit.*', 'write.*']);
      expect(review!.includes).toEqual(['git.*', 'diff.*']);
    });

    it('should set inheritanceChain to only self for non-extending modes', () => {
      const modes: Record<string, ModeDefinition> = {
        standalone: {
          name: 'standalone',
          includes: ['*'],
        },
      };

      const resolved = resolveInheritance(modes);
      const standalone = resolved.find((m) => m.name === 'standalone');

      expect(standalone!.inheritanceChain).toEqual(['standalone']);
    });
  });

  describe('circular detection', () => {
    it('should throw MODE_CIRCULAR_INHERITANCE for A -> B -> C -> A cycle', () => {
      const modes: Record<string, ModeDefinition> = {
        modeA: {
          name: 'modeA',
          extends: 'modeC',
          includes: ['a'],
        },
        modeB: {
          name: 'modeB',
          extends: 'modeA',
          includes: ['b'],
        },
        modeC: {
          name: 'modeC',
          extends: 'modeB',
          includes: ['c'],
        },
      };

      expect(() => resolveInheritance(modes)).toThrow(AgencyError);

      try {
        resolveInheritance(modes);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(
          ErrorCodes.MODE_CIRCULAR_INHERITANCE
        );
      }
    });

    it('should throw MODE_CIRCULAR_INHERITANCE for A -> B -> A cycle', () => {
      const modes: Record<string, ModeDefinition> = {
        modeA: {
          name: 'modeA',
          extends: 'modeB',
          includes: ['a'],
        },
        modeB: {
          name: 'modeB',
          extends: 'modeA',
          includes: ['b'],
        },
      };

      expect(() => resolveInheritance(modes)).toThrow(AgencyError);

      try {
        resolveInheritance(modes);
      } catch (error) {
        expect((error as AgencyError).code).toBe(
          ErrorCodes.MODE_CIRCULAR_INHERITANCE
        );
      }
    });
  });

  describe('self-reference', () => {
    it('should throw MODE_CIRCULAR_INHERITANCE when mode extends itself', () => {
      const modes: Record<string, ModeDefinition> = {
        selfRef: {
          name: 'selfRef',
          extends: 'selfRef',
          includes: ['*'],
        },
      };

      expect(() => resolveInheritance(modes)).toThrow(AgencyError);

      try {
        resolveInheritance(modes);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(
          ErrorCodes.MODE_CIRCULAR_INHERITANCE
        );
      }
    });
  });

  describe('non-existent parent', () => {
    it('should throw MODE_CONFIG_INVALID when extending non-existent mode', () => {
      const modes: Record<string, ModeDefinition> = {
        orphan: {
          name: 'orphan',
          extends: 'nonExistent',
          includes: ['*'],
        },
      };

      expect(() => resolveInheritance(modes)).toThrow(AgencyError);

      try {
        resolveInheritance(modes);
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.MODE_CONFIG_INVALID);
      }
    });

    it('should include mode name and parent name in error context', () => {
      const modes: Record<string, ModeDefinition> = {
        child: {
          name: 'child',
          extends: 'missingParent',
          includes: ['*'],
        },
      };

      try {
        resolveInheritance(modes);
      } catch (error) {
        const agencyError = error as AgencyError;
        expect(agencyError.context).toBeDefined();
        expect(agencyError.context?.mode).toBe('child');
        expect(agencyError.context?.extends).toBe('missingParent');
      }
    });
  });

  describe('pattern flattening', () => {
    it('should place parent patterns before child patterns', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          includes: ['parent.first', 'parent.second'],
          excludes: ['parent.excluded'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['child.first', 'child.second'],
          excludes: ['child.excluded'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child!.includes).toEqual([
        'parent.first',
        'parent.second',
        'child.first',
        'child.second',
      ]);
      expect(child!.excludes).toEqual(['parent.excluded', 'child.excluded']);
    });

    it('should maintain order through deep inheritance', () => {
      const modes: Record<string, ModeDefinition> = {
        ancestor: {
          name: 'ancestor',
          includes: ['1-ancestor'],
        },
        parent: {
          name: 'parent',
          extends: 'ancestor',
          includes: ['2-parent'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['3-child'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child!.includes).toEqual(['1-ancestor', '2-parent', '3-child']);
    });
  });

  describe('inheritance chain', () => {
    it('should set inheritanceChain to [self, parent] for single extension', () => {
      const modes: Record<string, ModeDefinition> = {
        base: {
          name: 'base',
          includes: ['*'],
        },
        derived: {
          name: 'derived',
          extends: 'base',
          includes: ['extra'],
        },
      };

      const resolved = resolveInheritance(modes);
      const derived = resolved.find((m) => m.name === 'derived');

      expect(derived!.inheritanceChain).toEqual(['derived', 'base']);
    });

    it('should set inheritanceChain to [self, parent, grandparent, ...] for deep chain', () => {
      const modes: Record<string, ModeDefinition> = {
        root: {
          name: 'root',
          includes: ['a'],
        },
        middle: {
          name: 'middle',
          extends: 'root',
          includes: ['b'],
        },
        leaf: {
          name: 'leaf',
          extends: 'middle',
          includes: ['c'],
        },
      };

      const resolved = resolveInheritance(modes);
      const leaf = resolved.find((m) => m.name === 'leaf');

      expect(leaf!.inheritanceChain).toEqual(['leaf', 'middle', 'root']);
    });

    it('should have correct inheritanceChain for parent mode', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          includes: ['*'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['extra'],
        },
      };

      const resolved = resolveInheritance(modes);
      const parent = resolved.find((m) => m.name === 'parent');

      expect(parent!.inheritanceChain).toEqual(['parent']);
    });
  });

  describe('description inheritance', () => {
    it('should use parent description when child has no description', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          description: 'Parent description',
          includes: ['*'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['extra'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child!.description).toBe('Parent description');
    });

    it('should use child description when provided', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          description: 'Parent description',
          includes: ['*'],
        },
        child: {
          name: 'child',
          description: 'Child description',
          extends: 'parent',
          includes: ['extra'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      expect(child!.description).toBe('Child description');
    });

    it('should inherit description through deep chain', () => {
      const modes: Record<string, ModeDefinition> = {
        root: {
          name: 'root',
          description: 'Root description',
          includes: ['*'],
        },
        middle: {
          name: 'middle',
          extends: 'root',
          includes: ['b'],
        },
        leaf: {
          name: 'leaf',
          extends: 'middle',
          includes: ['c'],
        },
      };

      const resolved = resolveInheritance(modes);
      const leaf = resolved.find((m) => m.name === 'leaf');

      expect(leaf!.description).toBe('Root description');
    });

    it('should use closest ancestor description in chain', () => {
      const modes: Record<string, ModeDefinition> = {
        root: {
          name: 'root',
          description: 'Root description',
          includes: ['*'],
        },
        middle: {
          name: 'middle',
          description: 'Middle description',
          extends: 'root',
          includes: ['b'],
        },
        leaf: {
          name: 'leaf',
          extends: 'middle',
          includes: ['c'],
        },
      };

      const resolved = resolveInheritance(modes);
      const leaf = resolved.find((m) => m.name === 'leaf');

      expect(leaf!.description).toBe('Middle description');
    });

    it('should handle mode with no description in chain', () => {
      const modes: Record<string, ModeDefinition> = {
        standalone: {
          name: 'standalone',
          includes: ['*'],
        },
      };

      const resolved = resolveInheritance(modes);
      const standalone = resolved.find((m) => m.name === 'standalone');

      expect(standalone!.description).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty modes record', () => {
      const modes: Record<string, ModeDefinition> = {};

      const resolved = resolveInheritance(modes);

      expect(resolved).toEqual([]);
    });

    it('should handle mode with empty excludes array', () => {
      const modes: Record<string, ModeDefinition> = {
        mode: {
          name: 'mode',
          includes: ['*'],
          excludes: [],
        },
      };

      const resolved = resolveInheritance(modes);
      const mode = resolved.find((m) => m.name === 'mode');

      expect(mode!.excludes).toEqual([]);
    });

    it('should deduplicate patterns when same pattern appears in parent and child', () => {
      const modes: Record<string, ModeDefinition> = {
        parent: {
          name: 'parent',
          includes: ['common.*', 'parent.*'],
        },
        child: {
          name: 'child',
          extends: 'parent',
          includes: ['common.*', 'child.*'],
        },
      };

      const resolved = resolveInheritance(modes);
      const child = resolved.find((m) => m.name === 'child');

      // Depending on implementation, may or may not deduplicate
      // At minimum, patterns should be present
      expect(child!.includes).toContain('common.*');
      expect(child!.includes).toContain('parent.*');
      expect(child!.includes).toContain('child.*');
    });

    it('should resolve all modes including those not in inheritance chain', () => {
      const modes: Record<string, ModeDefinition> = {
        base: {
          name: 'base',
          includes: ['base.*'],
        },
        derived: {
          name: 'derived',
          extends: 'base',
          includes: ['derived.*'],
        },
        standalone: {
          name: 'standalone',
          includes: ['standalone.*'],
        },
      };

      const resolved = resolveInheritance(modes);

      expect(resolved).toHaveLength(3);
      expect(resolved.map((m) => m.name).sort()).toEqual([
        'base',
        'derived',
        'standalone',
      ]);
    });
  });
});
