---
description: Generate implementation plan and design artifacts from spec.md
---

# Plan Command

Generate a comprehensive implementation plan from the feature specification.

## Instructions

1. **Get feature paths** by calling the `get_paths` MCP tool:
   - Returns paths to spec.md, plan.md, and all other artifacts
   - Confirms the feature directory exists

2. **Check prerequisites** by calling the `check_prereqs` MCP tool:
   - Require: `spec.md`
   - Get list of available optional documents

3. **Read the spec.md file** and analyze the requirements:
   - Extract user stories and acceptance criteria
   - Identify technical requirements
   - Note constraints and assumptions

4. **Generate the following artifacts** based on the spec:

   ### plan.md
   - **IMPORTANT**: Include `**Status**: Complete` in the header section (after Feature/Branch line)
   - Summary of what's being built
   - Technical context (language, framework, dependencies)
   - Project structure with file paths
   - Constitution check (verify against `.specify/memory/constitution.md` if exists)

   Example plan.md header format:
   ```markdown
   # Implementation Plan: [Feature Name]

   **Feature**: [Feature description]
   **Branch**: `[branch-name]`
   **Status**: Complete

   ## Summary
   ...
   ```

   ### research.md
   - Technology decisions with rationale
   - Alternatives considered
   - Implementation patterns
   - Key sources/references

   ### data-model.md
   - Core entities and interfaces
   - Type definitions
   - Validation rules
   - Relationships between entities

   ### contracts/ (if applicable)
   - API schemas (OpenAPI, JSON Schema)
   - Tool definitions
   - Interface contracts

   ### quickstart.md
   - Installation steps
   - Usage examples
   - Available commands
   - Troubleshooting guide

5. **Update agent context files** by calling the `update_agent` MCP tool:
   - Updates CLAUDE.md (and other existing agent files) with new technology info

6. **Report completion** with:
   - List of generated artifacts
   - Key technical decisions
   - Suggested next step: `/speckit:tasks` to generate task list

   **Note**: After reporting, check your todo list for any remaining parent workflow steps.

## Constraints

- Maximum 3 MCP tool calls
- Do not modify spec.md (read-only)
- Follow existing patterns in the codebase

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow (e.g., `/speckit:start` or `/speckit:continue`):
1. This command's completion is NOT the end of the workflow
2. Check your todo list - there WILL be remaining tasks
3. You MUST immediately proceed to the next task in your todo list
4. Do NOT output a final response or wait for user input

Continue NOW with the parent workflow.
