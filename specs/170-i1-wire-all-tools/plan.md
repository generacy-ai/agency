# Implementation Plan: I1: Wire all tools into plugin.ts

**Feature**: Integrate all implemented tools into the main plugin class
**Branch**: `170-i1-wire-all-tools`
**Status**: Complete

## Summary

This task integrates all SpecKit tools into the main plugin class. Upon analysis, the implementation is **already complete** in the existing codebase. All tool factories are imported, tools are created and registered during initialization, and the BacklogProvider and Humancy integrations are properly configured.

## Technical Context

- **Language**: TypeScript
- **Framework**: Agency Plugin SDK
- **Package**: `@generacy-ai/agency-plugin-spec-kit`
- **Dependencies**: `@generacy-ai/agency`, `@generacy-ai/agency-plugin-humancy`, `zod`

## Current Implementation Status

### Completed Components

| Component | File | Status |
|-----------|------|--------|
| Tool factory imports | `src/tools/index.ts` | ✅ Complete |
| Tool creation array | `src/tools/index.ts:createTools()` | ✅ Complete |
| Tool registration | `src/plugin.ts:initialize()` | ✅ Complete |
| Provider registry | `src/providers/registry.ts` | ✅ Complete |
| Humancy integration | `src/tools/manage-clarifications.ts` | ✅ Complete |
| Manifest declaration | `src/manifest.ts` | ✅ Complete |
| Public exports | `src/index.ts` | ✅ Complete |

### Registered Tools (11 total)

1. `spec_kit.git_ops` - Git operations (branch, checkout, fetch, status)
2. `spec_kit.create_feature` - Create feature branch and spec directory
3. `spec_kit.get_paths` - Get feature artifact paths
4. `spec_kit.check_prereqs` - Check prerequisite files exist
5. `spec_kit.copy_template` - Copy templates to feature directory
6. `spec_kit.update_agent` - Update AI agent context files
7. `spec_kit.get_ticket` - Get ticket from backlog provider
8. `spec_kit.create_ticket` - Create ticket in backlog provider
9. `spec_kit.update_ticket` - Update ticket in backlog provider
10. `spec_kit.tasks_to_issues` - Convert tasks.md to GitHub issues
11. `spec_kit.manage_clarifications` - Manage clarifications.md with Humancy integration

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── plugin.ts              # Main plugin class with initialize()
│   ├── manifest.ts            # Plugin manifest with tool declarations
│   ├── config.ts              # Configuration schema (Zod)
│   ├── index.ts               # Public exports
│   ├── tools/
│   │   ├── index.ts           # createTools() factory function
│   │   ├── git-ops.ts         # Git operations tool
│   │   ├── create-feature.ts  # Feature creation tool
│   │   ├── get-paths.ts       # Path resolution tool
│   │   ├── check-prereqs.ts   # Prerequisite checking tool
│   │   ├── copy-template.ts   # Template copying tool
│   │   ├── update-agent.ts    # Agent file updater tool
│   │   ├── get-ticket.ts      # Ticket retrieval tool
│   │   ├── create-ticket.ts   # Ticket creation tool
│   │   ├── update-ticket.ts   # Ticket update tool
│   │   ├── tasks-to-issues.ts # Task to issue conversion tool
│   │   └── manage-clarifications.ts  # Clarifications + Humancy
│   ├── providers/
│   │   ├── registry.ts        # Provider registry with lazy init
│   │   ├── github.ts          # GitHub provider
│   │   ├── github-cli.ts      # GitHub CLI integration
│   │   ├── jira.ts            # Jira provider
│   │   ├── shortcut.ts        # Shortcut provider
│   │   └── local.ts           # Local file provider
│   └── types/
│       └── ...                # Type definitions
└── package.json
```

## Architecture

### Plugin Initialization Flow

```
SpecKitPlugin.initialize(coreAPI)
    │
    ├── 1. Parse configuration (Zod schema)
    │       └── config = parseConfig(rawConfig)
    │
    ├── 2. Create tools with configuration
    │       └── tools = createTools(legacyConfig, coreAPI)
    │           │
    │           ├── Create ProviderRegistry(config)
    │           │
    │           └── Return array of all 11 tools
    │
    ├── 3. Register tools with core
    │       └── for (tool of tools) { core.registerTool(tool) }
    │
    └── 4. Subscribe to mode changes
            └── coreAPI.onModeChange(mode => ...)
```

### Provider Lazy Initialization

```
createTools() -> ProviderRegistry
                      │
                      ├── Factory functions registered on import
                      │   └── import '../providers/github.js'
                      │   └── import '../providers/jira.js'
                      │   └── import '../providers/shortcut.js'
                      │   └── import '../providers/local.js'
                      │
                      └── getProvider(name?) -> lazy create & cache
```

## Verification Tasks

The following items from the acceptance criteria require verification:

### 1. Plugin Load Verification
- [ ] Run `pnpm build` to verify TypeScript compiles without errors
- [ ] Run `pnpm test` to verify unit tests pass
- [ ] Check plugin can be instantiated: `createSpecKitPlugin()`

### 2. Tool Availability Testing
- [ ] Verify each tool is registered with correct name
- [ ] Verify tool input schemas are valid
- [ ] Verify tool execute functions work with test inputs

## Remaining Work

No implementation work is required. The acceptance criteria items that remain are **verification tasks**:

1. **Build verification**: Run `pnpm build` in the package directory
2. **Test verification**: Run `pnpm test` to validate all tools work
3. **Integration test**: Load the plugin in a test harness and verify tools are accessible

## Next Steps

1. Run `/speckit:tasks` to generate the task list for verification work
2. Execute verification tasks
3. Mark acceptance criteria checkboxes as complete

---

*Generated by speckit*
