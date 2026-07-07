# Feature Specification: Align `/cockpit:queue` slash command to two-argument CLI contract

**Branch**: `380-found-during-cockpit-v1` | **Date**: 2026-07-07 | **Status**: Draft
**Issue**: [generacy-ai/agency#380](https://github.com/generacy-ai/agency/issues/380)
**Upstream finding**: generacy-ai/tetrad-development#88 (cockpit v1 smoke test, finding #6)

## Summary

The `/cockpit:queue` slash command (`packages/claude-plugin-cockpit/commands/queue.md`) enforces a one-token usage gate (`<phase>`), but the CLI verb it wraps (`generacy cockpit queue`) requires two positionals: `<epic-ref>` and `<phase>` (see `queue.ts:387-388`). The valid invocation `/cockpit:queue 1 P1` is rejected at step 1 with `Usage: /cockpit:queue <phase>`, and even a single-token call would fail downstream at the CLI (the lone token would parse as `<epic-ref>` and `<phase>` would be missing).

**Root cause**: The rev 3 catalog (`docs/epic-cockpit-plan.md` in tetrad-development) was internally inconsistent — its slash-command table said `queue <phase>` while its CLI-verb table said `queue <epic-ref> <phase>` — and the A-S1 rewrite implemented the slash table faithfully. The catalog is being corrected to `<epic-ref> <phase>`; this issue aligns the plugin to match.

**Fix**: Rewrite `commands/queue.md` to the two-argument contract, updating the frontmatter, tokenization gate, confirmation question, CLI invocation, success header, and worked example. A single flag policy for `--yes` must be picked and documented to avoid double-prompting.

## User Stories

### US1: Cockpit user queues a phase for an epic

**As a** cockpit operator running an epic (e.g. `christrudelpw/sniplink#1`),
**I want** `/cockpit:queue <epic-ref> <phase>` to accept both arguments, confirm, and hand off to the CLI,
**So that** I can queue a phase's issues (assign + label `process:speckit-feature`) without hitting a spurious usage error.

**Acceptance Criteria**:
- [ ] `/cockpit:queue 1 P1` on `christrudelpw/sniplink` reaches the `AskUserQuestion` confirm gate (no usage error at step 1).
- [ ] `Confirm` invokes `generacy cockpit queue 1 P1` from the repo root and renders its stdout under `**Queued:** P1 (1)`.
- [ ] After Confirm, all three P1 issues for the epic are assigned to the caller and carry the `process:speckit-feature` label (behavior owned by the CLI; the plugin verifies via CLI exit 0).
- [ ] `Cancel` (or any non-`Confirm` outcome) emits `Cancelled: /cockpit:queue 1 P1` and does not invoke the CLI.

### US2: Cockpit user gets a correct usage message on malformed invocation

**As a** cockpit operator who mistypes the command,
**I want** the usage line to reflect the real two-argument contract,
**So that** I can self-correct without reading the CLI source.

**Acceptance Criteria**:
- [ ] `/cockpit:queue` (zero tokens) emits the literal line `Usage: /cockpit:queue <epic-ref> <phase>` and exits non-zero without prompting or invoking the CLI.
- [ ] `/cockpit:queue P1` (one token) emits the same literal usage line and exits non-zero.
- [ ] `/cockpit:queue 1 P1 extra` (three+ tokens) emits the same literal usage line and exits non-zero.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Frontmatter `arguments` lists two entries in order: `epic-ref` and `phase`, both `required: true`. `epic-ref` description notes it accepts a bare number, `owner/repo#N`, or a full URL (resolved by the CLI per generacy#822). | P1 | |
| FR-002 | Step 1 tokenization gate accepts exactly TWO tokens. Zero, one, or three-plus tokens emit the literal line `Usage: /cockpit:queue <epic-ref> <phase>` and exit non-zero without invoking `AskUserQuestion` or the CLI. | P1 | Tokens are captured byte-for-byte; no validation, parsing, normalization, lowercasing, expansion, or inner-punctuation stripping. |
| FR-003 | Confirmation `AskUserQuestion` states the action, not just the argv echo. Question string: ``Assign phase `<phase>`'s issues of `<epic-ref>` to the cluster account and add label `process:speckit-feature`?`` with both tokens interpolated. Options remain `Confirm` / `Cancel` in that order; `multiSelect: false`; header stays `Queue phase`. | P1 | Wording chosen deliberately because `--yes` suppresses the CLI's own preview — the plugin's confirm therefore fires on intent, so it must describe what will happen. |
| FR-004 | Affirmative test is unchanged: only the literal string `Confirm` proceeds. Any other outcome emits `Cancelled: /cockpit:queue <epic-ref> <phase>` and exits non-zero. | P1 | |
| FR-005 | On Confirm, the plugin runs `generacy cockpit queue <epic-ref> <phase> --yes` from the repository root via the Bash tool, capturing stdout, stderr, and exit code separately. | P1 | Pre-flight `command -v generacy` remains; MISSING_BINARY class applies unchanged. `--yes` suppresses the CLI's own interactive confirm (per FR-008). |
| FR-006 | Success rendering (CLI exit 0) prints the header `**Queued:** <phase> (<epic-ref>)`, one blank line, then stdout in a triple-backtick fenced block, verbatim. No footer. | P1 | |
| FR-007 | Error handling classes (MISSING_BINARY / AUTH_FAILURE / OTHER) are unchanged in text and precedence. | P1 | Canonical source-of-truth reference remains `packages/claude-plugin-cockpit/README.md § Error Handling`. |
| FR-008 | The plugin's `AskUserQuestion` is the sole gate; the CLI invocation passes `--yes` to suppress the CLI's own interactive confirm. The command file documents this policy in a short inline note next to the invocation. | P1 | Decided by clarification Q1 (2026-07-07). Driver: the plugin runs the CLI via Claude Code's Bash tool (non-interactive, no TTY), so the CLI's stdin confirm cannot function in that environment; option B is unworkable. |
| FR-009 | The Examples section is rewritten: the primary worked example uses two arguments (e.g. `/cockpit:queue 1 P1`), and the zero-arg example's usage line matches FR-002. Any stale `queue <phase>` prose is removed. | P1 | |
| FR-010 | The `description` frontmatter still reads as a confirm-gated wrapper, but references the two-positional CLI form. | P2 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | `/cockpit:queue 1 P1` reaches the confirm gate on the smoke-test repo `christrudelpw/sniplink`. | 100% | Manual smoke test replaying tetrad-development#88 finding #6. |
| SC-002 | Post-Confirm CLI run yields three P1 issues assigned to the caller and labeled `process:speckit-feature`. | 3/3 issues | `gh issue list --label process:speckit-feature --assignee @me` on the epic repo. |
| SC-003 | Zero-, one-, and three-token invocations emit the new usage line and never invoke the CLI. | 3/3 cases | Direct invocation of `/cockpit:queue` variants; observe absence of CLI call. |
| SC-004 | No regressions in error-handling classes (MISSING_BINARY / AUTH_FAILURE / OTHER). | Parity with pre-fix behavior | Force each class; compare emitted text to README error-handling section. |

## Assumptions

- The CLI verb `generacy cockpit queue <epic-ref> <phase>` at `queue.ts:387-388` is the authoritative contract; the plugin conforms to it, not vice-versa.
- The rev 3 catalog fix in `docs/epic-cockpit-plan.md` (tetrad-development) is landing separately; this issue does not need to touch that repo.
- `epic-ref` remains opaque to the plugin — resolution (bare number vs `owner/repo#N` vs URL) is entirely the CLI's responsibility (per generacy#822).
- `--yes` handling: the plugin passes `--yes` and its `AskUserQuestion` is the sole user-facing gate (clarification Q1). This is forced by the runtime environment — Claude Code's Bash tool is non-interactive with no TTY, so the CLI's stdin confirm cannot function when driven by the plugin. `--yes` remains the intended flag for programmatic callers that provide their own gate; the CLI's own confirm is preserved for humans invoking `generacy cockpit queue` directly in a terminal.
- Because `--yes` skips the CLI's resolved preview, the plugin's confirm text describes the *action* (assign the phase's issues to the cluster account + apply `process:speckit-feature`) rather than merely echoing the argv. A true preview-then-confirm would require a `--dry-run` mode on the CLI verb, which is a generacy-side enhancement and out of scope here.

## Out of Scope

- Changes to the CLI verb itself (`packages/generacy-cli/src/.../queue.ts`) — the CLI is the source of truth.
- Changes to `docs/epic-cockpit-plan.md` in tetrad-development (owned by that repo).
- Changes to any other cockpit slash command (`/cockpit:next`, `/cockpit:status`, etc.).
- Changes to the `AskUserQuestion` platform behavior (`Other` handling, empty-abort semantics).
- Adding argument validation or normalization inside the plugin (opaque pass-through remains the contract).

---

*Generated by speckit*
