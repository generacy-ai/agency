import { describe, expect, it, beforeEach, vi } from 'vitest';
import { CoreAPIFactory, createCoreAPIFactory } from './core-api.js';
import type { CoreAPIDependencies } from './types.js';
import type { AgencyTool } from '../tools/types.js';
import type { ChannelDefinition, TelemetryEvent } from '../plugins/types.js';
import { createMessageEnvelope } from '../channels/types.js';

describe('CoreAPIFactory', () => {
  let dependencies: CoreAPIDependencies;
  let factory: CoreAPIFactory;

  function createMockTool(name: string): AgencyTool {
    return {
      name,
      description: `Test tool ${name}`,
      inputSchema: { type: 'object' },
      namespace: 'test',
      outputPattern: 'terse',
      execute: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    };
  }

  beforeEach(() => {
    dependencies = {
      toolRegistry: {
        register: vi.fn(),
        unregister: vi.fn().mockReturnValue(true),
      },
      modeManager: {
        getMode: vi.fn().mockReturnValue('default'),
        registerMode: vi.fn(),
        onModeChange: vi.fn().mockReturnValue(() => {}),
      },
      channelManager: {
        registerChannel: vi.fn(),
        send: vi.fn(),
        subscribe: vi.fn().mockReturnValue(() => {}),
      },
      config: {
        name: 'test-server',
        pluginOptions: {
          '@test/plugin': {
            customOption: 'custom-value',
          },
        },
      },
      recordEvent: vi.fn(),
    };

    factory = new CoreAPIFactory(dependencies);
  });

  describe('createForPlugin', () => {
    it('creates API instance with plugin ID', () => {
      const api = factory.createForPlugin('@test/plugin');
      expect(api.getPluginId()).toBe('@test/plugin');
    });

    it('creates unique instances per plugin', () => {
      const api1 = factory.createForPlugin('@test/plugin-1');
      const api2 = factory.createForPlugin('@test/plugin-2');

      expect(api1.getPluginId()).toBe('@test/plugin-1');
      expect(api2.getPluginId()).toBe('@test/plugin-2');
    });
  });
});

describe('PluginCoreAPI', () => {
  let dependencies: CoreAPIDependencies;
  let factory: CoreAPIFactory;

  function createMockTool(name: string): AgencyTool {
    return {
      name,
      description: `Test tool ${name}`,
      inputSchema: { type: 'object' },
      namespace: 'test',
      outputPattern: 'terse',
      execute: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] }),
    };
  }

  beforeEach(() => {
    dependencies = {
      toolRegistry: {
        register: vi.fn(),
        unregister: vi.fn().mockReturnValue(true),
      },
      modeManager: {
        getMode: vi.fn().mockReturnValue('default'),
        registerMode: vi.fn(),
        onModeChange: vi.fn().mockReturnValue(() => {}),
      },
      channelManager: {
        registerChannel: vi.fn(),
        send: vi.fn(),
        subscribe: vi.fn().mockReturnValue(() => {}),
      },
      config: {
        name: 'test-server',
        pluginOptions: {
          '@test/plugin': {
            customOption: 'custom-value',
          },
        },
      },
      recordEvent: vi.fn(),
    };

    factory = new CoreAPIFactory(dependencies);
  });

  describe('registerTool', () => {
    it('registers tool with registry', () => {
      const api = factory.createForPlugin('@test/plugin');
      const tool = createMockTool('test.tool');

      api.registerTool(tool);

      expect(dependencies.toolRegistry.register).toHaveBeenCalledWith(tool);
    });
  });

  describe('unregisterTool', () => {
    it('unregisters previously registered tool', () => {
      const api = factory.createForPlugin('@test/plugin');
      const tool = createMockTool('test.tool');
      api.registerTool(tool);

      api.unregisterTool('test.tool');

      expect(dependencies.toolRegistry.unregister).toHaveBeenCalledWith('test.tool');
    });

    it('does not unregister tools not registered by this plugin', () => {
      const api = factory.createForPlugin('@test/plugin');

      api.unregisterTool('other.tool');

      expect(dependencies.toolRegistry.unregister).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentMode', () => {
    it('returns current mode from manager', () => {
      const api = factory.createForPlugin('@test/plugin');
      (dependencies.modeManager.getMode as ReturnType<typeof vi.fn>).mockReturnValue('dev');

      const mode = api.getCurrentMode();

      expect(mode).toBe('dev');
    });
  });

  describe('registerMode', () => {
    it('registers mode with plugin ID', () => {
      const api = factory.createForPlugin('@test/plugin');

      api.registerMode('custom-mode');

      expect(dependencies.modeManager.registerMode).toHaveBeenCalledWith(
        'custom-mode',
        ['*'],
        '@test/plugin'
      );
    });
  });

  describe('onModeChange', () => {
    it('subscribes to mode changes', () => {
      const api = factory.createForPlugin('@test/plugin');
      const callback = vi.fn();

      api.onModeChange(callback);

      expect(dependencies.modeManager.onModeChange).toHaveBeenCalledWith(callback);
    });

    it('returns unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      (dependencies.modeManager.onModeChange as ReturnType<typeof vi.fn>).mockReturnValue(
        mockUnsubscribe
      );
      const api = factory.createForPlugin('@test/plugin');

      const unsubscribe = api.onModeChange(() => {});
      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('registerChannel', () => {
    it('registers channel with plugin as owner', () => {
      const api = factory.createForPlugin('@test/plugin');
      const channel: ChannelDefinition = {
        name: 'events',
        description: 'Event channel',
        owner: 'original-owner',
      };

      api.registerChannel(channel);

      expect(dependencies.channelManager.registerChannel).toHaveBeenCalledWith({
        ...channel,
        owner: '@test/plugin',
      });
    });
  });

  describe('sendMessage', () => {
    it('sends message with plugin as sender', () => {
      const api = factory.createForPlugin('@test/plugin');
      const message = createMessageEnvelope({
        channel: 'events',
        sender: 'original-sender',
        payload: { data: 'test' },
      });

      api.sendMessage('events', message);

      expect(dependencies.channelManager.send).toHaveBeenCalledWith(
        'events',
        expect.objectContaining({
          sender: '@test/plugin',
          payload: { data: 'test' },
        })
      );
    });
  });

  describe('onMessage', () => {
    it('subscribes to channel messages', () => {
      const api = factory.createForPlugin('@test/plugin');
      const handler = vi.fn();

      api.onMessage('events', handler);

      expect(dependencies.channelManager.subscribe).toHaveBeenCalledWith('events', handler);
    });

    it('returns unsubscribe function', () => {
      const mockUnsubscribe = vi.fn();
      (dependencies.channelManager.subscribe as ReturnType<typeof vi.fn>).mockReturnValue(
        mockUnsubscribe
      );
      const api = factory.createForPlugin('@test/plugin');

      const unsubscribe = api.onMessage('events', () => {});
      unsubscribe();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });
  });

  describe('getConfig', () => {
    it('returns plugin-specific config value', () => {
      const api = factory.createForPlugin('@test/plugin');

      const value = api.getConfig<string>('customOption');

      expect(value).toBe('custom-value');
    });

    it('returns global config value for non-plugin key', () => {
      const api = factory.createForPlugin('@test/plugin');

      const value = api.getConfig<string>('name');

      expect(value).toBe('test-server');
    });

    it('returns undefined for missing key', () => {
      const api = factory.createForPlugin('@test/plugin');

      const value = api.getConfig<string>('nonexistent');

      expect(value).toBeUndefined();
    });

    it('returns undefined for plugin without options', () => {
      const api = factory.createForPlugin('@other/plugin');

      const value = api.getConfig<string>('customOption');

      expect(value).toBeUndefined();
    });
  });

  describe('recordEvent', () => {
    it('records event with plugin ID', () => {
      const api = factory.createForPlugin('@test/plugin');
      const event: TelemetryEvent = {
        type: 'test-event',
        timestamp: new Date(),
        data: { key: 'value' },
      };

      api.recordEvent(event);

      expect(dependencies.recordEvent).toHaveBeenCalledWith({
        ...event,
        data: {
          key: 'value',
          pluginId: '@test/plugin',
        },
      });
    });
  });

  describe('plugin isolation', () => {
    it('tracks tools registered by each plugin separately', () => {
      const api1 = factory.createForPlugin('@test/plugin-1');
      const api2 = factory.createForPlugin('@test/plugin-2');

      api1.registerTool(createMockTool('tool.one'));
      api2.registerTool(createMockTool('tool.two'));

      // API1 should only unregister tool.one
      api1.unregisterTool('tool.two');
      expect(dependencies.toolRegistry.unregister).not.toHaveBeenCalledWith('tool.two');

      api1.unregisterTool('tool.one');
      expect(dependencies.toolRegistry.unregister).toHaveBeenCalledWith('tool.one');
    });
  });
});

describe('createCoreAPIFactory', () => {
  it('creates a CoreAPIFactory instance', () => {
    const dependencies: CoreAPIDependencies = {
      toolRegistry: { register: vi.fn(), unregister: vi.fn() },
      modeManager: {
        getMode: vi.fn(),
        registerMode: vi.fn(),
        onModeChange: vi.fn(),
      },
      channelManager: {
        registerChannel: vi.fn(),
        send: vi.fn(),
        subscribe: vi.fn(),
      },
      config: {},
      recordEvent: vi.fn(),
    };

    const factory = createCoreAPIFactory(dependencies);

    expect(factory).toBeInstanceOf(CoreAPIFactory);
  });
});
