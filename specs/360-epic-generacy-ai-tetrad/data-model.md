# Data Model: `/cockpit:bug` + AFK push in `/cockpit:watch`

**Feature**: `/cockpit:bug` confirm-gated bug-filer + AFK `PushNotification` amendment to `/cockpit:watch` (A5.3)
**Branch**: `360-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

Neither deliverable persists state on disk. The "data model" here is the set of typed values the two commands accept, compute, and emit during one invocation, plus the contract for the artifacts the bug-filing engine creates on GitHub (the hidden HTML marker + label). Each entity below names its shape, validation rules, and source.

---

## Part A — `/cockpit:bug` entities

### E1: `BugTitle`

The freeform issue title supplied by the operator and passed to the bug-filing engine.

```ts
type BugTitle = string;  // opaque; the whole trimmed $ARGUMENTS, multi-token allowed
```

**Validation (slash-command side, structural only)**:
- Required. Captured as the entire trimmed `$ARGUMENTS` string.
- Empty / whitespace-only → `Usage: /cockpit:bug <title-or-description>`, exit non-zero. (No prompt; no engine call.)
- Otherwise → pass byte-for-byte to the engine; no further validation, no tokenization, no first-line/remainder split, no Markdown stripping, no case-folding.

**Validation (engine side, semantic)**:
- Owned by the bug-filing engine (sibling A2.1 / A2.5). The slash command does not embed any title rules.

**Source**: spec.md § Summary; clarification Q1=A; research D2.

---

### E2: `TitlePreview`

The truncated form of `BugTitle` shown inside the `AskUserQuestion` prompt UI. Informational only; never sent to the engine.

```ts
function preview(title: BugTitle): string {
  return title.length <= 120 ? title : title.slice(0, 120) + "…";
}
type TitlePreview = string;  // max 121 chars (120 + the ellipsis)
```

**Invariants**:
- Truncation is at the 120th codepoint; the `…` (U+2026 HORIZONTAL ELLIPSIS) is appended only when truncation actually happened.
- The preview is rendered into the `question` field of `AskUserQuestion`; the engine receives the full `BugTitle`, not the preview.

**Source**: research D6.

---

### E3: `ConfirmationOption`

The closed set of selections `AskUserQuestion` may return, and the closed rule for what counts as affirmative.

```ts
type ConfirmationOption = "Confirm" | "Cancel" | "Other" | null;
// "Other" is auto-added by the AskUserQuestion primitive; null represents
// any non-selection / aborted prompt the host may return.

const AFFIRMATIVE: ConfirmationOption = "Confirm";
```

**Semantics**:

| Selection | Treated as | Engine invoked? |
|-----------|------------|-----------------|
| `Confirm` | affirmative | yes |
| `Cancel` | non-affirmative | no |
| `Other` (any free text) | non-affirmative | no |
| `null` / no selection / aborted prompt | non-affirmative | no |

**Affirmative test**: string equality against the literal `Confirm`. There is no permissive set, no case-folding, no trimming-and-comparing.

**Source**: clarification Q3=A; research D4. (Identical to `/cockpit:queue` E2; carried by reference.)

---

### E4: `ConfirmationPrompt`

The exact configuration passed to `AskUserQuestion`.

```ts
interface ConfirmationPrompt {
  question: string;        // multi-line literal: "File this as a `process:speckit-bugfix` issue?\n\nTitle: <preview>"
  header: string;          // "File bug" — short label, ≤12 chars
  multiSelect: false;      // single selection only
  options: [
    { label: "Confirm"; description: "File the bug and enter the process:speckit-bugfix loop" },
    { label: "Cancel";  description: "Abort without filing" },
  ];
}
```

**Invariants**:
- `question` line 1 MUST be the literal string ``File this as a `process:speckit-bugfix` issue?`` with no surrounding whitespace.
- `question` line 2 MUST be blank.
- `question` line 3 MUST be `Title: ` followed by `TitlePreview` (E2) with no trailing whitespace.
- Exactly two options, in the order `Confirm` first, `Cancel` second.
- The host primitive auto-adds an `Other` option; that is expected and handled by E3.

**Source**: clarification Q3=A; research D4, D6.

---

### E5: `DedupMarker`

The hidden HTML marker the engine writes into the GitHub issue body for marker-based dedup. The slash command does NOT compute, read, or validate this value — it is shown here only for completeness of the cross-deliverable contract.

```ts
type DedupMarker = `<!-- generacy-bug: ${string} -->`;  // hex hash, 64 chars

function markerOf(title: BugTitle): DedupMarker {
  const trimmed = title.trim();   // matches slash-command-side trim
  const hash = sha256Hex(trimmed); // lowercase hex
  return `<!-- generacy-bug: ${hash} -->`;
}
```

**Invariants (engine-side)**:
- The hash MUST be computed on the trimmed `BugTitle` — the same value the slash command passes to the engine. Whitespace differences in the operator's input produce different hashes (documented behaviour; see research D5).
- The hash MUST be lowercase hex (64 chars). `sha256` is the chosen algorithm (Q5=B locks the format prefix `generacy-bug:` and the hash family).
- The marker MUST be a single-line HTML comment in the issue body. Position within the body is not specified (top or bottom or middle); the engine search is a substring scan, not a position-anchored regex.
- The marker MUST be searchable across open issues labelled `process:speckit-bugfix` (E6). The engine does NOT search across closed issues — re-filing a bug whose previous instance was closed produces a new issue, by design (a closed bug is "done"; a re-report of the same prose is a new occurrence).

**Source**: clarification Q5=B; research D5.

---

### E6: `ProcessLabel`

The literal GitHub label the engine applies to every issue filed by `/cockpit:bug`. Routes the issue through the watch/merge bugfix loop.

```ts
type ProcessLabel = "process:speckit-bugfix";
```

**Invariants (engine-side)**:
- Literal string — no variations, no per-repo overrides.
- Engine creates the label in the target repo if it does not already exist (the slash command does not pre-flight the label).
- Once applied, the autonomy policy / watch stream classifier picks the label up via its existing label-based routing — no new code path on the watch side.

**Source**: clarification Q2=C; research D3.

---

### E7: `EngineInvocation`

The exact shape of the subprocess `/cockpit:bug` runs after `Confirm`.

```ts
interface EngineInvocation {
  cwd: "<repository-root>";
  command: "generacy";
  args: [/* engine sub-verb */, /* engine sub-sub-verb */, title];
                                  // exact sub-verb path is engine-owned (A2.1 / A2.5)
  env: "inherit";                 // no env overrides
  capture: { stdout: string; stderr: string; exitCode: number };
}
```

**Pre-flight**:

```ts
type PreflightResult = "binary-present" | "binary-missing";
// derived from: command -v generacy >/dev/null 2>&1 → exit 0 vs ≠ 0
```

**Invariants**:
- The engine is invoked from the repository root (consistent with `/cockpit:status` and `/cockpit:queue`).
- The title is passed as a single positional argument, byte-for-byte from `BugTitle` (E1).
- No flags are passed by the slash command. In particular, no `--json`, no `--label-override`, no `--body`.
- Pre-flight failure short-circuits to `MISSING_BINARY` (E9) without invoking the engine.
- The engine is responsible for marker computation (E5), label application (E6), body templating, dedup search, and GitHub API calls. The slash command surfaces stdout/stderr verbatim.

**Source**: research D9.

---

### E8: `BugSuccessOutput`

The shape of the success rendering (engine exit code 0 after `Confirm`).

```ts
interface BugSuccessOutput {
  header: `**Filed:** ${string}`;   // literal "**Filed:** <repo>#<number>"
  blankLine: "";                    // exactly one blank line follows the header
  fencedBody: {
    fence: "```";
    body: string;                   // captured engine stdout, verbatim
  };
}
```

**Rendered as**:

````markdown
**Filed:** <repo>#<number>

```
<verbatim engine stdout>
```
````

**Invariants**:
- Header is the literal line `**Filed:** <repo>#<number>` (research D7).
- `<repo>#<number>` is taken from the engine's success payload. The slash command does not parse the engine's stdout structurally — by convention, the engine emits the ref on its last stdout line OR in a structured JSON field that the slash command's host runtime can pick up. If the engine emits neither, the header falls back to `**Filed:** (see below)` and the fenced block carries the full output.
- Exactly one blank line separates header from fence.
- Engine stdout is rendered verbatim — no reflow, reformat, re-alignment, re-decoration, symbol substitution, or trailing-whitespace stripping.
- No additional summary, narration, or footer is emitted (SC-002 carry-over).
- Dedup hits (engine reused an existing issue) ALSO render under this shape. The `<repo>#<number>` is the existing issue's number; the engine indicates the reuse via its stdout text inside the fenced block. There is no separate "Reused:" header.

**Source**: research D7, D8.

---

### E9: `BugErrorClassification`

The closed set of error classes `/cockpit:bug` emits, with their triggers and rendered output.

```ts
type BugErrorClass =
  | "Usage"          // structural arg error (empty / whitespace-only)
  | "Cancelled"      // non-affirmative AskUserQuestion outcome
  | "MissingBinary"  // pre-flight `command -v generacy` failed
  | "AuthFailure"    // engine exit ≠ 0 AND stderr matches /auth|unauthorized|401|gh auth/i
  | "Other";         // engine exit ≠ 0, anything else
```

| Class | Trigger | Rendered output | Exit code |
|-------|---------|-----------------|-----------|
| `Usage` | `$ARGUMENTS` empty / whitespace-only | `Usage: /cockpit:bug <title-or-description>` (one line, no fence) | non-zero |
| `Cancelled` | `AskUserQuestion` returned anything ≠ `Confirm` | `Cancelled: /cockpit:bug` (one line, no fence) | non-zero |
| `MissingBinary` | `command -v generacy >/dev/null 2>&1` returned non-zero | The `/cockpit:status`-aligned line about installing the CLI | non-zero |
| `AuthFailure` | engine exit ≠ 0 AND stderr matches `/auth\|unauthorized\|401\|gh auth/i` (case-insensitive) | The `/cockpit:status`-aligned line about `gh auth login` | non-zero |
| `Other` | engine exit ≠ 0, anything else | `Engine failed with exit code <N>.` (one line) + fenced stderr block | non-zero |

**Match order**: first match wins. `MissingBinary` is checked before any engine invocation; `AuthFailure` is checked against engine stderr before falling through to `Other`. No silent no-op on any path (SC-002 carry-over).

**Source**: research D8, D14.

---

### E10: `BugOutcome`

The disjoint set of terminal states one `/cockpit:bug` invocation can produce.

```ts
type BugOutcome =
  | { kind: "success-created"; ref: string; stdout: string; exitCode: 0 }
  | { kind: "success-reused";  ref: string; stdout: string; exitCode: 0 }
  | { kind: "usage";           exitCode: NonZero }
  | { kind: "cancelled";       exitCode: NonZero }
  | { kind: "missingBinary";   exitCode: NonZero }
  | { kind: "authFailure";     stderr: string; exitCode: NonZero }
  | { kind: "other";           engineExit: number; stderr: string; exitCode: NonZero };
```

**Invariants**:
- Exactly one `BugOutcome` is produced per invocation.
- `kind: "success-created"` and `kind: "success-reused"` are the only outcomes that exit zero. The slash command does NOT distinguish them in its output — both render under E8 with the same header — but the engine's stdout (inside the fenced block) makes the distinction visible to the operator.
- `kind: "missingBinary"` and `kind: "cancelled"` outcomes never invoke the engine.
- `kind: "usage"` never invokes the engine or the prompt.
- No `BugOutcome` mutates GitHub state directly (the engine is the actor; the slash command is the gate + renderer).

**Source**: spec.md § Acceptance ("Files+tracks a bugfix"); SC-002 carry-over.

---

## Part B — `/cockpit:watch` push amendment entities

### W1: `TransitionRecord`

The JSON record `generacy cockpit watch` emits to stdout (one per line). Existing entity owned by A5.1; reproduced here for the push payload mapping in W3.

```ts
interface TransitionRecord {
  repo: string;       // "generacy-ai/agency"
  kind: string;       // "issue" | "pr" | (future kinds)
  number: number;     // 360
  from: string | null; // null = baseline emission on (re)connect
  to: string;         // target state name
  // ... additional fields allowed (forward-compat)
}
```

**Source**: `specs/351-epic-generacy-ai-tetrad/contracts/transition.schema.md` (existing; A5.1 owns).

---

### W2: `PolicyEntry`

The autonomy policy lookup result. Existing entity owned by A5.1; reproduced here for the push class derivation in W3.

```ts
type PolicyEntry =
  | { mode: "auto"; command: string; args_template?: string }
  | { mode: "auto"; command: undefined }   // configuration error
  | { mode: "notify-only" }
  | { mode: string };                       // unknown future mode
  // undefined return = "no mapping" = unmapped
```

**Source**: `specs/351-epic-generacy-ai-tetrad/contracts/autonomy-policy.schema.md` (existing; A5.1 owns).

---

### W3: `PushPayload`

The exact payload the playbook passes to `PushNotification` when a transition is surfaced inline.

```ts
interface PushPayload {
  message: string;   // "<repo>#<number> <kind> <from>→<to> [<class>]" — single line, ≤200 chars
}

type PushClass =
  | "auto"                                   // reserved; not emitted in v1 (auto-dispatched never pushes)
  | "notify-only"
  | "unmapped"
  | `policy-error: ${string}`;               // e.g. "policy-error: missing command", "policy-error: unknown mode 'prompt-once'"
```

**Composition**:

```ts
function payloadFor(record: TransitionRecord, policy: PolicyEntry | undefined): PushPayload {
  const cls: PushClass =
    policy === undefined                                ? "unmapped" :
    policy.mode === "notify-only"                       ? "notify-only" :
    policy.mode === "auto" && policy.command === undefined
                                                         ? `policy-error: missing command` :
    policy.mode !== "auto" && policy.mode !== "notify-only"
                                                         ? `policy-error: unknown mode '${policy.mode}'` :
                                                           "auto";   // never reached in v1 — auto-dispatched do not push
  return {
    message: `${record.repo}#${record.number} ${record.kind} ${record.from}→${record.to} [${cls}]`,
  };
}
```

**Invariants**:
- Single line; no embedded newlines.
- Single Unicode right-arrow `→` (U+2192) between `<from>` and `<to>`, with no surrounding whitespace inside the arrow.
- Class enclosed in literal square brackets `[ ]`.
- ≤200 chars by construction. The playbook does NOT truncate; if the composed message exceeds 200 chars (e.g. extremely long state names), the host primitive's own truncation behaviour applies and that is acknowledged as an upstream contract violation, not a slash-command bug.
- Field order is fixed: `<repo>#<number>` first (most-actionable on lockscreen previews), `<kind>` second, `<from>→<to>` third, `[<class>]` last.

**Source**: clarification Q4=B; research D10.

---

### W4: `PushFireDecision`

The closed predicate that decides whether to call `PushNotification` for a given processed transition. MUST mirror the inline-emission predicate exactly (research D13).

```ts
function shouldPush(record: TransitionRecord, policy: PolicyEntry | undefined, dispatched: boolean): boolean {
  // Mirrors the inline-chat fire predicate. If the inline line is emitted,
  // the push fires. Otherwise, no push.
  if (record.from === null) return false;     // baseline (state-sync) line; dropped earlier
  if (record.from === record.to) return false; // echo line; dropped earlier
  if (dispatched) return false;                // successfully auto-dispatched; slash invocation is the signal
  // every remaining case → inline line emitted → push fires
  return true;
}
```

**Invariants**:
- The `dispatched` boolean is `true` iff the playbook actually invoked the mapped `/cockpit:*` command in step 3f for this transition. If the auto branch degrades to notify-only (config error or unknown mode), `dispatched` is `false` and the push fires under `policy-error:` (research D13).
- Already-`seen` transitions are dropped by step 3d BEFORE `shouldPush` is consulted; they produce neither inline chat nor push.
- The push fires AFTER the inline emission, in the same iteration of the loop, against the same `TransitionRecord`. Order matters because the push-primitive failure handler (W5) emits a follow-up inline line if the push fails.

**Source**: research D11, D13.

---

### W5: `PushFailureHandling`

The behaviour when `PushNotification` itself returns an error.

```ts
type PushResult = "ok" | { error: string };

function onPushResult(result: PushResult): void {
  if (result === "ok") return;
  // primitive returned an error: emit one inline line, continue the loop
  emitInline(`[cockpit:watch] push failed: ${result.error}`);
}
```

**Invariants**:
- Exactly one `[cockpit:watch] push failed: <reason>` line per failed push (no batching).
- Failure does NOT terminate the watch loop.
- Failure does NOT retry the push.
- Failure does NOT remove the transition from the `seen` set (the transition was already added to `seen` BEFORE dispatch, per step 3e of the existing playbook).
- The inline chat line for the same transition was already emitted before the push was attempted; the failure does not roll it back.

**Source**: research D12.

---

### W6: `WatchPushOutcome`

The disjoint set of per-transition outcomes the amended `/cockpit:watch` playbook produces. Extends the existing A5.1 outcome set with the push surface.

```ts
type WatchPushOutcome =
  | { surface: "auto-dispatched";    inline: false; push: false }
  | { surface: "notify-only";        inline: true;  push: true; pushClass: "notify-only" }
  | { surface: "unmapped";           inline: true;  push: true; pushClass: "unmapped" }
  | { surface: "policy-error";       inline: true;  push: true; pushClass: `policy-error: ${string}` }
  | { surface: "baseline";           inline: false; push: false }   // from === null
  | { surface: "echo";               inline: false; push: false }   // from === to
  | { surface: "seen";               inline: false; push: false }   // dedupe-dropped
  | { surface: "parse-error";        inline: true;  push: false }   // malformed record; A5.1 already logs inline; no push
  | { surface: "push-primitive-failure"; inline: true /* original */ + true /* failure line */; push: "attempted-failed" };
```

**Invariants**:
- Across the entire loop, `inline === true ⇒ push attempted` (research D13 parity), EXCEPT for the `parse-error` surface which is an A5.1 diagnostic line that does not correspond to a real transition. (A malformed record has no `repo` / `number` / `kind` / `from` / `to` fields to compose a `PushPayload`.)
- `surface: "auto-dispatched"` is the only success-path outcome that emits neither inline nor push — the slash-command invocation itself is the user-visible signal (A5.1 invariant carried forward).
- `surface: "push-primitive-failure"` is a degraded form of one of the three pushing surfaces (`notify-only`, `unmapped`, `policy-error`); it inherits the original inline chat line PLUS adds the failure line per W5.

**Source**: research D11, D12, D13.

---

## Relationships

```
                                       /cockpit:bug
$ARGUMENTS ── trim ──> BugTitle (E1) ──┬──> TitlePreview (E2) ──┐
                                       │                         │
                                       │                         ├──> ConfirmationPrompt (E4) ──> AskUserQuestion ──> ConfirmationOption (E3)
                                       │                         │                                                              │
                                       │                                                                          Confirm? ────┤
                                       │                                                                                        │
                                       │              "Cancel" / "Other" / null ──> BugErrorClassification (E9) "Cancelled" ──> BugOutcome (E10) "cancelled"
                                       │
                                       │              "Confirm" ──> Pre-flight ──> binary-missing ──> BugErrorClassification (E9) "MissingBinary" ──> BugOutcome (E10) "missingBinary"
                                       │                                       │
                                       │                                       └─ binary-present ──> EngineInvocation (E7) ──> { stdout, stderr, exitCode }
                                       │                                                                                              │
                                       │                                                                                              ├─ exit 0, engine reports created ──> BugSuccessOutput (E8) ──> BugOutcome (E10) "success-created"
                                       │                                                                                              │             (engine writes DedupMarker E5 + ProcessLabel E6)
                                       │                                                                                              ├─ exit 0, engine reports reused ──> BugSuccessOutput (E8) ──> BugOutcome (E10) "success-reused"
                                       │                                                                                              ├─ exit ≠ 0, stderr matches auth regex ──> BugErrorClassification (E9) "AuthFailure" ──> BugOutcome (E10) "authFailure"
                                       │                                                                                              └─ exit ≠ 0, anything else ──> BugErrorClassification (E9) "Other" ──> BugOutcome (E10) "other"
                                       │
empty / whitespace-only ──> BugErrorClassification (E9) "Usage" ──> BugOutcome (E10) "usage"


                                       /cockpit:watch (per stdout line received from Monitor)
TransitionRecord (W1) ──┬── parse / baseline / echo / dedupe (existing A5.1 steps 3a-3e) ──> filtered records
                        │
                        └── policy lookup ──> PolicyEntry (W2) ──┬── shouldPush? (W4)
                                                                  ├── true  ──> emit inline (A5.1) ──> PushPayload (W3) ──> PushNotification ──> PushFailureHandling (W5)
                                                                  └── false ──> emit nothing (auto-dispatched, or dropped earlier)

→ all paths terminate in one WatchPushOutcome (W6) per stdout line.
```

---

## Summary table — what writes what

| Artifact | Written by | Read by | Persistence |
|----------|------------|---------|-------------|
| `BugTitle` (E1) | operator typing `$ARGUMENTS` | slash command (trim only); engine (full) | none (in-memory) |
| `TitlePreview` (E2) | slash command | `AskUserQuestion` host primitive | none |
| `ConfirmationPrompt` (E4) | slash command | `AskUserQuestion` host primitive | none |
| `DedupMarker` (E5) | engine | engine (on subsequent invocations) | GitHub issue body |
| `ProcessLabel` (E6) | engine | autonomy policy / `/cockpit:watch` classifier | GitHub issue labels |
| `BugSuccessOutput` (E8) | slash command | operator (chat surface) | none |
| `PushPayload` (W3) | `/cockpit:watch` playbook | `PushNotification` host primitive | none (delivered to OS) |
| Inline chat line | `/cockpit:watch` playbook (A5.1; unchanged) | operator (chat surface) | none |
| `seen` set | `/cockpit:watch` playbook (A5.1; unchanged) | `/cockpit:watch` playbook (next iteration) | in-memory, per-invocation |

The slash commands never write to disk and never call the GitHub API directly. All GitHub state changes happen inside the bug-filing engine; all OS notification calls happen inside the `PushNotification` host primitive.
