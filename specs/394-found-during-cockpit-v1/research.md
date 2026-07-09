# Research: Pin auto.md event-consumption to unfiltered reads + liveness cross-check

**Feature**: 394-found-during-cockpit-v1
**Date**: 2026-07-09

This document restates the Q1–Q4 decisions taken in `clarifications.md` as design conclusions, records the alternatives considered, and captures the sources of evidence that motivated the fix.

---

## R1. Primary problem statement

**Decision**: `auto.md` step 4 ("Main loop") prescribes *"For each event line from the watcher"* but names **no consumption mechanism**. The T-S4 session improvised the reasonable-looking `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` shape to arm a stream monitor that required a matching pattern. Per-issue transition events carry the legacy envelope (`ts`/`repo`/`kind`/`number`/`event`/`labels`) and have **no `type` field**; only S8 synthetic aggregates (`phase-complete`/`epic-complete`) do. The filter therefore delivered exactly 1 of 17 lines and silently dropped every real event. The session dispatched none of them for several minutes until the operator intervened.

The fix is **structural on three surfaces**: (1) pin the consumption recipe verbatim in step 4 (with an inline schema-heterogeneity rationale, so a future session cannot re-derive the same "reasonable" filter from the same under-specified prompt); (2) codify the rule at the invariants-list surface as a new §7; (3) add a liveness cross-check to step 5 that catches the same class of silent-outage bug by the loop itself rather than by an operator noticing the session sitting idle for minutes. Plus a **behavioral regression** whose absence would let a future edit silently re-introduce the filter or remove the cross-check.

**Rationale**: The instruction-gap → improvisation pattern is the same class as #384 (Terminal Outcome Check) and #388 (fused analysis+prompt), but in the *mechanism* gap rather than the *instruction* gap. #384/#388/#390 closed the drift class at the **review gate**; #394 closes the drift class at the **main loop**. Live evidence — T-S4 first live run of `/cockpit:auto christrudelpw/sniplink#1`, one issue at a time:

- Startup: flawless. Pre-flight, ledger created, P1 detected complete, `phase-complete` startup event → phase-queue gate → operator approved → P2 queued (4 issues), ledger line written.
- Main loop: **17 NDJSON lines produced by `cockpit watch`** (confirmed in the background output file), all four P2 issues reached `waiting-for:clarification`, session dispatched **zero** of them for several minutes.
- The improvised filter (`grep '"type"'`) delivered exactly 1 line: the S8 aggregate. The 16 per-issue transitions had no `type` field and were silently dropped.
- Operator remediation: instruct the session to re-arm its monitor unfiltered and re-run the startup sweep. The four `waiting-for:clarification` states dispatched from live state (step 3 idempotency), no events lost.

Diagnostic: this is a **playbook gap** where the "how to consume the stream" specification was missing. The session's improvisation was reasonable given the missing spec; any future session with the same missing spec would re-derive the same failure. Adding the rule to just step 4 is necessary but not sufficient — an invariant at §7 makes a future edit's drift visibly inconsistent, and a liveness cross-check catches the class of silent-outage bug that any future improvisation might reintroduce.

**Alternatives rejected**:
- **Just amend step 4 prose without an invariant.** Rejected: matches the #384 pattern of adding rules that later get lost among other steps. §7 gives the rule invariants-list surface adjacent to §1 "Never merge on red" — a future editor drifting from the rule creates a visible inconsistency between two documented invariants.
- **Just amend step 4 without a liveness cross-check.** Rejected: prompt-side rules are probabilistic. Two prompt-strengthening rounds against the same pattern at the same review gate (#384, #388) both got defeated. A structural loop-side check catches the class of failure by construction.
- **Just add a liveness cross-check without pinning the recipe.** Rejected: leaves the primary trigger (under-specified step 4) in place; a future run would still improvise the filter and silently drop events; the cross-check would fire ~2 min later and re-run step 3 — recovery works, but the operator experiences a 2-minute silent stall on every run, which is a bad steady state.
- **A runtime probe** (e.g., a network hop to detect the missing prompt). Rejected as out of scope by construction — the liveness cross-check *is* the probe.

**Sources**:
- `spec.md` § Observed, § Root cause, § Fix.
- `clarifications.md` Q1–Q4.
- generacy-ai/tetrad-development#92 finding #38 (the observed T-S4 incident) — first finding of the T-S4 run.
- Prior issues: agency#384 (Terminal Outcome Check), agency#388 (fused analysis+prompt), agency#390 (subagent isolation).
- Companion engine finding filed in generacy (uniform `type` discriminator on every event line) — out of scope for this fix; the playbook must work against the shape shipped today.

---

## R2. Liveness threshold value + poll semantics

**Decision (Q1=B)**: **30-second per-iteration bounded read** on step 4; the cross-check fires after **N=4** consecutive empty returns (~2 minutes of silence). Cross-check remains **compound**: the trigger is silence AND `cockpit status --json` showing at least one issue in a D.1–D.9 actionable transition class. The status call happens **only at the threshold**, not on every empty read.

**Rationale**: The 30s bound mirrors the watcher's own poll cadence — the natural granularity for "how long is normal before something happens?" 2 minutes is far above normal event latency (typical dispatch cycle is seconds; longer implement stretches produce no user-observable events on the stream). Compound trigger avoids false positives during long implement stretches: silence alone is normal; silence *plus* an actionable state in `cockpit status --json` is not. The status call at the threshold (not per empty read) preserves the invariant that live-state re-check is authoritative (step 4a) while keeping the check cheap.

Wall-clock and opportunistic alternatives (Q1=A, Q1=C) are disqualified by the observed bug itself: a broken reader generates no wake-ups, so any check tied to "seconds since last event" or "runs when the loop wakes for another reason" *never runs at all* — permanent blindness is exactly what we observed. Only a per-iteration bounded read gives the loop a self-scheduled wake-up whose observability doesn't depend on events arriving.

**Alternatives rejected**:
- **A: Wall-clock threshold (60s / 120s since last consumed line).** Rejected: a broken reader has no scheduling; the wall-clock check never fires because the loop is stuck in `read`. This is exactly the T-S4 failure mode.
- **C: Elapsed-time check on other loop wake-ups.** Rejected for the same reason: the loop is not waking up. An opportunistic check that runs "whenever the loop wakes for any reason" runs zero times when the reader is dead.

---

## R3. "Non-empty line" definition

**Decision (Q2=B)**: Trim leading/trailing whitespace, then non-empty. Whitespace-only lines are dropped as **line-framing hygiene** (they carry no information); everything else — **including malformed or truncated JSON** — is consumed as an event and triggers the step 4a live-state re-check, which absorbs it safely. Content-shape heuristics (must-start-with-`{`, valid-JSON parse, `type` present, etc.) are **prohibited**.

**Rationale**: The core invariant is **under-delivery is silent loop death**; content-shape heuristics are the same failure class as the T-S4 `grep '"type"'` filter, dressed differently. A truncated flush would fail a "must start with `{`" check and be dropped silently — under-delivery — the failure class this fix exists to kill. Whitespace-only lines, by contrast, carry no information; treating them as events would dilute the "every line is an event" contract without adding coverage. Trim-then-nonempty is the minimum discipline that preserves signal without smuggling content filtering back in.

**Alternatives rejected**:
- **A: Strict byte-length > 0.** Rejected: whitespace-only trailing lines from buffered flushes would be treated as events. Not a correctness bug (step 4a absorbs the extra re-check), but dilutes the contract.
- **C: `{`-prefix / valid-JSON parse heuristic.** Rejected: it *is* a content-shape filter — the exact class this fix exists to prohibit. A truncated flush fails the heuristic and is dropped silently.

---

## R4. FR-007 regression test location

**Decision (Q3=C)**: Fixtures live under `packages/claude-plugin-cockpit/tests/fixtures/`. Assertions are added to a **new** Vitest suite at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — the "existing playbook-verification suite where the #388/#390 checks live" turns out to be aspirational. The #388 and #390 features shipped **static grep checks documented in `quickstart.md`** and **replayed-transcript behavioral evidence** — not an executable suite. Q3's "Only if it is genuinely absent, create a new suite file alongside the plugin's existing test layout" fallback applies.

**Rationale**: A standalone `.md` regression file (Q3=A) is not executable verification; a future edit that silently regressed the behavior would parse the `.md` cleanly. A new Vitest suite scaffold, seeded with the two 394 assertions, both satisfies FR-007 today and creates the executable-verification home the spec assumed already existed. Future features may retroactively migrate #388/#390 static-grep checks into this suite (out of scope for #394).

**Alternatives rejected**:
- **A: New standalone `.md` regression file** colocated with `auto.md`. Rejected: not executable; a future edit silently regressing the behavior would still parse the file.
- **B: Append to an existing S6/S9 regression file.** Rejected: no such existing file identifiable in the plugin package; the spec's assumption is unfounded.

---

## R5. Liveness cross-check and "no new recovery machinery"

**Decision (Q4=A)**: **Detection machinery is in scope**; FR-005's "no new recovery machinery" constrains the **recovery path only**, which stays exactly re-arm (step 5) + startup sweep (step 3). The 30s bounded read + N=4 empty-read counter is the **only new detection mechanism admitted**, and it is a hard requirement of FR-004 (a dead reader cannot event-drive its own diagnosis).

**Rationale**: The apparent conflict between FR-004 (detect no events for N intervals) and FR-005 (no new recovery machinery) dissolves once stated plainly: *some* clock is a hard requirement of any observability of "no events for N intervals" — the current event-driven step 4 loop cannot observe this without a clock. That clock is Q1=B's bounded read; it is a detection primitive, not recovery. Recovery (what to do when detection fires) stays entirely within shipped, idempotent surfaces: re-arm + startup sweep.

Both recovery surfaces are already idempotent per the L.5 rule (startup sweep + live-state re-check); re-running step 3 as part of the cross-check's recovery cannot introduce duplicate action because the live-state re-check catches state that has already moved on. This is the same idempotency guarantee that makes step 5's watch-death re-spawn safe.

**Alternatives rejected**:
- **B: Detection reuses existing signals only.** Rejected: the exact failure mode is a reader with no wake-ups; opportunistic detection tied to "when the loop wakes for another reason" is formally the observed bug.
- **C: Explicitly out of scope for step 4, but a minimal timer counts as part of the cross-check itself.** Rejected: the timer *has to* live in step 4 because that's where the read happens; hiding it as part of the cross-check's implementation would just be a labeling exercise.

---

## R6. Invariant §7 addition

**Decision (FR-009)**: Add invariant §7 "**Stream consumption is unfiltered.** Every non-empty line from `cockpit watch` is an event; content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field."

**Rationale**: Codifying the rule at the invariants-list surface (where §1 "Never merge on red" already lives) puts it on the greppable spec surface a future editor is most likely to check when authoring or modifying any consumer of an event stream. A future edit to step 4 that would drift from the rule creates a visible inconsistency with a numbered invariant — not just a subtle prose regression. This is the belt-and-suspenders analogue of #388's "MUST NOT print raw JSON" retention: a structural rule pinned at the invariants surface even after the primary trigger is removed by the pinned step 4 recipe.

**Alternatives rejected**:
- **Omit the invariant, rely on step 4 prose alone.** Rejected: matches the #384 pattern of adding rules that later get lost among steps. The invariant surface is where a future editor will look first.
- **Add a second invariant for the liveness cross-check.** Rejected: SC-007 explicitly prohibits belt-and-suspenders; the cross-check is a mechanism, not a rule the reader needs to memorize. The rule is "unfiltered consumption"; the cross-check is defense-in-depth.

---

## R7. Scope containment

**Decision (FR-008 / SC-008)**: The change touches `packages/claude-plugin-cockpit/commands/auto.md` and three new files under `packages/claude-plugin-cockpit/tests/`. Sibling cockpit playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) are out of scope; a one-line PR-body assessment records that none of them consume a stream in the same shape today (`watch.md` produces the stream but does not consume it — `auto.md` is the sole consumer).

**Rationale**: This fix is scoped to the observed defect. `auto.md` is the only cockpit command that consumes a `cockpit watch` stream today; sibling playbooks do not exhibit the anti-pattern (no stream consumption at all). Expanding scope invites regressions in files unrelated to the observed defect and inflates a bugfix into a plugin-wide refactor. The invariant §7 amendment binds future cockpit-command authors uniformly by governance — if a sibling later grows a stream consumer, it will pick up the rule at the invariants surface without needing a preemptive edit here.

**Alternatives rejected**:
- **Audit and preemptively pin unfiltered-read discipline in every cockpit playbook.** Rejected: no sibling consumes a stream today; the observed defect is scoped to the one command that does.
- **Add a plugin-level lint / CI check that fails on `grep '"type"'` patterns in `auto.md`.** Rejected: no lint runtime exists in this package today; introducing one is a separate feature. The static greps in `quickstart.md` + the Vitest suite together cover the concern for #394.

---

## R8. Verification method

**Decision (SC-001 through SC-009)**: Both static AND behavioral, with an honest epistemic note (same layering as #388 / #390):

- **Static** (necessary but proven insufficient by #384/#388/#390 — text presence does not entail behavior):
  - Step 4 contains the "unfiltered" phrasing (greppable anchor); the T-S4 anti-pattern name **exactly once, in a prohibition context** (SC-003); the sanctioned `.+` pattern; the 30s bounded-read directive.
  - Step 5 contains the "Liveness cross-check" sub-step heading with the three named preconditions and the recovery path; the N=4 threshold verbatim (SC-004).
  - Invariants section contains §7 "Stream consumption is unfiltered." verbatim (SC-006).
  - Sibling playbooks show zero changes on this branch (SC-008).
  - § Ledger section byte-identical (or consistency-only edits) (SC-009).
- **Behavioral** (Vitest suite, evidence-not-proof):
  - Feeding `394-mixed-event-shapes.ndjson` through the consumption reference asserts both event shapes reach the (mocked) dispatch table (SC-002).
  - With an empty stream + `394-actionable-live-state.json` + alive process, the liveness cross-check fires (SC-005) after exactly N=4 empty reads.
- **True verifier**: continued live `/cockpit:auto <epic-ref>` usage on the T-S4 corpus that triggered #394 (SC-001). The pinned recipe removes the class of failure by construction; the liveness cross-check is defense-in-depth; confirmation is empirical.

**Rationale**: Static-only is proven insufficient by #384's history (text was present; behavior failed). Behavioral-only skips a cheap first line of defense against future editors accidentally reintroducing the anti-pattern. Both is honest. The Vitest suite verifies a **reference implementation of the rule** — not the model's own inference at runtime — which is what "executable verification of a playbook rule" can mean.

**Alternatives rejected**:
- **Static only.** Rejected: proven insufficient by #384's history.
- **Behavioral only.** Rejected: static grep is a cheap first line of defense; skipping it invites drift.

---

## Implementation patterns

- **Structural pinning of an under-specified mechanism**: when a step names an outcome (`for each event line`) but not the mechanism, the improvisation surface is the failure surface. The pattern generalizes — any step that says "for each X" and doesn't say "obtained by <specific mechanism>, filtered by <specific predicate>, bounded by <specific timeout>" is an instruction-decay attack surface.
- **Compound trigger for defense-in-depth checks**: the liveness cross-check fires only on silence AND actionable state, not on silence alone. The compound predicate rejects the two natural false-positive classes (long implement stretches with no events; genuinely idle epics with no work to do).
- **Detection vs recovery separation at the FR level**: FR-004 admits new detection machinery; FR-005 forbids new recovery machinery. This separation prevents the "no new recovery" phrase from smuggling a "no observation of state" prohibition into a fix that needs to observe state to work.
- **Belt-and-suspenders on the invariants list**: adding an invariant even after the primary rule is pinned in a step (the same principle as #388/#390's retained "MUST NOT print raw JSON" clause). Structural fixes do not preclude retained inline enforcement.
- **Executable verification for prose rules**: for a playbook whose runtime is a model, "executable verification" is a reference implementation of the rule under Vitest — not the model itself. This is a form of contract test, not a behavioral trace of Claude Code.
- **Naming the anti-pattern exactly once, in a prohibition context**: matches the #384/#388/#390 pattern of removing the plausibility of a future improvisation by anchoring the rejection to a specific string. Vague "don't filter" prose has been shown (by #384's history) to lose to plausible improvisations.

## Key sources / references

- `spec.md` (this directory) — the current specification.
- `clarifications.md` (this directory) — Q1–Q4 with resolved answers.
- `packages/claude-plugin-cockpit/commands/auto.md` — target file for the step 4 / step 5 / invariants edits.
- `packages/claude-plugin-cockpit/tests/` — new directory for fixtures and the Vitest suite (see `contracts/unfiltered-stream-consumption.md` for the shape).
- Prior issues: agency#384 (Terminal Outcome Check), agency#388 (fused analysis+prompt), agency#390 (subagent isolation).
- Incident: generacy-ai/tetrad-development#92 finding #38 (T-S4 first live run of `/cockpit:auto christrudelpw/sniplink#1`).
- Companion engine finding (out of repo, out of scope for #394): uniform `type` discriminator on every event line — filed in generacy.
