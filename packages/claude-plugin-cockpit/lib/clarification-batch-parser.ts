/**
 * clarification-batch-parser.ts
 *
 * Pure reference implementation of the two parsers used by the clarification
 * batch gate in `commands/clarify.md` (step 5) and `commands/auto.md`
 * (D.1 step 3 / § Gate contract G.1):
 *
 * - `parseBatchComment(body: string): ParsedBatch` — extracts per-question
 *   `{title, context, question, options}` from the engine-authored batch
 *   comment template returned by `generacy cockpit context`.
 * - `parseDirectives(input: string, batch: ParsedBatch): Directive[]` —
 *   extracts `Q<n>:` token-anchored operator directives and resolves bare-
 *   letter references against `batch.questions[i].options`.
 *
 * The runtime consumer is Claude following the playbook prose; this module
 * exists so the parser rules have a machine-checkable definition against
 * fixtures. Matches the #394 `reference-consumption.ts` shape (pure
 * functions, no I/O, no async, no external state).
 *
 * Contracts:
 * - specs/400-operator-requested-ux/contracts/batch-comment-parser.md
 * - specs/400-operator-requested-ux/contracts/directive-parser.md
 */

export interface ParsedQuestion {
  readonly questionId: number;
  readonly title: string | null;
  readonly context: string;
  readonly question: string;
  readonly options: ReadonlyArray<{ letter: string; text: string }> | null;
}

export interface ParsedBatch {
  readonly questions: ReadonlyArray<ParsedQuestion>;
}

export type Directive =
  | {
      readonly kind: "edit";
      readonly questionId: number;
      readonly answer: string;
      readonly rationale: string | null;
    }
  | {
      readonly kind: "skip";
      readonly questionId: number;
    };

export class ParseError extends Error {
  constructor(
    public readonly reason: string,
    public readonly contextInfo: string,
  ) {
    super(`ParseError: ${reason} (context: ${contextInfo})`);
    this.name = "ParseError";
  }
}

const Q_HEADER_RE = /^###\s+Q(\d+)(?::\s*(.+?))?\s*$/;
const OPTION_BULLET_RE = /^\s*-?\s*([A-Z])[:)]\s+(.+?)\s*$/;
const FIELD_LABEL_RE = /^\*\*(Context|Question|Options)\*\*:\s*(.*)$/;

type FieldName = "Context" | "Question" | "Options";

interface RawBlock {
  questionId: number;
  title: string | null;
  headerLine: number;
  lines: string[];
}

function stripTrailingBlankLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && lines[end - 1]!.trim() === "") end--;
  return lines.slice(0, end);
}

function normalizeFieldContent(lines: string[]): string {
  const trimmedTrailing = stripTrailingBlankLines(lines);
  if (trimmedTrailing.length === 0) return "";
  const first = trimmedTrailing[0]!.replace(/^\s+/, "");
  return [first, ...trimmedTrailing.slice(1)].join("\n").replace(/\s+$/, "");
}

function extractRawBlocks(body: string): RawBlock[] {
  const lines = body.split("\n");
  const blocks: RawBlock[] = [];
  let current: RawBlock | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const headerMatch = Q_HEADER_RE.exec(line);
    if (headerMatch) {
      if (current !== null) blocks.push(current);
      const rawTitle = headerMatch[2];
      const title =
        rawTitle === undefined || rawTitle.trim() === "" ? null : rawTitle.trim();
      current = {
        questionId: parseInt(headerMatch[1]!, 10),
        title,
        headerLine: i + 1,
        lines: [],
      };
      continue;
    }
    if (/^###\s+Q/.test(line)) {
      throw new ParseError(
        "malformed-header",
        `line ${i + 1}: ${line}`,
      );
    }
    if (current !== null) current.lines.push(line);
  }
  if (current !== null) blocks.push(current);
  return blocks;
}

function parseBlockFields(block: RawBlock): {
  context: string;
  question: string;
  options: ReadonlyArray<{ letter: string; text: string }> | null;
} {
  let currentField: FieldName | null = null;
  const buffers: Record<FieldName, string[]> = {
    Context: [],
    Question: [],
    Options: [],
  };
  const seen: Record<FieldName, boolean> = {
    Context: false,
    Question: false,
    Options: false,
  };
  for (const line of block.lines) {
    const labelMatch = FIELD_LABEL_RE.exec(line);
    if (labelMatch) {
      currentField = labelMatch[1] as FieldName;
      seen[currentField] = true;
      const inline = labelMatch[2] ?? "";
      buffers[currentField] = [];
      if (inline.length > 0) buffers[currentField]!.push(inline);
      continue;
    }
    if (currentField !== null) {
      buffers[currentField]!.push(line);
    }
  }

  if (!seen.Context) {
    throw new ParseError(
      "missing-context",
      `Q${block.questionId} (line ${block.headerLine})`,
    );
  }
  if (!seen.Question) {
    throw new ParseError(
      "missing-question",
      `Q${block.questionId} (line ${block.headerLine})`,
    );
  }

  const context = normalizeFieldContent(buffers.Context);
  const question = normalizeFieldContent(buffers.Question);

  if (context === "") {
    throw new ParseError(
      "empty-context",
      `Q${block.questionId} (line ${block.headerLine})`,
    );
  }
  if (question === "") {
    throw new ParseError(
      "empty-question",
      `Q${block.questionId} (line ${block.headerLine})`,
    );
  }

  let options: ReadonlyArray<{ letter: string; text: string }> | null = null;
  if (seen.Options) {
    const parsed: { letter: string; text: string }[] = [];
    const lettersSeen = new Set<string>();
    for (const rawLine of buffers.Options) {
      if (rawLine.trim() === "") continue;
      const bulletMatch = OPTION_BULLET_RE.exec(rawLine);
      if (!bulletMatch) continue;
      const letter = bulletMatch[1]!;
      const text = bulletMatch[2]!.trim();
      if (lettersSeen.has(letter)) {
        throw new ParseError(
          "duplicate-option-letter",
          `Q${block.questionId} letter ${letter} (line ${block.headerLine})`,
        );
      }
      lettersSeen.add(letter);
      parsed.push({ letter, text });
    }
    options = parsed;
  }

  return { context, question, options };
}

export function parseBatchComment(body: string): ParsedBatch {
  const rawBlocks = extractRawBlocks(body);
  if (rawBlocks.length === 0) {
    throw new ParseError("empty-batch", "no ### Q<n> headers in body");
  }

  const seenIds = new Set<number>();
  const questions: ParsedQuestion[] = [];
  for (const block of rawBlocks) {
    if (seenIds.has(block.questionId)) {
      throw new ParseError(
        "duplicate-question-id",
        `Q${block.questionId} (line ${block.headerLine})`,
      );
    }
    seenIds.add(block.questionId);
    const { context, question, options } = parseBlockFields(block);
    questions.push({
      questionId: block.questionId,
      title: block.title,
      context,
      question,
      options,
    });
  }
  return { questions };
}

const DIRECTIVE_TOKEN_SPLIT = /(?=Q\d+:)/;
const DIRECTIVE_TOKEN_HEAD = /^Q(\d+):\s*([\s\S]*)$/;
const LETTER_ONLY_RE = /^([A-Z])$/;
const LETTER_REASON_RE = /^([A-Z])\s*[—-]\s+(.+)$/s;

function findOption(
  batch: ParsedBatch,
  questionId: number,
  letter: string,
): { letter: string; text: string } | null {
  const question = batch.questions.find((q) => q.questionId === questionId);
  if (!question || question.options === null) return null;
  return question.options.find((o) => o.letter === letter) ?? null;
}

function classifyDirective(
  questionId: number,
  payloadRaw: string,
  batch: ParsedBatch,
): Directive | null {
  const payload = payloadRaw.trim();
  if (payload === "") return null;
  if (payload.toLowerCase() === "skip") {
    return { kind: "skip", questionId };
  }
  const letterOnly = LETTER_ONLY_RE.exec(payload);
  if (letterOnly) {
    const letter = letterOnly[1]!;
    const option = findOption(batch, questionId, letter);
    if (option !== null) {
      return {
        kind: "edit",
        questionId,
        answer: option.text,
        rationale: null,
      };
    }
    return {
      kind: "edit",
      questionId,
      answer: payload,
      rationale: null,
    };
  }
  const letterReason = LETTER_REASON_RE.exec(payload);
  if (letterReason) {
    const letter = letterReason[1]!;
    const reason = letterReason[2]!.trim();
    const option = findOption(batch, questionId, letter);
    if (option !== null) {
      return {
        kind: "edit",
        questionId,
        answer: option.text,
        rationale: reason,
      };
    }
  }
  return {
    kind: "edit",
    questionId,
    answer: payload,
    rationale: null,
  };
}

export function parseDirectives(
  input: string,
  batch: ParsedBatch,
): Directive[] {
  const trimmed = input.trim();
  if (trimmed === "") return [];

  const segments = trimmed.split(DIRECTIVE_TOKEN_SPLIT);
  const knownIds = new Set(batch.questions.map((q) => q.questionId));
  const byQuestionId = new Map<number, Directive>();
  const order: number[] = [];

  for (const rawSegment of segments) {
    const segment = rawSegment.trim();
    if (segment === "") continue;
    const head = DIRECTIVE_TOKEN_HEAD.exec(segment);
    if (!head) continue;
    const questionId = parseInt(head[1]!, 10);
    if (!knownIds.has(questionId)) continue;
    const payload = head[2] ?? "";
    // The payload may contain a trailing `; ` boundary from the single-line
    // semicolon form when the NEXT segment starts with `Q<n>:`. The split
    // already handled that (positive lookahead preserves the next token), but
    // a `;` character can also live legitimately inside verbatim replacement
    // text. Strip only the single boundary artifact: a trailing `;` (and its
    // surrounding whitespace) at the very end of this segment — but ONLY when
    // this segment is followed by another segment (i.e., not the last one).
    // The split rule already produces the correct grouping; the payload
    // itself just needs its trailing `;` removed when it's a boundary,
    // preserving any interior `;` inside verbatim text.
    let cleanPayload = payload;
    // Trim any trailing `;` at the end of the payload's last line — this is
    // the residue of the single-line semicolon form (e.g., segment `Q2: B; `
    // → payload after `Q2:` is `B;`). Only strip a lone trailing semicolon,
    // never one that is followed by other content.
    cleanPayload = cleanPayload.replace(/\s*;\s*$/, "");
    const directive = classifyDirective(questionId, cleanPayload, batch);
    if (directive === null) continue;
    if (!byQuestionId.has(questionId)) order.push(questionId);
    byQuestionId.set(questionId, directive);
  }

  return order.map((id) => byQuestionId.get(id)!);
}
