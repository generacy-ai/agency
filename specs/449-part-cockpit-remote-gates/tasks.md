# Tasks: `/cockpit:auto` — Cockpit Remote Gates (UI-mode dispatch)

**Input**: Design documents from `/specs/449-part-cockpit-remote-gates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story / functional area this task belongs to (US1 = flag parse; US2 = UI-mode dispatch; US3 = startup sweep; US4 = fallback)

## Phase 1: Playbook — flag parse & pre-flight (US1)

- [X] T001 [US1] Edit `packages/claude-plugin-cockpit/commands/auto.md` step-1 parse block (~line 21) to add `--gates=<value>` as an orthogonal flag alongside `--tracking` / `--new`. Values: `ui | local | auto`. Default: `auto`. Emit exactly-once parse; duplicate `--gates=*` → usage error with reason `gates-duplicate`; unknown value → usage error with reason `gates-value-invalid (<observed>)`. Match the § step-1 ambiguity-table exit pattern already at line 41. Contract: `contracts/gates-flag-parse.md`.
- [X] T002 [US1] Extend the usage string at `auto.md` line 41 to include `[--gates=ui|local|auto]  (default: auto)`. Verbatim string per `research.md § R1` — the re-pin task in Phase 5 asserts this literal.
- [X] T003 [US1] Add the `--gates=auto` two-part resolution rule to `auto.md` pre-flight prose: (a) `cockpit_gate_open` bound in session, AND (b) cluster is cloud-activated (per `contracts/gates-flag-parse.md § Auto resolution`). Decide ONCE at pre-flight, does not flip mid-run. Both YES → `ResolvedGateMode = ui`; either NO → `local` (byte-identical to `--gates=local`). Reference `cockpit-remote-gates-plan.md § Skill-side presence check`.
- [X] T004 [US1] Add the `--gates=ui` pre-flight absence hard-fail branch to `auto.md` (right after the seven-cockpit-tools presence check at line 136). Print verbatim: `--gates=ui specified but cockpit_gate_open is not available in this session; re-invoke with --gates=local or --gates=auto`. Exit non-zero. **No ledger directory created**. The startup line "Auto run starting…" is NOT emitted. Contract: `contracts/gates-flag-parse.md § Pre-flight absence`.
- [X] T005 [US1] Update the "Auto run starting …" ledger header line format in `auto.md` to include the resolved gate mode + source: `Auto run starting · gates: <ui|local> (source: --gates=<value> [→ resolution reason])`. Two examples per `quickstart.md § Expected output`. This makes the mode observable from the ledger.

## Phase 2: Playbook — UI-mode gate mapping & dispatch class D.12 (US2)

- [X] T010 [US2] Add a new top-level section `## UI-mode gate mapping (G.1–G.7)` to `auto.md` (placed after the existing gate contracts prose, before `## Dispatch`). Include a **10-row table** with columns: `Gate | transitionClass | title | drafted body | options (optionId → label / recommended?) | freeTextAffordance | downstream action per optionId | ledger action verb`. Rows in order: **G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7**. G.4(e) explicitly **excluded** with a one-line note ("G.4(e) escalation stays local-only — per-epic in-memory cursor-fault has no `<issue-ref>` to key on"). Contract: `contracts/ui-gate-mapping.md`. Row count is pinned in Phase 5.
- [X] T011 [US2] Populate the G.7 row of the mapping table with the Q4=A single-answer collapse: `freeTextAffordance: { kind: "required-if", ifOptionId: "add-more-work", placeholder: "…" }`. On `optionId: "add-more-work"`, D.12 routes `freeText` through the existing § Add-issue intent recognizer. Under fallback (local `AskUserQuestion`), the two-turn flow reverts to today's behavior. Contract: `contracts/ui-gate-mapping.md § G.7`.
- [X] T012 [US2] Populate the G.2 row with `freeTextAffordance: { kind: "optional", placeholder: "reviewer comment (optional)" }` matching the local drafter's comment-body affordance. All other rows (G.1, G.3, G.4a–d, G.5, G.6) default to `{ kind: "none" }`.
- [X] T013 [US2] Add a new dispatch class row **D.12 `gate-answer`** to the `## Dispatch` table in `auto.md`. Class discriminator: `kind: "gate-answer"` on the doorbell NDJSON line and as a batch item from `cockpit_await_events`. Wake surfaces: doorbell + `cockpit_await_events`. Downstream: § D.12 gate-answer handler (added by T014). Contract: `contracts/dispatch-d12-gate-answer.md`.
- [X] T014 [US2] Add a `### D.12 gate-answer` subsection under `## Dispatch` in `auto.md` covering the full handler contract: (1) look up `gateId` in `openGates`; (2) V3 generation match — mismatch → `cockpit_gate_ack(superseded)`; (3) V4 live-state supersession — re-check trigger label via enriched doorbell line or `cockpit_status` fallback per E6; if resolved out-of-band → `cockpit_gate_ack(superseded)`; (4) route `{optionId, freeText}` onto the same handling the local `AskUserQuestion` path performs today (relay clarify answers, advance, queue, merge, fixer spawn, mute, exit, edit-directive re-open); (5) on success → `cockpit_gate_ack(applied)`; on downstream error → `cockpit_gate_ack(failed, detail)`; (6) delete `GateRecord` from `openGates`. Contract: `contracts/dispatch-d12-gate-answer.md`.
- [X] T015 [US2] Add the **revised-draft re-open** flow to the D.12 subsection: when the resolved action is `Make changes` (edit-directive path), apply the edit directive, increment `generation`, and re-open with `cockpit_gate_open(generation = g+1, gate = <revised draft>)`. Prior generation's late-arriving answer matches V3 mismatch → ack `superseded`. Reference `data-model.md § Revised-draft re-open path`.
- [X] T016 [US2] Update the § In-memory loop state prose in `auto.md` to add `openGates: Map<gateId, GateRecord>` alongside `monitorHandle`, `cursor`, `muteSet`, `activeGeneration`. Not persisted to disk; startup sweep re-derives via Q2=B. Reference `data-model.md § OpenGatesMap`.

## Phase 3: Playbook — startup sweep, fallback, and ledger conventions (US3, US4)

- [X] T020 [US3] Extend the step-3 startup sweep at `auto.md` line 143 for UI mode. Sweep re-opens remote gates for **all persistent gate-trigger states**: every `waiting-for:*` label (baseline per FR-013) PLUS `agent:error`, `failed:*`, `completed:validate` with red checks, `phase-complete`, `blocked:stuck-merge-conflicts`. G.4(e) excluded (in-memory cursor streak). Idempotency guaranteed by `gateId = hash(issueRef, dispatchClass, generation)`. Contract: `contracts/ui-startup-sweep.md`.
- [X] T021 [US4] Add a `### UI-mode fallback on cockpit_gate_open call error` prose block to `auto.md` (under the new UI-mode section). On a `cockpit_gate_open` call returning an error (typed error, network failure, timeout), fall back to local `AskUserQuestion` **for that gate only**; the loop continues. FIRST failure in a run writes a single ledger note; subsequent failures are silent. Fallback resolution rows carry `· source: ui-gate-fallback` (distinct from clean `· source: ui-gate`). Contract: `contracts/ui-mode-fallback.md`. Explicitly distinct from Q3=A pre-flight absence.
- [X] T022 [US2] Update the `## Ledger` section in `auto.md` (or extend an existing "provenance suffix" prose block) to codify the Q5=B rule: **gate-open is print-only** ("one pointer line" per FR-005 — UI affordance, not a ledger append). D.12 writes **exactly one ledger line per resolved gate** in the existing four-column format, appending `· source: ui-gate` in the outcome slot. Fallback resolutions use `· source: ui-gate-fallback`. Reuses the E6 `· source: enriched-line` convention at `auto.md` line 1303. Contract: `contracts/ledger-ui-mode.md`. Grep recipes on stable `<action>` / `<outcome>` strings continue to work.
- [X] T023 [US2] Add explicit "one pointer line" prose to the UI-mode section: on `cockpit_gate_open` success, print exactly `gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)`. Verbatim string per `quickstart.md § What UI mode looks like`. This is NOT a ledger row.

## Phase 4: Reference-implementation types (optional, non-load-bearing)

- [X] T030 [P] [US2] Create `packages/claude-plugin-cockpit/lib/gate-wire-types.ts` reproducing the reference types from `data-model.md § Types` (`GateFlagValue`, `ResolvedGateMode`, `GateId`, `GateGeneration`, `DispatchClass`, `GateOpenParams`, `GateOption`, `FreeTextAffordance`, `GateOpenResult`, `GateAnswerEvent`, `GateAckParams`, `GateRecord`, `GateDraft`, `OpenGatesMap`). Reference-only — the playbook prose is the source of truth per `plan.md § Constitution Check`. Do NOT re-declare wire fields in a way that diverges from `cockpit-remote-gates-plan.md`.

## Phase 5: Playbook-verification pins (mandatory)

- [X] T040 [US1,US2,US3,US4] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :298: describe/it block reading `AUTO_MD_PATH` (readFileSync) — verify existing assertions still hold under new content
    - :527: `playbookFiles = readdirSync(COMMANDS_DIR)` sweep — pins every `commands/*.md` for invocation-vs-`--help` drift (always included)
    - :1113: `autoMd = readFileSync(AUTO_MD_PATH)` + iterated `extractSubheadingBlock` — heading-set assertions must include the new UI-mode section headings if pinned
    - :1130: `extractSubheadingBlock(autoMd, "D.9d — \`phase:*\` → ledger only")` — verify D.9 rows still pin after D.12 row insertion in the dispatch table
    - :1181–1188: `extractSubheadingBlock` for D.7 / D.11 — verify D.7/D.11 blocks still resolve after mapping-table + D.12 additions
    - :1265, :1285: `readFileSync(AUTO_MD_PATH)` — post-mapping-table content pins
    - :1529, :1568, :1582: `extractInstructionsSteps(autoMd)` — step-1 assertions (add `--gates` flag presence, usage string extension, pre-flight absence branch)
    - :1608: `readFileSync(AUTO_MD_PATH)` — pin content that intersects new dispatch / ledger sections
    - :2373: `readFileSync(AUTO_MD_PATH)` — verify pin still resolves
    - :2418: `extractInstructionsSteps(autoMd)` — step-N assertions covering pre-flight / startup-sweep prose
    - :2441, :2450, :2524, :2530, :2553, :2560: `extractSubheadingBlock` iterations — add new subheadings if pinned (`### UI-mode gate mapping (G.1–G.7)`, `### D.12 gate-answer`, `### UI-mode fallback on cockpit_gate_open call error`)
    - :2480, :2510: `readFileSync(AUTO_MD_PATH)` — verify surrounding pins still resolve
    - :2755, :2784, :2792: `extractInstructionsSteps(autoMd).get(1)` — step-1 flag-parse pins; MUST add `--gates=ui|local|auto` value pin, `gates-value-invalid` reason pin, `gates-duplicate` reason pin, and the verbatim pre-flight absence error string pin
  Add NEW pins (create a new `describe("449 UI-mode gates", ...)` block) for:
    - `--gates` flag present in the usage string at line 41 (literal-match)
    - D.12 row present in the dispatch table
    - 10-row mapping table exact row count and heading (G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7 — G.4e absent from the table)
    - `· source: ui-gate` suffix rule literal-match
    - `· source: ui-gate-fallback` distinct-suffix literal-match
    - Pre-flight absence hard-fail verbatim error string literal-match
    - Q2=B extended sweep trigger set present (`waiting-for:*`, `agent:error`, `failed:*`, `completed:validate` + red, `phase-complete`, `blocked:stuck-merge-conflicts`)
    - G.4(e) exclusion note present in the mapping section
  Re-pinning means updating the assertion to the NEW contract.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.

## Phase 6: Verification

- [X] T050 [US1,US2,US3,US4] Run `pnpm --filter @generacy/claude-plugin-cockpit test tests/playbook-verification.test.ts` and confirm the suite is green. If a heading or contract-rule pin fails, update the assertion to the NEW contract per T040 — do not weaken.
- [X] T051 [P] [US1] Run `pnpm --filter @generacy/claude-plugin-cockpit build` (or the workspace-level `pnpm build`) — verify `lib/gate-wire-types.ts` (from T030, if added) type-checks and no regression in prose-only builds.
- [X] T052 [US1] Manually verify the `--gates=local` byte-path is unchanged: `git diff develop -- packages/claude-plugin-cockpit/commands/auto.md` should show only ADDITIONS in step-1 (the new flag branch), new sections (UI-mode mapping, D.12), and additive prose in step-3 sweep + § Ledger. No deletions or reorderings that alter the local-mode dispatch sequence. Spec § Acceptance criteria: "--gates=local byte-path unchanged".

## Dependencies & Execution Order

**Phase order** (sequential):
- Phase 1 (flag parse + pre-flight) → Phase 2 (mapping + D.12) → Phase 3 (sweep + fallback + ledger) → Phase 4 (optional lib types) → Phase 5 (re-pin) → Phase 6 (verification).

**Rationale**: the mapping table and D.12 handler assume the resolved gate mode exists; the sweep and fallback branches reference D.12's ack outcomes; playbook-verification pins must be updated **after** the playbook edits are complete because the pins assert against the new heading strings and row shapes.

**Parallel opportunities within phases**:
- Phase 4 T030 [P] — independent of the playbook edits (reference-only types).
- Phase 6 T051 [P] — build check parallel to T050 test run (different tool invocations, different failure signals).

**Sequential within Phase 1–3**:
- T001–T005 touch the same step-1 block in `auto.md`; execute in order (T001 → T002 → T003 → T004 → T005).
- T010–T012 all touch the new `## UI-mode gate mapping` table (same section); execute T010 → T011 → T012.
- T013–T015 all touch the `## Dispatch` section around D.12; execute T013 → T014 → T015.
- T020–T023 touch distinct blocks (step-3 sweep vs UI-mode subsections vs § Ledger) and could be sequenced in any order, but keep T022 (ledger convention) after T021 (fallback) because the fallback prose references the `-fallback` suffix.

## Grouping strategy for issue creation

Default: `epic-grouping:per-story` when this issue is expanded via `/speckit:taskstoissues`. That groups T001–T005 as one child (US1 flag parse), T010–T016 + T022–T023 as one child (US2 UI-mode dispatch), T020 as one child (US3 sweep), T021 as one child (US4 fallback), and T030 + T040 + T050–T052 as the verification / reference bundle.

## Suggested next step

`/speckit:implement` to begin execution. Land Phase 1–3 as playbook prose edits before touching the pin file — the pin assertions need the new contract strings to exist first.
