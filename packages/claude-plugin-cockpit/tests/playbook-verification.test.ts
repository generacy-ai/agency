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
    const { verbs, snapshots } = loadKnownVerbSnapshots();
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

