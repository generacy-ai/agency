# Quickstart: agency-plugin-spec-kit

**Date**: 2026-01-30
**Feature**: F1: Scaffold agency-plugin-spec-kit package structure

## Installation

The plugin is part of the agency monorepo. After scaffolding is complete:

```bash
# From repo root
pnpm install

# Build all packages
pnpm build
```

## Package Location

```
packages/agency-plugin-spec-kit/
```

## Development

### Build the package

```bash
# Build all packages
pnpm build

# Or build just this package
cd packages/agency-plugin-spec-kit
pnpm build
```

### Run tests

```bash
# Run all tests
pnpm test

# Or test just this package
cd packages/agency-plugin-spec-kit
pnpm test
```

### Type checking

```bash
pnpm typecheck
```

## Usage (Future)

Once tools are implemented, the plugin will be used via Agency:

```typescript
import { Agency } from '@generacy-ai/agency';
import { SpecKitPlugin } from '@generacy-ai/agency-plugin-spec-kit';

const agency = new Agency();
agency.use(new SpecKitPlugin());
await agency.start();

// Tools will be available:
// - spec.create
// - spec.validate
// - spec.list
```

## Configuration (Future)

Configuration via Agency config:

```typescript
const agency = new Agency({
  plugins: {
    'spec-kit': {
      specDirectory: 'specs',
      templateDirectory: '.specify/templates'
    }
  }
});
```

## Project Structure

```
packages/agency-plugin-spec-kit/
├── package.json           # Package configuration
├── tsconfig.json          # TypeScript config
├── vitest.config.ts       # Test configuration
├── src/
│   ├── index.ts           # Public exports
│   ├── plugin.ts          # Plugin class
│   ├── manifest.ts        # Plugin manifest
│   ├── config.ts          # Configuration
│   ├── types/             # Type definitions
│   ├── providers/         # External providers
│   ├── tools/             # Tool implementations
│   └── utils/             # Utility functions
└── tests/                 # Test files
```

## Troubleshooting

### "Cannot find module" errors

Ensure you've built the package:

```bash
pnpm build
```

### TypeScript errors

Check that the base tsconfig exists:

```bash
ls -la tsconfig.base.json
```

### pnpm install fails

Verify you're using the correct pnpm version:

```bash
pnpm --version  # Should be 9.15+
```

## Related Packages

- `@generacy-ai/agency` - Core framework
- `@generacy-ai/agency-plugin-git` - Reference implementation
