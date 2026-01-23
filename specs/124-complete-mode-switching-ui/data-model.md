# Data Model: Mode Switching UI

## Core Entities

### Existing Types (from types/mode.ts)

These types are already defined and will be reused:

```typescript
// Mode configuration from agency.config.json
interface ModeConfig {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  includedTools: string[];
  excludedTools: string[];
  isDefault?: boolean;
}

// Runtime mode information with resolved inheritance
interface ModeInfo {
  config: ModeConfig;
  effectiveTools: string[];
  parent?: ModeInfo;
  children: ModeInfo[];
  depth: number;
  isActive: boolean;
}

// Mode switch request parameters
interface ModeSwitchRequest {
  modeId: string;
  persist: boolean;
}

// Result of mode switch operation
interface ModeSwitchResult {
  success: boolean;
  previousModeId: string;
  newModeId: string;
  addedTools: string[];
  removedTools: string[];
  error?: string;
  timestamp: number;
}

// Mode state change event
interface ModeStateEvent {
  type: 'activated' | 'deactivated' | 'updated' | 'created' | 'deleted';
  modeId: string;
  modeInfo?: ModeInfo;
  timestamp: number;
}
```

### New Types

#### Mode Status (for StatusBarManager)

```typescript
// Mode status for status bar display
interface ModeStatus {
  /** Current mode ID */
  modeId: string;

  /** Display name */
  modeName: string;

  /** Number of effective tools */
  toolCount: number;

  /** Whether mode system is ready */
  ready: boolean;

  /** Error if mode system failed */
  error?: string;
}
```

#### Configuration Extension

```typescript
// Addition to VS Code workspace configuration
interface AgencyConfiguration {
  // Existing
  configPath: string;
  autoConnect: boolean;

  // New
  currentMode: string;  // Persisted mode ID
}
```

## Type Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                        agency.config.json                        │
│  ┌─────────────┐                                                │
│  │ ModeConfig  │ ──────┐                                        │
│  │  (array)    │       │                                        │
│  └─────────────┘       │                                        │
└────────────────────────┼────────────────────────────────────────┘
                         ▼
                   ┌───────────┐
                   │ConfigFile │ (loads and validates)
                   └─────┬─────┘
                         │
                         ▼
                   ┌───────────┐        ┌────────────────┐
                   │ModeService│◄──────►│VS Code Settings│
                   └─────┬─────┘        │(persistence)   │
                         │              └────────────────┘
          ┌──────────────┼──────────────┐
          │              │              │
          ▼              ▼              ▼
   ┌──────────┐   ┌───────────┐   ┌────────────┐
   │ModeInfo  │   │ModeState  │   │ModeSwitch  │
   │(runtime) │   │Event      │   │Result      │
   └──────────┘   └─────┬─────┘   └────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ┌───────────┐   ┌───────────┐   ┌───────────┐
  │ModeTree   │   │StatusBar  │   │Quick Pick │
  │Provider   │   │Manager    │   │(commands) │
  └───────────┘   └───────────┘   └───────────┘
```

## Validation Rules

### Mode Configuration Validation

Already implemented in `ModeService.validateModes()`:

| Rule | Error Code | Description |
|------|------------|-------------|
| Unique IDs | `duplicate_id` | Each mode must have unique ID |
| Valid parent | `missing_parent` | Parent ID must reference existing mode |
| No cycles | `circular_inheritance` | Mode cannot inherit from itself or descendants |
| Valid tools | `invalid_tool` | Tool references should be valid (warning) |

### Runtime Validation

| Validation | Location | Behavior |
|------------|----------|----------|
| Mode exists before switch | `ModeService.setCurrentMode()` | Return error result |
| Service initialized | All ModeService methods | Throw Error |
| Config valid | `ConfigService.initialize()` | Log warning, use defaults |

## State Flow

### Mode Switching State Machine

```
         ┌──────────────────────────────────────────────────────┐
         │                                                       │
         ▼                                                       │
    ┌─────────┐   switchMode()   ┌───────────┐   success   ┌────┴────┐
    │ Current │ ───────────────► │ Switching │ ──────────► │  New    │
    │  Mode   │                  │           │             │  Mode   │
    └─────────┘                  └─────┬─────┘             └─────────┘
         ▲                             │
         │                        failure
         │                             │
         │                             ▼
         │                       ┌───────────┐
         └───────────────────────│   Error   │
                  (remain in     │  (notify) │
                   current)      └───────────┘
```

### Persistence Flow

```
1. User switches mode
   └── ModeService.setCurrentMode({ modeId, persist: true })
       └── Update _currentModeId
       └── If persist: vscode.workspace.getConfiguration('agency')
                          .update('currentMode', modeId, Workspace)
       └── Fire ModeStateEvent

2. Extension activates
   └── ModeService.initialize(vscode)
       └── Read modes from ConfigService
       └── Read persisted mode: config.get('currentMode')
       └── If persisted mode exists in config: use it
       └── Else: use first mode or 'default'
       └── Set _currentModeId
```

## Integration Points

### StatusBarManager Updates

StatusBarManager listens to ModeService:

```typescript
// During StatusBarManager initialization
const modeService = ModeService.getInstance();
const modeDisposable = modeService.onModeStateChange((event) => {
  if (event.type === 'activated' || event.type === 'updated') {
    this.updateModeStatus({
      modeId: event.modeId,
      modeName: event.modeInfo?.config.name ?? event.modeId,
      toolCount: event.modeInfo?.effectiveTools.length ?? 0,
      ready: true,
    });
  }
});
```

### TreeView Refresh

ModeTreeProvider already subscribes to ModeService events:

```typescript
// In ModeTreeProvider constructor
const modeDisposable = this._modeService.onModeStateChange(() => {
  this.refresh();  // Invalidates cache and fires onDidChangeTreeData
});
```
