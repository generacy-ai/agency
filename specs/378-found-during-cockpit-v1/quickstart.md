# Quickstart: apply and verify the MISSING_BINARY remedy fix

**Feature**: 378-found-during-cockpit-v1
**Audience**: Maintainer applying the fix before opening a PR against `develop`.
**Time**: ~10 minutes (7 edits + 3 greps + 2 smoke tests).

This is not a runtime feature and has no install step. What follows is the apply-and-verify sequence.

## Prerequisites

- Local checkout of `generacy-ai/agency` on branch `378-found-during-cockpit-v1`.
- `grep` and `sort` available (any POSIX shell).
- For the cluster smoke test only: SSH into a Generacy cluster session (or replay the environment from [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88)).

## The canonical payload (copy this once)

```
The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.
```

Details on exact form (em dash, ASCII quotes, inline backticks) are in [contracts/remedy-string.contract.md](contracts/remedy-string.contract.md).

## Apply the fix (seven files, eight edits)

### Edit 1 — `packages/claude-plugin-cockpit/README.md` § Installation (line 24)

Replace:

```markdown
- `generacy` CLI (`npm install -g @generacy-ai/cli` or the prevailing install command).
```

with:

```markdown
- `generacy` CLI (`npm install -g @generacy-ai/generacy` or the prevailing install command). See § Error Handling / `MISSING_BINARY` for the cluster-session PATH remedy.
```

### Edit 2 — `packages/claude-plugin-cockpit/README.md` § Error Handling → `MISSING_BINARY`

Replace the current fenced code block content:

```
The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.
```

with the canonical payload from §The canonical payload above. Keep the surrounding fenced code block markers — only the fence *content* changes.

### Edits 3–8 — the six `commands/*.md` files

For each of `packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md`, find the `MISSING_BINARY` list item. It currently reads:

```markdown
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`
```

Replace with (single line — no wrap in your editor):

```markdown
- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print: `The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install it with \`npm install -g @generacy-ai/generacy\`.`
```

**Note on backtick escaping:** because the outer `Print: \`...\`` wrapper is itself an inline code span, the two nested backtick spans inside the payload are escaped with backslashes (`` \` ``). This is a Markdown authoring detail, not part of the byte-identical payload — the *rendered* text and the *printed* text is the payload from §The canonical payload above. Verify by rendering one command file locally and comparing against README.

## Verify (three greps)

Run from the repo root. All three must pass.

### V1 — no stale package name (SC-001, FR-004)

```bash
grep -r "@generacy-ai/cli" packages/claude-plugin-cockpit/
```

Expected: no output. Any hit is a miss to fix.

### V2 — payload distinctive fragment appears exactly seven times (SC-002)

```bash
grep -rc "In a Generacy cluster session it is already installed" packages/claude-plugin-cockpit/ \
  | awk -F: '{s+=$2} END {print s}'
```

Expected: `7` (one from README, six from `commands/*.md`).

### V3 — payload is byte-identical across all seven files (US3 acceptance)

```bash
grep -rho "The generacy CLI is required but is not on \$PATH\. In a Generacy cluster session[^\`]*generacy\`\." packages/claude-plugin-cockpit/ \
  | sort -u \
  | wc -l
```

Expected: `1` (a single unique payload line across all files). `2+` means at least two files' payloads differ.

## Smoke test (two scenarios)

### Cluster scenario (SC-003, US1)

1. Open a Generacy cluster session where the CLI is installed under `/shared-packages/node_modules/.bin` but is not on `$PATH`. Confirm with `command -v generacy` (should print nothing) and `ls /shared-packages/node_modules/.bin/generacy` (should print a path).
2. Run any `/cockpit:*` command (e.g. `/cockpit:status`). Confirm the printed remedy names `/shared-packages/node_modules/.bin` and offers the `export PATH="..."` fix.
3. Copy-paste that `export PATH` line into the shell, then re-run the same `/cockpit:*` command.
4. **Pass criterion:** the command runs without any `npm install` step. No 404. No "please install globally" instruction was followed.

### Standalone scenario (SC-004, US2)

1. Open a non-cluster shell (local dev machine, no `/shared-packages` directory) with no generacy CLI installed. Confirm with `command -v generacy` (nothing) and `ls /shared-packages` (should not exist or be empty).
2. Run any `/cockpit:*` command. Confirm the printed remedy contains `npm install -g @generacy-ai/generacy` as a fallback.
3. Copy-paste `npm install -g @generacy-ai/generacy` verbatim.
4. **Pass criterion:** npm resolves and installs the package. No 404.

## Open the PR

Once V1/V2/V3 all pass and both smoke tests pass:

```bash
git add packages/claude-plugin-cockpit/README.md packages/claude-plugin-cockpit/commands/
git status  # should show exactly 7 modified files, all under packages/claude-plugin-cockpit/
git commit -m "fix: #378 correct MISSING_BINARY remedy — name real package, lead with cluster PATH fix"
git push -u origin 378-found-during-cockpit-v1
gh pr create --base develop --title "fix: #378 correct MISSING_BINARY remedy" --body "..."
```

## Troubleshooting

**V1 still shows a hit** — a copy of `@generacy-ai/cli` is left somewhere. Run `grep -rn "@generacy-ai/cli" packages/claude-plugin-cockpit/` (with `-n` for line numbers) and edit the flagged file.

**V2 reports fewer than 7** — a command file did not get the new payload, or its distinctive fragment was mistyped. Run `grep -rl "In a Generacy cluster session" packages/claude-plugin-cockpit/` to see which files did land; edit the missing one.

**V2 reports more than 7** — the payload was pasted into a file outside the seven anchor points (e.g. another `.md` in the package). Grep and remove.

**V3 reports 2+** — the payload differs across files (whitespace, quotes, dashes). Common culprits: smart quotes from paste, an en dash instead of em dash, or a stray trailing space. Diff two of the files' payload lines side by side to find the delta.

**Cluster smoke test still runs `npm install`** — the reader followed the "Standalone:" line even though `/shared-packages/node_modules/.bin` had the binary. Check the ordering of the payload — cluster remedy must appear *before* the "Standalone:" label.

**Standalone smoke test 404s** — the payload has `@generacy-ai/cli` instead of `@generacy-ai/generacy`. Re-run V1; it will surface it.
