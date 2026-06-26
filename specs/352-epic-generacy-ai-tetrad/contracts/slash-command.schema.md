# Contract: `status.md` slash-command file shape

**Feature**: 352-epic-generacy-ai-tetrad

The `packages/claude-plugin-cockpit/commands/status.md` document is a Claude Code slash-command definition, discovered by the plugin loader via the `commands/*.md` glob declared (implicitly) by the cockpit plugin manifest. There is no canonical JSON schema URL referenced by the sibling commands in `claude-plugin-agency-spec-kit`, so this contract codifies the observed shape used in this monorepo.

## Required shape

````markdown
---
description: Report the current status of an epic and its children
arguments:
  - name: epic
    description: Epic reference (owner/repo#N, #N, or URL). Omit to resolve from the current branch.
    required: false
---

# Status Command

<one short paragraph describing the verb's purpose>

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Argument handling** — ...
2. **No-arg epic resolution** — ...
3. **CLI invocation** — ...
4. **Output rendering** — ...
5. **Error handling** — ...

## Examples

...
````

## Field constraints

### Frontmatter

| Field | Type | Required | Constraint |
|-------|------|----------|------------|
| `description` | string | yes | Single line, ≤ 120 chars, matches the prevailing convention in sibling `commands/*.md`. Surfaced in `/help` and marketplace UX. |
| `arguments` | array | no | When present, each entry is `{ name: <identifier>, description: <string>, required: <boolean> }`. For this command, exactly one entry: the epic ref, `required: false`. |

### Body sections

| Section | Required | Constraint |
|---------|----------|------------|
| `# Status Command` (H1) | yes | Title matches the verb. |
| Intro paragraph | yes | One paragraph; describes what the verb does at a glance. |
| `## User Input` | yes | Verbatim block exposing `$ARGUMENTS` — matches sibling-command convention. |
| `## Instructions` | yes | Numbered list of model-actionable steps. MUST include the five sub-headings listed in the shape above, in order, covering: argument pass-through (FR-004), no-arg resolution chain (FR-005), CLI invocation (FR-002), fenced output rendering (FR-003), and error handling with detect-and-tailor for the three named modes (FR-006). |
| `## Examples` | recommended | At least one invocation example (`/cockpit:status` with no args; `/cockpit:status generacy-ai/tetrad-development#85`); helps the model learn the canonical shape. |

## Prohibited contents

| Item | Reason |
|------|--------|
| Instructions to pass `--json` to the CLI | FR-008 / clarification Q2 — this command consumes the default text form. |
| Instructions to parse, group, or re-render per-child status structure | FR-003 / clarification Q1 — phase grouping and decoration are the CLI's responsibility. |
| Instructions to reinterpret bare `#N` references | FR-004 / clarification Q4 — repo defaulting is owned by the CLI/engine resolver. |
| Any silent-no-op branch (an error path that prints nothing) | FR-006 / clarification Q5. |
| `commands` or `requires` frontmatter keys at the file level | Not part of the slash-command schema; those keys are plugin-manifest fields. |

## Loader behavior (informational)

- The Claude Code plugin loader globs `packages/claude-plugin-cockpit/commands/*.md` at install time. Each match registers as `/cockpit:<basename>`.
- After this issue lands, the loader will discover `status.md` and register `/cockpit:status` alongside the existing `.gitkeep` (which is not a `.md` file and is therefore invisible to the glob, per the #350 scaffold's clarification Q3).

## Reference

- `packages/claude-plugin-agency-spec-kit/commands/specify.md` — canonical sibling slash-command file in this repo.
- `packages/claude-plugin-agency-spec-kit/commands/plan.md` — second sibling; same shape.
- `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` — plugin manifest registering the `cockpit` namespace (#350).
