# Tasks: Update Tier Enum from Starter/Team to New Pricing Tiers

**Input**: Design documents from `/specs/334-summary-agency-package-still/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Core Schema Updates

- [X] T001 [US1] Update `GeneracyTierSchema` enum in `packages/agency/src/schemas/platform-api/subscription/generacy-tier.ts` — change `z.enum(['starter', 'team', 'enterprise'])` to `z.enum(['free', 'basic', 'standard', 'professional', 'enterprise'])`; update JSDoc comments (lines 29-33) to describe new tiers; update example `tier: 'team'` → `tier: 'standard'`
- [X] T002 [P] [US1] Update `OrganizationSubscriptionTierSchema` enum in `packages/agency/src/schemas/platform-api/organization/organization.ts` — change `z.enum(['starter', 'team', 'enterprise'])` to `z.enum(['free', 'basic', 'standard', 'professional', 'enterprise'])`; update example `subscriptionTier: 'team'` → `subscriptionTier: 'standard'`; update JSDoc mentioning old tier names

## Phase 2: Test Updates

- [X] T003 [US1] Update `packages/agency/src/schemas/platform-api/subscription/__tests__/generacy-tier.test.ts` — expand tier iteration to `['free', 'basic', 'standard', 'professional', 'enterprise']`; change negative test value from `'free'` to `'platinum'`; update fixture `tier: 'team'` → `tier: 'standard'` and `tier: 'starter'` → `tier: 'basic'`
- [X] T004 [P] [US1] Update `packages/agency/src/schemas/platform-api/organization/__tests__/organization.test.ts` — expand tier iteration to `['free', 'basic', 'standard', 'professional', 'enterprise']`; change negative test value from `'free'` to `'platinum'`; update fixture `subscriptionTier: 'team'` → `subscriptionTier: 'standard'` and `subscriptionTier: 'starter'` → `subscriptionTier: 'basic'`
- [X] T005 [P] [US1] Review `packages/agency/src/schemas/platform-api/subscription/__tests__/humancy-tier.test.ts` — verify `tier: 'starter'` negative test is still valid (starter is invalid for Humancy tiers); no changes expected per plan

## Phase 3: Verification

- [X] T006 [US1] Run `pnpm build` — confirm clean compilation with no type errors
- [X] T007 [US1] Run `pnpm test` — confirm all tests pass with new tier names
- [X] T008 [US1] Grep for stale references — run `grep -r 'starter\|team' --include='*.ts'` in affected paths and verify no tier-related matches remain (ignore unrelated uses of "team" in other contexts)

## Dependencies & Execution Order

- **T001 and T002** are independent source file changes and can run **in parallel**
- **T003 depends on T001** (test must match updated schema)
- **T004 depends on T002** (test must match updated schema)
- **T005** is independent (read-only verification, likely no changes)
- **T003, T004, T005** can run **in parallel** with each other once their Phase 1 dependencies are met
- **T006, T007, T008** are sequential verification steps after all code changes are complete
