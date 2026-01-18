# Data Model: Channel Router

## Core Entities

### ChannelDefinition

The definition of a communication channel registered by a plugin.

```typescript
interface ChannelDefinition {
  /** Unique channel identifier (e.g., 'agency.lifecycle', 'myplugin.events') */
  name: string;

  /** Channel schema version (semver format) */
  version: string;

  /** Plugin ID that owns this channel */
  owner: string;

  /** Human-readable description */
  description?: string;

  /** Supported message type identifiers */
  messageTypes: string[];

  /** Cross-component pairing configuration */
  pairedWith?: {
    component: 'agency' | 'humancy' | 'generacy';
    channelId: string;
  };

  /** Message schema for validation (JSON Schema or Zod schema reference) */
  messageSchema?: Record<string, unknown>;
}
```

### MessageEnvelope

The wrapper for all messages sent through channels.

```typescript
interface MessageEnvelope<T = unknown> {
  /** Unique message identifier (UUID) */
  id: string;

  /** Target channel name */
  channel: string;

  /** Sender plugin ID */
  sender: string;

  /** Message timestamp */
  timestamp: Date;

  /** Message payload (generic type) */
  payload: T;

  /** Correlation ID for request/response patterns */
  correlationId?: string;
}
```

### ChannelState (Internal)

Internal state tracking for registered channels.

```typescript
interface ChannelState {
  /** Channel definition */
  definition: ChannelDefinition;

  /** Active subscribers */
  subscribers: Set<MessageHandler>;

  /** Message count for metrics */
  messageCount: number;

  /** Pending response handlers for sendAndWait */
  pendingResponses: Map<string, PendingResponse>;
}

interface PendingResponse {
  /** Promise resolve function */
  resolve: (message: MessageEnvelope) => void;

  /** Promise reject function */
  reject: (error: Error) => void;

  /** Timeout timer reference */
  timeoutId: NodeJS.Timeout;
}
```

## Type Definitions

### MessageHandler

```typescript
type MessageHandler<T = unknown> = (message: MessageEnvelope<T>) => void | Promise<void>;
```

### Unsubscribe

```typescript
type Unsubscribe = () => void;
```

### DeliveryResult

Result of message delivery, capturing any errors.

```typescript
interface DeliveryResult {
  /** Number of successful deliveries */
  successCount: number;

  /** Errors from failed handlers */
  errors: Array<{
    handler: string;  // Handler identifier if available
    error: Error;
  }>;
}
```

## Validation Rules

| Field | Rule | Error Code |
|-------|------|------------|
| `name` | Non-empty, alphanumeric with dots/hyphens | `INVALID_CHANNEL_ID` |
| `version` | Valid semver format | `INVALID_SEMVER` |
| `owner` | Non-empty plugin ID format | `INVALID_OWNER` |
| `messageTypes` | Non-empty array | `INVALID_MESSAGE_TYPES` |
| `correlationId` | If present, matches UUID format | - |

## Entity Relationships

```
ChannelRouter
    ├── channels: Map<string, ChannelState>
    │       ├── definition: ChannelDefinition
    │       ├── subscribers: Set<MessageHandler>
    │       └── pendingResponses: Map<string, PendingResponse>
    │
    └── builtInChannels: ChannelDefinition[]
            ├── agency.lifecycle
            ├── agency.mode
            ├── agency.telemetry
            └── agency.humancy
```

## Error Codes

| Code | Description |
|------|-------------|
| `CHANNEL_NOT_FOUND` | Channel does not exist |
| `CHANNEL_ALREADY_REGISTERED` | Duplicate channel ID |
| `CHANNEL_VERSION_MISMATCH` | Requested version not compatible |
| `CHANNEL_TIMEOUT` | sendAndWait timed out |
| `CHANNEL_DELIVERY_FAILED` | One or more handlers failed |
