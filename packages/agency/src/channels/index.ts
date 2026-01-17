/**
 * Channels module for Agency
 *
 * Provides inter-plugin communication via pub/sub channels.
 */

export type {
  ChannelDefinition,
  MessageEnvelope,
  MessageHandler,
  Unsubscribe,
  ChannelState,
  CreateMessageOptions,
} from './types.js';

export { createMessageEnvelope } from './types.js';

export { ChannelManager, ChannelErrorCodes } from './manager.js';
