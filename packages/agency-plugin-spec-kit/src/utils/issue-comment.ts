/**
 * Utilities for formatting clarification comments as GitHub issue comments
 * and parsing answers from comments.
 */

import type { ClarificationQuestion, ParsedAnswer } from '../types/clarification.js';

/**
 * Input comment shape for parsing answers.
 * Defined locally to avoid importing from external packages.
 */
export interface CommentInput {
  id: string;
  body: string;
  author: string;
  createdAt: Date;
}

/**
 * Prefix used in HTML markers to identify clarification comments.
 */
export const CLARIFICATION_MARKER_PREFIX = 'generacy-clarification';

/**
 * Build an HTML comment marker for a clarification batch.
 *
 * @param batchNumber - The batch number to encode in the marker
 * @returns An HTML comment string like `<!-- generacy-clarification:batch-1 -->`
 */
export function buildClarificationMarker(batchNumber: number): string {
  return `<!-- ${CLARIFICATION_MARKER_PREFIX}:batch-${batchNumber} -->`;
}

/**
 * Parse a batch number from text containing a clarification marker.
 *
 * @param text - The text to search for a marker
 * @returns The batch number if found, or null
 */
export function parseClarificationMarker(text: string): number | null {
  const match = text.match(
    new RegExp(`${CLARIFICATION_MARKER_PREFIX}:batch-(\\d+)`)
  );
  if (!match?.[1]) return null;
  return parseInt(match[1], 10);
}

/**
 * Format clarification questions as a full GitHub issue comment body.
 *
 * @param batchNumber - The batch number for this set of questions
 * @param questions - The clarification questions to format
 * @returns A formatted markdown string suitable for posting as a GitHub comment
 */
export function formatClarificationComment(
  batchNumber: number,
  questions: ClarificationQuestion[]
): string {
  const lines: string[] = [];

  // HTML marker as first line
  lines.push(buildClarificationMarker(batchNumber));
  lines.push('');

  // Heading
  lines.push(`## 🔍 Clarification Questions (Batch ${batchNumber})`);
  lines.push('');

  // Intro paragraph
  lines.push(
    'The following questions need to be answered before we can proceed:'
  );
  lines.push('');

  // Each question
  for (const q of questions) {
    lines.push(`### Q${q.number}: ${q.topic}`);
    lines.push('');
    lines.push(`**Context**: ${q.context}`);
    lines.push('');
    lines.push(`**Question**: ${q.question}`);
    lines.push('');

    if (q.options && q.options.length > 0) {
      lines.push('**Options**:');
      for (const opt of q.options) {
        lines.push(`- ${opt.label}: ${opt.description}`);
      }
      lines.push('');
    }
  }

  // Separator
  lines.push('---');
  lines.push('');

  // Instructions block
  lines.push(
    '**How to answer**: Reply to this issue with your answers using the format:'
  );
  lines.push('```');
  lines.push('Q1: [your answer]');
  lines.push('Q2: [your answer]');
  lines.push('```');
  lines.push('Then add the `completed:clarification` label.');

  return lines.join('\n');
}

/**
 * Parse answers from GitHub issue comments.
 *
 * Scans comment bodies for patterns like `Q1: answer text` and extracts
 * answers for the specified question numbers. Later answers for the same
 * question override earlier ones (last wins).
 *
 * @param comments - Array of comment objects to parse
 * @param questionNumbers - Question numbers to look for
 * @returns Array of parsed answers
 */
export function parseAnswersFromComments(
  comments: CommentInput[],
  questionNumbers: number[]
): ParsedAnswer[] {
  const answerMap = new Map<number, ParsedAnswer>();

  for (const comment of comments) {
    const regex =
      /(?:\*\*)?Q(\d+)(?:\*\*)?:\s*(.*?)(?=(?:\n(?:\*\*)?Q\d+(?:\*\*)?:)|$)/gs;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(comment.body)) !== null) {
      const numStr = match[1];
      const answerStr = match[2];
      if (!numStr || answerStr === undefined) continue;
      const questionNumber = parseInt(numStr, 10);
      const answer = answerStr.trim();

      if (questionNumbers.includes(questionNumber)) {
        answerMap.set(questionNumber, {
          question_number: questionNumber,
          answer,
          source: 'github',
          comment_id: comment.id,
        });
      }
    }
  }

  return Array.from(answerMap.values());
}
