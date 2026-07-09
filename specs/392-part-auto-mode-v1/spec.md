# Feature Specification: cockpit auto mode (v1.5, A-S9) — `/cockpit:auto <epic-ref>`

**Branch**: `392-part-auto-mode-v1` | **Date**: 2026-07-09 | **Status**: Draft | **Issue**: [#392](https://github.com/generacy-ai/agency/issues/392)

## Summary

Part of auto mode (v1.5) — plan: tetrad-development `docs/epic-cockpit-plan.md` §Auto mode. Sequenced after generacy S8 (consumes its `phase-complete`/`epic-complete` events; contract = CLI `--help` + package README). The six assist commands are unchanged — auto is additive.

**One sentence**: automate *transport* (running the next command), leave *judgment* (answers, verdicts, scope) exactly where assist mode put it.

## Loop

Pre-flight → spawn `generacy cockpit watch <epic-ref>` in background → per actionable event, re-check live state (`cockpit status --json`; stream lines can be stale) → dispatch → mandatory one-line ledger entry (`issue · transition · action · outcome`; a dispatch without a ledger line is a protocol violation, #388 enforcement style) → exit on `epic-complete` with a run summary. Re-spawn the watch process whenever it dies while the epic is incomplete — re-arms are idempotent (startup sweep + live-state re-check).

## Dispatch

Inlined verbatim in auto.md per the self-contained-commands principle:

- `waiting-for:clarification` → subagent drafts grounded answers (structured JSON) → fused batch gate (approve/edit per question) → post + `completed:clarification`.
- `waiting-for:<artifact>-review` / `waiting-for:implementation-review` → subagent analysis (findings JSON, #390 shape) → fused verdict gate → approve: `cockpit advance --gate <g>`; request-changes: COMMENT review with inline threads (server-side feedback loop owns the rest).
- `waiting-for:manual-validation` → assemble what to test → gate: confirm when manually validated → advance.
- `completed:validate`, checks green → `cockpit merge` (squash, branch delete), **no gate** — the human verdict was implementation-review; validate/checks are mechanical.
- `completed:validate` red / merge red → bounded fixer subagent once → still red → escalation gate: retry / skip / stop.
- `agent:error` / `failed:*` → fetch evidence (#865 alert content) → escalation gate: requeue / skip / stop.
- `phase-complete` → scope gate: "queue P<next> (N issues)?" → `cockpit queue … --yes`.
- `waiting-for:address-pr-feedback` → ledger line only (server-side owns it).
- Unrecognized / ambiguous state → never guess → escalation gate.

## Gate contract (exhaustive)

Clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations. Nothing else prompts; none of these auto-proceed.

## Invariants

Never merge on red; cockpit comments marked; add-only advance; no cross-slash-command invocation (analysis in subagents whose contracts end with the subagent — #390); autonomy *policy* (per-gate auto-approve, "full auto") explicitly out of scope.

## Decay countermeasures (load-bearing — #384/#388/#390)

Analysis in subagents; every gate fused with its presentation in one response; parent loop kept thin (read event → CLI verbs → gate → ledger line); ledger entry mandatory per dispatch.

## Acceptance

An epic phase progresses to completion with human interaction limited to the gate contract; ledger lines account for every dispatched event. Ships on the same npm + marketplace rails as S6.


## User Stories

### US1: Cockpit operator drives an epic phase to completion with human interaction limited to the gate contract

**As a** cockpit operator running `/cockpit:auto <epic-ref>`,
**I want** the command to spawn a background `generacy cockpit watch <epic-ref>`, receive its events, re-check live state, and dispatch the correct assist-mode CLI verb per event automatically,
**So that** I only get prompted for judgment calls — clarification batches, review/validation verdicts, phase-queue confirmations, and red/error escalations — and every dispatched event leaves a ledger line I can audit.

**Acceptance Criteria**:
- [ ] Running `/cockpit:auto <epic-ref>` performs pre-flight, spawns `generacy cockpit watch <epic-ref>` in the background, and begins consuming events.
- [ ] For each actionable event, the loop re-checks live state with `cockpit status --json` before dispatching (stream lines can be stale).
- [ ] Every dispatch emits exactly one ledger line in the shape `issue · transition · action · outcome`. A dispatch without a ledger line is treated as a protocol violation (per #388 enforcement style).
- [ ] The loop exits cleanly on `epic-complete` and prints a run summary of the ledger.
- [ ] If the watch process dies while the epic is still incomplete, the loop re-spawns it. Re-arms are idempotent (startup sweep + live-state re-check absorb any duplicates).
- [ ] The six existing assist commands (`specify`, `clarify`, `plan`, `tasks`, `review`, `merge`, plus supporting `queue` / `watch` / `status`) are unchanged — auto is additive.

### US2: Dispatch table matches the issue verbatim (self-contained-commands principle)

**As a** cockpit playbook maintainer,
**I want** the auto dispatch table inlined verbatim into `auto.md` (not referenced through another skill),
**So that** the command is self-contained and future decay against it is a diff-visible change to a single file.

**Acceptance Criteria**:
- [ ] `waiting-for:clarification` → subagent drafts grounded answers (structured JSON) → fused batch gate (approve/edit per question) → post + advance to `completed:clarification`.
- [ ] `waiting-for:<artifact>-review` / `waiting-for:implementation-review` → subagent analysis (findings JSON, #390 shape) → fused verdict gate → on approve: `cockpit advance --gate <g>`; on request-changes: COMMENT review with inline threads (server-side feedback loop owns the rest).
- [ ] `waiting-for:manual-validation` → assemble "what to test" summary → gate: confirm when manually validated → advance.
- [ ] `completed:validate` (checks green) → `cockpit merge` (squash, branch delete), **no gate** — the human verdict was already taken at implementation-review; validate/checks are mechanical.
- [ ] `completed:validate` red / merge red → bounded fixer subagent runs once → if still red → escalation gate: retry / skip / stop.
- [ ] `agent:error` / `failed:*` → fetch evidence (#865 alert content) → escalation gate: requeue / skip / stop.
- [ ] `phase-complete` → scope gate: "queue P<next> (N issues)?" → `cockpit queue … --yes`.
- [ ] `waiting-for:address-pr-feedback` → ledger line only (server-side owns the loop).
- [ ] Unrecognized / ambiguous state → **never guess** → escalation gate.

### US3: Gate contract is exhaustive, and nothing else prompts or auto-proceeds

**As a** cockpit operator,
**I want** the set of things auto will prompt me for to be an exhaustive, written list — clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations — and none of these to ever auto-proceed,
**So that** I can trust auto's transport automation without worrying that it will either silently take a judgment call or nag me for a decision it should have handled itself.

**Acceptance Criteria**:
- [ ] The command's gate contract is documented in `auto.md` as the exhaustive list: clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations.
- [ ] No dispatch outside that list opens a gate (e.g., `completed:validate` green routes straight to merge; `waiting-for:address-pr-feedback` emits only a ledger line).
- [ ] No item in the gate contract auto-proceeds under any condition — every gate requires an explicit human response before the loop advances.

### US4: Analysis lives in subagents; the parent loop stays thin

**As a** cockpit playbook maintainer aware of the decay pattern the plan doc calls out (#384/#388/#390 all landed on the parent playbook doing too much analysis inline),
**I want** all judgment analysis — clarification drafts, review findings, error evidence fetches — to run in subagents whose contracts end at the subagent boundary,
**So that** the parent loop is a thin transport (read event → CLI verb → gate → ledger line) and no sub-skill terminal contract can compete with the parent's gate.

**Acceptance Criteria**:
- [ ] Clarification-answer drafting runs in a subagent that returns structured JSON; the parent renders the fused batch gate from that JSON in a single response.
- [ ] Review analyses (artifact-review, implementation-review) run in subagents that return the #390 findings shape (`{file, line, summary, failure_scenario}` for code review; equivalent shape for artifact review); the parent renders the fused verdict gate from that JSON in a single response.
- [ ] Error / red-check evidence-fetching runs in a subagent when it involves reading logs or diffs; the parent renders the escalation gate from the returned evidence.
- [ ] No slash command is invoked inline in the parent loop; cross-command composition happens via subagent boundary only (design principle from #390, now normative for auto).

### US5: Fused gates — presentation and prompt in one response

**As a** cockpit operator,
**I want** every gate to fuse its presentation (findings table / draft answers / phase summary / error evidence) with its `AskUserQuestion` prompt in a single response (per #388),
**So that** there is no turn boundary between "here's what I found" and "what should I do about it" — the same failure mode that caused #388 cannot recur in auto.

**Acceptance Criteria**:
- [ ] Every gate response contains both the presentation (table / summary / draft) and the `AskUserQuestion` call in a single assistant turn.
- [ ] No gate is split into two turns (a "here's the analysis" turn followed by a separate "what do you want to do" turn).

### US6: Invariants — never merge on red, cockpit comments marked, add-only advance, autonomy policy out of scope

**As a** cockpit playbook maintainer,
**I want** the auto command to enforce the standing cockpit invariants and to explicitly exclude autonomy policy (per-gate auto-approve, "full auto") from v1.5,
**So that** auto ships with the same safety properties as assist and does not accidentally cross into unattended automation.

**Acceptance Criteria**:
- [ ] Never merge on red is a hard invariant — `completed:validate` red or merge red always routes to the fixer + escalation branch, never to `cockpit merge`.
- [ ] Comments posted by auto are marked as cockpit-generated (matching the existing assist convention).
- [ ] Advance is add-only — auto never rolls a state backward.
- [ ] No cross-slash-command invocation in the parent — analysis lives in subagents whose contracts end with the subagent (#390 principle).
- [ ] Autonomy *policy* (per-gate auto-approve, "full auto" mode) is out of scope for v1.5 and not implemented in this feature; the `auto.md` playbook says so explicitly.

### US7: Ships on the same distribution rails as S6

**As a** cockpit playbook maintainer,
**I want** auto to ship on the same npm + marketplace rails as the S6 assist commands,
**So that** operators install / update it through the same channel they already use, and there is no separate distribution surface to maintain.

**Acceptance Criteria**:
- [ ] `auto.md` is added under `packages/claude-plugin-cockpit/commands/` alongside the existing S6 assist commands.
- [ ] The plugin package version bump, README addition, and marketplace registration follow the same pattern S6 established.
- [ ] The CLI contract for consuming events (`generacy cockpit watch <epic-ref>`, `cockpit status --json`, `cockpit advance --gate <g>`, `cockpit queue`, `cockpit merge`) is validated against the S8 CLI's `--help` and package README (which is auto's stated contract with S8).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | A new command `/cockpit:auto <epic-ref>` is added as `packages/claude-plugin-cockpit/commands/auto.md`, alongside the existing S6 assist commands. The six assist commands are unchanged. | P1 | Auto is additive — assist is preserved as-is. |
| FR-002 | Pre-flight: `auto.md` validates that `<epic-ref>` resolves via `cockpit status --json`, that the working directory is clean enough per current cockpit convention, and that `generacy cockpit watch` is available. On failure, the command exits with a clear error and no watch process is spawned. | P1 | Same pre-flight surface as assist commands. |
| FR-003 | The parent playbook spawns `generacy cockpit watch <epic-ref>` in the background and consumes its event stream. | P1 | The watch process is S8's; auto is the transport around it. |
| FR-004 | For each actionable event received from the watch stream, the loop **re-checks live state** via `cockpit status --json` **before** dispatching. Stream lines may be stale; the live-state check is the source of truth for the dispatch decision. | P1 | Critical for correctness — no dispatch trusts the stream line alone. |
| FR-005 | Every dispatch emits exactly one ledger line in the shape `issue · transition · action · outcome`. A dispatch without a corresponding ledger line is a protocol violation. The ledger line is written to the transcript and (if the CLI supports it) to the cockpit run log. | P1 | #388 enforcement style — mandatory per dispatch. |
| FR-006 | The loop exits cleanly on `epic-complete`, emitting a run summary that lists every ledger entry accumulated during the run. | P1 | Termination + audit. |
| FR-007 | If the watch process dies while the epic is still incomplete, the loop re-spawns it. Re-arm behavior is idempotent — the startup sweep + live-state re-check absorb any duplicate events. | P1 | Robustness against transient watch failures. |
| FR-008 | Dispatch: `waiting-for:clarification` → a subagent drafts grounded answers (structured JSON, one per open question) → the parent renders a fused batch gate (approve/edit per question in one response) → on approve, post the answers and advance to `completed:clarification`. | P1 | Subagent-first analysis; fused gate. |
| FR-009 | Dispatch: `waiting-for:<artifact>-review` (specify/clarify/plan/tasks) and `waiting-for:implementation-review` → a subagent runs the analysis and returns findings JSON in the #390 shape → the parent renders a fused verdict gate (findings table + `AskUserQuestion`) → on approve: `cockpit advance --gate <g>`; on request-changes: post a COMMENT review with inline threads (server-side feedback loop owns the rest). | P1 | #390 pattern normative for both artifact and implementation reviews. |
| FR-010 | Dispatch: `waiting-for:manual-validation` → the parent assembles a "what to test" summary from the current PR / spec → gate: confirm when manually validated → advance. | P1 | Human-in-the-loop is load-bearing here. |
| FR-011 | Dispatch: `completed:validate` with checks green → `cockpit merge` (squash, branch delete), **no gate**. Rationale (recorded in-playbook): the human verdict was already taken at implementation-review; validate/checks are mechanical. | P1 | Explicitly no gate on this transition. |
| FR-012 | Dispatch: `completed:validate` red OR merge red → a bounded fixer subagent runs once. If still red after the fixer, an escalation gate opens: retry / skip / stop. | P1 | One bounded fixer attempt, then escalate — no fixer-in-a-loop. |
| FR-013 | Dispatch: `agent:error` / `failed:*` → a subagent fetches evidence (using #865 alert content when available) → the parent renders an escalation gate: requeue / skip / stop. | P1 | Depends on #865 for alert content shape. |
| FR-014 | Dispatch: `phase-complete` → the parent renders a scope gate ("queue P<next> (N issues)?") → on confirm: `cockpit queue … --yes`. | P1 | Phase-boundary confirmation is a gate contract item. |
| FR-015 | Dispatch: `waiting-for:address-pr-feedback` → ledger line only, no gate, no CLI action. The server-side feedback loop owns this state. | P1 | Auto stays out of the server-side loop's way. |
| FR-016 | Dispatch: unrecognized or ambiguous state → the parent **never guesses** → an escalation gate opens describing the observed state. | P1 | No silent fallthrough — ambiguity always surfaces as a gate. |
| FR-017 | The gate contract is exhaustive: only clarification batches, review/validation verdicts (artifact review, implementation review, manual validation), phase-queue confirmations, and red/error escalations open gates. Nothing else prompts, and **none of these auto-proceed** under any condition. | P1 | Documented in `auto.md` verbatim. |
| FR-018 | All judgment analysis (clarification drafting, review analysis, error evidence-fetch) runs in a subagent whose entire return message is a single JSON value in the expected schema. The parent consumes the JSON and renders the fused gate in the same response. No sub-skill terminal contract enters the parent context. | P1 | #390 structural isolation, applied uniformly across auto's dispatches. |
| FR-019 | Every gate response fuses its presentation (findings table / draft answers / phase summary / error evidence) with its `AskUserQuestion` prompt in a single assistant turn. No gate is split into two turns. | P1 | #388 fusion, applied uniformly. |
| FR-020 | The parent loop is kept thin: read event → re-check live state → dispatch (CLI verb + optional subagent for analysis) → gate (if applicable) → ledger line. No inline analysis, no cross-slash-command invocation, no side-quests in the parent. | P1 | Load-bearing decay countermeasure. |
| FR-021 | Never merge on red — enforced structurally: the merge dispatch branch is only reachable from `completed:validate` with green checks; the red paths route to the fixer + escalation branch. | P1 | Hard invariant. |
| FR-022 | Cockpit-authored comments (review COMMENT reviews, inline review threads, phase-queue confirmations if the CLI posts them) are marked as cockpit-generated per the existing assist convention. | P1 | Consistency with assist. |
| FR-023 | Advance is add-only — the loop never rolls a state backward. If a re-armed watch replays an event already advanced past, the live-state check absorbs it (idempotent). | P1 | Hard invariant. |
| FR-024 | No cross-slash-command invocation in the parent loop. Cross-command composition happens via subagent boundary only. `auto.md` says this explicitly, in the same governance-surface style as the amended `packages/claude-plugin-cockpit/README.md` after #390. | P1 | #390 principle, normatively applied. |
| FR-025 | Autonomy policy (per-gate auto-approve, "full auto" mode) is out of scope for v1.5 A-S9 and is not implemented. `auto.md` states this explicitly so a future author does not add it under the same name. | P1 | Scope guard. |
| FR-026 | Auto ships on the same npm + marketplace rails as S6 — package version bump, README addition, marketplace registration follow the S6 pattern. | P1 | Distribution parity. |
| FR-027 | Auto's contract with S8 is validated against S8's CLI `--help` output and the S8 package README — no S8 internal API is referenced, only the CLI surface. | P1 | Loose coupling — auto rides on top of a stable CLI. |
| FR-028 | `auto.md` inlines the dispatch table verbatim (self-contained-commands principle). No cockpit skill is referenced from `auto.md` except the CLI verbs it invokes. | P2 | Diff-visible governance. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | End-to-end phase completion under `/cockpit:auto` | An epic phase progresses to completion with human interaction limited to the documented gate contract (clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations) | Run auto against a smoke-test epic that exercises at least one clarification, one artifact review, one implementation review, and one phase boundary; record every human prompt during the run and confirm each one falls within the gate contract. |
| SC-002 | Ledger completeness | Every dispatched event has exactly one ledger line in the shape `issue · transition · action · outcome`; the count of ledger lines equals the count of dispatched events across the run | Grep the run transcript for the ledger-line pattern; compare against the count of dispatch actions the transcript shows. |
| SC-003 | Never-merge-on-red invariant | On a smoke-test epic where the validate step deliberately fails, auto never invokes `cockpit merge`; instead the fixer subagent runs once and (if still red) the escalation gate opens | Run auto on a fixture where `completed:validate` transitions to red; grep the transcript for any `cockpit merge` invocation (must be zero) and confirm the fixer/escalation branch fired. |
| SC-004 | Parent loop stays thin | Auto's transcript for a typical event dispatch contains: (a) the event line from the watch stream, (b) the `cockpit status --json` re-check, (c) the subagent invocation (if analysis is needed), (d) the fused gate response (presentation + `AskUserQuestion`) OR the CLI verb (if no gate), (e) exactly one ledger line — and no free-form analysis prose from the parent | Visual inspection of the transcript for one representative dispatch of each type in the dispatch table. |
| SC-005 | Subagent isolation preserved uniformly | For every dispatch that involves analysis, the parent's post-subagent response contains only the fused gate (or CLI verb + ledger line) — never raw subagent output, never restated JSON in prose, never a second turn between subagent return and gate | Grep parent responses for the subagent JSON schema keys as a negative check across all analysis-involving dispatches. |
| SC-006 | Watch re-arm idempotency | Killing the watch process mid-run causes the loop to re-spawn it; no event dispatched before the kill is re-dispatched after re-arm (the live-state re-check absorbs duplicates) | Manually kill the watch process during a smoke test; confirm the ledger has no duplicate entries for events dispatched before the kill. |
| SC-007 | Assist commands unchanged | Diff of `packages/claude-plugin-cockpit/commands/{clarify,review,merge,queue,watch,status}.md` (and their supporting skills) shows zero changes attributable to this feature | `git diff` on assist command files across the branch — expected: no changes. |
| SC-008 | Gate contract is exhaustive and documented | `auto.md` contains a single "Gate contract" section that enumerates clarification batches, review/validation verdicts, phase-queue confirmations, and red/error escalations, and states "nothing else prompts; none of these auto-proceed" | Read `auto.md`; confirm the section exists verbatim. |
| SC-009 | Autonomy policy stays out of scope | `auto.md` and the accompanying README addition contain no mechanism for per-gate auto-approve or "full auto" mode; if either concept is mentioned, it is only to declare it out of scope for v1.5 | Grep `auto.md` and the README for "auto-approve" / "full auto" — any hit must be a scope-exclusion sentence. |
| SC-010 | Ships on S6 rails | `packages/claude-plugin-cockpit/package.json` version bumped per the S6 pattern; README lists `/cockpit:auto` alongside the six assist commands; marketplace registration follows the S6 pattern | Diff review of package.json, README, marketplace manifest. |
| SC-011 | Contract with S8 is CLI-surface-only | `auto.md` references only `cockpit watch`, `cockpit status --json`, `cockpit advance --gate <g>`, `cockpit queue --yes`, `cockpit merge` — no direct import of S8 code or internal API | Grep `auto.md` for import statements or non-CLI S8 references (expected: none). |

## Assumptions

- Generacy S8 has landed and provides `generacy cockpit watch <epic-ref>` streaming `phase-complete` / `epic-complete` events (and the intermediate `waiting-for:*`, `completed:*`, `agent:error`, `failed:*` transitions), plus `cockpit status --json`, `cockpit advance --gate <g>`, `cockpit queue`, and `cockpit merge`. Auto's contract with S8 is the CLI `--help` output + package README; auto does not reference S8 internals.
- The Agent tool is available inside `auto.md`'s execution context (matches assist-mode tool availability post-#390).
- The `AskUserQuestion` tool remains the gate primitive (per #388 and its subsequent uses).
- `#865` alert content is available for `agent:error` / `failed:*` events (the escalation subagent fetches it). If unavailable at auto's ship time, the escalation gate still opens but with reduced evidence (documented as a graceful-degradation branch).
- Cockpit v1.5 operates in assist-parity mode for judgment — the six gates remain human-decided. Auto's contribution is transport (running the next command / spawning the next subagent), not judgment.
- The parent's Bash + `gh` environment inside the plugin session is sufficient to invoke the CLI verbs auto needs; no new environment requirements are introduced.
- Ledger line format is stable at `issue · transition · action · outcome` (bullet separator `·`); if the format needs to change later, it changes in one place inside `auto.md`.

## Out of Scope

- Autonomy policy: per-gate auto-approve, "full auto" mode, or any mechanism that lets auto skip a gate. Explicitly deferred (referenced in the invariants section of the issue).
- Changes to the six assist commands (`specify`, `clarify`, `plan`, `tasks`, `review`, `merge` — and the supporting `queue` / `watch` / `status`). Auto is additive.
- New CLI verbs in `generacy cockpit`. Auto consumes S8's CLI surface as-is; if a needed verb is missing, that is a separate S-series ticket, not this one.
- Retroactive changes to how prior gate skips (#384, #388, #390) were fixed in assist mode. Auto adopts those fixes structurally by construction; it does not re-diagnose them.
- A visual UI for the ledger or gate history. The ledger is a transcript artifact in v1.5.
- Metrics / telemetry beyond the transcript ledger. Adding structured metrics is a follow-up.
- Cross-epic parallel auto runs. `/cockpit:auto` runs one epic per invocation; running multiple epics in parallel is out of scope.
- A "resume interrupted run" verb. If the session dies, the operator re-invokes `/cockpit:auto <epic-ref>` and the live-state re-check + startup sweep resume from wherever the epic is.
- Watch process discovery / attaching to an existing watch. Auto spawns its own watch each invocation.

---

*Generated by speckit*
