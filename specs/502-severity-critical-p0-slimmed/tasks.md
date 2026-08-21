# Tasks: Fix inverted engine-compatibility gating in `/cockpit:auto`

**Input**: Design documents from `/specs/502-severity-critical-p0-slimmed/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/ (capability-detection, legacy-advance-path, fail-closed-diagnostic, pin-repin-500-1)
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = flag-off/legacy engine; US2 = #1120-bearing engine; US3 = pin-test drift audit)

**Scope note**: This is a **playbook-prose + test edit only**, entirely within `packages/claude-plugin-cockpit/`. No engine, MCP-schema, or cloud change lands here (per plan.md § "Files intentionally not touched"). Two files change:
- `packages/claude-plugin-cockpit/commands/auto.md` (the playbook prose)
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (re-pin `500-1` + related)

---

## Phase 1: Locate the edit sites (read-only anchor pass)

- [X] T001 [US2] Read `auto.md § step 1` pre-flight region (`auto.md:208–244`) and confirm the exact bytes of the `MIN_GENERACY_VERSION = 0.2.0` block: the `generacy --version` probe, the `>= 0.2.0` comparison, the verbatim below-minimum error, the unparseable/missing branch, the `Do **NOT** create the ledger directory.` / `Do **NOT** start the loop.` hard-fail idiom, and the `It runs AFTER the doorbell-surface probe and BEFORE \`command -v generacy\`` positioning line. These are the strings the removal must delete and that `500-1` currently pins.
- [X] T002 [P] [US1] Read `auto.md § D.3 — \`waiting-for:implementation-review\`` (`auto.md:747–775`) and note: the Step 0 identity/drift/adoption machinery (KEEP byte-for-byte), the `approve` verdict-application at `:772`, the enriched-line `labels` field / `cockpit_status` fallback available to D.3 (E3), the ledger line at `:775`, and the D.3 summary/dispatch row at `:555`.
- [X] T003 [P] [US1] Read `auto.md § Gate contract G.8 — Implementation-review final-approval gate` (`auto.md:1478–1500`) and the UI-mode gate-mapping G.8 row (`auto.md:1574`). Note the existing `approve` → merge routing and the sibling advance idioms to mirror: D.4 `cockpit_advance(issue, gate="manual-validation")` (`:808`) and D.13 `cockpit_advance(issue, gate="remediation-limit")` (`:1053,1517`), plus the `cockpit_resume` is the WRONG verb warning.
- [X] T004 [P] [US1] Read the Monitor-absence (`auto.md:208–214`) and doorbell-absence (`auto.md:218–224`) pre-flight hard-fails so the fail-closed diagnostic can byte-mirror their idiom (verbatim block, exit non-zero, halt loop, no admit-and-strand).

## Phase 2: Edit `auto.md` (core implementation)
<!-- All Phase 2 tasks edit the same file (auto.md) — NOT parallel. Land them in listed order. -->

- [X] T005 [US2] **Remove the version-literal hard gate** in `auto.md § step 1` pre-flight (`:226–244`), per contracts/capability-detection.md § Removal. Delete the `MIN_GENERACY_VERSION` literal, the `>= 0.2.0` comparison, the verbatim below-minimum error, and the unparseable/missing fail-closed branch. Optionally retain a one-line **advisory** `generacy --version` echo (informational only; MUST NOT exit non-zero on version and MUST NOT gate the run). Retain the FR-006 sentence at `:244` documenting new-engine + old-`auto` inertness, trimmed of its now-stale version-guard reference.
- [X] T006 [US1] **Add authoritative runtime gate-placement detection at D.3** (`auto.md:747–775`), per contracts/capability-detection.md § Runtime detection and data-model.md § "Detection signal". Before applying the `approve` verdict, resolve the engine model from the issue's live labels (enriched-line `labels` field per E3, or `cockpit_status(issue=<ref>, json=true)` fallback — no extra query on the enriched-line path): `completed:validate` co-occurs with `waiting-for:implementation-review` → **post-validate**; `completed:validate` absent → **legacy** (provisional). Keep the D.3 Step 0 identity/drift/adoption machinery **byte-for-byte unchanged** (gateType `implementation-review`, generation = PR head SHA, `runId` threading).
- [X] T007 [US1] **Split the D.3 `approve` verdict-application into model branches** (`auto.md:772`), per data-model.md § "D.3 dispatch branch": `post-validate` → `cockpit_merge(issue=<ref>)` (unchanged, merge on green never on red); `legacy` → `cockpit_advance(issue=<ref>, gate="implementation-review")` (restore the #500-removed branch, per contracts/legacy-advance-path.md); `undetectable` → fail closed (T009). `hold` / `reject` stay no-ops in every model (label stays, gate re-fires; §3 add-only — no label writes).
- [X] T008 [US1] **Restore the legacy advance-on-approve branch in Gate contract G.8** (`auto.md:1478–1500`), per contracts/legacy-advance-path.md § Behavior table. G.8 still prompts `approve` / `hold` / `reject` unchanged; only `approve`'s post-gate action gains the model branch (post-validate → `cockpit_merge`; legacy → `cockpit_advance(issue=<ref>, gate="implementation-review")`; undetectable → fail-closed). Use `cockpit_advance`, NOT `cockpit_resume` (mirror the D.4 / D.13 idiom).
- [X] T009 [US1] **Add the fail-closed branch with the actionable flag-naming diagnostic**, per contracts/fail-closed-diagnostic.md and research.md § "Where the fail-closed branch fires". Fires when the provisional legacy `cockpit_advance(gate="implementation-review")` is rejected by the engine as an unknown gate (neither post-validate nor legacy servable). Print the verbatim diagnostic that names **both** `reviewPhaseEnabled` **and** `ciMergeGateEnabled`, explains the strand, and points to the manual-drive fallback (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`). Adopt the pre-flight idiom (verbatim block, exit non-zero, halt loop, no admit-and-strand). **Finalize the exact bytes here** — T012 pins to these bytes. Placement: runtime at D.3 (detection is runtime-authoritative); write a terminal `fail-closed: <detail>` ledger line and exit (the ledger dir already exists at runtime — reconcile FR-004's "no ledger dir" clause as the *idiom template* being mirrored, not a literal runtime requirement).
- [X] T010 [US1] **Extend the D.3 ledger outcome vocabulary** (`auto.md:775`), per data-model.md § "Ledger vocabulary": add `advanced (implementation-review)` (legacy/approve) and `fail-closed: <detail>` (undetectable) alongside the existing `merged (PR #<n>)` / `held` / `rejected` / `blocked: <reason>` / `error: <description>`. Also update the terse `approve` → outcome text in the D.3 summary/dispatch row (`:555`) and the UI-mode gate-mapping G.8 row (`:1574`) to reflect both approve branches (merge vs advance).

## Phase 3: Verification
<!-- Phase boundary: complete Phase 2 (auto.md edits) before Phase 3. The implementer must land the playbook edit before knowing the exact heading/contract/diagnostic bytes to pin to. -->

- [X] T011 [US3] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes, per contracts/pin-repin-500-1.md (Q4=A: freeze both the detection mechanism AND the exact fail-closed wording).
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :5887: `500-1` "§ step 1 pre-flight declares the `generacy --version` skew guard (MIN_GENERACY_VERSION = 0.2.0)…" (`readFileSync(AUTO_MD_PATH)` direct read) — **primary re-pin**. Remove the negative-now-wrong assertions on `MIN_GENERACY_VERSION`, `` `0.2.0` ``, the below-minimum error string, the `Could not parse` branch, and the version-guard positioning line; add **negative** pins that those strings are gone; add **positive** pins for the co-occurrence detection mechanism (`completed:validate` co-occurs with `implementation-review`), the two routing verbs (`cockpit_merge` vs `cockpit_advance(issue=<ref>, gate="implementation-review")`), the **exact** fail-closed diagnostic bytes finalized in T009, and both flag names verbatim (`reviewPhaseEnabled`, `ciMergeGateEnabled`).
    - :5914: `500-2` D.3 verdict application (`extractSubheadingBlock(autoMd, "D.3 — \`waiting-for:implementation-review\`")`) — update `` `approve` → cockpit merge path `` to the model-branched contract (merge on post-validate; advance on legacy); keep the `hold`/`reject` no-op and the "no reviewer subagent"/"no request-changes" negative pins.
    - :5981: `500-6` G.8 gate contract (`extractSubheadingBlock(autoMd, "G.8 — Implementation-review final-approval gate")`) — extend the `approve` pin to the model branch; retain the findings-from-gate-body and no-reviewer-subagent pins.
    - :5997: `500-7` UI-mode gate-mapping table (`readFileSync(AUTO_MD_PATH)` + section slice) — verify/update the G.8 mapping row's terse `approve` outcome text to reflect both branches.
    - :546: `readdirSync(COMMANDS_DIR)` invocation-vs-`--help` sweep — must stay green; these edits touch dispatch/gate/pre-flight prose, not the invocation contract. Verify only.
    - :5869–5884: update the `describe("500 …")` block header comment so it documents the corrected capability-detection mechanism, not the inverted version guard.
  Re-pinning means updating the assertion to the NEW contract established by the T005–T010 edits.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value. In particular, do NOT loosen the fail-closed assertion to "message present" — freeze the exact bytes so the flag-name contract (`reviewPhaseEnabled` / `ciMergeGateEnabled`) cannot silently rot (FR-005).
- [X] T012 [US3] Run the pin suite and confirm `500-1` (and the touched `500-2` / `500-6` / `500-7`) pass against the edited `auto.md`, and that the `readdirSync(COMMANDS_DIR)` sweep and all unchanged D.3 Step 0 pins (e.g. `457-6`, `469-*`) stay green (SC-004): `pnpm --filter @generacy-ai/claude-plugin-cockpit test packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.
- [X] T013 [P] Trace the acceptance criteria end-to-end against the edited prose (quickstart.md § three engine scenarios): SC-002 a #1120-bearing engine (preview `0.0.0-preview-*` / source `0.1.1`) is admitted and reaches the merge path; SC-003 a legacy `0.2.0`–`0.10.2` engine is no longer admitted-and-stranded (routes to the legacy advance path or fails closed); SC-001 no `waiting-for:implementation-review` dead-end remains.

## Dependencies & Execution Order

**Phase boundaries** (sequential):
- Phase 1 (locate) → Phase 2 (edit `auto.md`) → Phase 3 (verify). Phase 3 depends on Phase 2 because the implementer must land the playbook edit before knowing the exact heading / contract / diagnostic bytes to pin to.

**Within Phase 1** (all read-only, parallel):
- T001, T002, T003, T004 can run in parallel (independent reads).

**Within Phase 2** (all edit `auto.md` — sequential, NOT parallel):
- T005 → T006 → T007 → T008 → T009 → T010. T007 depends on the T006 detection step; T009's exact bytes are consumed by T011; T010 depends on the branches added in T007–T009.

**Within Phase 3**:
- T011 (re-pin) must precede T012 (run tests). T013 is independent analysis and may run in parallel with T011/T012 [P].

**Critical coupling** (CLAUDE.md § "Cockpit playbook pins"): T011 is mandatory because spec.md/plan.md name `packages/claude-plugin-cockpit/commands/auto.md`. `500-1` asserts the *removed* version literal today, so it fails on this PR by design — the correct response is re-pinning to the new contract in the same PR, never weakening or deleting the assertion.
