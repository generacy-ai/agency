# Feature Specification: /cockpit:file — File epic + child issues and record numbers

**Branch**: `358-epic-generacy-ai-tetrad` | **Date**: 2026-06-29 | **Status**: Draft
**Epic**: generacy-ai/tetrad-development#85 | Phase: P4 | Tier: v2-pipeline | Issue: A4.3

## Summary

Add a developer-facing `/cockpit:file` slash command that converts a planned epic's task manifest into real GitHub issues and then writes the resulting issue numbers back into the local manifest. The command is the entry point for moving an epic out of the "plan complete, nothing filed yet" state into "tracked work" — it wraps the existing `agency-spec-kit` `tasks_to_issues` flow for issue creation and `generacy cockpit manifest sync` for the number write-back, then prints a short summary of what was filed.

Owns (isolation): `packages/claude-plugin-cockpit/commands/file.md`

Acceptance (from the parent epic): Files issues and records numbers.

**Depends on**:
- G3.1 — `generacy cockpit manifest sync` engine command (consumes the filed issue numbers and updates the manifest in place).
- A1.4 — `claude-plugin-cockpit` plugin scaffold (#350) — provides the `/cockpit:` namespace this command lands in.

---

Part of the Epic Cockpit. Plan: `docs/epic-cockpit-plan.md` in tetrad-development (P4 / A4.3).

## User Stories

### US1: File an epic from the planned manifest

**As a** speckit developer who has just finished `/speckit:tasks` for a new epic,
**I want** to run a single `/cockpit:file` command from my feature branch
**So that** the epic and its children land on GitHub with one round-trip, instead of running `taskstoissues` + manual manifest editing as two separate steps.

**Acceptance Criteria**:
- [ ] Running `/cockpit:file` from a branch with a planned manifest creates one parent epic issue plus one child issue per task block, in the same repo as the current `gh` remote.
- [ ] After issues are filed, the local manifest file is updated in place so that each task block now carries its real GitHub issue number.
- [ ] The command prints a final summary listing the parent issue URL and a count of child issues filed.
- [ ] Running the command a second time on the same branch with the manifest already populated is a no-op (or surfaces a clear "already filed" message) — it does not re-file duplicate issues.

### US2: Recover from a partial filing without manual cleanup

**As a** developer whose `/cockpit:file` run failed midway (rate limit, auth flake, network blip),
**I want** the command to be safe to re-run
**So that** I never end up with half-filed epics or a manifest that disagrees with GitHub.

**Acceptance Criteria**:
- [ ] If `tasks_to_issues` exits non-zero partway through, the command surfaces the engine's error verbatim and does NOT attempt `manifest sync` on the partial state.
- [ ] If `tasks_to_issues` succeeds but `manifest sync` fails, the command reports both the filed issue URLs (so the developer can recover them) and the sync error.
- [ ] A subsequent successful re-run reconciles the manifest with whatever was already filed, without filing duplicates.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Command lives at `packages/claude-plugin-cockpit/commands/file.md` and registers as `/cockpit:file`. | P1 | Owned path per isolation. |
| FR-002 | Command accepts an optional epic argument (`owner/repo#N`, `#N`, or URL) and falls back to resolving from the current branch's `specs/<branch>/spec.md` `**Epic**:` line, mirroring `/cockpit:status` Step 2. | P1 | Same resolver contract as siblings. |
| FR-003 | Command shells out to the `agency-spec-kit` engine's `tasks_to_issues` operation to file the epic + child issues. | P1 | Reuses #164 (`d5-implement-tasks-issues`). |
| FR-004 | On a successful `tasks_to_issues` exit, command invokes `generacy cockpit manifest sync` to write the returned issue numbers back into the local manifest. | P1 | Depends on G3.1. |
| FR-005 | On a non-zero `tasks_to_issues` exit, command surfaces stderr verbatim and skips the `manifest sync` step. | P1 | No partial-state writes. |
| FR-006 | On a non-zero `manifest sync` exit (after a successful filing), command prints the filed parent URL and child URLs alongside the sync error so the developer can recover manually. | P1 | Avoids losing recovery info. |
| FR-007 | Final success output prints `**Filed:** <parent-url>` followed by `<n> child issue(s) filed; manifest updated.` on the next line. | P2 | Stable for downstream scripting. |
| FR-008 | Pre-flight `command -v generacy` and `command -v gh`; missing-binary branches print the same `MISSING_BINARY` guidance text used by `/cockpit:status`. | P2 | Cross-command consistency. |
| FR-009 | Re-running on an already-filed branch is detected (manifest already has issue numbers for every task block) and exits 0 with `already filed; nothing to do`. | P2 | US2 idempotency. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Single-command coverage | 100% of epics filed from a planned manifest can be filed in one `/cockpit:file` invocation. | Manual test against a fresh epic branch; observe parent + N children on GitHub and updated manifest in working tree. |
| SC-002 | No partial-state writes | 0 cases where `manifest sync` runs on a failed `tasks_to_issues` exit. | Inject failure in `tasks_to_issues` (force a `gh` auth error) and confirm `manifest sync` is not invoked. |
| SC-003 | Idempotent re-run | Re-running the command on an already-filed branch creates 0 new GitHub issues. | Run twice; diff the GitHub issue list and assert no growth. |
| SC-004 | Recoverable mid-run failure | When `manifest sync` fails post-filing, the printed output contains every filed issue URL. | Inject a failure into `manifest sync` and grep the command output for each filed URL. |

## Assumptions

- `tasks_to_issues` is already capable of filing both the parent epic issue and child task issues in one invocation, returning a structured payload that names each filed issue by task block id (delivered by #164).
- `generacy cockpit manifest sync` is non-interactive, accepts the `tasks_to_issues` output (or reads from a stable temp location), and writes the manifest update atomically (delivered by G3.1).
- The current branch's `specs/<branch>/` directory is the canonical location of the manifest the command operates on.
- `gh` is authenticated; this command does not implement its own GitHub transport.

## Out of Scope

- Editing or re-filing already-filed issues (titles, bodies, labels) — handled by future `/cockpit:resync` / manifest-driven update commands, not by `/cockpit:file`.
- Closing or deleting issues — never within scope for this verb.
- Cross-repo filing — the command files into whatever repo the current branch's `gh` remote points at; multi-repo orchestration is a separate concern.
- Interactive prompts during filing — the command is non-interactive end-to-end; clarification flows belong to `/cockpit:clarify`.
- Manifest authoring or task generation — assumed already complete by the time `/cockpit:file` runs.

---

*Generated by speckit; enhanced from issue #358 body.*
