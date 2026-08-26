# Tasks: Slim `cockpit:auto` to gates / queue / clarify / merge (engine owns review→remediate)

**Input**: Design documents from `/specs/500-context-review-remediate/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ (final-approval-gate.md, remediation-limit-gate.md, removed-dispatch.md, version-skew-preflight.md)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files/sections, no dependencies)
- **[Story]**: Which user story this task belongs to

**Scope note**: This feature is a **playbook-prose + test edit only**, entirely within
`packages/claude-plugin-cockpit/`. No engine, MCP-schema, or cloud code changes here. The two files
touched are `commands/auto.md` (edited) and `tests/playbook-verification.test.ts` (re-pinned).
Because all `auto.md` edits mutate the same file, the § edit tasks (Phase 2) are **not** marked `[P]`
with each other — they share one file. They are ordered by dependency, not concurrency.

---

## Phase 1: Inputs (resolve before editing)

- [X] T001 [US5] Source the concrete `MIN_GENERACY_VERSION` literal — the first `generacy` release
  that ships epic generacy-ai/generacy#1120's post-validate `implementation-review` gate move **plus**
  the `remediation-limit` gate. Read it from the generacy release notes / epic #1120 (research.md § D3,
  "Sourcing `MIN_GENERACY_VERSION`"). This literal is load-bearing prose in `auto.md` and a pinned
  value in the test — resolve it before T002 and T023.
- [X] T002 [US3] Confirm the D.5 / D.3 post-validate **emission ordering** (research.md § D8) against
  `docs/engine-review-remediate-plan.md` (generacy-ai/tetrad-development) and epic #1120: does a green
  validate (a) also raise `waiting-for:implementation-review` so G.8 is the merge trigger, or (b) emit
  only `completed:validate` green and let D.5 merge? Working assumption is (a). This gates the exact
  D.3 vs D.5 prose in T006 / T009.

---

## Phase 2: `auto.md` edits — `packages/claude-plugin-cockpit/commands/auto.md`
<!-- All Phase 2 tasks edit the same file; order is by dependency, not parallelism. -->

- [X] T003 [US5] § step 1 pre-flight — add the version-skew guard (FR-008, Q3). After the
  `command -v generacy` presence check (`auto.md:216`) and the `generacy cockpit help doorbell` probe
  (`:218–224`), probe `generacy --version`, parse it, compare against `MIN_GENERACY_VERSION` (T001).
  Below minimum → print the verbatim operator error naming the required version, exit non-zero, do NOT
  `mkdir -p .generacy/cockpit/auto-runs`, do NOT write a ledger line (mirror the Monitor-absence
  `:208–214` / doorbell-absence `:218–224` hard-fails). Unparseable/missing version → fail closed with
  a distinct diagnostic. Contract: `contracts/version-skew-preflight.md`.
- [X] T004 [US1] § Dispatch table (`auto.md:530–547`) — D.3 action → final-approval gate G.8
  (`approve`→merge / `hold`,`reject`→no-op); D.6 action → "ledger line only (engine remediate loop
  owns red validate; re-fires as engine gate)"; add **D.13 — `waiting-for:remediation-limit`** row →
  remediation-limit gate G.9 (`resume remediation` / `stop`). FR-001/FR-003/FR-004.
- [X] T005 [US1] § Enriched-line dispatch contract E3 (`:463–483`) + E4 checks verdict (`:485–498`).
  D.6 stays in the E3 table (source `enriched line + checks`) but becomes ledger-adjacent (no
  subagent); add a D.13 row (`waiting-for:remediation-limit` in the `to`/labels column). E4:
  `checks: "red"` → D.6 **ledger-only** (was: bounded fixer); keep the `absent|pending` fallback
  wording. FR-001/FR-003.
- [X] T006 [US3] § D.3 (`:724–758`) — keep the **trigger, Source-of-truth, and Step 0** blocks
  verbatim (identity/drift/adoption machinery; gateType stays `implementation-review`, generation = PR
  head SHA). Replace steps 1–4 (Resolve PR → spawn `cockpit-reviewer` → G.2 gate → apply
  verdict/request-changes guardrail) with the final-approval flow: render findings parsed from the gate
  body if present (**no subagent**); present G.8; `approve` → cockpit merge path (merge on green, never
  on red); `hold`/`reject` → no-op (label stays, re-fires — mirror D.4 `not yet`). Update the D.3
  ledger line. FR-001/FR-004, Q1. Contract: `contracts/final-approval-gate.md`.
- [X] T007 [US1] § D.6 (`:818–852`) — remove steps 2–4 (classify → spawn `cockpit-fixer` →
  re-evaluate → apply escalation verdict), the outcome-scoped fixer prompt, the G.4a escalation-gateType
  note, and the fixer ledger lines. D.6 becomes: classify (drop fixer-attempt language) → **ledger line
  only**; `completed:validate` red re-fires as an engine gate. Keep the "Never merge on red" reference
  pointed at the merge path, not the fixer branch. FR-001, Q4. Contract: `contracts/removed-dispatch.md`.
- [X] T008 [US2] § D.13 — new section (`waiting-for:remediation-limit`), modeled on D.4's shape:
  trigger + Source-of-truth (enriched line) + Step 0 pre-draft gate-status check (gateType
  `remediation-limit`, 1:1 mapping so the drift branch is enabled) + present G.9 (findings parsed from
  gate body, no subagent) + apply verdict (`resume remediation` → `cockpit_advance(issue,
  gate="remediation-limit")`; `stop` → exit clean, no label writes) + ledger line. FR-003, Q2.
  Contract: `contracts/remediation-limit-gate.md`.
- [X] T009 [US1] § Pre-draft check — shared rules → generation-drift branch guard table (`:566–582`).
  Add a `remediation-limit` row (1:1 → D.13 → drift recoverable → drift branch enabled). Change the
  `escalation` row's "four rows share one `gateType`" narrative → **"three rows (D.7, D.10, D.11)"**
  (D.6 no longer opens an escalation gate). #1046 residual limitation still applies. FR-003.
- [X] T010 [US1] § G.2 (`:1191–1232`) — trigger → D.2 only. Drop the "(artifact and implementation)"
  scope from heading/body and the D.3 references. **Keep the artifact three-option set
  (`approve`/`request-changes`/`abort`) and the four-step request-changes guardrail unchanged.**
  FR-002.
- [X] T011 [US1] § G.4 (`:1258–1353`) — remove subtype **(a)** (validate-red / merge-red) entirely:
  the trigger bullet, the "(a) Validate-red / merge-red" presentation block, the (a) row in the options
  table, and the `Retry (re-run fixer)` mechanism sentence. Update the "three subtypes" heading count.
  Keep (b)/(c)/(d)/(e) as-is. FR-001.
- [X] T012 [US3] § G.8 — new gate contract (Implementation-review final-approval): trigger D.3;
  presentation renders findings from the gate body if present (no subagent, no findings-table-from-JSON);
  options `approve`/`hold`/`reject`; `approve` → cockpit merge path; `hold`/`reject` → no-op. FR-004.
  Contract: `contracts/final-approval-gate.md`.
- [X] T013 [US2] § G.9 — new gate contract (Remediation-limit) per D.13 (T008): options
  `resume remediation`/`stop`; `resume` → `cockpit_advance(issue, gate="remediation-limit")`; `stop` →
  exit clean, no label writes; findings from gate body; no subagent. FR-003.
  Contract: `contracts/remediation-limit-gate.md`.
- [X] T014 [US1] § UI-mode gate mapping table (`:1512–1523`) — remove the **G.4a** row; change the
  **G.2** row's transitionClass to artifact kinds only (drop `implementation`); add a **G.8** row
  (transitionClass `waiting-for:implementation-review`; options `approve`/`hold`/`reject`; downstream
  `approve`→merge, `hold`/`reject`→no-op; body = engine findings from gate body); add a **G.9** row
  (transitionClass `waiting-for:remediation-limit`; options `resume remediation`/`stop`; downstream
  resume → `cockpit_advance(gate="remediation-limit")`, stop → exit). FR-001/FR-003/FR-004.
- [X] T015 [US1] § Generation discriminator table (`:1499–1508`) — `implementation-review` row stays
  (`PR head SHA`; reused by G.8). Add a `remediation-limit` row (discriminator = remediation counter +
  findings hash, or PR head SHA + counter; DATA-GAP note like the siblings if the counter is not yet
  computed cluster-side). Update the `escalation` DATA-GAP note "four dispatch rows (D.6/D.7/D.10/D.11)"
  → "three dispatch rows (D.7/D.10/D.11)". FR-003.
- [X] T016 [US1] § Ledger action+outcome vocabulary (`:1635–1686`) — D.3 row → final-approval vocab
  (`implementation-review-approval` + merge; outcomes `merged (PR #<n>)` / `hold` / `reject` /
  `blocked: <desc>`); D.6 rows → single ledger-only row (`completed:validate:red · (no-op) ·
  engine-owned remediate`), remove the `fixer` and `fixer+escalation-gate` rows; add a D.13 row
  (`remediation-limit-gate`; outcomes `resumed (advanced)` / `advance failed: <desc>` / `stop (exit)`).
  Update the `source: enriched-line` marker rule list to include D.13 and reflect D.3/D.6 changes.
  FR-001/FR-003/FR-004.
- [X] T017 [US1] § Invariants (`:1772–1782`) — §1 re-pinned in substance (red → engine gate, not fixer
  branch; merge path still exits 0 only on `result: merged`, never on red; G.8 `approve` routes into
  that path). §5 re-pinned (drop `cockpit-fixer` from the subagent list; keep `cockpit-reviewer`).
  FR-001.

---

## Phase 3: Test re-pins — `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
<!-- Phase boundary: land the Phase 2 auto.md edits first — the pins must key on the NEW heading/contract shape. -->
<!-- Re-pin, never weaken: every removed contract gets a positive pin on its replacement + a negative pin asserting the old phrasing is absent (the #433 pattern). -->

- [X] T018 [P] [US4] Re-pin the **437** block (`describe` at :2435): the D.6 heading pinned at :2546
  (`"D.6 — \`completed:validate\` (red) / merge red → bounded fixer subagent"`,
  `extractSubheadingBlock`) → new ledger-only heading; add a **negative** asserting `bounded fixer` /
  `cockpit-fixer` is absent from D.6. The D.3 header pin at :2464 stays (D.3 keeps its heading).
- [X] T019 [P] [US4] Re-pin the **449** block (`describe` at :2851): `EXPECTED_GATES` (:892) and
  `expectedGates` (:2993) drop `G.4a` and add `G.8`, `G.9`; re-pin the UI-mode gate-mapping-table
  assertion (10-row comment at :2839) to the artifact-only G.2 + new G.8/G.9 rows, no G.4a row.
- [X] T020 [P] [US4] Re-pin the **457** block (`describe` at :3213): the D.6 heading pin at :3638
  (`extractSubheadingBlock`) → new ledger-only heading + negative; `ESCALATION_DISPATCH_ROWS` at :4041
  (`toEqual(["D.6","D.7","D.10","D.11"])`) → `["D.7","D.10","D.11"]`; `457-9b` (D.6 & D.10 bound by
  drift guard) → D.10 only. The D.3 Step 0 header arrays (:3397, :3425) and the generation-discriminator
  `implementation-review → PR head SHA` pin (:3819) stay.
- [X] T021 [P] [US4] Re-pin the **469** block (`describe` at :4666): `469-25` (:5054) enumerates
  gate-verb-issuing dispatch paths including `"D.6 G.4a escalation"` (:5075) and `"D.3 review-verdict
  analyzer"` (:5123) — drop `D.6 G.4a`; re-pin the D.3 entry to the final-approval gate open (still a
  `cockpit_gate_open`, **no** subagent); add a D.13 `remediation-limit` gate-open entry. The D.3 header
  pin at :4678 stays.
- [X] T022 [P] [US4] Re-pin the **471** block (`describe` at :5243): the
  `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}` regex at
  :5360 → add `remediation-limit` (5 members); `implementation-review` stays.
- [X] T023 [P] [US4] Re-pin the **406** block invariants test `406-6` (:1626, `{ n: 1, includes:
  "Never merge on red." }` at :1645): keep §1's opening substring valid under the re-worded §1, and
  update the §5 subagent-list substring so `cockpit-fixer` is no longer asserted present / is asserted
  absent. Nine-item count and §9 pin unchanged.
- [X] T024 [US4] Add a new `describe("500 slim auto to gates/queue/clarify/merge", …)` block at the
  end of the file (after the 471 block, ~:5817+) pinning the new contract, positive + negative:
    - `500-1`: § step 1 pre-flight declares the `generacy --version` probe, the `MIN_GENERACY_VERSION`
      literal, and the below-minimum hard-fail (no ledger dir, no loop) with the verbatim operator error,
      positioned after `command -v generacy`.
    - `500-2`: D.3 opens G.8 with `approve`/`hold`/`reject`; `approve`→merge; `hold`/`reject`→no-op.
      **Negative**: D.3 no longer spawns `cockpit-reviewer` and no longer runs the request-changes
      guardrail.
    - `500-3`: D.6 is ledger-only; red validate re-fires as an engine gate. **Negative**: no
      `cockpit-fixer` / no G.4a escalation from D.6.
    - `500-4`: G.2 trigger is D.2/artifact-only (the "(artifact and implementation)" / D.3 references
      removed).
    - `500-5`: D.13 + G.9 present `resume remediation`/`stop`; `resume`→`cockpit_advance(issue,
      gate="remediation-limit")`; `stop`→exit, no label writes; findings from gate body; no subagent.
    - `500-6`: G.8 renders findings from the gate body, spawns no reviewer subagent.
    - `500-7`: the gate-mapping table has G.8 + G.9 rows and no G.4a row; the generation-discriminator
      table has `remediation-limit`.
    - `500-8`: the escalation enum narrative names three rows (D.7/D.10/D.11), not four.
    - `500-9`: `waiting-for:remediation-limit` is a recognised dispatch row (never falls through to
      D.10 unknown-state).

---

## Phase 4: Verification
<!-- Phase boundary: run after Phase 2 + Phase 3 land. -->

- [X] T025 [US4] **Mandatory playbook re-pin verification** — re-pin
  `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract
  rule this edit changes.
  **Files edited by this issue**: `packages/claude-plugin-cockpit/commands/auto.md`
  **Pin sites that read the edited file (`auto.md` via `AUTO_MD_PATH`):**
    - :2464 — 437 block, D.3 heading (`extractSubheadingBlock`) — stays; verify still resolves.
    - :2546 — 437 block, D.6 `bounded fixer subagent` heading (`extractSubheadingBlock`) — RE-PIN.
    - :892 / :2993 — 449 block, `EXPECTED_GATES` / `expectedGates` (direct `readFileSync(AUTO_MD_PATH)`
      audit) — RE-PIN (drop G.4a, add G.8/G.9).
    - :3397, :3425, :4678, :5557 — Step 0 / header arrays carrying the D.3 header (`readFileSync
      (AUTO_MD_PATH)`) — stays; verify.
    - :3638 — 457 block, D.6 `bounded fixer subagent` heading (`extractSubheadingBlock`) — RE-PIN.
    - :3819 — 457 block, generation-discriminator `implementation-review → PR head SHA` — stays; verify.
    - :4041 — 457 block, `ESCALATION_DISPATCH_ROWS` toEqual `["D.6","D.7","D.10","D.11"]` — RE-PIN to
      `["D.7","D.10","D.11"]`.
    - :5054/:5073/:5075/:5122/:5123 — 469 block `469-25` enumeration (`D.6 G.4a escalation`,
      `D.3 review-verdict analyzer`) — RE-PIN.
    - :5360 — 471 block, `row.gateType ∈ {…}` set — RE-PIN (add `remediation-limit`).
    - :1626/:1645 — 406 block `406-6` invariants §1–§8 opening substrings + `cockpit-fixer` in §5 —
      RE-PIN §5, verify §1.
    - :546 — 398 block, `readdirSync(COMMANDS_DIR)` invocation-vs-`--help` **sweep** — pins EVERY
      `commands/*.md` (including `auto.md`); the Phase 2 edits touch dispatch/gate prose, not the
      invocation contract, so this must stay green — verify no regression.
  Re-pinning means **updating the assertion to the NEW contract** established by the playbook edit.
  **Do NOT weaken or delete an assertion to make the test pass** — the pin is a drift audit; weakening
  it deletes its value (CLAUDE.md § "Cockpit playbook pins").
- [X] T026 [US4] Run the pin suite green (SC-001): `pnpm --filter claude-plugin-cockpit test`
  (or the repo test runner). All re-pinned assertions and the new `500-*` block must pass.
- [ ] T027 [P] Dry-run validation of the slimmed loop over an engine-native epic (SC-002/003/004):
  transcript shows **zero** reviewer/fixer dispatch against implementation PRs (SC-002), correct
  `remediation-limit` and post-validate `implementation-review` handling (SC-003), and reduced
  PR-state poll cadence vs. pre-change (SC-004). See `quickstart.md`.
- [ ] T028 [P] Optional — remove `packages/claude-plugin-cockpit/agents/cockpit-fixer.md` (now unused
  by `auto.md`; its only callers were D.6 / G.4a-retry). Not required for a green suite; if kept,
  confirm no remaining `auto.md` reference. Grep the repo for other callers before deleting.

---

## Dependencies & Execution Order

**Phase order (sequential):** Phase 1 → Phase 2 → Phase 3 → Phase 4.
- Phase 1 (T001 `MIN_GENERACY_VERSION`, T002 emission-order confirmation) feeds T003 and T006/T009.
- Phase 2 must land before Phase 3: the pins key on the NEW heading/contract strings, which don't
  exist until the `auto.md` edits are written.
- Phase 4 runs after both edit phases.

**Within Phase 2 (single file, mostly sequential):** All tasks edit `auto.md`. Recommended order:
T003 (pre-flight) → T004/T005 (dispatch + enriched-line tables) → T006/T007/T008 (D.3/D.6/D.13
sections) → T009 (drift-branch guard) → T010/T011 (G.2/G.4) → T012/T013 (G.8/G.9 new gates) →
T014/T015 (mapping + discriminator tables) → T016 (ledger vocab) → T017 (invariants). Not parallel —
they share one file.

**Within Phase 3 (parallel):** T018–T023 touch independent `describe` blocks / assertions and can run
in parallel `[P]`. T024 (new `500-*` block) is appended at end-of-file and is independent of T018–T023.

**Within Phase 4:** T025 (mandatory re-pin audit) governs T018–T024; T026 (suite run) depends on all
Phase 3 tasks; T027 (dry-run) and T028 (optional fixer removal) are independent `[P]`.

**Story coverage:**
- US1 (auto no longer drives review rounds): T004, T005, T007, T009, T010, T011, T014, T015, T016, T017.
- US2 (remediation-limit gate): T008, T013.
- US3 (final-approval gate → merge): T002, T006, T012.
- US4 (playbook-verification re-pinned, not weakened): T018–T026.
- US5 (version-skew graceful degradation): T001, T003.

---

*Generated by speckit*
