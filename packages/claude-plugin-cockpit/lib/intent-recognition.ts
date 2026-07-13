/**
 * intent-recognition.ts
 *
 * Pure reference implementation of the two intent-class recognizers used by
 * the add-issue flow in `commands/auto.md` § Add-issue flow (mid-run):
 *
 * - `parseAddExistingIntent(input: string): AddExistingIntent | null` —
 *   extracts an explicit `<owner>/<repo>#<n>` (or `#<n>` shorthand) from
 *   natural-language variants of "also process X", "process X too",
 *   "add X to scope", "include X", "queue X", "pull in X", "handle X",
 *   "look at X too". Returns null when no add-existing phrasing signal is
 *   present or no parseable ref is present.
 * - `parseFileNewIntent(input: string): FileNewIntent | null` — recognizes
 *   natural-language variants of "file an issue for X", "open a bug for X",
 *   "create an issue about X", "raise an issue for X", "report an issue for X".
 *   Returns null when no trigger pattern matches or when the phrasing is a
 *   known ambiguous chat variant ("look at X", "check X out", etc.).
 *
 * The runtime consumer is Claude following the playbook prose; this module
 * exists so the parser rules have a machine-checkable definition against
 * fixtures. Matches the #394 `reference-consumption.ts` / #400
 * `clarification-batch-parser.ts` shape: pure functions, no I/O, no async,
 * no external state, deterministic.
 *
 * Contracts:
 * - specs/416-operator-requested-capability/contracts/intent-recognition.md
 * - specs/416-operator-requested-capability/data-model.md § Intent-class recognition
 */

export type AddExistingIntent = {
  readonly ref: string;
};

export type FileNewIntent = {
  readonly topic: string;
};

const ADD_EXISTING_PHRASES: readonly RegExp[] = [
  /\balso\s+process\b/i,
  /\bprocess\b[^.]*\btoo\b/i,
  /\badd\b[^.]*\bto\s+scope\b/i,
  /\binclude\b/i,
  /\bqueue\b/i,
  /\bpull\s+in\b/i,
  /\bhandle\b/i,
  /\blook\s+at\b[^.]*\btoo\b/i,
];

const FULL_REF_RE = /\b[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+#\d+\b/;
const SHORTHAND_RE = /(?<![A-Za-z0-9/])#\d+\b/;

const FILE_NEW_TRIGGER_RE =
  /\b(?:file|open|create|raise|report)\s+an?\s+(?:issue|bug|ticket|report)\s+(?:for|about|on|regarding)\s+([^\n\r]+)/i;

const AMBIGUOUS_PHRASES: readonly RegExp[] = [
  /\blook\s+at\b/i,
  /\bcheck\b[^.]*\bout\b/i,
  /\binvestigate\b/i,
  /\blet['’]?s\s+discuss\b/i,
];

function findFirstRef(input: string): string | null {
  const full = FULL_REF_RE.exec(input);
  const shorthand = SHORTHAND_RE.exec(input);
  if (full === null && shorthand === null) return null;
  if (full !== null && shorthand !== null) {
    return full.index <= shorthand.index ? full[0] : shorthand[0];
  }
  return (full ?? shorthand)![0];
}

function hasAddExistingSignal(input: string): boolean {
  for (const re of ADD_EXISTING_PHRASES) {
    if (re.test(input)) return true;
  }
  return false;
}

export function parseAddExistingIntent(input: string): AddExistingIntent | null {
  if (!hasAddExistingSignal(input)) return null;
  const ref = findFirstRef(input);
  if (ref === null) return null;
  return { ref };
}

function hasAmbiguousChatSignal(input: string): boolean {
  if (FILE_NEW_TRIGGER_RE.test(input)) return false;
  for (const re of AMBIGUOUS_PHRASES) {
    if (re.test(input)) return true;
  }
  return false;
}

function stripTrailingClause(topic: string): string {
  const trimmed = topic.trim().replace(/[.!?]+$/, "").trim();
  const andProcessIdx = trimmed.search(/\s+and\s+process\s+it\b/i);
  if (andProcessIdx >= 0) return trimmed.slice(0, andProcessIdx).trim();
  const andQueueIdx = trimmed.search(/\s+and\s+queue\s+it\b/i);
  if (andQueueIdx >= 0) return trimmed.slice(0, andQueueIdx).trim();
  return trimmed;
}

export function parseFileNewIntent(input: string): FileNewIntent | null {
  if (hasAmbiguousChatSignal(input)) return null;
  const match = FILE_NEW_TRIGGER_RE.exec(input);
  if (match === null) return null;
  const rawTopic = match[1] ?? "";
  const topic = stripTrailingClause(rawTopic);
  if (topic.length === 0) return null;
  return { topic };
}
