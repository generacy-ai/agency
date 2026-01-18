# Research: Mode System Implementation

## Technology Decisions

### YAML Parser Selection

**Decision**: Use `yaml` package (https://eemeli.org/yaml/)

**Rationale**:
- Most popular YAML parser for Node.js
- Supports YAML 1.2 specification
- Provides good error messages with line/column info
- TypeScript support
- Tree shaking friendly

**Alternatives Considered**:
- `js-yaml`: Older, less maintained, YAML 1.1 only
- Custom JSON with comments: Less expressive than YAML for mode definitions

### Glob Pattern Library

**Decision**: Continue using `minimatch` (already in codebase)

**Rationale**:
- Already used in `ToolRegistry.matchPattern()`
- Well-tested, widely used
- Supports negation patterns natively

**Pattern Syntax**:
```
source_control.*     # Matches source_control.status, source_control.commit, etc.
build.compile        # Exact match
!test.integration_*  # Negation - exclude integration tests
*                    # Match all
```

### Inheritance Model

**Decision**: Single inheritance with pattern merging

**Rationale**:
- Spec defines `extends?: string` (singular)
- Simpler mental model than multiple inheritance
- Sufficient for defined use cases (research → coding → debug)

**Resolution Algorithm**:
1. Build dependency graph from `extends` relationships
2. Detect cycles using DFS with visited/visiting states
3. Topological sort for resolution order
4. Merge patterns: child inherits all parent includes, then adds own

### Configuration Precedence

**Decision**: API override > File config > Built-in defaults

**Sources** (highest to lowest priority):
1. `ModeManager.setModeConfig()` - API override from Generacy
2. `.agency/modes.yaml` - Project-specific file config
3. `.agency/config.json` modes section - JSON fallback
4. Built-in defaults - Hardcoded default modes

## Implementation Patterns

### Pattern Matching with Excludes

```typescript
function matchesTool(toolName: string, includes: string[], excludes: string[]): boolean {
  // Check excludes first - if any match, tool is excluded
  for (const pattern of excludes) {
    if (minimatch(toolName, pattern)) {
      return false;
    }
  }

  // Check includes - if any match, tool is included
  for (const pattern of includes) {
    if (minimatch(toolName, pattern)) {
      return true;
    }
  }

  return false;
}
```

### Circular Inheritance Detection

```typescript
function detectCycles(modes: Map<string, ModeDefinition>): string[] | null {
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function dfs(mode: string, path: string[]): string[] | null {
    if (visiting.has(mode)) {
      return [...path, mode]; // Cycle found
    }
    if (visited.has(mode)) {
      return null; // Already processed
    }

    visiting.add(mode);
    path.push(mode);

    const def = modes.get(mode);
    if (def?.extends) {
      const cycle = dfs(def.extends, path);
      if (cycle) return cycle;
    }

    visiting.delete(mode);
    visited.add(mode);
    path.pop();
    return null;
  }

  for (const mode of modes.keys()) {
    const cycle = dfs(mode, []);
    if (cycle) return cycle;
  }

  return null;
}
```

### Built-in Default Modes

```yaml
modes:
  research:
    description: "Information gathering and exploration"
    includes:
      - "humancy.*"
      - "source_control.status"
      - "source_control.log"

  coding:
    description: "Active development"
    extends: research
    includes:
      - "source_control.*"
      - "build.*"
      - "test.*"

  review:
    description: "Code review and feedback"
    extends: research
    includes:
      - "source_control.diff"
      - "source_control.blame"

  debug:
    description: "Debugging and troubleshooting"
    extends: coding
    includes:
      - "run.*"
```

## Key Sources/References

- MCP SDK: https://github.com/anthropics/mcp-sdk
- minimatch documentation: https://github.com/isaacs/minimatch
- YAML spec: https://yaml.org/spec/1.2/
- zod documentation: https://zod.dev/

## Performance Considerations

1. **Inheritance resolution**: O(n) where n = number of modes - done once at load
2. **Pattern matching**: O(p × t) where p = patterns, t = tools - done on mode change
3. **Caching**: Resolved modes cached after first resolution
4. **Target**: Mode switch < 10ms per SC-001

## Security Considerations

- YAML parsing: Use safe parsing (no arbitrary code execution)
- Pattern matching: minimatch is safe for untrusted patterns
- Config validation: All input validated with zod before use
