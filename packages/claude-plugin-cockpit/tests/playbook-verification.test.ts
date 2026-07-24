import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  LIVENESS_THRESHOLD,
  livenessCrossCheck,
  readStream,
  type CounterRef,
  type StatusJson,
} from "./reference-consumption.js";
import { GATE_VOCABULARY } from "../lib/gate-vocabulary.js";
import {
  parseBatchComment,
  parseDirectives,
  type Directive,
  type ParsedBatch,
  type ParsedQuestion,
} from "../lib/clarification-batch-parser.js";
import {
  parseAddExistingIntent,
  parseFileNewIntent,
  type AddExistingIntent,
  type FileNewIntent,
} from "../lib/intent-recognition.js";
import {
  classifyPreDraftCheck,
  classifyGateQueryError,
  driftBranchMaySupersede,
  formatPreDraftCheckErrorLine,
  tickAnsweredSweepCounter,
  selectEscapeHatchTargets,
  ANSWERED_SWEEP_THRESHOLD,
  ESCALATION_DISPATCH_ROWS,
  ESCAPE_HATCH_ACK_DETAIL,
  formatGenerationDriftDetail,
  type GateStatusResult,
  type GateListResult,
  type GateQueryError,
  type GateQueryErrorClass,
  type AnsweredGateSweepCounter,
} from "../lib/gate-status-check.js";
import type { GateId, GateRecord, GateType } from "../lib/gate-wire-types.js";
import {
  parseTokens,
  dispatchForm,
  parseWorkspaceRepo,
  resolveRefs,
  formatTitle,
  formatBody,
  refSetEqual,
  parseBodyRefs,
  type QualifiedRef,
  type WorkspaceRepo,
} from "../lib/invocation-form-4.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, "fixtures");
const AUTO_MD_PATH = resolve(__dirname, "..", "commands", "auto.md");

describe("394 — auto.md unfiltered stream consumption + liveness cross-check", () => {
  it("Test 1 (SC-002): every non-whitespace-only line reaches dispatch; both event shapes present", () => {
    const raw = readFileSync(resolve(FIXTURES, "394-mixed-event-shapes.ndjson"), "utf-8");
    const rawLines = raw.split("\n");
    const nonWhitespaceLines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);

    const dispatched: string[] = [];
    const counter: CounterRef = { count: 0 };
    readStream(rawLines, (line) => dispatched.push(line), counter);

    // (a) Every non-whitespace-only line reaches dispatch exactly once (including the malformed line).
    expect(dispatched).toEqual(nonWhitespaceLines);
    expect(dispatched.length).toBeGreaterThanOrEqual(3);

    // (b) Both event shapes are represented. Legacy per-issue envelope has no `type`
    //     field; S8 synthetic aggregate carries `type`. Presence of `type` at parse
    //     time is the discriminator — but the discriminator lives in the test, NOT
    //     in the reference implementation (per contract C.5 point 2).
    const parsed = dispatched
      .map((line) => {
        try {
          return JSON.parse(line) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((v): v is Record<string, unknown> => v !== null);

    const hasLegacyShape = parsed.some(
      (obj) => obj.type === undefined && "event" in obj && "repo" in obj && "number" in obj,
    );
    const hasAggregateShape = parsed.some(
      (obj) => obj.type === "phase-complete" || obj.type === "epic-complete",
    );
    expect(hasLegacyShape).toBe(true);
    expect(hasAggregateShape).toBe(true);

    // (c) Whitespace-only lines did NOT reach dispatch.
    expect(dispatched.every((line) => line.trim().length > 0)).toBe(true);
    expect(dispatched.some((line) => line === "" || line.trim() === "")).toBe(false);

    // Fixture consumed → empty-read counter reset to 0.
    expect(counter.count).toBe(0);
  });

  it("Test 2 (SC-005): liveness cross-check fires after exactly N=4 empty reads, not before", () => {
    vi.useFakeTimers();

    const statusFixture = JSON.parse(
      readFileSync(resolve(FIXTURES, "394-actionable-live-state.json"), "utf-8"),
    ) as StatusJson;

    const counter: CounterRef = { count: 0 };
    const dispatch = vi.fn<(line: string) => void>();
    const recovery = vi.fn<(arg: { mode: string }) => void>();
    const state = {
      counter,
      processAlive: () => true,
      statusJson: () => statusFixture,
      recovery,
    };

    // First (LIVENESS_THRESHOLD - 1) empty bounded reads → cross-check must NOT fire.
    for (let i = 0; i < LIVENESS_THRESHOLD - 1; i++) {
      readStream([], dispatch, counter, { timeoutMs: 30_000 });
      vi.advanceTimersByTime(30_000);
      livenessCrossCheck(state);
      expect(recovery).not.toHaveBeenCalled();
    }
    expect(counter.count).toBe(LIVENESS_THRESHOLD - 1);

    // Nth empty bounded read → counter hits threshold → cross-check fires exactly once.
    readStream([], dispatch, counter, { timeoutMs: 30_000 });
    vi.advanceTimersByTime(30_000);
    expect(counter.count).toBe(LIVENESS_THRESHOLD);
    livenessCrossCheck(state);
    expect(recovery).toHaveBeenCalledOnce();
    expect(recovery).toHaveBeenCalledWith({ mode: "startup-sweep" });

    // Dispatch never called during empty reads.
    expect(dispatch).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

// -----------------------------------------------------------------------------
// 396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit
//
// The runtime is playbook prose interpreted by the model at slash-command time;
// there is no production dispatch module to exercise. The helpers below are
// test-side reference interpretations of the D.11 / D.10 prose in auto.md.
// A drift between prose and helper is a review-time signal — the assertions
// below lock in the shape the prose describes.
// -----------------------------------------------------------------------------

interface AskUserQuestionCall {
  question: string;
  header: string;
  options: string[];
  multiSelect: boolean;
}

interface DispatchContext {
  askUserQuestion: (call: AskUserQuestionCall) => string;
  ledger: (line: string) => void;
  presentationBlocks: string[];
}

interface FixtureIssue {
  issue_ref: string;
  labels?: string[];
  transition_class: string;
  conflicted_paths?: string[];
}

interface FixtureLiveState {
  epic_ref: string;
  issues: FixtureIssue[];
}

const D11_OPTIONS = [
  "I've resolved it — advance the gate",
  "Skip (session-local mute)",
  "Stop (exit auto)",
];

const D10_OPTIONS = ["Skip (session-local mute)", "Stop (exit auto)"];

const NAMED_DISPATCH_TOKENS: ReadonlySet<string> = new Set([
  "waiting-for:clarification",
  "waiting-for:spec-review",
  "waiting-for:clarification-review",
  "waiting-for:plan-review",
  "waiting-for:tasks-review",
  "waiting-for:implementation-review",
  "waiting-for:manual-validation",
  "waiting-for:address-pr-feedback",
  "waiting-for:pr-feedback",
  "waiting-for:children-complete",
  "waiting-for:dependencies",
  "waiting-for:merge-conflicts",
]);

function d11Dispatch(issue: FixtureIssue, ctx: DispatchContext): void {
  const paths = issue.conflicted_paths ?? [];
  const presentation = [
    `Merge conflicts on ${issue.issue_ref}:`,
    "",
    "Conflicted paths (from engine pause alert):",
    ...paths.map((p) => `- ${p}`),
  ].join("\n");
  ctx.presentationBlocks.push(presentation);
  ctx.askUserQuestion({
    question: `How to proceed on ${issue.issue_ref}?`,
    header: "Escalate",
    options: D11_OPTIONS,
    multiSelect: false,
  });
}

function dispatchClassifier(issue: FixtureIssue, ctx: DispatchContext): void {
  const token = issue.transition_class;
  if (token === "waiting-for:merge-conflicts") {
    d11Dispatch(issue, ctx);
    return;
  }
  if (token.startsWith("waiting-for:") && !NAMED_DISPATCH_TOKENS.has(token)) {
    // D.10 catch-all — tightened trigger routes any `waiting-for:*` without a
    // matching dispatch row to the unrecognized-state gate.
    const presentation = [
      `Unrecognized state on ${issue.issue_ref}:`,
      "",
      `Observed: ${token}`,
    ].join("\n");
    ctx.presentationBlocks.push(presentation);
    ctx.askUserQuestion({
      question: `How to proceed on ${issue.issue_ref}?`,
      header: "Escalate",
      options: D10_OPTIONS,
      multiSelect: false,
    });
    return;
  }
  // Named ledger-only rows (D.9 family) and other named rows would dispatch
  // elsewhere. The 396 assertions exercise only D.10 and D.11.
}

describe("396 — auto.md D.11 dispatch + tightened D.10 trigger + drift audit", () => {
  it("396-1: D.11 escalation gate fires on waiting-for:merge-conflicts with correct options + conflicted paths", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURES, "396-merge-conflicts-live-state.json"), "utf-8"),
    ) as FixtureLiveState;

    const askUserQuestion = vi.fn<(call: AskUserQuestionCall) => string>();
    askUserQuestion.mockReturnValue("Skip (session-local mute)");
    const ledger = vi.fn<(line: string) => void>();
    const presentationBlocks: string[] = [];
    const ctx: DispatchContext = { askUserQuestion, ledger, presentationBlocks };

    const issue = fixture.issues[0]!;
    dispatchClassifier(issue, ctx);

    expect(askUserQuestion).toHaveBeenCalledTimes(1);
    const call = askUserQuestion.mock.calls[0]![0];
    expect(call.options).toEqual(D11_OPTIONS);
    expect(call.multiSelect).toBe(false);
    expect(call.header).toBe("Escalate");

    // Presentation block includes the fixture's conflicted paths.
    const presentation = presentationBlocks[0]!;
    for (const path of issue.conflicted_paths ?? []) {
      expect(presentation).toContain(path);
    }
  });

  it("396-2: D.10 unrecognized-state gate fires on novel waiting-for:someday-gate with verbatim state", () => {
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURES, "396-someday-gate-live-state.json"), "utf-8"),
    ) as FixtureLiveState;

    const askUserQuestion = vi.fn<(call: AskUserQuestionCall) => string>();
    askUserQuestion.mockReturnValue("Skip (session-local mute)");
    const ledger = vi.fn<(line: string) => void>();
    const presentationBlocks: string[] = [];
    const ctx: DispatchContext = { askUserQuestion, ledger, presentationBlocks };

    const issue = fixture.issues[0]!;
    // Regression check: the token is neither in the vocabulary nor a named row.
    expect(GATE_VOCABULARY).not.toContain(issue.transition_class);
    expect(NAMED_DISPATCH_TOKENS.has(issue.transition_class)).toBe(false);

    dispatchClassifier(issue, ctx);

    expect(askUserQuestion).toHaveBeenCalledTimes(1);
    const call = askUserQuestion.mock.calls[0]![0];
    expect(call.options).toEqual(D10_OPTIONS);
    expect(call.multiSelect).toBe(false);

    // Verbatim state in the presentation block.
    const presentation = presentationBlocks[0]!;
    expect(presentation).toContain("waiting-for:someday-gate");

    // Regression: no ledger line was written classifying this as a no-op /
    // server-side-owned (the T-S5 stall-class check).
    for (const call of ledger.mock.calls) {
      expect(call[0]).not.toContain("(no-op)");
      expect(call[0]).not.toContain("server-side-owned");
    }
  });

  it("396-3: drift audit — every GATE_VOCABULARY token has a Trigger match in auto.md § Dispatch", () => {
    expect(GATE_VOCABULARY.length).toBe(12);

    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const dispatchSection = extractDispatchSection(autoMd);

    const missing: string[] = [];
    for (const token of GATE_VOCABULARY) {
      const escaped = escapeRegExp(token);
      const hasSubheading = new RegExp(
        `^###\\s+D\\.\\d+[a-z]?\\s+—\\s+\`${escaped}\``,
        "m",
      ).test(dispatchSection);
      const hasTableRow = new RegExp(
        `^\\|\\s*D\\.\\d+[a-z]?\\s*\\|\\s*\`${escaped}\``,
        "m",
      ).test(dispatchSection);
      // D.2 covers four `<artifact>-review` tokens under a single grouped
      // subheading — accept a table-row-column match against the grouped
      // pattern as a Trigger presence signal too.
      const artifactMatch =
        /^waiting-for:(spec|clarification|plan|tasks)-review$/.test(token) &&
        /\|\s*D\.2\s*\|\s*`waiting-for:<artifact>-review`/.test(dispatchSection);
      if (!(hasSubheading || hasTableRow || artifactMatch)) {
        missing.push(token);
      }
    }
    expect(missing, `tokens not found as a Trigger: ${missing.join(", ")}`).toEqual([]);
  });
});

function extractDispatchSection(md: string): string {
  const start = md.indexOf("\n## Dispatch\n");
  if (start === -1) throw new Error("§ Dispatch heading not found in auto.md");
  const rest = md.slice(start + 1);
  const nextH2 = rest.indexOf("\n## ", 1);
  return nextH2 === -1 ? rest : rest.slice(0, nextH2);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// -----------------------------------------------------------------------------
// 398 — drift audit: playbook invocations match generacy cockpit <verb> --help
//
// The audit sweeps every `commands/*.md` file for `generacy cockpit <verb>`
// invocations (fenced blocks + inline backtick spans that carry an argument
// per Q2=B) and cross-checks each invocation's angle-bracket positional
// argument tokens against the checked-in `--help` snapshot for that verb
// under `tests/fixtures/help-snapshots/<verb>.txt` (Q1=A source, Q3=A exact-
// string match).
//
// Non-angle-bracket tokens (concrete example literals like `1`, `P1`) are
// excluded from positional extraction — the audit's purpose is template drift
// detection, not literal-example matching. The has-an-argument rule (Q2=B)
// excludes bare-verb prose ("MUST NOT call `generacy cockpit merge`") from
// invocation extraction without any author annotations.
// -----------------------------------------------------------------------------

interface Invocation {
  file: string;
  line: number;
  verb: string;
  argTokens: string[];
  source: "fenced" | "inline";
}

interface Mismatch {
  file: string;
  line: number;
  verb: string;
  position: number;
  observed: string;
  expected: string;
}

const COMMANDS_DIR = resolve(__dirname, "..", "commands");
const SNAPSHOTS_DIR = resolve(__dirname, "fixtures", "help-snapshots");
const FIXTURE_398_DRIFT_AUTO = resolve(FIXTURES, "398-drift-auto.md");

function parseSnapshotUsageArgTokens(snapshotContent: string, verb: string): string[] {
  const lines = snapshotContent.split("\n");
  const usagePrefix = `Usage: generacy cockpit ${verb}`;
  for (const line of lines) {
    if (line.startsWith(usagePrefix)) {
      const rest = line.slice(usagePrefix.length).trim();
      const tokens = rest.split(/\s+/).filter((t) => t.length > 0);
      return tokens.filter((t) => /^<[a-z][a-z0-9-]*>$/.test(t));
    }
  }
  throw new Error(`Usage line for verb '${verb}' not found in snapshot`);
}

function extractPositionalTokens(rest: string): string[] {
  const tokens = rest.trim().split(/\s+/).filter((t) => t.length > 0);
  const positional: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("-")) continue;
    const stripped = token.replace(/[.,;:)]+$/, "");
    if (!stripped.startsWith("<")) continue;
    if (!/^<[a-z][a-z0-9-]*>$/.test(stripped)) continue;
    positional.push(stripped);
  }
  return positional;
}

function matchVerbAtStart(
  text: string,
  knownVerbs: readonly string[],
): { verb: string; rest: string } | null {
  const prefix = "generacy cockpit ";
  if (!text.startsWith(prefix)) return null;
  const afterPrefix = text.slice(prefix.length);
  for (const verb of knownVerbs) {
    if (
      afterPrefix === verb ||
      afterPrefix.startsWith(verb + " ") ||
      afterPrefix.startsWith(verb + "\t")
    ) {
      return { verb, rest: afterPrefix.slice(verb.length) };
    }
  }
  return null;
}

function extractInlineSpans(line: string): { content: string }[] {
  const spans: { content: string }[] = [];
  const regex = /`([^`]+)`/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(line)) !== null) {
    spans.push({ content: m[1]! });
  }
  return spans;
}

function parseInvocations(filePath: string, knownVerbs: readonly string[]): Invocation[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split("\n");
  const invocations: Invocation[] = [];

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineNo = i + 1;

    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      const trimmed = line.trim();
      const match = matchVerbAtStart(trimmed, knownVerbs);
      if (match) {
        const rest = match.rest.trim();
        if (rest.length > 0) {
          invocations.push({
            file: filePath,
            line: lineNo,
            verb: match.verb,
            argTokens: extractPositionalTokens(match.rest),
            source: "fenced",
          });
        }
      }
      continue;
    }

    for (const span of extractInlineSpans(line)) {
      const content = span.content.trim();
      const match = matchVerbAtStart(content, knownVerbs);
      if (!match) continue;
      const rest = match.rest.trim();
      if (rest.length === 0) continue;
      invocations.push({
        file: filePath,
        line: lineNo,
        verb: match.verb,
        argTokens: extractPositionalTokens(match.rest),
        source: "inline",
      });
    }
  }

  return invocations;
}

function loadKnownVerbSnapshots(): { verbs: string[]; snapshots: Record<string, string[]> } {
  const snapshotFiles = readdirSync(SNAPSHOTS_DIR).filter((f) => f.endsWith(".txt"));
  const verbs = snapshotFiles.map((f) => f.slice(0, -".txt".length));
  const snapshots: Record<string, string[]> = {};
  for (const verb of verbs) {
    const content = readFileSync(resolve(SNAPSHOTS_DIR, `${verb}.txt`), "utf-8");
    snapshots[verb] = parseSnapshotUsageArgTokens(content, verb);
  }
  return { verbs, snapshots };
}

function auditInvocations(
  invocations: Invocation[],
  snapshots: Record<string, string[]>,
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  for (const invocation of invocations) {
    const expected = snapshots[invocation.verb];
    if (!expected) continue;
    for (let i = 0; i < expected.length; i++) {
      const observedToken = invocation.argTokens[i];
      const expectedToken = expected[i]!;
      if (observedToken === undefined) break;
      if (observedToken !== expectedToken) {
        mismatches.push({
          file: invocation.file,
          line: invocation.line,
          verb: invocation.verb,
          position: i,
          observed: observedToken,
          expected: expectedToken,
        });
      }
    }
  }
  return mismatches;
}

describe("398 — playbook invocations match generacy cockpit <verb> --help", () => {
  it("398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token", () => {
    // post-#406 the drift audit only covers the `watch` verb; the other six moved to
    // the 406-1 tool-contract audit.
    const { verbs: allVerbs, snapshots } = loadKnownVerbSnapshots();
    const verbs = allVerbs.filter((v) => v === "watch");
    const playbookFiles = readdirSync(COMMANDS_DIR)
      .filter((f) => f.endsWith(".md"))
      .map((f) => resolve(COMMANDS_DIR, f));
    const invocations = playbookFiles.flatMap((f) => parseInvocations(f, verbs));
    const mismatches = auditInvocations(invocations, snapshots);

    const failureMessage = mismatches
      .map(
        (m) =>
          `  ${m.file}:${m.line}  verb=${m.verb} position=${m.position}  observed=${m.observed}  expected=${m.expected}`,
      )
      .join("\n");
    expect(
      mismatches,
      `\nInvocation-vs-help drift detected (${mismatches.length} mismatches):\n${failureMessage}`,
    ).toEqual([]);
  });

  it("398-2 (regression check): audit reports the known pre-fix D.5 drift on 398-drift-auto.md fixture", () => {
    const { verbs, snapshots } = loadKnownVerbSnapshots();
    const invocations = parseInvocations(FIXTURE_398_DRIFT_AUTO, verbs);

    const mergeInvocations = invocations.filter((i) => i.verb === "merge");
    expect(mergeInvocations.length).toBeGreaterThanOrEqual(1);

    const mismatches = auditInvocations(invocations, snapshots);
    expect(mismatches).toHaveLength(1);
    const m = mismatches[0]!;
    expect(m.verb).toBe("merge");
    expect(m.position).toBe(0);
    expect(m.observed).toBe("<pr-ref>");
    expect(m.expected).toBe("<issue>");
  });
});

// -----------------------------------------------------------------------------
// 400 — clarification batch parser + directive grammar
//
// The runtime is Claude interpreting the playbook prose in clarify.md step 5
// and auto.md D.1 step 3 / § Gate contract G.1. The parser module under
// lib/clarification-batch-parser.ts is a machine-checkable reference
// implementation of the rule the prose describes. The five assertions below
// exercise the parser against fixture inputs and act as a build-time backstop
// against silent regression of the load-bearing rules — mildly-tolerant
// option-bullet parsing, title-fallback path, free-form no-options placeholder,
// token-anchored directive splitting (no semicolon mis-split), and the
// newline≡semicolon documented-form equivalence.
// -----------------------------------------------------------------------------

function normalizeQuestion(q: ParsedQuestion): {
  questionId: number;
  title: string | null;
  context: string;
  question: string;
  options: ReadonlyArray<{ letter: string; text: string }> | null;
} {
  return {
    questionId: q.questionId,
    title: q.title,
    context: q.context,
    question: q.question,
    options: q.options,
  };
}

function renderOptionsLine(q: ParsedQuestion): string {
  if (q.options === null) {
    return "**Options:** (free-form — no options posted)";
  }
  const parts = q.options.map((o) => `${o.letter} — ${o.text}`);
  return `**Options:** ${parts.join(", ")}`;
}

describe("400 — clarification batch parser + directive grammar", () => {
  it("400-1: batch-comment parse tolerates option-bullet variations (A: and A))", () => {
    const colonRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-a-colon.md"),
      "utf-8",
    );
    const parenRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-a-paren.md"),
      "utf-8",
    );

    const colonBatch = parseBatchComment(colonRaw);
    const parenBatch = parseBatchComment(parenRaw);

    const colonNormalized = colonBatch.questions.map(normalizeQuestion);
    const parenNormalized = parenBatch.questions.map(normalizeQuestion);

    expect(
      parenNormalized,
      `A) fixture parse must equal A: fixture parse position-for-position; observed A: shape: ${JSON.stringify(colonNormalized)}`,
    ).toEqual(colonNormalized);
    expect(colonBatch.questions.length).toBe(5);
  });

  it("400-2: title fallback fires only when the batch header lacks a title", () => {
    const noTitleRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-no-title.md"),
      "utf-8",
    );
    const colonRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-a-colon.md"),
      "utf-8",
    );

    const noTitleBatch = parseBatchComment(noTitleRaw);
    expect(
      noTitleBatch.questions[0]!.title,
      `expected title:null when the batch header is "### Q1" (no colon-title); fixture: 400-batch-comment-no-title.md`,
    ).toBe(null);

    const colonBatch = parseBatchComment(colonRaw);
    expect(
      colonBatch.questions[0]!.title,
      `expected verbatim header title "Directive grammar shape"; fixture: 400-batch-comment-a-colon.md`,
    ).toBe("Directive grammar shape");
  });

  it("400-3: free-form question renders the no-options placeholder rather than omitting the element", () => {
    const freeFormRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-free-form.md"),
      "utf-8",
    );

    const batch = parseBatchComment(freeFormRaw);
    const q1 = batch.questions[0]!;
    expect(
      q1.options,
      `expected options:null for a question with no **Options**: label; fixture: 400-batch-comment-free-form.md`,
    ).toBe(null);

    const rendered = renderOptionsLine(q1);
    expect(
      rendered,
      `renderer must emit the free-form placeholder rather than dropping the **Options:** line`,
    ).toBe("**Options:** (free-form — no options posted)");
  });

  it("400-4: directive payload shapes — bare letter / letter+reason / skip / verbatim with semicolon", () => {
    const batchRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-a-colon.md"),
      "utf-8",
    );
    const batch = parseBatchComment(batchRaw);
    const q2 = batch.questions.find((q) => q.questionId === 2)!;
    const optionB = q2.options!.find((o) => o.letter === "B")!;

    const bareLetter = readFileSync(
      resolve(FIXTURES, "400-directives-bare-letter.txt"),
      "utf-8",
    );
    const bareLetterDirectives = parseDirectives(bareLetter, batch);
    expect(bareLetterDirectives).toEqual([
      {
        kind: "edit",
        questionId: 2,
        answer: optionB.text,
        rationale: null,
      },
    ] as Directive[]);

    const letterReason = readFileSync(
      resolve(FIXTURES, "400-directives-letter-reason.txt"),
      "utf-8",
    );
    const letterReasonDirectives = parseDirectives(letterReason, batch);
    expect(letterReasonDirectives).toEqual([
      {
        kind: "edit",
        questionId: 2,
        answer: optionB.text,
        rationale: "because it's mildly tolerant",
      },
    ] as Directive[]);

    const skip = readFileSync(
      resolve(FIXTURES, "400-directives-skip.txt"),
      "utf-8",
    );
    const skipDirectives = parseDirectives(skip, batch);
    expect(skipDirectives).toEqual([
      { kind: "skip", questionId: 2 },
    ] as Directive[]);

    const verbatimSemicolon = readFileSync(
      resolve(FIXTURES, "400-directives-verbatim-with-semicolon.txt"),
      "utf-8",
    );
    const verbatimDirectives = parseDirectives(verbatimSemicolon, batch);
    expect(
      verbatimDirectives.length,
      `token-anchored rule must not mis-split verbatim text containing a semicolon; fixture: 400-directives-verbatim-with-semicolon.txt; observed: ${JSON.stringify(verbatimDirectives)}`,
    ).toBe(1);
    const verbatim = verbatimDirectives[0]!;
    expect(verbatim.kind).toBe("edit");
    if (verbatim.kind === "edit") {
      expect(verbatim.questionId).toBe(2);
      expect(verbatim.rationale).toBe(null);
      expect(
        verbatim.answer,
        `verbatim answer must retain the embedded semicolon; observed: ${verbatim.answer}`,
      ).toContain(";");
      expect(verbatim.answer).toContain("We should defer this");
      expect(verbatim.answer).toContain("the tradeoff is unclear");
    }
  });

  it("400-5: single-line semicolon form parses identically to newline-separated form", () => {
    const batchRaw = readFileSync(
      resolve(FIXTURES, "400-batch-comment-a-colon.md"),
      "utf-8",
    );
    const batch = parseBatchComment(batchRaw);

    const newlineInput = readFileSync(
      resolve(FIXTURES, "400-directives-newline.txt"),
      "utf-8",
    );
    const semicolonInput = readFileSync(
      resolve(FIXTURES, "400-directives-semicolon-inline.txt"),
      "utf-8",
    );

    const newlineDirectives = parseDirectives(newlineInput, batch);
    const semicolonDirectives = parseDirectives(semicolonInput, batch);

    expect(
      semicolonDirectives,
      `Q2: B; Q4: skip must produce byte-identical Directive[] as newline-separated form; observed newline: ${JSON.stringify(newlineDirectives)}; observed semicolon: ${JSON.stringify(semicolonDirectives)}`,
    ).toEqual(newlineDirectives);

    expect(newlineDirectives.length).toBe(2);
    expect(newlineDirectives[0]!.kind).toBe("edit");
    expect(newlineDirectives[1]!.kind).toBe("skip");
    const q4 = newlineDirectives[1]!;
    if (q4.kind === "skip") expect(q4.questionId).toBe(4);
  });
});

// -----------------------------------------------------------------------------
// 402 — playbook AskUserQuestion invocation contract audit
//
// Structural check that commands/auto.md carries the load-bearing architecture:
// top-level `## AskUserQuestion invocation contract` section (Q1=B/Q4=C), ≤4
// harness ceiling stated in that section's body (finding #57 root cause),
// and cross-references from every gate contract G.1-G.5 (Q3=C). Prose-sniffing
// (fusion-vocabulary regex) is explicitly rejected; the audit is structural.
//
// 402-1: positive drift audit on current auto.md
// 402-2: negative-fixture regression against 402-drift-auto.md
// -----------------------------------------------------------------------------

const FIXTURE_402_DRIFT_AUTO = resolve(FIXTURES, "402-drift-auto.md");

type AuditSection = {
  depth: number;
  header: string;
  startLine: number;
  endLine: number;
  body: string;
};

type AuditReport = {
  sectionExists: boolean;
  boundPresent: boolean;
  gateReferences: Array<{ gate: string; hasReference: boolean }>;
};

function parseSections(content: string): AuditSection[] {
  const lines = content.split("\n");
  type Open = { depth: number; header: string; startLine: number; bodyStart: number };
  const sections: AuditSection[] = [];
  const open: Open[] = [];

  const closeUntil = (depth: number, endLine: number) => {
    while (open.length > 0 && open[open.length - 1]!.depth >= depth) {
      const o = open.pop()!;
      const body = lines.slice(o.bodyStart, endLine).join("\n");
      sections.push({
        depth: o.depth,
        header: o.header,
        startLine: o.startLine,
        endLine,
        body,
      });
    }
  };

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim().startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (!match) continue;
    const depth = match[1]!.length;
    if (depth < 2 || depth > 3) continue;
    closeUntil(depth, i);
    open.push({
      depth,
      header: line,
      startLine: i + 1,
      bodyStart: i + 1,
    });
  }
  closeUntil(0, lines.length);
  return sections;
}

function findContractSection(sections: AuditSection[]): AuditSection | null {
  for (const s of sections) {
    if (s.depth !== 2) continue;
    if (/askuserquestion invocation contract/i.test(s.header)) return s;
  }
  return null;
}

function findGateSections(sections: AuditSection[]): AuditSection[] {
  return sections.filter(
    (s) => s.depth === 3 && /^###\s+G\.\d(a|b|c|d)?\s+—\s+/.test(s.header),
  );
}

function extractGateName(header: string): string {
  const m = /^###\s+(G\.\d(?:a|b|c|d)?)\s+—/.exec(header);
  return m ? m[1]! : header;
}

function boundPresent(body: string): boolean {
  if (/≤\s?4\s?items?\s?per\s?call/i.test(body)) return true;
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const next = lines[i + 1] ?? "";
    if (line.includes("4 items") && line.includes("per call")) return true;
    if (line.includes("4 items") && next.includes("per call")) return true;
    if (line.includes("per call") && next.includes("4 items")) return true;
  }
  return false;
}

const EXPECTED_GATES = ["G.1", "G.2", "G.3", "G.4a", "G.4b", "G.4c", "G.4d", "G.5"] as const;

function auditContract(filePath: string): AuditReport {
  const content = readFileSync(filePath, "utf-8");
  const sections = parseSections(content);
  const contract = findContractSection(sections);
  if (!contract) {
    return {
      sectionExists: false,
      boundPresent: false,
      gateReferences: EXPECTED_GATES.map((gate) => ({ gate, hasReference: false })),
    };
  }
  const gateSections = findGateSections(sections);
  const observedGateNames = new Set(gateSections.map((s) => extractGateName(s.header)));
  const referenceByGate = new Map<string, boolean>();
  for (const gate of gateSections) {
    const name = extractGateName(gate.header);
    const has = gate.body.includes("AskUserQuestion invocation contract");
    referenceByGate.set(name, (referenceByGate.get(name) ?? false) || has);
  }
  // G.4a-d references may be carried by the shared G.4 section body (placement 1
  // per contracts/gate-contract-references.md); propagate G.4's reference to any
  // G.4<sub> subtypes present.
  const g4Ref = referenceByGate.get("G.4") ?? false;
  const gateReferences = EXPECTED_GATES.map((gate) => {
    let hasReference = referenceByGate.get(gate) ?? false;
    if (!hasReference && /^G\.4(a|b|c|d)$/.test(gate) && g4Ref) hasReference = true;
    // If a specific subtype section isn't present at H3 depth, fall back to the
    // shared G.4 section's reference — G.4a/b/c/d are documented in G.4's Options
    // table row rather than as separate H3 sections in the shipped auto.md.
    if (!observedGateNames.has(gate) && /^G\.4(a|b|c|d)$/.test(gate)) {
      hasReference = g4Ref;
    }
    return { gate, hasReference };
  });
  return {
    sectionExists: true,
    boundPresent: boundPresent(contract.body),
    gateReferences,
  };
}

describe("402 — playbook AskUserQuestion invocation contract audit", () => {
  it("402-1 (structural drift audit): auto.md has the contract section, the ≤4 bound, and cross-references from every gate contract", () => {
    const report = auditContract(AUTO_MD_PATH);
    const missingGates = report.gateReferences
      .filter((g) => !g.hasReference)
      .map((g) => g.gate);
    const failureMessage = [
      `Contract-audit drift detected:`,
      `  sectionExists: ${report.sectionExists}`,
      `  boundPresent: ${report.boundPresent}`,
      `  gateReferences:`,
      ...report.gateReferences.map((g) => `    ${g.gate}: ${g.hasReference}`),
      missingGates.length > 0
        ? `  missing references from: ${missingGates.join(", ")}`
        : ``,
    ].join("\n");

    expect(report.sectionExists, failureMessage).toBe(true);
    expect(report.boundPresent, failureMessage).toBe(true);
    expect(missingGates, failureMessage).toEqual([]);
  });

  it("402-2 (regression check): audit reports missing-contract-section on 402-drift-auto.md fixture", () => {
    const report = auditContract(FIXTURE_402_DRIFT_AUTO);
    expect(
      report.sectionExists,
      `expected sectionExists:false; fixture: 402-drift-auto.md; observed report: ${JSON.stringify(report)}`,
    ).toBe(false);
  });
});

// Silence TS unused-import warning if only used for type narrowing.
const _typeGuardParsedBatch = (b: ParsedBatch) => b.questions.length;
void _typeGuardParsedBatch;

// -----------------------------------------------------------------------------
// 403 — auto.md ledger-only contract + phase:* row + subagent diagnosis
// + invariants cost-contract
//
// The runtime is playbook prose interpreted by the model at slash-command
// time. The 403 fix locks in five contracts:
//   1. D.9-family ledger-only rows are cheap by contract (no re-check, no
//      status table, no prose recap).
//   2. A new D.9d row with `phase:*` prefix-match routes routine workflow-
//      phase transitions to ledger-line-only, preventing D.10 escalation.
//   3. D.7/D.11 diagnosis moves to a subagent whose return is a strict
//      JSON Verdict `{root_cause, evidence, recommended_action, confidence}`;
//      `recommended_action` is constrained to the gate's option strings.
//   4. Full epic status table emission is restricted to four permitted
//      surfaces (phase-complete, epic-complete, escalation gates, startup
//      sweep).
//   5. The § Invariants surface grows a §8 cost-contract line that survives
//      rewrites.
//
// The assertions grep auto.md for positive/negative anchors and exercise a
// tiny `parseVerdict` reference against fixture JSONs (matching the shape
// of the 396 `dispatchClassifier` inline reference).
// -----------------------------------------------------------------------------

type Verdict = {
  root_cause: string;
  evidence: string;
  recommended_action: string;
  confidence: "low" | "medium" | "high";
};

type ValidationError = { kind: "validation-error"; reason: string };

const D7_OPTIONS = [
  "Requeue (cockpit resume)",
  "Skip (session-local mute)",
  "Stop (exit auto)",
] as const;

const D11_VERDICT_OPTIONS = [
  "I've resolved it — advance the gate",
  "Skip (session-local mute)",
  "Stop (exit auto)",
] as const;

function parseVerdict(
  input: string,
  gateType: "D.7" | "D.11",
): Verdict | ValidationError {
  let raw: unknown;
  try {
    raw = JSON.parse(input);
  } catch (e) {
    return { kind: "validation-error", reason: `not valid JSON: ${(e as Error).message}` };
  }
  if (typeof raw !== "object" || raw === null) {
    return { kind: "validation-error", reason: "expected a JSON object" };
  }
  const obj = raw as Record<string, unknown>;
  if ("error" in obj) {
    return { kind: "validation-error", reason: `subagent returned error: ${String(obj.error)}` };
  }
  for (const field of ["root_cause", "evidence", "recommended_action", "confidence"]) {
    if (typeof obj[field] !== "string" || (obj[field] as string).length === 0) {
      return { kind: "validation-error", reason: `missing or non-string field: ${field}` };
    }
  }
  const confidence = obj.confidence as string;
  if (confidence !== "low" && confidence !== "medium" && confidence !== "high") {
    return {
      kind: "validation-error",
      reason: `confidence must be one of "low"|"medium"|"high"; got ${JSON.stringify(confidence)}`,
    };
  }
  const options: readonly string[] = gateType === "D.7" ? D7_OPTIONS : D11_VERDICT_OPTIONS;
  const action = obj.recommended_action as string;
  if (!options.includes(action)) {
    return {
      kind: "validation-error",
      reason: `recommended_action for ${gateType} must be one of ${JSON.stringify(options)}; got ${JSON.stringify(action)}`,
    };
  }
  return {
    root_cause: obj.root_cause as string,
    evidence: obj.evidence as string,
    recommended_action: action,
    confidence: confidence as Verdict["confidence"],
  };
}

function extractSubheadingBlock(md: string, header: string): string {
  const escaped = escapeRegExp(header);
  const re = new RegExp(`^### ${escaped}\\s*$`, "m");
  const m = re.exec(md);
  if (!m) throw new Error(`subheading '${header}' not found in auto.md`);
  const start = m.index;
  const rest = md.slice(start + m[0].length);
  const nextHeader = rest.search(/^### /m);
  const end = nextHeader === -1 ? rest.length : nextHeader;
  return rest.slice(0, end);
}

function extractInvariantsSection(md: string): string {
  const start = md.indexOf("\n## Invariants\n");
  if (start === -1) throw new Error("§ Invariants heading not found in auto.md");
  const rest = md.slice(start + 1);
  const nextH2 = rest.indexOf("\n## ", 1);
  return nextH2 === -1 ? rest : rest.slice(0, nextH2);
}

function extractH3Sections(md: string): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.startsWith("### ")) {
      const heading = line.slice(4).trim();
      const bodyLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.startsWith("### ") && !lines[i]!.startsWith("## ")) {
        bodyLines.push(lines[i]!);
        i++;
      }
      sections.push({ heading, body: bodyLines.join("\n") });
    } else {
      i++;
    }
  }
  return sections;
}

function phaseAwareDispatchClassifier(issue: FixtureIssue, ctx: DispatchContext): void {
  const token = issue.transition_class;
  if (token === "waiting-for:merge-conflicts") {
    d11Dispatch(issue, ctx);
    return;
  }
  // D.9d prefix-match branch — added by #403.
  if (token.startsWith("phase:")) {
    ctx.ledger(`${issue.issue_ref} · ${token} · (no-op) · engine-owned phase transition`);
    return;
  }
  if (token.startsWith("waiting-for:") && !NAMED_DISPATCH_TOKENS.has(token)) {
    const presentation = [
      `Unrecognized state on ${issue.issue_ref}:`,
      "",
      `Observed: ${token}`,
    ].join("\n");
    ctx.presentationBlocks.push(presentation);
    ctx.askUserQuestion({
      question: `How to proceed on ${issue.issue_ref}?`,
      header: "Escalate",
      options: D10_OPTIONS,
      multiSelect: false,
    });
    return;
  }
}

describe("403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract", () => {
  it("403-1: D.9 family subheadings state the no-re-check/no-prose contract verbatim", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const headers = [
      "D.9 — `waiting-for:address-pr-feedback` → ledger only",
      "D.9a — `waiting-for:pr-feedback` → ledger only",
      "D.9b — `waiting-for:children-complete` → ledger only",
      "D.9c — `waiting-for:dependencies` → ledger only",
    ];
    for (const header of headers) {
      const block = extractSubheadingBlock(autoMd, header);
      expect(
        block,
        `subheading '${header}' must contain 'no status table, no prose recap'`,
      ).toContain("no status table, no prose recap");
    }
  });

  it("403-2: new D.9d subheading exists with `phase:*` prefix-match, ledger-line-only dispatch, engine-owned phase transition outcome", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(autoMd, "D.9d — `phase:*` → ledger only");
    expect(block).toContain("Prefix-match");
    expect(block).toContain(
      "any transition class whose token begins with the literal `phase:` prefix matches this row",
    );
    expect(block).toContain("Ledger line only.");
    expect(block).toContain("no status table, no prose recap");
    expect(block).toContain("engine-owned phase transition");
    expect(block).toContain("Never surface a D.10 escalation gate on a `phase:*` token");
  });

  it("403-3: reference dispatch classifier prefix-matches `phase:*` to D.9d, not D.10 (fixtures: phase:plan and phase:someday)", () => {
    for (const fixtureName of [
      "403-phase-transition-live-state.json",
      "403-phase-someday-live-state.json",
    ]) {
      const fixture = JSON.parse(
        readFileSync(resolve(FIXTURES, fixtureName), "utf-8"),
      ) as FixtureLiveState;

      const askUserQuestion = vi.fn<(call: AskUserQuestionCall) => string>();
      const ledger = vi.fn<(line: string) => void>();
      const presentationBlocks: string[] = [];
      const ctx: DispatchContext = { askUserQuestion, ledger, presentationBlocks };

      const issue = fixture.issues[0]!;
      expect(issue.transition_class.startsWith("phase:")).toBe(true);

      phaseAwareDispatchClassifier(issue, ctx);

      // D.9d ledger-line-only: no escalation gate, no presentation block.
      expect(
        askUserQuestion,
        `phase:* fixture ${fixtureName} must NOT fire an AskUserQuestion (no D.10 escalation)`,
      ).not.toHaveBeenCalled();
      expect(presentationBlocks).toEqual([]);

      // Exactly one ledger line, with the engine-owned phase-transition outcome.
      expect(ledger).toHaveBeenCalledTimes(1);
      const ledgerLine = ledger.mock.calls[0]![0];
      expect(ledgerLine).toContain(issue.issue_ref);
      expect(ledgerLine).toContain(issue.transition_class);
      expect(ledgerLine).toContain("(no-op)");
      expect(ledgerLine).toContain("engine-owned phase transition");
    }
  });

  it("403-4: D.7 and D.11 state `cockpit_context(issue=<issue-ref>)` as sole evidence-fetch tool and dispatch further work to a subagent (no gh issue view --comments)", () => {
    // Post-#406: the sole evidence-fetch mechanism migrated from the Bash `generacy cockpit context`
    // form to the `cockpit_context` MCP tool. Assertion updated to match the migrated form.
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const d7Block = extractSubheadingBlock(
      autoMd,
      "D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)",
    );
    // #421: D.11 now also absorbs `blocked:stuck-merge-conflicts` (generacy#943
    // classifies it error-tier), so the gate heading names both labels.
    const d11Block = extractSubheadingBlock(
      autoMd,
      "D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)",
    );

    // Positive: sole-tool contract (post-#406 form).
    expect(d7Block).toContain("cockpit_context(issue=<issue-ref>)");
    expect(d11Block).toContain("cockpit_context(issue=<issue-ref>)");

    // Negative: no ad-hoc `gh issue view` INVOCATION in the step-1 prose.
    // The prose is allowed (and required) to name `gh issue view --comments`
    // as an explicit anti-pattern in a negation clause; the load-bearing
    // check is that no `Use \`gh issue view ...\`` or backticked invocation
    // shape survives. The invocation form has a positional issue-ref token
    // (`gh issue view <issue-ref>` or `gh issue view --comments <issue-ref>`)
    // whereas the negation form does not.
    const ghInvocationPattern = /`gh issue view[^`]*<issue-ref>[^`]*`/;
    expect(
      d7Block,
      `D.7 step-1 prose must not carry a gh issue view invocation with <issue-ref>`,
    ).not.toMatch(ghInvocationPattern);
    expect(
      d11Block,
      `D.11 step-1 prose must not carry a gh issue view invocation with <issue-ref>`,
    ).not.toMatch(ghInvocationPattern);
    // Also assert no `Use \`gh issue view` positive-instruction verb survives.
    expect(d7Block).not.toMatch(/Use\s+`gh issue view/);
    expect(d11Block).not.toMatch(/Use\s+`gh issue view/);

    // Subagent return-schema directive present verbatim in each.
    const schema =
      '{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}';
    expect(d7Block).toContain(schema);
    expect(d11Block).toContain(schema);
  });

  it("403-5: parseVerdict reference type shape + option-set constraint (fixtures: D.7 valid, D.11 valid, invalid-action)", () => {
    const d7Raw = readFileSync(resolve(FIXTURES, "403-d7-verdict-requeue.json"), "utf-8");
    const d11Raw = readFileSync(resolve(FIXTURES, "403-d11-verdict-resolved.json"), "utf-8");
    const invalidRaw = readFileSync(resolve(FIXTURES, "403-verdict-invalid-action.json"), "utf-8");

    const d7Result = parseVerdict(d7Raw, "D.7");
    expect(
      "kind" in d7Result && d7Result.kind === "validation-error",
      `D.7 valid fixture must parse cleanly; got: ${JSON.stringify(d7Result)}`,
    ).toBe(false);
    if (!("kind" in d7Result)) {
      expect(d7Result.recommended_action).toBe("Requeue (cockpit resume)");
      expect(d7Result.confidence).toBe("high");
    }

    const d11Result = parseVerdict(d11Raw, "D.11");
    expect(
      "kind" in d11Result && d11Result.kind === "validation-error",
      `D.11 valid fixture must parse cleanly; got: ${JSON.stringify(d11Result)}`,
    ).toBe(false);
    if (!("kind" in d11Result)) {
      expect(d11Result.recommended_action).toBe("I've resolved it — advance the gate");
    }

    // Invalid action fixture — must fail for both D.7 and D.11 gates.
    const invalidD7 = parseVerdict(invalidRaw, "D.7");
    expect("kind" in invalidD7 && invalidD7.kind === "validation-error").toBe(true);
    if ("kind" in invalidD7) {
      expect(invalidD7.reason).toContain("Merge it");
    }
    const invalidD11 = parseVerdict(invalidRaw, "D.11");
    expect("kind" in invalidD11 && invalidD11.kind === "validation-error").toBe(true);
    if ("kind" in invalidD11) {
      expect(invalidD11.reason).toContain("Merge it");
    }
  });

  it("403-6: § Invariants section contains at least eight numbered items; §8's opening substring is the cost-contract line", () => {
    // Post-#406: §9 (MCP-tool-only invariant) is appended without renumbering §1–§8.
    // Total item count is asserted at exactly nine by 406-6; this test verifies §8's
    // cost-contract line survived the append (defense-in-depth against renumbering).
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const invariants = extractInvariantsSection(autoMd);

    const numberedItems = invariants.match(/^\d+\.\s+\*\*/gm) ?? [];
    expect(
      numberedItems.length,
      `§ Invariants must have at least 8 numbered items; observed: ${numberedItems.length}\n${numberedItems.join("\n")}`,
    ).toBeGreaterThanOrEqual(8);

    const item8Match = invariants.match(/^8\.\s+\*\*[^*]+\*\*\s+([^\n]+)/m);
    expect(item8Match, "§ Invariants must have a numbered §8 with the cost-contract line").toBeTruthy();
    if (item8Match) {
      const item8Body = item8Match[1]!;
      expect(item8Body).toContain(
        "A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose.",
      );
    }
  });

  it("403-7: full epic status table anchor appears only at permitted surfaces (phase-complete, epic-complete, escalation gates, startup-sweep summary)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const anchor = "| Issue | Phase | State |";

    // Permitted surface heading patterns:
    //  - G.4 (all subtypes: G.4 heading covers a-d)
    //  - G.5 (phase-queue confirmation)
    //  - L.4 (status table policy — the policy statement itself)
    //  - L.6 (run summary at exit)
    //  - Startup sweep: currently the "startup sweep" prose lives in step 3
    //    of the Instructions section under a numbered list item, not a
    //    dedicated ### heading. If the anchor appears in a section not on
    //    the permitted list, fail with the section heading.
    const permittedHeadingPrefixes = [
      "G.4",
      "G.5",
      "L.4",
      "L.6",
    ];

    const sections = extractH3Sections(autoMd);
    const offenders: string[] = [];
    for (const section of sections) {
      if (!section.body.includes(anchor)) continue;
      const isPermitted = permittedHeadingPrefixes.some((prefix) =>
        section.heading.startsWith(prefix),
      );
      if (!isPermitted) {
        offenders.push(section.heading);
      }
    }
    expect(
      offenders,
      `full epic status table anchor appeared in non-permitted sections: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// 406 — cockpit MCP tool migration + `cockpit_await_events` loop
//
// The runtime is Claude interpreting the six migrated playbooks (auto, clarify,
// review, merge, queue, status) and calling `cockpit_*` MCP tools instead of
// Bash `generacy cockpit <verb>`. The tool-call classifier + typed-error parser
// below are the machine-checkable reference implementations of the audit shapes
// described in `specs/406-follow-up-generacy-ai/data-model.md`. Both live inline
// per the #396/#403 pattern — no runtime module.
// -----------------------------------------------------------------------------

type CockpitToolName =
  | "cockpit_status"
  | "cockpit_context"
  | "cockpit_queue"
  | "cockpit_advance"
  | "cockpit_resume"
  | "cockpit_merge"
  | "cockpit_await_events";

interface ToolCall {
  file: string;
  line: number;
  tool: CockpitToolName;
  declaredParams: readonly string[];
}

interface ToolSchema {
  name: CockpitToolName;
  requiredParams: readonly string[];
  optionalParams: readonly string[];
}

interface TypedError {
  code: string;
  message: string;
  details: Record<string, unknown>;
}

const COCKPIT_TOOL_NAMES: readonly CockpitToolName[] = [
  "cockpit_status",
  "cockpit_context",
  "cockpit_queue",
  "cockpit_advance",
  "cockpit_resume",
  "cockpit_merge",
  "cockpit_await_events",
];

const MIGRATED_VERBS = ["status", "context", "queue", "advance", "resume", "merge"] as const;

const MIGRATED_PLAYBOOK_NAMES = ["auto", "clarify", "review", "merge", "queue", "status"] as const;

function parseToolCalls(file: string, fileContent: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const lines = fileContent.split("\n");
  const toolRe =
    /cockpit_(status|context|queue|advance|resume|merge|await_events)\s*\(([^)]*)\)/g;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    toolRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = toolRe.exec(line)) !== null) {
      const tool = `cockpit_${m[1]}` as CockpitToolName;
      const argsRaw = m[2]!;
      const declaredParams: string[] = [];
      for (const part of argsRaw.split(",")) {
        const trimmed = part.trim();
        if (trimmed.length === 0) continue;
        const eq = trimmed.indexOf("=");
        const nameToken = (eq === -1 ? trimmed : trimmed.slice(0, eq)).trim();
        const idMatch = nameToken.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
        if (idMatch) declaredParams.push(idMatch[0]);
      }
      calls.push({ file, line: i + 1, tool, declaredParams });
    }
  }
  return calls;
}

function parseTypedError(input: string): TypedError | { errorKind: "parse" | "shape"; raw: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { errorKind: "parse", raw: input };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { errorKind: "shape", raw: input };
  }
  const obj = parsed as Record<string, unknown>;
  if (
    typeof obj.code !== "string" ||
    typeof obj.message !== "string" ||
    typeof obj.details !== "object" ||
    obj.details === null
  ) {
    return { errorKind: "shape", raw: input };
  }
  return {
    code: obj.code,
    message: obj.message,
    details: obj.details as Record<string, unknown>,
  };
}

function extractInstructionsSteps(md: string): Map<number, string> {
  const marker = "\n## Instructions\n";
  const start = md.indexOf(marker);
  if (start === -1) throw new Error("§ Instructions heading not found in auto.md");
  const rest = md.slice(start + marker.length);
  const nextH2 = rest.indexOf("\n## ");
  const body = nextH2 === -1 ? rest : rest.slice(0, nextH2);

  const steps = new Map<number, string>();
  const lines = body.split("\n");
  const stepRe = /^(\d+)\.\s+\*\*/;
  let currentStep = -1;
  let currentLines: string[] = [];
  for (const line of lines) {
    const m = line.match(stepRe);
    if (m) {
      if (currentStep >= 0) steps.set(currentStep, currentLines.join("\n"));
      currentStep = parseInt(m[1]!, 10);
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  if (currentStep >= 0) steps.set(currentStep, currentLines.join("\n"));
  return steps;
}

const FIXTURE_406_TOOL_SCHEMAS = resolve(FIXTURES, "406-tool-schemas.json");
const FIXTURE_406_MALFORMED_INPUT = resolve(FIXTURES, "406-malformed-ref-input.json");
const FIXTURE_406_MALFORMED_EXPECTED = resolve(FIXTURES, "406-malformed-ref-expected-error.json");

describe("406 — cockpit MCP tool migration + await-events loop", () => {
  it("406-1 (tool-contract audit): every cockpit_* call in migrated playbooks names a tool and params from the #917 schema snapshot", () => {
    const schemas = JSON.parse(readFileSync(FIXTURE_406_TOOL_SCHEMAS, "utf-8")) as ToolSchema[];
    const schemaByName = new Map(schemas.map((s) => [s.name, s]));
    const validToolNames = new Set(schemas.map((s) => s.name));

    const migratedPlaybooks = MIGRATED_PLAYBOOK_NAMES.map((n) => resolve(COMMANDS_DIR, `${n}.md`));

    const problems: string[] = [];
    for (const file of migratedPlaybooks) {
      const content = readFileSync(file, "utf-8");
      const calls = parseToolCalls(file, content);
      for (const call of calls) {
        if (!validToolNames.has(call.tool)) {
          problems.push(`${call.file}:${call.line} unknown tool ${call.tool}`);
          continue;
        }
        const schema = schemaByName.get(call.tool)!;
        const validParams = new Set<string>([...schema.requiredParams, ...schema.optionalParams]);
        for (const p of call.declaredParams) {
          if (!validParams.has(p)) {
            problems.push(
              `${call.file}:${call.line} tool ${call.tool} unknown param '${p}' (declared: [${call.declaredParams.join(", ")}]; valid: [${[...validParams].join(", ")}])`,
            );
          }
        }
        if (call.declaredParams.length > 0) {
          const declared = new Set(call.declaredParams);
          for (const req of schema.requiredParams) {
            if (!declared.has(req)) {
              problems.push(
                `${call.file}:${call.line} tool ${call.tool} missing required param '${req}' (declared: [${call.declaredParams.join(", ")}])`,
              );
            }
          }
        }
      }
    }

    expect(problems, `\nTool-contract audit failures:\n${problems.join("\n")}`).toEqual([]);
  });

  it("406-2 (no residual CLI verb): migrated playbooks have zero `generacy cockpit <migrated-verb>` invocations; watch.md retains `generacy cockpit watch`", () => {
    const cliVerbRe = new RegExp(`generacy cockpit (${MIGRATED_VERBS.join("|")})\\b`);
    const migratedPlaybooks = MIGRATED_PLAYBOOK_NAMES.map((n) => resolve(COMMANDS_DIR, `${n}.md`));
    const hits: string[] = [];
    for (const file of migratedPlaybooks) {
      const lines = readFileSync(file, "utf-8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (cliVerbRe.test(lines[i]!)) {
          hits.push(`${file}:${i + 1}  ${lines[i]!.trim()}`);
        }
      }
    }
    expect(hits, `\nResidual CLI verbs found:\n${hits.join("\n")}`).toEqual([]);

    // Positive-inverse: watch.md must retain the `watch` verb (it is out-of-scope for #406).
    const watchContent = readFileSync(resolve(COMMANDS_DIR, "watch.md"), "utf-8");
    expect(/generacy cockpit watch\b/.test(watchContent)).toBe(true);
  });

  // #420 supersedes the #406 loop shape: the 55s long-poll is replaced by a
  // sensor armed under the harness `Monitor` tool, whose stdout lines wake the
  // model. `cockpit_await_events` survives as the sole typed-batch source, but
  // is now a fast drain (`maxWaitMs=1`) rather than the thing that blocks.
  // #431 further supersedes the sensor CLI verb: `generacy cockpit watch` is
  // replaced by `generacy cockpit doorbell`, which attaches to the shared
  // event-bus poll loop `cockpit_await_events` drains rather than running its
  // own poll cycle — one loop per epic, halving background GraphQL cost.
  it("406-3 (post-#420/#431 wake-driven loop shape): auto.md step 4 drains cockpit_await_events on a Monitor wake with maxWaitMs=1 and no 55s long-poll; step 2 arms `generacy cockpit doorbell` under Monitor, not run_in_background, and `generacy cockpit watch` is retired from the auto sensor", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const steps = extractInstructionsSteps(autoMd);
    const step2 = steps.get(2) ?? "";
    const step4 = steps.get(4) ?? "";

    expect(step4, "auto.md step 4 must contain `cockpit_await_events` at least once").toContain(
      "cockpit_await_events",
    );
    // The sensor is armed under the harness `Monitor` tool (#420 C2), never a
    // raw backgrounded Bash process.
    expect(step2.includes("run_in_background: true")).toBe(false);
    expect(step2, "auto.md step 2 must arm the sensor under `Monitor`").toContain("Monitor");
    // #431: the auto sensor is `generacy cockpit doorbell`, not the pre-#431
    // `generacy cockpit watch`. A regression to `watch` would silently
    // reintroduce the double-poll condition #431 exists to fix.
    expect(step2, "auto.md step 2 must spawn `generacy cockpit doorbell` as the sensor").toContain(
      "generacy cockpit doorbell",
    );
    expect(
      /generacy cockpit watch\b/.test(step2),
      "auto.md step 2 must not spawn `generacy cockpit watch` (retired in #431 for the auto sensor; `/cockpit:watch` retains it in watch.md)",
    ).toBe(false);
    // #420 C3: step 4 is wake-driven — the drain runs on a Monitor-delivered
    // wake (or a ScheduleWakeup heartbeat fire), not a blocking long-poll.
    expect(step4, "auto.md step 4 must be Monitor-wake driven").toContain("Monitor");
    expect(step4, "auto.md step 4 must drain with maxWaitMs=1").toContain("maxWaitMs=1");
    expect(
      step4.includes("maxWaitMs=55000"),
      "auto.md step 4 must not reinstate the 55s long-poll (#420 SC-001/SC-002)",
    ).toBe(false);
    // #431: step 4's Monitor-delivered wake references `generacy cockpit doorbell`
    // as the sensor source (not `generacy cockpit watch`).
    expect(
      /generacy cockpit watch\b/.test(step4),
      "auto.md step 4 must not reference `generacy cockpit watch` as the sensor (retired in #431)",
    ).toBe(false);
  });

  it("406-4 (in-memory cursor): auto.md steps 4/5 state cursor is in-memory only, reference the recovery convergence, and carry no on-disk cursor path", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const steps = extractInstructionsSteps(autoMd);
    const step4And5 = (steps.get(4) ?? "") + "\n" + (steps.get(5) ?? "");

    expect(/cursor.*in.?memory only/i.test(step4And5)).toBe(true);
    expect(/\.cockpit\/cursor|state\/cursor|cursor\.json/.test(step4And5)).toBe(false);
    // Recovery convergence: invalid-cursor / resetFrom / expiry all trigger startup sweep + re-arm cursor-less.
    expect(step4And5).toContain("invalid-cursor");
    expect(step4And5).toContain("resetFrom");
    expect(step4And5.toLowerCase()).toContain("startup sweep");
    expect(/re-arm/i.test(step4And5)).toBe(true);
  });

  it("406-5 (startup sweep tool-presence check): auto.md step 3 names the seven cockpit_* tools, has the load-bearing ledger line + guidance verbatim, and no AskUserQuestion in the fail-loud paragraph", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const steps = extractInstructionsSteps(autoMd);
    const step3 = steps.get(3) ?? "";

    const LEDGER_LINE_ON_MISSING =
      "startup · cockpit-mcp-tools-missing · abort · see cluster-base#75";
    const GUIDANCE_ON_MISSING =
      "cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75";

    expect(step3).toContain(LEDGER_LINE_ON_MISSING);
    expect(step3).toContain(GUIDANCE_ON_MISSING);
    for (const tool of COCKPIT_TOOL_NAMES) {
      expect(step3, `step 3 must name the ${tool} tool in the presence check`).toContain(tool);
    }

    // No AskUserQuestion in the ±10-line window around the fail-loud paragraph.
    const step3Lines = step3.split("\n");
    const failLoudIdx = step3Lines.findIndex((l) => l.includes("cockpit-mcp-tools-missing"));
    expect(failLoudIdx).toBeGreaterThanOrEqual(0);
    const windowStart = Math.max(0, failLoudIdx - 10);
    const windowEnd = Math.min(step3Lines.length, failLoudIdx + 11);
    const failLoudWindow = step3Lines.slice(windowStart, windowEnd).join("\n");
    expect(failLoudWindow.includes("AskUserQuestion")).toBe(false);
  });

  it("406-6 (invariant §9): auto.md § Invariants has exactly nine numbered items; §9 opens verbatim; §1–§8 opening substrings survive", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const invariants = extractInvariantsSection(autoMd);

    const numberedItems = invariants.match(/^\d+\.\s+\*\*/gm) ?? [];
    expect(
      numberedItems.length,
      `§ Invariants must have exactly 9 numbered items; observed: ${numberedItems.length}`,
    ).toBe(9);

    // Extract §n opening lines (line beginning with `<n>. `) into a map.
    const openings = new Map<number, string>();
    const openingRe = /^(\d+)\.\s+(.+)$/gm;
    let om: RegExpExecArray | null;
    while ((om = openingRe.exec(invariants)) !== null) {
      openings.set(parseInt(om[1]!, 10), om[2]!);
    }

    const expectations: ReadonlyArray<{ n: number; includes: string }> = [
      { n: 1, includes: "Never merge on red." },
      { n: 2, includes: "Cockpit comments marked." },
      { n: 3, includes: "Add-only advance." },
      { n: 4, includes: "No cross-slash-command invocation" },
      { n: 5, includes: "Analysis in subagents" },
      { n: 6, includes: "Autonomy" },
      { n: 7, includes: "Stream consumption is unfiltered." },
      { n: 8, includes: "Ledger-only rows are cheap by contract." },
    ];
    for (const { n, includes } of expectations) {
      const opening = openings.get(n);
      expect(opening, `§${n} must exist in § Invariants`).toBeDefined();
      expect(
        opening!.includes(includes),
        `§${n} opening should include '${includes}'; got: '${opening}'`,
      ).toBe(true);
    }

    // §9 opening substring verbatim (the load-bearing rule a future rewrite has to survive).
    const item9Opening = openings.get(9);
    expect(item9Opening, "§9 must exist in § Invariants").toBeDefined();
    const item9Anchor =
      "**MCP-tool-only invariant.** After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form —";
    expect(item9Opening!.startsWith(item9Anchor)).toBe(true);
  });

  it("406-7 (typed-ref error shape): parseTypedError preserves code/message/details verbatim from the malformed-ref fixture — no CLI-stderr re-wrapping", () => {
    const inputRaw = readFileSync(FIXTURE_406_MALFORMED_INPUT, "utf-8");
    const expectedRaw = readFileSync(FIXTURE_406_MALFORMED_EXPECTED, "utf-8");

    const parsed = parseTypedError(expectedRaw);
    expect("code" in parsed, `expected fixture must parse into a TypedError; got: ${JSON.stringify(parsed)}`).toBe(true);
    if ("code" in parsed) {
      expect(parsed.code).toBe("invalid-ref");
      expect(parsed.message).toBe(
        "Ref 'generacy-ai/agency!403' does not match the expected shape 'owner/repo#N'.",
      );
      expect(parsed.details).toMatchObject({
        input: "generacy-ai/agency!403",
        expectedShape: "owner/repo#N",
        suggestedFix: "Replace '!' with '#'.",
      });
    }

    // Sanity: the input fixture describes a malformed-ref call site (cockpit_context with bang-instead-of-hash).
    const input = JSON.parse(inputRaw) as {
      tool: string;
      declaredParams: { issue: string };
    };
    expect(input.tool).toBe("cockpit_context");
    expect(input.declaredParams.issue).toBe("generacy-ai/agency!403");
  });
});

// -----------------------------------------------------------------------------
// 408 — auto.md § step 5 cursor-error class split + circuit breaker
//
// The runtime is playbook prose interpreted by the model at slash-command
// time. Pre-#408, § step 5 collapses all three cursor-error signals
// (`invalid-cursor`, `resetFrom`, cursor expiry) onto ONE unconditional
// recovery path — silent sweep-per-batch degradation with no operator
// escalation. The #408 fix restores the class split (post-#924 taxonomy):
//   - Branch A (`resetFrom` / expiry / `discarded`) → recover + per-class
//     ledger accounting.
//   - Branch B (`invalid-cursor`) → recover once, escalate at count ≥ 2
//     via a new G.4(e) gate whose options are
//     `Continue degraded (sweep-per-batch)` and `Stop (exit auto)`.
// New ledger-line shape: `<epic-ref> · cursor-recovery · <class> · <N>`.
//
// The audit is STRUCTURAL, not prose-sniffing (per #402's Q3=C precedent):
// it checks anchors (branches, verbatim option strings, code-span shape)
// rather than the vocabulary of "class split", "circuit breaker", etc.
// -----------------------------------------------------------------------------

const FIXTURE_408_DRIFT_AUTO = resolve(FIXTURES, "408-drift-auto.md");

type Step5AuditReport = {
  step5Present: boolean;
  branchAResetFrom: boolean;
  branchBInvalidCursor: boolean;
  optionContinueDegraded: boolean;
  optionStopExit: boolean;
  ledgerShapePresent: boolean;
};

const BRANCH_A_CLASSES = ["resetFrom", "expiry", "discarded"] as const;

function findTokenLines(bodyLines: string[], token: string): number[] {
  const hits: number[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (bodyLines[i]!.includes(token)) hits.push(i);
  }
  return hits;
}

// Two occurrences are on "distinct branches" iff between them appears a
// paragraph break (blank line), a bold-heading separator (`**Branch …**`),
// or a separate list bullet at the same depth. Structural — never
// regexes fusion vocabulary.
function onDistinctBranch(bodyLines: string[], aLine: number, bLine: number): boolean {
  const [lo, hi] = aLine <= bLine ? [aLine, bLine] : [bLine, aLine];
  if (lo === hi) return false;
  for (let i = lo + 1; i < hi; i++) {
    const line = bodyLines[i]!;
    if (line.trim() === "") return true;
    if (/\*\*Branch\s+[A-Z]/i.test(line)) return true;
    if (/^\s*(?:-|\*|\d+\.)\s+/.test(line)) {
      const aTrimmed = bodyLines[lo]!.trimStart();
      const bTrimmed = bodyLines[hi]!.trimStart();
      const iTrimmed = line.trimStart();
      const aIsBullet = /^(?:-|\*|\d+\.)\s+/.test(aTrimmed);
      const bIsBullet = /^(?:-|\*|\d+\.)\s+/.test(bTrimmed);
      const iIndent = line.length - line.trimStart().length;
      const aIndent = bodyLines[lo]!.length - aTrimmed.length;
      const bIndent = bodyLines[hi]!.length - bTrimmed.length;
      if (aIsBullet && bIsBullet && iIndent === aIndent && iIndent === bIndent) {
        return true;
      }
    }
  }
  return false;
}

function auditStep5(filePath: string): Step5AuditReport {
  const md = readFileSync(filePath, "utf-8");
  let steps: Map<number, string>;
  try {
    steps = extractInstructionsSteps(md);
  } catch {
    return {
      step5Present: false,
      branchAResetFrom: false,
      branchBInvalidCursor: false,
      optionContinueDegraded: false,
      optionStopExit: false,
      ledgerShapePresent: false,
    };
  }
  const step5 = steps.get(5);
  if (step5 === undefined || !/^5\.\s+\*\*Cursor recovery/.test(step5)) {
    return {
      step5Present: false,
      branchAResetFrom: false,
      branchBInvalidCursor: false,
      optionContinueDegraded: false,
      optionStopExit: false,
      ledgerShapePresent: false,
    };
  }

  const bodyLines = step5.split("\n");

  const invalidLines = findTokenLines(bodyLines, "invalid-cursor");
  let branchAResetFrom = false;
  let branchBInvalidCursor = false;
  for (const cls of BRANCH_A_CLASSES) {
    const clsLines = findTokenLines(bodyLines, cls);
    for (const cLine of clsLines) {
      for (const iLine of invalidLines) {
        if (onDistinctBranch(bodyLines, cLine, iLine)) {
          branchAResetFrom = true;
          branchBInvalidCursor = true;
          break;
        }
      }
      if (branchAResetFrom) break;
    }
    if (branchAResetFrom) break;
  }

  const optionContinueDegraded =
    step5.includes("Continue degraded (sweep-per-batch)") ||
    md.includes("Continue degraded (sweep-per-batch)");
  const optionStopExit =
    step5.includes("Stop (exit auto)") || md.includes("Stop (exit auto)");

  const ledgerCodeSpanRe =
    /`[^`]*cursor-recovery\s+·\s+[a-zA-Z-]+\s+·\s+(?:<[^>`]+>|\d+)[^`]*`/;
  const ledgerFencedRe =
    /cursor-recovery\s+·\s+[a-zA-Z-]+\s+·\s+(?:<[^>]+>|\d+)/;
  const ledgerShapePresent =
    ledgerCodeSpanRe.test(step5) ||
    ledgerCodeSpanRe.test(md) ||
    ledgerFencedRe.test(step5) ||
    ledgerFencedRe.test(md);

  return {
    step5Present: true,
    branchAResetFrom,
    branchBInvalidCursor,
    optionContinueDegraded,
    optionStopExit,
    ledgerShapePresent,
  };
}

describe("408 — auto.md § step 5 cursor-error class split + circuit breaker", () => {
  it("408-1 (structural drift audit): auto.md § step 5 has the class split, both G.4(e) options, and the cursor-recovery ledger-line shape", () => {
    const report = auditStep5(AUTO_MD_PATH);
    const failureMessage = [
      `Cursor-recovery drift detected in auto.md § step 5:`,
      `  step5Present: ${report.step5Present}`,
      `  branchAResetFrom: ${report.branchAResetFrom}`,
      `  branchBInvalidCursor: ${report.branchBInvalidCursor}`,
      `  optionContinueDegraded: ${report.optionContinueDegraded}`,
      `  optionStopExit: ${report.optionStopExit}`,
      `  ledgerShapePresent: ${report.ledgerShapePresent}`,
    ].join("\n");

    expect(report.step5Present, failureMessage).toBe(true);
    expect(report.branchAResetFrom, failureMessage).toBe(true);
    expect(report.branchBInvalidCursor, failureMessage).toBe(true);
    expect(report.optionContinueDegraded, failureMessage).toBe(true);
    expect(report.optionStopExit, failureMessage).toBe(true);
    expect(report.ledgerShapePresent, failureMessage).toBe(true);
  });

  it("408-2 (negative-fixture regression): audit reports at least one structural failure on 408-drift-auto.md", () => {
    const report = auditStep5(FIXTURE_408_DRIFT_AUTO);
    const anyFailure =
      !report.branchAResetFrom ||
      !report.branchBInvalidCursor ||
      !report.optionContinueDegraded ||
      !report.optionStopExit ||
      !report.ledgerShapePresent;
    expect(
      anyFailure,
      `expected at least one structural check to fail on 408-drift-auto.md; observed report: ${JSON.stringify(report)}`,
    ).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// 410 — auto.md D.7 repeat-failure dispatch fresh-evidence rule + verdict-schema
// addendum + G.4(b) sixth-element row
// -----------------------------------------------------------------------------

const FIXTURE_410_DRIFT_AUTO = resolve(FIXTURES, "410-drift-auto.md");

type D7AuditReport = {
  d7Present: boolean;
  firstDispatchSubPath: boolean;
  repeatDispatchSubPath: boolean;
  failureClassChangedField: boolean;
  failureClassesSeenField: boolean;
  noParentCharacterizationRule: boolean;
  g4bSixthElementRow: boolean;
};

const FIRST_DISPATCH_ANCHOR = /first[\s-]dispatch/i;
const REPEAT_DISPATCH_ANCHOR = /repeat[\s-]dispatch/i;
const NO_PARENT_CHARACTERIZATION_PATTERN =
  /parent\s+MUST\s+NOT\s+(characterize|summarize|assert\s+similarity)|MUST\s+NOT\s+characterize|no\s+parent-authored|not\s+the\s+parent'?s\s+role\s+to\s+(characterize|summarize)/i;

function extractDispatchSteps(sectionBody: string): Map<number, string> {
  const lines = sectionBody.split("\n");
  const steps = new Map<number, string>();
  const stepRe = /^(\d+)\.\s+\*\*/;
  let currentStep = -1;
  let currentLines: string[] = [];
  for (const line of lines) {
    const m = line.match(stepRe);
    if (m) {
      if (currentStep >= 0) steps.set(currentStep, currentLines.join("\n"));
      currentStep = parseInt(m[1]!, 10);
      currentLines = [line];
    } else if (currentStep >= 0) {
      currentLines.push(line);
    }
  }
  if (currentStep >= 0) steps.set(currentStep, currentLines.join("\n"));
  return steps;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function anchorHasCockpitContext(bodyLines: string[], anchorLine: number): boolean {
  const line = bodyLines[anchorLine]!;
  if (line.includes("cockpit_context")) return true;
  const baseIndent = indentOf(line);
  for (let j = anchorLine + 1; j < bodyLines.length; j++) {
    const next = bodyLines[j]!;
    if (next.trim() === "") break;
    if (indentOf(next) <= baseIndent) break;
    if (next.includes("cockpit_context")) return true;
  }
  return false;
}

function anchorsAtBulletOrParagraphSeparation(
  bodyLines: string[],
  a: number,
  b: number,
): boolean {
  if (a === b) return false;
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  for (let i = lo + 1; i < hi; i++) {
    if (bodyLines[i]!.trim() === "") return true;
  }
  const aTrim = bodyLines[lo]!.trimStart();
  const bTrim = bodyLines[hi]!.trimStart();
  const bulletRe = /^(?:-|\*|\d+\.)\s+/;
  if (bulletRe.test(aTrim) && bulletRe.test(bTrim)) return true;
  return false;
}

function findAnchorLines(bodyLines: string[], anchor: RegExp): number[] {
  const hits: number[] = [];
  for (let i = 0; i < bodyLines.length; i++) {
    if (anchor.test(bodyLines[i]!)) hits.push(i);
  }
  return hits;
}

function extractG4bBlock(g4SectionBody: string): string {
  const lines = g4SectionBody.split("\n");
  const startIdx = lines.findIndex((l) => /^\*\*\(b\)\s/.test(l));
  if (startIdx === -1) return "";
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^\*\*\([a-e]\)\s/.test(lines[i]!)) {
      endIdx = i;
      break;
    }
  }
  return lines.slice(startIdx, endIdx).join("\n");
}

function auditD7(filePath: string): D7AuditReport {
  const emptyReport: D7AuditReport = {
    d7Present: false,
    firstDispatchSubPath: false,
    repeatDispatchSubPath: false,
    failureClassChangedField: false,
    failureClassesSeenField: false,
    noParentCharacterizationRule: false,
    g4bSixthElementRow: false,
  };

  const content = readFileSync(filePath, "utf-8");
  const sections = parseSections(content);

  const d7Section = sections.find(
    (s) => s.depth === 3 && /^###\s+D\.7\s+—/.test(s.header),
  );
  if (!d7Section) return emptyReport;

  const stepBodies = extractDispatchSteps(d7Section.body);
  const step1 = stepBodies.get(1) ?? "";
  const step2 = stepBodies.get(2) ?? "";
  const step1Lines = step1.split("\n");

  const firstLines = findAnchorLines(step1Lines, FIRST_DISPATCH_ANCHOR);
  const repeatLines = findAnchorLines(step1Lines, REPEAT_DISPATCH_ANCHOR);

  let firstDispatchSubPath = false;
  let repeatDispatchSubPath = false;
  outer: for (const fLine of firstLines) {
    for (const rLine of repeatLines) {
      if (!anchorsAtBulletOrParagraphSeparation(step1Lines, fLine, rLine)) continue;
      if (
        anchorHasCockpitContext(step1Lines, fLine) &&
        anchorHasCockpitContext(step1Lines, rLine)
      ) {
        firstDispatchSubPath = true;
        repeatDispatchSubPath = true;
        break outer;
      }
    }
  }

  const failureClassChangedField = step2.includes("failure_class_changed");
  const failureClassesSeenField = step2.includes("failure_classes_seen");
  const noParentCharacterizationRule =
    NO_PARENT_CHARACTERIZATION_PATTERN.test(step1) ||
    NO_PARENT_CHARACTERIZATION_PATTERN.test(step2);

  const g4Section = sections.find(
    (s) => s.depth === 3 && /^###\s+G\.4\s+—/.test(s.header),
  );
  const g4bBlock = g4Section ? extractG4bBlock(g4Section.body) : "";
  const g4bSixthElementRow = g4bBlock.includes("Failure class changed since prior");

  return {
    d7Present: true,
    firstDispatchSubPath,
    repeatDispatchSubPath,
    failureClassChangedField,
    failureClassesSeenField,
    noParentCharacterizationRule,
    g4bSixthElementRow,
  };
}

describe("410 — auto.md D.7 repeat-failure dispatch fetches fresh evidence + failure_class_changed verdict field", () => {
  it("410-1 (structural drift audit): D.7 has first-vs-repeat sub-path split, verdict-schema addendum, no-parent-characterization rule, and G.4(b) sixth-element row", () => {
    const report = auditD7(AUTO_MD_PATH);
    const failureMessage = [
      `D.7 drift detected in auto.md § D.7:`,
      `  d7Present: ${report.d7Present}`,
      `  firstDispatchSubPath: ${report.firstDispatchSubPath}`,
      `  repeatDispatchSubPath: ${report.repeatDispatchSubPath}`,
      `  failureClassChangedField: ${report.failureClassChangedField}`,
      `  failureClassesSeenField: ${report.failureClassesSeenField}`,
      `  noParentCharacterizationRule: ${report.noParentCharacterizationRule}`,
      `  g4bSixthElementRow: ${report.g4bSixthElementRow}`,
    ].join("\n");

    expect(report.d7Present, `D.7 extraction failed\n${failureMessage}`).toBe(true);
    expect(
      report.firstDispatchSubPath,
      `first-dispatch sub-path anchor missing\n${failureMessage}`,
    ).toBe(true);
    expect(
      report.repeatDispatchSubPath,
      `repeat-dispatch sub-path anchor missing\n${failureMessage}`,
    ).toBe(true);
    expect(
      report.failureClassChangedField,
      `failure_class_changed field missing from D.7 step 2\n${failureMessage}`,
    ).toBe(true);
    expect(
      report.failureClassesSeenField,
      `failure_classes_seen field missing from D.7 step 2\n${failureMessage}`,
    ).toBe(true);
    expect(
      report.noParentCharacterizationRule,
      `no-parent-characterization rule anchor missing\n${failureMessage}`,
    ).toBe(true);
    expect(
      report.g4bSixthElementRow,
      `G.4(b) 'Failure class changed since prior' row missing\n${failureMessage}`,
    ).toBe(true);
  });

  it("410-2 (negative-fixture regression): audit reports at least one structural failure on 410-drift-auto.md", () => {
    const report = auditD7(FIXTURE_410_DRIFT_AUTO);
    expect(
      report.d7Present,
      `expected d7Present:true on fixture; observed report: ${JSON.stringify(report)}`,
    ).toBe(true);
    const anyFailure =
      !report.firstDispatchSubPath ||
      !report.repeatDispatchSubPath ||
      !report.failureClassChangedField ||
      !report.failureClassesSeenField ||
      !report.noParentCharacterizationRule ||
      !report.g4bSixthElementRow;
    expect(
      anyFailure,
      `expected at least one structural check to fail on 410-drift-auto.md; observed report: ${JSON.stringify(report)}`,
    ).toBe(true);
  });
});

// -----------------------------------------------------------------------------
// 416 — operator-requested capability: intent-class recognition, filing-gate
// iterative edit shape, D.8 ad-hoc enumeration, scope-drained gate defaults
//
// The runtime is Claude interpreting the § Add-issue flow prose (add-existing
// + file-new intents), § Gate contract G.6 (filing gate), § Gate contract G.7
// (scope-drained gate), and § Dispatch D.8's extended presentation. The tests
// below feed fixtures through the pure `parseAddExistingIntent` /
// `parseFileNewIntent` reference parsers (416-1/416-2) and assert the
// structural shape of the G.6 filing-gate iterative edit (416-3) and the D.8
// ad-hoc enumeration + G.7 scope-drained gate defaults (416-4).
// -----------------------------------------------------------------------------

const FILING_GATE_FIELD_LABELS = [
  "**Title:**",
  "**Labels:**",
  "**Body:**",
  "**Filing target:**",
  "**Parent tracking ref:**",
] as const;

const G7_OPTION_LABELS = [
  "Keep watching (Recommended)",
  "Add more work",
  "Finish (close tracking issue + summary)",
] as const;

describe("416 — operator-requested capability", () => {
  it("416-1: parseAddExistingIntent returns the expected ref for full/shorthand/multi phrasings and null on non-ref chat", () => {
    const fullRef = readFileSync(
      resolve(FIXTURES, "416-add-existing-full-ref.txt"),
      "utf-8",
    );
    const shorthand = readFileSync(
      resolve(FIXTURES, "416-add-existing-shorthand.txt"),
      "utf-8",
    );
    const multiRefs = readFileSync(
      resolve(FIXTURES, "416-add-existing-multiple-refs.txt"),
      "utf-8",
    );
    const nonrefChat = readFileSync(
      resolve(FIXTURES, "416-add-existing-nonref-chat.txt"),
      "utf-8",
    );

    expect(parseAddExistingIntent(fullRef)).toEqual({
      ref: "generacy-ai/agency#420",
    } as AddExistingIntent);
    expect(parseAddExistingIntent(shorthand)).toEqual({
      ref: "#420",
    } as AddExistingIntent);

    // Multiple refs — first parseable ref wins.
    const multi = parseAddExistingIntent(multiRefs);
    expect(
      multi,
      `expected first-parseable ref win on multi-ref input; got: ${JSON.stringify(multi)}`,
    ).toEqual({ ref: "#420" } as AddExistingIntent);

    expect(
      parseAddExistingIntent(nonrefChat),
      `expected null on non-ref chat (confirm-intent path); got: ${JSON.stringify(parseAddExistingIntent(nonrefChat))}`,
    ).toBeNull();
  });

  it("416-2: parseFileNewIntent returns a non-null topic for canonical trigger patterns and null for ambiguous chat", () => {
    const fileAnIssue = readFileSync(
      resolve(FIXTURES, "416-file-new-file-an-issue.txt"),
      "utf-8",
    );
    const openABug = readFileSync(
      resolve(FIXTURES, "416-file-new-open-a-bug.txt"),
      "utf-8",
    );
    const createAnIssue = readFileSync(
      resolve(FIXTURES, "416-file-new-create-an-issue.txt"),
      "utf-8",
    );
    const ambiguousLookAt = readFileSync(
      resolve(FIXTURES, "416-file-new-ambiguous-look-at.txt"),
      "utf-8",
    );

    const fileAn = parseFileNewIntent(fileAnIssue);
    expect(fileAn, `expected non-null on canonical "file an issue" phrasing`).not.toBeNull();
    expect((fileAn as FileNewIntent).topic.length).toBeGreaterThan(0);
    // Trailing "and process it" clause is stripped so the topic is
    // recognizable; the canonical fixture's leading topic is preserved.
    expect((fileAn as FileNewIntent).topic).toContain("the flaky test in module X");

    const openBug = parseFileNewIntent(openABug);
    expect(openBug, `expected non-null on "open a bug for" variant`).not.toBeNull();
    expect((openBug as FileNewIntent).topic).toContain("the timeout regression");

    const createIssue = parseFileNewIntent(createAnIssue);
    expect(createIssue, `expected non-null on "create an issue about" variant`).not.toBeNull();
    expect((createIssue as FileNewIntent).topic).toContain("the missing loading state");

    expect(
      parseFileNewIntent(ambiguousLookAt),
      `expected null on ambiguous "look at X" chat — MUST NOT auto-trigger G.6`,
    ).toBeNull();
  });

  it("416-3: filing-gate first-draft and revised presentation share the five-element block layout", () => {
    const firstDraft = readFileSync(
      resolve(FIXTURES, "416-filing-gate-first-draft.md"),
      "utf-8",
    );
    const revised = readFileSync(
      resolve(FIXTURES, "416-filing-gate-revised.md"),
      "utf-8",
    );

    for (const label of FILING_GATE_FIELD_LABELS) {
      expect(
        firstDraft.includes(label),
        `first-draft fixture missing five-element label '${label}'`,
      ).toBe(true);
      expect(
        revised.includes(label),
        `revised-draft fixture missing five-element label '${label}'`,
      ).toBe(true);
    }

    // Both fixtures share the header framing ("Filing new issue for <tracking-ref>:").
    const HEADER_RE = /^Filing new issue for [^\s]+:/m;
    expect(
      HEADER_RE.test(firstDraft),
      `first-draft header must match "Filing new issue for <tracking-ref>:"`,
    ).toBe(true);
    expect(
      HEADER_RE.test(revised),
      `revised-draft header must match "Filing new issue for <tracking-ref>:" (full-draft re-present, not a diff view)`,
    ).toBe(true);

    // Field contents differ between rounds (guards against a fixture that
    // accidentally duplicated the first draft — the 416-3 invariant is that
    // contents may differ, but the shape is identical).
    expect(
      firstDraft,
      `first-draft and revised fixtures should differ in field contents`,
    ).not.toEqual(revised);
  });

  it("416-4: D.8 ad-hoc enumeration block presence/absence + recommendation flip; G.7 shows Keep watching (Recommended) and per-ref disposition", () => {
    const ADHOC_HEADER = "Open ad-hoc issues in scope (added mid-run):";

    const d8None = readFileSync(resolve(FIXTURES, "416-d8-adhoc-none.md"), "utf-8");
    const d8One = readFileSync(resolve(FIXTURES, "416-d8-adhoc-one.md"), "utf-8");
    const d8Two = readFileSync(resolve(FIXTURES, "416-d8-adhoc-two.md"), "utf-8");

    // Empty ad-hoc list: block omitted; two-option gate with Queue P<next> recommended.
    expect(d8None.includes(ADHOC_HEADER)).toBe(false);
    expect(d8None).toContain("Queue P2 (4 issues) (Recommended)");
    expect(d8None).not.toContain("Hold — ");

    // One ad-hoc issue: block present; three-option gate with Hold recommended.
    expect(d8One).toContain(ADHOC_HEADER);
    expect(d8One).toContain("Hold — 1 open ad-hoc issue(s) in scope (Recommended)");
    expect(d8One).toContain("Queue P2 (4 issues)");
    expect(d8One).not.toContain("Queue P2 (4 issues) (Recommended)");

    // Two ad-hoc issues: block enumerates both; Hold recommended.
    expect(d8Two).toContain(ADHOC_HEADER);
    expect(d8Two).toContain("Hold — 2 open ad-hoc issue(s) in scope (Recommended)");
    expect(d8Two).toContain("generacy-ai/agency#420");
    expect(d8Two).toContain("generacy-ai/agency#421");

    // G.7 fixtures — Keep watching (Recommended) present; per-ref disposition rendered.
    const g7Completed = readFileSync(
      resolve(FIXTURES, "416-scope-drained-completed-only.md"),
      "utf-8",
    );
    const g7Mixed = readFileSync(
      resolve(FIXTURES, "416-scope-drained-mixed.md"),
      "utf-8",
    );
    const g7NotPlanned = readFileSync(
      resolve(FIXTURES, "416-scope-drained-not-planned-only.md"),
      "utf-8",
    );

    for (const fixture of [g7Completed, g7Mixed, g7NotPlanned]) {
      for (const label of G7_OPTION_LABELS) {
        expect(
          fixture.includes(label),
          `G.7 fixture missing option label '${label}'`,
        ).toBe(true);
      }
      expect(fixture).toContain("**Per-ref disposition:**");
      expect(fixture).toContain("**Tracking ref:**");
      expect(fixture).toContain("**Refs processed:**");
    }

    // Q1 anchor — closed-as-not-planned is terminal per the classifier; the
    // not-planned-only fixture MUST still be a valid G.7 presentation (i.e.,
    // it fired at all — the terminality decision is the classifier's).
    expect(g7NotPlanned).toContain(" · not-planned");
    expect(g7NotPlanned).not.toContain(" · completed"); // sanity: fixture is all-not-planned
    expect(g7Completed).toContain(" · completed");
    expect(g7Mixed).toContain(" · completed");
    expect(g7Mixed).toContain(" · not-planned");
  });
});

// -----------------------------------------------------------------------------
// 429 — corrected postcondition Leg 1 + login-normalization preamble
//
// #429 replaces the buggy `response.comments.length == bundle.comments.length`
// Leg 1 rule (which read a non-existent field and re-POSTed every successful
// review) with a paginated GET + filter on `pull_request_review_id`, and
// introduces a contract-wide `[bot]`-suffix-strip + case-fold `Login
// normalization` preamble in `postcondition-check.md`. The four assertions
// below pin the corrected wording present + the buggy substring absent across
// both edited contract docs. No existing pin covers the pre-#429 Leg 1 text
// (verified in plan.md § Constitution Check), so this is a pure addition.
// -----------------------------------------------------------------------------

const POSTCONDITION_CHECK_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "specs",
  "422-summary-auto-md-s",
  "contracts",
  "postcondition-check.md",
);
const REQUEST_CHANGES_POST_PATH = resolve(
  __dirname,
  "..",
  "..",
  "..",
  "specs",
  "422-summary-auto-md-s",
  "contracts",
  "request-changes-post.md",
);

describe("429 — corrected postcondition Leg 1 + login-normalization preamble", () => {
  it("429-1: postcondition-check.md contains the corrected Leg 1 procedure (paginated GET + pull_request_review_id filter)", () => {
    const md = readFileSync(POSTCONDITION_CHECK_PATH, "utf-8");
    expect(
      md,
      "postcondition-check.md must name the paginated inline-comments endpoint",
    ).toContain("GET /repos/{owner}/{repo}/pulls/{pull_number}/comments");
    expect(
      md,
      "postcondition-check.md must state the join-key filter on pull_request_review_id",
    ).toContain("pull_request_review_id == response.id");
  });

  it("429-2: postcondition-check.md does NOT contain the buggy substring `response.comments.length`", () => {
    const md = readFileSync(POSTCONDITION_CHECK_PATH, "utf-8");
    expect(
      md.includes("response.comments.length"),
      "regression bar — the pre-#429 buggy Leg 1 phrasing must never return to postcondition-check.md",
    ).toBe(false);
  });

  it("429-3: request-changes-post.md does NOT contain `response.comments.length` and does NOT capture `.comments[].length`", () => {
    const md = readFileSync(REQUEST_CHANGES_POST_PATH, "utf-8");
    expect(
      md.includes("response.comments.length"),
      "regression bar — the pre-#429 buggy Leg 1 phrasing must never return to request-changes-post.md",
    ).toBe(false);
    expect(
      md.includes(".comments[].length"),
      "§ Execution Capture list must not name `.comments[].length` — the POST response has no `comments` field",
    ).toBe(false);
  });

  it("429-4: postcondition-check.md carries the `## Login normalization` H2 preamble", () => {
    const md = readFileSync(POSTCONDITION_CHECK_PATH, "utf-8");
    expect(
      md,
      "postcondition-check.md must open with (or otherwise contain) a `## Login normalization` H2 preamble section",
    ).toContain("## Login normalization");
  });
});

// commander.js short-circuits `--help` before validating the subcommand — `generacy cockpit <unknown-verb> --help`
// prints the *parent* help and exits 0, so the pre-#433 probe false-passed on doorbell-absent clusters. The negative
// pin catches full reverts, partial reverts, and half-merges that leave the broken form in either L41 or L53. Scope
// of the negative match is `cockpit doorbell --help` (with `--help` flag) — NOT the bare `generacy cockpit doorbell`
// sensor invocation, which is legitimate and pinned by 406-3.
describe("433 — auto.md doorbell probe uses pure verb-existence form, not the commander --help short-circuit", () => {
  it("433-1: auto.md pre-flight uses `generacy cockpit help doorbell` and never the broken `cockpit doorbell --help` form", () => {
    const md = readFileSync(AUTO_MD_PATH, "utf-8");
    expect(
      md,
      "positive pin: auto.md must contain the corrected verb-existence probe `generacy cockpit help doorbell`",
    ).toContain("generacy cockpit help doorbell");
    expect(
      md.includes("cockpit doorbell --help"),
      "negative pin: the literal string `cockpit doorbell --help` must appear nowhere in auto.md — commander.js short-circuits `--help` before subcommand validation, so this form false-passes on doorbell-absent clusters",
    ).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// 437 — enriched-line dispatch drops the per-event `cockpit_status(epic, json=true)`
// re-check for label-driven classes (D.1–D.4, D.7, D.9/D.9a–D.9d) and consults the
// baked `checks` verdict for D.5/D.6 — retaining the re-check only for D.8, D.10,
// D.11 (human/consequential gates). The doorbell subprocess (generacy#985) now
// emits an NDJSON line per event carrying `{ to, labels, checks?, ... }`; the
// parent parses it and dispatches directly. Pins:
//   437-1 — step 4a is now the unified "Resolve authoritative state" contract;
//           the pre-#437 "advisory / live is authoritative" wording is retired.
//   437-2 — D.1–D.4 and D.7 dispatch narrations name the enriched line's
//           `to`/`labels` as source-of-truth; no positive per-event re-check
//           imperative remains in those blocks.
//   437-3 — § Invariants §7 retains the anti-drop clause and cross-references
//           the § Enriched-line dispatch contract; the pre-#437
//           "never parsed for content" clause is retired.
//   437-4 — § Ledger section carries the literal `source: enriched-line`
//           marker vocabulary.
//   437-5 — D.5/D.6 narrations name both `absent` AND `pending` as fallback
//           triggers (per Q4=B). Q4=A defer-on-pending is explicitly rejected.
//   437-6 — D.8/D.10/D.11 narrations state the retain-the-re-check rule as
//           a positive obligation.
// -----------------------------------------------------------------------------

function extractLedgerSection(md: string): string {
  const start = md.indexOf("\n## Ledger\n");
  if (start === -1) throw new Error("§ Ledger heading not found in auto.md");
  const rest = md.slice(start + 1);
  const nextH2 = rest.indexOf("\n## ", 1);
  return nextH2 === -1 ? rest : rest.slice(0, nextH2);
}

describe("437 — auto.md enriched-line dispatch drops per-event cockpit_status re-check for label-driven classes", () => {
  it("437-1: step 4a is the unified `Resolve authoritative state` contract that prefers the enriched line; pre-#437 `advisory / live is authoritative` wording is retired", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const steps = extractInstructionsSteps(autoMd);
    const step4 = steps.get(4) ?? "";

    // Positive: the new unified contract wording is present in step 4.
    expect(
      step4,
      "positive pin: step 4a must open with the new `Resolve authoritative state.` contract wording",
    ).toContain("Resolve authoritative state");
    expect(
      step4,
      "positive pin: step 4a must state the priority as `Prefer the enriched doorbell line`",
    ).toContain("Prefer the enriched");

    // Negative: the pre-#437 canonical phrase is gone from all of auto.md, not
    // just step 4 (a partial revert that reintroduces it elsewhere is a drift).
    expect(
      autoMd.includes("The batch event is advisory; the live return is authoritative"),
      "negative pin: the pre-#437 phrase `The batch event is advisory; the live return is authoritative` must appear nowhere in auto.md",
    ).toBe(false);
  });

  it("437-2: D.1–D.4 and D.7 dispatch narrations name the enriched line's `to`/`labels` as source-of-truth; no positive per-event `cockpit_status` re-check imperative remains", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const headers = [
      "D.1 — `waiting-for:clarification`",
      "D.2 — `waiting-for:<artifact>-review`",
      "D.3 — `waiting-for:implementation-review`",
      "D.4 — `waiting-for:manual-validation`",
      "D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)",
    ];
    for (const header of headers) {
      const block = extractSubheadingBlock(autoMd, header);

      // Positive: block names the enriched line's `to` and `labels` as source-of-truth.
      expect(
        block,
        `positive pin (${header}): dispatch narration must name the enriched line's \`to\` as source-of-truth`,
      ).toContain("`to`");
      expect(
        block,
        `positive pin (${header}): dispatch narration must name the enriched line's \`labels\` as source-of-truth`,
      ).toContain("`labels`");
      expect(
        block,
        `positive pin (${header}): dispatch narration must reference the § Enriched-line dispatch contract`,
      ).toContain("Enriched-line dispatch contract");

      // Negative: no positive per-event re-check imperative remains. The pre-#437
      // shape had a `Re-check live state via cockpit_status(...)` imperative bullet;
      // the post-#437 blocks only mention `cockpit_status` inside a negation clause
      // ("no per-event `cockpit_status(...)` re-check fires on the enriched-line path")
      // or inside a scoped fallback rule — neither of which matches the imperative
      // regex below.
      expect(
        block,
        `negative pin (${header}): dispatch narration must NOT contain the pre-#437 \`Re-check live state\` imperative`,
      ).not.toMatch(/Re-check live state/);
    }
  });

  it("437-3: § Invariants §7 retains the anti-drop clause and cross-references the § Enriched-line dispatch contract; the pre-#437 `never parsed for content` clause is retired", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const invariants = extractInvariantsSection(autoMd);

    // §7 is the "Stream consumption is unfiltered" invariant.
    const item7Match = invariants.match(/^7\.\s+\*\*Stream consumption is unfiltered\.\*\*([^]*?)(?=^\d+\.\s+\*\*|$)/m);
    expect(
      item7Match,
      "positive pin: § Invariants must contain a §7 opening with `Stream consumption is unfiltered.`",
    ).toBeTruthy();
    const item7Body = item7Match![1]!;

    // Positive: §7 references the § Enriched-line dispatch contract as the parse authority.
    expect(
      item7Body,
      "positive pin: §7 must cross-reference the § Enriched-line dispatch contract",
    ).toContain("Enriched-line dispatch contract");
    // Positive: §7 retains the anti-drop protection (content-based filters prohibited).
    expect(
      item7Body,
      "positive pin: §7 must retain the anti-drop clause `content-based filters` prohibition",
    ).toMatch(/content-based filters/i);

    // Negative: the pre-#437 `never parsed for content` phrase is retired.
    expect(
      item7Body.includes("never parsed for content"),
      "negative pin: the pre-#437 phrase `never parsed for content` must not appear inside § Invariants §7",
    ).toBe(false);
  });

  it("437-4: § Ledger section carries the literal `source: enriched-line` marker vocabulary", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const ledger = extractLedgerSection(autoMd);

    // Positive-only pin: the literal marker string appears in the § Ledger section
    // (per contracts/enriched-line-dispatch.md C8 row 437-4). Post-mortems `grep`
    // on this string to isolate enriched-line dispatch rows from fallback re-query
    // rows, so the marker's presence in the ledger vocabulary is load-bearing.
    expect(
      ledger,
      "positive pin: § Ledger section must contain the literal `source: enriched-line` marker",
    ).toContain("source: enriched-line");
  });

  it("437-5: D.5/D.6 narrations name both `absent` AND `pending` as fallback triggers; the Q4=A defer-on-pending phrasing is rejected", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const headers = [
      "D.5 — `completed:validate` (checks green) → merge without gate",
      "D.6 — `completed:validate` (red) / merge red → bounded fixer subagent",
    ];
    for (const header of headers) {
      const block = extractSubheadingBlock(autoMd, header);

      // Positive: block names both `absent` and `pending` as fallback triggers per Q4=B.
      expect(
        block,
        `positive pin (${header}): narration must name \`absent\` as a fallback trigger`,
      ).toContain("absent");
      expect(
        block,
        `positive pin (${header}): narration must name \`pending\` as a fallback trigger`,
      ).toContain("pending");

      // Negative: Q4=A defer-on-pending is rejected. The pre-#437 clarification round
      // considered a "defer this wake / wait for the next doorbell fire" phrasing —
      // it must appear nowhere in D.5/D.6 dispatch narrations.
      expect(
        block,
        `negative pin (${header}): narration must NOT contain a defer-on-pending phrasing (Q4=A rejection)`,
      ).not.toMatch(/defer\s+(this\s+wake|on\s+pending)/i);
    }
  });

  it("437-6: D.8/D.10/D.11 narrations state the retain-the-re-check rule as a positive obligation", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const headers = [
      "D.8 — `phase-complete` → phase-queue confirmation gate",
      "D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)",
      "D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)",
    ];
    for (const header of headers) {
      const block = extractSubheadingBlock(autoMd, header);

      // Positive-only pin: retain-the-re-check phrase is a positive obligation. The
      // three classes open human/consequential gates where a stale-line dispatch
      // could open a gate against superseded state — future authors editing these
      // dispatch rows read the retain rule from the block itself. The regex is
      // permissive on what follows `cockpit_status` (the D.8/D.10/D.11 wordings
      // spell the argument list explicitly, e.g., `cockpit_status(epic=<epic-ref>, json=true)`).
      expect(
        block,
        `positive pin (${header}): narration must state the retain-the-re-check obligation`,
      ).toMatch(/retain[s]?\s+the\s+per-event\s+`cockpit_status/);
    }
  });
});

describe("444 — /cockpit:auto Form 4 — token parsing, dispatch, and library contracts", () => {
  const WORKSPACE: WorkspaceRepo = {
    owner: "generacy-ai",
    repo: "agency",
    originUrl: "https://github.com/generacy-ai/agency.git",
  };

  it("444-lib-1 parseTokens: empty-token discard (Q5=A), trailing-comma tolerance, whitespace normalization", () => {
    const singleBare = readFileSync(resolve(FIXTURES, "444-parse-tokens-single-bare.txt"), "utf-8");
    const multiComma = readFileSync(resolve(FIXTURES, "444-parse-tokens-multi-comma.txt"), "utf-8");
    const multiSpace = readFileSync(resolve(FIXTURES, "444-parse-tokens-multi-space.txt"), "utf-8");
    const mixed = readFileSync(resolve(FIXTURES, "444-parse-tokens-mixed.txt"), "utf-8");
    const trailing = readFileSync(resolve(FIXTURES, "444-parse-tokens-trailing-comma.txt"), "utf-8");
    const unknownFlag = readFileSync(resolve(FIXTURES, "444-parse-tokens-unknown-flag.txt"), "utf-8");
    const bothFlags = readFileSync(resolve(FIXTURES, "444-parse-tokens-both-flags.txt"), "utf-8");

    expect(parseTokens(singleBare).tokens).toEqual(["512"]);
    expect(parseTokens(singleBare).isEmpty).toBe(false);
    expect(parseTokens(multiComma).tokens).toEqual(["512", "513", "514"]);
    expect(parseTokens(multiSpace).tokens).toEqual(["512", "513", "514"]);
    expect(parseTokens(mixed).tokens).toEqual(["512", "other/repo#41", "513"]);
    expect(parseTokens(trailing).tokens).toEqual(["512", "513"]);
    expect(parseTokens("").isEmpty).toBe(true);
    expect(parseTokens("   ,, ,, ").isEmpty).toBe(true);

    const uf = parseTokens(unknownFlag);
    expect(uf.flags.unknown).toEqual(["--tracing"]);
    expect(uf.tokens).toEqual(["512"]);

    const bf = parseTokens(bothFlags);
    expect(bf.flags.tracking).toBe(true);
    expect(bf.flags.new).toBe(true);
  });

  it("444-lib-2 dispatchForm: seven-branch table from data-model.md § E3", () => {
    // 1. Both flags.
    expect(dispatchForm(parseTokens("--tracking foo/bar#1 --new title"))).toEqual({
      form: "usage-error",
      reason: "both-flags",
    });
    // 2. Unknown flag.
    expect(dispatchForm(parseTokens("--tracing 512"))).toEqual({
      form: "usage-error",
      reason: "unknown-flag",
    });
    // 3. --tracking with correct shape → tracking-existing.
    const trackingOk = dispatchForm(parseTokens("--tracking foo/bar#42"));
    expect(trackingOk.form).toBe("tracking-existing");
    if (trackingOk.form === "tracking-existing") {
      expect(trackingOk.trackingRef.owner).toBe("foo");
      expect(trackingOk.trackingRef.repo).toBe("bar");
      expect(trackingOk.trackingRef.number).toBe(42);
    }
    // 3-bad: --tracking with wrong shape.
    expect(dispatchForm(parseTokens("--tracking 42")).form).toBe("usage-error");
    // 4. --new with title.
    const newOk = dispatchForm(parseTokens('--new some-title'));
    expect(newOk.form).toBe("tracking-new");
    // 5. Single qualified ref → epic.
    const epic = dispatchForm(parseTokens("foo/bar#99"));
    expect(epic.form).toBe("epic");
    if (epic.form === "epic") expect(epic.epicRef.number).toBe(99);
    // 6a. Single bare number → tracking-list (Form 4).
    expect(dispatchForm(parseTokens("512")).form).toBe("tracking-list");
    // 6b. Multi-bare → tracking-list.
    expect(dispatchForm(parseTokens("512 513 514")).form).toBe("tracking-list");
    // 6c. Mixed bare + qualified (multiple) → tracking-list (not epic).
    expect(dispatchForm(parseTokens("512 foo/bar#41")).form).toBe("tracking-list");
    // 7. Empty invocation.
    expect(dispatchForm(parseTokens(""))).toEqual({
      form: "usage-error",
      reason: "empty",
    });
  });

  it("444-lib-3 parseWorkspaceRepo: HTTPS, SSH shorthand, SSH long form; non-GitHub returns null", () => {
    const https = parseWorkspaceRepo("https://github.com/generacy-ai/agency.git");
    expect(https).not.toBeNull();
    expect(https!.owner).toBe("generacy-ai");
    expect(https!.repo).toBe("agency");

    const httpsNoDotGit = parseWorkspaceRepo("https://github.com/generacy-ai/agency");
    expect(httpsNoDotGit!.owner).toBe("generacy-ai");
    expect(httpsNoDotGit!.repo).toBe("agency");

    const sshShort = parseWorkspaceRepo("git@github.com:generacy-ai/agency.git");
    expect(sshShort!.owner).toBe("generacy-ai");
    expect(sshShort!.repo).toBe("agency");

    const sshLong = parseWorkspaceRepo("ssh://git@github.com/generacy-ai/agency.git");
    expect(sshLong!.owner).toBe("generacy-ai");
    expect(sshLong!.repo).toBe("agency");

    expect(parseWorkspaceRepo("git@gitlab.example.com:owner/repo.git")).toBeNull();
    expect(parseWorkspaceRepo("https://gitlab.com/owner/repo.git")).toBeNull();
    expect(parseWorkspaceRepo("")).toBeNull();
  });

  it("444-lib-4 resolveRefs: bare/qualified dedup collapses to one; first-seen order preserved", () => {
    const resolved = resolveRefs(["512", "generacy-ai/agency#512", "513"], WORKSPACE);
    expect(resolved.refs).toHaveLength(2);
    expect(resolved.refs[0]!.number).toBe(512);
    expect(resolved.refs[0]!.supplied).toBe("bare");
    expect(resolved.refs[1]!.number).toBe(513);

    // First-seen order preserved: 513, 512 → order 513, 512.
    const reversed = resolveRefs(["513", "512"], WORKSPACE);
    expect(reversed.refs.map((r) => r.number)).toEqual([513, 512]);

    // Mixed workspace + cross-repo.
    const mixed = resolveRefs(["512", "other/repo#41", "513"], WORKSPACE);
    expect(mixed.refs).toHaveLength(3);
    expect(mixed.refs[1]!.owner).toBe("other");
    expect(mixed.refs[1]!.repo).toBe("repo");
    expect(mixed.refs[1]!.number).toBe(41);
  });

  it("444-lib-5 formatTitle: ≤5 refs inline, (+K more) for >5, short-form vs qualified rendering", () => {
    const oneRef = resolveRefs(["512"], WORKSPACE);
    expect(formatTitle(oneRef.refs, WORKSPACE, "2026-07-21")).toBe(
      "Tracking: auto session 2026-07-21 — #512",
    );

    const fiveRefs = resolveRefs(["1", "2", "3", "4", "5"], WORKSPACE);
    expect(formatTitle(fiveRefs.refs, WORKSPACE, "2026-07-21")).toBe(
      "Tracking: auto session 2026-07-21 — #1 #2 #3 #4 #5",
    );

    const eightRefs = resolveRefs(["1", "2", "3", "4", "5", "6", "7", "8"], WORKSPACE);
    expect(formatTitle(eightRefs.refs, WORKSPACE, "2026-07-21")).toBe(
      "Tracking: auto session 2026-07-21 — #1 #2 #3 #4 #5 (+3 more)",
    );

    // Mixed: workspace-local short-form, cross-repo qualified.
    const mixed = resolveRefs(["512", "other/repo#41"], WORKSPACE);
    expect(formatTitle(mixed.refs, WORKSPACE, "2026-07-21")).toBe(
      "Tracking: auto session 2026-07-21 — #512 other/repo#41",
    );
  });

  it("444-lib-6 formatBody: every line fully-qualified regardless of workspace-locality", () => {
    const refs = resolveRefs(["512", "other/repo#41", "513"], WORKSPACE);
    expect(formatBody(refs.refs)).toBe(
      "- [ ] generacy-ai/agency#512\n- [ ] other/repo#41\n- [ ] generacy-ai/agency#513",
    );
    expect(formatBody([])).toBe("");
  });

  it("444-lib-7 refSetEqual + parseBodyRefs: reuse HIT on identical, MISS on superset; malformed ignored", () => {
    const hitBody = readFileSync(resolve(FIXTURES, "444-body-reuse-hit.md"), "utf-8");
    const missBody = readFileSync(resolve(FIXTURES, "444-body-reuse-miss.md"), "utf-8");
    const invocation = resolveRefs(["512", "513", "other/repo#41"], WORKSPACE);

    const hitRefs = parseBodyRefs(hitBody);
    expect(hitRefs).toHaveLength(3);
    expect(refSetEqual(invocation.refs, hitRefs)).toBe(true);

    const missRefs = parseBodyRefs(missBody);
    expect(missRefs).toHaveLength(4);
    expect(refSetEqual(invocation.refs, missRefs)).toBe(false);

    // Order-agnostic + dedup-agnostic set equality.
    const a: QualifiedRef[] = [
      { owner: "o", repo: "r", number: 1, supplied: "bare" },
      { owner: "o", repo: "r", number: 2, supplied: "qualified" },
    ];
    const b: QualifiedRef[] = [
      { owner: "o", repo: "r", number: 2, supplied: "bare" },
      { owner: "o", repo: "r", number: 1, supplied: "qualified" },
      { owner: "o", repo: "r", number: 1, supplied: "bare" }, // duplicate
    ];
    expect(refSetEqual(a, b)).toBe(true);

    // Malformed body lines: parseBodyRefs ignores non-matching bullets.
    const malformed = "- [ ] not-a-ref\n- some prose\n* [ ] o/r#5\n- [ ] o/r#7\n";
    expect(parseBodyRefs(malformed).map((r) => r.number)).toEqual([7]);
  });

  it("444-1 form-list pin: step 1 lists exactly four Form bullets in order (epic, tracking-existing, tracking-new, tracking-list)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1);
    expect(step1, "step 1 must exist in auto.md § Instructions").toBeDefined();

    // Four form bullets must appear in order.
    const idxForm1 = step1!.indexOf("**Form 1 (epic mode)**");
    const idxForm2 = step1!.indexOf("**Form 2 (epic-less: existing tracking)**");
    const idxForm3 = step1!.indexOf("**Form 3 (epic-less: new tracking)**");
    const idxForm4 = step1!.indexOf("**Form 4 (epic-less: issue-number list)**");

    expect(idxForm1, "Form 1 bullet must appear in step 1").toBeGreaterThanOrEqual(0);
    expect(idxForm2, "Form 2 bullet must appear in step 1").toBeGreaterThan(idxForm1);
    expect(idxForm3, "Form 3 bullet must appear in step 1").toBeGreaterThan(idxForm2);
    expect(idxForm4, "Form 4 bullet must appear in step 1").toBeGreaterThan(idxForm3);

    // Each form's usage-string fragment must appear exactly once in step 1.
    const fragments = [
      "/cockpit:auto <epic-ref>",
      "/cockpit:auto --tracking <issue-ref>",
      '/cockpit:auto --new "<title>"',
      "/cockpit:auto <issue-list>",
    ];
    for (const frag of fragments) {
      const count = step1!.split(frag).length - 1;
      expect(count, `fragment '${frag}' must appear at least once in step 1`).toBeGreaterThanOrEqual(1);
    }
  });

  it("444-2 usage-string pin: step 1 contains the literal extended usage line", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    expect(step1).toContain(
      'Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>',
    );
  });

  it("444-3 cockpit:tracking label prose pin: literal appears in auto.md step 1 Form 4 branch AND in tracking-issue-body contract", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    expect(step1, "auto.md step 1 must reference the cockpit:tracking label (Form 4 branch)").toContain(
      "cockpit:tracking",
    );

    const contractPath = resolve(
      __dirname,
      "..",
      "..",
      "..",
      "specs",
      "444-summary-cockpit-auto-accept",
      "contracts",
      "tracking-issue-body.md",
    );
    const contract = readFileSync(contractPath, "utf-8");
    expect(contract, "tracking-issue-body.md must reference the cockpit:tracking label").toContain(
      "cockpit:tracking",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 449 UI-mode gates — Cockpit Remote Gates (skill-side rework)
//
// Pins the wire-contract-driven contract additions to auto.md:
//   - `--gates=ui|local|auto` step-1 flag (V1 parse; auto resolution; ui hard-fail)
//   - § UI-mode gate mapping section with a 10-row table (G.1, G.2, G.3, G.4a,
//     G.4b, G.4c, G.4d, G.5, G.6, G.7 — G.4e explicitly excluded)
//   - Dispatch class D.12 (`gate-answer`) row + subsection
//   - § UI-mode fallback on `cockpit_gate_open` call error subsection
//   - `· source: ui-gate` / `· source: ui-gate-fallback` ledger suffix rules
//   - Q2=B extended startup-sweep trigger set
//
// These are drift audits — if a heading rename, row-count change, or contract-
// rule edit breaks a pin, re-pin to the NEW contract in the same PR. Do NOT
// weaken or delete an assertion to make the test pass (CLAUDE.md § Cockpit
// playbook pins).
// ────────────────────────────────────────────────────────────────────────────
describe("449 UI-mode gates", () => {
  it("449-1 usage string extended with --gates flag (literal, two-line block)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    // Verbatim extension per contracts/gates-flag-parse.md § Usage-string extension
    // (research.md § R1). Two-line usage block; second line's `[` aligns with the
    // `/` of `/cockpit:auto` (7 spaces of alignment). The whole block sits inside
    // step 1's numbered-list body (3 extra spaces of list indent), so the second
    // line carries 10 spaces total in the raw file.
    expect(step1).toContain(
      "Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new \"<title>\" | <issue-list>\n          [--gates=ui|local|auto]  (default: auto)",
    );
  });

  it("449-2 step 1 declares the `--gates` orthogonal flag with values ui|local|auto and default auto", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    // Flag parse presence + value set + default (V1)
    expect(step1).toContain("--gates=<value>");
    expect(step1).toContain("`ui` / `local` / `auto`");
    expect(step1).toContain("Default when absent: `auto`");
  });

  it("449-3 step 1 ambiguity table has `gates-value-invalid` and `gates-duplicate` reasons", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    // Two new ambiguity-table rows (V1)
    expect(step1).toContain("gates-value-invalid (<observed>)");
    expect(step1).toContain("gates-duplicate");
  });

  it("449-4 step 1 verbatim `--gates=ui` pre-flight absence hard-fail error string (Q3=A)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    // Verbatim error per contracts/gates-flag-parse.md § Pre-flight absence.
    // Exact spacing, exact wording — this is the load-bearing operator-facing
    // string; drift here changes the operator-visible failure mode.
    expect(step1).toContain(
      "--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto",
    );
  });

  it("449-5 step 1 declares the `--gates=auto` two-part resolution rule (tool binding + cluster cloud-activated)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    // Two-part check + decided-once semantics (research.md § R2)
    expect(step1).toContain("cockpit_gate_open");
    expect(step1).toContain("cluster cloud-activated");
    expect(step1).toMatch(/decided ONCE at pre-flight|does not flip mid-run/i);
    expect(step1).toContain("ResolvedGateMode");
  });

  it("449-6 step 1 `Auto run starting …` line format includes gates + source (both example resolutions)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step1 = extractInstructionsSteps(autoMd).get(1)!;
    // Two illustrative examples per quickstart.md § Expected output
    expect(step1).toContain("Auto run starting · gates: ui (source: --gates=ui)");
    expect(step1).toContain(
      "Auto run starting · gates: local (source: --gates=auto → cockpit_gate_open unbound)",
    );
  });

  it("449-7 § UI-mode gate mapping section exists with the pinned heading", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Top-level section heading is pinned; row-count assertion in 449-8 depends
    // on this section being present.
    expect(autoMd).toMatch(/^## UI-mode gate mapping \(G\.1–G\.7\)$/m);
  });

  it("449-8 UI-mode gate mapping table has EXACTLY 10 body rows in the pinned order (G.4e absent)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Locate the UI-mode section body (from its heading to the next ## H2).
    const sectionStart = autoMd.indexOf("\n## UI-mode gate mapping (G.1–G.7)");
    expect(sectionStart, "UI-mode gate mapping section must exist").toBeGreaterThan(-1);
    const rest = autoMd.slice(sectionStart + 1);
    const nextH2 = rest.indexOf("\n## ", 1);
    const section = nextH2 === -1 ? rest : rest.slice(0, nextH2);

    // Extract the main mapping table — the one whose header row starts with
    // "| Gate | transitionClass | title |" per contracts/ui-gate-mapping.md.
    const headerRe = /^\| Gate \| transitionClass \| title \|.*$/m;
    const headerMatch = headerRe.exec(section);
    expect(headerMatch, "mapping table header row must be present").not.toBeNull();
    const headerIdx = headerMatch!.index;
    const afterHeader = section.slice(headerIdx);
    const lines = afterHeader.split("\n");
    // Line 0 is the header, line 1 is the alignment divider (|---|), lines 2+
    // are body rows. Collect body rows until we hit the first non-table line
    // (blank or non-pipe-leading).
    const bodyRows: string[] = [];
    for (let i = 2; i < lines.length; i++) {
      const line = lines[i]!;
      if (!line.startsWith("| ")) break;
      bodyRows.push(line);
    }
    // Exact row count is 10 per Q1=C.
    expect(bodyRows.length, "mapping table row count must be exactly 10 (G.1..G.7)").toBe(10);

    // Rows begin with the pinned gate identifiers in order.
    const expectedGates = ["G.1", "G.2", "G.3", "G.4a", "G.4b", "G.4c", "G.4d", "G.5", "G.6", "G.7"];
    const actualGates = bodyRows.map((row) => {
      const cellMatch = /^\| ([^|]+?) \|/.exec(row);
      return cellMatch ? cellMatch[1]!.trim() : "";
    });
    expect(actualGates).toEqual(expectedGates);

    // G.4e MUST NOT appear as the first column of any row (never a mapping-
    // table row — per contracts/ui-gate-mapping.md § G.4(e) exclusion).
    const g4eRow = bodyRows.find((row) => /^\| G\.4e /.test(row));
    expect(g4eRow, "G.4e must NOT appear as a mapping-table row").toBeUndefined();
  });

  it("449-9 G.4(e) exclusion note is present in the UI-mode gate mapping section", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const sectionStart = autoMd.indexOf("\n## UI-mode gate mapping (G.1–G.7)");
    const rest = autoMd.slice(sectionStart + 1);
    const nextH2 = rest.indexOf("\n## ", 1);
    const section = nextH2 === -1 ? rest : rest.slice(0, nextH2);
    expect(section).toContain("G.4(e) exclusion note");
    expect(section).toMatch(/in-memory cursor-mechanism fault|per-epic in-memory cursor-fault/i);
  });

  it("449-10 G.7 row declares `required-if` free-text affordance for `add-more-work` (Q4=A)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const sectionStart = autoMd.indexOf("\n## UI-mode gate mapping (G.1–G.7)");
    const rest = autoMd.slice(sectionStart + 1);
    const nextH2 = rest.indexOf("\n## ", 1);
    const section = nextH2 === -1 ? rest : rest.slice(0, nextH2);
    // Q4=A single-answer collapse: G.7 add-more-work carries required freeText
    // in the same submission.
    expect(section).toContain('"required-if"');
    expect(section).toContain('ifOptionId: "add-more-work"');
  });

  it("449-11 G.2 row declares `optional` free-text affordance for reviewer comment", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const sectionStart = autoMd.indexOf("\n## UI-mode gate mapping (G.1–G.7)");
    const rest = autoMd.slice(sectionStart + 1);
    const nextH2 = rest.indexOf("\n## ", 1);
    const section = nextH2 === -1 ? rest : rest.slice(0, nextH2);
    // Matches the local drafter's comment-body affordance for D.2/D.3 review.
    expect(section).toContain("reviewer comment (optional");
  });

  it("449-12 § Dispatch table contains a D.12 row naming `gate-answer` as the event kind", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Locate the § Dispatch section's dispatch table (rows after "| # | Event |").
    const dispatchStart = autoMd.indexOf("\n## Dispatch\n");
    expect(dispatchStart, "§ Dispatch heading must exist").toBeGreaterThan(-1);
    const rest = autoMd.slice(dispatchStart);
    // Extract the table's body rows (up to the first "### " heading).
    const nextH3 = rest.indexOf("\n### ");
    const dispatchSection = nextH3 === -1 ? rest : rest.slice(0, nextH3);
    // D.12 row must be present and name gate-answer as the event kind.
    const d12Row = dispatchSection
      .split("\n")
      .find((line) => /^\| D\.12 \|/.test(line));
    expect(d12Row, "dispatch table must contain a D.12 row").toBeDefined();
    expect(d12Row!).toContain("gate-answer");
    expect(d12Row!).toContain("cockpit_gate_ack");
  });

  it("449-13 `### D.12 — \\`gate-answer\\`` subsection exists and covers V3/V4 supersession + ack outcomes", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Subsection heading is `### D.12 — \`gate-answer\``; use the shared helper
    // (extractSubheadingBlock) so the pin travels alongside D.1..D.11's pins.
    const block = extractSubheadingBlock(autoMd, "D.12 — `gate-answer`");
    // All three supersession outcomes are named verbatim.
    expect(block).toContain("no matching open record");
    expect(block).toContain("stale generation");
    expect(block).toContain("live state moved past");
    // Fires only under UI mode.
    expect(block).toMatch(/ResolvedGateMode === "ui"/);
    // The load-bearing "same downstream handling" invariant is stated: the
    // D.12 handler performs the SAME tool call(s) / subagent spawn(s) / state
    // mutation(s) the local `AskUserQuestion` path performs today. Phrase may
    // vary; require at least one of the canonical wordings.
    expect(block).toMatch(
      /SAME (tool call|downstream handling|handling)|the same (tool call|downstream handling|handling)/,
    );
    // Ack outcomes appear literally.
    expect(block).toContain('outcome: "applied"');
    expect(block).toContain('outcome: "superseded"');
    expect(block).toContain('outcome: "failed"');
  });

  it("449-14 D.12 subsection includes the revised-draft re-open path (make-changes → recompute discriminator, new gateId)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(autoMd, "D.12 — `gate-answer`");
    expect(block).toContain("Revised-draft re-open path");
    // Frozen model: re-open RECOMPUTES a durable generation discriminator (new
    // gateId) — NOT a session-local integer bump; the MCP tool derives the id.
    expect(block).toMatch(/recompute the generation discriminator/i);
    expect(block).not.toMatch(/nextGeneration = record\.generation \+ 1|generation \+= 1/);
    // Prior gate superseded by gateId IDENTITY (down-path answer carries no generation).
    expect(block).toContain("mark the ORIGINAL record `superseded`");
    expect(block).toContain("superseded (stale generation)");
    expect(block).toMatch(/gateId identity/);
  });

  it("449-15 § UI-mode fallback subsection distinguishes call-time error from Q3=A pre-flight absence", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(
      autoMd,
      "UI-mode fallback on `cockpit_gate_open` call error",
    );
    // Explicit distinction from pre-flight absence hard-fail.
    expect(block).toMatch(/Distinct from Q3=A pre-flight absence/i);
    // ui-gate-fallback suffix is the fallback resolution provenance marker.
    expect(block).toContain("· source: ui-gate-fallback");
    // First-failure ledger note verbatim shape.
    expect(block).toContain(
      "falling back to local AskUserQuestion for this gate (repeated failures suppressed)",
    );
  });

  it("449-16 § UI-mode fallback declares the verbatim one-pointer-line format (FR-005)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(
      autoMd,
      "UI-mode fallback on `cockpit_gate_open` call error",
    );
    // FR-005 pointer line — the only operator-visible affordance on gate-open.
    expect(block).toContain(
      "gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)",
    );
    expect(block).toMatch(/NOT appended to the persistent ledger file|not a ledger row/i);
  });

  it("449-17 § Ledger UI-mode extensions codify the three-way source suffix precedence (Q5=B)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Find the § Ledger section.
    const ledgerStart = autoMd.indexOf("\n## Ledger\n");
    expect(ledgerStart, "§ Ledger heading must exist").toBeGreaterThan(-1);
    const rest = autoMd.slice(ledgerStart);
    const nextH2 = rest.indexOf("\n## ", 1);
    const ledger = nextH2 === -1 ? rest : rest.slice(0, nextH2);

    // Q5=B rules — three literal-match suffix strings, gate-open is print-only,
    // D.12 writes exactly one row per resolved gate.
    expect(ledger).toContain("· source: ui-gate");
    expect(ledger).toContain("· source: ui-gate-fallback");
    expect(ledger).toContain("· source: enriched-line");
    expect(ledger).toMatch(/gate-open is print-only|print-only.*per FR-005/i);
    expect(ledger).toMatch(/D\.12 writes exactly one ledger line per resolved gate/);

    // Post-#449 grep recipes — the `$` distinguishes ui-gate from
    // ui-gate-fallback.
    expect(ledger).toContain("grep 'source: ui-gate$' <ledger>");
    expect(ledger).toContain("grep 'source: ui-gate-fallback' <ledger>");
  });

  it("449-18 § step-3 startup sweep declares the Q2=B extended trigger set (5 non-waiting-for triggers)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // UI-mode callout heading (Q2=B extension).
    expect(step3).toMatch(/UI-mode extended trigger set \(Q2=B\)/);
    // All five persistent non-waiting-for triggers listed (spec § Startup sweep
    // trigger states; research.md § R5).
    expect(step3).toContain("agent:error");
    expect(step3).toMatch(/failed:<subtype>|failed:\*/);
    expect(step3).toContain("completed:validate` with red checks");
    expect(step3).toContain("phase-complete");
    expect(step3).toContain("blocked:stuck-merge-conflicts");
    // G.4(e) exclusion is explicit.
    expect(step3).toContain("G.4(e) exclusion");
    // Idempotency and deferred-to-loop behavior are named.
    expect(step3).toContain("gateId idempotency");
    expect(step3).toContain("Deferred-to-loop behavior");
  });

  it("fresh-epic bootstrap: step-3 sweep queues P1 via G.5/cockpit_gate_open, never a local AskUserQuestion under ui", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // Step-3 declares the fresh-epic bootstrap clause and its synthetic event.
    expect(step3).toContain("Fresh-epic bootstrap");
    expect(step3).toContain("phase-bootstrap");
    expect(step3).toContain("first incomplete phase");
    // The synthetic event dispatches through the existing D.8 / G.5 machinery,
    // so under UI mode it opens in the inbox — never a local prompt.
    expect(step3).toContain("D.8 / § Gate contract G.5");
    expect(step3).toContain("NEVER a local `AskUserQuestion` under UI mode");

    // D.8 trigger and G.5 gate both acknowledge the phase-bootstrap synthetic.
    expect(autoMd).toContain(
      "Also fires on the synthetic **`phase-bootstrap`** event",
    );
    expect(autoMd).toContain("**Bootstrap variant**");
    expect(autoMd).toContain(
      "No phase in flight on <epic-ref> — bootstrapping the first phase.",
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 457 sweep-time gate reuse — pre-draft gate-status check + FR-009 escape hatch
//
// Pins the load-bearing prose additions to auto.md described by
// specs/457-part-cockpit-remote-gates/{plan.md,contracts/*.md}:
//   - § step 3 startup sweep: nine-tool presence check, sweep gateId now uses
//     content-derived generation (no more literal `generation=1`), answered-gate
//     parked-forever escape-hatch block with N=3 threshold.
//   - § Dispatch D.1/D.2/D.3/D.4/D.7/D.11: new `Step 0 — pre-draft gate-status
//     check` heading with the three-branch rule (same-gateId reuse /
//     generation-drift supersede-and-redraft / absent-no-op).
//   - § Dispatch D.11: defense-in-depth ordering (step 0 pre-draft check ABOVE
//     step 1 in-memory dispatched-issues dedup — both retained).
//   - § In-memory loop state additions: `answeredGateSweepCounter` map declared.
//   - § D.12 gate-answer step 6: renamed to `Remove from openGates and reset
//     sweep counter`; both `openGates.delete` and `answeredGateSweepCounter
//     .delete` present.
//   - § UI-mode gate mapping generation-discriminator table unchanged (drift
//     audit — sweep and live paths MUST reference the same function).
//
// These are drift audits — if a heading rename, contract-rule edit, or literal
// substitution breaks a pin, re-pin to the NEW contract in the same PR. Do NOT
// weaken or delete an assertion to make the test pass (CLAUDE.md § Cockpit
// playbook pins).
// ────────────────────────────────────────────────────────────────────────────
describe("457 sweep-time gate reuse", () => {
  it("457-1 § step 3 tool-presence check is CONDITIONAL: seven baseline tools always, the two gate-query tools only under ResolvedGateMode === 'ui'", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // All nine tools are still named somewhere in the check.
    const BASELINE_SEVEN = [
      "cockpit_status",
      "cockpit_context",
      "cockpit_queue",
      "cockpit_advance",
      "cockpit_resume",
      "cockpit_merge",
      "cockpit_await_events",
    ];
    const UI_ONLY_TWO = ["cockpit_gate_status", "cockpit_gate_list"];
    for (const tool of [...BASELINE_SEVEN, ...UI_ONLY_TWO]) {
      expect(step3, `step 3 tool-presence check must name ${tool}`).toContain(tool);
    }

    // Isolate the presence-check paragraph block (from its verbatim heading to
    // the escape-hatch heading that follows it) so the assertions below cannot
    // be satisfied by unrelated step-3 prose.
    const checkStart = step3.indexOf(
      "**Tool-presence check (fail-loud on missing cockpit MCP tools).**",
    );
    expect(checkStart, "step 3 must retain the tool-presence-check heading").toBeGreaterThan(-1);
    const checkEnd = step3.indexOf(
      "**Answered-gate parked-forever escape hatch (UI mode only).**",
    );
    expect(checkEnd).toBeGreaterThan(checkStart);
    const check = step3.slice(checkStart, checkEnd);

    // The requirement is stated as CONDITIONAL on the resolved gate mode —
    // an unconditional nine-tool requirement hard-aborts every --gates=local
    // run on a cluster predating generacy#1038 (and `auto` defaults to local).
    expect(check).toMatch(/conditional on \*\*`ResolvedGateMode`\*\*|conditional on `ResolvedGateMode`/i);
    expect(check).toMatch(/Always required[^\n]*seven baseline tools/);
    expect(check).toMatch(/Required ONLY when `ResolvedGateMode === "ui"`/);
    expect(check).toMatch(/seven tools under `local` and nine under `ui`/);
    // The two gate-query tools are explicitly NOT required under local.
    expect(check).toMatch(
      /Under `ResolvedGateMode === "local"` these two are \*\*NOT\*\* required/,
    );
    // The load-bearing rationale survives: local preserves today's byte path.
    expect(check).toContain("preserves today's byte-path exactly");
    // Negative pin: the old unconditional phrasing must not come back.
    expect(check).not.toMatch(/verify that the nine `cockpit_\*` MCP tools are present/);
    expect(check).not.toMatch(/If any of the nine is absent/);
  });

  it("457-1a auto.md carries NO stale 'seven cockpit tools' cross-reference — every mention of the presence check reflects the conditional rule", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // The pre-#457 shorthand names a fixed seven-tool check; after the
    // conditional rule landed, every cross-reference must say so instead.
    expect(autoMd).not.toContain("seven-cockpit-tools");
    expect(autoMd).not.toMatch(/the seven `cockpit_\*` MCP tools/);
    expect(autoMd).not.toMatch(/verifies the seven `cockpit_\*` MCP tools/);
    // The surviving cross-references name the conditional rule.
    expect(autoMd).toMatch(
      /the `cockpit_\*` tool-presence check \(step 3 startup sweep — seven baseline tools always, plus `cockpit_gate_status` \/ `cockpit_gate_list` only under `ResolvedGateMode === "ui"`\)/,
    );
    expect(autoMd).toMatch(
      /same shape as the `cockpit_\*` tool-presence check at step 3 below/,
    );
    expect(autoMd).toMatch(
      /matching the step-3 `cockpit_\*` tool-presence check's `Print \+ exit` precedent/,
    );
    // § Examples walkthrough names the required set for its resolved mode.
    expect(autoMd).toMatch(
      /the parent verifies the required `cockpit_\*` MCP tools are present/,
    );
  });

  it("457-2 § step 3 sweep NO LONGER contains the literal `generation=1`; new prose names `hash(issueRef, gateType, generation)`", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // Negative: the pre-#457 hard-coded default is gone.
    expect(step3).not.toContain("generation=1");
    // Positive: the replacement prose names the content-derived hash + the pre-
    // draft check reference (per contracts/sweep-generation-fix.md § Verbatim
    // removal).
    expect(step3).toContain("hash(issueRef, gateType, generation)");
    expect(step3).toContain("§ Dispatch step 0");
    expect(step3).toMatch(/Generation discriminator \(UI mode\)/);
  });

  it("457-3 § step 3 escape-hatch block: verbatim heading + N=3 literal + exact ack detail string", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // Verbatim heading (pinned literally per contracts/answered-escape-hatch.md).
    expect(step3).toContain(
      "**Answered-gate parked-forever escape hatch (UI mode only).**",
    );
    // N=3 threshold pinned literally in the phrase `count >= 3`.
    expect(step3).toContain("count >= 3");
    // Ack detail string pinned literally (post-mortem grep target).
    expect(step3).toContain(
      "'answered-not-consumed — presumed stuck at cloud delivered/applied'",
    );
    // Escape hatch reads `openGates` for `status: 'answered'` entries and
    // increments the sweep counter.
    expect(step3).toContain("answeredGateSweepCounter.set");
    expect(step3).toContain("openGates.delete(gateId)");
    expect(step3).toContain("answeredGateSweepCounter.delete(gateId)");
    // Under `local` the block is dead prose.
    expect(step3).toMatch(/ResolvedGateMode === "local"[^]*dead prose/);
  });

  it("457-3a § step 3 escape hatch ACTIVELY re-derives (cockpit_status + synthesized dispatch) — never defers to the next drain", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // The re-derivation rule exists under its own verbatim heading.
    expect(step3).toContain("**§ Escape-hatch re-derivation (load-bearing).**");
    // It re-reads live state via cockpit_status and synthesizes a dispatch —
    // the same mechanism the startup sweep uses for synthetic events.
    expect(step3).toContain("cockpit_status(issue=<issueRef>, json=true)");
    expect(step3).toMatch(/[Ss]ynthesize an event from the returned labels/);
    // The "wait for the drain" behaviour is explicitly forbidden, with the
    // reason: the hatch changes no label and the drain returns only NEW
    // transitions, so no batch would ever carry the re-derived event.
    expect(step3).toMatch(/Do NOT leave re-derivation to the next .*drain|Do NOT leave re-derivation to the next `cockpit_await_events` drain/);
    expect(step3).toMatch(/returns only NEW transitions/);
    expect(step3).toMatch(/parked it forever|parked forever/);
    // Negative pin: the round-2 "rely on the next drain" wording is gone from
    // the startup-sweep site.
    expect(step3).not.toMatch(/rely on the next drain to re-derive/);
    // The startup-sweep de-duplication carve-out is scoped to this site only.
    expect(step3).toMatch(/De-duplication at the § step-3 startup-sweep tick site ONLY/);
  });

  it("457-3b § step 4 sub-step 0 escape-hatch tick ALSO actively re-derives (the site with no following synthetic pass)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step4 = extractInstructionsSteps(autoMd).get(4)!;
    // Round-2's broken wording must be gone from the per-wake site — this is
    // the site where deferring to the drain parks the issue permanently.
    expect(step4).not.toMatch(/rely on the next drain to re-derive/);
    // Active re-derivation, in the same pass, before the drain.
    expect(step4).toMatch(/actively re-derive/i);
    expect(step4).toContain("cockpit_status(issue=<issueRef>, json=true)");
    expect(step4).toMatch(/in this same pass, before the drain/);
    // Names why the drain cannot produce it.
    expect(step4).toMatch(/returns only NEW transitions/);
    expect(step4).toMatch(/SOLE path that reaches the issue/);
  });

  it("457-3c § step 3 states the counter semantics the literal 3 is measured in, and all six D.n Step 0 branches agree", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step3 = extractInstructionsSteps(autoMd).get(3)!;
    // Semantics are stated explicitly next to the load-bearing literal.
    expect(step3).toMatch(/\*\*Counter semantics the literal `3` is measured in/);
    // The chosen semantics: record-time increment IS the recording sweep's count.
    expect(step3).toMatch(
      /record-time increment IS that entry's count for the sweep in which it was added|increment performed by a D\.n Step 0 `reuse-answered` branch IS that entry's count/,
    );
    expect(step3).toMatch(/reaches `3` at sweep S\+2/);
    // Negative pin: the contradictory round-2 wording is gone.
    expect(step3).not.toMatch(
      /included in the NEXT sweep's tick, not the sweep during which it was added/,
    );
    // No double-count claim is stated with its reason (ticks run before dispatch).
    expect(step3).toMatch(/No double-count is possible/);

    // All six D.n Step 0 `answered` branches reference the same semantics.
    const D_HEADERS = [
      "D.1 — `waiting-for:clarification`",
      "D.2 — `waiting-for:<artifact>-review`",
      "D.3 — `waiting-for:implementation-review`",
      "D.4 — `waiting-for:manual-validation`",
      "D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)",
      "D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)",
    ];
    for (const header of D_HEADERS) {
      const block = extractSubheadingBlock(autoMd, header);
      expect(
        block,
        `${header} must reference the single counter-semantics definition`,
      ).toMatch(/per § step 3 \*\*Counter semantics\*\*/);
      expect(block).toMatch(
        /this record-time increment IS the entry's count for the sweep in which it was added/,
      );
    }
  });

  // 457-4 through 457-9: each drafting D.n row contains the pre-draft Step 0.
  //
  // The rows split into two contract shapes:
  //   * 1:1 rows (D.1–D.4) — gateType ⇒ dispatch row, so the generation-drift
  //     branch is PERMITTED and the drift-ack literal must be present.
  //   * escalation rows (D.7, D.11) — four rows share `gateType: 'escalation'`
  //     and the wire carries no subtype discriminator, so the drift branch is
  //     DISABLED and the drift-ack literal must be ABSENT.
  const ALL_STEP0_HEADERS: ReadonlyArray<string> = [
    "D.1 — `waiting-for:clarification`",
    "D.2 — `waiting-for:<artifact>-review`",
    "D.3 — `waiting-for:implementation-review`",
    "D.4 — `waiting-for:manual-validation`",
    "D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)",
    "D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)",
  ];

  const ONE_TO_ONE_HEADERS: ReadonlyArray<[string, string]> = [
    ["457-4 D.1", ALL_STEP0_HEADERS[0]!],
    ["457-5 D.2", ALL_STEP0_HEADERS[1]!],
    ["457-6 D.3", ALL_STEP0_HEADERS[2]!],
    ["457-7 D.4", ALL_STEP0_HEADERS[3]!],
  ];
  const ESCALATION_HEADERS: ReadonlyArray<[string, string]> = [
    ["457-8 D.7", ALL_STEP0_HEADERS[4]!],
    ["457-9 D.11", ALL_STEP0_HEADERS[5]!],
  ];

  // Shape common to every Step 0 block regardless of gateType.
  function assertCommonStep0Shape(block: string): void {
    // Verbatim Step 0 heading (pinned literally per contracts/pre-draft-check.md).
    expect(block).toContain(
      "**Step 0 — pre-draft gate-status check (UI mode only).**",
    );
    // Three-branch rule — status: 'open', 'answered', 'absent'.
    expect(block).toContain("`{ status: 'open' }`");
    expect(block).toContain("`{ status: 'answered' }`");
    expect(block).toContain("`{ status: 'absent' }`");
    // On 'answered', increment the sweep counter (couples the pre-draft
    // check to the FR-009 escape hatch).
    expect(block).toContain("increment `answeredGateSweepCounter[gateId]`");
    // The check uses the SAME per-gateType generation function the live path
    // uses (V1 in data-model.md).
    expect(block).toMatch(/SAME per-gateType generation function the live path uses/);
    // Skips entirely under local mode.
    expect(block).toMatch(/Skip Step 0 entirely under `ResolvedGateMode === "local"`/);
    // gate-status is called with the frozen {issueRef, gateType, generation}
    // schema (per #458 review comment 1 — the tool's .strict() input schema
    // rejects a hand-built {gateId} payload).
    expect(block).toContain(
      "cockpit_gate_status({ issueRef, gateType, generation })",
    );
    // The reuse record carries the mandatory dispatchClass — D.12 step 3/4
    // key on it; without it an answer to a reused gate resolves no handler.
    expect(block).toMatch(/status: 'open', transitionClass, dispatchClass\}/);
    expect(block).toMatch(/`dispatchClass` is THIS row's `D\.n` identifier/);
    // Error taxonomy: all four reachable classes are named and NONE of them
    // may be read as `absent` or fall through to drafting.
    for (const cls of ["query-unreachable", "invalid-args", "internal", "transport"]) {
      expect(block, `Step 0 must name the ${cls} error class`).toContain(cls);
    }
    expect(block).toMatch(/MUST NOT\*\* collapse ANY error class/);
    expect(block).toMatch(
      /MUST NOT fall through to the draft-then-open flow on any of them/,
    );
    // Negative pin: the round-2 claim that a non-query-unreachable error is a
    // benign race to be treated as "no existing gate" is gone.
    expect(block).not.toMatch(/rare error-race window/);
    expect(block).not.toMatch(
      /treat (the return |)as "no existing gate" and fall through to the draft-then-open flow/,
    );
  }

  for (const [pinLabel, header] of ONE_TO_ONE_HEADERS) {
    it(`${pinLabel}: § Dispatch ${header.split(" —")[0]} Step 0 — 1:1 gateType, drift branch PERMITTED (drift-ack literal + list-return shape)`, () => {
      const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
      const block = extractSubheadingBlock(autoMd, header);
      assertCommonStep0Shape(block);
      // This row's gateType maps 1:1 onto the row, so the guard is satisfied.
      expect(block).toMatch(
        /This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules \*\*generation-drift branch guard\*\* is satisfied and the drift branch MAY fire/,
      );
      // Generation-drift branch names both the ack call and the drift detail
      // literal (V3).
      expect(block).toContain(
        "cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')",
      );
      // gate-list return shape is the {gates, truncated?} object (per #458
      // review comment 7 — NOT a bare array).
      expect(block).toMatch(/cockpit_gate_list\(\{ issueRef, gateType \}\)/);
      expect(block).toMatch(/result\.gates|iterate `result\.gates`/);
      // truncated: true with no visible drift entry is NOT draft-fresh.
      expect(block).toMatch(/result\.truncated === true/);
    });
  }

  for (const [pinLabel, header] of ESCALATION_HEADERS) {
    it(`${pinLabel}: § Dispatch ${header.split(" —")[0]} Step 0 — shared 'escalation' gateType, drift branch DISABLED (no drift-ack, no list call, #1046 residual note)`, () => {
      const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
      const block = extractSubheadingBlock(autoMd, header);
      assertCommonStep0Shape(block);
      // The guard fires: the drift branch is disabled for this row.
      expect(block).toContain(
        "**The generation-drift branch is DISABLED for this row",
      );
      expect(block).toMatch(/do \*\*NOT\*\* call `cockpit_gate_list`/);
      expect(block).toMatch(/do \*\*NOT\*\* ack anything `superseded`/);
      expect(block).toMatch(/fall (straight |)through to the draft-then-open flow/);
      // NEGATIVE PIN (the F1 defect): no drift-ack may appear in an escalation
      // row's Step 0 — that ack destroys a sibling row's live operator gate.
      expect(
        block,
        "an escalation row's Step 0 must NOT contain a generation-drift ack",
      ).not.toContain("cockpit_gate_ack(staleGateId");
      expect(block).not.toContain(
        "generation drift — content changed since original draft",
      );
      // The residual limitation is documented and points at the upstream issue.
      expect(block).toMatch(/\*\*Residual limitation\*\*/);
      expect(block).toContain("generacy-ai/generacy#1046");
      // The generation string must not be parsed to recover the subtype.
      expect(block).toMatch(/Do NOT recover the subtype by parsing `generation`/);
    });
  }

  it("457-9a § Pre-draft check — shared rules defines the drift guard for all four escalation rows + the four-class error taxonomy", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const shared = extractSubheadingBlock(
      autoMd,
      "Pre-draft check — shared rules (UI mode)",
    );
    // Guard subsection with the two-part precondition.
    expect(shared).toContain(
      "#### Generation-drift branch guard (dispatch-identity precondition)",
    );
    expect(shared).toMatch(
      /may be superseded only when BOTH hold|A listed entry may be superseded only when BOTH hold/,
    );
    expect(shared).toMatch(
      /When the discriminator is NOT recoverable from the list entry, the drift branch MUST NOT supersede/,
    );
    // All four escalation rows are named — the guard is NOT scoped to D.11.
    for (const row of ESCALATION_DISPATCH_ROWS) {
      expect(shared, `guard must name escalation row ${row}`).toContain(row);
    }
    expect(shared).toMatch(/drift branch is DISABLED for `gateType: 'escalation'`/);
    // The four 1:1 gateTypes are enumerated as guard-satisfying.
    for (const gt of [
      "clarification",
      "artifact-review",
      "implementation-review",
      "manual-validation",
    ]) {
      expect(shared, `guard table must name gateType ${gt}`).toContain(gt);
    }
    // Residual limitation + upstream tracking issue.
    expect(shared).toMatch(/Residual limitation \(NOT fixed here/);
    expect(shared).toContain("generacy-ai/generacy#1046");
    expect(shared).toMatch(/MUST NOT recover the subtype by parsing the `generation` string/);

    // Error-taxonomy subsection: all four classes with explicit actions.
    expect(shared).toContain("#### Gate-query error taxonomy");
    for (const cls of ["query-unreachable", "invalid-args", "internal", "transport"]) {
      expect(shared, `taxonomy must name ${cls}`).toContain(cls);
    }
    expect(shared).toMatch(
      /Only a literal `\{ status: 'absent' \}` ok-return means "no existing gate"/,
    );
    // invalid-args / internal are named as deterministic bugs, not races.
    expect(shared).toMatch(/deterministic \*\*caller bug\*\*|deterministic caller bug/i);
    expect(shared).toMatch(/populated \*\*exclusively\*\* by deterministic caller\/server bugs/);
    // The visible operator-facing error line is pinned verbatim, and matches
    // the reference formatter.
    expect(shared).toContain(
      "pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger",
    );
    expect(
      formatPreDraftCheckErrorLine("<issue-ref>", {
        class: "invalid-args",
        message: "<detail>",
      }).replace("(invalid-args)", "(<class>)"),
    ).toBe(
      "pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger",
    );
  });

  it("457-9b § D.6 and § D.10 (escalation rows without a Step 0) are explicitly bound by the drift guard", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    for (const header of [
      "D.6 — `completed:validate` (red) / merge red → bounded fixer subagent",
      "D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)",
    ]) {
      const block = extractSubheadingBlock(autoMd, header);
      expect(block, `${header} must carry the escalation-gateType note`).toContain(
        "**Escalation-gateType note (UI mode).**",
      );
      expect(block).toContain("`gateType: 'escalation'`");
      expect(block).toMatch(
        /covered by the § Pre-draft check — shared rules \*\*generation-drift branch guard\*\*/,
      );
      expect(block).toContain("generacy-ai/generacy#1046");
    }
  });

  it("457-14 D.2 Step 0 names gateType = 'artifact-review' verbatim (per #458 review comment 6 — spec-review/clarification-review/plan-review/tasks-review are NOT in the frozen enum)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(
      autoMd,
      "D.2 — `waiting-for:<artifact>-review`",
    );
    expect(block).toContain("`gateType = artifact-review`");
    // The invalid literals MUST NOT appear as gateType values in the Step 0
    // block — the artifact kind is folded into `generation`, not `gateType`.
    expect(block).not.toMatch(/gateType\s*=\s*['`]?spec-review/);
    expect(block).not.toMatch(/gateType\s*=\s*['`]?clarification-review/);
    expect(block).not.toMatch(/gateType\s*=\s*['`]?plan-review/);
    expect(block).not.toMatch(/gateType\s*=\s*['`]?tasks-review/);
  });

  it("457-15 D.11 Step 0 pins the dedup-before-drift-ack ordering exception (per #458 review comment 3)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(
      autoMd,
      "D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)",
    );
    // The exception heading is present verbatim.
    expect(block).toContain("**D.11 ordering exception (Q5=A / FR-010).**");
    // The rationale names the sibling-label / different-gateId hazard.
    expect(block).toMatch(/sibling|label-pair/);
    // The absent-branch first-check clause is present.
    expect(block).toMatch(/First check the D\.11 ordering exception/);
  });

  it("457-16 § step 4 main loop declares the per-wake escape-hatch tick (per #458 review comment 2 — reachability requires per-wake site, not just startup)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const step4 = extractInstructionsSteps(autoMd).get(4)!;
    // Sub-step 0 declares the tick.
    expect(step4).toContain(
      "**Answered-gate parked-forever escape hatch tick (UI mode only).**",
    );
    // Names the load-bearing reachability rationale for the per-wake site.
    expect(step4).toMatch(/per-wake tick|load-bearing per-wake tick/);
    expect(step4).toMatch(/reachable|reachability/);
  });

  it("457-17 § In-memory loop state additions declares the openGates key using `hash(issueRef, gateType, generation)` (per #458 review comment 8 — dispatchClass is NOT part of the key)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const section = extractSubheadingBlock(
      autoMd,
      "In-memory loop state additions (UI mode)",
    );
    // Correct derivation input names — gateType, NOT dispatchClass.
    expect(section).toMatch(/hash\(issueRef,\s*gateType,\s*generation\)/);
    // Legacy `dispatchClass, generation` form does NOT survive in this bullet.
    expect(section).not.toMatch(/hash\(issueRef,\s*dispatchClass,\s*generation\)/);
  });

  it("457-10 § Dispatch D.11 contains BOTH step 0 (pre-draft check) AND step 1 (dispatched-issues dedup) in that order — defense-in-depth pin", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(
      autoMd,
      "D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)",
    );
    // Step 0 heading present.
    const step0Idx = block.indexOf(
      "**Step 0 — pre-draft gate-status check (UI mode only).**",
    );
    expect(step0Idx, "D.11 must contain the Step 0 heading").toBeGreaterThan(-1);
    // Step 1 `Dedup check.` heading present.
    const step1Idx = block.indexOf("**Dedup check.**");
    expect(step1Idx, "D.11 must retain the existing step 1 `Dedup check.`").toBeGreaterThan(-1);
    // Order: Step 0 above Step 1.
    expect(step0Idx).toBeLessThan(step1Idx);
    // Existing step 1's in-memory `dispatched-issues set` reference survives.
    expect(block).toContain("dispatched-issues set");
    // Defense-in-depth is stated as a positive obligation (per FR-010 / Q5=A).
    expect(block).toMatch(/Defense-in-depth|defense in depth|complementary, not redundant/i);
  });

  it("457-11 § In-memory loop state additions (UI mode) declares `answeredGateSweepCounter: Map<GateId, number>` verbatim", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Locate the block by its subheading via the shared helper (skips the H3
    // itself; returns the body up to the next H3).
    const section = extractSubheadingBlock(
      autoMd,
      "In-memory loop state additions (UI mode)",
    );
    // Verbatim declaration.
    expect(section).toContain("`answeredGateSweepCounter: Map<GateId, number>`");
    // Lifecycle description names the seed / tick / reset / threshold-trigger.
    // Re-pinned for #458 F5: the counter is SEEDED at 1 by the Step 0
    // reuse-answered branch (that increment is the recording sweep's count),
    // then ticked on every subsequent sweep — the two sites must not both
    // count the same sweep.
    expect(section).toMatch(/Seeded at `1` by the D\.n Step 0 `reuse-answered` branch/);
    expect(section).toMatch(/ticked at the top of every subsequent sweep/);
    expect(section).toMatch(/no sweep is counted twice for the same entry/);
    expect(section).toMatch(/reset by every D\.12 handler/);
    expect(section).toContain("count >= 3");
    // The escape hatch actively re-derives; it must not defer to the drain.
    expect(section).toMatch(/actively re-derive/i);
    expect(section).toContain("cockpit_status(issue=<issueRef>, json=true)");
    expect(section).toMatch(/MUST NOT be deferred to the next drain/);
    // Escape-hatch detail literal appears in the description.
    expect(section).toContain(
      "answered-not-consumed — presumed stuck at cloud delivered/applied",
    );
    // Unused under local.
    expect(section).toMatch(/Under `local` the map is unused/);
  });

  it("457-12 § D.12 step 6 heading is `Remove from openGates and reset sweep counter` and contains BOTH delete calls", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    const block = extractSubheadingBlock(autoMd, "D.12 — `gate-answer`");
    // New heading (renamed per contracts/answered-escape-hatch.md § D.12 counter reset).
    expect(block).toContain(
      "**Remove from openGates and reset sweep counter**",
    );
    // Both delete calls fire on `applied` / `superseded` / `failed`.
    expect(block).toContain("`openGates.delete(event.gateId)`");
    expect(block).toContain("`answeredGateSweepCounter.delete(event.gateId)`");
    // Revised-draft re-open case: counter deleted on the original gateId even
    // when the record is retained flagged `superseded`.
    expect(block).toMatch(/counter for the original `gateId` is deleted/);
  });

  it("457-13 § UI-mode gate mapping generation-discriminator table is UNCHANGED (drift audit — sweep + live paths reference the same function)", () => {
    const autoMd = readFileSync(AUTO_MD_PATH, "utf-8");
    // Locate the discriminator subsection. Search for the H4 heading and
    // return everything up to the next H3 or H2 (H4 is a child of the H2
    // `## UI-mode gate mapping (G.1–G.7)`; the next H3 sibling terminates it).
    const marker = "\n#### Generation discriminator (UI mode)\n";
    const sectionStart = autoMd.indexOf(marker);
    expect(sectionStart, "generation-discriminator subsection must exist").toBeGreaterThan(-1);
    const rest = autoMd.slice(sectionStart + marker.length);
    // The next H2 or H3 marks the end of this H4 subsection.
    const nextH3 = rest.search(/^### /m);
    const nextH2 = rest.search(/^## /m);
    const nextBoundaries = [nextH3, nextH2].filter((n) => n !== -1);
    const nextBoundary = nextBoundaries.length > 0 ? Math.min(...nextBoundaries) : -1;
    const section = nextBoundary === -1 ? rest : rest.slice(0, nextBoundary);

    // The eight-row gateType table body is unchanged — pin the exact discriminators.
    const EXPECTED_ROWS: ReadonlyArray<[string, string]> = [
      [
        "`clarification`",
        "content hash of the open question / answer set at open time",
      ],
      ["`artifact-review`", "artifact kind + review-branch head SHA"],
      ["`implementation-review`", "PR head SHA"],
      ["`manual-validation`", "PR head SHA"],
      [
        "`escalation`",
        "subtype + triggering label/state + occurrence counter",
      ],
      ["`phase-queue`", "phase number (`P<next>`)"],
      ["`filing`", "draft hash over `{title, body, labels}`"],
      ["`scope-drained`", "tracking ref + drain counter"],
    ];
    for (const [gateType, discriminator] of EXPECTED_ROWS) {
      expect(
        section,
        `generation-discriminator row for ${gateType} must be present verbatim`,
      ).toContain(gateType);
      expect(
        section,
        `generation-discriminator row for ${gateType} must name '${discriminator}'`,
      ).toContain(discriminator);
    }
    // The frozen gateKey / gateId derivation prose is present (V1 in data-model.md).
    expect(section).toContain(
      "gateId = sha256(gateKey)[:24]",
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // 457-lib — reference-module contracts backing the escape-hatch prose.
  // Machine-checks that the three-branch classifier, the sweep-counter tick,
  // and the N=3 escape-hatch selector match the prose contract exactly.
  // ────────────────────────────────────────────────────────────────────────

  const FAKE_GATE_ID: GateId = "abc123def4567890abc12345";
  const OTHER_GATE_ID: GateId = "9999111122223333aaaabbbb";

  const EMPTY_LIST: GateListResult = { gates: [] };

  // A COMPLETE `GateRecord` — no `as` cast, no ad-hoc
  // `GateRecord & { status?: ... }` intersection. `status` is a required field
  // on the canonical type (lib/gate-wire-types.ts § GateRecord); if it were
  // dropped back to optional, this literal would stop type-checking and the
  // source pin in 457-lib-9 would go red.
  function makeGateRecord(
    gateId: GateId,
    status: "open" | "answered",
    overrides: Partial<GateRecord> = {},
  ): GateRecord {
    return {
      gateId,
      gateKey: `owner/repo#1:clarification:gen-A`,
      gateType: "clarification",
      generation: "gen-A",
      issueRef: "owner/repo#1",
      transitionClass: "waiting-for:clarification",
      dispatchClass: "D.1",
      status,
      askedAt: "2026-07-24T00:00:00.000Z",
      inboxUrl: "https://generacy.ai/inbox/abc123def4567890abc12345",
      originalDraft: {
        title: "Approve clarification answers for owner/repo#1",
        body: "…",
        options: [],
        freeTextAffordance: { kind: "none" },
      },
      ...overrides,
    };
  }

  it("457-lib-1 classifyPreDraftCheck: `open` → reuse-open with the returned gateId", () => {
    const status: GateStatusResult = { gateId: FAKE_GATE_ID, status: "open" };
    const outcome = classifyPreDraftCheck(status, EMPTY_LIST, "gen-A", "clarification");
    expect(outcome).toEqual({ kind: "reuse-open", gateId: FAKE_GATE_ID });
  });

  it("457-lib-2 classifyPreDraftCheck: `answered` → reuse-answered (triggers sweep-counter tick upstream)", () => {
    const status: GateStatusResult = { gateId: FAKE_GATE_ID, status: "answered" };
    const outcome = classifyPreDraftCheck(status, EMPTY_LIST, "gen-A", "clarification");
    expect(outcome).toEqual({ kind: "reuse-answered", gateId: FAKE_GATE_ID });
  });

  it("457-lib-3 classifyPreDraftCheck: `absent` + list has drift → supersede-and-redraft with stale/fresh generations", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    const list: GateListResult = {
      gates: [
        { gateId: OTHER_GATE_ID, gateType: "clarification", generation: "gen-OLD", status: "open" },
      ],
    };
    const outcome = classifyPreDraftCheck(status, list, "gen-NEW", "clarification");
    expect(outcome).toEqual({
      kind: "supersede-and-redraft",
      staleGateId: OTHER_GATE_ID,
      staleGeneration: "gen-OLD",
      freshGeneration: "gen-NEW",
    });
  });

  it("457-lib-4 classifyPreDraftCheck: `absent` + empty list → draft-fresh", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    const outcome = classifyPreDraftCheck(status, EMPTY_LIST, "gen-A", "clarification");
    expect(outcome).toEqual({ kind: "draft-fresh" });
  });

  it("457-lib-4b classifyPreDraftCheck: `absent` + truncated list with no drift entry → abort-query-unreachable (do NOT collapse to draft-fresh)", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    const list: GateListResult = { gates: [], truncated: true };
    const outcome = classifyPreDraftCheck(status, list, "gen-A", "clarification");
    expect(outcome.kind).toBe("abort-query-unreachable");
    if (outcome.kind === "abort-query-unreachable") {
      expect(outcome.error.class).toBe("query-unreachable");
    }
  });

  it("457-lib-4c classifyPreDraftCheck: `absent` + truncated list WITH drift entry → supersede-and-redraft (drift wins over truncation)", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    const list: GateListResult = {
      gates: [
        { gateId: OTHER_GATE_ID, gateType: "clarification", generation: "gen-OLD", status: "open" },
      ],
      truncated: true,
    };
    const outcome = classifyPreDraftCheck(status, list, "gen-NEW", "clarification");
    expect(outcome).toEqual({
      kind: "supersede-and-redraft",
      staleGateId: OTHER_GATE_ID,
      staleGeneration: "gen-OLD",
      freshGeneration: "gen-NEW",
    });
  });

  it("457-lib-5 tickAnsweredSweepCounter: only `answered` entries increment; `open` entries do not", () => {
    // Map<GateId, GateRecord> — no ad-hoc `& { status?: ... }` intersection and
    // no cast; `status` is a required field on the canonical GateRecord.
    const openGates = new Map<GateId, GateRecord>();
    openGates.set(FAKE_GATE_ID, makeGateRecord(FAKE_GATE_ID, "answered"));
    openGates.set(OTHER_GATE_ID, makeGateRecord(OTHER_GATE_ID, "open"));
    const counter: AnsweredGateSweepCounter = new Map();
    tickAnsweredSweepCounter(openGates, counter);
    tickAnsweredSweepCounter(openGates, counter);
    expect(counter.get(FAKE_GATE_ID)).toBe(2);
    expect(counter.has(OTHER_GATE_ID)).toBe(false);
  });

  it("457-lib-6 selectEscapeHatchTargets: fires at threshold N=3 exactly (V6 load-bearing literal)", () => {
    const counter: AnsweredGateSweepCounter = new Map();
    counter.set(FAKE_GATE_ID, 1);
    expect(selectEscapeHatchTargets(counter)).toEqual([]);
    counter.set(FAKE_GATE_ID, 2);
    expect(selectEscapeHatchTargets(counter)).toEqual([]);
    counter.set(FAKE_GATE_ID, 3);
    expect(selectEscapeHatchTargets(counter)).toEqual([FAKE_GATE_ID]);
    // N=3 is the pinned threshold constant.
    expect(ANSWERED_SWEEP_THRESHOLD).toBe(3);
  });

  it("457-lib-7 formatGenerationDriftDetail: matches the canonical ack detail template (V3)", () => {
    expect(formatGenerationDriftDetail("1", "2")).toBe(
      "generation drift — content changed since original draft (was g1, now g2)",
    );
  });

  // ── F1 guard: the drift branch must never supersede a gate it did not open ──

  it("457-lib-3b classifyPreDraftCheck: `absent` + drift entry under gateType 'escalation' → draft-fresh, NOT supersede-and-redraft", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    // A live sibling-row escalation gate (e.g. D.11 merge-conflicts) at a
    // different generation. D.7 must NOT ack it superseded: four dispatch rows
    // share `gateType: 'escalation'` and the wire carries no subtype
    // discriminator, so this entry may belong to another row entirely.
    const list: GateListResult = {
      gates: [
        {
          gateId: OTHER_GATE_ID,
          gateType: "escalation",
          generation: "merge-conflicts:waiting-for:merge-conflicts:1",
          status: "open",
        },
      ],
    };
    const outcome = classifyPreDraftCheck(
      status,
      list,
      "agent-error:agent:error:1",
      "escalation",
    );
    expect(outcome).toEqual({ kind: "draft-fresh" });
  });

  it("457-lib-3c classifyPreDraftCheck: `absent` + truncated escalation list → draft-fresh (the guard short-circuits before the truncation rule)", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    const outcome = classifyPreDraftCheck(
      status,
      { gates: [], truncated: true },
      "agent-error:agent:error:1",
      "escalation",
    );
    // The drift branch never runs for escalation, so there is no hidden drift
    // entry to worry about and no reason to abort.
    expect(outcome).toEqual({ kind: "draft-fresh" });
  });

  it("457-lib-3d classifyPreDraftCheck: escalation with listResult=null (caller skipped the query) → draft-fresh", () => {
    const status: GateStatusResult = { gateId: null, status: "absent" };
    expect(
      classifyPreDraftCheck(status, null, "agent-error:agent:error:1", "escalation"),
    ).toEqual({ kind: "draft-fresh" });
  });

  it("457-lib-3e driftBranchMaySupersede: false for 'escalation' only; true for every 1:1 gateType", () => {
    expect(driftBranchMaySupersede("escalation")).toBe(false);
    const ONE_TO_ONE: ReadonlyArray<GateType> = [
      "clarification",
      "artifact-review",
      "implementation-review",
      "manual-validation",
      "phase-queue",
      "filing",
      "scope-drained",
    ];
    for (const gt of ONE_TO_ONE) {
      expect(driftBranchMaySupersede(gt), `${gt} maps 1:1 to a dispatch row`).toBe(true);
    }
    // The four rows the escalation enum value collides across.
    expect([...ESCALATION_DISPATCH_ROWS]).toEqual(["D.6", "D.7", "D.10", "D.11"]);
  });

  // ── F4: the real four-class error taxonomy — no class means "absent" ──

  it("457-lib-8a classifyGateQueryError: every reachable class aborts; NONE resolves to draft-fresh", () => {
    const CLASSES: ReadonlyArray<GateQueryErrorClass> = [
      "query-unreachable",
      "invalid-args",
      "internal",
      "transport",
    ];
    for (const cls of CLASSES) {
      const error: GateQueryError = { class: cls, message: "boom" };
      const outcome = classifyGateQueryError(error);
      expect(
        outcome.kind,
        `${cls} must NOT be treated as "no existing gate"`,
      ).not.toBe("draft-fresh");
      expect(outcome.kind).toMatch(/^abort-/);
    }
    // Retry-later vs deterministic-bug routing.
    expect(classifyGateQueryError({ class: "query-unreachable", message: "x" }).kind).toBe(
      "abort-query-unreachable",
    );
    expect(classifyGateQueryError({ class: "transport", message: "x" }).kind).toBe(
      "abort-query-unreachable",
    );
    // invalid-args / internal are deterministic caller/server bugs — surfaced
    // loudly, never silently drafted around (round-1 finding 1).
    expect(classifyGateQueryError({ class: "invalid-args", message: "x" }).kind).toBe(
      "abort-gate-query-bug",
    );
    expect(classifyGateQueryError({ class: "internal", message: "x" }).kind).toBe(
      "abort-gate-query-bug",
    );
  });

  it("457-lib-8b classifyGateQueryError: an unknown class from a newer tool build still aborts (never draft-fresh)", () => {
    const outcome = classifyGateQueryError({
      class: "some-future-class" as GateQueryErrorClass,
      message: "x",
    });
    expect(outcome.kind).toBe("abort-gate-query-bug");
  });

  it("457-lib-8c GateQueryErrorClass pins the four classes the shipped tools actually return (not the 'transient' placeholder)", () => {
    const src = readFileSync(
      resolve(__dirname, "..", "lib", "gate-status-check.ts"),
      "utf-8",
    );
    const decl = src.slice(
      src.indexOf("export type GateQueryErrorClass"),
      src.indexOf("export interface GateQueryError"),
    );
    expect(decl).toContain('"query-unreachable"');
    expect(decl).toContain('"invalid-args"');
    expect(decl).toContain('"internal"');
    expect(decl).toContain('"transport"');
    // Negative pin: the incomplete round-2 taxonomy is gone.
    expect(decl).not.toContain('"transient"');
  });

  // ── F7: `status` is a required field on the canonical GateRecord ──

  it("457-lib-9 GateRecord declares `status` (required) and gate-status-check no longer patches it in via an intersection", () => {
    const wireTypes = readFileSync(
      resolve(__dirname, "..", "lib", "gate-wire-types.ts"),
      "utf-8",
    );
    const recordDecl = wireTypes.slice(
      wireTypes.indexOf("export interface GateRecord {"),
      wireTypes.indexOf("export type OpenGatesMap"),
    );
    // Required (no `?`), matching data-model.md § GateRecord.
    expect(recordDecl).toMatch(/^\s*status: "open" \| "answered";/m);
    expect(recordDecl).not.toMatch(/status\?:/);

    const check = readFileSync(
      resolve(__dirname, "..", "lib", "gate-status-check.ts"),
      "utf-8",
    );
    // The ad-hoc intersection that papered over the missing field is gone.
    expect(check).not.toMatch(/GateRecord & \{ status\?/);
    expect(check).toContain("openGates: Map<GateId, GateRecord>");
  });

  it("457-lib-8 ESCAPE_HATCH_ACK_DETAIL matches the exact detail-string literal pinned by 457-3", () => {
    expect(ESCAPE_HATCH_ACK_DETAIL).toBe(
      "answered-not-consumed — presumed stuck at cloud delivered/applied",
    );
  });

  // ────────────────────────────────────────────────────────────────────────
  // 457-integration (SC-005) — simulate a gate stuck at cloud `delivered`.
  // Seed openGates with a `status: 'answered'` entry, drive three sweep
  // ticks with no D.12 event, assert the escape hatch fires with the correct
  // ack params and clears both maps.
  // ────────────────────────────────────────────────────────────────────────

  it("457-int-1 (SC-005): three sweeps with no D.12 event → ack `superseded` with exact detail + both maps cleared", () => {
    const openGates = new Map<GateId, GateRecord>();
    openGates.set(FAKE_GATE_ID, makeGateRecord(FAKE_GATE_ID, "answered"));
    const counter: AnsweredGateSweepCounter = new Map();

    // Sweep tick 1.
    tickAnsweredSweepCounter(openGates, counter);
    expect(selectEscapeHatchTargets(counter)).toEqual([]);
    // Sweep tick 2.
    tickAnsweredSweepCounter(openGates, counter);
    expect(selectEscapeHatchTargets(counter)).toEqual([]);
    // Sweep tick 3 — escape hatch fires.
    tickAnsweredSweepCounter(openGates, counter);
    const targets = selectEscapeHatchTargets(counter);
    expect(targets).toEqual([FAKE_GATE_ID]);

    // Simulate the ack + cleanup the escape-hatch prose describes.
    const ackCalls: Array<{
      gateId: GateId;
      outcome: string;
      detail: string;
    }> = [];
    for (const gateId of targets) {
      ackCalls.push({
        gateId,
        outcome: "superseded",
        detail: ESCAPE_HATCH_ACK_DETAIL,
      });
      openGates.delete(gateId);
      counter.delete(gateId);
    }
    expect(ackCalls).toEqual([
      {
        gateId: FAKE_GATE_ID,
        outcome: "superseded",
        detail:
          "answered-not-consumed — presumed stuck at cloud delivered/applied",
      },
    ]);
    // Both maps are cleared.
    expect(openGates.has(FAKE_GATE_ID)).toBe(false);
    expect(counter.has(FAKE_GATE_ID)).toBe(false);
    // The hatch ACTIVELY re-derives in the same pass (it does NOT wait for a
    // drain — the ack changed no label, so no drain would ever carry the
    // event). Simulate the re-derivation's own pre-draft check: the just-acked
    // gate is terminal, so `cockpit_gate_status` returns `absent` and drafting
    // proceeds.
    const followupStatus: GateStatusResult = { gateId: null, status: "absent" };
    const followupOutcome = classifyPreDraftCheck(
      followupStatus,
      { gates: [] },
      "gen-A",
      "clarification",
    );
    expect(followupOutcome).toEqual({ kind: "draft-fresh" });
  });

  it("457-int-2: D.12 delivery within N=3 sweeps resets the counter — escape hatch does NOT fire", () => {
    const openGates = new Map<GateId, GateRecord>();
    openGates.set(FAKE_GATE_ID, makeGateRecord(FAKE_GATE_ID, "answered"));
    const counter: AnsweredGateSweepCounter = new Map();

    tickAnsweredSweepCounter(openGates, counter);
    tickAnsweredSweepCounter(openGates, counter);
    expect(counter.get(FAKE_GATE_ID)).toBe(2);

    // D.12 handler fires — deletes both.
    openGates.delete(FAKE_GATE_ID);
    counter.delete(FAKE_GATE_ID);

    // Even if the map were mistakenly re-populated later, the counter is fresh.
    expect(selectEscapeHatchTargets(counter)).toEqual([]);
  });
});

// Silence TS unused-import warning if only used for type narrowing.
const _typeGuardAddExisting = (a: AddExistingIntent) => a.ref;
const _typeGuardFileNew = (a: FileNewIntent) => a.topic;
void _typeGuardAddExisting;
void _typeGuardFileNew;

