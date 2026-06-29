---
description: File the speckit tasks.md as a GitHub epic + child issues, then sync the .generacy/epics/<slug>.yaml manifest.
---

# File Command

Compose `spec_kit.tasks_to_issues` and `generacy cockpit manifest sync`. This playbook owns no resolution, no parsing, and no label mutation — every responsibility is delegated to the engines.

This command is a thin orchestrator. It never resolves refs itself, never edits `tasks.md` itself, never edits `.generacy/epics/<slug>.yaml` itself, and never calls the GitHub API directly. Each responsibility is owned by a downstream primitive:

- `spec_kit.tasks_to_issues` (MCP tool, `agency-plugin-spec-kit`) — creates the GitHub parent epic and one child issue per `## Task: <id>` block in `specs/<branch>/tasks.md`, and writes the resulting `**Epic**: #<n>` header + `**Issue**: #<n>` markers back into `tasks.md`.
- `generacy cockpit manifest sync <epic-ref>` — re-parses the parent epic's body checklist and converges `.generacy/epics/<slug>.yaml` (engine contract owned by issue #790).
- The engine ref resolver — owns `owner/repo#N` ↔ bare `#N` ↔ URL normalization (shared with `commands/watch.md`).

The two engines communicate **via artifacts, not a JSON pipe** (clarification Q2): `tasks_to_issues` writes the child issue numbers into `tasks.md` and appends `· #<n>` to the parent epic's body checklist; `manifest sync` then re-parses that body to update the `.yaml`.

## Arguments

```
/cockpit:file [<epic-ref>]
/cockpit:file --help                    # explicit help
```

| Arg | Type | Required | Default | Valid values |
|-----|------|----------|---------|--------------|
| `<epic-ref>` | string | no | — | One of: bare `#N` (e.g. `351`), fully-qualified `owner/repo#N` (e.g. `generacy-ai/agency#351`), or a GitHub issue URL. Passed verbatim to the engine; ref resolution is engine-owned. |
| `--help` | flag | no | (not set) | Presence triggers Help / discovery branch. |

### Parsing rules

1. The playbook performs **zero structural validation** of `<epic-ref>` beyond the empty-vs-non-empty test.
2. If `$ARGUMENTS` is `--help` OR matches `*--help*`, branch to **Help / discovery** below and stop.
3. If `$ARGUMENTS` is empty, set `epic_ref = null` and proceed to the engine call (the engine creates a new parent unless its dedup finds one — see clarification Q5).
4. Otherwise, set `epic_ref = $ARGUMENTS` (verbatim) and pass it to the engine. The engine's ref resolver normalizes the form (matches `commands/watch.md` precedent).
5. If `$ARGUMENTS` contains an unrecognized flag (anything starting with `--` that is not `--help`), emit **Shape C** (`usage error: unknown flag '<flag>'. Run /cockpit:file --help for usage.`) and stop. Do not call any engine.

## Help / discovery

When the command is invoked with `--help`, emit the block below verbatim and stop. No file reads, no MCP calls, no shell-outs.

```
/cockpit:file — file an epic + child issues from tasks.md, then sync the epic manifest.

Usage:
  /cockpit:file [<epic-ref>]

Arguments:
  <epic-ref>  optional. Existing parent epic to reuse (recovery / idempotency).
              Forms: 351, generacy-ai/agency#351, https://github.com/.../issues/351
              Omitted → engine creates a new parent (or reuses one detected by title/marker).

Engines:
  spec_kit.tasks_to_issues   creates parent + children, writes numbers to tasks.md
  generacy cockpit manifest sync   re-parses epic body, updates .generacy/epics/<slug>.yaml

The slash command is a thin orchestrator. It does not resolve refs and does not edit
tasks.md or the .yaml itself.
```

## Instructions

1. **Validate arguments.** Parse `$ARGUMENTS`. If it is `--help` (or contains `--help`), branch to **Help / discovery** above and stop. If it contains any other `--<flag>` token, emit **Shape C** with `usage error: unknown flag '<flag>'. Run /cockpit:file --help for usage.` and stop. Otherwise extract `epic_ref` from the first positional token (may be empty).

2. **Locate `tasks.md`.** Call the `spec_kit.check_prereqs` MCP tool requiring `tasks.md`. If the tool reports the manifest is missing, emit **Shape C** with `usage error: no tasks.md in current feature branch. Run /speckit:tasks first to generate it.` and stop.

3. **Dispatch `tasks_to_issues`.** Call the `spec_kit.tasks_to_issues` MCP tool with:
   - `epic_number`: the integer parsed from `epic_ref` if non-empty; otherwise omit the field entirely (the engine will create a new parent or reuse one detected by title/marker per clarification Q5).
   - `dry_run`: `false`.
   - `feature_dir`: omit (the engine auto-detects from the current branch).
   - `grouping`: omit (the engine auto-detects from `tasks.md` labels).
   - `cwd`: omit (default).

   Surface the engine's progress output verbatim, prefixed with `[tasks_to_issues]` per D7.

4. **Check the result.** If the engine returned `success: false` OR exited non-zero:
   - Emit **Shape A** with `<step>=tasks_to_issues`, a one-line summary derived from the engine's headline (≤ 80 chars), and the engine's verbatim error output in `detail:`.
   - If the engine's payload reports that the parent epic was created but children failed mid-flight, include the parent URL (or bare `#N`) in `next:` as `/cockpit:file <parent-ref>` so the developer can re-run to reconcile.
   - Per **FR-005**, DO NOT call `manifest sync`. Stop and exit non-zero.

5. **Dispatch `manifest sync`.** Read the parent epic ref from the `tasks_to_issues` success payload. If the payload does not include it, read it from the freshly-written `**Epic**: #<n>` line at the top of `tasks.md`. Then run:

   ```bash
   generacy cockpit manifest sync <parent-ref>
   ```

   Surface output verbatim, prefixed with `[manifest sync]` per D7.

6. **Report.**
   - On success (both engines exited cleanly), emit **Shape B** with `<n>` = number of new child issues created in this invocation (zero is valid — a fully-filed re-run that converged the `.yaml`), `<parent-ref>` = bare `#N` of the parent epic, and `<yaml-path>` = the path emitted by `manifest sync` (e.g. `.generacy/epics/<slug>.yaml`).
   - On `manifest sync` failure (after `tasks_to_issues` succeeded), emit **Shape A** with `<step>=manifest sync`, the engine's verbatim error in `detail:`, and (per **FR-006**) `next: generacy cockpit manifest sync <parent-ref>` so the developer can re-run sync without re-filing issues. `tasks.md` is fully filed at this point — only the `.yaml` is stale.

## Output shapes

The playbook emits inline chat lines in three shapes. Per D7, engine output is surfaced verbatim and the playbook itself does not summarize, rewrite, or rewrap error text.

### Shape A: engine failure

```
[cockpit:file] <step>: <one-line summary>
  detail: <verbatim engine error>
  next:   <suggested recovery command>
```

| Slot | Required | Allowed values |
|------|----------|----------------|
| `<step>` | yes | `tasks_to_issues` \| `manifest sync` |
| `<one-line summary>` | yes | Free-form short phrase, ≤ 80 chars. |
| `detail:` | yes | Verbatim engine output. May span multiple lines (indent continuation lines under `detail:`). |
| `next:` | conditional | Present when FR-005 or FR-006 supplies a recovery command. Omit when no recovery is available. |

### Shape B: successful completion

```
[cockpit:file] filed <n> issue(s) under <parent-ref>; manifest synced to <yaml-path>
```

| Slot | Required | Allowed values |
|------|----------|----------------|
| `<n>` | yes | Non-negative integer. Zero is valid (full no-op re-run that still converged the `.yaml`). |
| `<parent-ref>` | yes | Bare `#N` form of the parent epic. |
| `<yaml-path>` | yes | Repo-relative path emitted by `manifest sync`, e.g. `.generacy/epics/<slug>.yaml`. |

### Shape C: validation failure (before any engine call)

```
[cockpit:file] usage error: <message>
```

Emitted only for the help / unknown-flag / missing-`tasks.md` branches. Examples:

```
[cockpit:file] usage error: unknown flag '--target'. Run /cockpit:file --help for usage.
[cockpit:file] usage error: no tasks.md in current feature branch. Run /speckit:tasks first to generate it.
```

## Notes

- **Idempotency (FR-009).** A fully-filed `tasks.md` (every `## Task: <id>` block has `**Issue**: #<n>` AND the top has `**Epic**: #<n>`) produces a `tasks_to_issues` no-op — the engine reports zero new issues. The playbook STILL runs `manifest sync` to converge the `.yaml`. Shape B reports `filed 0 issue(s)`.

- **Partial state (clarification Q3 + US2-AC3).** A `tasks.md` where some blocks have `**Issue**:` and others don't is filed by the engine for the unfiled blocks only, reusing the recorded `**Epic**:` parent. Re-running the same `/cockpit:file` command is the documented recovery path — no separate verb, no hand-edits.

- **Parent recovery (clarification Q5).** If a previous run created the parent on GitHub but crashed before recording it in `tasks.md`, `tasks_to_issues` detects the orphan parent by title or by the hidden `<!-- speckit-epic:<branch> -->` body marker and reuses it. The playbook does NOT maintain any sidecar state (no `.cockpit-file-*` files).

- **Engine handoff (clarification Q2).** The two engines communicate via artifacts only — `tasks.md` annotations and the parent epic body checklist. No JSON is piped between them. A tempfile passed as `--from <path>` is the documented fallback only; it is not used in the default flow.

- **Cross-repo (clarification Q4).** Out of scope. The `<epic-ref>` argument identifies an *existing parent epic to reuse* in the current repo — it is NOT a target override. Filing always targets the branch's `gh` remote. To file into a different repo, switch to a checkout of that repo first.

- **Engine boundaries.** This playbook does NOT:
  - Parse `<epic-ref>` beyond the empty/non-empty test (D6 — engine owns ref resolution).
  - Edit `tasks.md` directly (E2 single-writer invariant — `tasks_to_issues` owns it).
  - Edit `.generacy/epics/<slug>.yaml` directly (#790 single-writer invariant — `manifest sync` owns it).
  - Pipe JSON between the two engines (clarification Q2).
  - Maintain sidecar state for parent-epic recovery (clarification Q5).
  - Call the GitHub API or run `gh` directly — every GitHub mutation happens inside `tasks_to_issues`.
  - Mutate `phase:*` or `waiting-for:*` / `completed:*` labels — that is the cockpit orchestrator's job, not this verb's.

- **Error labeling (D7).** When either engine emits stderr or a non-zero exit, the playbook surfaces the output verbatim with a `[tasks_to_issues]` or `[manifest sync]` source prefix so the developer can tell at a glance which step failed. The playbook does not summarize or rewrap engine errors.

- **Manifest separation (clarification Q1).** The (speckit) manifest is `specs/<branch>/tasks.md` — the file with `## Task: <id>` blocks. The (epic) manifest is `.generacy/epics/<slug>.yaml` — owned by `generacy cockpit manifest sync` (#790). The two are distinct artifacts and must not be conflated.
