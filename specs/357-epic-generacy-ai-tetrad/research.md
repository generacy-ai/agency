# Research: /cockpit:breakdown command

**Feature**: 357-epic-generacy-ai-tetrad
**Date**: 2026-06-29

## Decisions

### D1: The decomposition travels through the epic doc, not as a CLI argument

**Decision**: `/cockpit:breakdown` writes the approved decomposition into a bounded section of the epic doc, then calls `generacy cockpit manifest init/sync <epic-ref>`. The manifest CLI parses the section using tetrad-development#790's grammar. There is no JSON / flag / stdin path that bypasses the doc.

**Rationale**:
- Clarification Q1 chose option D (refined): "via the epic doc, not a direct data pass."
- One source of truth. The epic doc is the human-readable record; the manifest is the machine-readable derivative. Routing the decomposition through the doc keeps them aligned by construction — there is no second JSON schema the slash command must maintain in lockstep with the engine.
- Idempotency falls out for free. `manifest sync` re-parses the (unchanged) section and produces an empty diff — the SC-002 no-op re-run property is enforced by `Edit`'s "no change" semantics on the doc, not by command logic.
- Future-proof. New `cockpit:*` verbs (or third-party tools) that want to author or re-author the section can do so without needing to learn the engine's CLI surface — they just edit the markdown between the markers.

**Alternatives considered**:
- (A) CLI flags / positional args. Rejected per Q1 — would require a second schema; large decompositions don't fit nicely on a shell line.
- (B) JSON on stdin. Rejected per Q1 — the engine would need to validate a schema *and* parse the doc grammar; pick one.
- (C) Temp file path. Rejected per Q1 — extra fs lifecycle for no gain; the doc itself is the file.

### D2: Section markers are section-scoped (`cockpit:phase-decomposition:*`), not verb-scoped

**Decision**: The bounded section is delimited by `<!-- cockpit:phase-decomposition:start -->` and `<!-- cockpit:phase-decomposition:end -->`. The strings are stable, verbatim, and verb-agnostic.

**Rationale**:
- Clarification Q2 chose option B.
- Section-scoped means any future tool — the manifest CLI, a refactor verb, a third-party doctor — can locate and replace the section without caring which verb wrote it. Verb-scoping (`cockpit:breakdown:*`) would couple the doc's structure to a single command.
- "Verbatim" is non-negotiable: a regex on `<!-- cockpit:phase-decomposition:start -->` (exact bytes, single space inside the comment, no trailing whitespace) is the only contract. Variations (e.g., `<!--cockpit:phase-decomposition:start-->` without spaces) MUST be treated as no match — otherwise the engine's parse and the slash command's replace will silently disagree.

**Alternatives considered**:
- (A) Verb-scoped (`cockpit:breakdown:*`). Rejected per Q2 — locks the section's identity to whichever verb authored it.
- (C) Engine-scoped with id attribute (`generacy:manifest:start id="<epic-ref>"`). Rejected per Q2 — over-specifies; the doc already identifies its epic via filename and headings. Embedding the epic ref in the marker invites drift on rename.

### D3: Edit affordance is free-form chat re-draft

**Decision**: When the developer chooses `edit`, the assistant re-drafts the proposal from natural-language feedback (e.g., "merge phase 2 and 3", "rename P1 to 'Foundations'") and re-presents `approve / edit / reject`. No temp file, no structured re-prompt.

**Rationale**:
- Clarification Q3 chose option A.
- Matches how this epic's own breakdown was iterated. The interaction is conversational by nature; serializing it through a file editor or a discrete-edit micro-DSL is friction for no gain.
- Keeps the command's state model trivial: the only persisted state is the most recent draft, held in chat context. There is no temp file to garbage-collect, no edit-mode state machine to recover from.
- Re-presentation MUST always reset the affordance set to `approve / edit / reject` — the developer never falls into a "you've already edited once" mode.

**Alternatives considered**:
- (B) File-based edit. Rejected per Q3 — requires a temp-file lifecycle (write, watch, re-read) for a multi-turn interaction the chat already supports natively.
- (C) Structured re-prompt (add/remove/rename). Rejected per Q3 — high friction for free-form intent ("simplify the last phase"); the LLM is already a competent re-drafter.

### D4: First-run section placement is literal end-of-file

**Decision**: On the first run (no existing markers in the doc), the section is appended at end-of-file. On subsequent runs (markers present), the section is replaced in place between the markers, wherever they are.

**Rationale**:
- Clarification Q4 chose option A.
- Determinism without heuristics. "End of file" is unambiguous; "after a `## Phases` heading if present, else end of file" introduces a branching rule and a parsing dependency on doc structure.
- The stable markers (D2) make subsequent in-place replacement deterministic *wherever* the section lands. A developer who wants the section to live in a specific spot can hand-move it after the first run; the markers carry the section's identity, not its position.
- No heading scanning, no anchor logic, no surprise insertions mid-document. The slash command does one thing: locate markers (or, on first run, append).

**Alternatives considered**:
- (B) After known anchor heading. Rejected per Q4 — heuristic; brittle across doc styles.
- (C) Engine-decided splice point. Rejected per Q4 — pushes doc-structure decisions into the engine, which only cares about the section's bytes.

### D5: Phase IDs are sequential `P<n>` short codes starting at `P1`

**Decision**: Phases in the proposal are identified by `P1`, `P2`, `P3`, … in order. The slash command assigns IDs at draft time; they are preserved verbatim in the doc section and consumed unchanged by the manifest CLI.

**Rationale**:
- Clarification Q5 chose option A.
- Matches the convention already in use across parent epic docs (e.g., issue #357 itself is "Phase: P4 | Issue: A4.2"). Consistency across epic + per-issue + manifest reduces cognitive load.
- Aligns with tetrad-development#790's `P<n>` phase identity. The engine's grammar treats `P<n>` as the stable phase id.
- Sequential numbering is stable under append (`P5` is always the fifth phase) and unambiguous on re-draft (a `merge P2 and P3` instruction renumbers everything after; the developer sees the renumbered draft before approval).

**Alternatives considered**:
- (B) Kebab-case slugs from the title. Rejected per Q5 — slugs drift on title edits; `foundations` becomes `foundation` becomes `core-foundation` and the manifest can't track identity across re-draft. Numbers are identity-stable.
- (C) Engine-assigned (blank `id` in proposal). Rejected per Q5 — splits the naming authority between the slash command and the engine; the doc section would be unreadable until after the CLI call.

### D6: Output discipline — terse status lines, no chatty summaries

**Decision**: The command emits short status lines for each phase transition (`Resolved <epic-ref> → docs/epic-cockpit-plan.md`, `Drafting proposal…`, `Awaiting approval`, `Approved`, `Wrote section (appended)` or `Wrote section (in-place replace)`, `Manifest: init` or `Manifest: sync`, `Done ✓`). No trailing summaries, no narration of internal deliberation.

**Rationale**:
- Matches the project-wide tone-and-style guidance in CLAUDE.md.
- Matches sibling cockpit verbs (see `merge.md`, `clarify.md`).
- The *proposal itself* is the only multi-line output the user reads — keeping the framing terse keeps the focus there.

**Alternatives considered**:
- Verbose log mode. Rejected — out of scope for v1; add later via `--verbose` if a real need surfaces.

## Implementation Patterns

### P1: Slash-command frontmatter mirrors sibling commands

- Use the YAML frontmatter convention from `packages/claude-plugin-cockpit/commands/merge.md` and `packages/claude-plugin-agency-spec-kit/commands/specify.md`: `description`, `arguments[]` with `name`, `description`, `required`.
- Declare one positional argument (`epic`) and no flags in v1. (`--no-confirm`, `--dry-run`, `--manifest-only`: all explicitly out of scope; can be added later without breaking the v1 contract.)

### P2: Idempotent doc write + CLI invocation

- Each run reads the doc fresh, drafts (or re-drafts), and on approval performs at most one Edit (replace between markers) or Append (end-of-file). No partial writes; no rollback complexity.
- The manifest CLI MUST be idempotent under repeated `sync` against an unchanged section: SC-002 (no-op re-run = empty diff) depends on it. The slash command MUST NOT add its own "should I call sync?" guard — always invoke; let the CLI decide there's nothing to do.

### P3: Markers as the only invariant

- The replace path looks for the *exact* marker strings (D2). No regex tolerance for whitespace, casing, or attribute insertion.
- If the start marker is present without the end marker (or vice versa), treat the doc as corrupt: emit `Stopped: doc has unmatched phase-decomposition marker — fix manually before re-running` and exit non-zero. Do NOT attempt to repair.
- If multiple start markers are present, same handling: stop with a "doc has duplicate markers" message.

### P4: Approval loop is the only branching point

- `approve` → write + CLI call + done.
- `edit` → re-draft from feedback + re-present (loop).
- `reject` → exit non-zero, no doc change, no CLI call. The doc is left exactly as it was.

### P5: Section grammar is grammar-checked before presentation

- The drafted section's markdown MUST conform to `contracts/breakdown-doc-section.contract.md` (which mirrors tetrad-development#790's grammar) *before* being shown to the developer. Catching shape errors at draft time avoids the failure mode where the developer approves something the CLI can't parse.
- Re-drafts after `edit` are also grammar-checked before re-presentation.

## Key Sources / References

- `specs/357-epic-generacy-ai-tetrad/spec.md` — feature requirements and acceptance criteria.
- `specs/357-epic-generacy-ai-tetrad/clarifications.md` — answered questions Q1–Q5.
- `packages/claude-plugin-cockpit/commands/merge.md` — sibling command; frontmatter + decision-tree pattern.
- `packages/claude-plugin-cockpit/commands/clarify.md` — sibling command; resolver pattern + read-fetch-present-approve flow.
- `packages/claude-plugin-cockpit/` — scaffold landed in #350 (A1.4); provides the namespace and `commands/` directory.
- Issue G3.1 — `generacy cockpit manifest init/sync` CLI verb (consumes the bounded section).
- Issue #788 — shared issue/epic resolver (resolves the positional `epic` argument).
- tetrad-development#790 — phase-decomposition grammar inside the bounded section.
- `docs/epic-cockpit-plan.md` in `tetrad-development` (P4 / A4.2) — parent epic context.
