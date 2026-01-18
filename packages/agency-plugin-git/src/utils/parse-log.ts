/**
 * Parse git log output
 */

import type { LogResult, CommitInfo } from '../types.js';

/**
 * Delimiter for log format fields (unlikely to appear in commit messages)
 */
const FIELD_DELIMITER = '\x1f'; // ASCII Unit Separator
const RECORD_DELIMITER = '\x1e'; // ASCII Record Separator

/**
 * Git log format string for structured parsing
 * Fields: hash, shortHash, authorName, authorEmail, date, parents, subject, body
 */
export const LOG_FORMAT = [
  '%H', // hash
  '%h', // shortHash
  '%an', // authorName
  '%ae', // authorEmail
  '%aI', // date (ISO 8601)
  '%P', // parents (space-separated)
  '%s', // subject
  '%b', // body
].join(FIELD_DELIMITER) + RECORD_DELIMITER;

/**
 * Parse git log output with custom format into LogResult
 *
 * @param output - Raw git log output using LOG_FORMAT
 * @param limit - The limit that was used (to determine hasMore)
 */
export function parseLog(output: string, limit: number = 10): LogResult {
  const records = output.split(RECORD_DELIMITER).filter(Boolean);

  const commits: CommitInfo[] = [];

  for (const record of records) {
    const fields = record.trim().split(FIELD_DELIMITER);
    if (fields.length < 6) continue;

    const [hash, shortHash, authorName, authorEmail, date, parentsStr, subject, ...bodyParts] = fields;

    if (!hash || !shortHash) continue;

    const parents = parentsStr ? parentsStr.split(' ').filter(Boolean) : [];
    const body = bodyParts.join(FIELD_DELIMITER).trim() || undefined;

    commits.push({
      hash,
      shortHash,
      authorName: authorName ?? '',
      authorEmail: authorEmail ?? '',
      date: date ?? '',
      parents,
      subject: subject ?? '',
      body,
    });
  }

  return {
    commits,
    hasMore: commits.length >= limit,
  };
}

/**
 * Parse a simplified log format (one commit per line)
 * Format: <hash> <subject>
 */
export function parseSimpleLog(output: string): Array<{ hash: string; subject: string }> {
  const lines = output.split('\n').filter(Boolean);

  return lines.map((line) => {
    const spaceIndex = line.indexOf(' ');
    if (spaceIndex === -1) {
      return { hash: line, subject: '' };
    }
    return {
      hash: line.slice(0, spaceIndex),
      subject: line.slice(spaceIndex + 1),
    };
  });
}

/**
 * Format commit info for display
 */
export function formatCommit(commit: CommitInfo): string {
  return `${commit.shortHash} ${commit.subject}`;
}

/**
 * Format log result as a simple list
 */
export function formatLogList(result: LogResult): string {
  const lines = result.commits.map(formatCommit);
  if (result.hasMore) {
    lines.push('...');
  }
  return lines.join('\n');
}
