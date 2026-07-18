# Tasks: `/cockpit:auto` enriched-line dispatch drops per-event `cockpit_status` re-check for label-driven classes

**Input**: Design documents from `/specs/437-summary-cockpit-auto-exhausts/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/enriched-line-dispatch.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (this bugfix has one implicit story: [US1] parent skill dispatches from doorbell line to stop exhausting the 5000 pts/hr GraphQL limit)

## Scope reminder

All work lives in two files under `packages/claude-plugin-cockpit/`:

1. `commands/auto.md` — prose edits (step 2 arm-up, step 4a contract, § Dispatch preamble, D.1–D.11 rows, § Invariants §7, § Ledger vocabulary, new § Enriched-line dispatch contract).
2. `tests/playbook-verification.test.ts` — re-pin existing broken pins to the new contract AND add the new 437-1..437-6 pin block.

No new files, no new directories (per plan.md § Project Structure). Engine-side work lives in generacy-ai/generacy#985 — out of scope for this PR.

## Phase 1: Playbook prose edits (`packages/claude-plugin-cockpit/commands/auto.md`)

All tasks in Phase 1 edit the **same file**, so they are sequential (no `[P]`) — but each is a discrete, load-bearing edit with its own pin target.

- [X] T001 [US1] Add a new `## Enriched-line dispatch contract` section to `packages/claude-plugin-cockpit/commands/auto.md` documenting the doorbell-line schema (C1), the enriched-vs-bare gate (C2 / Q2=B), the per-class dispatch source table (C3 / Q1=A), the `checks` verdict handling (C4 / Q4=B), the unified step-4a priority (C5 / Q3=B), the ledger marker rules (C6 / Q5=C), and the FR-005 graceful-degradation guarantee (C7). Use `specs/437-summary-cockpit-auto-exhausts/contracts/enriched-line-dispatch.md` as the authoritative content source. Placement: after the § Instructions section, before § Dispatch — the § Invariants §7 rewrite and step 4a will cross-reference it by name.

- [X] T002 [US1] Rewrite the step 2 sensor arm-up "doorbell only" statement (currently at `auto.md:~53`) per data-model.md E7.8: replace *"The stdout content is a doorbell only: the parent NEVER parses lines for content."* with the NDJSON-per-line wording that names `§ Enriched-line dispatch contract` (E2) as the parse authority, states that enriched lines drive label-driven dispatch and the D.5/D.6 merge gate, and preserves the "cockpit_await_events remains the sole source of typed batches for the merge-gate fallback and D.8/D.10/D.11 escalation surfaces" clause. Do NOT change the `generacy cockpit doorbell` invocation itself — the sensor spawn is unchanged (pinned by 406-3 at test line :1517).

- [X] T003 [US1] Rewrite the step 4a "Re-check live state" bullet (currently at `auto.md:~85`) per data-model.md E7.1: replace with the Q3=B unified "Resolve authoritative state" contract that (a) prefers the enriched line's `to`/`labels`/`checks`, (b) falls back to a single `cockpit_status(epic=<epic-ref>, json=true)` on absence, (c) explicitly restricts the retain-the-re-check to D.8, D.10, D.11 (naming each), (d) states D.5/D.6 consult the line's `checks` verdict and fall back on `absent OR pending`, and (e) preserves the "ledger-only rows skip any query entirely per § Invariants #8" statement. The pre-#437 phrase *"The batch event is advisory; the live return is authoritative"* MUST be removed from step 4a (it will be pinned negative in 437-1).

- [X] T004 [US1] Rewrite the § Dispatch preamble (currently at `auto.md:~151`) per data-model.md E7.2: replace the "The parent **always** re-checks live state on every event (step 4a) — streamed lines are advisory" wording with the Q3=B unified narration that names the enriched line as source-of-truth for D.1–D.4/D.7/D.9-family (and D.5/D.6 on decisive `checks`), retains the per-event `cockpit_status` re-check for D.8/D.10/D.11, and states the fallback rule for bare lines (per FR-005) and D.5/D.6 `absent | pending` (per Q4=B). The § Invariants #8 cost-contract reference for D.9 family is preserved verbatim.

- [X] T005 [US1] Rewrite the D.1 (`waiting-for:clarification`) dispatch narration in `auto.md § Dispatch D.1`: drop the pre-#437 per-event `cockpit_status` re-check preamble; state the dispatch reads `to` and `labels` from the enriched doorbell line; state the fallback path fires on bare lines per FR-005; state the ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per data-model.md E5.

- [X] T006 [US1] Rewrite the D.2 (`waiting-for:<artifact>-review`), D.3 (`waiting-for:implementation-review`), and D.4 (`waiting-for:manual-validation`) dispatch narrations in `auto.md § Dispatch D.2–D.4`: same shape as T005 — drop the per-event `cockpit_status` preamble; name `to`/`labels` as source; state fallback for bare lines; state the ledger marker rule.

- [X] T007 [US1] Rewrite the D.5 (`completed:validate` + `checks: "green"`) dispatch narration in `auto.md § Dispatch D.5` per data-model.md E7.3: replace step 1's "Confirm state via `cockpit status --json`" with the Q4=B "Resolve `checks` verdict" wording — prefer the enriched line's `checks`; on `green` proceed with `cockpit_merge(issue=<issue-ref>)`; on `red` fall through to D.6; on `checks` **absent OR `pending`** fall back to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` and branch on the returned `checks_state` per pre-#437 logic. The ledger row on the enriched-line path (green) carries the `· source: enriched-line` marker; the fallback path (absent/pending) writes no marker.

- [X] T008 [US1] Rewrite the D.6 (`completed:validate` + `checks: "red"`) dispatch narration in `auto.md § Dispatch D.6` per data-model.md E7.4: update the **Trigger** clause to name (a) `completed:validate` + enriched-line `checks: "red"`, (b) fallback verdict `red` from a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` on `absent | pending`, OR (c) a `cockpit_merge` call in D.5 returned `result: "red"` (unchanged). The bounded fixer subagent invocation is unchanged. Ledger marker rules mirror D.5.

- [X] T009 [US1] Rewrite the D.7 (`agent:error` / `failed:*`) dispatch narration in `auto.md § Dispatch D.7`: drop the pre-#437 per-event `cockpit_status` re-check preamble; state the dispatch reads `to` (`agent:error` or `failed:<subtype>`) and `labels` from the enriched line; keep the `cockpit_context(issue=<issue-ref>)` sole-evidence-fetch tool statement verbatim (pinned by 403-4 at test line :1169 — must not be weakened); state fallback for bare lines and the ledger marker rule.

- [X] T010 [US1] Add the explicit "retain the per-event `cockpit_status` re-check" phrase to the D.8 (`phase-complete`), D.10 (unrecognized), and D.11 (`waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts`) dispatch narrations in `auto.md § Dispatch D.8/D.10/D.11`: state each retains the pre-#437 per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check because they open human/consequential gates where a stale-line dispatch could open a gate against superseded state (rationale per data-model.md E3 and research.md R2). The D.11 wording is a positive obligation — it will be pinned in 437-6. The D.7 `cockpit_context(issue=<issue-ref>)` sole-tool clause on D.11 is preserved verbatim (pinned by 403-4).

- [X] T011 [US1] Rewrite the D.9, D.9a, D.9b, D.9c "server-side-owned" narrations in `auto.md § Dispatch D.9 / D.9a / D.9b / D.9c` per data-model.md E7.5: the "**Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger line accounts for the event; the loop continues." sentence is preserved verbatim (pinned by 403-1 at test line :1101 — the "no status table, no prose recap" substring must survive); add a following sentence stating the row's `<transition-class>` slot is populated from the enriched line's `to` field as-received (per § Enriched-line dispatch contract E5) and the outcome slot carries the `· source: enriched-line` marker on the enriched-line path (no marker on fallback).

- [X] T012 [US1] Rewrite the D.9d `phase:*` narration in `auto.md § Dispatch D.9d` per data-model.md E7.6: preserve the D.9d subheading `D.9d — \`phase:*\` → ledger only` verbatim (pinned by 403-2 at test line :1118), the "Prefix-match" statement, the "any transition class whose token begins with the literal `phase:` prefix matches this row" statement, and the "Ledger line only." statement — 403-2 asserts each of those verbatim. Then add the ledger marker sentence (as in T011) and preserve the D.10 non-collision statement ("Never surface a D.10 escalation gate on a `phase:*` token").

- [X] T013 [US1] Rewrite the § Invariants §7 "Stream consumption is unfiltered" paragraph in `auto.md § Invariants` per data-model.md E7.7 and research.md R7: preserve the "Stream consumption is unfiltered." heading verbatim; retain the anti-drop clause ("content-based filters over the stream are prohibited, because a filter could silently drop legitimate events"); replace the "never parsed for content" clause with a statement that enriched lines ARE parsed per the § Enriched-line dispatch contract, bare lines fall back to `cockpit_await_events` for authoritative state, and `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback and D.8/D.10/D.11. Preserve the "If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field" tail sentence. Preserve §7's number (do NOT sub-number to §7a/§7b) — the §Invariants count is pinned at exactly 9 by 406-6 at test line :1596, and the §1–§8 opening substrings ("Never merge on red.", "Cockpit comments marked.", "Add-only advance.", etc.) MUST survive the edit.

- [X] T014 [US1] Add the `source: enriched-line` marker to the § Ledger action+outcome vocabulary table in `auto.md § Ledger` per data-model.md E7.9: append a note to the `<outcome>` column for rows D.1–D.4, D.7, D.9, D.9a, D.9b, D.9c, D.9d that reads *"…; add `· source: enriched-line` suffix when dispatched from the enriched line (per § Enriched-line dispatch contract E5); no suffix on fallback re-query rows"*. The literal string `source: enriched-line` MUST appear in the § Ledger section (this is the positive-pin surface for 437-4). Preserve the four-column ledger format (`<issue-ref> · <transition-class> · <action> · <outcome>`) verbatim.

## Phase 2: Playbook-verification pin edits (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`)
<!-- Phase boundary: Complete Phase 1 before starting Phase 2 — the pin authors must see the NEW contract wording in auto.md before re-pinning to it. -->

- [X] T015 [US1] Add a new `describe("437 — auto.md enriched-line dispatch drops per-event cockpit_status re-check for label-driven classes", ...)` block to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (appended after the existing `describe("433 — ...")` block at test line :2359) with six positive-and-negative pins per contracts/enriched-line-dispatch.md C8:
  - **437-1 (step 4a)**: positive — `auto.md` step 4a contains the new "Resolve authoritative state" phrase AND the "prefer the enriched" phrase; negative — `auto.md` does NOT contain `"The batch event is advisory; the live return is authoritative"`. Read step 4 via `extractInstructionsSteps(autoMd).get(4)`.
  - **437-2 (D.1–D.7 dispatch)**: positive — the D.1–D.4 and D.7 dispatch subheading blocks (via `extractSubheadingBlock`) name the enriched line's `to` / `labels` fields as source-of-truth; negative — those blocks do NOT contain a per-event `cockpit_status(...)` mention on their enriched-line path.
  - **437-3 (§7 rewrite)**: positive — § Invariants §7 opens with "Stream consumption is unfiltered" AND references "§ Enriched-line dispatch contract"; negative — §7 does NOT contain the phrase `"never parsed for content"`. Read invariants via `extractInvariantsSection(autoMd)`.
  - **437-4 (§ Ledger marker)**: positive-only — `auto.md` § Ledger section (extract by grepping `## Ledger` to next `## `) contains the literal string `source: enriched-line`.
  - **437-5 (D.5/D.6 fallback rule)**: positive — the D.5 and D.6 subheading blocks contain both `absent` AND `pending` inside a fallback-rule sentence; negative — the D.5/D.6 blocks do NOT contain a "defer this wake" / defer-on-pending phrasing (Q4=A rejection).
  - **437-6 (D.8/D.10/D.11 retain-the-re-check)**: positive-only — the D.8, D.10, and D.11 subheading blocks each contain the retain-the-re-check phrase (e.g., `retain the per-event \`cockpit_status\``) — future authors editing these dispatch rows must read the retain rule.

- [X] T016 [US1] Re-pin existing assertions broken by the Phase 1 edits: (a) if any pre-existing test greps for the pre-#437 wording of step 4a (`"The batch event is advisory; the live return is authoritative"`), re-author its positive assertion to the new "Resolve authoritative state" contract wording; (b) if any pre-existing test greps for a D.1–D.7 per-event `cockpit_status(...)` mention on the dispatch narrations (as opposed to the retain-the-re-check for D.8/D.10/D.11), re-author to match the new enriched-line source-of-truth; (c) verify 403-1 (D.9 family "no status table, no prose recap") still passes verbatim after the T011 edit; (d) verify 403-2 (D.9d subheading and content) still passes verbatim after T012; (e) verify 403-4 (D.7/D.11 `cockpit_context(issue=<issue-ref>)` sole-tool) still passes verbatim after T009/T010; (f) verify 406-3 (step 2 spawns `generacy cockpit doorbell` under Monitor; step 4 wake-driven with `maxWaitMs=1`) still passes after T002 — the sensor invocation and drain shape are unchanged; (g) verify 406-6 (§ Invariants has exactly 9 numbered items; §1–§8 opening substrings survive) still passes after T013 — §7 rewrite must NOT change §7's number nor break §1–§8 openings; (h) verify 433-1 (`generacy cockpit help doorbell` pre-flight probe) still passes — the probe form is unrelated to stdout parsing. If (a) or (b) surfaces an assertion that would need weakening/deletion to pass, STOP — that is the CLAUDE.md protocol violation this instruction is guarding against.

## Phase 3: Verification
<!-- Phase boundary: Complete Phases 1 and 2 before running verification. -->

- [X] T017 [US1] **Mandatory re-pin task per CLAUDE.md playbook-coupling rule.** Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` for every heading and contract rule this edit changes.
  Files edited by this issue:
    - `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :286: `396-3: drift audit — every GATE_VOCABULARY token has a Trigger match in auto.md § Dispatch` (`readFileSync(AUTO_MD_PATH)` + `extractDispatchSection`) — Phase 1 edits touch D.1–D.11 rows; the GATE_VOCABULARY token→Trigger match must still hold after the dispatch rewrites.
    - :906: `auditContract(AUTO_MD_PATH)` — audits ledger + subagent + invariants contract; T013 (§7 rewrite) and T014 (§ Ledger marker) intersect.
    - :1101: `403-1: D.9 family subheadings state the no-re-check/no-prose contract verbatim` (`extractSubheadingBlock` on D.9, D.9a, D.9b, D.9c) — T011 must preserve the "no status table, no prose recap" substring verbatim.
    - :1118: `403-2: new D.9d subheading exists with prefix-match, ledger-line-only dispatch, engine-owned phase transition outcome` (`extractSubheadingBlock` on D.9d) — T012 must preserve the pinned phrases verbatim.
    - :1169: `403-4: D.7 and D.11 state cockpit_context(issue=<issue-ref>) as sole evidence-fetch tool` (`extractSubheadingBlock` on D.7 and D.11) — T009 and T010 must preserve the `cockpit_context(issue=<issue-ref>)` sole-tool statement verbatim.
    - :1253: `403-6: § Invariants §8 cost-contract line` (`extractInvariantsSection`) — T013 rewrites §7 but must NOT touch §8's cost-contract wording.
    - :1273: `403-7: full epic status table anchor at permitted surfaces` (`readFileSync(AUTO_MD_PATH)`) — verify no new status table appears in D.1–D.11 rewrites.
    - :1517: `406-3 (post-#420/#431 wake-driven loop shape): auto.md step 4 drains cockpit_await_events on a Monitor wake with maxWaitMs=1; step 2 arms generacy cockpit doorbell under Monitor` (`extractInstructionsSteps` on steps 2 and 4) — T002 (step 2 rewrite) MUST preserve the `generacy cockpit doorbell` sensor spawn and Monitor arm-up; T003 (step 4a rewrite) MUST preserve `maxWaitMs=1` and the `Monitor`-wake framing.
    - :1596: `406-6 (invariant §9): auto.md § Invariants has exactly nine numbered items; §9 opens verbatim; §1–§8 opening substrings survive` (`extractInvariantsSection`) — T013 (§7 rewrite) MUST preserve §7's number, the §1–§8 opening substrings ("Never merge on red.", "Cockpit comments marked.", "Add-only advance.", "No cross-slash-command invocation", "Analysis in subagents", "Autonomy", …), and the exact-9 count.
    - :2012: `410-1: D.7 first-vs-repeat sub-path split, verdict-schema addendum, no-parent-characterization rule, G.4(b) sixth-element row` (`auditD7(AUTO_MD_PATH)`) — T009 (D.7 rewrite) MUST preserve the first-vs-repeat sub-path split, `failure_class_changed` verdict field, no-parent-characterization rule, and G.4(b) sixth-element row.
    - :2361: `433-1: auto.md pre-flight uses generacy cockpit help doorbell and never the broken cockpit doorbell --help form` (`readFileSync(AUTO_MD_PATH)`) — T002 (step 2 rewrite) MUST NOT introduce `cockpit doorbell --help` and MUST preserve `generacy cockpit help doorbell`.
    - :515: `398-1 (drift audit): every commands/*.md invocation matches its --help snapshot argument-kind token` (`readdirSync(COMMANDS_DIR)` **sweep** — pins EVERY `commands/*.md` playbook) — auto.md invocations of `generacy cockpit <verb>` must still match the recorded snapshots; T002 and T003 must not introduce a drifted invocation form.
  Re-pinning means updating the assertion to the NEW contract established by the playbook edit.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit; weakening it deletes its value.

- [X] T018 [US1] Run `pnpm --filter @generacy/claude-plugin-cockpit test` and confirm the full `playbook-verification.test.ts` suite passes: pre-#437 pins (394, 396, 398, 400, 402, 403, 406, 408, 410, 416, 429, 433) unchanged; new 437-1..437-6 pins pass; no assertion was weakened or deleted per T016/T017. If any pin fails, return to Phase 1 or Phase 2 to fix the edit (do NOT weaken the pin).

- [X] T019 [US1] Manual quickstart validation per `specs/437-summary-cockpit-auto-exhausts/quickstart.md`: exercise the `/cockpit:auto` skill against a mocked NDJSON stream containing (a) a well-formed enriched line for D.1, (b) a well-formed enriched line for D.5 with `checks: "green"`, (c) a well-formed enriched line for D.5 with `checks: "pending"` (fallback path fires), (d) a bare / malformed line (fallback path fires per FR-005), and (e) a well-formed enriched line for D.8 (retain-the-re-check fires). Confirm the ledger rows show `source: enriched-line` markers on (a)/(b) only; no marker on (c)/(d)/(e). Confirm no ≈28-GraphQL-call `cockpit_status(epic, json=true)` fires on (a)/(b). This validates the SC-001 saving end-to-end.

## Dependencies & Execution Order

**Phase 1 (auto.md edits)** — sequential; all in one file:
  - T001 (add § Enriched-line dispatch contract section) is the anchor — subsequent edits cross-reference it.
  - T002 (step 2 arm-up) and T003 (step 4a contract) are the two step-level rewrites.
  - T004 (§ Dispatch preamble) sets the shared context for T005–T012 dispatch-row edits.
  - T005–T012 rewrite the D.1–D.9d rows; each is a localized subheading edit.
  - T013 (§7 rewrite) and T014 (§ Ledger marker) are the invariants/vocabulary edits.
  Order: T001 → T002 → T003 → T004 → (T005..T012 in any order, all serialized on the same file) → T013 → T014.

**Phase 2 (test edits)** — sequential; all in one file:
  - T015 (new 437 describe block) can be authored once T001–T014 land.
  - T016 (re-pin existing broken assertions) requires T015's new pins be in place to distinguish "still-valid" from "needs re-pin."

**Phase 3 (verification)** — sequential:
  - T017 (mandatory playbook-coupling re-pin verification) is the audit checklist against the Phase 2 pin sites.
  - T018 (`pnpm test`) confirms.
  - T019 (quickstart) manually validates SC-001.

**Parallel opportunities**: None — both files are singleton edits, so all tasks in a phase are serialized on the same file. Phases are strictly sequential.

## Rollback

Trivial per plan.md § R9: revert the two files. The pre-#437 dispatch is preserved verbatim on the fallback path, so a partial rollback (revert `auto.md` while leaving generacy#985 deployed) is safe — the enriched line is generated but ignored; the pre-#437 re-query path fires.

---

*Generated by speckit*
