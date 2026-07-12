# Contract: post-fix D.7 step 2 verdict return-schema — `failure_class_changed` + `failure_classes_seen`

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` — D.7 step 2 (subagent invocation contract), specifically the verdict-return-schema addendum for repeat dispatches.

## Structural contract

D.7 step 2 MUST contain:

1. **The first-dispatch verdict shape** (unchanged from pre-fix): a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`.
2. **The repeat-dispatch verdict shape** (post-fix addendum): the first-dispatch shape extended by two required fields: `failure_class_changed: boolean` and `failure_classes_seen: string[]`.
3. **The `failure_class_changed` computation rule** (Q2=B): any-of-three-dimensions differs → true, with canonical failing-test identifier.
4. **The `failure_classes_seen` update rule** (Q3=D): running list carried across repeat dispatches; immediately-prior comparison basis.
5. **The continuation-miss rule** (Q4=A): fresh spawn with both alert bodies verbatim when the first-dispatch subagent is no longer active.

## First-dispatch verdict shape (unchanged from pre-fix)

```typescript
type DiagnosisVerdictFirstDispatch = {
  root_cause: string;                    // subagent's narrative of why the failure occurred
  evidence: string;                      // subagent's citation of the alert-body content the root cause is derived from
  recommended_action: "Requeue (cockpit resume)" | "Skip (session-local mute)" | "Stop (exit auto)";
  confidence: "low" | "medium" | "high";
};
```

Both `failure_class_changed` and `failure_classes_seen` are absent (or explicitly `null` if the schema is required to be uniform) on first dispatch — there is no prior evidence to compare against.

## Repeat-dispatch verdict shape (post-fix)

```typescript
type DiagnosisVerdictRepeatDispatch = DiagnosisVerdictFirstDispatch & {
  failure_class_changed: boolean;        // any-of-three dimensions differs between fresh and immediately-prior alert
  failure_classes_seen: string[];        // running list of classifier identifiers across this issue's repeat dispatches this session
};
```

Both `failure_class_changed` and `failure_classes_seen` are required on repeat dispatches. Absence of either field on a repeat dispatch is a contract violation the parent MUST detect (and treat as an unrecoverable subagent error — return `{"error": "verdict missing failure_class_changed and/or failure_classes_seen on repeat dispatch"}` to G.4(b) as a subagent-error class).

## `failure_class_changed` computation rule (Q2=B)

The subagent computes `failure_class_changed = true` iff *any* of three dimensions differs between the fresh and immediately-prior alert bodies:

### Dimension 1: `classifier_reason` (engine-authored)

- Compared by **exact string match** on the field's value.
- **Absent-vs-present differs** by definition (an alert with no `classifier_reason` differs from an alert with one).
- Post-#915, `classifier_reason` is present for structured taxonomy-mapped failures and absent for process failures (exit 1 / signal / timeout).

### Dimension 2: `error_taxonomy` (engine-authored)

- Compared by **exact string match** on the field's value.
- **Absent-vs-present differs** by definition.
- Post-#915, `error_taxonomy` is a stable taxonomy identifier per failure class.

### Dimension 3: `failing_test/step` (canonicalized)

- The subagent derives a **canonical test identifier** — never raw line text.
  - For test failures: `<file>::<name>` form (test-runner-agnostic; e.g., `packages/foo/tests/bar.test.ts::should reject empty input`).
  - For non-test failing steps: equivalent stable identifier (e.g., `<step-name>` from the CI config, `<script-name>` from the package.json, etc. — whatever is stable across runs).
- Compared by **exact string match** on the canonical form.
- **Absent-vs-present differs** by definition.
- Raw line text is explicitly NOT the comparison basis: line numbers, durations, and temp workspace paths drift across runs of the same failure, manufacturing false "changed" verdicts.

### Combinator: any-of-three

```typescript
function computeFailureClassChanged(fresh: AlertBody, prior: AlertBody): boolean {
  return (
    (fresh.classifier_reason ?? null) !== (prior.classifier_reason ?? null) ||
    (fresh.error_taxonomy ?? null) !== (prior.error_taxonomy ?? null) ||
    canonicalize(fresh.failing_test_step) !== canonicalize(prior.failing_test_step)
  );
}
```

## `failure_classes_seen` update rule (Q3=D)

The running list is carried across repeat dispatches; each repeat dispatch appends the fresh alert's classifier identifier.

### On the second dispatch (first repeat)

Initialize with the first-dispatch alert's classifier identifier + the fresh alert's classifier identifier:

```typescript
failure_classes_seen = [<first-dispatch-classifier-id>, <fresh-classifier-id>];
```

### On the N-th dispatch (N ≥ 3)

Take the running list from the immediately-prior verdict's `failure_classes_seen` and append the fresh alert's classifier identifier:

```typescript
failure_classes_seen = [...<prior.failure_classes_seen>, <fresh-classifier-id>];
```

### The `classifier_id` derivation

The `classifier_id` used in the running list is derived from the alert body per the following priority order:

1. If `classifier_reason` is present in the alert body: use its value.
2. Else if `error_taxonomy` is present: use its value.
3. Else: use the canonical failing-test identifier from dimension 3.
4. Else (no dimensions available): use a placeholder like `<unclassified>` (rare — indicates the alert body is malformed post-#915).

### The comparison basis (Q3=D)

`failure_class_changed` compares the fresh alert against the **immediately-prior** alert — not the original first-dispatch alert. This matches the operator's per-decision framing (each G.4(b) gate decides on one Requeue's effect).

The running list carries history for cycle detection: A → B → A shows as `[A, B, A]`, rendered at the gate as "classes this session: A → B → A" so the operator can spot the cycle in one line without decoding two-boolean encodings.

## Continuation-miss rule (Q4=A)

When the first-dispatch diagnosis subagent is no longer active (returned / disposed across a Requeue window), the parent spawns a fresh diagnosis subagent using the first-dispatch invocation shape (`subagent_type: "general-purpose"`), but with a prompt containing:

1. **Verbatim fresh alert body** (from the fresh `cockpit_context` return payload's failure-alert comment).
2. **Verbatim prior alert body** (from the same `cockpit_context` return payload's failure-alert comment history — mechanically identifiable as the previous failure-alert comment on the issue).
3. **The verdict-return-schema addendum instruction** (subagent MUST include `failure_class_changed` and `failure_classes_seen` in the return payload).

The prior alert is a persistent engine-marked comment on the issue — never lost even when the subagent dies. The parent's job on continuation-miss is pure transport: fetch both bodies, hand them to a fresh subagent, forward the verdict to G.4(b).

**Explicitly forbidden**: any parent-authored summary of similarity, or any transformation of the alert body (e.g., truncation, reformatting, "cleaned up" prose). The fresh subagent computes `failure_class_changed` from the two evidences it holds.

**Explicitly forbidden**: reading a prior *verdict* from the ledger (Q4=D rejected). Feeding the fresh subagent a prior verdict instead of prior evidence is a diluted form of parent-authored characterization; the fresh subagent MUST see the actual alert body, not a distillation.

## Continuation-hold form (SendMessage to existing subagent)

When the first-dispatch subagent is still live, the parent uses SendMessage to continue it. The continuation prompt contains:

1. **Verbatim fresh alert body** (from the fresh `cockpit_context` return payload).
2. **Prior-context reference** ("continuing from earlier diagnosis" — the subagent still holds the prior alert body in-context).
3. **The verdict-return-schema addendum instruction** (subagent MUST include `failure_class_changed` and `failure_classes_seen` in the return payload).

**Explicitly forbidden**: any parent-authored summary of similarity in the continuation prompt (this is the specific incident's failure mode — the parent's "requeue failed identically" phrase in the SendMessage prompt caused the finding #62 misdiagnosis).

## Post-fix wording (illustrative reference; the exact prose may vary as long as the structural contract is met)

```markdown
2. **Spawn diagnosis subagent** — for any further work (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch), dispatch to a diagnosis subagent.
   - **First dispatch invocation** (unchanged from pre-fix):
     ```
     subagent_type: "general-purpose"
     description: "Diagnose <issue-ref> failure"
     prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
     ```
     Return contract on first dispatch: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`. `failure_class_changed` and `failure_classes_seen` are absent (or explicitly `null`) on first dispatch.
   - **Repeat dispatch invocation** — SendMessage to the existing diagnosis subagent if it is still live; fresh spawn with **both** the fresh alert body AND the verbatim prior alert body in the prompt if the subagent has already returned (Q4=A: prior alert is a persistent engine-marked comment on the issue — never lost). In either form, the continuation prompt contains:
     - The verbatim **new alert body** (from the fresh `cockpit_context` return payload's failure-alert comment).
     - Either the prior-context reference (SendMessage form) OR the verbatim **prior alert body** (fresh-spawn form).
     - **No parent-authored summary of similarity** between fresh and prior. The subagent determines `failure_class_changed` from the two evidences it now holds.
     - The verdict-return-schema addendum instruction.
   - **Verdict return-schema addendum on repeat dispatches**: the JSON return payload gains two required fields:
     - **`failure_class_changed: boolean`** — per Q2=B (any-of-three-dimensions differs, with canonical failing-test identifier, absent-vs-present differs) — computed from fresh vs immediately-prior alert bodies.
     - **`failure_classes_seen: string[]`** — running list of classifier identifiers, initialized on the second dispatch as `[<first-dispatch-class>, <fresh-class>]`, appended on N-th dispatch (N ≥ 3) as `[...<prior.failure_classes_seen>, <fresh-class>]`.
```

## Non-goals (things this contract does NOT constrain)

- The exact JSON field names' positions in the return payload (may be `{failure_class_changed, failure_classes_seen, root_cause, evidence, recommended_action, confidence}` or any other order). Structural check: both new field names appear at least once in step 2's body.
- The exact `classifier_id` derivation priority order (may promote `error_taxonomy` above `classifier_reason` in some future revision). Structural check: the running list exists and is populated.
- The exact canonicalization algorithm for the failing-test identifier (may extract `<file>::<name>` differently for different test runners). Structural check: canonicalization is stated as a rule; raw line text is not the comparison basis.
- The exact prose form of the "SendMessage vs fresh spawn" distinction (may be phrased as a conditional bullet, an if/else block, or a separate paragraph). Structural check: both forms are covered; the fresh-spawn form names "both alert bodies verbatim" (or equivalent).

## Failure modes the contract prevents

- **Absent `failure_class_changed` field on repeat dispatches** — subagent returns a first-dispatch shape on a repeat dispatch → parent detects the missing field → treats as subagent-error and returns a G.4(b) with fallback wording. The audit catches the schema declaration missing from D.7 step 2's body.
- **`failure_class_changed` computed on raw failing-step text** — a rerun of the same failure with a different line number returns `failure_class_changed = true` falsely. The audit doesn't catch this at build time (it can't inspect the subagent's implementation), but the true verifier (T-S13 corpus) catches the false-positive rate.
- **Prior verdict fed as prior evidence** — the parent reads a ledger row for the prior verdict, hands it to the fresh subagent as "prior evidence". The rule statement in D.7 step 2 forbids this by requiring the prior *alert body* to be handed over. The audit checks the rule's presence (structurally); the true verifier catches the runtime violation.
- **Parent-authored summary of similarity in the continuation prompt** — the exact incident #62 failure mode. The rule statement in D.7 step 1 (repeat sub-path) and D.7 step 2 (subagent invocation instructions) forbids this. The audit checks the rule's presence.

## Precedent

- **First-dispatch shape** is unchanged from #403 (which established the D.7 and D.11 diagnosis-subagent contract).
- **Repeat-dispatch schema addendum** is a new pattern; the closest analog is #396's G.4(d) re-present shape (which extends a presentation block with an additional element on a specific dispatch condition).
- **Canonical identifier over raw text** is the same principle as #396's declared-vocabulary fix and #408's Q2=A "successful reuse is the mechanism working" — compare identity, not derived properties.
- **Running list as evidence text (not additional schema booleans)** is the same shape as #402's harness-invocation contract (one home for the rule; cross-references as prose, not duplicated schema).
