/**
 * Deploy Tool Tests
 *
 * Tests for the Firebase deploy tool including default targets,
 * specific targets, project overrides, and error scenarios.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createDeployTool, type DeployParams } from '../tools/deploy.js';
import type { FirebasePluginConfig } from '../config/types.js';
import { generateDeployOutput, MOCK_ERRORS } from './mocks/firebase-cli.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

// Import the mocked module
import { execSync } from 'node:child_process';

const mockedExecSync = vi.mocked(execSync);

describe('createDeployTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('tool configuration', () => {
    it('should have correct tool name and metadata', () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      expect(tool.name).toBe('run.firebase_deploy');
      expect(tool.description).toBe('Deploy to Firebase');
      expect(tool.namespace).toBe('run');
      expect(tool.outputPattern).toBe('terse');
      expect(tool.modes).toContain('debug');
    });

    it('should have correct input schema', () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      expect(tool.inputSchema.type).toBe('object');
      expect(tool.inputSchema.properties).toHaveProperty('only');
      expect(tool.inputSchema.properties).toHaveProperty('project');
      expect(tool.inputSchema.properties).toHaveProperty('message');
    });
  });

  describe('deploy with default targets', () => {
    it('should deploy with default targets when no targets specified', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['functions']));

      const result = await tool.execute({});

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only functions',
        expect.objectContaining({
          stdio: 'pipe',
          encoding: 'utf-8',
        })
      );
      expect(result.isError).toBe(false);
      expect(result.content[0]).toEqual({
        type: 'text',
        text: 'Deploy complete.',
      });
    });

    it('should use config deploy targets when available', async () => {
      const config: FirebasePluginConfig = {
        cleanup: 'session',
        deploy: {
          targets: ['hosting', 'firestore'],
        },
      };
      const tool = createDeployTool(config);

      mockedExecSync.mockReturnValueOnce(
        generateDeployOutput(['hosting', 'firestore'])
      );

      const result = await tool.execute({});

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only hosting,firestore',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });
  });

  describe('deploy with specific targets (--only)', () => {
    it('should deploy with single target override', async () => {
      const config: FirebasePluginConfig = {
        cleanup: 'session',
        deploy: { targets: ['functions'] },
      };
      const tool = createDeployTool(config);

      const params: DeployParams = { only: ['hosting'] };

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['hosting']));

      const result = await tool.execute(params);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only hosting',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should deploy with multiple target overrides', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const params: DeployParams = { only: ['functions', 'firestore', 'rules'] };

      mockedExecSync.mockReturnValueOnce(
        generateDeployOutput(['functions', 'firestore', 'rules'])
      );

      const result = await tool.execute(params);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only functions,firestore,rules',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should override config targets with param targets', async () => {
      const config: FirebasePluginConfig = {
        cleanup: 'session',
        deploy: { targets: ['hosting', 'storage'] },
      };
      const tool = createDeployTool(config);

      const params: DeployParams = { only: ['database'] };

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['database']));

      const result = await tool.execute(params);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only database',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });
  });

  describe('deploy with project override', () => {
    it('should use project from config when no param provided', async () => {
      const config: FirebasePluginConfig = {
        cleanup: 'session',
        project: 'my-firebase-project',
      };
      const tool = createDeployTool(config);

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['functions']));

      const result = await tool.execute({});

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only functions --project my-firebase-project',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should use project from params when provided', async () => {
      const config: FirebasePluginConfig = {
        cleanup: 'session',
        project: 'default-project',
      };
      const tool = createDeployTool(config);

      const params: DeployParams = { project: 'override-project' };

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['functions']));

      const result = await tool.execute(params);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only functions --project override-project',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should deploy without project flag when no project specified', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['functions']));

      const result = await tool.execute({});

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only functions',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });
  });

  describe('deploy with message', () => {
    it('should include deploy message when provided', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const params: DeployParams = { message: 'Deploy v1.2.3' };

      mockedExecSync.mockReturnValueOnce(generateDeployOutput(['functions']));

      const result = await tool.execute(params);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only functions --message Deploy v1.2.3',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });

    it('should include all options together', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const params: DeployParams = {
        only: ['hosting', 'functions'],
        project: 'my-project',
        message: 'Production release',
      };

      mockedExecSync.mockReturnValueOnce(
        generateDeployOutput(['hosting', 'functions'])
      );

      const result = await tool.execute(params);

      expect(mockedExecSync).toHaveBeenCalledWith(
        'firebase deploy --only hosting,functions --project my-project --message Production release',
        expect.any(Object)
      );
      expect(result.isError).toBe(false);
    });
  });

  describe('error scenarios', () => {
    it('should handle project not found error', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const error = new Error('Command failed') as Error & { stderr: string };
      error.stderr = MOCK_ERRORS['projectNotFound']!.stderr;
      mockedExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const params: DeployParams = { project: 'unknown-project' };
      const result = await tool.execute(params);

      expect(result.isError).toBe(true);
      expect(result.content[0]).toHaveProperty('type', 'text');
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'Project "unknown-project" does not exist'
      );
    });

    it('should handle authentication failure', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const error = new Error('Command failed') as Error & { stderr: string };
      error.stderr = MOCK_ERRORS['notAuthenticated']!.stderr;
      mockedExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'Not authenticated'
      );
    });

    it('should handle firebase.json not found error', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const error = new Error('Command failed') as Error & { stderr: string };
      error.stderr = MOCK_ERRORS['configNotFound']!.stderr;
      mockedExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'firebase.json not found'
      );
    });

    it('should handle network error', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const error = new Error('Command failed') as Error & { stderr: string };
      error.stderr = MOCK_ERRORS['networkError']!.stderr;
      mockedExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'Network error'
      );
    });

    it('should use error message when stderr is not available', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const error = new Error('Generic error without stderr');
      mockedExecSync.mockImplementationOnce(() => {
        throw error;
      });

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'Generic error without stderr'
      );
    });

    it('should handle non-Error thrown values', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      mockedExecSync.mockImplementationOnce(() => {
        throw 'String error message';
      });

      const result = await tool.execute({});

      expect(result.isError).toBe(true);
      expect((result.content[0] as { type: 'text'; text: string }).text).toContain(
        'String error message'
      );
    });
  });

  describe('parameter validation', () => {
    it('should reject invalid deploy targets', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const params = { only: ['invalid-target'] };

      const result = await tool.execute(params);

      expect(result.isError).toBe(true);
      expect(mockedExecSync).not.toHaveBeenCalled();
    });

    it('should accept all valid deploy targets', async () => {
      const config: FirebasePluginConfig = { cleanup: 'session' };
      const tool = createDeployTool(config);

      const validTargets = [
        'functions',
        'rules',
        'hosting',
        'storage',
        'firestore',
        'database',
      ];

      for (const target of validTargets) {
        mockedExecSync.mockReturnValueOnce(
          generateDeployOutput([target as 'functions'])
        );

        const result = await tool.execute({ only: [target] });

        expect(result.isError).toBe(false);
      }
    });
  });
});
