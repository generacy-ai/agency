# Quickstart: Mode System

## Installation

The mode system is part of the `@generacy-ai/agency` package - no additional installation required.

To add YAML config support (if not already installed):

```bash
pnpm add yaml
```

## Configuration

### Option 1: YAML Configuration (Recommended)

Create `.agency/modes.yaml` in your project root:

```yaml
defaultMode: coding

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
    excludes:
      - "test.integration_*"

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

### Option 2: JSON Configuration

Add modes to `.agency/config.json`:

```json
{
  "name": "my-agency",
  "defaultMode": "coding",
  "modes": {
    "research": {
      "includes": ["humancy.*", "source_control.status"]
    },
    "coding": {
      "extends": "research",
      "includes": ["source_control.*", "build.*"]
    }
  }
}
```

### Option 3: Programmatic Configuration

```typescript
import { ModeManager } from '@generacy-ai/agency';

const modeManager = new ModeManager({
  modes: {
    research: {
      name: 'research',
      includes: ['humancy.*', 'source_control.status'],
    },
    coding: {
      name: 'coding',
      extends: 'research',
      includes: ['source_control.*', 'build.*'],
    },
  },
  defaultMode: 'coding',
});
```

## Usage

### Get Current Mode

```typescript
const currentMode = modeManager.getMode();
console.log(currentMode); // 'coding'
```

### Switch Mode

```typescript
modeManager.setMode('research');
```

### Check Tool Availability

```typescript
const isActive = modeManager.isToolActive('source_control.commit');
console.log(isActive); // true in coding mode, false in research mode
```

### Get Active Tools

```typescript
const tools = modeManager.getActiveTools();
// Returns array of tool definitions available in current mode
```

### Subscribe to Mode Changes

```typescript
const unsubscribe = modeManager.onModeChange((newMode) => {
  console.log(`Mode changed to: ${newMode}`);
});

// Later, to unsubscribe:
unsubscribe();
```

### API Override (for Generacy Orchestration)

```typescript
// Override mode configuration at runtime
modeManager.setModeConfig({
  modes: {
    custom: {
      name: 'custom',
      includes: ['*'],
    },
  },
  defaultMode: 'custom',
});
```

## Pattern Syntax

| Pattern | Description | Example Match |
|---------|-------------|---------------|
| `*` | Match all tools | Any tool |
| `source_control.*` | Match namespace | `source_control.commit`, `source_control.status` |
| `build.compile` | Exact match | Only `build.compile` |
| `test.*` with exclude `test.integration_*` | Namespace minus subset | `test.unit`, but not `test.integration_db` |

## Built-in Modes

| Mode | Inherits From | Purpose |
|------|---------------|---------|
| `research` | - | Information gathering, exploration |
| `coding` | `research` | Active development (default) |
| `review` | `research` | Code review and feedback |
| `debug` | `coding` | Debugging and troubleshooting |

## Troubleshooting

### Error: MODE_NOT_FOUND

```
AgencyError: Mode not found: production
```

**Solution**: Check that the mode is defined in your configuration and spelling matches.

### Error: MODE_CIRCULAR_INHERITANCE

```
AgencyError: Circular inheritance detected: a -> b -> c -> a
```

**Solution**: Review your `extends` relationships and remove the cycle.

### Error: MODE_CONFIG_INVALID

```
AgencyError: Mode configuration validation failed
```

**Solution**: Check your YAML/JSON syntax and ensure all required fields are present.

### Mode Switch Seems Slow

- Ensure you're not calling `setMode()` repeatedly in a loop
- First mode switch may take longer due to pattern compilation
- Target: < 10ms per switch
