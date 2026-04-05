# Research: Update Tier Enum from Starter/Team to New Pricing Tiers

## Technology Decisions

### Approach: In-place enum replacement (no migration layer)

**Decision**: Directly replace old enum values with new ones. No backward-compatibility shim, no migration schema, no version bump.

**Rationale**:
- The latency and generacy-cloud repos have already migrated — the old values are no longer produced by any service
- The agency package is a library consumed at build time; there are no persisted documents using the old schema
- The spec explicitly states: "No runtime services in other repos depend on the old enum values from this package at this time"
- Adding a migration layer would introduce unnecessary complexity for a pure alignment task

**Alternatives rejected**:
1. **Dual enum (accept both old + new)**: Rejected because it would perpetuate stale values and defeat the purpose of alignment
2. **Schema versioning (V2)**: Rejected because the change is a value correction, not a structural schema evolution. V1 shape is unchanged — only the allowed enum members change

### Negative test values

**Decision**: Replace `'free'` as the invalid tier value in tests with `'platinum'` (a value that will never be a valid tier).

**Rationale**: `'free'` was previously used as the "known invalid" value in negative tests for GeneracyTierSchema and OrganizationSubscriptionTierSchema. Since `'free'` is now a valid tier, we need a different sentinel value. `'platinum'` is clearly nonsensical in the pricing model context.

## Implementation Patterns

- **Zod enum replacement**: `z.enum([...])` is declarative — just swap the string array. No refactoring needed.
- **Test iteration pattern**: Tests use `for (const tier of [...])` loops. Expand the array to include all 5 tiers.
- **JSDoc updates**: Keep the same format (tier name: description) but align descriptions with the new pricing model.

## Key References

- New pricing model: `docs/generacy-business-model-pricing.md` in tetrad-development
- Prior art: latency and generacy-cloud repos (already updated)
- Humancy tiers are separate (`free`/`pro`/`enterprise`) and are NOT affected by this change
