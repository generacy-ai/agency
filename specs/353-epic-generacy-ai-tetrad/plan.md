# Implementation Plan: /cockpit:clarify verb

**Feature**: `/cockpit:clarify` slash command that drafts clarification answers, gets developer approval, posts a marked answer comment via `gh issue comment`, and advances the clarification gate via `generacy cockpit advance` when all open questions are answered.
**Branch**: `353-epic-generacy-ai-tetrad`
**Date**: 2026-06-26
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Drop a single static markdown verb file at `packages/claude-plugin-cockpit/commands/clarify.md` that the Claude Code plugin loader exposes as `/cockpit:clarify`. The verb orchestrates four side-effectful operations in order:

1. Resolve the target issue from an explicit `$ARGUMENTS` issue number (preferred) or fall back to the `###-*` branch convention; hard-error if neither resolves.
2. Call `generacy cockpit clarify-context --issue <n>` to obtain the open clarification questions + repo grounding hints.
3. Draft an answer per open question, citing a `spec.md` / `plan.md` section or repo file as provenance; render `_no draft — insufficient context_` for any question the agent cannot ground.
4. Present drafts for approval (approve-all / approve-subset / edit / reject). On approval, post a single comment to the issue via `gh issue comment` carrying the marker `<!-- generacy-cockpit:clarification-answers -->` on its first line, then — only if every open question in the run has an approved answer — invoke `generacy cockpit advance --gate clarification --issue <n>`.

No code, no build step, no MCP tools, no new package. The deliverable is one committed `.md` file plus a docs entry in the cockpit README. All runtime behavior is encoded as instructions for the model executing the verb; the only hard runtime dependencies introduced are `gh` (for posting) and `generacy cockpit` (for context + advance).

## Technical Context

**Language/Version**: None (no compiled code; the verb is a markdown prompt file consumed by Claude Code at run time)
**Primary Dependencies**:
- `gh` CLI (hard runtime dependency, per clarification Q5) — must be installed and authenticated against the target repo
- `generacy cockpit` CLI verbs `clarify-context` and `advance` (G1.2 / #788 already implemented; A1.4 provides `clarify-context`)
**Storage**: None — the verb is stateless; all persistent state lives on the GitHub issue (questions + answer comment + labels) and is managed by upstream tooling
**Testing**: Manual end-to-end against a live epic child issue with at least one pending clarification question; verify (a) comment marker is present on the first line, (b) gate advances only on full approval, (c) hard-error path when no issue is resolvable
**Target Platform**: Claude Code (any OS that ships `gh` and the `generacy` binary)
**Project Type**: Static plugin verb file (no `package.json`, no compilation)
**Performance Goals**: N/A — single-shot interactive verb, end-to-end latency bounded by `gh` + `generacy` calls
**Constraints**:
- Marker string `<!-- generacy-cockpit:clarification-answers -->` is canonical (clarification Q2) and MUST be the first line of the posted comment so resume tooling can locate it deterministically
- Posting is one comment per run (FR-006 in template); partial approvals still post exactly one comment containing only the approved answers
- Gate advance fires only when every open question in the run has an approved answer (clarification Q1, option B)
- Issue argument is required-or-fallback: explicit `$ARGUMENTS` first, then `###-*` branch inference, else hard error (clarification Q3, option A)
- Un-groundable questions are rendered as stubs, not omitted and not blocking (clarification Q4, option A)
- Comment transport is `gh issue comment` — do not introduce a new `generacy cockpit` posting subcommand (clarification Q5, option A)
**Scale/Scope**: 1 new file (`commands/clarify.md`, ~150–250 lines of instruction prose) + 1 README row update; no schema changes

## Constitution Check

No `.specify/memory/constitution.md` is present in this repo — no constitutional gates apply.

## Project Structure

### Documentation (this feature)

```text
specs/353-epic-generacy-ai-tetrad/
├── spec.md              # Feature specification (existing, read-only)
├── clarifications.md    # Resolved Q1–Q5 (existing)
├── plan.md              # This file
├── research.md          # Decisions: marker placement, draft-fallback wording, transport
├── data-model.md        # Schemas: draft entry, approval decision, posted-comment body
├── quickstart.md        # Verify-locally walkthrough + troubleshooting
├── contracts/
│   ├── cockpit-clarify-context.md   # Expected shape of `generacy cockpit clarify-context` output consumed by the verb
│   ├── cockpit-advance.md           # Expected invocation + exit semantics of `generacy cockpit advance --gate clarification`
│   └── github-comment.md            # Posted-comment body format including the canonical marker line
└── checklists/
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── .claude-plugin/
│   └── plugin.json                       # Existing (from #350); unchanged
├── commands/
│   ├── .gitkeep                          # Existing (from #350); unchanged
│   └── clarify.md                        # NEW — the verb file this issue delivers
└── README.md                             # MODIFIED — drop "(coming in #351–#360)" from the `/cockpit:clarify` row
```

**Structure Decision**: This feature is a single static markdown asset inside an already-scaffolded plugin package (#350). No source files, no build, no tests directory. The verb file is the entire shipping surface.

## Implementation Phases

### Phase 0: Re-verify upstream contracts
- Confirm `generacy cockpit clarify-context --issue <n>` exists, accepts an issue number, and emits the question list in a machine-readable shape (JSON or plain `Q[N]: …` text). If the shape differs from what's assumed in `contracts/cockpit-clarify-context.md`, update the contract before writing the verb.
- Confirm `generacy cockpit advance --gate clarification --issue <n>` is the canonical invocation (G1.2 / #788). If the gate-name flag differs (`--gate=clarify`, `--clarification`, etc.), reconcile with G1.2's documented surface.
- Confirm `gh` is authenticated in the target dev environment (`gh auth status`) — the verb assumes this and surfaces `gh`'s error if not.

### Phase 1: Author the verb file
1. Write `packages/claude-plugin-cockpit/commands/clarify.md` with:
   - YAML frontmatter (`description:` matching the README row)
   - Arguments section documenting `$ARGUMENTS` as the optional issue number
   - Step 1: Issue resolution (explicit arg → `###-*` branch → hard error with `--issue <n>` guidance)
   - Step 2: Call `generacy cockpit clarify-context --issue <n>`; parse open-question list
   - Step 3: For each question, draft an answer grounded in `spec.md` / `plan.md` / repo files, citing the source; mark ungroundable answers as `_no draft — insufficient context_`
   - Step 4: Present drafts to the developer (approve-all / approve-subset / edit / reject)
   - Step 5: Build comment body — first line `<!-- generacy-cockpit:clarification-answers -->`, followed by approved Q[N]/Answer blocks; post with `gh issue comment <n> --body-file -` (stdin) or `--body @file` to preserve formatting
   - Step 6: If every open question in the run was approved, call `generacy cockpit advance --gate clarification --issue <n>`; otherwise exit with a status summary listing pending questions
   - Constraints + Post-Command Check sections, mirroring the conventions used in `packages/claude-plugin-agency-spec-kit/commands/*.md`
2. Update the `/cockpit:clarify` row in `packages/claude-plugin-cockpit/README.md` to remove the "(coming in #351–#360)" marker and reflect the shipped behavior.

### Phase 2: Local validation
3. Manually invoke the verb against a real child issue with ≥1 pending question — confirm:
   - First-line marker is present in the posted comment
   - Gate advance only fires on full approval (run a partial-approval scenario explicitly)
   - Hard error surfaces when neither `$ARGUMENTS` nor `###-*` resolves an issue
   - Ungrounded stub renders the literal `_no draft — insufficient context_` string

## Complexity Tracking

No constitution; no complexity entries.

## Open Risks

| Risk | Mitigation |
|------|------------|
| `generacy cockpit clarify-context` output format is not yet stable (A1.4 in flight) | The verb tolerates either JSON or plain `Q[N]: question` text; if a third shape lands, update `contracts/cockpit-clarify-context.md` and the parse step rather than re-architecting the verb. |
| `gh issue comment` strips or rewraps the HTML marker line | Post with `--body-file` / stdin (not `-b "…"`) to preserve verbatim; verify in Phase 2 by reading the comment back with `gh issue view --comments`. |
| Developer runs the verb on a non-`###-*` branch and forgets `$ARGUMENTS` | Hard error per Q3 (option A) with the literal guidance "no child issue resolvable; pass --issue <n>" — same wording as the spec to make it greppable in support threads. |
| Partial-approval semantics misread (post + advance vs. post only) | The verb encodes Q1 option B explicitly: post the approved subset every run, advance only when no `*Pending*` answers remain in this run's context. The presentation step must surface remaining-pending count to the developer before they confirm. |
| `gh` not installed / not authenticated | Verb surfaces `gh`'s native error and recommends `gh auth login`; no in-verb auth flow. |

## Dependencies

- **G1.2** (`generacy cockpit advance` verb, #788) — already implemented; used to advance the `clarification` gate.
- **A1.4** (`generacy cockpit clarify-context` verb) — provides the open-question list consumed by Step 2. If A1.4 is not yet merged when this lands, the verb still ships but Phase 2 validation must wait.
- **#350** (cockpit plugin scaffold) — provides the package directory, manifest, and marketplace entry. Already merged.

## Next Step

Run `/speckit:tasks` to generate the task list from this plan.
