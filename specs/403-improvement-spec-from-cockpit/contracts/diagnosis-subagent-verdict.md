# Contract: Diagnosis subagent verdict schema (D.7 and D.11)

**Applies to**: `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch D.7 step 1–3, § Dispatch D.11 step 1–2, § Gate contract G.4 (b) and (d); `tests/playbook-verification.test.ts` assertions 403-4, 403-5.

## Contract statement

### Parent's fetch envelope

**The parent's sole evidence-fetch verb for D.7 and D.11 is `generacy cockpit context <issue>`.**

- No ad-hoc `gh` chains.
- No link-following.
- No `gh issue view --comments` inline in the parent.
- No `gh api` calls inline in the parent.

The payload is whatever the engine bundle returns. If the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), the fix is server-side in generacy — a schema change to `generacy cockpit context <issue>` to include that artifact in the bundle. That's a one-time fix, not a per-session decision.

### Subagent dispatch

Anything beyond the initial evidence fetch is dispatched to a diagnosis subagent. Invocation shape:

```yaml
subagent_type: "general-purpose"
description: "Diagnose <issue-ref> failure"
prompt: |
  <issue-ref>
  <failure-context payload from generacy cockpit context — verbatim>

  You are diagnosing a failure. Investigate as needed (repro, log reads,
  version bisection, branch inspection, downstream artifact fetch). Return
  exactly one JSON value matching this schema:

  {
    "root_cause": "<1-3 sentence explanation>",
    "evidence": "<verbatim snippet(s) from the bundle or your reads>",
    "recommended_action": "<one of the target gate's option strings, verbatim>",
    "confidence": "low" | "medium" | "high"
  }

  Target gate: <D.7 | D.11>
  Target gate options (recommended_action must be one of these, verbatim):
  <D.7 options if D.7: "Requeue (cockpit resume)", "Skip (session-local mute)", "Stop (exit auto)">
  <D.11 options if D.11: "I've resolved it — advance the gate", "Skip (session-local mute)", "Stop (exit auto)">

  Confidence semantics:
  - "high": you believe the recommended action will resolve the failure.
  - "medium": plausible but uncertain.
  - "low": a guess; operator should verify.

  Do NOT emit prose, a fenced block, or slash-command invocations. Return
  only the JSON value. On unrecoverable error return {"error": "<description>"}.
```

### Return schema

Strict JSON, one of:

```typescript
type Verdict = {
  root_cause: string;
  evidence: string;
  recommended_action: RecommendedAction;
  confidence: "low" | "medium" | "high";
};

type D7RecommendedAction =
  | "Requeue (cockpit resume)"
  | "Skip (session-local mute)"
  | "Stop (exit auto)";

type D11RecommendedAction =
  | "I've resolved it — advance the gate"
  | "Skip (session-local mute)"
  | "Stop (exit auto)";

type RecommendedAction = D7RecommendedAction | D11RecommendedAction;

type VerdictError = { error: string };
```

**Validation rules** (see [data-model.md](../data-model.md) § Validation rules for Verdict):

- `root_cause` and `evidence` are non-empty strings.
- `recommended_action` is exactly one of the target gate's option strings, verbatim (whitespace/capitalization/punctuation-strict).
- `confidence` is exactly one of `"low"`, `"medium"`, `"high"` — numeric confidence values are rejected.
- The `error` shape is mutually exclusive with the `Verdict` shape.

### Presentation-population source

The parent maps the verdict directly onto the § Gate contract G.4 (b) or (d) five-element presentation block. No in-parent re-analysis. The mapping is verbatim:

| Verdict field | Gate presentation slot |
|---------------|------------------------|
| `root_cause` | Context row of the five-element block |
| `evidence` | Evidence row of the five-element block |
| `recommended_action` | "Suggested decision: <action>" line |
| `confidence` | Appears next to the suggested decision line as "confidence: <low\|medium\|high>" |

The `AskUserQuestion` gate itself is unchanged — same options, same order, same header, same `multiSelect: false`. The verdict is a **hint**, not a preselection. The operator retains the full option set. This preserves the "every gate prompts; none auto-proceed" invariant from § Invariants §6.

## Preserved (unchanged from the current playbook)

- **D.7's Apply verdict branches**: `Requeue` → `generacy cockpit resume`; `Skip` → session mute; `Stop` → exit.
- **D.7's degradation clause**: if `generacy cockpit resume` is unavailable (G-S8 didn't ship the verb), Requeue degrades to Skip with an explicit ledger note.
- **D.11's Apply verdict branches**: `I've resolved it — advance the gate` → `generacy cockpit advance --gate merge-conflicts`; on non-zero exit, re-present the D.11 gate with CLI stderr prepended verbatim; `Skip` → session mute; `Stop` → exit.
- **D.7's and D.11's ledger line shapes** (§ Ledger vocabulary table).
- **The G.4 subtype option strings**: unchanged. The verdict's `recommended_action` field just states which of the existing options the subagent believes is right.
- **The #388 fusion invariant**: presentation + `AskUserQuestion` in one assistant response. The presentation is now populated from the verdict (not from ad-hoc parent reasoning), but the fusion shape is the same.

## Rejected forms

- **Strict-one-CLI-call parent envelope** (Q3=A rejected). Parent still reasons about link topology.
- **Alert comment + one linked-log fetch in parent** (Q3=B rejected). Same failure mode.
- **Parent follows one level of links** (Q3=C rejected). Same failure mode with more indirection.
- **Numeric confidence** (Q4=B rejected). False precision from an LLM judge.
- **Free-form prose recommendation** (Q4=C rejected). Loses the one-decision gate property; parent has to interpret.
- **Structured findings only; parent selects the option via rules** (Q4=D rejected). Reintroduces parent-side inference dressed as presentation rules.

## Prose shape (D.7)

```markdown
### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch verb is `generacy cockpit context <issue>`. No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent. The payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope.
2. **Spawn diagnosis subagent** — for any further work (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch), dispatch to a diagnosis subagent. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Diagnose <issue-ref> failure"
   prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
   ```
   The subagent MUST NOT invoke any slash command. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. On unrecoverable error the subagent returns `{"error": "<description>"}`.
3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block populated verbatim from the verdict — `root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it — followed by a single `AskUserQuestion` with the unchanged D.7 option set. No in-parent re-analysis.

**Apply verdict**: (unchanged — same as current playbook)
   - `Requeue` → `generacy cockpit resume <issue-ref>` …
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Degradation clause**: (unchanged)

**Ledger line**: (unchanged)

**Failure modes**: (unchanged — plus: subagent returns `{"error": …}` → present the escalation gate with the error in the evidence row and no "Suggested decision" line; operator picks from the unchanged option set with no LLM hint. Alternative: `parseVerdict` rejects the JSON → same handling.)
```

## Prose shape (D.11)

Same shape as D.7's step 1–3 rewrite, with the D.11 gate's option strings substituted (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`) as the `recommended_action` constraint. D.11's Apply verdict branches, non-zero re-present shape, and ledger line are unchanged.

## Test coverage

- **403-4**: D.7 and D.11 prose:
  - Positive: contains `generacy cockpit context <issue>` in step 1 evidence-fetch prose.
  - Negative: does NOT contain `gh issue view --comments` in step 1.
  - Positive: contains the "Spawn diagnosis subagent" prose block with the exact return-schema directive `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`.

- **403-5**: `parseVerdict` reference:
  - Fixture `403-d7-verdict-requeue.json` (`recommended_action: "Requeue (cockpit resume)"`, `confidence: "high"`) → parses cleanly.
  - Fixture `403-d11-verdict-resolved.json` (`recommended_action: "I've resolved it — advance the gate"`, `confidence: "medium"`) → parses cleanly.
  - Fixture `403-verdict-invalid-action.json` (`recommended_action: "Merge it"`) → validation error naming the invalid action verbatim.
  - Fixture with `confidence: 0.72` (numeric) → validation error naming the invalid confidence value.

## True verifier

Transcript grep on a comparable 12-issue epic run: for every D.7 or D.11 gate presentation, a `Verdict`-shaped JSON blob appears in the transcript immediately before the presentation (the subagent's return). Absent verdicts indicate the parent regressed to in-parent analysis. SC-004.
