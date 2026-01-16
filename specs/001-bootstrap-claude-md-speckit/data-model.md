# Data Model: Bootstrap: CLAUDE.md, .speckit templates, .mcp.json

**Feature**: `001-bootstrap-claude-md-speckit`
**Date**: 2026-01-16

## Overview

This feature involves static configuration files only. No runtime data models are required.

## File Schemas

### .mcp.json Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "mcpServers": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "type": {
            "type": "string",
            "enum": ["stdio"]
          },
          "command": {
            "type": "string"
          },
          "args": {
            "type": "array",
            "items": { "type": "string" }
          }
        },
        "required": ["type", "command", "args"]
      }
    }
  },
  "required": ["mcpServers"]
}
```

### CLAUDE.md Structure

The CLAUDE.md file follows a specific markdown structure:

```text
# {Project Name} Development Guidelines

## Active Technologies
- Technology list extracted from feature plans

## Project Structure
- Directory tree documentation

## Commands
- Build, test, and development commands

## Code Style
- Language-specific conventions

## MCP Tools (optional)
- Table of available MCP tools

## Recent Changes (optional)
- Auto-generated from feature completions

<!-- MANUAL ADDITIONS START -->
## Custom Sections
- Repository-specific guidance
<!-- MANUAL ADDITIONS END -->
```

## Validation Rules

| File | Validation |
|------|------------|
| `.mcp.json` | Valid JSON, matches schema above |
| `CLAUDE.md` | Contains required sections: Technologies, Structure, Commands |
| Templates | Exist in `.specify/templates/`, are valid markdown |

## Relationships

```text
CLAUDE.md <-- references --> .specify/templates/agent-file-template.md
    |
    +-- Updated by /speckit:plan command when features complete

.mcp.json <-- configures --> External MCP servers
    |
    +-- Context7: Documentation provider
    +-- Playwright: Browser automation
```
