import type * as vscode from 'vscode';
import { LOG_LEVELS, OUTPUT_CHANNEL_NAME, type LogLevel } from '../constants';

/**
 * Logger utility for consistent logging throughout the extension.
 * Uses VS Code's OutputChannel for output visibility.
 */
export class Logger {
  private static instance: Logger | null = null;
  private outputChannel: vscode.OutputChannel | null = null;
  private minLevel: LogLevel = LOG_LEVELS.INFO;

  private constructor() {}

  /**
   * Get the singleton logger instance.
   */
  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  /**
   * Initialize the logger with a VS Code output channel.
   * Must be called during extension activation.
   */
  initialize(outputChannel: vscode.OutputChannel): void {
    this.outputChannel = outputChannel;
  }

  /**
   * Set the minimum log level.
   */
  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * Get the current minimum log level.
   */
  getLevel(): LogLevel {
    return this.minLevel;
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    const levels = Object.values(LOG_LEVELS);
    const minIndex = levels.indexOf(this.minLevel);
    const currentIndex = levels.indexOf(level);
    return currentIndex >= minIndex;
  }

  /**
   * Format a log message with timestamp and level.
   */
  private formatMessage(level: LogLevel, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const formattedArgs = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    return `[${timestamp}] [${level}] ${message}${formattedArgs}`;
  }

  /**
   * Write a message to the output channel.
   */
  private write(level: LogLevel, message: string, ...args: unknown[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const formattedMessage = this.formatMessage(level, message, ...args);

    if (this.outputChannel) {
      this.outputChannel.appendLine(formattedMessage);
    }

    // Also log to console for debugging during development
    if (level === LOG_LEVELS.ERROR) {
      console.error(formattedMessage);
    } else if (level === LOG_LEVELS.WARN) {
      console.warn(formattedMessage);
    } else {
      console.log(formattedMessage);
    }
  }

  /**
   * Log a debug message.
   */
  debug(message: string, ...args: unknown[]): void {
    this.write(LOG_LEVELS.DEBUG, message, ...args);
  }

  /**
   * Log an info message.
   */
  info(message: string, ...args: unknown[]): void {
    this.write(LOG_LEVELS.INFO, message, ...args);
  }

  /**
   * Log a warning message.
   */
  warn(message: string, ...args: unknown[]): void {
    this.write(LOG_LEVELS.WARN, message, ...args);
  }

  /**
   * Log an error message.
   */
  error(message: string, ...args: unknown[]): void {
    this.write(LOG_LEVELS.ERROR, message, ...args);
  }

  /**
   * Show the output channel.
   */
  show(): void {
    this.outputChannel?.show();
  }

  /**
   * Dispose of the logger resources.
   */
  dispose(): void {
    this.outputChannel?.dispose();
    this.outputChannel = null;
    Logger.instance = null;
  }
}

/**
 * Create a scoped logger for a specific component.
 */
export function createScopedLogger(scope: string): {
  debug: (message: string, ...args: unknown[]) => void;
  info: (message: string, ...args: unknown[]) => void;
  warn: (message: string, ...args: unknown[]) => void;
  error: (message: string, ...args: unknown[]) => void;
} {
  const logger = Logger.getInstance();
  const prefix = `[${scope}]`;

  return {
    debug: (message: string, ...args: unknown[]) => logger.debug(`${prefix} ${message}`, ...args),
    info: (message: string, ...args: unknown[]) => logger.info(`${prefix} ${message}`, ...args),
    warn: (message: string, ...args: unknown[]) => logger.warn(`${prefix} ${message}`, ...args),
    error: (message: string, ...args: unknown[]) => logger.error(`${prefix} ${message}`, ...args),
  };
}

/**
 * Get the singleton logger instance.
 * Convenience function for quick access.
 */
export function getLogger(): Logger {
  return Logger.getInstance();
}

/**
 * Create an output channel for the extension.
 * Should be called once during extension activation.
 */
export function createOutputChannel(window: typeof vscode.window): vscode.OutputChannel {
  return window.createOutputChannel(OUTPUT_CHANNEL_NAME);
}
