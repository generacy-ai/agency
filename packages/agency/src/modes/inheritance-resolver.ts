/**
 * Mode Inheritance Resolver
 *
 * Resolves mode inheritance by flattening includes/excludes from parent modes
 * and detecting circular dependencies.
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ModeDefinition, ResolvedMode } from './types.js';

/**
 * Resolves mode inheritance, flattening includes/excludes and building inheritance chains.
 *
 * Uses DFS to detect circular inheritance and topologically sorts modes so parents
 * are processed before children.
 *
 * @param modes - Record of mode definitions keyed by name
 * @returns Array of resolved modes with flattened inheritance
 * @throws {AgencyError} MODE_CIRCULAR_INHERITANCE if circular inheritance detected
 * @throws {AgencyError} MODE_CONFIG_INVALID if extends references non-existent mode
 *
 * @example
 * ```typescript
 * const modes = {
 *   research: { name: 'research', includes: ['humancy.*'] },
 *   coding: { name: 'coding', extends: 'research', includes: ['source_control.*'] }
 * };
 * const resolved = resolveInheritance(modes);
 * // coding resolves to:
 * // - includes: ['humancy.*', 'source_control.*']
 * // - inheritanceChain: ['coding', 'research']
 * ```
 */
export function resolveInheritance(
  modes: Record<string, ModeDefinition>
): ResolvedMode[] {
  const modeNames = Object.keys(modes);

  // Validate all extends references exist
  for (const mode of Object.values(modes)) {
    if (mode.extends && !modes[mode.extends]) {
      throw new AgencyError(
        ErrorCodes.MODE_CONFIG_INVALID,
        `Mode '${mode.name}' extends non-existent mode '${mode.extends}'`,
        { mode: mode.name, extends: mode.extends }
      );
    }
  }

  // Detect circular inheritance using DFS
  detectCircularInheritance(modes, modeNames);

  // Topologically sort modes (parents before children)
  const sorted = topologicalSort(modes, modeNames);

  // Resolve each mode in topological order
  const resolved = new Map<string, ResolvedMode>();

  for (const modeName of sorted) {
    // Mode existence guaranteed by topologicalSort using validated modeNames
    const mode = modes[modeName]!;
    const resolvedMode = resolveMode(mode, modes, resolved);
    resolved.set(modeName, resolvedMode);
  }

  return Array.from(resolved.values());
}

/**
 * Detects circular inheritance using depth-first search.
 *
 * @param modes - Mode definitions
 * @param modeNames - Names of all modes
 * @throws {AgencyError} MODE_CIRCULAR_INHERITANCE if cycle detected
 */
function detectCircularInheritance(
  modes: Record<string, ModeDefinition>,
  modeNames: string[]
): void {
  // Track visited state: 0 = unvisited, 1 = visiting, 2 = visited
  const state = new Map<string, number>();

  for (const name of modeNames) {
    state.set(name, 0);
  }

  /**
   * DFS visit function
   * @param name - Mode name to visit
   * @param path - Current path for error reporting
   */
  function visit(name: string, path: string[]): void {
    const currentState = state.get(name);

    if (currentState === 1) {
      // Currently visiting - cycle detected
      const cycleStart = path.indexOf(name);
      const cycle = [...path.slice(cycleStart), name];
      throw new AgencyError(
        ErrorCodes.MODE_CIRCULAR_INHERITANCE,
        `Circular inheritance detected: ${cycle.join(' -> ')}`,
        { cycle }
      );
    }

    if (currentState === 2) {
      // Already fully processed
      return;
    }

    // Mark as visiting
    state.set(name, 1);

    // Mode existence validated in resolveInheritance before calling this function
    const mode = modes[name]!;
    if (mode.extends) {
      visit(mode.extends, [...path, name]);
    }

    // Mark as visited
    state.set(name, 2);
  }

  for (const name of modeNames) {
    if (state.get(name) === 0) {
      visit(name, []);
    }
  }
}

/**
 * Topologically sorts modes so parents come before children.
 *
 * @param modes - Mode definitions
 * @param modeNames - Names of all modes
 * @returns Sorted mode names (parents first)
 */
function topologicalSort(
  modes: Record<string, ModeDefinition>,
  modeNames: string[]
): string[] {
  const visited = new Set<string>();
  const result: string[] = [];

  function visit(name: string): void {
    if (visited.has(name)) {
      return;
    }

    // Mode existence validated in resolveInheritance before calling this function
    const mode = modes[name]!;

    // Visit parent first (if exists)
    if (mode.extends) {
      visit(mode.extends);
    }

    visited.add(name);
    result.push(name);
  }

  for (const name of modeNames) {
    visit(name);
  }

  return result;
}

/**
 * Resolves a single mode by merging with its parent.
 *
 * @param mode - Mode definition to resolve
 * @param modes - All mode definitions
 * @param resolved - Already resolved modes
 * @returns Resolved mode with flattened inheritance
 */
function resolveMode(
  mode: ModeDefinition,
  modes: Record<string, ModeDefinition>,
  resolved: Map<string, ResolvedMode>
): ResolvedMode {
  // Build inheritance chain: [self, parent, grandparent, ...]
  const inheritanceChain = buildInheritanceChain(mode, modes);

  // Flatten includes: parent includes first, then self
  const includes: string[] = [];
  // Flatten excludes: parent excludes first, then self
  const excludes: string[] = [];
  // Inherit description from parent if not defined on self
  let description = mode.description;

  if (mode.extends) {
    const parent = resolved.get(mode.extends);
    if (parent) {
      includes.push(...parent.includes);
      excludes.push(...parent.excludes);
      // Inherit description if not defined on self
      if (description === undefined) {
        description = parent.description;
      }
    }
  }

  includes.push(...mode.includes);
  if (mode.excludes) {
    excludes.push(...mode.excludes);
  }

  return {
    name: mode.name,
    description,
    includes,
    excludes,
    inheritanceChain,
  };
}

/**
 * Builds the inheritance chain for a mode.
 *
 * @param mode - Mode definition
 * @param modes - All mode definitions
 * @returns Array of mode names: [self, parent, grandparent, ...]
 */
function buildInheritanceChain(
  mode: ModeDefinition,
  modes: Record<string, ModeDefinition>
): string[] {
  const chain: string[] = [mode.name];
  let current: ModeDefinition = mode;

  while (current.extends) {
    chain.push(current.extends);
    // Parent existence validated in resolveInheritance before this function is called
    current = modes[current.extends]!;
  }

  return chain;
}
