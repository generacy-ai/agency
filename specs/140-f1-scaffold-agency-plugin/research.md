# Research: agency-plugin-spec-kit Package

**Date**: 2026-01-30
**Feature**: F1: Scaffold agency-plugin-spec-kit package structure

## Technology Decisions

### 1. Package Structure Pattern

**Decision**: Follow the exact pattern from `@generacy-ai/agency-plugin-git`

**Rationale**:
- Consistency across plugins improves maintainability
- Proven structure that works with the Agency framework
- Familiar to developers working on the codebase

**Key patterns adopted**:
- ESM-first (`"type": "module"`)
- TypeScript with `.js` extension in imports
- Named exports for all public APIs
- Default export for the Plugin class

### 2. Plugin Architecture

**Decision**: Implement `AgencyPlugin` interface from `@generacy-ai/agency`

**Interface requirements**:
```typescript
interface AgencyPlugin {
  readonly manifest: PluginManifest;
  initialize(core: AgencyCoreAPI): Promise<void>;
  shutdown(): Promise<void>;
  onModeChange?(mode: string): void;
}
```

**Key behaviors**:
- Tools registered during `initialize()`
- Tools unregistered during `shutdown()`
- Mode filtering handled by tool affiliations

### 3. Configuration Schema

**Decision**: Use a simple configuration interface with defaults

Following agency-plugin-git pattern:
```typescript
interface SpecKitPluginConfig {
  // Minimal initial config
  specDirectory: string;  // Where specs are stored
  templateDirectory: string;  // Template location
}
```

### 4. Tool Namespace

**Decision**: Use `spec.` prefix for all tools

**Rationale**:
- Consistent with `source_control.` in git plugin
- Clear domain separation
- Avoids conflicts with other plugins

## Alternatives Considered

### Package Structure

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Flat structure | Simpler | Doesn't scale | Rejected |
| Feature folders | Grouped by feature | Complex for small plugin | Rejected |
| Type-based folders | Matches git plugin | Proven pattern | **Selected** |

### Tool Registration

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Static registration | Simple | No dynamic tools | **Selected** (for now) |
| Dynamic registration | Flexible | More complex | Future consideration |

## Implementation Patterns

### 1. Factory Function Pattern

```typescript
export function createSpecKitPlugin(): SpecKitPlugin {
  return new SpecKitPlugin();
}
```

**Usage**: Allows dependency injection and testing.

### 2. Tool Creation Pattern

```typescript
// tools/index.ts
export function createTools(
  config: SpecKitPluginConfig,
  core: AgencyCoreAPI
): AgencyTool[] {
  return [
    // Tools will be added here
  ];
}
```

### 3. Configuration Resolution

```typescript
export function resolveConfig(
  userConfig?: Partial<SpecKitPluginConfig>
): SpecKitPluginConfig {
  return { ...DEFAULT_CONFIG, ...userConfig };
}
```

## Key Sources

1. **Existing Plugin**: `packages/agency-plugin-git/`
   - Complete reference implementation
   - Established patterns for the codebase

2. **Agency Core**: `packages/agency/`
   - `AgencyPlugin` interface definition
   - `AgencyCoreAPI` for tool registration

3. **TypeScript Config**: `tsconfig.base.json`
   - Strict mode enabled
   - ES2022 target
   - Node16 module resolution

## Open Questions (Resolved)

1. ~~Should we include placeholder tools?~~
   **Resolution**: No, just the infrastructure. Tools added in subsequent features.

2. ~~What config options are needed initially?~~
   **Resolution**: Minimal config - specDirectory and templateDirectory.

3. ~~Test structure?~~
   **Resolution**: Follow agency-plugin-git pattern with tests/ directory.
