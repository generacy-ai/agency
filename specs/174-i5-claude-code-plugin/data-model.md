# Data Model: Claude Code Plugin Commands

## Core Entities

### CommandFile
Represents a slash command definition file.

```typescript
interface CommandFile {
  // Metadata (YAML frontmatter)
  frontmatter: {
    description: string;           // Brief command description
    arguments?: ArgumentDef[];     // Optional command arguments
  };

  // Content (Markdown body)
  title: string;                   // Command display name
  instructions: InstructionStep[]; // Numbered execution steps
  constraints: string[];           // Execution limitations
  postCommandCheck: string;        // Workflow continuation guidance
}

interface ArgumentDef {
  name: string;
  description: string;
  required: boolean;
}

interface InstructionStep {
  number: number;
  title: string;
  actions: string[];      // Sub-steps or bullet points
  mcpToolCalls?: string[]; // MCP tools to invoke
}
```

### PluginConfig
Plugin metadata from plugin.json.

```typescript
interface PluginConfig {
  name: string;           // Plugin identifier
  version: string;        // Semantic version
  description: string;    // Plugin purpose
  requires: {
    mcp: string[];        // Required MCP server packages
  };
}
```

### MCPToolReference
Reference to an MCP tool within command instructions.

```typescript
interface MCPToolReference {
  toolName: string;       // e.g., "check_prereqs", "get_paths"
  parameters: Record<string, unknown>;
  context: string;        // Description of why tool is called
}
```

## Command-Specific Models

### PlanCommand Output
```typescript
interface PlanArtifacts {
  planMd: {
    summary: string;
    techContext: TechContext;
    projectStructure: FileStructure[];
  };
  researchMd?: {
    decisions: TechDecision[];
    alternatives: Alternative[];
    patterns: string[];
  };
  dataModelMd?: {
    entities: EntityDef[];
    relationships: Relationship[];
  };
  quickstartMd?: {
    installation: string[];
    usage: string[];
    troubleshooting: FAQ[];
  };
}
```

### TasksCommand Output
```typescript
interface TasksFile {
  header: {
    input: string;
    prerequisites: string[];
    status: 'Complete' | 'Draft';
    mode?: 'Epic' | 'Standard';
  };
  phases: Phase[];
  dependencyNotes: string;
}

interface Phase {
  name: string;
  tasks: Task[];
}

interface Task {
  id: string;              // T001, TG-001
  parallel: boolean;       // Has [P] marker
  userStory?: string;      // [US1], [US2]
  description: string;
  files?: string[];        // For epic mode
  tests?: string;          // For epic mode
  subtasks?: string[];     // For epic mode task groups
}
```

### TasksToIssuesCommand Input/Output
```typescript
interface TasksToIssuesInput {
  tasksFile: string;
  groupingStrategy: 'per-task' | 'per-story' | 'per-phase';
  epicNumber?: number;
  dryRun: boolean;
}

interface TasksToIssuesOutput {
  issuesCreated: IssueRef[];
  dependencies: DependencyLink[];
  errors?: string[];
}

interface IssueRef {
  number: number;
  title: string;
  url: string;
  tasks: string[];  // Task IDs included
}
```

### ImplementCommand State
```typescript
interface ImplementState {
  phases: PhaseState[];
  currentPhase: number;
  executionPlan: ExecutionItem[];
}

interface PhaseState {
  name: string;
  tasks: TaskState[];
  complete: boolean;
}

interface TaskState {
  id: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed' | 'skipped';
  agentId?: string;       // For parallel tasks
  error?: string;
}

type ExecutionItem =
  | { type: 'sequential'; taskId: string }
  | { type: 'parallel'; taskIds: string[] };
```

### ChecklistCommand Output
```typescript
interface ChecklistFile {
  type: ChecklistType;
  feature: string;
  createdDate: string;
  categories: ChecklistCategory[];
  notes?: string;
}

type ChecklistType =
  | 'requirements'
  | 'security'
  | 'ux'
  | 'performance'
  | 'accessibility'
  | 'testing'
  | 'custom';

interface ChecklistCategory {
  name: string;
  items: ChecklistItem[];
}

interface ChecklistItem {
  text: string;
  checked: boolean;
}
```

### AnalyzeCommand Output
```typescript
interface AnalysisReport {
  feature: string;
  date: string;
  artifactsAnalyzed: string[];
  summary: {
    issuesFound: number;
    warnings: number;
    passedChecks: number;
  };
  issues: AnalysisIssue[];
  warnings: AnalysisWarning[];
  recommendations: string[];
}

interface AnalysisIssue {
  severity: 'error' | 'warning';
  category: 'cross-reference' | 'quality' | 'completeness';
  message: string;
  location?: string;  // File and line reference
}
```

## Relationships

```
PluginConfig
    │
    └── requires ──► MCPServer (agency-plugin-spec-kit)
                         │
                         └── provides ──► MCPTools[]

CommandFile
    │
    ├── references ──► MCPToolReference[]
    │
    └── produces ──► Artifacts (plan.md, tasks.md, etc.)

Task ──► depends_on ──► Task
     └── belongs_to ──► Phase
     └── implements ──► UserStory
```

## Validation Rules

1. **CommandFile**: Must have description in frontmatter
2. **Task.id**: Must match pattern `T\d{3}` or `TG-\d{3}`
3. **Phase**: Must have at least one task
4. **Checklist items**: Must be verifiable (specific, measurable)
5. **Dependencies**: Cannot be circular
