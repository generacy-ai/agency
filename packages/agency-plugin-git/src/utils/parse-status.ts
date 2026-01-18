/**
 * Parse git status --porcelain=v2 output
 */

import type { StatusResult, FileChange } from '../types.js';

/**
 * Parse git status --porcelain=v2 output into structured StatusResult
 *
 * Porcelain v2 format:
 * - Header lines start with #
 *   - # branch.oid <commit>
 *   - # branch.head <branch>
 *   - # branch.upstream <upstream>
 *   - # branch.ab +<ahead> -<behind>
 * - Changed entries:
 *   - 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
 *   - 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><tab><origPath>
 * - Untracked: ? <path>
 * - Ignored: ! <path>
 * - Unmerged: u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
 */
export function parseStatus(output: string): StatusResult {
  const lines = output.split('\n').filter(Boolean);

  const result: StatusResult = {
    branch: '',
    ahead: 0,
    behind: 0,
    staged: [],
    unstaged: [],
    untracked: [],
    conflicts: [],
  };

  for (const line of lines) {
    // Header lines
    if (line.startsWith('# ')) {
      parseHeaderLine(line, result);
      continue;
    }

    // Untracked files
    if (line.startsWith('? ')) {
      result.untracked.push(line.slice(2));
      continue;
    }

    // Ignored files (skip)
    if (line.startsWith('! ')) {
      continue;
    }

    // Unmerged entries (conflicts)
    if (line.startsWith('u ')) {
      parseUnmergedEntry(line, result);
      continue;
    }

    // Changed entries (ordinary changed entry)
    if (line.startsWith('1 ')) {
      parseOrdinaryEntry(line, result);
      continue;
    }

    // Renamed/copied entries
    if (line.startsWith('2 ')) {
      parseRenamedEntry(line, result);
      continue;
    }
  }

  return result;
}

function parseHeaderLine(line: string, result: StatusResult): void {
  const parts = line.slice(2).split(' ');
  const key = parts[0];

  switch (key) {
    case 'branch.head':
      result.branch = parts[1] ?? '';
      break;
    case 'branch.upstream':
      result.upstream = parts[1];
      break;
    case 'branch.ab': {
      // +<ahead> -<behind>
      const ahead = parts[1];
      const behind = parts[2];
      if (ahead) {
        result.ahead = parseInt(ahead.slice(1), 10) || 0;
      }
      if (behind) {
        result.behind = parseInt(behind.slice(1), 10) || 0;
      }
      break;
    }
  }
}

function parseUnmergedEntry(line: string, result: StatusResult): void {
  // u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
  // Format uses spaces, path is at the end after 10 space-separated fields
  const parts = line.split(' ');
  // The path starts at index 10 (after u, XY, sub, m1, m2, m3, mW, h1, h2, h3)
  const path = parts.slice(10).join(' ');
  if (path) {
    result.conflicts.push(path);
  }
}

function parseOrdinaryEntry(line: string, result: StatusResult): void {
  // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
  const parts = line.split(' ');
  const xy = parts[1];
  const path = parts.slice(8).join(' ');

  if (!xy || !path) return;

  const indexStatus = xy[0];
  const workTreeStatus = xy[1];

  // Index status (staged)
  if (indexStatus && indexStatus !== '.') {
    result.staged.push({
      path,
      status: statusCharToStatus(indexStatus),
    });
  }

  // Work tree status (unstaged)
  if (workTreeStatus && workTreeStatus !== '.') {
    result.unstaged.push({
      path,
      status: statusCharToStatus(workTreeStatus),
    });
  }
}

function parseRenamedEntry(line: string, result: StatusResult): void {
  // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><tab><origPath>
  const tabIndex = line.indexOf('\t');
  if (tabIndex === -1) return;

  const beforeTab = line.slice(0, tabIndex);
  const afterTab = line.slice(tabIndex + 1);

  const parts = beforeTab.split(' ');
  const xy = parts[1];
  const pathParts = afterTab.split('\t');
  const path = pathParts[0];
  const origPath = pathParts[1];

  if (!xy || !path) return;

  const indexStatus = xy[0];
  const workTreeStatus = xy[1];

  // Index status (staged)
  if (indexStatus && indexStatus !== '.') {
    const change: FileChange = {
      path,
      status: indexStatus === 'R' ? 'renamed' : indexStatus === 'C' ? 'copied' : statusCharToStatus(indexStatus),
    };
    if (origPath) {
      change.oldPath = origPath;
    }
    result.staged.push(change);
  }

  // Work tree status (unstaged)
  if (workTreeStatus && workTreeStatus !== '.') {
    result.unstaged.push({
      path,
      status: statusCharToStatus(workTreeStatus),
    });
  }
}

function statusCharToStatus(char: string): FileChange['status'] {
  switch (char) {
    case 'A':
      return 'added';
    case 'M':
      return 'modified';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    default:
      return 'modified';
  }
}
