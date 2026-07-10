# Tasks: Fix D.5 `<pr-ref>` drift + add invocation-vs-`--help` drift audit

**Input**: Design documents from `/specs/398-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Since this is a single-story bugfix, [US1] covers the D.5 drift fix + audit backstop

## Phase 1: Setup & Enumeration

- [ ] T001 Enumerate the distinct `generacy cockpit <verb>` verbs invoked from `packages/claude-plugin-cockpit/commands/*.md` (fenced + Q2=B inline spans with an argument). Command: `grep -hoE 'generacy cockpit [a-z][a-z-]*' packages/claude-plugin-cockpit/commands/*.md | awk '{print $3}' | sort -u`. Expected set (validate against plan.md §Invocation-vs-`--help` mapping): `merge`, `advance`, `resume`, `queue`, `context`, `status`, `watch`. Record the actual set — it drives Phase 3 snapshot creation.
- [ ] T002 Run the baseline test suite `pnpm --filter claude-plugin-cockpit test` and confirm the existing 394 + 396 assertions (2 + 3 = 5 tests) pass unmodified. Any pre-existing failure here is out of scope and must be triaged before proceeding.

## Phase 2: Load-bearing playbook edits

- [ ] T010 [US1] Edit `packages/claude-plugin-cockpit/commands/auto.md` D.5 dispatch step 2: substitute `<pr-ref>` → `<issue>` (verbatim from `generacy cockpit merge --help`). Append the "passing a PR ref directly is a distinct failure mode observed in agency#398" parenthetical from data-model.md §1.2. This is the load-bearing prose edit. Contracts: C.1 (positive anchor), C.2 (negative anchor — `<pr-ref>` must not appear anywhere in `auto.md`).
- [ ] T011 [P] [US1] Edit `packages/claude-plugin-cockpit/commands/merge.md` in a single pass covering all four sub-surfaces from data-model.md §2:
  - **§2.2 Frontmatter**: rename `arguments.ref` → `arguments.issue`; rewrite description to "Issue reference (owner/repo#N, #N, or bare integer). Optional; falls back to the current branch's open PR's linked issue. Passing a PR reference directly is a distinct failure mode — the CLI resolves the linked PR from the issue internally."
  - **§2.3 Step 1 parsing prose**: `<pr-ref>` → `<issue>`; update `Usage: /cockpit:merge [<issue>] [--max-fix-attempts=N]`.
  - **§2.4 Step 4 CLI invocation**: `<resolved-pr-ref>` → `<resolved-issue>`.
  - **§2.5 Example lines**: update both `/cockpit:merge` examples to reflect issue-ref semantics (bare `#789` is an issue ref, not a PR ref; CLI resolves linked PR internally).
  Contracts: C.3 (`name: issue`), C.4 (no `<pr-ref>` anywhere in file), C.5 (usage-error prose).

## Phase 3: Fixtures + refresh script

- [ ] T020 [P] Create `packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh` per data-model.md §6.2 and contracts/refresh-script.md. Shebang `#!/usr/bin/env bash`. Behavior: (a) pre-flight `command -v generacy` with descriptive error, (b) enumerate distinct verbs from `commands/*.md` (same query as T001), (c) capture `generacy --version` → `<X.Y.Z>`, (d) for each verb run `NO_COLOR=1 generacy cockpit <verb> --help` and write `# captured from: generacy --version <X.Y.Z>\n<help output>` to `tests/fixtures/help-snapshots/<verb>.txt`, (e) print summary `Refreshed <N> snapshots from generacy --version <X.Y.Z>`. Make executable (`chmod +x`). Contract: C.13.
- [ ] T021 Generate `packages/claude-plugin-cockpit/tests/fixtures/help-snapshots/<verb>.txt` for each verb identified in T001. Preferred: run `bash packages/claude-plugin-cockpit/scripts/refresh-help-snapshots.sh` inside a cluster session (where `generacy` is on `$PATH` at `/shared-packages/node_modules/.bin`). If the CLI is unavailable in the working environment, capture snapshots manually per data-model.md §3.1 format. Contracts: C.6 (version-tag header present), C.7 (snapshot set matches distinct-verb set).
- [ ] T022 [P] Create `packages/claude-plugin-cockpit/tests/fixtures/398-drift-auto.md` per data-model.md §4.2 — a ~15-25 line minimal markdown fixture containing the pre-fix D.5 dispatch table row + prose block, keeping the offending `` `generacy cockpit merge <pr-ref>` `` inline backtick span intact. Contract: C.8. Include a header comment identifying it as a fixture (not real playbook) so it can't be mistaken for prod prose.

## Phase 4: Test suite extension

- [ ] T030 Extend `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` with parser helpers (colocated in the test file, not `lib/`, per data-model.md §7):
  - `parseInvocations(fileContent: string, filePath: string): Invocation[]` — implements Q2=B extraction (fenced blocks whose first token matches `generacy cockpit <verb>` + inline backtick spans with `generacy cockpit <verb> <arg…>`). Skips bare-verb spans (no argument). Returns `{ file, line, verb, argTokens, source }` records per data-model.md §5.3.
  - `parseSnapshotUsageLine(snapshotContent: string): { verb: string, argTokens: string[] }` — reads the snapshot file, skips the `# captured from:` header, extracts the ordered positional `<...>` argument-kind tokens from the `Usage:` line.
  Contracts: C.10 (fenced + inline-with-argument), C.11 (skip bare-verb spans).
- [ ] T031 [US1] Add assertion 398-1 in a new `describe("398 — playbook invocations match generacy cockpit <verb> --help", …)` block below the existing 396 block. The assertion reads all `packages/claude-plugin-cockpit/commands/*.md`, parses invocations via `parseInvocations`, loads the matching `tests/fixtures/help-snapshots/<verb>.txt` snapshot per verb, and asserts every invocation's `argTokens` matches the snapshot's `argTokens` position-by-position (exact string comparison — no equivalence table). On mismatch, fail with `{file, line, verb, position, observed, expected}`. Contracts: C.12 (exact positional comparison). Do NOT modify the 394 or 396 describe blocks.
- [ ] T032 [US1] Add assertion 398-2 in the same 398 describe block. Feeds `tests/fixtures/398-drift-auto.md` through `parseInvocations` + audit rule, asserts exactly one mismatch is reported with `{verb: 'merge', position: 0, observed: '<pr-ref>', expected: '<issue>'}`. Positive-signal regression check — guards against the audit silently degrading to no-op via a regex-scope bug or accidental Q2=A regression. Contract: C.9.

## Phase 5: Verify + sibling sweep

- [ ] T040 Run `pnpm --filter claude-plugin-cockpit test`. Expected: 7 tests passing (2 from #394's block, 3 from #396's block, 2 from #398's new block). If 398-1 reports mismatches on `auto.md` or `merge.md`, revisit T010 / T011. If 398-2 reports zero or wrong-shape mismatches, revisit T030–T032 parser logic.
- [ ] T041 If 398-1 reports mismatches on **sibling playbooks** (`clarify.md`, `review.md`, `queue.md`, `watch.md`, `status.md`), apply verbatim token substitutions in the same PR per plan.md §Complexity Tracking sibling-drift clause. This is completeness hygiene, not scope creep — the audit revealing pre-existing drift is the audit doing its job. If drift is deep enough to require design judgment (e.g., a CLI verb the playbook uses that has been renamed since), stop and flag in the PR description.
- [ ] T042 Run the full static-check grep suite from `quickstart.md § Static checks` in order: C.1, C.2, C.3, C.4, C.5, C.6, C.7, C.13, C.8, sibling-playbook byte-identity, historical-specs byte-identity, `auto.md § Invariants` no-new-§8. Every check must return its expected output.
- [ ] T043 Verify historical spec directories `specs/{372,384,388,390,394,396}-*` are byte-identical against `origin/develop` (`git diff origin/develop -- 'specs/372-*' 'specs/384-*' 'specs/388-*' 'specs/390-*' 'specs/394-*' 'specs/396-*'` returns empty). Any diff is a scope-creep bug.
- [ ] T044 Confirm no changes to `packages/claude-plugin-cockpit/lib/reference-consumption.ts` (created by #394) or `lib/gate-vocabulary.ts` (created by #396). `git diff origin/develop -- packages/claude-plugin-cockpit/lib/` must be empty.

## Dependencies & Execution Order

**Sequential phase boundaries**:
- Phase 1 (T001, T002) must complete before Phase 3 — T001's verb-set enumeration drives which snapshot files T021 creates.
- Phase 2 (T010, T011) can run in parallel with Phase 3 (T020, T022) — different files, no data dependencies. T021 depends on T001 + T020 (needs the enumerated verb set and the refresh script).
- Phase 4 depends on Phase 3 completing — the assertions read the fixture files created there. Assertion 398-1 (T031) also depends on Phase 2 edits landing to be green day-one.
- Phase 5 (T040–T044) is the final verification gate — nothing after this.

**Parallel opportunities within phases**:
- T010 (auto.md) and T011 (merge.md) — different files, mark [P].
- T020 (refresh script), T022 (regression fixture) — different files, mark [P]. T021 is sequential after T001 + T020.
- T030 (helpers), T031 (398-1), T032 (398-2) — all edit the same test file; must be sequential.

**Load-bearing tasks** (a bug here reproduces the T-S6 diagnosis-round-burn or leaves the audit vacuous):
- T010 — auto.md D.5 prose (the runtime instruction the auto session follows)
- T031 — assertion 398-1 (the build-time backstop)
- T032 — assertion 398-2 (proves the backstop isn't vacuous)

**Completeness-hygiene tasks** (a bug here fails the audit at build time, not at runtime):
- T011 (merge.md frontmatter fix), T020 (refresh script), T021 (snapshot fixtures), T022 (regression fixture)

## Task Group Summary

- **Total tasks**: 14
- **Phases**: 5 (Setup, Playbook Edits, Fixtures, Test Extension, Verification)
- **Parallel opportunities**: T010‖T011 (playbook edits), T020‖T022 (fixture creation) — up to 4 tasks parallelizable
- **Mode**: Standard (fine-grained)
- **Story coverage**: Single-story bugfix (US1 = correct D.5 drift + add audit backstop); [US1] tag applied to load-bearing edits and audit assertions

## Next Step

Run `/speckit:implement` to begin execution.
