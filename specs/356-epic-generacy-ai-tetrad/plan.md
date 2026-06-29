# Implementation Plan: /cockpit:plan command

**Feature**: `/cockpit:plan` slash command that scaffolds (or non-destructively assists) an epic-level planning doc under `docs/epic-<slug>-plan.md`. Human-led — never overwrites, never advances gates, never comments on the epic.
**Branch**: `356-epic-generacy-ai-tetrad`
**Date**: 2026-06-29
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Ship one new file — `packages/claude-plugin-cockpit/commands/plan.md` — that defines the `/cockpit:plan` slash command. The command takes a single positional `<epic-ref>` (bare integer like `356` or fully-qualified like `owner/repo#356`), resolves the epic's title and metadata via `gh issue view --json title,body`, derives a deterministic slug, and writes a markdown skeleton to `docs/epic-<slug>-plan.md` in the **current working tree**.

The skeleton contains nine canonical H2 sections in fixed order (Context, Goals, Non-Goals, Phases, Ownership/Isolation, Sequencing & Dependencies, Risks, Open Questions — preceded by an H1 title), plus a markdown metadata block under the H1 that mirrors `spec.md`'s `**Epic**: … · **Phase**: … · **Tier**: …` style. The command is human-led: it never overwrites an existing file, never advances any gate via `generacy cockpit advance`, never posts a comment on the epic issue.

A secondary flow (US2) handles in-progress planning docs: when the file already exists, the command parses its headings, compares against the canonical set using a case-insensitive match with a small alias table (`Goals ↔ Objectives`, `Non-Goals ↔ Out of Scope`), and — *only after explicit conversational confirmation via `AskUserQuestion`* — appends the missing sections beneath an `<!-- generacy-cockpit:appended -->` marker. No section is ever overwritten.

No new TypeScript, no new tests, no MCP coupling. Sibling assumptions (the cockpit plugin scaffold from A1.4, `gh` on PATH, the cockpit namespace's command-loader auto-discovery) are *consumed*, not authored here.

## Technical Context

**Language/Version**: Markdown (slash command frontmatter + prompt body); the runtime is Claude Code itself
**Primary Dependencies**:
- `gh` CLI on PATH — hard runtime dependency for `gh issue view <ref> --json title,body`. Same assumption as `/cockpit:clarify`.
- `AskUserQuestion` tool — for the US2 in-conversation append-confirmation prompt (per clarification Q3).
- `claude-plugin-cockpit` scaffold (A1.4) — provides the namespace and `commands/` directory. The loader auto-discovers `commands/*.md`.
**Storage**: Repository files only — writes to `<cwd>/docs/epic-<slug>-plan.md` in the current working tree. Creates `docs/` if missing.
**Testing**: Manual — install the cockpit plugin, run `/cockpit:plan <epic-ref>` against a real epic issue, then re-run to verify the non-destructive guard and the US2 append flow.
**Target Platform**: Claude Code (any OS where `gh` runs)
**Project Type**: Monorepo package (static-asset plugin; no build step)
**Performance Goals**: N/A (a single `gh` API call + a single file write)
**Constraints**:
- One file owned: `packages/claude-plugin-cockpit/commands/plan.md` (isolation per FR-001).
- MUST NOT overwrite an existing planning doc (spec invariant + SC-002).
- MUST NOT advance any gate; MUST NOT post a comment on the epic (FR-006).
- Bare numeric refs resolve against the current repo's `gh` default; cross-repo qualified refs still write into the **current working tree's** `docs/` (clarification Q1).
- Slug derivation honors an explicit `slug:` from the epic body if present; otherwise strips a leading `Epic:` / `[…]` prefix, lowercases, collapses runs of `-`, trims, and caps at 60 chars (clarification Q2).
- US2 confirmation is conversational via `AskUserQuestion` — no `--apply` round-trip (clarification Q3).
- "Missing section" detection uses case-insensitive heading match + a small alias table (clarification Q4).
- Metadata block under the H1 uses markdown (`**Epic**: …  ·  **Phase**: …  ·  **Tier**: …`), not YAML front-matter (clarification Q5).
**Scale/Scope**: 1 new file (~180–240 lines of markdown), no edits to existing files

## Constitution Check

No `.specify/memory/constitution.md` is present in the repo — no gates apply. (Verified at plan-time: `.specify/templates/` exists but `.specify/memory/` does not.)

## Project Structure

### Documentation (this feature)

```text
specs/356-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (existing, read-only)
├── clarifications.md    # Q1–Q5 answers (existing)
├── plan.md              # This file
├── research.md          # Technology + pattern decisions
├── data-model.md        # Argument model, gh-output schema, slug rules, alias table, section comparator
├── quickstart.md        # Install + usage + verification steps
├── contracts/
│   ├── slash-command.contract.md   # Frontmatter + behavior contract for plan.md
│   └── planning-doc.contract.md    # The skeleton's section order, metadata block, append marker
└── checklists/          # (empty — not generated by this plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
└── commands/
    └── plan.md          # NEW — the /cockpit:plan slash command (the only deliverable of this issue)
```

**Structure Decision**: Single-file delivery, matching the per-verb isolation model used across Epic Cockpit issues #351–#360 (most recently #355's `merge.md`). No edits to `plugin.json` (FR-005 from A1.4 requires omitting `commands` from the manifest), no edits to `marketplace.json`, no edits to `README.md`. The loader auto-discovers `plan.md` via the globbed `commands/*.md` path.

## Implementation Phases

### Phase 0: Verify the contracts we depend on

Before writing any markdown, confirm or surface gaps in:

1. **Cockpit plugin scaffold (A1.4)**: confirm `packages/claude-plugin-cockpit/commands/` exists and that the marketplace entry picks up `commands/*.md` without further configuration. Five sibling commands (`clarify.md`, `merge.md`, `review.md`, `status.md`, `watch.md`) already load this way — confirmed at plan-time.
2. **`gh` JSON shape**: confirm `gh issue view <ref> --json title,body` returns `{ "title": "...", "body": "..." }`. This matches the pattern already used by `/cockpit:clarify` (Step 2 in its playbook).
3. **`AskUserQuestion` availability**: confirm the tool is exposed in the Claude Code runtime where the cockpit plugin runs (already used by `/cockpit:clarify` Step 4 for the approval flow).
4. **No conflicting siblings**: confirm no existing slash command writes to `docs/epic-*.md`. (Verified at plan-time: only `/speckit:plan` writes into `specs/<feature>/plan.md`; the namespaces are disjoint.)

### Phase 1: Author `plan.md`

1. Write frontmatter: `description`, positional `arguments.epic-ref` (required). No flags — the command is intentionally argument-poor.
2. Write the prompt body following the structure of sibling commands (use `clarify.md` and `merge.md` as references):
   - **Parse `$ARGUMENTS`**: trim, validate as either a bare positive integer or `owner/repo#N` (per FR-002, FR-008). Empty → print usage line and exit non-destructively. Malformed → exit non-zero with a verbatim parse error.
   - **Resolve the epic** via `gh issue view <ref> --json title,body`. If `gh` is missing or the issue is not found, surface the underlying error verbatim and exit non-zero (FR-009).
   - **Extract metadata** from the epic body: optional `slug:` line, `Phase:` line, `Tier:` line. Patterns documented in `data-model.md` E2.
   - **Derive the slug** per `data-model.md` E3: explicit `slug:` wins; otherwise normalize the title.
   - **Compute the target path**: `<cwd>/docs/epic-<slug>-plan.md`. Ensure `<cwd>/docs/` exists (create if missing).
   - **Branch on file existence**:
     - **Does not exist (US1)**: write the canonical skeleton (`contracts/planning-doc.contract.md`) with the H1, the metadata block under the H1, and the nine canonical H2 sections in order. Emit `wrote planning skeleton: <abs-path>` and exit `0`.
     - **Exists (US2)**: parse the existing doc's H2 headings; for each canonical section, decide "present" or "missing" using the case-insensitive match + alias table from `data-model.md` E4. If zero canonical sections are missing, emit `planning doc already complete: <abs-path>` and exit `0`. Otherwise, present the list of missing sections to the developer via `AskUserQuestion` (one prompt with `append / cancel` choices). On `cancel`, exit `0` non-destructively. On `append`, append the missing canonical sections (in canonical order) beneath a single `<!-- generacy-cockpit:appended -->` marker line, preserving the existing doc verbatim above it. Emit `appended <N> section(s) to: <abs-path>` and exit `0`.
3. Output discipline: terse status lines only; no chatty summaries.

### Phase 2: Validate

4. **Skeleton-shape check**: read `contracts/planning-doc.contract.md` and verify the literal section names + order in `plan.md`'s prompt body match it exactly.
5. **Slug-rule check**: verify the prompt body explicitly encodes the rule from `data-model.md` E3 (explicit `slug:` first, then prefix-strip + lowercase + collapse + trim + 60-char cap at a `-` boundary).
6. **Manual smoke test**: install the plugin in a Claude Code environment, run:
   - `/cockpit:plan 356` (fresh epic, no existing doc) → expect skeleton written to `docs/epic-<slug>-plan.md`.
   - `/cockpit:plan 356` (re-run) → expect `planning doc already complete` (assuming all sections were just written).
   - Delete one canonical section by hand, re-run → expect the missing-section prompt, then the appended block beneath the `<!-- generacy-cockpit:appended -->` marker.
   - `/cockpit:plan` (no argument) → expect usage line, no file written.
   - `/cockpit:plan not-a-number` → expect parse error, non-zero exit.
   - `/cockpit:plan owner/nope-doesnt-exist#999` → expect `gh`'s native "not found" error surfaced verbatim.
7. **Isolation check**: confirm the file lives only at `packages/claude-plugin-cockpit/commands/plan.md` and that no other file in the repo was modified.

## Complexity Tracking

No constitution violations; no complexity entries.

## Open Risks

| Risk | Mitigation |
|------|------------|
| The epic body lacks `Phase:` / `Tier:` lines, so the metadata block under H1 is partly empty | `plan.md` MUST tolerate missing metadata: render only the keys it found, separated by ` · `. If none are found, omit the metadata block entirely (the H1 alone is valid). Documented in `contracts/planning-doc.contract.md`. |
| A developer renames a canonical section after appending (e.g., `## Goals` → `## Objectives`) and re-runs | The alias table (`Goals ↔ Objectives`, `Non-Goals ↔ Out of Scope`) keeps the comparator stable across renames. Headings outside the alias table count as missing and trigger a re-append — which is the safer default (extra section vs. silent drift). Documented in `data-model.md` E4. |
| Slug collision: two epics with identical titles map to the same `docs/epic-<slug>-plan.md` | The non-overwrite guard catches it: the second invocation reads "file exists," runs US2 diff-detection against the *first* epic's doc, and surfaces nothing surprising — the developer notices a wrong-epic prompt and aborts. No corruption. The user can resolve manually by giving the second epic an explicit `slug:` field. |
| Cross-repo qualified refs (`owner/other-repo#N`) imply the user wants the doc in the *other* repo | Per clarification Q1, the doc always lives in the current working tree's `docs/`. Document this loudly in the command's frontmatter `description` and in `quickstart.md` so users don't expect a clone-and-write behavior. |
| `AskUserQuestion` is not reachable (e.g., non-interactive automation context) | The append flow is the only path that depends on it, and it's the *non-destructive* path — if the prompt cannot be shown, the command MUST fall back to printing the missing-sections list and exiting `0` without writing. The US1 fresh-write path is unaffected. Documented in `data-model.md` E5 + `quickstart.md` troubleshooting. |
| The epic body's `slug:` line uses unexpected characters | Per FR-004 + Q2, `slug:` is used **verbatim**. The command MUST NOT silently rewrite a developer-provided slug. If the slug contains characters that would break a filename (e.g., `/`), surface a `slug contains invalid characters: <slug>` error and exit non-zero — the developer fixes the epic body, not the planning doc. |
