# Research: F4: Plugin manifest, config schema, plugin.ts skeleton

## Technology Decisions

### 1. Plugin Class Pattern

**Decision**: Use class-based plugin with instance methods

**Rationale**:
- Matches existing HumancyPlugin pattern in the codebase
- Allows for internal state management (config, cleanups)
- Supports future extension points (getConfig accessor)
- TypeScript class implements interface naturally

**Alternatives Considered**:
- Object literal with methods (used by npm plugin) - Less flexible for stateful plugins
- Factory-only pattern - Harder to test, no instance access

### 2. Configuration Validation

**Decision**: Use Zod for runtime validation and type inference

**Rationale**:
- Single source of truth for types and validation
- Runtime validation catches config errors early
- `.default()` provides sensible defaults automatically
- `.parse()` returns typed result or throws descriptive error
- Well-established in TypeScript ecosystem

**Alternatives Considered**:
- Interface + manual validation - Error-prone, duplicates type info
- JSON Schema - Requires separate type definitions
- io-ts - More complex API, smaller community

### 3. Default Export Convention

**Decision**: Export factory function as default, class as named export

**Rationale**:
- Matches HumancyPlugin: `export { createHumancyPlugin as default }`
- Factory allows for future construction options
- Named export allows direct class access for testing/typing
- Consistent import patterns across plugins

### 4. Config Key Convention

**Decision**: Use `plugins.speckit` as configuration key

**Rationale**:
- Follows `plugins.<name>` namespace convention
- Consistent with npm plugin's `plugins.npm` pattern
- Clear separation from core config

## Implementation Patterns

### Lifecycle Pattern

```typescript
// Plugin stores core API reference during initialize
async initialize(core: AgencyCoreAPI): Promise<void> {
  this.coreAPI = core;
  // Parse config, register tools, subscribe to events
}

// Cleanup in reverse order during shutdown
async shutdown(): Promise<void> {
  // Run cleanup functions
  // Clear references
  this.coreAPI = undefined;
}
```

### Config Parsing Pattern

```typescript
// Zod schema with defaults
const ConfigSchema = z.object({
  option: z.string().default('value'),
}).default({});

// Parse with fallback to empty object
export function parseConfig(raw?: unknown): Config {
  return ConfigSchema.parse(raw ?? {});
}

// Usage in plugin
const rawConfig = core.getConfig<unknown>(CONFIG_KEY);
this.config = parseConfig(rawConfig);
```

### Mode Affiliations Pattern

```typescript
// Declare which tools belong to which modes
export const modeAffiliations: Record<string, string[]> = {
  coding: ['all', 'tools'],
  research: ['read-only', 'tools'],
};
```

## Key Sources/References

1. **HumancyPlugin** (`packages/agency-plugin-humancy/src/plugin.ts`)
   - Class-based plugin implementation
   - Cleanup array pattern
   - Mode subscription handling

2. **NPM Plugin** (`packages/agency-plugin-npm/src/`)
   - Manifest structure
   - Config interfaces and defaults
   - Index exports pattern

3. **PluginManifest Interface** (`packages/agency/src/plugins/types.ts`)
   - Required/optional fields
   - Type definitions

4. **Zod Documentation**
   - Schema composition
   - Default values
   - Type inference with `z.infer<>`

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Should config use Zod or interface? | Zod - provides runtime validation + types |
| Class or object plugin pattern? | Class - matches HumancyPlugin pattern |
| What tools go in manifest? | All 11 tools listed in spec |
| Which tools are research-mode? | get_ticket, get_paths, check_prereqs (read-only) |
