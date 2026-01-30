# Data Model: F4: Plugin manifest, config schema, plugin.ts skeleton

## Core Entities

### PluginManifest (from @generacy-ai/agency)

```typescript
interface PluginManifest {
  /** Unique identifier (npm package name format: @scope/name) */
  id: string;

  /** Human-readable name */
  name: string;

  /** Semantic version */
  version: string;

  /** Plugin description */
  description?: string;

  /** Entry point relative to package root */
  main: string;

  /** TypeScript types file */
  types?: string;

  /** Plugin dependencies (other plugin IDs) */
  dependencies: string[];

  /** Peer dependencies with version ranges */
  peerDependencies?: Record<string, string>;

  /** Tool names this plugin provides */
  tools?: string[];

  /** Mode names this plugin registers */
  modes?: string[];

  /** Channel names this plugin registers */
  channels?: string[];

  /** If true, plugin failure stops the system */
  critical: boolean;
}
```

### SpecKitConfig

Configuration schema for the SpecKit plugin:

```typescript
interface SpecKitConfig {
  /** Path configuration */
  paths: {
    /** Directory for spec files (default: 'specs') */
    specs: string;
    /** Directory for templates (default: '.specify/templates') */
    templates: string;
  };

  /** Branch naming configuration */
  branches: {
    /** Branch name pattern (default: '{paddedNumber}-{slug}') */
    pattern: string;
    /** Zero-padding for issue numbers (default: 3) */
    numberPadding: number;
    /** Maximum words in slug (default: 4) */
    maxSlugWords: number;
  };

  /** Backlog provider configuration */
  backlog: {
    /** Provider type (default: 'github') */
    provider: 'github' | 'jira' | 'shortcut' | 'local';
    /** GitHub-specific configuration */
    github?: Record<string, never>;
    /** Jira-specific configuration */
    jira?: {
      baseUrl: string;
      projectKey: string;
    };
    /** Shortcut-specific configuration */
    shortcut?: {
      workspaceSlug: string;
    };
  };
}
```

### SpecKitPlugin

Plugin class implementing AgencyPlugin interface:

```typescript
class SpecKitPlugin implements AgencyPlugin {
  readonly manifest: PluginManifest;

  // Internal state
  private coreAPI?: AgencyCoreAPI;
  private config?: SpecKitConfig;
  private cleanups: Array<() => void>;

  // Lifecycle methods
  initialize(core: AgencyCoreAPI): Promise<void>;
  shutdown(): Promise<void>;
  onModeChange?(mode: string): void;

  // Accessors
  getConfig(): SpecKitConfig | undefined;
}
```

## Type Definitions

### Mode Affiliations

```typescript
type ModeAffiliations = Record<string, string[]>;

const modeAffiliations: ModeAffiliations = {
  coding: [
    'spec_kit.git_ops',
    'spec_kit.create_feature',
    'spec_kit.get_paths',
    'spec_kit.check_prereqs',
    'spec_kit.copy_template',
    'spec_kit.update_agent',
    'spec_kit.get_ticket',
    'spec_kit.create_ticket',
    'spec_kit.update_ticket',
    'spec_kit.tasks_to_issues',
    'spec_kit.manage_clarifications',
  ],
  research: [
    'spec_kit.get_ticket',
    'spec_kit.get_paths',
    'spec_kit.check_prereqs',
  ],
};
```

### Backlog Provider Types

```typescript
type BacklogProvider = 'github' | 'jira' | 'shortcut' | 'local';

interface JiraConfig {
  baseUrl: string;
  projectKey: string;
}

interface ShortcutConfig {
  workspaceSlug: string;
}
```

## Relationships

```
SpecKitPlugin
    ├── has-a → PluginManifest (readonly)
    ├── has-a → SpecKitConfig (parsed from agency config)
    └── uses → AgencyCoreAPI (during lifecycle)

SpecKitConfig
    ├── contains → PathsConfig
    ├── contains → BranchesConfig
    └── contains → BacklogConfig
        └── may-contain → JiraConfig | ShortcutConfig
```

## Validation Rules

### Manifest Validation

- `id` must be valid npm package name format
- `version` must be valid semver
- `main` must be relative path starting with './'
- `dependencies` must reference valid plugin IDs
- `tools` must be array of string tool names

### Config Validation (via Zod)

- `paths.specs` must be non-empty string
- `paths.templates` must be non-empty string
- `branches.numberPadding` must be positive integer (1-10)
- `branches.maxSlugWords` must be positive integer (1-10)
- `backlog.provider` must be one of: 'github', 'jira', 'shortcut', 'local'
- If `backlog.provider` is 'jira', `backlog.jira` must be provided
- If `backlog.provider` is 'shortcut', `backlog.shortcut` must be provided
