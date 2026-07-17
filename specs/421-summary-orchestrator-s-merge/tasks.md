# Tasks: Route `blocked:stuck-merge-conflicts` to D.11

**Input**: Design documents from `/specs/421-summary-orchestrator-s-merge/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies) — **note**: this feature edits ONE file, so most tasks are sequential
- **[Story]**: All tasks belong to US1 (documentation-only routing fix)

## Phase 1: Setup

- [X] T001 [US1] Read current `packages/claude-plugin-cockpit/commands/auto.md` to confirm the reference line numbers cited in `plan.md` § Edit sites (dispatch table row ~110, D.11 § Trigger ~377, subagent prompt ~381–387, ledger line ~396, D.10 case (d) ~400, G.4d presentation ~685–697 and ~701–717) still match current source; adjust downstream anchors if they've drifted.

## Phase 2: D.11 Trigger & Dispatch Table

- [X] T002 [US1] In `packages/claude-plugin-cockpit/commands/auto.md`, widen the D.11 row in the dispatch table (~line 110) so the Trigger cell names BOTH labels: `waiting-for:merge-conflicts` and `blocked:stuck-merge-conflicts`, with a short co-occurrence note.
- [X] T003 [US1] In `packages/claude-plugin-cockpit/commands/auto.md`, update D.11 § Trigger prose (~line 377) to name both verbatim event strings (`waiting-for:merge-conflicts`, `blocked:stuck-merge-conflicts`), state that the pair co-occurs and represents one incident, and reference the dedup rule from Phase 3.

## Phase 3: D.11 Dedup, Subagent, Ledger, Post-Advance

- [X] T004 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` D.11 § Dispatch (around step 1 / new step, ~line 380), insert the dedup check: if `<issue-ref>` is present in the in-memory `dispatched-issues set`, write ledger-only line `<issue-ref> · <source-label> · escalation-gate · already-dispatched` and return without subagent/gate. Reference the session-mute-set precedent at `auto.md:266`, `:305`, `:391`, `:407`, `:749` for placement style.
- [X] T005 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` D.11 § Dispatch step 1.5 subagent prompt (~lines 381–387), add the source label to the payload verbatim (one of `waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`); note the subagent may reference "auto-remedy already failed" in `root_cause`/`evidence` when source is `blocked:*`. Return schema stays `{root_cause, evidence, recommended_action, confidence}`.
- [X] T006 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` D.11 § Ledger line format (~line 396), replace the hardcoded `waiting-for:merge-conflicts` token with a `<source-label>` placeholder and enumerate the two possible values plus the new `already-dispatched` outcome (per `data-model.md` § Entity 3).
- [X] T007 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` D.11 § post-advance hook (~line 390), add: on successful `cockpit_advance(gate="merge-conflicts")`, remove `<issue-ref>` from the `dispatched-issues set` so a genuinely new future conflict on the same issue re-gates. Note `Skip` (session-local mute) leaves entry in place; `Stop` drops the set with process exit.

## Phase 4: G.4d Presentation (initial + re-presentation)

- [X] T008 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` § Gate contract G.4d initial presentation (~lines 685–697), insert conditional row `**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)` placed ABOVE `**Root cause:**` only when the source label is `blocked:stuck-merge-conflicts`. Do not mutate the opening line; do not append trailing prose. Follows the fixed-shape labeled-field convention at `auto.md:665–677` (D.7 precedent).
- [X] T009 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` § Gate contract G.4d typed-error re-presentation (~lines 701–717), apply the SAME conditional `**Auto-remedy status:**` row insertion above `**Root cause:**` when source is `blocked:stuck-merge-conflicts`. Keep the initial and re-presentation shapes symmetric.

## Phase 5: D.10 Broadening (Catch-All Documentation)

- [X] T010 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` D.10 § Trigger case (d) (~line 400), broaden the prose from `waiting-for:*` to `any state token (waiting-for:* or blocked:*) that does not match a Trigger in D.1–D.11 fires D.10`, so future `blocked:*` labels (e.g. `blocked:stuck-validate-fix` from generacy#943) don't fall through the vague catch-all.
- [X] T011 [US1] In `packages/claude-plugin-cockpit/commands/auto.md` (~line 402 and ~line 371), update every dispatch-table reference / prose paragraph that reads `unrecognized waiting-for:* still fires D.10` or `Any waiting-for:* label without a matching dispatch row IS an unrecognized state` so both include `blocked:*` alongside `waiting-for:*`. Keep phrasing parallel to the case (d) update in T010.

## Phase 6: Verification

- [X] T012 [US1] Run the four grep spot-checks from `quickstart.md` § How to run the verification against `packages/claude-plugin-cockpit/commands/auto.md`; all four MUST return at least one match:
  - `grep -n "blocked:stuck-merge-conflicts" packages/claude-plugin-cockpit/commands/auto.md`
  - `grep -n "Auto-remedy status" packages/claude-plugin-cockpit/commands/auto.md`
  - `grep -n "already-dispatched" packages/claude-plugin-cockpit/commands/auto.md`
  - `grep -n "blocked:\*" packages/claude-plugin-cockpit/commands/auto.md`
- [X] T013 [US1] Walk each of the five `quickstart.md` verification scenarios (S1 regression, S2 new path, S3 dedup, S4 post-advance re-gate, S5 other `blocked:*` → D.10) against the edited prose; document any mismatch and re-open the corresponding phase task.
- [X] T014 [US1] Run `git diff packages/claude-plugin-cockpit/commands/auto.md` and confirm every one of the ten edit sites in `plan.md` § Edit sites appears in the diff; nothing else outside those sites should change.

## Dependencies & Execution Order

**Sequential — same file**: All edit tasks (T002–T011) touch `packages/claude-plugin-cockpit/commands/auto.md` and must run sequentially to avoid merge collisions. None are marked `[P]`.

**Phase ordering**:
- **Phase 1 (T001)** anchors line numbers before any edit — must run first.
- **Phase 2 (T002–T003)** establishes the trigger surface before Phase 3 references it.
- **Phase 3 (T004–T007)** wires dedup / subagent / ledger / post-advance around the widened trigger.
- **Phase 4 (T008–T009)** adds presentation-block rendering — depends on Phase 3's source-label plumbing being in place.
- **Phase 5 (T010–T011)** broadens D.10 catch-all — logically independent of Phases 2–4 but same file, so ordered after them.
- **Phase 6 (T012–T014)** verifies against the shipped edits — must run last.

**Parallel opportunities**: None within this feature (single-file documentation edit). If splitting across sessions, T012 grep checks (Phase 6) can be delegated to a verification subagent while the operator reviews diffs (T014) in parallel, but both still follow Phases 1–5.

---

*Generated by speckit — 14 tasks, 6 phases, 0 parallel groups (single-file feature)*
