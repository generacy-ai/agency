# Tasks: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract

**Input**: Design documents from `/specs/504-severity-major-p1-playbook/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files / non-overlapping regions, no dependencies)
- **[Story]**: Which user story this task belongs to

## Phase 1: Grounding (Setup)

- [ ] T001 Re-read the two contracts before editing so the prose matches them verbatim:
  `specs/504-severity-major-p1-playbook/contracts/d5-implementation-review-guard.md`
  and `.../contracts/remediation-limit-findings-fetch.md`. Confirm the exact literals that
  must be byte-mirrored: heading `## Remediation limit reached`, bullet `- <file>:<line> — <title>`
  (em-dash `—`, not hyphen), and the `| (none) | | | |` row. No file edits in this task.

## Phase 2: D.5 merge-past-G.8 guard — US1 (P0 within this P1)

- [ ] T010 [US1] Add the `waiting-for:implementation-review`-absent guard to D.5 Dispatch in
  `packages/claude-plugin-cockpit/commands/auto.md` (§ `D.5 — completed:validate (checks green) → merge without gate`, ~`:813-831`).
  After the `checks` verdict resolves green and before `cockpit_merge`, evaluate the label guard
  (data-model E1): present → DEFER (no merge); absent → merge (existing path); non-decisive
  (labels absent / bare / malformed) → fail-safe authoritative `cockpit_status(issue=<issue-ref>, json=true)`
  re-query, merge only if confirmed absent, else DEFER. Fold the label check into the existing
  `checks` fallback re-query to avoid a second round-trip. Absence-of-signal is never treated as
  absence-of-gate. (FR-001; contract `d5-implementation-review-guard.md`)
- [ ] T011 [US1] Extend the D.5 ledger outcome enum in the same D.5 block with the token
  `deferred: implementation-review pending`, and state the passive-no-op semantics: on DEFER, D.5
  writes the row and drops the event — it does NOT call `cockpit_merge`, does NOT call `cockpit_gate_open`,
  writes NO label, and does NOT invoke the G.8 presentation path. State that the co-present
  `waiting-for:implementation-review` transition is D.3's own trigger, which presents G.8; `approve`
  at G.8 performs the merge (`auto.md:1494`). Wording must NOT match `/defer\s+(this\s+wake|on\s+pending)/i`
  and must keep the existing `checks`-verdict `absent`/`pending` phrasing intact. (FR-002; data-model E2)

## Phase 3: Remediation-limit findings-fetch contract — US2

- [ ] T020 [US2] Rewrite D.13 step 1 in `packages/claude-plugin-cockpit/commands/auto.md`
  (§ `D.13 — waiting-for:remediation-limit`, ~`:1035-1054`), replacing the undefined
  "parse the findings from the gate body" prose with the concrete retrieval:
  `gh issue view <issue-ref> --json comments` → select the single most-recent comment (by `createdAt`)
  whose body `startsWith` the exact, case-sensitive string `## Remediation limit reached` → parse
  `- <file>:<line> — <title>` bullets (em-dash) → render `(none)` when no comment matches. State that
  this is identical in local and UI gate modes (source is the engine issue comment, not the gate record).
  (FR-003, FR-004; contract `remediation-limit-findings-fetch.md`)
- [ ] T021 [US2] Mirror the same fetch/selection/bullet/`(none)` contract into the G.9 Presentation
  (§ `G.9 — Remediation-limit gate`, ~`:1502-1518`); keep the `resume remediation` → `cockpit_advance(gate="remediation-limit")`
  and `stop` → clean-exit downstream unchanged, and keep the "no subagent is spawned" statement.
  (FR-003, FR-004)

## Phase 4: Stale-reference cleanup — US3

- [ ] T030 [P] [US3] G.8 prose (§ `G.8 — Implementation-review final-approval gate`,
  `auto.md` ~`:1476-1500`): remove the claim that the engine "wrote its remaining findings into the
  gate body"; state that G.8 has no findings artifact on either the post-validate or legacy path and
  renders `(none)` unconditionally. Keep exactly the single byte-for-byte `| (none) | | | |` presentation
  row. (FR-005; data-model E4)
- [ ] T031 [P] [US3] `packages/claude-plugin-cockpit/lib/gate-status-check.ts` docstring `:164-165`:
  drop the removed **D.6 (G.4a)** escalation row; list only the live escalation rows **D.7 (G.4b)**,
  **D.10 (G.4c)**, **D.11 (G.4d)**. Comment-only edit — the `Set` value `["escalation"]` is unchanged.
  (FR-006; data-model E6)
- [ ] T032 [P] [US3] `cockpit.auto.agents` role-selector list in `auto.md` (~`:262`): remove the
  `fixer` key. Resulting keys: `default` / `clarifier` / `reviewer` / `validator` / `diagnoser`.
  (FR-007; data-model E5)
- [ ] T033 [P] [US3] Fix the stale comment in
  `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts:2839` ("10-row table") to reflect
  the current mapping-table shape. (FR-008)

## Phase 5: Verification (re-pin + suite)

- [ ] T040 [US1] [US2] [US3] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: `packages/claude-plugin-cockpit/commands/auto.md`
  Pin sites that read the edited file(s):
    - :2542: 437-5 — D.5/D.6 narrations name `absent` AND `pending` as fallback triggers; reject `/defer\s+(this\s+wake|on\s+pending)/i` (extractSubheadingBlock, reads the D.5 heading edited by T010/T011)
    - :5990: 500-5 — D.13 + G.9 findings source + no-subagent (extractSubheadingBlock D.13 + G.9; the `parsed from the **gate body**` assertion at :6008 must be re-pinned to the T020/T021 comment-fetch contract)
    - :6011: 500-6 — G.8 findings source + approve-model branch (extractSubheadingBlock G.8; the `parsed from the **gate body**` assertion at :6018 must be re-pinned to the T030 `(none)`-unconditional contract)
    - :6035: 500-7 — UI-mode gate-mapping table G.8 + G.9 rows (direct `indexOf`/slice read of the `## UI-mode gate mapping` section; re-pin only if T030's G.8 approve-outcome row text changes)
    - :546: 398-1 — readdirSync(COMMANDS_DIR) sweep pinning every `commands/*.md` invocation against its `--help` snapshot (always in scope for any auto.md edit)
  Also add NEW positive/negative pins for the T010/T011 D.5 label guard, the `deferred: implementation-review pending`
  outcome token (must not trip the 437-5 negative regex), and the T020/T021 findings-fetch predicate
  (`startsWith "## Remediation limit reached"`, most-recent by `createdAt`, `- <file>:<line> — <title>` em-dash bullet, `(none)` fallback).
  Re-pinning means updating the assertion to the NEW contract.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.
  (FR-009; research R6)
- [ ] T041 Run the suite green: `pnpm --filter @generacy/claude-plugin-cockpit test`
  (targets `playbook-verification.test.ts`). Cross-check SC-004 with a grep for stale refs
  (`fixer`, `10-row`, `D.6 (G.4a)`, and the G.8 "gate body" claim) → expect 0 in edited files. (SC-005, SC-004)

## Dependencies & Execution Order

**Phase order (sequential):**
- Phase 1 (grounding) → Phase 2 / Phase 3 / Phase 4 (edits) → Phase 5 (verification).
- Phase 5 MUST come last: the implementer must land the playbook edits before knowing the NEW
  heading/contract shape to re-pin to (T040 depends on T010–T033).

**Within-phase dependencies:**
- Phase 2: T010 before T011 (both edit the same D.5 block; T011 extends the enum T010 touches — sequential, not `[P]`).
- Phase 3: T020 before T021 (T021 mirrors the T020 contract — keep them consistent; sequential).
- Phase 4: T030, T031, T032, T033 are all `[P]` — disjoint regions/files (G.8 prose, a `.ts` docstring, the agents config, the test comment).
- Phase 5: T040 before T041 (re-pin, then run the suite).

**Parallel opportunities:**
- The four Phase 4 cleanup tasks (T030–T033) can run concurrently.
- Phase 2 and Phase 3 edit different, non-overlapping auto.md sections and could be interleaved, but
  each phase is internally sequential; the safe default is Phase 2 → Phase 3.

## Playbook-coupling note

`spec.md` names `packages/claude-plugin-cockpit/commands/auto.md` (matches
`packages/claude-plugin-cockpit/commands/*.md`), so the mandatory re-pin task (**T040**) is required
per CLAUDE.md § "Cockpit playbook pins". It re-pins to the NEW contract in the same change and never
weakens or deletes an assertion.
