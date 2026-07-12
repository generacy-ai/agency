# Clarifications: D.7 repeat-failure dispatch must fetch fresh evidence

## Batch 1 — 2026-07-12

### Q1: Trigger scope — what counts as a "repeat" of the same failure
**Context**: FR-001 scopes the new rule to "the second-and-subsequent trigger of the same `agent:error` / `failed:*` state on the same issue within one auto session." This has two moving parts that both need pinning: (a) does "same state" require the same `failed:<subtype>` (e.g., `failed:validate` → `failed:validate`), or does any `failed:*` on that issue count once one has already been dispatched? (b) does "one auto session" mean one continuous `auto` command invocation only, or does the session-mute set and diagnosis-subagent state persist across an operator's Stop → restart? The incident that motivated this spec was two `failed:validate` events on the same issue in one contiguous session, so both readings fit the incident equally well — the trigger set differs everywhere else.
**Question**: Which pair of readings does the repeat-dispatch rule use?
**Options**:
- A: Per-issue AND per-subtype AND per contiguous invocation — a `failed:validate` → `failed:build` on the same issue is a fresh first-dispatch; a Stop → restart resets first-vs-repeat state.
- B: Per-issue (any `failed:*` or `agent:error`) AND per contiguous invocation — any second failure-class event on the same issue in one auto invocation is a repeat, regardless of subtype; Stop → restart resets.
- C: Per-issue AND per-subtype AND across restarts within the same epic run — subtype must match, but the parent recovers first-vs-repeat state from ledger inspection so a Stop → restart still recognizes a repeat.
- D: Per-issue (any `failed:*` or `agent:error`) AND across restarts — any second failure event on the same issue is a repeat forever within the epic's active auto sessions.

**Answer**: *Pending*

---

### Q2: `failure_class_changed` — evaluation rule
**Context**: US2 AC #3 lists three dimensions the subagent inspects — classifier reason, error taxonomy, and the failing test/step — but does not fix the boolean combinator. Two subagents given the same two alerts can legitimately reach opposite verdicts if one uses "any-of-three differs → true" and the other uses "all-of-three must differ → true", and the test-writing for FR-005 / SC-002 needs a single rule. A second gap: "differs" itself is undefined (exact string, normalized, semantic), and the first two dimensions come from engine-authored fields (#915 classifier reason and taxonomy) whose surface form is stable — the failing test/step is free-text from the CI log.
**Question**: How does the subagent compute `failure_class_changed` from the fresh vs prior alert evidence?
**Options**:
- A: Any-of-three differs → `true`. `classifier_reason` compared by exact string match (engine-authored, stable); `error_taxonomy` compared by exact string match; `failing_test/step` compared by exact string match after trimming whitespace. Any one differing dimension yields `true`.
- B: Any-of-three differs → `true`, but `failing_test/step` uses a "canonical test identifier" derived by the subagent (e.g., a test-runner-agnostic `<file>::<name>`) rather than raw line text — reason and taxonomy still exact-match.
- C: All-of-three must differ → `true`. Any single matching dimension yields `false` — reserving `true` for the case that all three shift together, treating single-dimension shifts as "same class, different instance."
- D: Classifier reason alone is authoritative (engine-owned, stable, always present in #915). Taxonomy and failing test/step become supporting evidence in the verdict text but do not enter the boolean — `failure_class_changed = (fresh.classifier_reason != prior.classifier_reason)`.

**Answer**: *Pending*

---

### Q3: Comparison basis for a third-and-subsequent dispatch
**Context**: FR-001 covers "second-and-subsequent" repeat dispatches, and FR-005 requires `failure_class_changed` on all of them. On a third dispatch (Requeue → fail → Requeue → fail), the subagent needs to know *what* the current alert is being compared against — the immediately-prior failure (last one it just diagnosed) or the original first-dispatch failure (baseline). Different answers change what the operator sees at the gate: an alternating class-A → class-B → class-A pattern would show "changed / changed" under prior-comparison but "changed / unchanged" under first-comparison, and only one of those two is the story the operator needs to make the Requeue/Skip/Stop call.
**Question**: What does the subagent compare against on the N-th dispatch (N ≥ 3)?
**Options**:
- A: Compare fresh evidence against the *immediately-prior* failure only. `failure_class_changed` answers "did the last Requeue change anything?" — one prior comparison per dispatch, cheapest for the subagent, and matches the operator's per-decision framing (each gate decides on one Requeue).
- B: Compare fresh evidence against the *original first-dispatch* failure only. `failure_class_changed` answers "have we moved off the starting failure class at all?" — stable baseline, but silent about the immediately-prior Requeue's effect.
- C: Both — extend the verdict schema to `failure_class_changed_since_prior: boolean` AND `failure_class_changed_since_first: boolean`, presented as two rows at the gate.
- D: Compare against the immediately-prior failure, but expose in the verdict text (not the boolean) a running list of the failure classes seen so far in this session so the operator can spot cycles.

**Answer**: *Pending*

---

### Q4: Continuation vs fresh spawn when the prior subagent is no longer active
**Context**: Assumption 2 in the spec ("the auto-mode parent continues to use SendMessage to continue the existing diagnosis subagent across repeat failures — context reuse is right") assumes the first-dispatch subagent is still alive at repeat-dispatch time. Subagents *return* — by design, a diagnosis subagent that produces its verdict has done its job, and there is no guarantee it is still in a state where SendMessage will re-engage it (particularly across a several-minutes-long Requeue window). US2 AC #1 says the continuation prompt shape is "prior-context reference (subagent already holds it) + verbatim new alert body" — but if there is no held context, that shape doesn't apply. The spec never says what happens in that case.
**Question**: When the parent needs to dispatch a repeat D.7 but the first-dispatch diagnosis subagent is no longer active (already returned / disposed), what does the parent do?
**Options**:
- A: Spawn a fresh diagnosis subagent using the first-dispatch invocation shape, but with a prompt containing **both** the fresh alert body AND the prior alert body verbatim (no parent-authored summary of either). `failure_class_changed` is computed by the fresh subagent from the two evidences it now holds — the repeat-path evidence rule (no parent characterization) still holds.
- B: Spawn a fresh diagnosis subagent as if this were a first dispatch (fresh alert only, no prior context), and set `failure_class_changed = null` in the verdict schema to signal "no baseline available." The gate presentation renders `Failure class: unknown (no prior verdict retained)`.
- C: The parent MUST keep the first-dispatch subagent alive across the Requeue window (design constraint on the parent), so this case does not arise. If it does, that is a session bug and the parent aborts D.7 with a ledger `error` line.
- D: Persist first-dispatch verdicts (root_cause / evidence / classifier_reason / taxonomy / failing_test-step) in the session ledger; on a repeat with no live subagent, the parent reads the prior verdict from the ledger and hands it to a fresh subagent as prior evidence alongside the fresh alert — no parent characterization added.

**Answer**: *Pending*

---

### Q5: Playbook-verification suite location and negative-fixture format
**Context**: FR-008 requires the playbook-verification suite to assert the repeat-dispatch evidence-fetch requirement and the no-parent-characterization rule; FR-009 requires a negative fixture that "flags" a D.7 variant which passes a similarity assertion instead of evidence. These are positive/negative regression tests, but the suite's home and the shape of a "flagged" negative outcome are unspecified — the tasks/implement phases need to know where the fixtures live and how the harness asserts on playbook prose (grep? structured markdown parse? something else?), and whether "flagged" means the suite fails or the suite emits a warning.
**Question**: Where does the playbook-verification suite live, and what does "the negative fixture is flagged" mean in test-outcome terms?
**Options**:
- A: The suite is an existing suite in this repo (identify at plan time by grepping for `playbook-verification` in `packages/claude-plugin-cockpit`); the positive fixture is a passing test, the negative fixture is a FAILING test that documents the anti-pattern (i.e., the negative fixture is expected-to-fail and its failure message is the flag).
- B: The suite is new for this feature — add a small verification harness under `packages/claude-plugin-cockpit/tests/` that parses `auto.md` for the D.7 subsection headings and asserts on presence/absence of specific phrases; positive fixture passes, negative fixture is a *separate variant file* the harness explicitly rejects with a named error.
- C: The suite is the general playbook-verification checks run in `packages/claude-plugin-cockpit`'s existing test target (whatever `pnpm test` resolves to there); both fixtures are ordinary tests — positive passes on the shipped `auto.md`, negative uses a fixture file with the anti-pattern and asserts the checker rejects it.
- D: Out of scope for spec-level clarification — resolve at plan time by inspecting the current test layout in `packages/claude-plugin-cockpit`; FR-008/FR-009 stand as intent.

**Answer**: *Pending*
