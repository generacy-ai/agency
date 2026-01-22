# Implementation Plan: Activity Feed Webview

**Feature**: Full-featured Activity Feed webview panel for real-time monitoring of agent tool invocations
**Branch**: `056-tg-017-us3-activity`
**Status**: Complete

## Summary

This task implements `ActivityFeedPanel`, a VS Code webview that provides comprehensive monitoring of agent tool invocations. The panel builds on the existing `ActivityService` (TG-015) and follows the established `WebviewBase` pattern used by `ToolExecutionPanel` and `PluginConfigPanel`.

## Technical Context

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 5.x | Primary language |
| VS Code Extension API | 1.85+ | Webview panels |
| CSS Custom Properties | N/A | VS Code theme integration |

## Dependencies

This feature depends on previously completed epic tasks:
- **TG-015**: ActivityService - provides event buffering, filtering, and statistics
- **TG-016**: ActivityTreeProvider - tree view for activity (provides onActivityUpdate event)

## Project Structure

Files to create:
```
packages/agency-extension/src/
├── views/
│   └── activity/
│       ├── ActivityFeedPanel.ts      # Main webview panel class
│       └── activity-feed.html        # HTML template (embedded in TS)
└── __tests__/
    └── views/
        └── ActivityFeedPanel.test.ts # Unit tests
```

Files to modify:
```
packages/agency-extension/src/
├── views/index.ts                    # Export ActivityFeedPanel
└── commands/index.ts                 # Optional: Command registration
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    ActivityFeedPanel                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌────────────────┐  │
│  │  Filter Controls │  │  Statistics     │  │  Event List    │  │
│  │  - Tool name    │  │  - Total calls  │  │  - Virtual     │  │
│  │  - Namespace    │  │  - Success rate │  │    scrolling   │  │
│  │  - Status       │  │  - Avg duration │  │  - Expandable  │  │
│  │  - Time range   │  │  - Top tools    │  │    details     │  │
│  └────────┬────────┘  └────────┬────────┘  └───────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                │
│  ┌─────────────────────────────┴─────────────────────────────┐  │
│  │                    ActivityService                         │  │
│  │  - getEvents(filter)                                       │  │
│  │  - getStats(filter)                                        │  │
│  │  - onToolCall / onBatch events                            │  │
│  │  - clearEvents()                                           │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Interfaces

### Message Types (Extension ↔ Webview)

```typescript
// From webview to extension
interface FilterChangeMessage {
  type: 'filterChange';
  payload: ActivityFilter;
}

interface LoadMoreMessage {
  type: 'loadMore';
  payload: { offset: number; limit: number };
}

interface ExpandEventMessage {
  type: 'expandEvent';
  payload: { eventId: string };
}

interface ClearEventsMessage {
  type: 'clearEvents';
}

interface ExportEventsMessage {
  type: 'exportEvents';
  payload: { format: 'json' | 'csv' };
}

// From extension to webview
interface EventsUpdatedMessage {
  type: 'eventsUpdated';
  payload: {
    events: ToolCallEvent[];
    stats: ActivityStats;
    hasMore: boolean;
  };
}

interface EventDetailMessage {
  type: 'eventDetail';
  payload: {
    event: ToolCallEvent;
  };
}
```

## Implementation Approach

### 1. ActivityFeedPanel Class

Extends `WebviewBase` following the same pattern as `ToolExecutionPanel`:
- Static `createOrShow()` for singleton-per-workspace behavior
- Panel tracking via Map to prevent duplicates
- Disposable management via inherited `_disposables`

### 2. Virtual Scrolling

For performance with large event buffers:
- Render only visible rows (viewport + buffer)
- Calculate item positions based on fixed row height
- Use `IntersectionObserver` for lazy loading
- Debounce scroll events

### 3. Filter Controls

UI elements:
- Text input for tool name (debounced search)
- Dropdown for namespace (populated from events)
- Multi-select for status (success, error, timeout, pending)
- Date/time range picker (last 5 min, 15 min, 1 hour, custom)

### 4. Expandable Details

Each event row expands to show:
- Full input parameters (JSON with syntax highlighting)
- Full output/error (JSON with syntax highlighting)
- Timing information
- Context (agent, container, etc.)

### 5. Statistics Summary

Top bar showing:
- Total calls count
- Success/Error/Pending breakdown
- Average duration
- Calls per minute

### 6. Export Functionality

- JSON export: Full event data
- CSV export: Flattened columns for spreadsheet analysis
- Downloads via VS Code file save dialog

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Scrolling | Virtual scrolling | Handle 1000+ events without DOM bloat |
| State | VS Code state API | Persist filter/scroll position across panel hide/show |
| Updates | Batch + debounce | Avoid UI thrashing on rapid events |
| Syntax highlight | Custom inline | No external dependencies, match VS Code theme |

## Testing Strategy

| Layer | Approach | Tools |
|-------|----------|-------|
| Unit | Message handling, filter logic | vitest |
| Integration | Service interaction | vitest + mock ActivityService |
| Visual | Manual verification | VS Code Extension Host |

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Initial render | < 100ms | Performance timing |
| Scroll FPS | > 30fps | Chrome DevTools |
| Memory (1000 events) | < 50MB | Heap snapshot |

---

*Generated by speckit*
