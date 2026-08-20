# Clarifications

## Batch 1 — 2026-08-20T23:24:01Z

### Q1: Final-approval gate shape
**Context**: FR-004/US3 repurpose the post-validate `waiting-for:implementation-review` gate (today D.3, which spawns a reviewer subagent and offers `approve`/`request-changes`/`abort`) into a final human-approval gate feeding merge. Because the engine already ran the review, the gate no longer has a fresh verdict to render, and the non-approve outcomes need redefining.
**Question**: What options does the slimmed final-approval gate present, what does a non-approve answer do, and does the gate render the engine's verdict/findings?
**Options** (if applicable):
- A: Two options — `approve` → cockpit merge path; `hold`/`reject` → no-op (label stays, re-fires later). Render remaining findings parsed from the gate body if present.
- B: `approve` → merge; `request-changes` → resume the issue into engine remediation (like the remediation-limit gate); no reviewer subagent. Render findings from the gate body.
- C: Single `approve` action only (mechanical hand-off to merge); rejection handled by the human editing labels/PR directly. No findings rendered.

**Answer**: *Pending*

### Q2: remediation-limit resume mechanism
**Context**: FR-003/US2 add `waiting-for:remediation-limit` as a fused human gate whose answer "resumes the issue into remediation via the engine gate path." The exact gate options and the resume tool call are unspecified, and getting them wrong strands the loop.
**Question**: What are the gate options for `waiting-for:remediation-limit`, and which MCP tool + argument resumes remediation (e.g. `cockpit_advance(gate="remediation-limit")` vs `cockpit_resume(...)`)?
**Options** (if applicable):
- A: Options `resume remediation` / `stop` — `resume` calls `cockpit_advance(issue=<ref>, gate="remediation-limit")` (mirrors D.4's advance), which resets the engine's remediation counter server-side.
- B: Options `resume remediation` / `skip (session mute)` / `stop (exit auto)` — `resume` calls `cockpit_resume(...)`; the other two mirror the D.6 escalation-gate verdicts.

**Answer**: *Pending*

### Q3: Version-skew detection and degradation
**Context**: FR-008/US5 require the slimmed playbook to declare the minimum generacy package version it needs and "degrade gracefully" below it, in both skew directions (old-engine + new-auto, new-engine + old-auto). Neither the detection mechanism nor the concrete degraded behavior is specified.
**Question**: How does `auto` detect the running engine/package version, and what does "degrade gracefully" mean concretely when the version is below the documented minimum?
**Options** (if applicable):
- A: Probe version via an existing MCP surface (e.g. a field on `cockpit_status`/pre-flight capability probe); below minimum, abort the run at pre-flight with a visible operator error naming the required version.
- B: Probe as in A; below minimum, print a warning and continue, treating unknown new gates (`remediation-limit`, moved `implementation-review`) as ledger-only no-ops rather than mis-driving them.
- C: No runtime probe — document the minimum version in the playbook prose only; rely on the engine emitting/omitting the new gate labels so old/new combinations are inert by construction.

**Answer**: *Pending*

### Q4: Fate of the D.6 red-checks fixer
**Context**: FR-001 lists D.6 (the `completed:validate` red → bounded `cockpit-fixer` path) among the dispatch to remove, alongside D.3 and G.2. But D.6 is a merge-time concern (turning failing CI green), which is arguably distinct from the review→remediate rounds the engine now owns. If it is removed, something must handle post-validate red checks.
**Question**: Should the D.6 bounded-fixer path be removed entirely (engine owns red-check remediation), or retained as a merge-time concern separate from review rounds — and if removed, what handles `completed:validate` red?
**Options** (if applicable):
- A: Remove D.6's fixer dispatch entirely; the engine's remediate loop now covers red validate checks, so `completed:validate` red becomes ledger-only / re-fires as an engine gate.
- B: Retain D.6 unchanged — it is a merge-time CI-fix concern, not a review round; only D.3/G.2 review-verdict dispatch is removed.
- C: Retain D.6 but strip only the escalation gate, keeping the single autonomous fixer attempt before deferring red back to the engine.

**Answer**: *Pending*

### Q5: D.9/D.9a — retain ledger rows or delete
**Context**: FR-006 (P2) says the D.9 (`waiting-for:address-pr-feedback`) and D.9a (`waiting-for:pr-feedback`) paths "become ledger-only or removed per engine ownership." As implemented today these rows are already ledger-only (no fixer, no gate), so the premise is largely satisfied and the remaining decision is retain-vs-delete.
**Question**: Should the D.9/D.9a dispatch rows be kept as ledger-only entries, or deleted from the playbook entirely?
**Options** (if applicable):
- A: Keep them as ledger-only rows (unchanged) so the events remain visibly accounted for in the ledger and playbook-verification pins.
- B: Delete the D.9/D.9a rows entirely; the engine owns these labels and `auto` need not enumerate them.

**Answer**: *Pending*
