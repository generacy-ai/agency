# Implementation Plan: /cockpit:breakdown command

**Feature**: `/cockpit:breakdown` slash command that proposes phases + per-phase issues for an epic, lets the developer iterate via free-form chat, then on approval writes the decomposition into a bounded section of the epic doc and calls `generacy cockpit manifest init/sync <epic-ref>` to materialize the manifest
**Branch**: `357-epic-generacy-ai-tetrad`
**Date**: 2026-06-29
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Ship one new file — `packages/claude-plugin-cockpit/commands/breakdown.md` — that defines the `/cockpit:breakdown` slash command. The command takes an epic reference (resolved via the shared resolver from #788) and drafts a phase-decomposition proposal: ordered `P1`, `P2`, … phases each carrying a title, summary, and per-phase issue list. The proposal is presented for developer approval; on `edit`, the assistant re-drafts from natural-language feedback and re-presents `approve / edit / reject` (clarification Q3). On `approve`, the command writes the decomposition into the epic doc inside a section bounded by `<!-- cockpit:phase-decomposition:start -->` … `<!-- cockpit:phase-decomposition:end -->` markers (clarification Q2). First-run placement is end-of-file (clarification Q4); subsequent runs replace in place between the stable markers. After the doc write, the command shells out to `generacy cockpit manifest init/sync <epic-ref>` (clarification Q1) — the engine parses the bounded section using tetrad-development#790's grammar and materializes the manifest. One source of truth (the doc section); no separate JSON schema for the slash command to maintain.

No new TypeScript, no new tests, no MCP coupling — this is a single markdown slash-command file that delegates to the existing CLI verb and the existing Read/Edit/Bash tools. Sibling assumptions (the resolver in #788, the `generacy cockpit manifest` CLI in G3.1, the decomposition grammar in tetrad-development#790) are *consumed*, not authored here.

## Technical Context

**Language/Version**: Markdown (slash command frontmatter + prompt body); the runtime is Claude Code itself
**Primary Dependencies**:
- `generacy cockpit manifest init/sync <epic-ref>` CLI verb (G3.1) — parses the bounded phase-decomposition section in the epic doc and writes/updates the manifest. Must be idempotent: a no-op re-sync against an unchanged section yields no diff.
- Shared issue/epic resolver (#788) — used to resolve the positional `<epic-ref>` argument to a concrete doc path + epic identity.
- tetrad-development#790 — defines the markdown grammar inside the bounded section (heading shape, phase ID prefix, issue list format). The slash command MUST emit shape conformant to that grammar.
- `claude-plugin-cockpit` scaffold (#350 / A1.4, already landed) — provides the namespace and `commands/` directory.
- Standard tools (Read, Edit, Bash) for the doc read / decomposition draft / write / CLI invocation.
**Storage**: Repository files only (one new markdown file in this repo; the command edits an epic doc that lives elsewhere — typically `docs/epic-cockpit-plan.md` in `generacy-ai/tetrad-development`).
**Testing**: Manual — install the plugin, run `/cockpit:breakdown <epic-ref>` against an epic with no existing section (expect end-of-file append), then re-run after editing (expect in-place replacement with stable markers and empty diff on no-op).
**Target Platform**: Claude Code (any OS)
**Project Type**: Monorepo package (static-asset plugin; no build step)
**Performance Goals**: N/A
**Constraints**:
- One file owned: `packages/claude-plugin-cockpit/commands/breakdown.md` (isolation per spec).
- MUST NOT write the doc section or invoke the manifest CLI before developer approval (FR-005).
- MUST use stable markers `<!-- cockpit:phase-decomposition:start -->` … `<!-- cockpit:phase-decomposition:end -->` verbatim (clarification Q2; section-scoped, verb-agnostic so future tools can also locate/replace it).
- MUST use sequential `P<n>` phase IDs starting at `P1` (clarification Q5).
- First-run section placement MUST be literal end-of-file (clarification Q4); subsequent runs MUST replace between markers in place, wherever they live.
- Edit affordance is free-form chat re-draft (clarification Q3) — no temp file, no structured re-prompt.
- The decomposition travels through the doc, NOT through CLI args or stdin (clarification Q1); the manifest CLI is the parser.
**Scale/Scope**: 1 new file (~150–220 lines of markdown), no edits to existing files in this repo.

## Constitution Check

No `.specify/memory/constitution.md` is present in the repo — no gates apply.

## Project Structure

### Documentation (this feature)

```text
specs/357-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (existing, read-only)
├── clarifications.md    # Q1–Q5 answers (existing)
├── plan.md              # This file
├── research.md          # Technology + pattern decisions
├── data-model.md        # Argument model, proposal shape, doc-section grammar shape, status report
├── quickstart.md        # Install + usage + verification steps
├── contracts/
│   ├── breakdown-doc-section.contract.md   # Markdown grammar inside the bounded section (consumed by G3.1 + tetrad-dev#790)
│   ├── manifest-cli.contract.md            # `generacy cockpit manifest init/sync` invocation + exit semantics
│   └── slash-command.contract.md           # Frontmatter + behavior contract for breakdown.md
└── checklists/          # (empty — not generated by this plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
└── commands/
    └── breakdown.md     # NEW — the /cockpit:breakdown slash command (the only deliverable of this issue)
```

**Structure Decision**: Single-file delivery, matching the per-verb isolation model used across Epic Cockpit issues #350–#357 (sibling commands `watch.md`, `status.md`, `clarify.md`, `review.md`, `merge.md` have all landed by this pattern). No edits to `plugin.json` (FR-005 from #350 requires omitting `commands`), no edits to `marketplace.json`, no edits to `README.md`. The loader auto-discovers `breakdown.md` because it lives in the globbed `commands/*.md` path.

## Implementation Phases

### Phase 0: Verify the contracts we depend on

Before writing any markdown, confirm or surface gaps in:

1. **#788 (resolver)**: confirm there's a documented invocation pattern for "resolve epic ref → epic doc path + epic identity (for `manifest init/sync`)." If undocumented, codify the assumed invocation in `contracts/manifest-cli.contract.md` and treat any divergence at integration time as a sibling bug, not a `breakdown.md` bug.
2. **G3.1 (`generacy cockpit manifest init/sync`)**: confirm the invocation shape (`init` vs `sync` distinction, expected stdout/stderr, exit codes for "no bounded section found", "manifest unchanged", "manifest updated"). Codify the assumed contract in `contracts/manifest-cli.contract.md`.
3. **tetrad-development#790 (decomposition grammar)**: confirm the exact markdown shape the engine parses inside the bounded section — heading levels per phase, `P<n>` ID embedding, issue list format. Codify the assumed shape in `contracts/breakdown-doc-section.contract.md` so the slash command's drafted proposals are grammatically conformant by construction.

### Phase 1: Author `breakdown.md`

1. Write frontmatter: `description`, positional `arguments.epic` (required). No flags in v1 (no `--no-confirm`, no `--dry-run`, no `--manifest-only`).
2. Write the prompt body following the structure of sibling commands in `packages/claude-plugin-cockpit/commands/`:
   - **Parse arguments** — resolve `epic` via the #788 resolver to `{ epic_ref, doc_path, repo }`.
   - **Read the epic doc** — locate any existing bounded section between the stable markers; capture (a) the current section body (if any) and (b) the byte offset / line range where it lives.
   - **Draft proposal** — generate ordered phases (`P1`, `P2`, …) each with a title, one-sentence summary, and a per-phase issue list. The proposal MUST conform to the grammar in `contracts/breakdown-doc-section.contract.md` so the manifest CLI can parse it as-is on approval.
   - **Present + iterate** — show the proposal to the developer with three affordances: `approve`, `edit` (free-form chat → re-draft → re-present), `reject` (exit non-zero, no write).
   - **On approval**:
     1. Build the final section body (markers + decomposition markdown).
     2. Write to the doc: if existing markers found, replace between them in place; otherwise append the section at end-of-file (FR-004 + clarification Q4). Use Edit (replace) or appending Write semantics — never insert mid-file when no markers exist.
     3. Shell out to `generacy cockpit manifest init/sync <epic-ref>` via Bash. Use `init` if no manifest exists for this epic; `sync` otherwise. Surface the CLI's exit code: 0 = success, non-zero = report the stderr verbatim and exit non-zero.
3. Output discipline: terse status lines only; no chatty summaries.

### Phase 2: Validate

4. Doc-section grammar: write down (in `contracts/breakdown-doc-section.contract.md`) the exact markdown shape the manifest CLI expects; any drift surfaces as an integration bug at runtime.
5. Manual install + smoke test: install the plugin in a Claude Code environment, run `/cockpit:breakdown <epic-ref>` against:
   - an epic doc with no existing markers (expect append at end-of-file, manifest `init` invocation),
   - a doc with markers and matching content (expect a no-op or idempotent `sync` invocation; the doc diff is empty),
   - a doc with markers but changed proposal (expect in-place replace + `sync`),
   - the `edit` path (developer types "merge phases 2 and 3"; expect re-draft + re-present),
   - the `reject` path (expect exit non-zero, no doc change, no CLI call).
6. Confirm the file lives only at `packages/claude-plugin-cockpit/commands/breakdown.md` and that no other file in the repo was modified (isolation check).

## Complexity Tracking

No constitution violations; no complexity entries.

## Open Risks

| Risk | Mitigation |
|------|------------|
| G3.1's `init/sync` contract has not been finalized when `breakdown.md` ships | Codify the assumed invocation + exit semantics in `contracts/manifest-cli.contract.md`. At integration time, the contract is the agreement; any divergence is a sibling-issue bug, surfaced back to the user. |
| tetrad-development#790's grammar has not landed | The slash command's drafted markdown is `contracts/breakdown-doc-section.contract.md`'s shape; if the engine grammar diverges, `breakdown.md` must be updated to match. Surface this as a hard dependency in `research.md`. |
| Resolver (#788) is unavailable | Without the resolver, the command cannot accept arbitrary epic refs. Surface this as a hard blocker. Do not ship a "current-branch" fallback — `breakdown` operates on an epic doc that lives in a sibling repo (typically `tetrad-development`), not the current branch. |
| Developer approves a malformed proposal (typos, missing fields) | The slash command's draft is grammar-checked against `contracts/breakdown-doc-section.contract.md` *before* presenting. The CLI's `sync` is the second line of defense — its non-zero exit on parse failure surfaces the bug to the user, who can re-invoke `breakdown` to redraft. |
| Section markers collide with markers from other tools (e.g., a future `<!-- cockpit:* -->` namespace) | The chosen markers are section-scoped (`phase-decomposition`), not verb-scoped — collision is avoided so long as future tools pick distinct section names. Documented in `contracts/breakdown-doc-section.contract.md`. |
| First-run append lands the section under an unrelated heading by accident | First-run placement is *literal* end-of-file (clarification Q4) — not "after heading X." The stable markers (Q2) make subsequent in-place replacement deterministic wherever the section ends up. No heuristic, no anchor scanning. |
| Developer iterates many times before approval, accumulating drift between draft and doc | The draft lives only in chat; the doc is touched only on approval. There is no temp file to drift. The re-draft on `edit` starts from the most recent draft, not the doc. |
