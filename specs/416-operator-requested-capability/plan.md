# Implementation Plan: Operator-requested capability from the cockpit auto-mode workstream (context: generacy-ai/tetrad-development#92)

**Feature**: Two additions to `packages/claude-plugin-cockpit/commands/auto.md`, both riding generacy-ai/generacy#935's scope primitive — (1) mid-run ad-hoc issues in epic mode via an add-issue flow (existing-ref add + new-issue file, the latter through an iterative filing gate) plus D.8 phase-queue gate enumeration of open ad-hoc work; (2) epic-less mode (stabilization runs) driven by a tracking issue whose task list is the live scope, exiting through a new scope-drained gate. First-sight events from #935 arrive as `initial: true` `issue-transition` events and dispatch through the existing table by carried state — one sentence in the event-consumption step, no new dispatch row.
**Branch**: `416-operator-requested-capability`
**Date**: 2026-07-13
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Close the operator-requested capability finding from the cockpit v1 auto-mode workstream (context: generacy-ai/tetrad-development#92) by extending `/cockpit:auto` with two operator-facing capabilities that ride on generacy#935's dynamic-scope engine contract. #935 introduces `cockpit_scope_add`, the `initial: true` flag on `issue-transition` events, and `cockpit_status` reporting terminal disposition per ref — this playbook feature consumes those primitives; **it does not ship engine changes** (spec § Out of scope). The generacy work is a hard dependency: **sequence after #935 ships and write the implementation against its shipped verb/tool contract** (spec Summary, verbatim). Both Q1 (terminal-state deferral to the engine's classifier) and Q5 (first-sight dispatch through the existing table via `initial: true`) cross-reference generacy#935's answered clarifications.

One playbook edit (`commands/auto.md`), plus a small pure-parser reference module for the intent-class recognizer and the ledger scope-mutation vocabulary, plus playbook-verification test extensions with fixtures:

1. **Invocation-form parsing at step 1 (parse arguments + pre-flight).** The existing `/cockpit:auto <epic-ref>` invocation form is retained unchanged. Two new invocation forms are added:
   - `/cockpit:auto --tracking <issue-ref>` — drive an *existing* tracking issue. The session parses `<issue-ref>`, prints it as the run's identity at startup, records it in the ledger header, and enters the main loop with the tracking ref as scope root.
   - `/cockpit:auto --new "<title>"` — create the tracking issue first. The session drafts the tracking-issue title/body from the operator-supplied title, presents a **creation-gated draft** (filing gate G.6 shape below — draft shown in full, approve/edit/skip; edit branch iterates), and on approval calls `gh issue create` to file the tracking ref, then prints + records it and enters the loop.

   The tracking ref (whether an existing epic-ref, an existing tracking issue, or a newly filed tracking issue) is printed at startup and recorded in the ledger header (`Tracking ref: <owner>/<repo>#<n>` on the first line above the dispatch stream). Under all three forms the tracking ref is the run's identity — this is the load-bearing property the isolation argument in the spec's Goal #2 relies on.

2. **Add-issue flow (both modes), triggered by operator intent-class recognition mid-conversation.** A new subsection `## Add-issue flow (mid-run)` after § Dispatch (before § Gate contract) documents the two intent classes and their dispatch. Recognition is described conversationally (natural-language variants for both "add existing ref" and "file new issue" trigger the flow; on ambiguity the session confirms intent before acting), never as a strict grammar — the safety net is structural (Q2 clarification anchor):
   - **Add-existing-ref path** (intent class: "also process owner/repo#N", "process #N too", …): requires a parseable explicit ref in the operator's message; on parse success the session calls `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<explicit-ref>)` (the #935 verb), then `cockpit_queue(issue=<explicit-ref>)` (the #935 issue-form of `cockpit_queue`), then writes a **scope-add ledger line** (`<explicit-ref> · scope-add · queued`). **No gate** — the operator's explicit instruction *is* the approval (Q2 clarification, verbatim). On unparseable input the session confirms intent before acting.
   - **File-new-issue path** (intent class: "file an issue for <bug> and process it", "open a bug for X", …): the session drafts title/body from the operator's description, presents the **filing gate G.6** (approve/edit/skip; edit branch iterative — see G.6 below), and on approval creates the issue via `gh issue create`, then scope-adds and queues as above. Every filing is gated because it is outward-facing — a misread intent surfaces as a skippable gate, never as an unreviewed outward action (Q2 rationale, verbatim).

3. **Filing gate G.6** (new gate class). Appended to § Gate contract after G.5, before the § AskUserQuestion invocation contract. Shape: a five-element presentation block (title, labels-if-any, body preview, filing target repo, filing target parent-tracking-ref) plus a single `AskUserQuestion` with three options — `Approve & file (Recommended)` / `Make changes` / `Skip (don't file)` — header `File`, `multiSelect: false`. The **edit branch is iterative** (Q3 clarification anchor): on `Make changes`, the operator provides revised title/body/labels conversationally in the same turn (built-in "Other" free-text is the fast path); the session redrafts the full issue (title + body + labels), re-presents the full revised draft, and re-fires the same G.6 gate. Loop terminates on `Approve & file` (create + scope-add + queue + ledger line) or `Skip (don't file)` (no create, no scope-add, no queue; ledger line noting the skip). What gets filed is exactly what was last shown — full-draft re-present each round, never a diff view (matches the load-bearing #400 principle: displayed and posted content cannot drift).

4. **D.8 phase-queue gate enumeration of open ad-hoc issues (epic mode only).** The D.8 presentation block is extended with a new line block: `Open ad-hoc issues in scope (added mid-run):` followed by numbered `<owner>/<repo>#<n> · <title> · <live-state>` per open ad-hoc ref (populated from a helper: `openAdHocIssues(trackingRef, ledger)` — refs added by scope-add whose live state per `cockpit_status` is non-terminal). Empty list omits the block entirely (no "none" placeholder). The G.5 gate options set is extended to include a soft-hold recommendation when open ad-hoc issues exist: the recommendation flips from `Queue P<next> (<N> issues) (Recommended)` to `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` (spec § Changes item 3 default), and `Queue P<next> (<N> issues)` becomes non-recommended but still selectable. Never silent, but never blocking either — the operator decides (spec Changes item 3, verbatim).

5. **Exit semantics — scope-drained gate G.7 (epic-less mode only).** Appended to § Gate contract after G.6, before the § AskUserQuestion invocation contract. Shape: five-element presentation block (tracking ref, total refs processed, per-ref disposition list from `cockpit_status`'s classifier — `completed` vs `not-planned` per Q1 clarification) plus a single `AskUserQuestion` with three options — `Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)` — header `Drain`, `multiSelect: false` (Q4 clarification anchor: default is `Keep watching`). On `Keep watching`, the loop resumes (returns to step 4's main loop, re-arms `cockpit_await_events` on the tracking ref). On `Add more work`, the loop resumes with a follow-up prose prompt inviting the operator to file or add. On `Finish`, the session closes the tracking issue via `gh issue close <tracking-ref>` (outward-facing, so the close itself IS the gate outcome — no second confirmation), prints the run summary per § L.6 (extended with per-ref disposition), and exits zero. **Terminality is whatever `cockpit_status` reports as a terminal disposition** — the engine's classifier owns it (Q1 clarification, verbatim); the playbook does not re-derive from raw GitHub states.

6. **Event-consumption step (main loop, step 4).** One additional sentence added to the "For each event in the batch" description: `initial-flagged events (connect-time snapshots or mid-run scope joins) dispatch normally through the existing table by carried state — the same path connect-time snapshots use today; the step-4a re-check remains authoritative and D.10 structurally cannot fire on them` (spec § Changes item 2 last paragraph + Q5 answer, condensed). **No new dispatch row.** Q5 anchor: the engine's `initial: true` flag arrives on `issue-transition` events carrying a known state class, so the existing table dispatches by carried state; the D.10 unrecognized-state row cannot fire because the state class is known.

7. **Ledger scope-mutation lines (§ Ledger action + outcome vocabulary).** Two new rows appended to the action-outcome table:
   - `scope-add (add-existing intent)` — `<action>` = `scope-add`, `<outcome>` = `queued` / `error: <description>`.
   - `scope-add (file-new intent)` — `<action>` = `filing-gate+scope-add`, `<outcome>` = `filed + queued (<new-ref>)` / `skipped (draft discarded)` / `error: <description>`.
   Scope mutations are **first-class ledger lines** (spec § Changes item 6, verbatim). The run summary § L.6 is extended with a `Scope growth:` line at the bottom (`started with N, added M, completed K` — spec § Changes item 6, verbatim; counts derived from the ledger).

8. **Restart semantics.** Unchanged principles (spec § Changes item 5, verbatim). A restarted session re-orients from the tracking ref's live task list — the scope survives restarts because it lives on the issue, not in session state; mutes/cursors stay session-local. One sentence added to § step 3 (startup sweep): under `--tracking <ref>` / `--new "<title>"`, the sweep reads the task list from the tracking issue and treats each live-state ref as a synthetic event (same shape as the epic-ref sweep).

Also ship:

- **`packages/claude-plugin-cockpit/lib/intent-recognition.ts`** — pure reference implementation of two intent-class recognizers:
  1. `parseAddExistingIntent(input: string): {ref: string} | null` — extracts an explicit `<owner>/<repo>#<n>` (or `#<n>` shorthand when the tracking ref supplies the repo) from natural-language variants of "also process", "process X too", "add X to scope". Returns `null` when no parseable ref is found (session confirms intent).
  2. `parseFileNewIntent(input: string): {topic: string} | null` — recognizes natural-language variants of "file an issue for X", "open a bug for X", "create an issue about X"; extracts the topic (X) as free text for the drafter subagent to expand into title/body. Returns `null` when no file-new intent is detected.

  Pure functions, no I/O, no CLI shell-out — matches the #394 `reference-consumption.ts` / #400 `clarification-batch-parser.ts` shape (small parser lives inline, playbook prose is authoritative at runtime, TS module is the machine-checkable reference against fixtures).

- **`packages/claude-plugin-cockpit/tests/fixtures/416-add-existing-*.txt`** and **`416-file-new-*.txt`** — intent-recognition fixtures covering: full `<owner>/<repo>#<n>` refs, `#<n>` shorthand, multiple refs in one message (first parseable ref wins), non-ref chat that must NOT trigger add-existing, "file an issue for X" full sentence, "open a bug for X" variant, ambiguous "look at X" that must NOT trigger file-new (confirm-on-ambiguity path).

- **`packages/claude-plugin-cockpit/tests/fixtures/416-filing-gate-*.md`** — filing-gate presentation fixtures covering: first-draft presentation shape, revised-draft after `Make changes` round-trip (byte-identical presentation shape, revised body), and a skipped-fill fixture (no create, no scope-add, ledger line only).

- **`packages/claude-plugin-cockpit/tests/fixtures/416-scope-drained-*.md`** — scope-drained gate fixtures covering: single-completed-disposition, mixed-completed-plus-not-planned disposition, all-not-planned disposition (still terminal per Q1 — engine's classifier owns it).

- **`packages/claude-plugin-cockpit/tests/fixtures/416-d8-adhoc-*.md`** — D.8 gate fixtures covering: no ad-hoc issues (block omitted, `Queue P<next>` recommended), one open ad-hoc issue (block present, `Hold` recommended), two open ad-hoc issues (block enumerates both, `Hold` recommended).

- **`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`** — extended with a new `describe("416 — operator-requested capability", () => …)` block containing four assertions (416-1 through 416-4, matching FR/SC anchors in `data-model.md`). Uses the same `resolve(__dirname, "fixtures", …)` idiom the 394/396/398/400 blocks already use.

The playbook edits themselves are:

- **`auto.md` § Instructions step 1**: prose block rewritten — three invocation forms recognized (`<epic-ref>`, `--tracking <issue-ref>`, `--new "<title>"`), tracking-ref computation, ledger-header line format extended.
- **`auto.md` § Instructions step 3 (startup sweep)**: one sentence added — under `--tracking` / `--new`, the sweep reads the task list from the tracking issue and treats each live-state ref as a synthetic event.
- **`auto.md` § Instructions step 4 (main loop)**: one sentence added to the "For each event in the batch" description — initial-flagged events dispatch normally through the existing table by carried state (Q5 anchor).
- **`auto.md` § Dispatch**: unchanged table rows D.1–D.11 (no new dispatch row per Q5).
- **`auto.md` § Dispatch D.8**: presentation block extended — new `Open ad-hoc issues in scope (added mid-run):` line block populated by `openAdHocIssues(trackingRef, ledger)`; G.5 gate recommendation flips when the list is non-empty.
- **`auto.md` § Add-issue flow (mid-run)** (NEW subsection, after § Dispatch, before § Gate contract): intent-class recognition prose (both classes, confirm-on-ambiguity, structural safety net); add-existing path (parseable ref → `cockpit_scope_add` → `cockpit_queue` → ledger, no gate); file-new path (drafter → G.6 filing gate → create → scope-add → queue → ledger). References `lib/intent-recognition.ts` as the shared parser rule.
- **`auto.md` § Gate contract G.6** (NEW gate row): filing gate — three options, iterative edit-branch (Q3 anchor).
- **`auto.md` § Gate contract G.7** (NEW gate row): scope-drained gate — three options, `Keep watching` recommended (Q4 anchor).
- **`auto.md` § Gate contract table**: two new rows appended (G.6 filing, G.7 scope-drained).
- **`auto.md` § AskUserQuestion invocation contract**: unchanged — G.6 and G.7 both fit Rules 1–3 (single-item questions array, ≤4 items, per-call fanout if fused with other gates).
- **`auto.md` § Ledger — L.4 status table policy**: one new row added — scope-drained gate (G.7) is a status-table surface (operator orientation before an exit decision).
- **`auto.md` § Ledger — action + outcome vocabulary**: two new rows appended (scope-add, filing-gate+scope-add).
- **`auto.md` § Ledger L.6 run summary**: extended with `Scope growth: started with N, added M, completed K` line + per-ref disposition list (only in epic-less mode).
- **`auto.md` § Invariants**: **no new invariant number** (matches #394's SC-007 / #396's no-§8 / #398's audit-lives-in-the-assertion / #400's no-invariant pattern). If a future audit shows drift in the scope-mutation contract or the intent-recognition rule, a follow-up finding adds an audit-shape assertion — not this fix's shape.
- **`auto.md` § Examples**: one new example (Example 3) appended — epic-less stabilization run showing three ad-hoc adds (one add-existing, two file-new), one filing-gate skip, one scope-drained gate cycle with `Keep watching`, one final `Finish` on the second scope-drained gate.

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime; also parsed for test-fixture verification); TypeScript (Vitest) for the intent-recognition parser + playbook-verification assertions. No runtime code change to the plugin's `lib/reference-consumption.ts` (#394), `lib/gate-vocabulary.ts` (#396), or `lib/clarification-batch-parser.ts` (#400).

**Primary Dependencies**: None new on the runtime side. Existing runtime: Claude Code slash-command executor + `AskUserQuestion` tool + the seven `cockpit_*` MCP tools. **Dependency: generacy-ai/generacy#935** ships `cockpit_scope_add`, the `initial: true` flag on `issue-transition` events, and `cockpit_status` reporting terminal disposition per ref; this playbook edit sequences *after* #935 lands and writes against its shipped verb/tool contract (spec Summary, verbatim). `cockpit_queue` gains an issue form (`cockpit_queue(issue=<ref>)`) in #935 — the add-issue flow uses that form. On the test side: Vitest — already a dev-dep in `packages/claude-plugin-cockpit/package.json` (#394 introduced, #396/#398/#400 extended).

**Storage**: Filesystem — one playbook file edited (`packages/claude-plugin-cockpit/commands/auto.md`); one new library module (`packages/claude-plugin-cockpit/lib/intent-recognition.ts`); one file extended (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`, adding the `416 —` describe block); ~12 new fixtures under `packages/claude-plugin-cockpit/tests/fixtures/` (intent shapes + filing-gate presentations + scope-drained gate presentations + D.8 adhoc-enumeration presentations). Sibling playbook files (`clarify.md`, `review.md`, `queue.md`, `watch.md`, `status.md`, `merge.md`) untouched — none drive the add-issue flow, filing gate, or scope-drained gate.

**Testing**:
- **Static** (necessary but proven insufficient by the #384–#400 arc — static-only fails at behavioral drift): greps for the presence of the new invocation-form flags (`--tracking`, `--new`), the new gate options (`Approve & file`, `Skip (don't file)`, `Keep watching`, `Add more work`, `Finish (close tracking issue + summary)`, `Hold — <M> open ad-hoc issue(s) in scope`), the ledger scope-mutation vocabulary (`scope-add`, `filing-gate+scope-add`), the D.8 ad-hoc enumeration header (`Open ad-hoc issues in scope (added mid-run):`), and the new gate rows in the § Gate contract table (`G.6`, `G.7`). Negative anchors: `Approve draft` / `Skip this question` two-option pair does NOT appear in a filing-gate context (would be #400 drift); no invariant §10 has been added; no new dispatch row appears in the § Dispatch table for first-sight events (Q5 anchor). See [quickstart.md](./quickstart.md) § Static checks.
- **Behavioral**: four new assertions appended to `tests/playbook-verification.test.ts` in a new `describe("416 — operator-requested capability", …)` block:
  - **(416-1) — intent-class recognition: add-existing parses explicit refs from NL, returns null on non-ref chat**: feed `416-add-existing-full-ref.txt`, `416-add-existing-shorthand.txt`, `416-add-existing-multiple-refs.txt`, and `416-add-existing-nonref-chat.txt` through `parseAddExistingIntent`; assert each returns the expected `{ref}` or `null`. Q2 spec anchor: the safety net is structural — recognition is generous; on ambiguity (null return) the session confirms intent.
  - **(416-2) — intent-class recognition: file-new parses natural-language topic, does NOT trigger on ambiguous "look at X"**: feed `416-file-new-file-an-issue.txt`, `416-file-new-open-a-bug.txt`, `416-file-new-create-an-issue.txt`, and `416-file-new-ambiguous-look-at.txt` through `parseFileNewIntent`; assert each returns the expected `{topic}` or `null`. Guards against a broadening regex that would auto-trigger on plain chat.
  - **(416-3) — filing-gate iterative edit preserves full-draft re-present shape**: parse the fixture pair `416-filing-gate-first-draft.md` and `416-filing-gate-revised.md`; assert both use the same five-element block layout (title, labels, body, filing target, parent-tracking-ref), so the presentation shape is identical between rounds — only the field contents differ. Q3 spec anchor: what gets filed is exactly what was last shown; presentation shape drift between rounds is the failure mode this assertion locks against.
  - **(416-4) — D.8 ad-hoc enumeration + scope-drained gate defaults are correct**: for `416-d8-adhoc-none.md`, `416-d8-adhoc-one.md`, `416-d8-adhoc-two.md`, assert the presence/absence of the `Open ad-hoc issues in scope (added mid-run):` block and the recommendation flip (`Queue P<next>` vs `Hold`); for `416-scope-drained-completed-only.md`, `416-scope-drained-mixed.md`, `416-scope-drained-not-planned-only.md`, assert the `Keep watching (Recommended)` option label is present and that per-ref disposition (`completed` vs `not-planned`) is rendered. Q1 + Q4 spec anchors.
- **True verifier**: an end-to-end cockpit auto-mode run driving a real tracking issue through the two success-criteria scenarios in the spec:
  - **Epic mode**: operator files a bug mid-run via the filing gate; it is processed to merge without restarting the session; the next phase-queue gate names it while open (spec Success criteria #1).
  - **Epic-less**: a stabilization conversation processes 3+ ad-hoc issues to terminal state and exits through the scope-drained gate with an accurate summary (spec Success criteria #2).
  - **Isolation**: two concurrent tabs on the same repo with distinct tracking issues — neither session's ledger references the other's refs (spec Success criteria #3). Isolation is by construction (per-tracking-ref MCP server processes + per-ref event buses from #935); the playbook's only isolation duty is to never widen scope beyond its own tracking ref, and the run summary lists only refs added under this tracking ref.

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Vitest runs in Node.js (repository-standard).

**Project Type**: Single-package playbook edits + one new library module + one suite extension. No cross-package changes to `packages/claude-plugin-cockpit/lib/reference-consumption.ts` (#394), `lib/gate-vocabulary.ts` (#396), or `lib/clarification-batch-parser.ts` (#400). Sibling playbook files (`clarify.md`, `review.md`, `queue.md`, `watch.md`, `status.md`, `merge.md`) untouched. Cross-repo changes to `generacy` are **out of scope**: `cockpit_scope_add`, the `initial: true` event flag, and per-ref terminal disposition all ship in generacy#935 (spec § Out of scope).

**Performance Goals**: N/A (playbook adherence + parser correctness, not throughput). Adherence targets:
- 0 unreviewed outward actions — every file-new intent lands on the G.6 filing gate; every close-tracking-issue action lands under `Finish` on G.7 (both confirmed by playbook prose + fixture assertions).
- 0 silent phase-queue events when open ad-hoc work exists — D.8 always enumerates the open ad-hoc list when non-empty and flips the recommendation to `Hold`.
- 0 scope leaks across concurrent tabs — the playbook prose forbids widening scope beyond the current tracking ref; isolation is verified by construction at the engine boundary (#935) and by the empty cross-ledger-ref assertion in the true-verifier smoke test.
- 100% of terminal-state classifications routed through `cockpit_status` — the playbook does NOT re-derive terminality from raw GitHub states (Q1 anchor).

**Constraints**:
- **Dependency: generacy-ai/generacy#935 ships first.** This spec explicitly sequences after #935 (spec Summary, verbatim). Attempting to implement before #935 lands would require the playbook to invent shims for `cockpit_scope_add`, the `initial: true` flag, and per-ref terminal disposition — the shims would then diverge from the shipped contract, violating the "authoritative live state via `cockpit_status`" trust rule. Q1 and Q5 both cross-reference #935's answered clarifications; the sequencing IS the safety guarantee.
- **Intent-class recognition is generous by design, gated by structure.** Q2 anchor: the add-existing path requires a parseable explicit ref to act on at all (parser returns `null` → confirm intent); the file-new path always lands on the G.6 filing gate (misread intent surfaces as a skippable gate, never as an unreviewed outward action). The playbook forbids strict grammars (option B rejected in Q2) and structured verbs (option C rejected in Q2) — natural language is the conversational medium, and enforcing pseudo-slash-commands inside a chat would collide with real skill invocations.
- **Filing gate edit branch is iterative, full-draft re-present, single-shot free-text is the fast path.** Q3 anchor: the operator can request changes conversationally, the session redrafts and re-presents the full revised draft each round (what gets filed is exactly what was last shown), until approve or skip. Single-shot "Other" free-text is the one-turn edit path (matches #400's Q1=A rule). Diff view rejected (option A in Q3 — arbitrary one-edit cap on an outward-facing artifact); reuse-as-is rejected (option C — mechanics of #400's per-question letter directives don't map onto one-issue editing).
- **Scope-drained gate default is `Keep watching`.** Q4 anchor: defaults are the reversible option; this mode's premise is that work arrives ad hoc, so drained-for-now is not done. `Finish` closes the tracking issue (outward-facing, so gated regardless) and is always one explicit pick away. No-default (option C in Q4) rejected — forfeits the suggested-decision convention every other gate follows.
- **First-sight events dispatch through the existing table by carried state; no new dispatch row.** Q5 anchor: `initial: true` `issue-transition` events arrive with a known state class, so the existing table dispatches by that class and the step-4a re-check remains authoritative. D.10 structurally cannot fire because the state class is known. Deferring the dispatch wiring as a TODO (Q5 option C rejected) would ship a landmine that both specs' Q&A have already decided against; committing to a dedicated D.12 row (Q5 option A rejected) or folding into a D.9-class row (Q5 option B rejected) both invent structure the shipped `initial: true` flag makes unnecessary.
- **Terminality is whatever `cockpit_status` reports as a terminal disposition.** Q1 anchor: the engine's classifier (tier ranks, curated states) owns terminality; the playbook does NOT re-derive from raw GitHub states. Closed-as-not-planned is terminal (the work is disposed either way); the run summary reports disposition per ref (completed vs not-planned) — that distinction lives in the accounting, not the exit condition.
- **Scope mutations are first-class ledger lines.** Spec § Changes item 6 verbatim: every add-issue action (both add-existing and file-new) writes a ledger line (`scope-add` or `filing-gate+scope-add` per § L action-outcome vocabulary), and the run summary § L.6 reports scope growth (`started with N, added M, completed K`).
- **Isolation is by construction — the playbook's only isolation duty is to never widen scope beyond its own tracking ref.** Spec § Goal #2 verbatim: concurrent auto conversations in other tabs (distinct tracking issues, own MCP server processes, per-ref event buses) are isolated at the engine boundary; the playbook simply must never fetch, dispatch, or ledger anything outside the tracking ref's scope. This is a scope-boundary rule, not a lock — no cross-session coordination is needed.
- **Restart semantics are unchanged — the scope survives restarts because it lives on the tracking issue.** Spec § Changes item 5 verbatim: a restarted session re-orients from the tracking ref's live task list; mutes/cursors stay session-local. The step 3 startup sweep under `--tracking` / `--new` is structurally identical to the existing epic-ref sweep — read the task list, treat each live-state ref as a synthetic event.
- **No new invariant number** (matches #394's SC-007 / #396's no-§8 / #398's audit-lives-in-the-assertion / #400's no-invariant pattern). If a future finding needs a numbered invariant at the § Invariants surface for the scope-mutation contract or the intent-recognition rule, that's its own finding.
- **Scope boundary**: `commands/auto.md` (§ Instructions step 1 rewrite, step 3 one-sentence add, step 4 one-sentence add, § Add-issue flow new subsection, § Gate contract G.6 + G.7 new rows + table extension, § Ledger L.4 + action-outcome vocabulary + L.6 extensions, § Examples new example, no new invariant), `lib/intent-recognition.ts` (new), `tests/playbook-verification.test.ts` (extended), ~12 new fixture files under `tests/fixtures/`. Sibling playbook files untouched. Sibling library files untouched. Historical spec directories untouched.

**Scale/Scope**: One file edited: `auto.md` (~90-130 net added lines — step 1 rewrite ~15-20 lines; step 3 one sentence; step 4 one sentence; § Add-issue flow new subsection ~25-35 lines; G.6 filing-gate contract ~20-25 lines; G.7 scope-drained gate contract ~20-25 lines; § Ledger table + L.6 additions ~8-12 lines; Example 3 ~15-20 lines). One new library file: `lib/intent-recognition.ts` (~80-120 lines of TS — two parsers, the shape types, no runtime coupling to the plugin). One file extended: `tests/playbook-verification.test.ts` (~120-160 net added lines — one new `describe` block with four assertions + fixture reads). ~12 new fixture files under `tests/fixtures/` (each ~15-50 lines). Zero files deleted, zero files renamed. No changes to `lib/reference-consumption.ts` (#394), `lib/gate-vocabulary.ts` (#396), or `lib/clarification-batch-parser.ts` (#400).

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #384 through #400 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/416-operator-requested-capability/
├── spec.md                                # Feature spec (read-only)
├── clarifications.md                      # Q1–Q5 with resolved answers (read-only)
├── plan.md                                # THIS FILE
├── research.md                            # Design decisions and rationale (Phase 0)
├── data-model.md                          # Types: AddExistingIntent, FileNewIntent, FilingGateDraft, ScopeDrainedGate, D8AdhocEnumeration, ScopeMutationLedgerLine; validation rules; § Add-issue flow spec; § Gate contract G.6/G.7 spec; § Ledger scope-mutation vocabulary
├── quickstart.md                          # Verification runbook (static grep + Vitest suite + operator smoke-test one-liner + isolation check)
├── contracts/
│   ├── invocation-forms.md                # Contract: three invocation forms (<epic-ref>, --tracking, --new); tracking-ref computation and ledger-header line
│   ├── intent-recognition.md              # Contract: parseAddExistingIntent, parseFileNewIntent; NL variants; confirm-on-ambiguity; structural safety net
│   ├── filing-gate.md                     # Contract: G.6 filing gate — three options, iterative edit branch, full-draft re-present, single-shot "Other" fast path
│   ├── scope-drained-gate.md              # Contract: G.7 scope-drained gate — three options, Keep watching recommended, per-ref disposition (Q1 anchor)
│   ├── phase-queue-adhoc-enumeration.md   # Contract: D.8 presentation extension — open-ad-hoc block, recommendation flip; never silent, never blocking
│   ├── initial-flagged-dispatch.md        # Contract: initial-flagged events dispatch through existing table by carried state; no new dispatch row (Q5 anchor)
│   └── ledger-scope-mutations.md          # Contract: scope-add + filing-gate+scope-add ledger action-outcome vocabulary; L.6 scope-growth summary line
├── checklists/                            # (empty — reserved for /checklist skill)
└── tasks.md                               # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   └── auto.md                            # MODIFIED — § Instructions step 1 rewrite, step 3 one-sentence add, step 4 one-sentence add, § Add-issue flow new subsection, § Dispatch D.8 presentation extension, § Gate contract G.6 + G.7 new + table extension, § Ledger L.4 + action-outcome + L.6 extensions, § Examples new Example 3
├── lib/
│   ├── reference-consumption.ts           # UNCHANGED — created by #394
│   ├── gate-vocabulary.ts                 # UNCHANGED — created by #396
│   ├── clarification-batch-parser.ts      # UNCHANGED — created by #400
│   └── intent-recognition.ts              # NEW — pure reference parsers (parseAddExistingIntent, parseFileNewIntent) + types
├── scripts/
│   └── refresh-help-snapshots.sh          # UNCHANGED — created by #398
└── tests/
    ├── playbook-verification.test.ts      # EXTENDED — new describe("416 — …") block with 416-1 through 416-4
    └── fixtures/
        ├── 394-*.ndjson                          # UNCHANGED — created by #394
        ├── 396-*.json                            # UNCHANGED — created by #396
        ├── 398-*.md                              # UNCHANGED — created by #398
        ├── 400-*.md                              # UNCHANGED — created by #400
        ├── 416-add-existing-full-ref.txt         # NEW — `also process owner/repo#42` NL variant with full ref
        ├── 416-add-existing-shorthand.txt        # NEW — `process #42 too` shorthand variant (tracking ref supplies the repo)
        ├── 416-add-existing-multiple-refs.txt    # NEW — message contains multiple refs; first parseable ref wins
        ├── 416-add-existing-nonref-chat.txt      # NEW — regular chat with no ref; parser returns null → confirm intent path
        ├── 416-file-new-file-an-issue.txt        # NEW — `file an issue for the flaky test in module X and process it` canonical phrasing
        ├── 416-file-new-open-a-bug.txt           # NEW — `open a bug for X` variant
        ├── 416-file-new-create-an-issue.txt      # NEW — `create an issue about X` variant
        ├── 416-file-new-ambiguous-look-at.txt    # NEW — `look at X` ambiguous chat; parser returns null → NO auto-trigger
        ├── 416-filing-gate-first-draft.md        # NEW — first-round G.6 presentation shape
        ├── 416-filing-gate-revised.md            # NEW — post-`Make changes` presentation shape; same five-element block, revised body
        ├── 416-d8-adhoc-none.md                  # NEW — D.8 presentation with empty ad-hoc list (block omitted, `Queue P<next>` recommended)
        ├── 416-d8-adhoc-one.md                   # NEW — D.8 presentation with one open ad-hoc (block present, `Hold` recommended)
        ├── 416-d8-adhoc-two.md                   # NEW — D.8 presentation with two open ad-hoc (block enumerates both, `Hold` recommended)
        ├── 416-scope-drained-completed-only.md   # NEW — G.7 presentation with all refs `completed`; `Keep watching (Recommended)` shown
        ├── 416-scope-drained-mixed.md            # NEW — G.7 presentation with mixed `completed` + `not-planned`; both dispositions rendered
        └── 416-scope-drained-not-planned-only.md # NEW — G.7 presentation with all refs `not-planned`; still terminal (Q1 anchor)
```

Sibling files (untouched — byte-identical across this branch):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md    # No add-issue flow, no filing gate — untouched
├── merge.md      # No add-issue flow, no filing gate — untouched
├── queue.md      # No add-issue flow, no filing gate — untouched
├── review.md     # No add-issue flow, no filing gate — untouched
├── status.md     # No add-issue flow, no filing gate — untouched
└── watch.md      # No add-issue flow, no filing gate — untouched
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
```

**Structure Decision**: Single-package playbook edits + one new library module + one suite extension. The "structure" is the internal layout of `auto.md` (Instructions steps 1/3/4 + new § Add-issue flow subsection + D.8 presentation extension + G.6/G.7 new gate contracts + § Ledger vocabulary + L.6 extension + new Example 3) — see [data-model.md](./data-model.md) for the pre/post structural changes at each surface and the parser's type shapes — plus the seven contract files — see [contracts/](./contracts/) for the invocation-forms, intent-recognition, filing-gate, scope-drained gate, phase-queue ad-hoc enumeration, initial-flagged dispatch, and ledger scope-mutation contracts.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (one playbook prose rewrite across several sections, one small pure-function TS module, four playbook-verification assertions, ~12 fixture files) and matches the fix scope named in the spec (mid-run add-issue flow, epic-less mode with scope-drained gate, D.8 ad-hoc enumeration, first-sight event dispatch through the existing table). The design explicitly rejects:

- **Re-deriving terminality from raw GitHub states in the playbook** (Q1=A/B rejected). The playbook forbids re-deriving terminality — the engine's classifier (tier ranks, curated states) already owns it via `cockpit_status`. A second classifier would drift from the first, and the "authoritative live state via `cockpit_status`" trust rule already governs every dispatch. Rejected: merged-PR-or-closed-issue (Q1=A — misses the closed-as-not-planned distinction), merged-PR-or-closed-as-completed-only (Q1=B — invents a second classification surface).
- **Literal-ish prefix match on add-issue intent recognition** (Q2=B rejected). "also process" and "file an issue for" as strict prefixes are the failure mode B tries to prevent (missed valid utterances) while ignoring the safety net it can't see: the add-existing path already requires a parseable ref (so a missed intent produces a silent no-op — the operator retries), and the file-new path always lands on the filing gate (so a misread intent surfaces as a skippable gate). B ships fragility with no benefit.
- **Explicit slash-command directives for add-issue** (Q2=C rejected). `/add <ref>` / `/file <title>` mints pseudo-slash-commands *inside* a conversation with a Claude session that already has a slash-command executor. Collision with real skill invocations (e.g., a hypothetical `/add` skill in a plugin) is the immediate failure mode; the deeper failure is that a conversation with a Claude session is the wrong surface to enforce a structured verb — natural language IS the medium.
- **Single-shot filing-gate edit** (Q3=A rejected). Arbitrary one-edit cap on an outward-facing artifact (a filed GitHub issue). The wrong place to economize turns — the extra rounds are cheap and the operator would work around the cap by using the built-in "Other" free-text as a second one-turn edit anyway, so A ships a cap that either wastes rounds or gets circumvented.
- **Reuse #400's filing-gate mechanics as-is** (Q3=C rejected). #400's Q3=B established iterative refinement for clarification batches, but the mechanics differ — per-question `Q<n>:` letter directives don't map onto editing one issue draft. C would leave the implementer inventing the adaptation anyway (whether letter directives apply, whether the `Make changes` re-loop even makes sense with one item, whether the "Other" fast path is one-shot or iterative). B ships a clean, ad-hoc-to-this-gate design.
- **`Finish` as the scope-drained gate default** (Q4=B rejected). Defaults are the reversible option; this mode's premise is that work arrives ad hoc, so drained-for-now is not done. B would flip the default toward the outward-facing (close-tracking-issue) action, which is the wrong direction for a suggested-decision convention. `Finish` is always one explicit pick away — no need to lower its cost.
- **No default on the scope-drained gate** (Q4=C rejected). Forfeits the suggested-decision convention every other gate follows (G.1 through G.5 all recommend). Removing a suggested decision to avoid mis-defaulting is defeatist — every one of the other gates faces the same "the default nudges" concern and just picks well.
- **Committing to a dedicated new dispatch row for first-sight events** (Q5=A rejected). D.12 would invent a new dispatch class for an event that carries a known state class (`initial: true` on `issue-transition`). The existing table dispatches by state class; adding a row for "state class is known but the event is a snapshot" would fork the dispatch on a concern that isn't dispatch-worthy. A also assumes #935 has NOT solved the dispatch problem, which is false (Q5 clarification cross-references #935's answered Q1).
- **Folding first-sight into an existing D.9-class row** (Q5=B rejected). D.9's rows are "server-side-owned, ledger-only, no re-check" — the opposite of the "re-check + dispatch normally" behavior the initial-flagged event needs. Folding B into D.9 would either ledger-only initial-flagged events (missing the dispatch) or change D.9's semantics for one edge case (§ Invariants #8 regression).
- **Explicitly deferring the first-sight dispatch as a TODO** (Q5=C rejected). Ships a TODO landmine for a decision both specs' Q&A have already made. #935's Q1 answered `initial: true` on `issue-transition`; this spec's Q5 aligns to that answer. Deferral would mean the playbook lands with a "figure out how initial-flagged events dispatch" comment while the engine already sends them with a shape the existing table handles by construction. C is the failure mode this cross-referenced Q&A prevents.
- **Silent phase-queue on open ad-hoc work** (spec § Changes item 3 rejected implicitly). "Queueing while ad-hoc work is open" is *possible* but never *silent* — the D.8 presentation always enumerates the open ad-hoc list when non-empty and the recommendation flips to `Hold`. Silencing (auto-queueing regardless of ad-hoc state, or omitting the enumeration when a phase is ready) would take a decision-worthy state and hide it, exactly the failure mode gates exist to prevent.
- **Blocking phase-queue on open ad-hoc work** (spec § Changes item 3 rejected implicitly). "Queueing while ad-hoc work is open" is *possible* — the gate options include `Queue P<next>` when open ad-hoc work exists (it's non-recommended but selectable). Blocking would take a decision-worthy state and rob the operator of their decision — the operator may have deliberately parked the ad-hoc work for later, and the phase queue is orthogonal. Never blocking, never silent — the operator decides.
- **Adding an invariant §10 "scope mutations are ledger-lined"**. Rejected as scope creep. The rule lives in § Add-issue flow and § Ledger action-outcome vocabulary; a numbered invariant would be a belt-and-suspenders duplicate — same anti-pattern SC-007 of #394 rejected, #396 rejected for the D.10 tightening, #398 rejected for the `--help` audit, and #400 rejected for the batched clarification gate. If future drift shows the invariants surface is needed, that's a follow-up finding.
- **Adding runtime-side isolation coordination** (spec § Goal #2 rejected implicitly). Isolation is by construction — the engine's #935 primitive (per-tracking-ref MCP server processes + per-ref event buses) enforces isolation at the boundary; the playbook simply does not widen scope beyond its own tracking ref. Cross-session locks, shared state, or coordination channels would invent a mechanism the boundary already provides.
- **Adding a second `AskUserQuestion` for the `Finish` close-tracking-issue action** (spec § Changes item 4 rejected implicitly). Rejected because the G.7 gate IS the outward-facing confirmation — a second gate would be a double-prompt for an action the operator has already selected on G.7. Every outward-facing action lands on exactly one gate; that's the pattern G.1 through G.5 already follow (post + advance are single-gate on G.1, request-changes review is single-gate on G.2, cockpit_queue is single-gate on G.5).
- **Implementing before generacy#935 ships** (spec Summary sequencing rejected implicitly). Attempting to implement before #935 lands would require shimming `cockpit_scope_add`, the `initial: true` flag, and per-ref terminal disposition. The shims would then diverge from the shipped contract, violating the "authoritative live state via `cockpit_status`" trust rule and the "consume the tool server's typed events" contract from #406. Sequencing after #935 IS the safety guarantee.

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — Q1–Q5 decisions with rationale (resolved in `clarifications.md`; `research.md` restates them as design decisions with alternatives-rejected + implementation patterns + cross-reference to generacy#935).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (types + validation rules + § Add-issue flow spec + G.6/G.7 gate specs + § Ledger scope-mutation vocabulary + pre/post surface changes at each playbook edit site), [contracts/](./contracts/) (seven contract files: invocation forms, intent recognition, filing gate, scope-drained gate, phase-queue ad-hoc enumeration, initial-flagged dispatch, ledger scope mutations), [quickstart.md](./quickstart.md) (verification runbook — static greps + Vitest suite + operator smoke-test one-liners for the three success-criteria scenarios).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Terminality is whatever `cockpit_status` reports as a terminal disposition; the playbook does NOT re-derive from raw GitHub states.** The engine's classifier (tier ranks, curated states) already owns it, and "authoritative live state via `cockpit_status`" is the loop's standing trust rule. Under this definition, closed-as-not-planned is terminal (the work is disposed either way); the run summary reports disposition per ref (completed vs not-planned). That distinction lives in the accounting, not the exit condition. Rejected: merged-PR-or-closed-any (Q1=A — misses the not-planned distinction), merged-PR-or-closed-as-completed-only (Q1=B — invents a second classification surface). | Q1=C |
| D2 | **Intent-class recognition with confirm-on-ambiguity.** Natural-language variants of "add existing ref" and "file new issue" both trigger; the session confirms intent before acting when ambiguous. Recognition is generous by design because the safety net is structural: the add-existing path requires a parseable explicit ref to act on at all, and the file-new path always lands on the filing gate — a misread intent surfaces as a skippable gate, never as an unreviewed outward action. Rejected: literal-ish prefix (Q2=B — ships fragility with no benefit), explicit slash-command directive (Q2=C — collides with real skill invocations; wrong surface for structured verb enforcement). | Q2=A |
| D3 | **Filing gate G.6 edit branch is iterative — full-draft re-present each round until approve or skip.** Inherits #400's load-bearing principle (the change loop runs until the operator approves what will actually be posted) while being honest that the mechanics differ from #400's per-question letter directives. Single-shot "Other" free-text is the one-turn fast path; explicit `Make changes` selection enters the iterative branch. What gets filed is exactly what was last shown — full-draft re-present each round, never a diff view. Rejected: single-shot one-edit cap (Q3=A — arbitrary cap on outward-facing artifact), reuse-#400-as-is (Q3=C — mechanics don't map onto one-issue editing). | Q3=B |
| D4 | **`Keep watching` is the recommended default on the scope-drained gate G.7.** Defaults should be the reversible option, and this mode's premise is that work arrives ad hoc — drained-for-now is not done, especially mid-stabilization. `Finish` closes the tracking issue (outward-facing, so it's gated regardless) and is always one explicit pick away. Rejected: `Finish` default (Q4=B — flips default toward outward-facing action), no default (Q4=C — forfeits suggested-decision convention every other gate follows). | Q4=A |
| D5 | **First-sight events dispatch through the existing table by carried state; no new dispatch row.** `initial: true` `issue-transition` events (both connect-time snapshots and mid-run scope joins) carry a known state class, so the existing table dispatches by that class and the step-4a re-check remains authoritative. D.10 structurally cannot fire because the state class is known. The `auto.md` change is one sentence in the event-consumption step (§ Instructions step 4) plus a fixture. Rejected: dedicated D.12 row (Q5=A — invents new dispatch class for concern that isn't dispatch-worthy), fold into D.9 (Q5=B — D.9's ledger-only shape is the opposite of "dispatch normally"), defer as TODO (Q5=C — ships a landmine after both specs' Q&A have decided). | Q5 committed |

## Verification Layering

Static (necessary but not sufficient — the #384–#400 experience proved static-only fails at behavioral defects):

- `commands/auto.md` § Instructions step 1 contains the exact substrings `--tracking <issue-ref>` and `--new "<title>"` (positive greppable anchors for the two new invocation forms).
- `commands/auto.md` § Add-issue flow subsection exists (positive anchor for the new subsection; grep `## Add-issue flow (mid-run)`).
- `commands/auto.md` § Gate contract G.6 contains the substrings `Approve & file (Recommended)` / `Make changes` / `Skip (don't file)` (positive anchors for the three-option filing gate).
- `commands/auto.md` § Gate contract G.7 contains the substrings `Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)` (positive anchors for the three-option scope-drained gate with `Keep watching` default per Q4).
- `commands/auto.md` § Dispatch D.8 presentation block contains the substring `Open ad-hoc issues in scope (added mid-run):` (positive anchor for the D.8 enumeration).
- `commands/auto.md` § Gate contract table contains a G.6 row and a G.7 row (positive anchor for the table extension).
- `commands/auto.md` § Ledger action-outcome vocabulary contains the substrings `scope-add` (as `<action>`) and `filing-gate+scope-add` (as `<action>`) (positive anchors for the ledger vocabulary extension).
- `commands/auto.md` § Ledger L.6 run summary contains the substring `Scope growth:` (positive anchor for the summary extension).
- `commands/auto.md` § Instructions step 4 contains a sentence referencing `initial-flagged events` (positive anchor for the one-sentence add per Q5).
- `commands/auto.md` § Dispatch table does NOT contain a D.12 row (negative anchor — Q5 committed to no new dispatch row).
- `commands/auto.md` § Invariants section does NOT contain a `10.` numbered row (negative anchor — no invariant §10 added per plan design).
- `lib/intent-recognition.ts` exists, exports `parseAddExistingIntent` and `parseFileNewIntent`, and its type exports match the shapes documented in `data-model.md`.
- Historical spec directories show zero changes on this branch.

Behavioral (evidence, not proof — four assertions appended to `tests/playbook-verification.test.ts`):

- **416-1 (add-existing NL recognition)**: `parseAddExistingIntent` returns the expected ref for full and shorthand phrasings; returns `null` for non-ref chat. Guards against a broadening regex that would auto-trigger scope-add on plain chat (violating the "confirm on ambiguity" rule).
- **416-2 (file-new NL recognition)**: `parseFileNewIntent` returns the expected topic for `file an issue for X` / `open a bug for X` / `create an issue about X`; returns `null` for `look at X` (ambiguous). Guards against a broadening regex that would auto-trigger the filing gate on plain chat.
- **416-3 (filing-gate iterative edit shape)**: first-draft and revised-draft fixtures both use the five-element block layout (title, labels, body, filing target, parent-tracking-ref); presentation shape is identical between rounds — only field contents differ. Guards against a "diff view" refactor that would break the full-draft re-present rule (Q3 anchor).
- **416-4 (D.8 ad-hoc enumeration + scope-drained gate defaults)**: D.8 fixtures show the `Open ad-hoc issues in scope (added mid-run):` block presence/absence and recommendation flip; G.7 fixtures show `Keep watching (Recommended)` and per-ref disposition (Q1 + Q4 anchors combined).

True verifier:

- An end-to-end cockpit auto-mode run driving a real tracking issue through the three success-criteria scenarios:
  1. **Epic mode**: operator files a bug mid-run via the filing gate; it is processed to merge without restarting the session; the next phase-queue gate names it while open.
  2. **Epic-less**: a stabilization conversation processes 3+ ad-hoc issues to terminal state and exits through the scope-drained gate with an accurate summary.
  3. **Isolation**: two concurrent tabs on the same repo with distinct tracking issues — neither session's ledger references the other's refs.

  Empirical confirmation across a variety of runs (SC pattern parallel to #394's SC-001, #396's 0-silent-stalls, #398's 0 CLI-contract-drift diagnosis-round-burns, and #400's 1-AskUserQuestion-per-batch adherence) is the true verifier — the parser tests and static greps are the machine-checkable backstop against silent regression.
