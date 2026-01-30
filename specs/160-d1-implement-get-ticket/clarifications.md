# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 22:25

### Q1: Dependency Implementation
**Context**: The spec references A1 (provider registry) and A5 (auto-detect logic) as dependencies, but A1/A5 tasks have separate issue tickets. The tool code assumes getProvider() and detectTicketRef() exist.
**Question**: Should this implementation include inline/stub versions of provider registry and detectTicketRef, or should this issue be blocked until A1/A5 are complete?
**Options**:
- A: Block this issue until A1 and A5 are implemented - those provide the provider lookup and ref detection
- B: Implement minimal inline versions (just enough to work for GitHub) and refactor when A1/A5 land
- C: Implement the full getProvider/detectTicketRef logic as part of this issue (effectively absorbing A1/A5 scope)

**Answer**: *Pending*

### Q2: Config Structure
**Context**: The spec code references config.backlog.provider but SpecKitPluginConfig currently only has specDirectory and templateDirectory. Backlog config structure is undefined.
**Question**: How should backlog provider configuration be structured? Should this issue add backlog config to SpecKitPluginConfig or use a different mechanism?
**Options**:
- A: Extend SpecKitPluginConfig with a backlog section containing provider name and settings
- B: Use environment detection (e.g., detect GitHub from git remote) rather than explicit config
- C: Accept provider as a parameter to createGetTicketTool factory, deferring config design to another issue

**Answer**: *Pending*

### Q3: Error Handling Scope
**Context**: The spec lists graceful not-found handling but doesn't specify behavior for: auth failures, network errors, rate limiting, or malformed refs.
**Question**: What error handling strategy should be used for non-happy-path scenarios?
**Options**:
- A: Wrap all provider errors in a unified ProviderError and return isError: true with user-friendly messages
- B: Let provider exceptions propagate (caller handles errors)
- C: Use existing ProviderError/AuthError/NotFoundError types and map to appropriate MCP error responses

**Answer**: *Pending*

