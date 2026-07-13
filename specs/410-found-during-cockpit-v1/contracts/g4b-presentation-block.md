# Contract: § Gate contract G.4(b) presentation block — sixth-element row "Failure class changed since prior"

**Surface**: `packages/claude-plugin-cockpit/commands/auto.md` — the `**(b) `agent:error` / `failed:*`**:` subsection within `### G.4 — Escalation gate (…)` in the `## Gate contract` H2 section.

## Structural contract

The G.4(b) presentation block MUST contain:

1. **The first-dispatch presentation shape** (five-element block: Root cause / Evidence / Current state / Suggested decision + confidence) — unchanged from pre-fix.
2. **The repeat-dispatch presentation shape** (six-element block: adds `**Failure class changed since prior:**` row between "Evidence" and "Current state") — post-fix addition.
3. **The distinction between first-dispatch and repeat-dispatch presentations** — the sixth-element row appears only on repeat dispatches (D.7 step 1 classification).

## First-dispatch presentation (unchanged from pre-fix)

```markdown
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

Five elements. No `Failure class changed since prior` row. Corresponds to a D.7 first-dispatch verdict whose schema does not include `failure_class_changed` or `failure_classes_seen`.

## Repeat-dispatch presentation (post-fix)

```markdown
Agent error on <issue-ref> (repeat dispatch):

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

Six elements. The sixth element sits between "Evidence" and "Current state". Populated verbatim from the verdict's `failure_class_changed` (as `yes` if `true`, `no` if `false`) and `failure_classes_seen` (as a `→`-joined running list).

## Row rendering rules

### `Failure class changed since prior` value

Rendered as `yes` if `verdict.failure_class_changed === true`, `no` if `false`. Never as `true`/`false` (operator-facing; use natural language).

### Running list rendering

Rendered as ` (classes this session: <class1> → <class2> → …)` where each `<classN>` is an element from `verdict.failure_classes_seen` in order, joined by ` → `. The parentheses and " (classes this session:" prefix are load-bearing — they distinguish the running list from the yes/no answer.

Example rendering for `failure_class_changed = true` and `failure_classes_seen = ["npm-ci-EUSAGE", "prisma-client-missing"]`:

```
**Failure class changed since prior:** yes  (classes this session: npm-ci-EUSAGE → prisma-client-missing)
```

Example rendering for `failure_class_changed = false` and `failure_classes_seen = ["exit-1", "exit-1"]` (cycle-like: same class twice):

```
**Failure class changed since prior:** no  (classes this session: exit-1 → exit-1)
```

Example rendering for a cycle (A → B → A):

```
**Failure class changed since prior:** yes  (classes this session: npm-ci-EUSAGE → prisma-client-missing → npm-ci-EUSAGE)
```

## When the row appears

- **Repeat dispatch** (D.7 step 1 classification: second-and-subsequent `agent:error` / `failed:*` on the same issue in one contiguous auto invocation): the row appears; both fields are present in the verdict.
- **First dispatch**: the row is absent (the verdict's `failure_class_changed` and `failure_classes_seen` are absent or `null`).

The parent's G.4(b) composition is conditional on the verdict's field presence:

```typescript
function composeG4bPresentation(verdict: DiagnosisVerdict, issueRef: string, currentState: string): string {
  const header = verdict.failure_class_changed !== undefined
    ? `Agent error on ${issueRef} (repeat dispatch):`
    : `Agent error on ${issueRef}:`;
  const failureClassRow = verdict.failure_class_changed !== undefined
    ? `**Failure class changed since prior:** ${verdict.failure_class_changed ? "yes" : "no"}  (classes this session: ${verdict.failure_classes_seen.join(" → ")})`
    : null;

  return [
    header,
    "",
    `**Root cause:** ${verdict.root_cause}`,
    `**Evidence:** ${verdict.evidence}`,
    failureClassRow,
    `**Current state:** ${currentState}`,
    `**Suggested decision:** ${verdict.recommended_action} (confidence: ${verdict.confidence})`,
  ].filter(Boolean).join("\n");
}
```

## Recommendation-calculus effect at the gate

A `yes` value in the sixth-element row usually means the prior Requeue *made progress* — the failure moved to a different class after the Requeue heal-attempt. The operator's Requeue/Skip/Stop decision should reflect that:

- **`yes` + Requeue-like Suggested decision**: consistent — the Requeue moved the fault forward; another Requeue may move it forward again.
- **`yes` + Skip Suggested decision**: unusual — the changed class often means Requeue made progress; the subagent's Skip may reflect a specific analysis (e.g., "the changed class is now a defect that needs an out-of-band fix, not another Requeue"), but the operator should weigh the changed-class signal against the Suggested decision.
- **`no` + Requeue-like Suggested decision**: the fault didn't change class; the operator should consider whether another Requeue is likely to help or whether the fault is stuck.
- **`no` + Skip Suggested decision**: consistent — repeated same-class failures often need an out-of-band fix.

The incident #62 case was exactly the `yes` + Skip Suggested decision pattern with a wrong Skip: both failures had `failure_class_changed = true` (they were distinct in-branch defects), and both subagents returned Skip verdicts built on the parent's assertion of similarity. Under the post-fix rule, the fresh evidence would have led the subagents to return `failure_class_changed = true` and Requeue-like verdicts (or at minimum, verdicts anchored on the actual defects, not on a hypothetical stale-base premise).

## Cross-reference from D.7 step 3

D.7 step 3 references the sixth-element row for repeat dispatches:

```markdown
3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block per § Gate contract G.4b (subtype b) — five-element block populated verbatim from the verdict … + single `AskUserQuestion` with the unchanged D.7 option set … **On repeat dispatches**, the presentation block gains a sixth element between "Evidence" and "Current state": `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. No in-parent re-analysis.
```

The reference explicitly (a) states the row's placement between "Evidence" and "Current state", (b) names the two verdict fields, and (c) reiterates the "no in-parent re-analysis" rule.

## Non-goals (things this contract does NOT constrain)

- The exact prose of the row label (may be `**Failure class changed since prior:**` or any equivalent — as long as the phrase "Failure class changed since prior" appears verbatim so the audit can identify the row).
- The exact separator between the yes/no answer and the running list (may be one space, two spaces, a tab, or a dash — as long as the running list is on the same row).
- The exact prose of the "(classes this session:" prefix (may be `(classes this session:`, `(classes: `, or `(this session's classes:` — as long as the running list is enclosed and clearly identifiable). The audit's tolerant pattern accepts any of these variants.
- The exact prose of the "(repeat dispatch)" annotation in the header (may be omitted; the row's presence itself signals repeat dispatch).
- The exact list of options at the gate (unchanged from pre-fix: `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`). This contract does NOT modify the option set.

## Failure modes the contract prevents

- **G.4(b) block unchanged from pre-fix** (five elements even on repeat dispatches) fails the structural check for the sixth-element row — the audit's `g4bSixthElementRow` field is `false`.
- **Row placed outside the G.4(b) block** (e.g., in D.7 step 3 only, not in § Gate contract G.4(b)) fails the structural check because the audit extracts the G.4(b) block and searches only within it. Both surfaces need the row (D.7 step 3 references G.4(b); G.4(b) authors the shape).
- **Row worded differently** (e.g., `Class shift since prior`, `Failure class delta`) fails the structural check for the exact substring `Failure class changed since prior`.
- **Running list omitted** (only the yes/no answer rendered, no `(classes this session: …)`) is not caught by the structural audit (it only checks the row label's presence, not the running-list rendering). The true verifier (T-S13 corpus) catches the missing running list at gate time.

## Precedent

- **G.4(b) five-element structure** is the pre-fix baseline established by #403.
- **Sixth-element addition on a specific dispatch condition** is analogous to G.4(d)'s "initial presentation vs re-presentation" shape (#396) — where a specific dispatch condition (typed-error return on `cockpit_advance`) triggers a modified presentation block.
- **Row-based encoding of a boolean field + running list** is a new pattern; the closest analog is G.4(e)'s "Recovery state" paragraph (#408) which encodes a runtime state description in an operator-facing line.
- **Row-name as load-bearing anchor** matches #402's precedent for AskUserQuestion option strings being load-bearing anchors — a rewording drift is a real regression risk, and the structural audit catches it.
