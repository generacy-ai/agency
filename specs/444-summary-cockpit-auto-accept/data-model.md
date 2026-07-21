# Data Model: `/cockpit:auto` Form 4

TypeScript-shaped entities that describe the runtime state and boundary values for Form 4. Every field is either produced by parsing, produced by resolution, or read from GitHub. No entity is persisted to disk — Form 4's state is transient (fully consumed within one slash-command invocation).

## E1 — `RawInvocation`

The raw operator input, exactly as received from the harness `$ARGUMENTS`.

```ts
interface RawInvocation {
  /** The verbatim `$ARGUMENTS` string as passed to the skill. */
  rawArguments: string;
  /** The operator's cwd at slash-command time, captured via Bash. */
  cwd: string;
}
```

**Provenance**: `rawArguments` from harness. `cwd` from a Bash `pwd` call in the first pre-flight step.

## E2 — `ParsedTokens`

Result of splitting `rawArguments` on commas + whitespace and discarding empty tokens.

```ts
interface ParsedTokens {
  /** Non-empty tokens in first-seen order. Empty after Q5=A discard means usage error. */
  tokens: string[];
  /** Flag tokens (`--tracking`, `--new`, etc.) stripped for downstream form detection. */
  flags: {
    tracking: boolean;
    new: boolean;
    /** Any unrecognized `--*` token; presence → usage error. */
    unknown: string[];
  };
  /** Whether the input was zero non-empty tokens after splitting (Q5=A boundary → usage error). */
  isEmpty: boolean;
}
```

**Split rule**: `rawArguments.split(/[,\s]+/).filter(t => t.length > 0)`. Trailing/leading commas and whitespace produce no tokens; interior empty tokens (`512,,513`, `512, ,513`) collapse silently.

**Validation**: `flags.unknown.length > 0` → usage error before Form 4 dispatch fires.

## E3 — `InvocationForm`

Discriminated union naming which of the four forms matched.

```ts
type InvocationForm =
  | { form: "epic"; epicRef: QualifiedRef }
  | { form: "tracking-existing"; trackingRef: QualifiedRef }
  | { form: "tracking-new"; title: string }
  | { form: "tracking-list"; tokens: ParsedTokens }   // NEW — Form 4
  | { form: "usage-error"; reason: UsageErrorReason };
```

**Dispatch rule** (matches R9 ambiguity table):

1. `flags.tracking && flags.new` → `usage-error` (`"both-flags"`).
2. `flags.unknown.length > 0` → `usage-error` (`"unknown-flag"`).
3. `flags.tracking` — positional stream must be one qualified ref → `tracking-existing`; else `usage-error` (`"tracking-arg-shape"`).
4. `flags.new` — positional stream must be one quoted title → `tracking-new`; else `usage-error` (`"new-arg-shape"`).
5. No flags, `tokens.length === 1`, token matches `<owner>/<repo>#<n>` → `epic`.
6. No flags, `tokens.length >= 1`, any token → `tracking-list` (Form 4).
7. `isEmpty` → `usage-error` (`"empty"`).

```ts
type UsageErrorReason =
  | "empty"
  | "both-flags"
  | "unknown-flag"
  | "tracking-arg-shape"
  | "new-arg-shape";
```

## E4 — `QualifiedRef`

A GitHub issue reference resolved to its owner/repo/number tuple.

```ts
interface QualifiedRef {
  owner: string;
  repo: string;
  number: number;
  /**
   * The renderable form the ref was supplied as:
   *   "bare" — operator typed `512`, resolved against workspace repo
   *   "qualified" — operator typed `owner/repo#512` verbatim
   */
  supplied: "bare" | "qualified";
}
```

**Equality** (Q3=A dedup semantics): Two `QualifiedRef`s are equal iff `owner`, `repo`, and `number` all match. `supplied` is NOT part of equality — a bare `512` and a qualified `workspace/repo#512` collapse.

**String rendering**:
- **Short form** (used in title when the ref is workspace-local): `#<number>`.
- **Qualified form** (used in body always; used in title when the ref is cross-repo): `<owner>/<repo>#<number>`.

## E5 — `WorkspaceRepo`

The GitHub repo identity of the operator's cwd, resolved from `git remote get-url origin`.

```ts
interface WorkspaceRepo {
  owner: string;
  repo: string;
  /** The verbatim URL `git remote get-url origin` returned, for diagnostics. */
  originUrl: string;
}
```

**Parse rules** (accept all three GitHub remote URL shapes):
- HTTPS: `https://github.com/<owner>/<repo>(.git)?`
- SSH shorthand: `git@github.com:<owner>/<repo>(.git)?`
- SSH long form: `ssh://git@github.com/<owner>/<repo>(.git)?`

**Failure modes** (all → `Print + exit`, no issue created):
- `git remote get-url origin` exits non-zero → not a git repo, or `origin` is unset.
- URL matches none of the three shapes → non-GitHub origin (e.g., GitLab, self-hosted git server).

Both cases produce diagnostic:
```
/cockpit:auto Form 4 needs a workspace whose `origin` is a GitHub repo. Observed: <originUrl or "no origin">.
```

## E6 — `ResolvedRefSet`

The invocation's ref-set after resolution + dedup. Load-bearing input to validation (E7) and reuse detection (E8).

```ts
interface ResolvedRefSet {
  /** Fully-qualified refs, first-seen order preserved after Q3=A dedup. */
  refs: QualifiedRef[];
  /** The workspace repo (source of bare-number resolution). */
  workspace: WorkspaceRepo;
}
```

**Construction algorithm**:
1. For each token in `ParsedTokens.tokens`:
   - If token matches `^\d+$` → resolve as `{ ...workspace, number: parseInt(token), supplied: "bare" }`.
   - If token matches `^<owner>/<repo>#<n>$` → resolve as `{ owner, repo, number, supplied: "qualified" }`.
   - Else → **not** a usage error at this stage (the form gate at E3 already accepted it) — but a construction-time reject: `Print + exit` with `Cannot parse ref token: <token>`. In practice this branch is unreachable when the E3 gate is correct.
2. Dedup in first-seen order: keep the first occurrence of each unique `(owner, repo, number)` tuple; drop later occurrences (regardless of `supplied` field).
3. Result is `ResolvedRefSet.refs`.

## E7 — `RefValidationResult`

Aggregated result of the up-front `gh api` probe (Q4=A).

```ts
interface RefValidationResult {
  ok: RefValidationHit[];
  bad: RefValidationMiss[];
}

interface RefValidationHit {
  ref: QualifiedRef;
  /** GitHub REST status (200 or 301). Included for diagnostics. */
  status: number;
}

interface RefValidationMiss {
  ref: QualifiedRef;
  /** e.g., "404 Not Found", "403 Forbidden — token lacks access". */
  reason: string;
}
```

**Query per ref**: `gh api -X GET repos/<owner>/<repo>/issues/<number> --silent --include`. Success codes: `200`, `301` (moved permanently — GitHub redirects when a repo is renamed; the ref still refers to a valid issue). Any other status → `bad`.

**Exit rule**: `bad.length > 0` → print aggregated diagnostic naming every bad ref (see contract `contracts/ref-validation.md § Diagnostic shape`) and exit before any issue is created.

## E8 — `TrackingReuseCandidate`

A pre-existing open `cockpit:tracking` issue that might be reusable.

```ts
interface TrackingReuseCandidate {
  ref: QualifiedRef;
  /** The parsed ref-set from the candidate's body (workspace-scoped issues only). */
  bodyRefs: QualifiedRef[];
  createdAt: string;  // ISO 8601
}
```

**Query**: `gh issue list --repo <workspace>/<owner> --label cockpit:tracking --state open --json number,body,createdAt`.

**Body parse**: Extract every line matching `^- \[ \] <owner>/<repo>#<n>` (case-sensitive; leading whitespace allowed; other bullet styles ignored). The engine's Form-3 body-writing convention emits exactly this shape; if the operator has hand-edited the body, mismatched lines are ignored (they cannot legitimately participate in reuse detection).

**Match rule** (R4 equality): `TrackingReuseCandidate` matches this invocation iff `Set(candidate.bodyRefs) === Set(resolvedRefs.refs)` under `QualifiedRef` equality (E4). At most one candidate can match; if two open issues have the identical ref-set, log a warning and reuse the oldest (deterministic tiebreaker: min `createdAt`).

## E9 — `TrackingIssueSeed`

The values Form 4 hands to `gh issue create` when creating a fresh tracking issue.

```ts
interface TrackingIssueSeed {
  title: string;    // Title-truncation rule R5 applied
  body: string;     // Flat qualified task list (R7)
  labels: ["cockpit:tracking"];  // Applied post-label-create (R6)
}
```

**Title format** (Q1=A):
```
Tracking: auto session <YYYY-MM-DD> — <ref1> <ref2> ... <ref5> (+K more)
```
where:
- `<YYYY-MM-DD>` is UTC today's date (deterministic across operator timezones — matches the "captured now" convention of the ledger-filename timestamp at auto.md step 1).
- Each `<refN>` is rendered short-form if workspace-local (`#N`), qualified otherwise (`owner/repo#N`).
- `(+K more)` appears only when `resolvedRefs.refs.length > 5`; K is `refs.length - 5`.

**Body format** (R7):
```
- [ ] owner/repo#223
- [ ] owner/repo#224
- [ ] other/repo#41
```
Every ref rendered in fully-qualified form (the engine's resolver requires it). One ref per line; no blank lines; no headings; no `## Ad-hoc` section (that section is populated at runtime by `cockpit_scope_add`).

## E10 — `Form4Outcome`

The final discriminated result Form 4 hands off to the rest of `auto.md`.

```ts
type Form4Outcome =
  | { kind: "resumed"; trackingRef: QualifiedRef; via: TrackingReuseCandidate }
  | { kind: "created"; trackingRef: QualifiedRef; seed: TrackingIssueSeed }
  | { kind: "failed"; reason: Form4FailureReason };

type Form4FailureReason =
  | { kind: "usage-error"; parsed: InvocationForm & { form: "usage-error" } }
  | { kind: "workspace-repo"; observed: string }
  | { kind: "ref-validation"; result: RefValidationResult }
  | { kind: "gh-issue-create-failed"; stderr: string }
  | { kind: "gh-label-create-failed"; stderr: string };  // ignored if "already exists"
```

**Handoff**: On `resumed`, the caller sets `invocationForm = "tracking-existing"` and proceeds against `trackingRef` (prints the reuse notice per R3, then the standard startup line). On `created`, the caller sets `invocationForm = "tracking-existing"` and proceeds against `trackingRef` (writes ledger header `Tracking ref: <trackingRef> · form: tracking-list`, prints the standard startup line). On `failed`, the caller prints the failure diagnostic and exits non-zero (no ledger created).

## Validation summary — where each rule is enforced

| Rule | Entity | Enforced at |
|------|--------|-------------|
| Empty-token discard (Q5=A) | `ParsedTokens` | Split step (E2) |
| Both flags → usage error | `InvocationForm` | Dispatch (E3.1) |
| Form 4 accepts bare + mixed | `InvocationForm` | Dispatch (E3.6) |
| GitHub-origin required | `WorkspaceRepo` | Parse step (E5) |
| Dedup first-seen (Q3=A) | `ResolvedRefSet` | Construction step 2 (E6) |
| All refs must exist (Q4=A) | `RefValidationResult` | Post-resolution probe (E7) |
| Identical ref-set → reuse (Q2=B) | `TrackingReuseCandidate` | Post-validation query (E8) |
| ≤5 refs inline in title (Q1=A) | `TrackingIssueSeed` | Title-format step (E9) |
| Fully qualified in body | `TrackingIssueSeed` | Body-format step (E9) |
| `cockpit:tracking` label applied | `TrackingIssueSeed` | Post-creation label apply (R6) |
