# Quickstart: LocalProvider

## Overview

LocalProvider enables offline/file-based ticket tracking without external services. Tickets are stored in a local JSON file.

## Configuration

Set `local` as your backlog provider in `.specify/config.json`:

```json
{
  "backlog": {
    "provider": "local"
  }
}
```

Or use environment variable:
```bash
export SPECKIT_BACKLOG_PROVIDER=local
```

## Storage Location

Default: `.specify/local-tickets.json` (relative to working directory)

The file is created automatically on first ticket creation.

## Usage Examples

### Create a Ticket

```typescript
import { getProvider } from '@agency/plugin-spec-kit';

const provider = getProvider('local');
const ticket = await provider.createTicket({
  title: 'Implement user authentication',
  body: '## Description\n\nAdd OAuth2 login flow...',
  labels: ['feature', 'auth'],
});
// Returns: { ref: { id: 'LOCAL-001', ... }, ... }
```

### Get a Ticket

```typescript
const ticket = await provider.getTicket('LOCAL-001');
// Also accepts: 'local-001', '001', '1'
```

### Update a Ticket

```typescript
const updated = await provider.updateTicket('LOCAL-001', {
  title: 'Updated title',
  labels: ['feature', 'done'],
});
```

### Manage Labels

```typescript
// Set labels (replaces all existing)
await provider.setLabels('LOCAL-001', ['bug', 'priority:high']);

// Get current labels
const labels = await provider.getLabels('LOCAL-001');
```

### Check Auth (Always Succeeds)

```typescript
const auth = await provider.checkAuth();
// Returns: { ok: true }
```

## Ticket ID Format

- Format: `LOCAL-NNN` (e.g., `LOCAL-001`, `LOCAL-042`, `LOCAL-1000`)
- IDs are auto-generated sequentially
- Zero-padded to 3 digits minimum

### Reference Parsing

All these inputs resolve to the same ticket:
- `LOCAL-001`
- `local-001`
- `001`
- `1`

## File Format

The store file (`.specify/local-tickets.json`) is human-readable JSON:

```json
{
  "version": 1,
  "nextId": 3,
  "tickets": {
    "LOCAL-001": {
      "id": "LOCAL-001",
      "title": "My ticket",
      "state": "open",
      "labels": ["feature"],
      "createdAt": "2024-01-15T10:30:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z"
    }
  }
}
```

You can manually edit this file if needed.

## Troubleshooting

### "Ticket not found"

The ticket ID doesn't exist in the store. Check:
- Correct ID format (e.g., `LOCAL-001`, not `#1`)
- File exists at `.specify/local-tickets.json`
- ID is within the created range

### "Permission denied"

File system permissions issue:
- Check write permissions on `.specify/` directory
- Ensure the directory exists

### Corrupt JSON

If the store file becomes corrupted:
1. Make a backup
2. Fix JSON syntax errors manually
3. Or delete the file (loses all tickets)

## Limitations

- **No search**: Use `grep` on the JSON file
- **No delete**: Tickets are permanent (edit JSON manually to remove)
- **Single user**: No conflict resolution for concurrent edits
- **No sync**: File is local only, not shared across machines
