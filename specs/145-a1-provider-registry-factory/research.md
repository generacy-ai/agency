# Research: Provider Registry and Factory

## Technology Decisions

### 1. Cache Strategy: Provider Name as Key

**Decision**: Use simple provider name string as cache key (one instance per provider type)

**Rationale**:
- Clarification confirmed single instance per provider type is acceptable
- Simpler implementation and predictable behavior
- Config changes would require clearing cache (future enhancement if needed)

**Alternatives Considered**:
- JSON.stringify(config) as key - Rejected: creates multiple instances unnecessarily
- Symbol-based keys - Rejected: overcomplicated for this use case

### 2. No Manual Registration

**Decision**: Providers created only via `createProvider` factory

**Rationale**:
- Clarification confirmed this approach
- Reduces API surface area
- Factory handles all instantiation logic

**Alternatives Considered**:
- `registerProvider(provider)` method - Rejected per clarification

### 3. Error Handling Pattern

**Decision**: Extend existing `ProviderError` base class

**Rationale**:
- Follows existing error hierarchy in codebase
- `ProviderError` already captures provider name
- Consistent with `AuthError` and `NotFoundError` patterns

## Implementation Patterns

### Factory Pattern
```typescript
export function createProvider(config: BacklogConfig): BacklogProvider {
  const { provider: name } = config;
  switch (name) {
    case 'github': return new GitHubProvider(config.github);
    // ... other cases
    default: throw new ProviderNotFoundError(name);
  }
}
```

### Singleton Cache Pattern
```typescript
const providers = new Map<string, BacklogProvider>();

export function getConfiguredProvider(config: BacklogConfig): BacklogProvider {
  const name = config.provider;
  if (!providers.has(name)) {
    providers.set(name, createProvider(config));
  }
  return providers.get(name)!;
}
```

## References

- Tool Registry: `packages/agency/src/tools/registry.ts`
- Telemetry Factory: `packages/agency/src/telemetry/factory.ts`
- Existing Errors: `packages/agency-plugin-spec-kit/src/providers/errors.ts`
