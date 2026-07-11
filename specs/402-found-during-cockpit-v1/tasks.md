# Tasks: Add `AskUserQuestion invocation contract` section to `auto.md` + fusion-drift audit

**Input**: Design documents from `/specs/402-found-during-cockpit-v1/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = the finding #57 fix)

## Phase 1: Playbook prose edits (`auto.md`)

- [X] T001 [US1] Insert new top-level `## AskUserQuestion invocation contract` H2 section into `packages/claude-plugin-cockpit/commands/auto.md`, positioned between the closing content of `## Gate contract` (after G.5's last content line) and the next H2 heading (`## Ledger`). Section body MUST contain three labeled rules per `contracts/contract-section-shape.md`: (1) **Default gate shape** — `AskUserQuestion.questions` is a single-item array (one call per gate/batch); (2) **Harness ceiling** — `AskUserQuestion.questions` array MUST NOT exceed **4 items** per call, quoting the exact harness error `InputValidationError: Too big: expected array to have <=4 items (questions)`; (3) **Multi-gate fanout** — when multiple gates fuse into one response, fire multiple `AskUserQuestion` calls (one per gate), never a single fused call. Include a composition paragraph explaining the three rules compose transitively. The literal tokens `4 items` and `per call` MUST both appear in the section body (audit-detectable per `boundPresent` check). Do NOT reintroduce `ceil(N/4)` or `never per-question` prose (Q4=C).

- [X] T002 [US1] Rewrite G.1's `**Gate invocation**` paragraph in `packages/claude-plugin-cockpit/commands/auto.md` (current line ~372, section `### G.1 — Clarification batch gate`). Replace `**Exactly one** \`AskUserQuestion\` call per batch in the same response (never \`ceil(N/4)\`, never per-question).` with `Per § AskUserQuestion invocation contract — one \`AskUserQuestion\` call per batch (single-item \`questions\` array); when multiple clarification gates fuse into one response, fire one call per gate.`. Keep the `Parameters:` list (Question text, Header, multiSelect, Options) unchanged. Per `contracts/gate-contract-references.md`.

- [X] T003 [US1] Prepend `Per § AskUserQuestion invocation contract — <gate-specific restatement>.` reference sentence to G.2's `**Gate invocation**` paragraph in `packages/claude-plugin-cockpit/commands/auto.md` (`### G.2 — Review verdict gate`). Restatement: `one call per verdict gate (single-item \`questions\` array); when multiple review gates fuse into one response, fire one call per gate.`. Parameters list unchanged.

- [X] T004 [US1] Prepend `Per § AskUserQuestion invocation contract — <gate-specific restatement>.` reference sentence to G.3's `**Gate invocation**` paragraph in `packages/claude-plugin-cockpit/commands/auto.md` (`### G.3 — Manual-validation confirm gate`). Restatement: `one call per manual-validation gate (single-item \`questions\` array); when multiple manual-validation gates fuse into one response, fire one call per gate.`. Parameters list unchanged.

- [X] T005 [US1] Prepend `Per § AskUserQuestion invocation contract — <gate-specific restatement>.` reference sentence to G.4's shared `**Gate invocation**` paragraph (covering subtypes G.4a/b/c/d) in `packages/claude-plugin-cockpit/commands/auto.md` (`### G.4 — Escalation gate` and its subtype rows). Restatement: `one call per escalation gate (single-item \`questions\` array); when multiple escalation gates fuse into one response, fire one call per gate.`. Ensure the substring `AskUserQuestion invocation contract` appears within the section body covering each of G.4a, G.4b, G.4c, G.4d (either one shared reference before the Options table per placement 1, or per-row references per placement 2 — placement 1 preferred). Parameters unchanged.

- [X] T006 [US1] Prepend `Per § AskUserQuestion invocation contract — <gate-specific restatement>.` reference sentence to G.5's `**Gate invocation**` paragraph in `packages/claude-plugin-cockpit/commands/auto.md` (`### G.5 — Phase-queue confirmation gate`). Restatement: `one call per phase-queue gate (single-item \`questions\` array); phase-queue gates rarely fuse but the fanout rule applies uniformly if they do.`. Parameters list unchanged.

## Phase 2: Negative fixture

<!-- Phase boundary: Complete Phase 1 (playbook prose) before starting Phase 2/3 tests — audit assertions depend on the post-fix auto.md AND the fixture existing. -->

- [X] T007 [P] [US1] Create `packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md` (~15-25 lines) per `contracts/negative-fixture-shape.md`. File MUST contain: top-of-file comment identifying it as the drift fixture for #402 and warning against adding the contract section; `## Gate contract` H2 heading; `### G.1 — Clarification batch gate` H3 heading with the pre-fix `**Gate invocation**: **Exactly one** \`AskUserQuestion\` call per batch in the same response (never \`ceil(N/4)\`, never per-question).` phrasing; presentation block elided with a marker note; the G.1 `Parameters:` list; final HTML comment noting no `## AskUserQuestion invocation contract` section follows. File MUST NOT contain any heading matching `## AskUserQuestion invocation contract` at any depth. Follows the `398-drift-auto.md` shape (~15-25 lines).

## Phase 3: Test-suite extension (`playbook-verification.test.ts`)

- [X] T008 [US1] Append a new `describe("402 — playbook AskUserQuestion invocation contract audit", …)` block to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, positioned after the existing `describe("400 — …", …)` block. Include the block-level comment banner documenting the 402-1/402-2 purpose per `contracts/drift-audit-assertion.md` § Combined test file layout. Define the `AuditReport` type inline: `{ sectionExists: boolean; boundPresent: boolean; gateReferences: Array<{ gate: string; hasReference: boolean }> }`.

- [X] T009 [US1] Implement inline helper functions inside the new `describe` block (or module-scoped adjacent to it) in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`: `parseSections(content: string)` (splits file into H2/H3 sections tracked by depth/startLine/endLine/header/body); `findContractSection(sections)` (finds H2 section whose header contains case-insensitive substring `AskUserQuestion invocation contract`); `findGateSections(sections)` (returns all H3 sections matching regex `^### G\.\d(a|b|c|d)? — `); `boundPresent(body: string)` (returns true if regex `≤ ?4 ?items? ?per ?call` matches OR both literal tokens `4 items` and `per call` appear on same or adjacent lines); `auditContract(filePath: string): AuditReport` (top-level entrypoint composing the four parser stages, short-circuits `boundPresent`/`gateReferences` when `sectionExists` is false). Follow the inline-helpers pattern from `398-1`/`400-1` blocks; do NOT export to `lib/`.

- [X] T010 [US1] Implement the `402-1` structural drift audit assertion (`it("402-1 (structural drift audit): auto.md has the contract section, the ≤4 bound, and cross-references from every gate contract", …)`) in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Read `packages/claude-plugin-cockpit/commands/auto.md` via `auditContract`. Assert: `report.sectionExists === true`; `report.boundPresent === true`; every entry in `report.gateReferences` has `hasReference === true` (covering `G.1`, `G.2`, `G.3`, `G.4a`, `G.4b`, `G.4c`, `G.4d`, `G.5`). Failure message MUST list the specific missing element(s) — the offending gate name(s) and which check failed — per the failure-output shape in `contracts/drift-audit-assertion.md`.

- [X] T011 [US1] Implement the `402-2` negative-fixture regression assertion (`it("402-2 (regression check): audit reports missing-contract-section on 402-drift-auto.md fixture", …)`) in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. Read `packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md` via `auditContract`. Assert `report.sectionExists === false` with a diagnostic message including the serialized report per the shape in `contracts/drift-audit-assertion.md`. This proves the parser correctly identifies section absence.

## Phase 4: Verification

<!-- Phase boundary: Complete Phase 1/2/3 (prose + fixture + tests) before verification — the assertions run against the shipped state. -->

- [X] T012 [US1] Run static checks per `quickstart.md` § Static checks in `packages/claude-plugin-cockpit`: grep `commands/auto.md` for `## AskUserQuestion invocation contract` (exactly one hit); grep same for `4 items` AND `per call` co-occurring within the contract section; grep for `never ceil(N/4)` (zero hits — negative anchor); grep each `### G.<n>` section body for `AskUserQuestion invocation contract` substring (at least one hit per gate covering G.1/G.2/G.3/G.4a/G.4b/G.4c/G.4d/G.5); grep `tests/fixtures/402-drift-auto.md` for `## AskUserQuestion invocation contract` (zero hits). Confirm no changes to `clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md` on this branch (`git diff --name-only`).

- [X] T013 [US1] Run the extended Vitest suite from `packages/claude-plugin-cockpit`: `pnpm --filter claude-plugin-cockpit test` (or `pnpm test` from repo root filtered to the package). Confirm the new `describe("402 — …")` block runs both `402-1` and `402-2` and both pass. Confirm no other suites (394-*, 396-*, 398-*, 400-*) regressed. If `402-2` fails while `402-1` passes, revisit the parser (see `contracts/drift-audit-assertion.md` § Failure diagnosis paths).

## Dependencies & Execution Order

**Sequential dependencies**:
- Phase 1 (T001–T006) → Phase 3 tests (T010) — the audit assertion asserts against the post-fix `auto.md` prose.
- Phase 2 (T007 fixture) → Phase 3 tests (T011) — the negative-fixture assertion reads the checked-in fixture.
- Phase 3 (T008–T011) → Phase 4 (T012–T013) — verification runs against the shipped state.

**Parallel opportunities within Phase 1**:
- T001 (new section) touches a different range of `auto.md` than T002–T006 (gate paragraphs), but all edits are in the same file — sequence them to avoid edit-conflict merge pain. T002–T006 are logically independent edits to different H3 sections within `auto.md`.

**Parallel opportunities across phases**:
- **T007 (fixture) is [P]** — it creates a new file (`tests/fixtures/402-drift-auto.md`) with no dependency on the `auto.md` edits or the test-file edits. Can run in parallel with any Phase 1 task.
- **T008–T009 (test block skeleton + helpers) can be drafted in parallel with Phase 1 prose edits** — the helpers depend only on the audit shape from `contracts/drift-audit-assertion.md`, not on the `auto.md` content. However, T010–T011 assertions must wait for T001–T007 to complete before they can pass green.

**Recommended execution order**:
1. T001 → T002 → T003 → T004 → T005 → T006 (sequential edits to `auto.md`)
2. T007 (fixture — can run in parallel with the above)
3. T008 → T009 → T010 → T011 (test-file changes; helpers before assertions)
4. T012 → T013 (verification)

Total: 13 tasks across 4 phases; 1 file edited (`auto.md`), 1 file extended (`playbook-verification.test.ts`), 1 file created (`402-drift-auto.md`). Scope matches plan.md § Scale/Scope (no cross-package, no runtime code, no sibling playbook changes).

---

*Generated by speckit /tasks (standard mode, `workflow:speckit-bugfix` label)*
