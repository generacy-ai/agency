/**
 * Channel type definitions for Agency
 *
 * Channels provide inter-plugin communication using a pub/sub pattern.
 */

import type { ChannelDefinition, MessageEnvelope } from '../plugins/types.js';

// Re-export core types for convenience
export type { ChannelDefinition, MessageEnvelope };

/**
 * Message handler function type for channel subscriptions
 */
export type MessageHandler<T = unknown> = (message: MessageEnvelope<T>) => void;

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;

/**
 * Pending response handler for sendAndWait
 */
export interface PendingResponse {
  /** Promise resolve function */
  resolve: (message: MessageEnvelope) => void;

  /** Promise reject function */
  reject: (error: Error) => void;

  /** Timeout timer reference */
  timeoutId: ReturnType<typeof setTimeout>;

  /** Original request message ID (to distinguish request from response) */
  requestMessageId: string;
}

/**
 * Result of message delivery, capturing any errors
 */
export interface DeliveryResult {
  /** Number of successful deliveries */
  successCount: number;

  /** Errors from failed handlers */
  errors: Array<{
    handler: string;
    error: Error;
  }>;
}

/**
 * Channel state tracking
 */
export interface ChannelState {
  /** Channel definition */
  definition: ChannelDefinition;

  /** Subscribers to this channel */
  subscribers: Set<MessageHandler>;

  /** Message count for metrics */
  messageCount: number;

  /** Pending response handlers for sendAndWait */
  pendingResponses: Map<string, PendingResponse>;
}

/**
 * Options for creating a message envelope
 */
export interface CreateMessageOptions<T> {
  /** Channel name */
  channel: string;

  /** Sender plugin ID */
  sender: string;

  /** Message payload */
  payload: T;

  /** Optional correlation ID */
  correlationId?: string;
}

/**
 * Create a message envelope with auto-generated ID and timestamp
 */
export function createMessageEnvelope<T>(
  options: CreateMessageOptions<T>
): MessageEnvelope<T> {
  return {
    id: crypto.randomUUID(),
    channel: options.channel,
    sender: options.sender,
    timestamp: new Date(),
    payload: options.payload,
    correlationId: options.correlationId,
  };
}
