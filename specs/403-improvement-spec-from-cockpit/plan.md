# Implementation Plan: Improvement spec from the cockpit v1.5 auto-mode smoke test

**Feature**: Cut per-event dispatch overhead in `packages/claude-plugin-cockpit/commands/auto.md` by making ledger-only rows cheap by contract (no `cockpit status` re-check, no status table, no prose), restricting the full epic status table to phase boundaries + escalation gates + the startup-sweep summary, forcing D.7/D.11 failure diagnosis into a subagent (parent's evidence-fetch envelope is exactly `generacy cockpit context <issue>`), adding a new D.9d — `phase:*` prefix-match row so routine workflow-phase transitions don't fire D.10 escalations, and locking the cost contract into `auto.md`'s § Invariants surface so future rewrites can't silently regress it.
**Branch**: `403-improvement-spec-from-cockpit`
**Date**: 2026-07-11
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the run-7 dispatch-overhead finding from the cockpit v1.5 auto-mode smoke test arc (generacy-ai/tetrad-development#92). The 12-issue snappoll run on 2026-07-10 grew the auto session's context to ~508k tokens over 233 API turns — one small epic in compaction-threshold territory. The transcript census identifies the dominant cost: every watch event — including transient no-ops like `phase:plan → phase:tasks` — triggered a full round of `cockpit status --json` re-check + reasoning + status prose + ledger write ≈ 4–5k tokens of permanent context growth. Thinking volume (48% of the 2.9MB transcript) is proportional to dispatch rounds, so cutting round weight/count attacks the 48% too.

**One playbook file edited (`auto.md`), one companion `clarify.md` untouched.** Five prose edits, one new tests block, one blocking audit task, one companion invariants line — all in the same PR:

1. **Edit `auto.md` § Dispatch D.9 family and § Ledger.** State a hard contract on ledger-only rows: "the handler performs exactly the ledger append and no other tool call — no `generacy cockpit status --json` re-check, no epic status table, no prose recap." The re-check exists to make *actions* idempotent; a row whose only action is a ledger append has nothing to protect. Actionable classes (D.1–D.8, D.10, D.11) retain the live-state re-check exactly as today.

2. **Edit `auto.md` § Dispatch — add D.9d `phase:*` (prefix-match).** New ledger-only row keyed on the `phase:` prefix, covering all current and future workflow-phase transitions (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, and any future addition). Prevents D.10 escalation gates from firing on routine transitions and preserves the never-content-filter rule for stream consumption (agency#394 invariant §7) — the loop still *sees* every `phase:*` event, it just dispatches ledger-line-only.

3. **Edit `auto.md` § Dispatch D.7 and D.11 (failure diagnosis).** The parent's evidence-fetch envelope is exactly what `generacy cockpit context <issue>` returns — one CLI verb, no ad-hoc `gh` chains, no link-following. Anything beyond that (reproducing, reading CI logs, bisecting versions, inspecting branches, downstream artifact fetch) is dispatched to a diagnosis subagent returning strict JSON `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`Requeue`/`Skip`/`Stop` for D.7; `I've resolved it — advance the gate`/`Skip (session-local mute)`/`Stop (exit auto)` for D.11). The parent maps the verdict directly onto the #400 five-element gate: `recommended_action` renders as a "Suggested decision" line with `confidence` beside it; `root_cause`/`evidence` fill the context and evidence rows. No in-parent re-analysis. The gate's option set is unchanged; the operator still picks from the full list. This mirrors the #390 review-analyzer report-and-stop contract and the #400 clarification-drafter isolation contract.

4. **Edit `auto.md` § Ledger and elsewhere.** Restrict the full epic status table to `phase-complete`, `epic-complete`, escalation-gate presentations, and the startup-sweep summary. Between phase boundaries, the ledger line is the sole record of a dispatch. The startup sweep (step 3) is a permitted exception — it ends with exactly one full status table for session-start orientation.

5. **Edit `auto.md` § Invariants — add invariant §8.** Cost-contract line, verbatim: *"A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose; playbook edits that add per-event output are efficiency regressions."* Numbered invariant survives rewrites (S6/decay-countermeasures pattern), matching the #388 turn-split invariant and the #394 unfiltered-stream invariant already at that surface.

6. **Add a blocking D.9 misclassification audit task in `tasks.md`.** Q2 clarification: the audit lives inside this issue's `tasks.md`, run before FR-001 is applied. Findings block the branch until resolved; misclassifications are re-routed to the correct actionable class in the same PR. The audit deliverable is a table in the PR body — every current D.9-class row (D.9, D.9a, D.9b, D.9c, D.9d) with a one-line justification for its ledger-only status; review can check the table without re-reading `auto.md`. This is generated by `/tasks` from this plan, not authored here — but the plan's Structural section names it explicitly so `/tasks` produces the right shape.

The verification suite extension mirrors the #394 / #396 / #398 / #400 pattern: prose greps on `auto.md` for positive/negative anchors (five-element presentation strings, `phase:*` row header, invariants cost-contract line) plus a small reference "dispatch classifier" in the test file that exercises the D.9d prefix-match rule and the D.7/D.11 verdict shape against fixtures. No new library module is needed — the verdict shape is small enough to live inline in the test file (matches the `dispatchClassifier` shape already used for 396's D.10/D.11 assertions in `tests/playbook-verification.test.ts` lines 187–212); a `parseVerdict(json) → Verdict` reference lives inline in the test file, not `lib/`.

Also ship:

- **`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`** — extended with a new `describe("403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract", () => …)` block containing seven new assertions (403-1 through 403-7, matching FR/SC anchors in [data-model.md](./data-model.md) § Assertion index):
  - **403-1**: D.9 subheadings state the no-re-check/no-prose contract verbatim.
  - **403-2**: A new D.9d subheading with `phase:*` prefix-match exists and dispatches ledger-line-only (fixture: `403-phase-transition-live-state.json` with token `phase:plan`).
  - **403-3**: Reference dispatch classifier prefix-matches any `phase:*` token to D.9d — not D.10 (fixture: novel `phase:someday` token that isn't enumerated anywhere).
  - **403-4**: D.7 and D.11 prose state `generacy cockpit context <issue>` is the sole evidence-fetch verb and that all further work is subagent-dispatched.
  - **403-5**: The verdict-schema reference type shape matches the documented `{root_cause, evidence, recommended_action, confidence}`; `recommended_action` is constrained to the exact gate option strings (fixture: `403-d7-verdict-requeue.json`, `403-d11-verdict-resolved.json`).
  - **403-6**: Invariants section contains the exact cost-contract line and numbers it §8.
  - **403-7**: Full epic status table strings appear only in the phase-complete, epic-complete, escalation-gate, and startup-sweep-summary sections of `auto.md` — a static grep on the table-header row anchor confirms no other section emits a table.

- **`packages/claude-plugin-cockpit/tests/fixtures/403-*.json`** fixtures covering: a `phase:plan` transition live-state, a novel `phase:someday` transition live-state (never-enumerated phase, catches D.10 misfire), a D.7 diagnosis verdict recommending `Requeue`, a D.11 diagnosis verdict recommending `I've resolved it — advance the gate`, and an invalid verdict (wrong `recommended_action` string for the gate) to guard the string-set constraint.

The playbook edits themselves are:

- **`auto.md` § Dispatch table (top of § Dispatch)**: table row for D.9d added (immediately after D.9c); prose in the "streamed lines are advisory" paragraph gains a sentence pointing at the § Invariants #8 cost-contract line so a reader following the dispatch flow sees the ledger-only contract before hitting any of the D.9 subheadings.
- **`auto.md` D.9 / D.9a / D.9b / D.9c subheadings**: prose block updated — the existing "Ledger line only. No CLI verb, no subagent, no gate — server-side-owned." sentence is extended to "**Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned." Same shape in every D.9 row so the contract is visible at every subheading (audit-friendly greppable substring: `no status table, no prose recap`).
- **`auto.md` § Dispatch — new D.9d subheading**: added between D.9c and D.11 (D.11 stays alphabetically last in the D.9 family for ledger consistency; D.9d is the fourth in the family). Prose block:

  ```markdown
  ### D.9d — `phase:*` → ledger only

  **Trigger**: An issue enters any `phase:*` state. **Prefix-match**: any transition class whose token begins with the literal `phase:` prefix matches this row (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, and any future workflow-phase addition). The phase set is workflow-dependent and open-ended — speckit-feature and speckit-bugfix already differ; enumeration would break the day a workflow adds a phase.

  **Dispatch**: **Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` still fires D.10).

  **Ledger line**: `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`.
  ```

- **`auto.md` § Dispatch D.7**: prose block rewritten — replace the existing "Fetch evidence — read the alert content" step-1 with the following exact contract:

  ```markdown
  1. **Fetch evidence** — the parent's sole evidence-fetch verb is `generacy cockpit context <issue>`. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.** The payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope.
  2. **Spawn diagnosis subagent** — for any further work (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch), dispatch to a diagnosis subagent. Invocation:
     ```
     subagent_type: "general-purpose"
     description: "Diagnose <issue-ref> failure"
     prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
     ```
     The subagent MUST NOT invoke any slash command. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. On unrecoverable error the subagent returns `{"error": "<description>"}`.
  3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block per § Gate contract G.4b (subtype b) — five-element block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with the unchanged D.7 option set. No in-parent re-analysis.
  ```

  (The remainder of D.7 — the "Apply verdict" branches, degradation clause, and ledger lines — is unchanged; the only edits are the fetch envelope + subagent-dispatch contract + presentation-population source.)

- **`auto.md` § Dispatch D.11**: same shape — replace step 1's `gh issue view --comments` with `generacy cockpit context <issue>`; add step-1.5 that dispatches a diagnosis subagent for any conflict-triage work beyond the engine bundle (the observed run-7 pattern: parent-loop rounds of `git status` / `git diff` / branch inspection are exactly the class of in-parent forensics this fix moves to a subagent); step 2's presentation-block is updated to populate from the verdict per § Gate contract G.4d.

- **`auto.md` § Gate contract G.4 (b) and (d)**: presentation-block description updated to state that `root_cause`/`evidence`/`recommended_action`/`confidence` are populated from the diagnosis subagent's return verbatim; no in-parent re-analysis; the operator still chooses from the full option set (the option set itself is unchanged — the recommendation is a "Suggested decision" hint, not a preselection).

- **`auto.md` § Ledger and § Dispatch (across all rows)**: prose edit adding a new subsection §Ledger.L.4 "Status table policy":

  ```markdown
  ### L.4 — Status table policy

  The full epic status table is emitted **only** at the following surfaces:

  1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
  2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
  3. **Escalation-gate presentations** (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) — the operator needs orientation before an escalation decision.
  4. **Startup-sweep summary** (step 3) — session-start orientation is a real operator need; every resumed run starts with "where are things?". The sweep ends with exactly one full status table, then enters the main loop.

  Between phase boundaries, the ledger line is the sole record of a dispatch. No status table is emitted after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the four surfaces above.
  ```

- **`auto.md` § Invariants — add §8**:

  ```markdown
  8. **Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose. Playbook edits that add per-event output — a `cockpit status --json` re-check, an epic status table, a prose recap — on a ledger-only row are efficiency regressions.
  ```

  Numbered §8, immediately after §7 (unfiltered-stream — added by #394). No renumbering of §1–§7; #388's turn-split and #390's report-and-stop and #394's unfiltered-stream and #400's batch-gate-per-clarification all stay at their existing numbers.

**No new library module.** The verdict shape is small enough to live inline in the test file (matches the `dispatchClassifier` at `tests/playbook-verification.test.ts:187`). A `parseVerdict(json, gateType) → Verdict | ValidationError` reference lives inline in the new `describe("403 — …")` block, exercised against the JSON fixtures.

**`clarify.md` is not modified.** FR-009 pins this scope boundary. Q1 clarifications for #400 already established that `clarify.md` is out of scope for cockpit-auto-loop efficiency edits (its runtime path is `/cockpit:clarify`, a distinct slash command). The dispatch classification changes and failure-diagnosis subagent contract apply only to `auto.md`.

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime; also grep-audited by the test file); TypeScript (Vitest) for the reference verdict parser + assertions. No runtime code change to `lib/reference-consumption.ts` (created by #394), `lib/gate-vocabulary.ts` (created by #396), or `lib/clarification-batch-parser.ts` (created by #400).
**Primary Dependencies**: None new on the runtime side. Existing runtime: Claude Code slash-command executor + `AskUserQuestion` tool. The `generacy cockpit context <issue>` verb is the sole evidence-fetch verb the parent uses for D.7/D.11 (per FR-003; the spec's Assumption A3 covers the case where the verb needs the failure-bundle payload to routinely include the CI log — that's server-side in generacy, out of scope here). `generacy cockpit advance`, `generacy cockpit resume`, `generacy cockpit merge`, `generacy cockpit queue`, and `gh issue comment` remain the other authoritative CLI verbs (contract unchanged). On the test side: Vitest — already a dev-dep in `packages/claude-plugin-cockpit/package.json` (#394 introduced, #396 / #398 / #400 extended).
**Storage**: Filesystem — one playbook file edited (`packages/claude-plugin-cockpit/commands/auto.md`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, adding the `403 —` describe block); five new fixtures under `packages/claude-plugin-cockpit/tests/fixtures/` (phase-transition live states + verdict JSONs). No new library module. No changes to `clarify.md`, `merge.md`, `queue.md`, `review.md`, `status.md`, or `watch.md`.
**Testing**:
- **Static** (necessary but proven insufficient by the #384–#400 arc — static-only fails at behavioral drift): greps for the presence of `no status table, no prose recap` in the D.9 family subheadings (positive signal — the shared no-op contract); a grep for `### D.9d — \`phase:*\`` (positive signal — the new row header exists); a grep for the invariants §8 cost-contract line's exact opening sentence (positive signal — invariant survives); a grep asserting that `gh issue view --comments` does NOT appear in D.7 or D.11's step-1 evidence-fetch prose (negative signal — the smoking-gun for the old ad-hoc-gh-chain pattern this fix replaces); a grep asserting `generacy cockpit context` appears exactly once each in D.7 and D.11's step-1 evidence-fetch prose (positive signal — the sole-verb contract). See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: seven new assertions appended to `tests/playbook-verification.test.ts` in a new `describe("403 — auto.md ledger-only contract + phase:* row + subagent diagnosis + invariants cost-contract", …)` block:
  - **(403-1) — D.9 subheadings state no-re-check/no-prose contract verbatim**: read `commands/auto.md`, extract the D.9, D.9a, D.9b, D.9c subheading blocks, assert each contains the substring `no status table, no prose recap`. Guards against a rewrite that drops the contract from any single D.9-family subheading (the S6/decay pattern instance for this fix).
  - **(403-2) — new D.9d subheading with `phase:*` prefix-match dispatches ledger-line-only**: extract the D.9d subheading block from `commands/auto.md`; assert the prefix-match sentence is present verbatim; assert the "Ledger line only" prose block is present verbatim (matching the D.9/D.9a/D.9b/D.9c shape); assert the ledger-line format `engine-owned phase transition` appears.
  - **(403-3) — reference dispatch classifier prefix-matches `phase:*` to D.9d, not D.10**: extend the existing `dispatchClassifier` helper in the test file with a `phase:` prefix branch that returns the D.9d ledger-only shape; feed the fixture `403-phase-transition-live-state.json` (`transition_class: "phase:plan"`) through the classifier; assert it produces a ledger line, not a D.10 escalation. Feed `403-phase-someday-live-state.json` (`transition_class: "phase:someday"` — never enumerated) through the classifier; assert the same. This is the load-bearing correctness check that FR-005 is met: prefix-match beats enumeration.
  - **(403-4) — D.7 and D.11 state `generacy cockpit context <issue>` as sole evidence-fetch verb and dispatch further work to a subagent**: extract the D.7 and D.11 subheading blocks; assert each contains the substring `generacy cockpit context <issue>` (positive — the sole verb); assert neither contains `gh issue view --comments` in its step-1 evidence-fetch prose (negative — the ad-hoc chain this fix replaces). Extract the "Spawn diagnosis subagent" prose block; assert the subagent's return-schema directive is present verbatim: `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`.
  - **(403-5) — verdict reference type shape**: define a `parseVerdict(input, gateType) → Verdict | ValidationError` reference in the test file that (a) parses JSON, (b) asserts the four fields are present with the documented types, (c) asserts `recommended_action` is one of the target gate's option strings verbatim. Feed `403-d7-verdict-requeue.json` (`recommended_action: "Requeue (cockpit resume)"`); assert it parses cleanly with `confidence: "high"`. Feed `403-d11-verdict-resolved.json` (`recommended_action: "I've resolved it — advance the gate"`); assert it parses cleanly. Feed `403-verdict-invalid-action.json` (`recommended_action: "Merge it"` — not in either gate's option set); assert it produces a validation error naming the invalid action verbatim. Load-bearing check for FR-003's option-set constraint.
  - **(403-6) — invariants §8 cost-contract line present**: extract the § Invariants section from `commands/auto.md`; assert the section contains exactly eight numbered items (§1–§8); assert §8's opening sentence begins `A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;` (grep-tolerant against trailing prose but strict on the opening substring — the load-bearing anchor a future rewrite has to survive).
  - **(403-7) — full epic status table appears only at permitted surfaces**: extract every section of `commands/auto.md`; for each section, grep for the status-table header row string (e.g., a well-defined anchor unique to the full epic status table — see [data-model.md](./data-model.md) § Status table anchor); assert the anchor appears only inside sections named § Dispatch D.8 (phase-complete), step 6 / § Ledger L.6 (epic-complete exit), § Gate contract G.4 (escalation gates), or the startup-sweep summary. Any occurrence outside those four is a failure with the section name in the error message.
- **True verifier**: a re-run of the cockpit v1.5 auto-mode smoke test on a comparable 12-issue epic. The auto session's final cache-read size on the transcript is ≤ ~250k tokens (~50% of the 508k baseline). Ledger-only event dispatches add ≤1 tool call and 0 prose blocks; no epic status tables between phase boundaries (except escalation gates and the startup-sweep summary); zero D.10 escalations fired by `phase:*` transitions; every D.7/D.11 gate presentation cites a subagent verdict (grep the transcript for the verdict-JSON schema). Empirical confirmation is the true verifier; the greps + reference type + fixture assertions are the machine-checkable backstop against silent regression.

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard).

**Project Type**: Single-package playbook edits + one suite extension. No cross-package changes. No cross-repo changes to `tetrad-development` or `generacy` in this branch — the spec's Assumption A3 (companion generacy-side MCP/event-coalescing spec, filed separately) does not gate this issue. The spec is "independently shippable" and delivers "the larger share of the win" per the Summary.

**Performance Goals**: See spec § Success criteria and § Success Criteria table. Adherence targets: 0 tool calls beyond the ledger append on a ledger-only dispatch; 0 prose blocks on a ledger-only dispatch; 0 epic status tables between phase boundaries (excluding escalation gates and the startup-sweep summary); 0 in-parent multi-command failure diagnostics (every D.7/D.11 gate cites a subagent verdict); 0 D.10 escalation gates fired by `phase:*` transitions; ≤ ~250k tokens final cache-read size on a comparable 12-issue epic run.

**Constraints**:

- **`clarify.md` is untouched.** FR-009 pins the scope boundary. The runtime path for `/cockpit:clarify` is a distinct slash command; this fix targets `/cockpit:auto` only. `clarifications.md` on this branch does not raise a scope-of-clarify.md question — Q3/Q4 are strictly about `auto.md` D.7/D.11 shape.

- **The re-check exists for actionable-row idempotency; ledger-only rows have nothing to protect.** The design rationale for §8 is spelled out in the § Invariants prose block: "the re-check exists to make actions idempotent; a row whose only action is a ledger append has nothing to protect." This is why the contract is safe by construction — the re-check's whole purpose is to catch state that moved on between the streamed event and the parent's dispatch; a no-op action can't produce a duplicate.

- **The never-content-filter invariant (§7, from #394) is preserved.** Change 5 (the new D.9d `phase:*` row) alters what the session *does* per event; it never alters which events the loop sees. The stream reader still consumes every non-empty line unfiltered; only the dispatch classifier's routing table has a new row. This is the explicit "explicitly unchanged" line in the spec § Explicitly unchanged and the load-bearing reason the D option in the Q1 clarification was rejected.

- **The mandatory ledger line per dispatch (§ Ledger L.5) is preserved.** Every dispatch — including the new D.9d rows — writes exactly one ledger line, per the "A dispatch without a ledger line is a protocol violation" rule. FR-010 pins this.

- **The #400 five-element gate display is preserved.** FR-004 pins this: the operator-facing gate presentation is unchanged in shape; the diagnosis subagent's verdict populates the fields that would otherwise be populated by parent-side reasoning. The "Suggested decision" line + `confidence` beside it is the same presentation shape #400 established for G.1 (recommendation + why + provenance); D.7/D.11's G.4b/G.4d gates are getting the same treatment.

- **The bounded fixer subagent (D.6) is unchanged.** FR-003 targets D.7 and D.11 only; D.6 is `completed:validate` red / merge red, already a subagent-mediated dispatch per #388 and #390. The fixer subagent already returns strict JSON `{fixed: bool, summary: string, reason?: string}` and populates G.4a's presentation. No edit needed there.

- **The tightened D.10 trigger (from #396) is preserved.** D.10 still catches any `waiting-for:*` label without a matching dispatch row; the D.9d addition removes `phase:*` from D.10's catch-all (because `phase:*` is now explicitly matched by D.9d), but any non-`phase:` and non-`waiting-for:...`-named-row still hits D.10. Any waiting-for label without a matching Trigger IS an unrecognized state — this rule stays.

- **The playbooks' invariants surface has grown by exactly one number: §8.** §1–§7 keep their existing numbers; no renumbering. #388's turn-split is §1 (in the D.6/D.7/D.10 / G.4 wording), #390's report-and-stop is inside the subagent contract prose (not numbered), #394's unfiltered-stream is §7, #400's batch-gate-per-clarification is inside G.1's prose (not numbered). Numbered invariants are for the load-bearing rules that survive playbook rewrites; §8 is the cost contract, spec § Change 4's "S6/decay-countermeasures pattern" anchor.

- **The audit deliverable is a table in the PR body.** Q2 clarification: `tasks.md` contains a blocking D.9 misclassification audit task; findings are resolved in the same PR; the deliverable is a table in the PR body (columns: row (D.9 / D.9a / D.9b / D.9c / D.9d), trigger label, one-line justification for ledger-only status). Review can check the table without re-reading `auto.md`. This is the `/tasks` output, not `/plan`'s — but the plan's Project Structure section names it so `/tasks` produces the right shape.

- **Bare no-op ledger prose is preserved verbatim.** The existing "Ledger line only. No CLI verb, no subagent, no gate — server-side-owned." sentence in D.9 / D.9a / D.9b / D.9c is extended with the new clauses (`no status table, no prose recap`), not replaced — grep-audits on the "Ledger line only." prefix and "server-side-owned" suffix (already used in downstream consumer scripts / operator muscle memory) keep matching. D.9d uses the same shape with a different suffix (`engine-owned phase transition` — because `phase:*` is a workflow-engine transient state, not a "server-side-owned" wait for a downstream artifact).

- **The parser lives inline in the test file.** The verdict-parser reference implementation is small (< 40 lines) and is exercised by the `403 —` describe block only. This matches the `dispatchClassifier` inline reference at `tests/playbook-verification.test.ts:187` (added by #396 for D.10/D.11 assertions) — a rule small enough that a `lib/` module would be over-abstraction. If future findings need a runtime-callable verdict validator, that's a follow-up.

- **Scope boundary**: `commands/auto.md` (D.9 / D.9a / D.9b / D.9c subheading prose updates, D.9d new subheading, D.7 step-1 rewrite, D.11 step-1 rewrite, G.4b / G.4d presentation-population source update, new § Ledger L.4 "Status table policy" subsection, new § Invariants §8, § Dispatch table row addition for D.9d), `tests/playbook-verification.test.ts` (extended with the `403 —` describe block), five new fixture files under `tests/fixtures/`. Sibling playbook files (`clarify.md`, `merge.md`, `queue.md`, `review.md`, `status.md`, `watch.md`) untouched. Sibling library files (`lib/gate-vocabulary.ts`, `lib/reference-consumption.ts`, `lib/clarification-batch-parser.ts`) untouched. Historical spec directories untouched.

- **New invariant §8, no renumbering**. Consistent with the "numbered invariant survives rewrites" pattern (matches §7 from #394 and §1 from #388/#390 pre-existing).

**Scale/Scope**: One file edited: `auto.md` (~120-150 net added lines — D.9 family subheading prose extensions ~5 lines × 4 rows = ~20 lines; new D.9d subheading ~25 lines; D.7 step-1/step-2 rewrite ~15 lines; D.11 step-1/step-1.5 rewrite ~10 lines; G.4b/G.4d presentation-population source update ~10 lines; new § Ledger L.4 status table policy subsection ~20 lines; new § Invariants §8 ~4 lines; § Dispatch table row for D.9d ~1 line). One file extended: `tests/playbook-verification.test.ts` (~150-200 net added lines — one new `describe` block with seven assertions + fixture reads + inline verdict-parser reference). Five new fixture files under `tests/fixtures/` (each ~10-30 lines JSON). Zero files deleted, zero files renamed. No changes to `lib/*.ts` or sibling `commands/*.md`.

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #400 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/403-improvement-spec-from-cockpit/
├── spec.md                                # Feature spec (read-only)
├── clarifications.md                      # Q1–Q5 with resolved answers (read-only)
├── plan.md                                # THIS FILE
├── research.md                            # Design decisions and rationale (Phase 0)
├── data-model.md                          # Types: Verdict, DispatchClass; assertion index; status-table anchor; pre/post playbook surface changes
├── quickstart.md                          # Verification runbook (static grep + Vitest suite + operator smoke-test one-liner)
├── contracts/
│   ├── ledger-only-contract.md            # Contract: D.9/D.9a/D.9b/D.9c/D.9d ledger-only rule; no re-check / no table / no prose; invariants §8 cost-contract line
│   ├── phase-star-prefix-match.md         # Contract: D.9d Trigger prefix-match rule; open set justification; never-content-filter preservation
│   ├── diagnosis-subagent-verdict.md      # Contract: D.7/D.11 evidence-fetch envelope; subagent invocation shape; verdict JSON schema; gate-option-set constraint
│   └── status-table-policy.md             # Contract: § Ledger L.4 status-table-only-at-boundaries rule; four permitted surfaces
├── checklists/                            # (empty — reserved for /checklist skill)
└── tasks.md                               # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                            # MODIFIED — D.9 family subheading prose, new D.9d subheading, D.7/D.11 step-1 rewrite, G.4b/G.4d presentation-source update, new § Ledger L.4, new § Invariants §8, § Dispatch table row for D.9d
│   ├── clarify.md                         # UNCHANGED — FR-009 explicit scope boundary
│   ├── merge.md                           # UNCHANGED
│   ├── queue.md                           # UNCHANGED
│   ├── review.md                          # UNCHANGED
│   ├── status.md                          # UNCHANGED
│   └── watch.md                           # UNCHANGED
├── lib/
│   ├── reference-consumption.ts           # UNCHANGED — created by #394
│   ├── gate-vocabulary.ts                 # UNCHANGED — created by #396
│   └── clarification-batch-parser.ts      # UNCHANGED — created by #400
├── scripts/
│   └── refresh-help-snapshots.sh          # UNCHANGED — created by #398
└── tests/
    ├── playbook-verification.test.ts      # EXTENDED — new describe("403 — …") block with 403-1 through 403-7 + inline parseVerdict reference
    └── fixtures/
        ├── 394-mixed-event-shapes.ndjson              # UNCHANGED — created by #394
        ├── 394-actionable-live-state.json             # UNCHANGED — created by #394
        ├── 396-merge-conflicts-live-state.json        # UNCHANGED — created by #396
        ├── 396-someday-gate-live-state.json           # UNCHANGED — created by #396
        ├── 398-drift-auto.md                          # UNCHANGED — created by #398
        ├── help-snapshots/                            # UNCHANGED — created by #398
        ├── 400-batch-comment-*.md                     # UNCHANGED — created by #400
        ├── 400-directives-*.txt                       # UNCHANGED — created by #400
        ├── 403-phase-transition-live-state.json       # NEW — `phase:plan` transient transition (existing enumerated phase)
        ├── 403-phase-someday-live-state.json          # NEW — `phase:someday` transient transition (never-enumerated phase; prefix-match load-bearing check)
        ├── 403-d7-verdict-requeue.json                # NEW — D.7 diagnosis verdict recommending `Requeue (cockpit resume)`
        ├── 403-d11-verdict-resolved.json              # NEW — D.11 diagnosis verdict recommending `I've resolved it — advance the gate`
        └── 403-verdict-invalid-action.json            # NEW — verdict with `recommended_action: "Merge it"` (invalid — not in either gate's option set; guards the string-set constraint)
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md       # FR-009 explicit — untouched
├── merge.md         # Not a dispatch surface for D.7/D.11 or D.9 — untouched
├── queue.md         # Not a dispatch surface — untouched
├── review.md        # Not a dispatch surface — untouched
├── status.md        # Not a dispatch surface — untouched
└── watch.md         # Not a dispatch surface — untouched
```

Historical artifacts (deliberately untouched):

```text
specs/384-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/388-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/390-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/394-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/396-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/398-found-during-cockpit-v1/            # Status: Complete; byte-identical
specs/400-operator-requested-ux/              # Status: Complete; byte-identical
```

**Structure Decision**: Single-package playbook edits + one suite extension. The "structure" is the internal layout of `auto.md` (D.9 family subheading prose, new D.9d subheading, D.7/D.11 step-1 rewrites, G.4b/G.4d presentation-population source, new § Ledger L.4 subsection, new § Invariants §8, § Dispatch table row for D.9d) — see [data-model.md](./data-model.md) for the pre/post structural changes at each surface and the verdict + dispatch-class type shapes — plus the four contract files — see [contracts/](./contracts/) for the ledger-only rule, phase:* prefix-match rule, diagnosis subagent verdict schema, and status table policy.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (one playbook file's prose edits in ~seven sections, seven parser assertions, five fixture files) and matches the fix scope named in the spec (ledger-only cheap-by-contract, `phase:*` prefix-match row, subagent-only D.7/D.11 diagnosis, invariants cost-contract line, status-table restriction, blocking D.9 audit task). The design explicitly rejects:

- **Adding one new ledger-only row per enumerated phase label** (Q1=B rejected). Enumeration breaks the day a workflow adds a phase — and the failure mode would be a D.10 escalation gate firing on a routine `phase:someday` transition (the exact class of dispatch-overhead the spec exists to kill). The phase set is workflow-dependent and open-ended (speckit-feature and speckit-bugfix already differ per Assumption A6). Prefix-match (Q1=A) gives the open set one named row with explicit prefix-match semantics; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels.

- **Documenting `phase:*` as a wildcard category alongside existing D.9 wildcard-flavored entries without a dedicated row** (Q1=C rejected). The existing D.9 rows are specific-label rows (`waiting-for:address-pr-feedback`, `waiting-for:pr-feedback`, `waiting-for:children-complete`, `waiting-for:dependencies`) — none are wildcard categories. Making one a wildcard silently retro-fits a new semantic onto existing rows and obscures the audit deliverable's row-by-row justification (FR-008). D.9d as a named row with explicit prefix-match semantics is the additive, un-surprising addition.

- **Filtering `phase:*` upstream (generacy-side event stream)** (Q1=D rejected). Removing `phase:*` events from the watch stream removes the liveness heartbeat (the loop's cheapest liveness signal — see the §7 unfiltered-stream invariant from #394 and its liveness cross-check design) and grazes the never-content-filter invariant. Scope creep in the wrong direction. The efficiency win is at the dispatch layer, not the stream layer.

- **Design-time audit written into `plan.md` instead of a task** (Q2=B rejected). Design-time notes decay to "we looked, trust us" — the actual constraint (a misclassified actionable row would be silently muted by this very contract change) needs teeth and a deliverable. A blocking task in `tasks.md` with a table in the PR body (Q2=A) puts the audit output where review can actually check it.

- **Separate prerequisite issue filed and merged before this one** (Q2=C rejected). Over-processes an afternoon's audit table into a full dependency issue — the audit is a paragraph of prose in the PR body plus one task in `tasks.md`, not a shipping surface. C is process cost without benefit.

- **No audit needed; D.9 rows are known-correct by construction** (Q2=D rejected). Waves off a hazard the spec itself names a hard prerequisite. If a misclassification exists, this fix silently mutes it — that's exactly the class of regression a review process exists to catch. The audit is cheap; skipping it is not.

- **Strict-one-CLI-call parent envelope for D.7/D.11** (Q3=A rejected). Puts the parent in the position of reasoning about link topology — "the alert comment mentions a CI run URL; is that in-envelope or out?" — which is exactly the class of in-parent decision-making FR-003 exists to eliminate. Q3=D moves the boundary to a CLI verb (`generacy cockpit context <issue>`), which is a contract, not a judgment call.

- **Alert comment + one linked-log fetch in parent** (Q3=B rejected). Same failure mode as A — the parent still reasons about which link to follow, and the boundary between "one linked fetch" and "further fetches" is a call each session has to make. Contract, not judgment.

- **Parent follows one level of links from the alert body** (Q3=C rejected). Even more link-topology reasoning than B. The whole point of the fix is to move that reasoning into a subagent whose output is a structured verdict.

- **Numeric confidence `0.0–1.0` percentage in the verdict** (Q4=B rejected). False precision from an LLM judge. `low` / `medium` / `high` is the operator-usable resolution — the operator doesn't act differently on 0.72 vs 0.78, but does act differently on `low` vs `high`. And the semantic mapping is well-defined ("high" = subagent believes the recommended action will resolve the failure; "medium" = plausible but uncertain; "low" = a guess, operator should verify).

- **Free-form prose recommendation in the verdict** (Q4=C rejected). Loses the one-decision gate property. If the recommendation is prose ("try requeue, but consider skipping if the runner is flaky"), the parent has to interpret it into an option string, which is in-parent re-analysis — the thing FR-003 forbids. The exact-string constraint keeps the parent at zero re-analysis.

- **Rule-based option selection from `root_cause`/`evidence` fields in the parent** (Q4=D rejected). Quietly reintroduces parent-side inference dressed as presentation rules. FR-003 is that the parent maps the verdict directly onto the gate; a rule engine over the verdict fields is not "direct" — it's inference with extra steps.

- **Ledger-line-only startup sweep with no summary table** (Q5=A rejected). Sends the operator to file archaeology at the moment they most need a picture. The problem being fixed is ~30 tables per run, not this one table per session. Session-start orientation is a real operator need per Q5 clarification; the startup-sweep summary is a permitted exception to FR-002.

- **One-line summary of the startup sweep instead of a full table** (Q5=C rejected). Spends a turn to convey almost nothing. "swept N issues; M actionable dispatched" doesn't tell the operator *which* issues or *what states* — they'd re-run `cockpit status` in a follow-up turn, defeating the compression. Full table once is cheaper than compressed table + follow-up query.

- **Conditional startup-sweep table only when zero actionable dispatches** (Q5=D rejected). Adds a conditional presentation rule where the current shape is unconditional. Every session-start deserves the orientation table; the presence or absence of actionable dispatches doesn't change the operator's need to see the current state.

- **New library module for the verdict parser** (implementation direction rejected). The verdict shape is < 40 lines of validation code and is exercised by the `403 —` describe block only. Adding a `lib/diagnosis-verdict.ts` module would be over-abstraction — the runtime is Claude following the playbook prose; the parser exists as a reference against fixtures. Matches the `dispatchClassifier` inline reference at `tests/playbook-verification.test.ts:187` (added by #396). If future findings need a runtime-callable verdict validator (e.g., #390's post-review analyzer schema was migrated to a shared lib after the third caller), that's a follow-up finding.

- **Renumbering existing invariants when adding §8** (rejected). #388/#390/#394/#400's invariant numbers stay put; §8 is added at the end. Renumbering would break existing assertion string matches (§7 anchored in the 394 tests as `unfiltered stream consumption`) and rewrite the audit surface for no gain. Additive numbering is the S6/decay-countermeasures pattern applied at the invariants surface itself.

- **Extending the D.9 family with a new subheading for every server-side-owned state we might add** (rejected). D.9d is added because `phase:*` is an open set (prefix-match justifies a wildcard row); adding one-off enumerated ledger-only rows for each future server-side state is a mistake the spec's Assumption A6 explicitly points at ("The set of workflow phases is workflow-dependent and open-ended … justifying `phase:*` as a prefix-match row rather than an enumeration"). If a future waiting-for-* is genuinely open-set, it gets its own prefix-match row; if it's a specific label, it gets an enumerated row like D.9/D.9a/D.9b/D.9c.

- **Making the invariants §8 line assert the empty-tool-call count directly** (rejected). The line's shape — "must add no tool calls beyond the ledger append and no prose" — is descriptive-of-behavior, not assertable-as-a-count-at-runtime. The assertion happens in the audit runbook (transcript grep) and in the S6 verification suite (grep on the auto.md prose that the line is present). Counting tool calls at runtime would require instrumenting the harness — out of scope, and the descriptive prose is what future rewrites have to survive.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q5 decisions with rationale (resolved in `clarifications.md`; `research.md` restates them as design decisions with alternatives-rejected + implementation patterns from the #388/#390/#394/#396/#398/#400 arc).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (Verdict + DispatchClass types + validation rules + pre/post surface changes at each playbook edit site + assertion index + status-table anchor definition), [contracts/](./contracts/) (four contract files: ledger-only contract, `phase:*` prefix-match rule, diagnosis-subagent verdict schema, status table policy), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + operator smoke-test one-liner).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here. Includes the blocking D.9 misclassification audit task (FR-008) as the first item; audit deliverable is a table in the PR body columns `row | trigger label | one-line justification`.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **`phase:*` transitions are matched by one new ledger-only row D.9d with prefix-match semantics.** Any transition class whose token begins with the literal `phase:` prefix matches D.9d and dispatches ledger-line-only. The phase set is workflow-dependent and open-ended (speckit-feature and speckit-bugfix already differ; Assumption A6), so prefix-match beats enumeration by construction — a future workflow adding a phase never fires a D.10 escalation. Rejected: enumeration (Q1=B — breaks on any new phase), wildcard category on existing rows (Q1=C — silently retro-fits a new semantic), upstream filtering (Q1=D — removes the liveness heartbeat, grazes the never-content-filter invariant). | Q1=A |
| D2 | **The D.9 misclassification audit is a blocking task in this issue's `tasks.md`; the deliverable is a table in the PR body.** Every current D.9-class row (D.9 / D.9a / D.9b / D.9c / D.9d) with a one-line justification for its ledger-only status. Findings resolved in the same PR; misclassifications re-routed to the correct actionable class in-branch. Blocks FR-001 from being applied until the audit's findings are actioned. Rejected: design-time note in `plan.md` (Q2=B — decays to "we looked, trust us"), separate prerequisite issue (Q2=C — process cost without benefit), no audit needed (Q2=D — waves off a hazard the spec itself calls a hard prerequisite). | Q2=A |
| D3 | **The parent's failure-fetch envelope is exactly what `generacy cockpit context <issue>` returns.** No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent. Any further work (repro, log reads, version bisection, branch inspection, downstream artifact fetch) is dispatched to a diagnosis subagent. If the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), the fix is server-side in generacy — bundle-completeness pressure goes where it belongs. Rejected: strict-one-call (Q3=A — parent still reasons about link topology), one-linked-log-in-parent (Q3=B — same failure mode), one-level-of-links (Q3=C — even more link-topology reasoning). | Q3=D |
| D4 | **Diagnosis subagent returns `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"\|"medium"\|"high"}` where `recommended_action` is exactly one of the target gate's option strings.** For D.7: `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`. For D.11: `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`. The parent maps the verdict directly onto the #400 five-element gate: `recommended_action` renders as a "Suggested decision" line with `confidence` beside it; `root_cause`/`evidence` fill the context and evidence rows. The operator still chooses from the full option set. No in-parent re-analysis. Rejected: numeric confidence (Q4=B — false precision from an LLM judge), free-form recommendation (Q4=C — loses the one-decision gate property; parent has to interpret), structured-findings-plus-parent-rules (Q4=D — reintroduces parent-side inference dressed as presentation rules). | Q4=A |
| D5 | **The startup sweep ends with exactly one full epic status table (session-start orientation), added to FR-002's allowed list.** Between phase boundaries, the ledger line is the sole record of a dispatch; no other status tables between phase boundaries. Escalation-gate presentations retain the #400 five-element display unchanged. The problem being fixed is ~30 tables per run, not this one table per session. Rejected: ledger-only sweep with no summary (Q5=A — sends the operator to file archaeology), one-line summary (Q5=C — spends a turn to convey almost nothing), conditional-on-zero-actionable table (Q5=D — adds a conditional presentation rule where the current shape is unconditional). | Q5=B |

## Verification Layering

Static (necessary but not sufficient — the #384–#400 experience proved static-only fails at behavioral defects):

- `commands/auto.md` contains the substring `no status table, no prose recap` in the D.9, D.9a, D.9b, and D.9c subheading blocks (positive greppable anchor for the shared no-op contract).
- `commands/auto.md` contains a `### D.9d — \`phase:*\`` heading (positive anchor — the new row header exists).
- `commands/auto.md` contains `engine-owned phase transition` (positive anchor — the D.9d outcome vocabulary entry; distinguishes from `server-side-owned` used by D.9 / D.9a / D.9b / D.9c).
- `commands/auto.md` D.7 and D.11 step-1 prose contains `generacy cockpit context <issue>` (positive anchor — the sole-verb contract for each).
- `commands/auto.md` D.7 and D.11 step-1 prose does NOT contain `gh issue view --comments` (negative anchor — the smoking-gun for the ad-hoc-gh-chain pattern this fix replaces).
- `commands/auto.md` contains the verdict-schema string `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` (positive anchor — the D.7/D.11 subagent return contract).
- `commands/auto.md` § Invariants section contains a §8 numbered item whose opening substring is `A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;` (positive anchor — the load-bearing cost-contract line that survives rewrites).
- `commands/auto.md` § Ledger contains an L.4 subsection titled `Status table policy` (positive anchor — the new subsection that restricts table emission).
- `commands/clarify.md` shows zero changes on this branch (negative anchor — FR-009 pinned).
- Historical spec directories show zero changes on this branch.
- Existing `lib/*.ts` files show zero changes on this branch (negative anchor — no new library module).

Behavioral (evidence, not proof — seven assertions appended to `tests/playbook-verification.test.ts`):

- **403-1 (D.9 family subheadings state the no-re-check/no-prose contract)**: guards against a rewrite that drops the contract from any single D.9-family subheading — the S6/decay pattern instance for this fix.
- **403-2 (new D.9d subheading exists with `phase:*` prefix-match and ledger-line-only dispatch)**: presence + prose-shape check; the anchor a future rewrite has to survive.
- **403-3 (reference dispatch classifier prefix-matches `phase:*` to D.9d, not D.10)**: the load-bearing correctness assertion for FR-005 — a novel `phase:someday` token routes to D.9d ledger-only, not D.10 escalation. Fixture-driven.
- **403-4 (D.7/D.11 sole-verb contract + subagent-schema anchor)**: positive greps for the sole-verb, negative grep for the ad-hoc-gh-chain, subagent return-schema present verbatim. The FR-003 anchor.
- **403-5 (verdict reference type shape)**: JSON parse + option-set constraint validation; three fixture verdicts (D.7 valid, D.11 valid, invalid-action). The FR-004 anchor.
- **403-6 (invariants §8 cost-contract line present and numbered §8)**: the S6/decay-countermeasures anchor at the invariants surface itself. The FR-006 anchor.
- **403-7 (status table emission restricted to four permitted surfaces)**: table-header anchor grep across `auto.md` sections; only permitted surfaces contain the anchor. The FR-002 anchor.

True verifier:

- A re-run of the cockpit v1.5 auto-mode smoke test on a comparable 12-issue epic (matching the snappoll 2026-07-10 baseline as closely as feasible). Adherence targets: transient/ledger-only dispatches add ≤1 tool call and 0 prose blocks (audit: transcript grep); zero epic status tables between phase boundaries (excluding escalation gates and the startup-sweep summary; audit: transcript grep on the table-header anchor); zero multi-command in-parent diagnostics (every D.7/D.11 gate cites a subagent verdict — audit: transcript grep for the verdict JSON schema); zero D.10 escalation gates fired by `phase:*` transitions (audit: transcript grep on D.10 presentation blocks against `phase:*` tokens); the run's final cache-read size on the transcript is ≤ ~250k tokens (~50% of the 508k baseline). Adherence is probabilistic; the corrected prose + verdict assertions + regression fixtures remove the class of failure by construction. Empirical confirmation across a variety of runs (SC pattern parallel to #394's SC-001, #396's 0-silent-stalls, #398's 0 CLI-contract-drift diagnosis-round-burns, and #400's 1-batch-gate-per-N-question-clarification) is the true verifier.
