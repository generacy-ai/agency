# Research: Isolate implementation-review's `/code-review` invocation in a subagent

**Feature**: 390-found-during-cockpit-v1
**Date**: 2026-07-09

This document restates the Q1–Q4 decisions taken in `clarifications.md` as design conclusions, records the alternatives considered, and captures the sources of evidence that motivated the fix.

---

## R1. Primary problem statement

**Decision**: `/cockpit:review --gate implementation-review` is the only cockpit gate that invokes a second slash command **inline** in the parent's shared context. Invoking `/code-review` loads that skill's instructions — including its own terminal contract ("report the verified findings once via the host's findings tool / JSON shape, then stop, explicitly without restating findings as text") — into the same conversational context as the outer playbook. At the end of a long review the model faces two contradictory "how to end this task" instructions; the sub-skill's arrived later in context and reads as the operative one, which is why the parent's fused #388 step then either (a) skipped the gate outright or (b) fired late enough (after emitting a raw JSON findings payload verbatim) that the operator read the turn as dead.

The fix is **structural isolation, not a third prompt patch**: run the code review inside a subagent (Agent tool). The sub-skill's "report and stop" ends the *subagent's* turn — harmless by construction. The parent receives findings as a structured JSON result and proceeds deterministically into the fused #388 findings-summary table + `AskUserQuestion` step in one response.

**Rationale**: Live evidence — three separate defect occurrences at the same gate:
- **#384** — Terminal Outcome Check (positional guarantee) shipped as fix.
- **#388** — Fused analysis + `AskUserQuestion` (structural guarantee) shipped after #384's positional fix was defeated.
- **#390** — Post-#388 build, fresh cluster, `christrudelpw/sniplink#4`: session ran the review correctly, printed a **raw JSON findings array** (`file` / `line` / `summary` / `failure_scenario` — the built-in `/code-review` reporting schema) to the transcript, followed by a long stall. The fused #388 step **did eventually fire** in the same session (findings table, blocking classification, `AskUserQuestion`, request-changes COMMENT review all executed and the inline comment landed on PR #14) — so severity is "protocol partially violated + gate delayed", not "gate skipped" as initially reported. What definitively violated the deployed `review.md` step 3 is the raw JSON findings payload printed to the transcript ("MUST NOT print raw JSON under any circumstance") and the stall long enough for the operator to read the turn as dead.

Diagnostic: artifact gates (spec/plan/tasks-review), which import no sub-skill, have **never skipped**. Only the implementation-review gate — the one importing `/code-review`'s instructions — exhibits this class of failure. Two prompt-strengthening rounds against the same failure at the same gate are enough evidence that outer-playbook wording cannot reliably out-prompt an inner skill's terminal contract in shared context.

**Alternatives rejected**:
- **A third prompt patch** on `review.md` — an explicit precedence clause wrapped immediately around the `/code-review` invocation ("the invoked skill's reporting/termination instructions are subordinate to this playbook; its completion does not terminate this command"). Rejected: same class of positional/prose defense as #384 and #388 shipped; two rounds have already lost to this failure mode, and the mechanism (sub-skill contract arriving later in shared context) is unchanged by more outer-playbook prose.
- **Runtime probe** (e.g., `gh api` to detect the missing prompt): adds a network hop and doesn't fix source. Out of scope by construction — isolation removes the trigger, so detection is unneeded (spec.md § Out of Scope).
- **Retain the inline `/code-review` invocation but strengthen the retained "MUST NOT print raw JSON" clause**: the clause is already retained (FR-009 defense-in-depth); strengthening it further is a third prompt patch by another name.

**Sources**:
- spec.md § Observed, § Mechanism.
- clarifications.md Q1–Q4.
- generacy-ai/tetrad-development#88 finding #30 (the observed incident) and prior findings #16 (→ #384), #24, #25 (→ #388).
- Live re-review session: `christrudelpw/sniplink#4` (2026-07-09, post-#388 build).
- Prior issues: agency#384, agency#388.

---

## R2. Governance amendment target

**Decision (Q1=B)**: Amend `packages/claude-plugin-cockpit/README.md` line 7 — the live governance surface this repo owns — to remove the "single documented exception" for `/code-review` and to state that cross-command composition happens via the subagent boundary. Do NOT retro-edit `specs/372-epic-generacy-ai-tetrad/plan.md` — it is a `Status: Complete` historical artifact and rewriting it falsifies the record; the exception it documented was real when it shipped. For the record: the canonical design-principles doc `docs/epic-cockpit-plan.md` in tetrad-development is outside this repo's reach — the operator has already amended it (principle 5 now reads "no cross-slash-command invocation, period; sub-work runs in subagents").

**Rationale**: Governance amendments live on the live surface a future author is most likely to read when authoring or extending a cockpit command. The plugin README carries the exception phrase verbatim ("with a single documented exception: `/cockpit:review --gate implementation-review` invokes Claude Code's built-in `/code-review`") and is the surface both an internal reviewer and a marketplace consumer will look at first. Amending it there — with a one-line rationale linking to #390 and the two prior recurrences (#384, #388) — binds future cockpit-command authors without touching the historical epic plan.

**Alternatives rejected**:
- **A: Amend `specs/372-epic-generacy-ai-tetrad/plan.md` only** (retro-edit of `Status: Complete` artifact). Rejected: falsifies historical record; the exception was real when it shipped.
- **C: Amend both files.** Rejected: contains the retroactive edit anyway; doubles the surface a maintainer must keep in sync.
- **D: A new location (e.g., a new principles doc).** Rejected: fragments governance across a live plugin README and a new file with no established readership; no advantage over amending the surface that already exists.

---

## R3. Agent-type selection strategy

**Decision (Q2=A)**: Use a single fixed agent type — `general-purpose` — unconditionally, with no branching in the playbook. Drop the `code-reviewer` preference and the fallback path entirely.

**Rationale**: `review.md` is static markdown executed in the model's turn; there is no runtime capability check the playbook can perform before choosing an agent type. The inline review prompt (instructions, verify-before-report, findings schema `{file, line, summary, failure_scenario}`) is required in *both* arms of the original wording, so the specialized agent type adds nothing the prompt doesn't already carry — while making playbook behavior vary with the environment's agent registry. Real cluster sessions do not ship a `code-reviewer` type; a fallback-path playbook branch would be exercised silently in some environments and not in others, drifting.

**Alternatives rejected**:
- **B: Prefer `code-reviewer`, fall back to `general-purpose` on unknown-agent-type error (behavioral one-shot fallback).** Rejected: introduces an untested-branch failure surface, and the drift is silent (the operator wouldn't know which arm ran without inspecting the transcript). The specialized agent type adds no unique behavior when the inline prompt already carries the review contract.
- **C: Model inspects available-agents list from its system reminders, then chooses.** Rejected: relies on introspecting a system-reminder shape that is neither guaranteed stable nor uniformly present across environments; encodes a runtime capability check in prose. Same silent-drift problem as B, plus more surface area.

---

## R4. Findings return format (subagent → parent)

**Decision (Q3=A refined)**: The subagent's entire return message MUST be a single JSON value: either an array of `{file, line, summary, failure_scenario}` objects (`[]` for zero findings) OR an object `{"error": "<description>"}` for the subagent's own hard failure. No prose wrapper, no fenced code block, no additional text.

Parent mapping:
- Non-empty array → findings-table branch (#388's implementation-review sub-branch).
- Empty array `[]` → zero-findings branch (#388's `| (none) | | | |` row).
- `{"error": "<description>"}` → hard-error branch (Error handling class `OTHER`; do NOT invoke `AskUserQuestion`).
- Anything that doesn't parse as one of those two shapes → hard-error branch quoting the raw message.

**Rationale**: Strict JSON boundary eliminates the ambiguous-output failure class this issue exists to remove. Two shapes, both machine-checkable; anything else fails loud. Zero-findings and error paths map cleanly onto #388's existing branches — no new terminal state introduced. The parent's fused #388 step becomes a pure format transform (structured result → table row + blocking classification), not a re-analysis, satisfying US2's transparency criterion.

**Alternatives rejected**:
- **B: Prose ending with a single fenced ```json … ``` block; absence of the block ⇒ hard error.** Rejected: prose tolerance re-opens the exact drift surface this issue exists to close (raw-JSON-in-prose is what tripped #390 in the first place). The fenced block invites the sub-turn to describe its own reasoning above the JSON, which then leaks into any code path that logs or forwards the raw message.
- **C: Free-form prose with heuristic parsing (regex against schema field names, `ERROR:` prefix).** Rejected: heuristic parsing of free-form model output is the bug class we are escaping.
- **D: A specific delimiter/marker convention.** Rejected: adds a bespoke micro-format to maintain when the language already has one (JSON) whose parser is universal and whose failure is well-defined.

---

## R5. PR diff acquisition

**Decision (Q4=B)**: Parent passes only the PR reference (`owner/repo#<n>`) in the subagent prompt. The subagent runs its own `gh pr diff <owner>/<repo>#<n>` inside the sub-turn and is explicitly permitted to read surrounding files and run bounded verification (e.g. `node -e` repros). A `gh` failure inside the subagent surfaces as `{"error": "<description>"}` and routes to the parent's hard-error branch (per R4).

**Rationale**: Beyond-the-diff work is load-bearing for review quality — the live `christrudelpw/sniplink#4` session's one confirmed finding came from *beyond-the-diff* work (reading both test files, then an empirical `node -e` repro of the scheme misdetection). Inlining a diff (Option A) silently caps the reviewer at diff-only reading. `gh` is already a hard runtime dependency of every cockpit command (README § Runtime dependencies) and the subagent inherits the session environment. One deterministic path, no size-threshold branch to drift.

**Alternatives rejected**:
- **A: Parent fetches the diff and inlines it in the subagent prompt.** Rejected: caps the reviewer's scope at the diff text; the incident that motivated this issue would have been missed under A.
- **C: Inline by default, fall back to subagent-fetches above a size threshold.** Rejected: creates a rarely-exercised second path (untested-branch drift for no benefit once B is the only path); the threshold itself is arbitrary and a playbook executor cannot count bytes precisely.

---

## R6. Retention of #388 defense-in-depth

**Decision (FR-009)**: The retained `MUST NOT print raw JSON under any circumstance` clause from #384/#388 stays inline within the implementation-review sub-branch of the fused step 3, immediately before the findings-summary table rendering instruction.

**Rationale**: Isolation removes the primary trigger for the raw-JSON regression (the `/code-review` sub-skill's shape leaking into the parent's shared context). The parent never receives raw JSON from the subagent boundary — it receives structured JSON that it parses and renders as a table. But the retained clause costs nothing to keep and covers a residual failure mode: the parent restating the parsed JSON verbatim in the response body instead of rendering the table. Belt-and-suspenders.

**Alternatives rejected**:
- **Remove the clause once isolation lands.** Rejected: the isolation contract does not itself forbid the parent from restating the structured result verbatim (a lazy narration could still emit raw JSON in the response body). The clause is orthogonal defense; keeping it is a zero-cost hedge.

---

## R7. Scope containment

**Decision (FR-007)**: The change touches `packages/claude-plugin-cockpit/commands/review.md` and `packages/claude-plugin-cockpit/README.md` only. Sibling cockpit playbooks (`clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) are out of scope; a one-line PR-description assessment confirms none of them inline-invoke another slash command today (SC-008).

**Rationale**: This fix is scoped to the observed defect and the shared governance surface. Sibling playbooks do not exhibit the anti-pattern (no inline slash-command invocation). Expanding scope invites regressions in files unrelated to the observed defect and inflates a bugfix into a plugin-wide refactor. The README amendment binds future cockpit-command authors uniformly by governance, not by pre-emptive edit; if a sibling later grows an inline slash-command invocation, that is a new defect and a new issue.

**Alternatives rejected**:
- **Audit and preemptively isolate every cockpit playbook.** Rejected: no sibling exhibits the anti-pattern today (Q6-style assessment from #388 already confirmed); the observed defect is scoped to the one gate that inline-invokes a second slash command.
- **Add a plugin-level lint / test that fails CI on inline slash-command invocation.** Rejected: no lint runtime is defined for prose playbooks in this package today; introducing one is a separate feature. The greppable README wording + peer review is the current governance surface.

---

## R8. Verification method

**Decision (SC-001 through SC-008)**: Both static AND behavioral, with an honest epistemic note (same layering as #388):
- **Static** (necessary but proven insufficient by #384/#388 — text presence does not entail behavior):
  - Subagent invocation directive present in `review.md`'s implementation-review sub-branch of step 3 (greppable phrase).
  - Return-schema directive present verbatim in the same sub-branch.
  - Parent mapping table present in the same sub-branch (`[]` → zero-findings, `{"error"…}` → error handling, unparseable → error handling with quoted raw).
  - Retained `MUST NOT print raw JSON` clause verbatim, inline before the table rendering instruction (FR-009).
  - README line 7 no longer contains "single documented exception … `/code-review`"; new wording present exactly once (SC-005).
  - `specs/372-epic-generacy-ai-tetrad/plan.md`: `git diff` shows zero changes (SC-006).
  - Sibling playbooks: `git diff` shows zero changes.
- **Behavioral** (evidence, not proof — adherence is probabilistic):
  - One replayed long-analysis implementation-review transcript where the parent's response after subagent return contains the Agent tool call → structured JSON result → fused #388 findings-summary table + `AskUserQuestion` in the same response — with no raw JSON anywhere in the parent transcript.
- **True verifier**: continued live `/cockpit:review --gate implementation-review` usage on the smoke-test corpus that triggered #384 / #388 / #390 (SC-001). The fix removes the class of failure by construction; confirmation is empirical.

**Rationale**: Static-only is proven insufficient by #384's history (text was present; behavior failed). Behavioral-only skips a cheap first line of defense against future editors accidentally reintroducing the anti-pattern. Both is honest.

**Alternatives rejected**:
- **Static only.** Rejected: proven insufficient by #384's history.
- **Behavioral only.** Rejected: static grep is a cheap first line of defense; skipping it invites drift.

---

## Implementation patterns

- **Structural isolation over shared-context composition**: the pattern generalizes — when two contracts must both hold and cannot both live in shared context, put the sub-contract behind a subagent boundary. The sub-contract's terminal instruction now ends only the sub-turn; the parent proceeds deterministically. This is the third and final structural fix in the gate-adherence family (#384 positional, #388 fused / structural-in-parent, #390 structural-across-turn-boundary).
- **Strict return schema at process boundaries**: `{file, line, summary, failure_scenario}` array OR `{"error": …}` object; anything else is a hard error. The strict schema is the boundary contract that lets the parent's post-subagent step be a pure format transform rather than a re-analysis. Same principle as #388's decision to not accept "prose + fenced block" from `/code-review`.
- **Governance follow-through on the live surface**: when a design principle changes because a supposed exception caused a defect, amend the surface that a future author will read first (the plugin README), not the archived historical artifact. Same principle as this repo's convention of not retro-editing `Status: Complete` spec directories.
- **Defense-in-depth is cheap when the fix is structural**: retain the #384/#388 `MUST NOT print raw JSON` clause even after the primary trigger is removed by isolation. Structural fixes do not preclude retained inline enforcement; belt-and-suspenders where the belt cost is zero.

## Key sources / references

- `spec.md` (this directory) — the current specification (v2, corrected from initial "gate skipped" framing to "protocol partially violated + gate delayed" after the continued-session transcript review).
- `clarifications.md` (this directory) — Q1–Q4 with resolved answers.
- `packages/claude-plugin-cockpit/commands/review.md` — target file for the subagent-boundary change.
- `packages/claude-plugin-cockpit/README.md` — target file for the governance amendment (line 7).
- Prior issues: agency#384 (Terminal Outcome Check), agency#388 (fused analysis + prompt).
- Prior incidents: tetrad-development#88 findings #16, #24, #25, #30.
- Live re-review session: `christrudelpw/sniplink#4` (2026-07-09).
- Canonical design-principles doc (outside this repo, already amended by operator): `docs/epic-cockpit-plan.md` in tetrad-development.
