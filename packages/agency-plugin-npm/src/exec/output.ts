/**
 * Failure-output shaping.
 *
 * Success paths return terse fixed messages; failure paths embed the captured
 * stream. Cap that stream so a large build/test log cannot blow out the
 * caller's context window: keep the tail, which is where compilers and test
 * runners put their error summaries.
 */

import type { ExecResult } from './runner.js';

/** Maximum number of lines of failure output to return */
export const MAX_FAILURE_LINES = 200;

/** Maximum characters of failure output to return */
export const MAX_FAILURE_CHARS = 8_192;

/**
 * Merge stdout and stderr into one block.
 *
 * Tools historically returned `stderr || stdout`, which let a single warning
 * line on one stream hide the actual error on the other. Returning both,
 * labeled, avoids that masking.
 */
export function combineStreams(result: Pick<ExecResult, 'stdout' | 'stderr'>): string {
  const stdout = result.stdout.trim();
  const stderr = result.stderr.trim();

  if (stdout && stderr) {
    return `${stdout}\n--- stderr ---\n${stderr}`;
  }
  return stdout || stderr || '(no output)';
}

/**
 * Keep only the tail of a block of text, bounded by lines and characters.
 * A truncation marker is prepended when anything was dropped.
 */
export function clampTail(
  text: string,
  maxLines: number = MAX_FAILURE_LINES,
  maxChars: number = MAX_FAILURE_CHARS
): string {
  const lines = text.split('\n');
  const kept = lines.length > maxLines ? lines.slice(lines.length - maxLines) : lines;
  let joined = kept.join('\n');

  if (joined.length > maxChars) {
    joined = joined.slice(joined.length - maxChars);
  }

  if (joined.length < text.length) {
    const dropped = text.length - joined.length;
    return `… [output truncated: ${dropped} earlier characters dropped, showing tail] …\n${joined}`;
  }
  return text;
}

/**
 * Standard failure-output body: both streams, tail-clamped.
 */
export function formatFailureOutput(result: Pick<ExecResult, 'stdout' | 'stderr'>): string {
  return clampTail(combineStreams(result));
}
