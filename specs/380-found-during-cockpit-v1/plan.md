# Implementation Plan: Align `/cockpit:queue` slash command to two-argument CLI contract

**Feature**: Rewrite `packages/claude-plugin-cockpit/commands/queue.md` so the slash command accepts `<epic-ref> <phase>`, matching the CLI verb `generacy cockpit queue <epic-ref> <phase>`, and passes `--yes` so the plugin's `AskUserQuestion` is the sole gate.
**Branch**: `380-found-during-cockpit-v1`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Rewrite a single file — `packages/claude-plugin-cockpit/commands/queue.md` — to conform to the two-positional CLI contract. Seven sections change: frontmatter `arguments`, the description line, the tokenization gate (1→2 tokens), the `AskUserQuestion` question text, the Bash invocation (adds `--yes`, adds `<epic-ref>`), the success header (`**Queued:** <phase> (<epic-ref>)`), and the Cancelled message and worked examples. The MISSING_BINARY / AUTH_FAILURE / OTHER blocks are untouched (they were corrected in [#378](https://github.com/generacy-ai/agency/issues/378) and are load-bearing byte-identical siblings across the other cockpit commands).

A single flag policy is baked in per clarification Q1: the plugin's `AskUserQuestion` is the sole gate; the CLI runs with `--yes`. This is forced by the runtime environment — Claude Code's Bash tool has no TTY, so the CLI's stdin prompt cannot function there. A one-line inline note in the command file documents the policy so future readers do not "fix" the missing double-prompt.

Zero code changes. One Markdown file edited. Acceptance is: (a) manual replay of the smoke test in [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6 against `christrudelpw/sniplink`, (b) three token-count usage cases (0, 1, 3-plus), (c) an error-class parity spot-check.

## Technical Context

**Language/Version**: Markdown (CommonMark) — Claude Code prompt commands are Markdown files consumed by the harness at command-invocation time.
**Primary Dependencies**: None. This feature ships no runtime code.
- The `generacy` CLI (`@generacy-ai/generacy`) is a *subject* of the invocation string, not a dependency of this change.
- The CLI's two-positional contract (`<epic-ref> <phase>`) is asserted by the spec; the plugin conforms to it. Any change to the CLI itself is Out of Scope §1.
**Storage**: None.
**Testing**:
- **Local (deterministic)** — greps from repo root:
  1. `grep -n "Usage: /cockpit:queue <epic-ref> <phase>" packages/claude-plugin-cockpit/commands/queue.md` MUST return exactly the number of usage-line anchors in the rewritten file (currently three: gate for 0 tokens, gate for wrong-count tokens, examples section). FR-002.
  2. `grep -n "generacy cockpit queue" packages/claude-plugin-cockpit/commands/queue.md` MUST show every invocation string carrying two positionals AND `--yes`. FR-005, FR-008.
  3. `grep -c "\<phase\>" packages/claude-plugin-cockpit/commands/queue.md` and `grep -c "\<epic-ref\>" packages/claude-plugin-cockpit/commands/queue.md` MUST both report the same count (every reference to one argument has a matching reference to the other). FR-001, FR-003.
- **Manual smoke test (US1, SC-001, SC-002)** — replay [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6 with the fixed plugin against `christrudelpw/sniplink`:
  1. `/cockpit:queue 1 P1` reaches the confirm gate (no usage error at step 1).
  2. Select `Confirm` → CLI runs, all three P1 issues are assigned to the caller and labeled `process:speckit-feature`.
  3. Verify with `gh issue list --repo christrudelpw/sniplink --label process:speckit-feature --assignee @me` — expect 3 rows.
- **Manual usage tests (US2, SC-003)** — three invocations from a Claude Code session:
  - `/cockpit:queue` → the literal `Usage: /cockpit:queue <epic-ref> <phase>` line; no prompt; no CLI call.
  - `/cockpit:queue P1` → same usage line; no prompt; no CLI call.
  - `/cockpit:queue 1 P1 extra` → same usage line; no prompt; no CLI call.
- **Error-handling parity spot-check (SC-004)** — force MISSING_BINARY by temporarily removing `generacy` from `$PATH`; force AUTH_FAILURE by running with `GH_TOKEN=""` (or an expired token). The emitted text MUST match `packages/claude-plugin-cockpit/README.md § Error Handling` verbatim — i.e. #378's fix is not regressed.
- **No unit tests to add**: prompt commands are not code; correctness is prompt-level and is verified by grep + manual replay.

**Target Platform**: The `@generacy-ai/claude-plugin-cockpit` npm package (shipped from `packages/claude-plugin-cockpit/`) and its consumers (Claude Code sessions). The package's `files` array includes `commands/`, so the corrected `queue.md` ships in the next preview publish automatically — no workflow or `package.json` edits needed.
**Project Type**: Documentation-only fix inside a publishable pnpm workspace package (Claude Code prompt-command plugin).
**Performance Goals**: N/A.
**Constraints**:
- **Two-positional contract, opaque pass-through** (FR-001, FR-002, Assumption §3): the plugin does not validate, parse, normalize, lowercase, expand, or strip inner punctuation on either token. `epic-ref` resolution (bare number vs `owner/repo#N` vs URL) is the CLI's job per [generacy#822](https://github.com/generacy-ai/generacy/issues/822).
- **Exact-two token gate** (FR-002): zero, one, or three-plus tokens all emit the *same* literal usage line and exit non-zero without invoking `AskUserQuestion` or the CLI. No leniency, no auto-completion, no interactive prompt for missing args.
- **Sole-gate policy is `--yes`-forced** (FR-008, clarification Q1): the CLI is called with `--yes` so the plugin's `AskUserQuestion` is the only user-facing confirm. This is documented as a one-line inline note next to the invocation.
- **Confirm text states the action, not the argv** (FR-003): with `--yes`, the CLI's own resolved preview is suppressed, so the plugin's confirm must describe *what will happen* (assign + label). A pure `argv` echo would be misleading.
- **Error-handling blocks unchanged** (FR-007, Out of Scope §5): MISSING_BINARY / AUTH_FAILURE / OTHER copy is byte-identical with the other five cockpit commands and with README § Error Handling — do NOT edit those lines. This constraint interlocks with #378's byte-identical drift check.
- **Sibling commands untouched** (Out of Scope §3): `/cockpit:next`, `/cockpit:status`, `/cockpit:merge`, etc. are not part of this change even if analogous arg-count fixes might apply to them. Each requires its own spec + issue.
- **No CLI edits** (Out of Scope §1): the CLI verb `generacy cockpit queue` is the source of truth; the plugin conforms to it.

**Scale/Scope**: One file edited: `packages/claude-plugin-cockpit/commands/queue.md`. No files added, no files removed, no sibling `commands/*.md` edited, no `README.md` edit, no other packages touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this change honors implicitly:

- **Scope discipline**: The change owns only `packages/claude-plugin-cockpit/commands/queue.md`. `git diff --stat` on the resulting commit MUST show exactly one file modified.
- **Root-cause fix, not bandaid**: The wrong argument count is the root cause of the smoke-test failure. The plan does not add a compensating validation shim in the CLI, nor does it introduce a plugin-side epic-ref resolver — both would be workarounds for a text bug. The text is what changes.
- **Preserve load-bearing conventions**: The MISSING_BINARY / AUTH_FAILURE / OTHER inline blocks are byte-identical siblings across six command files and one README section (see [#378](https://github.com/generacy-ai/agency/issues/378) plan). The rewrite explicitly does not touch those lines, so #378's drift-check invariant remains intact.
- **One-issue-per-repo boundary**: The rev 3 catalog fix in [tetrad-development docs](https://github.com/generacy-ai/tetrad-development) is landing separately and is explicitly Out of Scope §2. This feature ships the plugin-side text fix only.

**Result**: PASS. No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/380-found-during-cockpit-v1/
├── spec.md              # Feature specification (read-only for /plan)
├── clarifications.md    # Q1 answer integrated into spec (read-only for /plan)
├── plan.md              # This file
├── research.md          # Phase 0 — flag policy, opaque pass-through, sibling-command scope
├── quickstart.md        # Phase 1 — the seven-section rewrite walkthrough + verification
├── contracts/
│   └── queue-command.contract.md  # Exact byte-level strings the rewritten queue.md must contain
├── checklists/          # (empty; no /checklist run for this feature)
└── conversation-log.jsonl
```

No `data-model.md` — this feature introduces no runtime entities, types, or state. The only "data" is prompt copy in a single Markdown file, captured section-by-section in `contracts/queue-command.contract.md`.

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
└── commands/
    └── queue.md  # EDIT: seven sections rewritten (frontmatter, description, gate, question,
                  #       invocation, success header, cancelled message, examples).
                  #       MISSING_BINARY / AUTH_FAILURE / OTHER blocks unchanged.
```

**Structure Decision**: The cockpit plugin is a Claude Code prompt-command package (Markdown-only, no `src/`, no build step). Prompt commands under `commands/` are the shipped surface. Rewriting `queue.md` in place preserves the plugin's inline-verbatim convention (see [#378](https://github.com/generacy-ai/agency/issues/378) plan Decision 1) and keeps the change reviewable as a single file diff.

## Phase 0: Research

See [research.md](research.md). Summary of decisions:

- **Why `--yes` + plugin-sole-gate (option A over B)**: the plugin calls the CLI through Claude Code's Bash tool, which is non-interactive and has no TTY. The CLI's stdin confirm cannot function there. `--yes` exists precisely for programmatic callers that provide their own gate — the plugin is exactly that caller. Clarification Q1.
- **Why the confirm text describes the action, not the argv**: `--yes` suppresses the CLI's own resolved preview (which would show *which* issues get assigned). The plugin's confirm therefore fires on intent, not on a preview, so it must describe *what will happen* rather than merely echoing tokens. A true preview-then-confirm requires a `--dry-run` mode on the CLI — a generacy enhancement, Out of Scope §1.
- **Why opaque pass-through for `epic-ref`**: the CLI already resolves bare numbers, `owner/repo#N`, and full URLs per [generacy#822](https://github.com/generacy-ai/generacy/issues/822). Any plugin-side parsing would duplicate that logic and create a second drift site. Assumption §3, FR-002.
- **Why one file, not six**: analogous arg-count bugs may exist in `/cockpit:next`, `/cockpit:status`, `/cockpit:merge`, etc., but each is a separate contract with its own CLI verb and its own spec-worthy question. Bundling them would enlarge the review surface and defer per-command clarification. Out of Scope §3.
- **Why MISSING_BINARY / AUTH_FAILURE / OTHER stay byte-identical**: [#378](https://github.com/generacy-ai/agency/issues/378) established a byte-identical invariant across seven files. Touching those blocks here would create silent drift that #378's grep check would only catch after the fact.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete.

Artifacts produced in this phase:

- **[contracts/queue-command.contract.md](contracts/queue-command.contract.md)** — the exact strings the rewritten `queue.md` must contain, section by section: frontmatter `arguments` block, description sentence, tokenization gate wording, `AskUserQuestion` question / options / header, Bash invocation, success header, Cancelled message, worked examples. This is the sole contract for this feature; there is no runtime API surface.
- **[quickstart.md](quickstart.md)** — a copy-paste-ready walkthrough for a maintainer to apply the seven-section rewrite and verify it before opening a PR. Written as a section-by-section replace-with checklist because the fix is prescriptive.

No `data-model.md` — see Project Structure §Documentation. No `contracts/*.openapi.yaml` or similar — the plugin exposes no API; its "contract" with users is the printed prompt copy, captured in the single Markdown contract above.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

*Empty — Constitution Check passed with no violations.*

---

*Generated by /plan for issue [generacy-ai/agency#380](https://github.com/generacy-ai/agency/issues/380)*
