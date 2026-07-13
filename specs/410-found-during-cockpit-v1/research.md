# Research: #410 — `auto.md` D.7 repeat-failure dispatch fresh-evidence rule + verdict-schema `failure_class_changed` + `failure_classes_seen` running list

Phase 0 restatement of the Q1–Q5 decisions from [clarifications.md](./clarifications.md) as design decisions with alternatives-rejected and rationale. Each decision is anchored in a directly-observed T-S13 constraint (finding #62 in tetrad-development#92 on snappoll-1 run 11), a directly-observed pre-existing surface-drift, or the resolved-precedent shape of #398/#402/#403/#406/#408; none is aesthetic.

## Framing: what shape of fix is this?

The observed failure is a **diagnosis-evidence-contract drift**, not a mechanism gap or a subagent-behavior gap:

- The auto session **received** two consecutive `failed:validate` events on the same issue in one contiguous session (mechanism worked — the tool server correctly reported both failures with their #915 alert bodies as engine-marked comments on the issue).
- The parent correctly recognized D.7 dispatch was needed on both events.
- On the **first** dispatch, the parent correctly called `cockpit_context(issue=<issue-ref>)`, correctly spawned a diagnosis subagent with the fresh evidence, and the subagent correctly identified the stale-base `npm ci` EUSAGE root cause (fork pre-scaffold).
- On the **repeat** dispatch (Requeue → `failed:validate` again within ~90s), the parent's dispatch skipped the evidence-fetch step entirely: *"Rather than re-run full diagnosis, I'll continue the two existing diagnosis subagents with the new fact (**requeue failed identically**)"*.
- The parent's SendMessage to the existing subagents contained "failed identically" **as fact**. Both subagents returned Skip verdicts built on that fact ("requeue can't fix the stale base; needs an out-of-band branch sync").
- Ground truth (from the fresh #915 reason-bearing alerts the parent never fetched): the failures had **changed class entirely**. The requeue had *worked* (the #914 base-merge brought the scaffold in and `npm ci` passed), and the new failures were two distinct in-branch defects (#3: `@prisma/client` missing from the epic's dependency plan; #4: a source-guard test tripped by the implementation's own doc comment).
- The verdicts, their confidence labels, and the escalation-gate presentation were all built on an unverified premise. The operator was steered toward Skip (which would have wedged P1 and the epic) when the actual remedies were a one-line dependency addition and a comment reword. The misdiagnosis was caught only by out-of-band operator review of the alert comments.

No mechanism gap (both alert bodies existed as engine-marked comments on the issue, addressable via `cockpit_context`). No subagent-behavior gap (both subagents correctly acted on the evidence they were given — the problem was that the evidence they were given was the parent's assertion of similarity, not the fresh alert body). The gap is at the *diagnosis-evidence contract*: `auto.md` D.7's evidence contract covers only the **first** dispatch (parent fetches the engine bundle → spawns diagnosis subagent) and is silent on the **repeat-failure** path. The session's continuation pattern (SendMessage to the existing subagent) is architecturally correct — context reuse is exactly right — but the continuation prompt carried the parent's *conclusion* ("identical") instead of *evidence*.

Similarity between two failures is a determination only evidence can support: the engine now ships classifier reasons and output tails in every alert (#915) precisely so this comparison never has to be guessed. Parent-authored summaries of evidence violate the loop-trust-boundary principle at a new surface — previously enforced at engine-to-parent and parent-to-subagent boundaries; the finding extends the principle to parent-to-continuing-subagent as well.

The fix has the same shape as #384/#388/#390/#394/#396/#398/#400/#402/#403/#408 (instruction-drift class): pin the rule at a single load-bearing surface (D.7 step 1's revised body with first-vs-repeat sub-path split; step 2's revised verdict-schema addendum), add a G.4(b) presentation-block sixth-element row, and backstop with a structural audit the model cannot silently regress (assertion 410-1 checks the sub-path split, the two verdict-schema fields, the G.4(b) row, and the no-parent-characterization rule; assertion 410-2 checks the audit isn't vacuous via a checked-in negative fixture).

## R1 — Trigger scope: per-issue, any failure class, per contiguous invocation (Q1=B)

**Decision**: A D.7 event is a **repeat dispatch** iff it is the second-and-subsequent `agent:error` / `failed:*` event on the same issue within one contiguous auto invocation, regardless of the specific subtype. A `failed:validate` → `failed:build` shift on the same issue is a repeat (the repeat sub-path fires). A `failed:validate` on one issue, then a `failed:validate` on a different issue, is two first-dispatches (each issue has its own first-vs-repeat state). A `failed:validate` → Stop → restart → `failed:validate` is two first-dispatches (session restart resets first-vs-repeat state).

**Rationale**: The repeat rule's payload is "hand the subagent prior evidence and compute the delta" — and that comparison is informative whenever *any* prior failure exists on the issue, subtype match or not. A `failed:validate` → `failed:implement` shift is itself high-signal evidence of movement: something changed between the runs; the operator needs to know whether the Requeue moved the fault forward (subtype shift often indicates progress: an earlier phase succeeded, the fault moved to a later phase) or whether it moved backward (rare, but real). Throwing that context away by requiring subtype match (Q1=A) would defeat the fix at exactly the moments the story got interesting.

On restart semantics: per-contiguous-invocation is the established grain — session mutes, cursors, and sweep state are all session-local by prior decisions (#406 Q2's whole argument). A restart's startup sweep does a fresh first-dispatch with fresh evidence, which is *safe by construction* against this spec's failure mode (assumed similarity can't happen when there's no assumption — the fresh evidence-fetch is unconditional on first dispatch). Q1=C/D (across restarts) buy cross-restart memory at the cost of ledger-as-database reconstruction machinery the restart-is-fresh design deliberately avoids: to detect a repeat across a restart, the parent would need to read ledger lines from the prior session, classify them as prior-failure evidence, then hand them to the fresh subagent. That's the same ledger-as-database anti-pattern #408's Q1=A rejected.

The alternatives:

- **Q1=A (per-issue AND per-subtype AND per contiguous invocation)**: Throws away high-signal context. A `failed:validate` → `failed:implement` shift is precisely the kind of movement the repeat sub-path exists to expose ("did the last Requeue change anything?"); requiring subtype match makes the repeat sub-path fire only on the *least* informative repeat class (same subtype twice in a row).
- **Q1=C (per-issue AND per-subtype AND across restarts within same epic run)**: The ledger-as-database anti-pattern. To distinguish first-vs-repeat across a restart, the parent reconstructs prior state from the ledger — a workflow the restart-is-fresh design explicitly rejects. Plus, it doesn't fix the subtype-match limitation of Q1=A.
- **Q1=D (per-issue AND any failure class AND across restarts)**: Same ledger-as-database anti-pattern as Q1=C, with the same cost profile and none of Q1=A's limitations. Rejected on the restart-is-fresh axis alone.

Q1=B is the correct-shape reconciliation: any second failure on the same issue in one invocation is a repeat (matching the "any prior failure exists" informativeness rule), and restart resets state (matching the restart-is-fresh convention).

**Load-bearing property**: The first-vs-repeat trigger classification is what determines which sub-path in D.7 step 1 fires. Post-fix, an issue's second `failed:*` in one session triggers the repeat sub-path, which fetches fresh evidence unconditionally and hands both alert bodies to the subagent without parent characterization. The scope decision must be broad enough to catch any repeat that would benefit from delta comparison (Q1=A misses subtype shifts), and narrow enough to avoid ledger reconstruction (Q1=C/D fail this test).

**Alternatives rejected in-line above**: Q1=A, Q1=C, Q1=D.

## R2 — `failure_class_changed` computation: any-of-three, canonical test identifier, absent-vs-present differs (Q2=B)

**Decision**: The diagnosis subagent computes `failure_class_changed = true` iff *any* of the following three dimensions differs between the fresh alert and the immediately-prior alert:

1. **`classifier_reason`** — engine-authored (post-#915), compared by exact string match on the field's value. Absent-vs-present counts as differing (an alert with no `classifier_reason` differs from an alert with one).
2. **`error_taxonomy`** — engine-authored (post-#915), compared by exact string match. Absent-vs-present differs.
3. **`failing_test/step`** — free-text from the CI log; the subagent derives a **canonical test identifier** (test-runner-agnostic `<file>::<name>` for test failures; equivalent stable identifier for non-test failing steps) and compares by exact string match on the canonical form. Absent-vs-present differs.

The first two dimensions are engine-authored fields whose surface form is stable — exact-match is the right test. The third dimension is derived from CI log free-text — canonicalization to `<file>::<name>` compares identity, not formatting, which defends against line-number and duration drift across runs of the same failure.

**Rationale**: US2 AC #3 lists three dimensions the subagent inspects but does not fix the boolean combinator. Two subagents given the same two alerts can legitimately reach opposite verdicts if one uses "any-of-three differs → true" and the other uses "all-of-three must differ → true", and the test-writing for FR-005 / SC-002 needs a single rule. A second gap: "differs" itself is undefined (exact string, normalized, semantic), and the failing test/step comes from CI log free-text whose surface form is unstable.

The alternatives:

- **Q2=A (any-of-three differs → true, all three compared by raw exact-string match, failing_test/step compared as raw line text)**: Raw failing-step line text drifts across runs of the *same* failure — line numbers change with unrelated edits, durations vary run-to-run, temp workspace paths differ per run. Under Q2=A, two runs of the same identical `t/foo.test.ts::it fails on empty input` failure would produce `failure_class_changed = true` on a duration or line-number drift alone. That's the false-positive shape the field's whole purpose contradicts.
- **Q2=C (all-of-three must differ → true)**: Backwards. A single-dimension shift is usually the signal, not noise. This option reserves `true` for the case that all three shift together, treating single-dimension shifts as "same class, different instance" — which is exactly the pre-fix behavior this fix abolishes (all three of run 11's `failed:validate` events had `same failing_test/step` per pre-#914 vs post-#914 layouts, but different `classifier_reason` because the underlying defect shifted; under Q2=C, that would yield `failure_class_changed = false`, missing the whole point).
- **Q2=D (classifier reason alone is authoritative)**: Disqualified by the motivating incident itself. Both of run 11's failures were *process* failures (exit 1). #915 deliberately gives process paths no `classifier_reason` — the field is reserved for structured taxonomy-mapped failures. Under Q2=D, `failure_class_changed` for npm-ci-EUSAGE → vitest-prisma-failure evaluates over two absent fields (both `null`) and misses the exact change this field exists to expose. The taxonomy field (dimension 2) *would* have distinguished them, and the canonical failing-test identifier (dimension 3) *would* have distinguished them — but Q2=D silences both.

Q2=B is the only option that (a) supports the informative single-dimension shift case (any-of-three), (b) defends against raw-text drift on the failing-step dimension (canonical identifier), and (c) reliably distinguishes process failures where dimension 1 is absent (dimensions 2 and 3 fill in).

**Load-bearing property**: The `failure_class_changed` field's value determines the G.4(b) presentation-block row and — indirectly — the operator's recommendation calculus. A changed class after a Requeue usually means the requeue *made progress* (the incident's Skip recommendations inverted this). The computation rule must reliably distinguish "class changed" from "same class, different instance"; Q2=B's structure does both.

**Precedent match**: The "primary property, not derived property" rule is the same principle #396's declared-vocabulary fix used at the classification surface (classify by the vocabulary the taxonomy declares, not by inferred sub-tokens) and #408's Q2=A "successful reuse is the cursor mechanism working, not dispatch traffic" applied at the counter-reset surface. Q2=B is the equivalent at the failure-class comparison surface: compare identity, not formatting.

**Alternatives rejected in-line above**: Q2=A, Q2=C, Q2=D.

## R3 — Comparison basis for N-th dispatch (N ≥ 3): immediately-prior + running list in verdict text (Q3=D)

**Decision**: On the N-th dispatch (N ≥ 3), `failure_class_changed` compares the fresh alert against the *immediately-prior* alert only (not the original first-dispatch alert). The verdict's `failure_classes_seen` field carries a running list of classifier identifiers observed across this issue's repeat dispatches in the current session, appended on each repeat dispatch. The G.4(b) presentation renders the running list as a human-readable "classes this session: `<class1>` → `<class2>` → `<class3>` …" line so cycles like A → B → A are visible at gate time.

**Rationale**: FR-001 covers "second-and-subsequent" repeat dispatches, and FR-005 requires `failure_class_changed` on all of them. On a third dispatch (Requeue → fail → Requeue → fail), the subagent needs to know *what* the current alert is being compared against. Different answers change what the operator sees at the gate: an alternating A → B → A pattern would show "changed / changed" under prior-comparison but "changed / unchanged" under first-comparison, and only one of those two is the story the operator needs to make the Requeue/Skip/Stop call.

The alternatives:

- **Q3=A (immediately-prior only, no running list)**: `failure_class_changed` answers "did the last Requeue change anything?" — the per-decision question. Cheapest for the subagent. But it silently loses cycle detection: an A → B → A pattern shows "changed / changed" and the operator has no direct signal that this is a cycle. The operator would have to remember earlier session history to spot the cycle, which is the same anti-pattern the field addresses at the prior-vs-current comparison level.
- **Q3=B (original first-dispatch baseline only)**: Silent about the immediately-prior Requeue's effect. An A → B → A pattern shows "changed / unchanged" — hiding the fact that the last Requeue *did* change something (A → B was progress; B → A was regression). Q3=B optimizes for a stable baseline at the cost of losing the per-Requeue signal the operator is actually deciding on.
- **Q3=C (both — extend the verdict schema to two booleans: `failure_class_changed_since_prior` and `failure_class_changed_since_first`, presented as two rows)**: Complete but forces the operator to do arithmetic at gate time. `since_first=false, since_prior=true` = …a cycle? every reader does that decoding. And two rows dilute the gate's headline — the operator's decision is per-Requeue, and the per-Requeue signal should be the primary field. Two booleans is a low-density encoding of information that's already in the running list.

Q3=D is the composition: one schema field with per-decision semantics (immediately-prior comparison — matches the operator's framing), history as evidence text (running list, human-readable, cycle-visible-in-one-line). Fields for decisions, prose for context. This is a cleaner architecture than Q3=C: the boolean is the gate's headline; the running list is the gate's context.

**Load-bearing property**: The `failure_class_changed` field's semantics must match the operator's decision framing. Each G.4(b) gate presentation asks the operator to decide on *this* Requeue (Requeue / Skip / Stop), not on the whole session's trajectory. So the boolean answers "did the last Requeue change anything?" — that's Q3=A/D. The running list is a strictly-more-informative Q3=A: same headline signal, plus cycle visibility.

**Precedent match**: Same shape as #408's Q3=D "inherit the standing gate contract" — decisions live at their natural home (the boolean lives with per-decision framing; the standing contract lives at #402's contract surface). #410's Q3=D applies the same "one home per rule" principle to the failure-class comparison: per-decision field + evidence-text history, not two-field arithmetic.

**Alternatives rejected in-line above**: Q3=A (running-list omission), Q3=B, Q3=C.

## R4 — Continuation-miss: fresh spawn with both alert bodies verbatim (Q4=A)

**Decision**: When the parent needs to dispatch a repeat D.7 but the first-dispatch diagnosis subagent is no longer active (already returned / disposed), the parent spawns a fresh diagnosis subagent using the first-dispatch invocation shape, but with a prompt containing **both** the fresh alert body AND the prior alert body verbatim. No parent-authored summary of either. `failure_class_changed` is computed by the fresh subagent from the two evidences it now holds — the repeat-path evidence rule (no parent characterization) still holds.

**Rationale**: The premise that matters: the prior *evidence* is never actually lost when the subagent dies — failure alerts are persistent engine-marked comments on the issue. So the parent's job on a continuation-miss is pure transport: fetch the prior alert (identified mechanically as the previous failure-alert comment on the issue, no characterization involved) and the fresh one, hand both to a fresh subagent, which computes `failure_class_changed` from evidence it now holds.

The alternatives:

- **Q4=B (spawn fresh as if first dispatch; set `failure_class_changed = null` for "no baseline available")**: Declares a baseline "unavailable" that's sitting on the issue in plain sight. The G.4(b) presentation would render "Failure class: unknown (no prior verdict retained)" — a false statement, since the prior alert is fully retrievable. Q4=B optimizes for the wrong constraint (subagent lifetime) at the cost of a false operator-facing signal.
- **Q4=C (parent MUST keep the first-dispatch subagent alive across the Requeue window; if it doesn't, abort D.7)**: Legislates against harness reality. Subagents return by design (they've done their job when they've produced a verdict); several-minute Requeue windows guarantee this case arises routinely. Converting a routine condition into an abort is a policy failure. Also, even if the parent *could* keep the subagent alive, that's a hidden dependency on harness internals that shouldn't drive the diagnosis-evidence contract.
- **Q4=D (persist first-dispatch verdicts in the session ledger; on a continuation-miss, read the prior verdict from the ledger and hand it to a fresh subagent as prior evidence alongside the fresh alert; no parent characterization added)**: Feeds prior *verdict* instead of prior *evidence*. Conclusions in place of evidence is a diluted form of the exact sin this spec abolishes — the whole fix is about "the parent MUST NOT characterize the failure; the subagent MUST see the evidence". A prior verdict is a distilled parent-mediated characterization (the subagent authored it, but the parent transported it into the ledger). Plus, it grows the ledger into a database — a rejected design axis.

Q4=A is the only option that (a) preserves the "evidence, not summary" rule, (b) works with harness reality (subagents return; continuation-miss is routine), and (c) leverages what already exists on the issue (alert comments as persistent evidence).

**Load-bearing property**: The continuation-miss path must satisfy the same evidence-fidelity contract as the SendMessage path. If the SendMessage path is "verbatim new alert body alongside prior context reference" and the fresh-spawn path is "verbatim new alert body alongside verbatim prior alert body", both provide the fresh subagent the same evidence quality — the prior evidence is either in-context (SendMessage) or in-prompt (fresh spawn), and either way is authoritative. The alternative (Q4=B) breaks this invariance by declaring the fresh-spawn path a lesser variant.

**Composition property**: Q4=A composes with Q2=B (any-of-three computation) and Q3=D (immediately-prior comparison + running list): the fresh subagent has the two alert bodies verbatim, extracts the three dimensions from each, computes the boolean, and appends the fresh classifier identifier to the running list (initialized empty for a second dispatch; carried in from the prior verdict for a third-and-subsequent dispatch). All three decisions compose without any hidden interaction.

**Alternatives rejected in-line above**: Q4=B, Q4=C, Q4=D.

## R5 — Playbook-verification suite location: existing suite; both fixtures as ordinary passing tests (Q5=C)

**Decision**: The audit lives in the existing `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` file, in a new `describe("410 — auto.md D.7 repeat-failure dispatch fetches fresh evidence + failure_class_changed verdict field", …)` block matching the established #398 / #402 / #408 shape (issue-numbered describe block, positive audit + negative-fixture regression via a checked-in fixture file). Positive fixture: an ordinary green assertion against the shipped `auto.md`. Negative fixture: an ordinary green assertion asserting the checker *rejects* the drift fixture.

**Rationale**: This is settled house convention. #398's Q2, #402's Q2, and #408's Q5 all resolved on the same architecture (issue-numbered describe block + positive audit against shipped playbook + negative-fixture regression asserting checker rejection); #410 makes the same call. Litigating it a fourth time would be re-opening a settled question.

The alternatives:

- **Q5=A (suite exists; positive fixture is passing, negative fixture is FAILING — expected-to-fail as the "flag")**: A suite with a permanently red member normalizes red. In a Vitest suite that runs in CI, a permanent failing test either (a) gets marked `.skip` and stops enforcing the anti-pattern check, or (b) trains reviewers to ignore red on that test, dulling the signal on real failures. "The checker rejects the fixture" expressed as a green assertion carries the same information with none of the noise — the fixture is fed through the checker, the checker returns a rejection, and the test asserts the rejection is what was returned. That's a positive check with unambiguous pass/fail semantics.
- **Q5=B (new verification harness beside the existing suite)**: Builds a second harness at the same abstraction level as the first. Surface-count creep for no reader benefit — a new author has to discover both harnesses to understand the audit landscape. Reserved for cases where the second harness has genuinely different concerns (integration vs. structural, snapshot vs. assertion), which is not the case here.
- **Q5=D (defer to plan)**: What this file resolves. Convention has been established at #402 and #408; deferring a third time would be a punt.

Q5=C is the correct-shape reuse of a proven pattern.

**Load-bearing property**: The audit's location must be discoverable by any reader who reads the existing test file. Placing it beside the #398 / #402 / #403 / #406 / #408 blocks in the same file means a reader who sees any of those blocks has immediate context for the #410 block. The shape reuse (issue-numbered describe + auditFoo helper + positive + negative fixtures) means the reader who understands #408's shape needs no re-education for #410.

**Alternatives rejected in-line above**: Q5=A, Q5=B, Q5=D.

## R6 — Load-bearing surfaces: what the fix touches and what it doesn't

The D.7 step 1 body rewrite (first-vs-repeat sub-path split) + the D.7 step 2 verdict-schema addendum (`failure_class_changed` + `failure_classes_seen`) + the G.4(b) presentation-block sixth-element row and the two audit assertions are the load-bearing edits. Everything else is completeness hygiene around them.

**Load-bearing** (a bug here reproduces the finding #62 misdiagnosis):

- `auto.md` D.7 step 1 body — the runtime prose the auto session reads when composing a D.7 dispatch. If this is missing the first-vs-repeat split, the next session dispatches a repeat D.7 on a parent-authored characterization again. If this is missing the `cockpit_context` cross-reference on the repeat sub-path, the session might fetch evidence via `gh` (violating #403's tool-boundary rule at a new surface).
- `auto.md` D.7 step 2 body — the subagent invocation contract. If this is missing the verdict-schema addendum, the subagent has no schema to fill in for `failure_class_changed`; the field ends up absent, and the G.4(b) presentation can't render the row. If this is missing the no-parent-characterization rule, the parent can slip in a summary of similarity and undo the whole fix.
- `auto.md` § Gate contract G.4(b) presentation block — the operator-facing gate. If the sixth-element row is missing, `failure_class_changed = true` in the verdict is invisible at gate time, and the operator's recommendation calculus doesn't reflect the changed class.
- The audit's structural assertions (Q3=C-style structural discrimination, per #402's precedent) applied to the current `auto.md` — the machine-checkable backstop that any future edit collapsing the sub-path split, removing a verdict field, or dropping the G.4(b) row fails at build time.

**Completeness hygiene** (a bug here fails the audit at build time, not at runtime):

- `tests/fixtures/410-drift-auto.md` — the machine-checkable proof that the audit's structural logic isn't vacuous (positive-signal check via assertion 410-2).
- The two new assertions (410-1, 410-2) — the audit's build-time enforcement.

**Not touched** (out of scope):

- `auto.md` § Invariants section — no new §10. The audit's guarantee lives inside the test file's assertion, not at the invariants surface. Matches SC-007 of #394 and the #394 / #396 / #398 / #400 / #402 / #408 no-new-invariant precedent (with the exception of #403 which added §8 and #406 which added §9 — both for cost-contract / cross-cutting rules; the repeat-dispatch evidence-fetch rule doesn't cross-cut).
- Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) — D.7 dispatch lives in `auto.md` only; `watch.md` is retired (pre-#406).
- `packages/claude-plugin-cockpit/lib/*.ts` — no runtime code change; the fix is playbook prose + test extension.
- Historical spec directories — deliberately byte-identical.
- The `cockpit_context` tool boundary — the tool already returns alert-comment bodies with #915 classifier reasons and error taxonomies. The subagent's `failure_class_changed` computation reads fields already in the return payload.
- D.11 (merge-conflicts) — has its own diagnosis-subagent step 1.5 but on a different semantic axis. D.11 is per-conflict resolution; D.7 is per-failure-repeat comparison. If a future finding surfaces a need for D.11's equivalent repeat-path rule, that's a separate spec.

## Sources

- **Spec**: [spec.md](./spec.md) — observed T-S13 evidence (snappoll-1 run 11 → Requeue → repeat `failed:validate` in ~90s → parent asserted "identical" → subagents returned Skip on unverified premise → ground truth was 2 distinct in-branch defects), the three-part fix framing, regression-test enumeration.
- **Clarifications**: [clarifications.md](./clarifications.md) — Q1–Q5 with resolved answers.
- **Predecessor fixes**: [../384-found-during-cockpit-v1/plan.md](../384-found-during-cockpit-v1/plan.md), [../388-found-during-cockpit-v1/plan.md](../388-found-during-cockpit-v1/plan.md), [../390-found-during-cockpit-v1/plan.md](../390-found-during-cockpit-v1/plan.md), [../394-found-during-cockpit-v1/plan.md](../394-found-during-cockpit-v1/plan.md), [../396-found-during-cockpit-v1/plan.md](../396-found-during-cockpit-v1/plan.md), [../398-found-during-cockpit-v1/plan.md](../398-found-during-cockpit-v1/plan.md), [../400-operator-requested-ux/plan.md](../400-operator-requested-ux/plan.md), [../402-found-during-cockpit-v1/plan.md](../402-found-during-cockpit-v1/plan.md), [../403-improvement-spec-from-cockpit/plan.md](../403-improvement-spec-from-cockpit/plan.md), [../406-follow-up-generacy-ai/plan.md](../406-follow-up-generacy-ai/plan.md), [../408-found-during-cockpit-v1/plan.md](../408-found-during-cockpit-v1/plan.md) — the instruction-drift class this fix continues to close at successive playbook surfaces (this fix at the D.7 diagnosis-evidence-contract surface).
- **Related architectural precedent**: #402 (harness-invocation contract at one home + cross-references from each site + structural audit) — same "single home + cross-references + declared-vocabulary audit" architecture applied here at the D.7 evidence surface. #398 (`describe("398 — …")` block + `398-1` positive audit + `398-2` negative fixture), #402 (same test-file shape), #408 (same test-file shape) — reused verbatim for `410-1` + `410-2`. #403 (D.7 and D.11 diagnosis-subagent contract) — the direct predecessor at D.7 for the first-dispatch shape this fix extends.
- **Post-#915 alert bodies**: the `cockpit_context` return payload's failure-alert comment includes classifier reason, error taxonomy, and output tail — the three dimensions Q2=B's computation rule reads. The engine bundle ships these fields precisely so parent-side similarity guesses never have to be made.
- **Incident evidence**: T-S13 run 11 on snappoll-1 in tetrad-development#92 — the specific run whose transcript surfaced the assertion-based dispatch. Finding #62 documents the specific observation (parent's "requeue failed identically" dispatch on unverified premise; two Skip verdicts on unverified premise; ground truth = 2 distinct in-branch defects; operator caught only via out-of-band alert review).
- **Runtime contract of record**: `cockpit_context` tool boundary — the fields returned in the engine bundle payload, including the failure-alert comment body (per #915). The subagent's `failure_class_changed` computation reads `classifier_reason`, `error_taxonomy`, and the failing-test/step field from the alert body.
