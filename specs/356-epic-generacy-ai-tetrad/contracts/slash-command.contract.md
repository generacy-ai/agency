# Contract: `/cockpit:plan` slash-command interface

**Feature**: 356-epic-generacy-ai-tetrad

This codifies the external contract of `packages/claude-plugin-cockpit/commands/plan.md` — what users invoke and what they observe.

## Invocation

```
/cockpit:plan <epic-ref>
```

### Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `<epic-ref>` | yes | — | Either a bare positive integer (`356`) or a fully-qualified `owner/repo#N` (`generacy-ai/agency#356`). |

No flags. Cross-repo qualified refs still write into the **current working tree's** `docs/` — the file always lives where the command runs (clarification Q1).

## Frontmatter shape

```yaml
---
description: Scaffold (or non-destructively assist) an epic-level planning doc at docs/epic-<slug>-plan.md. Human-led — never overwrites, never advances a gate, never comments on the epic.
arguments:
  - name: epic-ref
    description: Bare issue number (e.g. 356) or owner/repo#N (e.g. generacy-ai/agency#356). Resolves epic title/body via gh. The planning doc is always written into the current working tree's docs/ directory.
    required: true
---
```

## Behavioral contract

### Invariants (MUST)

1. **Never overwrite**: the command MUST NOT modify any byte of an existing `docs/epic-<slug>-plan.md` outside of append-only writes preceded by the `<!-- generacy-cockpit:appended -->` marker (FR-005, SC-002).
2. **Human-led**: the command MUST NOT advance any gate via `generacy cockpit advance`, MUST NOT post comments on the epic issue, MUST NOT call any cockpit CLI verb (FR-006).
3. **Deterministic path**: the output path is `<cwd>/docs/epic-<slug>-plan.md` where `<slug>` is derived per `data-model.md` E3. Identical inputs always produce identical paths (FR-004).
4. **Append-only assist**: in US2, append happens only after explicit `AskUserQuestion` confirmation, and only beneath the marker line (FR-005, clarification Q3).
5. **Conversational confirmation**: the US2 prompt MUST use `AskUserQuestion` with `Append` and `Cancel` choices — no `--apply` flag, no two-step round-trip (clarification Q3).
6. **Case-insensitive heading match + alias table**: the comparator that detects missing sections MUST be case-insensitive and MUST honor at least the aliases `Goals ↔ Objectives` and `Non-Goals ↔ Out of Scope` (clarification Q4).
7. **Markdown metadata block, not YAML**: the metadata under H1 MUST be a markdown line of the form `**Epic**: …  ·  **Phase**: …  ·  **Tier**: …` — NOT YAML front-matter and NOT an HTML comment (clarification Q5).
8. **Absolute path in success output**: the success line MUST include the absolute path (FR-007).

### Forbidden behaviors (MUST NOT)

- MUST NOT overwrite, truncate, or reorder any existing content in `docs/epic-<slug>-plan.md`.
- MUST NOT call `gh issue comment`, `gh pr *`, `generacy cockpit advance`, or any other state-mutating CLI verb.
- MUST NOT clone, fetch, or write files outside the current working tree.
- MUST NOT silently rewrite a developer-provided `slug:` value (use it verbatim or error out on invalid chars).
- MUST NOT prompt the user via `AskUserQuestion` in the US1 fresh-write path — the write is unambiguous.
- MUST NOT advance, retry, or background any work after the file write.

### Outputs

Terse single-line status per outcome. See `data-model.md` E6 for the canonical examples.

| Outcome | Exit code |
|---------|-----------|
| US1 write succeeded | `0` |
| US2 already complete | `0` |
| US2 append confirmed and written | `0` |
| US2 append cancelled | `0` |
| US2 non-interactive (no prompt possible) | `0` |
| Empty `$ARGUMENTS` (Usage printed) | `0` |
| Malformed `$ARGUMENTS` | non-zero |
| `gh` failure | non-zero |
| Slug failure | non-zero |

## State diagram

```
                ┌────────────────────────────────────┐
                │ Parse $ARGUMENTS                   │
                │  empty → Usage, exit 0             │
                │  malformed → parse error, exit !0  │
                └───────────────┬────────────────────┘
                                ▼
                ┌────────────────────────────────────┐
                │ gh issue view <ref> --json title,body
                │  on failure → stderr verbatim, exit !0
                └───────────────┬────────────────────┘
                                ▼
                ┌────────────────────────────────────┐
                │ Extract title/body/slug/phase/tier │
                │  derive slug (data-model.md E3)    │
                │  invalid → slug failure, exit !0   │
                └───────────────┬────────────────────┘
                                ▼
                target_path = <cwd>/docs/epic-<slug>-plan.md
                                │
                ┌───────────────┴───────────────┐
                ▼                               ▼
       file does NOT exist             file EXISTS
       (US1: fresh scaffold)           (US2: diff-detect)
                │                               │
                ▼                               ▼
       write skeleton                 parse H2s; run comparator
       (planning-doc.contract.md)     (data-model.md E4)
                │                               │
                ▼                  ┌────────────┴────────────┐
       "wrote planning             ▼                         ▼
        skeleton: <abs>"     missing.empty            missing.nonEmpty
       exit 0                      │                         │
                                   ▼                         ▼
                          "planning doc          AskUserQuestion(E5)
                           already complete"     ┌───────┬───────────┐
                          exit 0                 ▼       ▼           ▼
                                              Append   Cancel    no-prompt
                                                 │       │           │
                                                 ▼       ▼           ▼
                                       append under   "not        "missing
                                       marker;        modified"    sections: …;
                                       "appended N    exit 0       no changes"
                                        sections"                  exit 0
                                       exit 0
```

## Test scenarios (manual)

| Scenario | Expected outcome |
|----------|------------------|
| Fresh epic, no existing doc | `wrote planning skeleton: <abs>` |
| Same epic re-run, skeleton intact | `planning doc already complete: <abs>` |
| Same epic, one canonical section deleted by hand | Prompt lists the missing section → on `Append`, marker + section appended → `appended 1 section(s) to: <abs>` |
| Same epic, two sections renamed via aliases (`Goals → Objectives`, `Non-Goals → Out of Scope`) | `planning doc already complete: <abs>` (alias match) |
| Same epic, one section renamed outside the alias table (e.g. `Risks → Hazards`) | Prompt lists `Risks` as missing → user can `Append` to re-add it |
| US2 append cancelled | `planning doc not modified: <abs>`, exit 0, file unchanged |
| Empty `$ARGUMENTS` | Usage line, exit 0, no file written |
| `$ARGUMENTS` is `abc` | `invalid epic-ref: abc`, exit non-zero |
| `$ARGUMENTS` is `owner/repo#nope` | `invalid epic-ref: owner/repo#nope`, exit non-zero |
| `gh issue view 999999` fails | `gh`'s native error verbatim + `failed to resolve epic 999999`, exit non-zero |
| Epic body has explicit `slug: my-epic` | Path is `docs/epic-my-epic-plan.md` regardless of title |
| Epic body has `slug: bad/slug` | `slug contains invalid characters: bad/slug`, exit non-zero |
| Epic title is `[…]` only (empty after strip) | `could not derive slug from title: <title> — add a slug: line to the epic body`, exit non-zero |
| Cross-repo qualified ref (`generacy-ai/tetrad-development#85`) | Doc is written into the current working tree's `docs/`, not the cross-repo target |

## Versioning

This contract is at v1. Future evolutions (e.g., adding `--dry-run` or supporting an explicit override path) MUST be additive: any v1 caller MUST continue to work unchanged. Removing the `<!-- generacy-cockpit:appended -->` marker, changing canonical section order, or relaxing the non-overwrite invariant is a breaking change and requires a major bump.
