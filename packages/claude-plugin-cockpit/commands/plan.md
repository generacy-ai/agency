---
description: Scaffold (or non-destructively assist) an epic-level planning doc at docs/epic-<slug>-plan.md. Human-led — never overwrites, never advances a gate, never comments on the epic.
arguments:
  - name: epic-ref
    description: Bare issue number (e.g. 356) or owner/repo#N (e.g. generacy-ai/agency#356). Resolves epic title/body via gh. The planning doc is always written into the current working tree's docs/ directory.
    required: true
---

# Cockpit Plan

Scaffold an epic-level planning doc at `docs/epic-<slug>-plan.md` (US1: fresh scaffold), or non-destructively suggest appending missing canonical sections to an existing doc via `AskUserQuestion` (US2: assist append). Human-led: never overwrites, never advances a gate, never comments on the epic.

## User Input

```text
$ARGUMENTS
```

## Instructions

### Step 1: Parse arguments

Read `$ARGUMENTS`, trim leading/trailing whitespace, then branch:

- **Empty** → print the literal two-line Usage block and exit `0` (non-destructive per FR-008):

  ```
  Usage: /cockpit:plan <epic-ref>
    <epic-ref>  bare issue number (e.g. 356) or owner/repo#N (e.g. generacy-ai/agency#356)
  ```

- **Bare integer** matching the regex `^\d+$` (positive integer) → accept as `<ref>`.
- **Qualified** matching the regex `^[^/\s]+/[^/\s#]+#\d+$` → accept as `<ref>`.
- **Anything else** → emit `invalid epic-ref: <raw value>` and exit non-zero.

No flags. Do NOT attempt to resolve bare refs against any cockpit config (`MONITORED_REPOS`, etc.) — `gh`'s current-repo default is the only resolver.

### Step 2: Resolve the epic via gh

Shell out to:

```bash
gh issue view <ref> --json title,body
```

- **Non-zero exit**: surface `gh`'s stderr verbatim on stdout, then emit `failed to resolve epic <ref>` and exit non-zero (FR-009).
- **Zero exit**: parse stdout as JSON `{ "title": "...", "body": "..." }`.
- If either `title` or `body` is `null` or absent, emit `epic <ref> returned no title/body — check the issue exists and is accessible` and exit non-zero.

`gh issue view` is the only network call this command makes. No retries, no caching.

### Step 3: Extract metadata from the epic body

Apply the following line-anchored, case-insensitive regexes to `body`. **First occurrence wins** for each field; subsequent matches are ignored. All three fields are optional.

| Field   | Regex                                                  | Notes |
|---------|--------------------------------------------------------|-------|
| `slug`  | `^\s*slug:\s*(\S+)\s*$`                                | Captured value used verbatim (after Step 4 validation). |
| `phase` | `^\s*(?:\*\*)?Phase(?:\*\*)?:\s*(.+?)\s*$`             | Tolerates `**Phase**:` bold-wrapped keys. |
| `tier`  | `^\s*(?:\*\*)?Tier(?:\*\*)?:\s*(.+?)\s*$`              | Same tolerance as `phase`. |

### Step 4: Derive the slug

Resolve in order; the first matching branch wins.

1. **Explicit `slug:` from Step 3** → use it verbatim, but **first** validate: if it contains `/`, `\`, or any whitespace character, emit `slug contains invalid characters: <slug>` and exit non-zero. Otherwise, the slug is the captured value as-is.
2. **Derive from `title`** by applying this normalization chain (each step feeds the next):
   1. Strip a leading `Epic:` prefix (case-insensitive, with or without trailing space).
   2. Strip a leading `Epic ` prefix (case-insensitive).
   3. Strip a leading `[…]` bracket prefix (first bracket pair only; do not recurse).
   4. Lowercase the entire string.
   5. Replace every non-alphanumeric character with `-`.
   6. Collapse runs of `-` to a single `-`.
   7. Trim leading and trailing `-`.
   8. If `len > 60`, truncate at the **last `-` boundary at or before index 60**. If no `-` exists at or before index 60, truncate at index 60.

If the normalization chain produces an empty string (e.g., title is `Epic: [scope]` with nothing after the strip), emit `could not derive slug from title: <title> — add a slug: line to the epic body` and exit non-zero.

**Examples** (from `data-model.md` E3):

| Title                                                                                  | Derived slug                                       |
|----------------------------------------------------------------------------------------|----------------------------------------------------|
| `Epic: Cockpit`                                                                        | `cockpit`                                          |
| `[cockpit] /cockpit:plan command`                                                      | `cockpit-plan-command`                             |
| `Epic Cockpit: A very long title that exceeds the sixty character cap easily`          | `cockpit-a-very-long-title-that-exceeds-the-sixty` |

### Step 5: Compute the target path and ensure docs/

```
target_path = <cwd>/docs/epic-<slug>-plan.md
```

`target_path` MUST be an absolute path. If `<cwd>/docs/` does not exist, create it. Even for cross-repo qualified refs, the file is written into the **current working tree** — never into any other repo (per clarification Q1).

### Step 6: Branch on file existence

- **`target_path` does NOT exist** → go to Step 7 (US1 fresh scaffold).
- **`target_path` exists** → go to Step 8 (US2 assist append).

### Step 7: US1 — Fresh-scaffold write

Write the following skeleton to `target_path` verbatim, with `<Epic Title>` replaced by the raw `title` from Step 2 (no normalization applied — verbatim) and `<METADATA-BLOCK>` rendered per the rules below. **Do not call `AskUserQuestion` in this path.**

```markdown
# <Epic Title>

<METADATA-BLOCK>

## Context

<!-- TODO: Why this epic exists. The problem statement, the prior art, and the user/business impact. -->

## Goals

<!-- TODO: What success looks like. Concrete, measurable outcomes — not implementation tasks. -->

## Non-Goals

<!-- TODO: Explicit out-of-scope statements. What we will NOT do in this epic. -->

## Phases

<!-- TODO: The sequenced phases (P1, P2, …) and what lands in each. Cross-link to child issues / specs. -->

## Ownership / Isolation

<!-- TODO: Per-phase or per-child-issue isolation boundaries — which package, file, or surface each piece owns. -->

## Sequencing & Dependencies

<!-- TODO: Dependency graph between child issues. What blocks what; what can land in parallel. -->

## Risks

<!-- TODO: Known risks, their impact, and the mitigation strategy. -->

## Open Questions

<!-- TODO: Unresolved questions blocking progress; link to any clarification issues / threads. -->
```

#### Metadata-block rendering

The `<METADATA-BLOCK>` paragraph (and the blank lines bracketing it) is rendered exactly per this rule (per research D7 + `data-model.md` E2):

- **`phase` AND `tier` both present** → `**Epic**: <ref>  ·  **Phase**: <phase>  ·  **Tier**: <tier>`
- **Only `phase` present** → `**Epic**: <ref>  ·  **Phase**: <phase>`
- **Only `tier` present** → `**Epic**: <ref>  ·  **Tier**: <tier>`
- **Neither `phase` nor `tier` extractable** (i.e., no metadata at all beyond the ref) → **omit the metadata block entirely**, including the blank line that would precede it. The H1 is directly followed by `## Context` with exactly one blank line between them.

The separator is two spaces + middle dot (`·`) + two spaces. Format is **markdown bold + middle dot only** — never YAML `---` delimiters, never an HTML comment.

After writing, emit:

```
wrote planning skeleton: <abs-path>
```

Exit `0`.

### Step 8: US2 — Assist-append path

#### Step 8.1: Parse existing H2 headings

Read `target_path` into memory. Walk it line by line, maintaining an `in_code_block` boolean:

- Toggle `in_code_block` whenever a line matches `^\`\`\`` (triple-backtick fence). Lines inside fenced code blocks MUST be ignored — H2 headings inside code samples MUST NOT count as present.
- Outside code blocks, capture every line matching `^##\s+(.+?)\s*$` (no leading indent allowed).

Normalize each captured heading: lowercase, trim whitespace, trim a single trailing `:` if present.

#### Step 8.2: Compare against canonical sections

**Canonical sections** (this list is the single source of truth — same order as the US1 skeleton):

1. `Context`
2. `Goals`
3. `Non-Goals`
4. `Phases`
5. `Ownership / Isolation`
6. `Sequencing & Dependencies`
7. `Risks`
8. `Open Questions`

**Alias table** (flat array of pairs inside this command; case-insensitive exact match against normalized headings):

| Canonical                 | Aliases                                  |
|---------------------------|------------------------------------------|
| `Goals`                   | `Objectives`                             |
| `Non-Goals`               | `Out of Scope`, `Out-of-Scope`           |
| `Context`                 | (none)                                   |
| `Phases`                  | (none)                                   |
| `Ownership / Isolation`   | (none)                                   |
| `Sequencing & Dependencies` | (none)                                 |
| `Risks`                   | (none)                                   |
| `Open Questions`          | (none)                                   |

For each canonical section in order:

1. Compute the canonical-normalized name (lowercase, trim).
2. Compute the alias-normalized set (lowercase, trim each alias).
3. If any parsed heading equals the canonical-normalized name OR any alias-normalized value → mark "present."
4. Otherwise → "missing."

Build the missing-section list in canonical order. The comparator MUST be deterministic — same input doc + same canonical list always produces the same missing list.

#### Step 8.3: Missing list is empty

Emit:

```
planning doc already complete: <abs-path>
```

Exit `0`. Do not modify the file.

#### Step 8.4: Missing list is non-empty — prompt via AskUserQuestion

Invoke `AskUserQuestion` with this payload:

- `question`: `Append <N> missing section(s) to <abs-path>?\n\nMissing: <comma-separated canonical names>`
- `header`: `Append?`
- `multiSelect`: `false`
- `options`:
  - `{ label: "Append", description: "Append the missing canonical sections beneath a <!-- generacy-cockpit:appended --> marker." }`
  - `{ label: "Cancel", description: "Do not modify the file. Exit non-destructively." }`

The prompt is presented exactly once per invocation. Any free-text `Other` response is treated as `Cancel` (the safe outcome) — the command does NOT interpret free-text edits to the prompt.

#### Step 8.5: `Append` outcome

Build the appended block as a strict suffix-extension of the existing file:

1. Read the existing file content verbatim into memory.
2. If the file does **not** already end with a blank line (i.e., its content ends with `\n` but not `\n\n`), ensure exactly one blank line precedes the marker line by appending a single `\n` before the marker.
3. Append the marker line on its own line, exactly: `<!-- generacy-cockpit:appended -->`. The marker is appended **once per run**, regardless of how many sections are appended. Multiple separate runs each append their own marker line; markers are never deduplicated.
4. For each canonical section in the missing list (in canonical order), append:
   - one blank line, then
   - `## <Canonical Name>`, then
   - one blank line, then
   - the canonical placeholder hint (see hint table below).
5. Sections appended in the same run are separated from each other by exactly one blank line; the block as a whole ends with a single trailing newline.
6. **No existing byte above the marker may be modified, truncated, or reordered.** This is a strict suffix-extension.

**Hint table** (each hint MUST appear verbatim in the appended section, matching the US1 skeleton):

| Canonical                   | `<!-- TODO: … -->` hint                                                                                                                                |
|-----------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| `Context`                   | `<!-- TODO: Why this epic exists. The problem statement, the prior art, and the user/business impact. -->`                                            |
| `Goals`                     | `<!-- TODO: What success looks like. Concrete, measurable outcomes — not implementation tasks. -->`                                                    |
| `Non-Goals`                 | `<!-- TODO: Explicit out-of-scope statements. What we will NOT do in this epic. -->`                                                                  |
| `Phases`                    | `<!-- TODO: The sequenced phases (P1, P2, …) and what lands in each. Cross-link to child issues / specs. -->`                                          |
| `Ownership / Isolation`     | `<!-- TODO: Per-phase or per-child-issue isolation boundaries — which package, file, or surface each piece owns. -->`                                 |
| `Sequencing & Dependencies` | `<!-- TODO: Dependency graph between child issues. What blocks what; what can land in parallel. -->`                                                  |
| `Risks`                     | `<!-- TODO: Known risks, their impact, and the mitigation strategy. -->`                                                                              |
| `Open Questions`            | `<!-- TODO: Unresolved questions blocking progress; link to any clarification issues / threads. -->`                                                  |

After the write, emit:

```
appended <N> section(s) to: <abs-path>
```

Exit `0`. `<N>` is the count of missing sections appended in this run.

#### Step 8.6: `Cancel` outcome

Emit:

```
planning doc not modified: <abs-path>
```

Exit `0`. Do not write. The file is byte-identical to its pre-invocation state.

#### Step 8.7: `AskUserQuestion` unavailable — non-interactive fallback

If `AskUserQuestion` is not reachable in the current runtime (non-interactive automation context), emit:

```
missing sections: <comma-separated canonical names>; cannot prompt for append in non-interactive context — no changes made to <abs-path>
```

Exit `0`. Do not write. This preserves the non-destructive invariant — the US2 path NEVER writes without explicit conversational confirmation.

## Invariants

These MUSTs and MUST NOTs are the external contract of `/cockpit:plan`. Future edits MUST NOT violate any of them.

### MUST

1. **Never overwrite**: MUST NOT modify any byte of an existing `docs/epic-<slug>-plan.md` outside of append-only writes preceded by the `<!-- generacy-cockpit:appended -->` marker (FR-005, SC-002).
2. **Human-led**: MUST NOT advance any gate via `generacy cockpit advance`, MUST NOT post comments on the epic issue, MUST NOT call any cockpit CLI verb (FR-006).
3. **Deterministic path**: the output path is `<cwd>/docs/epic-<slug>-plan.md`. Identical inputs always produce identical paths (FR-004).
4. **Append-only assist**: in US2, append happens only after explicit `AskUserQuestion` confirmation, and only beneath the marker line (FR-005, clarification Q3).
5. **Conversational confirmation**: the US2 prompt MUST use `AskUserQuestion` with `Append` and `Cancel` choices — no `--apply` flag, no two-step round-trip (clarification Q3).
6. **Case-insensitive heading match + alias table**: the comparator MUST be case-insensitive and MUST honor at least the aliases `Goals ↔ Objectives` and `Non-Goals ↔ Out of Scope` / `Out-of-Scope` (clarification Q4).
7. **Markdown metadata block, not YAML**: the metadata under H1 MUST be `**Epic**: …  ·  **Phase**: …  ·  **Tier**: …` — NOT YAML front-matter, NOT an HTML comment (clarification Q5).
8. **Absolute path in success output**: every `<abs-path>` value emitted in status lines MUST be absolute (FR-007).

### MUST NOT

1. MUST NOT overwrite, truncate, or reorder any existing content in `docs/epic-<slug>-plan.md`.
2. MUST NOT call `gh issue comment`, `gh pr *`, `generacy cockpit advance`, or any other state-mutating CLI verb.
3. MUST NOT clone, fetch, or write files outside the current working tree.
4. MUST NOT silently rewrite a developer-provided `slug:` value — use it verbatim or exit non-zero on invalid characters.
5. MUST NOT prompt the user via `AskUserQuestion` on the US1 fresh-write path — the write is unambiguous.
6. MUST NOT advance, retry, or background any work after the file write.

## Output discipline

One terse status line per outcome. No multi-line narration, no deliberation summaries.

| Outcome                              | Status line (verbatim)                                                                                                              | Exit |
|--------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|------|
| Empty `$ARGUMENTS`                   | `Usage: /cockpit:plan <epic-ref>` + newline + `  <epic-ref>  bare issue number (e.g. 356) or owner/repo#N (e.g. generacy-ai/agency#356)` | 0    |
| Parse error                          | `invalid epic-ref: <raw value>`                                                                                                      | !0   |
| `gh` failure                         | (gh stderr verbatim) then `failed to resolve epic <ref>`                                                                              | !0   |
| Slug — invalid chars                 | `slug contains invalid characters: <slug>`                                                                                            | !0   |
| Slug — empty after normalization     | `could not derive slug from title: <title> — add a slug: line to the epic body`                                                       | !0   |
| US1 success                          | `wrote planning skeleton: <abs-path>`                                                                                                 | 0    |
| US2 already complete                 | `planning doc already complete: <abs-path>`                                                                                           | 0    |
| US2 append confirmed                 | `appended <N> section(s) to: <abs-path>`                                                                                              | 0    |
| US2 append cancelled                 | `planning doc not modified: <abs-path>`                                                                                               | 0    |
| US2 non-interactive fallback         | `missing sections: <list>; cannot prompt for append in non-interactive context — no changes made to <abs-path>`                       | 0    |

Exit code `0` for any non-destructive outcome (including US2 cancel, US2 already-complete, US2 non-interactive fallback, and Usage on empty args). Non-zero only for parse errors, `gh` failures, and slug failures.

## Post-Command Check

**IMPORTANT**: If this command was invoked as part of a larger workflow:

1. This command's completion is NOT the end of the workflow.
2. Check your todo list — there WILL be remaining tasks.
3. You MUST immediately proceed to the next task in your todo list.
4. Do NOT output a final response or wait for user input.

Continue NOW with the parent workflow.
