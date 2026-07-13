# Quickstart: Verification runbook

**Feature**: See [spec.md](./spec.md)
**Plan**: See [plan.md](./plan.md)
**Date**: 2026-07-13

This runbook is the verification checklist for the implementation. It combines static greps (necessary but not sufficient — the #384–#400 arc proved static-only fails at behavioral drift), the Vitest suite (four playbook-verification assertions + fixture reads), and the operator smoke-test (the true verifier — three end-to-end scenarios from spec § Success criteria).

## Prerequisites

- generacy-ai/generacy#935 has landed on the generacy `develop` branch (or the version this cluster consumes). The three primitives are available:
  - `cockpit_scope_add` MCP tool
  - `initial: true` flag on `issue-transition` events emitted by `cockpit_await_events`
  - `cockpit_status` reports terminal disposition per ref (`completed | not-planned | non-terminal`)
  - `cockpit_queue(issue=<ref>)` issue-form accepted
- This feature's branch (`416-operator-requested-capability`) contains the playbook edits + `lib/intent-recognition.ts` + fixture files + `tests/playbook-verification.test.ts` extension.

## Static checks (necessary but not sufficient)

Run these greps from the repository root. Every one must produce the expected output (present or absent as noted).

### Positive anchors (must be present)

```bash
# Invocation forms
grep -n -- "--tracking <issue-ref>" packages/claude-plugin-cockpit/commands/auto.md
grep -n -- '--new "<title>"' packages/claude-plugin-cockpit/commands/auto.md

# Add-issue flow subsection
grep -n "^## Add-issue flow (mid-run)" packages/claude-plugin-cockpit/commands/auto.md

# G.6 filing gate options
grep -n "Approve & file (Recommended)" packages/claude-plugin-cockpit/commands/auto.md
grep -n "Skip (don't file)" packages/claude-plugin-cockpit/commands/auto.md

# G.7 scope-drained gate options + Keep watching default (Q4 anchor)
grep -n "Keep watching (Recommended)" packages/claude-plugin-cockpit/commands/auto.md
grep -n "Add more work" packages/claude-plugin-cockpit/commands/auto.md
grep -n "Finish (close tracking issue + summary)" packages/claude-plugin-cockpit/commands/auto.md

# D.8 ad-hoc enumeration
grep -n "Open ad-hoc issues in scope (added mid-run):" packages/claude-plugin-cockpit/commands/auto.md
grep -n "Hold — .* open ad-hoc issue(s) in scope (Recommended)" packages/claude-plugin-cockpit/commands/auto.md

# G.6/G.7 gate contract table rows
grep -n "^| G.6 " packages/claude-plugin-cockpit/commands/auto.md
grep -n "^| G.7 " packages/claude-plugin-cockpit/commands/auto.md

# Ledger action-outcome vocabulary
grep -n "scope-add" packages/claude-plugin-cockpit/commands/auto.md
grep -n "filing-gate+scope-add" packages/claude-plugin-cockpit/commands/auto.md
grep -n "scope-drained-gate" packages/claude-plugin-cockpit/commands/auto.md

# L.6 summary extension
grep -n "^Scope growth:" packages/claude-plugin-cockpit/commands/auto.md
grep -n "^Per-ref disposition:" packages/claude-plugin-cockpit/commands/auto.md

# Initial-flagged event dispatch sentence (Q5 anchor)
grep -n "Initial-flagged events" packages/claude-plugin-cockpit/commands/auto.md

# Library module
test -f packages/claude-plugin-cockpit/lib/intent-recognition.ts && echo "intent-recognition.ts exists"
grep -n "^export function parseAddExistingIntent" packages/claude-plugin-cockpit/lib/intent-recognition.ts
grep -n "^export function parseFileNewIntent" packages/claude-plugin-cockpit/lib/intent-recognition.ts
```

### Negative anchors (must be absent)

```bash
# No new dispatch row (Q5 anchor — first-sight dispatches through existing table)
grep -n "^| D.12 " packages/claude-plugin-cockpit/commands/auto.md && echo "FAIL: D.12 row present" || echo "OK: no D.12 row"

# No new invariant §10 (pattern: guarantees live in G.6/G.7 contracts, not at invariants surface)
grep -nE "^10\. \*\*" packages/claude-plugin-cockpit/commands/auto.md && echo "FAIL: invariant §10 present" || echo "OK: no invariant §10"

# G.6 must NOT reuse #400's two-option pair verbatim (would be a drift regression)
awk '/^### G.6/,/^### G.7/' packages/claude-plugin-cockpit/commands/auto.md | grep -n "Approve draft (Recommended)" && echo "FAIL: #400 drift in G.6" || echo "OK: G.6 uses new option shape"

# Sibling playbook files untouched — git diff should show zero changes
git diff --stat develop..HEAD -- packages/claude-plugin-cockpit/commands/clarify.md \
                                 packages/claude-plugin-cockpit/commands/merge.md \
                                 packages/claude-plugin-cockpit/commands/queue.md \
                                 packages/claude-plugin-cockpit/commands/review.md \
                                 packages/claude-plugin-cockpit/commands/status.md \
                                 packages/claude-plugin-cockpit/commands/watch.md
# Expect: empty output

# Historical spec directories untouched
git diff --stat develop..HEAD -- specs/384-found-during-cockpit-v1/ \
                                 specs/388-found-during-cockpit-v1/ \
                                 specs/390-found-during-cockpit-v1/ \
                                 specs/394-found-during-cockpit-v1/ \
                                 specs/396-found-during-cockpit-v1/ \
                                 specs/398-found-during-cockpit-v1/ \
                                 specs/400-operator-requested-ux/
# Expect: empty output
```

## Vitest suite (behavioral)

Run the playbook-verification test suite:

```bash
cd packages/claude-plugin-cockpit
pnpm test
```

Expected:
- All existing tests pass (no regression on #394 / #396 / #398 / #400 blocks).
- New `describe("416 — operator-requested capability", …)` block runs and passes four assertions:
  - **416-1** — add-existing intent recognition:
    - `parseAddExistingIntent(fixture "416-add-existing-full-ref.txt")` returns `{ref: "generacy-ai/agency#420"}`.
    - `parseAddExistingIntent(fixture "416-add-existing-shorthand.txt")` returns `{ref: "#420"}`.
    - `parseAddExistingIntent(fixture "416-add-existing-multiple-refs.txt")` returns the first parseable ref.
    - `parseAddExistingIntent(fixture "416-add-existing-nonref-chat.txt")` returns `null`.
  - **416-2** — file-new intent recognition:
    - `parseFileNewIntent(fixture "416-file-new-file-an-issue.txt")` returns `{topic: "the flaky test in module X"}`.
    - `parseFileNewIntent(fixture "416-file-new-open-a-bug.txt")` returns a non-null `{topic}`.
    - `parseFileNewIntent(fixture "416-file-new-create-an-issue.txt")` returns a non-null `{topic}`.
    - `parseFileNewIntent(fixture "416-file-new-ambiguous-look-at.txt")` returns `null`.
  - **416-3** — filing-gate iterative edit shape:
    - Parse fixtures `416-filing-gate-first-draft.md` and `416-filing-gate-revised.md`.
    - Assert both contain the five field labels (`**Title:**`, `**Labels:**`, `**Body:**`, `**Filing target:**`, `**Parent tracking ref:**`).
    - Assert the label sequence is identical in both fixtures (same layout, different content).
  - **416-4** — D.8 ad-hoc enumeration + G.7 defaults:
    - Fixture `416-d8-adhoc-none.md`: does NOT contain the `Open ad-hoc issues in scope (added mid-run):` header; contains `Queue P<next> (<N> issues) (Recommended)`.
    - Fixture `416-d8-adhoc-one.md`: contains the header; contains `Hold — 1 open ad-hoc issue(s) in scope (Recommended)`.
    - Fixture `416-d8-adhoc-two.md`: contains the header; contains `Hold — 2 open ad-hoc issue(s) in scope (Recommended)`; enumerates two `<owner>/<repo>#<n>` refs.
    - Fixture `416-scope-drained-completed-only.md`: contains `Keep watching (Recommended)`; per-ref disposition list is all `completed`.
    - Fixture `416-scope-drained-mixed.md`: contains `Keep watching (Recommended)`; per-ref disposition contains both `completed` and `not-planned`.
    - Fixture `416-scope-drained-not-planned-only.md`: contains `Keep watching (Recommended)`; per-ref disposition is all `not-planned` (Q1 anchor: still terminal per the classifier).

If any assertion fails, do NOT proceed to the operator smoke-test — the presentation-shape drift or parser regression must be fixed first.

## Operator smoke-test (the true verifier)

The three spec § Success criteria scenarios, run end-to-end against real cockpit + generacy engine.

### Scenario 1 — Epic mode: mid-run bug filed via G.6 processed to merge; next D.8 names it

**Setup**: Pick a two-phase speckit-feature epic that is currently in-flight. Start `/cockpit:auto <epic-ref>` in a clean chat session.

**Steps**:
1. Wait until P1 issues are dispatched and at least one is in-flight (any non-terminal state).
2. In the same chat, type an unambiguous file-new intent: `file an issue for the flaky test in <module> and process it`.
3. The session should invoke `parseFileNewIntent`, get a non-null return, spawn the drafter, and present G.6 with a five-field draft.
4. Approve on the first G.6 fire (no edits). The session should call `gh issue create`, capture the new ref, `cockpit_scope_add`, `cockpit_queue`, and write the composite ledger line.
5. The ad-hoc issue enters scope. The engine emits an `initial: true` `issue-transition` event for it, which dispatches through the existing table by carried state (Q5 anchor).
6. Continue the run — the ad-hoc issue is processed through its dispatch table entries (clarification / plan / etc.) and eventually merges.
7. When P1 completes and D.8 fires for P2, **the D.8 presentation MUST enumerate the open ad-hoc issue if it is still in-flight**, OR **NOT enumerate it if it has reached terminal state** (the ad-hoc issue was fully processed to merge, so it should be terminal by then).
8. If the ad-hoc issue was still in-flight at P1 → P2 transition: D.8 shows the "Open ad-hoc issues in scope" block with the ref, recommendation is `Hold`. Verify the operator can select `Queue P2` OR `Hold` OR `Cancel`.

**Success criterion**: the ad-hoc issue was filed mid-run via G.6, processed to merge without restarting the session, and — if still open at phase boundary — was named on the D.8 gate.

### Scenario 2 — Epic-less: 3+ ad-hoc issues to terminal + scope-drained gate

**Setup**: Start `/cockpit:auto --new "Stabilization sweep — 2026-07-13"` in a clean chat session.

**Steps**:
1. The session should draft a tracking-issue title/body from the `--new` argument and present G.6.
2. Approve on the first G.6 fire. The session should call `gh issue create`, capture the new tracking ref, write the ledger header (`Tracking ref: <new-ref> · form: tracking-new`), and enter the main loop.
3. In the same chat, add three ad-hoc issues in sequence:
   - `also process <owner>/<repo>#<existing-ref>` (add-existing intent)
   - `file an issue for <first-topic>` (file-new intent, approve at G.6)
   - `open a bug for <second-topic>` (file-new intent, approve at G.6)
4. Let the loop process all three ad-hoc issues through their dispatch table entries.
5. Two of the three should reach `completed` state (merged PR); one is deliberately closed as `not-planned` (e.g., a duplicate — close via GitHub UI outside the session).
6. When every task-list ref reaches terminal state, the G.7 scope-drained gate fires.
7. Verify the G.7 presentation shows:
   - `Tracking ref: <new-ref>`
   - `Refs processed: 3`
   - Per-ref disposition list: 2 × `completed`, 1 × `not-planned` (Q1 anchor)
   - Session-mute set: `0 ref(s)` (assuming no skips during the run)
   - Options: `Keep watching (Recommended)`, `Add more work`, `Finish (close tracking issue + summary)`
8. Select `Finish`. The session should call `gh issue close <new-ref>`, print the run summary, and exit zero.
9. Verify the run summary contains:
   - `Scope growth: started with 0, added 3, completed 3`
   - `Per-ref disposition:` block with the three refs

**Success criterion**: the stabilization conversation processed 3+ ad-hoc issues to terminal state and exited through the scope-drained gate with an accurate summary.

### Scenario 3 — Isolation across concurrent tabs

**Setup**: Open two concurrent chat sessions in different tabs. In tab A, start `/cockpit:auto --new "Tab A stabilization"`. In tab B (after tab A's tracking issue is created), start `/cockpit:auto --new "Tab B stabilization"`.

**Steps**:
1. Both tabs create distinct tracking issues.
2. In tab A: add one add-existing intent (`also process <owner>/<repo>#<ref-A>`).
3. In tab B: add one add-existing intent (`also process <owner>/<repo>#<ref-B>`) — a DIFFERENT ref.
4. Let both tabs process their ad-hoc issues in parallel.
5. When both drain, verify each tab's G.7 gate and run summary reference ONLY the refs added in that tab.
6. Verify each tab's ledger file references ONLY the refs added in that tab (no cross-references).

**Success criterion**: neither session's ledger references the other's refs; isolation observed end-to-end.

## Troubleshooting

- **`parseAddExistingIntent` returns `null` unexpectedly**: check whether the input contains a parseable ref. Full form (`<owner>/<repo>#<n>`) or shorthand (`#<n>`) are the accepted shapes; other formats (e.g., URL, PR number) are not. See [contracts/intent-recognition.md](./contracts/intent-recognition.md) for the exact accepted shapes.
- **`parseFileNewIntent` returns `null` unexpectedly**: check whether the phrasing matches one of the canonical trigger patterns (`file an issue`, `open a bug`, `create an issue`, `raise an issue`, `report an issue`). Ambiguous phrasings (`look at X`, `check X out`) are intentionally rejected. See [contracts/intent-recognition.md](./contracts/intent-recognition.md).
- **G.6 does NOT re-present after `Make changes`**: check that the operator's follow-up turn contained any content — zero-directive `Make changes` is a no-op re-present (Q4=A pattern from #400), not implicit-approve.
- **G.7 fires prematurely** (some refs still non-terminal): check `cockpit_status`'s classifier — the playbook does not re-derive terminality (Q1 anchor). If the classifier is misclassifying a ref, that's a generacy-side bug, not a playbook bug.
- **G.7 does NOT fire when it should**: same — check `cockpit_status` returns `completed | not-planned` for every task-list ref.
- **D.8 does NOT enumerate open ad-hoc issues**: check the ledger for `scope-add` or `filing-gate+scope-add` action lines. If the lines exist, check `openAdHocIssues` helper's `cockpit_status` calls — a failure there may produce a partial or empty list (see the failure-mode in [contracts/phase-queue-adhoc-enumeration.md](./contracts/phase-queue-adhoc-enumeration.md)).
- **`gh issue create` fails under G.6**: standard `gh` error handling applies. Check `gh auth status` and repo write permissions.
- **`cockpit_scope_add` is unavailable**: generacy#935 has NOT landed on the cluster. Update the cluster to a version that includes #935, then retry.
- **Concurrent tabs cross-reference each other's refs**: this is either (a) both tabs used the same tracking ref (isolation broken by user error — start with distinct `--new` or `--tracking` invocations), OR (b) the engine's per-ref event bus (generacy#935) is not correctly isolating. (a) is a user issue; (b) is a generacy-side bug.

## Related documents

- [plan.md](./plan.md) — implementation plan with technical context, project structure, and design decisions.
- [research.md](./research.md) — Phase 0 design decisions with alternatives-rejected.
- [data-model.md](./data-model.md) — types + validation rules + pre/post surface changes.
- [contracts/](./contracts/) — seven contract files for the discrete pieces of the fix.
