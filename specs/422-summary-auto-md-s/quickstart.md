# Quickstart: inline-thread request-changes contract

The change is contract-shape in two playbook files. There's nothing to install and nothing to run — this quickstart is for **verifying** the amended contract in a real request-changes flow.

## Prerequisites

- `gh` CLI authenticated (`gh auth status` shows a logged-in user).
- A PR you own the credential for (Generacy cluster's single-credential model requires the PR author == acting bot for `event: COMMENT` reviews).
- The `cockpit_*` MCP tools available in the session (auto.md startup sweep checks this; fails loud if missing).

## Manually triggering the amended path

Two entry points, both land on the same POST guardrail:

### Entry 1 — `/cockpit:review --gate implementation-review`

```
/cockpit:review --gate implementation-review
```

Runs the D.3 subagent, presents G.2, and on `request-changes` executes the amended step 5 (anchor validation → POST → postcondition).

### Entry 2 — `/cockpit:auto <epic-ref>` on a live implementation-review

```
/cockpit:auto owner/repo#123
```

When any child PR enters `waiting-for:implementation-review`, D.3 dispatches → G.2 fires → on `request-changes` the amended contract runs.

## What to watch on the PR

**Before the fix (broken behavior)** — one COMMENTED review with a body listing findings and `reviewThreads(first:30)` empty:

```graphql
query { repository(owner:"o", name:"r") { pullRequest(number:14) {
  reviews(first:5) { nodes { state body createdAt } }
  reviewThreads(first:30) { nodes { id isResolved path line } }
}}}
```

**After the fix (expected behavior)** — the same `reviews.nodes[]` COMMENTED review, but now `reviewThreads.nodes[]` has one entry per anchored finding, each `isResolved: false`, with `path`/`line` matching what the analyzer emitted.

## What to watch in the session ledger

The run's `.generacy/cockpit/auto-runs/<slug>-<timestamp>.ledger` should show:

**Happy path (single line)**:
```
owner/repo#123 · waiting-for:implementation-review · review-analysis+request-changes · posted (3 inline, 0 in body)
owner/repo#123 · waiting-for:implementation-review · postcondition-passed · leg1=3/3 · leg2=3/3
```

**Retry recovered (three lines)**:
```
owner/repo#123 · waiting-for:implementation-review · postcondition-failed · attempt=1 · leg1=3/3 · leg2=0/3
owner/repo#123 · waiting-for:implementation-review · review-post-retry · attempt=1 · backoff=2s
owner/repo#123 · waiting-for:implementation-review · postcondition-passed · leg1=3/3 · leg2=3/3
```

**Retry did not help (four lines, gate re-fires)**:
```
owner/repo#123 · waiting-for:implementation-review · postcondition-failed · attempt=1 · leg1=3/3 · leg2=0/3
owner/repo#123 · waiting-for:implementation-review · review-post-retry · attempt=1 · backoff=2s
owner/repo#123 · waiting-for:implementation-review · postcondition-failed · attempt=2 · leg1=3/3 · leg2=0/3 · re-present-gate
owner/repo#123 · waiting-for:implementation-review · review-analysis+<operator-verdict> · <outcome>
```

## Common issues

**Leg 1 mismatch (`leg1=2/3`)** — one of the three findings was dropped by GitHub. Most likely a pre-validator off-by-one on hunk-end. Inspect the POST response's `comments[]` and compare `path:line` against the bundle you posted.

**Leg 2 mismatch with leg 1 passing (`leg1=3/3 · leg2=0/3`)** — the snappoll failure shape. The POST accepted three comments but the threads are invisible to GraphQL. Most likely cause: a client library's silent flattening of `comments[]` into `body`, or a stale `event` value. Should NEVER happen after this fix — if it does, the guardrail is being bypassed.

**"Feedback posted:" line missing** — good, that's the guardrail working. The success line is emitted only after both legs pass. Absence means either the postcondition failed (check the retry/re-present lines above) or the operator selected `abort`/`approve` from the re-presented gate.

**Anchor-less findings not appearing in the review body** — the analyzer returned no findings with `line: null` and no findings outside the diff hunks. The `<!-- generacy-cockpit:unanchored-findings -->` marker is only emitted when at least one unanchored finding exists.

## Verifying re-review skip (later — out of scope for this branch)

After a fix-loop iteration, entering `waiting-for:implementation-review` again should skip re-verification of any finding whose thread was resolved by the previous re-review step. Query `reviewThread.isResolved` per finding to check. If the fix-loop agent resolved threads itself, that's a contract violation — file a bug.
