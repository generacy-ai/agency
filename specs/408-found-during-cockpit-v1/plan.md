# Implementation Plan: Restore cursor-error class split in `auto.md` § step 5 + consecutive-fault circuit breaker + ledger accounting

**Feature**: Fix `packages/claude-plugin-cockpit/commands/auto.md` § step 5 to restore the class split between cursor-error signals (post-#924 taxonomy: `resetFrom`/expiry/`discarded` → recover unchanged; `invalid-cursor` — malformed/never-issued/wrong-epic — → log verbatim + ledger + recover ONCE), add a consecutive-fault circuit breaker on `invalid-cursor` (a second consecutive `invalid-cursor` with no successful cursor-reuse between them fires a new G.4-class escalation gate (subtype (e)) with options `Continue degraded (sweep-per-batch)` / `Stop (exit auto)`, recommended default `Continue degraded`), and rewrite the § step 5 ledger line to `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` (per-class counter — Q1=C; only `invalid-cursor`'s counter drives escalation). Add a `408-1` positive drift audit + `408-2` negative-fixture regression assertion to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` following the `398-1`/`398-2`/`402-1`/`402-2` structural-audit shape (checked-in fixture `408-drift-auto.md`, structural check over prose-sniffing).
**Branch**: `408-found-during-cockpit-v1`
**Date**: 2026-07-12
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the finding #59 sweep-per-batch degradation observed on the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92) on snappoll-1 — the first MCP-path run after #406. When generacy#924's server-side bus-lifetime bug made every returned continuation cursor invalid, the auto loop settled into **cursor recovery per batch**: after every event batch, the parent ran the startup sweep + re-armed cursor-less, indefinitely, with no escalation. The run stayed correct because sweeps are idempotent — but silently forfeited the entire dispatch-round reduction that MCP-path migration exists to deliver (SC-003), and the systematic fault was only noticed because the operator happened to be watching the transcript.

Root cause: `auto.md` § step 5 (post-#406) collapses **all three** cursor-error signals — `invalid-cursor` typed error, `resetFrom` reset signal, cursor expiry — onto **one unconditional recovery path** (log verbatim → startup sweep → re-arm cursor-less). #406's Q2 clarification (per that spec's clarifications) had distinguished `invalid-cursor` → fail loud (caller bug) vs `resetFrom` → recover, but the shipped § step 5 reinterpreted fail-loud as "log verbatim, then recover anyway." Two contract gaps result:

1. **The clarified class distinction was collapsed in authoring.** In this incident the softening was *lucky* — it kept the run alive against a server bug (#924) — and pure fail-loud would have aborted multi-hour runs on what #924 shows can also be a server-restart artifact. Neither extreme is right; the missing piece is a class split informed by #924's hardened taxonomy (post-#924, `never-issued` reliably means caller bug; restarts/evictions classify as `discarded`/`resetFrom`).
2. **No circuit breaker on recovery.** Recovery treats each occurrence as isolated; nothing notices "this is the Nth consecutive one." A recurring cursor fault is a systematic defect (server or playbook), and unbounded silent recovery is the fail-silent shape this playbook family exists to abolish — degradation must become an operator decision, not a permanent quiet tax.

Three edits, applied in the same PR:

1. **Restore the class split in `auto.md` § step 5** (post-#924's hardened taxonomy). The three converged bullets are replaced with two branches:
   - `resetFrom` / expiry / `discarded` → recover (sweep + re-arm cursor-less), ledger line — unchanged semantics; ledger line updates to the new `<class> · <consecutive-count>` shape.
   - `invalid-cursor` (malformed / never-issued / wrong-epic) → log the typed error's `code`/`message`/`details` verbatim + ledger line + recover **once**. Do NOT abort on the first `invalid-cursor` — #924 shows a server-restart artifact can present as `invalid-cursor` too, so pure fail-loud costs multi-hour runs.

2. **Add consecutive-fault circuit breaker (new escalation gate G.4e).** A second consecutive `invalid-cursor` (no successful cursor-reuse between them; Q2=A: any call presenting the cursor and NOT returning a cursor-error signal — including empty batches — is a successful reuse) → fires a G.4-class escalation gate whose options are `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)`. Recommended default: `Continue degraded` — the operator learns the loop is degraded, nothing is silently absorbed. The counter resets on any successful cursor reuse. Per Q4=A: a *new* consecutive streak (after any successful reuse) is a *new* decision — the gate re-fires at count=2 again; `Continue degraded` is decide-once for the streak that raised it, not sticky for the session. Per Q3=D: the gate inherits the standing `AskUserQuestion` invocation contract — it blocks on the operator, no per-row timeout policy (auto mode automates transport, not judgment; timeout policy is a separate contract if it ever ships, per #402's home).

3. **Rewrite § step 5 ledger line to `<epic-ref> · cursor-recovery · <class> · <consecutive-count>`.** Per Q1=C: each ledger line carries its own class's consecutive count (a `resetFrom` line naturally reads as "first consecutive resetFrom" — `resetFrom · 1`), and only the `invalid-cursor` counter drives the escalation gate; the `resetFrom`/expiry/`discarded` counters are accounting only. Ledger lines survive across the whole run, so the run summary (§ L.6) can identify how many rounds ran degraded — SC-003 measurements must be able to exclude/flag degraded runs.

Also ship:

- **`408-1` (positive drift audit — FR-004/FR-005 shape)** added to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` in a new `describe("408 — auto.md § step 5 cursor-error class split + circuit breaker", …)` block. Parse the current `auto.md` § step 5 and assert: (a) the section body contains distinct branches for `invalid-cursor` and for `resetFrom`/expiry/`discarded` (structural check — both branch anchors present); (b) the escalation-gate contract is present with both options `Continue degraded (sweep-per-batch)` and `Stop (exit auto)` (structural check — both option strings present verbatim); (c) the ledger-line shape `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` is present (structural check — the four-column shape appears in a code span in § step 5). Fails loudly with the offending check(s).
- **`408-2` (negative-fixture regression)** — feed `tests/fixtures/408-drift-auto.md` (a checked-in minimal fixture reproducing the pre-fix § step 5 that recovers unconditionally with no class split and no escape) through the same audit; assert the specific expected failure is reported (e.g., `{file: "408-drift-auto.md", failure: "missing-class-split"}` or the equivalent structural failure). Positive-signal check that `408-1`'s structural logic isn't vacuous.
- **`packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md`** — minimal markdown fixture reproducing the pre-fix drift (~20-30 lines). Contains the top-level `## Instructions` heading + § step 5 as it stands today (all three signals converged onto one unconditional recovery path, no class split, no escalation gate, no consecutive-count ledger field). Follows the `398-drift-auto.md`/`402-drift-auto.md` shape and `<finding>-drift-<command>.md` naming pattern.

This is **playbook prose only + one test extension + one fixture** — no new CLI verb, no engine-side change, no runtime code change to `cockpit_await_events`, the tool-server side, or any `lib/*.ts` module in the plugin; no changes to `clarify.md`/`review.md`/`merge.md`/`queue.md`/`status.md`/`watch.md`. The scope explicitly excludes sibling playbooks — § step 5 (cursor recovery) lives in `auto.md` alone. Sequence this branch **after** generacy-ai/generacy#924 so the hardened error taxonomy the class split relies on is available (post-#924, `never-issued` reliably means caller bug — the taxonomy this fix's `invalid-cursor` branch anchors on).

This is the **cursor-recovery-contract analogue** of #402's harness-contract audit at a different playbook surface:

- **#402** closed a harness-contract gap: the playbook's implicit `AskUserQuestion` call-shape drifted from the harness's input-validation ceiling; the audit checks the top-level contract section exists, states the bound, and is referenced from every gate contract.
- **#408** closes a cursor-recovery-contract gap: the playbook's cursor-recovery path collapsed three distinct signal classes onto one unconditional recovery — with no circuit breaker on repeated occurrences; the audit checks § step 5 has the class split, both escalation-gate options, and the new ledger-line shape.

Same instruction-drift class (#384/#388/#390/#394/#396/#398/#400/#402/#403/#406), same fix shape (pin the rule at a single load-bearing surface + backstop with a structural audit the model cannot silently regress).

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at slash-command time; also parsed as text by the audit). TypeScript (Vitest) for the two new assertions.

**Primary Dependencies**: None new. Existing runtime: Claude Code slash-command executor + the seven `cockpit_*` MCP tools (in particular `cockpit_await_events` — the source of the three cursor-error signals). On the test side: Vitest — already a dev-dep in `packages/claude-plugin-cockpit/package.json` (introduced by #394, extended by #396/#398/#400/#402/#403/#406).

**Storage**: Filesystem — one file edited (`packages/claude-plugin-cockpit/commands/auto.md`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — appending a new `describe("408 — …")` block); one new fixture file (`packages/claude-plugin-cockpit/tests/fixtures/408-drift-auto.md`).

**Testing**:

- **Static** (necessary but proven insufficient by the #384–#406 arc — static-only fails at behavioral drift): grep for the exact substrings `invalid-cursor` and `resetFrom` on separate branches in § step 5 (positive anchors for the class split); grep for the exact option strings `Continue degraded (sweep-per-batch)` and `Stop (exit auto)` (positive anchors for the escalation gate); grep for the ledger-line shape `cursor-recovery · <class> · <consecutive-count>` (positive anchor for the new ledger shape); grep asserting the pre-fix "converge on the same recovery path" wording does NOT collapse `invalid-cursor` with `resetFrom`/expiry without a class-branching keyword (negative anchor). See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: two new assertions appended to `tests/playbook-verification.test.ts` in a new `describe("408 — auto.md § step 5 cursor-error class split + circuit breaker", …)` block:
  - **(408-1) — structural drift audit**: read `commands/auto.md`, parse § step 5, assert (a) both `invalid-cursor` and `resetFrom`/expiry/`discarded` appear on distinct branches (structural — two distinct dispatch anchors in step 5's body); (b) both escalation-gate option strings appear verbatim in step 5's body; (c) the four-column ledger shape appears in a code span. Structural — never regexes prose vocabulary like "class split" or "circuit breaker" (Q3=D-style rejection at #402 applied here: dialect-pinned prose regex false-negatives on future rewrites).
  - **(408-2) — negative-fixture regression**: feed `tests/fixtures/408-drift-auto.md` through the same audit and assert the specific `missing-class-split` (or `missing-escalation-options` / `missing-ledger-shape`) failure is reported. Positive-signal check that the audit's structural logic isn't vacuous.
- **True verifier**: a re-run of the cockpit v1.5 auto-mode integration smoke test on a corpus where the tool server has been made to return `invalid-cursor` on two consecutive `cockpit_await_events` calls (simulating the exact shape of finding #59's snappoll-1 fault). The auto session logs the typed error verbatim + writes `<epic-ref> · cursor-recovery · invalid-cursor · 1` on the first, then fires the G.4e escalation gate at the second — never a third silent sweep-per-batch cycle without operator input. Adherence is probabilistic; the corrected prose + audit backstop remove the class of failure by construction. Empirical confirmation across the T-S13 corpus (post-#924, per the sequencing constraint) is the true verifier (SC pattern parallel to #402's 0 harness-InputValidationError retries and #398's 0 CLI-contract-drift diagnosis-round-burns).

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard).

**Project Type**: Single-package playbook edit + suite extension + one fixture (one plugin package touched; no cross-package changes; no cross-repo changes to `tetrad-development` or `generacy` in this branch — the fix is at `auto.md`'s § step 5 prose, not at the cockpit MCP tool boundary the tool server owns).

**Performance Goals**: N/A (playbook adherence, not throughput). Adherence targets: 0 silent sweep-per-batch runs — every `invalid-cursor` streak of length ≥ 2 fires the G.4e escalation gate; 100% of § step 5 recoveries write a `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` ledger line; the L.6 run summary can identify degraded runs so SC-003 dispatch-round-reduction measurements can exclude them.

**Constraints**:

- **The fix lives at `auto.md` § step 5 only** (Q1 out-of-scope — this fix's target is § step 5's cursor-recovery path). No changes to steps 1–4 or step 6; no changes to `## Dispatch` D.1–D.11; no changes to `## Gate contract` G.1–G.5 other than adding the new G.4(e) subtype for the cursor-recovery escalation. G.4 already hosts subtypes (a)/(b)/(c)/(d) for validate-red, agent:error, unrecognized state, and merge-conflicts respectively — the new (e) subtype for cursor-recovery slots into the same table, following the existing G.4 shape (option list + one-sentence presentation block).
- **Per-class ledger counter, single-class escalation trigger** (Q1=C). The `<consecutive-count>` field of the `cursor-recovery · <class> · N` ledger line is per-class — a `resetFrom · 1` line reads naturally as "first consecutive resetFrom." Only the `invalid-cursor` counter drives the G.4e escalation gate; `resetFrom`, `expiry`, and `discarded` counters are ledger accounting only. This resolves the FR-006 / Story 3 tie (per Q1=C's reconciliation) and is strictly more informative than Q1=A (flat `resetFrom · 0` throws away the reset-churn signal the ledger is where it would first become visible).
- **"Successful cursor reuse" is any call that presents the cursor and does NOT return a cursor-error signal** (Q2=A). Empty batches count as success — the counter measures consecutive failures of the *cursor mechanism*; an accepted cursor returning zero events is the mechanism working perfectly on a quiet epic. Q2=B's "≥1-event required" was rejected because it makes streak state hostage to epic traffic (a low-traffic epic could carry a stale count across hours then false-escalate on a routine restart); Q2=C describes the same acceptance event as Q2=A phrased around the continuation token — Q2=A is the crisp form.
- **Gate blocks; no per-row timeout** (Q3=D). Every gate in `auto.md` blocks awaiting the operator — that's the load-bearing gate contract, and it's inherited unchanged. Q3=B ("timeout after N minutes to `Continue degraded`") was rejected because it is literally auto-approve-after-N-minutes, the autonomy policy the plan explicitly defers; Q3=C ("timeout to `Stop`") re-invents policy at this row rather than at the general contract; Q3=A ("block indefinitely") is what the standing gate contract already does. If timeout policy ever ships, it ships for all gates via the § AskUserQuestion invocation contract (#402's home for exactly this kind of rule), not as a fifth semantics unique to one row. The unattended-run worry inverts here: while the gate blocks, no recovery loop spins — a blocked gate is the *cheapest* state the degraded session can be in, and the pending question is the first thing a returning operator sees.
- **`Continue degraded` is decide-once for the streak that raised it; a new streak after a successful reuse re-fires the gate** (Q4=A). Once cursor reuse succeeds, the system observably healed — a subsequent 2-in-a-row streak is a distinct episode with possibly a distinct cause, and staying silent about it (Q4=B) would rebuild the exact silent-degradation hole this issue closes, just behind a one-time consent screen. The anti-nag property falls out of Q4=A's own definition: within one unhealed streak the gate never re-asks (decide-once holds), so re-fire frequency is bounded by actual heal-then-break cycles, not by batch count. Q4=C's bounded window (N successful reuses since the decision) adds a tunable with no principle behind the number.
- **Structural assertion over prose-sniffing** (per-#402's Q3=C precedent applied here). The audit checks: (a) both `invalid-cursor` and `resetFrom`/expiry/`discarded` appear on distinct branches in step 5's body, (b) both escalation-gate option strings appear verbatim, (c) the four-column ledger shape appears in a code span. It NEVER regexes the fusion vocabulary or the phrasing of "class split", "circuit breaker", "consecutive-fault". The exact failure mode #402's Q3=C rejected (dialect-pinned regex false-negatives on unanticipated wording) applies here identically.
- **The regression fixture is a checked-in markdown file** (per #398's Q4=A / #402's Q2=A precedent). Feeding `tests/fixtures/408-drift-auto.md` through the audit exercises the actual ingestion path (markdown file → text parser → structural check). Future drift regressions follow the `<finding>-drift-<command>.md` naming pattern and drop into the same fixtures directory without any test-file schema change.
- **Sequenced after generacy#924** (spec § Summary). Post-#924, `never-issued` reliably means caller bug; restarts/evictions classify as `discarded`/`resetFrom`. Before #924, the `invalid-cursor` typed error's `code`/`message`/`details` cannot reliably discriminate caller bugs from server-restart artifacts — and the class split's runtime semantics depend on that discrimination.
- **Scope boundary**: `auto.md` (§ step 5 body rewrite ~40-60 net changed lines + one new G.4(e) row + escalation-gate contract subtype ~20-30 net added lines + § Ledger action+outcome vocabulary row for `cursor-recovery` ~2-4 net added lines + § L.4 status table policy already covers escalation-gate presentations so no new surface added; total ~60-100 net changed lines), `tests/playbook-verification.test.ts` (~80-120 net added lines for `408-1` + `408-2` + step-5 parser helpers), `tests/fixtures/408-drift-auto.md` (~20-30 lines). Sibling playbook files (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) untouched. Sibling library files (`lib/reference-consumption.ts`, `lib/gate-vocabulary.ts`, `lib/clarification-batch-parser.ts`) untouched. Historical spec directories untouched.
- **No new invariant number**. Consistent with the no-§9 rule that follows #394/#396/#398/#400/#402 and the recent #403 addition of §8 (cost contract for ledger-only rows). The circuit-breaker rule lives inside § step 5's revised text and the audit's assertion, not at the invariants surface. If a future finding shows the invariants surface needs `9. Every consecutive invalid-cursor streak of length ≥ 2 fires an escalation gate`, that's a follow-up finding — this fix's shape is the § step 5 rewrite + G.4(e) subtype + cross-references from the existing surfaces (§ Ledger action+outcome vocabulary).

**Scale/Scope**: One file edited: `auto.md` (~60-100 net changed lines across § step 5 body + § Gate contract G.4 table row for subtype (e) + G.4(e) presentation block + § Ledger action+outcome vocabulary row for `cursor-recovery`). One file extended: `tests/playbook-verification.test.ts` (~80-120 net added lines for one new `describe("408 — …")` block with two assertions + fixture reads + step-5 section-parsing helpers). One new fixture file: `tests/fixtures/408-drift-auto.md` (~20-30 lines — pre-fix § step 5 with three-signal-converged wording, no class split). Zero files deleted, zero files renamed. No changes to `lib/reference-consumption.ts` (#394), `lib/gate-vocabulary.ts` (#396), `lib/clarification-batch-parser.ts` (#400), or `scripts/refresh-help-snapshots.sh` (#398).

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #406 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/408-found-during-cockpit-v1/
├── spec.md                                   # Feature spec (read-only)
├── clarifications.md                         # Q1–Q4 with resolved answers (read-only)
├── plan.md                                   # THIS FILE
├── research.md                               # Design decisions and rationale (Phase 0)
├── data-model.md                             # Structural model: pre/post § step 5 layout; per-class counter shape; G.4(e) gate; ledger row; fixture shape
├── quickstart.md                             # Verification runbook (static grep + Vitest suite + operator smoke-test one-liner)
├── contracts/
│   ├── step-5-shape.md                       # Contract: post-fix § step 5 body — two branches (`invalid-cursor` vs `resetFrom`/expiry/`discarded`), circuit breaker on `invalid-cursor` at count=2, per-class counter
│   ├── g4e-escalation-gate.md                # Contract: new G.4(e) subtype — options `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)`, presentation block, re-fire semantics
│   ├── ledger-line-shape.md                  # Contract: `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` ledger line — per-class counter, single-class escalation trigger
│   ├── drift-audit-assertion.md              # Contract: 408-1 structural audit (branches present + options present + ledger shape present) + 408-2 negative-fixture regression check
│   └── negative-fixture-shape.md             # Contract: tests/fixtures/408-drift-auto.md — minimal pre-fix § step 5 excerpt with three signals converged
├── checklists/                               # (empty — reserved for /checklist skill)
└── tasks.md                                  # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                               # MODIFIED — § step 5 body rewrite (class split + circuit breaker + ledger shape); § Gate contract table + G.4(e) presentation block; § Ledger action+outcome vocabulary row for cursor-recovery
│   ├── clarify.md                            # UNCHANGED — single-issue invocation; cursor recovery lives in auto.md § step 5 only
│   ├── merge.md                              # UNCHANGED — no cursor loop; out of scope
│   ├── queue.md                              # UNCHANGED — no cursor loop; out of scope
│   ├── review.md                             # UNCHANGED — no cursor loop; out of scope
│   ├── status.md                             # UNCHANGED — no cursor loop; out of scope
│   └── watch.md                              # UNCHANGED — pre-#406 process; retired; out of scope
├── lib/
│   ├── reference-consumption.ts              # UNCHANGED — created by #394
│   ├── gate-vocabulary.ts                    # UNCHANGED — created by #396
│   └── clarification-batch-parser.ts         # UNCHANGED — created by #400
├── scripts/
│   └── refresh-help-snapshots.sh             # UNCHANGED — created by #398
└── tests/
    ├── playbook-verification.test.ts         # EXTENDED — new describe("408 — …") block with 408-1 (structural drift audit) + 408-2 (negative-fixture regression)
    └── fixtures/
        ├── 394-*                             # UNCHANGED — created by #394
        ├── 396-*                             # UNCHANGED — created by #396
        ├── 398-drift-auto.md                 # UNCHANGED — created by #398
        ├── help-snapshots/                   # UNCHANGED — created by #398
        ├── 400-*                             # UNCHANGED — created by #400
        ├── 402-drift-auto.md                 # UNCHANGED — created by #402
        ├── 403-*                             # UNCHANGED — created by #403
        └── 408-drift-auto.md                 # NEW — minimal markdown fixture reproducing pre-fix drift (three cursor signals converged on one recovery path, no class split)
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md      # No cursor loop
├── merge.md        # No cursor loop
├── queue.md        # No cursor loop
├── review.md       # No cursor loop
├── status.md       # No cursor loop
└── watch.md        # Retired pre-#406
```

Historical artifacts (deliberately untouched):

```text
specs/384-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/396-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/398-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/400-operator-requested-ux/             # Status: Complete; byte-identical
specs/402-found-during-cockpit-v1/           # Status: Complete; byte-identical
specs/403-improvement-spec-from-cockpit/     # Status: Complete; byte-identical
specs/406-follow-up-generacy-ai/             # Status: Complete; byte-identical
```

**Structure Decision**: Single-package playbook edit + suite extension + one fixture. The "structure" is the internal layout of `auto.md` § step 5 (two branches replacing the three-signal converged path + one new G.4(e) escalation-gate subtype in § Gate contract + one new row in § Ledger action+outcome vocabulary) — see [data-model.md](./data-model.md) for the pre/post structural changes at each surface, the per-class counter's state model, the G.4(e) presentation block, and the audit-parser's input/output — plus the five contract files — see [contracts/](./contracts/) for the step-5 shape, the escalation-gate shape, the ledger-line shape, the audit assertion, and the negative-fixture shape.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (§ step 5 body rewrite + one new G.4(e) subtype row + one new ledger vocabulary row + one new test describe block with two assertions + one minimal fixture) and matches the fix scope named in the spec (class split + circuit breaker + ledger accounting + regression coverage). The design explicitly rejects:

- **Pure fail-loud on `invalid-cursor`** (spec § Fix contrasts this with pure fail-silent). #924 shows the `invalid-cursor` typed error can present from a server-restart artifact, not only from a caller bug — aborting a multi-hour run on the first `invalid-cursor` is a real cost. The class split lets the first `invalid-cursor` recover (log + ledger + sweep + re-arm) while the *second consecutive* fires the escalation gate — degradation becomes an operator decision without paying the whole-run-abort cost on a first occurrence.
- **Pure fail-silent (the pre-fix status quo)** (spec § Observed). Recovery per batch indefinitely with no escalation is the exact fail-silent shape the auto playbook family exists to abolish; unbounded silent degradation loses SC-003 (dispatch-round reduction is the MCP migration's whole point) and forces operator vigilance to be permanent.
- **Flat `resetFrom · 0` in the ledger** (Q1=A rejected). Throws away the reset-churn signal — a run with 3 consecutive `resetFrom` recoveries reads identically to a run with 3 spaced `resetFrom` recoveries, when the former is a symptom of an unrelated systematic fault (server-side rotation defect, epic-configuration mismatch) and the latter is routine. Q1=C's per-class count is strictly more informative at the same ledger cost.
- **All-class escalation** (Q1=B rejected in spirit — would rewrite FR-006 to escalate on any class's count reaching 2). Escalating on `resetFrom · 2` is noise (server-side event-log rotations are routine and the recovery path handles them idempotently); escalating on `expiry · 2` similarly reflects a low-traffic epic hitting cursor retention twice, not a systematic fault. Only `invalid-cursor` reflects a caller-vs-server-vs-configuration systematic defect that warrants operator attention.
- **≥1-event required for "successful reuse"** (Q2=B rejected). Makes streak state hostage to epic traffic — a low-traffic epic could carry a stale count across hours then false-escalate on a routine restart, the question's own warning realized.
- **Continuation-token round-trip required for "successful reuse"** (Q2=C rejected). Describes the same acceptance event as Q2=A phrased around the continuation token every non-error response carries; Q2=A is the crisp form of the same test and is easier to state in prose.
- **Timeout to `Continue degraded` after N minutes** (Q3=B rejected). Auto-approve-after-N-minutes is the autonomy policy the plan defers; if it ever ships, it ships for all gates via #402's § AskUserQuestion invocation contract, not as a fifth semantics unique to this row.
- **Timeout to `Stop` after N minutes** (Q3=C rejected). Re-invents policy at this row rather than at the general contract; same anti-pattern as Q3=B at the opposite end of the spectrum.
- **`Continue degraded` sticky for the whole session** (Q4=B rejected). Rebuilds the exact silent-degradation hole this issue closes, just behind a one-time consent screen — after healing and re-breaking, the loop again absorbs unbounded recovery silently, losing SC-003 measurement fidelity.
- **Bounded window (N successful reuses) before eligible to re-fire** (Q4=C rejected). Adds a tunable with no principle behind the number. Q4=A's "any successful reuse resets" is bounded by actual heal-then-break cycles, not by an arbitrary N.
- **Adding invariant §9 "Every consecutive invalid-cursor streak of length ≥ 2 fires an escalation gate"**. Rejected as scope creep. The rule already lives in § step 5's revised text and the audit's assertion; a numbered invariant would be a belt-and-suspenders duplicate — same anti-pattern the #384–#402 arc rejected. If future drift shows the `## Invariants` surface is needed, that's a follow-up finding.
- **Editing sibling playbooks to reference the class split**. Scope creep. Cursor recovery lives at `auto.md` § step 5 only; `clarify.md`/`review.md`/`merge.md`/`queue.md`/`status.md` have no cursor loop, and `watch.md` is retired (pre-#406). Adding cross-references at those files would create surfaces that drift for no reader benefit.
- **Fusion-phrase regex in the audit** (per #402's Q3=B rejection applied here). Content-sniffing on prose. Dialect-pinned to today's wording; false-negatives on any future author's alternative phrasing. Structural assertions (branch anchors + option strings + ledger-shape code span) are the discipline established by #398/#402.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q4 decisions with rationale (resolved in `clarifications.md`; research.md restates them as design decisions with alternatives-rejected + implementation patterns).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (pre/post layout of `auto.md` § step 5 + § Gate contract table row for G.4(e) + § Ledger action+outcome vocabulary row for `cursor-recovery`; per-class counter state model; G.4(e) presentation block; audit-parser input/output; negative fixture shape), [contracts/](./contracts/) (five contract files: step-5 shape, G.4(e) escalation gate, ledger-line shape, drift-audit assertion, negative-fixture shape), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + operator smoke-test one-liner).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Per-class ledger counter; only `invalid-cursor` counter drives escalation.** The `<consecutive-count>` field of the `cursor-recovery · <class> · N` ledger line is per-class — a `resetFrom · 1` line reads naturally as "first consecutive resetFrom." The `resetFrom`, `expiry`, and `discarded` counters are accounting only (they answer future finding questions about reset-churn or expiry-churn); the escalation gate fires only on the `invalid-cursor` counter reaching 2. This reconciles FR-006 with Story 3 SC #2 with the least rewrite and is strictly more informative than a flat `resetFrom · 0`. | Q1=C |
| D2 | **"Successful cursor reuse" is any call that presents the cursor and does NOT return a cursor-error signal — empty batches included.** The counter measures consecutive failures of the *cursor mechanism*; an accepted cursor returning zero events is the mechanism working perfectly on a quiet epic. Q2=B's "≥1 event" makes streak state hostage to epic traffic (false-escalation on a low-traffic epic after a routine restart, the question's own warning realized). Q2=C describes the same acceptance event as Q2=A phrased around the continuation token — Q2=A is the crisp form. | Q2=A |
| D3 | **Inherit the standing gate contract — the gate blocks on the operator; no per-row timeout policy.** Every gate in `auto.md` blocks awaiting the operator — that's the load-bearing gate contract, and it's inherited unchanged. Q3=B (timeout to `Continue degraded`) is literally auto-approve-after-N-minutes — the autonomy policy the plan explicitly defers. If timeout policy ever ships, it ships for all gates via the § AskUserQuestion invocation contract (#402's home for exactly this rule class), not as a fifth semantics unique to one row. The unattended-run worry inverts: while the gate blocks, no recovery loop spins — a blocked gate is the *cheapest* state the degraded session can be in. | Q3=D |
| D4 | **New streak after a successful reuse re-fires the gate at count=2 — `Continue degraded` is decide-once for the streak that raised it, not sticky for the session.** Once cursor reuse succeeds, the system observably healed; a subsequent streak is a distinct episode with possibly a distinct cause, and staying silent about it (Q4=B) rebuilds the silent-degradation hole behind a one-time consent screen. The anti-nag property falls out of Q4=A's definition (within one unhealed streak the gate never re-asks, decide-once holds). Q4=C's bounded window (N successful reuses) adds a tunable with no principle behind the number. | Q4=A |

## Verification Layering

Static (necessary but not sufficient — the #384–#406 experience proved static-only fails at behavioral defects):

- `commands/auto.md` § step 5's body contains both the exact substring `invalid-cursor` and one of `resetFrom` / `expiry` / `discarded` on *distinct branches* (positive anchors for the class split — presence in step 5's body, not in step 5's original converged list).
- `commands/auto.md` § step 5's body contains both option strings `Continue degraded (sweep-per-batch)` and `Stop (exit auto)` verbatim (positive anchors for the G.4(e) escalation gate).
- `commands/auto.md` § step 5's body contains a code span (inline `<code>` or fenced block) matching `cursor-recovery · <class> · <consecutive-count>` or the concrete-example equivalent `cursor-recovery · invalid-cursor · 1` (positive anchor for the new ledger-line shape).
- `commands/auto.md` § Gate contract table contains a G.4(e) row for cursor-recovery with the two options listed above (positive anchor for the G.4(e) inclusion in the contract table).
- `commands/auto.md` § Ledger action+outcome vocabulary contains a `cursor-recovery` action row (positive anchor for the new ledger vocabulary entry).
- `commands/auto.md` § step 5 does NOT contain the pre-fix "converge on the same recovery path" wording collapsed across all three signals without a class-branching keyword (negative anchor — the pre-fix wording that this fix removes).
- `tests/fixtures/408-drift-auto.md` exists and does NOT contain any of `Continue degraded (sweep-per-batch)`, `Stop (exit auto)`, or `cursor-recovery ·` (positive anchor for the negative fixture — the fixture must lack the class split, options, and ledger shape to be a valid drift reproduction).
- `commands/clarify.md`, `commands/review.md`, `commands/merge.md`, `commands/queue.md`, `commands/status.md`, `commands/watch.md` show zero changes on this branch.
- Historical spec directories show zero changes on this branch.
- `auto.md` `## Invariants` section shows zero net structural changes (no new §9).

Behavioral (evidence, not proof — two assertions appended to `tests/playbook-verification.test.ts` in a new `describe("408 — …")` block):

- **408-1 (structural drift audit)**: read `commands/auto.md`, parse § step 5's body via a helper that locates the H2 `## Instructions` block and the enumerated `5. Cursor recovery.` sub-heading (or its equivalent post-rewrite anchor), assert (a) both `invalid-cursor` and at least one of `resetFrom`/`expiry`/`discarded` appear on distinct branches (identified by a preceding bullet or paragraph break), (b) both `Continue degraded (sweep-per-batch)` and `Stop (exit auto)` appear verbatim in step 5's body, (c) the code-span pattern `cursor-recovery · <class> · <consecutive-count>` (or the concrete `cursor-recovery · invalid-cursor · 1` equivalent) appears in step 5's body. Fails loudly listing the missing check(s) and the offending step-5 body.
- **408-2 (negative-fixture regression)**: feed `tests/fixtures/408-drift-auto.md` through the same audit, assert the specific failure (e.g., `missing-class-split` or `missing-escalation-options` or `missing-ledger-shape`) is reported. Positive-signal check — guards against the audit silently degrading to no-op via a regex-scope bug or an unnoticed refactor.

True verifier:

- A re-run of the cockpit v1.5 auto-mode integration smoke test on a corpus where the tool server has been made to return `invalid-cursor` on two consecutive `cockpit_await_events` calls with no successful cursor reuse between them (the exact shape of finding #59's snappoll-1 fault). Post-fix, the auto session logs the typed error's `code`/`message`/`details` verbatim + writes `<epic-ref> · cursor-recovery · invalid-cursor · 1` on the first, sweeps + re-arms cursor-less, then on the second consecutive `invalid-cursor` writes `<epic-ref> · cursor-recovery · invalid-cursor · 2`, fires the G.4(e) escalation gate, and blocks awaiting the operator — never a third silent sweep-per-batch cycle. On a corpus where `resetFrom` occurs three times in succession (server-side event-log rotation), the loop recovers idempotently and writes `resetFrom · 1`, `resetFrom · 2`, `resetFrom · 3` ledger lines without ever firing the escalation gate — only the `invalid-cursor` counter triggers escalation. Adherence is probabilistic; the corrected prose + structural audit backstop remove the class of failure by construction. Empirical confirmation across the T-S13 corpus (post-#924, per the sequencing constraint) is the true verifier (SC pattern parallel to #402's 0 harness-InputValidationError retries under P-scale gate fanout and #398's 0 CLI-contract-drift diagnosis-round-burns).
