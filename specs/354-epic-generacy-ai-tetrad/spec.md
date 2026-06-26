# Feature Specification: `/cockpit:review` command (Epic Cockpit A2.4)

**Branch**: `354-epic-generacy-ai-tetrad` | **Date**: 2026-06-26 | **Status**: Draft

## Summary

Epic: generacy-ai/tetrad-development#85 | Phase: P2 | Tier: v1-core | Issue: A2.4

Ship the `/cockpit:review` slash command as `packages/claude-plugin-cockpit/commands/review.md`. The command reviews the artifact for a given speckit gate on the current child issue/PR, summarises it, and — on developer approval — calls `/cockpit:advance --gate <name>`, which transitions the issue's `waiting-for:<name>` label to `completed:<name>`.

Behaviour splits by gate:

- **`impl` gate**: delegate PR resolution to `/cockpit:review-context`, run `/code-review` against the returned diff, and surface its summary verbatim. On approval, call `/cockpit:advance --gate impl`.
- **All other gates** (`specify`, `clarify`, `plan`, `tasks`): read the canonical artifact under `specs/<feature>/` (one file per gate — `spec.md`, `clarifications.md`, `plan.md`, `tasks.md` respectively; no GitHub child-issue fetch in v1), produce a structured summary, and on approval call `/cockpit:advance --gate <name>`.

The command supports three modes via `--mode`:

- **`assist`** (default): emit the summary, then prompt the developer (approve / request-changes / abort); on approve, invoke `/cockpit:advance` in the same run.
- **`auto`**: emit the summary and, if the suggested decision is `approve`, invoke `/cockpit:advance` without prompting; otherwise stop with the open items.
- **`manual`**: emit the summary only; never invoke `/cockpit:advance`.

Owns (isolation): `packages/claude-plugin-cockpit/commands/review.md`

Depends on: A1.4 (cockpit plugin scaffold — #350, landed), G1.2 (`/cockpit:advance`), G1.3 (`/cockpit:review-context`).

---
Part of the Epic Cockpit. Plan: docs/epic-cockpit-plan.md in tetrad-development (P2 / A2.4).

## User Stories

### US1: Review a child PR before advancing the `impl` gate

**As a** developer running an epic with the cockpit plugin,
**I want** to invoke `/cockpit:review --gate impl` against a child issue,
**So that** I get a `/code-review` summary of the open PR and can approve the `impl` gate in one step without context-switching to another tool.

**Acceptance Criteria**:
- [ ] Command delegates PR resolution to `/cockpit:review-context` (no in-command PR lookup).
- [ ] Runs `/code-review` against the returned diff and surfaces its summary verbatim, ending with a `Suggested decision:` line.
- [ ] In `assist` mode, prompts the developer (approve / request-changes / abort) via `AskUserQuestion`.
- [ ] On approval, calls `/cockpit:advance --gate impl` and reports the `waiting-for:impl` → `completed:impl` label transition.
- [ ] If review-context reports no/multiple/missing PR, fails fast with its message and leaves all labels untouched.

### US2: Review a non-`impl` artifact gate

**As a** developer iterating through speckit phases,
**I want** to invoke `/cockpit:review --gate <name>` for `specify`, `clarify`, `plan`, or `tasks`,
**So that** the agent summarises the corresponding canonical artifact and transitions `waiting-for:<name>` → `completed:<name>` once I approve.

**Acceptance Criteria**:
- [ ] Maps each non-`impl` gate to exactly one artifact: `specify`→`spec.md`, `clarify`→`clarifications.md`, `plan`→`plan.md`, `tasks`→`tasks.md` (no GitHub child-issue fetch in v1).
- [ ] Emits three sections — `Blockers`, `Open questions`, `Suggested decision` — ending with a `Suggested decision: approve | request-changes | abort` line.
- [ ] On approval, calls `/cockpit:advance --gate <name>` and reports the `waiting-for:<name>` → `completed:<name>` transition; on rejection/abort, leaves all labels untouched.

### US3: Discoverable gate set and modes

**As a** new user of the cockpit plugin,
**I want** `/cockpit:review` to list the supported gates and modes when called with no arguments or `--help`,
**So that** I can learn the workflow without reading external docs.

**Acceptance Criteria**:
- [ ] Bare invocation prints the supported gate names, the three modes (`assist`/`auto`/`manual`), and one-line descriptions of each.
- [ ] Unknown gate or mode values fail with a message listing the valid values.

### US4: Non-interactive (auto) advance for trusted gates

**As a** developer running multiple gates back-to-back,
**I want** `/cockpit:review --gate <name> --mode auto` to advance the label without an interactive prompt when there are no blockers,
**So that** I can move through low-risk artifact gates without manual confirmation, while still seeing the summary in the transcript.

**Acceptance Criteria**:
- [ ] In `auto` mode, the command emits the full summary and, only if the suggested decision is `approve`, invokes `/cockpit:advance` without prompting.
- [ ] If the suggested decision is `request-changes` or `abort`, `auto` mode stops with the open items and leaves labels untouched.
- [ ] `manual` mode never invokes `/cockpit:advance`, regardless of the suggested decision.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Ship `/cockpit:review` as `packages/claude-plugin-cockpit/commands/review.md`, callable as a Claude Code slash command once the plugin is installed. | P1 | |
| FR-002 | Accept a required `--gate <name>` argument matching a known gate. | P1 | Gate set: `specify`, `clarify`, `plan`, `tasks`, `impl` (extensible). |
| FR-003 | For `--gate impl`, delegate PR resolution to `/cockpit:review-context` (no in-command PR lookup), then run `/code-review` on the returned diff and surface its summary verbatim. | P1 | Depends on G1.3 (#789). Draft/multi-PR/no-PR cases are owned by review-context — this command surfaces whatever error review-context returns. |
| FR-004 | For non-`impl` gates, read the gate's canonical artifact under `specs/<feature>/` and produce a structured summary. | P1 | Mapping: `specify`→`spec.md`, `clarify`→`clarifications.md`, `plan`→`plan.md`, `tasks`→`tasks.md`. No GitHub child-issue fetch in v1. |
| FR-005 | Emit a gate-specific structured summary, then end with a single line: `Suggested decision: approve \| request-changes \| abort`. | P1 | `impl`: reuse `/code-review`'s schema verbatim. Non-`impl`: three sections — `Blockers`, `Open questions`, `Suggested decision`. |
| FR-006 | Accept `--mode <assist\|auto\|manual>` (default `assist`). In `assist`, after emitting the summary use `AskUserQuestion` to capture approve / request-changes / abort. | P1 | `auto` advances when suggested decision is `approve` without prompting; `manual` only emits the summary. |
| FR-007 | On `approve` (assist) or auto-advance (auto), invoke `/cockpit:advance --gate <name>` in the same run and report the resulting `waiting-for:<name>` → `completed:<name>` label transition. | P1 | Depends on G1.2 (#788). The command never mutates labels directly — only `/cockpit:advance` does. |
| FR-008 | On `request-changes`, `abort`, `manual` mode, or any non-approve outcome, leave all labels untouched and surface the open items. | P1 | Never mutate labels without an explicit `approve`. |
| FR-009 | Fail fast with actionable messages when prerequisites are missing (review-context returns no PR for `impl`, artifact missing for other gates, unknown gate name, unknown mode). | P1 | |
| FR-010 | Bare/`--help` invocation lists the supported gates and modes with one-line descriptions. | P2 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Plugin installation surfaces `/cockpit:review` in the Claude Code slash-command palette. | Visible after install | Manual smoke after `pnpm install` + plugin install. |
| SC-002 | `/cockpit:review --gate impl` on a real PR produces a `/code-review` summary and (on approval) drives the issue from `waiting-for:impl` to `completed:impl` via `/cockpit:advance`. | End-to-end on one real epic child PR | Manual run on a fixture child issue/PR; verify labels with `gh issue view`. |
| SC-003 | `/cockpit:review --gate <non-impl>` summarises the correct artifact (`spec.md`/`clarifications.md`/`plan.md`/`tasks.md`) and, on approval, transitions `waiting-for:<name>` → `completed:<name>`. | One run per non-`impl` gate | Manual run against an in-progress feature branch. |
| SC-004 | Rejected, aborted, or `manual`-mode reviews never mutate any label (including `phase:*`, `waiting-for:*`, `completed:*`). | 0 unauthorised label changes | Inspect `gh issue view` after a rejected/aborted/manual run. |
| SC-005 | Every gate summary ends with a `Suggested decision: approve \| request-changes \| abort` line. | 100% of runs | grep the command output. |

## Assumptions

- A1.4 (the cockpit plugin scaffold from #350) is landed and provides the plugin manifest, marketplace entry, and `commands/` directory.
- G1.2 (`/cockpit:advance`) and G1.3 (`/cockpit:review-context`) ship before or alongside this command and expose stable contracts.
- `/code-review` is available in the host Claude Code environment (it is — see `code-review` in the skill list).
- The current branch / working directory unambiguously identifies the active speckit feature and its `specs/<feature>/` directory.
- `/cockpit:advance --gate <name>` (G1.2 / #788) is the sole owner of the `waiting-for:<name>` → `completed:<name>` transition: it adds `completed:<name>` and removes `waiting-for:<name>`. It does not touch the orchestrator-owned `phase:*` labels. There is no `gate:*` label namespace.

## Out of Scope

- Implementing `/cockpit:advance` (G1.2) or `/cockpit:review-context` (G1.3) — this issue only consumes them.
- Posting review summaries as PR comments (handled by the `code-review --comment` flag on the host skill, not by this command).
- Multi-gate batch review in a single invocation.
- Direct mutation of `phase:*` labels (orchestrator-owned) or introduction of a `gate:*` namespace.
- Re-implementing PR resolution that already lives in `/cockpit:review-context` (G1.3).
- Fetching or summarising the GitHub child issues created from `tasks.md` (v1 reads only the local `tasks.md`).
- Changes to the cockpit plugin manifest, marketplace entry, or any package outside `packages/claude-plugin-cockpit/commands/review.md`.

---

*Generated by speckit*
