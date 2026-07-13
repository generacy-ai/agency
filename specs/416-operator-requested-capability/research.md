# Research: Operator-requested capability from the cockpit auto-mode workstream

**Feature**: See [spec.md](./spec.md)
**Date**: 2026-07-13
**Status**: Complete

## Overview

Phase 0 research restates each clarification decision (Q1–Q5, resolved in [clarifications.md](./clarifications.md)) as a design decision, records the alternatives rejected with their rationale, and links each decision to its implementation-pattern anchor. The design is not novel: the fix inherits patterns from #394 (reference-parser lives in `lib/`, playbook prose is authoritative at runtime), #388/#390 (five-element presentation block + fused single-`AskUserQuestion` gate), #400 (batched clarification gate + iterative edit branch + drift-audit via static grep + Vitest fixtures), and #406/#924 (typed events from the tool server, cursor-recovery taxonomy). The only genuinely new surfaces are:

- **Add-issue flow** — one new intent-class recognizer routing to two paths (add-existing → scope-add + queue; file-new → filing gate → create + scope-add + queue).
- **Filing gate G.6** — a new gate class for outward-facing issue creation with an iterative edit branch (mechanically distinct from G.1's per-question letter directives).
- **Scope-drained gate G.7** — a new gate class for epic-less exit, with `Keep watching` as the default.
- **D.8 ad-hoc enumeration** — one presentation-block extension in an existing dispatch row.
- **Ledger scope-mutation vocabulary** — two new rows in the action-outcome table + one summary line in L.6.

Everything else is playbook prose. The only new runtime-adjacent code is the intent-recognition parser (`lib/intent-recognition.ts`) — small, pure, no I/O, matching #394's `reference-consumption.ts` / #400's `clarification-batch-parser.ts` shape.

## Cross-repo dependency: generacy-ai/generacy#935

The spec Summary states this explicitly: **sequence after #935 ships and write the implementation against its shipped verb/tool contract**. #935 is the dynamic-scope engine contract that introduces the primitives this playbook consumes:

- **`cockpit_scope_add(scopeRoot, addRef)`** — MCP tool that adds `addRef` to the live task list of the scope root (an epic ref or a tracking ref). Both the add-existing intent and the file-new intent's post-creation path route through this verb. Without #935, the playbook would need to shim scope-add (e.g., via a direct GitHub task-list edit), and the shim would diverge from the engine's shape whenever #935 lands.
- **`initial: true` flag on `issue-transition` events** — the engine emits `issue-transition` events with `initial: true` for both connect-time snapshots and mid-run scope joins. The playbook dispatches these through the existing table by carried state, with the step-4a re-check remaining authoritative. Q5's decision anchor cross-references #935's answered Q1 that pinned this event shape.
- **`cockpit_status` reporting terminal disposition per ref** — the engine's classifier (tier ranks, curated states) reports each ref's terminal disposition (`completed` / `not-planned` / non-terminal). Q1's decision anchor defers to this classifier for both the scope-drained gate exit condition (any non-terminal ref → gate does not fire) and the run summary's per-ref disposition rendering (completed vs not-planned lives in the accounting).
- **`cockpit_queue(issue=<ref>)`** — the issue-form of `cockpit_queue`, extending the existing phase-form (`cockpit_queue(epic, phase)`) to accept a single issue ref. Both add-issue paths call this after scope-add to enqueue the issue for the standard cluster-account workflow.

The dependency is a hard sequencing constraint, not a coupling. Once #935 ships, this playbook consumes its shipped contract; if #935's shape shifts between spec and ship, the playbook update is a mechanical rename (verb name, param name) — the pattern here holds regardless of exact naming.

## Q1 — Terminal-state definition

**Decision**: Defer to whatever `cockpit_status` reports as a terminal disposition — the engine's classifier owns it.

**Rationale**: The state classifier (tier ranks, curated states) already owns terminality; a playbook re-derivation from raw GitHub states is a second classifier that will drift from the first, and "authoritative live state via `cockpit_status`" is the loop's standing trust rule. Under the engine's definition, closed-as-not-planned is terminal (the work is disposed either way — the intent was to close it, and the loop's job is to observe closure, not to re-litigate disposition). The run summary reports disposition per ref (completed vs not-planned), which is where that distinction lives — in the accounting, not the exit condition.

**Alternatives rejected**:
- **Q1=A (Merged PR OR closed issue, any close reason)** — Correct-looking but re-derives from raw GitHub states. The moment the engine adds a new terminal disposition (e.g., a "duplicate" close reason that the classifier treats as terminal), the playbook's derivation lags and either widens or narrows relative to the classifier. Rejected because it invents a second classification surface.
- **Q1=B (Merged PR OR closed-as-completed issue only, excluding not-planned)** — Same drift risk as A, plus it disagrees with the classifier on not-planned: the classifier treats not-planned as terminal (the work is disposed), and B would force the playbook to keep watching a not-planned ref indefinitely. Rejected as both wrong on the merits (not-planned IS disposed) and duplicative of the classifier's job.

**Implementation pattern**: The scope-drained gate (G.7) checks each task-list ref's disposition via `cockpit_status`; the gate fires when every ref is terminal. The run summary § L.6 renders per-ref disposition (`<ref> · <completed|not-planned>`) from the same source. **No terminality derivation in playbook prose** — every check is `cockpit_status` → terminal-flag.

**Key source**: spec.md § Success criteria + § Changes item 4; clarifications.md Q1; generacy#935 (engine-side classifier owner).

## Q2 — Add-issue trigger recognition

**Decision**: Intent-class match — natural-language variants of "add existing ref" and "file new issue" both trigger the add-issue flow; the session confirms intent before acting when ambiguous.

**Rationale**: The operator is conversing with a Claude session; natural language is the medium of the conversation. Enforcing a strict prefix grammar (option B) or a structured verb (option C) fights this and, for C, mints pseudo-slash-commands *inside* a conversation with a Claude session that already has a real slash-command executor — collision with actual skill invocations is the immediate failure mode. The misfire risk A worries about is structurally contained: the add-existing path requires a parseable explicit ref to act on at all (so a missed intent produces a silent no-op — the operator retries), and the file-new path *always* lands on the filing gate G.6 (so a misread intent surfaces as a skippable gate, never as an unreviewed outward action). Recognition can afford to be generous because the gates are the safety net.

**Alternatives rejected**:
- **Q2=B (Literal-ish prefix match: "also process" / "file an issue")** — Rejected because it fights the medium (NL conversation) without benefit. The safety net for a missed prefix match is the operator retrying with a different phrasing, but the safety net for A's generosity is the parser's null return (add-existing) or the filing gate's skip option (file-new), which are already ergonomic. B ships strictness with no correctness win.
- **Q2=C (Explicit `/add <ref>` or `/file <title>`)** — Rejected because it collides with real slash-command invocations (a hypothetical `/add` skill in another plugin is now ambiguous), and because it forces the operator to remember a structured verb inside a conversation, which is the wrong surface for that memory. The Claude session already has a slash-command executor; adding pseudo-slash-commands inside a conversation is a second, weaker executor.

**Implementation pattern**: Two pure recognizers in `lib/intent-recognition.ts`:
- `parseAddExistingIntent(input)` — regex + heuristics for "also process X", "process X too", "add X to scope"; extracts the first parseable ref (`<owner>/<repo>#<n>` or `#<n>` shorthand). Returns `null` when no ref is found; the playbook uses that null as the "confirm intent" signal.
- `parseFileNewIntent(input)` — regex + heuristics for "file an issue for X", "open a bug for X", "create an issue about X"; extracts the topic (X) as free text. Returns `null` on ambiguous chat.

The playbook prose describes the recognizers conversationally ("if the operator's message reads like an add-existing intent...") and references `lib/intent-recognition.ts` as the machine-checkable shape. Runtime is Claude interpreting the prose; the parser exists for fixture-verification, matching #394's `reference-consumption.ts` / #400's `clarification-batch-parser.ts` pattern.

**Key source**: spec.md § Changes item 2 + § Assumptions; clarifications.md Q2; #400's iterative-edit-branch pattern (source of the "gates are the safety net" argument).

## Q3 — Filing-gate "edit" affordance

**Decision**: Iterative refinement — the operator can request changes conversationally; the session redrafts and re-presents the full revised draft each round, until approve or skip.

**Rationale**: Inherits #400's Q3=B principle (the change loop runs until the operator approves what will actually be posted) while being honest that the mechanics differ from #400. #400's `Q<n>:` letter directives are for per-question option-letter selection — that shape doesn't map onto editing one issue draft. The load-bearing invariant is: **what gets filed is exactly what was last shown**. Full-draft re-present each round makes this mechanical; a diff view would break the display-vs-posted symmetry. Single-shot "Other" free-text is the one-turn fast path (matches #400's Q1=A "one-shot" affordance for simple edits); explicit `Make changes` selection enters the iterative branch.

**Alternatives rejected**:
- **Q3=A (Single-shot inline edit, no re-loop)** — Arbitrary one-edit cap on an outward-facing artifact (a filed GitHub issue). The wrong place to economize turns — the extra rounds are cheap, and the operator would work around the cap by using the built-in "Other" free-text as a second one-turn edit anyway. Rejected because it ships a cap that either wastes rounds (operator can't refine past one turn) or gets circumvented (operator uses "Other" as a second edit).
- **Q3=C (Reuse #400's mechanics as-is)** — #400's Q3=B established iterative refinement, but the mechanics differ. Per-question `Q<n>:` letter directives are for lettered options; a filing gate has one item (the drafted issue) with a title/body/labels tuple. C would leave the implementer inventing the adaptation anyway (whether letter directives apply, whether the `Make changes` re-loop even makes sense with one item, whether "Other" fast path is one-shot or iterative). Rejected because it defers the design work by pretending the mechanics carry over.

**Implementation pattern**: G.6 filing gate is a three-option `AskUserQuestion` (`Approve & file (Recommended)` / `Make changes` / `Skip (don't file)`) with a five-element presentation block above it (title, labels, body, filing target repo, filing target parent-tracking-ref). On `Make changes`, the operator provides revised content conversationally in the same turn (built-in "Other" free-text is the one-turn edit path), the session redrafts the entire issue, and re-presents the full revised draft plus the same G.6 gate. Loop terminates on `Approve & file` (create + scope-add + queue + ledger) or `Skip (don't file)` (no create, ledger noting skip). **No diff view; no partial re-present.** The full-draft re-present is what makes the "what gets filed is exactly what was last shown" invariant mechanically enforceable.

**Key source**: spec.md § Changes item 2; clarifications.md Q3; #400 spec/plan (source of the iterative-edit-branch principle + the full-draft re-present rule).

## Q4 — Scope-drained gate default

**Decision**: `Keep watching` is the recommended default when the scope-drained gate G.7 fires.

**Rationale**: Defaults should be the reversible option, and this mode's premise is that work arrives ad hoc — drained-for-now is not done, especially mid-stabilization. The scope-drained gate fires when every task-list ref is terminal, but "terminal" doesn't mean the operator is done — they may add more work in the next hour. `Keep watching` re-enters the main loop (reversible — just continue waiting); `Finish` closes the tracking issue (irreversible-ish — reopening a closed tracking issue works, but the run's ledger has already been sealed with the summary). Making `Finish` the default flips the default toward the outward-facing action, which is the wrong direction for a suggested-decision convention.

**Alternatives rejected**:
- **Q4=B (`Finish` as default)** — Flips the default toward the outward-facing (close-tracking-issue) action. That's the wrong direction for a suggested-decision convention: defaults are the reversible option, and closing a tracking issue is the least reversible outcome of the three options. B would also fight the mode's premise (work arrives ad hoc; drained-for-now is not done). Rejected.
- **Q4=C (No default; force explicit choice)** — Forfeits the suggested-decision convention every other gate follows (G.1 through G.5 all recommend). Removing a suggested decision to avoid mis-defaulting is defeatist — every one of the other gates faces the same "the default nudges" concern and just picks well. C would also break the § AskUserQuestion presentation shape convention across the playbook. Rejected.

**Implementation pattern**: G.7 scope-drained gate is a three-option `AskUserQuestion` (`Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)`) with a five-element presentation block above it (tracking ref, total refs processed, per-ref disposition list from `cockpit_status`, tracking-ref state, current session-mute set). On `Keep watching`, the loop resumes (return to step 4's main loop, re-arm `cockpit_await_events`). On `Add more work`, the loop resumes with a follow-up prose prompt inviting the operator to file or add. On `Finish`, the session closes the tracking issue via `gh issue close <tracking-ref>` (the G.7 gate IS the outward-facing confirmation — no second gate), prints the run summary per § L.6 (extended with per-ref disposition), and exits zero.

**Key source**: spec.md § Changes item 4; clarifications.md Q4; #400's Q4=A pattern (zero-directive is no-op re-present — same "default is reversible option" principle).

## Q5 — First-sight dispatch: no new row, dispatch through the existing table

**Decision**: First-sight events are `initial: true` `issue-transition` events carrying a known state class. They dispatch through the existing table by carried state (D.1–D.11), with the step-4a re-check remaining authoritative. **No new dispatch row.** The `auto.md` change is one sentence in the event-consumption step + a fixture.

**Rationale**: This clarification's decision is a cross-issue alignment with generacy#935's Q1, which pinned first-sight as `initial: true` on `issue-transition`. Because #935 answered its Q1 with a shape that carries a known state class, this spec can commit rather than defer (Q5's C option): the existing dispatch table already handles known state classes, and the step-4a re-check ("live state is authoritative") already protects against advisory-vs-live divergence. D.10 (unrecognized state) structurally cannot fire on an initial-flagged event because the state class is known — the initial-flag is orthogonal to the classification decision.

**Alternatives rejected**:
- **Q5=A (Dedicated D.12 row for first-sight)** — Invents a new dispatch class for an event that carries a known state class. The existing table dispatches by state class; a D.12 row would fork the dispatch on a concern that isn't dispatch-worthy (the initial-flag), doubling the dispatch surface with no correctness benefit. Rejected. A also assumes #935 has NOT solved the dispatch problem, which is false — #935's Q1 shipped the `initial: true` flag precisely so the playbook could dispatch by carried state.
- **Q5=B (Fold into D.9-class row)** — D.9's rows are "server-side-owned, ledger-only, no re-check" — the opposite of the "re-check + dispatch normally" behavior the initial-flagged event needs. Folding B into D.9 would either ledger-only initial-flagged events (missing the dispatch entirely — a `waiting-for:clarification` snapshot would ledger-only instead of routing to D.1) or change D.9's semantics for one edge case (§ Invariants #8 regression: ledger-only rows are cheap by contract). Rejected on both branches.
- **Q5=C (Defer as TODO)** — Ships a landmine after both specs' Q&A have decided. #935's Q1 answered `initial: true` on `issue-transition`; this spec's Q5 aligns to that answer. C's deferral would mean the playbook lands with a "figure out how initial-flagged events dispatch" comment while the engine already sends them with a shape the existing table handles by construction. Rejected — deferring a decision that's already been made is the failure mode Q&A exists to prevent.

**Implementation pattern**: One sentence added to § Instructions step 4's "For each event in the batch" description:

> Initial-flagged events (connect-time snapshots or mid-run scope joins — `initial: true` on `issue-transition`) dispatch normally through the existing table by carried state; the step-4a re-check remains authoritative, and D.10 structurally cannot fire on them because the state class is known.

Plus a fixture demonstrating the flow: an `initial: true` event carrying `waiting-for:clarification` state class enters step 4, the parent re-checks live state (still `waiting-for:clarification`), dispatches to D.1 as usual, and produces the same ledger line shape a mid-run non-initial-flagged event would produce. **No dispatch-table row added; no change to the § Dispatch table; no change to any existing D.n row.**

**Key source**: spec.md § Changes item 2 last paragraph; clarifications.md Q5; generacy#935 Q1 (source of the `initial: true` flag).

## Implementation Patterns (inherited)

- **Playbook prose is authoritative at runtime; TS parser is machine-checkable reference against fixtures** — pattern established by #394 (`reference-consumption.ts`), extended by #400 (`clarification-batch-parser.ts`). This fix's `lib/intent-recognition.ts` follows the same shape: pure functions, no I/O, exported types match `data-model.md`.
- **Five-element presentation block + fused single-`AskUserQuestion` gate** — pattern established by #388/#390, canonized by #400. G.6 filing gate and G.7 scope-drained gate both use five-element blocks (five field labels each) with a single-item `AskUserQuestion` fused in the same response.
- **Iterative edit branch + full-draft re-present** — pattern established by #400 (Q3=B). G.6 filing gate inherits the principle (change loop until approve or skip) while adapting the mechanics (one draft, no per-question letter directives).
- **Default = reversible option** — pattern established by #400 (Q4=A: zero-directive `Make changes` is no-op re-present, not implicit-approve). G.7 scope-drained gate's `Keep watching` default follows the same principle.
- **`cockpit_status` is authoritative for terminal disposition** — pattern established by #406 (typed events from tool server; live state re-check on every dispatch). Q1's deferral to the classifier is the same trust rule applied to a new state class.
- **Ledger-line vocabulary lives in § Ledger action-outcome table + § L.6 summary** — pattern established by #388 (canonical dispatch table + action/outcome rows). Two new rows appended for scope mutations + one new line in § L.6.
- **No new invariant number for the fix's guarantees** — pattern established by #394's SC-007 / #396's no-§8 / #398's audit-lives-in-the-assertion / #400's no-invariant. This fix's guarantees live in G.6/G.7 gate contracts + § Add-issue flow prose + fixture assertions, not at the § Invariants surface.
- **Cross-repo dependency is a sequencing constraint, not a coupling** — pattern established by the workstream (playbook depends on engine primitives; playbook lands after engine). This fix depends on generacy#935; sequencing after IS the safety guarantee.

## Sources / References

- **spec.md** (this feature) — feature Goal, Changes 1–6, Out of scope, Success criteria.
- **clarifications.md** (this feature) — Q1–Q5 with resolved answers.
- **generacy-ai/generacy#935** — dynamic-scope engine contract (dependency); Q1 answer pins `initial: true` on `issue-transition`.
- **generacy-ai/tetrad-development#92** — cockpit v1 auto-mode workstream (context for this finding); T-S4 arc that surfaced the operator-requested capability need.
- **`packages/claude-plugin-cockpit/commands/auto.md`** (current) — target of the playbook edits; § Instructions steps 1/3/4, § Dispatch table + D.8 body, § Gate contract + G.5, § AskUserQuestion invocation contract, § Ledger table + L.4 + L.6, § Invariants, § Examples.
- **`specs/400-operator-requested-ux/`** (Status: Complete) — sibling spec establishing the batched clarification gate pattern; source of the iterative edit-branch pattern this fix's G.6 inherits.
- **`specs/394-found-during-cockpit-v1/`** (Status: Complete) — source of the reference-parser-lives-in-`lib/` pattern.
- **`specs/396-found-during-cockpit-v1/`** (Status: Complete) — source of the no-invariant-when-audit-suffices pattern.
- **`specs/398-found-during-cockpit-v1/`** (Status: Complete) — source of the audit-lives-in-the-assertion pattern.
- **`packages/claude-plugin-cockpit/lib/reference-consumption.ts`** (#394 artifact) — shape reference for `lib/intent-recognition.ts`.
- **`packages/claude-plugin-cockpit/lib/clarification-batch-parser.ts`** (#400 artifact) — shape reference for pure-parser + fixture-verification pattern.
- **`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`** — target of the four new assertions (416-1 through 416-4); pattern reference for `describe(...)` block + `resolve(__dirname, "fixtures", …)` fixture reads.
