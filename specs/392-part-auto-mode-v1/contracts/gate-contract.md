# Contract: Gate Contract

**Feature**: 392-part-auto-mode-v1
**Target**: `packages/claude-plugin-cockpit/commands/auto.md` § Gate contract

This contract defines the four gate types that `auto.md` uses to prompt the operator. These are the **exhaustive** human-interaction surface — nothing else in the playbook prompts, and none of these gates auto-proceed (spec § Gate contract + § Invariants §6).

Every gate's presentation and its `AskUserQuestion` invocation ship in the **same assistant response** — the #388 pattern applied uniformly.

---

## G.0 — Scope and rules

**Four gate types** (spec § Gate contract):
1. Clarification batches
2. Review / validation verdicts (artifact-review, implementation-review, manual-validation)
3. Phase-queue confirmations
4. Red / error escalations (validate-red / merge-red, `agent:error` / `failed:*`, unrecognized state)

**Global rules**:
- Every gate is **fused** with its presentation in one assistant response (#388 pattern).
- Every gate uses `AskUserQuestion` — never a `Bash` `read` prompt, never a text-only question the operator answers in prose.
- **No gate auto-proceeds.** Every gate prompts, even when a "Suggested decision" is present (the suggestion is guidance, not consent).
- **No autonomy policy in v1** — no per-gate auto-approve, no allow-lists, no "full auto" mode (spec § Invariants §6).

---

## G.1 — Clarification batch gate

**Trigger**: `waiting-for:clarification` dispatch (D.1).

**Presentation** (in the same response as the `AskUserQuestion` calls):

```markdown
Drafted answers for <issue-ref> (N open questions):

### Q1: <question title / summary>
<drafted answer, ~4-8 sentences>
_provenance: <citation>_

### Q2: <question title / summary>
<drafted answer>
_provenance: <citation>_

... (Q3 through QN)
```

**Gate invocation**: `ceil(N/4)` `AskUserQuestion` calls in the **same response**, one question per open clarification, each with:

- **Question text**: `Approve Q<n>? "<question summary>"`
- **Header**: `Q<n>` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `Approve draft (Recommended)` — post the drafted body verbatim
  2. `Skip this question` — drop this answer from the run
- **multiSelect**: `false`

**Edit path**: The built-in "Other" free-text channel per `AskUserQuestion` is the edit path. Whatever replacement text the operator types is posted **verbatim** in place of the draft. No explicit "Edit" option is listed (per Q2=A refined — listing "Edit" would require a second turn to collect the replacement text, reintroducing the #388 turn-split).

**Post-gate behavior**:
- Approved answers → posted as one marker-prefixed comment (per D.1 step 4).
- Skipped answers → dropped; do not appear in the comment.
- Edited answers ("Other" free-text) → posted verbatim in place of the draft.

**Failure modes**:
- All skipped → post no comment; do not advance; ledger line `all answers skipped`.
- Some approved, some skipped → post the approved subset; do not advance; ledger line `posted <k>/<N>, skipped <s>`.
- All approved → post; run `cockpit advance --gate clarification`; ledger line `advanced`.

**Contract invariants (GC.1)**:
- **GC.1.1**. Presentation and `ceil(N/4)` `AskUserQuestion` calls ship in the **same assistant response**. No two-turn pattern.
- **GC.1.2**. Options are exactly `Approve draft (Recommended)` / `Skip this question`. No listed "Edit" option.
- **GC.1.3**. "Other" free-text (the tool's built-in channel) is the edit path.
- **GC.1.4**. `ceil(N/4)` — never more than 4 questions per `AskUserQuestion` call (the tool's per-call cap).

---

## G.2 — Review verdict gate (artifact and implementation)

**Trigger**: `waiting-for:<artifact>-review` (D.2) or `waiting-for:implementation-review` (D.3).

**Presentation** (in the same response as the `AskUserQuestion` call): the findings-summary table from #388's C.3.5, verbatim.

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | <path>:<line> | <one-line finding summary> | Yes |
| 2 | <path>:<line> | <one-line finding summary> | No |
| ... |

Suggested decision: <approve | request-changes>
```

For zero findings (`[]` from the subagent):

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |

Suggested decision: approve
```

**Retained rule** (from #388): `MUST NOT print raw JSON under any circumstance.` The subagent's structured return is parsed and rendered as a table; it is never restated verbatim in the response body.

**Gate invocation**: One `AskUserQuestion` call in the same response, with:

- **Question text**: `Verdict for <issue-ref> (<gate-name>)?`
- **Header**: `Verdict` (≤ 12 chars)
- **Options** (exactly three, discrete, in this order):
  1. `approve` — advance the gate
  2. `request-changes` — post COMMENT review with per-finding inline threads
  3. `abort` — do nothing
- **multiSelect**: `false`

**Post-gate behavior**:
- `approve` → `generacy cockpit advance --gate <gate-name> <issue-ref>`.
- `request-changes` → post a `COMMENT` review with per-finding inline threads (each finding becomes a `Comment` on `file:line` with body `<summary> — <failure_scenario>`); no `advance` call.
- `abort` → do nothing (no post, no advance).

**Failure modes**:
- Subagent returns `{"error": …}` or unparseable → route to Error handling class `OTHER`; **do not** invoke `AskUserQuestion` (per #390's C.4 hard-error branch).
- Zero findings still prompts the gate (assist-mode contract preserved, per #388 / #390).

**Contract invariants (GC.2)**:
- **GC.2.1**. Presentation and single `AskUserQuestion` ship in the **same assistant response**.
- **GC.2.2**. Options are exactly `approve` / `request-changes` / `abort`, in that order (retained from #388).
- **GC.2.3**. `MUST NOT print raw JSON` clause appears inline before the table rendering instruction (retained from #388 / #390 defense-in-depth).
- **GC.2.4**. Hard-error subagent returns skip `AskUserQuestion` and route to Error handling class `OTHER`.
- **GC.2.5**. Zero findings still invokes `AskUserQuestion` — no auto-approve smuggled in.

---

## G.3 — Manual-validation confirm gate

**Trigger**: `waiting-for:manual-validation` (D.4).

**Presentation** (in the same response as the `AskUserQuestion` call): the subagent's structured summary rendered as bullet lists.

```markdown
Manual validation checklist for <issue-ref> (PR <pr-ref>):

**Scenarios to test:**
- <scenario 1>
- <scenario 2>
- ...

**Acceptance checks:**
- <check 1>
- <check 2>
- ...
```

**Gate invocation**: One `AskUserQuestion` call in the same response, with:

- **Question text**: `Have you manually validated <issue-ref>?`
- **Header**: `Validated?` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `manually validated` — advance the gate
  2. `not yet` — do nothing; the event will re-fire when the operator confirms later
- **multiSelect**: `false`

**Post-gate behavior**:
- `manually validated` → `generacy cockpit advance --gate manual-validation <issue-ref>`.
- `not yet` → write ledger line and continue; the label stays.

**Failure modes**:
- Subagent returns `{"error": …}` → route to Error handling class `OTHER`; do not invoke gate; write ledger line.

**Contract invariants (GC.3)**:
- **GC.3.1**. Presentation (scenarios + acceptance_checks lists) and single `AskUserQuestion` ship in the same assistant response.
- **GC.3.2**. Options are exactly `manually validated` / `not yet`.
- **GC.3.3**. The subagent hop is the only source of the scenarios/acceptance_checks lists — no inline artifact reads in the parent (Q4=B).

---

## G.4 — Escalation gate (three subtypes)

**Trigger**: One of:
- (a) `completed:validate` red / merge red after fixer runs and returns `{fixed: false, …}` (D.6).
- (b) `agent:error` / `failed:*` (D.7).
- (c) Unrecognized / ambiguous state (D.10).

**Presentation** (in the same response as the `AskUserQuestion` call): the failure evidence, formatted per subtype.

**(a) Validate-red / merge-red**:

```markdown
Fixer could not resolve <issue-ref> (PR <pr-ref>):

<fixer summary — the subagent's `summary` field>

Reason (from fixer): <fixer's `reason` field>

Failing checks: <check names>
```

**(b) `agent:error` / `failed:*`**:

```markdown
Agent error on <issue-ref>:

<evidence — bot-authored alert comment body from gh issue view --comments, or the failure trace>
```

**(c) Unrecognized state**:

```markdown
Unrecognized state on <issue-ref>:

Observed: <raw state from cockpit status --json>

Streamed event: <original transition line>
```

**Gate invocation**: One `AskUserQuestion` call in the same response, with:

- **Question text**: `How to proceed on <issue-ref>?`
- **Header**: `Escalate` (≤ 12 chars)
- **Options** (subtype-specific):

  | Subtype | Options (in order) |
  |---------|--------------------|
  | (a) validate-red / merge-red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (b) agent:error / failed:* | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (c) unrecognized state | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |

- **multiSelect**: `false`

**Post-gate behavior** (per Q3=D concrete mappings):
- `Retry` (subtype a only) → re-run the fixer subagent **once**. If it returns `{fixed: true}`, loop back to D.5. If `{fixed: false}`, re-present the escalation gate.
- `Requeue` (subtype b only) → `generacy cockpit resume <issue-ref>` (per Assumption A2). If verb missing, degrade to Skip with explicit ledger note.
- `Skip` (all subtypes) → add `<issue-ref>` to the **session mute set**; write ledger line; continue the loop. **Labels untouched.**
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**

**Failure modes**:
- Skip's mute set is in-memory only; muted issues resurface on the next auto run's startup sweep (this is a **feature**, not a bug).
- `Retry` (subtype a) that returns `{fixed: false}` re-presents the same escalation gate — the operator can keep retrying (each Retry requires a new gate approval) or Skip / Stop.
- `Requeue` verb non-zero exit → route to Error handling class `OTHER`; write ledger line; leave the issue in its failed state.

**Contract invariants (GC.4)**:
- **GC.4.1**. Presentation (evidence) and single `AskUserQuestion` ship in the same assistant response.
- **GC.4.2**. Subtype-specific option sets — verbatim per the table above.
- **GC.4.3**. Unrecognized-state subtype **never offers Retry**.
- **GC.4.4**. Skip is session-local mute only. No `cockpit advance --skip` or equivalent state-forging call (invariant §3 — add-only advance).
- **GC.4.5**. Stop cleanly exits auto — kills watch, prints summary, no label writes.
- **GC.4.6**. Requeue calls the new `cockpit resume` engine verb (Assumption A2). Missing verb → degrade to Skip.

---

## G.5 — Phase-queue confirmation gate

**Trigger**: `phase-complete` (D.8).

**Presentation** (in the same response as the `AskUserQuestion` call):

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...
```

**Gate invocation**: One `AskUserQuestion` call in the same response, with:

- **Question text**: `Queue P<next> (<N> issues)?`
- **Header**: `QueueP<next>` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `Queue P<next> (<N> issues) (Recommended)` — call `cockpit queue`
  2. `Cancel` — do nothing (the phase-complete state persists)
- **multiSelect**: `false`

**Post-gate behavior**:
- `Queue P<next>` → `generacy cockpit queue <epic-ref> P<next> --yes` (uses `--yes` to skip the CLI's own confirmation; the gate is the confirmation).
- `Cancel` → write ledger line; continue loop.

**Contract invariants (GC.5)**:
- **GC.5.1**. Presentation (issue list) and single `AskUserQuestion` ship in the same assistant response.
- **GC.5.2**. Options are exactly `Queue P<next> (<N> issues) (Recommended)` / `Cancel`.
- **GC.5.3**. On `Queue`, the CLI verb is called with `--yes` (the gate itself is the confirmation).

---

## Gate contract — summary form (inlined in `auto.md`)

| # | Gate | Options | Presentation |
|---|------|---------|--------------|
| G.1 | Clarification batch | `Approve draft (Recommended)` / `Skip this question` × `ceil(N/4)` calls | Numbered drafts with provenance |
| G.2 | Review verdict | `approve` / `request-changes` / `abort` (single call) | Findings-summary table + Suggested decision |
| G.3 | Manual-validation confirm | `manually validated` / `not yet` (single call) | Scenarios + acceptance_checks lists |
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:* | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (c) | Escalation: unrecognized state | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
| G.5 | Phase-queue confirmation | `Queue P<next> (Recommended)` / `Cancel` (single call) | Next-phase issue list |

---

## Cross-gate invariants

- **CG.1**. Every gate uses `AskUserQuestion`. No Bash-prompt gates, no prose-answer gates.
- **CG.2**. Every gate ships its presentation and `AskUserQuestion` in the **same assistant response** (#388 pattern applied uniformly).
- **CG.3**. Every gate's options are discrete (2–3 labeled options). Free-text answers come only through the tool's built-in "Other" channel (used explicitly only in G.1's clarification-edit path).
- **CG.4**. No gate auto-proceeds. A "Suggested decision" is guidance, not consent.
- **CG.5**. Skip in every escalation gate is session-local mute only — no label writes (invariant §3).
- **CG.6**. Stop in every escalation gate cleanly exits auto — kills watch, prints summary, no label writes.
- **CG.7**. The unrecognized-state escalation (G.4c) offers Skip / Stop only — never Retry (spec § Dispatch: "never guess").
- **CG.8**. Every gate produces exactly one ledger line per dispatch (per data-model.md § 2.5).
- **CG.9**. No gate is added beyond the five in this contract without a spec amendment (spec § Gate contract is exhaustive).
