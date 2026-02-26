/**
 * Parse git blame --porcelain output
 */

import type { BlameResult } from '../types.js';

/**
 * Parse git blame --porcelain output into BlameResult
 *
 * Porcelain format for each line:
 * <sha1> <orig-line> <final-line> [<num-lines>]
 * author <author-name>
 * author-mail <author-email>
 * author-time <timestamp>
 * author-tz <timezone>
 * committer <committer-name>
 * committer-mail <committer-email>
 * committer-time <timestamp>
 * committer-tz <timezone>
 * summary <commit-summary>
 * [previous <sha1> <filename>]
 * [boundary]
 * filename <filename>
 * <tab><content>
 */
export function parseBlame(output: string): BlameResult {
  const lines = output.split('\n');
  const result: BlameResult = { lines: [] };

  let currentHash = '';
  let currentAuthor = '';
  let currentDate = '';
  let currentLineNumber = 0;
  const hashInfoCache: Record<string, { author: string; date: string }> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // SHA line: <sha1> <orig-line> <final-line> [<num-lines>]
    const shaMatch = line.match(/^([a-f0-9]{40}) (\d+) (\d+)/);
    if (shaMatch) {
      currentHash = shaMatch[1] ?? '';
      currentLineNumber = parseInt(shaMatch[3] ?? '0', 10);

      // Check cache for hash info
      const cached = hashInfoCache[currentHash];
      if (cached) {
        currentAuthor = cached.author;
        currentDate = cached.date;
      }
      continue;
    }

    // Author line
    if (line.startsWith('author ')) {
      currentAuthor = line.slice(7);
      continue;
    }

    // Author time (Unix timestamp)
    if (line.startsWith('author-time ')) {
      const timestamp = parseInt(line.slice(12), 10);
      currentDate = new Date(timestamp * 1000).toISOString();

      // Cache the hash info
      if (currentHash) {
        hashInfoCache[currentHash] = {
          author: currentAuthor,
          date: currentDate,
        };
      }
      continue;
    }

    // Content line (starts with tab)
    if (line.startsWith('\t')) {
      const content = line.slice(1);

      result.lines.push({
        lineNumber: currentLineNumber,
        hash: currentHash,
        author: currentAuthor,
        date: currentDate,
        content,
      });
      continue;
    }
  }

  return result;
}

/**
 * Format blame result for display
 */
export function formatBlame(result: BlameResult, showContent: boolean = true): string {
  return result.lines
    .map((line) => {
      const hash = line.hash.slice(0, 7);
      const author = line.author.slice(0, 20).padEnd(20);
      const lineNum = line.lineNumber.toString().padStart(4);

      if (showContent) {
        return `${hash} ${author} ${lineNum}: ${line.content}`;
      }
      return `${hash} ${author} ${lineNum}`;
    })
    .join('\n');
}
