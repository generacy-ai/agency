---
description: Coordinate review of a speckit gate — artifact (spec/clarifications/plan/tasks) or impl PR diff — and optionally advance the gate label.
---

# Review Command

Review the current child issue's progress at a specific gate, surface a summary with a suggested decision, and (in `assist` / `auto` mode) drive `/cockpit:advance` to flip `waiting-for:<gate>` → `completed:<gate>`.

This command is a thin orchestrator. It never resolves PRs itself, never runs `/code-review`'s logic itself, and never mutates labels itself. Every responsibility is delegated to an existing primitive:

- `/cockpit:review-context` (G1.3) — PR resolution for `--gate impl`.
- `/code-review` — host skill that produces the diff summary for `--gate impl`.
- `/cockpit:advance` (G1.2) — sole owner of the `waiting-for:<name>` → `completed:<name>` label transition.
- `AskUserQuestion` — host primitive for the `assist`-mode approval prompt.

## Arguments

```
/cockpit:review --gate <name> [--mode <assist|auto|manual>]
/cockpit:review                         # bare → help
/cockpit:review --help                  # explicit help
```

| Arg | Type | Required | Default | Valid values |
|-----|------|----------|---------|--------------|
| `--gate` | string | yes (except for help) | — | `specify`, `clarify`, `plan`, `tasks`, `impl` |
| `--mode` | string | no | `assist` | `assist`, `auto`, `manual` |

### Parsing rules

1. Parse the argument string. Recognise `--gate <name>` and `--mode <value>`.
2. If the invocation is bare (no arguments) or contains `--help`, branch to **Help / discovery** below.
3. If `--gate` is missing (and `--help` is not set), emit a `ReviewError` of kind `unknown-gate` with the message `Error: missing required argument '--gate'. Valid: specify, clarify, plan, tasks, impl.` and stop.
4. If `--gate <name>` is not in the valid set, emit a `ReviewError` of kind `unknown-gate` with the message `Error: unknown gate '<value>'. Valid: specify, clarify, plan, tasks, impl.` and stop.
5. If `--mode <value>` is provided but not in `{assist, auto, manual}`, emit a `ReviewError` of kind `unknown-mode` with the message `Error: unknown mode '<value>'. Valid: assist, auto, manual.` and stop.
6. If `--mode` is omitted, default to `assist`.

## Help / discovery

When the command is invoked bare or with `--help`, emit a short overview, the gate table, and the mode table. No file reads, no slash invocations, no label mutations.

Output (verbatim shape — fill in current gate/mode tables):

```
/cockpit:review — review a speckit gate and optionally advance its label.

Usage:
  /cockpit:review --gate <name> [--mode <assist|auto|manual>]

Gates:
  specify   reads specs/<feature>/spec.md
  clarify   reads specs/<feature>/clarifications.md
  plan      reads specs/<feature>/plan.md
  tasks     reads specs/<feature>/tasks.md
  impl      reviews the open PR via /cockpit:review-context + /code-review

Modes:
  assist    (default) emit summary, prompt via AskUserQuestion, advance on approve
  auto      emit summary; if "Suggested decision: approve", advance without prompting
  manual    emit summary only; never prompt and never advance
```

Then stop.

## Feature-context resolution

Required for every non-help invocation. Compute the `FeatureContext` (data-model E4):

1. Read the current git branch: `git rev-parse --abbrev-ref HEAD`.
2. Parse the leading `<digits>-` prefix as `issueNumber`. If the branch does not start with `<digits>-`, emit a `ReviewError` of kind `feature-resolution-failed` with `Error: cannot resolve specs/ directory for branch '<branch>'. Branch must start with '<issue#>-'.` and stop.
3. List `specs/` directories whose name starts with `<issueNumber>-`.
4. If exactly one directory matches, that is `specsDir`.
5. If zero or multiple directories match, emit a `ReviewError` of kind `feature-resolution-failed` with `Error: cannot resolve specs/ directory for branch '<branch>'. Candidates: <list or "none">.` and stop.

The resolved `FeatureContext` is `{ branch, issueNumber, specsDir }`. Use `specsDir` for all subsequent file reads.

## Behaviour — `impl` gate

Run when `--gate impl`.

1. **Call `/cockpit:review-context`** to resolve the open PR for the active child issue.
   - On failure (no PR, multiple PRs, draft PR, dependency missing), surface its message **verbatim** as `Error: <verbatim message>` and stop. No labels touched. This is a `ReviewError` of kind `review-context-failed`.
   - On success, capture the returned PR ref and diff payload.
2. **Call `/code-review`** on the returned diff. Capture its output verbatim — this is the body of the summary.
3. **Final-line invariant**: inspect the captured `/code-review` output.
   - If it already ends with a line matching `Suggested decision: <approve|request-changes|abort>`, leave it untouched.
   - Otherwise, append a blank line and `Suggested decision: <verb>` where `<verb>` is derived from the apparent severity of `/code-review`'s output:
     - blockers / critical findings present → `request-changes`
     - non-blocking findings only → `request-changes`
     - no findings → `approve`
4. Emit the summary block in full (verbatim `/code-review` body + the final line, whichever path was taken).
5. Dispatch on `--mode` (see **Mode dispatch** below) with `--gate impl`.

## Behaviour — non-`impl` gates (`specify`, `clarify`, `plan`, `tasks`)

Run when `--gate` is one of `specify`, `clarify`, `plan`, `tasks`.

1. **Resolve the artifact path** via the locked Q1 mapping:

   | Gate | File |
   |------|------|
   | `specify` | `<specsDir>/spec.md` |
   | `clarify` | `<specsDir>/clarifications.md` |
   | `plan`    | `<specsDir>/plan.md` |
   | `tasks`   | `<specsDir>/tasks.md` |

2. **Read the artifact**. If the file does not exist, emit a `ReviewError` of kind `artifact-missing` with `Error: artifact not found at <expected absolute path>.` and stop. No labels touched.

3. **Build the `ReviewSummary`** (data-model E6):
   - `blockers`: items in the artifact that block advancing — unanswered required questions, unresolved `[NEEDS CLARIFICATION]` / `TBD` / `TODO` markers blocking the gate's intent, contradictions, missing required sections.
   - `openQuestions`: non-blocking but worth flagging — minor ambiguities, follow-ups, optional sections worth confirming.
   - `suggestedDecision`: apply the **default decision rule** below.

4. **Default decision rule** (data-model E6):
   - `blockers` non-empty → `request-changes`.
   - `blockers` empty, `openQuestions` non-empty → `request-changes` (developer can still override in `assist`).
   - Both empty → `approve`.

5. **Render** exactly three H2 sections in this order, followed by the standard final line. Empty sections render as `- (none)`.

   ```markdown
   ## Blockers
   - <bullet> | (none)

   ## Open questions
   - <bullet> | (none)

   ## Suggested decision
   <short rationale paragraph>

   Suggested decision: <approve|request-changes|abort>
   ```

6. Dispatch on `--mode` (see **Mode dispatch** below) with `--gate <name>`.

## Mode dispatch

After the summary is emitted, the mode controls whether the developer is prompted and whether `/cockpit:advance` is invoked.

### `assist` (default)

1. Invoke `AskUserQuestion` with one question and three options:
   - **approve** — Advance the gate. Calls `/cockpit:advance --gate <name>`.
   - **request-changes** — Stop without advancing. No label changes.
   - **abort** — Stop without advancing. No label changes.
2. If the prompt primitive is unavailable (rare; non-interactive environment), fall back to `manual` semantics and append a hint: `Re-run with --mode auto to advance automatically when the suggested decision is approve.`
3. On `approve`, call `/cockpit:advance --gate <name>` (see **Advance + label-transition reporting** below).
4. On `request-changes` or `abort`, stop with no label changes. Do not emit a `Labels:` line.

### `auto`

1. Do not prompt.
2. Inspect the final line of the summary.
   - If it is `Suggested decision: approve`, call `/cockpit:advance --gate <name>`.
   - Otherwise, stop with the summary already emitted. No label changes, no extra output beyond `(stopped — suggested decision was <verb>)`.

### `manual`

1. Do not prompt.
2. Never call `/cockpit:advance`, regardless of the suggested decision.
3. Stop after the summary.

## Advance + label-transition reporting

When (and only when) the mode dispatch decides to advance:

1. Call `/cockpit:advance --gate <name>`.
2. If the dependency is not installed, surface a `ReviewError` of kind `advance-not-installed` with `Error: dependency '/cockpit:advance' is not available; install the cockpit plugin's G1.2 verb.` and stop. No labels touched.
3. If `/cockpit:advance` returns an error of its own, surface its message verbatim and stop. Do not synthesise a `Labels:` line — the transition did not happen.
4. On success, emit exactly one line using the transition reported by `/cockpit:advance`:

   ```
   Labels: waiting-for:<gate> → completed:<gate> on #<issue>
   ```

   `<gate>` is the gate just reviewed; `<issue>` is the `issueNumber` from `FeatureContext`.

## Failure modes

Every error path emits exactly one `Error: <sentence>` line and mutates no labels. The six `ReviewError` kinds (data-model E9):

| Kind | Message |
|------|---------|
| `unknown-gate` | `Error: unknown gate '<value>'. Valid: specify, clarify, plan, tasks, impl.` (or `Error: missing required argument '--gate'. Valid: specify, clarify, plan, tasks, impl.` when `--gate` is absent) |
| `unknown-mode` | `Error: unknown mode '<value>'. Valid: assist, auto, manual.` |
| `feature-resolution-failed` | `Error: cannot resolve specs/ directory for branch '<branch>'. Candidates: <list or "none">.` |
| `review-context-failed` | `Error: <verbatim message from /cockpit:review-context>` |
| `artifact-missing` | `Error: artifact not found at <expected absolute path>.` |
| `advance-not-installed` | `Error: dependency '/cockpit:advance' is not available; install the cockpit plugin's G1.2 verb.` |

In every failure case:
- Emit the `Error:` line.
- Emit no `Suggested decision:` line (the error path replaces the summary entirely).
- Emit no `Labels:` line.
- Make no `gh` or other label-mutating calls.

## Side-effect contract (summary)

| Side effect | When |
|-------------|------|
| Reads `<specsDir>/<artifact>.md` | non-`impl` gates only |
| Invokes `/cockpit:review-context` | `impl` gate only |
| Invokes `/code-review` | `impl` gate only |
| Invokes `AskUserQuestion` | `assist` mode only |
| Invokes `/cockpit:advance --gate <name>` | `assist` mode after explicit `approve`; `auto` mode when suggested decision is `approve` |
| Mutates GitHub labels | **never directly** — only via `/cockpit:advance` |
| Posts PR comments | never (out of scope) |
| Mutates `phase:*` labels | never (orchestrator-owned) |

## Help

For the full external contract (arguments, output schema, error message table), see `specs/354-epic-generacy-ai-tetrad/contracts/command.md`. For installation and usage examples, see `specs/354-epic-generacy-ai-tetrad/quickstart.md`.
