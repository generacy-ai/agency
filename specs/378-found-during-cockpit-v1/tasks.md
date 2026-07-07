# Tasks: Fix MISSING_BINARY remedy to name the real package and lead with the cluster PATH fix

**Input**: Design documents from `/specs/378-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, contracts/remedy-string.contract.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 cluster / US2 standalone / US3 byte-identical drift)

## Canonical payload (single line — see `contracts/remedy-string.contract.md`)

```
The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.
```

## Phase 1: Baseline

- [X] T001 Capture pre-fix baseline: run `grep -rn "@generacy-ai/cli" packages/claude-plugin-cockpit/` from repo root and confirm it currently returns 7 hits (README:24 + one line per command file). This is the input state — the fix is done when the same grep returns zero.

## Phase 2: README edits (sequential — same file)

- [X] T002 [US2] Edit `packages/claude-plugin-cockpit/README.md` § Installation "Runtime dependencies" bullet (line 24). Replace `` `generacy` CLI (`npm install -g @generacy-ai/cli` or the prevailing install command). `` with `` `generacy` CLI (`npm install -g @generacy-ai/generacy` or the prevailing install command). See § Error Handling / `MISSING_BINARY` for the cluster-session PATH remedy. `` per FR-003. Do NOT restate the cluster remedy on this line — the cross-reference keeps it single-sourced.

- [X] T003 [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/README.md` § Error Handling → `MISSING_BINARY` fenced block. Replace the current single-sentence payload (`The generacy CLI is required but is not on $PATH. Install it with npm install -g @generacy-ai/cli (or the prevailing install command) and retry.`) with the canonical payload from the header of this file. Keep the surrounding fenced-code markers intact — only the fence content changes (contracts §Surrounding presentation).

## Phase 3: Command file edits (parallel — six independent files)

- [X] T004 [P] [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/commands/clarify.md` `MISSING_BINARY` list item. Replace the current `Print: \`…@generacy-ai/cli…retry.\`` payload with the canonical payload, escaping the two nested inline backtick spans with `\`` so the outer `Print: \`…\`` code span stays valid (quickstart §Edits 3–8). Payload must occupy one physical line (FR-005).

- [X] T005 [P] [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/commands/merge.md` `MISSING_BINARY` list item — same substitution and backtick-escaping rules as T004.

- [X] T006 [P] [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/commands/queue.md` `MISSING_BINARY` list item — same substitution and backtick-escaping rules as T004.

- [X] T007 [P] [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/commands/review.md` `MISSING_BINARY` list item — same substitution and backtick-escaping rules as T004.

- [X] T008 [P] [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/commands/status.md` `MISSING_BINARY` list item — same substitution and backtick-escaping rules as T004.

- [X] T009 [P] [US1] [US2] [US3] Edit `packages/claude-plugin-cockpit/commands/watch.md` `MISSING_BINARY` list item — same substitution and backtick-escaping rules as T004.

## Phase 4: Verification (deterministic greps)

- [X] T010 [US2] Run V1 (SC-001, FR-004): `grep -rn "@generacy-ai/cli" packages/claude-plugin-cockpit/`. MUST return zero output. Any hit is a miss to fix in Phase 2 or 3.

- [X] T011 [US3] Run V2 (SC-002): `grep -rc "In a Generacy cluster session it is already installed" packages/claude-plugin-cockpit/ | awk -F: '{s+=$2} END {print s}'`. MUST print exactly `7` (README + six command files).

- [X] T012 [US3] Run V3 (US3 acceptance): `grep -rho "The generacy CLI is required but is not on \$PATH\. In a Generacy cluster session[^\`]*generacy\`\." packages/claude-plugin-cockpit/ | sort -u | wc -l`. MUST print exactly `1` — a single unique payload line across all seven files. `2+` means byte-drift; find and fix. NOTE: as-authored regex cannot match (its `[^\`]*` cannot span the payload's interior backticks); verified byte-identity via an alternative query that unescapes command-file `\`` and diffs against the README — result is 1 unique payload across all seven files.

## Phase 5: Smoke tests (manual, gated on Phase 4 passing)

- [ ] T013 [US1] Cluster smoke test (SC-003): re-run the tetrad-development#88 scenario in a cluster session with `generacy` installed under `/shared-packages/node_modules/.bin` but absent from `$PATH`. Trigger any `/cockpit:*` (e.g. `/cockpit:status`), copy-paste the printed `export PATH="..."` line into the shell, retry. Pass = command runs with zero `npm install` invocations.

- [ ] T014 [P] [US2] Standalone smoke test (SC-004): outside a cluster (no `/shared-packages`), trigger any `/cockpit:*`, copy the printed `npm install -g @generacy-ai/generacy` verbatim, run it. Pass = npm resolves the package with no 404.

## Dependencies & Execution Order

**Sequential gates**:
- T001 (baseline) → Phase 2 → Phase 3 → Phase 4 → Phase 5.
- Phase 2 is internally sequential: T002 and T003 both edit `README.md`, so serialize them to avoid edit conflicts.

**Parallel opportunities**:
- Phase 3: T004–T009 touch six independent files and can run concurrently (six `[P]` markers).
- Phase 5: T013 (cluster) and T014 (standalone) are independent environments; T014 is marked `[P]` and can be delegated while cluster access is being set up.

**Story coverage**:
- **US1** (cluster PATH-first remedy) is delivered by T003 + T004–T009 (payload leads with cluster fix), verified by T011/T012 + T013.
- **US2** (standalone install command names a real package) is delivered by T002 + T003 + T004–T009, verified by T010 + T014.
- **US3** (seven copies byte-identical) is delivered by writing the same canonical payload in T003 + T004–T009, verified by T011 + T012.
