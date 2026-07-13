# Data Model: `/cockpit:queue` command

**Feature**: `/cockpit:queue` confirm-gated wrapper over `generacy cockpit queue <phase>` (A4.4)
**Branch**: `359-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

`/cockpit:queue` produces no persistent state. The "data model" for this command is the set of typed values it accepts, computes, and emits during one invocation. Each entity below names its shape, validation rules, and source.

---

## E1: `Phase`

The single positional argument to the slash command, treated opaquely by the slash command and validated by the CLI.

```ts
type Phase = string;  // opaque to this command; validated by `generacy cockpit queue`
```

**Validation (slash-command side, structural only)**:
- Required positional. Captured by tokenizing `$ARGUMENTS` on whitespace.
- Zero tokens → `Usage: /cockpit:queue <phase>`, exit non-zero (FR-010).
- Two or more tokens → `Usage: /cockpit:queue <phase>`, exit non-zero (clarification Q3=A).
- Exactly one token → pass byte-for-byte to the CLI; no further validation (FR-002; research D3).

**Validation (CLI side, semantic)**:
- Owned by `generacy cockpit queue`. The slash command does not embed the CLI's phase enum.

**Source**: spec FR-002, FR-010; clarification Q3.

---

## E2: `ConfirmationOption`

The closed set of selections that `AskUserQuestion` is configured to present, and the closed rule for what counts as affirmative.

```ts
type ConfirmationOption = "Confirm" | "Cancel" | "Other" | null;
// "Other" is auto-added by the AskUserQuestion primitive; null represents
// any non-selection / aborted prompt the host may return.

const AFFIRMATIVE: ConfirmationOption = "Confirm";
```

**Semantics**:

| Selection | Treated as | CLI invoked? |
|-----------|------------|--------------|
| `Confirm` | affirmative | yes |
| `Cancel` | non-affirmative | no |
| `Other` (any free text) | non-affirmative | no |
| `null` / no selection / aborted prompt | non-affirmative | no |

**Affirmative test**: string equality against the literal `Confirm`. There is no permissive set, no case-folding, no trimming-and-comparing — the host primitive returns the option label verbatim.

**Source**: clarification Q1=A; research D2.

---

## E3: `ConfirmationPrompt`

The exact configuration passed to `AskUserQuestion`.

```ts
interface ConfirmationPrompt {
  question: string;        // literal: "Run `generacy cockpit queue <phase>`?"
  header: string;          // "Queue phase" — short label, ≤12 chars
  multiSelect: false;      // single selection only
  options: [
    { label: "Confirm"; description: "Run the CLI" },
    { label: "Cancel";  description: "Abort without queueing" },
  ];
}
```

**Invariants**:
- `question` MUST be the literal string ``Run `generacy cockpit queue <phase>`?`` with `<phase>` interpolated from E1. No extra surrounding whitespace, no trailing newline, no period.
- Exactly two options, in the order `Confirm` first, `Cancel` second.
- The host primitive auto-adds an "Other" option; that is expected and handled by E2.

**Source**: clarification Q1=A and Q4=A; research D2 and D4.

---

## E4: `CliInvocation`

The exact shape of the subprocess the slash command runs.

```ts
interface CliInvocation {
  cwd: "<repository-root>";
  command: "generacy";
  args: ["cockpit", "queue", phase];   // phase from E1, byte-for-byte
  env: "inherit";                       // no env overrides
  capture: { stdout: string; stderr: string; exitCode: number };
}
```

**Pre-flight**:

```ts
type PreflightResult = "binary-present" | "binary-missing";
// derived from: command -v generacy >/dev/null 2>&1 → exit 0 vs ≠ 0
```

**Invariants**:
- The CLI is invoked from the repository root (consistent with `/cockpit:status`).
- No flags are passed beyond the positional `<phase>`. In particular, no `--json`.
- Pre-flight failure short-circuits to `MISSING_BINARY` (E6) without invoking the CLI.

**Source**: spec FR-002 (opaque pass-through); research D7.

---

## E5: `SuccessOutput`

The shape of the success rendering (CLI exit code 0 after `Confirm`).

```ts
interface SuccessOutput {
  header: `**Queued:** ${string}`;     // literal "**Queued:** <phase>"
  blankLine: "";                       // exactly one blank line follows the header
  fencedBody: {
    fence: "```";
    body: string;                      // captured CLI stdout, verbatim
  };
}
```

**Rendered as**:

````markdown
**Queued:** <phase>

```
<verbatim CLI stdout>
```
````

**Invariants**:
- Header is the literal line `**Queued:** <phase>` (clarification Q2=A).
- Exactly one blank line separates header from fence.
- CLI stdout is rendered verbatim — no reflow, reformat, re-alignment, re-decoration, symbol substitution, or trailing-whitespace stripping.
- No additional summary, narration, or footer is emitted (SC-002 — exactly one fenced block).

**Source**: clarification Q2=A; SC-002.

---

## E6: `ErrorClassification`

The closed set of error classes the command emits, with their triggers and rendered output.

```ts
type ErrorClass =
  | "Usage"          // structural arg error (zero or multi token)
  | "Cancelled"      // non-affirmative AskUserQuestion outcome
  | "MissingBinary"  // pre-flight `command -v generacy` failed
  | "AuthFailure"    // CLI exit ≠ 0 AND stderr matches /auth|unauthorized|401|gh auth/i
  | "Other";         // CLI exit ≠ 0, anything else
```

| Class | Trigger | Rendered output | Exit code |
|-------|---------|-----------------|-----------|
| `Usage` | `$ARGUMENTS` has 0 or ≥2 whitespace-separated tokens | `Usage: /cockpit:queue <phase>` (one line, no fence) | non-zero |
| `Cancelled` | `AskUserQuestion` returned anything ≠ `Confirm` | `Cancelled: /cockpit:queue <phase>` (one line, no fence) | non-zero |
| `MissingBinary` | `command -v generacy >/dev/null 2>&1` returned non-zero | The `/cockpit:status`-aligned line: `The` ``generacy`` `CLI is required but is not on $PATH. Install it with` ``npm install -g @generacy-ai/cli`` `(or the prevailing install command) and retry.` | non-zero |
| `AuthFailure` | CLI exit ≠ 0 AND stderr matches `/auth\|unauthorized\|401\|gh auth/i` (case-insensitive) | The `/cockpit:status`-aligned line: `Authentication failed. The` ``generacy`` `CLI uses` ``gh`` `for GitHub access — run` ``gh auth login`` `and retry.` | non-zero |
| `Other` | CLI exit ≠ 0, anything else (including unknown-phase rejections from the CLI) | `CLI failed with exit code <N>.` (one line) + fenced stderr block | non-zero |

**Match order**: first match wins. `MissingBinary` is checked before any CLI invocation; `AuthFailure` is checked against CLI stderr before falling through to `Other`. No silent no-op on any path (SC-002).

**Source**: research D6, D8, D9.

---

## E7: `Outcome`

The disjoint set of terminal states one invocation can produce.

```ts
type Outcome =
  | { kind: "success"; phase: Phase; stdout: string; exitCode: 0 }
  | { kind: "usage";       exitCode: NonZero }
  | { kind: "cancelled";   phase: Phase; exitCode: NonZero }
  | { kind: "missingBinary"; exitCode: NonZero }
  | { kind: "authFailure";   stderr: string; exitCode: NonZero }
  | { kind: "other";         cliExit: number; stderr: string; exitCode: NonZero };
```

**Invariants**:
- Exactly one `Outcome` is produced per invocation.
- `kind: "success"` is the only outcome that exits zero.
- `kind: "success"` is the only outcome that runs the CLI to completion.
- `kind: "missingBinary"` and `kind: "cancelled"` outcomes never invoke the CLI.
- No `Outcome` mutates GitHub state (the CLI is the actor; the slash command is the renderer).

**Source**: spec § Acceptance ("Queues a phase after confirmation"); SC-001 / SC-002.

---

## Relationships

```
$ARGUMENTS ── tokenize ──> Phase (E1) ──┐
                                        ├──> ConfirmationPrompt (E3) ──> AskUserQuestion ──> ConfirmationOption (E2)
                                        │                                                              │
                                        │                                                  Confirm? ──┤
                                        │                                                              │
                                        │              "Cancel" / "Other" / null ──> ErrorClassification (E6) "Cancelled" ──> Outcome (E7) "cancelled"
                                        │
                                        │              "Confirm" ──> Pre-flight ──> binary-missing ──> ErrorClassification (E6) "MissingBinary" ──> Outcome (E7) "missingBinary"
                                        │                                       │
                                        │                                       └─ binary-present ──> CliInvocation (E4) ──> { stdout, stderr, exitCode }
                                        │                                                                                            │
                                        │                                                                                            ├─ exit 0 ──> SuccessOutput (E5) ──> Outcome (E7) "success"
                                        │                                                                                            ├─ exit ≠ 0, stderr matches auth regex ──> ErrorClassification (E6) "AuthFailure" ──> Outcome (E7) "authFailure"
                                        │                                                                                            └─ exit ≠ 0, anything else ──> ErrorClassification (E6) "Other" ──> Outcome (E7) "other"
                                        │
zero tokens OR ≥2 tokens ──> ErrorClassification (E6) "Usage" ──> Outcome (E7) "usage"
```
