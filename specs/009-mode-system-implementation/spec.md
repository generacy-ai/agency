# Feature Specification: Mode system implementation

**Branch**: `009-mode-system-implementation` | **Date**: 2026-01-18 | **Status**: Draft

## Summary

Implement the mode system that controls which tools are active at any given time.

## Parent Epic

#6 - Agency Core Package

## Dependencies

- #7 - MCP server foundation
- #8 - Plugin loader

## Requirements

### Mode Manager

```typescript
class ModeManager {
  constructor(config: ModeConfig);

  // Mode operations
  setMode(mode: string): void;
  getMode(): string;
  getAvailableModes(): string[];

  // Tool filtering
  getActiveTools(): ToolDefinition[];
  isToolActive(toolName: string): boolean;

  // Events
  onModeChange(callback: (mode: string) => void): void;
}
```

### Mode Definition

```typescript
interface ModeDefinition {
  name: string;
  description?: string;
  extends?: string;                // Inherit from parent mode
  includes: string[];              // Tool patterns to include (glob)
  excludes?: string[];             // Tool patterns to exclude
}
```

### Built-in Modes

```yaml
modes:
  research:
    description: "Information gathering and exploration"
    includes:
      - "humancy.*"
      - "source_control.status"
      - "source_control.log"

  coding:
    description: "Active development"
    extends: research
    includes:
      - "source_control.*"
      - "build.*"
      - "test.*"

  review:
    description: "Code review and feedback"
    extends: research
    includes:
      - "source_control.diff"
      - "source_control.blame"

  debug:
    description: "Debugging and troubleshooting"
    extends: coding
    includes:
      - "run.*"
```

### Persistent Mode

- Generacy can set mode before agent invocation
- Mode persists across tool calls within session
- Mode can be changed mid-session by agent

### Tool Pattern Matching

- Support glob patterns: `source_control.*`
- Support exact matches: `build.compile`
- Support negation: `!test.integration_*`

## Clarified Decisions

Based on clarification Q&A:

### Default Mode
- **Default mode**: `coding` — Agents are the primary workers doing development work. This aligns with agent ergonomics philosophy.

### Error Handling
- **Invalid mode name**: Throw an error immediately — Fail fast on misconfiguration. Terse output pattern means minimal noise on success, detailed on failure.

### Circular Inheritance
- **Circular extension**: Validate at config load time and throw an error — Config is loaded once; validation cost is negligible. Circular inheritance is always a user mistake.

### Pattern Conflict Resolution
- **Includes vs excludes conflict**: Excludes always win — Predictable and secure. Users don't need to reason about pattern specificity or ordering.

### Configuration Source
- **Config loading**: Both file-based and API override capability
  - Standard location: `.agency/modes.yaml`
  - Enables CLI-first (manual config) and UI-first (Humancy creates config) onboarding
  - API override enables Generacy orchestration

## Acceptance Criteria

- [ ] Modes filter available tools
- [ ] Mode inheritance works (extends)
- [ ] Tool patterns with globs work
- [ ] Mode changes notify subscribers
- [ ] Default mode configuration provided (coding mode)
- [ ] Persistent mode from Generacy works
- [ ] Invalid mode throws error
- [ ] Circular inheritance detected at load time
- [ ] Excludes patterns take precedence over includes
- [ ] Config loadable from file or API

## User Stories

### US1: Agent Mode Selection

**As a** development agent,
**I want** to have appropriate tools available based on my current task,
**So that** I can work efficiently without being distracted by irrelevant tools.

**Acceptance Criteria**:
- [ ] Default to coding mode on startup
- [ ] Mode change updates available tools immediately

### US2: Generacy Orchestration

**As a** Generacy orchestrator,
**I want** to set agent mode before invocation,
**So that** I can control agent capabilities based on workflow phase.

**Acceptance Criteria**:
- [ ] Mode can be set via API before agent starts
- [ ] Mode persists across tool calls within session

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | ModeManager filters tools based on active mode | P1 | Core functionality |
| FR-002 | Mode inheritance resolves parent includes/excludes | P1 | |
| FR-003 | Glob pattern matching for tool names | P1 | |
| FR-004 | Mode change event notifications | P2 | |
| FR-005 | Config loading from .agency/modes.yaml | P1 | |
| FR-006 | API override for mode configuration | P2 | |
| FR-007 | Circular inheritance validation at load | P1 | |
| FR-008 | Invalid mode throws error | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Mode switch latency | <10ms | Performance test |
| SC-002 | Config validation coverage | 100% | Unit tests |

## Assumptions

- Tool definitions include a `name` property suitable for pattern matching
- PluginLoader provides access to registered tool definitions
- Glob pattern library available (e.g., minimatch)

## Out of Scope

- Dynamic mode creation at runtime
- User-facing mode UI (handled by Humancy)
- Mode persistence across sessions (handled by Generacy)

---

*Generated by speckit*
