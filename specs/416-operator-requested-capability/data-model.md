# Data Model: Operator-requested capability

**Feature**: See [spec.md](./spec.md)
**Plan**: See [plan.md](./plan.md)
**Date**: 2026-07-13

This document specifies the concrete type shapes for the intent-recognition parser (`lib/intent-recognition.ts`), the presentation-block layouts for the two new gates (G.6 filing, G.7 scope-drained), the D.8 phase-queue ad-hoc enumeration, the § Ledger scope-mutation vocabulary, the run-summary § L.6 scope-growth line, and the pre/post surface changes at each `auto.md` edit site. Types are TypeScript; playbook-prose contract shapes are Markdown-fragment templates.

## Overview

Five discrete entity/type groups underpin this feature:

1. **Invocation-form parsing** — three forms recognized at § Instructions step 1; produces a `TrackingRefContext` used throughout the run.
2. **Intent-class recognition** — two pure parsers over free-text operator input; produces either a parsed intent or `null` (confirm-on-ambiguity signal).
3. **Filing gate G.6** — presentation-block layout + iterative-edit re-loop shape.
4. **Scope-drained gate G.7** — presentation-block layout + per-ref disposition rendering.
5. **Ledger scope-mutation vocabulary** — two new action-outcome rows + one new summary line.

All types are pure data — no I/O, no runtime coupling to the plugin. The playbook prose is authoritative at runtime; the TS types exist so the recognizers can be fixture-verified.

## 1. Invocation-form parsing

### TrackingRefContext

```typescript
export type TrackingRefContext = {
  /**
   * The run's identity — the ref the loop drives. One of:
   *   - the epic ref, when invoked as `/cockpit:auto <epic-ref>`
   *   - the existing tracking ref, when invoked as `/cockpit:auto --tracking <issue-ref>`
   *   - the newly filed tracking ref, when invoked as `/cockpit:auto --new "<title>"`
   *
   * Format: `<owner>/<repo>#<n>` (verbatim from the operator; not normalized).
   */
  ref: string;

  /**
   * Which invocation form produced this ref. Determines run behavior:
   *   - `epic`: existing epic-mode dispatch; D.8 phase-queue gate applies; no G.7 scope-drained gate.
   *   - `tracking-existing`: epic-less mode; no D.8 (no phases); G.7 scope-drained gate applies on drain.
   *   - `tracking-new`: same as `tracking-existing` after the initial G.6 filing gate creates the tracking issue.
   */
  invocationForm: "epic" | "tracking-existing" | "tracking-new";

  /**
   * Ledger-header line format:
   *   `Tracking ref: <ref> · form: <invocationForm>` (verbatim; written above the dispatch stream on the first line of the ledger file).
   */
};
```

### Invocation-form parser (playbook prose, not code)

Playbook § Instructions step 1's rewrite recognizes exactly three positional/flag shapes:

| # | Invocation | Parse rule | `invocationForm` |
|---|------------|-----------|------------------|
| 1 | `/cockpit:auto <epic-ref>` | one positional matching `<owner>/<repo>#<n>` shape | `epic` |
| 2 | `/cockpit:auto --tracking <issue-ref>` | `--tracking` flag with one positional matching `<owner>/<repo>#<n>` | `tracking-existing` |
| 3 | `/cockpit:auto --new "<title>"` | `--new` flag with one quoted positional; title is the operator's free-text description | `tracking-new` (starts as `null` ref; G.6 fires, creates the tracking issue, then ref is set) |

**Validation rules**:
- Exactly one form matches per invocation. If two flags are combined (`--tracking` + `--new`), print usage error and exit non-zero.
- If neither `--tracking` nor `--new` is present and the positional doesn't parse as `<owner>/<repo>#<n>`, print usage error and exit non-zero.
- Under form 3, the tracking ref is not known until G.6 fires; the ledger-header line is written after G.6 approval (`Tracking ref: <newly-filed-ref> · form: tracking-new`).
- Under forms 1 and 2, the ledger-header line is written at step 1 (before the startup sweep).

**Pre/post at § Instructions step 1**:
- **Pre**: single-positional `<epic-ref>` required; usage error on any other shape.
- **Post**: three forms recognized as above; `TrackingRefContext` computed; ledger-header line format extended.

## 2. Intent-class recognition

### Types

```typescript
/**
 * A parseable add-existing intent: the operator's message reads like
 * "also process <ref>", "process <ref> too", "add <ref> to scope", etc.,
 * AND contains an explicit parseable ref.
 *
 * Returns null when:
 *   - no add-existing-like phrasing is detected, OR
 *   - phrasing is detected but no parseable ref is present (→ session confirms intent).
 */
export type AddExistingIntent = {
  ref: string;  // e.g., "generacy-ai/agency#416" or "#416" (shorthand — resolved against tracking ref's repo)
};

/**
 * A parseable file-new intent: the operator's message reads like
 * "file an issue for <topic>", "open a bug for <topic>", "create an issue about <topic>", etc.
 *
 * Returns null when:
 *   - no file-new-like phrasing is detected, OR
 *   - phrasing is ambiguous (e.g., "look at X", "check X out") → session confirms intent.
 */
export type FileNewIntent = {
  topic: string;  // free-text description of the bug/feature to file (used by the drafter to expand into title/body)
};
```

### Parsers

```typescript
/**
 * Extracts an explicit ref from natural-language add-existing phrasings.
 * Returns null when no ref is found (regardless of whether add-existing phrasing was detected).
 *
 * Ref formats accepted:
 *   - Full: `<owner>/<repo>#<n>` (e.g., `generacy-ai/agency#416`)
 *   - Shorthand: `#<n>` (e.g., `#416`) — the playbook resolves this against the tracking ref's repo at dispatch time.
 *
 * When multiple refs appear in one message, the FIRST parseable ref wins.
 */
export function parseAddExistingIntent(input: string): AddExistingIntent | null;

/**
 * Extracts the topic from natural-language file-new phrasings.
 * Returns null when phrasing is ambiguous or absent.
 *
 * Canonical phrasings (patterns, not literals):
 *   - `file an? issue (for|about|on) <topic>`
 *   - `open a? bug (for|about|on) <topic>`
 *   - `create an? issue (for|about|on) <topic>`
 *   - `raise an? issue (for|about|on) <topic>`
 *
 * Ambiguous phrasings (return null):
 *   - `look at <topic>` — could be chat or investigate; no filing signal.
 *   - `check <topic> out` — same.
 *   - `investigate <topic>` — could be filed later, but not now.
 */
export function parseFileNewIntent(input: string): FileNewIntent | null;
```

### Validation rules

- **`parseAddExistingIntent` is generous on phrasing, strict on ref presence**. Any add-existing-like phrasing with no parseable ref returns `null` — the playbook prose then confirms intent conversationally ("do you want me to add an issue to scope? which ref?").
- **`parseFileNewIntent` is strict on phrasing, generous on topic**. Only the four canonical patterns (or close variants) trigger; the topic captures whatever follows the trigger clause (used as the seed for the drafter subagent).
- **Both parsers are pure functions** — no I/O, no side effects, deterministic. They live in `lib/intent-recognition.ts` and are fixture-verified in `tests/playbook-verification.test.ts` block 416-1 and 416-2.
- **`null` from either parser is NOT a "no intent detected" signal only** — it's specifically a "cannot act without confirmation" signal. The playbook prose distinguishes: on `null`, the session confirms intent before dispatching.

## 3. Filing gate G.6

### Presentation-block layout

```markdown
Filing new issue for <tracking-ref>:

**Title:** <drafted-title>
**Labels:** <labels or "(none)">
**Body:**

<drafted-body — full markdown, multi-line, verbatim as it will be filed>

**Filing target:** <owner>/<repo> (from tracking ref)
**Parent tracking ref:** <tracking-ref>
```

### AskUserQuestion parameters

- **Question text**: `File this issue on <owner>/<repo>?`
- **Header**: `File` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, in this order):
  1. `Approve & file (Recommended)` — create + scope-add + queue.
  2. `Make changes` — enter iterative re-loop; the operator provides revised content conversationally, the session redrafts and re-fires this same G.6 gate.
  3. `Skip (don't file)` — no create, no scope-add, no queue; ledger line noting the skip.

### Iterative edit-branch rules

- **On `Make changes` selection**: the operator's follow-up turn provides the change directives (title change, body change, labels change) as free text. The session redrafts the full issue and re-presents the full revised draft plus the same G.6 gate. This loops until `Approve & file` or `Skip (don't file)`.
- **On built-in "Other" free-text**: the operator can type revised content directly on the current G.6 fire without selecting `Make changes` first. The one-turn fast path (matches #400's Q1=A pattern): the session applies the edit, re-fires G.6 once more with the revised draft. Further changes still require `Make changes` re-loop.
- **Full-draft re-present each round**: the presentation-block layout above is used verbatim on every re-fire. **No diff view.** The invariant is: what gets filed on `Approve & file` is exactly what was last shown.
- **Zero-directive `Make changes` is a no-op re-present**: matches #400's Q4=A pattern. Empty follow-up → the session re-presents the same draft plus the same gate. Never implicit-approve; never implicit-skip.

### Pre/post at § Gate contract

- **Pre**: five gate rows (G.1–G.5) + § AskUserQuestion invocation contract.
- **Post**: seven gate rows (G.1–G.7) + § AskUserQuestion invocation contract (unchanged; both new gates fit Rules 1–3). Gate contract table gains G.6 + G.7 rows.

## 4. Scope-drained gate G.7

### Presentation-block layout

```markdown
Scope drained for <tracking-ref> — every ref is terminal.

**Tracking ref:** <tracking-ref>
**Refs processed:** <N>
**Per-ref disposition:**
1. <owner>/<repo>#<m1> · <completed | not-planned>
2. <owner>/<repo>#<m2> · <completed | not-planned>
...

**Session-mute set:** <s> ref(s)
```

### AskUserQuestion parameters

- **Question text**: `Scope drained on <tracking-ref>. How to proceed?`
- **Header**: `Drain` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, in this order):
  1. `Keep watching (Recommended)` — return to main loop (step 4); re-arm `cockpit_await_events`.
  2. `Add more work` — return to main loop with a follow-up prose prompt inviting the operator to file or add.
  3. `Finish (close tracking issue + summary)` — close the tracking issue via `gh issue close <tracking-ref>`, print run summary § L.6 (extended with per-ref disposition), exit zero.

### Validation rules

- **Terminality per ref is determined by `cockpit_status`, not by playbook re-derivation**. Q1 anchor: the engine's classifier owns the `completed | not-planned | non-terminal` decision. The gate fires when every task-list ref is `completed | not-planned`.
- **Per-ref disposition list is populated from `cockpit_status`** — one line per ref, in the order they were added to the task list (order comes from the tracking issue's markdown task-list order).
- **`Finish` is outward-facing** — it closes the tracking issue. The G.7 gate IS the outward-facing confirmation; no second `AskUserQuestion` fires before the close. This matches G.5's "gate IS the confirmation" pattern.
- **Only fires in `tracking-existing` and `tracking-new` invocation forms**. Under `epic` invocation form, the run exits via `epic-complete` and G.7 does not exist.

### Pre/post at § Gate contract (continued)

- G.7 row appears immediately after G.6 in the gate rows and the § Gate contract table.

## 5. D.8 phase-queue ad-hoc enumeration

### Extended presentation-block layout

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...

Open ad-hoc issues in scope (added mid-run):
1. <owner>/<repo>#<a1> · <title> · <live-state>
2. <owner>/<repo>#<a2> · <title> · <live-state>
...
```

### Rendering rules

- **The `Open ad-hoc issues in scope (added mid-run):` block is emitted only when the ad-hoc list is non-empty**. Empty list → block omitted entirely (no `(none)` placeholder). This keeps the gate presentation clean when no ad-hoc work has been added.
- **Ad-hoc issue enumeration is populated from the ledger** — every scope-add ledger line names a ref; the D.8 presentation-computation helper (`openAdHocIssues(trackingRef, ledger)`) filters those refs to the ones whose live-state per `cockpit_status` is non-terminal.
- **Per-ref line format**: `<owner>/<repo>#<n> · <title> · <live-state>` — title from `cockpit_status`; live-state from `cockpit_status` (verbatim transition class).
- **G.5 gate recommendation flips when the list is non-empty**:
  - Empty list: `Queue P<next> (<N> issues) (Recommended)` / `Cancel`.
  - Non-empty list: `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` / `Queue P<next> (<N> issues)` / `Cancel`.

### Extended AskUserQuestion parameters (empty ad-hoc list — unchanged from current)

- Options (exactly two):
  1. `Queue P<next> (<N> issues) (Recommended)`
  2. `Cancel`

### Extended AskUserQuestion parameters (non-empty ad-hoc list — new)

- Options (exactly three):
  1. `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` — do not queue; ledger line noting the hold.
  2. `Queue P<next> (<N> issues)` — still selectable; queue the next phase even with open ad-hoc work.
  3. `Cancel` — do nothing; phase-complete state persists.

### Pre/post at § Dispatch D.8

- **Pre**: two-option `AskUserQuestion` (`Queue P<next>` / `Cancel`); no ad-hoc enumeration.
- **Post**: two-option or three-option `AskUserQuestion` depending on ad-hoc list; enumeration block emitted when non-empty; recommendation flip when non-empty.

## 6. Ledger scope-mutation vocabulary

### New action-outcome rows (appended to § Ledger action-outcome vocabulary table)

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| Add-issue (add-existing intent) | `scope-add` | `queued`, `error: <description>` |
| Add-issue (file-new intent) | `filing-gate+scope-add` | `filed + queued (<new-ref>)`, `skipped (draft discarded)`, `error: <description>` |
| G.7 scope-drained gate | `scope-drained-gate` | `keep-watching`, `add-more-work`, `finish (tracking closed)` |
| G.6 filing gate (skip only — no ref filed) | `filing-gate` | `skipped (draft discarded)` |
| D.8 phase-queue hold (new; non-empty ad-hoc list) | `phase-queue-gate` | `held (<M> ad-hoc open)` |

### Ledger-line examples

```text
generacy-ai/agency#420 · scope-add · queued
generacy-ai/agency#421 · filing-gate+scope-add · filed + queued (generacy-ai/agency#421)
generacy-ai/agency#422 · filing-gate+scope-add · skipped (draft discarded)
generacy-ai/agency#123 · phase-complete · phase-queue-gate · held (2 ad-hoc open)
generacy-ai/agency#100 · scope-drained · scope-drained-gate · keep-watching
generacy-ai/agency#100 · scope-drained · scope-drained-gate · finish (tracking closed)
```

### Run summary § L.6 extension

Existing summary lines are unchanged. Two new lines are added at the bottom of the summary block, one unconditional and one epic-less-only:

```text
Scope growth: started with <N>, added <M>, completed <K>
Per-ref disposition (epic-less only):
  · <owner>/<repo>#<m1> · <completed | not-planned>
  · <owner>/<repo>#<m2> · <completed | not-planned>
  ...
```

**Counts derivation** (all from the ledger file):
- `started with N` — number of refs in the task list at run start (from step 3 startup sweep — count of synthetic events).
- `added M` — number of `scope-add` action lines in the ledger, plus number of `filing-gate+scope-add` action lines with `filed + queued` outcome (excludes `skipped` outcomes).
- `completed K` — number of `merge · merged` action lines PLUS number of terminal-state transitions for scope refs (from step 4 dispatches — `epic-complete` counts toward K for the tracking ref itself).

**Per-ref disposition rendering** — only in `tracking-existing` and `tracking-new` invocation forms (epic-less). Populated from `cockpit_status`'s per-ref disposition classifier at exit time.

### Pre/post at § Ledger

- **Pre**: § Ledger action-outcome table with 20 rows (D.1–D.11 + cursor recoveries + G.4(e) + mute-set hit).
- **Post**: § Ledger action-outcome table with 25 rows (adds `scope-add`, `filing-gate+scope-add`, `scope-drained-gate`, `filing-gate` skip-only, `phase-queue-gate` hold outcome).
- **Pre L.6**: run summary block with 8 lines + non-epic-complete abbreviated form.
- **Post L.6**: run summary block with 9–10 lines (adds `Scope growth:` unconditionally; adds `Per-ref disposition:` block in epic-less mode).

## 7. Playbook edit sites — pre/post summary

| Section | Pre | Post |
|---------|-----|------|
| § Instructions step 1 | Single-positional `<epic-ref>`; usage error on any other shape | Three invocation forms; `TrackingRefContext` computed; ledger-header line extended |
| § Instructions step 3 | Sweep reads task list from `cockpit_status(epic=<epic-ref>)` | Same, plus one sentence: under `--tracking`/`--new`, sweep reads task list from the tracking issue and treats each live-state ref as a synthetic event |
| § Instructions step 4 | "For each event in the batch..." dispatch prose | Same, plus one sentence: initial-flagged events dispatch normally through the existing table by carried state (Q5 anchor) |
| § Dispatch table | 12 rows (D.1–D.11 + D.9a/b/c/d) | Same 12 rows (no new row per Q5) |
| § Dispatch D.8 | Two-option `AskUserQuestion` (`Queue P<next>` / `Cancel`) | Two- or three-option depending on ad-hoc list; enumeration block emitted when non-empty; recommendation flip when non-empty |
| § Add-issue flow (NEW subsection, after § Dispatch, before § Gate contract) | (does not exist) | Two intent-class recognizers (add-existing + file-new); dispatch paths (scope-add + queue for add-existing; G.6 filing gate + scope-add + queue for file-new); confirm-on-ambiguity signal |
| § Gate contract table | 5 rows (G.1–G.5) | 7 rows (G.1–G.7); G.6 filing + G.7 scope-drained appended |
| § Gate contract G.6 (NEW row after G.5) | (does not exist) | Three-option filing gate; iterative edit branch; full-draft re-present; single-shot "Other" fast path |
| § Gate contract G.7 (NEW row after G.6) | (does not exist) | Three-option scope-drained gate; `Keep watching` default; per-ref disposition list |
| § AskUserQuestion invocation contract | Rules 1–3 (single-item questions, ≤4 per call, per-call fanout) | Unchanged; both G.6 and G.7 fit Rules 1–3 |
| § Ledger action-outcome vocabulary table | 20 rows | 25 rows (adds `scope-add`, `filing-gate+scope-add`, `scope-drained-gate`, `filing-gate` skip, `phase-queue-gate` hold outcome) |
| § Ledger L.4 status table policy | 4 surfaces | 5 surfaces (adds scope-drained gate G.7 as a surface — operator orientation before exit decision) |
| § Ledger L.6 run summary | 8 lines + abbreviated form | 9–10 lines (adds `Scope growth:` unconditionally; adds `Per-ref disposition:` in epic-less mode) |
| § Invariants | 9 numbered invariants | Unchanged (no new invariant — guarantees live in G.6/G.7 contracts + § Add-issue flow prose + fixture assertions) |
| § Examples | 2 examples | 3 examples (Example 3 = epic-less stabilization run with 3 ad-hoc adds, 1 filing-gate skip, 1 G.7 `Keep watching`, 1 G.7 `Finish`) |

## Relationships

- **`TrackingRefContext.invocationForm`** determines which gates fire during the run. `epic` → D.8 fires on phase boundaries; G.7 does not fire. `tracking-existing` / `tracking-new` → G.7 fires on scope drain; D.8 does not fire (no phases in epic-less mode).
- **`parseAddExistingIntent` return** determines dispatch: on `AddExistingIntent`, the flow dispatches directly (no gate); on `null`, the session confirms intent conversationally before dispatching.
- **`parseFileNewIntent` return** determines dispatch: on `FileNewIntent`, the flow dispatches to G.6; on `null`, the session confirms intent conversationally before dispatching. Every file-new dispatch lands on G.6 (spec Q2 safety net).
- **G.6 outcome determines ledger line + downstream calls**: `Approve & file` → create + scope-add + queue → `filing-gate+scope-add · filed + queued (<new-ref>)`; `Skip (don't file)` → `filing-gate · skipped (draft discarded)`.
- **G.7 outcome determines ledger line + exit path**: `Keep watching` → `scope-drained-gate · keep-watching` + return to main loop; `Add more work` → `scope-drained-gate · add-more-work` + return with prose prompt; `Finish` → `gh issue close` + `scope-drained-gate · finish (tracking closed)` + run summary + exit zero.
- **D.8 ad-hoc enumeration reads from ledger + `cockpit_status`**: `openAdHocIssues(trackingRef, ledger)` filters `scope-add`-added refs by non-terminal live state.
- **Run summary § L.6 `Scope growth:` line reads from ledger**: counts `scope-add` and `filing-gate+scope-add` actions with successful outcomes.
