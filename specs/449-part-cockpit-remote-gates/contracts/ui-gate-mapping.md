# Contract: UI-mode gate mapping table (10 rows)

Extends `packages/claude-plugin-cockpit/commands/auto.md` with a new `## UI-mode gate mapping` section (placement: after `## Gate contract` and before `## AskUserQuestion invocation contract`). Load-bearing for spec FR-004, FR-008, FR-015 and Q1=C.

## Table shape

Exactly **10 rows** — one per gate that maps to the per-issue wire contract:

| Gate | Transition class | GateOpenParams.gate.title | GateOpenParams.gate.body (source) | Options (optionId → label) | Free-text affordance | On answer: downstream action per optionId |
|------|------------------|---------------------------|-----------------------------------|----------------------------|----------------------|-------------------------------------------|

Every column MUST be present. Row-count exactly 10 — never 7 (consolidated) or 11 (including G.4e). Per Q1=C.

## Rows

### G.1 — Clarification batch

- **Transition class**: `waiting-for:clarification`
- **Title**: `Approve clarification answers for <issue-ref>`
- **Body source**: The § G.1 drafted presentation block verbatim — the five-element per-question format at auto.md line 373 (title, context, question, options, recommendation, why, provenance).
- **Options**:
  - `approve-all` → `Approve all & post (Recommended)`
  - `make-changes` → `Make changes`
  - `skip-batch` → `Skip this batch`
- **Free-text affordance**: `{ kind: "optional", placeholder: "notes (optional)" }` — used by the make-changes path to carry an edit directive on the same submission.
- **On `approve-all`**: post batch + `cockpit_advance(issue=<ref>, gate="clarification")`; ledger row: `<ref> · waiting-for:clarification · clarification-batch · advanced · source: ui-gate`.
- **On `make-changes`** (with freeText): apply edit directive per current § G.1 edit-directive handling; re-open with `generation += 1` (revised draft); ledger row: `<ref> · waiting-for:clarification · clarification-batch · make-changes (re-opened g<n>) · source: ui-gate`.
- **On `skip-batch`**: post subset (skipped Q excluded); ledger row: `<ref> · waiting-for:clarification · clarification-batch · posted <k>/<N>, skipped <s> · source: ui-gate` OR `all answers skipped · source: ui-gate`.

### G.2 — Review verdict (spec/clarification/plan/tasks review, D.2)

- **Transition class**: `waiting-for:<artifact>-review` (e.g., `waiting-for:spec-review`).
- **Title**: `Review verdict for <issue-ref> — <artifact>`.
- **Body source**: The § G.2 drafted verdict presentation block (issue title, PR / artifact summary, drafted verdict + rationale).
- **Options**:
  - `approve` → `approve`
  - `request-changes` → `request-changes`
  - `abort` → `abort`
- **Free-text affordance**: `{ kind: "optional", placeholder: "reviewer comment (optional; used as body of request-changes review or approval note)" }`.
- **On `approve`**: `cockpit_advance(issue=<ref>, gate="<artifact>-review")`; ledger row uses the § L.6 action vocabulary `review-analysis+advance · approved · source: ui-gate`.
- **On `request-changes`**: post the request-changes review (D.2 guardrail) with freeText as body; ledger row: `review-analysis+request-changes · posted (<anchored> inline, <unanchored> in body) · source: ui-gate`.
- **On `abort`**: no downstream action; ledger row: `review-analysis+abort · aborted · source: ui-gate`.

### G.3 — Manual-validation confirm (D.4)

- **Transition class**: `waiting-for:manual-validation`.
- **Title**: `Manual validation for <issue-ref>`.
- **Body source**: The § G.3 manual-validation summarizer block (test plan + observed state summary).
- **Options**:
  - `manually-validated` → `manually validated`
  - `not-yet` → `not yet`
- **Free-text affordance**: `{ kind: "none" }`.
- **On `manually-validated`**: `cockpit_advance(issue=<ref>, gate="manual-validation")`; ledger row: `manual-validation-summary+advance · manually validated · source: ui-gate`.
- **On `not-yet`**: no downstream action; ledger row: `manual-validation-summary+wait · not yet · source: ui-gate` (the event re-fires when the operator re-invokes).

### G.4a — Escalation: validate-red / merge-red (D.6)

- **Transition class**: `completed:validate` (with red checks) OR post-merge red.
- **Title**: `Escalation: validate red for <issue-ref>`.
- **Body source**: The § G.4a fixer-unfixed presentation block (failing checks summary + fixer diagnosis + retry / skip / stop rationale).
- **Options**:
  - `retry` → `Retry (re-run fixer)`
  - `skip` → `Skip`
  - `stop` → `Stop`
- **Free-text affordance**: `{ kind: "none" }`.
- **On `retry`**: re-spawn fixer subagent → loop D.5; ledger row: `fixer+escalation-gate · retry · source: ui-gate`.
- **On `skip`**: session-mute add; ledger row: `fixer+escalation-gate · skip (session-local mute) · source: ui-gate`.
- **On `stop`**: exit run; ledger row: `fixer+escalation-gate · stop (exit) · source: ui-gate`.

### G.4b — Escalation: agent:error / failed:* (D.7)

- **Transition class**: `agent:error` OR `failed:<subtype>`.
- **Title**: `Escalation: agent-error for <issue-ref>`.
- **Body source**: The § G.4b diagnosis subagent block (failure class + evidence + requeue / skip / stop rationale).
- **Options**:
  - `requeue` → `Requeue (cockpit resume)`
  - `skip` → `Skip`
  - `stop` → `Stop`
- **Free-text affordance**: `{ kind: "none" }`.
- **On `requeue`**: `cockpit_resume(issue=<ref>)`; ledger row: `escalation-gate · requeue (cockpit resume) · source: ui-gate` OR `escalation-gate · requeue failed: <detail> · source: ui-gate`.
- **On `skip`**: session-mute add; ledger row: `escalation-gate · skip (session-local mute) · source: ui-gate`.
- **On `stop`**: exit run; ledger row: `escalation-gate · stop (exit) · source: ui-gate`.

### G.4c — Escalation: unrecognized state (D.10)

- **Transition class**: unrecognized `waiting-for:*` / `blocked:*` (per D.10 catch-all).
- **Title**: `Escalation: unrecognized state for <issue-ref>`.
- **Body source**: The § G.4c presentation block (label observed + no matching dispatch row).
- **Options** (NEVER `retry`):
  - `skip` → `Skip (session-local mute) (Recommended)`
  - `stop` → `Stop`
- **Free-text affordance**: `{ kind: "none" }`.
- **On `skip`**: session-mute add; ledger row: `unrecognized-state · skip (session-local mute) · source: ui-gate`.
- **On `stop`**: exit run; ledger row: `unrecognized-state · stop (exit) · source: ui-gate`.

### G.4d — Escalation: merge-conflicts (D.11)

- **Transition class**: `waiting-for:merge-conflicts` OR `blocked:stuck-merge-conflicts`.
- **Title**: `Escalation: merge conflicts on <issue-ref>`.
- **Body source**: The § G.4d diagnosis subagent block (conflicting files summary + resolve-instructions + advance / skip / stop rationale).
- **Options**:
  - `resolved` → `I've resolved it — advance the gate`
  - `skip` → `Skip`
  - `stop` → `Stop`
- **Free-text affordance**: `{ kind: "none" }`.
- **On `resolved`**: `cockpit_advance(issue=<ref>, gate="merge-conflicts")`; on typed error re-present the gate (revised generation). Ledger row: `escalation-gate · advanced · source: ui-gate` OR `escalation-gate · advance failed: <detail> · source: ui-gate`.
- **On `skip`**: session-mute add; ledger row: `escalation-gate · skip (session-local mute) · source: ui-gate`.
- **On `stop`**: exit run; ledger row: `escalation-gate · stop (exit) · source: ui-gate`.

### G.5 — Phase-queue confirmation (D.8, epic mode only)

- **Transition class**: `phase-complete`.
- **Title**: `Phase queue: P<next> for <epic-ref>` (issueRef in the wire record is `<epic-ref>` — this is the sole per-issue exception, allowed because the epic-ref is a valid GitHub issue ref).
- **Body source**: The § G.5 phase-queue presentation block (full status table + open ad-hoc list + queued issue count).
- **Options** (varies by ad-hoc count):
  - No ad-hoc: `queue` → `Queue P<next> (<N> issues) (Recommended)`; `cancel` → `Cancel`.
  - With ad-hoc: `hold` → `Hold — <M> ad-hoc (Recommended)`; `queue` → `Queue P<next>`; `cancel` → `Cancel`.
- **Free-text affordance**: `{ kind: "none" }`.
- **On `queue`**: `cockpit_queue(epic=<ref>, phase="P<next>")`; ledger row: `phase-queue-gate · queued P<next> (<N> issues) · source: ui-gate` OR `queued P<next> (<N> issues) with <M> ad-hoc open · source: ui-gate`.
- **On `hold`**: no downstream action; ledger row: `phase-queue-gate · held (<M> ad-hoc open) · source: ui-gate`.
- **On `cancel`**: no downstream action; ledger row: `phase-queue-gate · cancelled · source: ui-gate`.

### G.6 — Filing gate (Form 3 tracking-new + mid-run file-new intent)

- **Transition class**: `filing-gate` (synthetic — not a live label).
- **Title**: `File issue: <drafted-title>`.
- **Body source**: The § filing-gate presentation block (drafted title + body + label + rationale).
- **Options**:
  - `approve-and-file` → `Approve & file (Recommended)`
  - `make-changes` → `Make changes`
  - `skip-dont-file` → `Skip (don't file)`
- **Free-text affordance**: `{ kind: "optional", placeholder: "edit directive (used by Make changes)" }`.
- **On `approve-and-file`**: `gh issue create --body-file <tmp>` → capture ref → `cockpit_scope_add(scope=<tracking-ref>, add=<new-ref>)` → `cockpit_queue(...)` (mid-run intent) OR bind trackingRef (Form 3 startup). Ledger row: `filing-gate+scope-add · filed + queued (<new-ref>) · source: ui-gate` OR the error variants at auto.md line 1293.
- **On `make-changes`**: apply edit directive; re-open with `generation += 1`. Ledger row: `filing-gate · make-changes (re-opened g<n>) · source: ui-gate`.
- **On `skip-dont-file`**: no filing; run exits cleanly (Form 3 startup) OR loop continues (mid-run intent). Ledger row: `filing-gate · skipped (draft discarded) · source: ui-gate`.

### G.7 — Scope-drained (epic-less exit)

- **Transition class**: `scope-drained` (synthetic).
- **Title**: `Scope drained for <tracking-ref>`.
- **Body source**: The § G.7 scope-drained presentation block (full status table for the tracking scope + terminal states summary).
- **Options**:
  - `keep-watching` → `Keep watching (Recommended)`
  - `add-more-work` → `Add more work`
  - `finish` → `Finish (close tracking + summary)`
- **Free-text affordance**: `{ kind: "required-if", ifOptionId: "add-more-work", placeholder: "Reference an existing ref (e.g., 'also process <ref>') or ask me to file a new issue (e.g., 'file an issue for <topic>')." }`.
- **On `keep-watching`**: return to main loop; ledger row: `scope-drained-gate · keep-watching · source: ui-gate`.
- **On `add-more-work`** (with required freeText): route freeText through the existing § Add-issue intent recognizer (add-existing vs file-new). Ledger row: `scope-drained-gate · add-more-work · source: ui-gate`, followed by the intent-specific rows (`scope-add · queued` for add-existing, `filing-gate+scope-add · filed + queued (<new-ref>)` for file-new — both matching the local flow's rows exactly, both with `· source: ui-gate` suffix).
- **On `finish`**: `gh issue close <tracking-ref>` → print run summary → exit zero. Ledger row: `scope-drained-gate · finish (tracking closed) · source: ui-gate`. Written BEFORE the close (per current § G.7 rule at auto.md line 1210).

## Q4=A collapse rule for G.7 Add-more-work

The `Add more work` option under UI mode does NOT re-open a new G.7-followup gate for the prose. The wire `GateAnswerEvent.answer.freeText` field carries the operator's prose payload alongside `optionId: "add-more-work"` in a single answer submission (see `data-model.md § FreeTextAffordance` — the `required-if` affordance enforces this at the inbox UI level). D.12 hands freeText to the existing § Add-issue intent recognizer as if it were the second-turn prose reply in the local flow.

Local flow parity (per spec § Scope): the two-turn local flow (`Add more work` selection → prose prompt → operator prose reply → intent recognizer) collapses into a one-turn UI flow (option + freeText in one submission). Behavior downstream of the intent recognizer is identical to the local flow.

## G.4(e) exclusion (Q1=C rationale)

G.4(e) (consecutive `invalid-cursor` fault, per-epic in-memory cursor-mechanism fault) is NOT in this table. It remains a local `AskUserQuestion` gate (§ step 5 Branch B in auto.md). The wire record cannot represent it — no `issueRef`, no `issueTitle`, no `issueUrl`, no `branch`; the fault is per-epic in-memory only.

Under UI mode, the G.4(e) gate fires locally via `AskUserQuestion` even when every other gate uses UI mode. This is the sole per-gate mode exception. Ledger row for G.4(e) is unchanged from today (no `· source: ui-gate` suffix, no fallback ledger note).

## Test pins (playbook-verification)

The 449-* describe block adds:
- `assert new "## UI-mode gate mapping" section exists`
- `assert the section contains a markdown table with EXACTLY 10 body rows`
- `assert the table's rows begin with G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7 in order`
- `assert G.4e is NOT in the table`
- `assert G.7 row explicitly names "required-if" free-text affordance for add-more-work`
- `assert every row's on-answer column includes the "· source: ui-gate" suffix in at least one ledger example`

Re-pin, don't weaken.
