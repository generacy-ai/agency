# Research: `/cockpit:file` orchestrator

**Feature**: 358-epic-generacy-ai-tetrad
**Date**: 2026-06-29

## Decisions

### D1: Compose two existing engines via artifacts, never via a JSON pipe

**Decision**: `/cockpit:file` invokes `spec_kit.tasks_to_issues` (MCP tool) followed by `generacy cockpit manifest sync <epic-ref>` (CLI). The two engines do not exchange a structured payload — `tasks_to_issues` writes filed numbers into `specs/<branch>/tasks.md` and the parent epic's GitHub body checklist; `manifest sync` re-parses that body to update `.generacy/epics/<slug>.yaml`.

**Rationale**:
- Clarification Q2 chose this option explicitly.
- Avoids inventing a transport contract between two independently-shipped engines (one is an MCP tool, one is a Go/Node CLI).
- Preserves issue #790's invariant that the epic body is the canonical source of truth for the `.yaml`.
- The artifact path is *already* what each engine emits — no glue code in the playbook.

**Alternatives considered**:
- **stdout JSON pipe** (`tasks_to_issues … | manifest sync --stdin`). Rejected per Q2: introduces a fragile schema between two engines that otherwise have no coupling; doubles the test surface of `manifest sync`.
- **Sidecar JSON at `specs/<branch>/.cockpit-file-result.json`**. Rejected per Q2: adds a persistent artifact the developer must reason about; partial-failure cleanup becomes a third invariant.
- **Tempfile with `--from <path>`**. Documented as fallback only — if a direct handoff is ever required (e.g., for cross-host invocation), this is the escape hatch. Not used in the default flow.

### D2: The epic argument is an existing parent epic to reuse, not a target override

**Decision**: `/cockpit:file [<epic-ref>]` — the optional positional argument is the reference (bare `#N`, `owner/repo#N`, or URL) of an *already-existing* parent epic. When supplied, the engine skips parent creation and files only the unfiled children under it. When omitted, the engine creates a new parent.

**Rationale**:
- Clarification Q4 chose this option (with the traceability addition that the spec.md `**Epic**:` line — e.g. `generacy-ai/tetrad-development#85` — is recorded as a `Parent epic:` link in the new parent's body).
- Mirrors how `watch.md` treats `$ARGUMENTS`: the slash command does not resolve refs; the engine does.
- Keeps cross-repo filing out of scope (Q4 rejected option C explicitly), so the engine can keep treating the current branch's `gh` remote as the filing target.

**Alternatives considered**:
- **Parent-of-parent traceability flag only** (option B in Q4). Rejected: didn't solve the recovery problem (re-running after a partial failure where the parent already exists).
- **Cross-repo target override** (option C in Q4). Rejected: contradicts the Out-of-Scope clause and would require a separate cross-repo permission model.

### D3: Engine-side parent-epic recovery via title or hidden HTML marker

**Decision**: When `/cockpit:file` is re-run after a partial failure (parent created, some children missing), `tasks_to_issues` detects the existing parent by title match or a hidden HTML marker (e.g. `<!-- speckit-epic:<branch> -->`) in the epic body. The playbook does not manage sidecar state.

**Rationale**:
- Clarification Q5 chose this option.
- Mirrors how the manual filing flow stays safe to re-run today (the developer eyeballs the issues list for an existing matching title).
- Centralizes idempotency in the engine where the GitHub-API call already happens — removing it from the playbook means no two-place invariant to maintain.

**Alternatives considered**:
- **Sidecar file** (`specs/<branch>/.cockpit-file-parent`). Rejected per Q5: introduces a second state surface that disagreements between (sidecar, GitHub state, manifest) become possible.
- **Manual recovery** (developer edits `tasks.md` to record the parent number). Rejected per Q5: violates the "re-run the same command to recover" UX in Q3 / US2-AC3.

### D4: Partial re-run files only unfiled blocks; reuses recorded parent

**Decision**: When invoked on a manifest where some `## Task: <id>` blocks already have `**Issue**: #<n>` and others don't, `/cockpit:file` files only the unfiled blocks. It reuses the parent epic recorded in the `**Epic**:` line at the top of `tasks.md`, then runs `manifest sync` to update the `.yaml`.

**Rationale**:
- Clarification Q3 chose this option.
- Satisfies US2-AC3 ("a subsequent successful re-run reconciles … without filing duplicates") without a separate recovery command.
- Matches the FR-009 "no-op when fully filed" semantics at the limit: a fully filed manifest is just a partial manifest with zero unfiled blocks.

**Alternatives considered**:
- **Error on partial state** (option B in Q3). Rejected: forces a hand-edit recovery flow, defeating idempotency.
- **Treat partial == unfiled and re-file everything** (option C in Q3). Rejected: violates US2-AC3 by creating duplicates.

### D5: `tasks.md` is the speckit manifest; `**Issue**:` and `**Epic**:` are the recording format

**Decision**: The "manifest file" referenced throughout the spec is `specs/<branch>/tasks.md`. `tasks_to_issues` records the filed parent issue number as `**Epic**: #<n>` at the top of the file, and each child issue number as `**Issue**: #<n>` inside the matching `## Task: <id>` block.

**Rationale**:
- Clarification Q1 chose option A.
- Reuses the existing speckit `## Task: <id>` block convention — no new file, no new format.
- Bold-bracketed `**Key**: value` lines are the speckit convention for metadata (also used for `**Status**:`, `**Date**:` in `spec.md` headers).
- Keeps the speckit manifest (`tasks.md`) and the epic manifest (`.generacy/epics/<slug>.yaml`, owned by `manifest sync`) cleanly separated — clarification Q1 explicitly warns against conflating them.

**Alternatives considered**:
- **New `manifest.md` file** (option B in Q1). Rejected: introduces a second tasks-shaped artifact developers must keep in sync with `tasks.md`.
- **YAML frontmatter on `tasks.md`** (option C in Q1). Rejected: hides the issue numbers from a human reading the task block body; visual parity matters here.

### D6: Playbook delegates ref resolution to the engine

**Decision**: The `<epic-ref>` argument is passed verbatim to the engine. The playbook does not parse `owner/repo#N`, lookup `MONITORED_REPOS`, or normalize bare `#N` to a fully-qualified form.

**Rationale**:
- Matches the precedent set by `commands/watch.md:9-15` — "Ref resolution (`owner/repo#N` ↔ bare number) is owned by the engine resolver. This playbook does neither — it only routes transitions to actions."
- Keeps the playbook free of state that would need to be kept in sync with the engine resolver.
- The engine resolver already exists (G3.1 dependency); duplicating its logic in the playbook would be a layering violation.

**Alternatives considered**:
- **Playbook-side normalization to bare `#N`**. Rejected per the `watch.md` precedent.

### D7: Errors are surfaced verbatim, labeled by source

**Decision**: When either engine emits an error, the playbook surfaces the engine's output verbatim with a `[tasks_to_issues]` or `[manifest sync]` label so the developer can tell which step failed. The playbook does not summarize, rewrite, or rewrap error text.

**Rationale**:
- FR-005 says the playbook must not run `manifest sync` after a failed `tasks_to_issues` — but the error context still has to reach the developer.
- FR-006 says when `tasks_to_issues` succeeds but `manifest sync` fails, the playbook must print the parent epic URL so the developer can re-run `manifest sync` manually.
- Engine error messages are the single source of truth; rewrites in the playbook drift from the engine over time.

**Alternatives considered**:
- **Wrap engine errors in a cockpit-shaped envelope**. Rejected: adds a second error format developers have to learn.

## Implementation Patterns

### P1: Slash command playbook is markdown only

- The command lives at `packages/claude-plugin-cockpit/commands/file.md`. The plugin loader discovers it on startup; no manifest registration needed (the cockpit plugin's `plugin.json` from #350 already declares the `commands/` directory as the discovery root).
- Frontmatter must include `description:` — `/help` reads it. See `commands/watch.md:1-3` for the canonical format.

### P2: Engine invocation conventions

- The MCP tool `spec_kit.tasks_to_issues` is invoked through the Claude Code MCP machinery — the playbook describes the call in prose ("call the `spec_kit.tasks_to_issues` MCP tool with `epic_number: <ref>` and `dry_run: false`") and the agent executes it.
- The CLI `generacy cockpit manifest sync <epic-ref>` is invoked via Bash (or whichever shell tool the agent has access to in cockpit mode). The playbook quotes the exact command line.

### P3: Idempotency surface lives in the engines

- The playbook does not check "is the manifest fully filed?" itself. It calls `tasks_to_issues`; if the engine determines all task blocks already have issue numbers, it returns a no-op success result. The playbook then proceeds to `manifest sync` to ensure the `.yaml` is converged — `manifest sync` is itself idempotent (per #790's invariant).
- This means a fully-filed re-run does no GitHub writes but does parse-and-write the `.yaml`. That's intentional: it gives the developer a one-command "re-converge" after manual `tasks.md` edits.

## Key Sources / References

- `specs/358-epic-generacy-ai-tetrad/spec.md` — feature requirements and acceptance criteria.
- `specs/358-epic-generacy-ai-tetrad/clarifications.md` — answered questions Q1–Q5.
- `packages/claude-plugin-cockpit/commands/watch.md` — orchestrator playbook precedent (argument handling, "engine resolves refs" pattern, inline notification format).
- `packages/claude-plugin-cockpit/commands/review.md` — orchestrator playbook precedent (argument parsing, error envelope shape).
- `packages/claude-plugin-agency-spec-kit/commands/taskstoissues.md` — the user-driven sibling that `/cockpit:file` automates.
- `packages/agency-plugin-spec-kit/src/tools/tasks-to-issues.ts:288` — the actual `spec_kit.tasks_to_issues` tool signature (`epic_number`, `grouping`, `dry_run`, `feature_dir`, `cwd`).
- `packages/agency-plugin-spec-kit/src/manifest.ts:30` — confirms `spec_kit.tasks_to_issues` is in the plugin manifest's `tools` list (available to the cockpit playbook at runtime).
- Issue #790 (parent repo) — `generacy cockpit manifest sync` engine contract: epic body is the source of truth for the `.yaml`.
- Issue A1.4 (per epic checklist) — `tasks_to_issues` engine-side parent epic creation and dedup (clarification Q5).
- Issue G3.1 (per epic checklist) — engine ref resolver shared with `commands/watch.md`.
