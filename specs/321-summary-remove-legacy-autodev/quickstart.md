# Quickstart: Remove Legacy Autodev References

## Prerequisites

- pnpm installed
- Repository cloned and on branch `321-summary-remove-legacy-autodev`

## Steps

1. **Install dependencies**:
   ```bash
   pnpm install
   ```

2. **Run the implementation**:
   ```bash
   /speckit:tasks    # Generate task list
   /speckit:implement # Execute tasks
   ```

3. **Verify**:
   ```bash
   # Check no autodev refs remain in source
   grep -r "autodev" --include="*.ts" --include="*.md" packages/ | grep -v specs/

   # Build
   pnpm build
   ```

## Troubleshooting

- **Build failure after changes**: Ensure only the JSDoc comment was changed in `plugin.ts`, not any type definitions
- **Remaining autodev references**: Check if they're in `specs/` directories (these are intentionally preserved)
