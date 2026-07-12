# Data Model: #410 — `auto.md` D.7 repeat-failure dispatch fresh-evidence rule + verdict-schema addendum + G.4(b) sixth-element row

Structural model of the four surfaces this fix touches:

1. `packages/claude-plugin-cockpit/commands/auto.md` — the D.7 step 1 body (pre/post first-vs-repeat branching layout), the D.7 step 2 verdict-schema section (pre/post additions), and the § Gate contract G.4(b) presentation block (pre/post sixth-element row).
2. `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — the new `describe("410 — …")` block's inputs/outputs (audit parser input, mismatch report shape).
3. `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md` — the negative fixture's minimal structure.
4. (Read-only) The diagnosis subagent's return-schema — the JSON verdict shape the subagent produces and the parent forwards to G.4(b). The schema addendum lives in D.7 step 2's prose but is a runtime contract between parent and subagent.

## Surface 1: `packages/claude-plugin-cockpit/commands/auto.md`

### Pre-fix D.7 step 1 body (relevant excerpt)

```markdown
### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.** The return payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope.
2. **Spawn diagnosis subagent** — …
```

Three key drifts from the intended semantics:

- **No first-vs-repeat sub-path distinction.** Step 1 covers only "fetch evidence" for whichever dispatch happens to occur; the repeat-path case (SendMessage-continuation to an existing subagent, or fresh-spawn with prior + fresh evidence) is unspecified.
- **No prohibition on parent-authored characterization.** The parent's continuation prompt shape is not constrained; a session can (and did) inject "requeue failed identically" into the subagent's context as fact.
- **No verdict-schema addendum on repeat dispatches.** The verdict schema is `{root_cause, evidence, recommended_action, confidence}` — no field for `failure_class_changed` or `failure_classes_seen`.

### Post-fix D.7 step 1 body (target layout)

```markdown
### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Dispatch classification**: A D.7 event is a **first dispatch** iff it is the issue's first `agent:error` / `failed:*` event within the current contiguous auto invocation. A D.7 event is a **repeat dispatch** iff it is the issue's second-and-subsequent `agent:error` / `failed:*` event within the current contiguous auto invocation, regardless of `failed:<subtype>` match (Q1=B: any second failure-class event on the same issue in one auto invocation is a repeat, subtype match not required; session restart resets first-vs-repeat state per #406 Q2's session-local grain).

**Dispatch**:
1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.** The return payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope.
   - **First dispatch**: call `cockpit_context(issue=<issue-ref>)`; the engine bundle payload is the first-dispatch evidence, forwarded to the subagent per step 2.
   - **Repeat dispatch**: call `cockpit_context(issue=<issue-ref>)` again — same evidence verb as first-dispatch. **No dispatch of a repeat D.7 without the new alert body in hand.** The parent's role at this boundary is pure transport: fetch the fresh alert, and hand it to the subagent verbatim (step 2). **The parent MUST NOT characterize the fresh failure** with a phrase like "requeue failed identically", "same as before", "another `<subtype>`", or any other parent-authored summary of similarity; the subagent — not the parent — determines same-or-different from the evidence. Parent-authored summaries of evidence are forbidden in diagnosis prompts (the loop-trust-boundary principle applied to the parent itself: assertions are advisory, evidence is authoritative).
2. **Spawn diagnosis subagent** — for any further work (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch), dispatch to a diagnosis subagent.
   - **First dispatch invocation** (unchanged from pre-fix):
     ```
     subagent_type: "general-purpose"
     description: "Diagnose <issue-ref> failure"
     prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
     ```
     Return contract on first dispatch: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}`. `failure_class_changed` and `failure_classes_seen` are absent (or explicitly `null`) on first dispatch — there is no prior evidence to compare against.
   - **Repeat dispatch invocation** — SendMessage to the existing diagnosis subagent if it is still live; fresh spawn (same invocation shape as first-dispatch) with **both** the fresh alert body AND the verbatim prior alert body in the prompt if the subagent has already returned / been disposed (Q4=A: the parent's job on continuation-miss is pure transport; the prior alert is a persistent engine-marked comment on the issue, mechanically identifiable as the previous failure-alert comment — never lost). In either form, the continuation prompt contains:
     - The verbatim **new alert body** (from the fresh `cockpit_context` return payload's failure-alert comment).
     - Either the prior-context reference ("continuing from earlier diagnosis" — SendMessage form; the subagent still holds the prior alert body in-context) OR the verbatim **prior alert body** (fresh-spawn form; the subagent needs the prior evidence in-prompt).
     - **No parent-authored summary of similarity** between fresh and prior. The subagent determines `failure_class_changed` from the two evidences it now holds.
     - The verdict-return-schema addendum for repeat dispatches (see below).
   - **Verdict return-schema addendum on repeat dispatches**: the JSON return payload's shape grows two required fields on repeat dispatches (both absent or `null` on first dispatch):
     - **`failure_class_changed: boolean`** — computed by the subagent from the fresh and immediately-prior alert bodies (Q3=D: immediately-prior comparison, not first-dispatch baseline). Per Q2=B, `failure_class_changed = true` iff *any* of three dimensions differs: (1) `classifier_reason` field (engine-authored, exact string match, absent-vs-present differs); (2) `error_taxonomy` field (engine-authored, exact string match, absent-vs-present differs); (3) canonical failing-test/step identifier (`<file>::<name>` form for test failures; equivalent stable identifier for non-test failing steps — never raw line text, which drifts with line numbers and durations across runs of the same failure; absent-vs-present differs).
     - **`failure_classes_seen: string[]`** — running list of failure classifier identifiers observed across this issue's repeat dispatches in the current session (Q3=D: history as evidence text, not additional schema booleans). On the second dispatch (first repeat), initialized as `[<class1>, <class2>]` where `<class1>` is the first-dispatch alert's classifier identifier and `<class2>` is the fresh alert's. On the N-th dispatch (N ≥ 3), the subagent takes the running list from the prior verdict's `failure_classes_seen` and appends the fresh alert's classifier identifier. Rendered at the G.4(b) gate as a "classes this session: `<class1>` → `<class2>` → …" line.
   
   The subagent MUST NOT invoke any slash command. On unrecoverable error the subagent returns `{"error": "<description>"}`.
3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block per § Gate contract G.4b (subtype b) — five-element block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with the unchanged D.7 option set (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`), header `Escalate`, `multiSelect: false`. **On repeat dispatches**, the presentation block gains a sixth element between "Evidence" and "Current state": `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. No in-parent re-analysis.
4. **Apply verdict**:
   - `Requeue` → `cockpit_resume(issue=<issue-ref>)` (engine action per Assumption A2 — clears `agent:error` / `failed:*`, restores the phase's `waiting-for:` / `completed:` resume pair).
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Degradation clause**: If `cockpit_resume` is unavailable (G-S8 did not ship the tool, per Assumption A2), Requeue degrades to Skip with an explicit ledger note: `<issue-ref> · <transition> · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

**Ledger line**: `<issue-ref> · <agent:error | failed:<subtype>> · escalation-gate · <outcome>` — outcomes: `requeue (cockpit resume)` / `requeue failed: <description>` / `skip (session-local mute)` / `skip (cockpit resume unavailable — G-S8 prerequisite)` / `stop (exit)`.

**Failure modes**: `cockpit_resume` returns a typed error → **Error handling** class `OTHER`; ledger line; leave the issue in its failed state (do not retry automatically).
```

Three key structural properties of the post-fix layout:

- **First-vs-repeat sub-path distinction** in step 1 (each sub-path names `cockpit_context` as the evidence verb; the repeat sub-path additionally states the no-parent-characterization rule).
- **Verdict-schema addendum** in step 2 (`failure_class_changed` + `failure_classes_seen` on repeat dispatches; both absent or `null` on first dispatch).
- **Cross-reference** in step 3 to the G.4(b) presentation-block sixth element for repeat dispatches.

### Pre-fix G.4(b) presentation block

```markdown
**(b) `agent:error` / `failed:*`**:

Populated verbatim from the diagnosis subagent's verdict (D.7 step 2). No in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged.

```markdown
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```
```

### Post-fix G.4(b) presentation block

```markdown
**(b) `agent:error` / `failed:*`**:

Populated verbatim from the diagnosis subagent's verdict (D.7 step 2). No in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged. On **repeat dispatches** (D.7 step 1 classification), the block gains a sixth element between "Evidence" and "Current state" populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields.

First-dispatch presentation:

```markdown
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

Repeat-dispatch presentation (adds the "Failure class changed since prior" row between Evidence and Current state):

```markdown
Agent error on <issue-ref> (repeat dispatch):

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

The `Failure class changed since prior` row is populated verbatim from the verdict's `failure_class_changed` (as `yes` if `true`, `no` if `false`) and `failure_classes_seen` (as a `→`-joined running list). A `yes` value usually means the prior Requeue *made progress* — the recommendation calculus at the gate should reflect that (this incident's Skip recommendations inverted it). The row is absent on first-dispatch presentations (there is no prior evidence to compare against).
```

Two key structural properties of the post-fix presentation block:

- **Sixth-element row** appears only on repeat dispatches.
- **Running list rendering** on the same row shows cycles like A → B → A visibly in one line.

## Surface 2: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`

### New `describe("410 — …")` block shape

```typescript
describe("410 — auto.md D.7 repeat-failure dispatch fetches fresh evidence + failure_class_changed verdict field", () => {
  it("410-1 (structural drift audit): D.7 has first-vs-repeat sub-path split, verdict-schema addendum, no-parent-characterization rule, and G.4(b) sixth-element row", () => {
    const report = auditD7(AUTO_MD_PATH);
    // report shape:
    //   {
    //     d7Present: boolean,                     // § D.7 body was extractable
    //     firstDispatchSubPath: boolean,          // first-dispatch sub-path anchor present, names cockpit_context
    //     repeatDispatchSubPath: boolean,         // repeat-dispatch sub-path anchor present, names cockpit_context
    //     failureClassChangedField: boolean,      // 'failure_class_changed' appears in D.7 step 2 body
    //     failureClassesSeenField: boolean,       // 'failure_classes_seen' appears in D.7 step 2 body
    //     noParentCharacterizationRule: boolean,  // rule anchor (e.g., 'MUST NOT characterize', 'no parent-authored') present in D.7 step 2 body
    //     g4bSixthElementRow: boolean,            // 'Failure class changed since prior' row present in G.4(b) block
    //   }
    expect(report.d7Present, "D.7 extraction failed").toBe(true);
    expect(report.firstDispatchSubPath, "first-dispatch sub-path anchor missing").toBe(true);
    expect(report.repeatDispatchSubPath, "repeat-dispatch sub-path anchor missing").toBe(true);
    expect(report.failureClassChangedField, "failure_class_changed field missing from D.7 step 2").toBe(true);
    expect(report.failureClassesSeenField, "failure_classes_seen field missing from D.7 step 2").toBe(true);
    expect(report.noParentCharacterizationRule, "no-parent-characterization rule anchor missing").toBe(true);
    expect(report.g4bSixthElementRow, "G.4(b) 'Failure class changed since prior' row missing").toBe(true);
  });

  it("410-2 (regression check): audit reports at least one structural failure on 410-drift-auto.md fixture", () => {
    const report = auditD7(FIXTURE_410_DRIFT_AUTO);
    // Fixture reproduces pre-fix drift: one dispatch path only, no verdict-schema addendum, no G.4(b) sixth element.
    // Expected: at least one of the structural checks is false.
    const anyFailure =
      !report.firstDispatchSubPath ||
      !report.repeatDispatchSubPath ||
      !report.failureClassChangedField ||
      !report.failureClassesSeenField ||
      !report.noParentCharacterizationRule ||
      !report.g4bSixthElementRow;
    expect(
      anyFailure,
      `expected at least one structural check to fail; observed report: ${JSON.stringify(report)}`,
    ).toBe(true);
  });
});
```

### `auditD7` helper input/output

**Input**: file path to a markdown file (either `AUTO_MD_PATH` or `FIXTURE_410_DRIFT_AUTO`).

**Output**: `D7AuditReport` object per the shape above.

**Extraction logic** (structural, not prose-sniffing):

1. Read the file. Locate the `## Dispatch` H2 heading. Within that section, locate the `### D.7 —` H3 subsection anchor (or equivalent post-rewrite anchor).
2. Extract the D.7 body from that anchor to the next H3 heading (`### D.8 —` or later) or the next H2 heading.
3. Structural checks over the extracted D.7 body:
   - `firstDispatchSubPath`: within D.7's step 1 body, a "first dispatch" (or "first-dispatch") anchor appears at bullet or paragraph separation from a "repeat dispatch" anchor, with `cockpit_context` named on the same line/paragraph or within the sub-path's body.
   - `repeatDispatchSubPath`: within D.7's step 1 body, a "repeat dispatch" (or "repeat-dispatch") anchor appears at bullet or paragraph separation from the first-dispatch anchor, with `cockpit_context` named on the same line/paragraph or within the sub-path's body.
   - `failureClassChangedField`: within D.7's step 2 body, the exact substring `failure_class_changed` appears at least once (as a JSON field name in the return-schema section or a fenced example).
   - `failureClassesSeenField`: within D.7's step 2 body, the exact substring `failure_classes_seen` appears at least once.
   - `noParentCharacterizationRule`: within D.7's step 2 body (or step 1 body, since the rule can live in either), a rule-statement anchor appears matching a tolerant pattern — e.g., `MUST NOT characterize`, `no parent-authored`, `not the parent's role to characterize`, `parent MUST NOT summarize`, or equivalent structural rule statement. The check tolerates prose variation but requires an explicit rule anchor, not just a general instruction.
4. Additionally, extract § Gate contract G.4(b) presentation block (locate the `**(b) `agent:error` / `failed:*`**` anchor within `### G.4 —` or standalone `### G.4(b)`; extract to the next `**(<letter>)` anchor or the next H3 heading):
   - `g4bSixthElementRow`: within G.4(b) presentation block, the exact substring `Failure class changed since prior` appears at least once (as a row label in the repeat-dispatch presentation).

**Never prose-sniff**: the audit does NOT regex the vocabulary of "loop-trust-boundary", "context reuse", "fresh evidence", "identical premise", "assertions are advisory". Those words may or may not appear in future rewrites; the structural properties (sub-path anchors with `cockpit_context` co-located, field-name presence, rule-anchor presence via a tolerant pattern, G.4(b) row label) are stable across prose rewrites.

## Surface 3: `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md`

### Fixture shape

A minimal markdown file (~20-30 lines) reproducing the pre-fix drift. Contains:

- A top-level `## Dispatch` H2 heading.
- A subsection `### D.7 — \`agent:error\` / \`failed:*\` → escalation gate (Requeue path)` (matching the D.7 anchor).
- The pre-fix D.7 step 1 body verbatim (or a compressed equivalent) — one "Fetch evidence" bullet, no first-vs-repeat sub-path split, no `cockpit_context` reference under a repeat-dispatch sub-path (only under the single unified dispatch path).
- The pre-fix D.7 step 2 body verbatim (or a compressed equivalent) — one "Spawn diagnosis subagent" bullet, no verdict-schema addendum, no `failure_class_changed` field name, no `failure_classes_seen` field name, no no-parent-characterization rule anchor.
- A minimal G.4(b) presentation block — five-element form, no `Failure class changed since prior` row.
- NO `failure_class_changed` substring anywhere.
- NO `failure_classes_seen` substring anywhere.
- NO `Failure class changed since prior` substring anywhere.
- NO explicit first-vs-repeat branching keyword ("first dispatch", "repeat dispatch") anywhere.
- NO no-parent-characterization rule anchor.

Feeding this file through `auditD7` MUST report at minimum:

- `d7Present: true` (the anchor exists — the fixture is well-formed markdown with a D.7 heading).
- `firstDispatchSubPath: false` OR `repeatDispatchSubPath: false` (only one unified dispatch path — no first-vs-repeat split).
- `failureClassChangedField: false`.
- `failureClassesSeenField: false`.
- `noParentCharacterizationRule: false`.
- `g4bSixthElementRow: false`.

Any of these six failing checks satisfies the 410-2 assertion.

### Fixture naming and location

- File: `packages/claude-plugin-cockpit/tests/fixtures/410-drift-auto.md`
- Naming pattern: `<finding>-drift-<command>.md` (matches `398-drift-auto.md`, `402-drift-auto.md`, `408-drift-auto.md`).
- Location: same fixtures directory as prior drift fixtures.

## Surface 4: Diagnosis subagent verdict return-schema

This is not persisted; it's the runtime JSON contract between parent and subagent that the D.7 step 2 prose describes.

### Verdict schema (unchanged for first dispatch)

```typescript
type DiagnosisVerdictFirstDispatch = {
  root_cause: string;
  evidence: string;
  recommended_action: "Requeue (cockpit resume)" | "Skip (session-local mute)" | "Stop (exit auto)";
  confidence: "low" | "medium" | "high";
};
```

### Verdict schema (extended for repeat dispatch)

```typescript
type DiagnosisVerdictRepeatDispatch = DiagnosisVerdictFirstDispatch & {
  failure_class_changed: boolean;
  failure_classes_seen: string[]; // running list of classifier identifiers across this issue's repeat dispatches this session
};
```

Both `failure_class_changed` and `failure_classes_seen` are required on repeat dispatches. On first dispatch, both fields are absent (or explicitly `null` if the schema is required to be uniform).

### Computation rules

**`failure_class_changed` (Q2=B)**:

```typescript
function computeFailureClassChanged(fresh: AlertBody, prior: AlertBody): boolean {
  const classifierChanged =
    (fresh.classifier_reason ?? null) !== (prior.classifier_reason ?? null);
  const taxonomyChanged =
    (fresh.error_taxonomy ?? null) !== (prior.error_taxonomy ?? null);
  const failingTestChanged =
    canonicalize(fresh.failing_test_step) !== canonicalize(prior.failing_test_step);
  return classifierChanged || taxonomyChanged || failingTestChanged;
}

function canonicalize(step: string | null | undefined): string | null {
  if (step == null) return null;
  // Extract stable identifier: <file>::<name> for test failures, equivalent stable form for non-test failing steps.
  // Never compare raw line text.
  return extractCanonicalTestIdentifier(step) ?? extractCanonicalStepIdentifier(step);
}
```

**`failure_classes_seen` (Q3=D)**:

```typescript
function updateClassesSeen(
  priorClassesSeen: string[] | null | undefined,
  freshClassifierId: string,
  firstDispatchClassifierId: string, // only used on the second dispatch to initialize the list
): string[] {
  if (priorClassesSeen == null || priorClassesSeen.length === 0) {
    // Second dispatch: initialize with first-dispatch class + fresh class
    return [firstDispatchClassifierId, freshClassifierId];
  }
  // N-th dispatch (N ≥ 3): append fresh class to the running list
  return [...priorClassesSeen, freshClassifierId];
}
```

The `classifier_id` for the running list is typically the `classifier_reason` value; if `classifier_reason` is absent (process failure per #915), the subagent falls back to the canonical failing-test identifier or the `error_taxonomy` value.

### State transitions

- **First dispatch on issue X**: subagent returns `{root_cause, evidence, recommended_action, confidence}`. Neither `failure_class_changed` nor `failure_classes_seen` is present.
- **Second dispatch on issue X (first repeat)**: subagent receives fresh + prior alert bodies (via SendMessage or fresh spawn). Returns `{root_cause, evidence, recommended_action, confidence, failure_class_changed, failure_classes_seen: [<class1>, <class2>]}`.
- **Third dispatch on issue X (second repeat)**: subagent receives fresh + immediately-prior alert body (per Q3=D — the immediately-prior is the second-dispatch alert, not the first-dispatch alert). Returns `{..., failure_class_changed, failure_classes_seen: [<class1>, <class2>, <class3>]}`.
- **N-th dispatch on issue X (N-1 repeat)**: same shape; running list grows to length N.
- **Session end** (auto exit): verdicts are discarded; state doesn't persist to disk. Next session starts fresh.

### The parent's role at the repeat-dispatch boundary

The parent's job on a repeat dispatch is pure transport:

1. Call `cockpit_context(issue=<issue-ref>)` to fetch the fresh evidence.
2. Identify the prior alert body (mechanically — as the previous failure-alert comment on the issue, before the fresh one).
3. Compose the subagent prompt (SendMessage or fresh spawn) with:
   - Verbatim fresh alert body.
   - Prior-context reference (SendMessage) or verbatim prior alert body (fresh spawn).
   - The verdict-return-schema addendum instruction (subagent must include `failure_class_changed` and `failure_classes_seen` in the return payload).
4. Forward the subagent's verdict to G.4(b) verbatim — no in-parent re-analysis, no summary, no similarity assertion.

**Explicitly forbidden**: any parent-authored summary of similarity (e.g., "requeue failed identically", "same as before", "the fresh alert is the same class as the prior one"). Such phrasing violates the loop-trust-boundary principle at the parent-to-subagent boundary and reproduces the finding #62 failure mode.

## Cross-surface invariants (structural, not run-time)

1. **D.7 step 1 body first-vs-repeat sub-path split**: both a first-dispatch sub-path and a repeat-dispatch sub-path appear at paragraph or bullet separation, each naming `cockpit_context` as the evidence verb.
2. **D.7 step 2 body verdict-schema addendum**: both `failure_class_changed` and `failure_classes_seen` field names appear at least once in step 2's body (in a return-schema section or fenced example).
3. **D.7 step 2 body no-parent-characterization rule**: an explicit rule-statement anchor appears (structural — e.g., `MUST NOT characterize`, `no parent-authored`, `not the parent's role` — tolerant of prose variation but requiring an explicit rule).
4. **§ Gate contract G.4(b) presentation block sixth-element row**: the substring `Failure class changed since prior` appears at least once in the G.4(b) presentation block.
5. **Cross-reference D.7 → G.4(b)**: D.7's step 3 references the G.4(b) sixth-element row for repeat dispatches (structural — the reference exists in D.7's step 3 body).

The audit's structural checks (410-1) enforce invariants 1, 2, 3, and 4 directly. Invariant 5 is checked by static grep in the quickstart runbook — it's stable-anchored so a build-time regex is sufficient.
