# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-23 23:07

### Q1: API Endpoint Structure
**Context**: The current plugin uses an internal channel messaging system (coreAPI.sendMessage). To integrate with humancy-cloud, we need to know the actual API endpoint paths and format.
**Question**: What are the humancy-cloud API endpoint URLs? For example, is it POST /api/decisions for creating decisions, GET /api/decisions/{id} for polling?
**Options**:
- A: REST endpoints: POST /api/decisions, GET /api/decisions/{id}, etc.
- B: GraphQL endpoint: POST /api/graphql
- C: Use existing channel router - humancy-cloud will subscribe to the channel

**Answer**: *Pending*

### Q2: Authentication Method
**Context**: The spec mentions 'API key or JWT' but we need to know which is implemented and how to pass it.
**Question**: How should the plugin authenticate with humancy-cloud?
**Options**:
- A: API Key via Authorization: Bearer <key> header
- B: API Key via X-API-Key header
- C: JWT token obtained from a separate auth endpoint
- D: No auth needed for local development, API key for production

**Answer**: *Pending*

### Q3: Response Delivery
**Context**: The spec mentions polling or WebSocket for receiving human responses, but the choice significantly affects implementation complexity.
**Question**: How will the plugin receive responses when a human makes a decision?
**Options**:
- A: Polling - plugin polls GET /api/decisions/{id} until response available
- B: WebSocket - plugin opens connection and receives push notifications
- C: Long-polling - HTTP request blocks until response or timeout
- D: Callback URL - humancy-cloud POSTs to a webhook when decision made

**Answer**: *Pending*

### Q4: Blocked Dependency Status
**Context**: The issue shows 'Blocked by: humancy-cloud#9 (Decision Queue API)'. We need to know if we should proceed with stub implementation or wait.
**Question**: What is the status of humancy-cloud#9? Should we proceed with integration assuming a specific API contract, or wait until the API is implemented?
**Options**:
- A: Proceed - use the API contract from humancy-cloud#9 spec/design docs
- B: Proceed - implement against a mock API, update when real API available
- C: Wait - humancy-cloud#9 is not far enough along to integrate with

**Answer**: *Pending*

### Q5: Hybrid Architecture
**Context**: The current plugin has three modes: Direct (IPC), Via Generacy, and Offline. We need to understand how humancy-cloud fits into this.
**Question**: Does humancy-cloud replace the 'Via Generacy' mode, or is it a new fourth mode? How does it relate to the existing connection architecture?
**Options**:
- A: Replace Via Generacy - humancy-cloud IS the generacy routing layer for humancy
- B: New mode - add HTTP_CLOUD mode alongside existing modes
- C: Unified - all non-direct modes should route through humancy-cloud

**Answer**: *Pending*

