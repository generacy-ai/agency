# Implementation Plan: Close the D.10 bypass and add D.11 for `waiting-for:merge-conflicts` (with ledger-only backfill for three server-side-owned gates)

**Feature**: Amend `auto.md` § Dispatch, § Gate contract, and § Invariants to (1) add D.11 escalation gate for `waiting-for:merge-conflicts`, (2) tighten D.10's trigger so any `waiting-for:*` label without a matching dispatch row IS unrecognized (closing the "known but not actionable" bypass observed on the T-S5 run), (3) backfill three server-side-owned ledger-only rows for `waiting-for:pr-feedback`, `waiting-for:children-complete`, `waiting-for:dependencies` so the FR-011 drift audit is green day one, and (4) ship a plugin-local `gate-vocabulary` module + audit assertion + two behavioral regressions in the existing `playbook-verification.test.ts` suite.
**Branch**: `396-found-during-cockpit-v1`
**Date**: 2026-07-10
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the T-S5 silent-stall class observed on the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92, finding #45). All three P2 issues reached `waiting-for:merge-conflicts`; the auto session's live-state re-check saw the label and classified it as *"worker-owned transient state, not one of the D.1–D.9 actionable dispatch classes, so no dispatch and no ledger line"* — a category error (a `waiting-for:*` label is by protocol operator-owned pending state, not transient) that routed around D.10's catch-all and stalled the loop indefinitely with no gate, no ledger line, no escalation.

Two fixes, applied to `packages/claude-plugin-cockpit/commands/auto.md` in the same edit:

1. **Add the missing dispatch row.** `waiting-for:merge-conflicts` → **D.11** escalation gate presenting the conflicted paths from the pause alert; options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`. On `advance` the parent runs `generacy cockpit advance --gate merge-conflicts <issue-ref>` after the operator confirms the branch is pushed conflict-free. **If that CLI call returns non-zero, re-present the D.11 gate with the error prepended verbatim to the presentation block** (Q3=A — the most likely cause is *"branch still has conflicts"*, which the operator needs to see mid-decision, not on the next poll; matches D.6's re-present-on-fixer-unfixed precedent). Once the engine-side resolver ships, the row degrades to ledger-only (like D.9).

2. **Close the D.10 bypass.** Tighten the D.10 trigger so classification judgment cannot route around the catch-all: *any* `waiting-for:*` label without a matching dispatch row IS an unrecognized state → D.10 escalation. "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` state unless the dispatch table **explicitly names it ledger-only** (D.9 shape). The § Dispatch table is the exhaustive list of `waiting-for:*` states the loop may ignore.

Because the tightened D.10 trigger flips three pre-existing engine-emitted labels from "silent no-op" to "would fire D.10 day one" (`waiting-for:pr-feedback`, `waiting-for:children-complete`, `waiting-for:dependencies` — all present in `tetrad-development/.github/labels.yml` but absent from `auto.md`'s dispatch table), the plan also **backfills three ledger-only D.9-shape rows** (Q2=C) so the tightened trigger and the FR-011 drift audit are green day one. Each backfilled row carries a one-line semantic rationale in prose. If any of the three semantics is genuinely ambiguous at implement time, that one row falls back to the Q2=B allowlist path (a visible TODO surface) rather than a guessed dispatch.

Also ship:
- **`packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`** — a plugin-local vocabulary list (Q1=C) seeded with all 11 `waiting-for:*` tokens from `tetrad-development/.github/labels.yml` plus `waiting-for:merge-conflicts` (12 total), with a header comment naming the upstream sources and the sync obligation. The runtime rule (any `waiting-for:*` without a dispatch row → D.10) remains the load-bearing safety net; the audit is completeness hygiene against the declared vocabulary.
- **Two new assertions in the existing `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` suite** — created by #394 and extended by this fix:
  - **Assertion (396-1)**: fixture live-state with `waiting-for:merge-conflicts` → D.11 escalation gate fires (until ledger-only in a follow-up), never silent continue.
  - **Assertion (396-2)**: fixture with a novel `waiting-for:someday-gate` (a token in neither the vocabulary nor the dispatch table) → D.10 escalation fires with the verbatim state in the presentation.
- **One new drift-audit assertion (396-3)** in the same file: every token in `lib/gate-vocabulary.ts` appears as a Trigger in `auto.md`'s § Dispatch table.

**Companion operator-side edit** (out of this repo, but same-day per Q4=D-modified): the operator registers `waiting-for:merge-conflicts` and `completed:merge-conflicts` in `tetrad-development/.github/labels.yml` and `tetrad-development/docs/label-protocol.md`. This is a docs/config-only change (no engine behavior change), so it is not gated by the tetrad-development merge-freeze surface; it is called out in this plan for traceability but is not part of this PR's diff.

The change is **playbook prose + one new plugin-local vocabulary module + suite extension** — no runtime code change to `cockpit watch` or `cockpit status`, no new CLI verb beyond the already-existing `cockpit advance --gate merge-conflicts`, no engine-side change. Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) remain byte-identical on this branch. Historical spec directories (`specs/372-…`, `specs/384-…`, `specs/388-…`, `specs/390-…`, `specs/394-…`) show zero changes.

This is the **classification-drift analogue** of the #394 mechanism-gap fix at a different playbook surface:
- **#394** closed a *mechanism gap* at the main-loop stream consumer (under-specified consumption recipe → filter improvised → 16/17 events dropped) with a pinned recipe + invariant §7 + liveness cross-check.
- **#396** closes a *classification gap* at the dispatch surface (under-specified catch-all → "known but not actionable" invented as a third bucket → silent no-op) with an explicit `waiting-for:*`-must-be-named-or-D.10 trigger + a completeness-hygiene audit against a declared vocabulary.

Same instruction-drift class (#384/#388/#390), same fix shape (pin the rule at the surface + backstop with a regression fixture the model cannot silently regress).

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime); TypeScript (Vitest) for the two new behavioral assertions + one drift-audit assertion; TypeScript for the new `lib/gate-vocabulary.ts` module.
**Primary Dependencies**: None new on the runtime side. Existing runtime: Claude Code slash-command executor, `AskUserQuestion` tool, Bash tool with `run_in_background`, harness Monitor primitive. `generacy cockpit watch`, `generacy cockpit status --json`, and (already-existing) `generacy cockpit advance --gate <name> <issue-ref>` remain the authoritative CLI verbs. No new CLI verb is added. On the test side: Vitest — already a dev-dep in the plugin package (introduced by #394).
**Storage**: Filesystem — one file edited (`packages/claude-plugin-cockpit/commands/auto.md`); one file created (`packages/claude-plugin-cockpit/lib/gate-vocabulary.ts`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — created by #394, extended here with three assertions); two fixture files created (`packages/claude-plugin-cockpit/tests/fixtures/396-merge-conflicts-live-state.json`, `packages/claude-plugin-cockpit/tests/fixtures/396-someday-gate-live-state.json`).
**Testing**:
- **Static** (necessary but proven insufficient by #384/#388/#390 — static-only fails at behavioral drift): greps for the D.11 dispatch row, the `waiting-for:merge-conflicts` verbatim event string, the tightened D.10 trigger prose (specifically: "any `waiting-for:*` label without a matching dispatch row"), the G.4 (d) sub-block heading, the three ledger-only backfilled rows for `waiting-for:pr-feedback` / `waiting-for:children-complete` / `waiting-for:dependencies` (with their one-line rationale prose), the § Gate contract table row `G.4 (d)`, the `lib/gate-vocabulary.ts` file existence + expected 12-token array, and the sibling-playbook byte-identity check. See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: three new assertions appended to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`:
  - **(396-1)**: feed `396-merge-conflicts-live-state.json` through the D.11 reference-dispatch handler and assert the escalation gate is invoked (single-`AskUserQuestion`-call mock records the invocation with the three expected options in the right order).
  - **(396-2)**: feed `396-someday-gate-live-state.json` (a `waiting-for:*` token not in `lib/gate-vocabulary.ts` **and** not in the dispatch table) through the dispatch classifier and assert the D.10 unrecognized-state gate fires (verbatim state present in the mocked presentation block).
  - **(396-3)**: static audit — read `lib/gate-vocabulary.ts` and `packages/claude-plugin-cockpit/commands/auto.md`; assert every token in the vocabulary appears as a `## D.<n> — \`waiting-for:<name>\`` heading **or** as a `` `waiting-for:<name>` `` Trigger token in a § Dispatch row.
- **True verifier**: a re-run of the cockpit v1.5 auto-mode integration smoke test on the same T-S5 corpus (three P2 issues with mocked `waiting-for:merge-conflicts` transitions). Adherence is probabilistic; the pinned D.11 row + tightened D.10 trigger remove the class of failure by construction; the drift audit is defense-in-depth against future engine-side vocabulary additions. Empirical confirmation is the true verifier (SC-001 shape from #394 carried forward).

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard). The new `lib/gate-vocabulary.ts` module is imported by the test file only; it is not imported by any runtime code path (the playbook is prose; the module is a testable vocabulary declaration).

**Project Type**: Single-package playbook edit + one new vocabulary module + suite extension (one plugin package touched; no cross-package changes; no cross-repo changes to `tetrad-development` in this branch — operator-side companion doc/config edit tracked separately per Q4).

**Performance Goals**: N/A (playbook adherence, not throughput). Adherence targets: 0 silent stalls on the T-S5 corpus (SC parallel to #394's SC-001); 100% of `waiting-for:*` labels either dispatch on a named row or fire D.10; the drift audit passes green day one with the 12-token vocabulary and the 4 named + 3 backfilled ledger-only + 1 catch-all = 8 dispatch rows covering all 11 `waiting-for:*` labels-yml tokens plus `waiting-for:merge-conflicts` (see § Vocabulary/Dispatch mapping in [data-model.md](./data-model.md)).

**Constraints**:
- **The runtime safety net is the tightened D.10 trigger, not the audit.** The audit is completeness hygiene; the D.10 trigger is the load-bearing invariant. A future engine-side `waiting-for:*` token that ships before the operator syncs `lib/gate-vocabulary.ts` will still fire D.10 escalation (not silent no-op). This is the entire point of the D.10 tightening — it must not be relaxed to trust the vocabulary list.
- **`I've resolved it` failure-path is verbatim re-present, not fall-through** (Q3=A, FR-D.11-advance-failed-path). The most likely cause of a non-zero return from `cockpit advance --gate merge-conflicts` is "branch still has conflicts" — the operator needs to see the error inline in the re-presented gate's presentation block, not on the next poll. Skip/Stop remain available on the re-presented gate; the operator retains the exit paths.
- **Placement rule is deterministic, not aesthetic** (Q5=C+D). Named rows are grouped together, catch-all last. `(d) Merge-conflicts` inserts between (b) and (c) in the G.4 presentation block AND in the § Gate contract table row; `(c) Unrecognized` stays terminal, mirroring D.10's position. D.11 numerically follows D.10 (append) but visually inserts between D.9 (family) and D.10 (catch-all) in the § Dispatch table. The three backfilled ledger-only rows insert as **D.9a / D.9b / D.9c** — sub-numbered under D.9 to signal the server-side-owned family, so the table's numeric ordering remains monotonic on the leading digits and the catch-all D.10 stays visually last. (Alternative: D.12/D.13/D.14 numbering appended after D.11 — rejected in [research.md](./research.md) § R2 as visually placing the catch-all D.10 in the middle of the table.)
- **Vocabulary is plugin-local, not cross-repo** (Q1=C). `lib/gate-vocabulary.ts` is seeded with the 11 `tetrad-development/.github/labels.yml` tokens **plus `waiting-for:merge-conflicts`** (12 total). The file header names the upstream sources (`labels.yml` and `docs/label-protocol.md`) and states the sync obligation. Cross-repo CI reads are explicitly rejected (would fail this repo's CI on a tetrad-development typo); self-consistency-against-`auto.md` (Q1=D) is explicitly rejected as vacuous (an audit against oneself is always green).
- **Ledger-only backfill rationale is one line per row, not a design document.** Each of the three backfilled rows gets a one-line prose rationale inline in the dispatch section (`pr-feedback`: legacy alias of the engine-owned feedback loop; `children-complete`: epic-container state, the running loop *is* its resolution; `dependencies`: engine-owned cross-issue wait). If any of the three semantics can't be pinned at implement time, that specific row falls back to the Q2=B allowlist path — an explicit allowlist entry in the audit fixture and a filed follow-up. Guessing is prohibited (matches D.10's `Never guess` precedent).
- **Scope boundary**: `auto.md` (edit) + `lib/gate-vocabulary.ts` (new) + `tests/playbook-verification.test.ts` (extend) + two fixture files. Sibling playbooks byte-identical. § Ledger surface byte-identical (D.11 gets a ledger row in the § Action + outcome vocabulary table; D.9a/b/c get one row each; no format sentence change, no persistence-rule change). Dispatch table gains three named rows (D.9a/b/c) plus one escalation row (D.11); § Gate contract gains G.4 (d); § Invariants section unchanged (no invariant §8 — the tightened D.10 trigger sits inside D.10's own prose, not at the invariants surface, matching how D.10 has always been the "unrecognized" invariant in prose form).
- **No new invariant number**. #394 added §7 ("Stream consumption is unfiltered"); #396 does **not** add §8. The D.10 tightening lives inside D.10's own trigger prose. A future audit-adherence invariant is a follow-up, not this fix's surface, so no drift on the invariants list. Consistent with SC-007 from #394 (no belt-and-suspenders extra clauses).

**Scale/Scope**: One file edited (`auto.md`, ~671 lines pre-edit → ~730-750 post-edit, on the order of 60-80 net added lines across § Dispatch (D.9a/b/c + D.11 + tightened D.10), § Gate contract (G.4 (d)), the § Action + outcome vocabulary ledger table, and D.10's own trigger prose). One file created (`lib/gate-vocabulary.ts`, ~30 lines). One file extended (`tests/playbook-verification.test.ts`, ~80-100 net added lines for three new assertions + fixture reads). Two fixture files created (~20 lines each). Zero files deleted, zero files renamed. No changes to `packages/claude-plugin-cockpit/lib/reference-consumption.ts` (created by #394) — the new module is independent.

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #388 / #390 / #394 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/396-found-during-cockpit-v1/
├── spec.md                                # Feature spec (read-only)
├── clarifications.md                      # Q1–Q5 with resolved answers (read-only)
├── plan.md                                # THIS FILE
├── research.md                            # Design decisions and rationale (Phase 0)
├── data-model.md                          # Playbook structural model: pre/post layout of § Dispatch, G.4, ledger table; gate-vocabulary module shape
├── quickstart.md                          # Verification runbook (static grep + behavioral Vitest)
├── contracts/
│   ├── dispatch-D11-merge-conflicts.md    # D.11 dispatch contract (trigger, subagent, gate, apply-verdict incl. re-present-on-non-zero)
│   ├── dispatch-D10-tightened-trigger.md  # D.10 tightened trigger contract (any waiting-for:* w/o row → unrecognized)
│   ├── gate-vocabulary-module.md          # lib/gate-vocabulary.ts export shape, seed contents, sync obligation
│   └── audit-drift-check.md               # Drift-audit assertion contract (vocabulary ⊆ dispatch-trigger tokens)
├── checklists/                            # (empty — reserved for /checklist skill)
└── tasks.md                               # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                            # MODIFIED — § Dispatch (D.9a/b/c backfill + D.11 + D.10 tightened trigger), § Gate contract (G.4 (d)), § Action + outcome vocabulary (four new ledger rows)
├── lib/
│   ├── reference-consumption.ts           # UNCHANGED — created by #394
│   └── gate-vocabulary.ts                 # NEW — plugin-local vocabulary list; 12 tokens; header names upstream sources
└── tests/
    ├── playbook-verification.test.ts      # EXTENDED — three new assertions (396-1, 396-2, 396-3)
    └── fixtures/
        ├── 394-mixed-event-shapes.ndjson  # UNCHANGED — created by #394
        ├── 394-actionable-live-state.json # UNCHANGED — created by #394
        ├── 396-merge-conflicts-live-state.json # NEW — cockpit status --json shape; 1 issue in waiting-for:merge-conflicts
        └── 396-someday-gate-live-state.json    # NEW — cockpit status --json shape; 1 issue in waiting-for:someday-gate (novel/unknown)
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md    # No dispatch surface; sibling of auto.md
├── review.md     # No dispatch surface; sibling of auto.md
├── merge.md      # No dispatch surface; sibling of auto.md
├── queue.md      # No dispatch surface; sibling of auto.md
├── watch.md      # Produces the stream; does not classify
└── status.md     # Reads live state; does not dispatch
```

Historical artifacts (deliberately untouched):

```text
specs/372-epic-generacy-ai-tetrad/plan.md    # Status: Complete; byte-identical
specs/384-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/           # Status: Complete; byte-identical
```

Companion operator-side edits (tracked here, not in this PR's diff):

```text
tetrad-development/.github/labels.yml        # Operator edit: add `waiting-for:merge-conflicts` + `completed:merge-conflicts`
tetrad-development/docs/label-protocol.md    # Operator edit: document the same two labels
```

**Structure Decision**: Single-package playbook edit + one new vocabulary module + suite extension. The "structure" is the internal layout of `auto.md`'s § Dispatch table + G.4 sub-blocks + § Action + outcome vocabulary — see [data-model.md](./data-model.md) for pre/post layout — plus the `lib/gate-vocabulary.ts` export contract and the three new test assertions — see [contracts/](./contracts/) for the four contract files.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (one prose file edit + one new small vocabulary module + one test-file extension + two small fixtures) and matches the fix scope named in the spec (D.11 dispatch row, tightened D.10 trigger, drift audit against a plugin-local vocabulary). The design explicitly rejects:

- **Cross-repo audit source** (Q1=A/B rejected). Reading `tetrad-development/.github/labels.yml` or `docs/label-protocol.md` from this repo's CI creates cross-repo coupling that would fail on a tetrad-development typo. The plugin-local vocabulary decouples the two, with the D.10 trigger as the load-bearing safety net.
- **Self-consistency audit against `auto.md`** (Q1=D rejected). An audit that greps `auto.md` for `waiting-for:*` tokens and asserts each has a Trigger row is vacuous by construction — every dispatched token has a Trigger, that's what dispatching means. Adds no drift signal against the engine vocabulary.
- **Expanding scope to add operator-facing gates for the three pre-existing gaps** (Q2=A rejected). `waiting-for:children-complete` and `waiting-for:dependencies` are server-side/engine-owned; adding an operator gate would smuggle in a new interaction surface the observed corpus doesn't need. Ledger-only D.9-shape matches D.9's existing precedent.
- **Narrowing FR-011 to a single-token merge-conflicts-only check** (Q2=D rejected). A single-token audit is not a drift signal; the whole point is completeness hygiene against the declared engine vocabulary. Q2=C (backfill three rows + fall back to Q2=B allowlist for genuinely-ambiguous tokens) gives day-one green + a visible TODO surface for future ambiguity.
- **Full-stop D.11 failure path** (Q3=D rejected). Killing the auto session on `cockpit advance --gate merge-conflicts` non-zero is over-punitive — the most likely cause ("branch still has conflicts") is operator-recoverable in the same gate presentation. Re-present with the error inline (Q3=A) subsumes the operator's ability to Stop while keeping Retry available.
- **Ledger-and-continue D.11 failure path** (Q3=C rejected). Ledgering the failure and looping means the operator sees the retry on the next poll with no context about what went wrong; Q3=A gives them the CLI error inline in the same presentation block, mid-decision.
- **Cross-repo companion PR for tetrad-development label registration** (Q4=A rejected). The audit source is plugin-local (Q1=C), so tetrad-development label registration is decoupled from this fix's audit-green condition. The operator registers the labels same-day as a docs/config-only edit (Q4=D-modified). No cross-repo PR coordination required.
- **Adding invariant §8 "Dispatch table is the exhaustive `waiting-for:*` allowlist"**. Rejected as scope creep. The rule already lives in D.10's tightened trigger prose; a numbered invariant would be a belt-and-suspenders duplicate (same anti-pattern SC-007 of #394 rejected for step-4/step-5 changes). If future drift shows the invariants surface is needed, that is a follow-up finding, not this fix's shape.
- **Changing D.11 from "escalation gate" to "ledger-only"** in v1. Rejected: the observed corpus is a stall, not a server-side handoff; the engine-side resolver doesn't exist yet. The spec pins the shape as escalation-until-engine-handler; once the engine handler ships (companion finding), a follow-up degrades D.11 to ledger-only. Prematurely making it ledger-only reproduces the T-S5 stall.
- **Auto-approve on the D.11 gate**. Every gate still prompts (invariant §6). This fix does not touch the gate-autonomy surface.
- **Adding a new CLI verb (e.g., `cockpit resolve-conflicts`)**. Rejected: `cockpit advance --gate merge-conflicts <issue-ref>` is the existing verb pattern, matches D.1/D.2/D.3/D.4's `cockpit advance --gate <name>` shape, and adds no engine-side surface area. The operator manually resolves conflicts (git rebase + push) before selecting the advance option — the gate is the confirmation surface, not a new operation.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q5 decisions with rationale (resolved in `clarifications.md`; research.md restates them as design decisions with alternatives-rejected).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (pre/post layout of § Dispatch, § Gate contract G.4, § Action + outcome vocabulary; `lib/gate-vocabulary.ts` export shape; audit-assertion pseudo-code), [contracts/](./contracts/) (four contract files: D.11 dispatch, D.10 tightened trigger, gate-vocabulary module, drift audit), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Audit source is a plugin-local vocabulary file, seeded with the full engine vocabulary (11 `labels.yml` tokens + `waiting-for:merge-conflicts`).** Cross-repo reads rejected (Q1=A/B would create cross-repo CI coupling); self-consistency check rejected (Q1=D is vacuous). Plugin-local list decouples the two repos while giving the audit a declared vocabulary to check against. The runtime rule (any `waiting-for:*` without a row → D.10) is the load-bearing safety net; the audit is completeness hygiene. | Q1=C |
| D2 | **Backfill three ledger-only D.9-shape rows for `waiting-for:pr-feedback` / `waiting-for:children-complete` / `waiting-for:dependencies`**, each with a one-line rationale inline in the dispatch section. Falls back to per-row allowlist (Q2=B) if any token's semantics can't be pinned at implement time. Rejected: expanding scope to add operator gates (Q2=A — would smuggle in a new interaction surface), narrowing FR-011 to merge-conflicts-only (Q2=D — kills the drift signal). | Q2=C |
| D3 | **D.11 `I've resolved it` failure path re-presents the gate with the CLI error prepended verbatim to the presentation block.** Matches D.6's re-present-on-fixer-unfixed precedent. Skip/Stop remain available on the re-presented gate. Rejected: full-stop (Q3=D — over-punitive for operator-recoverable failure), ledger-and-continue (Q3=C — loses inline error context), route-to-D.10 (Q3=B — D.10 is for state-classification unrecognition, not action-execution failure; category error). | Q3=A |
| D4 | **`waiting-for:merge-conflicts` (and `completed:merge-conflicts`) registration in `tetrad-development/.github/labels.yml` and `docs/label-protocol.md` is an operator-side docs/config edit, same-day, tracked outside this PR's diff.** The plugin-local audit vocabulary (D1) makes cross-repo CI coupling unnecessary. Rejected: companion cross-repo PR (Q4=A — coordination cost with no CI benefit), plugin-local-only with allowlist deferral (Q4=B/D-original — the label is engine-emitted today, so leaving the doc/config unpatched leaves an observable "this label exists but isn't documented" gap). | Q4=D-modified |
| D5 | **Named G.4 sub-blocks are grouped together with the catch-all last: `(a)`, `(b)`, `(d)`, `(c)`.** `(d) Merge-conflicts` inserts between `(b)` and `(c) Unrecognized`. The § Gate contract table row `G.4 (d)` inserts in the same position. Rationale (Q5=D): the order carries no semantic weight (trigger comes from the dispatch row), so a deterministic rule beats an aesthetic preference. Grouping named rows together mirrors D.11's visual position between D.9 and D.10, keeping the "catch-all last" invariant across both the table and the contract. | Q5=C+D |

## Vocabulary/Dispatch mapping (audit surface, day one)

Sourced from `tetrad-development/.github/labels.yml` (11 tokens) + operator-side registration of `waiting-for:merge-conflicts` (1 token) = 12 tokens in `lib/gate-vocabulary.ts`. The mapping below is the audit's ground-truth day one:

| Token | Dispatch row | Shape |
|-------|--------------|-------|
| `waiting-for:clarification` | D.1 | Named — subagent + fused batch gate + `cockpit advance` |
| `waiting-for:spec-review` | D.2 | Named — subagent + fused verdict gate + `cockpit advance` OR `COMMENT` review |
| `waiting-for:clarification-review` | D.2 | Same as above |
| `waiting-for:plan-review` | D.2 | Same as above |
| `waiting-for:tasks-review` | D.2 | Same as above |
| `waiting-for:implementation-review` | D.3 | Named — same as D.2 with #390 PR-scope analyzer |
| `waiting-for:manual-validation` | D.4 | Named — subagent + confirm gate + `cockpit advance` |
| `waiting-for:address-pr-feedback` | D.9 | Named ledger-only — server-side-owned |
| `waiting-for:pr-feedback` | **D.9a** (NEW) | Named ledger-only — legacy alias of the engine-owned feedback loop |
| `waiting-for:children-complete` | **D.9b** (NEW) | Named ledger-only — epic-container state; the running loop *is* its resolution |
| `waiting-for:dependencies` | **D.9c** (NEW) | Named ledger-only — engine-owned cross-issue wait |
| `waiting-for:merge-conflicts` | **D.11** (NEW) | Named — escalation gate (`I've resolved it` / `Skip` / `Stop`); degrades to ledger-only once engine handler ships |
| *(any novel `waiting-for:*` not in the vocabulary)* | D.10 | Catch-all — escalation (Skip / Stop only, no Retry) |

**Audit assertion (396-3)**: `∀ token ∈ gateVocabulary: token appears as a Trigger in auto.md's § Dispatch table (D.1–D.9c or D.11)`. Day one: 12 tokens ⊆ 12 named rows. Audit passes green.

**D.10 safety-net check**: a token *not* in the vocabulary (e.g., a novel `waiting-for:someday-gate` shipped by the engine before the operator syncs `lib/gate-vocabulary.ts`) still fires D.10 escalation at runtime — the tightened D.10 trigger doesn't consult the vocabulary; it consults the dispatch table. This is the load-bearing invariant.

## Verification Layering

Static (necessary but not sufficient — the #384/#388/#390/#394 experience proved static-only fails at behavioral defects):

- `auto.md` contains `## D.9a — \`waiting-for:pr-feedback\``, `## D.9b — \`waiting-for:children-complete\``, `## D.9c — \`waiting-for:dependencies\``, `## D.11 — \`waiting-for:merge-conflicts\`` headings.
- `auto.md` D.10 trigger prose contains the tightened wording: any `waiting-for:*` label without a matching dispatch row IS an unrecognized state (verbatim anchor greppable).
- `auto.md` § Gate contract table contains a `G.4 (d)` row inserted between `G.4 (b)` and `G.4 (c)`.
- `auto.md` § Gate contract G.4 prose contains a `(d) Merge-conflicts` sub-block inserted between `(b)` and `(c)`.
- `auto.md` § Action + outcome vocabulary table contains four new rows: `D.9a pr-feedback`, `D.9b children-complete`, `D.9c dependencies`, `D.11 merge-conflicts`.
- `lib/gate-vocabulary.ts` exists, exports a named `GATE_VOCABULARY` const with exactly 12 tokens, includes a header comment naming `tetrad-development/.github/labels.yml` and `docs/label-protocol.md` as upstream sources.
- `git diff origin/develop` on sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) shows zero changes.
- `git diff origin/develop` on `auto.md` § Invariants section shows zero changes (no new §8).
- Historical spec directories show zero changes on this branch.

Behavioral (evidence, not proof — three assertions appended to `tests/playbook-verification.test.ts`):

- **396-1 (SC parallel to #394's SC-002)**: feeding `396-merge-conflicts-live-state.json` through the D.11 reference-dispatch handler asserts the escalation gate is invoked with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` in that order.
- **396-2 (SC parallel to #394's SC-005)**: feeding `396-someday-gate-live-state.json` (a `waiting-for:someday-gate` token in neither the vocabulary nor the dispatch table) through the dispatch classifier asserts D.10 escalation fires with the verbatim state present in the mocked presentation block.
- **396-3 (drift audit — FR-011)**: read `lib/gate-vocabulary.ts` and `packages/claude-plugin-cockpit/commands/auto.md`; assert `∀ token ∈ gateVocabulary: token matches a Trigger in auto.md's § Dispatch table`. Green day one; fails on a future edit that adds a vocabulary token without a dispatch row (or removes a dispatch row without deleting the vocabulary token).

True verifier:

- A re-run of the cockpit v1.5 auto-mode integration smoke test on the T-S5 corpus (the three P2 issues that stalled on `waiting-for:merge-conflicts`). Adherence is probabilistic; the pinned D.11 row + tightened D.10 trigger remove the class of failure by construction; the drift audit is defense-in-depth against future engine-side vocabulary additions. Empirical confirmation across a variety of runs is the true verifier.
