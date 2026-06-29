# Contract: artifact handoff between `tasks_to_issues` and `manifest sync`

**Feature**: 358-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This contract pins the *artifact* handoff between the two engines that `/cockpit:file` composes. Per clarification Q2, the engines do NOT communicate via a JSON pipe — every byte of state passes through `tasks.md` and the GitHub parent epic body.

## Artifact 1: `specs/<branch>/tasks.md` annotations

### Top-of-file header

```markdown
**Epic**: #<n>
```

| Field | Required | Constraints |
|-------|----------|-------------|
| Position | yes | First or second non-blank line of `tasks.md`, before the first `## Task:` header |
| `<n>` | yes | Unsigned positive integer matching the parent epic's GitHub issue number |
| Encoding | yes | `**Epic**:` bold-bracketed, single space after colon, leading `#` on the number |

**Writer**: `spec_kit.tasks_to_issues` after parent creation.
**Readers**: `spec_kit.tasks_to_issues` on re-runs (skip parent creation if present); the developer.

### Per-task issue marker

```markdown
## Task: <id>
**Issue**: #<n>
…task body…
```

| Field | Required | Constraints |
|-------|----------|-------------|
| Position | yes | Inside the `## Task: <id>` block; before the task body. Conventionally on the line immediately after the header. |
| `<n>` | yes | Unsigned positive integer matching the child issue's GitHub issue number |
| Encoding | yes | Same as the top-of-file header, scoped per block |

**Writer**: `spec_kit.tasks_to_issues` after each child creation.
**Readers**: `spec_kit.tasks_to_issues` on re-runs (skip blocks that already have `**Issue**:`); the developer.

### "Fully filed" predicate (FR-009)

A `tasks.md` is *fully filed* when:

1. The file has a `**Epic**: #<n>` header at the top, AND
2. Every `## Task: <id>` block contains a `**Issue**: #<n>` line.

A fully-filed `tasks.md` triggers the `tasks_to_issues` no-op (FR-009). The playbook still proceeds to `manifest sync` to converge the `.yaml`.

### "Partial" predicate (clarification Q3 / US2-AC3)

A `tasks.md` is *partial* when:

1. The file has a `**Epic**: #<n>` header at the top, AND
2. At least one but not all `## Task: <id>` blocks contain a `**Issue**: #<n>` line.

A partial `tasks.md` triggers the "file only the unfiled" behavior — the engine reuses the recorded parent epic and creates issues only for blocks lacking `**Issue**:`.

## Artifact 2: GitHub parent epic body

The parent epic created by `tasks_to_issues` has a body with three sections (in order):

### Section 1: Parent traceability link

```markdown
Parent epic: <ref>
```

| Field | Required | Constraints |
|-------|----------|-------------|
| `<ref>` | conditional | Present iff `spec.md` has an `**Epic**: <ref>` line. The value is copied verbatim from `spec.md`. |
| Position | conditional | First line of the body when present. |

**Writer**: `tasks_to_issues` at parent creation time.
**Readers**: the developer; `manifest sync` MAY use this to record the parent-of-parent in `.yaml` (engine-owned).

### Section 2: Hidden dedup marker

```markdown
<!-- speckit-epic:<branch> -->
```

| Field | Required | Constraints |
|-------|----------|-------------|
| `<branch>` | yes | The current git branch name |
| Position | yes | Anywhere in the body. Conventionally near the top. |

**Writer**: `tasks_to_issues` at parent creation time.
**Reader**: `tasks_to_issues` on partial-failure recovery (D3 / clarification Q5). On a re-run with no `<epic-ref>` argument, the engine searches recent issues for this marker and reuses the matching parent.

### Section 3: Child checklist (the manifest sync source of truth)

```markdown
## Tasks

- [ ] T001 — <title> · #<child-n>
- [ ] T002 — <title> · #<child-n>
…
```

| Field | Required | Constraints |
|-------|----------|-------------|
| Heading | yes | `## Tasks` exactly |
| List items | yes | One per task block in `tasks.md`. Format: `- [ ] <id> — <title> · #<n>` for filed children; `- [ ] <id> — <title>` for unfiled children (in a partial state between runs). |
| `<id>` | yes | Matches the `## Task: <id>` block in `tasks.md` |
| `<n>` | conditional | Present iff the child issue was created |

**Writer**: `tasks_to_issues` after each child creation (appends `· #<n>` to the matching list item).
**Reader**: `generacy cockpit manifest sync` (per #790) — re-parses this list to update `.generacy/epics/<slug>.yaml`.

## Sequencing invariants

1. `tasks_to_issues` MUST create the parent before any child. The parent's `<!-- speckit-epic:<branch> -->` marker is the only on-GitHub recovery anchor.
2. `tasks_to_issues` MUST write `**Issue**: #<n>` to a `tasks.md` block AND append `· #<n>` to the parent body checklist *as an atomic-feeling pair*. (They can't be a single API call, but the engine should write both before moving on to the next child, so a crash between children leaves the manifest and the body in agreement about which children were filed.)
3. `manifest sync` MUST NOT run before `tasks_to_issues` succeeds (FR-005). If `tasks_to_issues` fails after creating the parent but before all children are filed, the playbook surfaces the partial state with a recovery message and exits non-zero.
4. `manifest sync` MUST be safe to re-run (idempotency contract owned by #790). The playbook therefore runs it even on no-op `tasks_to_issues` results.

## Non-goals

- This contract does NOT pin the `.generacy/epics/<slug>.yaml` schema — that is owned by issue #790.
- This contract does NOT pin the `tasks_to_issues` GitHub API call sequence — that is an engine concern.
- This contract does NOT pin the `spec.md` `**Epic**:` line format — that is owned by speckit.

## Versioning rule

The annotations and body sections above are part of the cockpit + speckit engine surface. Breaking changes (renaming `**Issue**:`, changing the marker comment shape, reordering the body sections) require coordinated bumps in `agency-plugin-spec-kit` and `generacy cockpit manifest sync`. Additive changes (e.g. a new `**Status**:` line per task block) are MINOR — consumers MUST ignore unrecognized `**Key**:` lines.
