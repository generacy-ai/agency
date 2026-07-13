# Quickstart: Unfiltered stream consumption + liveness cross-check for `/cockpit:auto`

**Feature**: 394-found-during-cockpit-v1

This runbook shows how to (i) understand the change, (ii) verify the change locally with static and behavioral checks, and (iii) troubleshoot the most likely regression patterns.

---

## What changed

`packages/claude-plugin-cockpit/commands/auto.md` was amended on three surfaces to close the T-S4 silent-outage class:

- **Step 4 (Main loop)** — pins the consumption recipe: unfiltered read of every non-empty line (whitespace-trimmed); prohibition on content-based / JSON-field filters, with the T-S4 anti-pattern (`tail -n 0 -f <watch-output> | grep --line-buffered '"type"'`) named exactly once; sanctioned `.+` / newline-delimited-read pattern for harness stream-monitor primitives; 30-second per-iteration bounded read as the sole new detection mechanism.
- **Step 5 (Watch re-arm)** — adds a "Liveness cross-check" sub-step that fires on the conjunction of (alive process, N=4 consecutive empty reads, actionable live state via `cockpit status --json`); the `cockpit status --json` call runs only at the threshold; recovery is exactly re-arm + step 3 (startup sweep) — no new recovery machinery.
- **Invariants** — adds invariant §7 "Stream consumption is unfiltered." codifying the rule at the invariants-list surface adjacent to §1 "Never merge on red".

A new executable regression suite ships alongside the playbook edit:

- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — Vitest suite with the two 394 assertions (SC-002 mixed-stream reaches dispatch; SC-005 liveness cross-check fires).
- `packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson` — fixture with both event shapes.
- `packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json` — fixture `cockpit status --json` payload with an actionable issue.

Before (pre-394):
```
step 4: "For each event line from the watcher: (a) re-check … (b) dispatch … (c) ledger."
        no consumption mechanism prescribed
        → session improvises tail | grep '"type"' filter
        → legacy per-issue events (no `type` field) silently dropped
        → session dispatches 0 events for minutes; operator intervenes
```

After (post-394):
```
step 4:  read unfiltered, trim-then-nonempty, 30s bounded, sanctioned `.+`
         → every event reaches step 4a re-check
         → schema heterogeneity accommodated by construction
step 5:  liveness cross-check on compound trigger → re-arm + step 3
         → broken consumer detected by the loop itself, recovery is idempotent
inv §7:  "Stream consumption is unfiltered" — greppable at the invariants surface
```

Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) are byte-identical on this branch. Historical spec directories are byte-identical.

---

## Installation

No installation step. The change is a documentation edit inside the `claude-plugin-cockpit` package + a new test directory. To pick up the change, install/link the package and run the suite:

```bash
cd /workspaces/agency
pnpm install
pnpm --filter @generacy-ai/claude-plugin-cockpit build   # if the package has a build step
pnpm --filter @generacy-ai/claude-plugin-cockpit test    # runs the new Vitest suite
```

If the plugin is already installed in your Claude Code session, restart the session (or re-source your plugin config) so the updated `auto.md` is loaded.

---

## Usage — no operator-facing change

The command shape is unchanged:

```bash
/cockpit:auto <owner>/<repo>#<n>
```

What changes is what happens **inside** the main loop: the read is now unfiltered, the reader wakes every 30s, and a compound liveness cross-check catches broken-consumer states after ~2 minutes of silence + actionable state. The visible operator experience — startup sweep → per-event dispatch → phase-queue gates → exit on `epic-complete` — is unchanged.

---

## Verification — static checks

Run these greps against the target file:

```bash
AUTO=packages/claude-plugin-cockpit/commands/auto.md

# C.1 / SC-003: step 4 contains "unfiltered" phrasing
grep -n "unfiltered" "$AUTO"
# Expected: >= 1 match, located in step 4 prose.

# C.2 / SC-003: anti-pattern name present exactly once, in prohibition context
grep -c "grep --line-buffered '\"type\"'" "$AUTO"
# Expected: exactly 1.
# Manually confirm the surrounding paragraph frames it as prohibited
# (search for "prohibited" / "forbidden" / "never" / "anti-pattern" nearby).

# C.3 / FR-003 / US2 AC3: sanctioned pattern present
grep -nE '\.\+|newline-delimited' "$AUTO"
# Expected: >= 1 match co-located with the "unfiltered" phrasing in step 4.

# C.4 / FR-004: 30-second bounded-read directive
grep -nE "30 second|30s" "$AUTO"
# Expected: >= 1 match in step 4 prose (before the sub-steps).

# C.5 / FR-001 / US1 AC2: schema-heterogeneity rationale inline
grep -c "ts.*repo.*kind.*number.*event.*labels" "$AUTO"
# Expected: >= 1 (the legacy envelope shape is named).
grep -nE "phase-complete|epic-complete" "$AUTO" | head -10
# Expected: matches naming the S8 synthetic aggregates in step 4 (may also
# appear elsewhere in the file — the step 4 reference is what matters).

# C.6 / SC-006 / FR-009: invariant §7 present verbatim
grep -c "Stream consumption is unfiltered" "$AUTO"
# Expected: exactly 1 (in the ## Invariants section).

# C.7 / SC-004 / FR-004 / US3 AC1: Liveness cross-check heading in step 5
grep -n "Liveness cross-check" "$AUTO"
# Expected: >= 1 match in step 5.

# C.8 / US3 AC4: N=4 threshold verbatim
grep -nE "N=4|four consecutive|4 consecutive" "$AUTO"
# Expected: >= 1 match in step 5.

# C.9 / FR-005 / US3 AC2: recovery path stated
grep -nE "re-arm.*step 3|startup sweep" "$AUTO" | head -5
# Manually confirm one occurrence is inside the Liveness cross-check paragraph.

# C.10 / US3 AC3: mechanism-gap defense-in-depth framing
grep -nE "mechanism-gap|defense-in-depth" "$AUTO"
# Expected: >= 1 match in step 5's Liveness cross-check paragraph.

# C.11 / SC-009: § Ledger section byte-identical or consistency-only
git diff origin/develop -- "$AUTO" | grep -A2 -B2 "^## Ledger" | head -50
# Manual read: any lines in the diff within the § Ledger scope must be
# consistency-only edits (references to step 4 that need re-wording for
# consistency); no new rows, no new outcome vocabulary, no new format sentence.

# C.16 / FR-008 / SC-008: sibling playbooks unchanged
git diff origin/develop -- \
  packages/claude-plugin-cockpit/commands/clarify.md \
  packages/claude-plugin-cockpit/commands/review.md \
  packages/claude-plugin-cockpit/commands/merge.md \
  packages/claude-plugin-cockpit/commands/queue.md \
  packages/claude-plugin-cockpit/commands/watch.md \
  packages/claude-plugin-cockpit/commands/status.md
# Expected: empty (no changes).

# C.17: historical spec directories unchanged
git diff origin/develop -- \
  specs/372-epic-generacy-ai-tetrad \
  specs/384-found-during-cockpit-v1 \
  specs/388-found-during-cockpit-v1 \
  specs/390-found-during-cockpit-v1
# Expected: empty (no changes).

# C.18 / SC-007: no third prompt-strengthening round
git diff origin/develop -- "$AUTO" | grep -E "^\+.*\b(MUST|SHALL|MAY NOT)\b" \
  | grep -v "Stream consumption is unfiltered"
# Manual read: any added MUST/SHALL/MAY NOT line should be part of the
# step 4 recipe, invariant §7, or step 5 cross-check. No adjacent hedges,
# no new checklists, no new terminal-outcome extensions.
```

---

## Verification — behavioral check (Vitest suite)

Per SC-002 and SC-005, run the new suite:

```bash
pnpm --filter @generacy-ai/claude-plugin-cockpit test
```

Expected output: two passing tests in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.

- **Test 1 (SC-002)** — feeds `394-mixed-event-shapes.ndjson` through the reference implementation of the step 4 read loop and asserts every non-whitespace-only line (including malformed JSON) reaches the mock dispatch function, and both event shapes (legacy per-issue envelope + S8 synthetic aggregate) are represented.
- **Test 2 (SC-005)** — feeds an empty stream + a fake alive-process handle + a mock `cockpit status --json` returning `394-actionable-live-state.json` through the reference cross-check function and asserts the recovery function is invoked with `{mode: "startup-sweep"}` after exactly N=4 empty reads.

If either test fails, see § Troubleshooting.

**Note on the reference implementation**: the suite exercises a reference implementation of the rule (see `packages/claude-plugin-cockpit/tests/reference-consumption.ts` or the inline definitions in the suite file). The runtime is a model executing prose; there is no production code to exercise. The reference is a specification of the rule in code that the test can exercise. See [contracts/unfiltered-stream-consumption.md](./contracts/unfiltered-stream-consumption.md) § C.5 for the reference implementation contract.

---

## Verification — replayed live-session evidence (optional but recommended)

Per SC-001, run one long `/cockpit:auto <epic-ref>` session against the T-S4 corpus and confirm:

- The main loop dispatches every streamed event (verify by grep `[ledger]` line counts against the background watch output NDJSON line count — they should match modulo whitespace-only lines).
- If a long implement stretch produces no events, the loop stays quiet (no false-positive cross-check triggers). Expected because the cross-check requires actionable live state.
- If the reader breaks (test by temporarily wedging the harness reader or by artificially returning empty reads for > 2 minutes with an actionable state), the cross-check fires and recovery re-runs step 3 — verify by looking for the startup-sweep ledger lines following the wedge.

**Note on epistemics**: a single passing session is evidence, not proof. Adherence is probabilistic — the pinned recipe removes the class of failure by construction; the liveness cross-check is defense-in-depth; empirical confirmation across a variety of runs is what closes SC-001.

---

## Available commands (unchanged)

- `/cockpit:auto <epic-ref>` — the modified command.
- `/cockpit:watch <epic-ref>` — produces the stream `auto.md` consumes; unchanged.
- `/cockpit:status <epic-ref>` — the authoritative live state; unchanged.
- `/cockpit:review`, `/cockpit:clarify`, `/cockpit:merge`, `/cockpit:queue` — unchanged.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Vitest Test 1 fails: "expected N dispatches, got M (M < N)" | The reference implementation drops lines by a content-shape heuristic (e.g., `line.startsWith('{')`, JSON.parse guard) | Confirm the reference implementation only trims whitespace and dispatches every non-empty result. See contract C.5 in `contracts/unfiltered-stream-consumption.md`. AP-1 / AP-5 recurrence. |
| Vitest Test 1 fails: "both event shapes must be represented" | Fixture missing one shape, OR reference implementation filters on `type` | (a) Verify `394-mixed-event-shapes.ndjson` contains ≥1 legacy per-issue envelope AND ≥1 S8 synthetic aggregate. (b) Confirm the reference implementation has no `line.includes('"type"')` filter. AP-1 recurrence. |
| Vitest Test 2 fails: "recovery not called" after 4 empty reads | Cross-check requires an additional condition beyond compound trigger, OR the fixture status payload has no D.1–D.9 issue | Verify `394-actionable-live-state.json` contains ≥1 issue in a D.1–D.9 transition class. Confirm the reference cross-check function fires on the conjunction of the three preconditions. AP-6 / AP-7 recurrence. |
| Vitest Test 2 fails: "recovery called too early (< N=4 empty reads)" | Threshold is not N=4 in the reference implementation | Correct the threshold constant in the reference implementation to `4`. This constant should match the N=4 stated verbatim in step 5 prose (C.8). |
| Static grep for "unfiltered" returns 0 matches | Step 4 prose amendment not applied | Re-apply the step 4 prose per contract C.1 (see `contracts/unfiltered-stream-consumption.md`). AP-1 recurrence. |
| Static grep for T-S4 anti-pattern returns 0 or ≥2 matches | Anti-pattern not named, OR named more than once (e.g., mentioned again in an example) | Contract C.1 requires exactly 1. Consolidate to a single named occurrence in a prohibition context. AP-2 recurrence. |
| Static grep for T-S4 anti-pattern returns 1, but the paragraph frames it as an "example" or "historical anecdote" without a clear prohibition | Prose lacks the prohibition framing | Rewrite the paragraph to explicitly forbid the pattern ("prohibited", "must not", "anti-pattern"). AP-2 recurrence. |
| Static grep for "Stream consumption is unfiltered" returns 0 or the invariants list has no §7 | Invariant §7 not added, OR added outside the `## Invariants` section | Add §7 to the numbered invariants list per contract C.3. AP-9 recurrence. |
| Static grep for "Liveness cross-check" returns 0 | Step 5 sub-step not added | Add the sub-step per contract C.2. AP-6 / AP-7 / AP-8 recurrence. |
| Static grep for "30 seconds" or "30s" returns 0 | Bounded-read directive missing | Add the 30s directive to step 4 per contract C.1 point 6. AP-4 recurrence. |
| Static grep for "N=4" returns 0 | Threshold not pinned in prose | Add the N=4 threshold verbatim to step 5's cross-check paragraph per contract C.2 point 2b. AP-6 recurrence. |
| `git diff origin/develop -- packages/claude-plugin-cockpit/commands/{clarify,review,merge,queue,watch,status}.md` non-empty | Sibling playbook modified on this branch | `git checkout origin/develop -- packages/claude-plugin-cockpit/commands/<sibling>.md` and re-verify empty diff. AP-12 recurrence. |
| `git diff origin/develop -- specs/{372,384,388,390}-…` non-empty | Historical spec modified on this branch | Restore from `origin/develop` and re-verify empty diff. AP-13 recurrence. |
| § Ledger section has new rows or new outcome vocabulary in the diff | § Ledger surface changed beyond consistency edits | Revert non-consistency edits per contract C.10 / SC-009. AP-14 recurrence. |
| Diff review shows new "MUST" or "SHALL" lines outside the three named surfaces | Third prompt-strengthening round added | Remove the adjacent hedges. Contract C.11 / SC-007 permits only the one rule + one invariant + one cross-check + one regression. AP-15 recurrence. |
| Live session dispatched every event, but a long silence (>2 min) triggered a false-positive cross-check | Cross-check is firing on silence alone (missing the compound predicate) | Confirm the reference implementation and the step 5 prose gate the cross-check on `status_json` reporting a D.1–D.9 issue. AP-6 recurrence. |
| Live session had a broken reader and the cross-check never fired | Cross-check gated on wake-up rather than the 30s bounded read counter | Confirm step 4's 30s bounded read is what increments the empty-read counter, not an external wake-up signal. AP-6 / Q1=A rejection recurrence. |

---

## Related documents

- [spec.md](./spec.md) — the specification.
- [clarifications.md](./clarifications.md) — Q1–Q4 with resolved answers.
- [plan.md](./plan.md) — implementation plan (this feature's plan).
- [research.md](./research.md) — design decisions and rationale.
- [data-model.md](./data-model.md) — pre/post playbook layout and contract invariants.
- [contracts/unfiltered-stream-consumption.md](./contracts/unfiltered-stream-consumption.md) — the structural contract on the three playbook surfaces + the Vitest suite.

Prior features in the same instruction-drift family (out of scope for #394, unchanged on this branch):
- [specs/384-found-during-cockpit-v1/](../384-found-during-cockpit-v1/) — Terminal Outcome Check (positional guarantee at the review gate).
- [specs/388-found-during-cockpit-v1/](../388-found-during-cockpit-v1/) — Fused analysis + `AskUserQuestion` (structural guarantee inside the parent turn at the review gate).
- [specs/390-found-during-cockpit-v1/](../390-found-during-cockpit-v1/) — Subagent isolation of `/code-review` (structural guarantee across the turn boundary at the review gate).

Companion engine finding (out of this repo, out of scope for #394):
- generacy — uniform `type` discriminator on every event line from `cockpit watch`, filed separately in the generacy repo. If shipped, it would make the schema-heterogeneity rationale in step 4's amended prose obsolete; the fix here works against the shape shipped today.
