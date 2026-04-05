# Implementation Plan: Update Tier Enum from Starter/Team to New Pricing Tiers

**Feature**: Update agency package tier enums to match new pricing model
**Branch**: `334-summary-agency-package-still`
**Status**: Complete

## Summary

The agency package's platform API schemas still use old tier names (`starter`/`team`) that no longer match the pricing model. The latency and generacy-cloud repos have already been updated to use `free`/`basic`/`standard`/`professional`/`enterprise`. This task aligns the agency package by updating Zod enum schemas, JSDoc comments, examples, and all associated test files.

## Technical Context

**Language/Version**: TypeScript (ES modules with `.js` extensions in imports)
**Primary Dependencies**: Zod (schema validation), Vitest (testing)
**Storage**: N/A — schema-only change, no persistence layer
**Testing**: Vitest (`pnpm test`)
**Target Platform**: Node.js (pnpm workspace monorepo)
**Project Type**: Library package within monorepo
**Constraints**: Must be a drop-in replacement — no API shape changes, only enum value changes
**Scale/Scope**: 2 source files, 3 test files

## Constitution Check

No `.specify/memory/constitution.md` exists. No governance gates apply.

## Project Structure

### Documentation (this feature)

```text
specs/334-summary-agency-package-still/
├── plan.md              # This file
├── research.md          # Technology decisions
├── data-model.md        # Updated type definitions
├── quickstart.md        # Implementation guide
└── contracts/           # Not applicable (no new APIs)
```

### Source Code (files to modify)

```text
packages/agency/src/schemas/platform-api/
├── subscription/
│   ├── generacy-tier.ts                          # FR-001: Update GeneracyTierSchema enum + JSDoc
│   └── __tests__/
│       ├── generacy-tier.test.ts                 # FR-004: Update tier iteration + fixtures
│       └── humancy-tier.test.ts                  # FR-005: Update negative test case (starter → old value)
└── organization/
    ├── organization.ts                           # FR-002: Update OrganizationSubscriptionTierSchema enum + JSDoc
    └── __tests__/
        └── organization.test.ts                  # FR-004: Update tier iteration + fixtures
```

## Change Details

### Source Changes

#### `generacy-tier.ts`
1. Update `GeneracyTierSchema` enum: `['starter', 'team', 'enterprise']` → `['free', 'basic', 'standard', 'professional', 'enterprise']`
2. Update JSDoc comment block (lines 29-33) to describe new tiers
3. Update example `tier: 'team'` → `tier: 'standard'` (line 47)

#### `organization.ts`
1. Update `OrganizationSubscriptionTierSchema` enum: `['starter', 'team', 'enterprise']` → `['free', 'basic', 'standard', 'professional', 'enterprise']`
2. Update example `subscriptionTier: 'team'` → `subscriptionTier: 'standard'` (line 51)

### Test Changes

#### `generacy-tier.test.ts`
1. Update tier iteration (line 39): `['starter', 'team', 'enterprise']` → `['free', 'basic', 'standard', 'professional', 'enterprise']`
2. Update negative test (line 45): `'free'` is now valid — change to a truly invalid value like `'platinum'`
3. Update fixture `tier: 'team'` → `tier: 'standard'` (line 52)
4. Update fixture `tier: 'starter'` → `tier: 'basic'` (line 135)

#### `organization.test.ts`
1. Update tier iteration (line 73): `['starter', 'team', 'enterprise']` → `['free', 'basic', 'standard', 'professional', 'enterprise']`
2. Update negative test (line 79): `'free'` → `'platinum'`
3. Update fixture `subscriptionTier: 'team'` → `subscriptionTier: 'standard'` (line 89)
4. Update fixture `subscriptionTier: 'starter'` → `subscriptionTier: 'basic'` (line 140)

#### `humancy-tier.test.ts`
1. Update negative test (line 175): `tier: 'starter'` — `starter` is still invalid for Humancy, so this test remains correct. **No changes needed.**

## Verification

1. `pnpm build` — clean compilation
2. `pnpm test` — all tests pass
3. `grep -r 'starter\|team' --include='*.ts'` in affected paths returns no tier-related matches (note: `team` may appear in unrelated contexts like "team!" in invite test messages — verify contextually)
