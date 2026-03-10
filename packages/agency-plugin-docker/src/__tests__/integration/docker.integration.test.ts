/**
 * Integration tests for Docker plugin
 *
 * These tests require Docker to be installed and running.
 * Skip them in CI environments without Docker support.
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execa } from 'execa';
import { dockerPlugin, dockerTools, dockerPluginManifest } from '../../index.js';

/**
 * Check if Docker is available and can run containers
 */
async function isDockerAvailable(): Promise<boolean> {
  try {
    await execa('docker', ['info'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if we can pull and run containers (requires more permissions)
 */
async function canRunContainers(): Promise<boolean> {
  try {
    // Try to run a minimal container
    const result = await execa('docker', ['run', '--rm', 'hello-world'], {
      timeout: 30000,
      reject: false,
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Skip test if Docker is not available
 */
function skipIfNoDocker(fn: () => void | Promise<void>) {
  return async () => {
    const available = await isDockerAvailable();
    if (!available) {
      console.log('Skipping: Docker not available');
      return;
    }
    return fn();
  };
}

/**
 * Skip test if containers cannot be run (permission issues)
 */
function skipIfCantRunContainers(fn: () => void | Promise<void>) {
  return async () => {
    const canRun = await canRunContainers();
    if (!canRun) {
      console.log('Skipping: Cannot run containers (permission or pull issue)');
      return;
    }
    return fn();
  };
}

describe('Docker Plugin Integration', () => {
  describe('Plugin structure', () => {
    it('exports all 8 tools', () => {
      expect(dockerTools).toHaveLength(8);

      const toolNames = dockerTools.map((t) => t.name);
      expect(toolNames).toContain('run.docker_compose_up');
      expect(toolNames).toContain('run.docker_compose_down');
      expect(toolNames).toContain('run.docker_compose_logs');
      expect(toolNames).toContain('run.docker_compose_ps');
      expect(toolNames).toContain('run.docker_build');
      expect(toolNames).toContain('run.docker_run');
      expect(toolNames).toContain('run.docker_stop');
      expect(toolNames).toContain('run.docker_exec');
    });

    it('has valid manifest', () => {
      expect(dockerPluginManifest.id).toBe('@generacy-ai/agency-plugin-docker');
      expect(dockerPluginManifest.tools).toHaveLength(8);
      expect(dockerPluginManifest.modes).toContain('debug');
      expect(dockerPluginManifest.modes).toContain('coding');
    });

    it('plugin has initialize and shutdown methods', () => {
      expect(typeof dockerPlugin.initialize).toBe('function');
      expect(typeof dockerPlugin.shutdown).toBe('function');
    });

    it('all tools have correct output pattern', () => {
      for (const tool of dockerTools) {
        expect(tool.outputPattern).toBe('terse');
      }
    });

    it('all tools have correct namespace', () => {
      for (const tool of dockerTools) {
        expect(tool.namespace).toBe('run');
      }
    });
  });

  describe('Docker availability', () => {
    it(
      'can detect Docker daemon',
      skipIfNoDocker(async () => {
        const available = await isDockerAvailable();
        expect(available).toBe(true);
      })
    );
  });

  describe('Docker commands (requires Docker)', () => {
    const testContainerName = 'docker-plugin-test-' + Date.now();

    afterAll(async () => {
      // Cleanup: stop and remove any test containers
      try {
        await execa('docker', ['rm', '-f', testContainerName], {
          reject: false,
        });
      } catch {
        // Ignore cleanup errors
      }
    });

    it(
      'can run and stop a container',
      skipIfCantRunContainers(async () => {
        const runTool = dockerTools.find((t) => t.name === 'run.docker_run')!;
        const stopTool = dockerTools.find((t) => t.name === 'run.docker_stop')!;

        // Run a container
        const runResult = await runTool.execute({
          image: 'alpine:latest',
          name: testContainerName,
          cmd: ['sleep', '10'],
        });

        // If this fails due to image pull, the test will be skipped by skipIfCantRunContainers
        expect(runResult.isError).toBeFalsy();
        expect(runResult.content[0]).toMatchObject({
          type: 'text',
        });

        // Stop the container
        const stopResult = await stopTool.execute({
          container: testContainerName,
          time: 1,
        });

        expect(stopResult.isError).toBeFalsy();
        expect((stopResult.content[0] as { text: string }).text).toBe(
          'Container stopped.'
        );
      }),
      30000
    );

    it(
      'handles non-existent container gracefully',
      skipIfNoDocker(async () => {
        const stopTool = dockerTools.find((t) => t.name === 'run.docker_stop')!;

        const result = await stopTool.execute({
          container: 'nonexistent-container-' + Date.now(),
        });

        expect(result.isError).toBe(true);
        const text = (result.content[0] as { text: string }).text;
        expect(text).toContain('[NOT_FOUND]');
      })
    );
  });
});
