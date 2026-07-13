# Clarifications: #394

## Batch 1 — 2026-07-09

### Q1: Liveness threshold value + poll semantics
**Context**: FR-004 requires the N-poll-interval threshold to be pinned verbatim in prose, and Assumptions says N should match "the poll-interval semantics already implicit in step 4's poll cadence." Step 4 today is event-driven and has no explicit poll cadence — the loop blocks on the next event line. Detecting "no event consumed for N poll intervals" requires either a time-bounded read (with a concrete timeout) or a wake-up timer, plus a concrete N. Implementation cannot proceed without both the unit (wall-clock vs. bounded reads) and the number.
**Question**: How should the liveness threshold be pinned in the amended step 5?
**Options**:
- A: Wall-clock threshold — a specific number of seconds since the last consumed line (please specify: 30s, 60s, or 120s)
- B: Bounded-read count — step 4 gains a per-iteration read timeout (e.g., 30s), and the cross-check fires after N consecutive empty returns (please specify N: 2, 3, or 5)
- C: Elapsed-time check at each dispatch — no timer added; the cross-check runs opportunistically whenever the loop wakes for any reason, using a fixed elapsed-time threshold (please specify seconds)

**Answer**: B — 30s per-iteration read timeout, cross-check after N=4 consecutive empty reads (~2 minutes of silence). The 30s bound mirrors the watcher's own poll cadence, and 2 minutes is far above normal event latency while costing nothing on false positives (recovery is idempotent). Two constraints worth restating in the amendment: the cross-check stays **compound** — silence alone is normal during long implement stretches; it fires only on silence *plus* actionable states in `cockpit status --json` — and the status call happens only at the threshold, not on every empty read. C is disqualified by the live incident itself: a broken reader generates no wake-ups, so an opportunistic check that runs "whenever the loop wakes for any reason" never runs at all — permanent blindness is precisely what we observed.

### Q2: "Non-empty line" definition
**Context**: The rule "every non-empty line is an event" must survive real stream shapes. Partial writes from `cockpit watch` can produce whitespace-only lines, trailing newlines from buffered flushes, or (rarely) truncated JSON. The spec forbids content-based filters, but a bare byte-length check may deliver noise the step 4a re-check has to swallow.
**Question**: How should "non-empty line" be defined operationally at the read boundary?
**Options**:
- A: Strict — any character sequence between newlines with byte length > 0 is an event; no trimming; step 4a absorbs any noise
- B: Trim whitespace, then non-empty — whitespace-only lines are skipped; everything else (including malformed JSON) is consumed as an event
- C: Byte-length > 0 AND at least one non-whitespace character AND starts with `{` — parseable-JSON heuristic (note: this is a content-shape filter and likely violates the spec's own rule, but flagging for explicit rejection or acceptance)

**Answer**: B — trim, then non-empty. Skipping whitespace-only lines is line-framing hygiene, not a content filter (they carry no information); everything else, **including malformed/truncated JSON, is consumed as an event** — an unparseable line still signals "something happened" and triggers the step-4a live-state re-check, which absorbs it safely. C is a shape filter and fails its own spec: a truncated flush would be dropped silently, which is under-delivery — the failure class this fix exists to kill.

### Q3: FR-007 regression test location
**Context**: FR-007 defines a behavioral regression per the "S6/S9 verification pattern" but leaves the exact file location to the PR description (US4 AC3). Implementation needs a concrete home for the fixtures and assertions. S6/S9 are prior cockpit findings whose regressions live somewhere in the plugin tree, but the spec doesn't name the path.
**Question**: Where should the FR-007 fixtures and behavioral assertions live?
**Options**:
- A: New standalone file colocated with `auto.md` (e.g., `packages/claude-plugin-cockpit/commands/auto.regression.md` or `packages/claude-plugin-cockpit/tests/auto.regression.md`) — creates the pattern if S6/S9 didn't
- B: Append to an existing S6/S9 regression file — please name the path
- C: New fixture file under `packages/claude-plugin-cockpit/tests/fixtures/` + a new test entry in the existing playbook-verification suite (please name the suite file)

**Answer**: C, with the suite located at plan time — fixtures under `packages/claude-plugin-cockpit/tests/fixtures/`, assertions added to the existing playbook-verification suite where the #388/#390 checks live (those fixes shipped with static + behavioral verification, so the home exists — name it in plan.md rather than guessing here). Only if it's genuinely absent, create a new suite file alongside the plugin's existing test layout. A standalone `.md` regression file (option A) isn't executable verification.

### Q4: Liveness cross-check and "no new recovery machinery"
**Context**: FR-005 states "no new recovery machinery is introduced" — recovery reuses the reader re-arm (from step 5's process-death path) plus step 3 (startup sweep). But FR-004 requires detecting "no event has been consumed for N poll intervals," which the current event-driven step-4 loop cannot observe without adding some form of timer or bounded-read machinery. This appears to conflict with FR-005 unless "recovery machinery" excludes the *detection* machinery.
**Question**: Is adding a time-bound or wake-up mechanism to step 4 (needed to detect the "no events for N intervals" condition) in scope for this fix, or must the detection reuse only existing mechanisms?
**Options**:
- A: In scope — step 4's read loop MAY gain a bounded read timeout or wake-up timer; FR-005's "no new recovery machinery" applies only to the *recovery* path (re-arm + step 3), not to the detection path
- B: Out of scope — the detection must reuse existing signals only (e.g., checked on every ledger write or every re-arm attempt); the cross-check fires only when the loop happens to wake for another reason
- C: Explicitly out of scope for step 4 but a minimal timer counts as part of the cross-check itself — pinned to the same N value from Q1

**Answer**: A — detection machinery is in scope; FR-005's "no new recovery machinery" constrains the *recovery* path only, which stays exactly re-arm (step 5) + startup sweep (step 3). The apparent conflict dissolves once stated plainly: a dead reader cannot event-drive its own diagnosis, so *some* clock is a hard requirement of FR-004 — that clock is Q1-B's bounded read, and it is the only new mechanism admitted. B's "check when the loop wakes for another reason" is formally the observed bug.
