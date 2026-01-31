# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-01-31 16:58

### Q1: Authentication Method
**Context**: The spec mentions both API token and email for basic auth. Jira Cloud uses API tokens while Jira Server/Data Center may use different auth. This affects how we implement checkAuth() and HTTP requests.
**Question**: Should JiraProvider support both Jira Cloud (API token) and Jira Server/Data Center authentication, or only Jira Cloud?
**Options**:
- A: Jira Cloud only (API token + email)
- B: Both Cloud and Server (auto-detect based on URL)

**Answer**: A - Jira Cloud only (API token + email)

### Q2: Status to TicketState Mapping
**Context**: Jira has complex workflows with many statuses (To Do, In Progress, In Review, Done, etc.) but BacklogProvider's TicketState only has 'open', 'closed', 'in_progress'. Need clear mapping rules.
**Question**: How should Jira statuses map to TicketState?
**Options**:
- A: Map by status category (To Do→open, In Progress→in_progress, Done→closed)
- B: Map by status name patterns (flexible keyword matching)

**Answer**: B - Map by status name patterns (flexible keyword matching)

### Q3: Default Issue Type
**Context**: When creating tickets via createTicket(), Jira requires an issue type. The spec doesn't specify which type to use by default (Task, Story, Bug, etc.).
**Question**: What should be the default issue type when createTicket() is called without specifying one?
**Options**:
- A: Task (most generic)
- B: Story (agile-friendly)
- C: Make it configurable via JiraConfig

**Answer**: B - Story (agile-friendly)

### Q4: Cross-Project Support
**Context**: JiraConfig requires a projectKey, but parseRef might encounter URLs/keys from different projects. This affects whether the provider can operate across projects.
**Question**: Should JiraProvider only work with issues from the configured project, or allow cross-project operations?
**Options**:
- A: Single project only (projectKey is required context)
- B: Any project (projectKey is default, URLs with different projects work)

**Answer**: A - Single project only (projectKey is required context)

