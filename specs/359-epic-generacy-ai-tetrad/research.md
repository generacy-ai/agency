# Research: `/cockpit:queue` command

**Feature**: `/cockpit:queue` confirm-gated wrapper over `generacy cockpit queue <phase>` (A4.4)
**Branch**: `359-epic-generacy-ai-tetrad`
**Date**: 2026-06-29

This document records the technology and pattern decisions behind the `/cockpit:queue` implementation. Each section names the chosen approach, the alternatives considered, and the rationale. Decisions traceable to a clarification answer cite the Q-number.

---

## D1: Verb-file format and packaging

**Decision**: Ship as a single markdown file with YAML frontmatter at `packages/claude-plugin-cockpit/commands/queue.md`. Use the same shape as the sibling cockpit verbs that already exist (`status.md`, `merge.md`, `review.md`, `clarify.md`, `watch.md`).

**Alternatives considered**:
- *Embed the queue gate in a TypeScript MCP tool* with a thin markdown shim that shells out: rejected — outside the per-verb isolation declared in spec.md § Summary (`Owns: packages/claude-plugin-cockpit/commands/queue.md`); adds a build step the cockpit plugin has so far avoided; and the verb has no state to carry between calls.
- *Pair this verb with a partner read-only `/cockpit:queue-status` verb*: rejected — `/cockpit:status` already reports queue state via its CLI dashboard; a partner verb would duplicate it.

**Reference**: `packages/claude-plugin-cockpit/commands/status.md` (style template; nearest pattern in argument handling, pre-flight, and `MISSING_BINARY` text).

---

## D2: Confirmation primitive

**Decision**: Use `AskUserQuestion` with exactly two options — `Confirm` and `Cancel`. The affirmative outcome is "the user selected the `Confirm` option"; everything else — `Cancel`, the platform's auto-added "Other", a no-op return, or anything else the host primitive yields — is treated as non-affirmative and aborts without invoking the CLI.

**Alternatives considered**:
- *Free-text prompt with strict yes/no parsing* (Q1 option B): rejected — adds a second source of truth for "what counts as yes" and is inconsistent with the cockpit plugin's other gated commands.
- *Free-text prompt with a permissive affirmative set* (`yes`, `y`, `confirm`, case-insensitive; Q1 option C): rejected — same reasons as above, plus the permissive set creates ambiguity (does `y` from a typo count?).
- *Skip confirmation when the user passes a `--yes` / `-y` flag*: rejected — out of scope for v1; the spec mandates a confirmation step (FR-003 / FR-004) and clarification Q1 did not introduce a bypass. Adding a flag later is a backward-compatible change.

**Rationale**: Locked by **Q1 → A**. Consistent with the cockpit's other gated commands; collapses the "affirmative test" to a single equality check against the string `Confirm`; works uniformly in interactive Claude Code environments without depending on free-text shell parsing.

---

## D3: Argument handling — opaque pass-through, fail-fast on shape

**Decision**: Treat `$ARGUMENTS` as opaque, with two structural rejections handled by the slash command itself and everything else delegated to the CLI:

- **Zero tokens** (empty / whitespace-only) → reject with literal `Usage: /cockpit:queue <phase>` and exit non-zero, no prompt (FR-010).
- **Two or more tokens** (after splitting on whitespace) → reject with the same literal `Usage: /cockpit:queue <phase>` and exit non-zero, no prompt (clarification Q3=A).
- **Exactly one token** → captured as `<phase>` and passed byte-for-byte to the CLI. No validation, no parsing, no normalization, no lowercase, no `#` stripping.

**Alternatives considered**:
- *Pass `$ARGUMENTS` through verbatim* — even multi-token, even empty — and let the CLI validate everything (Q3 option B): rejected — symmetry with FR-010's zero-arg behaviour matters more than maximum pass-through fidelity; a phase is a single token and the multi-arg case is almost certainly a user typo, not a deliberate test of the CLI.
- *Lenient: take the first token, silently discard the rest* (Q3 option C): rejected — silently dropping arguments is the canonical "user thought they did X but actually did Y" footgun; the strict rejection makes the mistake visible.
- *Validate `<phase>` against a known set* (e.g., `specify`, `clarify`, `plan`, `tasks`, `impl`): rejected — the slash command does not know the CLI's authoritative phase enum; embedding it would create a second source of truth that drifts. The CLI is sole validator (consistent with `/cockpit:status`'s opaque-arg handling).

**Rationale**: Locked by **Q3 → A** (multi-arg) and **FR-010** (zero-arg). The two structural cases are symmetric; both produce the same `Usage:` line and the same non-zero exit. Phase semantics belong to the CLI.

---

## D4: Confirmation prompt copy

**Decision**: Pass the literal string ``Run `generacy cockpit queue <phase>`?`` as the `question` field of `AskUserQuestion`. `<phase>` is interpolated as the resolved token from D3. Single-line.

**Alternatives considered**:
- *Two-line prompt* with `About to run: ` `` `generacy cockpit queue <phase>` `` on line 1 and `Confirm?` on line 2 (Q4 option B): rejected — `AskUserQuestion`'s `question` field is a single rendered string; two lines split the user's attention between the command echo and the question without adding information.
- *Author's-discretion wording* satisfying only the FR-003 echo requirement (Q4 option C): rejected — clarification deliberately pins the wording to make the user-visible string greppable across cockpit verbs and to give code review a single string to enforce.

**Rationale**: Locked by **Q4 → A**. The prompt is the single most user-visible string in the command; pinning it satisfies SC-001 ("confirmation is mandatory and unambiguous"). The `?` makes the binary nature of the choice obvious. The backticks render the command literally in the host UI.

---

## D5: Success-output header format

**Decision**: On CLI exit 0, emit the literal header line `**Queued:** <phase>`, then one blank line, then captured stdout inside a triple-backtick fenced code block. Render stdout verbatim — no reflow, no reformat, no re-decoration.

**Alternatives considered**:
- *`**Queue:** <phase>`* (noun parallel to `**Status:**`; Q2 option B): rejected — `Queue` reads as the *thing being shown*, not as the *action that completed*. The success header is reporting a completed action, so the past-tense verb is clearer.
- *`**Queued phase:** <phase>`* (more explicit; Q2 option C): rejected — the additional word adds no information; `<phase>` already names the phase.
- *Inline the CLI's stdout without a fenced block*: rejected — `/cockpit:status` uses the fenced-block convention to preserve verbatim CLI output and to satisfy SC-002 ("exactly one fenced output block or one terse line"); the same convention applies here.

**Rationale**: Locked by **Q2 → A**. Mirrors `/cockpit:status`'s `**Status:** <epic-ref>` convention. The `**<Verb-past-tense>:** <subject>` pattern is the recommended template for any future cockpit verb that emits a one-line header before a CLI output block.

---

## D6: Error classification — three classes, not four

**Decision**: Classify CLI failures into three classes (case-insensitive stderr match, first-match-wins):

- `MISSING_BINARY` — pre-flight `command -v generacy` returned non-zero.
- `AUTH_FAILURE` — exit ≠ 0 AND stderr matches `/auth|unauthorized|401|gh auth/i`.
- `OTHER` — anything else.

Each class emits exactly one response; every class MUST print something — never silently no-op.

**Alternatives considered**:
- *Carry over `/cockpit:status`'s `UNKNOWN_EPIC` class*: rejected — `queue` takes a phase, not an epic ref. An unknown-phase rejection from the CLI surfaces under `OTHER` with the CLI's native error message intact, which is the right behaviour: the CLI is the authoritative source of "what's a valid phase".
- *Add an `UNKNOWN_PHASE` class with a custom hint*: rejected — would require the slash command to know which CLI error strings indicate an unknown phase. That coupling is exactly what D3 rejects: the CLI is sole validator. The `OTHER` fenced block surfaces the CLI's own actionable error verbatim.

**Rationale**: First-class errors are reserved for cases where the slash command can offer help the CLI cannot (binary missing → install command; auth failure → `gh auth login`). Everything else gets the CLI's stderr verbatim so the user reads the CLI's own actionable text, not a paraphrase.

---

## D7: Pre-flight + invocation pattern

**Decision**: Mirror `/cockpit:status`'s pre-flight: run `command -v generacy >/dev/null 2>&1` before invoking the CLI. On non-zero, branch directly to `MISSING_BINARY` without attempting the CLI call. On zero, invoke `generacy cockpit queue <phase>` from the repository root via the Bash tool, capturing stdout, stderr, and the exit code in separate variables. Pass no flags.

**Alternatives considered**:
- *Skip the pre-flight; let the shell return `127` when `generacy` is missing*: rejected — `127`'s stderr (typically `command not found`) provides less actionable guidance than the curated `MISSING_BINARY` line.
- *Pass `--json` to the CLI and render structured output*: rejected — the spec does not require structured output; the CLI's default text output (whatever it is) is rendered inside a fenced block, identically to `/cockpit:status`.

**Rationale**: Copying `/cockpit:status`'s pre-flight pattern keeps the two verbs visually consistent (helpful for the user) and reuses the already-curated `MISSING_BINARY` text. The pre-flight is cheap (one `command -v` call) and removes one ambiguous failure mode.

---

## D8: Failure-mode policy

**Decision**: All structural rejections (zero args, multi-arg, missing binary, cancelled prompt) exit non-zero with a single terse line and no fenced block. All CLI failures emit a single classification line followed by stderr in a fenced block. There is no silent no-op on any code path (SC-002).

**Specific failure responses**:

| Class | Trigger | Output | Exit |
|-------|---------|--------|------|
| `Usage` (zero args) | `$ARGUMENTS` empty / whitespace-only | `Usage: /cockpit:queue <phase>` | non-zero |
| `Usage` (multi-arg) | tokenized `$ARGUMENTS` has ≥2 tokens | `Usage: /cockpit:queue <phase>` | non-zero |
| `Cancelled` | `AskUserQuestion` returned anything ≠ `Confirm` | `Cancelled: /cockpit:queue <phase>` | non-zero |
| `MISSING_BINARY` | pre-flight `command -v generacy` returned non-zero | (the `/cockpit:status` line about installing the CLI) | non-zero |
| `AUTH_FAILURE` | CLI exit ≠ 0 AND stderr matches the auth regex | (the `/cockpit:status` line about `gh auth login`) | non-zero |
| `OTHER` | CLI exit ≠ 0, anything else | `CLI failed with exit code <N>.` + fenced stderr | non-zero |
| (success) | CLI exit 0 after `Confirm` | `**Queued:** <phase>` + fenced stdout | zero |

**Rationale**: FR-003/FR-004 require an explicit confirmation step; the cancel path's non-zero exit lets scripted callers distinguish "user said no" from "CLI succeeded". SC-002 requires exactly one terse line or one fenced block on every path. The slash command never mutates state on a non-success path.

---

## D9: Cancel-path exit code (non-zero, not zero)

**Decision**: When the user does not select `Confirm`, the command prints `Cancelled: /cockpit:queue <phase>` and exits **non-zero**.

**Alternatives considered**:
- *Exit zero on cancel* (the cancel is a "successful" no-op): rejected — scripted callers should be able to distinguish `Confirm`+success from `Cancel` with a single exit-code check. The CLI itself wasn't called, so reporting success is misleading.

**Rationale**: Mirrors the cancel semantics of other gated tools in the cockpit. The terse `Cancelled:` line tells the human what happened; the non-zero exit tells the script.

---

## D10: Out-of-scope guards

**Decision**: The command MUST NOT:

- Mutate any GitHub label, post any PR comment, or run any `gh` subcommand other than what `generacy` itself invokes.
- Run any CLI other than `generacy cockpit queue` (in particular, no `generacy cockpit advance`, no `gh pr ...`, no shell side-effects between the pre-flight and the CLI call).
- Validate `<phase>` against a hard-coded enum (the CLI owns the enum).
- Persist any state on disk (the command itself reads/writes nothing).
- Auto-retry the CLI on transient failure (any non-zero CLI exit is surfaced to the user via the `OTHER` branch and the user re-runs).

**Rationale**: The Epic Cockpit pattern is "one verb, one responsibility". `/cockpit:queue`'s responsibility is exactly the confirmation gate + the CLI shell-out + the terse output discipline. Anything else belongs to a sibling verb (`/cockpit:advance`, `/cockpit:status`, `/cockpit:merge`, etc.).

---

## Key sources

- **Spec**: `specs/359-epic-generacy-ai-tetrad/spec.md`
- **Clarifications**: `specs/359-epic-generacy-ai-tetrad/clarifications.md` (Q1–Q4)
- **Sibling cockpit verb (style + pre-flight pattern)**: `packages/claude-plugin-cockpit/commands/status.md`
- **Sibling cockpit verb (confirmation-gate precedent)**: `packages/claude-plugin-cockpit/commands/merge.md`, `packages/claude-plugin-cockpit/commands/review.md`
- **Plugin scaffold (A1.4)**: `specs/350-epic-generacy-ai-tetrad/` and `packages/claude-plugin-cockpit/`
- **Epic plan**: `docs/epic-cockpit-plan.md` in the `tetrad-development` repo (P4 / A4.4)
- **Upstream issues**: `generacy-ai/tetrad-development#85` (epic); `generacy-ai/agency#359` (this issue); sibling cockpit issues G3.2 and A1.4 (CLI sub-verb and plugin scaffold respectively)
