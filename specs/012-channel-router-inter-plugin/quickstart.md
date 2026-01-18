# Quickstart: Channel Router

## Overview

The Channel Router provides inter-plugin communication via a pub/sub pattern with version compatibility and request/response support.

## Installation

```bash
pnpm add @generacy-ai/agency
```

## Basic Usage

### Registering a Channel

```typescript
import { ChannelRouter } from '@generacy-ai/agency';

const router = new ChannelRouter();

// Register a channel
router.registerChannel({
  name: 'myplugin.events',
  version: '1.0.0',
  owner: '@myplugin/core',
  description: 'Plugin event stream',
  messageTypes: ['created', 'updated', 'deleted'],
});
```

### Subscribing to Messages

```typescript
const unsubscribe = router.subscribe('myplugin.events', (message) => {
  console.log(`Received: ${message.payload.type}`);
});

// Later: cleanup
unsubscribe();
```

### Sending Messages

```typescript
import { createMessageEnvelope } from '@generacy-ai/agency';

const envelope = createMessageEnvelope({
  channel: 'myplugin.events',
  sender: '@myplugin/core',
  payload: { type: 'created', id: '123' },
});

await router.send('myplugin.events', envelope);
```

### Request/Response Pattern

```typescript
// Responder subscribes
router.subscribe('myplugin.rpc', async (message) => {
  if (message.correlationId) {
    // Send response with same correlation ID
    const response = createMessageEnvelope({
      channel: 'myplugin.rpc',
      sender: '@myplugin/handler',
      payload: { result: 'success' },
      correlationId: message.correlationId,
    });
    await router.send('myplugin.rpc', response);
  }
});

// Caller waits for response
const request = createMessageEnvelope({
  channel: 'myplugin.rpc',
  sender: '@myplugin/caller',
  payload: { action: 'getData' },
});

const response = await router.sendAndWait('myplugin.rpc', request, 5000);
console.log(response.payload); // { result: 'success' }
```

## Channel Discovery

```typescript
// Get all channels
const channels = router.getChannels();

// Find channel by ID with version requirement
const channel = router.findChannel('myplugin.events', '1.0.0');

// Find paired channels for bridging
const pairs = router.findPair(channel);
```

## Built-in Channels

| Channel | Purpose |
|---------|---------|
| `agency.lifecycle` | Plugin lifecycle events (start/stop) |
| `agency.mode` | Mode change notifications |
| `agency.telemetry` | Telemetry event aggregation |
| `agency.humancy` | Bridge to Humancy extension |

## Error Handling

```typescript
try {
  await router.send('my.channel', message);
} catch (error) {
  if (error.code === 'CHANNEL_NOT_FOUND') {
    console.error('Channel does not exist');
  }
  if (error.code === 'CHANNEL_DELIVERY_FAILED') {
    // Some handlers failed, but delivery completed
    console.error('Partial delivery failure:', error.errors);
  }
}
```

## Troubleshooting

### Channel Not Found
Ensure the channel is registered before subscribing or sending.

### Version Mismatch
Use `findChannel(id, minVersion)` to check compatibility before sending.

### Timeout on sendAndWait
- Default timeout is 30 seconds
- Ensure a subscriber responds with matching `correlationId`
- Check that the responder is actually subscribed
