# Clarifications

## Batch 1 — 2026-08-20T23:24:01Z

### Q1: Final-approval gate shape
**Context**: FR-004/US3 repurpose the post-validate `waiting-for:implementation-review` gate (today D.3, which spawns a reviewer subagent and offers `approve`/`request-changes`/`abort`) into a final human-approval gate feeding merge. Because the engine already ran the review, the gate no longer has a fresh verdict to render, and the non-approve outcomes need redefining.
**Question**: What options does the slimmed final-approval gate present, what does a non-approve answer do, and does the gate render the engine's verdict/findings?
**Options** (if applicable):
- A: Two options — `approve` → cockpit merge path; `hold`/`reject` → no-op (label stays, re-fires later). Render remaining findings parsed from the gate body if present.
- B: `approve` → merge; `request-changes` → resume the issue into engine remediation (like the remediation-limit gate); no reviewer subagent. Render findings from the gate body.
- C: Single `approve` action only (mechanical hand-off to merge); rejection handled by the human editing labels/PR directly. No findings rendered.

**Answer**: Option A. Two options: `approve` → cockpit merge path (merge on green, never on red); `hold`/`reject` → no-op — the `waiting-for:implementation-review` label stays and the gate re-fires later (mirrors D.4's `not yet`). The gate renders remaining findings parsed from the gate body if present; it does NOT spawn a fresh reviewer subagent (the engine already ran review/remediate/validate). Rationale: US3/FR-004 scope this gate strictly to "approval routes into the cockpit merge path"; FR-001/SC-002 forbid reviewer/fixer dispatch. Resuming remediation from a terminal post-validate approval gate is out of scope — that resume path is the separate `remediation-limit` gate (Q2).

### Q2: remediation-limit resume mechanism
**Context**: FR-003/US2 add `waiting-for:remediation-limit` as a fused human gate whose answer "resumes the issue into remediation via the engine gate path." The exact gate options and the resume tool call are unspecified, and getting them wrong strands the loop.
**Question**: What are the gate options for `waiting-for:remediation-limit`, and which MCP tool + argument resumes remediation (e.g. `cockpit_advance(gate="remediation-limit")` vs `cockpit_resume(...)`)?
**Options** (if applicable):
- A: Options `resume remediation` / `stop` — `resume` calls `cockpit_advance(issue=<ref>, gate="remediation-limit")` (mirrors D.4's advance), which resets the engine's remediation counter server-side.
- B: Options `resume remediation` / `skip (session mute)` / `stop (exit auto)` — `resume` calls `cockpit_resume(...)`; the other two mirror the D.6 escalation-gate verdicts.

**Answer**: Option A. Options `resume remediation` / `stop`. `resume remediation` calls `cockpit_advance(issue=<ref>, gate="remediation-limit")` (same engine-gate advance pattern as D.4's `cockpit_advance(issue, gate="manual-validation")`), which resets the engine's remediation counter server-side. `stop` exits auto cleanly with no label writes. Rationale: every engine gate in the playbook resolves via `cockpit_advance(issue, gate=<name>)`; `remediation-limit` is a `waiting-for:*` engine gate of the same class. `cockpit_resume` is the wrong verb (process/paused-issue resume, not a labeled-gate answer).

### Q3: Version-skew detection and degradation
**Context**: FR-008/US5 require the slimmed playbook to declare the minimum generacy package version it needs and "degrade gracefully" below it, in both skew directions (old-engine + new-auto, new-engine + old-auto). Neither the detection mechanism nor the concrete degraded behavior is specified.
**Question**: How does `auto` detect the running engine/package version, and what does "degrade gracefully" mean concretely when the version is below the documented minimum?
**Options** (if applicable):
- A: Probe version via an existing MCP surface (e.g. a field on `cockpit_status`/pre-flight capability probe); below minimum, abort the run at pre-flight with a visible operator error naming the required version.
- B: Probe as in A; below minimum, print a warning and continue, treating unknown new gates (`remediation-limit`, moved `implementation-review`) as ledger-only no-ops rather than mis-driving them.
- C: No runtime probe — document the minimum version in the playbook prose only; rely on the engine emitting/omitting the new gate labels so old/new combinations are inert by construction.

**Answer**: Option A. Probe the running engine version at pre-flight via `generacy --version` (alongside the existing `command -v generacy` check), compare against a minimum generacy version documented in the playbook prose, and if below minimum abort the run at pre-flight with a visible operator error naming the required version — mirroring the existing Monitor-absence and `--gates=ui` tool-absence hard-fails. Do not create the ledger dir or start the loop. Rationale: US5 demands graceful (non-silent) degradation; a visible pre-flight abort prevents the old-engine+new-auto silent strand (old engine still expects the client to drive review rounds slimmed-auto no longer drives). `generacy` exposes `.version(VERSION)`, so the probe uses the CLI auto already invokes — no new MCP field needed.

### Q4: Fate of the D.6 red-checks fixer
**Context**: FR-001 lists D.6 (the `completed:validate` red → bounded `cockpit-fixer` path) among the dispatch to remove, alongside D.3 and G.2. But D.6 is a merge-time concern (turning failing CI green), which is arguably distinct from the review→remediate rounds the engine now owns. If it is removed, something must handle post-validate red checks.
**Question**: Should the D.6 bounded-fixer path be removed entirely (engine owns red-check remediation), or retained as a merge-time concern separate from review rounds — and if removed, what handles `completed:validate` red?
**Options** (if applicable):
- A: Remove D.6's fixer dispatch entirely; the engine's remediate loop now covers red validate checks, so `completed:validate` red becomes ledger-only / re-fires as an engine gate.
- B: Retain D.6 unchanged — it is a merge-time CI-fix concern, not a review round; only D.3/G.2 review-verdict dispatch is removed.
- C: Retain D.6 but strip only the escalation gate, keeping the single autonomous fixer attempt before deferring red back to the engine.

**Answer**: Option A. Remove D.6's bounded-fixer/escalation dispatch entirely. The engine's remediate loop (which now owns validate/CI orchestration) covers red validate checks, so `completed:validate` red becomes a ledger-only no-op that re-fires as an engine gate (remediation / remediation-limit) rather than triggering a cluster-side `cockpit-fixer` subagent. Rationale: FR-001 explicitly lists D.6 for removal alongside D.3/G.2; SC-002 requires zero reviewer/fixer dispatch, so retaining even a single autonomous fixer attempt violates it. The epic's Out-of-Scope assigns CI/validate orchestration to the engine (P1–P4), so red validate is now engine-owned; auto reacts to the resulting engine gate instead of driving the fix.

### Q5: D.9/D.9a — retain ledger rows or delete
**Context**: FR-006 (P2) says the D.9 (`waiting-for:address-pr-feedback`) and D.9a (`waiting-for:pr-feedback`) paths "become ledger-only or removed per engine ownership." As implemented today these rows are already ledger-only (no fixer, no gate), so the premise is largely satisfied and the remaining decision is retain-vs-delete.
**Question**: Should the D.9/D.9a dispatch rows be kept as ledger-only entries, or deleted from the playbook entirely?
**Options** (if applicable):
- A: Keep them as ledger-only rows (unchanged) so the events remain visibly accounted for in the ledger and playbook-verification pins.
- B: Delete the D.9/D.9a rows entirely; the engine owns these labels and `auto` need not enumerate them.

**Answer**: Option A. Keep D.9 (`waiting-for:address-pr-feedback`) and D.9a (`waiting-for:pr-feedback`) as ledger-only rows, unchanged. Rationale: FR-006's ledger-only branch is already satisfied (both rows are ledger-line-only, server-side-owned today). Deleting them would strip pins FR-007/US4 forbid weakening, orphan the E3 enriched-line-contract references to D.9/D.9a, and risk pre-migration epics emitting the legacy `waiting-for:pr-feedback` alias falling through to the D.10 unknown-state escalation gate. Keeping them is consistent with sibling ledger-only rows D.9b/D.9c/D.9d.
