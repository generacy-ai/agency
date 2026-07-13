## Implementation Plan: `/cockpit:file` slash command

**Feature**: A4.3 — `/cockpit:file` thin orchestrator that files an epic + child issues from a speckit `tasks.md` and then syncs the `.generacy/epics/<slug>.yaml` epic manifest
**Branch**: `358-epic-generacy-ai-tetrad`
**Date**: 2026-06-29
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) Batch 1
**Status**: Complete

## Summary

Ship a single markdown playbook at `packages/claude-plugin-cockpit/commands/file.md`. The playbook composes two existing engine commands:

1. **`spec_kit.tasks_to_issues`** (MCP tool in `agency-plugin-spec-kit`) — creates the GitHub parent epic and one issue per task block in `specs/<branch>/tasks.md`, recording `**Issue**: #<n>` per `## Task: <id>` block and `**Epic**: #<n>` at the top.
2. **`generacy cockpit manifest sync <epic-ref>`** (engine command shipped in issue #790) — re-parses the parent epic's body and updates `.generacy/epics/<slug>.yaml`.

The two engines communicate **via artifacts** (`tasks.md` and the epic body checklist) — not a JSON pipe (clarification Q2). The playbook orchestrates: it parses arguments, dispatches the MCP tool, then spawns `manifest sync`, and surfaces the recovery hints required by FR-005 and FR-006.

This issue ships **no new code** in `agency-plugin-spec-kit` and **no changes** to `generacy cockpit manifest sync`. Engine idempotency (Q5 — detect already-created parent by title or hidden HTML marker) is a separate engine concern; this issue documents the requirement so the engine work that ships in parallel can satisfy it.

## Technical Context

**Language/Version**: Markdown (the slash command file is a `.md` playbook executed by the Claude Code plugin loader)
**Primary Dependencies**:
- `claude-plugin-agency-spec-kit` ships the `spec_kit.tasks_to_issues` MCP tool — must be installed in the same Claude Code environment.
- `generacy` CLI must be on `PATH` and provide `cockpit manifest sync` (issue #790).
- `gh` CLI must be authenticated against the current repo's GitHub remote.
**Storage**: Repository files only — `tasks.md` and `.generacy/epics/<slug>.yaml` are the only artifacts mutated. No sidecar state (clarification Q5: A — engine-side dedup, not wrapper-side sidecar).
**Testing**: Manual — install the cockpit plugin, run `/cockpit:file` against a feature branch with a clean `tasks.md`, verify (a) parent epic created, (b) one issue per task block, (c) numbers written to `tasks.md`, (d) `.yaml` updated. Re-run to confirm idempotency (FR-009).
**Target Platform**: Claude Code (any OS) with `gh`, `generacy`, and the `agency-spec-kit` MCP server available.
**Project Type**: Static-asset plugin (markdown playbook; the `claude-plugin-cockpit` package scaffold landed in #350).
**Performance Goals**: N/A — this is a developer-facing CLI orchestrator. Latency is dominated by `gh api` calls in `tasks_to_issues`.
**Constraints**:
- Owns only `packages/claude-plugin-cockpit/commands/file.md` (per spec isolation line). Must not touch the engine code or the `manifest sync` implementation.
- Must not introduce a sidecar file for parent-epic recovery (clarification Q5: A).
- Must not pipe JSON between the engines (clarification Q2: artifacts only).
- Must not implement cross-repo target override (clarification Q4: the epic arg is a parent-to-reuse, not a target override).
- Must not perform ref resolution itself — matches the watch.md precedent of "engine is the resolver."
**Scale/Scope**: 1 new file (`commands/file.md`), ~200 lines of playbook prose. No package metadata changes — the cockpit plugin's manifest already discovers `commands/*.md` automatically.

## Constitution Check

No `.specify/memory/constitution.md` is present in the repo — no gates apply.

## Dependencies & Assumptions

| # | Dependency | Status in this issue |
|---|-----------|----------------------|
| D1 | `spec_kit.tasks_to_issues` MCP tool already exists in `agency-plugin-spec-kit` (see `packages/agency-plugin-spec-kit/src/tools/tasks-to-issues.ts`) | ✅ Verified — currently supports parent-epic linking via `epic_number`, dry-run, dedup by title. |
| D2 | `generacy cockpit manifest sync <epic-ref>` engine command exists | ⚠️ Tracked in #790. This issue assumes the command exists or will exist at install time; if missing, the playbook surfaces the error per FR-005/FR-006. |
| D3 | Engine-side parent-epic dedup (title or hidden HTML marker, clarification Q5) | ⚠️ Engine-owned (in `tasks_to_issues`). This issue documents the requirement; engine work is separate. |
| D4 | The epic argument argument forms (`owner/repo#N`, `#N`, URL) are resolved by the engine ref resolver, not the playbook | ✅ Matches `watch.md` precedent. |

Per the epic checklist this issue depends on G3.1 (engine ref resolver) and A1.4 (parent-epic creation in `tasks_to_issues`). The plan assumes both are in place — if not, the playbook will still install correctly but `/cockpit:file` will fail at runtime with whichever engine error the missing piece raises.

## Project Structure

### Documentation (this feature)

```text
specs/358-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (read-only)
├── clarifications.md    # Batch 1 answers Q1–Q5 (read-only)
├── plan.md              # This file
├── research.md          # Decisions on engine handoff, idempotency, arg shape
├── data-model.md        # Argument schema, manifest format, error envelope
├── quickstart.md        # Install + golden path + recovery walkthroughs
├── contracts/
│   ├── file-command.schema.md     # Slash command argument grammar + error envelope
│   └── manifest-handoff.schema.md # The artifact (tasks.md + epic body) handoff contract
└── checklists/                    # (empty — not generated by this plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
└── commands/
    └── file.md          # NEW — the only artifact this issue ships
```

**Structure Decision**: Mirror the shape of `commands/watch.md` and `commands/review.md` (existing siblings). The file MUST start with a `---`-fenced YAML frontmatter containing `description:` so the plugin loader registers the command for `/help`.

## Implementation Phases

### Phase 0: Re-verify reference shape
- Re-read `packages/claude-plugin-cockpit/commands/watch.md` and `review.md` for the playbook conventions (argument table, error envelope, "Notes" trailer, no implementation code).
- Re-read `packages/claude-plugin-agency-spec-kit/commands/taskstoissues.md` to confirm the MCP tool's existing user-driven invocation pattern (so `/cockpit:file` can compose it without re-asking for grouping).
- Confirm `spec_kit.tasks_to_issues` signature against `packages/agency-plugin-spec-kit/src/tools/tasks-to-issues.ts:288` (parameters: `grouping`, `dry_run`, `epic_number`, `feature_dir`, `cwd`).

### Phase 1: Write the playbook (`commands/file.md`)

Document the four-section playbook below in `commands/file.md`:

1. **Frontmatter + summary** — one-line `description:` for `/help`; one short paragraph explaining the orchestration boundary ("composes `tasks_to_issues` and `manifest sync`; owns neither; resolves nothing").
2. **Arguments** — single optional positional `<epic-ref>` per clarification Q4 (reuse existing parent on re-run); ref resolution is engine-owned (matches `watch.md`).
3. **Instructions** — six-step procedure (validate args, locate `tasks.md`, dispatch `tasks_to_issues`, dispatch `manifest sync`, handle the FR-005 and FR-006 partial-failure branches, report).
4. **Notes** — idempotency surface (FR-009: noop when manifest is fully filed); partial-state behavior (Q3 + US2-AC3); engine boundaries (Q2, Q5).

The detailed step-by-step behavior is captured in `quickstart.md` and the contracts below. The playbook itself is the *executable* form of that contract.

### Phase 2: Validate

- Markdown lints cleanly (frontmatter parses, no broken internal links).
- The plugin loader (Claude Code) registers `/cockpit:file` on next reload.
- Smoke test: invoke `/cockpit:file` on a feature branch with a populated `tasks.md`; observe (a) parent epic created, (b) `**Issue**: #<n>` written to each task block, (c) `**Epic**: #<n>` at top, (d) `manifest sync` invocation, (e) `.generacy/epics/<slug>.yaml` updated.
- Re-run smoke test against a fully filed `tasks.md`; expect FR-009 no-op (engine reports "all issues already filed", playbook still invokes `manifest sync` to converge the `.yaml`).
- Re-run smoke test against a partially filed `tasks.md`; expect Q3 behavior — only unfiled blocks get issues, recorded parent epic is reused (engine-side, via Q5 marker).

## Complexity Tracking

No constitution violations. The orchestration is intentionally thin: every interesting behavior (parent dedup, ref resolution, label transitions, body parsing) is delegated to an engine that already owns that responsibility. The playbook adds zero new abstraction layers; it is a written procedure for chaining two known-good commands.

## Open Risks

| Risk | Mitigation |
|------|------------|
| `generacy cockpit manifest sync` (#790) is not yet shipped at install time | Playbook detects the missing command (`command -v generacy` fails) and surfaces the FR-006 recovery message ("parent epic at <url>; run `manifest sync` once #790 ships to populate the `.yaml`"). |
| `tasks_to_issues` does not yet implement the engine-side parent-epic marker (Q5/A1.4) | Playbook documents the requirement; without it, a partial-failure re-run could create a duplicate parent. This is an *engine* bug to fix in A1.4, not a playbook deviation. |
| Developer passes a cross-repo `owner/repo#N` epic ref expecting it to be a target override | Playbook explicitly states (per Q4) that the arg is "an existing parent epic to reuse"; cross-repo filing is out of scope. The engine resolver rejects refs that don't resolve in the current repo. |
| Two engines emit overlapping error output, confusing the reporter step | Playbook surfaces engine output verbatim and labels the source (`[tasks_to_issues]` / `[manifest sync]`); does not summarize or rewrite. |
| The `**Epic**: #<n>` header convention chosen in Q1 collides with an existing speckit convention | Verified at planning time — `tasks.md` files generated by speckit do not currently include a top-of-file `**Epic**: #<n>` header. Q1 introduces this; the `tasks_to_issues` engine writes it. |

## Suggested Next Step

`/speckit:tasks` to generate the task list from this plan. The task list will likely contain a single task: "Write `packages/claude-plugin-cockpit/commands/file.md`," plus a checklist task for the smoke tests in Phase 2.
