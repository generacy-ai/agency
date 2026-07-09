# Implementation Plan: Isolate implementation-review's `/code-review` invocation in a subagent

**Feature**: Isolate implementation-review's `/code-review` invocation in a subagent to prevent gate-skip contract collision
**Branch**: `390-found-during-cockpit-v1`
**Date**: 2026-07-09
**Spec**: [spec.md](./spec.md)
**Status**: Complete

## Summary

Restructure `packages/claude-plugin-cockpit/commands/review.md` so the implementation-review sub-branch of the fused step 3 invokes the code review **inside a subagent** (Agent tool, `general-purpose` agent type — fixed, no capability probing) rather than inline via Claude Code's built-in `/code-review`. The subagent returns findings as a single strict JSON value (either an array of `{file, line, summary, failure_scenario}` objects or `{"error": "<description>"}`); the parent playbook consumes that structured result and proceeds — in the same response — into the existing #388 fused findings-summary table + `AskUserQuestion` prompt.

The change is **structural**, not textual reinforcement: the subagent boundary removes the `/code-review` sub-skill's competing terminal contract from the parent's shared context, closing the gate-skip / raw-JSON class by construction. This is the third and final fix for the same recurrence pattern (#384 Terminal Outcome Check, #388 fused analysis+prompt, #390 subagent isolation); no third prompt patch is added.

Governance follow-through: `packages/claude-plugin-cockpit/README.md` line 7 is amended to remove the "single documented exception" for `/code-review` and to state that cross-command composition happens via the subagent boundary. The historical epic plan at `specs/372-epic-generacy-ai-tetrad/plan.md` is deliberately NOT edited (Status: Complete artifact).

Like #388, this is a **playbook edit** — no runtime code, no schema, no CLI wiring. The runtime is the model executing the playbook; the contracts are the greppable rule sentences plus the subagent invocation shape and the strict-JSON return schema.

## Technical Context

**Language/Version**: Markdown (playbook prose interpreted by Claude at runtime)
**Primary Dependencies**: None new. Existing runtime: Claude Code slash-command executor, `AskUserQuestion` tool, Agent tool. `gh` CLI remains the PR-diff acquisition path (now used inside the subagent, not the parent).
**Storage**: Filesystem — two files edited: `packages/claude-plugin-cockpit/commands/review.md` and `packages/claude-plugin-cockpit/README.md`.
**Testing**:
- **Static**: greps for the subagent invocation directive, the strict-JSON return schema, the removed README exception phrase, and the new README subagent-boundary wording. Retained #388 checks continue to apply (fusion rule sentence exactly once; `MUST NOT print raw JSON` clause inline; Terminal Outcome Check fence markers intact; sibling playbooks byte-identical).
- **Behavioral**: one replayed long-analysis implementation-review session where the parent's post-subagent response contains the Agent tool call, then the structured JSON result, then the fused #388 findings-summary table + `AskUserQuestion`, with no raw JSON in the parent transcript. Continued live `/cockpit:review --gate implementation-review` usage on the smoke-test corpus is the true verifier (SC-001).
**Target Platform**: Claude Code slash-command runtime (any platform where `packages/claude-plugin-cockpit` is installed).
**Project Type**: Single-package documentation edit (two files in one plugin package).
**Performance Goals**: N/A (playbook adherence, not throughput). Adherence target: 0 gate skips and 0 raw-JSON transcript incidents on the smoke-test corpus that triggered #384 / #388 / #390 (SC-001, SC-002).
**Constraints**:
- Agent tool call uses `subagent_type: "general-purpose"` unconditionally (Q2=A, FR-001). No `code-reviewer` preference, no capability probing, no fallback branch in the playbook.
- Subagent prompt carries the review scope as `owner/repo#<n>` only; the subagent runs `gh pr diff` itself, reads surrounding files, and may run bounded verification (`node -e` repros etc.) — Q4=B, FR-002.
- Subagent return message MUST be a single JSON value: array of `{file, line, summary, failure_scenario}` (`[]` for zero findings) OR `{"error": "<description>"}`. No prose wrapper, no fenced block, no additional text — Q3=A refined, FR-003.
- Parent mapping is deterministic (FR-004): non-empty array → findings-table branch; `[]` → zero-findings branch; `{"error": …}` → hard-error branch; anything else → hard-error branch quoting the raw message. No new terminal states introduced (FR-005).
- Retained `MUST NOT print raw JSON` clause stays inline before the findings-summary table rendering instruction (FR-009 defense-in-depth).
- Scope: `review.md` + `README.md` only. Sibling playbooks (`clarify.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) untouched (FR-007). `specs/372-epic-generacy-ai-tetrad/plan.md` byte-identical (SC-006).
- No third prompt-side mitigation added to the outer playbook beyond what #384/#388 shipped (SC-007).
**Scale/Scope**: Two files. `review.md` ~136 lines pre-edit → net-neutral to slightly larger (subagent invocation replaces `/code-review` line + adds return-schema parsing directives). `README.md` line 7 is a one-line replacement.

## Constitution Check

No `.specify/memory/constitution.md` file exists in this repository (`.specify/` contains only `templates/`). No governance gates to check. #388 recorded the same finding — nothing has changed on that surface.

## Project Structure

### Documentation (this feature)

```text
specs/390-found-during-cockpit-v1/
├── spec.md                         # Feature spec (read-only)
├── clarifications.md               # Q1–Q4 with resolved answers (read-only)
├── plan.md                         # THIS FILE
├── research.md                     # Decisions and rationale (Phase 0)
├── data-model.md                   # Playbook structural model, pre/post layout
├── quickstart.md                   # Verification runbook (static + behavioral)
├── contracts/
│   └── subagent-boundary.md        # Structural contract: invocation shape + strict-JSON return schema + parent mapping
├── checklists/                     # (empty — reserved for /checklist skill)
└── tasks.md                        # Phase 2 output — generated by /tasks (NOT created by /plan)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/
│   └── review.md                   # MODIFIED — step 3 sub-branch A is subagent-based
└── README.md                       # MODIFIED — line 7 exception language removed
```

Sibling files (untouched — per FR-007):

```text
packages/claude-plugin-cockpit/commands/
├── clarify.md                      # No inline slash-command invocation
├── merge.md                        # No inline slash-command invocation
├── queue.md                        # No inline slash-command invocation
├── status.md                       # No inline slash-command invocation
└── watch.md                        # No inline slash-command invocation
```

Historical artifact (deliberately untouched — SC-006):

```text
specs/372-epic-generacy-ai-tetrad/plan.md   # Status: Complete; byte-identical across this branch
```

**Structure Decision**: Single-package playbook + governance edit. The "structure" is the internal sub-branch layout of `review.md`'s fused step 3 and the one-line exception-clause replacement in the plugin README. See [data-model.md](./data-model.md) for the pre/post sub-branch layout and [contracts/subagent-boundary.md](./contracts/subagent-boundary.md) for the invocation and return-schema contracts.

## Constitution Check (re-check)

No constitution file present. No gates to re-check.

## Complexity Tracking

No constitution violations to justify. The change is intentionally minimal (two files, one plugin package) and structural (isolation boundary, not textual reinforcement). The design explicitly rejects a third prompt patch (SC-007), rejects a capability-probing branch in the playbook (Q2=A), rejects prose or fenced-block tolerance in the subagent return (Q3=A refined), rejects a parent-inlines-diff path (Q4=B), and rejects a retroactive edit of the completed epic plan (Q1=B).

## Phase Layering

- **Phase 0 (research)**: Captured in [research.md](./research.md) — the Q1–Q4 decisions and their rationale (resolved in `clarifications.md`; research.md restates them as design decisions with alternatives-rejected).
- **Phase 1 (design)**: [data-model.md](./data-model.md) (pre/post sub-branch layout, invariants), [contracts/subagent-boundary.md](./contracts/subagent-boundary.md) (invocation shape + strict-JSON return schema + parent mapping), [quickstart.md](./quickstart.md) (verification runbook).
- **Phase 2 (tasks)**: Generated by `/tasks` from this plan — NOT created here.

## Key Design Decisions (from clarifications)

| # | Decision | Source |
|---|----------|--------|
| D1 | Governance amendment target = `packages/claude-plugin-cockpit/README.md` only (line 7). Do NOT retro-edit `specs/372-epic-generacy-ai-tetrad/plan.md`. Canonical design-principles doc `docs/epic-cockpit-plan.md` in tetrad-development is outside this repo's reach (already amended by the operator). | Q1=B |
| D2 | Agent-type selection = fixed `general-purpose`, unconditionally. No `code-reviewer` preference, no capability probing, no fallback path in the playbook. The inline review prompt carries everything the sub-turn needs. | Q2=A |
| D3 | Subagent return format = a single JSON value: array of `{file, line, summary, failure_scenario}` (`[]` for zero findings) OR `{"error": "<description>"}`. No prose wrapper, no fenced block, no free-form drift surface. | Q3=A refined |
| D4 | PR diff acquisition = subagent runs its own `gh pr diff <owner>/<repo>#<n>`; parent passes only the PR reference. Subagent is explicitly permitted to read surrounding files and run bounded verification. `gh` failure inside the subagent → `{"error": …}` → parent's hard-error branch. | Q4=B |

## Rejected Approaches (informative)

- **Third prompt patch on `review.md` — an explicit precedence clause around the inline `/code-review` invocation.** Rejected because two prompt-strengthening rounds against the same failure (#384, #388) have both been defeated at exactly this gate. Prompt-side outer-playbook wording cannot reliably out-prompt an inner skill's terminal contract loaded into shared context; only removing the collision (subagent boundary) does.
- **`code-reviewer` agent type preferred, with `general-purpose` fallback.** Rejected under Q2=A: `code-reviewer` is not universally shipped (cluster sessions in particular don't have it), and the inline review prompt already carries the schema + verify-before-report instruction, so the specialized agent type would add nothing while making playbook behavior vary with the environment's agent registry.
- **Parent-inlines-diff (`gh pr diff` in the parent, embed in subagent prompt).** Rejected under Q4=B: the live session's confirmed finding came from *beyond-the-diff* work (reading both test files, then an empirical `node -e` repro). Inlining a diff silently caps the reviewer at diff-only reading and re-introduces a scope regression.
- **Prose + fenced-block return tolerance from the subagent.** Rejected under Q3=A refined: prose tolerance is exactly the ambiguous-output failure class this issue exists to remove. Heuristic regex parsing of free-form prose is the bug pattern the strict JSON boundary is meant to escape.
- **Retroactive edit of `specs/372-epic-generacy-ai-tetrad/plan.md`.** Rejected under Q1=B: it is a `Status: Complete` historical artifact and the exception it documented was real when it shipped. Rewriting it falsifies the record.

## Verification Layering (per SC-002 / SC-005)

Static (necessary but not sufficient — the #384/#388 experience proved static-only fails at behavioral defects):

- Subagent invocation directive present in `review.md`'s implementation-review sub-branch (greppable phrase).
- Return-schema directive present in the same sub-branch (JSON shape stated verbatim, options exhausted).
- Parent mapping table present in the same sub-branch (`[]` → zero-findings; `{"error"…}` → error handling; unparseable → error handling with quoted raw).
- Retained `MUST NOT print raw JSON` clause verbatim, inline before the table rendering instruction (#388 defense-in-depth).
- README line 7 no longer contains "single documented exception … `/code-review`"; new wording present exactly once.
- `specs/372-epic-generacy-ai-tetrad/plan.md`: `git diff` shows zero changes.
- Sibling playbooks: `git diff` shows zero changes.

Behavioral (evidence, not proof):

- One replayed long-analysis implementation-review transcript where the parent contains an Agent tool call → structured JSON result → fused #388 findings-summary table + `AskUserQuestion` in the same response — with no raw JSON anywhere in the parent transcript.

True verifier:

- Continued live `/cockpit:review --gate implementation-review` usage on the smoke-test corpus that triggered #384 / #388 / #390 (SC-001). Adherence is probabilistic — the isolation removes the class of failure by construction, but confirmation is empirical.
