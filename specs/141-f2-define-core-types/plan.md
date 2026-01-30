# Implementation Plan: F2: Define core types (Feature, Paths, TicketRef, etc.)

**Feature**: Define TypeScript types shared across all spec-kit tools
**Branch**: `141-f2-define-core-types`
**Status**: Complete

## Summary

This feature adds comprehensive TypeScript type definitions to the `@generacy-ai/agency-plugin-spec-kit` package. The types will be ported and adapted from the existing speckit plugin in `/workspaces/claude-plugins/plugins/speckit/`, with modifications based on clarification answers:

- **TicketRef**: Using string-based provider with constants for extensibility (allowing custom providers via Agency plugins)
- **Config Schema**: Core + extensible design with essential options and room for plugin extension
- **Utilities**: Include helper functions alongside types (types + utilities approach)

## Technical Context

| Aspect | Details |
|--------|---------|
| Language | TypeScript 5.7+ |
| Build | tsc (standard TypeScript compilation) |
| Runtime | Node.js (ESM modules) |
| Dependencies | Zod for runtime schema validation |
| Target Package | `@generacy-ai/agency-plugin-spec-kit` |

## Project Structure

```
packages/agency-plugin-spec-kit/
├── src/
│   ├── types/
│   │   ├── index.ts              # Re-exports all types
│   │   ├── feature.ts            # Feature, FeaturePaths, BranchInfo
│   │   ├── ticket.ts             # Ticket, TicketRef, TicketParams, TicketUpdates
│   │   ├── task.ts               # Task, TaskGroup, TaskDependency, GroupingStrategy
│   │   ├── clarification.ts      # ClarificationQuestion, ClarificationBatch
│   │   ├── config.ts             # SpecKitConfig schema with Zod
│   │   ├── dependency.ts         # TaskDependency, DependencyGraph types
│   │   ├── issue.ts              # Issue creation types (IssuePlan, CreatedIssue)
│   │   └── errors.ts             # ErrorCode, McpError types
│   ├── utils/
│   │   └── index.ts              # Task ID builders, regex utilities
│   ├── config.ts                 # Updated with Zod schema
│   └── index.ts                  # Package entry point
├── package.json                  # Add zod dependency
└── tsconfig.json
```

## Key Types Overview

### feature.ts
- `Feature` - A numbered development unit with specification artifacts
- `FeaturePaths` - All paths associated with a feature (spec, plan, tasks files)
- `BranchInfo` - Git branch metadata
- `PrerequisiteResult` - Result of checking command prerequisites

### ticket.ts
- `TicketProvider` - String type with known provider constants
- `TicketRef` - Provider-agnostic ticket reference (extensible for custom providers)
- `TicketParams` - Parameters for ticket operations
- `TicketUpdates` - Changes to apply to a ticket

### task.ts
- `Task` - Single task parsed from tasks.md
- `TaskGroup` - Group of tasks for issue creation
- `TaskGroupEntry` - TG-XXX format task group
- `SubTask` - Checkbox item within a task group
- `GroupingStrategy` - Strategy for grouping tasks into issues
- `TaskIdConfig` - Configuration for task ID format

### clarification.ts
- `ClarificationQuestion` - Question with answer status
- `ClarificationOption` - A/B/C options for questions
- `ClarificationBatch` - Group of questions added together
- `ClarificationsFile` - Complete file content model

### config.ts
- `SpecKitConfig` - Core configuration schema with Zod
- File name customization (spec.md, plan.md, etc.)
- Task ID format configuration
- Extensibility hooks for plugins

### dependency.ts
- `TaskDependency` - Dependency info from task descriptions
- `DependencyGraph` - Phase-based dependency graph
- `DependencyValidationResult` - Validation outcome
- `CircularDependency` - Cycle detection info

### issue.ts
- `IssuePlan` - Planned issue for preview/dry-run
- `CreatedIssue` - Successfully created GitHub issue
- `TasksToIssuesResult` - Result of issue creation operation

### errors.ts
- `ErrorCode` - String literal union of error codes
- `McpError` - Structured error format for MCP tools
- `createError()` - Factory function for errors

## Implementation Approach

1. **Port existing types** from `/workspaces/claude-plugins/plugins/speckit/mcp-server/src/types/`
2. **Adapt TicketRef** to use string-based provider type with constants for known providers
3. **Enhance config** with Zod schemas for runtime validation
4. **Add utility functions** alongside type definitions:
   - `buildTaskId()`, `buildTaskGroupId()` - ID generation
   - `buildTaskIdPattern()` - Regex pattern builders
   - `escapeRegex()` - Regex utility
   - `createError()` - Error factory

## Dependencies

- F1 (package structure) - Assumed complete; spec-kit package already exists
- Zod - Add to package.json for config schema validation

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| TicketRef provider type | String + constants | Allows custom providers via plugins (clarification Q1) |
| Config scope | Core + extensible | Essential options with plugin extension hooks (clarification Q2) |
| Include utilities | Yes | Types + utilities in same module (clarification Q3) |
| Validation approach | Zod schemas | Runtime validation with TypeScript inference |
| Module format | ESM | Consistent with rest of agency monorepo |
