# Quickstart: Local Provider Integration Tests

## Prerequisites

- Node.js 18+
- pnpm (workspace manager)

## Installation

```bash
# From repository root
pnpm install

# Build the spec-kit package
cd packages/agency-plugin-spec-kit
pnpm build
```

## Running Tests

```bash
# Run all tests
pnpm test

# Run only integration tests
pnpm test -- tests/integration/

# Run with coverage
pnpm test:coverage

# Watch mode
pnpm test -- --watch
```

## Test File Location

Integration tests are located at:
```
packages/agency-plugin-spec-kit/tests/integration/local-flow.test.ts
```

## Test Scenarios

| Scenario | Description |
|----------|-------------|
| Create and Retrieve | Creates a ticket and retrieves it by ID |
| Persistence | Verifies tickets are written to JSON file |
| Offline Full Workflow | Tests complete workflow without network |
| Ticket Numbering | Validates LOCAL-NNN format and sequencing |
| State Management | Tests ticket state transitions |
| Error Handling | Verifies proper error propagation |

## Example Test Execution

```bash
# Run specific test file
cd packages/agency-plugin-spec-kit
pnpm test -- tests/integration/local-flow.test.ts

# Run tests matching pattern
pnpm test -- -t "creates and retrieves tickets"
```

## Local Ticket Storage

Tests use isolated temp directories. In production, tickets are stored at:
```
.specify/local-tickets.json
```

Example content:
```json
{
  "version": 1,
  "nextId": 2,
  "tickets": {
    "LOCAL-001": {
      "id": "LOCAL-001",
      "title": "My Ticket",
      "state": "open",
      "labels": [],
      "createdAt": "2026-02-01T10:00:00.000Z",
      "updatedAt": "2026-02-01T10:00:00.000Z"
    }
  }
}
```

## Troubleshooting

### Tests fail with "Cannot find module"

Ensure the package is built:
```bash
cd packages/agency-plugin-spec-kit
pnpm build
```

### Permission errors on temp directories

The tests automatically clean up temp directories. If cleanup fails:
```bash
rm -rf /tmp/local-flow-*
```

### Test isolation issues

Each test uses a fresh temp directory. If you see state leaking between tests, check that `afterEach()` cleanup is running properly.
