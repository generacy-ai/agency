/**
 * Core API module for Agency
 *
 * Provides the API surface for plugins to interact with Agency.
 */

export type {
  AgencyCoreAPI,
  ChannelDefinition,
  MessageEnvelope,
  TelemetryEvent,
  CoreAPIFactory as CoreAPIFactoryInterface,
  MessageHandler,
  ModeChangeCallback,
  Unsubscribe,
  CoreAPIDependencies,
} from './types.js';

export { CoreAPIFactory, createCoreAPIFactory } from './core-api.js';
