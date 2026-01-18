# Implementation Plan: Plugin: @generacy-ai/agency-plugin-humancy

**Feature**: Implement the Humancy bridge plugin for human-agent interaction
**Branch**: `018-plugin-generacy-ai-agency`
**Status**: Complete

## Summary

This plan implements the Humancy plugin (`@generacy-ai/agency-plugin-humancy`) which bridges AI agents to human users via the Humancy VS Code extension. The plugin provides four tools for human interaction:

1. `humancy.ask_question` - Freeform questions with text responses
2. `humancy.request_review` - Artifact review with approval status
3. `humancy.request_decision` - Structured option selection
4. `humancy.notify` - Fire-and-forget notifications

The plugin integrates with the channel router for message persistence and supports hybrid connection mode detection (Direct → Generacy → Offline).

## Technical Context

| Aspect | Value |
|--------|-------|
| Language | TypeScript 5.x |
| Runtime | Node.js 20+ |
| Module System | ESM (`"type": "module"`) |
| Build | tsc |
| Test Framework | Vitest |
| Package Manager | pnpm workspaces |

### Dependencies

| Package | Version | Type | Notes |
|---------|---------|------|-------|
| `@generacy-ai/agency` | workspace:* | peer | Core plugin API |
| `zod` | ^3.x | regular | Input validation |
| `vitest` | ^2.x | dev | Testing |
| `typescript` | ^5.x | dev | Compilation |

## Project Structure

```
packages/agency-plugin-humancy/
├── package.json                    # Package config with peer dependency
├── tsconfig.json                   # Extends ../../tsconfig.base.json
├── src/
│   ├── index.ts                    # Plugin entry point & exports
│   ├── manifest.ts                 # Plugin manifest definition
│   ├── plugin.ts                   # HumancyPlugin class
│   ├── types/
│   │   ├── index.ts                # Type exports
│   │   ├── requests.ts             # Request types (DecisionRequest, ReviewRequest, etc.)
│   │   └── responses.ts            # Response types (HumanResponse, etc.)
│   ├── tools/
│   │   ├── index.ts                # Tool exports
│   │   ├── ask-question.ts         # humancy.ask_question tool
│   │   ├── request-review.ts       # humancy.request_review tool
│   │   ├── request-decision.ts     # humancy.request_decision tool
│   │   └── notify.ts               # humancy.notify tool
│   ├── connection/
│   │   ├── index.ts                # Connection exports
│   │   ├── detector.ts             # ConnectionModeDetector
│   │   └── types.ts                # ConnectionMode enum
│   └── __tests__/
│       ├── tools/
│       │   ├── ask-question.test.ts
│       │   ├── request-review.test.ts
│       │   ├── request-decision.test.ts
│       │   └── notify.test.ts
│       ├── connection.test.ts
│       └── plugin.test.ts
└── dist/                           # Compiled output
```

## Constitution Check

No constitution.md found in `.specify/memory/`. Proceeding with standard implementation patterns from the codebase.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Agent Runtime                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  HumancyPlugin                           │    │
│  │  ┌─────────────────┐  ┌─────────────────────────────┐   │    │
│  │  │ ConnectionMode  │  │         Tools               │   │    │
│  │  │   Detector      │  │  ├─ ask_question            │   │    │
│  │  │                 │  │  ├─ request_review          │   │    │
│  │  │  Direct         │  │  ├─ request_decision        │   │    │
│  │  │  Via Generacy   │  │  └─ notify                  │   │    │
│  │  │  Offline        │  │                             │   │    │
│  │  └─────────────────┘  └─────────────────────────────┘   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                    Channel Router                                │
│                    (agency.humancy)                              │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    ┌───────────────────┐
                    │ Humancy Extension │
                    │   (VS Code)       │
                    └───────────────────┘
```

## Implementation Phases

### Phase 1: Package Setup

- Initialize package structure and dependencies
- Create manifest with proper plugin metadata
- Set up build configuration

### Phase 2: Type Definitions

- Define request/response types matching contracts
- Define urgency levels enum
- Define connection mode enum

### Phase 3: Connection Mode Detection

- Implement hybrid detection logic
- Config preference check
- Auto-detection fallback chain
- Connection state tracking

### Phase 4: Tool Implementation

- Implement all 4 tools using TerseOutput pattern
- Channel router integration for message sending
- Timeout handling with error responses

### Phase 5: Plugin Lifecycle

- Initialize with CoreAPI
- Register tools and channels
- Handle mode changes
- Proper shutdown cleanup

### Phase 6: Testing

- Unit tests for each tool
- Connection mode detection tests
- Integration tests with mock channel router

## Key Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Message ID generation | UUID v4 | Unique correlation across distributed systems |
| Timeout default | 30 seconds | Matches channel router default |
| Error format | TerseOutput.failure | Consistent with agency patterns |
| Config key | `humancy.mode` | Plugin-namespaced configuration |
| Channel name | `agency.humancy` | Pre-registered in channel manager |

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Channel router not available | Offline mode fallback with queue |
| Humancy extension not installed | Detection returns Offline mode |
| Timeout handling | Clear error with elapsed time for agent decision |
| Message loss | Delegated to channel router persistence |

## Next Steps

Run `/speckit:tasks` to generate the task list from this plan.
