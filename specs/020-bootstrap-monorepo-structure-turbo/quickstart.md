# Quickstart: Agency Monorepo

## Prerequisites

- Node.js ≥20 (LTS recommended)
- pnpm 9.x

## Installation

```bash
# Clone the repository
git clone https://github.com/generacy-ai/agency.git
cd agency

# Install dependencies
pnpm install
```

## Available Commands

| Command | Description |
|---------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run tests across all packages |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | Type-check all packages |
| `pnpm clean` | Remove build artifacts |

## Project Structure

```
agency/
├── packages/
│   ├── agency/                    # Core: @generacy-ai/agency
│   ├── agency-plugin-git/         # Plugin: git operations
│   ├── agency-plugin-docker/      # Plugin: docker operations
│   ├── agency-plugin-firebase/    # Plugin: firebase operations
│   ├── agency-plugin-npm/         # Plugin: npm operations
│   └── agency-plugin-humancy/     # Plugin: humancy integration
├── eslint.config.mjs              # Shared ESLint config
├── tsconfig.base.json             # Shared TypeScript config
├── turbo.json                     # Build orchestration
└── pnpm-workspace.yaml            # Workspace definition
```

## Working with Packages

### Building a Single Package

```bash
# Build specific package
pnpm --filter @generacy-ai/agency build

# Build package and its dependencies
pnpm --filter @generacy-ai/agency... build
```

### Adding Dependencies

```bash
# Add to root (dev dependency)
pnpm add -Dw <package>

# Add to specific package
pnpm --filter @generacy-ai/agency add <package>

# Add workspace dependency
pnpm --filter @generacy-ai/agency-plugin-git add @generacy-ai/agency@workspace:*
```

### Creating a Changeset

```bash
# Interactive changeset creation
pnpm changeset

# Version packages based on changesets
pnpm changeset version

# Publish packages
pnpm changeset publish
```

## Development Workflow

1. Create a feature branch
2. Make changes to packages
3. Run `pnpm build && pnpm test && pnpm lint`
4. Create a changeset if needed (`pnpm changeset`)
5. Submit PR

## Troubleshooting

### Build Errors

```bash
# Clean and rebuild
pnpm clean && pnpm build
```

### Dependency Issues

```bash
# Reinstall dependencies
rm -rf node_modules packages/*/node_modules
pnpm install
```

### Cache Issues

```bash
# Clear turbo cache
rm -rf .turbo
pnpm build
```

## Package Naming

- Core: `@generacy-ai/agency`
- Plugins: `@generacy-ai/agency-plugin-<name>`

## Resources

- [pnpm Documentation](https://pnpm.io/)
- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Changesets Documentation](https://github.com/changesets/changesets)
