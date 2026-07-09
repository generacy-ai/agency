# Contract: Subagent Boundaries

**Feature**: 392-part-auto-mode-v1
**Target**: `packages/claude-plugin-cockpit/commands/auto.md` — the four analysis subagent hops

This contract defines the four subagent boundaries `auto.md` uses to keep the parent loop thin (spec § Decay countermeasures + § Invariants §5, applying the #390 pattern uniformly across every dispatched analysis workload).

Every subagent hop uses `subagent_type: "general-purpose"` **unconditionally** (per #390 R3 — the universally-shipped agent type). Every hop returns a **structured JSON value** with a fixed schema — the parent branches on parsed fields, never on parsed prose.

---

## SB.0 — Scope and global rules

**Four subagent boundaries**:

| # | Hop | Dispatched from | Return schema |
|---|-----|-----------------|---------------|
| SB.1 | Clarification drafter | D.1 | `[{question_id, drafted_answer, provenance}, ...]` OR `{"error": "..."}` |
| SB.2 | Review-verdict analyzer | D.2, D.3 | `[{file, line, summary, failure_scenario}, ...]` OR `[]` OR `{"error": "..."}` |
| SB.3 | Manual-validation summarizer | D.4 | `{scenarios: [...], acceptance_checks: [...]}` OR `{"error": "..."}` |
| SB.4 | Bounded fixer | D.6 | `{fixed: bool, summary, reason?}` (no error shape — errors surface as `{fixed: false, reason: "..."}`) |

**Global rules**:
- **SB.0.1**. Every invocation uses `subagent_type: "general-purpose"`. No `code-reviewer`, no capability-probing, no fallback branches.
- **SB.0.2**. Every return message is a **single JSON value**. No prose wrapper, no fenced code block, no additional text (per #390 C.3).
- **SB.0.3**. The parent parses each return message as JSON exactly once. Parse failures or shape mismatches route to Error handling class `OTHER` and (for gated dispatches) skip the `AskUserQuestion` call.
- **SB.0.4**. The parent **never restates the subagent's structured return verbatim** in the response body (the retained `MUST NOT print raw JSON` clause from #388 / #390, extended to every subagent hop).
- **SB.0.5**. Each subagent prompt inlines the return-schema directive verbatim so the sub-turn's contract is self-contained.
- **SB.0.6**. Each subagent prompt **MUST NOT** invoke any slash command (per #390 R1 — cross-slash-command invocation inside a sub-turn re-introduces the collision the boundary exists to close).

---

## SB.1 — Clarification drafter

**Dispatched from**: D.1 (`waiting-for:clarification`).

**Parent responsibility before invocation**:
1. Call `generacy cockpit context <issue-ref>` to fetch the open-question list, spec/plan bodies, and touched files.
2. Prepare the subagent prompt with the fetched context inlined.

**Agent tool invocation shape**:

```
subagent_type: "general-purpose"
description: "Draft clarifications <issue-ref>"  (3-5 words)
prompt: <inlined context + review-scope instructions + return-schema directive>
```

**Subagent prompt content** (structural — final wording chosen at implementation time):

- **Task**: For each open clarification question on `<issue-ref>`, produce one drafted answer grounded in the fetched context. Answers should be ~4–8 sentences each.
- **Grounding hierarchy**: question's own context → spec body → plan body → touched files. Cite the source (`spec.md § Section`, `plan.md § Section`, or `<path>:<line>`) as the `provenance` field.
- **Ungrounded questions**: If no citation is available, produce `_no draft — insufficient context_` as the `drafted_answer` and note the ungrounded state in `provenance`. Do NOT silently skip.
- **Return contract**: The entire return message MUST be a single JSON value — either an array of `{question_id, drafted_answer, provenance}` objects (one per open question, preserving question order), or `{"error": "<description>"}`. No prose wrapper. No fenced block. No additional text.

**Return schema**:

```json
[
  {
    "question_id": <int>,
    "drafted_answer": "<text — ~4-8 sentences, or `_no draft — insufficient context_`>",
    "provenance": "<citation string — spec.md § Section, plan.md § Section, path:line, or 'ungrounded — no citation available'>"
  },
  ...
]
```

**Error shape**:

```json
{"error": "<description of what went wrong — e.g., 'cockpit context returned no questions', 'context payload malformed'>"}
```

**Parent mapping (post-return)**:
- Non-empty array → present clarification batch gate (G.1) with the drafts.
- Empty array `[]` (should not happen if `cockpit context` returned questions, but handle defensively) → write ledger line `no open questions returned by drafter — anomaly`; continue.
- `{"error": "..."}` → route to Error handling class `OTHER`; write ledger line; do not gate.
- Unparseable / other shape → route to Error handling class `OTHER`; write ledger line quoting raw return.

---

## SB.2 — Review-verdict analyzer

**Dispatched from**: D.2 (`waiting-for:<artifact>-review`) and D.3 (`waiting-for:implementation-review`).

**Reuses #390's contract verbatim** — this is the same subagent boundary #390 defined for `/cockpit:review --gate implementation-review`, extended to also serve auto's artifact-review dispatches.

**Parent responsibility before invocation**:
- For D.2: resolve the target artifact file (`specs/<slug>/spec.md`, `plan.md`, `tasks.md`, `clarifications.md`).
- For D.3: resolve the PR reference (`<owner>/<repo>#<n>`) from `cockpit status --json`.
- Prepare the subagent prompt with only the scope reference (artifact path or PR ref). Do NOT inline the diff or artifact content — the subagent fetches its own (per #390 R5).

**Agent tool invocation shape**:

```
subagent_type: "general-purpose"
description: "Code review PR #<n>"  (or "Review artifact <name>")  (3-5 words)
prompt: <scope reference + review instructions + return-schema directive>
```

**Subagent prompt content**:

- **Task**: Review the artifact (D.2) or PR (D.3) for correctness issues.
- **Fetch instruction**: For D.3, run `gh pr diff <owner>/<repo>#<n>` and read surrounding files as needed. For D.2, read the artifact file directly.
- **Verify-before-report**: Empirically verify each finding before reporting it (bounded verification permitted — read surrounding files, run `node -e` repros, etc.).
- **Findings schema**: Each finding is `{file, line, summary, failure_scenario}` — path relative to repo root, 1-indexed line, one-line summary, one-to-three-sentence failure scenario.
- **Return contract**: The entire return message MUST be a single JSON value — either an array of findings, `[]` for zero findings, or `{"error": "<description>"}`. No prose wrapper. No fenced block. No additional text.

**Return schema** (verbatim from #390):

```json
[
  {
    "file": "<path relative to repo root>",
    "line": <1-indexed integer>,
    "summary": "<one-line human-readable description>",
    "failure_scenario": "<one-to-three sentences on the concrete failure mode>"
  },
  ...
]
```

Or `[]` (zero findings — valid non-error return). Or `{"error": "<description>"}` (hard error).

**Parent mapping** (verbatim from #390 C.4):
- Non-empty array → findings-table branch → G.2 review verdict gate.
- `[]` → zero-findings branch → G.2 with the `| (none) | | | |` row + `Suggested decision: approve`.
- `{"error": "..."}` → Error handling class `OTHER`; do NOT invoke `AskUserQuestion`.
- Unparseable / other shape → Error handling class `OTHER`; quote raw return.

**Retained rule** (from #390 C.5 / FR-009): `MUST NOT print raw JSON under any circumstance.` The parent renders the parsed array as a findings-summary table; it never restates the JSON verbatim.

---

## SB.3 — Manual-validation summarizer

**Dispatched from**: D.4 (`waiting-for:manual-validation`).

**Parent responsibility before invocation**:
1. From `cockpit status --json`, get the issue-ref and its associated PR ref.
2. Prepare the subagent prompt with the issue-ref and PR-ref.

**Agent tool invocation shape**:

```
subagent_type: "general-purpose"
description: "Manual val summary <issue-ref>"  (3-5 words)
prompt: <issue-ref + PR-ref + read-and-summarize instructions + return-schema directive>
```

**Subagent prompt content**:

- **Task**: Assemble a "what to test" summary for manual validation of `<issue-ref>` (PR `<pr-ref>`).
- **Sources** (subagent reads directly):
  - The spec's §Success Criteria (from `specs/<slug>/spec.md`, resolved from the issue).
  - The issue's acceptance criteria (from `gh issue view <issue-ref> --json body -q .body`, or the spec's User Stories §).
  - The PR's title and body (from `gh pr view <pr-ref> --json title,body -q .`).
- **Output**: Two lists — `scenarios` (concrete test scenarios the operator should exercise) and `acceptance_checks` (specific acceptance criteria that should be verified). One-line per item.
- **Return contract**: The entire return message MUST be a single JSON value — either `{scenarios: [...], acceptance_checks: [...]}` or `{"error": "<description>"}`. No prose wrapper. No fenced block.

**Return schema**:

```json
{
  "scenarios": ["<one-line scenario>", ...],
  "acceptance_checks": ["<one-line check>", ...]
}
```

Or `{"error": "<description>"}`.

**Parent mapping**:
- Valid object with both lists → present G.3 manual-validation gate.
- `{"error": "..."}` → Error handling class `OTHER`; do NOT invoke gate; write ledger line.
- Unparseable / other shape → Error handling class `OTHER`; quote raw return.

**Rationale for the subagent hop** (Q4=B): keeps whole-file reads (spec.md, issue body, PR body) out of the parent's context — a run that lives for two phases stays lean. The parent only handles the small `{scenarios, acceptance_checks}` summary.

---

## SB.4 — Bounded fixer

**Dispatched from**: D.6 (`completed:validate` red / merge red).

**Parent responsibility before invocation**:
1. Verify the failing checks are repo-owned CI (tests / lint / typecheck / build), not infrastructure / runner failures.
2. Verify the attempt counter (this is the first autonomous run per red event; a re-run requires the escalation gate's Retry action).
3. Prepare the subagent prompt with `{ pr, reason, checks, attempt, max_attempts }` (following `merge.md`'s existing shape for the fixer subagent).

**Agent tool invocation shape**:

```
subagent_type: "general-purpose"
description: "Fix red checks PR #<n>"  (3-5 words)
prompt: <PR ref + failing-check summaries + outcome-scoping + return-schema directive>
```

**Subagent prompt content** (following Q1=D refined):

- **Task**: Make the named failing checks green on PR `<pr-ref>`. Nothing else.
- **Outcome scope** (verbatim in the prompt):
  > "Make this specific red green (the named failing checks: `<check names>`). No refactors, no feature work, no scope expansion, no 'while I'm here' cleanups. If the fix requires design judgment (ambiguous root cause, multiple viable approaches, an architectural decision), stop and return `{fixed: false, reason: '<explanation>'}` instead of guessing."
- **Bounded verification**: The subagent MAY read surrounding files, run local checks (tests / lint / typecheck / build), and iterate on its own fix before returning. The `once` bound is on the **parent's** dispatch (the Agent tool is called at most once per red event autonomously); the subagent's internal work is not turn-bounded.
- **Push responsibility**: The subagent MAY push commits to `pr.head_ref` if it produces a fix. On successful push, re-check via `cockpit merge` in the parent (D.5 loop-back).
- **Non-goals**: MUST NOT call `generacy cockpit merge` — the parent owns the loop. MUST NOT edit unrelated files. MUST NOT open a new PR. MUST NOT invoke any slash command.
- **Return contract**: The entire return message MUST be a single JSON value: `{fixed: bool, summary, reason?}`. No prose wrapper. No fenced block.

**Return schema**:

```json
{
  "fixed": <bool>,
  "summary": "<text — what was attempted / what was changed>",
  "reason": "<text, present when fixed: false — why the fixer stopped>"
}
```

**No `{"error"}` shape** for this subagent — errors surface as `{fixed: false, reason: "<error description>"}`. This keeps the parent's dispatch table simple: two branches (`fixed: true` → merge loop-back; `fixed: false` → escalation gate).

**Parent mapping**:
- `{fixed: true, summary: "..."}` → loop back to D.5 (re-run `cockpit merge`). If checks are still red on re-check, that's a new red event (the fix didn't work); the escalation gate presents on the second failure.
- `{fixed: false, summary: "...", reason: "..."}` → present G.4(a) escalation gate with the fixer's summary + reason.
- Unparseable / other shape → treat as `{fixed: false, reason: "fixer return unparseable"}` and route to G.4(a) escalation gate.

**Retry mechanics** (Q3=D + Q1=D refined):
- The fixer runs **once autonomously** per red event (spec § Dispatch: "runs once").
- Each additional run requires the operator to select `Retry (re-run fixer)` at the escalation gate.
- Each Retry produces a **new** ledger line and a **new** subagent invocation. No unbounded retry loop.

---

## SB.5 — Global anti-patterns (each is a CONTRACT VIOLATION)

**AP-1**. Any subagent hop uses `subagent_type` other than `"general-purpose"` (e.g., `code-reviewer`, or a per-environment branch). Violates SB.0.1 + #390 R3.

**AP-2**. Any subagent return contains prose above or below the JSON, or wraps the JSON in a fenced code block. Violates SB.0.2 + #390 C.3.

**AP-3**. The parent parses tolerantly — accepts prose + fenced JSON as if it were strict JSON. Violates SB.0.3 (a compounding violation of AP-2).

**AP-4**. The parent restates a subagent's structured return verbatim in the response body. Violates SB.0.4 + #388 / #390 retained clause.

**AP-5**. A subagent prompt invokes a slash command (`/code-review`, `/speckit:*`, `/cockpit:*`, etc.). Violates SB.0.6 + #390 R1. Reintroduces the contract collision the boundary exists to close.

**AP-6**. The clarification drafter (SB.1) returns a partial list (fewer entries than the open-question count) without an accompanying `{"error"}` shape. Violates SB.1's grounding-hierarchy contract.

**AP-7**. The review-verdict analyzer (SB.2) returns `[]` and the parent skips the gate (auto-approves). Violates GC.2.5 + SB.0.4 spirit.

**AP-8**. The review-verdict analyzer (SB.2) returns `{"error"}` and the parent presents the gate anyway (manufacturing consent from an empty analysis). Violates GC.2.4 + #390 C.4.

**AP-9**. The manual-validation summarizer (SB.3) reads whole-spec / whole-PR content and the parent inlines it in the presentation instead of using the structured summary. Violates SB.3's Q4=B contract (context-budget preservation).

**AP-10**. The bounded fixer (SB.4) is invoked in a loop by the parent without operator approval at the escalation gate. Violates Q3=D + spec § Dispatch: "runs once".

**AP-11**. The bounded fixer (SB.4) makes changes outside the "specific red → green" outcome scope (refactors, feature work, adjacent cleanups). Violates Q1=D refined outcome-scoping.

**AP-12**. Any subagent invocation is missing from `auto.md`'s dispatch prose (e.g., D.4 skips the summarizer hop and inlines the analysis in the parent). Violates spec § Decay countermeasures + § Invariants §5 + #390 R1.

---

## Cross-boundary contract invariants (SBC)

- **SBC.1**. All four subagent hops use `subagent_type: "general-purpose"` verbatim in `auto.md`.
- **SBC.2**. All four subagent return schemas are stated verbatim in `auto.md`'s dispatch prose.
- **SBC.3**. The retained #388 / #390 `MUST NOT print raw JSON` clause appears once in `auto.md`, inline before the review-verdict findings-summary table rendering instruction (in D.2 / D.3's prose).
- **SBC.4**. The parent-mapping rule (JSON return → parent branch) is stated verbatim per hop.
- **SBC.5**. No subagent prompt instructs the sub-turn to invoke a slash command.
- **SBC.6**. Every subagent invocation produces a ledger line for its parent dispatch (per data-model.md § 2.5 + [ledger-line.md](./ledger-line.md) LC.1).
