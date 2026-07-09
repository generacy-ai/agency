# Research: Cockpit auto mode (v1.5, A-S9) — `/cockpit:auto <epic-ref>`

**Feature**: 392-part-auto-mode-v1
**Date**: 2026-07-09

This document restates the Q1–Q5 decisions taken in `clarifications.md` as design conclusions, records the alternatives considered, and captures the sources of evidence that motivated the shape of the auto command.

---

## R1. Primary design frame — auto is transport, not judgment

**Decision**: `/cockpit:auto <epic-ref>` automates *transport* (running the next command per state transition) and leaves *judgment* (clarification answers, review verdicts, phase-queue scope, escalation decisions) exactly where assist mode put it. The six existing assist commands are unchanged; auto is additive — a seventh peer playbook that orchestrates *actions* through the CLI verbs and subagents that the assist commands already use.

The loop is thin: pre-flight → spawn `generacy cockpit watch <epic-ref>` in the background → per event, re-check live state (`cockpit status --json`; stream lines can be stale) → dispatch (CLI verb + optional subagent + fused gate) → mandatory one-line ledger entry → exit on `epic-complete`.

**Rationale**: Two constraints compose to force this shape:
1. **Invariant §4** (no cross-slash-command invocation) — auto cannot call `/cockpit:clarify`, `/cockpit:review`, `/cockpit:merge`, etc. The alternative — invoking the assist commands from inside `auto.md` — is exactly the anti-pattern that the #390 fix (subagent boundary) closed by construction. Cross-command composition happens by CLI verb and by subagent, not by inline slash invocation.
2. **Invariant §6** (autonomy *policy* out of scope) — auto ships as pure transport automation. Every gate prompts; none auto-proceed. This is a deliberate scope containment: A-S9's contract is *"can an epic phase progress to completion with human interaction limited to the gate contract?"*, not *"can a fully-autonomous mode ship?"*.

**Sources**:
- spec.md § Summary, § Loop, § Dispatch, § Invariants.
- Canonical plan: tetrad-development `docs/epic-cockpit-plan.md` § Auto mode (referenced from spec.md; outside this repo's reach; already amended by the operator).
- Gate-adherence family: agency#384 (Terminal Outcome Check), #388 (fused analysis + prompt), #390 (subagent boundary).

**Alternatives rejected**:
- **Inline `/cockpit:*` invocations from `auto.md`.** Rejected under invariant §4 and the #390 pattern. The #390 finding — that shared-context composition creates contract collisions that outer-playbook prose cannot reliably out-prompt — applies verbatim here. Cross-command composition is by CLI verb and subagent boundary only.
- **A "full auto" mode that skips gate prompts.** Rejected under invariant §6. Autonomy policy is a separate concern and a separate spec.

---

## R2. Bounded fixer subagent — outcome-scoped, structured verdict

**Decision (Q1=D refined)**: The bounded fixer subagent that runs on `completed:validate` red or merge red is:
- A **single `Agent()` invocation** per red event (the outer "runs once" rule per FR-012).
- **Outcome-scoped**, not file-scoped: "make this specific red green (the named failing check / the named conflict); no refactors, no feature work, no scope expansion; if the fix requires design judgment, stop and return an explanation instead."
- Returns a **structured verdict** `{fixed: bool, summary, reason?}` so the parent's once-rule + the escalation gate stay deterministic.
- Tool-call caps are **not** communicated in the prompt (advisory; models can't reliably self-count).
- Agent-native `timeout` parameter is accepted **only if** the Agent tool supports it — never bespoke wall-clock machinery.

**Rationale**: The #883 Q2 lesson applies verbatim — the right fix for a `lib/validation.ts` failure landed in `package.json`; a files-already-touched restriction (Option D as originally worded) makes legitimate fixes impossible. Outcome scope ("this specific red → green") is the meaningful bound; file scope is the wrong bound. The structured verdict lets the parent's dispatch table remain deterministic even when the subagent's reasoning is not — the parent branches on `fixed: bool`, not on parsed prose.

**Alternatives rejected**:
- **A: Single invocation only — no additional caps beyond the outer once-per-red rule.** Rejected — "bounded" collapses to "one Agent() call with default budget" and provides no meaningful bound on scope expansion. A subagent given the default budget can drift into refactoring, adjacent feature work, or "while I'm here" cleanups; the outer loop can't tell whether the returned diff was a targeted fix or a scope explosion.
- **B: Explicit tool-call cap in the prompt.** Rejected — advisory; models can't reliably self-count tool calls. Communicating "≤ N tool calls" as a prompt directive creates false confidence.
- **C: Wall-clock cap via the Agent tool's timeout parameter (as a primary mechanism).** Rejected as a primary bound — it caps latency, not scope. Accepted as a secondary hedge **only if** the Agent tool provides it natively (no bespoke `SIGKILL` machinery).
- **D (original): Single invocation + files-already-touched restriction.** Rejected — the #883 Q2 lesson: the right fix often lands outside the failing task's file set. A file restriction can force the subagent to return `{fixed: false, reason: "fix is outside allowed file set"}` for a legitimate fix, which then routes to the escalation gate for no operator benefit.

**Sources**:
- clarifications.md Q1 (with the #883 Q2 lesson cited verbatim).
- generacy#883 Q2 (file-list bounding failure mode) — reference.

---

## R3. Fused clarification batch gate — `ceil(N/4)` `AskUserQuestion`, built-in "Other" as edit path

**Decision (Q2=A refined)**: The fused clarification batch gate for N open clarification questions is:
- **One presentation block** in the assistant response — each drafted answer numbered with a one-line rationale/provenance beneath it.
- **`ceil(N/4)` `AskUserQuestion` calls in the same response** (the tool carries up to 4 questions per call).
- One question per clarification, with options `Approve draft (Recommended)` / `Skip this question`.
- **The built-in "Other" free-text channel is the edit path** — whatever replacement text the operator types is posted verbatim in place of the draft. No explicit "Edit" option is listed.

**Rationale**: `AskUserQuestion` auto-provides an "Other" free-text channel per question. Listing an explicit "Edit" option would require a *second* assistant turn to collect the free-form replacement text — reintroducing exactly the #388 turn-split this gate exists to prevent. The tool's built-in mechanism already **is** the edit path; adding an explicit "Edit" option is redundant *and* harmful. The `ceil(N/4)` fanout keeps everything in one response for any realistic N (an epic child issue rarely has more than 8–12 open clarifications; even N=16 fits in 4 calls per turn).

**Alternatives rejected**:
- **A (original): One `AskUserQuestion` per open question with options "Approve draft / Edit / Skip"**, with "Edit" handled via the tool's free-text channel. Rejected in refinement — listing "Edit" explicitly implies a two-step interaction (select "Edit", then supply text) even though the tool's "Other" channel makes it a one-step interaction if the option is *not* listed. The refined version drops "Edit" from the options list, keeping the built-in "Other" channel as the natural edit path.
- **B: Single composite `AskUserQuestion` ("Approve all N drafts?") with a follow-up turn for edits.** Rejected — accepts the turn-split as an explicit deviation from strict fusion. Throws away the fusion guarantee that #388 shipped.
- **C: Batch-level accept-or-reject-only (per-question editing out of scope).** Rejected — throws away per-question control that costs nothing (the tool's fanout is already there).
- **D: Not listed.** N/A.

**Sources**:
- clarifications.md Q2 (with the #388 turn-split rationale cited).
- Prior features: agency#388 (fused analysis + `AskUserQuestion`), #390 (subagent boundary).
- Tool contract: `AskUserQuestion` supports ≤ 4 questions per call, with per-question "Other" free-text.

---

## R4. Escalation gate action semantics — concrete existing mechanisms + one new engine verb

**Decision (Q3=D)**: The four escalation gates (validate/merge red, `agent:error`/`failed:*`, unrecognized state) map action verbs to concrete mechanisms as follows:

| Gate | Verb | Mechanism |
|------|------|-----------|
| all | **Stop** | Exit auto cleanly — kill watch process, print run summary, no label writes. |
| all | **Skip** | Session-local mute for that issue only — ledger line, continue loop, **labels untouched** (advancing a gate to fake "skipped" forges state; assist commands still work on the issue in parallel). Muted issues resurface in the next auto run's startup sweep. |
| validate/merge red | **Retry** | Operator-approved single re-run of the fixer subagent. FR-012 reworded, not contradicted: fixer runs once **autonomously** per red event; each further run requires the escalation gate. The gate is the bound. |
| `agent:error` / `failed:*` | **Requeue** | Call the new engine verb `generacy cockpit resume <issue-ref>` — engine-owned re-arm of a failed phase per the label protocol (clear `agent:error` / `failed:*`, restore the phase's `waiting-for:` / `completed:` resume pair). Requires G-S8 to add this verb (Assumption A2). |
| unrecognized state | **Skip / Stop only** | Never Retry. Never guess. |

**Rationale**: Each verb maps to a mechanism that already exists or is a small, well-scoped engine addition. **Skip is session-local** because advancing a gate to fake "skipped" would forge state that the engine's label protocol treats as real — assist commands operating on that issue in parallel would see a lying label. Muted issues resurfacing in the next auto run is a **feature**: the mute doesn't survive across runs, so the operator's intent to "skip for now" doesn't become "skip forever" by accident.

**Requeue needs a new engine verb** because the label protocol for re-arming a failed phase is domain knowledge that belongs in the engine, not the plugin. `T-S2` performed this operation ~5 times by hand; encoding the protocol in the plugin would be drift-bait ("plugin narrates, engine decides"). This is a small, well-scoped addition to G-S8 that hasn't started implementation, and is being tracked on generacy#885 in parallel.

**Alternatives rejected**:
- **A: Retry = re-run the fixer subagent one more time; Requeue = `cockpit queue <epic> <phase> --issues <n> --yes`.** Rejected in part — `cockpit queue --issues <n>` reassigns the phase's issue list to the cluster account, which is not the same operation as "re-arm this specific failed phase". Requeue needs a **verb dedicated to re-arming a failed phase's labels**, not a re-issue of the queue verb.
- **B: Retry = re-trigger the underlying transition without running the fixer again.** Rejected — the fixer is the whole point of the red path; skipping it just returns to the same red event with no new information.
- **C: All four verbs map to new CLI verbs that don't yet exist.** Rejected — Retry / Skip / Stop are parent-side concerns (loop control, ledger, presentation); they don't need engine verbs. Only Requeue genuinely needs an engine verb. Requesting engine verbs for parent concerns inverts the layering (parent narrates, engine decides).
- **D (an internal variant): Skip advances the gate with a `--skip` flag.** Rejected — this is exactly the label forging that invariant §3 (add-only advance) forbids. Session-local mute is the correct semantics; the label protocol stays clean.

**Sources**:
- clarifications.md Q3 (with the "plugin narrates, engine decides" principle stated verbatim).
- Prior operations: T-S2's by-hand label surgery (~5 occurrences of re-arm without a CLI verb).
- Parallel work: generacy#885 (tracking the `cockpit resume` addition).

---

## R5. Manual-validation "what to test" summary — subagent hop with structured return

**Decision (Q4=B)**: On `waiting-for:manual-validation`, the parent spawns a small subagent that reads the PR + the spec's §Success Criteria + the issue's acceptance criteria + PR title/body, and returns:

```json
{
  "scenarios": ["<one-line scenario>", ...],
  "acceptance_checks": ["<one-line check>", ...]
}
```

The parent renders this verbatim in the gate presentation, then invokes the manual-validation gate (single confirm: "manually validated? [yes / no]").

**Rationale**: The FR-018 contract ("all analysis in subagents") applied uniformly — every dispatch shape is `CLI verbs + optional subagent + fused gate`. The specific case for the subagent hop is context-budget preservation: on a run that lives for two phases, inline reads of spec.md + issue body + PR body per gate is how the loop context bloats and decays. Keeping whole-file reads in the subagent (which the parent never sees the internals of) means the parent's context only grows by the small structured summary per gate.

**Alternatives rejected**:
- **A: Inline assembly (parent reads spec.md §Success Criteria + issue acceptance criteria + PR body, renders in gate presentation).** Rejected — inline reads bloat the parent's context over a two-phase run; the decay countermeasures section of the spec (§Decay countermeasures) is load-bearing precisely because of this failure mode.
- **C: Minimum viable (PR title + URL + spec link, single confirm).** Rejected — makes the gate a rubber stamp. If the gate is worth having at all, it needs to name the concrete scenarios the operator is expected to have exercised; otherwise the operator has no way to know whether they've done "enough" manual validation.
- **D: Hybrid.** N/A — no compelling hybrid emerged in review.

**Sources**:
- clarifications.md Q4.
- spec.md § Decay countermeasures ("Analysis in subagents").
- Prior feature: agency#390 (subagent boundary as the canonical composition mechanism).

---

## R6. Ledger persistence — unconditional dual-write, delete the CLI conditional

**Decision (Q5=C)**: Every ledger line is printed to the transcript **and** appended to `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger`. The `if the CLI supports it` conditional from the original FR-005 wording is deleted; the file **is** the run log — no `cockpit run-log` CLI verb exists in S8's spec and none should be requested.

Format: `issue · transition · action · outcome` (spec §Loop), one line per dispatch. Persistence rule: `echo "…" | tee -a .generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger` (or equivalent — the mechanism is one append per dispatch).

**Rationale**: Session restarts across a two-phase run are survivable — the ledger file persists across sessions, and SC-002's grep target ("every dispatched event has a ledger line") is stable and unconditional. Option B (CLI-verb-conditional with local file fallback) creates persistence-rule branching that serves no reader ("grep against whichever store is populated"). Option A (transcript-only) fails the survivability test. Option D (block auto until S8 ships a run-log verb) inverts the dependency by blocking on a verb nobody specced.

The file lives under `.generacy/cockpit/auto-runs/` (a sibling of the existing `.generacy/` tree conventions used by the cluster) — the operator's cwd owns it, and the playbook creates the directory on first dispatch with `mkdir -p`. The filename includes the timestamp so concurrent runs on the same epic-ref don't collide (though multi-epic parallel runs are out of scope, per plan.md § Out of Scope).

**Alternatives rejected**:
- **A: Transcript-only.** Rejected — session restarts across two-phase runs lose the ledger.
- **B: Local file only when CLI verb absent.** Rejected — persistence-rule branching that serves no reader.
- **D: Pre-flight refusal until S8 ships a `cockpit run-log` verb.** Rejected — inverts the dependency.
- **Belt-only local file, no transcript print (variant of C).** Rejected — the transcript print is the operator's visible feedback that a dispatch happened; suppressing it forces `tail -f` to know the loop is alive.

**Sources**:
- clarifications.md Q5.
- SC-002 (spec.md — every dispatched event has a ledger line; measurable via `grep`).
- Session-restart concern: a two-phase auto run plausibly spans sessions, so file-based persistence is load-bearing.

---

## R7. Sequencing — auto ships after G-S8's watch-event contract

**Decision**: `/cockpit:auto <epic-ref>` ships in A-S9 (this feature) but is sequenced **after G-S8** — the engine-side work that produces the transition-stream events (`waiting-for:*`, `completed:*`, `agent:error`, `failed:*`, `phase-complete`, `epic-complete`) that `cockpit watch` streams. The A-S9 playbook is not usable until G-S8's event contract is stable.

**Rationale**: The auto command's contract with the engine is `cockpit watch`'s stdout format (spec §Loop). If S8 renames an event or restructures the transition-line shape after A-S9 ships, the playbook breaks silently (unrecognized state falls into the Skip/Stop escalation gate — spec §Dispatch's fallback row). Sequencing after S8 gives the event contract a chance to stabilize before the playbook depends on it.

The one deliberate coupling to G-S8's scope beyond the event stream is the `cockpit resume <issue-ref>` verb request (Assumption A2). This is small, well-scoped, and G-S8 hasn't started implementation, so adding it is low-risk.

**Alternatives rejected**:
- **Ship auto ahead of a stable event contract.** Rejected — the playbook's dispatch table is the event contract, verbatim; racing S8 means shipping a playbook that doesn't match the shipped event stream.
- **Independent contract (auto polls `cockpit status --json` instead of using `cockpit watch`).** Rejected — polling wastes cycles, and the whole point of the S8 event stream is to be the notification surface. The playbook does *re-check* live state on every event (spec §Loop) — but only as staleness protection, not as the primary trigger.

**Sources**:
- spec.md § Summary ("Sequenced after generacy S8").
- Canonical plan: tetrad-development `docs/epic-cockpit-plan.md` § Auto mode.

---

## R8. Analysis boundaries — four subagents, `general-purpose` fixed, structured returns

**Decision**: `auto.md` invokes **four distinct subagent hops** during a run:

1. **Clarification drafter** — spawned on `waiting-for:clarification`. Reads the issue's open questions + spec/plan/touched-files context. Returns `{question_id: <n>, drafted_answer: <text>, provenance: <cite>}` per question (an array).
2. **Review-verdict analyzer** — spawned on `waiting-for:<artifact>-review` or `waiting-for:implementation-review`. Same shape as #390's contract: returns either an array of `{file, line, summary, failure_scenario}` findings, `[]` for zero findings, or `{"error": …}` on hard error.
3. **Manual-validation summarizer** — spawned on `waiting-for:manual-validation` (Q4=B). Returns `{scenarios: [...], acceptance_checks: [...]}`.
4. **Bounded fixer** — spawned on `completed:validate` red or merge red (Q1=D refined). Returns `{fixed: bool, summary, reason?}`.

All four use `subagent_type: "general-purpose"` **unconditionally** (per #390 R3 — the universally-shipped agent type across cluster and standalone environments).

**Rationale**: The subagent boundary is the mechanism that keeps the parent's context thin — every analysis workload runs in a sub-turn whose internals never reach the parent's shared context. The parent only handles the structured return, which is small. This is the third and final structural extension of the gate-adherence family (#384 positional, #388 fused, #390 subagent-boundary) — the auto command extends the pattern from one gate (implementation-review) to every gate.

**Structured returns** are the boundary contract at each hop. The parent branches on parsed fields, never on parsed prose. Parse failures route to the escalation gate (Unrecognized state → Skip / Stop, per Q3=D).

**Alternatives rejected**:
- **Inline analysis in the parent (no subagent hops).** Rejected — the parent's context bloats over a two-phase run; decay countermeasures fail; the #390 pattern is un-applied.
- **A specialized `code-reviewer` agent type for the review-verdict analyzer.** Rejected under #390 R3 — not universally shipped; adds environmental drift with no unique behavior when the inline prompt already carries the review contract.
- **One monolithic subagent per dispatch (no per-hop specialization).** Rejected — the four hops have distinct return schemas; a monolithic subagent would need per-case prompt branching and a variant return schema, which is less deterministic than four typed hops.

**Sources**:
- spec.md § Invariants ("analysis in subagents whose contracts end with the subagent — #390").
- Prior feature: agency#390 (subagent boundary).

---

## R9. Load-bearing invariants — the six from spec §Invariants

**Decision**: The six invariants from spec §Invariants are transcribed verbatim into `auto.md`'s `## Invariants` block:
1. **Never merge on red.** `cockpit merge` is the only merge primitive; the playbook checks `result` + `reason` before every merge.
2. **Cockpit comments marked.** All PR/issue comments the auto command posts carry the `<!-- generacy-cockpit:… -->` marker prefix (consistent with `/cockpit:clarify`'s existing convention).
3. **Add-only advance.** Never call `cockpit advance` with a fake-skip flag. `Skip` in the escalation gates is session-local mute, not label writes.
4. **No cross-slash-command invocation.** Auto orchestrates *actions* via CLI verbs + subagents. Never invokes `/cockpit:clarify`, `/cockpit:review`, `/cockpit:merge`, etc.
5. **Analysis in subagents whose contracts end with the subagent — #390.** All four analysis hops (R8) use `subagent_type: "general-purpose"` with structured returns.
6. **Autonomy *policy* (per-gate auto-approve, "full auto") explicitly out of scope.** Every gate prompts; none auto-proceed.

**Rationale**: Each invariant closes a class of failure that has *already been observed* in the gate-adherence family (#384, #388, #390) or in T-S2's by-hand operations. Transcribing them verbatim into the playbook — as a `## Invariants` block distinct from the numbered `## Instructions` — makes them greppable, reviewable, and hard to accidentally weaken in a future edit.

**Alternatives rejected**:
- **Interleave invariants into the numbered steps.** Rejected — spreads the load-bearing wording across the playbook; harder to grep, easier to weaken in isolation.
- **Rely on the README's overview paragraph (#390 amendment) alone.** Rejected — the README is one paragraph away from the operator's field of view when reading the playbook; a `## Invariants` block in the playbook itself keeps them adjacent.

**Sources**:
- spec.md § Invariants.
- Prior features: agency#384 (Terminal Outcome Check), #388 (fused analysis + prompt), #390 (subagent boundary).

---

## R10. Verification method — static + behavioral, honest epistemics

**Decision**: Verification is layered (same pattern as #388 / #390):

- **Static** (necessary but proven insufficient by #384/#388's history — text presence does not entail behavior):
  - `auto.md` present at `packages/claude-plugin-cockpit/commands/auto.md`.
  - Dispatch table present with all nine event rows (verbatim event strings).
  - `## Invariants` block present with all six invariants.
  - Ledger-line format sentence and mandatory-per-dispatch rule sentence present.
  - `.generacy/cockpit/auto-runs/<epic-ref>-<timestamp>.ledger` path present verbatim.
  - Subagent invocation directives present for all four analysis paths.
  - Fixer structured verdict schema `{fixed, summary, reason?}` verbatim.
  - Fused clarification batch gate rule present.
  - README command table row for `/cockpit:auto` present.
  - Sibling playbooks byte-identical.

- **Behavioral** (evidence, not proof):
  - One end-to-end run on a synthetic 2-phase epic driving to `epic-complete`.
  - Every gate class exercised at least once.
  - No `AskUserQuestion` fires outside the four gate types.

- **True verifier**:
  - Continued live `/cockpit:auto` usage on the smoke-test corpus. Adherence is probabilistic — the design removes the class of drift by construction (thin loop, subagent analysis, fused gates, mandatory ledger), but confirmation is empirical.

**Rationale**: Static-only is proven insufficient by #384's history (text was present; behavior failed). Behavioral-only skips a cheap first line of defense against future editors weakening the load-bearing invariants. Both is honest.

**Alternatives rejected**:
- **Static-only.** Rejected — proven insufficient.
- **Behavioral-only.** Rejected — invites drift when a future editor removes a load-bearing invariant sentence.

**Sources**:
- Prior features: agency#388 R8, #390 R8.

---

## Implementation patterns

- **Thin parent loop, everything else in subagents / CLI verbs**. The parent playbook does exactly four things per event: (a) re-check live state, (b) dispatch (CLI verb or subagent hop), (c) gate (fused `AskUserQuestion`), (d) ledger line. Anything more (analysis, file reading, verdict shaping) runs in a subagent. This is the same pattern #390 established for one gate, extended to every gate.
- **Structured returns at every boundary**. Every subagent hop returns a JSON value with a fixed schema. The parent branches on parsed fields, never on parsed prose. Parse failures route to the escalation gate (Unrecognized state → Skip / Stop).
- **Fused gate presentations**. Every gate's presentation and its `AskUserQuestion` invocation ship in the **same assistant response** — the #388 pattern applied uniformly. The clarification batch gate is the trickiest case (Q2=A refined: `ceil(N/4)` calls in one response, built-in "Other" as the edit path); the review-verdict / manual-validation / escalation gates all fit in one call per event.
- **Ledger as append-only run log**. One line per dispatch; format `issue · transition · action · outcome`; dual-write to transcript + local file; survives session restarts. The file is the run log.
- **Session-local mute, not label writes**. The escalation gate's `Skip` action never touches labels — the assist commands still see the issue's true state in parallel, and the mute doesn't survive across auto runs. The label protocol stays clean.
- **"Plugin narrates, engine decides"**. Requeue's re-arm-a-failed-phase protocol lives in a new engine verb (`cockpit resume <issue-ref>`), not in the playbook. When a domain protocol is engine-owned, put it in the engine and give the plugin a verb to call.

## Key sources / references

- `spec.md` (this directory) — the current specification.
- `clarifications.md` (this directory) — Q1–Q5 with resolved answers.
- `packages/claude-plugin-cockpit/commands/` — the six existing assist commands (`clarify.md`, `merge.md`, `queue.md`, `review.md`, `status.md`, `watch.md`) — the peers of the new `auto.md`.
- `packages/claude-plugin-cockpit/README.md` — the plugin governance surface; § Available Commands table gets one row added.
- Prior features in the gate-adherence family: agency#384 (Terminal Outcome Check), #388 (fused analysis + prompt), #390 (subagent boundary).
- Canonical design doc (outside this repo): tetrad-development `docs/epic-cockpit-plan.md` § Auto mode.
- Parallel engine work: generacy#885 (tracking the `cockpit resume` addition to G-S8).
