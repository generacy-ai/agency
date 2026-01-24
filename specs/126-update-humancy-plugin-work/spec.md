# Feature Specification: Update humancy plugin to work with humancy-cloud API

**Branch**: `126-update-humancy-plugin-work` | **Date**: 2026-01-23 | **Status**: Draft

## Summary

Update the `@generacy-ai/agency-plugin-humancy` plugin to integrate with the humancy-cloud REST API, replacing the internal channel messaging system with HTTP-based communication to the unified generacy.ai platform.

## Overview

The Agency humancy-plugin (`@generacy-ai/agency-plugin-humancy`) currently has the decision-making tools implemented, but needs to be verified/updated to work with the humancy-cloud API endpoints once they are implemented.

## Current State

The plugin provides these tools:
- `humancy.ask_question` - Freeform questions
- `humancy.request_review` - Artifact review
- `humancy.request_decision` - Structured choices
- `humancy.notify` - Notifications
- `humancy.get_decision_outcome` - Retrieve decisions
- `humancy.report_decision_result` - Report outcomes

It has connection mode detection (direct/HTTP) but needs to be verified against the actual humancy-cloud API.

## Architecture Decisions

Based on clarifications, the following architecture is confirmed:

### Connection Modes (simplified from 3 to 3)
- **Direct**: IPC for local testing (unchanged)
- **Cloud**: HTTP to `generacy.ai/api/humancy` (replaces "Via Generacy")
- **Offline**: Cached/queued behavior (unchanged)

### API Endpoints (REST)
- `POST /api/humancy/decisions` - Create decision
- `GET /api/humancy/decisions/:id` - Get decision details
- `POST /api/humancy/decisions/:id/respond` - Submit response
- `GET /api/humancy/decisions/:id/events` - SSE stream for real-time updates

### Response Delivery (SSE)
Server-Sent Events preferred over WebSocket for simpler infrastructure scaling:
- Works over standard HTTP/2
- Scales with regular load balancers
- No sticky sessions or WebSocket infrastructure needed

### Authentication
- No auth needed for local development (offline mode)
- `GENERACY_API_KEY` env var or `agency.config.humancy.apiKey` for production

## Requirements

### API Integration
- [ ] Implement HTTP client for REST endpoints
- [ ] Ensure request/response formats match documented contracts
- [ ] Use API key authentication via `Authorization: Bearer <key>` header for production
- [ ] Implement proper error handling for API failures

### Configuration
- [ ] Support configurable API endpoint (`HUMANCY_API_URL` or `agency.config.humancy.apiUrl`)
- [ ] Default to `https://generacy.ai/api/humancy` for production
- [ ] API key configuration via env var or config
- [ ] Timeout settings with sensible defaults

### Response Delivery (SSE)
- [ ] Implement SSE client for `/api/humancy/decisions/:id/events` endpoint
- [ ] Handle SSE connection lifecycle (connect, reconnect, close)
- [ ] Configurable timeout for waiting on responses
- [ ] Handle decision expiration events

## Testing

- [ ] Unit tests for HTTP client wrapper
- [ ] Mock server tests for offline development
- [ ] SSE stream handling tests
- [ ] Error scenario coverage (network failures, auth errors, timeouts)

## Acceptance Criteria

- [ ] Plugin successfully creates decisions via humancy-cloud REST API
- [ ] Responses are received via SSE when human decides
- [ ] Works with local development setup (direct mode)
- [ ] Error messages are clear and actionable
- [ ] Cloud mode properly authenticates with API key

## Dependencies

- ~~Blocked by: generacy-ai/humancy-cloud#9 (Decision Queue API)~~ Proceed using API contract from design docs

## Related

- humancy-cloud#8 - Humancy cloud services epic
- #130 - Platform-wide WebSocket → SSE remediation tracking

## User Stories

### US1: Agent Creates Decision via Cloud API

**As an** AI agent running in cloud mode,
**I want** to create human decisions via the humancy-cloud REST API,
**So that** humans can respond through the web interface.

**Acceptance Criteria**:
- [ ] Agent can call `humancy.request_decision` in cloud mode
- [ ] Decision is created via POST to `/api/humancy/decisions`
- [ ] Agent receives decision ID for tracking

### US2: Agent Receives Decision Response via SSE

**As an** AI agent waiting for a human decision,
**I want** to receive the response via SSE stream,
**So that** I can proceed with my workflow immediately when the human responds.

**Acceptance Criteria**:
- [ ] Agent connects to SSE endpoint for decision
- [ ] Response is delivered in real-time when human decides
- [ ] Connection handles reconnection gracefully

### US3: Agent Works Offline

**As an** AI agent without network access,
**I want** decisions to be queued locally,
**So that** I can continue working and sync when connectivity is restored.

**Acceptance Criteria**:
- [ ] Offline mode queues decisions locally
- [ ] Queued decisions are synced when coming online
- [ ] Agent is notified of sync status

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | HTTP client for REST API endpoints | P1 | Core functionality |
| FR-002 | SSE client for response streaming | P1 | Replaces polling |
| FR-003 | API key authentication | P1 | Required for cloud mode |
| FR-004 | Connection mode detection (Direct/Cloud/Offline) | P1 | Simplify from current |
| FR-005 | Configurable API endpoint URL | P2 | For local dev |
| FR-006 | Request/response retry logic | P2 | Handle transient failures |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | API compatibility | 100% | All endpoints work with humancy-cloud |
| SC-002 | Response latency | <100ms | SSE delivery after human response |
| SC-003 | Reconnection | <5s | SSE reconnects within 5 seconds |

## Assumptions

- humancy-cloud API follows documented contract
- SSE infrastructure is available (see #130)
- API key authentication is sufficient for initial release

## Out of Scope

- WebSocket support (replaced by SSE per platform decision)
- Multi-tenant support (single API key per deployment)
- Response caching beyond offline queue

---

*Generated by speckit*
