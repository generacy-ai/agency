/**
 * Channel Manager for Agency
 *
 * Manages inter-plugin communication channels using a pub/sub pattern.
 * Channels are registered by plugins and can be used for decoupled messaging.
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ChannelDefinition, MessageEnvelope } from '../plugins/types.js';
import type { MessageHandler, Unsubscribe, ChannelState, PendingResponse, DeliveryResult } from './types.js';
import { createMessageEnvelope } from './types.js';
import { isVersionCompatible } from './version.js';

/**
 * Channel manager error codes (re-export for convenience)
 */
export const ChannelErrorCodes = {
  CHANNEL_NOT_FOUND: ErrorCodes.CHANNEL_NOT_FOUND,
  CHANNEL_ALREADY_EXISTS: ErrorCodes.CHANNEL_ALREADY_REGISTERED,
  CHANNEL_VERSION_MISMATCH: ErrorCodes.CHANNEL_VERSION_MISMATCH,
  CHANNEL_TIMEOUT: ErrorCodes.CHANNEL_TIMEOUT,
  CHANNEL_DELIVERY_FAILED: ErrorCodes.CHANNEL_DELIVERY_FAILED,
} as const;

/**
 * Built-in channel definitions
 */
export const BUILT_IN_CHANNELS: ChannelDefinition[] = [
  {
    name: 'agency.lifecycle',
    version: '1.0.0',
    description: 'Plugin lifecycle events (start, stop, reload)',
    owner: '@generacy-ai/agency',
    messageTypes: ['start', 'stop', 'reload'],
  },
  {
    name: 'agency.mode',
    version: '1.0.0',
    description: 'Mode change notifications',
    owner: '@generacy-ai/agency',
    messageTypes: ['change'],
  },
  {
    name: 'agency.telemetry',
    version: '1.0.0',
    description: 'Telemetry event aggregation',
    owner: '@generacy-ai/agency',
    messageTypes: ['event', 'metric'],
  },
  {
    name: 'agency.humancy',
    version: '1.0.0',
    description: 'Bridge to Humancy component',
    owner: '@generacy-ai/agency',
    messageTypes: ['*'],
    pairedWith: {
      component: 'humancy',
      channelId: 'humancy.agency',
    },
  },
];

/**
 * Channel Manager for inter-plugin communication
 *
 * Provides a simple pub/sub mechanism for plugins to communicate
 * without direct coupling.
 */
export class ChannelManager {
  private readonly channels = new Map<string, ChannelState>();

  /**
   * Register a new communication channel
   *
   * @param channel Channel definition
   * @throws AgencyError if channel already exists
   */
  registerChannel(channel: ChannelDefinition): void {
    if (this.channels.has(channel.name)) {
      throw new AgencyError(
        ErrorCodes.CHANNEL_ALREADY_REGISTERED,
        `Channel already exists: ${channel.name}`,
        { channelName: channel.name, existingOwner: this.channels.get(channel.name)?.definition.owner }
      );
    }

    this.channels.set(channel.name, {
      definition: channel,
      subscribers: new Set(),
      messageCount: 0,
      pendingResponses: new Map(),
    });
  }

  /**
   * Unregister a channel
   *
   * @param name Channel name to unregister
   * @returns true if channel was found and removed
   */
  unregisterChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  /**
   * Check if a channel exists
   *
   * @param name Channel name
   * @returns true if channel is registered
   */
  hasChannel(name: string): boolean {
    return this.channels.has(name);
  }

  /**
   * Get channel definition
   *
   * @param name Channel name
   * @returns Channel definition or undefined
   */
  getChannel(name: string): ChannelDefinition | undefined {
    return this.channels.get(name)?.definition;
  }

  /**
   * Get all registered channel names
   *
   * @returns Array of channel names
   */
  getChannelNames(): string[] {
    return [...this.channels.keys()];
  }

  /**
   * Get all registered channel definitions
   *
   * @returns Array of channel definitions
   */
  getChannels(): ChannelDefinition[] {
    return [...this.channels.values()].map((state) => state.definition);
  }

  /**
   * Find a channel by ID with optional version filtering
   *
   * @param id Channel ID to find
   * @param minVersion Minimum required version (optional)
   * @returns Channel definition if found and version compatible, undefined otherwise
   */
  findChannel(id: string, minVersion?: string): ChannelDefinition | undefined {
    const state = this.channels.get(id);
    if (!state) {
      return undefined;
    }

    if (minVersion) {
      const channelVersion = state.definition.version;
      if (!channelVersion || !isVersionCompatible(channelVersion, minVersion)) {
        return undefined;
      }
    }

    return state.definition;
  }

  /**
   * Find channels paired with the given channel
   *
   * @param channel Channel to find pairs for
   * @returns Array of paired channel definitions
   */
  findPair(channel: ChannelDefinition): ChannelDefinition[] {
    const pairs: ChannelDefinition[] = [];

    for (const state of this.channels.values()) {
      const def = state.definition;
      // Check if this channel is paired with the input channel
      if (
        def.pairedWith &&
        def.pairedWith.channelId === channel.name
      ) {
        pairs.push(def);
      }
      // Also check if input channel is paired with this channel
      if (
        channel.pairedWith &&
        channel.pairedWith.channelId === def.name
      ) {
        if (!pairs.includes(def)) {
          pairs.push(def);
        }
      }
    }

    return pairs;
  }

  /**
   * Subscribe to a channel
   *
   * @param channel Channel name
   * @param handler Message handler function
   * @returns Unsubscribe function
   * @throws AgencyError if channel doesn't exist
   */
  subscribe<T>(channel: string, handler: MessageHandler<T>): Unsubscribe {
    const state = this.channels.get(channel);
    if (!state) {
      throw new AgencyError(
        ErrorCodes.CHANNEL_NOT_FOUND,
        `Channel not found: ${channel}`,
        { channelName: channel }
      );
    }

    state.subscribers.add(handler as MessageHandler);

    return () => {
      state.subscribers.delete(handler as MessageHandler);
    };
  }

  /**
   * Send a message to a channel with async parallel delivery
   *
   * @param channel Channel name
   * @param message Message envelope to send
   * @returns Delivery result with success count and any errors
   * @throws AgencyError if channel doesn't exist or all handlers fail
   */
  async send<T>(channel: string, message: MessageEnvelope<T>): Promise<DeliveryResult> {
    const state = this.channels.get(channel);
    if (!state) {
      throw new AgencyError(
        ErrorCodes.CHANNEL_NOT_FOUND,
        `Channel not found: ${channel}`,
        { channelName: channel }
      );
    }

    state.messageCount++;

    // Check for response to pending sendAndWait
    // Only intercept if this is a RESPONSE (different message ID than the original request)
    if (message.correlationId) {
      const pending = state.pendingResponses.get(message.correlationId);
      // Only resolve if this is a response (different message ID than the original request)
      if (pending && message.id !== pending.requestMessageId) {
        clearTimeout(pending.timeoutId);
        state.pendingResponses.delete(message.correlationId);
        pending.resolve(message as MessageEnvelope);
        // Response messages are not delivered to subscribers to avoid infinite loops
        return { successCount: 0, errors: [] };
      }
    }

    // Parallel delivery to all subscribers
    const errors: Array<{ handler: string; error: Error }> = [];
    let successCount = 0;

    const results = await Promise.allSettled(
      [...state.subscribers].map(async (handler, index) => {
        try {
          await handler(message);
          return { success: true, index };
        } catch (error) {
          return { success: false, index, error: error as Error };
        }
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.success) {
          successCount++;
        } else {
          errors.push({
            handler: `handler_${result.value.index}`,
            error: result.value.error!,
          });
        }
      } else {
        // Promise.allSettled should not reject, but handle just in case
        errors.push({
          handler: 'unknown',
          error: result.reason as Error,
        });
      }
    }

    // If all handlers failed and there were handlers, throw an aggregate error
    if (errors.length > 0 && successCount === 0 && state.subscribers.size > 0) {
      throw new AgencyError(
        ErrorCodes.CHANNEL_DELIVERY_FAILED,
        `All message handlers failed for channel: ${channel}`,
        { channelName: channel, errorCount: errors.length }
      );
    }

    return { successCount, errors };
  }

  /**
   * Convenience method to send a message with auto-generated envelope
   *
   * @param channel Channel name
   * @param sender Sender plugin ID
   * @param payload Message payload
   * @param correlationId Optional correlation ID
   * @returns Delivery result with success count and any errors
   */
  async sendMessage<T>(
    channel: string,
    sender: string,
    payload: T,
    correlationId?: string
  ): Promise<DeliveryResult> {
    const envelope = createMessageEnvelope({
      channel,
      sender,
      payload,
      correlationId,
    });
    return this.send(channel, envelope);
  }

  /**
   * Default timeout for sendAndWait in milliseconds
   */
  private static readonly DEFAULT_TIMEOUT = 30000;

  /**
   * Send a message and wait for a response with matching correlation ID
   *
   * @param channelId Channel to send to
   * @param message Message envelope to send
   * @param timeout Timeout in milliseconds (default: 30000)
   * @returns Promise that resolves with the response message
   * @throws AgencyError if channel doesn't exist or timeout occurs
   */
  async sendAndWait<T, R = unknown>(
    channelId: string,
    message: MessageEnvelope<T>,
    timeout: number = ChannelManager.DEFAULT_TIMEOUT
  ): Promise<MessageEnvelope<R>> {
    const state = this.channels.get(channelId);
    if (!state) {
      throw new AgencyError(
        ErrorCodes.CHANNEL_NOT_FOUND,
        `Channel not found: ${channelId}`,
        { channelName: channelId }
      );
    }

    // Ensure message has a correlation ID
    const correlationId = message.correlationId || crypto.randomUUID();
    const messageWithCorrelation = {
      ...message,
      correlationId,
    };

    // Set up response promise and pending entry
    let resolveFn: (message: MessageEnvelope<R>) => void;
    let rejectFn: (error: Error) => void;

    const responsePromise = new Promise<MessageEnvelope<R>>((resolve, reject) => {
      resolveFn = resolve;
      rejectFn = reject;
    });

    const timeoutId = setTimeout(() => {
      state.pendingResponses.delete(correlationId);
      rejectFn(
        new AgencyError(
          ErrorCodes.CHANNEL_TIMEOUT,
          `Timeout waiting for response on channel: ${channelId}`,
          { channelName: channelId, correlationId, timeoutMs: timeout }
        )
      );
    }, timeout);

    const pending: PendingResponse = {
      resolve: resolveFn! as (message: MessageEnvelope) => void,
      reject: rejectFn!,
      timeoutId,
      requestMessageId: messageWithCorrelation.id,
    };

    // Register the pending response BEFORE sending
    // The send() method will check for this correlation ID only for RESPONSE messages
    // (those with a different message ID than the original request)
    state.pendingResponses.set(correlationId, pending);

    // Send the message - this triggers handlers which may respond
    // The handler response will use the same correlationId, which will be
    // caught by the pending response check in send()
    await this.send(channelId, messageWithCorrelation);

    // Wait for response
    return responsePromise;
  }

  /**
   * Get the number of subscribers for a channel
   *
   * @param channel Channel name
   * @returns Number of subscribers or 0 if channel doesn't exist
   */
  getSubscriberCount(channel: string): number {
    return this.channels.get(channel)?.subscribers.size ?? 0;
  }

  /**
   * Get the message count for a channel
   *
   * @param channel Channel name
   * @returns Number of messages sent or 0 if channel doesn't exist
   */
  getMessageCount(channel: string): number {
    return this.channels.get(channel)?.messageCount ?? 0;
  }

  /**
   * Get all channels registered by a specific owner
   *
   * @param owner Owner plugin ID
   * @returns Array of channel definitions
   */
  getChannelsByOwner(owner: string): ChannelDefinition[] {
    return [...this.channels.values()]
      .filter((state) => state.definition.owner === owner)
      .map((state) => state.definition);
  }

  /**
   * Unregister all channels owned by a plugin
   *
   * @param owner Owner plugin ID
   * @returns Number of channels removed
   */
  unregisterChannelsByOwner(owner: string): number {
    let count = 0;
    for (const [name, state] of this.channels) {
      if (state.definition.owner === owner) {
        this.channels.delete(name);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear all channels
   */
  clear(): void {
    this.channels.clear();
  }

  /**
   * Register all built-in Agency channels
   *
   * This should be called during Agency initialization to set up
   * the standard channels for lifecycle, mode, telemetry, and bridging.
   */
  registerBuiltInChannels(): void {
    for (const channel of BUILT_IN_CHANNELS) {
      if (!this.channels.has(channel.name)) {
        this.registerChannel(channel);
      }
    }
  }

  /**
   * Get statistics about all channels
   *
   * @returns Object with channel statistics
   */
  getStats(): {
    totalChannels: number;
    totalSubscribers: number;
    totalMessages: number;
    channelStats: Array<{
      name: string;
      owner: string;
      subscribers: number;
      messages: number;
    }>;
  } {
    let totalSubscribers = 0;
    let totalMessages = 0;
    const channelStats: Array<{
      name: string;
      owner: string;
      subscribers: number;
      messages: number;
    }> = [];

    for (const [name, state] of this.channels) {
      totalSubscribers += state.subscribers.size;
      totalMessages += state.messageCount;
      channelStats.push({
        name,
        owner: state.definition.owner,
        subscribers: state.subscribers.size,
        messages: state.messageCount,
      });
    }

    return {
      totalChannels: this.channels.size,
      totalSubscribers,
      totalMessages,
      channelStats,
    };
  }
}
