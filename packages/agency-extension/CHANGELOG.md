# Changelog

All notable changes to the Agency VS Code extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-01-22

### Added
- Initial release of Agency VS Code Extension
- Plugin configuration UI with tree view
- Enable/disable plugins with one click
- Plugin-specific settings configuration panel
- MCP tool testing with in-situ execution
- Real-time activity monitoring feed
- Dev container management (start/stop/rebuild)
- Container logs viewer
- Mode management and switching
- Mode inheritance visualization
- Configuration stored in `.agency/agency.config.json`
- Comprehensive README with usage guide
- VS Code marketplace listing

### Infrastructure
- Extension scaffold with activation events
- Package configuration with VS Code extension manifest
- Build configuration with esbuild
- Test configuration with vitest
- TypeScript 5.x with strict mode
- Zod schema validation
- MCP SDK integration (@modelcontextprotocol/sdk)
