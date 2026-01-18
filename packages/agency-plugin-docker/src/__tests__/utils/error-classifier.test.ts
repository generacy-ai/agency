/**
 * Tests for Docker error classifier
 */

import { describe, it, expect } from 'vitest';
import {
  classifyDockerError,
  formatDockerError,
  type DockerErrorCategory,
} from '../../utils/error-classifier.js';

describe('classifyDockerError', () => {
  describe('daemon errors', () => {
    it('classifies "cannot connect to docker daemon"', () => {
      const result = classifyDockerError(
        'Cannot connect to the Docker daemon at unix:///var/run/docker.sock',
        1
      );
      expect(result.category).toBe('daemon');
      expect(result.exitCode).toBe(1);
    });

    it('classifies "is the docker daemon running"', () => {
      const result = classifyDockerError(
        'Error response from daemon: Is the docker daemon running?',
        1
      );
      expect(result.category).toBe('daemon');
    });

    it('classifies connection refused errors', () => {
      const result = classifyDockerError(
        'error during connect: connection refused',
        1
      );
      expect(result.category).toBe('daemon');
    });
  });

  describe('permission errors', () => {
    it('classifies permission denied', () => {
      const result = classifyDockerError(
        'permission denied while trying to connect to the Docker daemon socket',
        1
      );
      expect(result.category).toBe('permission');
    });

    it('classifies unauthorized registry access', () => {
      const result = classifyDockerError(
        'unauthorized: authentication required',
        1
      );
      expect(result.category).toBe('permission');
    });
  });

  describe('not_found errors', () => {
    it('classifies "no such container"', () => {
      const result = classifyDockerError(
        'Error: No such container: my-container',
        1
      );
      expect(result.category).toBe('not_found');
    });

    it('classifies "image not found"', () => {
      const result = classifyDockerError(
        'Error response from daemon: manifest for myimage:latest not found',
        1
      );
      expect(result.category).toBe('not_found');
    });

    it('classifies "unable to find image"', () => {
      const result = classifyDockerError(
        'Unable to find image \'nginx:latest\' locally',
        1
      );
      expect(result.category).toBe('not_found');
    });
  });

  describe('network errors', () => {
    it('classifies connection timeout', () => {
      const result = classifyDockerError(
        'error pulling image: connection timed out',
        1
      );
      expect(result.category).toBe('network');
    });

    it('classifies dial tcp errors', () => {
      const result = classifyDockerError(
        'dial tcp 192.168.1.1:443: i/o timeout',
        1
      );
      expect(result.category).toBe('network');
    });

    it('classifies failed to resolve', () => {
      const result = classifyDockerError(
        'failed to resolve reference "invalid.registry/image"',
        1
      );
      expect(result.category).toBe('network');
    });
  });

  describe('resource errors', () => {
    it('classifies no space left', () => {
      const result = classifyDockerError('no space left on device', 1);
      expect(result.category).toBe('resource');
    });

    it('classifies out of memory', () => {
      const result = classifyDockerError('out of memory', 137);
      expect(result.category).toBe('resource');
      expect(result.exitCode).toBe(137);
    });
  });

  describe('config errors', () => {
    it('classifies yaml errors', () => {
      const result = classifyDockerError(
        'yaml: line 5: did not find expected key',
        1
      );
      expect(result.category).toBe('config');
    });

    it('classifies invalid compose config', () => {
      const result = classifyDockerError(
        'Invalid compose config: services.web.ports contains an invalid type',
        1
      );
      expect(result.category).toBe('config');
    });

    it('classifies unknown flag', () => {
      const result = classifyDockerError('unknown flag: --invalid', 1);
      expect(result.category).toBe('config');
    });
  });

  describe('unknown errors', () => {
    it('classifies unrecognized errors as unknown', () => {
      const result = classifyDockerError('something completely unexpected', 42);
      expect(result.category).toBe('unknown');
      expect(result.summary).toBe('something completely unexpected');
      expect(result.exitCode).toBe(42);
    });
  });

  describe('summary extraction', () => {
    it('extracts first meaningful line', () => {
      const result = classifyDockerError(
        'Error response from daemon: No such container: test\nmore details here',
        1
      );
      expect(result.summary).toBe('No such container: test');
    });

    it('truncates long summaries', () => {
      const longError = 'A'.repeat(150);
      const result = classifyDockerError(longError, 1);
      expect(result.summary.length).toBeLessThanOrEqual(100);
      expect(result.summary).toContain('...');
    });

    it('handles empty stderr', () => {
      const result = classifyDockerError('', 1);
      expect(result.summary).toBe('Unknown error');
    });
  });
});

describe('formatDockerError', () => {
  it('formats error with category and summary', () => {
    const error = {
      category: 'daemon' as DockerErrorCategory,
      summary: 'Docker daemon not running',
      exitCode: 1,
    };

    const formatted = formatDockerError(error);
    expect(formatted).toBe('[DAEMON] Docker daemon not running\nExit code: 1');
  });

  it('formats resource error', () => {
    const error = {
      category: 'resource' as DockerErrorCategory,
      summary: 'no space left on device',
      exitCode: 1,
    };

    const formatted = formatDockerError(error);
    expect(formatted).toBe('[RESOURCE] no space left on device\nExit code: 1');
  });
});
