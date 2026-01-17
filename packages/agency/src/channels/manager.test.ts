import { describe, expect, it, beforeEach, vi } from 'vitest';
import { ChannelManager, ChannelErrorCodes } from './manager.js';
import { AgencyError } from '../errors/index.js';
import { createMessageEnvelope } from './types.js';
import type { ChannelDefinition } from '../plugins/types.js';

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  function createChannel(name: string, owner: string = '@test/plugin'): ChannelDefinition {
    return {
      name,
      description: `Test channel: ${name}`,
      owner,
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

  describe('send', () => {
    it('delivers message to all subscribers', () => {
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
      manager.send('events', message);

      expect(handler1).toHaveBeenCalledWith(message);
      expect(handler2).toHaveBeenCalledWith(message);
    });

    it('increments message count', () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();
      manager.subscribe('events', handler);

      const message = createMessageEnvelope({
        channel: 'events',
        sender: '@test/plugin',
        payload: {},
      });

      manager.send('events', message);
      manager.send('events', message);
      manager.send('events', message);

      expect(manager.getMessageCount('events')).toBe(3);
    });

    it('throws for non-existent channel', () => {
      const message = createMessageEnvelope({
        channel: 'nonexistent',
        sender: '@test/plugin',
        payload: {},
      });

      expect(() => manager.send('nonexistent', message)).toThrow(AgencyError);
    });

    it('continues delivery even if handler throws', () => {
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

      // Should not throw
      manager.send('events', message);

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('creates and sends message envelope', () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();
      manager.subscribe('events', handler);

      manager.sendMessage('events', '@test/sender', { data: 'test' });

      expect(handler).toHaveBeenCalledTimes(1);
      const envelope = handler.mock.calls[0][0];
      expect(envelope.channel).toBe('events');
      expect(envelope.sender).toBe('@test/sender');
      expect(envelope.payload).toEqual({ data: 'test' });
      expect(envelope.id).toBeDefined();
      expect(envelope.timestamp).toBeInstanceOf(Date);
    });

    it('includes correlation ID when provided', () => {
      manager.registerChannel(createChannel('events'));
      const handler = vi.fn();
      manager.subscribe('events', handler);

      manager.sendMessage('events', '@test/sender', {}, 'corr-123');

      const envelope = handler.mock.calls[0][0];
      expect(envelope.correlationId).toBe('corr-123');
    });
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

  describe('getStats', () => {
    it('returns aggregate statistics', () => {
      manager.registerChannel(createChannel('channel-a', '@owner/a'));
      manager.registerChannel(createChannel('channel-b', '@owner/b'));

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      manager.subscribe('channel-a', handler1);
      manager.subscribe('channel-a', handler2);
      manager.subscribe('channel-b', handler1);

      manager.sendMessage('channel-a', '@test/sender', {});
      manager.sendMessage('channel-a', '@test/sender', {});
      manager.sendMessage('channel-b', '@test/sender', {});

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
