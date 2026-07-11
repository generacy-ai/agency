# Research: Improvement spec from the cockpit v1.5 auto-mode smoke test

**Purpose**: Restate the design decisions made in `clarifications.md` (Q1–Q5) as an alternatives-rejected + implementation-pattern reference for the plan. Grounded in the cockpit v1.5 auto-mode smoke test arc (generacy-ai/tetrad-development#92, run-7 ledger) and the #384/#388/#390/#394/#396/#398/#400 findings that established the current playbook shape.

## Decision D1 — `phase:*` prefix-match ledger-only row (D.9d)

**Source clarification**: Q1 (option A).

**Decision**: Add one new ledger-only row `D.9d — \`phase:*\`` that matches any `phase:` prefix and dispatches ledger-line-only. Update § Dispatch table row + add a new `### D.9d — \`phase:*\` → ledger only` subheading between D.9c and D.11 in `auto.md`.

**Rationale**:

- The phase set is workflow-dependent and open-ended. Speckit-feature and speckit-bugfix already differ; a future workflow adds a phase and the loop starts firing D.10 escalation gates on every routine transition. Prefix-match beats enumeration by construction — any future workflow-phase addition is covered without touching `auto.md`.
- The transcript census (spec § Problem) attributes the dispatch overhead to every event triggering a full re-check + reasoning + status prose + ledger write. `phase:*` transitions are the perfect example — they're the most frequent transient events in the stream, and each one costs ~4-5k tokens of permanent context growth. Making them ledger-line-only removes the entire overhead class.
- The never-content-filter invariant (§7 from #394) is preserved. The loop still consumes every non-empty line from `cockpit watch`; only the dispatch classifier's routing table gets a new row. The stream reader is unchanged.

**Alternatives rejected**:

- **B — enumerate each `phase:*` label as a separate D.9-class row**. Breaks the day a workflow adds a phase; the failure mode is a D.10 escalation gate firing on a routine transition, which is exactly the class of dispatch-overhead this spec exists to kill. The Assumption A6 in the spec explicitly calls out the open-set nature ("The set of workflow phases is workflow-dependent and open-ended (speckit-feature and speckit-bugfix already differ), justifying `phase:*` as a prefix-match row rather than an enumeration").

- **C — document `phase:*` as a wildcard category alongside D.9's existing entries without a dedicated row**. The existing D.9 rows are specific-label rows (`waiting-for:address-pr-feedback`, `waiting-for:pr-feedback`, `waiting-for:children-complete`, `waiting-for:dependencies`) — none are wildcard categories. Retro-fitting a new semantic ("D.9 may match by prefix") onto them obscures the audit deliverable (FR-008 asks for a row-by-row justification, which is hard to write for a hybrid enumerated/wildcard row) and violates the "each row is one Trigger" invariant the drift audit (test 396-3) exercises.

- **D — filter `phase:*` upstream in the generacy-side event stream**. Removes the liveness heartbeat from the watch stream (the loop's cheapest liveness signal — see the §7 unfiltered-stream invariant from #394 and its liveness cross-check design at `auto.md` step 5). The never-content-filter invariant exists precisely to catch this class of anti-pattern; upstream filtering grazes it. Scope creep in the wrong direction — the efficiency win is at the dispatch layer, not the stream layer.

**Implementation pattern** (from #396):

- Match the `dispatchClassifier` reference at `tests/playbook-verification.test.ts:187`. Extend it with a `phase:` prefix branch that returns a ledger-only shape. Guard the load-bearing correctness constraint (novel `phase:someday` token routes to D.9d, not D.10) with a fixture-driven assertion.
- The D.9d subheading follows the same prose shape as D.9 / D.9a / D.9b / D.9c: **Trigger** paragraph, **Dispatch** paragraph, **Ledger line** format. The `Ledger line only.` prefix and stability substring are byte-consistent with the D.9 family so downstream grep recipes (e.g., "count ledger-only dispatches" from a transcript) still work without a rule change.
- The outcome vocabulary entry for D.9d is `engine-owned phase transition` (distinct from `server-side-owned` used by D.9/D.9a/D.9b/D.9c). This is deliberate — `phase:*` transitions are engine-owned transient states of the workflow-phase machinery, not waits for a downstream artifact. The distinction lets grep audits on the ledger file distinguish "waiting for something server-side" from "phase transition heartbeat" without parsing the transition class field.

## Decision D2 — Blocking D.9 misclassification audit task in `tasks.md`

**Source clarification**: Q2 (option A).

**Decision**: `tasks.md` contains a blocking D.9 misclassification audit task, run before FR-001 is applied. Findings resolved in the same PR; the audit deliverable is a table in the PR body — every current D.9-class row (D.9, D.9a, D.9b, D.9c, D.9d) with a one-line justification for its ledger-only status. Any misclassification is re-routed to the correct actionable class in the same PR.

**Rationale**:

- The audit is design-time reading with real consequences. A misclassified actionable row would be silently muted by this very contract change (a row that today emits a status table would stop emitting it), and the silent-mute failure mode is exactly the class of regression a review process exists to catch. The blocking task ensures the audit is done before the contract change lands, not "we'll get to it in the follow-up".
- The deliverable format (a table in the PR body) is grep-friendly for review. Review can check the table without re-reading `auto.md`, which is the load-bearing reason for asking for a table rather than a paragraph.
- The audit is cheap (an afternoon's work), so making it a task instead of a separate issue is appropriate — no cross-repo dependency to track.

**Alternatives rejected**:

- **B — one-shot check in Plan phase, documented in `plan.md`**. Design-time notes decay to "we looked, trust us"; the reviewer has no artifact to point at. This plan document itself is the design-time surface, and the audit is not appropriate here because (a) it's a per-row check that produces a table, not a design decision, and (b) writing the table into `plan.md` mixes design output with audit output, obscuring both.

- **C — separate prerequisite issue filed and merged before this one**. Over-processes an afternoon's audit into a dependency issue. If the audit finds nothing, the issue is empty; if it finds misclassifications, they're re-routed in this same PR anyway. C is process cost without benefit.

- **D — no audit needed; D.9 rows are known-correct by construction**. Waves off a hazard the spec itself calls a hard prerequisite. The reason for the audit is that the contract change is silently-transformative — a misclassification that was tolerable under the current "re-check + prose + status table on every row" behavior becomes a silent behavioral regression under the new "no re-check, no prose, no table" contract. D is the failure mode.

**Implementation pattern** (from #398):

- Follow the drift-audit-in-the-PR-body pattern established by the 398 CLI-contract drift audit. That audit's deliverable was a table of `verb | file:line | observed-token | expected-token` mismatches; ours is `row | trigger label | one-line justification`. Same shape: a table in the PR body, referenced from the task description, checkable by review without re-reading source.
- The task lives at the top of `tasks.md`, tagged as blocking (`## Task 1 — Blocking: D.9 misclassification audit`). Subsequent tasks reference it as a prerequisite; the task's completion marker requires the table to be posted to the PR body.

## Decision D3 — `generacy cockpit context <issue>` as the sole D.7/D.11 evidence-fetch verb

**Source clarification**: Q3 (option D).

**Decision**: The parent's evidence-fetch envelope for D.7 (`agent:error` / `failed:*`) and D.11 (`waiting-for:merge-conflicts`) is exactly what `generacy cockpit context <issue>` returns. No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent. Anything further (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch) is dispatched to a diagnosis subagent.

**Rationale**:

- The current D.7 prose says "Fetch evidence — read the alert content … Use `gh issue view <issue-ref> --comments`" — an ad-hoc chain that in practice grew into multi-round `gh` calls in the run-7 arc. The observed pattern (spec § Problem, run-7 evidence): "the gh-2.96.0 merge-resolver root-cause hunt and the #4 base-sync forensics each ran many main-loop Bash+reasoning rounds." Every such round is a full re-check + status prose + ledger write ≈ 4-5k tokens of permanent context growth. Moving the diagnosis to a subagent removes the entire round-cost from the parent.
- D is the only option that is a **contract** rather than a judgment call. A / B / C all require the parent to reason about link topology ("the alert comment references a workflow URL; is that in-envelope?"), which is precisely the in-parent analysis FR-003 exists to remove. A contract (one CLI verb, everything else in a subagent) is what makes the FR mechanically enforceable.
- Bundle-completeness pressure goes where it belongs. If the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), the fix is server-side in generacy — a schema change to `generacy cockpit context <issue>` to include that artifact in the bundle. That's a one-time fix, not a per-session decision.

**Alternatives rejected**:

- **A — strict-one-call: parent fetches only the alert comment body; subagent fetches everything else**. Parent still reasons about which endpoint to hit for "just the alert body" (`gh issue view --comments` vs `gh api /repos/:owner/:repo/issues/:n/comments` vs the payload's own alert field). The boundary is a judgment call, not a contract.

- **B — alert comment + one linked-log fetch stay in parent**. Same failure mode as A — the parent still reasons about which link to follow, and the boundary between "one linked fetch" and "further fetches" is a call each session has to make. Also cross-cuts with the run-7 observed pattern where "one linked fetch" grew into three.

- **C — parent may follow one level of links from the alert body**. Even more link-topology reasoning than B. The whole point of the fix is to move that reasoning into a subagent whose output is a structured verdict.

**Implementation pattern** (from #390):

- Match the review-verdict analyzer subagent contract from #390's D.2/D.3 dispatch. The diagnosis subagent takes the failure-context payload (from `generacy cockpit context <issue>`), reads whatever else it needs on its own (via its own tool access), and returns strict JSON per the verdict schema.
- The subagent's return-schema directive is embedded in the prompt (as documented in the plan's D.7 step-2 prose block), matching the SB.2 return-schema directive shape from #390.
- The observability handle for the fix's effectiveness is a transcript grep on the verdict JSON schema — if a D.7 or D.11 gate presentation has an accompanying verdict-JSON blob, the subagent hop happened; if not, the parent regressed to in-parent analysis. This is the true-verifier signal for FR-003.

## Decision D4 — Diagnosis subagent verdict maps directly onto the #400 five-element gate

**Source clarification**: Q4 (option A).

**Decision**: The diagnosis subagent returns `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings. For D.7: `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`. For D.11: `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`. The parent maps the verdict directly onto the #400 five-element gate: `recommended_action` renders as a "Suggested decision" line with `confidence` beside it; `root_cause`/`evidence` fill the context and evidence rows. The operator still chooses from the full option set. No in-parent re-analysis.

**Rationale**:

- Exact-string recommendations keep the parent at zero re-analysis. The parent maps the verdict field verbatim onto the presentation, matching the #400 batch-gate five-element display pattern (recommendation + why + provenance) with the D.7/D.11 vocabulary (recommended_action + confidence + root_cause + evidence).
- The `low` / `medium` / `high` confidence resolution is the operator-usable one. The operator doesn't act differently on 0.72 vs 0.78; they do act differently on `low` vs `high`. And the semantic mapping is well-defined: `high` = subagent believes the recommended action will resolve the failure; `medium` = plausible but uncertain; `low` = a guess, operator should verify.
- The operator retains the full option set. The verdict is a hint, not a preselection — the presentation renders "Suggested decision: <action>" as a line above the AskUserQuestion, matching the #400 five-element display; the AskUserQuestion itself still offers all options in the documented order. This preserves the "every gate prompts" invariant from `auto.md` §6.

**Alternatives rejected**:

- **B — numeric confidence `0.0–1.0` displayed as a percentage**. False precision from an LLM judge. The subagent has no calibration data on which to base a numeric confidence; a `0.72` is a made-up number that looks precise. `low` / `medium` / `high` is a categorical resolution the LLM can produce with rough calibration and the operator can act on differently.

- **C — free-form prose recommendation, no auto-suggested option**. Loses the one-decision gate property. If the recommendation is prose ("try requeue, but consider skipping if the runner is flaky"), the parent has to interpret it into an option string, which is in-parent re-analysis — the thing FR-003 forbids. Exact-string recommendations keep the parent at zero re-analysis.

- **D — structured findings only; parent selects the option to suggest based on rules over `root_cause`/`evidence`**. Quietly reintroduces parent-side inference dressed as presentation rules. A rule engine over the verdict fields is not "direct" mapping — it's inference with extra steps. And the rule engine has to be defined somewhere (in prose in `auto.md`), which means it's another decay surface. Option A keeps the mapping in the subagent's contract, where the LLM has full context.

**Implementation pattern** (from #388 and #400):

- The five-element display shape from #400's G.1 (context / question / options / recommendation + why + provenance) is the direct analog for D.7/D.11's G.4b/G.4d: the presentation block renders root_cause / evidence / options / "Suggested decision" + confidence. The five-element grammar is the same; the specific labels differ per gate type. This is why the plan's edit to G.4b/G.4d is a **presentation-population source** change, not a shape change — the presentation shape from #400 is unchanged.
- The verdict validator lives inline in the test file (matching the `dispatchClassifier` at `tests/playbook-verification.test.ts:187`). A small `parseVerdict(input, gateType) → Verdict | ValidationError` reference asserts the four fields are present with the documented types and that `recommended_action` is in the gate's option string set. Three fixture verdicts (D.7 valid, D.11 valid, invalid-action) exercise the load-bearing constraints.

## Decision D5 — Startup sweep ends with exactly one full epic status table

**Source clarification**: Q5 (option B).

**Decision**: The startup sweep (step 3) ends with exactly one full epic status table, added to FR-002's allowed list. Between phase boundaries, the ledger line is the sole record of a dispatch. Escalation-gate presentations retain the #400 five-element display unchanged.

**Rationale**:

- Session-start orientation is a real operator need. Every resumed run starts with "where are things?" — the operator has been away from the terminal, and the sweep summary is the first thing they see. Sending them to file archaeology (option A) at the moment they most need a picture is a UX regression, not a compression win.
- The problem being fixed is ~30 tables per run, not this one table per session. The transcript census (spec § Problem) attributes the dispatch overhead to per-event tables, not the startup summary. One table per session is negligible compared to the per-event tables the fix is removing.
- The permitted-surfaces list in FR-002 (`phase-complete`, `epic-complete`, escalation-gate presentations, startup-sweep summary) is a closed set that grep-audits can verify. Every other section of `auto.md` MUST NOT emit a full status table — that's the load-bearing constraint the 403-7 assertion verifies.

**Alternatives rejected**:

- **A — sweep produces ledger lines only; no post-sweep table**. Sends the operator to file archaeology at the moment they most need a picture. The `.ledger` file at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` is per-run-timestamped, so the operator has to know the run's timestamp to grep — a real orientation cost.

- **C — sweep emits a reduced one-line summary ("swept N issues; M actionable dispatched")**. Spends a turn to convey almost nothing. Doesn't tell the operator *which* issues or *what states* — they'd re-run `cockpit status` in a follow-up turn, defeating the compression. Full table once is cheaper than compressed line + follow-up query.

- **D — sweep emits a table only when zero actionable dispatches**. Adds a conditional presentation rule where the current shape is unconditional. Every session-start deserves the orientation table; the presence or absence of actionable dispatches doesn't change the operator's need to see the current state. And a conditional presentation rule is another decay surface — "when the condition doesn't fire, why isn't there a table?" becomes a runtime question the operator has to hold in their head.

**Implementation pattern** (from #394 and #400):

- The permitted-surfaces list lives in a new § Ledger L.4 subsection "Status table policy" (matching the § Ledger L.5 "Idempotency rule" and L.6 "Run summary at exit" subsections from the current playbook — the L.4 slot is the natural place). Four permitted surfaces are enumerated with cross-references to the sections that emit tables (D.8 / G.5, step 6 / L.6, G.4 subtypes, step 3).
- The 403-7 assertion is a section-grep audit — extract each `##` / `###` section of `auto.md`, grep each for the full-epic-status-table anchor (a well-defined substring unique to the full table — see [data-model.md](./data-model.md) § Status table anchor), and assert the anchor appears only in the four permitted surfaces. Any occurrence outside is a failure with the section name in the error message.
- Match the section-scan pattern from the 398 CLI-contract drift audit — that audit iterates `commands/*.md` files and extracts invocations per line; ours iterates one file's sections and extracts anchors per section. Same shape: audit-lives-in-the-assertion.

## Cross-decision constraint — Numbered invariant §8

**Source**: FR-006 (in spec) + spec § Change 4 ("state the cost contract in the playbook's invariants so it survives rewrites — the S6/decay-countermeasures pattern").

**Decision**: Add a new numbered invariant §8 to `auto.md` § Invariants: *"A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose; playbook edits that add per-event output are efficiency regressions."*

**Rationale**:

- The invariants surface is the S6/decay-countermeasures pattern's canonical anchor. §1 (never merge on red — #388), §2 (cockpit comments marked), §3 (add-only advance), §4 (no cross-slash-command invocation), §5 (analysis in subagents — #390), §6 (autonomy policy out of scope), §7 (stream consumption is unfiltered — #394) are all rules that survive playbook rewrites because they're numbered at the invariants surface. §8 is the cost contract, joining that list.
- The 403-6 assertion is a section-grep for the exact opening substring `A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;`. A future rewrite that drops or paraphrases the line fails the assertion at build time. The S6/decay countermeasure is mechanically enforced.

**Alternatives rejected**:

- **Prose in D.9-family subheadings only, no invariants line**. The D.9-family prose is the site where the contract is applied; the invariants line is the site where the contract is remembered. Both are needed. A rewrite that touches D.9 without touching § Invariants would lose the prose; a rewrite that touches § Invariants without touching D.9 would lose the applied instance. The S6/decay pattern uses both surfaces.

- **Renumber existing invariants when adding §8**. §7 is anchored in the 394 tests as "unfiltered stream consumption"; renumbering breaks the anchor and rewrites the audit surface for no gain. Additive numbering is the S6/decay countermeasure applied at the invariants surface itself.

## Key sources / references

- **Spec**: `specs/403-improvement-spec-from-cockpit/spec.md` — the run-7 dispatch-overhead finding, the ~508k tokens / 233 API turns baseline, the ~50% reduction target.
- **Clarifications**: `specs/403-improvement-spec-from-cockpit/clarifications.md` — Q1–Q5 with resolved answers.
- **Prior arc**:
  - `specs/384-found-during-cockpit-v1/` — Terminal Outcome Check pattern; the S6/decay-countermeasures pattern's first named instance.
  - `specs/388-found-during-cockpit-v1/` — fusion (present-with-decide-in-one-response); the anti-pattern for turn-split gate presentation.
  - `specs/390-found-during-cockpit-v1/` — review analyzer report-and-stop contract; the direct precedent for the diagnosis-subagent verdict shape.
  - `specs/394-found-during-cockpit-v1/` — unfiltered stream consumption invariant §7; the load-bearing reason Q1=D was rejected.
  - `specs/396-found-during-cockpit-v1/` — tightened D.10 trigger + drift audit; the `dispatchClassifier` reference-in-tests pattern.
  - `specs/398-found-during-cockpit-v1/` — CLI-contract drift audit + audit-lives-in-the-assertion pattern; the direct precedent for the 403-7 section-scan.
  - `specs/400-operator-requested-ux/` — five-element clarification gate + directive grammar; the direct precedent for the D.7/D.11 verdict presentation.
- **Playbook**: `packages/claude-plugin-cockpit/commands/auto.md` — the file being edited.
- **Test surface**: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — the file being extended.
