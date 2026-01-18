import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ChannelManager, ChannelErrorCodes, BUILT_IN_CHANNELS } from './manager.js';
import { AgencyError, ErrorCodes } from '../errors/index.js';
import { createMessageEnvelope } from './types.js';
import type { ChannelDefinition } from '../plugins/types.js';

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  function createChannel(
    name: string,
    owner: string = '@test/plugin',
    options?: Partial<ChannelDefinition>
  ): ChannelDefinition {
    return {
      name,
      description: `Test channel: ${name}`,
      owner,
      ...options,
    };
  }

  describe('registerChannel', () => {
    it('registers a new channel', () => {
      const channel = createChannel('events');

      manager.registerChannel(channel);

      expect(manager.hasChannel('events')).toBe(true);
    });

    it('throws when registering duplicate channel', () => {
      const channel = createChannel('events');
      manager.registerChannel(channel);

      expect(() => manager.registerChannel(channel)).toThrow(AgencyError);
    });

    it('includes existing owner in error context', () => {
      manager.registerChannel(createChannel('events', '@owner/original'));

      try {
        manager.registerChannel(createChannel('events', '@owner/new'));
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).context?.existingOwner).toBe('@owner/original');
      }
    });
  });

  describe('unregisterChannel', () => {
    it('removes a registered channel', () => {
      manager.registerChannel(createChannel('events'));

      const result = manager.unregisterChannel('events');

      expect(result).toBe(true);
      expect(manager.hasChannel('events')).toBe(false);
    });

    it('returns false for non-existent channel', () => {
      const result = manager.unregisterChannel('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('getChannel', () => {
    it('returns channel definition', () => {
      const channel = createChannel('events');
      manager.registerChannel(channel);

      const result = manager.getChannel('events');

      expect(result).toEqual(channel);
    });

    it('returns undefined for non-existent channel', () => {
      const result = manager.getChannel('nonexistent');
      expect(result).toBeUndefined();
    });
  });

  describe('getChannelNames', () => {
    it('returns all channel names', () => {
      manager.registerChannel(createChannel('channel-a'));
      manager.registerChannel(createChannel('channel-b'));
      manager.registerChannel(createChannel('channel-c'));

      const names = manager.getChannelNames();

      expect(names).toHaveLength(3);
      expect(names).toContain('channel-a');
      expect(names).toContain('channel-b');
      expect(names).toContain('channel-c');
    });

    it('returns empty array when no channels', () => {
      const names = manager.getChannelNames();
      expect(names).toEqual([]);
    });
  });

  describe('getChannels', () => {
    it('returns all channel definitions', () => {
      const channelA = createChannel('channel-a', '@owner/a');
      const channelB = createChannel('channel-b', '@owner/b');
      manager.registerChannel(channelA);
      manager.registerChannel(channelB);

      const channels = manager.getChannels();

      expect(channels).toHaveLength(2);
      expect(channels).toContainEqual(channelA);
      expect(channels).toContainEqual(channelB);
    });

    it('returns empty array when no channels', () => {
      const channels = manager.getChannels();
      expect(channels).toEqual([]);
    });
  });

  describe('findChannel', () => {
    it('returns channel by ID', () => {
      const channel = createChannel('events', '@test/plugin', { version: '1.0.0' });
      manager.registerChannel(channel);

      const result = manager.findChannel('events');

      expect(result).toEqual(channel);
    });

    it('returns undefined for non-existent channel', () => {
      const result = manager.findChannel('nonexistent');
      expect(result).toBeUndefined();
    });

    it('returns channel when version is compatible', () => {
      const channel = createChannel('events', '@test/plugin', { version: '1.2.0' });
      manager.registerChannel(channel);

      const result = manager.findChannel('events', '1.0.0');

      expect(result).toEqual(channel);
    });

    it('returns undefined when version is not compatible', () => {
      const channel = createChannel('events', '@test/plugin', { version: '1.0.0' });
      manager.registerChannel(channel);

      const result = manager.findChannel('events', '2.0.0');

      expect(result).toBeUndefined();
    });

    it('returns undefined when channel has no version and version is required', () => {
      const channel = createChannel('events');
      manager.registerChannel(channel);

      const result = manager.findChannel('events', '1.0.0');

      expect(result).toBeUndefined();
    });
  });

  describe('findPair', () => {
    it('finds channels paired with the given channel', () => {
      const humancyChannel = createChannel('humancy.agency', '@humancy', {
        version: '1.0.0',
        pairedWith: { component: 'agency', channelId: 'agency.humancy' },
      });
      const agencyChannel = createChannel('agency.humancy', '@generacy-ai/agency', {
        version: '1.0.0',
        pairedWith: { component: 'humancy', channelId: 'humancy.agency' },
      });
      manager.registerChannel(humancyChannel);
      manager.registerChannel(agencyChannel);

      const pairs = manager.findPair(agencyChannel);

      expect(pairs).toContainEqual(humancyChannel);
    });

    it('returns empty array when no pairs exist', () => {
      const channel = createChannel('standalone');
      manager.registerChannel(channel);

      const pairs = manager.findPair(channel);

      expect(pairs).toEqual([]);
    });
  });

  describe('subscribe', () => {
    it('adds subscriber to channel', () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();

      manager.subscribe('events', handler);

      expect(manager.getSubscriberCount('events')).toBe(1);
    });

    it('returns unsubscribe function', () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();

      const unsubscribe = manager.subscribe('events', handler);
      expect(manager.getSubscriberCount('events')).toBe(1);

      unsubscribe();
      expect(manager.getSubscriberCount('events')).toBe(0);
    });

    it('throws for non-existent channel', () => {
      const handler = vi.fn();

      expect(() => manager.subscribe('nonexistent', handler)).toThrow(AgencyError);
    });

    it('supports multiple subscribers', () => {
      manager.registerChannel(createChannel('events'));
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      manager.subscribe('events', handler1);
      manager.subscribe('events', handler2);
      manager.subscribe('events', handler3);

      expect(manager.getSubscriberCount('events')).toBe(3);
    });
  });

  describe('unsubscribe cleanup (AC5)', () => {
    it('removes handler from subscribers on unsubscribe', () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();

      const unsubscribe = manager.subscribe('events', handler);
      expect(manager.getSubscriberCount('events')).toBe(1);

      unsubscribe();
      expect(manager.getSubscriberCount('events')).toBe(0);
    });

    it('does not affect other subscribers when one unsubscribes', async () => {
      manager.registerChannel(createChannel('events'));
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const unsubscribe1 = manager.subscribe('events', handler1);
      manager.subscribe('events', handler2);

      unsubscribe1();

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });
      await manager.send('events', message);

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('allows re-subscription after unsubscribe', async () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();

      const unsubscribe = manager.subscribe('events', handler);
      unsubscribe();

      manager.subscribe('events', handler);
      expect(manager.getSubscriberCount('events')).toBe(1);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });
      await manager.send('events', message);

      expect(handler).toHaveBeenCalledWith(message);
    });
  });

  describe('send', () => {
    it('delivers message to all subscribers', async () => {
      manager.registerChannel(createChannel('events'));
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribe('events', handler1);
      manager.subscribe('events', handler2);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: { type: 'test' },
      });
      await manager.send('events', message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('increments message count', async () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();
      manager.subscribe('events', handler);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });

      await manager.send('events', message);
      await manager.send('events', message);
      await manager.send('events', message);

      expect(manager.getMessageCount('events')).toBe(3);
    });

    it('throws for non-existent channel', async () => {
      const message = createMessageEnvelope({
        channel: 'nonexistent',
        sender: '@test/plugin',
        payload: {},
      });

      await expect(manager.send('nonexistent', message)).rejects.toThrow(AgencyError);
    });

    it('continues delivery even if handler throws', async () => {
      manager.registerChannel(createChannel('events'));
      const errorHandler = vi.fn().mockImplementation(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      manager.subscribe('events', errorHandler);
      manager.subscribe('events', successHandler);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });

      // Should not throw because one handler succeeded
      const result = await manager.send('events', message);

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(result.successCount).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('returns delivery result with success count', async () => {
      manager.registerChannel(createChannel('events'));
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribe('events', handler1);
      manager.subscribe('events', handler2);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });

      const result = await manager.send('events', message);

      expect(result.successCount).toBe(2);
      expect(result.errors).toEqual([]);
    });

    it('throws when all handlers fail', async () => {
      manager.registerChannel(createChannel('events'));
      const errorHandler1 = vi.fn().mockRejectedValue(new Error('Error 1'));
      const errorHandler2 = vi.fn().mockRejectedValue(new Error('Error 2'));

      manager.subscribe('events', errorHandler1);
      manager.subscribe('events', errorHandler2);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });

      await expect(manager.send('events', message)).rejects.toThrow(AgencyError);
    });
  });

  describe('sendMessage', () => {
    it('creates and sends message envelope', async () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();
      manager.subscribe('events', handler);

      await manager.sendMessage('events', '@test/sender', { data: 'test' });

      expect(handler).toHaveBeenCalledTimes(1);
      const envelope = handler.mock.calls[0][0];
      expect(envelope.channel).toBe('events');
      expect(envelope.sender).toBe('@test/sender');
      expect(envelope.payload).toEqual({ data: 'test' });
      expect(envelope.id).toBeDefined();
      expect(envelope.timestamp).toBeInstanceOf(Date);
    });

    it('includes correlation ID when provided', async () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();
      manager.subscribe('events', handler);

      await manager.sendMessage('events', '@test/sender', {}, 'corr-123');

      const envelope = handler.mock.calls[0][0];
      expect(envelope.correlationId).toBe('corr-123');
    });
  });

  describe('sendAndWait', () => {
    it('sends message and waits for response', async () => {
      manager.registerChannel(createChannel('events'));

      // Handler that responds to the message
      manager.subscribe('events', async (msg) => {
        if (msg.correlationId) {
          const response = createMessageEnvelope({
            channel: 'events',
            sender: '@test/responder',
            payload: { response: 'ok' },
            correlationId: msg.correlationId,
          });
          await manager.send('events', response);
        }
      });

      const request = createMessageEnvelope({
        channel: 'events',
        sender: '@test/requester',
        payload: { request: 'data' },
      });

      const response = await manager.sendAndWait('events', request);

      expect(response.payload).toEqual({ response: 'ok' });
      expect(response.correlationId).toBeDefined();
    });

    it('times out if no response received', async () => {
      manager.registerChannel(createChannel('events'));
      manager.subscribe('events', vi.fn()); // Handler that doesn't respond

      const request = createMessageEnvelope({
        channel: 'events',
        sender: '@test/requester',
        payload: {},
      });

      await expect(manager.sendAndWait('events', request, 50)).rejects.toThrow(AgencyError);
    }, 1000);

    it('throws timeout error with correct code', async () => {
      manager.registerChannel(createChannel('events'));
      manager.subscribe('events', vi.fn());

      const request = createMessageEnvelope({
        channel: 'events',
        sender: '@test/requester',
        payload: {},
      });

      try {
        await manager.sendAndWait('events', request, 50);
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AgencyError);
        expect((error as AgencyError).code).toBe(ErrorCodes.CHANNEL_TIMEOUT);
      }
    }, 1000);

    it('generates correlation ID if not provided', async () => {
      manager.registerChannel(createChannel('events'));

      let receivedCorrelationId: string | undefined;
      manager.subscribe('events', async (msg) => {
        receivedCorrelationId = msg.correlationId;
        if (msg.correlationId) {
          const response = createMessageEnvelope({
            channel: 'events',
            sender: '@test/responder',
            payload: {},
            correlationId: msg.correlationId,
          });
          await manager.send('events', response);
        }
      });

      const request = createMessageEnvelope({
        channel: 'events',
        sender: '@test/requester',
        payload: {},
        // No correlationId provided
      });

      await manager.sendAndWait('events', request);

      expect(receivedCorrelationId).toBeDefined();
      expect(receivedCorrelationId?.length).toBeGreaterThan(0);
    });

    it('cleans up pending response on timeout', async () => {
      manager.registerChannel(createChannel('events'));
      manager.subscribe('events', vi.fn());

      const request = createMessageEnvelope({
        channel: 'events',
        sender: '@test/requester',
        payload: {},
        correlationId: 'test-corr-id',
      });

      try {
        await manager.sendAndWait('events', request, 50);
      } catch {
        // Expected timeout
      }

      // Late response should not cause issues
      const lateResponse = createMessageEnvelope({
        channel: 'events',
        sender: '@test/responder',
        payload: {},
        correlationId: 'test-corr-id',
      });

      // Should complete without error
      await manager.send('events', lateResponse);
    }, 1000);
  });

  describe('getChannelsByOwner', () => {
    it('returns channels owned by a plugin', () => {
      manager.registerChannel(createChannel('channel-a', '@owner/one'));
      manager.registerChannel(createChannel('channel-b', '@owner/one'));
      manager.registerChannel(createChannel('channel-c', '@owner/two'));

      const channels = manager.getChannelsByOwner('@owner/one');

      expect(channels).toHaveLength(2);
      expect(channels.map((c) => c.name)).toContain('channel-a');
      expect(channels.map((c) => c.name)).toContain('channel-b');
    });

    it('returns empty array when owner has no channels', () => {
      const channels = manager.getChannelsByOwner('@owner/none');
      expect(channels).toEqual([]);
    });
  });

  describe('unregisterChannelsByOwner', () => {
    it('removes all channels owned by a plugin', () => {
      manager.registerChannel(createChannel('channel-a', '@owner/remove'));
      manager.registerChannel(createChannel('channel-b', '@owner/remove'));
      manager.registerChannel(createChannel('channel-c', '@owner/keep'));

      const count = manager.unregisterChannelsByOwner('@owner/remove');

      expect(count).toBe(2);
      expect(manager.hasChannel('channel-a')).toBe(false);
      expect(manager.hasChannel('channel-b')).toBe(false);
      expect(manager.hasChannel('channel-c')).toBe(true);
    });
  });

  describe('clear', () => {
    it('removes all channels', () => {
      manager.registerChannel(createChannel('channel-a'));
      manager.registerChannel(createChannel('channel-b'));

      manager.clear();

      expect(manager.getChannelNames()).toEqual([]);
    });
  });

  describe('registerBuiltInChannels', () => {
    it('registers all built-in channels', () => {
      manager.registerBuiltInChannels();

      expect(manager.hasChannel('agency.lifecycle')).toBe(true);
      expect(manager.hasChannel('agency.mode')).toBe(true);
      expect(manager.hasChannel('agency.telemetry')).toBe(true);
      expect(manager.hasChannel('agency.humancy')).toBe(true);
    });

    it('does not throw if called multiple times', () => {
      manager.registerBuiltInChannels();
      expect(() => manager.registerBuiltInChannels()).not.toThrow();
    });

    it('built-in channels have correct version', () => {
      manager.registerBuiltInChannels();

      const lifecycle = manager.getChannel('agency.lifecycle');
      expect(lifecycle?.version).toBe('1.0.0');
    });

    it('agency.humancy has pairedWith configuration', () => {
      manager.registerBuiltInChannels();

      const humancy = manager.getChannel('agency.humancy');
      expect(humancy?.pairedWith).toEqual({
        component: 'humancy',
        channelId: 'humancy.agency',
      });
    });
  });

  describe('getStats', () => {
    it('returns aggregate statistics', async () => {
      manager.registerChannel(createChannel('channel-a', '@owner/a'));
      manager.registerChannel(createChannel('channel-b', '@owner/b'));

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribe('channel-a', handler1);
      manager.subscribe('channel-a', handler2);
      manager.subscribe('channel-b', handler1);

      await manager.sendMessage('channel-a', '@test/sender', {});
      await manager.sendMessage('channel-a', '@test/sender', {});
      await manager.sendMessage('channel-b', '@test/sender', {});

      const stats = manager.getStats();

      expect(stats.totalChannels).toBe(2);
      expect(stats.totalSubscribers).toBe(3);
      expect(stats.totalMessages).toBe(3);
      expect(stats.channelStats).toHaveLength(2);
    });
  });
});

describe('createMessageEnvelope', () => {
  it('creates envelope with auto-generated id and timestamp', () => {
    const envelope = createMessageEnvelope({
      channel: 'test',
      sender: '@test/plugin',
      payload: { data: 123 },
    });

    expect(envelope.id).toBeDefined();
    expect(envelope.id.length).toBeGreaterThan(0);
    expect(envelope.channel).toBe('test');
    expect(envelope.sender).toBe('@test/plugin');
    expect(envelope.timestamp).toBeInstanceOf(Date);
    expect(envelope.payload).toEqual({ data: 123 });
    expect(envelope.correlationId).toBeUndefined();
  });

  it('includes correlation ID when provided', () => {
    const envelope = createMessageEnvelope({
      channel: 'test',
      sender: '@test/plugin',
      payload: {},
      correlationId: 'request-123',
    });

    expect(envelope.correlationId).toBe('request-123');
  });
});

describe('BUILT_IN_CHANNELS', () => {
  it('exports all expected built-in channels', () => {
    const names = BUILT_IN_CHANNELS.map((c) => c.name);

    expect(names).toContain('agency.lifecycle');
    expect(names).toContain('agency.mode');
    expect(names).toContain('agency.telemetry');
    expect(names).toContain('agency.humancy');
  });

  it('all built-in channels have version 1.0.0', () => {
    for (const channel of BUILT_IN_CHANNELS) {
      expect(channel.version).toBe('1.0.0');
    }
  });

  it('all built-in channels are owned by @generacy-ai/agency', () => {
    for (const channel of BUILT_IN_CHANNELS) {
      expect(channel.owner).toBe('@generacy-ai/agency');
    }
  });
});
