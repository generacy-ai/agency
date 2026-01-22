# Implementation Plan: [P] Performance Optimization

**Feature**: 062-tg-023-p-performance
**Status**: In Progress
**Date**: 2026-01-22

## Overview

Performance optimization for the Agency VS Code extension focusing on tree provider lazy loading, config write debouncing, webview message batching, and profiling.

## Technology Stack

- **Language**: TypeScript 5.x
- **Target**: VS Code Extension (Node.js 20+)
- **Testing**: Vitest
- **Bundling**: Webpack (via vscode-test)

## Architecture

### Components to Optimize

1. **Tree Providers** (`packages/agency-extension/src/providers/`)
   - Lazy load tree data on first access
   - Defer initialization until view is visible

2. **ConfigService** (`packages/agency-extension/src/services/ConfigService.ts`)
   - Add debouncing to file writes (300ms default)
   - Reduce disk I/O for rapid config updates

3. **Webview Messages** (Various providers)
   - Batch multiple updates into single postMessage calls
   - Reduce IPC overhead

## Implementation Strategy

1. Implement lazy loading patterns for tree providers
2. Add debounce utility for ConfigService writes
3. Implement message batching for webviews
4. Profile and document results

## Testing Strategy

- Unit tests for debounce logic
- Manual profiling for activation time
- Bundle analysis for size optimization

## Performance Targets

- Extension activation: < 2s
- Bundle size: < 1MB
- Config write debounce: 300ms

---

*Generated for epic child issue #62*
