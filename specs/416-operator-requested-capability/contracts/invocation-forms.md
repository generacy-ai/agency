# Contract: Invocation forms

**Feature**: See [spec.md](../spec.md)
**Anchor**: spec § Changes item 1; plan.md § Instructions step 1 rewrite

## Purpose

Recognize three invocation forms for `/cockpit:auto` at § Instructions step 1 and compute the run's `TrackingRefContext`. Under all three forms the tracking ref is the run's identity: it is printed at startup, recorded in the ledger header, and never widened during the run (isolation is by construction — see spec § Goal #2).

## Forms

| # | Invocation | Positional / flag | `invocationForm` |
|---|------------|-------------------|------------------|
| 1 | `/cockpit:auto <epic-ref>` | one positional matching `<owner>/<repo>#<n>` shape | `epic` |
| 2 | `/cockpit:auto --tracking <issue-ref>` | `--tracking` flag + one positional matching `<owner>/<repo>#<n>` | `tracking-existing` |
| 3 | `/cockpit:auto --new "<title>"` | `--new` flag + one quoted positional (free-text title) | `tracking-new` |

## Parse rules

- Exactly one form matches per invocation. Ambiguous input (e.g., both `--tracking` and `--new`) → print `Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>"` and exit non-zero.
- Under form 1, `<epic-ref>` must parse as `<owner>/<repo>#<n>`. On parse failure → usage error.
- Under form 2, `<issue-ref>` must parse as `<owner>/<repo>#<n>`. On parse failure → usage error.
- Under form 3, `<title>` is any non-empty quoted string. On empty or unquoted title → usage error.

## Post-parse behavior

### Form 1 (`epic`)
- The epic ref is the run's identity from step 1.
- Ledger header written at step 1: `Tracking ref: <epic-ref> · form: epic`.
- Startup sweep (step 3) reads task list from `cockpit_status(epic=<epic-ref>, json=true)`.
- D.8 phase-queue gate fires on phase-complete events.
- G.7 scope-drained gate does NOT fire — the run exits on `epic-complete`.

### Form 2 (`tracking-existing`)
- The tracking ref is the run's identity from step 1.
- Ledger header written at step 1: `Tracking ref: <tracking-ref> · form: tracking-existing`.
- Startup sweep (step 3) reads task list from the tracking issue via `cockpit_status`; each live-state ref becomes a synthetic event.
- D.8 phase-queue gate does NOT fire — no phases in epic-less mode.
- G.7 scope-drained gate fires when every task-list ref is terminal (per Q1: `cockpit_status`'s classifier).

### Form 3 (`tracking-new`)
- The tracking ref is NOT yet known at step 1 — it must be created via G.6 first.
- **G.6 fires immediately** at the top of step 1's post-parse phase: session drafts title/body from the operator-supplied `<title>` (drafter subagent — same shape as file-new intent's drafter), presents G.6 filing gate. On `Approve & file`, the session creates the tracking issue via `gh issue create`, captures the new ref, then writes the ledger header (`Tracking ref: <new-ref> · form: tracking-new`) and proceeds to step 3.
- On `Skip (don't file)` at the initial G.6, the run exits cleanly (no tracking issue was created; no work started). Ledger written but ephemeral — the ledger header carries `form: tracking-new (abandoned before creation)`.
- Subsequent behavior identical to form 2.

## Ledger header line format

```text
Tracking ref: <ref> · form: <invocationForm>
```

Written as the FIRST line of the ledger file, above the dispatch stream. Under forms 1 and 2 written at step 1; under form 3 written after G.6 approval.

## Fixtures

None — the invocation-form parser is playbook-prose only. Static grep on `--tracking` and `--new` in `auto.md` § Instructions step 1 verifies the flags are documented. Fixtures for the intent recognizers (add-existing, file-new) live under `tests/fixtures/416-*` and are exercised by 416-1 / 416-2.

## Related contracts

- [Intent recognition](./intent-recognition.md) — the file-new drafter subagent under form 3 uses the same shape as the mid-run file-new intent path.
- [Filing gate](./filing-gate.md) — G.6 fires under form 3 to create the initial tracking issue.
- [Ledger scope mutations](./ledger-scope-mutations.md) — ledger header line + scope-growth summary line.
