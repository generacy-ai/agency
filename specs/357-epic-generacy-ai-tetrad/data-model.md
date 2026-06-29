# Data Model: /cockpit:breakdown command

**Feature**: 357-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This feature ships one markdown file. The "data model" is the shape of the things it reads, drafts, writes, and invokes:

1. The slash-command argument model (what the user types).
2. The proposal model (what the assistant drafts and shows the developer).
3. The doc-section model (what gets written into the epic doc on approval).
4. The manifest CLI invocation (what's shelled out to after the doc write).
5. The slash-command status report (terse stdout to the user).

## Entities

### E1: Command-argument model

The arguments accepted by `/cockpit:breakdown`.

| Field | Type | Required | Default | Notes |
|-------|------|----------|---------|-------|
| `epic` | string (positional) | yes | — | Epic reference (e.g., `tetrad-development#85`, `85`, an epic key). Resolved via the shared resolver from #788 to `{ epic_ref, doc_path, repo }`. |

**No v1 flags.** `--no-confirm`, `--dry-run`, `--manifest-only` are explicitly out of scope; the v1 command always confirms with the developer and always writes the doc + invokes the CLI on approval. Future flags can be added without breaking the v1 contract.

**Validation rules**:
- `epic` MUST resolve to exactly one epic doc via #788. Zero or multiple matches → terminate with an actionable error before any draft work.
- `doc_path` returned by the resolver MUST point to a file that exists and is writable in the workspace context (the epic doc typically lives in a sibling repo like `tetrad-development`).

### E2: Proposal model (in-chat, not persisted)

The structured shape the assistant drafts and re-drafts during the approval loop. Lives only in chat context; never serialized to disk.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `epic_ref` | string | yes | Echoed from E1 for human review (e.g., `tetrad-development#85`). |
| `phases` | array of `Phase` | yes | Ordered list; first item is `P1`. |
| `phases[].id` | string | yes | `P<n>`, `n` starting at 1, sequential. Per clarification Q5. |
| `phases[].title` | string | yes | Short human-readable title (e.g., "Foundations", "Manifest Writer"). |
| `phases[].summary` | string | yes | One-sentence description of the phase's purpose. |
| `phases[].issues` | array of `Issue` | yes | Per-phase issue list. Empty array is allowed for placeholder phases but discouraged. |
| `phases[].issues[].slug` | string | yes | Short identifier (e.g., `A4.2`, `G3.1`) matching parent-epic-doc convention. |
| `phases[].issues[].title` | string | yes | Short issue title. |
| `phases[].issues[].summary` | string | yes | One-sentence description. Acceptance / dependencies optional, added when known. |

**Validation rules**:
- `phases[].id` MUST be `P<n>` (n ≥ 1), sequential without gaps. The slash command assigns IDs at draft time and re-numbers on every re-draft.
- `phases` MUST be non-empty (at least `P1`).
- Each issue's `slug` SHOULD follow the parent-epic-doc convention (`A`/`G`/`P` prefix + phase digit + sub-index, e.g., `A4.2`). The slash command picks consistent slugs but does not enforce — humans can rename in `edit`.
- The proposal MUST grammar-check against the doc-section contract (see E3 / `contracts/breakdown-doc-section.contract.md`) *before* being presented. Failed draft → silently re-draft until shape is valid.

### E3: Doc-section model (what gets written into the epic doc)

The markdown body that lives between `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->`. Per clarification Q1, this is the *only* path by which the decomposition reaches the manifest CLI.

**Shape** (the slash command emits, the manifest CLI parses):

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

The exact grammar (heading levels, em-dash vs hyphen, list-item shape, etc.) is owned by `contracts/breakdown-doc-section.contract.md` and tetrad-development#790. The slash command MUST emit conformant shape on first draft and on every re-draft.

**Validation rules**:
- The section MUST open with `<!-- cockpit:phase-decomposition:start -->` on its own line and close with `<!-- cockpit:phase-decomposition:end -->` on its own line. No surrounding whitespace inside the comment.
- Heading levels MUST follow the contract (`##` for the section title, `###` for each phase).
- Phase IDs MUST appear in the `### P<n> — <title>` heading verbatim (not in attributes, not in list items).
- Issue list items MUST use `- **<slug>** — <title>. <summary>` shape so the engine's regex can extract `slug`, `title`, `summary`.
- A section that fails to grammar-check MUST NOT be written. Re-draft instead.

### E4: Manifest CLI invocation

Shelled-out call after a successful doc write.

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Command | string | yes | `generacy cockpit manifest init <epic-ref>` (no existing manifest) or `generacy cockpit manifest sync <epic-ref>` (manifest exists). The slash command picks based on whether a previous `init` has been observed for this epic — detected by attempting `sync` first and falling back to `init` on a specific stderr signal (or, if the CLI exposes a `manifest exists?` query, use it). |
| stdout | string | optional | Human-readable summary; passed through to the status report as a trailing line. |
| stderr | string | optional | On non-zero exit, surfaced verbatim. |
| exit code | int | yes | `0` = success; non-zero = surface stderr + exit non-zero. |

**Idempotency invariant**: a no-op `sync` (re-run with no section change) MUST exit `0` with zero or one-line stdout and produce no diff anywhere. SC-002 depends on this.

**Validation rules**:
- The CLI invocation MUST be the FIRST mutation the slash command performs after the doc write. The doc write and CLI call are serial, not parallel.
- On non-zero CLI exit, the slash command MUST NOT roll back the doc write — the doc is the source of truth, and a failed `sync` is recoverable by re-invoking the CLI directly (`generacy cockpit manifest sync <epic-ref>`). Roll-back would re-introduce the very drift the section is supposed to eliminate.

### E5: Slash-command status report (stdout to user)

The terse status lines emitted by `breakdown.md`.

| Phase | Output (example) |
|-------|------------------|
| Resolution | `Resolved tetrad-development#85 → docs/epic-cockpit-plan.md` |
| Draft | `Drafting proposal…` |
| Present | (proposal markdown is the body; no framing line) |
| Approval prompt | `Approve, edit, or reject?` |
| Edit (re-draft) | `Re-drafting from feedback…` |
| Approval received | `Approved` |
| Doc write (append) | `Wrote section (appended at EOF)` |
| Doc write (replace) | `Wrote section (in-place replace)` |
| CLI call | `Manifest: init` or `Manifest: sync` |
| Done | `Done ✓` |
| Reject | `Stopped: rejected — no doc change, no CLI call` |
| Resolver fail | `Stopped: no epic doc found for <ref>` |
| Doc corrupt | `Stopped: doc has unmatched / duplicate phase-decomposition markers — fix manually before re-running` |
| CLI fail | `Stopped: manifest CLI failed — <stderr first line>` |

**Validation rules**:
- One status line per phase transition. No multi-line narrative summaries (except the proposal body itself).
- Exit code `0` only on `Done ✓`. Every stop state exits non-zero.
- The proposal body is shown verbatim (no smart re-formatting between draft and presentation) so the developer sees exactly what will be written.

## Relationships

```
User
 │ types /cockpit:breakdown <epic>
 ▼
Command-argument model (E1)
 │ epic → #788 resolver → { epic_ref, doc_path, repo }
 ▼
Read doc_path
 │
 │ find markers (E3)
 ├─► markers present  → capture existing section body + offsets (re-draft mode)
 └─► markers absent   → first-run mode (append at EOF)
 │
 ▼
Draft proposal (E2)
 │ grammar-check against E3
 │ present to developer
 ▼
Approval loop
 ├─► approve → fall through
 ├─► edit    → re-draft from feedback → re-present
 └─► reject  → E5 "Stopped: rejected", exit non-zero
 │
 ▼
On approve:
 │ render proposal → doc-section (E3)
 │ Edit (replace between markers) OR append-at-EOF
 ▼
Bash: generacy cockpit manifest init|sync <epic-ref>
 │ stdout / exit code
 ▼
E5: "Manifest: <init|sync>", "Done ✓" (or stop with stderr on failure)
```

## Cross-document invariants

- The doc-section shape (E3) and the grammar in `contracts/breakdown-doc-section.contract.md` (mirroring tetrad-development#790) MUST stay in sync. If #790's grammar changes, both the slash command's draft template and this contract MUST be updated.
- The markers in E3 are verbatim, byte-for-byte. Any tool (this command, future cockpit verbs, the manifest CLI) that reads or writes them MUST use the exact same strings.
- Phase IDs (E2.phases[].id) are sequential `P<n>` and re-numbered on every re-draft. The id is identity for the *draft*; the manifest CLI is the authority on identity in the *manifest* (which may persist stable handles across re-runs by other means — out of scope for this command).
- The slash command MUST NOT call the manifest CLI without first writing the doc section, and MUST NOT write the doc section without prior developer approval.
