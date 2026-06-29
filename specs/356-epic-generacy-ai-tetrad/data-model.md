# Data Model: /cockpit:plan command

**Feature**: 356-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This feature ships one markdown file. The "data model" is the shape of six things it reads/writes:
1. The slash-command argument model (what the user types).
2. The `gh issue view` JSON output (what the command parses).
3. The slug derivation rule (how the path is computed).
4. The section comparator (how US2 detects missing sections).
5. The append-decision payload (`AskUserQuestion` input/output).
6. The status output the user sees.

## Entities

### E1: Command-argument model

The argument accepted by `/cockpit:plan`.

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `epic-ref` | string (positional) | yes | — | Either a bare positive integer (`356`) or a fully-qualified `owner/repo#N` (`generacy-ai/agency#356`). No flags. |

**Validation rules**:
- Empty `$ARGUMENTS` → print usage line (see E6), exit `0` (non-destructive per FR-008).
- Bare form: MUST match `^\d+$` and be a positive integer.
- Qualified form: MUST match `^[^/\s]+/[^/\s#]+#\d+$`.
- Any other shape → exit non-zero with `invalid epic-ref: <raw value>` (parse-error format per FR-008).
- Bare refs resolve against `gh`'s current-repo default; the command MUST NOT attempt to resolve against `MONITORED_REPOS` or any cockpit config (out of scope; clarification Q1 fixes this).

### E2: `gh issue view` output schema

The JSON shape consumed by `plan.md` from `gh issue view <ref> --json title,body`.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `title` | string | yes | The raw epic title (may include `Epic:` prefix or `[…]` brackets). Used for slug derivation if no explicit `slug:` is present in the body. |
| `body` | string | yes | The full epic body as markdown. May contain `slug:`, `Phase:`, and `Tier:` lines anywhere; parser extracts them by line-prefix match. |

**Extraction patterns** (applied to `body`):

| Field | Regex (case-insensitive, anchored to line start) | Notes |
|-------|---------------------------------------------------|-------|
| `slug` | `^\s*slug:\s*(\S+)\s*$` | Used verbatim if matched. The match value MUST be a valid slug character set (alphanumeric + `-`); if it contains `/`, `\`, or whitespace, the command exits with `slug contains invalid characters: <slug>`. |
| `phase` | `^\s*(?:\*\*)?Phase(?:\*\*)?:\s*(.+?)\s*$` | Tolerates bold-wrapped keys (`**Phase**:`) seen in real epic bodies. Captured value may include digits, dots, spaces. |
| `tier` | `^\s*(?:\*\*)?Tier(?:\*\*)?:\s*(.+?)\s*$` | Same tolerance as `phase`. |

If a key matches multiple times in the body, the **first** occurrence wins.

**Validation rules**:
- If `gh issue view` exits non-zero, surface stderr verbatim and exit non-zero (FR-009).
- Missing `title` or `body` (i.e., `gh` returned `null` for either) → exit with `epic <ref> returned no title/body — check the issue exists and is accessible`.
- All metadata fields are optional; missing fields produce no metadata block (D7) or a partial block (`**Epic**: <ref>  ·  **Phase**: <found>` if only `phase` was found).

### E3: Slug derivation rule

Applied in order; the first matching branch wins.

| Step | Input | Output |
|------|-------|--------|
| 1 | If E2 yielded a `slug:` value | use it verbatim (after invalid-character validation per E2). |
| 2 | Otherwise, take E2 `title` | apply the normalization chain below. |

**Normalization chain** (each step's output feeds the next):

1. Strip a leading `Epic:` prefix (case-insensitive, with or without trailing space).
2. Strip a leading `Epic ` prefix (case-insensitive).
3. Strip a leading `[...]` bracket prefix (the first bracket pair only; do not recurse).
4. Lowercase.
5. Replace every non-alphanumeric character with `-`.
6. Collapse runs of `-` to a single `-`.
7. Trim leading/trailing `-`.
8. If length > 60, truncate at the **last `-` boundary at or before index 60**. (If no `-` exists at or before index 60, truncate at index 60.)

**Examples**:

| Input | After step 1–3 | After step 4–6 | After step 7–8 |
|-------|----------------|-----------------|-----------------|
| `Epic: Cockpit` | `Cockpit` | `cockpit` | `cockpit` |
| `[cockpit] /cockpit:plan command` | `/cockpit:plan command` | `-cockpit-plan-command` | `cockpit-plan-command` |
| `Epic Cockpit: A very long title that exceeds the sixty character cap easily` | `Cockpit: A very long title that exceeds the sixty character cap easily` | `cockpit-a-very-long-title-that-exceeds-the-sixty-character-cap-easily` | `cockpit-a-very-long-title-that-exceeds-the-sixty` (truncated at last `-` boundary ≤ 60) |

**Validation rules**:
- The final slug MUST be non-empty. If the normalization chain produces an empty string (e.g., title is `Epic: [...]`), exit with `could not derive slug from title: <title> — add a slug: line to the epic body`.
- The final slug MUST NOT contain `/`, `\`, or whitespace (guarded both by the regex in step 5 and by E2's invalid-character check when `slug:` is explicit).

### E4: Section comparator (US2 missing-section detection)

The comparator that decides whether each canonical section is "present" in an existing planning doc.

**Canonical sections** (in order; this is the same list as the skeleton — see `contracts/planning-doc.contract.md`):

1. `Context`
2. `Goals`
3. `Non-Goals`
4. `Phases`
5. `Ownership / Isolation`
6. `Sequencing & Dependencies`
7. `Risks`
8. `Open Questions`

**Alias table** (extensible; initial entries only):

| Canonical | Aliases (case-insensitive, exact text) |
|-----------|----------------------------------------|
| `Goals` | `Objectives` |
| `Non-Goals` | `Out of Scope`, `Out-of-Scope` |
| (others) | (none) |

**Algorithm**:

1. Parse the existing doc's H2 headings: every line matching `^##\s+(.+?)\s*$` (no leading indent, no trailing punctuation considered part of the heading).
2. Normalize each parsed heading: lowercase, trim whitespace, trim trailing `:` if present.
3. For each canonical section in order:
   - Compute the canonical-normalized name (lowercase, trim).
   - Compute the alias-normalized set (lowercase, trim each alias).
   - If any parsed heading equals the canonical-normalized name OR any alias-normalized value → mark the canonical section "present."
   - Otherwise → "missing."
4. The set of missing canonical sections, in canonical order, is the result.

**Validation rules**:
- Parsing MUST ignore code-fenced lines (lines inside triple-backtick blocks) — H2 headings inside code samples MUST NOT count as present. (Best-effort: track a `in_code_block` boolean; toggle on `^````.)
- The comparator MUST be deterministic — same input doc + same canonical list always produces the same missing-section list.

### E5: `AskUserQuestion` payload (US2 append prompt)

The structured prompt presented to the developer when US2 detects missing sections.

**Input** (constructed by `plan.md`):

| Field | Value |
|-------|-------|
| `question` | `Append <N> missing section(s) to <abs-path>?\n\nMissing: <comma-separated canonical names>` |
| `header` | `Append?` |
| `multiSelect` | `false` |
| `options` | `[{ label: "Append", description: "Append the missing canonical sections beneath a <!-- generacy-cockpit:appended --> marker." }, { label: "Cancel", description: "Do not modify the file. Exit non-destructively." }]` |

**Output** (the developer's choice):

| Choice | Action |
|--------|--------|
| `Append` | Append the missing canonical sections (in canonical order) beneath a single `<!-- generacy-cockpit:appended -->` marker line. Each appended section is `## <Canonical Name>` followed by a one-line placeholder hint (same hints as in the US1 skeleton — see `contracts/planning-doc.contract.md`). |
| `Cancel` | Exit `0` with `planning doc not modified: <abs-path>`. |
| `Other` (free-text) | Treat as `Cancel`. The command does NOT interpret free-text edits to the prompt. |

**Validation rules**:
- The command MUST present the prompt exactly once per invocation; subsequent runs re-prompt (no persistent decision memory).
- If `AskUserQuestion` is not reachable (non-interactive context), the command MUST emit `missing sections: <list>; cannot prompt for append in non-interactive context — no changes made to <abs-path>` and exit `0`. This preserves the non-destructive invariant.

### E6: Slash-command status output (stdout to user)

The terse status lines emitted by `plan.md`.

| Phase | Output (example) |
|-------|------------------|
| Usage (empty `$ARGUMENTS`) | `Usage: /cockpit:plan <epic-ref>\n  <epic-ref>  bare issue number (e.g. 356) or owner/repo#N (e.g. generacy-ai/agency#356)` |
| Parse error | `invalid epic-ref: <raw value>` |
| `gh` failure | (gh stderr verbatim, then) `failed to resolve epic <ref>` |
| Slug failure | `could not derive slug from title: <title> — add a slug: line to the epic body` OR `slug contains invalid characters: <slug>` |
| US1 success | `wrote planning skeleton: <abs-path>` |
| US2: already complete | `planning doc already complete: <abs-path>` |
| US2: append confirmed | `appended <N> section(s) to: <abs-path>` |
| US2: append cancelled | `planning doc not modified: <abs-path>` |
| US2: non-interactive fallback | `missing sections: <list>; cannot prompt for append in non-interactive context — no changes made to <abs-path>` |

**Validation rules**:
- Exit code: `0` for any non-destructive outcome (including US2 cancel, US2 already-complete, US2 non-interactive fallback, and `Usage:` empty-args). Non-zero only for parse errors, `gh` failures, and slug failures.
- All `<abs-path>` outputs MUST be absolute (FR-007).
- No multi-line narrative summaries between status lines.

## Relationships

```
User
 │ types /cockpit:plan <epic-ref>
 ▼
E1: argument model
 │ validate; on empty → E6 Usage, exit 0
 │ on malformed → E6 parse error, exit non-zero
 ▼
gh issue view <ref> --json title,body
 │ on failure → E6 gh failure, exit non-zero
 ▼
E2: title + body
 │ extract slug / phase / tier from body
 ▼
E3: slug derivation
 │ on empty/invalid slug → E6 slug failure, exit non-zero
 ▼
target_path = <cwd>/docs/epic-<slug>-plan.md
 │ branch on file existence
 ├─► does not exist (US1)
 │     │ write skeleton (contracts/planning-doc.contract.md)
 │     ▼
 │   E6: wrote planning skeleton, exit 0
 │
 └─► exists (US2)
       │ parse existing H2s; run E4 comparator
       ▼
     missing = E4(existing_headings, canonical_sections)
       │
       ├─► missing.empty
       │     ▼
       │   E6: planning doc already complete, exit 0
       │
       └─► missing.nonEmpty
             │ E5 prompt via AskUserQuestion
             ▼
             ├─► Append    → append under marker → E6: appended N section(s), exit 0
             ├─► Cancel    → E6: planning doc not modified, exit 0
             └─► (AskUserQuestion unavailable) → E6: non-interactive fallback, exit 0
```

## Cross-document invariants

- The canonical section list (E4) MUST stay in lockstep with `contracts/planning-doc.contract.md`. The skeleton's section order is the comparator's canonical order — there is one source of truth.
- The alias table (E4) lives inside `plan.md`. Any change to the table is a change to `plan.md` and to this document; the two MUST be edited together.
- The slug derivation rule (E3) MUST match FR-004 verbatim. Any change requires re-clarifying with the user.
- The `AskUserQuestion` payload (E5) MUST present `Append` and `Cancel` as the two named options; any free-text "Other" response defaults to `Cancel` (the safe outcome).
- The command MUST never write when the existing file's hash would change to overwrite content — append-only is enforced by the algorithm in E4 + the marker convention in `contracts/planning-doc.contract.md`.
