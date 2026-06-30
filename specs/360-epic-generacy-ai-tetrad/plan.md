# Implementation Plan: `/cockpit:bug` + AFK push in `/cockpit:watch` (Epic Cockpit A5.3)

**Feature**: `/cockpit:bug` confirm-gated bug-filer that runs the issue through the `process:speckit-bugfix` watch/merge loop, plus an amendment to `/cockpit:watch` that emits an OS `PushNotification` for every transition it surfaces inline while the operator is AFK.
**Branch**: `360-epic-generacy-ai-tetrad`
**Date**: 2026-06-29
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md)
**Status**: Complete

## Summary

Two deliverables ship under one issue, both inside `packages/claude-plugin-cockpit/`:

1. **`commands/bug.md`** (NEW) — `/cockpit:bug <title-or-description>`. The whole `$ARGUMENTS` string is the GitHub issue title (Q1=A); the engine templates a minimal body. Before any side effect, an `AskUserQuestion` gate (`Confirm` / `Cancel`) blocks the call (Q3=A; symmetric with `/cockpit:queue` #359). On `Confirm`, the verb shells out to the bug-filing engine which (a) applies the literal `process:speckit-bugfix` label, (b) writes the hidden HTML marker `<!-- generacy-bug: <sha256-of-trimmed-arguments> -->` into the body for dedup and recovery (Q2=C; Q5=B), and (c) returns the resulting `<repo>#<number>`. The watch/merge loop classifies the new issue by the label and routes it through the bugfix playbook (steps 10-11 of `docs/epic-cockpit-plan.md`).

2. **`commands/watch.md`** (EDITED) — add one new step alongside the existing inline-chat emission: whenever the playbook surfaces a transition inline (notify-only, unmapped, policy-error), it also calls the `PushNotification` host primitive with the locked compact format `<repo>#<number> <kind> <from>→<to> [<class>]` (Q4=B). The push line is parallel to but distinct from the inline-chat line that A5.1 owns; it is ≤200 chars by construction, no truncation logic, no per-platform reformatting. Auto-dispatched transitions emit neither inline nor push (unchanged from A5.1).

No new TypeScript, no MCP coupling beyond the existing `Monitor` + `AskUserQuestion` + `PushNotification` host primitives, no edits to `plugin.json` / `marketplace.json` / `README.md` (a one-line README touch-up may ride along but is not required for acceptance). The plugin scaffold from A1.4 (#350) supplies the namespace and `commands/` directory; the loader auto-discovers `commands/*.md`.

## Technical Context

**Language/Version**: Markdown (YAML frontmatter + prompt body); the runtime is Claude Code itself
**Primary Dependencies**:
- The bug-filing engine — sole creator of the GitHub issue, applier of the `process:speckit-bugfix` label, writer of the hidden HTML marker, and owner of marker-based dedup. The slash command does not embed any of this logic. (A2.1 / A2.5 sibling work; see the epic checklist for issue numbers.)
- `AskUserQuestion` — host primitive used for the `Confirm` / `Cancel` gate (Q3=A). Same primitive `/cockpit:queue` (#359) uses.
- `PushNotification` — host primitive used by `/cockpit:watch` for the AFK push (Q4=B). Single `message` field, capped at 200 chars; no separate title field.
- `Monitor` — already used by `/cockpit:watch` to stream `generacy cockpit watch` stdout one notification per line (unchanged).
- `generacy cockpit watch <epic-ref>` — long-running stream; classification, dedupe, and inline format are owned by the existing `/cockpit:watch` playbook (A5.1 / sibling cockpit issues).
- `command -v generacy` pre-flight (Bash) — borrowed from `/cockpit:status` for the `MISSING_BINARY` branch on `/cockpit:bug`.
- `claude-plugin-cockpit` scaffold (#350 / A1.4, already landed) — provides the namespace and `commands/` directory.

**Storage**: Repository files only (one new markdown file + one edited markdown file). The commands themselves read/write nothing on disk. The hidden HTML marker is written into the GitHub issue body by the engine, not by the slash command.
**Testing**: Manual end-to-end after plugin install — run `/cockpit:bug <prose>`, `Confirm` and `Cancel` each path; re-run the same prose to verify the engine dedup short-circuits to the existing issue. Run `/cockpit:watch <epic-ref>` against an epic with a known notify-only transition; verify both an inline chat line AND a `PushNotification` are emitted; verify auto-dispatched transitions emit neither.
**Target Platform**: Claude Code (any OS) with the `cockpit` plugin installed. `PushNotification` lockscreen rendering is platform-defined (iOS / Android / desktop banner); the slash command does not branch on platform.
**Project Type**: Monorepo package (Claude Code static-asset plugin; no build step)
**Performance Goals**: N/A (the bug verb is interactive; the watch push is one extra primitive call per surfaced transition, expected volume single-digit per minute at most per A5.1).
**Constraints**:
- Files owned (isolation, declared in spec.md § Summary):
  - `packages/claude-plugin-cockpit/commands/bug.md` (NEW)
  - `packages/claude-plugin-cockpit/commands/watch.md` (EDIT — push step only; no change to inline-chat behaviour)
- `/cockpit:bug` MUST gate every engine invocation behind an explicit `Confirm` selection from `AskUserQuestion` (Q3=A). Any non-`Confirm` outcome — `Cancel`, the host's auto-added `Other`, an aborted prompt — aborts without calling the engine.
- `/cockpit:bug` MUST treat the whole trimmed `$ARGUMENTS` (multi-token allowed) as the issue title and pass it byte-for-byte to the engine (Q1=A). No first-line / remainder splitting, no title-body parsing.
- `/cockpit:bug` MUST NOT compute or write the dedup marker itself — the engine owns marker computation, body templating, and label application (Q2=C; Q5=B).
- `/cockpit:bug` MUST reject empty / whitespace-only `$ARGUMENTS` with literal `Usage: /cockpit:bug <title-or-description>` and non-zero exit, without prompting (symmetric with `/cockpit:queue` FR-010).
- `/cockpit:bug` success header MUST be the literal line `**Filed:** <repo>#<number>` followed by a blank line and then the engine's stdout inside a triple-backtick fenced block (mirrors `/cockpit:status`'s `**Status:** <epic-ref>` and `/cockpit:queue`'s `**Queued:** <phase>`).
- `/cockpit:bug` confirmation prompt's `question` field MUST be the single-line string ``File this as a `process:speckit-bugfix` issue?`` followed by a second-line preview of the resolved title (passed in the same `question` field with an embedded newline — the host primitive renders the multi-line string as-is); the resolved title MUST be truncated with `…` at 120 chars for preview only (the title actually filed is the full untruncated string).
- `/cockpit:watch` AFK push MUST use the literal format `<repo>#<number> <kind> <from>→<to> [<class>]` (Q4=B) — single line, no extra whitespace, no platform-specific reformatting, no truncation logic. The line is ≤200 chars by construction.
- `/cockpit:watch` AFK push MUST fire for every transition that produces an inline chat line — i.e. notify-only, unmapped, policy-error. It MUST NOT fire for auto-dispatched transitions (the dispatch itself is the user-visible signal; A5.1 invariant). It MUST NOT fire for baseline (`from === null`) or echo (`from === to`) lines (those are dropped before any user-visible emission).
- Neither command may silently no-op on any code path — every branch (usage error, missing binary, cancel, engine failure, success) emits one terse line OR one fenced block (SC-002 carry-over).
- Neither command may mutate any GitHub label directly. All label application happens inside the bug-filing engine.

**Scale/Scope**: 1 new file (~150–220 lines of markdown) + ~10–25 lines of additions to `commands/watch.md`, 0 source-code edits.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` is present in the repo — no gates apply. The Epic Cockpit per-verb isolation convention (one file owned per issue) is honoured: this issue owns exactly the two files listed in `## Constraints`. The watch.md edit is additive (a new step block + the push call inside an existing step); it does not alter the inline-chat surface owned by A5.1.

## Project Structure

### Documentation (this feature)

```text
specs/360-epic-generacy-ai-tetrad/
├── spec.md                          # Feature specification (existing, read-only)
├── clarifications.md                # Q1–Q5 answers (existing, read-only)
├── plan.md                          # This file
├── research.md                      # Pattern + dependency decisions
├── data-model.md                    # Input/output schema for both deliverables
├── quickstart.md                    # Install + usage walkthrough
├── contracts/
│   ├── bug.md                       # The /cockpit:bug contract: args, prompt, marker, output, exit conditions
│   └── watch-push.md                # The amendment to /cockpit:watch: push format, fire conditions, parity with inline-chat
└── checklists/                      # (empty — generated by /speckit:checklist if needed)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── .claude-plugin/
│   └── plugin.json                  # EXISTING (#350) — no changes
├── commands/
│   ├── breakdown.md                 # EXISTING — sibling verb
│   ├── clarify.md                   # EXISTING — sibling verb
│   ├── file.md                      # EXISTING — sibling verb (closest pattern for engine-owned dedup + hidden HTML marker)
│   ├── merge.md                     # EXISTING — sibling verb
│   ├── plan.md                      # EXISTING — sibling verb
│   ├── queue.md                     # EXISTING — sibling verb (#359; closest pattern for confirm-gated CLI wrapper)
│   ├── review.md                    # EXISTING — sibling verb
│   ├── status.md                    # EXISTING — pattern source for argument handling + output shape + MISSING_BINARY text
│   ├── watch.md                     # MODIFIED — add PushNotification step alongside inline-chat emission
│   └── bug.md                       # NEW — the entire bug-verb deliverable for #360
└── README.md                        # MODIFIED (optional) — flip the
                                     # `/cockpit:bug` row from a placeholder
                                     # to a live one-line description
```

**Structure Decision**: Two-file scope — one new (`bug.md`) and one edit (`watch.md`). The plugin manifest, marketplace entry, and namespace registration were all delivered by #350 (A1.4) and require no changes. The bug verb is a sibling of `/cockpit:queue` (confirm-gate pattern) and `/cockpit:file` (engine-owned dedup with hidden HTML marker); the watch edit is additive and stays within the file's existing step structure.

## Implementation Phases

### Phase 0: Verify the host primitives exist

Before writing `bug.md` or editing `watch.md`, confirm the primitives both files depend on are actually callable in the target Claude Code environment:

1. **`AskUserQuestion`** — confirmed present (used by sibling `/cockpit:review`, `/cockpit:queue`). Clarification Q3=A explicitly chose `AskUserQuestion`; no alternative is acceptable.
2. **`PushNotification`** — host primitive with a single `message: string` field, capped at 200 chars. Confirmed in the deferred-tools list for this environment. Locked by clarification Q4=B as the AFK surface for `/cockpit:watch`; A5.1's plan explicitly deferred OS-level push to A5.3 (this issue), so this is the deliberate landing point.
3. **`Monitor`** — already used by `/cockpit:watch` (unchanged).
4. **`generacy` CLI on `$PATH`** for `/cockpit:bug` — pre-flight with `command -v generacy >/dev/null 2>&1`; if it returns non-zero, branch to `MISSING_BINARY` (text borrowed verbatim from `/cockpit:status` and `/cockpit:queue`).
5. **Bug-filing engine sub-verb / MCP tool** — owned by sibling cockpit issues A2.1 / A2.5. The slash command does not bundle a fallback; if the engine is missing at runtime its native error and exit code surface inside the `OTHER` error fenced block.

These are runtime dependencies, not build-time ones: both files can land independently and fail-fast at first call if any dependency is missing.

### Phase 1: Author `commands/bug.md`

Write the verb file with this structure (mirroring `/cockpit:queue`'s overall shape, with the engine-owned-marker dedup pattern borrowed from `/cockpit:file`):

1. **YAML frontmatter**
   - `description:` — one-line summary suitable for the slash-command palette.
   - No `arguments:` block: the verb takes one freeform positional argument (the title) but does NOT declare it as a typed `arguments:` entry because the host's argument-typing convention is "one token per arg" and a bug title is multi-token. The body's `## Arguments` section documents the surface instead (mirrors `/cockpit:watch`'s pattern).
2. **Argument handling** (mirrors `/cockpit:queue` step 1, but does NOT tokenize on whitespace):
   - Read `$ARGUMENTS`. Trim only outer whitespace.
   - If empty/whitespace-only → emit `Usage: /cockpit:bug <title-or-description>` and exit non-zero. Do NOT invoke `AskUserQuestion`. Do NOT invoke the engine.
   - Otherwise capture the trimmed string as `<title>` (multi-token allowed; no tokenization). Do NOT validate, parse, split on the first newline, strip Markdown, or otherwise transform it (Q1=A).
3. **Confirmation gate**:
   - Compute `<preview>` = `<title>` truncated to 120 chars with `…` appended if it was truncated; otherwise `<title>` itself. (Preview only — the engine receives the full untruncated title.)
   - Invoke `AskUserQuestion` with one question:
     - `question`: the literal multi-line string ``File this as a `process:speckit-bugfix` issue?\n\nTitle: <preview>``. The blank line and `Title:` prefix make the binary nature of the choice obvious in the host UI.
     - `header`: short label, e.g. `File bug` (≤12 chars constraint of `AskUserQuestion`).
     - `multiSelect`: `false`.
     - `options`: exactly two — `{ label: "Confirm", description: "File the bug and enter the process:speckit-bugfix loop" }` and `{ label: "Cancel", description: "Abort without filing" }`.
   - **Affirmative test**: the user's selection MUST be exactly `Confirm`. Any other selection — including `Cancel`, the platform's auto-added `Other`, an empty/aborted prompt, or anything else the host returns — is non-affirmative and skips to step 6 (cancel).
4. **CLI pre-flight + engine invocation** (only reached when step 3 returned `Confirm`):
   - Pre-flight `command -v generacy >/dev/null 2>&1`. If non-zero, branch to the `MISSING_BINARY` text in step 7.
   - From the repository root, invoke the bug-filing engine (sibling A2.1 / A2.5; exact entry point — sub-verb name vs MCP tool — is the engine's contract; the slash command shells out by the documented name and surfaces stdout / stderr / exit code verbatim). Pass `<title>` byte-for-byte as the single freeform argument. Capture stdout, stderr, and the exit code in separate variables. Pass no other flags.
   - The engine is responsible for:
     - computing `sha256(<title>)` and writing `<!-- generacy-bug: <hash> -->` into the issue body (Q5=B);
     - applying the literal label `process:speckit-bugfix` (Q2=C);
     - templating a minimal body (Q1=A; the slash command does NOT supply body content);
     - searching open `process:speckit-bugfix` issues for an existing matching marker before creating a new one (dedup; Q5=B); on a hit the engine returns the existing `<repo>#<number>` and exit 0 with a "reused existing issue" indication on stdout.
5. **Success rendering** (engine exit code `0`):
   - Print the single header line `**Filed:** <repo>#<number>` (with `<repo>#<number>` taken from the engine's success payload — typically the last line of stdout or a structured JSON field).
   - Print one blank line.
   - Print captured engine stdout inside a triple-backtick fenced code block, verbatim. Do NOT reflow, reformat, re-align, re-decorate, or otherwise transform the engine's output.
6. **Cancel rendering** (non-affirmative selection in step 3):
   - Print exactly one terse line: `Cancelled: /cockpit:bug` (no fenced block; no echo of the title — the prompt UI already showed it).
   - Exit non-zero so scripted callers can distinguish from `Confirm` + success.
   - **Do not invoke the engine.** No GitHub issue is created; no label is applied.
7. **Error rendering** (engine exit code non-zero, or pre-flight in step 4 failed):
   - Classify into exactly one of three classes (first match wins, case-insensitive); every class MUST print something — never silently no-op:
     - **MISSING_BINARY** — pre-flight in step 4 returned non-zero. Print the same line `/cockpit:status` and `/cockpit:queue` use: `The` ``generacy`` `CLI is required but is not on $PATH. Install it with` ``npm install -g @generacy-ai/cli`` `(or the prevailing install command) and retry.`
     - **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The` ``generacy`` `CLI uses` ``gh`` `for GitHub access — run` ``gh auth login`` `and retry.`
     - **OTHER** — anything else (including engine-reported "rate limited", "repository not found", "label `process:speckit-bugfix` missing from repo", etc.). Print `Engine failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.

### Phase 2: Edit `commands/watch.md` — add the AFK push step

The existing `/cockpit:watch` playbook has step 4 ("Inline notification format"). The amendment adds the push step **without** changing the inline format and **without** changing which transitions are user-visible. Edit shape:

1. **Renumber or extend** step 4 to make explicit that the inline emission and the push emission are two parallel surfaces of the same transition record. Concretely:
   - Keep the existing inline emission verbatim (A5.1 owns the format and is unchanged).
   - Immediately after the inline emission (still inside the per-transition loop body), call `PushNotification` with the compact format described below.
2. **Add a "Push notification format" sub-section** with the literal locked format from Q4=B:

   ```
   <repo>#<number> <kind> <from>→<to> [<class>]
   ```

   Where:
   - `<repo>#<number>` is the GitHub ref (e.g. `generacy-ai/agency#360`).
   - `<kind>` is the transition's `kind` field (e.g. `issue`, `pr`).
   - `<from>→<to>` uses a single Unicode right-arrow `→` between the from and to state names (no surrounding spaces inside the arrow).
   - `<class>` is one of `auto` (only fires for `policy-error:` degraded autos that surface inline), `notify-only`, `unmapped`, or `policy-error: <reason>`.
   - The line is ≤200 chars by construction; no truncation logic is required. If a future epic adds extremely long state names that push the total over 200 chars, that is a contract violation owned by the upstream state-name change, not by this command.
3. **Fire conditions** (must mirror the inline-emission fire conditions exactly):
   - Fire for: `notify-only`, `unmapped`, `policy-error:` degraded auto, unknown-`mode` degraded auto.
   - Do NOT fire for: successfully auto-dispatched transitions (the slash-command invocation is the user-visible signal — same rule as inline chat in A5.1).
   - Do NOT fire for: baseline (`from === null`) lines (dropped earlier in step 3b).
   - Do NOT fire for: echo (`from === to`) lines (dropped earlier in step 3c).
   - Do NOT fire for: already-`seen` transitions (dropped earlier in step 3d).
4. **AFK semantics**: the playbook does NOT detect whether the operator is actually at the keyboard. The `PushNotification` primitive itself is the AFK surface — when the operator is at the screen they will also see the inline chat line; when they are away the OS lockscreen / banner is the only surface that reaches them. "AFK push" is therefore an unconditional pairing: every inline chat line emitted by the playbook also fires a push. No timer, no idle detection, no per-platform gating.
5. **Failure tolerance**: if `PushNotification` itself returns an error (e.g. permission revoked at OS level), the playbook MUST surface a single inline `[cockpit:watch] push failed: <reason>` line and continue processing the stream. A push-primitive failure MUST NOT terminate the watch loop and MUST NOT skip the inline chat line that was already emitted for the same transition. Push failures do NOT enter the `seen` dedup set as failures — the next emission of the same transition would still be dropped by `seen` (already added pre-dispatch in step 3e).
6. **No retry**: the playbook does not retry `PushNotification`. The host primitive owns its own delivery semantics; the playbook is fire-and-forget per call.

### Phase 3: README touch-up (optional in this issue)

Optionally flip the `/cockpit:bug` row in `packages/claude-plugin-cockpit/README.md` from any placeholder/"coming soon" state to a one-line live description, and optionally annotate the `/cockpit:watch` row to mention "+ AFK push". This is cosmetic; if deferred, it can ship in a follow-up.

### Phase 4: Manual validation (per spec acceptance + clarifications)

**`/cockpit:bug`:**

1. **Acceptance — "Files+tracks a bugfix"**: install the plugin, run `/cockpit:bug login button is broken on Safari` against a repo where the bug-filing engine is wired up, select `Confirm`, verify (a) a new GitHub issue is created with title `login button is broken on Safari`, (b) the issue carries the literal label `process:speckit-bugfix`, (c) the issue body contains a hidden HTML marker matching `<!-- generacy-bug: [0-9a-f]{64} -->`, and (d) the slash command emits `**Filed:** <repo>#<n>` followed by the engine's stdout in a fenced block.
2. **Q1=A — whole `$ARGUMENTS` is the title**: run `/cockpit:bug The picker shows the wrong year when locale is non-US`. Verify the resulting issue's title is the full string (multi-token preserved), and the body is the engine's minimal template (the slash command supplied nothing to the body).
3. **Q3=A — confirm gate**: re-run, select `Cancel`. Verify (a) no engine call was made (no new issue appeared, no rate-limit consumed), and (b) the only output is the one-line `Cancelled: /cockpit:bug`.
4. **Q3=A — Other rejection**: re-run, choose the host's auto-added `Other` option with arbitrary text. Verify the same `Cancelled: /cockpit:bug` line and non-zero exit; no engine call.
5. **Q2=C — label + marker**: inspect the issue created in step 1 on the GitHub web UI. Verify the `process:speckit-bugfix` label is attached (UI shows it). Inspect the raw body via `gh issue view <n> --json body --jq .body` (or equivalent) and verify the hidden marker is present.
6. **Q5=B — dedup**: re-run `/cockpit:bug login button is broken on Safari` (same input as step 1). Select `Confirm`. Verify the engine's dedup short-circuits to the existing `<repo>#<number>` — the success header is `**Filed:** <repo>#<n>` with the same `<n>` from step 1, and the engine's stdout indicates the issue was reused (e.g. "matched existing marker; reusing #<n>"). Verify no second issue was created.
7. **Q5=B — typo creates new issue**: run `/cockpit:bug Login button is broken on Safari` (capitalized "L"). The trimmed input differs by one byte, so `sha256` differs, so the engine creates a new issue. Verify a different `<n>` is returned. This is the documented behaviour — title-edit forgiveness was deliberately rejected in favour of marker-only dedup (Q5=B).
8. **Empty-arg rejection**: run `/cockpit:bug` (no arguments). Verify the literal `Usage: /cockpit:bug <title-or-description>` is printed, exit is non-zero, no prompt was shown.
9. **`MISSING_BINARY`**: temporarily unset `PATH` for `generacy`, run `/cockpit:bug something`, select `Confirm`. Verify the `MISSING_BINARY` text appears (matches `/cockpit:status` and `/cockpit:queue` byte-for-byte).
10. **`OTHER`**: run against a repo where the `process:speckit-bugfix` label is not defined and the engine cannot auto-create it. `Confirm`. Verify a single `Engine failed with exit code <N>.` line followed by a fenced stderr block.

**`/cockpit:watch` AFK push amendment:**

11. **Acceptance — "emits a push when AFK"**: start `/cockpit:watch <epic-ref>` against an epic with at least one transition mapped to `notify-only`. Trigger the transition (e.g. flip a label on the epic). Verify (a) one inline chat line in the existing A5.1 format AND (b) one `PushNotification` call whose `message` matches `<repo>#<number> <kind> <from>→<to> [notify-only]` exactly.
12. **Q4=B — push format**: inspect the push payload (via OS notification log or `PushNotification` tool trace). Verify (a) single line, (b) no extra whitespace inside the arrow, (c) class enclosed in square brackets, (d) length ≤200 chars.
13. **Auto-dispatched transition — no push**: trigger a transition mapped to an `auto` policy with a valid `command`. Verify the slash command was invoked and that **no** inline chat line and **no** `PushNotification` were emitted for this transition (A5.1 invariant carried into A5.3).
14. **Policy-error degraded auto — push fires**: configure a policy entry with `mode: "auto"` and no `command` (or with an unknown `mode`). Trigger the transition. Verify both an inline chat line with `policy-error:` prefix AND a push with `[policy-error: <reason>]`.
15. **Unmapped transition — push fires**: trigger a transition with no matching policy entry. Verify inline + push both appear, push class is `[unmapped]`.
16. **Baseline line — no push, no inline**: restart `/cockpit:watch <epic-ref>`. Verify the engine's `from: null` baseline lines produce no inline chat and no push (already dropped in existing step 3b; A5.3 amendment does not change this).
17. **Echo line — no push, no inline**: simulate (or wait for the engine to emit) a `from === to` line. Verify it produces no inline chat and no push.
18. **Dedupe — second emission of same transition is silent**: trigger the same transition twice (e.g. by reconnecting the watch). Verify the second emission produces no inline chat and no push (already dropped in existing step 3d/3e).
19. **Push primitive failure**: revoke OS notification permission, restart the watch, trigger a notify-only transition. Verify (a) the inline chat line still appears, (b) one `[cockpit:watch] push failed: <reason>` line appears inline, and (c) the watch loop continues processing subsequent transitions.
20. **Isolation check**: confirm the diff for this issue touches only `packages/claude-plugin-cockpit/commands/bug.md` (new) and `packages/claude-plugin-cockpit/commands/watch.md` (edit — additions only inside step 4 and below; no edits to steps 1–3).

## Open Risks

| Risk | Mitigation |
|------|------------|
| The bug-filing engine (A2.1 / A2.5) has not landed when `bug.md` ships | The slash command does not couple to engine internals — it shells out by the documented entry point and surfaces stdout / stderr / exit code verbatim. If the engine is missing at runtime the CLI emits its own "unknown subcommand" error and a non-zero exit, which the `OTHER` branch in step 7 renders inside a fenced block. No silent failure. |
| The bug-filing engine writes the wrong marker format (e.g. uppercase hash, different prefix) | The slash command does NOT compute or validate the marker. The marker is purely engine-owned (Q5=B). If the engine emits a different marker format, the dedup contract is violated at the engine layer — not at this layer. Acceptance test #5 verifies the marker is present at all; the exact format check belongs in the engine's own test suite. |
| `AskUserQuestion` is not available in some non-interactive Claude Code environments | The command does not ship a free-text fallback (Q3=A locks `AskUserQuestion`). In non-interactive environments the command stops at step 3 with `Cancelled: /cockpit:bug` (because no selection equals `Confirm`). This is the safer default for a state-mutating wrapper that creates GitHub issues. |
| `AskUserQuestion` truncates the multi-line `question` field unexpectedly | The preview is informational; the full title is still sent to the engine. If the host primitive truncates the preview line that the user sees, the user still has the option to `Cancel` and re-run with a shorter prose. The title-of-record is the engine's, not the prompt's. |
| `PushNotification` returns success but the OS silently swallows the notification (Focus mode, Do Not Disturb, permission revoked silently) | Out of scope. The playbook treats the primitive call's return as authoritative. If the OS swallows the message, that is a host-OS configuration issue. The inline chat line is the always-on backup surface (operator sees it when they return to the screen). |
| Long state names blow past 200 chars | Acknowledged in step 2 of Phase 2. The 200-char budget is a contract held by the upstream state-name vocabulary. If a future epic introduces a state name long enough to push the format over budget, that change owns the fix — either by shortening the state name, or by adding a truncation rule to this command in a new clarification. The current format has no truncation. |
| Push fires for high-frequency transitions and floods the lockscreen | The playbook's dedupe (step 3d/3e) already collapses repeats. Per-second / per-minute rate-limiting is out of scope for v1; if observed in practice, it would be addressed by a follow-up clarification (e.g. coalescing pushes within a sliding window). The current contract is "one inline, one push, per surfaced transition". |
| Header line drift across cockpit verbs | Mirrors `/cockpit:status`'s `**Status:** <epic-ref>` and `/cockpit:queue`'s `**Queued:** <phase>`. Future cockpit verbs that emit a header should follow the same `**<Verb-past-tense>:** <subject>` convention; flag drift in code review. |
| Operator selects `Confirm` accidentally on a sensitive bug-filing prompt | Out of scope. The confirm gate is the defence; a deliberate `Confirm` is taken at face value. Q3 deliberately rejected the `--yes` bypass for v1, so there is no path that bypasses the gate. |

## Complexity Tracking

> *Fill ONLY if Constitution Check has violations that must be justified*

No constitution violations; no complexity entries.
