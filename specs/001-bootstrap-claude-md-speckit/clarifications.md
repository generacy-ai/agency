# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-16 16:13

### Q1: Template Source Location
**Context**: The spec references templates from 'claude-plugins' repo but doesn't specify how to access them
**Question**: Where is the claude-plugins repo located? Is it a local path, a GitHub repo (if so, which org/repo), or should I use alternative templates?
**Options**:
- A: Local path (provide path)
- B: GitHub repo (provide org/repo URL)
- C: Use built-in speckit templates instead

**Answer**: *Pending*

### Q2: Repository Purpose
**Context**: CLAUDE.md needs to document project overview and purpose, but the repo's intended domain isn't specified
**Question**: What is the primary purpose of the 'agency' repository? What kind of software/services will it contain?

**Answer**: *Pending*

### Q3: MCP Server Selection
**Context**: The spec lists Context7 and Playwright as recommended, but mentions 'domain-relevant' servers without defining the domain
**Question**: Beyond Context7 and Playwright, are there specific MCP servers you want configured? (e.g., Firebase, database connectors, specific APIs)
**Options**:
- A: Just Context7 and Playwright
- B: Add specific servers (please list)
- C: Skip MCP configuration for now

**Answer**: *Pending*

### Q4: Monorepo Structure
**Context**: The spec mentions adapting for 'this monorepo's structure' but the structure isn't defined yet
**Question**: What monorepo structure should be documented? Is this planned as a single-project repo or a multi-package monorepo with specific conventions?
**Options**:
- A: Single project (simple structure)
- B: Multi-package monorepo (please describe planned packages)
- C: Define structure during implementation based on needs

**Answer**: *Pending*

