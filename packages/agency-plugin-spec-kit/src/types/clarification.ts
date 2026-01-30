/**
 * Clarification-related type definitions for spec-kit
 *
 * These types represent the clarification workflow, where questions
 * are generated during specification review and answers are collected
 * from stakeholders.
 */

/**
 * Option for a clarification question.
 *
 * Represents a labeled choice (A, B, C, etc.) for multiple-choice questions.
 *
 * @example
 * ```typescript
 * const option: ClarificationOption = {
 *   label: 'A',
 *   description: 'Use OAuth 2.0 with JWT tokens',
 * };
 * ```
 */
export interface ClarificationOption {
  /** Option label (A, B, C) */
  label: string;

  /** Description */
  description: string;
}

/**
 * A clarification question with answer status.
 *
 * Represents a question that needs to be answered to clarify
 * requirements or implementation decisions.
 *
 * @example
 * ```typescript
 * const question: ClarificationQuestion = {
 *   number: 1,
 *   topic: 'Authentication',
 *   context: 'Need to decide on authentication method for API',
 *   question: 'Which authentication method should we use?',
 *   options: [
 *     { label: 'A', description: 'OAuth 2.0' },
 *     { label: 'B', description: 'API Keys' },
 *   ],
 *   answer: null, // Pending
 * };
 * ```
 */
export interface ClarificationQuestion {
  /** Sequential question number */
  number: number;

  /** Short topic identifier */
  topic: string;

  /** Why this question matters */
  context: string;

  /** The specific question */
  question: string;

  /** Optional A/B/C options */
  options?: ClarificationOption[];

  /** Answer or null if pending */
  answer: string | null;
}

/**
 * A batch of clarification questions added together.
 *
 * Questions are grouped into batches when they are generated
 * at the same time during specification review.
 *
 * @example
 * ```typescript
 * const batch: ClarificationBatch = {
 *   number: 1,
 *   timestamp: '2024-01-15T10:30:00Z',
 *   questions: [question1, question2],
 * };
 * ```
 */
export interface ClarificationBatch {
  /** Batch number */
  number: number;

  /** ISO timestamp when batch was created */
  timestamp: string;

  /** Questions in batch */
  questions: ClarificationQuestion[];
}

/**
 * Complete model for a clarifications file.
 *
 * Represents the full content of a clarifications.md file,
 * including all batches and their questions.
 *
 * @example
 * ```typescript
 * const file: ClarificationsFile = {
 *   featureName: '042-user-auth',
 *   batches: [batch1, batch2],
 *   totalQuestions: 5,
 *   answeredQuestions: 3,
 *   pendingQuestions: 2,
 * };
 * ```
 */
export interface ClarificationsFile {
  /** Feature name this file belongs to */
  featureName: string;

  /** All question batches */
  batches: ClarificationBatch[];

  /** Total number of questions across all batches */
  totalQuestions: number;

  /** Number of questions with answers */
  answeredQuestions: number;

  /** Number of questions without answers */
  pendingQuestions: number;
}

/**
 * Result of appending new clarification questions.
 *
 * Returned after adding new questions to a clarifications file.
 *
 * @example
 * ```typescript
 * const result: ClarificationAppendResult = {
 *   success: true,
 *   batchNumber: 2,
 *   questionsAdded: 3,
 *   firstQuestionNumber: 4,
 * };
 * ```
 */
export interface ClarificationAppendResult {
  /** Whether the append succeeded */
  success: boolean;

  /** Batch number assigned to the new questions */
  batchNumber: number;

  /** Number of questions added */
  questionsAdded: number;

  /** First question number in the new batch */
  firstQuestionNumber: number;

  /** Error message if success is false */
  error?: string;
}

/**
 * Input for creating a new clarification question.
 *
 * Used when adding new questions to a clarifications file.
 *
 * @example
 * ```typescript
 * const input: ClarificationQuestionInput = {
 *   topic: 'Database',
 *   context: 'Need to decide on database for user data',
 *   question: 'Should we use PostgreSQL or MongoDB?',
 *   options: [
 *     { label: 'A', description: 'PostgreSQL' },
 *     { label: 'B', description: 'MongoDB' },
 *   ],
 * };
 * ```
 */
export interface ClarificationQuestionInput {
  /** Short topic identifier */
  topic: string;

  /** Why this question matters */
  context: string;

  /** The specific question */
  question: string;

  /** Optional A/B/C options */
  options?: ClarificationOption[];
}
