# Research: Error Handling & UX Polish

## Overview

This document captures the technical research and decisions for implementing error handling and UX polish in the Agency VS Code extension.

## Error Handling Patterns

### VS Code Best Practices

**Source**: VS Code Extension Guidelines

**Key Findings**:
1. Use `window.showErrorMessage()` for user-facing errors
2. Always provide context about what went wrong
3. Offer actionable buttons when possible
4. Log detailed errors to output channel
5. Don't show technical stack traces to users

**Application**: We'll create typed error classes that separate technical details (for logging) from user messages (for notifications).

### Error Categorization

**Approach**: Create custom error classes extending base `AgencyError`

**Categories Identified**:
- **Docker errors**: Docker not running, container not found, docker daemon unreachable
- **MCP errors**: Connection failed, tool execution failed, protocol errors
- **Config errors**: Invalid JSON, schema validation failed, file permissions
- **Network errors**: Timeout, connection refused, DNS resolution
- **Validation errors**: Invalid parameters, missing required fields

**Rationale**: Type-based categorization allows specific handling logic and user messages per error type.

## Status Bar Indicators

### VS Code Status Bar API

**Source**: VS Code API Documentation

**Key Features**:
- `window.createStatusBarItem(alignment, priority)` - Creates status bar item
- `StatusBarItem.text` - Display text (supports codicons)
- `StatusBarItem.tooltip` - Hover text
- `StatusBarItem.command` - Command to run on click
- `StatusBarItem.backgroundColor` - Background color (for error states)
- `StatusBarItem.show()` / `hide()` - Visibility control

**Design Decision**:
- Right-aligned status items (priority 100 for MCP, 99 for Container)
- Use codicons for visual state indication
- Click action opens relevant panel or reconnects
- Error states use `new ThemeColor('statusBarItem.errorBackground')`

### Status Update Strategy

**Challenge**: When to update status indicators?

**Solution**: Event-driven updates
- MCP status: Listen to McpClientService events
- Container status: Listen to ContainerService events
- Update immediately on state change
- Debounce rapid status changes (500ms)

## Welcome View

### First-Run Detection

**Options Evaluated**:
1. Check for config file existence
2. Use VS Code global state
3. Check if any plugins configured

**Decision**: Use global state flag `agency.welcomeShown`

**Rationale**:
- Config file might be committed, doesn't indicate first run
- Global state persists across workspace changes
- Can be reset manually for testing

### Welcome View UI Pattern

**Approach**: TreeView with custom TreeDataProvider

**Structure**:
```
Agency Getting Started
├── 📄 Create Configuration
├── 🧩 Browse Plugins
├── 🐳 Connect to Container
├── 📚 View Documentation
└── 🎬 Watch Tutorial
```

**Rationale**: Consistent with existing extension UI patterns (PluginTreeProvider, etc.)

## Walkthrough API

### VS Code Walkthroughs

**Source**: VS Code 1.58+ Walkthroughs API

**Contribution Format**:
```json
{
  "contributes": {
    "walkthroughs": [
      {
        "id": "agency.gettingStarted",
        "title": "Get Started with Agency",
        "description": "Learn how to configure and use Agency",
        "steps": [...]
      }
    ]
  }
}
```

**Step Structure**:
- `id`: Unique step identifier
- `title`: Step heading
- `description`: Step content (markdown)
- `media`: Optional image/video
- `completionEvents`: Events that mark step complete

**Decision**: Use 5-step walkthrough matching welcome view actions

## Error Message Design

### User-Friendly Messages

**Pattern**: [What happened] + [Why it matters] + [What to do]

**Examples**:

**Bad**:
```
Error: ECONNREFUSED 127.0.0.1:2375
```

**Good**:
```
Docker is not running. Agency requires Docker to manage dev containers.

[Start Docker] [View Documentation]
```

**Bad**:
```
Error: Failed to parse config at line 42
```

**Good**:
```
Configuration file has errors and could not be loaded.
Fix the errors or reset to default configuration.

[View Errors] [Reset to Default]
```

### Action Button Guidelines

**Buttons should**:
- Be verbs (not nouns): "Start Docker" not "Docker"
- Be specific: "View Logs" not "Details"
- Provide clear path: "Reset to Default" not "Fix It"
- Limit to 2-3 actions (avoid choice paralysis)

## Testing Approach

### Error Scenario Testing

**Test Strategy**: Mock underlying APIs to trigger errors

**Key Scenarios**:
1. Docker not running (mock docker API to throw ECONNREFUSED)
2. Container not found (mock listContainers to return empty)
3. MCP connection timeout (mock client.connect to timeout)
4. Invalid config (corrupt JSON file)
5. Permission denied (mock fs.readFile to throw EACCES)

### Status Bar Testing

**Approach**: Unit tests with mocked VS Code API

**Assertions**:
- Status item text matches expected format
- Codicons correct for each state
- Tooltip provides context
- Command triggered on click
- Background color set for error states

## Alternative Approaches Considered

### 1. Toast Notifications vs Modal Dialogs

**Options**:
- A) `window.showErrorMessage()` (toast notification)
- B) Custom modal dialogs with webview

**Decision**: Option A (toast notifications)

**Rationale**: Native VS Code UX, consistent with other extensions, less complex

### 2. Error Recovery

**Options**:
- A) Automatic retry with exponential backoff
- B) Manual retry via action button
- C) Automatic retry once, then manual

**Decision**: Option B (manual retry)

**Rationale**:
- User stays in control
- Avoids infinite retry loops
- Clear when something needs user intervention

### 3. Welcome View Persistence

**Options**:
- A) Always show in sidebar
- B) Show only on first run, then hide
- C) Show until dismissed, then collapsible

**Decision**: Option B (show on first run)

**Rationale**: Avoids clutter for experienced users, but remains accessible via walkthrough

## Implementation Priorities

### P1 (Must Have)
- Error notification service with typed errors
- User-friendly messages for top 5 error scenarios
- MCP connection status indicator

### P2 (Should Have)
- Container status indicator
- Welcome view
- Full error coverage (all scenarios)

### P3 (Nice to Have)
- Walkthrough
- Error analytics/telemetry
- Custom error recovery strategies

## Key References

1. [VS Code Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)
2. [VS Code Status Bar API](https://code.visualstudio.com/api/extension-guides/status-bar)
3. [VS Code Walkthroughs API](https://code.visualstudio.com/api/references/contribution-points#contributes.walkthroughs)
4. [Error Handling Best Practices](https://google.github.io/eng-practices/review/developer/handling-reviewer-comments.html)

---

*Generated by speckit*
