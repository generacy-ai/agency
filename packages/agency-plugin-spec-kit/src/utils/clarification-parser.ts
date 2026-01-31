/**
 * Clarification file parser utility
 *
 * Provides functions to parse and format clarifications.md files.
 */

import {
  ClarificationStatus,
  type ClarificationQuestion,
  type ClarificationBatch,
  type ClarificationOption,
} from '../types/clarification.js';

/**
 * Parsed clarifications file structure.
 *
 * Internal representation with tracking for next IDs.
 */
export interface ParsedClarificationsFile {
  /** All question batches */
  batches: ClarificationBatch[];

  /** Next question number to assign */
  nextQuestionNumber: number;

  /** Next batch number to assign */
  nextBatchNumber: number;
}

/**
 * File header template for clarifications.md
 */
export const CLARIFICATIONS_FILE_HEADER = `# Clarifications

Questions and answers to clarify the feature specification.

`;

/**
 * Parse clarifications.md file into structured data.
 *
 * Extracts batches, questions, options, and answers from the markdown format.
 *
 * @param content - Raw markdown content
 * @returns Parsed clarifications file structure
 *
 * @example
 * ```typescript
 * const content = fs.readFileSync('clarifications.md', 'utf-8');
 * const parsed = parseClarificationsFile(content);
 * console.log(`Found ${parsed.batches.length} batches`);
 * ```
 */
export function parseClarificationsFile(content: string): ParsedClarificationsFile {
  const batches: ClarificationBatch[] = [];
  let nextQuestionNumber = 1;
  let nextBatchNumber = 1;

  // Split by batch headers
  const batchRegex = /^## Batch (\d+) - (.+)$/gm;
  const questionRegex = /^### Q(\d+): (.+)$/gm;

  let match: RegExpExecArray | null;

  // Find all batches
  const batchMatches: Array<{ number: number; timestamp: string; startIndex: number }> = [];
  while ((match = batchRegex.exec(content)) !== null) {
    const num = match[1];
    const ts = match[2];
    if (num !== undefined && ts !== undefined) {
      batchMatches.push({
        number: parseInt(num, 10),
        timestamp: ts.trim(),
        startIndex: match.index,
      });
    }
  }

  // Parse each batch
  for (let i = 0; i < batchMatches.length; i++) {
    const batchMatch = batchMatches[i];
    if (!batchMatch) continue;

    const nextBatch = batchMatches[i + 1];
    const batchEndIndex = nextBatch ? nextBatch.startIndex : content.length;

    const batchContent = content.slice(batchMatch.startIndex, batchEndIndex);
    const questions: ClarificationQuestion[] = [];

    // Find all questions in this batch
    const questionMatches: Array<{ number: number; topic: string; startIndex: number }> = [];
    questionRegex.lastIndex = 0;
    while ((match = questionRegex.exec(batchContent)) !== null) {
      const qNum = match[1];
      const qTopic = match[2];
      if (qNum !== undefined && qTopic !== undefined) {
        questionMatches.push({
          number: parseInt(qNum, 10),
          topic: qTopic.trim(),
          startIndex: match.index,
        });
      }
    }

    // Parse each question
    for (let j = 0; j < questionMatches.length; j++) {
      const qMatch = questionMatches[j];
      if (!qMatch) continue;

      const nextQuestion = questionMatches[j + 1];
      const qEndIndex = nextQuestion ? nextQuestion.startIndex : batchContent.length;

      const qContent = batchContent.slice(qMatch.startIndex, qEndIndex);

      // Extract fields
      const contextMatch = qContent.match(/\*\*Context\*\*:\s*(.+?)(?=\n\*\*|\n###|$)/s);
      const questionMatch = qContent.match(/\*\*Question\*\*:\s*(.+?)(?=\n\*\*|\n###|$)/s);
      const answerMatch = qContent.match(/\*\*Answer\*\*:\s*(.+?)(?=\n###|$)/s);

      // Extract options if present
      const optionsMatch = qContent.match(/\*\*Options\*\*:\s*\n((?:- [A-Z]: .+\n?)+)/);
      const optionsText = optionsMatch?.[1];
      const options: ClarificationOption[] | undefined = optionsText
        ? optionsText
            .trim()
            .split('\n')
            .map((line) => {
              const parts = line.replace(/^- /, '').split(': ');
              const label = parts[0] ?? '';
              const descParts = parts.slice(1);
              return { label: label.trim(), description: descParts.join(': ').trim() };
            })
        : undefined;

      const answerText = answerMatch?.[1]?.trim() || '*Pending*';
      const isPending = answerText === '*Pending*';

      questions.push({
        number: qMatch.number,
        topic: qMatch.topic,
        context: contextMatch?.[1]?.trim() || '',
        question: questionMatch?.[1]?.trim() || '',
        options,
        answer: isPending ? null : answerText,
        status: isPending ? ClarificationStatus.PENDING : ClarificationStatus.ANSWERED,
      });

      if (qMatch.number >= nextQuestionNumber) {
        nextQuestionNumber = qMatch.number + 1;
      }
    }

    batches.push({
      number: batchMatch.number,
      timestamp: batchMatch.timestamp,
      questions,
    });

    if (batchMatch.number >= nextBatchNumber) {
      nextBatchNumber = batchMatch.number + 1;
    }
  }

  return { batches, nextQuestionNumber, nextBatchNumber };
}

/**
 * Format a single question as markdown.
 *
 * @param q - Question to format
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const question: ClarificationQuestion = { ... };
 * const md = formatQuestion(question);
 * ```
 */
export function formatQuestion(q: ClarificationQuestion): string {
  let md = `### Q${q.number}: ${q.topic}\n`;
  md += `**Context**: ${q.context}\n`;
  md += `**Question**: ${q.question}\n`;

  if (q.options && q.options.length > 0) {
    md += `**Options**:\n`;
    for (const opt of q.options) {
      md += `- ${opt.label}: ${opt.description}\n`;
    }
  }

  md += `\n**Answer**: ${q.answer ?? '*Pending*'}\n`;
  return md;
}

/**
 * Format a batch of questions as markdown.
 *
 * @param batch - Batch to format
 * @returns Formatted markdown string
 *
 * @example
 * ```typescript
 * const batch: ClarificationBatch = { ... };
 * const md = formatBatch(batch);
 * ```
 */
export function formatBatch(batch: ClarificationBatch): string {
  let md = `## Batch ${batch.number} - ${batch.timestamp}\n\n`;
  for (const q of batch.questions) {
    md += formatQuestion(q) + '\n';
  }
  return md;
}

/**
 * Generate a timestamp string for batch headers.
 *
 * @returns Formatted timestamp (e.g., "2024-01-15 10:30")
 *
 * @example
 * ```typescript
 * const timestamp = generateBatchTimestamp();
 * // "2024-01-15 10:30"
 * ```
 */
export function generateBatchTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * Count pending and total questions across all batches.
 *
 * @param batches - Array of batches to count
 * @returns Object with pending_count and total_count
 *
 * @example
 * ```typescript
 * const { pending_count, total_count } = countQuestions(parsed.batches);
 * ```
 */
export function countQuestions(batches: ClarificationBatch[]): {
  pending_count: number;
  total_count: number;
} {
  let pendingCount = 0;
  let totalCount = 0;

  for (const batch of batches) {
    for (const q of batch.questions) {
      totalCount++;
      if (q.answer === null || q.status === ClarificationStatus.PENDING) {
        pendingCount++;
      }
    }
  }

  return { pending_count: pendingCount, total_count: totalCount };
}

/**
 * Find a question by number across all batches.
 *
 * @param batches - Array of batches to search
 * @param questionNumber - Question number to find
 * @returns Question if found, null otherwise
 *
 * @example
 * ```typescript
 * const question = findQuestion(parsed.batches, 3);
 * if (question) {
 *   console.log(`Found: ${question.topic}`);
 * }
 * ```
 */
export function findQuestion(
  batches: ClarificationBatch[],
  questionNumber: number
): ClarificationQuestion | null {
  for (const batch of batches) {
    for (const q of batch.questions) {
      if (q.number === questionNumber) {
        return q;
      }
    }
  }
  return null;
}

/**
 * Update the answer for a question in the file content.
 *
 * Uses regex replacement to update the answer in-place.
 *
 * @param content - Original file content
 * @param questionNumber - Question number to update
 * @param answer - New answer text
 * @returns Updated file content
 *
 * @example
 * ```typescript
 * const newContent = updateAnswerInContent(content, 1, 'Use OAuth 2.0');
 * fs.writeFileSync('clarifications.md', newContent);
 * ```
 */
export function updateAnswerInContent(
  content: string,
  questionNumber: number,
  answer: string
): string {
  // Match the answer line for this specific question
  const questionHeaderRegex = new RegExp(
    `(### Q${questionNumber}:[^]*?\\*\\*Answer\\*\\*:\\s*)([^\\n]+|\\*Pending\\*)`,
    's'
  );

  return content.replace(questionHeaderRegex, `$1${answer}`);
}
