---
description: Propose phases + per-phase issues for an epic; iterate via free-form chat until the developer approves; on approval, write the decomposition into the epic doc and call `generacy cockpit manifest init/sync`. Never writes the doc or invokes the CLI without approval.
arguments:
  - name: epic
    description: Epic reference (resolved via the shared resolver to a single epic doc)
    required: true
---

# Cockpit Breakdown

Draft a phase decomposition (ordered `P1`, `P2`, … phases with per-phase issues) for an epic. Iterate with the developer via free-form chat. On approval, write the decomposition into a bounded section of the epic doc and shell out to `generacy cockpit manifest init|sync <epic-ref>` so the engine materializes the manifest from the doc.

The doc section is the only transport between this command and the manifest CLI; the decomposition is never passed through flags, stdin, or temp files.

## User Input

```text
$ARGUMENTS
```

## Instructions

### 1. Argument resolution

Parse `$ARGUMENTS` into `epic` (positional, required). No v1 flags — `--no-confirm`, `--dry-run`, `--manifest-only` are explicitly out of scope.

**Validation:**

- If `epic` is missing, emit `Usage: /cockpit:breakdown <epic>` and exit non-zero.
- Resolve `epic` via the shared issue/epic resolver (issue #788) to `{ epic_ref, doc_path, repo }`.
  - Zero matches → emit `Stopped: no epic doc found for <epic>` and exit non-zero. Do NOT proceed to any draft work.
  - Multiple matches → emit `Stopped: <epic> resolved to multiple epics: <list> — specify one` and exit non-zero.
- On successful resolution, emit one terse line: `Resolved <epic> → <doc_path>`.

The resolver result `doc_path` MUST point to a file that exists and is writable in the workspace context. Surface any IO error verbatim and exit non-zero.

### 2. Read + locate markers

Read `doc_path` with the Read tool. Locate the two bounded-section markers, verbatim and byte-for-byte (no regex tolerance for whitespace, casing, or attribute insertion):

- Start: `<!-- cockpit:phase-decomposition:start -->`
- End: `<!-- cockpit:phase-decomposition:end -->`

Branch on the observed marker state:

| Markers observed | Mode | Next |
|------------------|------|------|
| Neither start nor end | first-run | will append the section at literal EOF after approval |
| Exactly one start AND exactly one end, in that order | re-draft | will replace the bytes between the markers in place after approval |
| Anything else (start without end, end without start, duplicate start, duplicate end, out-of-order) | corrupt | **stop** |

On the corrupt branch, emit `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running` and exit non-zero. Do NOT attempt to repair the doc, do NOT perform any draft work, do NOT call the manifest CLI.

In re-draft mode, capture the existing body between the markers — useful as a starting point for the first draft so the developer can see what currently lives in the doc before the new proposal lands.

### 3. Draft proposal

Emit `Drafting proposal…`.

Produce a proposal with this shape (in-chat only; never serialized to disk before approval):

- `epic_ref` — echoed from the resolver result (e.g., `tetrad-development#85`).
- `phases` — non-empty, ordered list. Each entry:
  - `id` — `P<n>` where `n` starts at `1` and increments sequentially without gaps. Re-numbered on every re-draft.
  - `title` — short human-readable phase title.
  - `summary` — one sentence describing the phase's purpose.
  - `issues` — ordered list of per-phase issues. Each entry:
    - `slug` — short identifier following the parent-epic-doc convention (`A`/`G`/`P` prefix + phase digit + sub-index, e.g., `A4.2`, `G3.1`).
    - `title` — short issue title.
    - `summary` — one sentence.

Grounding sources, in order: the existing section body (re-draft mode only) → the epic doc body around the section → parent-epic context the developer surfaces in chat. Do NOT fetch external URLs.

**Grammar check — BEFORE presenting:** the drafted proposal MUST conform to the markdown shape in `specs/357-epic-generacy-ai-tetrad/contracts/breakdown-doc-section.contract.md`. If a draft fails the check (e.g., a phase heading missing the `P<n>` token, an issue list item that does not match `- **<slug>** — <title>. <summary>`, gapped phase IDs), silently re-draft until the shape is valid. The developer never sees a malformed draft.

### 4. Approval loop

Present the proposal body **verbatim** — no smart reformatting between the draft and the presentation, so the developer sees exactly what will be written into the doc on approval. The proposal body is the only multi-line output of this command.

Immediately after the proposal, emit:

```
Approve, edit, or reject?
```

Read the developer's reply and route on the verb:

- **`approve`** → fall through to §5.
- **`edit`** → accept the free-form natural-language feedback that follows (e.g., "merge phases 2 and 3", "rename P1 to 'Foundations'", "add an issue under P3 for the resolver"), emit `Re-drafting from feedback…`, re-draft the entire proposal (re-numbering `P<n>` from scratch), grammar-check, and **re-present** the proposal followed by `Approve, edit, or reject?`. The affordance set MUST reset to all three options every time — there is no "you've already edited once" mode. Loop indefinitely until `approve` or `reject`.
- **`reject`** → emit `Stopped: rejected — no doc change, no CLI call` and exit non-zero. Do NOT write the doc. Do NOT call the manifest CLI. The doc is left exactly as it was.
- Anything else → re-prompt `Approve, edit, or reject?` (treat ambiguous replies as a request to clarify the verb).

On `approve`, emit `Approved`.

### 5. Render + write

Render the approved proposal into the doc-section shape from `contracts/breakdown-doc-section.contract.md`. The renderer MUST be deterministic — no timestamps, no machine IDs, no environment-dependent strings — so that a re-run against an unchanged proposal produces a byte-identical body and an empty doc diff.

Rendered shape:

```markdown
<!-- cockpit:phase-decomposition:start -->
## Phase decomposition

### P1 — <title>

<one-sentence summary>

- **<slug>** — <title>. <summary>
- **<slug>** — <title>. <summary>

### P2 — <title>

<one-sentence summary>

- **<slug>** — <title>. <summary>

<!-- cockpit:phase-decomposition:end -->
```

Rules:

- `## Phase decomposition` — exact text, h2.
- `### P<n> — <title>` — h3, em-dash `—` (U+2014) between id and title. `P<n>` starts at `P1`, increments without gaps.
- One blank line between the phase heading and the summary; one blank line between the summary and the issue list; one blank line between phases.
- Issue list items: `- **<slug>** — <title>. <summary>` (bolded slug, em-dash, title period-terminated, one-sentence summary).
- No HTML comments inside the body other than the two bounding markers themselves. No code fences. No nested lists.

Write to `doc_path` using the Edit or Write tool:

- **re-draft mode** (markers present): Edit-replace the bytes between (exclusive of) the start and end marker lines with the rendered body. The markers' position in the doc is preserved. After the write, emit `Wrote section (in-place replace)`.
- **first-run mode** (no markers): Append the full section (markers + body) at literal end-of-file. Do NOT scan for `## Phases` or any other heading anchor; do NOT insert mid-file. After the write, emit `Wrote section (appended at EOF)`.

A re-draft that produces a byte-identical body MUST result in an empty doc diff. If the write tool reports "no change," that is the expected idempotent path — still emit `Wrote section (in-place replace)` for status consistency.

### 6. Manifest CLI invocation

After the doc write completes (and only after), shell out to the manifest CLI via Bash. Try `sync` first; on the specific `manifest not initialized` stderr signal, retry once with `init`.

```bash
generacy cockpit manifest sync <epic_ref>
```

Inspect the result:

| Outcome | Action |
|---------|--------|
| Exit 0 | Emit `Manifest: sync` (with the CLI's stdout summary appended on the same line if it is one line and non-empty). Continue to §7. |
| Non-zero, stderr matches `manifest not initialized` | Retry once with `generacy cockpit manifest init <epic_ref>`. On exit 0, emit `Manifest: init`; continue to §7. On non-zero, fall through to the failure row. |
| Non-zero, any other stderr | Emit `Stopped: manifest CLI failed — <stderr first line>` and exit non-zero. |

The CLI invocation MUST be the only mutation that happens after the doc write, and it MUST happen exactly once per run on the `approve` path. The manifest CLI MUST NOT be invoked on the `reject` path, before the doc write completes, or more than once (the `init` retry counts as part of the same single invocation cycle).

**Do NOT roll back the doc write on CLI failure.** The doc is the source of truth; a failed `sync` is recoverable by re-invoking the CLI directly (`generacy cockpit manifest sync <epic_ref>`). Rolling back would re-introduce the very drift the section is supposed to eliminate.

### 7. Status / done

On the success path (doc write succeeded AND the manifest CLI exited 0), emit `Done ✓` and exit 0. Exit code 0 is reserved for `Done ✓` only.

**Status-line discipline** (one terse line per phase transition; no narration, no trailing summary):

| Phase | Output |
|-------|--------|
| Resolution | `Resolved <epic> → <doc_path>` |
| Draft start | `Drafting proposal…` |
| Present | (the proposal body itself; no framing line) |
| Approval prompt | `Approve, edit, or reject?` |
| Edit (re-draft) | `Re-drafting from feedback…` |
| Approval received | `Approved` |
| Doc write (append) | `Wrote section (appended at EOF)` |
| Doc write (replace) | `Wrote section (in-place replace)` |
| CLI success | `Manifest: init` or `Manifest: sync` |
| Done | `Done ✓` |
| Reject | `Stopped: rejected — no doc change, no CLI call` |
| Resolver fail (zero) | `Stopped: no epic doc found for <epic>` |
| Resolver fail (multi) | `Stopped: <epic> resolved to multiple epics: <list> — specify one` |
| Doc corrupt | `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running` |
| CLI fail | `Stopped: manifest CLI failed — <stderr first line>` |

Every stop state exits non-zero so scripting and `/cockpit:watch` routing stay trivial. The proposal body itself is the only multi-line output the user reads; framing stays terse so the focus stays there.

## Invariants

Per `specs/357-epic-generacy-ai-tetrad/contracts/slash-command.contract.md` §"Behavioral contract". Future edits to this file MUST NOT violate any of these:

### MUST

1. **Approval gates all mutation** — never write the doc section or invoke the manifest CLI before the developer types `approve`.
2. **Stable markers, verbatim** — section is bounded by `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->` exactly. Every read or write touching the section uses these strings byte-for-byte.
3. **First-run placement is end-of-file** — when the doc has no existing markers, the section is appended at literal EOF. No heuristic placement.
4. **In-place replacement on re-run** — when markers exist, the body between them is replaced; the markers' position in the doc is preserved.
5. **Sequential `P<n>` phase IDs** — phases are identified by `P1`, `P2`, … sequential without gaps. Re-numbered on every re-draft.
6. **Grammar-conformant drafts only** — a proposal that fails to grammar-check against `contracts/breakdown-doc-section.contract.md` MUST NOT be presented. Re-draft until valid.
7. **Idempotent no-op re-run** — a re-run that produces a byte-identical body MUST result in an empty doc diff. The renderer is deterministic.
8. **CLI invocation order** — the manifest CLI is invoked exactly once per run, AFTER the doc write, on the `approve` path only.
9. **Free-form edit affordance** — `edit` accepts natural-language feedback and re-drafts; always re-presents `approve / edit / reject` afterward.

### MUST NOT

1. MUST NOT pass the decomposition to the CLI via flags, stdin, or a temp file. The doc section is the only transport.
2. MUST NOT scan for heading anchors (`## Phases`, etc.) to place the section on first run. EOF only.
3. MUST NOT call the manifest CLI on the `reject` path.
4. MUST NOT call the manifest CLI before the doc write completes.
5. MUST NOT attempt to repair a doc with unmatched or duplicate markers — stop with the manual-fix message.
6. MUST NOT roll back the doc write if the manifest CLI fails — the doc is the source of truth, and the CLI is recoverable by direct re-invocation.
7. MUST NOT include timestamps, machine IDs, or other non-deterministic content in the rendered section.
