# Quickstart: /cockpit:merge command

**Feature**: 355-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This quickstart covers two audiences:
1. **Implementers** — how to land the `merge.md` slash command in this repo.
2. **End users** — how to install and use `/cockpit:merge` once it ships.

---

## For implementers (landing the command)

### Prerequisites

- The `claude-plugin-cockpit` scaffold from #350 is landed (already on `develop`).
- Issue #789 (the `generacy cockpit merge` CLI verb) is sufficiently scoped that the JSON contract in `contracts/merge-cli.contract.md` is accurate — or, if not, you treat the contract as the agreement and flag divergence to the user.
- Issue #788 (the shared resolver) has a documented invocation pattern — or you stub one and surface the dependency.

### 1. Create the command file

```bash
touch packages/claude-plugin-cockpit/commands/merge.md
```

### 2. Author the frontmatter and prompt body

Frontmatter (use the shape from `contracts/slash-command.contract.md`):

```yaml
---
description: Merge a PR via the cockpit CLI; spawn a fixer subagent on red checks and re-evaluate, up to a bounded number of attempts. Never merges on red.
arguments:
  - name: ref
    description: Issue or epic reference (resolved via the shared resolver to a single PR)
    required: true
  - name: --no-fix
    description: Stop on red instead of spawning the fixer (green PRs still merge)
    required: false
  - name: --max-fix-attempts
    description: Maximum fixer passes before stopping with the most recent red status (default 1)
    required: false
---
```

Prompt body structure (mirrors `packages/claude-plugin-agency-spec-kit/commands/specify.md`):

1. **Parse arguments**: extract `ref`, `--no-fix`, `--max-fix-attempts` (default `1`). Reject `--max-fix-attempts <= 0`.
2. **Resolve `ref`** via the #788 resolver → `{ repo, pr_number, head_ref }`.
3. **Initialize loop state**: `attempts = 0`.
4. **Loop**:
   - Call `Bash`: `generacy cockpit merge <resolved-ref>`. Capture stdout, parse as JSON.
   - Switch on `result`:
     - `"merged"` → emit `Merged ✓ — <repo>#<pr>`; exit `0`.
     - `"red"` →
       - If `--no-fix`: emit `Stopped: red (--no-fix) — <reason> (<check names>)`; exit non-zero.
       - If `attempts >= max-fix-attempts`: emit `Stopped: red after <N> fix attempt(s) — <reason> (<check names>)`; exit non-zero.
       - Otherwise: emit `Spawning fixer (attempt <attempts+1>/<max>)`; spawn fixer via Task tool with the E3 payload; on return, increment `attempts`; emit `Fixer returned; re-evaluating…`; continue loop.
     - `"blocked"` → emit `Stopped: <reason> — <actionable next step>`; exit non-zero.
     - anything else → emit `Stopped: unknown CLI result — report to #355`; exit non-zero.

### 3. Validate

```bash
# Loader sanity: the file must be picked up by the cockpit namespace
ls packages/claude-plugin-cockpit/commands/merge.md

# Frontmatter parses as YAML
node -e "const m=require('fs').readFileSync('packages/claude-plugin-cockpit/commands/merge.md','utf8'); const fm=m.split('---')[1]; require('child_process').execSync('node -e \"require(\\'js-yaml\\').load(process.argv[1])\" -- \"'+fm.replace(/\"/g,'\\\"')+'\"')" 2>/dev/null && echo OK || echo "(skip if js-yaml not installed)"

# Isolation check: no other files in the repo were modified
git status --porcelain | grep -v '^?? specs/355-' | grep -v 'packages/claude-plugin-cockpit/commands/merge.md'
# (should print nothing)
```

### 4. Smoke test (manual)

Install the plugin in a Claude Code environment, then run:

```
/cockpit:merge <issue-with-green-approved-PR>      # expect Merged ✓
/cockpit:merge <issue-with-red-PR>                 # expect fixer spawn + re-eval
/cockpit:merge <red-PR> --no-fix                   # expect terse red report, no fixer
/cockpit:merge <pending-PR>                        # expect Stopped: pending, no fixer
/cockpit:merge <draft-PR>                          # expect Stopped: draft, no fixer
/cockpit:merge <unapproved-PR>                     # expect Stopped: missing-approval
/cockpit:merge <red-PR> --max-fix-attempts=3       # expect up to 3 fixer passes
```

### 5. Commit

```bash
git add packages/claude-plugin-cockpit/commands/merge.md specs/355-epic-generacy-ai-tetrad
git commit -m "feat(cockpit): /cockpit:merge command with fixer subagent loop (#355)"
```

---

## For end users (using `/cockpit:merge`)

### Prerequisites

- The cockpit plugin is installed (see `packages/claude-plugin-cockpit/README.md`).
- The `generacy` CLI is installed and on PATH; `generacy cockpit merge` runs without error.
- You're invoking from an orchestrator session (the command does not infer a PR from the current branch).

### Basic usage

Merge a PR by issue reference:

```
/cockpit:merge 355
```

The command will:
1. Resolve `355` to a single PR.
2. Call `generacy cockpit merge` to attempt the merge.
3. If checks are red, spawn a fixer subagent, then re-attempt.
4. Report the outcome.

### Dry-run / inspect a red PR

Use `--no-fix` to see *why* a PR is red without spending fixer-tokens:

```
/cockpit:merge 355 --no-fix
```

You'll get a terse report naming the failing checks; the PR is not modified.

### Allow multiple fix attempts

If a single fix pass is likely to be only partial progress, raise the cap:

```
/cockpit:merge 355 --max-fix-attempts=3
```

The command stops at `merged` or at the cap, whichever comes first.

---

## Troubleshooting

### `Stopped: pending — …`
The PR has running checks. Use `/cockpit:watch <ref>` (#787) — it re-triggers merge when checks resolve. Don't re-invoke `merge` manually in a loop.

### `Stopped: missing-approval — …`
Get a human reviewer's approval. The command will never auto-approve.

### `Stopped: missing-label — …`
Add the workflow label called out in the report. Then re-invoke.

### `Stopped: draft — …`
Mark the PR ready for review (`gh pr ready <pr>` or via the GitHub UI), then re-invoke.

### `Stopped: red after N fix attempt(s) — …`
The fixer couldn't get checks green within the configured cap. Inspect the named failing checks manually, or rerun with a higher `--max-fix-attempts`. If repeated runs hit the cap, the underlying problem likely needs human intervention.

### `Stopped: unknown CLI result — report to #355`
The CLI returned a `result` or `reason` outside the closed set this command was authored against. The CLI's contract probably grew — open a comment on #355 with the literal CLI output.

### Resolver finds no PR / multiple PRs
You passed a `ref` that doesn't disambiguate to one open PR. Use a more specific reference (e.g., the explicit `owner/repo#number` form), or check the resolver docs (#788).

### Fixer subagent runs but never returns
That's a `cockpit-fixer` (or the inline fixer-prompt) bug, not a `merge` bug. The command's loop is bounded by `--max-fix-attempts`, but individual subagent calls can stall on their own. If you see this, cancel the slash command and file an issue against the fixer.
