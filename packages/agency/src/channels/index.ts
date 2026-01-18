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
  PendingResponse,
  DeliveryResult,
} from './types.js';

export { createMessageEnvelope } from './types.js';

export { ChannelManager, ChannelErrorCodes, BUILT_IN_CHANNELS } from './manager.js';

export { isVersionCompatible } from './version.js';
