/**
 * Parse conflict markers from files
 */

import type { ConflictInfo } from '../types.js';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * Conflict marker patterns
 */
const CONFLICT_START = /^<{7} /;
const CONFLICT_MIDDLE = /^={7}$/;
const CONFLICT_ANCESTOR = /^\|{7} /;
const CONFLICT_END = /^>{7} /;

/**
 * Parse conflict markers from file content
 */
export function parseConflictMarkers(content: string): {
  ours: string;
  theirs: string;
  ancestor?: string;
} | null {
  const lines = content.split('\n');

  let inConflict = false;
  let section: 'ours' | 'ancestor' | 'theirs' = 'ours';
  let ours: string[] = [];
  let theirs: string[] = [];
  let ancestor: string[] | undefined;

  for (const line of lines) {
    if (CONFLICT_START.test(line)) {
      inConflict = true;
      section = 'ours';
      ours = [];
      theirs = [];
      ancestor = undefined;
      continue;
    }

    if (!inConflict) continue;

    if (CONFLICT_ANCESTOR.test(line)) {
      section = 'ancestor';
      ancestor = [];
      continue;
    }

    if (CONFLICT_MIDDLE.test(line)) {
      section = 'theirs';
      continue;
    }

    if (CONFLICT_END.test(line)) {
      return {
        ours: ours.join('\n'),
        theirs: theirs.join('\n'),
        ancestor: ancestor?.join('\n'),
      };
    }

    // Add line to current section
    switch (section) {
      case 'ours':
        ours.push(line);
        break;
      case 'ancestor':
        ancestor?.push(line);
        break;
      case 'theirs':
        theirs.push(line);
        break;
    }
  }

  return null;
}

/**
 * Check if file contains conflict markers
 */
export function hasConflictMarkers(content: string): boolean {
  return CONFLICT_START.test(content);
}

/**
 * Determine conflict type from git status output
 *
 * Status codes for unmerged entries:
 * DD - both deleted
 * AU - added by us
 * UD - deleted by them
 * UA - added by them
 * DU - deleted by us
 * AA - both added
 * UU - both modified
 */
export function getConflictType(
  statusCode: string
): ConflictInfo['type'] {
  switch (statusCode) {
    case 'AA':
      return 'add-add';
    case 'DD':
    case 'AU':
    case 'UD':
    case 'UA':
    case 'DU':
      return 'delete-modify';
    default:
      return 'content';
  }
}

/**
 * Parse conflicts from a list of files
 */
export async function parseConflictsFromFiles(
  files: string[],
  cwd: string = process.cwd()
): Promise<ConflictInfo[]> {
  const conflicts: ConflictInfo[] = [];

  for (const file of files) {
    try {
      const filePath = join(cwd, file);
      const content = await readFile(filePath, 'utf-8');

      const markers = parseConflictMarkers(content);
      if (markers) {
        conflicts.push({
          file,
          type: 'content',
          ours: markers.ours,
          theirs: markers.theirs,
          ancestor: markers.ancestor,
        });
      } else {
        // File is in conflict list but no markers found
        // This could be a delete-modify or rename conflict
        conflicts.push({
          file,
          type: 'content',
        });
      }
    } catch {
      // File may have been deleted in conflict
      conflicts.push({
        file,
        type: 'delete-modify',
      });
    }
  }

  return conflicts;
}

/**
 * Get all conflicted files from git status
 */
export function getConflictedFilesFromStatus(statusOutput: string): string[] {
  const lines = statusOutput.split('\n');
  const conflicted: string[] = [];

  for (const line of lines) {
    // Look for unmerged entries in porcelain v2 format
    if (line.startsWith('u ')) {
      const parts = line.split('\t');
      const path = parts[parts.length - 1];
      if (path) {
        conflicted.push(path);
      }
    }

    // Also check porcelain v1 format (UU, AA, DD, etc.)
    const match = line.match(/^(UU|AA|DD|AU|UD|UA|DU) (.+)$/);
    if (match?.[2]) {
      conflicted.push(match[2]);
    }
  }

  return conflicted;
}
