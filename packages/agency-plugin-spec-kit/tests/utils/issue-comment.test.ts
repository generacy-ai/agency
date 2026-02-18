/**
 * Tests for issue-comment utilities
 */

import { describe, it, expect } from 'vitest';
import { ClarificationStatus } from '../../src/types/clarification.js';
import {
  buildClarificationMarker,
  parseClarificationMarker,
  formatClarificationComment,
  parseAnswersFromComments,
  type CommentInput,
} from '../../src/utils/issue-comment.js';

describe('issue-comment utilities', () => {
  describe('buildClarificationMarker', () => {
    it('should return correct marker for batch 1', () => {
      const result = buildClarificationMarker(1);
      expect(result).toBe('<!-- generacy-clarification:batch-1 -->');
    });

    it('should return correct marker for batch 5', () => {
      const result = buildClarificationMarker(5);
      expect(result).toBe('<!-- generacy-clarification:batch-5 -->');
    });
  });

  describe('parseClarificationMarker', () => {
    it('should parse batch number from a full marker string', () => {
      const marker = '<!-- generacy-clarification:batch-3 -->';
      expect(parseClarificationMarker(marker)).toBe(3);
    });

    it('should parse batch number from text containing a marker', () => {
      const text =
        '<!-- generacy-clarification:batch-2 -->\n\n## Clarification Questions';
      expect(parseClarificationMarker(text)).toBe(2);
    });

    it('should return null for text without a marker', () => {
      const text = 'This is just a regular comment with no marker.';
      expect(parseClarificationMarker(text)).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseClarificationMarker('')).toBeNull();
    });
  });

  describe('formatClarificationComment', () => {
    const baseQuestion = {
      number: 1,
      topic: 'Authentication',
      context: 'Need to decide on auth method',
      question: 'Which auth method should we use?',
      answer: null,
      status: ClarificationStatus.PENDING,
    };

    const questionWithOptions = {
      ...baseQuestion,
      number: 2,
      topic: 'Database',
      context: 'Need to choose a database',
      question: 'Which database should we use?',
      options: [
        { label: 'A', description: 'PostgreSQL' },
        { label: 'B', description: 'MongoDB' },
      ],
    };

    it('should contain the HTML marker as the first line', () => {
      const result = formatClarificationComment(1, [baseQuestion]);
      const firstLine = result.split('\n')[0];
      expect(firstLine).toBe('<!-- generacy-clarification:batch-1 -->');
    });

    it('should contain the heading with batch number', () => {
      const result = formatClarificationComment(3, [baseQuestion]);
      expect(result).toContain(
        '## 🔍 Clarification Questions (Batch 3)'
      );
    });

    it('should contain question topic, context, and question text', () => {
      const result = formatClarificationComment(1, [baseQuestion]);
      expect(result).toContain('### Q1: Authentication');
      expect(result).toContain('**Context**: Need to decide on auth method');
      expect(result).toContain(
        '**Question**: Which auth method should we use?'
      );
    });

    it('should contain options when provided', () => {
      const result = formatClarificationComment(1, [questionWithOptions]);
      expect(result).toContain('**Options**:');
      expect(result).toContain('- A: PostgreSQL');
      expect(result).toContain('- B: MongoDB');
    });

    it('should not contain options section when not provided', () => {
      const result = formatClarificationComment(1, [baseQuestion]);
      expect(result).not.toContain('**Options**:');
    });

    it('should contain the answer instructions at the end', () => {
      const result = formatClarificationComment(1, [baseQuestion]);
      expect(result).toContain(
        '**How to answer**: Reply to this issue with your answers using the format:'
      );
      expect(result).toContain('Q1: [your answer]');
      expect(result).toContain(
        'Then add the `completed:clarification` label.'
      );
    });

    it('should contain the separator', () => {
      const result = formatClarificationComment(1, [baseQuestion]);
      expect(result).toContain('\n---\n');
    });
  });

  describe('parseAnswersFromComments', () => {
    function makeComment(
      body: string,
      id = '123',
      author = 'user1'
    ): CommentInput {
      return { id, body, author, createdAt: new Date() };
    }

    it('should parse a single Q1 answer from one comment', () => {
      const comments = [makeComment('Q1: Use OAuth')];
      const results = parseAnswersFromComments(comments, [1]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        question_number: 1,
        answer: 'Use OAuth',
        source: 'github',
        comment_id: '123',
      });
    });

    it('should parse multiple answers from one comment', () => {
      const comments = [makeComment('Q1: Use OAuth\nQ2: PostgreSQL')];
      const results = parseAnswersFromComments(comments, [1, 2]);

      expect(results).toHaveLength(2);
      expect(results.find((a) => a.question_number === 1)?.answer).toBe(
        'Use OAuth'
      );
      expect(results.find((a) => a.question_number === 2)?.answer).toBe(
        'PostgreSQL'
      );
    });

    it('should return empty array when no matching questions found', () => {
      const comments = [makeComment('Q5: Some answer')];
      const results = parseAnswersFromComments(comments, [1, 2]);

      expect(results).toEqual([]);
    });

    it('should let later answers override earlier ones (last wins)', () => {
      const comments = [
        makeComment('Q1: First answer', '100', 'user1'),
        makeComment('Q1: Second answer', '200', 'user2'),
      ];
      const results = parseAnswersFromComments(comments, [1]);

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        question_number: 1,
        answer: 'Second answer',
        source: 'github',
        comment_id: '200',
      });
    });

    it('should handle bold formatting: **Q1**: answer', () => {
      const comments = [makeComment('**Q1**: Use OAuth')];
      const results = parseAnswersFromComments(comments, [1]);

      expect(results).toHaveLength(1);
      expect(results[0]?.answer).toBe('Use OAuth');
    });

    it('should handle no space after colon: Q1:answer', () => {
      const comments = [makeComment('Q1:answer text')];
      const results = parseAnswersFromComments(comments, [1]);

      expect(results).toHaveLength(1);
      expect(results[0]?.answer).toBe('answer text');
    });

    it('should only return answers for requested question numbers', () => {
      const comments = [makeComment('Q1: Answer one\nQ2: Answer two\nQ3: Answer three')];
      const results = parseAnswersFromComments(comments, [1, 3]);

      expect(results).toHaveLength(2);
      const numbers = results.map((r) => r.question_number);
      expect(numbers).toContain(1);
      expect(numbers).toContain(3);
      expect(numbers).not.toContain(2);
    });

    it('should handle multi-line answers (text between Q1: and Q2:)', () => {
      const comments = [
        makeComment('Q1: First line\nsome more detail\nQ2: Second answer'),
      ];
      const results = parseAnswersFromComments(comments, [1, 2]);

      expect(results).toHaveLength(2);
      const q1 = results.find((a) => a.question_number === 1);
      expect(q1?.answer).toContain('First line');
      expect(results.find((a) => a.question_number === 2)?.answer).toBe(
        'Second answer'
      );
    });
  });
});
