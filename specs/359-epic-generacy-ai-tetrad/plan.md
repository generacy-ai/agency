# Implementation Plan: `/cockpit:queue` command (Epic Cockpit A4.4)

**Feature**: `/cockpit:queue` slash command — confirm-gated wrapper over `generacy cockpit queue <phase>`, shipped as `packages/claude-plugin-cockpit/commands/queue.md`
**Branch**: `359-epic-generacy-ai-tetrad`
**Date**: 2026-06-29
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Ship one new markdown verb file — `packages/claude-plugin-cockpit/commands/queue.md` — that defines `/cockpit:queue <phase>`. The command is a thin, confirm-gated wrapper around the existing `generacy cockpit queue <phase>` CLI verb (G3.2 / sibling issue). It validates that exactly one positional token is present, echoes the resolved command in an `AskUserQuestion` prompt with `Confirm` / `Cancel` options, and — only when the user explicitly selects `Confirm` — invokes the CLI from the repository root and renders its output under a single `**Queued:** <phase>` header line followed by a fenced code block. Any non-`Confirm` selection (`Cancel`, "Other", or the AskUserQuestion primitive returning anything else) aborts without invoking the CLI and without mutating state.

The command performs no `<phase>` validation, no normalization, and no pass-through of additional tokens. Phase semantics, queue ordering, and idempotency are owned by the CLI (G3.2); this verb's responsibility is the confirmation gate and the terse output discipline shared with `/cockpit:status` (already shipped) and `/cockpit:merge` (#355).

No new TypeScript, no MCP coupling, no edits to `plugin.json` / `marketplace.json` / `README.md` (optional one-line README touch-up may ride along but is not required for acceptance). The plugin scaffold from A1.4 (#350) already supplies the manifest and marketplace entry; the loader auto-discovers `commands/*.md`.

## Technical Context

**Language/Version**: Markdown (YAML frontmatter + prompt body); the runtime is Claude Code itself
**Primary Dependencies**:
- `generacy cockpit queue <phase>` CLI verb (G3.2, sibling cockpit issue) — sole executor of the queue operation; this command does not reimplement queue logic
- `AskUserQuestion` — host primitive used to capture the confirmation signal (locked by clarification Q1=A)
- `claude-plugin-cockpit` scaffold (#350 / A1.4, already landed) — provides the namespace and `commands/` directory
- `command -v generacy` pre-flight (Bash) — borrowed from `/cockpit:status`'s `MISSING_BINARY` branch
**Storage**: Repository files only (one new markdown file). The command itself reads/writes nothing on disk.
**Testing**: Manual end-to-end after plugin install — run `/cockpit:queue <phase>`, `Confirm` and `Cancel` each path; run with zero args, two args, and missing CLI binary to exercise every error class.
**Target Platform**: Claude Code (any OS) with the `cockpit` plugin installed
**Project Type**: Monorepo package (Claude Code static-asset plugin; no build step)
**Performance Goals**: N/A (interactive command; latency bounded by the CLI call)
**Constraints**:
- One file owned: `packages/claude-plugin-cockpit/commands/queue.md` (isolation, declared in spec.md § Summary).
- MUST gate every CLI invocation behind an explicit `Confirm` selection from `AskUserQuestion` (FR-003 / FR-004; clarification Q1=A).
- MUST treat `$ARGUMENTS` opaquely and pass `<phase>` byte-for-byte to the CLI; no validation, parsing, or normalization (FR-002; symmetric with `/cockpit:status`).
- MUST reject `$ARGUMENTS` containing more than one whitespace-separated token with literal text `Usage: /cockpit:queue <phase>` and non-zero exit, without prompting (clarification Q3=A; symmetric with FR-010's zero-arg behaviour).
- MUST reject empty/whitespace-only `$ARGUMENTS` with the same `Usage:` line and non-zero exit (FR-010).
- The success header MUST be the literal line `**Queued:** <phase>`, followed by a blank line and then the CLI's stdout inside a triple-backtick fenced code block (clarification Q2=A; mirrors `/cockpit:status`'s `**Status:** <epic-ref>`).
- The confirmation prompt's `question` field MUST be the single-line string ``Run `generacy cockpit queue <phase>`?`` (clarification Q4=A; satisfies FR-003's "echo the resolved command" requirement).
- MUST NOT silently no-op on any code path — every branch (usage error, missing binary, cancel, CLI failure, success) emits one terse line OR one fenced block (SC-002).
- MUST NOT mutate any GitHub label, post any PR comment, or run any CLI other than `generacy cockpit queue` — out-of-scope side effects are owned elsewhere in the cockpit plugin.
**Scale/Scope**: 1 new file (~120–180 lines of markdown), 0 source-code edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` is present in the repo — no gates apply. The Epic Cockpit per-verb isolation convention (one file owned per issue) is honoured by the project structure below.

## Project Structure

### Documentation (this feature)

```text
specs/359-epic-generacy-ai-tetrad/
├── spec.md                    # Feature specification (existing, read-only)
├── clarifications.md          # Q1–Q4 answers (existing, read-only)
├── plan.md                    # This file
├── research.md                # Pattern + dependency decisions
├── data-model.md              # Input/output schema for the command
├── quickstart.md              # Install + usage walkthrough
├── contracts/
│   └── command.md             # The /cockpit:queue contract: args, prompt, output, exit conditions
└── checklists/                # (empty — generated by /speckit:checklist if needed)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── .claude-plugin/
│   └── plugin.json            # EXISTING (#350) — no changes
├── commands/
│   ├── clarify.md             # EXISTING — sibling verb
│   ├── merge.md               # EXISTING — sibling verb (#355)
│   ├── review.md              # EXISTING — sibling verb (#354)
│   ├── status.md              # EXISTING — pattern source for argument handling + output shape
│   ├── watch.md               # EXISTING — sibling verb
│   └── queue.md               # NEW — the entire deliverable for #359
└── README.md                  # MODIFIED (optional) — flip the
                               # `/cockpit:queue` row from a placeholder
                               # to a live one-line description
```

**Structure Decision**: Single-file addition under the existing `claude-plugin-cockpit/commands/` directory. The plugin manifest, marketplace entry, and namespace registration were all delivered by #350 (A1.4) and require no changes. Owns (isolation): `packages/claude-plugin-cockpit/commands/queue.md` — exactly the scope declared in the spec.

## Implementation Phases

### Phase 0: Verify the host primitives exist

Before writing `queue.md`, confirm the three primitives it depends on are actually callable in the target Claude Code environment:

1. **`AskUserQuestion`** — confirmed present in the deferred-tools list (used by sibling `/cockpit:review`). No alternative is acceptable: clarification Q1=A explicitly chose `AskUserQuestion` over the free-text variants in Q1's options B and C.
2. **`generacy` CLI on `$PATH`** — pre-flight with `command -v generacy >/dev/null 2>&1`; if it returns non-zero, branch to `MISSING_BINARY` (text borrowed verbatim from `/cockpit:status`).
3. **`generacy cockpit queue` sub-verb** — owned by sibling cockpit issue G3.2. The slash command does not bundle a fallback; if the sub-verb is missing at runtime the CLI emits its own error and exit code, which this command surfaces inside the `OTHER` error fenced block.

These are runtime dependencies, not build-time ones: the markdown file can land independently and fail-fast at first call if any dependency is missing.

### Phase 1: Author `commands/queue.md`

Write the verb file with this structure (mirroring `/cockpit:status`'s overall shape; adding the confirm gate that `/cockpit:status` does not have):

1. **YAML frontmatter**
   - `description:` — one-line summary suitable for the slash-command palette.
   - `arguments:` — single required positional `phase`, `string`, with a one-line description that points the user at `generacy cockpit queue --help` for the authoritative phase enum.
2. **Argument handling** (mirrors `/cockpit:status` step 1, with the multi-token rejection added):
   - Read `$ARGUMENTS`. Trim only outer whitespace.
   - If empty/whitespace-only → emit `Usage: /cockpit:queue <phase>` and exit non-zero (FR-010).
   - Tokenize on whitespace. If more than one token → emit the same `Usage: /cockpit:queue <phase>` and exit non-zero (clarification Q3=A; symmetric with FR-010).
   - Otherwise capture the single token as `<phase>`. Do NOT validate, parse, normalize, lowercase, or expand it (FR-002).
3. **Confirmation gate**:
   - Invoke `AskUserQuestion` with one question:
     - `question`: the literal string ``Run `generacy cockpit queue <phase>`?`` (clarification Q4=A; `<phase>` is interpolated as the resolved token).
     - `header`: short label, e.g. `Queue phase` (≤12 chars constraint of `AskUserQuestion`).
     - `multiSelect`: `false`.
     - `options`: exactly two — `{ label: "Confirm", description: "Run the CLI" }` and `{ label: "Cancel", description: "Abort without queueing" }`.
   - **Affirmative test**: the user's selection MUST be exactly `Confirm`. Any other selection — including `Cancel`, the platform's auto-added "Other" option, an empty/aborted prompt, or anything else the host returns — is a non-affirmative outcome and skips to step 6 (cancel).
4. **CLI pre-flight + invocation** (only reached when step 3 returned `Confirm`):
   - Pre-flight `command -v generacy >/dev/null 2>&1`. If non-zero, branch to the `MISSING_BINARY` text in step 7.
   - From the repository root, run `generacy cockpit queue <phase>` via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. Pass no flags.
5. **Success rendering** (CLI exit code `0`):
   - Print the single header line `**Queued:** <phase>` (clarification Q2=A).
   - Print one blank line.
   - Print captured stdout inside a triple-backtick fenced code block, verbatim. Do NOT reflow, reformat, re-align, re-decorate, or otherwise transform the CLI's output.
6. **Cancel rendering** (non-affirmative selection in step 3):
   - Print exactly one terse line: `Cancelled: /cockpit:queue <phase>` (no fenced block).
   - Exit non-zero so scripted callers can distinguish from `Confirm` + success.
   - **Do not invoke the CLI.** (FR-004; SC-001.)
7. **Error rendering** (CLI exit code non-zero, or pre-flight in step 4 failed):
   - Classify into exactly one of three classes (first match wins, case-insensitive); every class MUST print something — never silently no-op:
     - **MISSING_BINARY** — pre-flight in step 4 returned non-zero. Print the same line `/cockpit:status` uses: `The` ``generacy`` `CLI is required but is not on $PATH. Install it with` ``npm install -g @generacy-ai/cli`` `(or the prevailing install command) and retry.`
     - **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The` ``generacy`` `CLI uses` ``gh`` `for GitHub access — run` ``gh auth login`` `and retry.`
     - **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block. (No `UNKNOWN_EPIC` class — `queue` takes a phase, not an epic ref; an unknown-phase rejection from the CLI surfaces under `OTHER`.)

### Phase 2: README touch-up (optional in this issue)

Optionally flip the `/cockpit:queue` row in `packages/claude-plugin-cockpit/README.md` from any placeholder/"coming soon" state to a one-line live description. This is cosmetic; if deferred, it can ship in a follow-up.

### Phase 3: Manual validation (per spec acceptance + clarifications)

1. **Acceptance — "Queues a phase after confirmation"**: install the plugin, run `/cockpit:queue plan` against a repo where `generacy cockpit queue plan` would succeed, select `Confirm`, verify the CLI runs and that the output is rendered under `**Queued:** plan` with a fenced block.
2. **FR-003 / Q4=A — prompt copy**: verify the `AskUserQuestion` prompt's `question` field reads exactly ``Run `generacy cockpit queue plan`?``.
3. **FR-004 / Q1=A — cancel path**: re-run, select `Cancel`. Verify (a) the CLI never ran (`echo $?` from the CLI cannot have happened) and (b) the only output is the one-line `Cancelled: /cockpit:queue plan`.
4. **Q3=A — extra-arg rejection**: run `/cockpit:queue plan tasks`. Verify the literal `Usage: /cockpit:queue <phase>` is printed, exit is non-zero, no prompt was shown.
5. **FR-010 — missing-arg rejection**: run `/cockpit:queue`. Same `Usage:` line, same non-zero exit, no prompt.
6. **MISSING_BINARY**: temporarily unset `PATH` for `generacy`, run `/cockpit:queue plan`, select `Confirm`. Verify the `MISSING_BINARY` text appears (matches `/cockpit:status`'s line byte-for-byte).
7. **OTHER**: run with a phase the CLI rejects (e.g., `/cockpit:queue not-a-phase`), `Confirm`. Verify a single `CLI failed with exit code <N>.` line followed by a fenced stderr block.
8. **SC-002 — output discipline**: across every path above, verify exactly one terse line OR one fenced block (plus the one-line `**Queued:** <phase>` header for the success path) — no chatty narration, no double summaries.
9. **Isolation check**: confirm the diff for this issue touches only `packages/claude-plugin-cockpit/commands/queue.md` (and, optionally, the README row).

## Open Risks

| Risk | Mitigation |
|------|------------|
| The `generacy cockpit queue` sub-verb (G3.2) has not landed when `queue.md` ships | The slash command does not couple to its internals — it shells out by name and surfaces stdout / stderr / exit code verbatim. If G3.2 is missing at runtime the CLI emits `Unknown subcommand: queue` (or similar) and a non-zero exit, which the `OTHER` branch in step 7 renders inside a fenced block. No silent failure. |
| `AskUserQuestion` is not available in some non-interactive Claude Code environments | The command does not ship a free-text fallback (clarification Q1 explicitly rejected options B and C). In non-interactive environments the command stops at step 3 with `Cancelled: /cockpit:queue <phase>` (because no selection equals `Confirm`). This is the safer default for a state-mutating wrapper. |
| `AskUserQuestion` returns the platform's auto-added "Other" option with custom text | Treated as non-affirmative. Clarification Q1=A is explicit: "any other selection (including `Cancel` or 'Other') aborts." |
| User passes `<phase>` with leading `#` or quotes (e.g., `'plan'`) | FR-002 / Q3=A: `$ARGUMENTS` is opaque; the token is passed byte-for-byte. The CLI is sole validator. If this surfaces real user pain we add an *outer*-whitespace-only trim later (already in place per step 2); inner punctuation stays. |
| Header line drift across cockpit verbs | Clarification Q2=A pins `**Queued:** <phase>` to mirror `/cockpit:status`'s `**Status:** <epic-ref>`. Future cockpit verbs that emit a header should follow the same `**<Verb-past-tense>:** <subject>` convention; flag drift in code review. |
| The CLI emits a multi-line `Unknown phase` error and the user expects the slash command to gate phases | Out of scope — FR-002 / Q3 / D8 below: phase validation is owned by the CLI. The `OTHER` fenced block surfaces that error verbatim. |

## Complexity Tracking

> *Fill ONLY if Constitution Check has violations that must be justified*

No constitution violations; no complexity entries.
