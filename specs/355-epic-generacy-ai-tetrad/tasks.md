# Tasks: /cockpit:merge command

**Input**: Design documents from `/specs/355-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (this issue has a single story: ship `/cockpit:merge`)

## Phase 1: Setup & Dependency Verification

- [ ] T001 Verify the `packages/claude-plugin-cockpit/commands/` directory exists and is the canonical owner of slash commands (per plan §Project Structure); confirm no `merge.md` is already present.
- [ ] T002 [P] Confirm the sibling-pattern reference file `packages/claude-plugin-agency-spec-kit/commands/specify.md` is available locally and note its frontmatter shape (description + `arguments[]`) to mirror in `merge.md` (per research P1).
- [ ] T003 [P] Re-read `specs/355-epic-generacy-ai-tetrad/contracts/merge-cli.contract.md` and confirm the `result` / `reason` enum exactly matches the routing table in `data-model.md` E2 and `research.md` D3; if the contract is missing any reason listed in routing, fix the contract before authoring `merge.md`.
- [ ] T004 [P] Re-read `specs/355-epic-generacy-ai-tetrad/contracts/slash-command.contract.md` invariants (§Behavioral contract) so the prompt body below mirrors them verbatim.
- [ ] T005 Confirm the dependency status of sibling issues — `#788` (issue/epic resolver), `#789` (`generacy cockpit merge` CLI verb), and the `cockpit-fixer` subagent (if any) — and record in this tasks file (inline below) which form will be used (named subagent vs. inline-prompted fallback per research D5).

## Phase 2: Author `merge.md`

All tasks below edit a single new file: `packages/claude-plugin-cockpit/commands/merge.md`. They are sequential (same file).

- [ ] T010 Create `packages/claude-plugin-cockpit/commands/merge.md` with the YAML frontmatter exactly matching `contracts/slash-command.contract.md` §Frontmatter shape (`description`, three `arguments[]` entries: `ref`, `--no-fix`, `--max-fix-attempts`).
- [ ] T011 Add the **Parse arguments** section to the prompt body: resolve `<ref>` via the #788 resolver, default `--max-fix-attempts` to `1`, reject `--max-fix-attempts < 1` with a usage error, reject zero/multiple resolver matches with an actionable error (per `data-model.md` E1 validation rules).
- [ ] T012 Add the **Invoke CLI** section to the prompt body: call `generacy cockpit merge <resolved-pr-ref>` via Bash, parse the JSON envelope per `data-model.md` E2; on parse failure emit a single terse error and exit.
- [ ] T013 Add the **Decision tree** section to the prompt body, branching strictly on `result` + `reason` per `research.md` D3 and `data-model.md` relationship diagram:
  - `result: "merged"` → emit `Merged ✓ — <pr-url>`, exit 0.
  - `reason ∈ { "checks-failing", "merge-conflict" }` → fixer branch (T014).
  - `result: "blocked"` with `reason ∈ { "missing-label", "missing-approval", "draft", "pending" }` → emit `Stopped: <reason> — <actionable-msg>`, exit non-zero. Do not spawn the fixer.
  - Unknown `result` or unknown `reason` → emit `Stopped: unknown CLI result — report to #355`, exit non-zero.
- [ ] T014 Add the **Fixer branch** logic to the prompt body: short-circuit on `--no-fix` (terse stop, no fixer); otherwise increment a 1-indexed `attempt` counter and on `attempt > max-fix-attempts` emit `Stopped: red after N fix attempt(s) — <reason> (<check-names>)` and exit non-zero; otherwise spawn the fixer subagent via the Task tool with the E3 payload (`pr`, `reason`, `checks`, `attempt`, `max_attempts`).
- [ ] T015 Add the **Fixer-subagent selection** logic per research D5: prefer a named `cockpit-fixer` subagent; if unavailable, fall back to a general Task agent with an embedded fixer prompt that consumes the E3 payload. Document the chosen mode inline in the prompt body so a future PR can swap once the named subagent lands.
- [ ] T016 Add the **Re-evaluate loop** glue: on fixer return, loop back to T012's CLI invocation (state is observed fresh — never cache). Cap is enforced by T014's counter, not by a separate guard.
- [ ] T017 Add the **Output discipline** rules to the prompt body (per research D6 / `data-model.md` E4): one terse status line per phase transition, no narration, exit code 0 on `merged` and non-zero on every stop state. Include the canonical status-line examples from `data-model.md` E4.
- [ ] T018 Add an `## Invariants` section near the end of `merge.md` listing the five MUSTs and four MUST NOTs from `contracts/slash-command.contract.md` §Behavioral contract (so future edits can't drift silently).

## Phase 3: Validate

- [ ] T020 [P] Isolation check: confirm only `packages/claude-plugin-cockpit/commands/merge.md` was created/modified by this issue. No edits to `plugin.json`, `marketplace.json`, `README.md`, or any sibling command. Run `git status` and `git diff --stat` to verify.
- [ ] T021 [P] Contract drift check: re-read `merge.md` and confirm every `result`/`reason` it handles matches `contracts/merge-cli.contract.md`. Flag any unrouted enum value as a bug in this file.
- [ ] T022 Manual smoke test 1 — green-approved PR: install the plugin in a Claude Code env (per `quickstart.md`), run `/cockpit:merge <green-ref>`, expect `Merged ✓`.
- [ ] T023 Manual smoke test 2 — red checks-failing PR (default attempts): run `/cockpit:merge <red-ref>`, expect one fixer spawn + re-eval; final state is either `Merged ✓` or `Stopped: red after 1 fix attempt — checks-failing (<names>)`.
- [ ] T024 Manual smoke test 3 — red PR with `--no-fix`: run `/cockpit:merge <red-ref> --no-fix`, expect `Stopped: red (--no-fix) — checks-failing (<names>)` with no fixer spawned.
- [ ] T025 Manual smoke test 4 — pending checks: run `/cockpit:merge <pending-ref>`, expect `Stopped: pending — defer to /cockpit:watch` with no fixer and no poll.
- [ ] T026 Manual smoke test 5 — draft / missing-approval / missing-label: run `/cockpit:merge` against each blocked state in turn and confirm the actionable terse report (per `data-model.md` E4) and a non-zero exit.
- [ ] T027 Manual smoke test 6 — `--max-fix-attempts=3` on a stubbornly red PR: confirm exactly three fixer passes max and the final stop line reports `red after 3 fix attempts`.
- [ ] T028 Manual smoke test 7 — resolver edge cases: run with a `<ref>` that resolves to zero PRs and to multiple PRs; confirm both terminate with a usage-style error *before* any CLI call.

## Dependencies & Execution Order

**Phase 1 → Phase 2 → Phase 3** are sequential.

**Within Phase 1**: T001 must complete first (directory check). T002, T003, T004 are independent and can run in parallel. T005 should follow them since it consolidates findings.

**Within Phase 2**: T010 → T011 → T012 → T013 → T014 → T015 → T016 → T017 → T018 are strictly sequential — they all edit the same file (`merge.md`).

**Within Phase 3**: T020 and T021 can run in parallel (read-only checks). T022–T028 are sequential because they share a single test environment (the installed plugin in one Claude Code session); however, T022–T028 are independent of T020/T021.

**Parallel opportunities**:
- Phase 1: T002 + T003 + T004 in parallel.
- Phase 3: T020 + T021 in parallel.

**Sibling-issue blockers**:
- T011 depends on #788 being resolvable; if absent, T011 writes against the documented contract anyway and integration surfaces drift as a sibling bug (per plan §Open Risks).
- T012 depends on #789 returning JSON per `contracts/merge-cli.contract.md`; same fallback.
- T015 depends on the `cockpit-fixer` subagent registration; absent → inline-prompted fallback per research D5.

---

*Generated by speckit /tasks*
