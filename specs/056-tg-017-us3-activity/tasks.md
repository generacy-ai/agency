# Tasks: Activity Feed Webview

**Input**: Design documents from `/specs/056-tg-017-us3-activity/`
**Prerequisites**: plan.md (required), spec.md (required)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US3 = Activity Monitoring)

---

## Phase 1: Core Panel Implementation
<!-- Phase boundary: Foundation for all other tasks -->

- [ ] T001 [US3] Create `ActivityFeedPanel` class extending `WebviewBase` in `packages/agency-extension/src/views/activity/ActivityFeedPanel.ts`
  - Implement static `createOrShow()` method with singleton tracking
  - Add constructor accepting vscodeModule, extensionUri
  - Wire up ActivityService subscription in constructor
  - Implement `handleMessage()` for incoming webview messages
  - Implement `onDispose()` for cleanup

- [ ] T002 [US3] Define message type interfaces in `ActivityFeedPanel.ts`
  - Incoming: FilterChangeMessage, LoadMoreMessage, ExpandEventMessage, ClearEventsMessage, ExportEventsMessage
  - Outgoing: EventsUpdatedMessage, EventDetailMessage

- [ ] T003 [US3] Implement `getHtmlContent()` method with base HTML structure
  - Statistics summary bar (placeholder)
  - Filter controls container (placeholder)
  - Event list container with virtual scroll wrapper
  - Use `getBaseHtml()` from WebviewBase for CSP and nonce

---

## Phase 2: Statistics & Filter UI
<!-- Phase boundary: Requires Phase 1 base HTML -->

- [ ] T004 [P] [US3] Implement statistics summary section in HTML/JS
  - Total calls counter
  - Success/Error/Timeout/Pending counts with icons
  - Average duration display
  - Calls per minute metric
  - Wire up `ActivityService.getStats()` for data

- [ ] T005 [P] [US3] Implement filter controls in HTML/JS
  - Tool name text input with debounced search (300ms)
  - Namespace dropdown (dynamically populated from events)
  - Status multi-select checkboxes (success, error, timeout, pending)
  - Time range dropdown (last 5 min, 15 min, 1 hour, all)

- [ ] T006 [US3] Implement filter change handling
  - `_handleFilterChange()` method in panel class
  - Apply filter to `ActivityService.getEvents(filter)`
  - Persist filter state via VS Code state API
  - Restore filter on panel re-open

---

## Phase 3: Event List with Virtual Scrolling
<!-- Phase boundary: Requires filter and stats foundation -->

- [ ] T007 [US3] Implement virtual scrolling for event list
  - Fixed row height (48px) for position calculation
  - Viewport + buffer rendering (render visible + 10 above/below)
  - Scroll event handler with debouncing
  - `loadMore` message for pagination

- [ ] T008 [US3] Implement event row rendering
  - Status icon (✓ success, ✗ error, ⏱ timeout, ⟳ pending)
  - Tool name and namespace
  - Duration badge
  - Timestamp (relative: "2s ago", "5m ago")
  - Click to expand indicator

- [ ] T009 [US3] Implement real-time event updates
  - Subscribe to `ActivityService.onToolCall` event
  - Subscribe to `ActivityService.onBatch` event
  - Debounce rapid updates (100ms batch window)
  - Auto-scroll to new events (configurable)

---

## Phase 4: Expandable Details
<!-- Phase boundary: Requires event list rendering -->

- [ ] T010 [US3] Implement expandable event details
  - Click handler to toggle expansion
  - Smooth expand/collapse animation
  - Track expanded state per event ID

- [ ] T011 [US3] Implement detail content rendering
  - Input parameters section with JSON syntax highlighting
  - Output/error section with JSON syntax highlighting
  - Timing details (started, completed, duration)
  - Context info (agentId, containerId, pluginId)

- [ ] T012 [US3] Implement JSON syntax highlighting utility
  - Reuse pattern from ToolExecutionPanel
  - Color tokens: keys, strings, numbers, booleans, null
  - Use VS Code CSS variables for theme integration

---

## Phase 5: Clear & Export Functionality
<!-- Phase boundary: Requires event list and details -->

- [ ] T013 [P] [US3] Implement clear functionality
  - "Clear All" button in header
  - Confirmation dialog before clearing
  - Call `ActivityService.clearEvents()`
  - Refresh UI after clear

- [ ] T014 [P] [US3] Implement JSON export
  - Export button in header
  - Collect current filtered events
  - Use VS Code `showSaveDialog` for file selection
  - Write formatted JSON to file

- [ ] T015 [P] [US3] Implement CSV export
  - CSV format button alongside JSON
  - Flatten event structure to columns
  - Handle nested input/output as JSON strings
  - Include headers row

---

## Phase 6: Integration & Polish
<!-- Phase boundary: Requires all features implemented -->

- [ ] T016 [US3] Export `ActivityFeedPanel` from `packages/agency-extension/src/views/index.ts`

- [ ] T017 [US3] Add webview-specific CSS styles
  - Event list styling (borders, spacing, hover states)
  - Filter control styling (inputs, dropdowns, checkboxes)
  - Statistics bar styling (badges, counters)
  - Expanded detail styling (code blocks, sections)
  - Responsive layout for different panel widths

- [ ] T018 [US3] Implement state persistence
  - Save filter state on change
  - Save scroll position on hide
  - Restore state on panel reveal

---

## Phase 7: Testing
<!-- Phase boundary: Requires implementation complete -->

- [ ] T019 [P] [US3] Create unit tests for ActivityFeedPanel in `packages/agency-extension/src/__tests__/views/ActivityFeedPanel.test.ts`
  - Test panel creation and singleton behavior
  - Test message handling (filter, clear, export)
  - Test ActivityService integration (mock service)

- [ ] T020 [P] [US3] Add filter logic tests
  - Test filter state persistence
  - Test filter application to events
  - Test debounce behavior

---

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6 → Phase 7

**Parallel opportunities within phases**:
- Phase 2: T004 (stats) and T005 (filters) can run in parallel
- Phase 5: T013, T014, T015 can all run in parallel
- Phase 7: T019 and T020 can run in parallel

**External dependencies**:
- ActivityService (TG-015) - must be complete (already done)
- WebviewBase - already exists and stable

**Total tasks**: 20
**Estimated phases**: 7
**Parallel opportunities**: 7 tasks can run in parallel with others

---

*Generated by speckit*
