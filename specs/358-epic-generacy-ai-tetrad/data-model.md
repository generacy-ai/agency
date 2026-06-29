# Data Model: `/cockpit:file` orchestrator

**Feature**: 358-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This feature ships only a markdown playbook (`packages/claude-plugin-cockpit/commands/file.md`). It introduces no runtime types, no schemas, and no persistent stores beyond what the engines already own. The "data model" is the shape of (1) the slash-command arguments, (2) the `tasks.md` annotations the engine writes (which the playbook reads on re-runs), and (3) the error envelope the playbook emits.

## Entities

### E1: Slash command argument

| Field | Type | Required | Value / shape |
|-------|------|----------|---------------|
| `$ARGUMENTS` (positional) | string | no | An epic ref: bare `#N` (e.g. `351`), fully-qualified `owner/repo#N` (e.g. `generacy-ai/agency#351`), or a GitHub issue URL. |

**Validation rules**:
- If `$ARGUMENTS` is empty, default to "no parent epic provided" — the engine will create a new parent unless its title/marker dedup (D3) finds an existing one.
- If `$ARGUMENTS` is non-empty, pass it **verbatim** to `spec_kit.tasks_to_issues` as `epic_number` *only after* engine-side resolution. The engine resolver is the single source of truth for the ref-to-number translation (D6).
- The playbook MUST NOT pre-validate the ref's syntactic shape; the engine resolver returns a clear error if the ref is malformed.

### E2: `tasks.md` annotations (the speckit manifest)

The `tasks_to_issues` engine reads and writes this file. The playbook reads only the post-run state.

**File path**: `specs/<branch>/tasks.md`

| Annotation | Where it lives | Written by | Read by | Format |
|------------|----------------|------------|---------|--------|
| Parent epic header | Top of file (above the first `## Task:` block) | `tasks_to_issues` after parent creation | `tasks_to_issues` on re-runs; the developer | `**Epic**: #<n>` on its own line |
| Child issue marker | Inside each `## Task: <id>` block | `tasks_to_issues` after child creation | `tasks_to_issues` on re-runs (to skip already-filed blocks); the developer | `**Issue**: #<n>` on its own line inside the block |
| Parent traceability link | Body of the GitHub parent epic (NOT in `tasks.md`) | `tasks_to_issues` when it creates the parent | `manifest sync` (per #790) | `Parent epic: <ref>` line in the parent issue body, sourced from `spec.md`'s `**Epic**:` line |

**Validation rules**:
- The `**Epic**:` and `**Issue**:` keys are bold-bracketed, matching the existing speckit metadata convention (e.g. `**Branch**:`, `**Status**:` in `spec.md`).
- `#<n>` is an unsigned positive integer with a leading `#`.
- A task block lacking `**Issue**:` is "unfiled" — `tasks_to_issues` MUST file it on the next run (clarification Q3).
- A `tasks.md` whose every `## Task:` block has `**Issue**:` AND whose top has `**Epic**:` is "fully filed" — `tasks_to_issues` MUST report a no-op (FR-009).

### E3: Error envelope (when the playbook surfaces an engine failure)

The playbook emits inline chat messages when it must escalate engine errors to the developer. The shape:

```
[cockpit:file] <step>: <one-line summary>
  detail: <verbatim engine error>
  next:   <suggested recovery command, if known>
```

| Field | Required | Value |
|-------|----------|-------|
| `<step>` | yes | One of: `tasks_to_issues`, `manifest sync` |
| `<one-line summary>` | yes | A terse failure summary (e.g. "failed to create parent epic") |
| `detail:` line | yes | The engine's verbatim stderr/output (per D7) |
| `next:` line | conditional | Present when FR-005 or FR-006 supplies a recovery command (e.g. `gh issue view <url>`, `generacy cockpit manifest sync <epic-ref>`) |

**Validation rules**:
- The label prefix `[cockpit:file]` matches the `[cockpit:watch]` precedent in `watch.md:54-58` for inline notifications.
- The `<step>` token MUST be exactly one of the two values — it tells the developer which engine to dig into.
- The playbook MUST NOT modify the engine's error text.

### E4: Successful completion report

When both engines succeed, the playbook emits one report line:

```
[cockpit:file] filed <n> issue(s) under <parent-ref>; manifest synced to <yaml-path>
```

| Field | Required | Value |
|-------|----------|-------|
| `<n>` | yes | The number of *new* child issues created in this invocation (zero for a fully-filed re-run that converged the `.yaml`) |
| `<parent-ref>` | yes | The bare `#N` form of the parent epic |
| `<yaml-path>` | yes | The path emitted by `manifest sync`, relative to repo root, e.g. `.generacy/epics/<slug>.yaml` |

## Relationships

```
$ARGUMENTS (E1)
    │
    │  passed verbatim
    ▼
spec_kit.tasks_to_issues (MCP tool)
    │
    ├──── writes ────►  tasks.md (E2)
    │                     ├─ **Epic**: #<n>   ← parent epic header
    │                     └─ ## Task: <id>
    │                          └─ **Issue**: #<n>  ← child issue marker
    │
    └──── writes ────►  GitHub parent epic body
                          ├─ Parent epic: <ref>     ← from spec.md **Epic**:
                          └─ checklist of children  ← source of truth for manifest sync (#790)
                                  │
                                  │ re-parsed by
                                  ▼
                          generacy cockpit manifest sync
                                  │
                                  └──── writes ────► .generacy/epics/<slug>.yaml
                                                            │
                                                            └─ epic manifest (owned by #790)
```

## Cross-document invariants

- **Manifest separation** (clarification Q1): `tasks.md` is the *speckit* manifest; `.generacy/epics/<slug>.yaml` is the *epic* manifest. They are not the same file and must not be conflated.
- **Single writer per artifact**: only `tasks_to_issues` writes `tasks.md` annotations; only `manifest sync` writes the `.yaml`. The playbook writes neither.
- **No sidecar state** (clarification Q5): `/cockpit:file` MUST NOT create or read any `.cockpit-file-*` files. All recovery state lives in `tasks.md` and the GitHub parent epic body.
- **No JSON pipe** (clarification Q2): engines communicate exclusively through the artifacts above.
- **Engine-owned ref resolution** (D6): the playbook MUST NOT parse `$ARGUMENTS` beyond "is it empty?"

## Schema files

The structured contracts for E1 (argument grammar) and the engine handoff (E2 + parent body) live as separate `.schema.md` files under `contracts/`:

- `contracts/file-command.schema.md` — argument grammar and error envelope.
- `contracts/manifest-handoff.schema.md` — the `tasks.md` annotation format and the parent-body checklist format that `manifest sync` re-parses.
