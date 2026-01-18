/**
 * Channel Manager for Agency
 *
 * Manages inter-plugin communication channels using a pub/sub pattern.
 * Channels are registered by plugins and can be used for decoupled messaging.
 */

import { AgencyError, ErrorCodes } from '../errors/index.js';
import type { ChannelDefinition, MessageEnvelope } from '../plugins/types.js';
import type { MessageHandler, Unsubscribe, ChannelState } from './types.js';
import { createMessageEnvelope } from './types.js';

/**
 * Channel manager error codes (re-export for convenience)
 */
export const ChannelErrorCodes = {
  CHANNEL_NOT_FOUND: ErrorCodes.CHANNEL_NOT_FOUND,
  CHANNEL_ALREADY_EXISTS: ErrorCodes.CHANNEL_ALREADY_REGISTERED,
} as const;

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
   * Send a message to a channel
   *
   * @param channel Channel name
   * @param message Message envelope to send
   * @throws AgencyError if channel doesn't exist
   */
  send<T>(channel: string, message: MessageEnvelope<T>): void {
    const state = this.channels.get(channel);
    if (!state) {
      throw new AgencyError(
        ErrorCodes.CHANNEL_NOT_FOUND,
        `Channel not found: ${channel}`,
        { channelName: channel }
      );
    }

    state.messageCount++;

    // Deliver to all subscribers
    for (const handler of state.subscribers) {
      try {
        handler(message);
      } catch {
        // Log but don't propagate subscriber errors
        // In a real implementation, we might want to track failed deliveries
      }
    }
  }

  /**
   * Convenience method to send a message with auto-generated envelope
   *
   * @param channel Channel name
   * @param sender Sender plugin ID
   * @param payload Message payload
   * @param correlationId Optional correlation ID
   */
  sendMessage<T>(
    channel: string,
    sender: string,
    payload: T,
    correlationId?: string
  ): void {
    const envelope = createMessageEnvelope({
      channel,
      sender,
      payload,
      correlationId,
    });
    this.send(channel, envelope);
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
