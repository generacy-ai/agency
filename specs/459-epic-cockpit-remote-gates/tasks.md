# Tasks: Cockpit Remote Gates — Pre-flight Functional Probe

**Input**: Design documents from `/specs/459-epic-cockpit-remote-gates/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md, contracts/gate-query-probe.md, contracts/auto-resolution-fold-in.md, contracts/error-line-formatter.md
**Status**: Complete
**Mode**: Epic (coarse-grained task groups)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Task group can run in parallel with other `[P]` groups in the same phase
- **[Story]**: Which user story this task group addresses (US1: ui fail-fast, US2: auto fold-in, US3: local unaffected)

## Phase 1: Reference formatter (foundation)

### TG-001 [US1, US2, US3] Task Group: Add `formatGateQueryProbeErrorLine` reference formatter + fixture equalities
**Scope**: 2–3 hours
**Files**:
- `packages/claude-plugin-cockpit/lib/gate-status-check.ts` (EDIT — add one exported function; NO new types)
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (EDIT — add fixture-equality assertions inside the new `describe("459 pre-flight functional probe", ...)` block)
**Tests**: New `describe("formatGateQueryProbeErrorLine", ...)` sub-block with four `it(...)` fixture-equality assertions (one per `GateQueryErrorClass`), mirroring the pinning shape of test `457-9a`. Full `vitest` run — `pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification` — must stay green.

- [X] Export `formatGateQueryProbeErrorLine(error: GateQueryError): string` in `lib/gate-status-check.ts` returning the exact frozen template `gate-query surface unavailable (class: ${error.class}): ${error.message} — re-run with --gates=local, or fix the cluster/cloud gate-query deployment` (em-dash U+2014, no trailing period, no `issueRef` argument — per contracts/error-line-formatter.md § Signature).
- [X] Do NOT introduce a new type. Reuse the existing `GateQueryError` shape verbatim (per data-model.md § Types).
- [X] Add fixture-equality assertions for all four classes (`query-unreachable`, `invalid-args`, `internal`, `transport`) using the exact detail strings from contracts/error-line-formatter.md § Fixture-verified equality assertions (the `internal` fixture reproduces the motivating 404 detail from cluster `snappoll-local-2`, 2026-07-25).
- [X] Confirm `classifyGateQueryError`, `formatPreDraftCheckErrorLine`, `driftBranchMaySupersede`, `DRIFT_GUARD_UNRESOLVABLE_GATE_TYPES`, `ESCALATION_DISPATCH_ROWS`, `classifyPreDraftCheck`, `ANSWERED_SWEEP_THRESHOLD`, and `tickAnsweredSweepCounter` remain unchanged and unaffected.
- [X] Do NOT wire the formatter into `commands/auto.md` behavior yet — Phase 2 owns that. This phase produces a callable, pin-verified reference; Phase 3 pins the string against auto.md prose.

---

## Phase 2: Playbook prose edits (auto.md)
<!-- Phase boundary: Complete Phase 1 before starting Phase 2 -->

Sequencing rationale: Phase 1 delivers a callable reference formatter with fixture-verified equality; Phase 2 edits `auto.md` prose to match that exact string (source of truth remains the playbook prose, per plan.md § Constitution Check). Phase 3 pins both together.

### TG-002 [US1, US2, US3] Task Group: Extend `auto.md` § step 1, § Ledger, § Gate-query error taxonomy for pre-flight probe
**Scope**: 4–6 hours (careful prose surgery with several load-bearing pin-verbatim strings; multiple invocation-form sequencing constraints)
**Files**:
- `packages/claude-plugin-cockpit/commands/auto.md` (EDIT — § step 1 `--gates` resolution extended; explicit `--gates=ui` block gains probe step; `Auto run starting` line gains `probe-failed` reason; § Ledger clause amended + `preflight`/`ui-gate-probe` vocabulary added; § Gate-query error taxonomy gains cross-reference)
**Tests**: No test edits here — Phase 3 pins the prose. Local smoke: `git diff packages/claude-plugin-cockpit/commands/auto.md` must show only additive changes to the sections named below; the `readdirSync(COMMANDS_DIR)` sweep at :545 must still see `auto.md` respond to `--help` normally.

- [X] Extend § step 1 `--gates=auto` resolution from a two-item to a THREE-item numbered list with the probe as item 3 (per contracts/auto-resolution-fold-in.md § The three-part check). State the short-circuit rule verbatim: "issue item 3 ONLY when items 1 AND 2 both pass; otherwise resolve to `local` with NO probe call and NO probe ledger row." Header: change "two-part check, decided ONCE" → "three-part check, decided ONCE".
- [X] Extend § step 1 explicit `--gates=ui` block with a pre-flight probe step running AFTER the existing `cockpit_gate_open`-bound check AND AFTER F4.6/F4.4 has bound the identity ref; hard-fail (exit non-zero) on ANY probe error (per contracts/gate-query-probe.md § Scope + § Fail path). Preserve the existing `--gates=ui` absence hard-fail string (pinned by 449-4) unchanged.
- [X] State the Form 4 sequencing rule verbatim in § step 1: probe fires AFTER F4.6/F4.4 has bound `trackingRef`, NOT alongside items 1–2 (per contracts/auto-resolution-fold-in.md § Why the Form 4 sequencing matters). Under Forms 1/2/3 the ordering is trivially satisfied.
- [X] Add `probe-failed` to the enumerated `<resolution reason>` values in the `Auto run starting · gates: local (source: --gates=auto → <resolution reason>)` line documentation (siblings of existing `cockpit_gate_open unbound`, `cluster not cloud-activated`, per contracts/auto-resolution-fold-in.md § The `Auto run starting` line — `probe-failed` value).
- [X] State the "no probe under `--gates=local`" invariant explicitly in § step 1 (explicit `local` AND `auto`-short-circuited-to-local both produce ZERO probe calls and ZERO probe ledger rows — per contracts/gate-query-probe.md § No probe under `--gates=local`).
- [X] Pin the FR-013 operator-facing template line verbatim in `auto.md` — inside the `--gates=auto` three-part-check item 3 fail sub-branch AND inside the explicit `--gates=ui` probe fail sub-branch — as: `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment` (matches `formatGateQueryProbeErrorLine` from TG-001; both are pinned to the same string in Phase 3).
- [X] Add narrow amendment to § Ledger: the general "pre-flight failures do not earn a row" clause is narrowed so that rows carrying the NEW `preflight` transition class DO earn a row (safe because the probe fires AFTER F4.7 / top of step 3 ledger-header emission). The § step-1 hard-fail path (missing `cockpit_gate_open`; usage errors; F4.6 `gh issue create` non-zero exit) remains ledger-free (per contracts/gate-query-probe.md § Ledger clause amendment + data-model.md § Ledger clause amendment).
- [X] Add `preflight` as a NEW transition class to § Ledger (sibling of `startup`, `heartbeat`, `cursor-recovery`, `epic-complete`) AND `ui-gate-probe` as a NEW source token to § Ledger (sibling of `ui-gate`, `ui-gate-fallback`, `enriched-line`) — per data-model.md § Ledger vocabulary additions.
- [X] Pin the probe pass ledger row shape verbatim inside § step 1 (or wherever the probe is described): `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`.
- [X] Pin the probe fail ledger row shape verbatim inside § step 1: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`.
- [X] Add a cross-reference from § Gate-query error taxonomy (added by #457, currently at auto.md:481–517) to the new pre-flight probe step, pinned verbatim — do NOT introduce a new class; the four existing classes cover the probe's error surface (per contracts/gate-query-probe.md § Error classification).
- [X] Do NOT change § step 3 (tool-presence check, escape-hatch tick, synthetic-event pass), § Dispatch D.1–D.11, § step 4 (main loop), § step 5 (cursor recovery), § step 6 (exit), or the § UI-mode fallback path (`auto.md:1386–1418`). The probe is strictly a pre-loop concern (per plan.md § Boundaries preserved + § No other rows change).
- [X] Do NOT edit any other `commands/*.md` playbook (clarify, queue, review, merge, status, watch remain unchanged).

---

## Phase 3: Playbook pins — re-pin existing + add new 459 assertions
<!-- Phase boundary: Complete Phase 2 before starting Phase 3 -->

Sequencing rationale: the pins in TG-003 assert exact-string matches against auto.md prose; the prose must land first so the implementer can pin against the actual heading and step wording chosen in Phase 2. Per repo CLAUDE.md § "Cockpit playbook pins": re-pin to the NEW contract, do NOT weaken.

### TG-003 [US1, US2, US3] Task Group: Re-pin `449-5` / `449-6` and add `describe("459 pre-flight functional probe")` block
**Scope**: 4–6 hours
**Files**:
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (EDIT — re-pin two existing assertions to the NEW three-part contract; add a new `describe("459 pre-flight functional probe", ...)` block after the `457 sweep-time gate reuse` block containing pins 459-1 through 459-13; formatter equality fixtures from TG-001 live inside this same block)
**Tests**: `pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification` — the full file must stay green after Phase 2's prose lands and after these re-pins/new-pins.

- [X] Re-pin `449-5` (`playbook-verification.test.ts:2892`) from asserting a two-part `--gates=auto` resolution rule to asserting the NEW three-part rule INCLUDING the short-circuit clause verbatim — item 3 (probe) is issued ONLY when items 1 AND 2 both pass. Do NOT weaken or delete the assertion. Update surrounding comments to reference contracts/auto-resolution-fold-in.md as the new source.
- [X] Re-pin `449-6` (`playbook-verification.test.ts:2902`) — the `Auto run starting · gates: local (source: --gates=auto → <reason>)` line assertion — to enumerate `probe-failed` as a possible `<reason>` value alongside `cockpit_gate_open unbound` and `cluster not cloud-activated`. Do NOT delete the existing two enumerations; extend.
- [X] Add a `describe("459 pre-flight functional probe", () => { ... })` block after the `457 sweep-time gate reuse` block containing the following pins (per plan.md § Test edits + contracts/*):
  - `459-1`: § step 1 `--gates=auto` resolution declares a three-item list with the probe as item 3 AND states the short-circuit rule verbatim.
  - `459-2`: § step 1 explicit `--gates=ui` block declares the probe as a post-tool-presence, post-identity-ref pre-flight step that hard-fails on any error.
  - `459-3`: § step 1 `Auto run starting` line's `<resolution reason>` suffix enumerates `probe-failed` (this partially overlaps the re-pinned 449-6; keep both — 459-3 owns the `probe-failed` value assertion, 449-6 owns the format-pin).
  - `459-4`: § step 1 states the Form 4 sequencing rule — probe fires AFTER F4.6/F4.4 has bound `trackingRef`, NOT alongside items 1–2.
  - `459-5`: probe pass ledger row shape pinned verbatim: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`.
  - `459-6`: probe fail ledger row shape pinned verbatim: `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe`.
  - `459-7`: FR-013 operator-facing template line pinned verbatim in `auto.md`: `gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment`.
  - `459-7a`: `formatGateQueryProbeErrorLine` returns the exact same template — fixture-equality assertions from TG-001 live in this sub-block (one `it(...)` per `GateQueryErrorClass`).
  - `459-8`: § Ledger declares the narrow amendment — `preflight · gate-query-probe · ok|error` earns a ledger row despite the general "pre-flight failures do not earn a row" clause; the § step-1 hard-fail path remains ledger-free.
  - `459-9`: § Ledger declares `preflight` as a transition class AND `ui-gate-probe` as a source token.
  - `459-10`: § step 1 declares that under `--gates=local` (explicit OR `--gates=auto` short-circuited) NO probe is issued AND NO probe ledger row is written.
  - `459-11`: on probe failure, `--gates=ui` exits non-zero (no fallback to `local`) AND `--gates=auto` resolves to `local` (with the probe's fail ledger row written).
  - `459-12`: probe is issued AT MOST ONCE per run (drift audit — a future edit that adds per-event re-probing breaks this pin, per FR-010; asserted by counting occurrences of the pinned probe-call phrasing in auto.md).
  - `459-13`: § Gate-query error taxonomy (added by #457) is unchanged AND acquires a new cross-reference to the pre-flight probe step — pinned verbatim (drift audit — a divergence here silently breaks pre-flight/per-event consistency).
- [X] Audit for any other assertion in the `449 UI-mode gates` block (or elsewhere) that quotes the OLD two-part check verbatim OR enumerates the `<resolution reason>` values by exhaustive listing — re-pin any such assertion to the three-part contract in the same PR. Candidate re-pin targets are named in contracts/auto-resolution-fold-in.md § Re-pin targets in the existing suite.

---

## Phase 4: Verification
<!-- Phase boundary: Complete Phase 3 before starting Phase 4 -->

### TG-004 [US1, US2, US3] Task Group: Mandatory playbook-verification re-pin task + full-suite smoke
**Scope**: 1–2 hours
**Files**:
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (VERIFY — re-pin any pin site whose read of `auto.md` breaks after Phase 2, beyond what TG-003 already covered)
**Tests**: `pnpm --filter @generacy/claude-plugin-cockpit test` (full test suite) — every playbook-verification pin must remain green; the `readdirSync(COMMANDS_DIR)` sweep at :545 must confirm `auto.md` still satisfies invocation-vs-`--help` drift; no other `commands/*.md` playbook is edited.

- [X] **Mandatory playbook re-pin task** — Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.

  Files edited by this issue:
  - `packages/claude-plugin-cockpit/commands/auto.md`

  Pin sites that read the edited file(s):
  - `:545` — `readdirSync(COMMANDS_DIR)` sweep (invocation-vs-`--help` drift for EVERY `commands/*.md` playbook — `auto.md` is included in this sweep and MUST continue to pass after the Phase 2 edits).
  - `:316` — `readFileSync(AUTO_MD_PATH)` direct named read (broad autoMd snapshot; audit whether any nearby assertion touches § step 1 / § Ledger / § Gate-query error taxonomy after Phase 2 lands).
  - `:1131`, `:1148` — `extractSubheadingBlock(autoMd, ...)` reads (D.7/D.9d/D.11 blocks; unaffected by Phase 2 edits — verify at implementation time).
  - `:1283`, `:1303`, `:2391` — `readFileSync(AUTO_MD_PATH)` direct named reads (broad autoMd reads; audit for intersection with § step 1 / § Ledger).
  - `:1547`, `:1586`, `:1600`, `:1626` — `extractInstructionsSteps(autoMd)` reads (step 1 / step 3 / other numbered steps; step 1 is the primary intersection).
  - `:2436`, `:2437` — `extractInstructionsSteps(autoMd)` step-map extraction (broad step read).
  - `:2459`, `:2468`, `:2498`, `:2528`, `:2542`, `:2548`, `:2571`, `:2578` — `extractSubheadingBlock(autoMd, ...)` reads (various subheading blocks; audit for intersection with the § Ledger heading and the § Gate-query error taxonomy heading).
  - `:2773`, `:2802`, `:2810`, `:2852`, `:2865`, `:2874`, `:2882`, `:2892`, `:2902` — `extractInstructionsSteps(autoMd).get(1)` reads inside the `449 UI-mode gates` block (**primary intersection with Phase 2 edits**; `:2892` = 449-5 and `:2902` = 449-6 are already re-pinned in TG-003; the other reads in this range extract step 1 as a whole — verify none of them accidentally breaks when the two-part list becomes a three-part list).
  - `:2913`, `:2920`, `:2963`, `:2973`, `:2985`, `:2995`, `:3013`, `:3037`, `:3051`, `:3067`, `:3080` — `readFileSync(AUTO_MD_PATH)` + `extractSubheadingBlock(...)` reads for `## UI-mode gate mapping (G.1–G.7)` and D.12 `gate-answer` (unaffected by Phase 2 edits — verify at implementation time).
  - `:3103`, `:3122`, `:3171`, `:3220`, `:3243`, `:3256`, `:3278`, `:3315` — `extractInstructionsSteps(autoMd).get(3)` reads (step 3 tool-presence check; NOT edited by this feature — verify these all remain green).
  - `:3300`, `:3587` — `extractInstructionsSteps(autoMd).get(4)` reads (step 4 main loop; NOT edited).
  - `:3341`, `:3427`, `:3450`, `:3478`, `:3479`, `:3539`, `:3544`, `:3557`, `:3572`, `:3586`, `:3598`, `:3599`, `:3610`, `:3611`, `:3632`, `:3635`, `:3664`, `:3665`, `:3679` — `extractSubheadingBlock(autoMd, ...)` reads for various D.n / § Pre-draft check shared rules / G.n / E.n / §-headed subsections. **`:3478`–`:3535` is `457-9a` (Pre-draft check — shared rules)** — verify unchanged by our edits (we do NOT touch `formatPreDraftCheckErrorLine` or the shared-rules block); other pin sites in this range should be unaffected but must be spot-audited when Phase 2 lands.
  - `:3971`, `:4002` — `readFileSync(resolve(__dirname, "..", "lib", "gate-status-check.ts"))` reads inside `457-lib-9` and adjacent (TypeScript source pins; TG-001 adds ONE new export to `lib/gate-status-check.ts` — verify these source-string pins do NOT accidentally match against the new `formatGateQueryProbeErrorLine` signature in a way that fails; the pins target `GateRecord` / `GateQueryErrorClass` definitions and should be unaffected).

  Re-pinning means updating the assertion to the NEW contract established by the playbook edit.

  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit; weakening it deletes its value.

- [X] Run full test suite: `pnpm --filter @generacy/claude-plugin-cockpit test`. Every playbook-verification pin (existing + `449-5`/`449-6` re-pinned + new `459-1` through `459-13` + `459-7a` fixture equalities) must stay green.
- [X] Run project-wide typecheck: `pnpm --filter @generacy/claude-plugin-cockpit build` (or the workspace equivalent) — the new `formatGateQueryProbeErrorLine` export must type-check under the existing `GateQueryError` shape.
- [X] Smoke-check the quickstart scenarios by inspection (not executed): scenarios 1–6 in `quickstart.md` describe the expected observable behavior — walk through each scenario against the Phase 2 prose to confirm the prose describes the expected transitions (probe fires under `ui`/`auto` items-1-2-pass; probe does NOT fire under `local` / auto-short-circuit; ledger rows land AFTER the ledger header exists; operator-facing line matches the FR-013 template verbatim).
- [X] Verify byte-identity contract by inspection: under `--gates=auto` short-circuited to `local` (items 1 or 2 fail), the transcript and ledger MUST be indistinguishable from explicit `--gates=local` (per contracts/auto-resolution-fold-in.md § R1 — byte-identity pin). Any pin that would produce a probe ledger row in the short-circuit path is a regression.

---

## Dependencies & Execution Order

**Phase boundaries** (strictly sequential):
- Phase 1 (reference formatter) → Phase 2 (playbook prose) → Phase 3 (pins) → Phase 4 (verification)

Rationale:
- Phase 1 delivers a callable formatter with fixture-equality tests; those tests fix the exact string that Phase 2 must reproduce verbatim in `auto.md` prose. Building the formatter first lets Phase 2 diff the reference implementation against the prose.
- Phase 2 lands the prose edits; the source of truth for the operator-facing line is the playbook prose, not the formatter (per plan.md § Constitution Check).
- Phase 3 pins the prose (auto.md) against the reference implementation (`lib/gate-status-check.ts`) and against the contract shapes documented in `contracts/`. Cannot land before Phase 2 because the pins assert exact-string matches against the prose Phase 2 writes.
- Phase 4 verifies no unrelated pin was broken by the Phase 2 edits (mandatory re-pin task per CLAUDE.md § "Cockpit playbook pins") and runs the full test suite.

**Parallel opportunities within phases**:
- Phase 1 has one task group (TG-001) — no intra-phase parallelism.
- Phase 2 has one task group (TG-002) — no intra-phase parallelism (all edits touch a single file, `commands/auto.md`).
- Phase 3 has one task group (TG-003) — no intra-phase parallelism (all edits touch a single file, `tests/playbook-verification.test.ts`).
- Phase 4 has one task group (TG-004) — no intra-phase parallelism.

**Story coverage**:
- US1 (UI-mode fail-fast on broken surface): TG-002 (probe step in explicit `--gates=ui` block) + TG-003 (pins 459-2, 459-7, 459-11) + TG-001 (formatter for the operator-facing line).
- US2 (Auto-mode fold-in with short-circuit): TG-002 (three-part check + `probe-failed` reason) + TG-003 (pins 459-1, 459-3, 459-4, 459-11 auto half) + TG-001 (formatter shared with US1).
- US3 (Local-mode unaffected): TG-002 (explicit "no probe under `--gates=local`" invariant + short-circuit rule) + TG-003 (pin 459-10) + TG-004 (byte-identity verification against explicit `--gates=local`).

**Blocking upstream** (not tasks in this repo; documented for pre-flight verification only):
- [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) — provides `cockpit_gate_list` and the four-class `GateQueryErrorClass` taxonomy this feature consumes. Must be merged and deployed to the cluster.
- [generacy-ai/generacy-cloud#877](https://github.com/generacy-ai/generacy-cloud/issues/877) — the 404 gap that motivates this feature. Out of scope for this issue (per spec.md § Out of Scope); this feature makes the gap LEGIBLE, does not close it.

---

*Generated by /speckit:tasks*
