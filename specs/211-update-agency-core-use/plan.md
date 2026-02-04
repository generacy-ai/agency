# Implementation Plan: Update Agency Core to Use Latency Facets

**Feature**: Refactor @generacy-ai/agency to use Latency facet-based composition
**Branch**: `211-update-agency-core-use`
**Status**: Complete

## Summary

This feature integrates the Latency facet system into Agency's plugin architecture. Agency plugins will declare `provides` and `requires` arrays specifying facet interfaces, enabling capability-based dependency resolution alongside the existing plugin loading order system.

The implementation extends the existing `AgencyCoreAPI` interface with `provide()`, `require()`, and `optional()` methods from Latency's `PluginContext`. Facets complement (not replace) the existing `dependencies[]` array and channel-based messaging system.

## Technical Context

- **Language**: TypeScript
- **Framework**: MCP Server (Model Context Protocol)
- **Dependencies**:
  - `@generacy-ai/latency` (workspace link) - Facet composition system
  - Existing Agency plugin infrastructure
- **Build System**: pnpm workspaces, tsup bundler
- **Testing**: Vitest

## Architecture Decision

Per clarification answers:
- **Q2**: Facets EXTEND the existing plugin system (Option B)
  - `dependencies[]` → plugin loading order
  - `provides/requires` → capability contracts
  - Channels → unchanged for runtime messaging
- **Q4**: EXTEND AgencyCoreAPI (Option B) with facet methods
- **Q5**: Breaking change within monorepo (Option B) - all plugins updated simultaneously

## Project Structure

```
packages/agency/
├── src/
│   ├── index.ts                    # Re-export facet types
│   ├── plugins/
│   │   └── types.ts                # Extended PluginManifest with provides/requires
│   ├── core-api/
│   │   ├── core-api.ts             # Add provide/require/optional methods
│   │   └── plugin-core-api.ts      # Implementation of facet methods
│   └── facets/
│       ├── index.ts                # New: Agency-specific facet exports
│       ├── registry.ts             # New: FacetRegistry adapter
│       └── binder.ts               # New: Facet resolution at startup
├── package.json                    # Add @generacy-ai/latency dependency

packages/agency-plugin-git/
├── src/
│   └── index.ts                    # Add provides: [SourceControl]

packages/agency-plugin-docker/
├── src/
│   └── index.ts                    # Add provides: [ContainerRuntime]

packages/agency-plugin-humancy/
├── src/
│   └── index.ts                    # Add requires: [DecisionHandler]

packages/agency-plugin-firebase/
├── src/
│   └── index.ts                    # Add provides: [SecretStore, StateStore]

packages/agency-plugin-spec-kit/
├── src/
│   └── index.ts                    # Add requires: [IssueTracker, SourceControl]

packages/agency-plugin-npm/
├── src/
│   └── index.ts                    # No facets (self-contained)
```

## Implementation Phases

### Phase 1: Core Infrastructure

1. **Add Latency dependency** to `packages/agency/package.json`:
   ```json
   "@generacy-ai/latency": "workspace:*"
   ```

2. **Extend PluginManifest** in `src/plugins/types.ts`:
   ```typescript
   import { FacetProvider, FacetRequirement } from '@generacy-ai/latency';

   interface PluginManifest {
     // ... existing fields
     provides?: FacetProvider[];
     requires?: FacetRequirement[];
     uses?: FacetRequirement[];  // optional dependencies
   }
   ```

3. **Create FacetRegistry adapter** in `src/facets/registry.ts`:
   - Wrap Latency's `FacetRegistry` for Agency's use
   - Integrate with plugin lifecycle (register on init, unregister on shutdown)

4. **Extend AgencyCoreAPI** in `src/plugins/types.ts`:
   ```typescript
   interface AgencyCoreAPI {
     // ... existing methods
     provide<T>(facet: string, implementation: T, qualifier?: string): void;
     require<T>(facet: string, qualifier?: string): T;
     optional<T>(facet: string, qualifier?: string): T | undefined;
   }
   ```

5. **Implement facet methods** in `src/core-api/plugin-core-api.ts`:
   - Delegate to FacetRegistry
   - Track registrations per plugin for scoped cleanup

### Phase 2: Startup Resolution

1. **Add facet binding** in `src/server/agency-server.ts`:
   - After plugin loading, validate all `requires` are satisfied
   - Log resolution results
   - Fail fast if required facets are missing

2. **Update DependencyResolver** to consider facet requirements:
   - Optional: Factor facet dependencies into load order
   - At minimum: Validate facets after load order resolution

### Phase 3: Plugin Updates

Update each plugin's manifest with facet declarations:

| Plugin | provides | requires |
|--------|----------|----------|
| git | `[{ facet: 'SourceControl', qualifier: 'git' }]` | - |
| docker | `[{ facet: 'ContainerRuntime', qualifier: 'docker' }]` | - |
| humancy | - | `[{ facet: 'DecisionHandler' }]` |
| firebase | `[{ facet: 'SecretStore' }, { facet: 'StateStore' }]` | - |
| spec-kit | - | `[{ facet: 'IssueTracker' }, { facet: 'SourceControl' }]` |
| npm | - | - |

### Phase 4: Testing & Validation

1. **Update existing tests** to work with new API
2. **Add facet-specific tests**:
   - FacetRegistry unit tests
   - Resolution validation tests
   - Missing facet error handling
3. **Build validation** across all packages
4. **Integration testing** with actual plugin loading

## Key Files to Modify

| File | Change Type | Description |
|------|-------------|-------------|
| `packages/agency/package.json` | Modify | Add latency dependency |
| `packages/agency/src/plugins/types.ts` | Modify | Extend PluginManifest, AgencyCoreAPI |
| `packages/agency/src/core-api/plugin-core-api.ts` | Modify | Implement provide/require/optional |
| `packages/agency/src/facets/registry.ts` | Create | FacetRegistry adapter |
| `packages/agency/src/facets/binder.ts` | Create | Startup facet resolution |
| `packages/agency/src/facets/index.ts` | Create | Facet module exports |
| `packages/agency/src/server/agency-server.ts` | Modify | Integrate facet binding |
| `packages/agency/src/index.ts` | Modify | Export facet types |
| `packages/agency-plugin-*/src/index.ts` | Modify | Add facet declarations |

## Risk Considerations

1. **Workspace link dependency**: The latency package must be accessible via pnpm workspace. If workspace configuration is incorrect, install will fail.

2. **Breaking API change**: All plugins must be updated atomically. Partial updates will cause type errors.

3. **Circular facet dependencies**: The facet system should detect and report cycles. Test with spec-kit requiring SourceControl from git.

4. **Runtime validation**: Plugins might not provide their declared facets. Add runtime checks in provide() method.

## Success Criteria

- [ ] `@generacy-ai/latency` installed via workspace link
- [ ] PluginManifest supports provides/requires/uses arrays
- [ ] AgencyCoreAPI has provide/require/optional methods
- [ ] All plugins declare appropriate facet manifests
- [ ] Facet resolution runs at startup
- [ ] Missing required facets fail with clear error messages
- [ ] Build passes across all packages
- [ ] Existing tests pass (no regressions)
- [ ] New facet tests added and passing

## References

- [Latency Architecture - Component Extension Pattern](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/latency-architecture.md)
- [Latency Execution Plan - Wave 6](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/latency-execution-plan.md)
- Clarifications: Q1-Q5 answers in `clarifications.md`
