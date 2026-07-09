# Clarifications: cockpit auto mode (v1.5, A-S9) — `/cockpit:auto <epic-ref>`

## Batch 1 — 2026-07-09

### Q1: Bounded fixer subagent — what "bounded" means
**Context**: FR-012 mandates "a bounded fixer subagent runs once" on `completed:validate` red or merge red. "Runs once" pins the outer loop (no fixer-in-a-loop). "Bounded" adds a further constraint whose surface is unspecified — it changes what safety caps we bake into the subagent prompt/Agent call and how we predict cost/latency. Without a decision, "bounded" collapses to "one Agent() call with default budget", which may or may not be the intent.
**Question**: What defines "bounded" for the fixer subagent beyond running only once?
**Options**:
- A: Single Agent() invocation only — no additional caps beyond the outer once-per-red rule. The subagent runs with default tool/time budgets.
- B: Single invocation + explicit tool-call cap communicated in the prompt (e.g., "≤ N tool calls, then return whatever state you reached").
- C: Single invocation + wall-clock cap enforced via the Agent tool's timeout parameter (specify the ceiling in the answer).
- D: Single invocation + scope restriction (e.g., "only edit files already touched by the failing task / PR"), enforced by the subagent prompt.

**Answer**: D, outcome-scoped rather than file-scoped, plus a structured verdict. The meaningful bound is *scope*: "make this specific red green (the named failing check / the named conflict); no refactors, no feature work, no scope expansion; if the fix requires design judgment, stop and return an explanation instead." Don't bound by file list — the #883 Q2 lesson applies verbatim: the right fix for a `lib/validation.ts` failure landed in `package.json`; a files-already-touched restriction (option D as written) can make legitimate fixes impossible. Require the subagent to return a structured verdict (`{fixed: bool, summary, reason?}`) so the parent's once-rule and the escalation gate stay deterministic. Reject B — tool-call counts are advisory and models can't reliably self-count; add C's harness timeout only if the Agent invocation supports it natively, never as bespoke machinery.

### Q2: Fused clarification batch gate — how approve/edit per question renders
**Context**: FR-008 / US4 require a single fused gate that lets the operator approve or edit each drafted answer for N open clarification questions in one response. The gate primitive is `AskUserQuestion`, which takes 2–4 discrete option labels per question — approving a draft is a discrete choice, but editing free-form text is not. The rendering surface for "edit" is load-bearing: it decides whether the fused gate ships as a single tool call, a batch of N tool calls in one assistant turn, or a two-phase flow. Getting this wrong reintroduces the #388 turn-split failure the spec exists to prevent.
**Question**: How does the fused clarification batch gate present "approve/edit per question" to the operator without splitting into multiple turns?
**Options**:
- A: One `AskUserQuestion` per open question (N calls in the same assistant turn), each with options like "Approve draft / Edit / Skip". "Edit" is handled by the operator answering "Edit" and typing the replacement via the tool's free-text-other channel; the parent posts whatever text comes back.
- B: A single `AskUserQuestion` call with one composite question ("Approve all N drafts?") and options "Approve all / Edit some / Cancel". If "Edit some", the parent opens a second turn to collect edits — accepted as an explicit deviation from strict fusion for this dispatch.
- C: The parent renders the N draft answers as a numbered list in the presentation block, and issues a single `AskUserQuestion` whose options are "Approve all as drafted / Reject batch (re-run subagent) / Cancel"; per-question editing is out of scope for the gate (operator edits by re-running clarify assist mode later).
- D: A specific pattern not listed here (please specify in the answer).

**Answer**: A, corrected for the tool's real mechanics — and don't list an "Edit" option. `AskUserQuestion` carries up to 4 questions per call, and *every* question automatically gets an "Other" free-text channel. So: presentation block (each draft + one-line rationale) and `ceil(N/4)` AskUserQuestion calls in the *same* response, one question per clarification, options "Approve draft (Recommended)" / "Skip this question". Editing needs no listed option at all: the built-in Other channel **is** the edit path — whatever replacement text the operator types is posted verbatim in place of the draft. Listing an explicit "Edit" option would require a second turn to collect the replacement text, which reintroduces exactly the #388 turn-split this gate exists to prevent. B accepts that split; C throws away per-question control that costs nothing.

### Q3: Escalation gate action semantics
**Context**: The dispatch table names three escalation gates with terse action verbs whose runtime meaning is not fixed:
- FR-012 (`completed:validate` red / merge red after fixer): `retry / skip / stop`
- FR-013 (`agent:error` / `failed:*`): `requeue / skip / stop`
- FR-016 (unrecognized state): also an escalation gate — action set not named

Implementations of "retry", "requeue", "skip", "stop" diverge sharply: retry could mean re-run the fixer subagent again (contradicting FR-012's "runs once"), re-trigger the validate step, or re-emit the event. Requeue could mean `cockpit queue --requeue` (if that verb exists), reopen the issue, or move it back a phase. Skip could mean advance-past-this-issue vs. drop-the-event-and-continue-the-loop. Stop could mean exit the auto command or pause the watch. These need concrete definitions before the dispatch table can be written verbatim into `auto.md`.
**Question**: What concrete CLI/loop action does each escalation gate choice map to?
**Options**:
- A: Retry = re-run the fixer subagent one more time (relaxes FR-012's "runs once" to "runs once per operator-approved retry"); Skip = advance past this issue via `cockpit advance --gate <g> --skip` (or equivalent) and continue the loop; Stop = exit the auto command cleanly with a summary. Requeue (agent:error) = `cockpit queue <epic> <phase> --issues <n> --yes` (re-add the failing issue to the current phase); its Skip/Stop match validate-red's. Unrecognized state defaults to Skip/Stop (no Retry).
- B: Retry = re-trigger the underlying transition without running the fixer again (e.g., request a fresh `completed:validate` recheck); other actions as A. Fixer subagent still runs only once for the life of the event.
- C: Retry / Requeue / Skip / Stop all map to CLI verbs that do not yet exist and are being requested from S8 as part of A-S9 (list them in the answer, and treat this as a hard prerequisite that must be added to Assumptions / Out of Scope).
- D: A different mapping (please specify in the answer, especially for the unrecognized-state gate).

**Answer**: D — concrete mappings on existing mechanisms, plus one small new engine verb as a named prerequisite.

- **Stop** (all gates): exit the auto command cleanly — kill the watch process, print the run summary, touch no labels.
- **Skip** (all gates): session-local mute for that issue — ledger line, continue the loop, **labels untouched** (advancing a gate to fake "skipped" forges state; assist commands still work on the issue in parallel). A muted issue resurfaces in the next auto run's startup sweep, which is correct.
- **Retry** (validate/merge red): operator-approved single re-run of the fixer subagent. Reword FR-012 rather than contradict it: the fixer runs once *autonomously* per red event; each further run requires the escalation gate. The gate is the bound.
- **Requeue** (`agent:error` / `failed:*`): map to a new small verb, `generacy cockpit resume <issue-ref>` — engine-owned re-arm of a failed phase per the label protocol (clear `agent:error`/`failed:*`, restore the phase's `waiting-for:`/`completed:` resume pair). This operation currently exists only as by-hand label surgery (performed ~5 times during T-S2); putting the protocol knowledge in the plugin would be drift-bait — "plugin narrates, engine decides." Treat it as an addition to G-S8's scope (small, and G-S8 hasn't started implementation; being flagged on generacy#885 in parallel), listed in this spec's Assumptions as a hard prerequisite.
- **Unrecognized state**: Skip / Stop only — never Retry, never guess.

### Q4: Manual validation — "what to test" summary content and source
**Context**: FR-010 says on `waiting-for:manual-validation` the parent "assembles a 'what to test' summary from the current PR / spec". The source list ("current PR / spec") is a superset — none of the fields are pinned. Candidate content includes: PR title / description, spec §Success Criteria, spec §User Stories acceptance criteria, tasks.md items marked complete, quickstart.md steps, or a subagent-generated summary. Different choices lead to different presentation gate contents and different cost profiles (a subagent hop vs. an inline read).
**Question**: What content does the manual-validation gate present, and how is it assembled?
**Options**:
- A: Inline assembly from artifacts only — parent reads spec.md §Success Criteria + acceptance criteria for the current PR's issue, and PR body/title, and renders them in the gate presentation. No subagent.
- B: Subagent hop — a small subagent reads the PR + spec and returns a JSON summary (`{scenarios: [...], acceptance_checks: [...]}`), which the parent renders. Consistent with FR-018's "all analysis in subagents".
- C: Minimum viable — present just PR title, PR URL, and a link to spec.md; operator does their own reading. Gate is a single confirm.
- D: A hybrid or different composition (please specify).

**Answer**: B — small subagent hop returning `{scenarios: [...], acceptance_checks: [...]}` from spec §Success Criteria + the issue's acceptance criteria + PR title/body; parent renders it verbatim in the gate presentation. This is the FR-018 contract applied uniformly (every dispatch = CLI verbs + optional subagent + fused gate), and it keeps whole spec files out of the parent's context — on a run that lives for two phases, inline artifact reads (A) are how the loop context bloats and decays. C makes the gate a rubber stamp, which defeats having the gate.

### Q5: Ledger persistence when the CLI lacks a run-log verb
**Context**: FR-005 says "the ledger line is written to the transcript and (if the CLI supports it) to the cockpit run log." The conditional leaves the fallback behavior unspecified — if S8's CLI ships without a `cockpit run-log append` (or equivalent) verb at auto's ship time, is transcript-only sufficient (accepted degradation), or must auto persist ledger lines to a local file so that audits and SC-002's grep are stable across sessions? This affects both durability and the SC-002 measurement recipe (grepping "the run transcript" implies transcript-only is fine; grepping a persisted file implies not).
**Question**: Where must ledger lines be persisted when the CLI does not support a run-log verb?
**Options**:
- A: Transcript-only is sufficient — no local file. SC-002 is measured against the transcript. If S8 later adds a run-log verb, auto opportunistically calls it; otherwise the transcript is authoritative.
- B: Write to a local file at a documented path (e.g., `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger`) whenever the CLI verb is unavailable. SC-002 is measured against whichever store is populated.
- C: Always write to both transcript and a local file (belt-and-suspenders); the CLI verb, if present, is additional.
- D: Treat "no CLI run-log verb" as a pre-flight failure — auto refuses to start until S8 ships the verb.

**Answer**: C, and delete FR-005's CLI-verb conditional entirely. Append every ledger line to a documented local file (`.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger`) *and* print it in the transcript — the file is one `echo >>` per dispatch, survives session restarts (a P2+P3 run will plausibly span sessions), and gives SC-002 one unconditional measurement recipe (grep the file) instead of "whichever store is populated" (B's ambiguity). No `run-log` CLI verb exists in S8's spec and none should be requested — the file *is* the run log; the conditional is dangling machinery. D inverts the dependency by blocking auto on a verb nobody specced.
