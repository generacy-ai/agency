# Implementation Plan: Cockpit auto mode (v1.5, A-S9) — `/cockpit:auto <epic-ref>`

**Feature**: Automate transport (running the next command) across a cockpit epic while leaving all judgment gates (answers, verdicts, scope) exactly where assist mode put them
**Branch**: `392-part-auto-mode-v1`
**Date**: 2026-07-09
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md)
**Status**: Complete

## Summary

Add a seventh cockpit slash command — `/cockpit:auto <epic-ref>` — that drives an epic to `epic-complete` by watching state transitions and dispatching to the six existing assist commands' *actions* (never the assist commands themselves, per invariant §5) while keeping every judgment gate intact. The command is a **playbook edit** — `packages/claude-plugin-cockpit/commands/auto.md` + a one-line addition to `packages/claude-plugin-cockpit/README.md`'s command table — plus one small engine-side prerequisite tracked in Assumptions (`generacy cockpit resume <issue-ref>`, needed for the `agent:error` / `failed:*` escalation's "Requeue" action, added to G-S8's scope).

The parent playbook is thin: read event → CLI verbs (`cockpit status --json`, `cockpit advance`, `cockpit queue …`, `cockpit merge`, `cockpit resume`) → optional subagent for analysis → fused `AskUserQuestion` gate → mandatory ledger line → next event. All analysis (clarification drafts, review verdicts, manual-validation "what to test" summaries, fixer attempts) runs inside subagents per the #390 boundary. Every dispatch writes a one-line ledger entry to **both** the transcript and a documented local file (`.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger`), giving SC-002's grep an unconditional target.

The command is **additive** — the six existing assist commands are unchanged (no scope leakage), the six SC-derived invariants from spec §Invariants are load-bearing (never merge on red, comments marked, add-only advance, no cross-slash-command invocation, subagent analysis, autonomy-policy explicitly out of scope), and the four gate types in spec §Gate contract (clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations) are the exhaustive human-interaction surface — nothing else prompts and none auto-proceed.

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime). No TypeScript, no runtime code shipped in this repo.

**Primary Dependencies**:
- Claude Code slash-command executor.
- Claude Code `AskUserQuestion`, `Agent`, `Bash` tools (used inside the playbook).
- `generacy` CLI (`cockpit watch`, `cockpit status --json`, `cockpit advance`, `cockpit queue`, `cockpit merge`, and the new `cockpit resume` verb requested from G-S8 — see Assumptions).
- `gh` CLI (already a hard runtime dependency of every cockpit command).

**Storage**: Filesystem — two files edited (`packages/claude-plugin-cockpit/commands/auto.md`, `packages/claude-plugin-cockpit/README.md`). Runtime output: one append-only local file per run at `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger` (created by the playbook's dispatch step; the operator's cwd owns the `.generacy/` tree).

**Testing**:
- **Static** — greps against `auto.md` for: the dispatch mapping (all nine states from spec §Dispatch), the invariants block, the ledger-line format sentence, the `.generacy/cockpit/auto-runs/` file path, the mandatory-ledger-per-dispatch rule sentence (#388 enforcement-style), the subagent invocation directives for the four analysis paths (clarification / artifact-review / implementation-review / manual-validation / fixer), the fixer's structured verdict schema (`{fixed, summary, reason?}`), and the "never merge on red / no auto-approve / add-only advance" invariants. README command table row present with the `/cockpit:auto` entry.
- **Behavioral** — one end-to-end run on a synthetic 2-phase epic driving to `epic-complete`; ledger file present with one line per dispatched event; every gate class exercised at least once; no `AskUserQuestion` fires outside the four gate types.
- **True verifier** — continued live `/cockpit:auto <epic-ref>` usage on the smoke-test corpus that this feature is scoped to serve; adherence is probabilistic (same epistemic layering as #384/#388/#390).

**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed). Ships on the same npm + marketplace rails as the six S6 assist commands.

**Project Type**: Single-package playbook addition (one new command file, one one-line README table entry) — same shape as the six existing cockpit commands.

**Performance Goals**: N/A (playbook adherence, not throughput). Session context growth is the load-bearing budget concern — see decay countermeasures in spec §Decay countermeasures (analysis in subagents, thin parent loop, ledger persisted to file so a session restart is survivable across phases).

**Constraints**:
- No cross-slash-command invocation from `auto.md` (invariant §4). The dispatch table names the *action* to perform per event, not the assist command to invoke. Analysis runs in subagents (invariant §5, #390 pattern).
- Never merge on red (invariant §1). `completed:validate` + checks green routes straight to `cockpit merge`; anything red on the merge path triggers the bounded-fixer branch and, if still red, the escalation gate.
- Add-only advance (invariant §3). The `Skip` escalation action is **session-local mute only** — labels are untouched, `cockpit advance` is never called with a fake-skip flag. A muted issue resurfaces in the next auto run's startup sweep, which is correct.
- Autonomy *policy* (per-gate auto-approve, "full auto" mode) is explicitly out of scope (invariant §6). Every gate prompts; none auto-proceed.
- Bounded fixer subagent (per Q1) is **outcome-scoped**, not file-scoped, and returns `{fixed: bool, summary, reason?}`. The parent's once-rule + the escalation gate are the deterministic bound.
- Fused clarification batch gate (per Q2) issues `ceil(N/4)` `AskUserQuestion` calls in the **same response** — the built-in "Other" free-text channel is the edit path (no explicit "Edit" option, which would require a second turn and reintroduce the #388 turn-split).
- Manual-validation "what to test" summary (per Q4) is produced by a subagent returning `{scenarios: [...], acceptance_checks: [...]}` from spec §Success Criteria + the issue's acceptance criteria + PR title/body. The parent renders it verbatim in the gate presentation.
- Ledger persistence (per Q5) is unconditional dual-write (transcript + `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger`). No CLI verb conditional; the file is the run log.
- Escalation action semantics (per Q3) — Stop, Skip, Retry, Requeue — map to concrete existing CLI mechanisms except Requeue, which requires the new `cockpit resume <issue-ref>` verb (Assumption A2). Unrecognized state defaults to Skip / Stop only, never Retry.
- Watch-process re-arm (spec §Loop) is idempotent — startup sweep + live-state re-check guarantee that spawning `cockpit watch` twice on the same live state produces no duplicate action.

**Scale/Scope**: One new file (`auto.md`, ~300–450 lines including inlined dispatch, gate contract, and error handling); one one-line addition to the README's command table; one new engine verb request tracked as a hard prerequisite in Assumptions (A2). Ships on the same npm + marketplace rails as the six existing cockpit commands. No sibling playbook edits (the six existing playbooks are byte-identical on this branch, per invariant §5 and the #388/#390 sibling-non-modification precedent).

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`, matching #388 / #390's finding). No governance gates to check. The plugin README's `## Overview` paragraph — which #390 amended to state "no cross-slash-command invocation" — is the load-bearing governance surface; auto.md must not violate it (invariant §4 above), and the README table addition should not require re-amending the overview paragraph (Constraint above).

## Project Structure

### Documentation (this feature)

```text
specs/392-part-auto-mode-v1/
├── spec.md                            # Feature spec (read-only)
├── clarifications.md                  # Q1–Q5 with resolved answers (read-only)
├── plan.md                            # THIS FILE
├── research.md                        # Decisions and rationale (Phase 0)
├── data-model.md                      # Playbook structural model + dispatch/gate contracts
├── quickstart.md                      # Verification runbook (static + behavioral) + usage
├── contracts/
│   ├── dispatch-table.md              # The nine-row event → action mapping, verbatim
│   ├── gate-contract.md               # The four gate types, options, and response shape
│   ├── ledger-line.md                 # One-line format + persistence path + dual-write rule
│   └── subagent-boundaries.md         # The four analysis subagents (clarification / review / manual-validation / fixer) + return schemas
├── checklists/                        # (empty — reserved for /checklist skill)
└── tasks.md                           # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   ├── auto.md                        # NEW — the /cockpit:auto <epic-ref> playbook
│   ├── clarify.md                     # untouched
│   ├── merge.md                       # untouched
│   ├── queue.md                       # untouched
│   ├── review.md                      # untouched
│   ├── status.md                      # untouched
│   └── watch.md                       # untouched
└── README.md                          # MODIFIED — one-line row added to the § Available Commands table
```

Sibling files (untouched — invariant §5 and the #388/#390 non-modification precedent):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md                         # No changes.
├── merge.md                           # No changes. auto.md's completed:validate + green path calls the SAME CLI verb (cockpit merge) — not the /cockpit:merge slash command — so no coupling.
├── queue.md                           # No changes. Same principle: auto.md calls cockpit queue directly.
├── review.md                          # No changes. auto.md's review-verdict dispatch runs the analysis in a subagent (per invariant §5) and calls cockpit advance directly — never /cockpit:review.
├── status.md                          # No changes.
└── watch.md                           # No changes. auto.md spawns cockpit watch as a background Bash process for the event stream — never /cockpit:watch.
```

**Structure Decision**: Single-package playbook addition. The command file (`auto.md`) is a new peer of the six S6 assist commands, following the same file-layout conventions (`---` YAML frontmatter with `description:` + `arguments:`, then `# <Verb> Command`, then `## User Input`, then `## Instructions`, then the fenced `<!-- BEGIN error-conv -->` block, then `## Invariants`, then `## Examples`). Cross-command composition is by CLI verb only, per invariant §4. See [data-model.md](./data-model.md) for the internal step layout and [contracts/](./contracts/) for the dispatch, gate, ledger, and subagent-boundary contracts.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The command is a strict superset of assist-mode transport wired through the existing CLI verbs — no new mechanisms are introduced except (a) the append-only ledger file, (b) the one new engine verb (`cockpit resume`) requested from G-S8 and tracked as Assumption A2. The playbook design explicitly rejects: `/cockpit:*` slash-command invocation inside `auto.md` (invariant §4), autonomy-policy features like per-gate auto-approve (invariant §6), a per-issue retry-in-a-loop pattern (bounded fixer runs once autonomously; further runs require an operator-approved escalation), an explicit "Edit" option in the fused clarification batch gate (would reintroduce the #388 turn-split), inlining whole spec files into the parent's context for the manual-validation gate (subagent hop instead — Q4=B), and any CLI-verb conditional in the ledger persistence rule (dual-write is unconditional — Q5=C).

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — the Q1–Q5 decisions and their rationale, plus the load-bearing pattern references (#384/#388/#390 gate-adherence family, spec §Decay countermeasures).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (playbook structural model, step layout, invariants), [contracts/dispatch-table.md](./contracts/dispatch-table.md) (nine-row event → action mapping), [contracts/gate-contract.md](./contracts/gate-contract.md) (four gate types, options, response shape), [contracts/ledger-line.md](./contracts/ledger-line.md) (one-line format + dual-write rule), [contracts/subagent-boundaries.md](./contracts/subagent-boundaries.md) (analysis subagents + return schemas), [quickstart.md](./quickstart.md) (verification runbook + usage).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | **Bounded fixer subagent** = single Agent invocation, **outcome-scoped** ("make this specific red green; no refactors, no feature work, no scope expansion; if it needs design judgment, stop and return an explanation"), returning a structured verdict `{fixed: bool, summary, reason?}`. Not file-scoped (the #883 Q2 lesson applies verbatim — a `lib/validation.ts` failure's right fix landed in `package.json`; file-list bounding can make legitimate fixes impossible). Bounded by scope, not files; the parent's once-per-red rule + the escalation gate are the deterministic bound. Tool-call caps rejected (advisory; models can't reliably self-count). Agent-native timeout accepted only if the tool supports it — never bespoke machinery. | Q1=D refined |
| D2 | **Fused clarification batch gate** = one presentation block (each draft + one-line rationale, numbered) + `ceil(N/4)` `AskUserQuestion` calls in the **same assistant response**, one question per clarification, options `Approve draft (Recommended)` / `Skip this question`. The built-in "Other" free-text channel is the edit path — whatever replacement text the operator types is posted verbatim. Listing an explicit "Edit" option would require a second turn to collect the replacement text, reintroducing the #388 turn-split this gate exists to prevent. | Q2=A refined |
| D3 | **Escalation gate action semantics** (D — concrete mappings on existing mechanisms + one small new engine verb):<br/>• **Stop** (all gates): exit auto cleanly — kill watch, print run summary, no label writes.<br/>• **Skip** (all gates): session-local mute for that issue only — ledger line, continue loop, **labels untouched** (advancing a gate to fake "skipped" forges state; assist commands still work on the issue in parallel). Muted issues resurface in the next auto run's startup sweep, which is correct.<br/>• **Retry** (validate/merge red): operator-approved single re-run of the fixer subagent. FR-012 reworded, not contradicted: fixer runs once *autonomously* per red event; each further run requires the escalation gate.<br/>• **Requeue** (`agent:error` / `failed:*`): map to a new small engine verb `generacy cockpit resume <issue-ref>` — engine-owned re-arm of a failed phase per the label protocol (clear `agent:error`/`failed:*`, restore the phase's `waiting-for:`/`completed:` resume pair). Currently exists only as by-hand label surgery. Treat as G-S8 scope addition (see Assumption A2).<br/>• **Unrecognized state**: Skip / Stop only, never Retry, never guess. | Q3=D |
| D4 | **Manual-validation "what to test" summary** = subagent hop returning `{scenarios: [...], acceptance_checks: [...]}` from spec §Success Criteria + the issue's acceptance criteria + PR title/body; parent renders it verbatim in the gate presentation. This is the FR-018 contract applied uniformly (every dispatch = CLI verbs + optional subagent + fused gate), and keeps whole spec files out of the parent's context — inline artifact reads (option A) is how the loop context bloats and decays over a two-phase run. Option C (single confirm with just PR title/URL + spec link) makes the gate a rubber stamp, which defeats having the gate. | Q4=B |
| D5 | **Ledger persistence** = **dual-write, unconditional**. Every ledger line printed to the transcript AND appended to `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger` (one `echo >>` per dispatch). Delete FR-005's "if the CLI supports it" conditional entirely. The file **is** the run log — no `cockpit run-log` CLI verb exists in S8's spec and none should be requested (dangling machinery). SC-002 is measured against the file, giving one unconditional grep target instead of "whichever store is populated" (Option B's ambiguity). Session restarts across a two-phase run are survivable because the file persists. Option D (block auto until S8 ships a run-log verb) inverts the dependency by blocking on a verb nobody specced. | Q5=C |

## Rejected Approaches (informative)

- **Invoke the six assist slash commands from inside `auto.md`.** Rejected — invariant §4 (no cross-slash-command invocation) and the #390 pattern that closed the gate-skip family (#384, #388, #390) forbid it. Cross-command composition is by CLI verb (`generacy cockpit …`) and subagent boundary only. The auto command orchestrates *actions*, not assist commands.
- **File-scoped bounded fixer (Q1=D as originally worded, restricted to "files already touched by the failing task/PR").** Rejected under Q1=D refined — the #883 Q2 lesson: the right fix for a `lib/validation.ts` failure landed in `package.json`; a files-already-touched restriction makes legitimate fixes impossible. Bound by **outcome scope** (specific red → green, no refactors), enforced by prompt, verified by structured verdict.
- **Tool-call-count cap in the fixer subagent prompt (Q1=B).** Rejected — tool-call counts are advisory and models can't reliably self-count. The outer once-rule + escalation gate is the meaningful bound.
- **Explicit "Edit" option in the fused clarification batch gate (Q2=A as originally worded).** Rejected — `AskUserQuestion` requires listed options to be discrete (approve/edit/skip triple), so an "Edit" selection would need a **second assistant turn** to collect the free-form replacement text. That reintroduces exactly the #388 turn-split this gate exists to prevent. The tool's built-in "Other" free-text channel already **is** the edit path.
- **Composite single-`AskUserQuestion` call for the batch gate (Q2=B).** Rejected — accepts the turn-split as an explicit deviation from strict fusion, throwing away the fusion guarantee that #388 shipped.
- **Batch-level accept-or-reject-only clarification gate (Q2=C).** Rejected — throws away per-question control that costs nothing (the tool already fans out to `ceil(N/4)` calls in one response).
- **New engine CLI verbs for Retry / Skip / Stop (Q3=C).** Rejected — Retry is a re-run of the fixer subagent (a parent-side loop concern, not an engine concern); Skip is session-local (label writes forge state); Stop is a parent-side clean exit. Only Requeue genuinely needs an engine verb (label surgery), and that goes into G-S8's scope (Assumption A2). Requesting engine verbs for parent concerns inverts the layering.
- **Inline artifact reads for the manual-validation gate (Q4=A).** Rejected — on a run that lives for two phases, inline reads of spec.md + issue body + PR body per gate is how the loop context bloats and decays. Subagent hop (Q4=B) keeps whole-file reads out of the parent's context; the parent only handles the `{scenarios, acceptance_checks}` structured summary.
- **Minimum-viable manual-validation gate (Q4=C: PR title + URL + spec link, single confirm).** Rejected — makes the gate a rubber stamp, defeating the whole reason it exists (a human decides whether the manual validation actually happened).
- **Transcript-only ledger (Q5=A).** Rejected — session restarts across a two-phase run lose the ledger; SC-002's grep target becomes unstable across sessions.
- **CLI-verb-conditional ledger with local file fallback (Q5=B).** Rejected — introduces branching in the persistence rule (grep-against-whichever-store-is-populated) that serves no reader; the CLI verb doesn't exist and shouldn't be specced.
- **Belt-only local file, no transcript print (variant of Q5=C).** Rejected — the transcript print is the operator's visible feedback that a dispatch happened; suppressing it forces the operator to `tail -f` the ledger file to know the loop is alive.
- **Pre-flight refusal on missing `cockpit run-log` verb (Q5=D).** Rejected — blocks auto on a verb nobody specced.
- **Per-gate auto-approve / "full auto" policy shipped with A-S9.** Rejected under invariant §6 (explicitly out of scope). A-S9 ships the transport automation; autonomy policy is a separate concern and a separate spec.
- **Retry the fixer subagent multiple times in one dispatched event (relax "runs once" to "runs N times").** Rejected under Q1=D refined + Q3=D — the fixer runs once **autonomously** per red event; each further run requires the escalation gate. The gate is the bound.

## Verification Layering (per spec §Acceptance, SC-002)

**Static** (necessary but not sufficient — the #384/#388/#390 experience proved static-only fails at behavioral defects):
- `auto.md` present at `packages/claude-plugin-cockpit/commands/auto.md`.
- Dispatch table present, containing all nine events from spec §Dispatch (verbatim event strings: `waiting-for:clarification`, `waiting-for:<artifact>-review`, `waiting-for:implementation-review`, `waiting-for:manual-validation`, `completed:validate`, `agent:error`, `failed:*`, `phase-complete`, `waiting-for:address-pr-feedback`, plus the "unrecognized / ambiguous" fallback row).
- Gate contract block present, naming exactly the four gate types (clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations) and stating "nothing else prompts; none of these auto-proceed".
- Invariants block present, naming all six from spec §Invariants.
- Ledger-line format sentence present (`issue · transition · action · outcome`) and the mandatory-per-dispatch rule sentence present (#388 enforcement style).
- `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger` path present verbatim in `auto.md`.
- Subagent invocation directives present for each of the four analysis paths (clarification / review-verdict / manual-validation / fixer) with `subagent_type: "general-purpose"` fixed per #390.
- Fixer's structured verdict schema `{fixed, summary, reason?}` present verbatim.
- Fused clarification batch gate rule present — `ceil(N/4)` `AskUserQuestion` calls in the same response, options `Approve draft (Recommended)` / `Skip this question`, "Other" channel as edit path.
- README `## Available Commands` table row for `/cockpit:auto` present.
- Sibling playbooks byte-identical (`git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` returns empty).
- Overview paragraph in README byte-identical (`git diff origin/develop -- packages/claude-plugin-cockpit/README.md` shows only the table-row addition).

**Behavioral** (evidence, not proof):
- One end-to-end run on a synthetic 2-phase epic driving to `epic-complete`, with every gate class exercised at least once. Ledger file present with one line per dispatched event. No `AskUserQuestion` fires outside the four gate types.

**True verifier**:
- Continued live `/cockpit:auto <epic-ref>` usage on the smoke-test corpus. Adherence is probabilistic — the design removes the class of drift by construction (thin parent loop, analysis in subagents, fused gates), but confirmation is empirical.

## Assumptions

- **A1**. Generacy S8 (`cockpit watch`, `cockpit status --json`, `cockpit advance --gate <g>`, `cockpit queue <epic> <phase> --yes`, `cockpit merge`) ships before A-S9. A-S9 is sequenced after S8 per spec §Summary; auto consumes S8's `phase-complete` / `epic-complete` events. If any of these verbs is missing at auto's ship time, pre-flight fails with class `MISSING_BINARY` (existing error-handling contract).
- **A2**. **Hard prerequisite** — G-S8 adds one small new engine verb: `generacy cockpit resume <issue-ref>`. Engine-owned re-arm of a failed phase per the label protocol: clear `agent:error` / `failed:*`, restore the phase's `waiting-for:` / `completed:` resume pair. This operation currently exists only as by-hand label surgery (performed ~5 times during T-S2); the plugin cannot own the label protocol (drift-bait — "plugin narrates, engine decides"). Flagged on generacy#885 in parallel. If G-S8 ships without this verb, the `Requeue` escalation action degrades to `Skip` (session-local mute) with an explicit ledger note, and the auto command is still functional — it just cannot auto-recover from `agent:error` / `failed:*` states without operator label surgery.
- **A3**. The operator's cwd owns a writable `.generacy/cockpit/auto-runs/` directory (the playbook creates it on first dispatch via `mkdir -p`). If the cwd is not a writable git repo, pre-flight fails with class `OTHER`.
- **A4**. `AskUserQuestion` continues to support up to 4 questions per call and to provide the built-in "Other" free-text channel per question. The fused clarification batch gate's `ceil(N/4)` fanout depends on both. If either changes, the gate contract needs revisiting (this is a runtime dependency, not a spec change).
- **A5**. The `Agent` tool's `subagent_type: "general-purpose"` continues to be the universally-shipped agent type across cluster and standalone environments (per #390 R3). If a specialized `code-reviewer` type is later requested for A-S9, that is a follow-up decision and a follow-up spec.

## Out of Scope

- **Autonomy policy** (per-gate auto-approve, "full auto" mode, allow-lists of gate types that auto-approve). Explicit non-goal per invariant §6. Every gate prompts; none auto-proceed.
- **Cross-slash-command invocation from `auto.md`**. Invariant §4. The command orchestrates *actions* through CLI verbs and subagents, not by invoking the six assist commands.
- **Sibling playbook edits**. The six assist commands are unchanged on this branch (invariant §5 and #388/#390 non-modification precedent).
- **New CLI verbs beyond `cockpit resume`**. Retry / Skip / Stop are parent-side concerns (Q3=D); no engine verbs are needed for them.
- **A `cockpit run-log` CLI verb**. The `.generacy/cockpit/auto-runs/*.ledger` file **is** the run log (Q5=C). No CLI verb is specced, requested, or planned.
- **UI / TUI for the loop**. Terminal output only (transcript + ledger file).
- **Automatic recovery from `agent:error` / `failed:*` without operator confirmation**. Requeue routes through the escalation gate (Q3=D). The engine verb (`cockpit resume`) is called only after the operator selects Requeue.
- **Multi-epic parallel auto runs**. One `/cockpit:auto <epic-ref>` invocation drives one epic. Multi-epic orchestration is a follow-up concern.
- **Rewriting the specs/372 canonical epic plan or the tetrad-development `docs/epic-cockpit-plan.md`**. The design flows top-down from the canonical plan (already amended by the operator); this spec is A-S9's own scope only.
