# Feature Specification: Tool registry and naming convention

**Branch**: `010-tool-registry-naming-convention` | **Date**: 2026-01-17 | **Status**: Draft

## Summary

Implement the tool registry with enforced naming conventions for agent-ergonomic tool organization. The registry provides a central location for tool registration, lookup, and catalog generation with validation that supports both standard and custom prefixes.

## Parent Epic

#6 - Agency Core Package

## Dependencies

- #7 - MCP server foundation

## Requirements

### Tool Registry

```typescript
class ToolRegistry {
  // Registration
  register(tool: ToolDefinition): void;
  unregister(name: string): void;

  // Queries
  getAll(): ToolDefinition[];
  getByName(name: string): ToolDefinition | undefined;
  getByPrefix(prefix: string): ToolDefinition[];

  // Catalog
  getCatalog(): ToolCatalog;

  // Validation
  validateName(name: string, options?: ValidationOptions): ValidationResult;
}

interface ValidationOptions {
  strict?: boolean;  // Default: false. When true, reject custom prefixes entirely
}
```

### Tool Definition

Minimal interfaces following the "Thin, Stable Contracts" principle - essential fields only, extensible later:

```typescript
interface ToolDefinition {
  name: string;                    // e.g., "source_control.commit"
  description: string;
  parameters: ParameterDefinition[];
  returns: ReturnDefinition;
  handler: ToolHandler;
  modes?: string[];                // Modes where active
  plugin: string;                  // Owning plugin
}

// Minimal type definitions - can be extended later
interface ParameterDefinition {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface ReturnDefinition {
  type: string;
  description?: string;
}

type ToolHandler = (params: Record<string, unknown>) => Promise<unknown>;

interface ToolCatalog {
  tools: ToolDefinition[];
  byPrefix: Record<string, ToolDefinition[]>;
  generatedAt: string;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
```

### Naming Convention

**Format**: `prefix.action_name`

**Standard Prefixes**:
| Prefix | Description | Examples |
|--------|-------------|----------|
| `source_control` | Version control | commit, push, status, diff |
| `build` | Build/compile operations | install, compile, lint |
| `run` | Runtime operations | start, stop, restart |
| `test` | Testing operations | unit, integration, e2e |
| `humancy` | Human interaction | ask_question, request_review |
| `debug` | Debugging tools | logs, breakpoint, trace |
| `docs` | Documentation | generate, search |

### Naming Validation

```typescript
function validateToolName(name: string, options?: ValidationOptions): ValidationResult {
  // Must contain exactly one dot
  // Prefix must be from approved list (or custom with warning in permissive mode, error in strict mode)
  // Action must be snake_case
  // Length warnings (not hard limits):
  //   - Prefix: warn above 20 chars
  //   - Action: warn above 30 chars
  //   - Total: warn above 50 chars
}
```

**Custom Prefix Policy**:
- **Permissive mode (default)**: Custom prefixes allowed with warning returned in `ValidationResult.warnings`
- **Strict mode**: Custom prefixes rejected with error in `ValidationResult.errors`

**Length Limits**:
- No hard limits - only warnings above recommended thresholds
- Recommended: prefix ~20 chars, action ~30 chars, total ~50 chars
- Warnings returned in `ValidationResult.warnings`

### Duplicate Tool Handling

When registering a tool with an existing name:
- Replace the existing tool (later registration wins)
- Log a warning that a tool was overwritten
- Include previous plugin name in warning for debugging

### Catalog Generation

- Auto-generate tool catalog from registry
- Group tools by prefix
- Include descriptions and parameter docs
- **Export format**: JSON as single source of truth
- **Optional**: Markdown renderer on-demand for documentation

## Acceptance Criteria

- [ ] Tools registered with valid names
- [ ] Invalid names rejected with clear error
- [ ] Tools queryable by prefix
- [ ] Catalog generation works (JSON format)
- [ ] Standard prefixes documented
- [ ] Custom prefixes allowed with warning (permissive mode)
- [ ] Custom prefixes rejected in strict mode
- [ ] Duplicate registrations replace with warning
- [ ] Length warnings above recommended thresholds

## User Stories

### US1: Plugin Developer Registers Tools

**As a** plugin developer,
**I want** to register my tools with validated naming conventions,
**So that** tools are discoverable and follow consistent patterns.

**Acceptance Criteria**:
- [ ] Can register tools with standard prefixes
- [ ] Receive warnings for custom prefixes in permissive mode
- [ ] Receive errors for custom prefixes in strict mode
- [ ] Receive warnings for overly long names

### US2: Agent Discovers Tools

**As an** AI agent,
**I want** to query available tools by prefix,
**So that** I can find relevant tools for a given task.

**Acceptance Criteria**:
- [ ] Can get all tools
- [ ] Can filter tools by prefix
- [ ] Can get tool by exact name
- [ ] Catalog provides grouped view

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Register tool with ToolDefinition | P1 | Core functionality |
| FR-002 | Unregister tool by name | P1 | Cleanup support |
| FR-003 | Query tools by prefix | P1 | Discovery |
| FR-004 | Validate tool names | P1 | Naming convention enforcement |
| FR-005 | Generate JSON catalog | P1 | Programmatic access |
| FR-006 | Generate Markdown from catalog | P2 | Documentation on-demand |
| FR-007 | Strict validation mode | P2 | For official integrations |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Tool registration | Works for all standard prefixes | Unit tests pass |
| SC-002 | Validation accuracy | All invalid names rejected | Edge case tests |
| SC-003 | Catalog generation | JSON output matches schema | Schema validation |

## Assumptions

- Tool names are unique within the registry
- Standard prefixes list is fixed for initial release
- Plugins are responsible for providing valid ToolHandler implementations

## Out of Scope

- Runtime tool execution (handled by MCP layer)
- Tool permission management
- Tool versioning
- Remote tool discovery

---

*Generated by speckit*
