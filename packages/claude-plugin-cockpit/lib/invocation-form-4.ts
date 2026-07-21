/**
 * invocation-form-4.ts
 *
 * Pure reference implementation of the parsers, resolvers, formatters, and
 * ref-set predicates that back `/cockpit:auto` Form 4 (issue-number list with
 * workspace-repo inference) in `commands/auto.md` step 1.
 *
 * The runtime consumer is Claude following the playbook prose; this module
 * exists so the parser rules have a machine-checkable definition against
 * fixtures. Matches the #400 `clarification-batch-parser.ts` / #416
 * `intent-recognition.ts` shape: pure functions, no I/O, no async, no
 * external state, deterministic.
 *
 * Contracts:
 * - specs/444-summary-cockpit-auto-accept/contracts/invocation-form-4-parse.md
 * - specs/444-summary-cockpit-auto-accept/contracts/ref-validation.md
 * - specs/444-summary-cockpit-auto-accept/contracts/tracking-issue-reuse.md
 * - specs/444-summary-cockpit-auto-accept/contracts/tracking-issue-body.md
 * - specs/444-summary-cockpit-auto-accept/data-model.md
 */

// ---------------------------------------------------------------------------
// E1 — RawInvocation
// ---------------------------------------------------------------------------

export interface RawInvocation {
  readonly rawArguments: string;
  readonly cwd: string;
}

// ---------------------------------------------------------------------------
// E2 — ParsedTokens
// ---------------------------------------------------------------------------

export interface ParsedTokens {
  readonly tokens: readonly string[];
  readonly flags: {
    readonly tracking: boolean;
    readonly new: boolean;
    readonly unknown: readonly string[];
  };
  readonly isEmpty: boolean;
}

// ---------------------------------------------------------------------------
// E3 — InvocationForm (discriminated union)
// ---------------------------------------------------------------------------

export type UsageErrorReason =
  | "empty"
  | "both-flags"
  | "unknown-flag"
  | "tracking-arg-shape"
  | "new-arg-shape";

export type InvocationForm =
  | { readonly form: "epic"; readonly epicRef: QualifiedRef }
  | { readonly form: "tracking-existing"; readonly trackingRef: QualifiedRef }
  | { readonly form: "tracking-new"; readonly title: string }
  | { readonly form: "tracking-list"; readonly tokens: ParsedTokens }
  | { readonly form: "usage-error"; readonly reason: UsageErrorReason };

// ---------------------------------------------------------------------------
// E4 — QualifiedRef
// ---------------------------------------------------------------------------

export interface QualifiedRef {
  readonly owner: string;
  readonly repo: string;
  readonly number: number;
  readonly supplied: "bare" | "qualified";
}

// ---------------------------------------------------------------------------
// E5 — WorkspaceRepo
// ---------------------------------------------------------------------------

export interface WorkspaceRepo {
  readonly owner: string;
  readonly repo: string;
  readonly originUrl: string;
}

// ---------------------------------------------------------------------------
// E6 — ResolvedRefSet
// ---------------------------------------------------------------------------

export interface ResolvedRefSet {
  readonly refs: readonly QualifiedRef[];
  readonly workspace: WorkspaceRepo;
}

// ---------------------------------------------------------------------------
// E7 — RefValidationResult
// ---------------------------------------------------------------------------

export interface RefValidationHit {
  readonly ref: QualifiedRef;
  readonly status: number;
}

export interface RefValidationMiss {
  readonly ref: QualifiedRef;
  readonly reason: string;
}

export interface RefValidationResult {
  readonly ok: readonly RefValidationHit[];
  readonly bad: readonly RefValidationMiss[];
}

// ---------------------------------------------------------------------------
// E8 — TrackingReuseCandidate
// ---------------------------------------------------------------------------

export interface TrackingReuseCandidate {
  readonly ref: QualifiedRef;
  readonly bodyRefs: readonly QualifiedRef[];
  readonly createdAt: string;
}

// ---------------------------------------------------------------------------
// E9 — TrackingIssueSeed
// ---------------------------------------------------------------------------

export interface TrackingIssueSeed {
  readonly title: string;
  readonly body: string;
  readonly labels: readonly ["cockpit:tracking"];
}

// ---------------------------------------------------------------------------
// E10 — Form4Outcome
// ---------------------------------------------------------------------------

export type Form4FailureReason =
  | {
      readonly kind: "usage-error";
      readonly parsed: InvocationForm & { form: "usage-error" };
    }
  | { readonly kind: "workspace-repo"; readonly observed: string }
  | { readonly kind: "ref-validation"; readonly result: RefValidationResult }
  | { readonly kind: "gh-issue-create-failed"; readonly stderr: string }
  | { readonly kind: "gh-label-create-failed"; readonly stderr: string };

export type Form4Outcome =
  | {
      readonly kind: "resumed";
      readonly trackingRef: QualifiedRef;
      readonly via: TrackingReuseCandidate;
    }
  | {
      readonly kind: "created";
      readonly trackingRef: QualifiedRef;
      readonly seed: TrackingIssueSeed;
    }
  | { readonly kind: "failed"; readonly reason: Form4FailureReason };

// ===========================================================================
// Pure functions
// ===========================================================================

const KNOWN_FLAGS = new Set(["--tracking", "--new"]);
const QUALIFIED_REF_RE = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;
const BARE_REF_RE = /^\d+$/;

// ---------------------------------------------------------------------------
// parseTokens — split on commas + whitespace, discard empties, classify flags
// ---------------------------------------------------------------------------

export function parseTokens(rawArguments: string): ParsedTokens {
  const raw = rawArguments.split(/[,\s]+/).filter((t) => t.length > 0);
  let tracking = false;
  let isNew = false;
  const unknown: string[] = [];
  const positional: string[] = [];

  for (const token of raw) {
    if (token === "--tracking") {
      tracking = true;
      continue;
    }
    if (token === "--new") {
      isNew = true;
      continue;
    }
    if (token.startsWith("--")) {
      unknown.push(token);
      continue;
    }
    positional.push(token);
  }

  const isEmpty = raw.length === 0;

  return {
    tokens: positional,
    flags: {
      tracking,
      new: isNew,
      unknown,
    },
    isEmpty,
  };
}

// ---------------------------------------------------------------------------
// dispatchForm — seven-step dispatch table from data-model.md § E3
// ---------------------------------------------------------------------------

function parseQualifiedRefToken(
  token: string,
  supplied: "bare" | "qualified",
): QualifiedRef | null {
  const m = QUALIFIED_REF_RE.exec(token);
  if (!m) return null;
  return {
    owner: m[1]!,
    repo: m[2]!,
    number: parseInt(m[3]!, 10),
    supplied,
  };
}

export function dispatchForm(parsed: ParsedTokens): InvocationForm {
  // 1. Both flags → usage error.
  if (parsed.flags.tracking && parsed.flags.new) {
    return { form: "usage-error", reason: "both-flags" };
  }
  // 2. Unknown flag → usage error.
  if (parsed.flags.unknown.length > 0) {
    return { form: "usage-error", reason: "unknown-flag" };
  }
  // 3. --tracking — positional stream must be one qualified ref.
  if (parsed.flags.tracking) {
    if (parsed.tokens.length !== 1) {
      return { form: "usage-error", reason: "tracking-arg-shape" };
    }
    const ref = parseQualifiedRefToken(parsed.tokens[0]!, "qualified");
    if (ref === null) {
      return { form: "usage-error", reason: "tracking-arg-shape" };
    }
    return { form: "tracking-existing", trackingRef: ref };
  }
  // 4. --new — positional stream must be one non-empty title.
  if (parsed.flags.new) {
    if (parsed.tokens.length !== 1 || parsed.tokens[0]!.length === 0) {
      return { form: "usage-error", reason: "new-arg-shape" };
    }
    return { form: "tracking-new", title: parsed.tokens[0]! };
  }
  // 5. No flags, single token matching qualified ref → epic.
  if (parsed.tokens.length === 1) {
    const ref = parseQualifiedRefToken(parsed.tokens[0]!, "qualified");
    if (ref !== null) {
      return { form: "epic", epicRef: ref };
    }
  }
  // 6. No flags, one-or-more tokens (any shape) → tracking-list (Form 4).
  if (parsed.tokens.length >= 1) {
    return { form: "tracking-list", tokens: parsed };
  }
  // 7. Empty invocation.
  return { form: "usage-error", reason: "empty" };
}

// ---------------------------------------------------------------------------
// parseWorkspaceRepo — accept all three GitHub remote URL shapes
// ---------------------------------------------------------------------------

const HTTPS_ORIGIN_RE = /^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const SSH_SHORT_ORIGIN_RE = /^git@github\.com:([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;
const SSH_LONG_ORIGIN_RE = /^ssh:\/\/git@github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/;

export function parseWorkspaceRepo(originUrl: string): WorkspaceRepo | null {
  const trimmed = originUrl.trim();
  const patterns = [HTTPS_ORIGIN_RE, SSH_SHORT_ORIGIN_RE, SSH_LONG_ORIGIN_RE];
  for (const re of patterns) {
    const m = re.exec(trimmed);
    if (m) {
      return {
        owner: m[1]!,
        repo: m[2]!,
        originUrl: trimmed,
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// resolveRefs — bare + qualified → QualifiedRef[] with first-seen dedup
// ---------------------------------------------------------------------------

function refsEqual(a: QualifiedRef, b: QualifiedRef): boolean {
  return a.owner === b.owner && a.repo === b.repo && a.number === b.number;
}

export function resolveRefs(
  tokens: readonly string[],
  workspace: WorkspaceRepo,
): ResolvedRefSet {
  const resolved: QualifiedRef[] = [];
  for (const token of tokens) {
    let ref: QualifiedRef | null = null;
    if (BARE_REF_RE.test(token)) {
      ref = {
        owner: workspace.owner,
        repo: workspace.repo,
        number: parseInt(token, 10),
        supplied: "bare",
      };
    } else {
      ref = parseQualifiedRefToken(token, "qualified");
    }
    if (ref === null) continue;
    if (resolved.some((r) => refsEqual(r, ref!))) continue;
    resolved.push(ref);
  }
  return { refs: resolved, workspace };
}

// ---------------------------------------------------------------------------
// formatTitle — R5 title convention with (+K more) truncation
// ---------------------------------------------------------------------------

function renderRef(ref: QualifiedRef, workspace: WorkspaceRepo): string {
  if (ref.owner === workspace.owner && ref.repo === workspace.repo) {
    return `#${ref.number}`;
  }
  return `${ref.owner}/${ref.repo}#${ref.number}`;
}

export function formatTitle(
  refs: readonly QualifiedRef[],
  workspace: WorkspaceRepo,
  dateUtc: string,
): string {
  const inline = refs.slice(0, 5).map((r) => renderRef(r, workspace));
  const suffix = refs.length > 5 ? ` (+${refs.length - 5} more)` : "";
  return `Tracking: auto session ${dateUtc} — ${inline.join(" ")}${suffix}`;
}

// ---------------------------------------------------------------------------
// formatBody — R7 flat qualified task list
// ---------------------------------------------------------------------------

export function formatBody(refs: readonly QualifiedRef[]): string {
  return refs.map((r) => `- [ ] ${r.owner}/${r.repo}#${r.number}`).join("\n");
}

// ---------------------------------------------------------------------------
// refSetEqual — R4 order-agnostic, dedup-agnostic set compare
// ---------------------------------------------------------------------------

function refKey(ref: QualifiedRef): string {
  return `${ref.owner}/${ref.repo}#${ref.number}`;
}

export function refSetEqual(
  a: readonly QualifiedRef[],
  b: readonly QualifiedRef[],
): boolean {
  const aSet = new Set(a.map(refKey));
  const bSet = new Set(b.map(refKey));
  if (aSet.size !== bSet.size) return false;
  for (const key of aSet) {
    if (!bSet.has(key)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// parseBodyRefs — R3 body-parse regex for reuse detection
// ---------------------------------------------------------------------------

const BODY_REF_LINE_RE = /^\s*- \[ \] ([\w.-]+)\/([\w.-]+)#(\d+)\s*$/;

export function parseBodyRefs(body: string): QualifiedRef[] {
  const refs: QualifiedRef[] = [];
  for (const line of body.split("\n")) {
    const m = BODY_REF_LINE_RE.exec(line);
    if (!m) continue;
    refs.push({
      owner: m[1]!,
      repo: m[2]!,
      number: parseInt(m[3]!, 10),
      supplied: "qualified",
    });
  }
  return refs;
}
