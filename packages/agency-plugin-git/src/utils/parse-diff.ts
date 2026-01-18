/**
 * Parse git diff output
 */

import type { DiffResult, DiffFileStat } from '../types.js';

/**
 * Parse git diff --numstat output into DiffResult
 *
 * numstat format: <insertions><tab><deletions><tab><path>
 * Binary files show as: -<tab>-<tab><path>
 */
export function parseDiffNumstat(output: string): DiffResult {
  const lines = output.split('\n').filter(Boolean);

  const result: DiffResult = {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    files: [],
  };

  for (const line of lines) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const insertionsStr = parts[0];
    const deletionsStr = parts[1];
    const path = parts.slice(2).join('\t'); // Handle paths with tabs

    const binary = insertionsStr === '-' && deletionsStr === '-';
    const insertions = binary ? 0 : parseInt(insertionsStr ?? '0', 10) || 0;
    const deletions = binary ? 0 : parseInt(deletionsStr ?? '0', 10) || 0;

    result.filesChanged++;
    result.insertions += insertions;
    result.deletions += deletions;
    result.files?.push({
      path,
      insertions,
      deletions,
      binary: binary ? true : undefined,
    });
  }

  return result;
}

/**
 * Parse git diff --stat output into DiffResult
 *
 * stat format:
 *   <path> | <count> <bar>
 *   ...
 *   <n> files changed, <m> insertions(+), <p> deletions(-)
 */
export function parseDiffStat(output: string): DiffResult {
  const lines = output.split('\n').filter(Boolean);

  const result: DiffResult = {
    filesChanged: 0,
    insertions: 0,
    deletions: 0,
    files: [],
  };

  for (const line of lines) {
    // Summary line at the end
    const summaryMatch = line.match(
      /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/
    );
    if (summaryMatch) {
      result.filesChanged = parseInt(summaryMatch[1] ?? '0', 10) || 0;
      result.insertions = parseInt(summaryMatch[2] ?? '0', 10) || 0;
      result.deletions = parseInt(summaryMatch[3] ?? '0', 10) || 0;
      continue;
    }

    // File stat line
    const fileMatch = line.match(/^\s*(.+?)\s*\|\s*(\d+|Bin)/);
    if (fileMatch && fileMatch[1]) {
      const path = fileMatch[1].trim();
      const binary = fileMatch[2] === 'Bin';

      // Count + and - characters in the visual bar
      const barMatch = line.match(/\|[^|]*$/);
      let insertions = 0;
      let deletions = 0;

      if (barMatch && !binary) {
        const bar = barMatch[0];
        insertions = (bar.match(/\+/g) || []).length;
        deletions = (bar.match(/-/g) || []).length;
      }

      result.files?.push({
        path,
        insertions,
        deletions,
        binary: binary ? true : undefined,
      });
    }
  }

  return result;
}

/**
 * Create a summary string from DiffResult
 */
export function formatDiffSummary(result: DiffResult): string {
  const parts: string[] = [];

  if (result.filesChanged > 0) {
    parts.push(
      `${result.filesChanged} file${result.filesChanged !== 1 ? 's' : ''} changed`
    );
  }

  if (result.insertions > 0) {
    parts.push(`${result.insertions} insertion${result.insertions !== 1 ? 's' : ''}(+)`);
  }

  if (result.deletions > 0) {
    parts.push(`${result.deletions} deletion${result.deletions !== 1 ? 's' : ''}(-)`);
  }

  return parts.join(', ') || 'No changes';
}
