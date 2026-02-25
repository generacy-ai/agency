# Tool Naming Conventions

This module provides tool naming validation and parsing for the Generacy platform.

## Purpose

Tool names in the Generacy ecosystem follow a strict `prefix.action` naming convention (e.g., `git.commit_changes`, `file.read_content`). This module validates tool names, parses them into their component parts, and maintains a registry of valid tool prefixes.

## Migrated from @generacy-ai/contracts

This module was migrated from `@generacy-ai/contracts/schemas/tool-naming/` as part of the contracts retirement effort (Issue 246-1-9).

## Exports

- **ToolNameSchema**: Zod schema for validating complete tool names
- **ToolPrefixSchema**: Zod schema for validating tool prefixes
- **ToolPrefixValues**: Array of valid tool prefix constants
- **parseToolName**: Function to parse a tool name string into `{ prefix, action }`
- **validateToolName**: Function to validate a tool name and return validation results

## Usage

```typescript
import { parseToolName, validateToolName, ToolPrefixValues } from '@generacy-ai/agency';

// Parse a tool name
const parsed = parseToolName('git.commit_changes');
// { prefix: 'git', action: 'commit_changes' }

// Validate a tool name
const isValid = validateToolName('file.read_content');

// Get all valid prefixes
console.log(ToolPrefixValues);
// ['file', 'git', 'search', 'shell', 'web', 'db', 'api', 'test', 'build', 'docker']
```

## Integration

This module integrates with the existing `ToolRegistry` in `../registry.ts` to ensure all registered tools follow the naming convention.
