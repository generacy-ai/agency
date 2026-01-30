# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-30 20:40

### Q1: TicketRef Definition
**Context**: The spec references TicketRef in the interface but doesn't define it. F2 dependency mentions 'core types for Ticket, TicketRef' but we need to confirm where it comes from.
**Question**: Should TicketRef be imported from F2 (core types package), or should it be defined locally in this interface file? If imported, what is its expected structure?
**Options**:
- A: Import from F2 core types - assume TicketRef is already defined there
- B: Define locally in types.ts as { provider: string; id: string }

**Answer**: *Pending*

### Q2: TicketUpdates Interface
**Context**: The updateTicket method uses TicketUpdates type which is not defined in the spec. This affects what fields can be updated.
**Question**: What fields should TicketUpdates support? Should it be a Partial<TicketCreateParams> or have additional fields like state changes?
**Options**:
- A: Partial<TicketCreateParams> - only title, body, labels can be updated
- B: Include state transitions (open/closed/in_progress) in addition to title, body, labels
- C: Add assignee and milestone fields for providers that support them

**Answer**: *Pending*

### Q3: Error Categories
**Context**: The spec requires src/providers/errors.ts but doesn't specify what error types to define. Error handling is critical for robust provider implementations.
**Question**: What error categories should be defined? Should we include authentication, rate limiting, not found, validation errors?
**Options**:
- A: Minimal: AuthError, NotFoundError, ProviderError (generic)
- B: Comprehensive: AuthError, NotFoundError, RateLimitError, ValidationError, NetworkError, ProviderError

**Answer**: *Pending*

### Q4: Provider Config Types
**Context**: The spec mentions 'define provider-specific config types' but doesn't specify what configuration each provider needs (e.g., API tokens, base URLs, project identifiers).
**Question**: Should provider config types be defined in this F3 task, or deferred to the individual provider implementation tasks?
**Options**:
- A: Define base ProviderConfig interface here with common fields (name, enabled)
- B: Define placeholder interfaces for each provider (GitHubConfig, JiraConfig, etc.)
- C: Defer to individual provider tasks - only define the interface contract here

**Answer**: *Pending*

### Q5: deleteTicket Method
**Context**: The interface has getTicket, createTicket, updateTicket but no deleteTicket. Some workflows may need ticket deletion capability.
**Question**: Should the interface include an optional deleteTicket method for providers that support it?
**Options**:
- A: Yes, add deleteTicket?(ref: string): Promise<void> as optional
- B: No, deletion is out of scope - use updateTicket to close instead

**Answer**: *Pending*

