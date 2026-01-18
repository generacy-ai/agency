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
 * Channel state tracking
 */
export interface ChannelState {
  /** Channel definition */
  definition: ChannelDefinition;

  /** Subscribers to this channel */
  subscribers: Set<MessageHandler>;

  /** Message count for metrics */
  messageCount: number;
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
