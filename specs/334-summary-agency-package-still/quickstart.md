# Quickstart: Update Tier Enum from Starter/Team to New Pricing Tiers

## Prerequisites

- Node.js and pnpm installed
- Repository cloned and on branch `334-summary-agency-package-still`

## Steps

### 1. Install dependencies

```bash
pnpm install
```

### 2. Make the changes

Update 2 source files and 2 test files (humancy-tier.test.ts needs no changes):

**Source files** — replace `z.enum(['starter', 'team', 'enterprise'])` with `z.enum(['free', 'basic', 'standard', 'professional', 'enterprise'])`:
- `packages/agency/src/schemas/platform-api/subscription/generacy-tier.ts`
- `packages/agency/src/schemas/platform-api/organization/organization.ts`

**Test files** — update tier arrays, fixtures, and negative test values:
- `packages/agency/src/schemas/platform-api/subscription/__tests__/generacy-tier.test.ts`
- `packages/agency/src/schemas/platform-api/organization/__tests__/organization.test.ts`

### 3. Verify

```bash
# Build
pnpm build

# Run tests
pnpm test

# Verify no old tier references remain
grep -r "starter\|team" --include='*.ts' \
  packages/agency/src/schemas/platform-api/subscription/ \
  packages/agency/src/schemas/platform-api/organization/
```

The grep should return no tier-related matches. (The word "team" may appear in unrelated strings like invite messages — verify contextually.)

## Troubleshooting

| Issue | Resolution |
|-------|------------|
| TypeScript errors after enum change | Ensure both `generacy-tier.ts` and `organization.ts` are updated — they have independent enums |
| Tests fail on negative cases | Old negative test used `'free'` which is now valid — change to `'platinum'` |
| `humancy-tier.test.ts` fails | Should not happen — Humancy uses different tiers (`free`/`pro`/`enterprise`). Verify you didn't accidentally modify it |
