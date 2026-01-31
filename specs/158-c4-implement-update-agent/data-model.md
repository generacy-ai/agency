# Data Model: C4: Implement update_agent tool

## Core Entities

### AgentType

Supported AI agent identifiers.

```typescript
type AgentType =
  | 'claude'
  | 'gemini'
  | 'copilot'
  | 'cursor-agent'
  | 'qwen'
  | 'opencode'
  | 'codex'
  | 'windsurf'
  | 'kilocode'
  | 'auggie'
  | 'roo'
  | 'codebuddy'
  | 'qoder'
  | 'amp'
  | 'shai'
  | 'q'
  | 'bob';
```

### AgentConfig

Configuration for each agent type.

```typescript
interface AgentConfig {
  /** Agent type identifier */
  type: AgentType;
  /** File path relative to repository root */
  filePath: string;
  /** Human-readable display name */
  displayName: string;
}
```

### AGENT_CONFIGS

Static mapping of agent types to their configurations.

```typescript
const AGENT_CONFIGS: Record<AgentType, AgentConfig> = {
  claude: {
    type: 'claude',
    filePath: 'CLAUDE.md',
    displayName: 'Claude Code',
  },
  gemini: {
    type: 'gemini',
    filePath: 'GEMINI.md',
    displayName: 'Gemini CLI',
  },
  copilot: {
    type: 'copilot',
    filePath: '.github/agents/copilot-instructions.md',
    displayName: 'GitHub Copilot',
  },
  'cursor-agent': {
    type: 'cursor-agent',
    filePath: '.cursor/rules/agent.mdc',
    displayName: 'Cursor Agent',
  },
  // ... remaining 13 agents
};
```

## Input/Output Types

### UpdateAgentParams

Tool input parameters.

```typescript
interface UpdateAgentParams {
  /** Specific agent to update, or undefined for all existing */
  agent_type?: AgentType;
  /** Create agent file from template if missing */
  create_if_missing?: boolean;
  /** Feature directory containing plan.md */
  feature_dir?: string;
  /** Working directory */
  cwd?: string;
}
```

### UpdateResult

Successful update record.

```typescript
interface UpdateResult {
  /** Agent type that was updated */
  agent: AgentType;
  /** Full path to updated file */
  filePath: string;
  /** Whether file was newly created */
  created: boolean;
}
```

### UpdateError

Failed update record.

```typescript
interface UpdateError {
  /** Agent type that failed */
  agent: AgentType;
  /** Structured error information */
  error: {
    code: string;
    message: string;
  };
}
```

### UpdateAgentResult

Complete tool response.

```typescript
interface UpdateAgentResult {
  /** Overall success status */
  success: boolean;
  /** Successfully updated agents */
  updated: UpdateResult[];
  /** Agents skipped (file doesn't exist) */
  skipped?: string[];
  /** Agents that encountered errors */
  errors?: UpdateError[];
  /** Extracted technology data from plan.md */
  plan_data: Record<string, string>;
}
```

## Extracted Data

### PlanData

Technology information extracted from plan.md.

```typescript
interface PlanData {
  /** Programming language and version */
  language?: string;
  /** Framework and library dependencies */
  dependencies?: string;
  /** Storage/database technologies */
  storage?: string;
  /** Testing frameworks */
  testing?: string;
  /** Type of project */
  projectType?: string;
}
```

## Validation Rules

1. **agent_type**: Must be one of the 17 supported agent types
2. **feature_dir**: Must exist and contain plan.md
3. **create_if_missing**: Boolean, defaults to false
4. **cwd**: Valid directory path, defaults to process.cwd()

## File Format Markers

Agent context files use these markers for auto-generated sections:

```markdown
<!-- TECHNOLOGIES START -->
<!-- TECHNOLOGIES END -->

<!-- CHANGES START -->
<!-- CHANGES END -->

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
```

## Relationships

```
UpdateAgentParams
       │
       ▼
┌──────────────┐
│ update_agent │──► reads plan.md ──► PlanData
│    tool      │
└──────────────┘
       │
       ├──► UpdateResult (for each successful agent)
       ├──► skipped[] (agents without files)
       └──► UpdateError (for failures)
       │
       ▼
UpdateAgentResult
```
