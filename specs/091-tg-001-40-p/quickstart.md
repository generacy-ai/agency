# Quickstart: Extension Package Development

**Feature**: Extension Package Setup
**Package**: `@generacy-ai/agency-extension`

## Overview

This guide covers how to work with the Agency VS Code Extension package, including building, testing, debugging, and publishing.

## Prerequisites

- Node.js 20+ installed
- pnpm 9.15+ installed (`npm install -g pnpm`)
- VS Code 1.85+ installed
- Git repository cloned

## Installation

From the monorepo root:

```bash
# Install all dependencies (monorepo + extension)
pnpm install

# Navigate to extension package
cd packages/agency-extension
```

## Development Commands

### Build the Extension

```bash
# Production build (minified, no source maps)
pnpm build

# Development build (source maps, no minification)
pnpm build --no-production

# Watch mode (rebuilds on file changes)
pnpm watch
```

**Output**: `dist/extension.js` (bundled extension)

### Run Tests

```bash
# Run all tests once
pnpm test

# Watch mode (re-runs on file changes)
pnpm test -- --watch

# Run with coverage
pnpm test -- --coverage
```

**Test Files**: `src/__tests__/**/*.test.ts`

### Type Checking

```bash
# Check types (no output)
pnpm typecheck

# Watch mode
pnpm typecheck -- --watch
```

### Linting

```bash
# Run ESLint
pnpm lint

# Fix auto-fixable issues
pnpm lint -- --fix
```

### Clean Build Artifacts

```bash
pnpm clean
```

## Debugging the Extension

### 1. Open Extension in VS Code

```bash
# From packages/agency-extension/
code .
```

### 2. Start Watch Mode

```bash
pnpm watch
```

This rebuilds `dist/extension.js` whenever you save a file in `src/`.

### 3. Launch Extension Host

Press **F5** or use **Run > Start Debugging** in VS Code.

This:
1. Opens a new "Extension Development Host" VS Code window
2. Loads the extension from `dist/extension.js`
3. Activates when `.agency/agency.config.json` is detected

### 4. View Debug Console

In the **original** VS Code window (not the Extension Host):
- **Debug Console**: Extension logs and errors
- **Terminal**: Build output from watch mode

### 5. Make Changes

1. Edit files in `src/`
2. Save (watch mode rebuilds)
3. Reload Extension Host: **Ctrl+R** (Cmd+R on Mac) in the Extension Host window

### Debugging Tips

- **Breakpoints**: Set in `src/*.ts` files (source maps enabled in dev builds)
- **Console Logs**: Use `console.log()` (appears in Debug Console)
- **VS Code API**: Use `vscode.window.showInformationMessage()` for quick debugging
- **Hot Reload**: Ctrl+R in Extension Host reloads without restarting

## Running Tests During Development

### Watch Mode (Recommended)

```bash
pnpm test -- --watch
```

- Re-runs tests on file changes
- Only runs tests affected by changes
- Shows coverage in terminal

### Debugging Tests

1. Add `debugger;` statement in test
2. Run test with Node inspector:
   ```bash
   node --inspect-brk ./node_modules/.bin/vitest run
   ```
3. Attach VS Code debugger to Node process

### Test File Patterns

```typescript
// src/__tests__/commands/plugin-commands.test.ts
import { describe, it, expect } from 'vitest';

describe('Plugin Commands', () => {
  it('should enable plugin', () => {
    // Test implementation
  });
});
```

## Monorepo Commands

Run from monorepo root (`/workspaces/agency`):

```bash
# Build all packages (includes extension)
pnpm build

# Test all packages
pnpm test

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Clean all packages
pnpm clean
```

**Note**: turborepo caches results, so rebuilds are fast if nothing changed.

## Package Versioning

### Update Version

Edit `packages/agency-extension/package.json`:

```json
{
  "version": "0.1.0"
}
```

### Update Changelog

Edit `packages/agency-extension/CHANGELOG.md`:

```markdown
## [0.1.0] - 2026-01-23

### Added
- Plugin configuration UI
- In-situ MCP tool testing

### Changed
- Improved error handling in MCP client

### Fixed
- Fixed race condition in activity feed
```

Follow [Keep a Changelog](https://keepachangelog.com/) format.

## Publishing to Marketplace

### Prerequisites

1. **VS Code Marketplace Account**: Create at [marketplace.visualstudio.com](https://marketplace.visualstudio.com/)
2. **Personal Access Token**: Generate in Azure DevOps with `Marketplace (publish)` scope
3. **Login to vsce**:
   ```bash
   npx @vscode/vsce login generacy-ai
   # Enter PAT when prompted
   ```

### Package the Extension

```bash
cd packages/agency-extension

# Build production bundle
pnpm build

# Create .vsix package
pnpm package
```

**Output**: `agency-extension-0.0.0.vsix` (installable extension package)

### Test the Package Locally

```bash
# Install .vsix in VS Code
code --install-extension agency-extension-0.0.0.vsix
```

Verify:
1. Extension appears in Extensions panel
2. Activates when opening Agency workspace
3. Commands available in Command Palette

### Publish to Marketplace

```bash
# Publish (requires login)
pnpm publish
```

This:
1. Runs `vscode:prepublish` script (builds extension)
2. Packages extension with vsce
3. Uploads to VS Code Marketplace

**Note**: Publishing is typically done by CI/CD, not manually.

## Troubleshooting

### Build Fails

**Symptom**: `pnpm build` errors

**Solutions**:
- Check TypeScript errors: `pnpm typecheck`
- Check for syntax errors in esbuild.config.mjs
- Clear cache: `pnpm clean && pnpm build`

### Tests Fail

**Symptom**: `pnpm test` errors

**Solutions**:
- Run single test: `pnpm test -- src/__tests__/commands/plugin-commands.test.ts`
- Check for missing mocks (VS Code API needs mocking)
- Verify test file matches pattern: `*.test.ts`

### Extension Doesn't Activate

**Symptom**: Extension doesn't appear in Extension Host

**Solutions**:
- Check activation event: Ensure `.agency/agency.config.json` exists in workspace
- View activation logs: Debug Console in original VS Code window
- Check for errors in `src/extension.ts` activate() function
- Reload Extension Host: Ctrl+R

### Breakpoints Don't Work

**Symptom**: Debugger skips breakpoints

**Solutions**:
- Ensure source maps enabled: `esbuild.config.mjs` should have `sourcemap: !production`
- Check breakpoint is in TypeScript file (`src/*.ts`), not bundled file (`dist/extension.js`)
- Reload Extension Host after rebuild

### Watch Mode Not Rebuilding

**Symptom**: Changes don't trigger rebuild

**Solutions**:
- Check watch is running: Look for "Watching for changes..." in terminal
- Restart watch: Kill process (Ctrl+C) and run `pnpm watch` again
- Check file is in `src/` (watch only monitors `src/**/*`)

## Project Structure Reference

```
packages/agency-extension/
├── src/
│   ├── extension.ts          # Entry point - activate/deactivate
│   ├── constants.ts           # Shared constants
│   ├── types/                 # Type definitions
│   ├── status/                # Status bar management
│   ├── commands/              # Command implementations
│   ├── views/                 # Webview panels
│   ├── providers/             # Tree view providers
│   ├── mcp/                   # MCP client
│   └── __tests__/             # Unit tests
├── dist/
│   └── extension.js           # Bundled output (generated)
├── media/
│   └── icons/                 # Extension icons
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript config
├── esbuild.config.mjs         # Bundler config
├── vitest.config.ts           # Test config
├── .vscodeignore              # Marketplace exclusions
├── CHANGELOG.md               # Version history
├── README.md                  # User documentation
└── PUBLISHING.md              # Publishing guide
```

## Useful VS Code Commands

In Extension Host window:

| Command | Action |
|---------|--------|
| `Ctrl+R` (Cmd+R) | Reload extension |
| `Ctrl+Shift+P` | Open Command Palette |
| `Developer: Show Running Extensions` | List active extensions |
| `Developer: Inspect Context Keys` | Debug activation contexts |
| `Developer: Toggle Developer Tools` | Open DevTools for webviews |

## Common Workflows

### Add a New Command

1. Define command in `package.json` > `contributes.commands`:
   ```json
   {
     "command": "agency.myCommand",
     "title": "My Command",
     "category": "Agency"
   }
   ```

2. Register command in `src/extension.ts`:
   ```typescript
   context.subscriptions.push(
     vscode.commands.registerCommand('agency.myCommand', () => {
       // Command implementation
     })
   );
   ```

3. Add tests in `src/__tests__/commands/`:
   ```typescript
   it('should execute myCommand', () => {
     // Test implementation
   });
   ```

4. Rebuild: `pnpm build`
5. Test in Extension Host: Press F5, open Command Palette, search "My Command"

### Add a New Tree View

1. Define view in `package.json` > `contributes.views`:
   ```json
   {
     "id": "agency.myView",
     "name": "My View"
   }
   ```

2. Create provider in `src/providers/MyViewProvider.ts`:
   ```typescript
   export class MyViewProvider implements vscode.TreeDataProvider<MyItem> {
     // Implementation
   }
   ```

3. Register provider in `src/extension.ts`:
   ```typescript
   const myViewProvider = new MyViewProvider();
   vscode.window.createTreeView('agency.myView', {
     treeDataProvider: myViewProvider
   });
   ```

4. Test in Extension Host: View appears in Agency activity bar container

### Add a Dependency

```bash
# Production dependency (bundled with extension)
pnpm add <package>

# Development dependency (not bundled)
pnpm add -D <package>

# Update all dependencies
pnpm update
```

**Note**: Keep production dependencies minimal to reduce bundle size.

## Resources

- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Extension Samples](https://github.com/microsoft/vscode-extension-samples)
- [esbuild Documentation](https://esbuild.github.io/)
- [Vitest Documentation](https://vitest.dev/)
- [pnpm Workspace Guide](https://pnpm.io/workspaces)

---

*Generated by speckit*
