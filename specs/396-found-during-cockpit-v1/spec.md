# Feature Specification: Add `waiting-for:merge-conflicts` dispatch row and tighten D.10 so any unknown `waiting-for:*` label triggers escalation, not silent continue

**Branch**: `396-found-during-cockpit-v1` | **Date**: 2026-07-10 | **Status**: Draft

## Summary

Found during the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92), finding #45. Companion to the generacy dead-end-gate finding.

## Observed

All three P2 issues reached `waiting-for:merge-conflicts` (the #864 gate). The auto session's live-state re-check saw the label and reasoned:

> "workers resolving base-sync conflicts … worker-owned transient state, **not** one of the D.1–D.9 actionable dispatch classes, so no dispatch and no ledger line … Continuing to wait."

Both halves are wrong: no worker resolves that gate (nothing does — see the generacy finding), and a `waiting-for:*` gate is by protocol *operator-owned pending state*, not transient. The run stalled indefinitely with no gate, no ledger line, no escalation — a silent stall, which is exactly what D.10 exists to prevent, and D.10 didn't fire because the session classified the state as "known but not actionable" rather than "not dispatchable".

## Two fixes

1. **Add the missing dispatch row.** `waiting-for:merge-conflicts` → until the engine-side resolver ships: escalation gate (present the conflicted paths from the pause alert; options: "I've resolved it — advance the gate" / Skip / Stop, where advance = `cockpit advance --gate merge-conflicts` after the operator confirms the branch is pushed conflict-free). Once the engine handler exists: ledger-only, like `waiting-for:address-pr-feedback` (server-side owns it).
2. **Close the D.10 bypass.** Tighten the trigger wording so classification judgment can't route around the catch-all: *any* `waiting-for:*` label without a matching dispatch row IS an unrecognized state → D.10 escalation. "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` state unless the table explicitly names it ledger-only — the table is the exhaustive list of states the loop may ignore.

## Root cause

The observed session read the `waiting-for:merge-conflicts` label off `cockpit status --json` and reasoned as follows: it does not match any of the D.1–D.9 event strings; the D.10 trigger says "the re-check step reads a live state whose transition class is not one of D.1–D.9"; but the session classified the label as a *known* transient state that happens to lie outside the dispatch table (not an *unrecognized* one), and inferred a third silent-continue path that the playbook never wrote.

Two prompt-side defects made this reachable:

1. The dispatch table is incomplete. The engine emits `waiting-for:merge-conflicts` (the base-sync conflict pause gate — #864); no D.x row names it. D.9 sets the precedent that server-side-owned pending states get an explicit ledger-only row — the absence of a row for `waiting-for:merge-conflicts` reads to the session as "this state is not addressed here, treat it as background" rather than "this state is undocumented, escalate via D.10".
2. D.10's trigger sentence ("live state whose transition class is not one of D.1–D.9") is looser than the invariant it's supposed to enforce: it says nothing about `waiting-for:*` states specifically, so a session that classifies a `waiting-for:*` label as "known transient background" rather than "unrecognized class" can convince itself D.10 does not apply. The exhaustiveness intent — the dispatch table is the *only* list of states the loop may ignore, and everything else escalates — is not stated. "Wait for someone else to handle it" is a plausible-sounding dispatch outcome that the playbook never lists, and the session invented it.

Both defects are prompt-side; the fix is prompt-side.

## Fix

### Fix 1 — Add the `waiting-for:merge-conflicts` dispatch row

Add a row to the § Dispatch table between D.9 and D.10 (numbered D.11 to preserve D.10's role as the catch-all; row order in the human-facing table is: D.1–D.9 actionable, D.11 named-but-ledger-only-or-escalation, D.10 catch-all last):

```
| D.11 | `waiting-for:merge-conflicts` | Merge-conflict escalation gate ("I've resolved it — advance" / Skip / Stop). Until the engine-side resolver ships: escalation. Once it ships: ledger-only, like D.9. |
```

Add a full `### D.11 — waiting-for:merge-conflicts` section modelled on D.9's shape (server-side-owned pending state) fused with G.4's escalation shape, verbatim:

- **Trigger**: An issue enters `waiting-for:merge-conflicts` (base-sync produced conflicts on the PR branch — engine pause per #864). Verbatim event string: `waiting-for:merge-conflicts`.
- **Dispatch**: Fetch the pause-alert content (bot-authored comment on the PR/issue naming the conflicted paths). Present a merge-conflict escalation gate (new G.4 subtype (d)): presentation block including the conflicted paths verbatim + single `AskUserQuestion` with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Conflicts`, `multiSelect: false`.
- **Apply verdict**:
  - `I've resolved it — advance the gate` → `generacy cockpit advance --gate merge-conflicts <issue-ref>` (only after the operator confirms the branch is pushed conflict-free — the gate wording is verbatim so the operator's answer *is* the confirmation).
  - `Skip` → session-local mute; ledger line; continue.
  - `Stop` → kill watch; summary; exit.
- **Ledger line**: `<issue-ref> · waiting-for:merge-conflicts · merge-conflicts-gate · <advanced | skip (session-local mute) | stop (exit)>`.
- **Sunset clause** (inline, verbatim): "Once the engine-side resolver ships (companion generacy finding), this row degrades to ledger-only in the same shape as D.9 (`waiting-for:address-pr-feedback`) — no gate, no CLI verb, no subagent."

Add a new G.4 subtype (d) row to the § Gate contract table and the § Escalation gate presentation block, per the same pattern D.10 (subtype (c)) already uses.

Add the action + outcome vocabulary row for D.11 to the § Ledger vocabulary table.

### Fix 2 — Close the D.10 bypass so any unknown `waiting-for:*` label escalates

Tighten D.10's trigger sentence and § Dispatch section preamble so classification judgment cannot route around the catch-all. Two changes:

1. **D.10 trigger — verbatim replacement**: The current sentence ("The re-check step reads a live state whose transition class is not one of D.1–D.9") is replaced by:

   > "The re-check step reads a live state that is not addressed by any preceding dispatch row (D.1–D.11 — actionable classes plus explicitly named ledger-only / escalation classes). **Any `waiting-for:*` label whose exact token does not appear in a preceding dispatch row's Trigger sentence is an unrecognized state and dispatches here.** This includes states the session judges 'known but not actionable', 'worker-owned', 'transient', or 'someone else will handle it' — those judgments are never a permissible dispatch outcome; the dispatch table is the exhaustive list of states the loop may treat as no-ops, and every entry that is a no-op is named as one (see D.9)."

2. **§ Dispatch preamble — new verbatim sentence**: Add to the paragraph that opens § Dispatch (immediately after "The following … event classes are dispatched per this table"):

   > "The dispatch table is exhaustive. A live state that matches no row here is not 'background' or 'someone else's problem' — it is unrecognized, and D.10 owns it. A `waiting-for:*` label always maps to a row: to a named row if the token is listed, to D.10 if it is not. 'Wait for someone else to handle it' is not a permissible dispatch outcome unless the table explicitly names the state ledger-only (D.9 today, D.11 once the engine resolver ships)."

Both changes name the specific misclassification path the T-S5 session took (`worker-owned transient state`, `not one of the D.1–D.9 actionable dispatch classes, so no dispatch and no ledger line`) so a future session cannot re-derive it from the same wording gap — the anti-pattern-naming style used at #384 / #388 / #394.

### Fix 3 — Playbook audit invariant

Add to the § Invariants list a new numbered invariant (§8): **"Dispatch-table exhaustiveness."** Every `waiting-for:*` token in the engine's gate vocabulary (the label-protocol doc) appears in the § Dispatch table — as an explicit row (D.x with a named trigger) or as an explicit ledger-only row (D.9-shape). A `waiting-for:*` token that appears in the engine vocabulary but not in the dispatch table is a drift condition; the audit regression (below) is the drift check.

## Regression tests

Behavioural regression tests per the S6/S9 verification pattern already used for the #388/#390/#394 fixes:

- **Fixture 1 — `waiting-for:merge-conflicts` live-state reaches the escalation gate.** Feed a `cockpit status --json` fixture where an issue's transition class is `waiting-for:merge-conflicts`. Assert: the playbook reaches D.11's escalation gate (verbatim options: `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`); a ledger line is produced. **Never silent-continue** (the "no dispatch and no ledger line" outcome the T-S5 session took is an assertion failure).
- **Fixture 2 — novel `waiting-for:someday-gate` triggers D.10.** Feed a fixture with a `waiting-for:*` token that appears in no dispatch row. Assert: D.10 fires; the presentation block contains the observed state verbatim from the fixture (per D.10's presentation contract); a ledger line is produced with `action: unrecognized-state`.
- **Fixture 3 — playbook audit / drift check.** Enumerate every `waiting-for:*` token in the engine's gate vocabulary (the label-protocol doc); grep § Dispatch for each token; assert that every token appears as a Trigger in some D.x row. This is the drift check for §8's invariant, in the same shape as the gate-vocabulary audit already used for existing invariants.

Fixtures live under `packages/claude-plugin-cockpit/tests/fixtures/`; assertions are added to the existing playbook-verification suite where the #388/#390/#394 checks live (exact suite file named in `plan.md`). Executable verification only — no standalone `.md` regression file.

## User Stories

### US1: `waiting-for:merge-conflicts` reaches an escalation gate instead of silent-continue

**As a** cockpit operator running `/cockpit:auto <epic-ref>` on an epic whose PRs hit a base-sync merge conflict (the #864 engine pause gate),
**I want** the playbook to dispatch `waiting-for:merge-conflicts` to an explicit escalation gate that names the conflicted paths and asks me whether I've resolved them (`I've resolved it — advance the gate` / `Skip` / `Stop`),
**So that** the run cannot silently stall on this label the way it did on the T-S5 smoke test — no worker resolves this gate today (see the companion generacy finding), and a `waiting-for:*` label is by protocol operator-owned pending state, not worker-owned transient state.

**Acceptance Criteria**:
- [ ] § Dispatch table gains a D.11 row: `waiting-for:merge-conflicts` → merge-conflict escalation gate.
- [ ] A full `### D.11 — waiting-for:merge-conflicts` section is added with the verbatim trigger, dispatch steps, gate options, ledger line, and sunset clause specified in Fix 1 above.
- [ ] The escalation gate is a new G.4 subtype (d) with options exactly `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` — never Retry (nothing for the parent to retry; the operator's action is off-playbook).
- [ ] The `advance` verdict wording is verbatim so the operator's answer is itself the confirmation: choosing the option is a claim that the branch is pushed conflict-free.
- [ ] The dispatch row includes an inline sunset clause: once the engine-side resolver ships (companion generacy finding), the row degrades to ledger-only in the D.9 shape (`(no-op)` action, `server-side-owned` outcome). No gate, no CLI verb, no subagent.

### US2: The D.10 catch-all covers any unknown `waiting-for:*` label

**As a** future cockpit session running the auto playbook and encountering a `waiting-for:*` label whose token is not listed in § Dispatch,
**I want** the D.10 trigger wording to leave me no honest reading in which "worker-owned transient" or "someone else will handle it" is a permissible dispatch outcome — the dispatch table is the exhaustive list of states the loop may ignore, and every state I ignore must be explicitly named as ignored (D.9 today, D.11 once the engine resolver ships),
**So that** I cannot repeat the T-S5 mis-classification where the session invented a silent-continue outcome for a `waiting-for:*` label absent from the table.

**Acceptance Criteria**:
- [ ] D.10's trigger sentence is replaced verbatim by the wording in Fix 2 above: it names `waiting-for:*` labels specifically, names the "known-but-not-actionable" / "worker-owned" / "transient" / "someone else will handle it" misclassifications explicitly, and states that judgments of that class are never a permissible dispatch outcome.
- [ ] The § Dispatch section preamble gains the verbatim sentence in Fix 2 above stating dispatch-table exhaustiveness — a `waiting-for:*` label always maps to a row: a named row if listed, D.10 if not.
- [ ] The T-S5 misclassification path is named as the anti-pattern in the prose (matching the #384 / #388 / #394 pattern of naming the specific derivation the trigger must foreclose), so a future session reading the same trigger cannot re-derive it.
- [ ] The prose is placed inside the D.10 trigger and § Dispatch preamble, not in an appendix — at the read surface where the misclassification originated.

### US3: A playbook invariant records dispatch-table exhaustiveness

**As a** cockpit playbook maintainer,
**I want** the § Invariants list to record dispatch-table exhaustiveness as an invariant (§8), so that any future edit to the § Dispatch table that removes a row without also removing the corresponding engine label — or that adds an engine label without a corresponding dispatch row — is visibly inconsistent with an invariant,
**So that** drift between the engine's gate vocabulary and the playbook's dispatch table is caught at edit time by an invariants-list check, not discovered in a smoke test.

**Acceptance Criteria**:
- [ ] § Invariants list gains a new numbered invariant §8 ("Dispatch-table exhaustiveness") stating that every `waiting-for:*` token in the engine's gate vocabulary appears in the dispatch table, as either an explicit actionable row or an explicit ledger-only / escalation row.
- [ ] The invariant is co-located with the existing invariants (§1 "Never merge on red" / §7 "Stream consumption is unfiltered" from #394) in the same numbered list — a single reading surface, not split.
- [ ] The invariant text names the observed T-S5 stall as the failure mode it prevents so its purpose is visible in the invariants list itself.

### US4: A behavioural regression asserts the two fixes and the drift check

**As a** cockpit playbook maintainer,
**I want** three executable regression fixtures per the S6/S9 verification pattern already used for prior cockpit findings — (1) `waiting-for:merge-conflicts` reaches the D.11 gate, (2) a novel `waiting-for:someday-gate` reaches D.10, (3) an audit that every engine `waiting-for:*` token appears as a dispatch trigger,
**So that** a future edit that removes the D.11 row, loosens the D.10 trigger, or introduces a new engine `waiting-for:*` label without adding a dispatch row cannot ship without the regression flagging it.

**Acceptance Criteria**:
- [ ] Fixture 1 (`waiting-for:merge-conflicts` → D.11 escalation gate) exists under `packages/claude-plugin-cockpit/tests/fixtures/` and asserts: the playbook reaches D.11's escalation gate with the exact three-option surface, and produces a ledger line. Silent-continue (no gate + no ledger line) is an assertion failure.
- [ ] Fixture 2 (novel `waiting-for:someday-gate` → D.10) exists in the same directory and asserts: D.10 fires, the presentation block contains the fixture's state verbatim, and a ledger line is produced with `action: unrecognized-state`.
- [ ] Fixture 3 (drift check) enumerates every `waiting-for:*` token in the engine's gate vocabulary and asserts each appears as a Trigger in some § Dispatch row. Failure mode is a named diff (`missing dispatch row for waiting-for:<x>`).
- [ ] Assertions are added to the existing playbook-verification suite (where the #388/#390/#394 checks live — exact suite file named in `plan.md`); a new suite is created only if the existing home is genuinely absent. Executable verification only — no standalone `.md` regression file.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch table gains a new row D.11 for `waiting-for:merge-conflicts`. Row wording is verbatim per Fix 1 above: `waiting-for:merge-conflicts` → Merge-conflict escalation gate ("I've resolved it — advance" / Skip / Stop). Until the engine-side resolver ships: escalation. Once it ships: ledger-only, like D.9. | P1 | Row is numbered D.11 (not slotted between D.9 and D.10) so D.10 remains the catch-all in numeric terms; visual order in the table places D.11 immediately after D.9 (named-but-non-actionable rows grouped) with D.10 last. |
| FR-002 | A full `### D.11 — waiting-for:merge-conflicts` section is added with: verbatim trigger sentence, fetch step (pause-alert content — bot-authored comment naming conflicted paths), gate presentation (conflicted paths verbatim), gate options (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`), post-gate mechanism sentences, and ledger line format `<issue-ref> · waiting-for:merge-conflicts · merge-conflicts-gate · <advanced \| skip (session-local mute) \| stop (exit)>`. | P1 | Section shape mirrors D.7's structure (gate + verdict + ledger). The `advance` wording is verbatim so the operator's answer *is* the confirmation. |
| FR-003 | The § Gate contract table (G.1–G.5) gains a fourth escalation subtype: G.4 (d) "merge-conflict escalation" with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`. The § G.4 escalation-gate presentation block gains a `(d) Merge-conflicts` sub-block modelled on `(c) Unrecognized state` — presentation includes the conflicted paths verbatim from the pause alert. | P1 | Uses the same gate machinery as G.4 (a)/(b)/(c); no new gate type introduced, only a new subtype. |
| FR-004 | The § Ledger action + outcome vocabulary table gains a D.11 row: `D.11 merge-conflicts` → `<action>` = `merge-conflicts-gate` / `<outcome>` = `advanced`, `skip (session-local mute)`, `stop (exit)`. | P1 | Preserves the grep-recipe reliability contract at the vocabulary surface. |
| FR-005 | The D.11 section carries an inline sunset clause verbatim: "Once the engine-side resolver ships (companion generacy finding), this row degrades to ledger-only in the same shape as D.9 (`waiting-for:address-pr-feedback`) — no gate, no CLI verb, no subagent. Ledger action becomes `(no-op)`, outcome becomes `server-side-owned`." | P1 | The row is not marked "temporary" in a way that risks removal; the sunset clause is *inside* the row so the future edit is a well-scoped one-liner. |
| FR-006 | D.10's Trigger sentence is replaced verbatim by the wording specified in Fix 2 above. The new sentence: (a) states that D.10 catches any live state not addressed by a preceding dispatch row (D.1–D.11), (b) names `waiting-for:*` labels specifically — any `waiting-for:*` label whose exact token does not appear in a preceding row's Trigger sentence dispatches here, (c) enumerates the misclassifications the trigger must foreclose (`known but not actionable`, `worker-owned`, `transient`, `someone else will handle it`), and (d) states that judgments of that class are never a permissible dispatch outcome — the dispatch table is the exhaustive list of states the loop may treat as no-ops, and every no-op is explicitly named as one (see D.9). | P1 | Naming the specific mis-derivations is the #384 / #388 / #394 anti-pattern-naming style; vague "handle unknowns" prose has been shown to lose to plausible improvisations. |
| FR-007 | The § Dispatch section preamble gains a verbatim sentence: "The dispatch table is exhaustive. A live state that matches no row here is not 'background' or 'someone else's problem' — it is unrecognized, and D.10 owns it. A `waiting-for:*` label always maps to a row: to a named row if the token is listed, to D.10 if it is not. 'Wait for someone else to handle it' is not a permissible dispatch outcome unless the table explicitly names the state ledger-only (D.9 today, D.11 once the engine resolver ships)." | P1 | Placed at the § Dispatch preamble so a session that reads only the section header still encounters the exhaustiveness invariant before scanning individual rows. |
| FR-008 | § Invariants list gains a new numbered invariant §8: "**Dispatch-table exhaustiveness.** Every `waiting-for:*` token in the engine's gate vocabulary appears in the § Dispatch table — as an actionable row, an escalation row, or an explicit ledger-only row. A `waiting-for:*` token in the engine vocabulary that has no dispatch row is a drift condition, caught by the § Regression tests audit." | P1 | Places the exhaustiveness rule at the invariants surface too, so future edits that drift from it are visibly inconsistent with an invariant. |
| FR-009 | A behavioural regression fixture asserts `waiting-for:merge-conflicts` live-state reaches D.11's escalation gate (verbatim three-option surface) and produces a ledger line. Silent-continue (no gate + no ledger line) — the T-S5 outcome — is an assertion failure. Fixture lives under `packages/claude-plugin-cockpit/tests/fixtures/`. | P1 | This is the primary regression: it fails without Fix 1 and fails without Fix 2. |
| FR-010 | A behavioural regression fixture asserts a novel `waiting-for:someday-gate` live-state reaches D.10, that the presentation block contains the fixture's observed state verbatim (per D.10's existing presentation contract), and that a ledger line is produced with `<action>` = `unrecognized-state`. Fixture lives under `packages/claude-plugin-cockpit/tests/fixtures/`. | P1 | This is the D.10-bypass regression: it fails if D.10's trigger is loosened again in the future. |
| FR-011 | A behavioural audit regression enumerates every `waiting-for:*` token in the engine's gate vocabulary (the label-protocol doc), greps § Dispatch for each token, and asserts each appears as a Trigger in some D.x row. Failure mode is a diff naming the missing token(s) (`missing dispatch row for waiting-for:<x>`). | P1 | This is the drift check for §8's invariant, in the same shape as the gate-vocabulary audit style already used for prior cockpit findings. |
| FR-012 | Regression assertions are added to the **existing** playbook-verification suite where the #388/#390/#394 checks live (the exact suite file is named in `plan.md` rather than guessed here). A new suite is created only if the existing home is genuinely absent. Executable verification only — no standalone `.md` regression file. | P1 | Matches #394's regression-location decision (Q3 clarification) verbatim. |
| FR-013 | The change touches `packages/claude-plugin-cockpit/commands/auto.md` only. Sibling cockpit playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) are out of scope; a one-line PR-description assessment confirms none of them dispatch on `waiting-for:*` labels in a shape that would drift from Fix 2. | P1 | Scoped to the observed defect surface. |
| FR-014 | The observed T-S5 evidence (three P2 issues stalled on `waiting-for:merge-conflicts` for the duration of the smoke test with no gate and no ledger line) is referenced in a one-line issue-history footnote in the same paragraph as FR-001's D.11 row, cross-linking to #396 and to the companion generacy dead-end-gate finding. Prior recurrences of the "instruction gap → improvisation" pattern (#384 Terminal Outcome Check, #388 fusion, #394 stream consumption) are named as the class of failure this is an instance of. | P2 | Matches the #390 / #394 approach of naming the class inside the fix prose so future readers recognize the mechanism, not just the specific bug. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Silent stall on `waiting-for:merge-conflicts` | Zero occurrences of the T-S5 pattern (label observed → no gate → no ledger line → continue) across a replayed corpus of `/cockpit:auto` sessions | Manual review of curated `/cockpit:auto` transcripts replayed against the FR-009 fixture; grep transcripts for the silence gap in the presence of the label. |
| SC-002 | D.11 escalation gate reaches the operator | The FR-009 fixture reaches the D.11 gate with the exact three-option surface (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`) and produces a ledger line | Behavioural test on the FR-009 fixture. |
| SC-003 | D.10 catches a novel `waiting-for:*` token | The FR-010 fixture reaches D.10; the presentation contains the observed state verbatim; a ledger line with `<action>` = `unrecognized-state` is produced | Behavioural test on the FR-010 fixture. |
| SC-004 | Dispatch-table drift audit passes | Every `waiting-for:*` token in the engine's gate vocabulary (label-protocol doc) appears as a Trigger in some § Dispatch row of `auto.md` | Behavioural test on the FR-011 audit fixture. |
| SC-005 | D.10 trigger wording is present | `auto.md` D.10 Trigger contains the four required clauses (catches unaddressed live state; names `waiting-for:*` specifically; enumerates the misclassifications; states judgments of that class are never permissible dispatch outcomes) | Static grep of `auto.md` D.10 section. |
| SC-006 | Exhaustiveness preamble is present | The § Dispatch preamble contains the verbatim sentence from FR-007 | Static grep of `auto.md` § Dispatch header paragraph. |
| SC-007 | Invariant §8 is present and consistent with D.10 | The § Invariants list contains invariant §8 ("Dispatch-table exhaustiveness"); its wording is consistent with D.10's trigger and the § Dispatch preamble | Static reading; cross-check the three locations for verbatim consistency. |
| SC-008 | No third prompt-strengthening round | The change adds D.11 + one D.10 trigger rewrite + one preamble sentence + one invariant + three regression fixtures — nothing more. No belt-and-suspenders extra clauses, no new gate types beyond G.4 (d), no new label-writing paths | Diff review of `auto.md`: the fix is one row, one trigger rewrite, one preamble sentence, one invariant, and three fixtures. |
| SC-009 | Sibling playbooks confirmed uninfluenced | A one-line PR-description assessment records that `clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md` do not dispatch on `waiting-for:*` labels in a shape that would drift from Fix 2 | Grep sibling playbooks for `waiting-for:` dispatch patterns; record result in the PR body. |
| SC-010 | Ledger surface — additive only | The § Ledger section grows by exactly one row (D.11) in the action + outcome vocabulary table; no other rows are edited; no format change to the ledger line shape | `git diff` on § Ledger shows one added row and no other changes. |

## Assumptions

- The T-S5 evidence is accurate: three P2 issues reached `waiting-for:merge-conflicts`; the session did not dispatch them; no ledger line was written for any of them; the session's stated reasoning was verbatim as quoted ("workers resolving base-sync conflicts … worker-owned transient state, not one of the D.1–D.9 actionable dispatch classes, so no dispatch and no ledger line … Continuing to wait.").
- `waiting-for:merge-conflicts` is the current engine-side label for the base-sync conflict pause gate (#864). This label is what `cockpit status --json` and `cockpit watch` emit today; no rename is pending on the engine side within the scope of this fix.
- No worker resolves `waiting-for:merge-conflicts` today — the companion generacy dead-end-gate finding names this. The playbook must therefore route the label to an operator-owned escalation, not to a worker-dispatched action. The engine-side resolver is a separate change (filed in generacy) that this fix does not depend on.
- The pause alert (bot-authored comment on the PR or issue) contains the conflicted paths in a form the playbook can present verbatim in the D.11 gate presentation. If the alert shape is not machine-parseable to a path list, the whole alert body is presented verbatim (fallback identical to G.4 (b)'s "evidence" presentation).
- `generacy cockpit advance --gate merge-conflicts <issue-ref>` is the canonical advance verb once the operator has resolved the conflict and pushed a conflict-free branch. If the engine side names this verb differently at the time the fix ships, the D.11 dispatch step uses the verb the engine emits; the verbatim advance-option label in the gate wording remains "I've resolved it — advance the gate" regardless of the verb name.
- The engine's gate vocabulary — the source of truth for FR-011's audit fixture — is the label-protocol doc (canonical location in tetrad-development, referenced elsewhere in the plugin). If a token appears in engine emissions but not in the label-protocol doc, the audit uses engine emissions as the source of truth for that run; a drift between engine and doc is out of scope for this fix.
- The startup sweep (step 3) and live-state re-check (step 4a) are already idempotent per the L.5 rule; the D.11 gate can be re-presented if the operator does not click through the first time, and re-presentation cannot produce duplicate action (the label persists until `advance` runs).
- The § Gate contract table already lists three G.4 subtypes; adding a fourth (d) is additive and preserves the exhaustive "four gate types" framing at the § Gate contract paragraph (four *types*, five subtypes across G.4).
- The existing playbook-verification suite lives under `packages/claude-plugin-cockpit/tests/` and is where the #388/#390/#394 assertions were added; the exact filename is named in `plan.md` rather than guessed here.

## Out of Scope

- Any engine-side change to how `waiting-for:merge-conflicts` is entered, held, or exited. The companion generacy dead-end-gate finding is filed separately; this fix works against the label as shipped today.
- Adding a worker-side resolver for merge conflicts. The D.11 dispatch is operator-owned by design (until the engine resolver ships, at which point D.11 sunsets to ledger-only per FR-005).
- Renaming any existing D.1–D.10 dispatch row or reshuffling their numbering. D.11 is added; D.10 remains the catch-all.
- Changing the § Ledger format sentence, the persistence rule, the epic-ref-slug rule, or the timestamp format. This is a table-addition + trigger-rewrite change, not a ledger redesign.
- Changing the § Gate contract's exhaustive "four gate types" framing. G.4 gains a subtype (d); it does not become a fifth gate type.
- Auto-advance on any gate. Every gate still prompts (invariant §6). The D.11 gate is not exempt; the operator's answer is the confirmation.
- A runtime probe or telemetry counter for dispatch-table drift. The FR-011 audit *is* the probe; a separate metric is not introduced.
- A fixer subagent or bounded-repair path for merge conflicts. The conflict is off-playbook by construction (operator's git workflow); no analysis subagent is warranted.
- Retrofitting an escalation gate for any `waiting-for:*` label other than `waiting-for:merge-conflicts`. Fix 2 catches unknown labels via D.10 by construction; adding an explicit escalation row for each future label is done one-off as each label is added on the engine side.
- Sibling cockpit playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`). A one-line PR-description assessment records that none of them dispatch on `waiting-for:*` labels today.
- Retroactively re-running past `/cockpit:auto` sessions to re-dispatch labels that were silent-stalled. The fix applies forward; the T-S5 corpus is evidence, not a retroactive target.

---

*Generated by speckit*
