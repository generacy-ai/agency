# Data Model: Update Tier Enum from Starter/Team to New Pricing Tiers

## Core Type Changes

### GeneracyTier (before)

```typescript
export const GeneracyTierSchema = z.enum(['starter', 'team', 'enterprise']);
export type GeneracyTier = 'starter' | 'team' | 'enterprise';
```

### GeneracyTier (after)

```typescript
export const GeneracyTierSchema = z.enum(['free', 'basic', 'standard', 'professional', 'enterprise']);
export type GeneracyTier = 'free' | 'basic' | 'standard' | 'professional' | 'enterprise';
```

### OrganizationSubscriptionTier (before)

```typescript
export const OrganizationSubscriptionTierSchema = z.enum(['starter', 'team', 'enterprise']);
export type OrganizationSubscriptionTier = 'starter' | 'team' | 'enterprise';
```

### OrganizationSubscriptionTier (after)

```typescript
export const OrganizationSubscriptionTierSchema = z.enum(['free', 'basic', 'standard', 'professional', 'enterprise']);
export type OrganizationSubscriptionTier = 'free' | 'basic' | 'standard' | 'professional' | 'enterprise';
```

## Tier Mapping

| Old Value | New Value | Notes |
|-----------|-----------|-------|
| `starter` | `basic` | Renamed |
| `team` | `standard` | Renamed |
| _(none)_ | `professional` | New tier added |
| `enterprise` | `enterprise` | Unchanged |
| _(missing)_ | `free` | New tier added |

## Validation Rules

- Both schemas use `z.enum()` — exact string match, case-sensitive
- No default values; tier must be explicitly provided
- The `GeneracyTierSchema` is used within `GeneracySubscriptionTier.V1` as the `tier` field
- The `OrganizationSubscriptionTierSchema` is used within `Organization.V1` as the `subscriptionTier` field

## Relationships

```
GeneracySubscriptionTier.V1
  └── tier: GeneracyTierSchema  ← updated

Organization.V1
  └── subscriptionTier: OrganizationSubscriptionTierSchema  ← updated

HumancySubscriptionTier.V1
  └── tier: HumancyTierSchema  ← NOT affected (uses free/pro/enterprise)
```

## Affected Exports

The following exported types will have their union members changed (TypeScript will enforce downstream compatibility at compile time):

- `GeneracyTier` — inferred from `GeneracyTierSchema`
- `OrganizationSubscriptionTier` — inferred from `OrganizationSubscriptionTierSchema`
