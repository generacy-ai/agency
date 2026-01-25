# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-24 23:58

### Q1: SSE Already Implemented
**Context**: The agency-plugin-humancy already has a full SSE implementation (src/http/sse.ts with SSEHandler class, reconnection logic, event parsing). There is no WebSocket code in the plugin at all. The acceptance criterion 'agency-plugin-humancy uses SSE EventSource client' appears to already be met.
**Question**: Is the existing SSE implementation in agency-plugin-humancy sufficient, or are there specific changes needed (e.g., different event types, different endpoint patterns, different reconnection behavior)?
**Options**:
- A: Existing SSE implementation is sufficient — mark the agency implementation task as done
- B: SSE implementation needs updates — please specify what changes are required
- C: Need to verify the implementation matches the new API contract (GET /api/humancy/decisions/events endpoints)

**Answer**: *Pending*

### Q2: Missing Documentation Files
**Context**: The spec references 4 documentation files under docs/updated/ that do not exist in the agency repository: humancy-vscode-extension-spec.md, generacy-architecture-overview-v3.md, and generacy-repo-package-structure-v3.md. No docs/ directory exists at the repo root.
**Question**: Should these documentation files be created in the agency repo, or do they belong to other repositories (generacy, humancy, etc.) and should be removed from this issue's scope?
**Options**:
- A: These docs belong in other repos — remove from this issue's scope
- B: Create these docs in the agency repo under docs/updated/
- C: These docs exist elsewhere but should be referenced/linked from agency

**Answer**: *Pending*

### Q3: Scope Reduction
**Context**: Given that SSE is already implemented and the referenced docs don't exist in this repo, the actual remaining work in the agency repository may be very limited or zero. The issue was created as part of a cross-platform migration (5 repos), and the agency portion may already be complete.
**Question**: Given the SSE implementation already exists and docs are not in this repo, what concrete deliverables remain for this issue in the agency repository?
**Options**:
- A: Close this issue as already complete — SSE is implemented, docs are in other repos
- B: Verify SSE implementation matches the API contract, add any missing event types (decision:created, decision:updated, decision:resolved)
- C: Add documentation/README updates within the agency repo to reflect the SSE architecture

**Answer**: *Pending*

### Q4: Event Type Alignment
**Context**: The issue specifies SSE event types: decision:created, decision:updated, decision:resolved. The current implementation uses different event types: decision_resolved, decision_expired, heartbeat. The naming convention differs (colon vs underscore) and some events are missing.
**Question**: Should the SSE event types in the existing implementation be updated to match the spec (decision:created, decision:updated, decision:resolved), or is the current naming convention (decision_resolved, decision_expired) the correct one?
**Options**:
- A: Update to match spec: decision:created, decision:updated, decision:resolved (breaking change across repos)
- B: Keep current naming: decision_resolved, decision_expired, heartbeat (update spec to match implementation)
- C: Support both old and new event names during migration period

**Answer**: *Pending*

### Q5: API Endpoint Verification
**Context**: The spec defines new SSE endpoints: GET /api/humancy/decisions/events and GET /api/humancy/decisions/{id}/events. The current SSEHandler constructs URLs but it's unclear if these match the proposed endpoints.
**Question**: Are the SSE endpoint paths (GET /api/humancy/decisions/events and GET /api/humancy/decisions/{id}/events) finalized, and should the agency-plugin-humancy client be verified to use these exact paths?
**Options**:
- A: Yes, verify and update the client to use these exact endpoint paths
- B: Endpoint paths are still being defined in the server repos — defer client changes
- C: Client should use configurable base URL — the exact paths don't matter at this layer

**Answer**: *Pending*

