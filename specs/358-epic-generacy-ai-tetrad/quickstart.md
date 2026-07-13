# Quickstart: `/cockpit:file`

**Feature**: 358-epic-generacy-ai-tetrad
**Date**: 2026-06-29

Two audiences:

1. **Implementers** — how to land `commands/file.md` and verify it locally.
2. **End users** — how to use `/cockpit:file` once it ships.

---

## For implementers (landing the playbook)

### 1. Confirm dependencies are in place

```bash
# spec_kit.tasks_to_issues MCP tool exists in the workspace
test -f packages/agency-plugin-spec-kit/src/tools/tasks-to-issues.ts && echo OK

# generacy CLI is on PATH (will be installed via #790)
command -v generacy >/dev/null && echo OK || echo "generacy not installed yet — playbook will still ship, but smoke test is blocked"

# cockpit plugin scaffold from #350 is present
test -d packages/claude-plugin-cockpit/commands && echo OK
```

If `generacy` is not yet available, you can still land the playbook — its install-time validation is just markdown lint.

### 2. Write `commands/file.md`

Create `packages/claude-plugin-cockpit/commands/file.md` with this top-level shape (full prose lives in the file itself — this is the skeleton):

```markdown
---
description: File the speckit tasks.md as a GitHub epic + child issues, then sync the .generacy/epics/<slug>.yaml manifest.
---

# File Command

Compose `spec_kit.tasks_to_issues` and `generacy cockpit manifest sync`. This playbook
owns no resolution, no parsing, and no label mutation — every responsibility is delegated
to the engines.

## Arguments

`/cockpit:file [<epic-ref>]`

- `<epic-ref>` optional. Existing parent epic to reuse (recovery / idempotency).
  Forms: bare `#N`, `owner/repo#N`, or GitHub issue URL.
  Passed verbatim to the engine; ref resolution is engine-owned.

## Instructions

1. **Validate arguments.** Parse `$ARGUMENTS`. If `--help`, branch to Help / discovery
   and stop. Otherwise extract `epic_ref` (may be empty).

2. **Locate `tasks.md`.** Call `spec_kit.check_prereqs` requiring `tasks.md`. If
   missing, emit Shape C (usage error: "no tasks.md in current feature branch") and
   stop.

3. **Dispatch `tasks_to_issues`.** Call the `spec_kit.tasks_to_issues` MCP tool with:
   - `epic_number`: `epic_ref` if non-empty, else omit (engine will create or dedup).
   - `dry_run`: `false`.
   - `feature_dir`: omit (engine auto-detects from branch).
   - `cwd`: omit (default).

   Surface the engine's progress output verbatim.

4. **Check the result.** If the engine returned `success: false`, emit Shape A with
   `<step>=tasks_to_issues`, the engine's `error.message` as `detail:`, and (per
   FR-005) DO NOT proceed to step 5. Stop and exit non-zero. If the engine reported
   that the parent epic was created but some children failed, include the parent
   URL in `next:` so the developer can re-run `/cockpit:file <parent-url>` to
   reconcile.

5. **Dispatch `manifest sync`.** Read the parent epic ref from the engine's success
   payload (or from the freshly-written `**Epic**: #<n>` line in `tasks.md` if the
   payload doesn't include it). Run:

   ```bash
   generacy cockpit manifest sync <parent-ref>
   ```

   Surface output verbatim.

6. **Report.** If both engines succeeded, emit Shape B with `<n>` = new issues
   created, `<parent-ref>` = bare `#N`, `<yaml-path>` = path emitted by
   `manifest sync`. If step 5 failed, emit Shape A with `<step>=manifest sync` and
   (per FR-006) put `generacy cockpit manifest sync <parent-ref>` in `next:` so the
   developer can re-run sync without re-filing issues.

## Notes

- **Idempotency.** A fully-filed `tasks.md` (every `## Task:` block has `**Issue**: #<n>`
  and the top has `**Epic**: #<n>`) produces a `tasks_to_issues` no-op. The playbook
  STILL runs `manifest sync` to converge the `.yaml` (FR-009 + clarification Q3 limit case).
- **Partial state.** A `tasks.md` where some blocks have `**Issue**:` and others don't
  is filed by the engine for the unfiled blocks only, reusing the recorded `**Epic**:`.
  Re-running the same `/cockpit:file` command is the recovery path (US2-AC3).
- **Parent recovery.** If a previous run created the parent on GitHub but crashed
  before recording it in `tasks.md`, the engine detects the orphan parent via the
  `<!-- speckit-epic:<branch> -->` body marker and reuses it (clarification Q5).
  The playbook does NOT maintain sidecar state.
- **Cross-repo.** Out of scope. The `<epic-ref>` argument is not a target override
  (clarification Q4). Filing always targets the current branch's `gh` remote.
- **Engine boundaries.** The playbook does not parse refs, does not edit `tasks.md`,
  does not edit the `.yaml`, and does not call the GitHub API directly.
```

(Full prose — including the help text from `contracts/file-command.schema.md` and the
error envelope details — fills this skeleton out to ~150–200 lines. Use `commands/watch.md`
as the style guide.)

### 3. Lint and load

```bash
# Markdown lint (project default)
pnpm exec markdownlint packages/claude-plugin-cockpit/commands/file.md || true

# Confirm Claude Code's plugin loader registers the command
# (in Claude Code, run /help and verify /cockpit:file appears)
```

### 4. Smoke test (golden path)

```bash
# On a feature branch that has a populated tasks.md and NO **Epic**: line yet
git checkout 999-some-feature-branch
ls specs/999-some-feature-branch/tasks.md
```

In Claude Code:

```
/cockpit:file
```

Expected:

- A new parent epic is created on the repo's GitHub remote.
- `specs/999-some-feature-branch/tasks.md` now starts with `**Epic**: #<n>`.
- Every `## Task: <id>` block now has a `**Issue**: #<n>` line.
- `manifest sync` runs and prints the `.yaml` path it updated.
- The playbook emits Shape B (the success report line).

### 5. Smoke test (idempotency)

Immediately re-run:

```
/cockpit:file
```

Expected:

- `tasks_to_issues` reports zero new issues (FR-009 no-op).
- `manifest sync` runs anyway and reports the `.yaml` is unchanged (or trivially re-converged).
- Shape B reports `filed 0 issue(s)`.

### 6. Smoke test (partial recovery, clarification Q3)

Manually delete the `**Issue**: #<n>` line from ONE task block (simulating a crash mid-run):

```bash
sed -i '/^\*\*Issue\*\*: #/d' specs/.../tasks.md   # crude; adjust to keep most
```

Re-run:

```
/cockpit:file
```

Expected:

- `tasks_to_issues` files ONE new issue for the unfiled block; skips the rest.
- Parent epic is reused (no duplicate parent created).
- `manifest sync` updates the `.yaml`.
- Shape B reports `filed 1 issue(s)`.

### 7. Smoke test (FR-005 / FR-006 failure paths)

For FR-005 (tasks_to_issues fails): temporarily set `GH_TOKEN=invalid` and rerun. Expected:

```
[cockpit:file] tasks_to_issues: GitHub CLI not authenticated
  detail: <verbatim gh error>
```

No `manifest sync` call.

For FR-006 (manifest sync fails after tasks_to_issues succeeds): rename `generacy` on
PATH or pass an invalid `--<flag>` (engine-side). Expected:

```
[cockpit:file] manifest sync: <reason>
  detail: <verbatim engine error>
  next:   generacy cockpit manifest sync #<parent>
```

`tasks.md` is fully filed; `.yaml` is stale. The developer's next step is the printed `next:` command.

### 8. Commit

```bash
git add packages/claude-plugin-cockpit/commands/file.md
git commit -m "feat(cockpit): /cockpit:file — orchestrate tasks_to_issues + manifest sync (#358)"
```

---

## For end users

### Prerequisites

- The `cockpit` plugin (`/cockpit` namespace) is installed (see issue #350 README).
- The `agency-spec-kit` plugin is installed (provides `spec_kit.tasks_to_issues`).
- `gh` CLI is authenticated against the current repo's GitHub remote.
- `generacy` CLI is installed and on PATH (ships with issue #790).
- You are on a feature branch with a populated `specs/<branch>/tasks.md`.

### Golden path

```
/cockpit:file
```

- Creates a parent epic on the current repo's GitHub remote.
- Creates one child issue per `## Task:` block in `tasks.md`.
- Records `**Epic**: #<n>` and `**Issue**: #<n>` annotations in `tasks.md`.
- Runs `generacy cockpit manifest sync <parent-ref>` to update `.generacy/epics/<slug>.yaml`.
- Prints a one-line success report.

### Re-running

`/cockpit:file` is idempotent. Re-running on a fully-filed `tasks.md` does no GitHub
writes and just re-converges the `.yaml`. Re-running on a partial `tasks.md` (some
blocks filed, some not) files only the missing ones and reuses the parent.

### Reusing a specific parent

If you know the parent epic already exists (e.g. you created it manually, or a previous
run crashed):

```
/cockpit:file 351
/cockpit:file generacy-ai/agency#351
/cockpit:file https://github.com/generacy-ai/agency/issues/351
```

All three forms are equivalent — the engine resolver normalizes them. The provided
parent is reused; no new parent is created.

---

## Troubleshooting

### "no tasks.md in current feature branch"

You're either not on a feature branch or `/speckit:tasks` hasn't been run yet. Run
`/speckit:tasks` first to generate the manifest.

### "GitHub CLI not authenticated"

Run `gh auth login` and re-invoke `/cockpit:file`. No partial state is left behind.

### "parent epic created at <url> but children failed mid-flight"

This is a partial-state failure (FR-005). Re-run `/cockpit:file <url>` (passing the parent
URL as the argument). The engine reuses the parent and files only the missing children.

### "tasks_to_issues succeeded but manifest sync failed"

The engine wrote all issue numbers to GitHub and `tasks.md` — only the `.yaml` is stale.
Re-run the command printed in the `next:` line. No re-filing happens.

### "duplicate parent epic was created"

Indicates the engine's title/marker dedup (clarification Q5) didn't fire. File an
engine bug against `tasks_to_issues` (issue A1.4 area). As a workaround, close the
duplicate parent on GitHub and re-run `/cockpit:file <surviving-parent-url>`.

### "cross-repo filing"

Out of scope (clarification Q4). The `<epic-ref>` argument identifies an existing
parent to reuse in the current repo — it does NOT redirect filing to another repo.
To file into a different repo, switch branches to a checkout of that repo first.
