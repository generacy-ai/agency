# Quickstart: apply and verify the `/cockpit:queue` two-argument rewrite

**Feature**: 380-found-during-cockpit-v1
**Audience**: Maintainer applying the fix before opening a PR against `develop`.
**Time**: ~15 minutes (single-file rewrite + 3 greps + 1 smoke test + 3 usage checks).

This is not a runtime feature and has no install step. What follows is the apply-and-verify sequence.

## Prerequisites

- Local checkout of `generacy-ai/agency` on branch `380-found-during-cockpit-v1`.
- `grep` available (any POSIX shell).
- For the smoke test only: a Claude Code session with the `@generacy-ai/claude-plugin-cockpit` plugin installed (locally linked from this checkout, or installed from a preview publish) and the `generacy` CLI on `$PATH` — see [`README.md § Installation`](../../packages/claude-plugin-cockpit/README.md). Plus write access to `christrudelpw/sniplink` (or a comparable test epic).

## Overview of the change

One file, seven sections rewritten:

1. **Frontmatter** — add `epic-ref` as the first `arguments:` entry; keep `phase` as the second.
2. **Description sentence** — swap `<phase>` for `<epic-ref> <phase>` and add the "assign + label" action summary.
3. **Instructions §1 (tokenization gate)** — 1-token → 2-token gate; new `Usage:` line.
4. **Instructions §2 (`AskUserQuestion`)** — new question text (action-describing); Confirm option description mentions `--yes`.
5. **Instructions §3 (Cancelled message)** — includes both tokens.
6. **Instructions §4 (Bash invocation)** — adds `<epic-ref>`, adds `--yes`, adds an inline `<!-- ... -->` note explaining why.
7. **Instructions §5 (success header)** — `**Queued:** <phase> (<epic-ref>)`.
8. **Examples** — rewritten to a two-arg worked case and a wrong-count usage case.

The MISSING_BINARY / AUTH_FAILURE / OTHER block (Instructions §4 error handling) is **NOT** touched — see [contracts/queue-command.contract.md §8](contracts/queue-command.contract.md#§8-error-handling-block-unchanged-from-current-file).

## Apply the fix

The canonical string content for each section is in [`contracts/queue-command.contract.md`](contracts/queue-command.contract.md). Open that file and the current `packages/claude-plugin-cockpit/commands/queue.md` side by side, then perform the eight edits below.

### Edit 1 — Frontmatter (top of file)

Replace the current frontmatter (lines 1–7):

```yaml
---
description: Queue a phase for the current epic after explicit confirmation
arguments:
  - name: phase
    description: "Phase identifier to queue. Opaque to this command; run `generacy cockpit queue --help` for the authoritative phase enum."
    required: true
---
```

with the block from [contract §1](contracts/queue-command.contract.md#§1-frontmatter). Note the two-entry `arguments:` block with `epic-ref` first.

### Edit 2 — Description sentence (line 11)

Replace the paragraph starting `Confirm-gated wrapper over ...` with the string from [contract §2](contracts/queue-command.contract.md#§2-description-sentence-h1-body).

### Edit 3 — Instructions §1 (tokenization gate, lines 21–24)

Replace the three-bullet gate block (`If zero tokens`, `If two or more tokens`, `If exactly one token`) with the two-bullet gate block from [contract §3](contracts/queue-command.contract.md#§3-tokenization-gate-instructions-§1). The new gate rejects zero, one, and three-plus tokens with the same `Usage: /cockpit:queue <epic-ref> <phase>` line.

### Edit 4 — Instructions §2 (`AskUserQuestion`, lines 25–31)

Replace the `question:` line ``Run `generacy cockpit queue <phase>`?`` with the action-describing question from [contract §4](contracts/queue-command.contract.md#§4-confirmation-gate-instructions-§2). Also change the Confirm option's description from `"Run the CLI"` to `"Run the CLI with --yes"`. `header`, `multiSelect`, option order all unchanged.

### Edit 5 — Instructions §3 (Cancelled message, line 32)

Replace `Cancelled: /cockpit:queue <phase>` with `Cancelled: /cockpit:queue <epic-ref> <phase>` (both tokens interpolated). Full block in [contract §5](contracts/queue-command.contract.md#§5-affirmative-test--cancelled-message-instructions-§3).

### Edit 6 — Instructions §4 (Bash invocation, line 33)

Replace `run \`generacy cockpit queue <phase>\` via the Bash tool` with `run \`generacy cockpit queue <epic-ref> <phase> --yes\` via the Bash tool`. Also add the inline HTML comment documenting the `--yes` policy immediately after "Pass no flags." (or as a replacement for it — see [contract §6](contracts/queue-command.contract.md#§6-cli-invocation-instructions-§4-and-inline---yes-note); the previous "Pass no flags." sentence is now false and must be replaced by the note).

### Edit 7 — Instructions §5 (success header, line 34)

Replace `Print the single header line \`**Queued:** <phase>\`` with `Print the single header line \`**Queued:** <phase> (<epic-ref>)\``.

### Edit 8 — Examples (lines 47–49)

Replace both example paragraphs with the two-paragraph block from [contract §9](contracts/queue-command.contract.md#§9-examples-section). The primary example changes from `plan` (single arg) to `1 P1` (two args); the zero-arg example's `Usage:` line updates to the new form.

## Verify (three greps)

Run from the repo root. All three must pass.

### V1 — new usage line is present in the gate and examples (FR-002, FR-009)

```bash
grep -c "Usage: /cockpit:queue <epic-ref> <phase>" packages/claude-plugin-cockpit/commands/queue.md
```

Expected: `2` or more (once in the gate at Instructions §1, once in the Examples section).

### V2 — CLI invocation carries both positionals AND `--yes` (FR-005, FR-008)

```bash
grep -c "generacy cockpit queue <epic-ref> <phase> --yes" packages/claude-plugin-cockpit/commands/queue.md
```

Expected: `1` or more (Instructions §4; Examples section may repeat `generacy cockpit queue 1 P1 --yes` — that repetition is fine).

### V3 — no stale one-argument surface remains (FR-002, FR-006, FR-009)

```bash
grep -n "Usage: /cockpit:queue <phase>" packages/claude-plugin-cockpit/commands/queue.md
grep -n 'Run `generacy cockpit queue <phase>`' packages/claude-plugin-cockpit/commands/queue.md
grep -nE "\\*\\*Queued:\\*\\* <phase>[^ ]" packages/claude-plugin-cockpit/commands/queue.md
grep -n 'Cancelled: /cockpit:queue <phase>[^ ]' packages/claude-plugin-cockpit/commands/queue.md
```

Expected: no output from any of the four. Any hit is stale copy from the pre-fix file that must be edited.

### V4 (bonus) — error-handling block byte-identical with a sibling command (FR-007)

```bash
diff \
  <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/queue.md) \
  <(sed -n '/<!-- BEGIN error-conv -->/,/<!-- END error-conv -->/p' packages/claude-plugin-cockpit/commands/status.md)
```

Expected: no output (the two blocks are byte-identical). Any diff means an accidental edit inside the untouched zone — revert.

## Smoke test

### US1 primary path (SC-001, SC-002)

Replay [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6:

1. In a Claude Code session with the plugin installed and `generacy` on `$PATH`, `cd` to the `christrudelpw/sniplink` checkout on a branch with the phase-1 issues open.
2. Run `/cockpit:queue 1 P1`.
3. **Pass criterion (SC-001):** the session shows the `AskUserQuestion` gate with the question ``Assign phase `P1`'s issues of `1` to the cluster account and add label `process:speckit-feature`?``. NO usage error at step 1.
4. Select `Confirm`.
5. **Pass criterion (SC-002):** the CLI runs to completion; stdout appears under `**Queued:** P1 (1)` in a fenced block. Then:
   ```bash
   gh issue list --repo christrudelpw/sniplink --label process:speckit-feature --assignee @me
   ```
   Expected: three P1 issues listed, all assigned to `@me` and carrying the `process:speckit-feature` label.
6. Also verify Cancel path: re-run `/cockpit:queue 1 P1` and select `Cancel`. Expected single-line output: `Cancelled: /cockpit:queue 1 P1`. No CLI invocation (confirm via `gh issue list` — assignee/label state is unchanged).

### US2 usage-line paths (SC-003)

Three invocations from the same session:

- `/cockpit:queue` → expect literal line `Usage: /cockpit:queue <epic-ref> <phase>`. No `AskUserQuestion` prompt. No CLI call.
- `/cockpit:queue P1` → same usage line. No prompt. No CLI call.
- `/cockpit:queue 1 P1 extra` → same usage line. No prompt. No CLI call.

### SC-004 error-class parity (spot-check)

- **MISSING_BINARY**: in a shell where `generacy` is NOT on `$PATH`, run `/cockpit:queue 1 P1` and select `Confirm`. Expected: the printed remedy matches `packages/claude-plugin-cockpit/README.md § Error Handling § MISSING_BINARY` verbatim (i.e. the [#378](https://github.com/generacy-ai/agency/issues/378) fix is intact).
- **AUTH_FAILURE**: set `GH_TOKEN=""` (or invalidate the current token via `gh auth logout`), then run `/cockpit:queue 1 P1` → `Confirm`. Expected: `Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.`
- **OTHER**: contrive any other CLI failure (e.g. pass a nonexistent phase like `/cockpit:queue 1 ZZ`). Expected: `CLI failed with exit code <N>.` followed by stderr in a fenced block.

## Open the PR

Once V1–V4 all pass, the US1 smoke test passes, and the three US2 usage checks + three SC-004 error checks all pass:

```bash
git add packages/claude-plugin-cockpit/commands/queue.md
git status  # should show exactly 1 modified file, under packages/claude-plugin-cockpit/commands/
git commit -m "fix: #380 align /cockpit:queue slash command to two-argument CLI contract"
git push -u origin 380-found-during-cockpit-v1
gh pr create --base develop \
  --title "fix: #380 align /cockpit:queue slash command to two-argument CLI contract" \
  --body "..."
```

The PR body should reference the spec, the clarification (Q1 → `--yes` policy), and link to [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) finding #6.

## Troubleshooting

**V1 reports fewer than 2** — the tokenization gate or the Examples section still has the old `<phase>` form. Run `grep -n "Usage: /cockpit:queue" packages/claude-plugin-cockpit/commands/queue.md` and inspect each line.

**V2 reports 0** — the invocation string is missing `<epic-ref>`, missing `--yes`, or both. Re-open Edit 6.

**V3 finds hits** — old copy leaked through. Each of the four greps points at a specific pre-fix line; edit that line to match the corresponding contract section.

**V4 diffs non-empty** — the error-handling block was edited inadvertently. Copy the block byte-for-byte from `commands/status.md` (or any sibling) to restore the invariant established by [#378](https://github.com/generacy-ai/agency/issues/378).

**Smoke test hits usage error at step 3** — the gate is rejecting a two-token input. Common cause: extra whitespace in `$ARGUMENTS`. Confirm by running the tokenization mentally on the exact input; if two clean tokens are present, re-check Edit 3.

**Smoke test hangs after `Confirm`** — the CLI is prompting on stdin (`--yes` was not passed). Re-check Edit 6; V2 should have caught this.

**Post-Confirm CLI succeeds but `gh issue list` shows fewer than 3 assigned issues** — that is a CLI-side behavior, not a plugin bug. File separately against `generacy-ai/generacy` and reference [generacy#822](https://github.com/generacy-ai/generacy/issues/822) for epic-ref resolution.
