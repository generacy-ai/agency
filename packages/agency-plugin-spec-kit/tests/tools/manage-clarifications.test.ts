/**
 * Tests for manage_clarifications tool
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createManageClarificationsTool } from '../../src/tools/manage-clarifications.js';
import { parseConfig } from '../../src/config.js';
import { ClarificationStatus } from '../../src/types/clarification.js';
import type { AgencyCoreAPI } from '@generacy-ai/agency';

describe('manage_clarifications tool', () => {
  let testDir: string;
  let mockCoreAPI: AgencyCoreAPI;

  const createMockCoreAPI = (): AgencyCoreAPI => ({
    registerTool: vi.fn(),
    unregisterTool: vi.fn(),
    getCurrentMode: vi.fn(() => 'coding'),
    registerMode: vi.fn(),
    onModeChange: vi.fn(() => () => {}),
    registerChannel: vi.fn(),
    sendMessage: vi.fn(),
    onMessage: vi.fn(() => () => {}),
    getConfig: vi.fn(() => undefined),
    recordEvent: vi.fn(),
    getPluginId: vi.fn(() => '@generacy-ai/agency-plugin-spec-kit'),
    getTool: vi.fn(() => undefined),
  });

  beforeEach(async () => {
    testDir = await fs.mkdtemp(join(tmpdir(), 'speckit-clarifications-test-'));
    mockCoreAPI = createMockCoreAPI();
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    delete process.env['SPECIFY_FEATURE'];
  });

  describe('tool metadata', () => {
    it('should have correct name', () => {
      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      expect(tool.name).toBe('spec_kit.manage_clarifications');
    });

    it('should have correct namespace', () => {
      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      expect(tool.namespace).toBe('spec_kit');
    });

    it('should have terse output pattern', () => {
      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      expect(tool.outputPattern).toBe('terse');
    });

    it('should support coding and research modes', () => {
      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      expect(tool.modes).toContain('coding');
      expect(tool.modes).toContain('research');
    });
  });

  describe('read operation', () => {
    it('should return exists=false when clarifications.md does not exist', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.exists).toBe(false);
      expect(response.batches).toEqual([]);
      expect(response.pending_count).toBe(0);
      expect(response.total_count).toBe(0);
    });

    it('should parse clarifications.md with one batch and one question', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const clarificationsContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?
**Options**:
- A: OAuth 2.0
- B: API Keys

**Answer**: *Pending*
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        clarificationsContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.exists).toBe(true);
      expect(response.batches).toHaveLength(1);
      expect(response.batches[0].number).toBe(1);
      expect(response.batches[0].questions).toHaveLength(1);
      expect(response.batches[0].questions[0].topic).toBe('Authentication');
      expect(response.batches[0].questions[0].answer).toBeNull();
      expect(response.batches[0].questions[0].status).toBe(ClarificationStatus.PENDING);
      expect(response.pending_count).toBe(1);
      expect(response.total_count).toBe(1);
    });

    it('should parse clarifications.md with answered questions', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const clarificationsContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?

**Answer**: Use OAuth 2.0 with JWT tokens
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        clarificationsContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.batches[0].questions[0].answer).toBe('Use OAuth 2.0 with JWT tokens');
      expect(response.batches[0].questions[0].status).toBe(ClarificationStatus.ANSWERED);
      expect(response.pending_count).toBe(0);
      expect(response.total_count).toBe(1);
    });

    it('should parse multiple batches with mixed status', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const clarificationsContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?

**Answer**: Use OAuth 2.0

## Batch 2 - 2024-01-16 14:00

### Q2: Database
**Context**: Need to decide on database
**Question**: Which database should we use?

**Answer**: *Pending*

### Q3: Caching
**Context**: Need to decide on caching strategy
**Question**: Should we use Redis?

**Answer**: Yes, use Redis
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        clarificationsContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.batches).toHaveLength(2);
      expect(response.pending_count).toBe(1);
      expect(response.total_count).toBe(3);
    });
  });

  describe('append operation', () => {
    it('should create clarifications.md if it does not exist', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [
          {
            topic: 'Authentication',
            context: 'Need to decide on auth method',
            question: 'Which auth method?',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.batch_number).toBe(1);
      expect(response.questions_added).toBe(1);
      expect(response.first_question_number).toBe(1);

      // Verify file was created
      const content = await fs.readFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        'utf-8'
      );
      expect(content).toContain('# Clarifications');
      expect(content).toContain('## Batch 1');
      expect(content).toContain('### Q1: Authentication');
    });

    it('should append to existing clarifications.md', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const existingContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?

**Answer**: Use OAuth 2.0
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        existingContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [
          {
            topic: 'Database',
            context: 'Need to decide on database',
            question: 'Which database?',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.batch_number).toBe(2);
      expect(response.questions_added).toBe(1);
      expect(response.first_question_number).toBe(2);

      // Verify file was updated
      const content = await fs.readFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        'utf-8'
      );
      expect(content).toContain('## Batch 1');
      expect(content).toContain('## Batch 2');
      expect(content).toContain('### Q2: Database');
    });

    it('should append questions with options', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [
          {
            topic: 'Authentication',
            context: 'Need to decide on auth method',
            question: 'Which auth method?',
            options: [
              { label: 'A', description: 'OAuth 2.0' },
              { label: 'B', description: 'API Keys' },
            ],
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);

      // Verify options were written
      const content = await fs.readFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        'utf-8'
      );
      expect(content).toContain('**Options**:');
      expect(content).toContain('- A: OAuth 2.0');
      expect(content).toContain('- B: API Keys');
    });

    it('should return error when no questions provided', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('CLARIFICATION_APPEND_FAILED');
    });

    it('should report Humancy not available status', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [
          {
            topic: 'Test',
            context: 'Test context',
            question: 'Test question?',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.humancy_requests).toHaveLength(1);
      expect(response.humancy_requests[0].sent).toBe(false);
      expect(response.humancy_requests[0].error).toContain('not available');
    });
  });

  describe('update_answer operation', () => {
    it('should update answer for pending question', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const existingContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?

**Answer**: *Pending*
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        existingContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'update_answer',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        question_number: 1,
        answer: 'Use OAuth 2.0 with JWT tokens',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.question_number).toBe(1);
      expect(response.previous_answer).toBeNull();
      expect(response.status).toBe(ClarificationStatus.ANSWERED);

      // Verify file was updated
      const content = await fs.readFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        'utf-8'
      );
      expect(content).toContain('**Answer**: Use OAuth 2.0 with JWT tokens');
      expect(content).not.toContain('*Pending*');
    });

    it('should update answer for already answered question', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const existingContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?

**Answer**: Use OAuth 2.0
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        existingContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'update_answer',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        question_number: 1,
        answer: 'Actually use API Keys',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.previous_answer).toBe('Use OAuth 2.0');
    });

    it('should return error when question not found', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const existingContent = `# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2024-01-15 10:30

### Q1: Authentication
**Context**: Need to decide on authentication method
**Question**: Which authentication method should we use?

**Answer**: *Pending*
`;
      await fs.writeFile(
        join(repoDir, 'specs', '001-my-feature', 'clarifications.md'),
        existingContent
      );

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'update_answer',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        question_number: 99,
        answer: 'Some answer',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should return error when clarifications.md does not exist', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'update_answer',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        question_number: 1,
        answer: 'Some answer',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error).toContain('does not exist');
    });

    it('should return error when question_number not provided', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'update_answer',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        answer: 'Some answer',
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('CLARIFICATION_UPDATE_FAILED');
    });

    it('should return error when answer not provided', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'update_answer',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        question_number: 1,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('CLARIFICATION_UPDATE_FAILED');
    });
  });

  describe('Humancy integration', () => {
    it('should call humancy.ask_question for questions without options', async () => {
      const mockAskQuestion = {
        name: 'humancy.ask_question',
        execute: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{}' }] }),
      };

      const mockCoreAPIWithHumancy = {
        ...createMockCoreAPI(),
        getTool: vi.fn((name: string) => {
          if (name === 'humancy.ask_question') return mockAskQuestion;
          return undefined;
        }),
      };

      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPIWithHumancy);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [
          {
            topic: 'Test',
            context: 'Test context',
            question: 'Test question?',
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.humancy_requests[0].sent).toBe(true);
      expect(response.humancy_requests[0].type).toBe('ask_question');
      expect(mockAskQuestion.execute).toHaveBeenCalledWith({
        question: 'Test question?',
        context: 'Test context',
      });
    });

    it('should call humancy.request_decision for questions with options', async () => {
      const mockRequestDecision = {
        name: 'humancy.request_decision',
        execute: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: '{}' }] }),
      };

      const mockCoreAPIWithHumancy = {
        ...createMockCoreAPI(),
        getTool: vi.fn((name: string) => {
          if (name === 'humancy.request_decision') return mockRequestDecision;
          return undefined;
        }),
      };

      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPIWithHumancy);

      const result = await tool.execute({
        operation: 'append',
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
        questions: [
          {
            topic: 'Test',
            context: 'Test context',
            question: 'Test question?',
            options: [
              { label: 'A', description: 'Option A' },
              { label: 'B', description: 'Option B' },
            ],
          },
        ],
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.humancy_requests[0].sent).toBe(true);
      expect(response.humancy_requests[0].type).toBe('request_decision');
      expect(mockRequestDecision.execute).toHaveBeenCalledWith({
        question: 'Test question?',
        context: 'Test context',
        options: [
          { id: 'A', label: 'Option A' },
          { id: 'B', label: 'Option B' },
        ],
      });
    });
  });

  describe('edge cases', () => {
    it('should return error for invalid operation', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '001-my-feature'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'invalid' as any,
        feature_dir: join(repoDir, 'specs', '001-my-feature'),
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('CLARIFICATION_INVALID_OPERATION');
    });

    it('should return error when repo root not found', async () => {
      const orphanDir = join(testDir, 'orphan');
      await fs.mkdir(orphanDir);

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        cwd: orphanDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('FEATURE_DIR_NOT_FOUND');
    });

    it('should return error when feature name cannot be determined', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_BRANCH_NAME');
    });

    it('should use SPECIFY_FEATURE env var when feature_dir not specified', async () => {
      const repoDir = join(testDir, 'repo');
      await fs.mkdir(repoDir);
      await fs.mkdir(join(repoDir, '.git'));
      await fs.mkdir(join(repoDir, 'specs'));
      await fs.mkdir(join(repoDir, 'specs', '002-env-feature'));

      process.env['SPECIFY_FEATURE'] = '002-env-feature';

      const config = parseConfig();
      const tool = createManageClarificationsTool(config, mockCoreAPI);

      const result = await tool.execute({
        operation: 'read',
        cwd: repoDir,
      });

      const response = JSON.parse(result.content[0].text);
      expect(response.success).toBe(true);
      expect(response.exists).toBe(false);
    });
  });
});
