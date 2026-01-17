import { describe, it, expect } from 'vitest';
import { AgencyError, ErrorCodes } from './agency-error.js';

describe('AgencyError', () => {
  it('should create an error with code and message', () => {
    const error = new AgencyError(ErrorCodes.CONFIG_NOT_FOUND, 'Config not found');

    expect(error.code).toBe('CONFIG_NOT_FOUND');
    expect(error.message).toBe('Config not found');
    expect(error.name).toBe('AgencyError');
    expect(error.context).toBeUndefined();
  });

  it('should create an error with context', () => {
    const error = new AgencyError(
      ErrorCodes.TOOL_NOT_FOUND,
      'Tool not found',
      { toolName: 'test.tool' }
    );

    expect(error.code).toBe('TOOL_NOT_FOUND');
    expect(error.context).toEqual({ toolName: 'test.tool' });
  });

  it('should have a stack trace', () => {
    const error = new AgencyError(ErrorCodes.CONFIG_INVALID, 'Invalid');

    expect(error.stack).toBeDefined();
  });

  it('should serialize to JSON', () => {
    const error = new AgencyError(
      ErrorCodes.PLUGIN_INIT_FAILED,
      'Plugin init failed',
      { plugin: 'test-plugin' }
    );

    const json = error.toJSON();

    expect(json).toEqual({
      name: 'AgencyError',
      code: 'PLUGIN_INIT_FAILED',
      message: 'Plugin init failed',
      context: { plugin: 'test-plugin' },
    });
  });

  it('should be an instance of Error', () => {
    const error = new AgencyError(ErrorCodes.SERVER_NOT_RUNNING, 'Not running');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AgencyError);
  });
});

describe('ErrorCodes', () => {
  it('should have all expected error codes', () => {
    expect(ErrorCodes.CONFIG_NOT_FOUND).toBe('CONFIG_NOT_FOUND');
    expect(ErrorCodes.CONFIG_INVALID).toBe('CONFIG_INVALID');
    expect(ErrorCodes.PLUGIN_NOT_FOUND).toBe('PLUGIN_NOT_FOUND');
    expect(ErrorCodes.PLUGIN_INIT_FAILED).toBe('PLUGIN_INIT_FAILED');
    expect(ErrorCodes.TOOL_NOT_FOUND).toBe('TOOL_NOT_FOUND');
    expect(ErrorCodes.TOOL_EXEC_FAILED).toBe('TOOL_EXEC_FAILED');
    expect(ErrorCodes.MODE_NOT_FOUND).toBe('MODE_NOT_FOUND');
    expect(ErrorCodes.SERVER_NOT_RUNNING).toBe('SERVER_NOT_RUNNING');
    expect(ErrorCodes.SERVER_ALREADY_RUNNING).toBe('SERVER_ALREADY_RUNNING');
  });
});
