# Data Model: `/cockpit:review` command

**Feature**: `/cockpit:review` slash command (A2.4)
**Branch**: `354-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

`/cockpit:review` produces no persistent state. The "data model" for this command is the set of typed values it accepts, computes, and emits during one invocation. Each entity below names its shape, validation rules, and source.

---

## E1: `Gate`

The set of supported gate names.

```ts
type Gate = "specify" | "clarify" | "plan" | "tasks" | "impl";
```

**Validation**:
- Required argument (`--gate <name>`).
- Case-sensitive exact match against the literal set above.
- Unknown values → fail-fast with the valid list (FR-009).

**Source**: spec FR-002; clarification Q1 fixes the artifact mapping for the non-`impl` members.

---

## E2: `Mode`

How the command captures the developer's approval signal.

```ts
type Mode = "assist" | "auto" | "manual";
```

**Default**: `assist`.

**Semantics**:
| Mode | Emits summary? | Prompts via `AskUserQuestion`? | Invokes `/cockpit:advance` automatically? |
|------|----------------|--------------------------------|-------------------------------------------|
| `assist` | yes | yes (3 options) | only on explicit `approve` from the prompt |
| `auto` | yes | no | yes, iff `Suggested decision: approve` |
| `manual` | yes | no | never |

**Source**: spec FR-006; clarification Q2.

---

## E3: `GateArtifactMapping`

Compile-time lookup from non-`impl` gates to their canonical artifact path.

```ts
const GATE_ARTIFACT: Record<Exclude<Gate, "impl">, string> = {
  specify:  "specs/<feature>/spec.md",
  clarify:  "specs/<feature>/clarifications.md",
  plan:     "specs/<feature>/plan.md",
  tasks:    "specs/<feature>/tasks.md",
};
```

**Validation**:
- `<feature>` is resolved at runtime from the branch name (see E4).
- File must exist; missing → fail-fast with the expected path (FR-009).
- v1: no GitHub child-issue fetch for any gate, including `tasks` (Q1 → A).

**Source**: spec FR-004; clarification Q1.

---

## E4: `FeatureContext`

Runtime-computed identifier for the active speckit feature.

```ts
interface FeatureContext {
  branch: string;        // e.g. "354-epic-generacy-ai-tetrad"
  issueNumber: number;   // e.g. 354 (parsed from branch prefix)
  specsDir: string;      // e.g. "specs/354-epic-generacy-ai-tetrad"
}
```

**Resolution rules**:
1. Read current git branch.
2. Parse the leading `<digits>-` prefix as `issueNumber`.
3. Find the unique directory under `specs/` whose name begins with the same `<digits>-` prefix.
4. If zero or multiple matches → fail-fast listing candidates.

**Source**: spec Assumptions; research D7.

---

## E5: `SuggestedDecision`

The mandatory final-line verb on every summary.

```ts
type SuggestedDecision = "approve" | "request-changes" | "abort";
```

**Output invariant**: every gate's summary ends with the literal line:

```
Suggested decision: <approve|request-changes|abort>
```

**Source**: spec FR-005, SC-005; clarification Q5.

---

## E6: `ReviewSummary` (non-`impl` gates)

Structured output emitted for `specify` / `clarify` / `plan` / `tasks`.

```ts
interface ReviewSummary {
  gate: Exclude<Gate, "impl">;
  artifactPath: string;             // absolute path of the file read
  blockers: string[];               // bullet list; may be empty
  openQuestions: string[];          // bullet list; may be empty
  suggestedDecision: SuggestedDecision;
}
```

**Rendered as**:

```markdown
## Blockers
- <bullet> | (none)

## Open questions
- <bullet> | (none)

## Suggested decision
<rationale paragraph>

Suggested decision: <approve|request-changes|abort>
```

**Decision rule (default)**:
- `blockers` non-empty → `request-changes`.
- `blockers` empty, `openQuestions` non-empty → `request-changes` (developer can still override in `assist`).
- both empty → `approve`.
- catastrophic read failure → `abort` (but this path is normally caught earlier as a fail-fast error).

**Source**: spec FR-005; clarification Q5.

---

## E7: `ImplReviewSummary` (`impl` gate)

Pass-through wrapper around `/code-review`'s native output.

```ts
interface ImplReviewSummary {
  gate: "impl";
  prRef: string;                    // returned by /cockpit:review-context
  codeReviewOutput: string;         // emitted by /code-review, verbatim
  suggestedDecision: SuggestedDecision;
}
```

**Rendering rule**: emit `codeReviewOutput` verbatim. If it already ends with `Suggested decision: <verb>`, reuse that line. Otherwise append the standard final line.

**Source**: spec FR-003, FR-005; clarification Q5 (C — reuse `/code-review` schema verbatim).

---

## E8: `LabelTransition`

Reported back to the developer after `/cockpit:advance` succeeds.

```ts
interface LabelTransition {
  issueNumber: number;
  removed: `waiting-for:${Gate}`;
  added:   `completed:${Gate}`;
}
```

**Invariants**:
- `/cockpit:review` never produces a `LabelTransition` itself — it only echoes what `/cockpit:advance` reports.
- `phase:*` labels are never in `removed` or `added` — those are orchestrator-owned.
- There is no `gate:*` namespace anywhere in the model.

**Source**: clarification Q4 (D — correction). Spec Assumptions, updated.

---

## E9: `ReviewError`

Uniform fail-fast envelope for all error paths.

```ts
interface ReviewError {
  kind:
    | "unknown-gate"
    | "unknown-mode"
    | "feature-resolution-failed"
    | "review-context-failed"     // surfaces G1.3's message
    | "artifact-missing"
    | "advance-not-installed";
  message: string;                 // single, actionable line
  expectedPath?: string;           // populated for "artifact-missing"
}
```

**Invariant**: when a `ReviewError` is emitted, no labels are mutated (FR-008, SC-004).

**Source**: spec FR-009; research D8.

---

## Relationships

```
FeatureContext  ──┐
                  ├──> GateArtifactMapping ──> ReviewSummary ──┐
Gate (non-impl) ──┘                                            │
                                                               ├──> SuggestedDecision ──> [optional] LabelTransition
Gate ("impl") ── /cockpit:review-context ── /code-review ── ImplReviewSummary ──┘

Mode ── controls whether AskUserQuestion is invoked and whether LabelTransition is produced.

Any failure ── ReviewError (terminates the run; no LabelTransition).
```
