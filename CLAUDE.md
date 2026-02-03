# Agency

Monorepo containing agency packages for the Tetrad ecosystem.

## Packages

- `packages/agency` - Core agency MCP server providing build, test, source control, and Docker tools
- VS Code extension for agency integration

## Development

This repo uses pnpm workspaces. Build with:
```bash
pnpm install
pnpm build
```

## MCP Testing Tools

For VS Code extension testing and browser automation capabilities, see the central documentation:
[/workspaces/tetrad-development/docs/MCP_TESTING_TOOLS.md](/workspaces/tetrad-development/docs/MCP_TESTING_TOOLS.md)

To test the Agency VS Code extension:
1. Start code-server: `/workspaces/tetrad-development/scripts/stack code-server`
2. Navigate to http://localhost:8443 with Playwright
3. Install the extension and test functionality

## Development Stack

For Firebase emulators and shared services:
```bash
/workspaces/tetrad-development/scripts/stack start
source /workspaces/tetrad-development/scripts/stack-env.sh
```

See [/workspaces/tetrad-development/docs/DEVELOPMENT_STACK.md](/workspaces/tetrad-development/docs/DEVELOPMENT_STACK.md)
