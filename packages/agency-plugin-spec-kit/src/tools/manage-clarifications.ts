/**
 * manage_clarifications tool implementation for spec-kit
 *
 * Manages the clarifications.md file for a feature, supporting
 * read, append, and update_answer operations. Integrates with
 * Humancy plugin for human input when available.
 */

import { join } from 'node:path';
import type { AgencyTool, ToolResult, AgencyCoreAPI } from '@generacy-ai/agency';
import type { SpecKitConfig } from '../config.js';
import {
  ClarificationStatus,
  type ClarificationQuestion,
  type ClarificationBatch,
  type ClarificationQuestionInput,
  type ReadClarificationsOutput,
  type AppendClarificationsOutput,
  type UpdateAnswerOutput,
  type HumancyRequestStatus,
} from '../types/clarification.js';
import { createError } from '../types/errors.js';
import { FEATURE_NAME_PATTERN } from '../types/patterns.js';
import {
  exists,
  readFile,
  writeFile,
  mkdir,
  findRepoRoot,
  isGitRepo,
  getCurrentBranch,
  RepoNotFoundError,
} from '../utils/index.js';
import {
  parseClarificationsFile,
  formatBatch,
  generateBatchTimestamp,
  countQuestions,
  findQuestion,
  updateAnswerInContent,
  CLARIFICATIONS_FILE_HEADER,
} from '../utils/clarification-parser.js';

/**
 * Parameters for the manage_clarifications tool
 */
interface ManageClarificationsParams {
  /** Operation to perform */
  operation: 'read' | 'append' | 'update_answer';

  /** Feature directory path (auto-detected if not provided) */
  feature_dir?: string;

  /** Working directory (defaults to process.cwd()) */
  cwd?: string;

  /** Questions to append (for 'append' operation) */
  questions?: ClarificationQuestionInput[];

  /** Question number to update (for 'update_answer' operation) */
  question_number?: number;

  /** Answer text (for 'update_answer' operation) */
  answer?: string;
}

/**
 * Get feature name from current branch or environment.
 *
 * @param repoRoot - Repository root directory
 * @returns Feature name or null if not found
 */
async function getFeatureName(repoRoot: string): Promise<string | null> {
  // Check environment variable first
  const envFeature = process.env['SPECIFY_FEATURE'];
  if (envFeature && FEATURE_NAME_PATTERN.test(envFeature)) {
    return envFeature;
  }

  // Try to get from git branch
  if (await isGitRepo(repoRoot)) {
    const branch = await getCurrentBranch(repoRoot);
    if (branch && FEATURE_NAME_PATTERN.test(branch)) {
      return branch;
    }
  }

  return null;
}

/**
 * Extended core API with optional getTool method.
 *
 * Some deployments extend AgencyCoreAPI with tool access.
 */
interface ExtendedCoreAPI extends AgencyCoreAPI {
  getTool?(name: string): AgencyTool | undefined;
}

/**
 * Invoke Humancy tools for questions that have options or open-ended questions.
 *
 * @param coreAPI - Agency core API for tool invocation
 * @param questions - Questions to send to Humancy
 * @returns Array of request statuses
 */
async function invokeHumancyForQuestions(
  coreAPI: ExtendedCoreAPI,
  questions: ClarificationQuestion[]
): Promise<HumancyRequestStatus[]> {
  const results: HumancyRequestStatus[] = [];

  // Get Humancy tools (getTool is an optional extension)
  const getTool = coreAPI.getTool?.bind(coreAPI);
  const askQuestion = getTool?.('humancy.ask_question');
  const requestDecision = getTool?.('humancy.request_decision');

  // If Humancy is not available, return status indicating not sent
  if (!askQuestion && !requestDecision) {
    return questions.map((q) => ({
      question_number: q.number,
      sent: false,
      type: q.options?.length ? 'request_decision' : 'ask_question',
      error: 'Humancy plugin not available',
    }));
  }

  for (const question of questions) {
    try {
      if (question.options && question.options.length > 0 && requestDecision) {
        // Use request_decision for multiple choice
        await requestDecision.execute({
          question: question.question,
          context: question.context,
          options: question.options.map((opt) => ({
            id: opt.label,
            label: opt.description,
          })),
        });
        results.push({
          question_number: question.number,
          sent: true,
          type: 'request_decision',
        });
      } else if (askQuestion) {
        // Use ask_question for open-ended
        await askQuestion.execute({
          question: question.question,
          context: question.context,
        });
        results.push({
          question_number: question.number,
          sent: true,
          type: 'ask_question',
        });
      } else {
        results.push({
          question_number: question.number,
          sent: false,
          type: question.options?.length ? 'request_decision' : 'ask_question',
          error: 'Required Humancy tool not available',
        });
      }
    } catch (error) {
      results.push({
        question_number: question.number,
        sent: false,
        type: question.options?.length ? 'request_decision' : 'ask_question',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return results;
}

/**
 * Handle the read operation.
 *
 * Parses clarifications.md and returns structured data.
 *
 * @param clarificationsPath - Path to clarifications.md
 * @returns Read operation result
 */
async function handleReadOperation(clarificationsPath: string): Promise<ReadClarificationsOutput> {
  const fileExists = await exists(clarificationsPath);

  if (!fileExists) {
    return {
      success: true,
      exists: false,
      batches: [],
      pending_count: 0,
      total_count: 0,
    };
  }

  const content = await readFile(clarificationsPath);
  const parsed = parseClarificationsFile(content);
  const counts = countQuestions(parsed.batches);

  return {
    success: true,
    exists: true,
    batches: parsed.batches,
    pending_count: counts.pending_count,
    total_count: counts.total_count,
  };
}

/**
 * Handle the append operation.
 *
 * Adds new questions to clarifications.md and optionally invokes Humancy.
 *
 * @param clarificationsPath - Path to clarifications.md
 * @param featureDir - Feature directory path
 * @param questions - Questions to append
 * @param coreAPI - Agency core API for Humancy integration
 * @returns Append operation result
 */
async function handleAppendOperation(
  clarificationsPath: string,
  featureDir: string,
  questions: ClarificationQuestionInput[],
  coreAPI: AgencyCoreAPI
): Promise<AppendClarificationsOutput> {
  // Ensure feature directory exists
  await mkdir(featureDir);

  // Read existing or create new
  let existingContent = '';
  let nextQuestionNumber = 1;
  let nextBatchNumber = 1;

  if (await exists(clarificationsPath)) {
    existingContent = await readFile(clarificationsPath);
    const parsed = parseClarificationsFile(existingContent);
    nextQuestionNumber = parsed.nextQuestionNumber;
    nextBatchNumber = parsed.nextBatchNumber;
  } else {
    existingContent = CLARIFICATIONS_FILE_HEADER;
  }

  // Create new questions with numbers and status
  const newQuestions: ClarificationQuestion[] = questions.map((q, i) => ({
    number: nextQuestionNumber + i,
    topic: q.topic,
    context: q.context,
    question: q.question,
    options: q.options,
    answer: null,
    status: ClarificationStatus.PENDING,
  }));

  // Create new batch
  const newBatch: ClarificationBatch = {
    number: nextBatchNumber,
    timestamp: generateBatchTimestamp(),
    questions: newQuestions,
  };

  // Append to file
  const batchMd = formatBatch(newBatch);
  const newContent = existingContent.endsWith('\n\n')
    ? existingContent + batchMd
    : existingContent.endsWith('\n')
      ? existingContent + '\n' + batchMd
      : existingContent + '\n\n' + batchMd;

  await writeFile(clarificationsPath, newContent);

  // Invoke Humancy for questions
  const humancyRequests = await invokeHumancyForQuestions(coreAPI, newQuestions);

  return {
    success: true,
    batch_number: newBatch.number,
    questions_added: newQuestions.length,
    first_question_number: newQuestions[0]?.number ?? nextQuestionNumber,
    humancy_requests: humancyRequests,
  };
}

/**
 * Handle the update_answer operation.
 *
 * Updates the answer for a specific question.
 *
 * @param clarificationsPath - Path to clarifications.md
 * @param questionNumber - Question number to update
 * @param answer - New answer text
 * @returns Update operation result
 */
async function handleUpdateAnswerOperation(
  clarificationsPath: string,
  questionNumber: number,
  answer: string
): Promise<UpdateAnswerOutput> {
  if (!(await exists(clarificationsPath))) {
    return {
      success: false,
      question_number: questionNumber,
      previous_answer: null,
      status: ClarificationStatus.PENDING,
      error: 'clarifications.md does not exist',
    };
  }

  const content = await readFile(clarificationsPath);
  const parsed = parseClarificationsFile(content);

  // Find the question
  const foundQuestion = findQuestion(parsed.batches, questionNumber);

  if (!foundQuestion) {
    return {
      success: false,
      question_number: questionNumber,
      previous_answer: null,
      status: ClarificationStatus.PENDING,
      error: `Question ${questionNumber} not found`,
    };
  }

  const previousAnswer = foundQuestion.answer;

  // Update the answer in file content
  const newContent = updateAnswerInContent(content, questionNumber, answer);

  await writeFile(clarificationsPath, newContent);

  return {
    success: true,
    question_number: questionNumber,
    previous_answer: previousAnswer,
    status: ClarificationStatus.ANSWERED,
  };
}

/**
 * Create the spec_kit.manage_clarifications tool.
 *
 * This tool manages the clarifications.md file for a feature,
 * supporting read, append, and update_answer operations.
 *
 * @param config - Plugin configuration
 * @param coreAPI - Agency core API for Humancy integration
 * @returns AgencyTool instance
 */
export function createManageClarificationsTool(
  config: SpecKitConfig,
  coreAPI: AgencyCoreAPI
): AgencyTool {
  return {
    name: 'spec_kit.manage_clarifications',
    description:
      'Manage clarifications.md file - read, append questions, or update answers',
    namespace: 'spec_kit',
    outputPattern: 'terse',
    modes: ['coding', 'research'],
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          enum: ['read', 'append', 'update_answer'],
          description: 'Operation to perform',
        },
        feature_dir: {
          type: 'string',
          description:
            'Feature directory path. If not provided, auto-detected from branch.',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (defaults to process.cwd())',
        },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description: 'Short topic identifier',
              },
              context: {
                type: 'string',
                description: 'Why this question matters',
              },
              question: {
                type: 'string',
                description: 'The specific question',
              },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: {
                      type: 'string',
                      description: 'Option label (A, B, C, etc.)',
                    },
                    description: {
                      type: 'string',
                      description: 'Option description',
                    },
                  },
                  required: ['label', 'description'],
                },
                description: 'Optional list of choices',
              },
            },
            required: ['topic', 'context', 'question'],
          },
          description: "Questions to append (for 'append' operation)",
        },
        question_number: {
          type: 'number',
          description: "Question number to update (for 'update_answer' operation)",
        },
        answer: {
          type: 'string',
          description: "Answer text (for 'update_answer' operation)",
        },
      },
      required: ['operation'],
    },
    async execute(params: unknown): Promise<ToolResult> {
      const {
        operation,
        feature_dir,
        cwd,
        questions,
        question_number,
        answer,
      } = (params || {}) as ManageClarificationsParams;
      const workDir = cwd || process.cwd();

      // Find repo root
      let repoRoot: string;
      try {
        repoRoot = await findRepoRoot(workDir);
      } catch (error) {
        if (error instanceof RepoNotFoundError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: createError(
                    'FEATURE_DIR_NOT_FOUND',
                    'Could not find repository root'
                  ),
                }),
              },
            ],
          };
        }
        throw error;
      }

      // Determine feature directory
      let featureDir = feature_dir;
      if (!featureDir) {
        const featureName = await getFeatureName(repoRoot);
        if (!featureName) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: createError(
                    'INVALID_BRANCH_NAME',
                    'Could not determine feature name. Use a feature branch or provide feature_dir.'
                  ),
                }),
              },
            ],
          };
        }
        const specsDir = join(repoRoot, config.paths.specs);
        featureDir = join(specsDir, featureName);
      }

      const clarificationsPath = join(featureDir, 'clarifications.md');

      // Handle operations
      switch (operation) {
        case 'read': {
          const result = await handleReadOperation(clarificationsPath);
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }

        case 'append': {
          if (!questions || questions.length === 0) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: createError(
                      'CLARIFICATION_APPEND_FAILED',
                      'No questions provided for append operation'
                    ),
                  }),
                },
              ],
            };
          }

          const result = await handleAppendOperation(
            clarificationsPath,
            featureDir,
            questions,
            coreAPI
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }

        case 'update_answer': {
          if (question_number === undefined) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: createError(
                      'CLARIFICATION_UPDATE_FAILED',
                      'question_number is required for update_answer operation'
                    ),
                  }),
                },
              ],
            };
          }

          if (answer === undefined) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: false,
                    error: createError(
                      'CLARIFICATION_UPDATE_FAILED',
                      'answer is required for update_answer operation'
                    ),
                  }),
                },
              ],
            };
          }

          const result = await handleUpdateAnswerOperation(
            clarificationsPath,
            question_number,
            answer
          );
          return {
            content: [{ type: 'text', text: JSON.stringify(result) }],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: createError(
                    'CLARIFICATION_INVALID_OPERATION',
                    `Unknown operation: ${operation}`
                  ),
                }),
              },
            ],
          };
      }
    },
  };
}
