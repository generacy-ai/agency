# Implementation Plan: Clarification Flow Design with Humancy

**Feature**: Design and document the clarification workflow that uses Humancy instead of issue comments
**Branch**: `165-e1-design-clarification-flow`
**Status**: Complete

## Summary

This design task documents the architecture for integrating the Humancy plugin with the speckit clarification workflow. The design replaces GitHub issue comments as the primary human interaction channel with Humancy's decision queue, enabling real-time, structured questions with a rich three-layer decision model.

## Technical Context

| Aspect | Details |
|--------|---------|
| **Language** | TypeScript |
| **Framework** | MCP (Model Context Protocol) server |
| **Primary Components** | Humancy plugin, Speckit clarifications tool |
| **Integration Points** | Agency core, VS Code extension, GitHub API |

### Dependencies

- `agency-plugin-humancy` - Provides human interaction tools
- `speckit` MCP plugin - Manages clarifications.md file format
- `@modelcontextprotocol/sdk` - MCP server framework

## Architecture Overview

### Current State

The existing clarifications system (`manage_clarifications` tool):
1. Stores questions in `clarifications.md` file
2. Posts questions to GitHub issues
3. Parses answers from issue comment replies
4. Updates local file with answers

### Target State

The new Humancy-integrated flow:
1. Stores questions in `clarifications.md` file (unchanged)
2. Sends questions via Humancy decision queue (new)
3. Receives answers in real-time via SSE/polling (new)
4. Updates local file with answers (unchanged)
5. Falls back to GitHub comments if Humancy unavailable (optional)

## Design Decisions

### D1: Question Batching Strategy

**Decision**: Batch mode - all questions queued simultaneously

**Rationale**:
- Humancy decision queue already supports multiple pending decisions
- Users can answer in any order in the VS Code panel
- Reduces context switches for the user
- Agent can continue with other work while waiting

### D2: Timeout Behavior

**Decision**: Configurable per-question with workflow-level default

**Rationale**:
- Critical questions can be marked as blocking (`blocking_now`)
- Non-critical questions can proceed with defaults (`when_available`)
- Allows workflow customization via urgency levels

### D3: Partial Answers

**Decision**: Allow proceeding with unanswered questions (threshold-based)

**Rationale**:
- Non-blocking questions shouldn't halt workflow
- User can always re-run `/speckit:clarify` later
- Questions remain in `clarifications.md` for future resolution

### D4: Deliverable Location

**Decision**: Design document in feature spec directory (`specs/165-*/`)

**Rationale**:
- Keeps design documentation with the feature
- Architecture decisions are feature-specific
- Can be referenced in future implementation tasks

### D5: Humancy Dependency

**Decision**: Optional with GitHub fallback

**Rationale**:
- Maintains compatibility with environments without Humancy
- Graceful degradation to existing GitHub comment flow
- Humancy availability checked at runtime

## Project Structure

```
specs/165-e1-design-clarification-flow/
├── spec.md                 # Feature specification
├── plan.md                 # This file
├── research.md             # Technology decisions
├── data-model.md           # Interface definitions
├── quickstart.md           # Usage guide
└── contracts/
    └── humancy-clarification-api.json  # API contract
```

## Sequence Diagrams

### Happy Path: Humancy Available

```
┌─────────┐      ┌─────────────┐      ┌─────────┐      ┌────────┐
│  Agent  │      │   Speckit   │      │ Humancy │      │  User  │
└────┬────┘      └──────┬──────┘      └────┬────┘      └───┬────┘
     │                  │                  │               │
     │ /speckit:clarify │                  │               │
     │─────────────────>│                  │               │
     │                  │                  │               │
     │                  │ manage_clarifications(append)    │
     │                  │─────────────────>│               │
     │                  │                  │               │
     │                  │                  │ ask_question  │
     │                  │                  │──────────────>│
     │                  │                  │               │
     │                  │                  │    answer     │
     │                  │                  │<──────────────│
     │                  │                  │               │
     │                  │ answer returned  │               │
     │                  │<─────────────────│               │
     │                  │                  │               │
     │                  │ update_answer()  │               │
     │                  │                  │               │
     │ clarifications   │                  │               │
     │<─────────────────│                  │               │
     │                  │                  │               │
```

### Fallback: GitHub Comments

```
┌─────────┐      ┌─────────────┐      ┌────────┐      ┌────────┐
│  Agent  │      │   Speckit   │      │ GitHub │      │  User  │
└────┬────┘      └──────┬──────┘      └───┬────┘      └───┬────┘
     │                  │                 │               │
     │ /speckit:clarify │                 │               │
     │─────────────────>│                 │               │
     │                  │                 │               │
     │                  │ Humancy not     │               │
     │                  │ available       │               │
     │                  │                 │               │
     │                  │ POST comment    │               │
     │                  │────────────────>│               │
     │                  │                 │               │
     │                  │                 │   view issue  │
     │                  │                 │<──────────────│
     │                  │                 │               │
     │                  │                 │ reply comment │
     │                  │                 │<──────────────│
     │                  │                 │               │
     │ (later)          │                 │               │
     │ /speckit:clarify │                 │               │
     │─────────────────>│                 │               │
     │                  │ GET comments    │               │
     │                  │────────────────>│               │
     │                  │ parse answers   │               │
     │<─────────────────│                 │               │
     │                  │                 │               │
```

## Data Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           /speckit:clarify                               │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Analyze spec.md for gaps                              │
│                    Generate clarification questions                      │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    manage_clarifications(append)                         │
│                    - Write questions to clarifications.md                │
│                    - Check Humancy availability                          │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
          Humancy available              Humancy unavailable
                    │                               │
                    ▼                               ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│    humancy.ask_question()         │ │    Post to GitHub issue           │
│    - For each question            │ │    - Formatted comment            │
│    - With urgency level           │ │    - Wait for reply               │
│    - Timeout configuration        │ │                                   │
└───────────────────┬───────────────┘ └───────────────────┬───────────────┘
                    │                                     │
                    ▼                                     ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────┐
│    Wait for responses             │ │    Parse comment replies          │
│    - SSE subscription             │ │    - Regex matching               │
│    - Polling fallback             │ │    - Manual trigger               │
│    - Timeout handling             │ │                                   │
└───────────────────┬───────────────┘ └───────────────────┬───────────────┘
                    │                                     │
                    └───────────────┬─────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    manage_clarifications(update_answer)                  │
│                    - Update clarifications.md with answers               │
│                    - Mark questions as answered                          │
└───────────────────────────────────┬──────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                    Return clarification results                          │
│                    - Answered questions count                            │
│                    - Pending questions list                              │
│                    - Workflow continuation status                        │
└──────────────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Interface Design (This Task)
- Document clarification flow architecture
- Define Humancy tool usage patterns
- Create data models and contracts
- Sequence and data flow diagrams

### Phase 2: Speckit Integration (Future Task)
- Modify `manage_clarifications` tool
- Add Humancy client integration
- Implement fallback logic
- Update file format if needed

### Phase 3: Testing & Validation (Future Task)
- Unit tests for new integration
- E2E tests with Humancy mock
- Fallback behavior tests
- Performance validation

## Constitution Check

Verified against project constitution:
- ✅ Uses TypeScript for all implementation
- ✅ Follows MCP tool patterns
- ✅ Maintains backward compatibility (GitHub fallback)
- ✅ Documentation-first approach for design tasks

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Humancy unavailable | Medium | Low | GitHub fallback implemented |
| SSE connection drops | Low | Medium | Polling fallback, reconnection logic |
| Question timeout | Medium | Low | Configurable timeouts, skip option |
| Answer correlation | Low | Medium | Use decision IDs for tracking |

## Next Steps

1. Run `/speckit:tasks` to generate task list from this plan
2. Implement the integration in a future task
3. Create unit and integration tests
