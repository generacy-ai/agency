# Implementation Plan: Provider Registry and Factory

**Feature**: Provider registry and factory for BacklogProvider instances
**Branch**: `145-a1-provider-registry-factory`
**Status**: Complete

## Summary

Implement a provider registry and factory system that manages BacklogProvider instances based on configuration. The registry supports name-based lookups and config-based creation with singleton caching per provider type.

## Technical Context

- **Language**: TypeScript (ES modules with `.js` extensions)
- **Package**: `packages/agency-plugin-spec-kit`
- **Testing**: Vitest
- **Build**: tsup (ESM output)

## Project Structure

```
packages/agency-plugin-spec-kit/src/
├── providers/
│   ├── index.ts          # Registry functions (CREATE)
│   ├── types.ts          # BacklogProvider interface (EXISTS)
│   └── errors.ts         # Provider errors (MODIFY - add ProviderNotFoundError)
├── config.ts             # BacklogConfig type (EXISTS)
└── index.ts              # Package exports (MODIFY)
```

## Implementation Approach

### Phase 1: Error Class
Add `ProviderNotFoundError` to `src/providers/errors.ts` extending the existing `ProviderError` base class.

### Phase 2: Registry Functions
Add three functions to `src/providers/index.ts`:

1. **`createProvider(config: BacklogConfig): BacklogProvider`**
   - Factory function that creates new provider instances
   - Switches on `config.provider` name
   - Throws `ProviderNotFoundError` for unknown providers

2. **`getProvider(name: string): BacklogProvider`**
   - Returns cached provider instance by name
   - Throws `ProviderNotFoundError` if not found

3. **`getConfiguredProvider(config: BacklogConfig): BacklogProvider`**
   - Lazy initialization with caching
   - Creates provider on first call, returns cached on subsequent
   - Cache key is provider name (one instance per type)

### Phase 3: Exports
Update package exports to expose registry functions.

## Dependencies

- BacklogProvider interface (exists in `types.ts`)
- BacklogConfig type (exists in `config.ts`)
- Provider implementations will be imported dynamically or stubbed

## Key Decisions

1. **Cache Strategy**: Use provider name as key, not full config. One instance per provider type.
2. **No Manual Registration**: Providers created only via factory function.
3. **Lazy Initialization**: Providers created on first access via `getConfiguredProvider`.

## Existing Patterns Referenced

- **Tool Registry** (`packages/agency/src/tools/registry.ts`): Map-based caching, `getOrThrow` pattern
- **Telemetry Factory** (`packages/agency/src/telemetry/factory.ts`): Factory function pattern

## Testing Strategy

- Unit tests for each registry function
- Test cache behavior (same instance returned)
- Test error cases (unknown provider, not found)
- Mock provider implementations

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/providers/errors.ts` | Modify | Add `ProviderNotFoundError` class |
| `src/providers/index.ts` | Modify | Add registry functions |
| `src/index.ts` | Modify | Re-export registry functions |
