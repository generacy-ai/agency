# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 22:23

### Q1: API Design
**Context**: The acceptance criteria specifies getProvider(name: string) but the implementation shows getConfiguredProvider(config). These serve different purposes - one retrieves by name, the other by full config.
**Question**: Should the registry support both lookup methods (by name AND by config), or just one?
**Options**:
- A: Both - getProvider(name) for named lookups, getConfiguredProvider(config) for config-based creation
- B: Config-only - use getConfiguredProvider(config) as the primary API
- C: Name-only - use getProvider(name) which internally uses a default config

**Answer**: A - Both lookup methods: getProvider(name) for named lookups, getConfiguredProvider(config) for config-based creation. (via GitHub comment from @christrudelpw)

### Q2: Provider Registration
**Context**: The implementation includes registerProvider(provider) function that allows manual registration, but this is not mentioned in the acceptance criteria.
**Question**: Is manual provider registration required, or should all providers be created through createProvider only?
**Options**:
- A: Manual registration required - allow runtime provider injection for testing/plugins
- B: No manual registration - providers only created via createProvider factory

**Answer**: B - No manual registration. Providers only created via createProvider factory. (via GitHub comment from @christrudelpw)

### Q3: Cache Key Strategy
**Context**: Using JSON.stringify(config) as cache key may have issues with property ordering causing duplicate instances for equivalent configs.
**Question**: How should provider instance caching handle equivalent configs with different property ordering?
**Options**:
- A: Normalize config (sort keys) before hashing to ensure equivalent configs share instance
- B: Use simple provider name as key (one instance per provider type)
- C: Current approach is acceptable - trust configs to be consistently ordered

**Answer**: B - Use simple provider name as key (one instance per provider type). (via GitHub comment from @christrudelpw)

