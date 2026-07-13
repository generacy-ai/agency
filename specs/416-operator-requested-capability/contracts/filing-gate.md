# Contract: Filing gate G.6

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 2 (new-issue branch); clarifications Q3; plan.md § Gate contract G.6

## Purpose

Present a drafted issue (title + body + optional labels) to the operator, capture their verdict (approve / edit iteratively / skip), and on approval create the issue via `gh issue create`. Every filing is gated because it is outward-facing — a misread file-new intent surfaces as a skippable gate, never as an unreviewed outward action.

## Trigger

- Mid-run file-new intent recognized (via `parseFileNewIntent` returning a `FileNewIntent`).
- `--new "<title>"` invocation form (see [invocation-forms.md](./invocation-forms.md)) — G.6 fires at step 1 to create the tracking issue.

## Presentation block

```markdown
Filing new issue for <tracking-ref>:

**Title:** <drafted-title>
**Labels:** <labels or "(none)">
**Body:**

<drafted-body — full markdown, multi-line, verbatim as it will be filed>

**Filing target:** <owner>/<repo> (from tracking ref)
**Parent tracking ref:** <tracking-ref>
```

The presentation block is emitted in the same assistant response as the `AskUserQuestion` call (fused pattern — #388 pattern applied uniformly).

## `AskUserQuestion` parameters

- **Question text**: `File this issue on <owner>/<repo>?`
- **Header**: `File` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, in this order):
  1. `Approve & file (Recommended)` — create + scope-add + queue + ledger.
  2. `Make changes` — enter iterative re-loop.
  3. `Skip (don't file)` — no create, no scope-add, no queue; ledger line noting the skip.

Per § AskUserQuestion invocation contract, one `AskUserQuestion` call per G.6 fire (single-item `questions` array).

## Iterative edit-branch (Q3=B anchor)

- **On `Make changes` selection**: the operator's follow-up turn provides revised content conversationally (free text — no structured directives required). The session redrafts the full issue (title, body, labels) and re-presents the full revised draft plus the same G.6 gate.
- **On built-in "Other" free-text** (one-turn fast path): the operator can type revised content directly on the current G.6 fire without selecting `Make changes` first. The session applies the edit and re-fires G.6 once with the revised draft. Further edits require explicit `Make changes` selection (matches #400's Q1=A "one-shot Other" pattern).
- **Full-draft re-present each round** — presentation-block layout is used verbatim on every re-fire. **No diff view.** Invariant: what gets filed on `Approve & file` is exactly what was last shown.
- **Zero-directive `Make changes` is a no-op re-present** — matches #400's Q4=A pattern. Empty follow-up → the session re-presents the same draft plus the same gate. Never implicit-approve; never implicit-skip. Cannot stall — every iteration requires an explicit operator choice.

## Post-gate behavior

- **`Approve & file`** →
  1. Draft to tempfile: write assembled markdown body to `/tmp/cockpit-auto-file-<tracking-ref-slug>-<unix_ts>.md`.
  2. Create issue: `gh issue create --title "<title>" --body-file <tmpfile> [--label <labels>]` — `--body-file` only (never `-b` / `--body`; shell quoting risks stripping content).
  3. Capture new ref from `gh issue create` return.
  4. Scope-add: `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<new-ref>)` (the generacy#935 verb).
  5. Queue: `cockpit_queue(issue=<new-ref>)` (the generacy#935 issue-form).
  6. Ledger line: `<new-ref> · filing-gate+scope-add · filed + queued (<new-ref>)`.
  7. Return to main loop.
- **`Make changes`** → collect operator directives from the follow-up turn; redraft; re-fire G.6 with the revised presentation block. Loop.
- **`Skip (don't file)`** → no create, no scope-add, no queue. Ledger line: `<tracking-ref> · filing-gate · skipped (draft discarded)` (the `<tracking-ref>` slot on the left because no new ref was ever assigned). Return to main loop.

## Special case: `--new "<title>"` invocation form (initial G.6)

- Under `--new`, the initial G.6 fire creates the tracking ref itself. On `Approve & file`, the ledger header is written after the create succeeds (`Tracking ref: <new-ref> · form: tracking-new`), then the startup sweep proceeds.
- On `Skip (don't file)` at the initial G.6, the run exits cleanly. No tracking ref exists — the ledger file may still be written but carries `form: tracking-new (abandoned before creation)` in the header.

## Failure modes

- `gh issue create` fails → **Error handling** class `OTHER`; do not scope-add; do not queue; ledger line `<tracking-ref> · filing-gate+scope-add · error: <description>`; return to main loop.
- `cockpit_scope_add` fails after successful `gh issue create` → the issue exists on GitHub but is not in scope. Ledger line: `<new-ref> · filing-gate+scope-add · error: scope-add failed: <description>`. Do not queue. **Do not attempt retraction** (closing the just-created issue would compound the failure). The operator can manually add the ref via the add-existing intent flow.
- `cockpit_queue` fails after successful scope-add → the ref is in scope but not queued. Ledger line: `<new-ref> · filing-gate+scope-add · error: queue failed: <description>`. The main loop will pick it up on the next `cockpit_await_events` iteration when the engine surfaces its state.

## Validation rules

- The presentation block must always contain all five field labels (`**Title:**`, `**Labels:**`, `**Body:**`, `**Filing target:**`, `**Parent tracking ref:**`) — even under empty labels (`(none)` placeholder). Missing any label is a presentation-shape drift.
- The re-present after `Make changes` must show the SAME five-field layout — only field contents may differ. This is the load-bearing invariant behind 416-3.
- `Approve & file` MUST NOT be triggered by a zero-directive `Make changes` follow-up (Q4=A pattern from #400 applied here).
- `--body-file` is exclusive — never `-b` / `--body` (matches auto.md D.1 step 4 convention).

## Fixtures

- `416-filing-gate-first-draft.md` — first-round G.6 presentation shape (drafted title, drafted body, no labels, filing target, parent tracking ref).
- `416-filing-gate-revised.md` — post-`Make changes` presentation shape (revised title, revised body, added labels, same filing target + parent tracking ref). Same five-field layout as the first draft.

## Verification

- **Static grep**: `commands/auto.md` § Gate contract G.6 contains `Approve & file (Recommended)`, `Make changes`, `Skip (don't file)`, and the five presentation labels. Negative: does NOT contain a two-option variant (`Approve draft (Recommended) / Skip this question` would be #400 drift).
- **Behavioral**: 416-3 asserts first-draft and revised-draft fixtures share the same five-field block layout.
- **True verifier**: operator smoke-test — file an issue mid-run, request one change via `Make changes`, revised draft re-presented with the same five-field layout, approve, ledger records `filed + queued (<new-ref>)`.

## Related contracts

- [Intent recognition](./intent-recognition.md) — `parseFileNewIntent` returning `FileNewIntent` triggers G.6.
- [Invocation forms](./invocation-forms.md) — `--new "<title>"` fires the same G.6 at step 1.
- [Ledger scope mutations](./ledger-scope-mutations.md) — ledger vocabulary for G.6 outcomes.
