import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type * as vscode from 'vscode';
import { Logger, createScopedLogger, getLogger } from '../../utils/logger';
import { LOG_LEVELS } from '../../constants';

describe('Logger', () => {
  let mockOutputChannel: vscode.OutputChannel;
  let consoleLogSpy: ReturnType<typeof vi.spyOn>;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Reset the singleton
    (Logger as any).instance = null;

    mockOutputChannel = {
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    const logger = Logger.getInstance();
    logger.dispose();
    vi.restoreAllMocks();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('initialize', () => {
    it('should set the output channel', () => {
      const logger = Logger.getInstance();
      logger.initialize(mockOutputChannel);

      logger.info('Test message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalled();
    });
  });

  describe('log levels', () => {
    it('should respect minimum log level', () => {
      const logger = Logger.getInstance();
      logger.initialize(mockOutputChannel);
      logger.setLevel(LOG_LEVELS.WARN);

      logger.debug('Debug message');
      logger.info('Info message');
      logger.warn('Warn message');
      logger.error('Error message');

      // Only WARN and ERROR should be logged
      expect(mockOutputChannel.appendLine).toHaveBeenCalledTimes(2);
    });

    it('should get current log level', () => {
      const logger = Logger.getInstance();
      logger.setLevel(LOG_LEVELS.DEBUG);

      expect(logger.getLevel()).toBe(LOG_LEVELS.DEBUG);
    });
  });

  describe('logging methods', () => {
    beforeEach(() => {
      const logger = Logger.getInstance();
      logger.initialize(mockOutputChannel);
      logger.setLevel(LOG_LEVELS.DEBUG);
    });

    it('should log debug messages', () => {
      const logger = Logger.getInstance();
      logger.debug('Debug message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Debug message')
      );
    });

    it('should log info messages', () => {
      const logger = Logger.getInstance();
      logger.info('Info message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[INFO]')
      );
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('Info message')
      );
    });

    it('should log warn messages', () => {
      const logger = Logger.getInstance();
      logger.warn('Warn message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]')
      );
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it('should log error messages', () => {
      const logger = Logger.getInstance();
      logger.error('Error message');

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('[ERROR]')
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should include timestamp in log messages', () => {
      const logger = Logger.getInstance();
      logger.info('Test message');

      // ISO timestamp format: YYYY-MM-DDTHH:mm:ss
      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringMatching(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
      );
    });

    it('should include additional arguments in log messages', () => {
      const logger = Logger.getInstance();
      logger.info('Test message', { key: 'value' }, 123);

      expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
        expect.stringContaining('{"key":"value"}')
      );
    });
  });

  describe('show', () => {
    it('should show the output channel', () => {
      const logger = Logger.getInstance();
      logger.initialize(mockOutputChannel);

      logger.show();

      expect(mockOutputChannel.show).toHaveBeenCalled();
    });

    it('should not throw when output channel is not initialized', () => {
      const logger = Logger.getInstance();

      expect(() => logger.show()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose the output channel', () => {
      const logger = Logger.getInstance();
      logger.initialize(mockOutputChannel);

      logger.dispose();

      expect(mockOutputChannel.dispose).toHaveBeenCalled();
    });

    it('should reset the singleton instance', () => {
      const instance1 = Logger.getInstance();
      instance1.dispose();

      const instance2 = Logger.getInstance();

      expect(instance1).not.toBe(instance2);
    });
  });
});

describe('createScopedLogger', () => {
  let mockOutputChannel: vscode.OutputChannel;

  beforeEach(() => {
    // Reset the singleton
    (Logger as any).instance = null;

    mockOutputChannel = {
      appendLine: vi.fn(),
      show: vi.fn(),
      dispose: vi.fn(),
    } as unknown as vscode.OutputChannel;

    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const logger = Logger.getInstance();
    logger.initialize(mockOutputChannel);
    logger.setLevel(LOG_LEVELS.DEBUG);
  });

  afterEach(() => {
    const logger = Logger.getInstance();
    logger.dispose();
    vi.restoreAllMocks();
  });

  it('should create a scoped logger with prefix', () => {
    const scopedLogger = createScopedLogger('TestScope');

    scopedLogger.info('Test message');

    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('[TestScope]')
    );
    expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('Test message')
    );
  });

  it('should provide all log level methods', () => {
    const scopedLogger = createScopedLogger('TestScope');

    expect(scopedLogger.debug).toBeDefined();
    expect(scopedLogger.info).toBeDefined();
    expect(scopedLogger.warn).toBeDefined();
    expect(scopedLogger.error).toBeDefined();
  });
});

describe('getLogger', () => {
  beforeEach(() => {
    // Reset the singleton
    (Logger as any).instance = null;
  });

  it('should return the singleton logger instance', () => {
    const logger = getLogger();

    expect(logger).toBe(Logger.getInstance());
  });
});
