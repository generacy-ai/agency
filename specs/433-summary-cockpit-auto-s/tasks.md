# Tasks: Fix `/cockpit:auto` pre-flight doorbell-surface probe

**Input**: Design documents from `/specs/433-summary-cockpit-auto-s/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 is the only story)

## Phase 1: Skill fix (auto.md prose edits)

- [ ] T001 [US1] Edit `packages/claude-plugin-cockpit/commands/auto.md` — apply all five sub-edits to the § Instructions step 1 pre-flight body in one commit so the file is never left half-fixed:
  - (a) L41 probe: change `` `generacy cockpit doorbell --help >/dev/null 2>&1` `` → `` `generacy cockpit help doorbell >/dev/null 2>&1` `` (FR-001; commander.js's auto-wired `help <verb>` router exits 1 for unknown subcommands, 0 for present ones — verified on snappoll `generacy 0.0.0-preview-20260717045830-01bbb03`).
  - (b) L41 inline comment: change `the surface owned by generacy#970 hasn't landed on this cluster` → `the surface owned by generacy#974 hasn't landed on this cluster` (FR-003; #970 already merged as PR #971 and shipped GraphQL rate-limit work, NOT the doorbell verb).
  - (c) L44 error message body: change `needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#970)` → `needs a generacy build that ships \`generacy cockpit doorbell\` (generacy#974)` (FR-003).
  - (d) L53 documentation cross-reference: change `matching \`generacy cockpit doorbell --help\`` → `matching \`generacy cockpit help doorbell\`` (FR-002; the literal string `cockpit doorbell --help` must appear nowhere in auto.md so the T002 negative pin does not misfire on a correct fix).
  - (e) L53 inline comment: change `the doorbell subprocess is engine-owned per generacy#970` → `the doorbell subprocess is engine-owned per generacy#974` (FR-003).

  Verification after edit: `grep -c "cockpit doorbell --help" packages/claude-plugin-cockpit/commands/auto.md` must return `0`; `grep -c "generacy#970" packages/claude-plugin-cockpit/commands/auto.md` must return `0`; `grep -c "generacy cockpit help doorbell" packages/claude-plugin-cockpit/commands/auto.md` must return at least `1`.

## Phase 2: Test pin (drift-audit assertion)

- [ ] T002 [US1] Add a new `describe("433 — auto.md doorbell probe uses pure verb-existence form, not the commander --help short-circuit", ...)` block in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` with two assertions inside a single `it(...)` block (FR-004; Q2=B — positive + negative):
  - **Positive**: `expect(readFileSync(AUTO_MD_PATH, "utf-8")).toContain("generacy cockpit help doorbell")` — asserts the corrected probe string is present.
  - **Negative**: `expect(readFileSync(AUTO_MD_PATH, "utf-8")).not.toContain("cockpit doorbell --help")` — asserts the broken form appears nowhere in auto.md.

  Rationale to embed as a code comment above the `describe`: "commander.js short-circuits `--help` before validating the subcommand — `generacy cockpit <unknown-verb> --help` prints the *parent* help and exits 0, so the pre-#433 probe false-passed on doorbell-absent clusters. The negative pin catches full reverts, partial reverts, and half-merges that leave the broken form in either L41 or L53. Scope of the negative match is `cockpit doorbell --help` (with `--help` flag) — NOT the bare `generacy cockpit doorbell` sensor invocation, which is legitimate and pinned by 406-3."

  Placement: append the new `describe` block after the last existing top-level `describe` in the file (append-only; do not restructure existing describes).

## Phase 3: Verification

- [ ] T003 [US1] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - `:515`: `398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token` (`readdirSync(COMMANDS_DIR)` sweep — pins every playbook regardless of which one you edited; the corrected probe uses verb `help` and `help` is not in the snapshot set `{watch}`, so this should still pass — verify per FR-005)
    - `:286`: `396-3 (drift audit): every GATE_VOCABULARY token has a Trigger match in auto.md § Dispatch` (`readFileSync(AUTO_MD_PATH)` + `extractDispatchSection`; step 1 pre-flight is not in the Dispatch section — expected pass)
    - `:906`: `402-1 (structural drift audit): auto.md has the contract section, the ≤4 bound, and cross-references from every gate contract` (`readFileSync(AUTO_MD_PATH)`; pre-flight step 1 is not in the AskUserQuestion contract section — expected pass)
    - `:1101`: `403-1: D.9 family subheadings state the no-re-check/no-prose contract verbatim` (`extractSubheadingBlock` — expected pass)
    - `:1118`: `403-2: new D.9d subheading exists with phase:* prefix-match` (`extractSubheadingBlock` — expected pass)
    - `:1169`: `403-4: D.7 and D.11 state cockpit_context(issue=<issue-ref>) as sole evidence-fetch tool` (`extractSubheadingBlock` — expected pass)
    - `:1253`: `403-6: § Invariants section contains at least eight numbered items` (`extractInvariantsSection` — expected pass)
    - `:1273`: `406-6 (invariant §9): auto.md § Invariants has exactly nine numbered items` (`extractInvariantsSection` — expected pass)
    - `:1517`: `406-3 (post-#420/#431 wake-driven loop shape): auto.md step 4 drains cockpit_await_events on a Monitor wake with maxWaitMs=1 and no 55s long-poll; step 2 arms generacy cockpit doorbell under Monitor, not run_in_background` (`extractInstructionsSteps` — reads steps 2 and 4, NOT step 1; the step 2 sensor spawn `generacy cockpit doorbell <epic-ref>` is legitimate and untouched by this edit — expected pass, but re-run to confirm no side effect)
    - `:1556`: `406-4 (in-memory cursor): auto.md steps 4/5 state cursor is in-memory only` (`extractInstructionsSteps` — reads steps 4/5 — expected pass)
    - `:1570`: `406-5 (startup sweep tool-presence check): auto.md step 3 names the seven cockpit_* tools` (`extractInstructionsSteps` — reads step 3 — expected pass)
    - `:1596`: `406-6 (invariant §9): auto.md § Invariants has exactly nine numbered items; §9 opens verbatim; §1–§8 opening substrings survive` (`extractInvariantsSection` — expected pass)
    - `:1812`: `408-1 (structural drift audit): auto.md § step 5 has the class split, both G.4(e) options, and the cursor-recovery ledger-line shape` (`extractInstructionsSteps` — reads step 5 — expected pass)
    - `:2012`: `410-1 (structural drift audit): D.7 has first-vs-repeat sub-path split` (`parseSections` — reads D.7 subheading — expected pass)

  Re-pinning means updating the assertion to the NEW contract established by the playbook edit. Given that T001's edits are localized to step 1's pre-flight body (which no existing `extractInstructionsSteps` pin reads — steps 2/3/4/5 all remain untouched), and the sensor invocation `generacy cockpit doorbell <epic-ref>` in step 2 is preserved, no existing assertion is expected to need updating. Run `pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification` after T001 + T002 land; if any of the above pin sites regresses unexpectedly, update the assertion to the NEW contract in this same PR (do NOT skip, delete, or weaken).

  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit; weakening it deletes its value.

- [ ] T004 [US1] FR-005 sanity check — run `pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification` and confirm `398-1` passes with the corrected probe form. The 398 audit sweeps `commands/*.md` for `generacy cockpit <verb>` invocations against snapshots under `tests/fixtures/help-snapshots/`; the corrected probe `generacy cockpit help doorbell` matches verb `help` (not `doorbell`), and neither `help` nor `doorbell` has a `.txt` snapshot, so no drift should be reported. If it fails, do NOT add a `doorbell.txt` snapshot as a workaround — investigate the root cause first.

- [ ] T005 [US1] SC-002 local-shim verification — verify no regression on doorbell-present clusters (Q3=B). Create a `generacy` shim on PATH whose `cockpit help doorbell` exits 0:

  ```bash
  mkdir -p /tmp/generacy-shim
  cat > /tmp/generacy-shim/generacy <<'EOF'
  #!/usr/bin/env bash
  if [[ "$1 $2 $3" == "cockpit help doorbell" ]]; then exit 0; fi
  exec /usr/local/bin/generacy "$@"
  EOF
  chmod +x /tmp/generacy-shim/generacy
  PATH="/tmp/generacy-shim:$PATH" claude /cockpit:auto <epic-ref>
  # expected: pre-flight passes; step 2 attempts to spawn `generacy cockpit doorbell <epic-ref>` under Monitor
  ```

  Record the shim invocation verbatim in the PR body so the reviewer can re-run it. Do NOT block merge on generacy#974's rollout — the absent-path is already verified against the real snappoll binary (exit 1).

- [ ] T006 [US1] Run the full playbook-verification test suite one more time (`pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification`) and confirm the new 433 describe block passes AND no other test regressed. This is the final gate before opening the PR.

## Dependencies & Execution Order

Sequential (no parallelization opportunity — small, tightly coupled fix):

1. **T001** (auto.md edits) — must land first; T002's negative pin can only pass once L41 and L53 are both fixed.
2. **T002** (test pin) — depends on T001; the assertion strings target the corrected probe form.
3. **T003, T004, T005, T006** (verification) — all depend on T001 + T002 landing. Within Phase 3:
   - T003 and T004 can run interleaved (both are test runs against the same suite).
   - T005 is a local-runtime verification (shim + `/cockpit:auto` invocation) — independent of the test suite.
   - T006 is the final full-suite gate.

Estimated total: ~1 hour of active work (5 sub-edits in one file + one new `describe` block + three test runs + one shim invocation). Blast radius: two files under `packages/claude-plugin-cockpit/`. Rollback: revert one squash commit.

---

*Generated by speckit*
