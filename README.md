# Agency

Agent environment curation for the [Generacy](https://generacy.ai) ecosystem. Agency is an MCP (Model Context Protocol) server and plugin system that gives AI development agents access to build, test, source control, and infrastructure tools -- and gives humans a way to curate, test, and refine that agent environment.

## Packages

| Package | Description |
|---------|-------------|
| [`@generacy-ai/agency`](packages/agency/) | Core MCP server with plugin-based tool registration |
| [`agency`](packages/agency-extension/) | VS Code extension for plugin configuration and activity monitoring |
| [`@generacy-ai/agency-plugin-git`](packages/agency-plugin-git/) | Git source control tools |
| [`@generacy-ai/agency-plugin-docker`](packages/agency-plugin-docker/) | Docker operations tools |
| [`@generacy-ai/agency-plugin-firebase`](packages/agency-plugin-firebase/) | Firebase operations tools |
| [`@generacy-ai/agency-plugin-npm`](packages/agency-plugin-npm/) | npm ecosystem operations tools |
| [`@generacy-ai/agency-plugin-humancy`](packages/agency-plugin-humancy/) | Human-in-the-loop integration |
| [`@generacy-ai/agency-plugin-spec-kit`](packages/agency-plugin-spec-kit/) | Structured feature development tools |

## Getting Started

```bash
npm install @generacy-ai/agency
```

## Development

This repo uses [pnpm](https://pnpm.io/) workspaces with [Turbo](https://turbo.build/) for builds.

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Contributing

We welcome contributions. Please open an issue or pull request.

All changes should include a [changeset](https://github.com/changesets/changesets) (`pnpm changeset`) describing the change.

## License

[MIT](LICENSE) -- Copyright 2026 The Generacy AI Authors
