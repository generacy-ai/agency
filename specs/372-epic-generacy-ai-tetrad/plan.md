# Implementation Plan: claude-plugin-cockpit six-command rewrite

**Feature**: Epic: generacy-ai/tetrad-development#85 | Phase: S4 | Tier: v1-simplification | Issue: A-S1 — rewrite `packages/claude-plugin-cockpit` to exactly six assist-mode commands (`watch`, `status`, `queue`, `clarify`, `review`, `merge`), self-contained, no `specs/**` references, no cross-slash-command invocation (single documented exception: `/code-review` in `review.md --gate impl`).
**Branch**: `372-epic-generacy-ai-tetrad`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Rewrite the `claude-plugin-cockpit` package so its `commands/` directory contains exactly six Markdown slash-command files — `watch.md`, `status.md`, `queue.md`, `clarify.md`, `review.md`, `merge.md` — and nothing else. Delete `plan.md`, `breakdown.md`, `file.md`, `bug.md`. Every retained command is assist-mode and self-contained: its behavioral contract is the CLI verb's `--help` output plus the `@generacy-ai/cockpit` plugin README section, with no references to feature-branch `specs/**` contracts, no autonomy-policy lookup, no transition/policy schemas, no unshipped verbs (`/cockpit:advance`), and no invocation of other `/cockpit:*` slash commands. Commands compose only via the `generacy` CLI. The rewrite also (a) inlines a byte-identical three-class error convention (`MISSING_BINARY` / `AUTH_FAILURE` / `OTHER`) into each of the six command files with a comment naming the plugin README as canonical source of truth, and (b) updates the plugin README to a current 6-command table plus the marketplace install via `extraKnownMarketplaces`, removing the stale "coming in #351–#360" copy.

The technical approach is a targeted, mechanical rewrite of six Markdown files and one README under `packages/claude-plugin-cockpit/`, plus deletion of four obsolete command files. There is no runtime code, no build artifact, no schema, and no persisted state introduced by this feature; the commands are prose playbooks executed by Claude Code that shell out to the pre-existing `generacy` CLI (delivered by G-S2 / G-S3, out of scope here) and to Claude Code's built-in `/code-review` (in `review.md --gate impl` only).

## Technical Context

**Language/Version**: Markdown (CommonMark) with YAML frontmatter — Claude Code slash-command playbook format.
**Primary Dependencies**: `generacy` CLI (external binary, provided by dependencies G-S2 and G-S3 per spec `Depends on:` line — exposes `cockpit watch`, `cockpit status`, `cockpit queue`, `cockpit context`, `cockpit advance`, plus epic-body discovery and queue signature verbs); `gh` CLI (for GitHub auth); Claude Code host (renders slash commands, provides `AskUserQuestion`, `Bash`, and the built-in `/code-review` slash command).
**Storage**: None. Commands are stateless — every invocation runs `generacy cockpit <verb>` and renders its output. The `watch` command holds a per-invocation in-memory "seen" set of transition ids (never persisted), inherited from the current `watch.md`.
**Testing**: Manual smoke test on a fresh Claude Code session with only the plugin + `gh auth` + `generacy` CLI installed (per SC-003). Automated verification for the file-count / forbidden-string invariants (SC-001, SC-002, SC-005, SC-006) via shell one-liners (`ls | wc -l`, `grep -r`, `diff`).
**Target Platform**: Claude Code (any surface — CLI, VS Code extension, web, desktop) with the plugin installed via the `generacy-ai/agency` marketplace listed in `extraKnownMarketplaces`.
**Project Type**: Slash-command plugin package inside a pnpm monorepo (single project, no `src/` — pure Markdown assets under `commands/`).
**Performance Goals**: `watch.md` MUST fit in ~20 lines (SC-004). No wall-clock performance target — commands are user-driven and dominated by the CLI's own runtime.
**Constraints**:
- Every command runs in a fresh session with only the plugin + `gh auth` + `generacy` CLI installed (FR-004 / SC-003).
- No cross-slash-command invocation except `/code-review` in `review.md --gate impl` (FR-005, clarifications Q3).
- No `specs/**` contract references anywhere (FR-002, FR-003, clarifications Q1).
- Shared error convention inlined verbatim in all six commands, byte-identical (FR-012 / SC-005, clarifications Q5).
- Canonical README copy lives in **this plugin's README** (`packages/claude-plugin-cockpit/README.md`), NOT the `generacy` npm package README (clarifications Q5 rationale — slash commands must be self-contained at execution time, and the `generacy` README is not readable from a user's session).
- `merge.md` never merges on red CI; `--max-fix-attempts` default 1; fixer subagent attempts only repo-owned CI classes (tests / lint / typecheck / build) — infrastructure/runner failures abort without burning an attempt (FR-011, clarifications Q4).
**Scale/Scope**: Six command files (~50–150 lines each; `watch.md` ~20 lines) + one README, all under `packages/claude-plugin-cockpit/`. No source code, no tests directory added by this feature (the pre-existing repo `pnpm build` still passes because there's nothing to build in this package).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this rewrite honors implicitly:

- **Scope discipline**: Feature owns only `packages/claude-plugin-cockpit/**` (per spec `Owns (isolation):` line). No changes leak into sibling packages, `generacy` CLI, or shared configs.
- **One-repo-per-issue rule**: The long-term-preferred design — engine emits `next: /cockpit:<verb>` inline on transition lines so the plugin narrates without a static mapping — lives in the `generacy` repo and is explicitly **out of scope** (per spec Out of Scope + clarifications Q2 rationale).
- **No orphan indirection**: Shared error convention is inlined verbatim, not extracted to `commands/_errors.md` or an external README that is not readable at execution time (clarifications Q5).

**Result**: PASS. No violations. Complexity Tracking table left empty below.

## Project Structure

### Documentation (this feature)

```text
specs/372-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (read-only for /plan)
├── clarifications.md    # Q1–Q5 answers integrated into spec (read-only for /plan)
├── plan.md              # This file
├── research.md          # Phase 0 — technology decisions + rationale
├── data-model.md        # Phase 1 — command-file and README shapes (no runtime entities)
├── quickstart.md        # Phase 1 — install, use, troubleshoot
├── contracts/           # Phase 1 — per-command contracts (six files, one per command)
│   ├── watch.contract.md
│   ├── status.contract.md
│   ├── queue.contract.md
│   ├── clarify.contract.md
│   ├── review.contract.md
│   ├── merge.contract.md
│   └── error-convention.contract.md
├── checklists/          # From /clarify or /checklist runs (pre-existing)
├── conversation-log.jsonl
└── tasks.md             # Phase 2 output — created by /speckit:tasks, NOT by /speckit:plan
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── .claude-plugin/
│   └── plugin.json                # Unchanged — plugin metadata (name, description, author)
├── README.md                      # REWRITTEN — 6-command table, marketplace install via
│                                  # `extraKnownMarketplaces`, canonical Error Handling section.
│                                  # Removes stale "coming in #351–#360" copy.
└── commands/
    ├── watch.md                   # REWRITTEN — ~20 lines. Runs `generacy cockpit watch <epic-ref>`,
    │                              # per transition line prints one notification with the
    │                              # suggested next `/cockpit:*` command via a small static
    │                              # mapping table (waiting-for:clarification → /cockpit:clarify,
    │                              # waiting-for:<gate>-review → /cockpit:review --gate <gate>,
    │                              # completed:validate / green checks → /cockpit:merge,
    │                              # error states → no suggestion). No policy lookup, no
    │                              # dedupe/baseline handling, no PushNotification. On exit,
    │                              # reports and stops.
    ├── status.md                  # REWRITTEN — thin render of `generacy cockpit status <args>`;
    │                              # with no argument, prints the usage line (no
    │                              # `.generacy/epics/` resolution chain — that directory no
    │                              # longer exists). No `specs/**` references.
    ├── queue.md                   # REWRITTEN — thin render of `generacy cockpit queue <args>`
    │                              # PLUS retains the AskUserQuestion Confirm/Cancel gate as
    │                              # the playbook's mutating "go" trigger. No `specs/**` refs.
    ├── clarify.md                 # REWRITTEN — full assist loop:
    │                              # `generacy cockpit context` (renamed from `clarify-context`)
    │                              # → draft grounded answers → per-question approval → post
    │                              # marked comment → `generacy cockpit advance`. No `specs/**` refs.
    ├── review.md                  # REWRITTEN — for `--gate impl`, invokes `/code-review`
    │                              # (single documented cross-slash-command exception); for
    │                              # other gates, summarizes the review artifact. On approval,
    │                              # calls `generacy cockpit advance --gate <g>` directly
    │                              # (replaces unshipped `/cockpit:advance` reference).
    ├── merge.md                   # REWRITTEN — never merges on red CI; supports
    │                              # `--max-fix-attempts` (default 1). Bounded fixer subagent
    │                              # attempts any red check owned by this repo's CI
    │                              # (tests / lint / typecheck / build). Infrastructure/runner
    │                              # failures reported; merge aborts without burning an
    │                              # attempt.
    ├── plan.md                    # DELETED
    ├── breakdown.md               # DELETED
    ├── file.md                    # DELETED
    └── bug.md                     # DELETED
```

**Structure Decision**: Single package. All changes are confined to `packages/claude-plugin-cockpit/` per the spec's `Owns (isolation)` line. No new directories, no new source-code trees, no test suites are introduced — the rewrite is prose (Markdown playbooks + one README). Acceptance is verified by the six `SC-00N` success criteria in the spec, all of which are static checks on the resulting files (line count, forbidden-string absence, byte-identical inlined blocks).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

_(No violations — table intentionally empty.)_

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | _(n/a)_    | _(n/a)_                             |
