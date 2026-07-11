# Clarifications

## Batch 1 — 2026-07-11

### Q1: Fallback posture on missing tools
**Context**: FR-006 and Change #5 record a *recommended* posture (fail loud + guidance pointing to cluster-base#75) but explicitly flag this decision for /clarify. The recommendation rules out both a silent CLI fallback and in-playbook branching; it mentions plugin-version-bump gating as an alternative transition mechanism. This is the primary blocker for planning FR-006's implementation.
**Question**: When cockpit_* MCP tools are absent at session start (old cluster, cluster-base#75 not deployed, or registration failed), what is the confirmed posture?
**Options**:
- A: Fail loud at the startup sweep with actionable guidance pointing to cluster-base#75; no CLI fallback; transition period (if any) handled via plugin-version-bump so only clusters carrying registration adopt the migration.
- B: Fail loud at startup sweep with guidance, but no plugin-version-bump gating — the playbook simply ships and clusters without registration hard-fail until they upgrade.
- C: In-playbook branching (dual-path with a temporary CLI fallback for a bounded transition window).
- D: Something else — specify.

**Answer**: *Pending*

### Q2: Cursor persistence location
**Context**: FR-003 requires the `cockpit_await_events` cursor to be persisted in "run state" so it can be passed on the next call, with `invalid-cursor` → fail loud and `resetFrom` → startup sweep. The spec does not name the file, keyspace, or lifecycle owner for that cursor, which planning needs to pick concrete APIs and recovery semantics.
**Question**: Where should the `cockpit_await_events` cursor be persisted, and what is its lifecycle scope?
**Options**:
- A: In the existing epic run-state file used by auto.md (name/path to be surfaced in plan.md); scoped per epic run; cleared on epic-complete.
- B: In a dedicated cursor file (e.g. `.cockpit/cursor.json` or similar); scoped per session; persisted across epic boundaries within a session.
- C: In-memory only for the current dispatch loop, re-derived from the ledger on restart (no on-disk cursor).
- D: Something else — specify path/keyspace and lifecycle.

**Answer**: *Pending*

### Q3: SC-003 baseline transcript pointer
**Context**: SC-003 targets a ≥2× reduction in watch-derived dispatch rounds vs the "snappoll run-7 baseline" on a comparable 12-issue epic. Without a concrete pointer (transcript path, epic ref, or archived measurement) the success criterion is not verifiable at validate-phase.
**Question**: What is the concrete reference for the "snappoll run-7 baseline" that SC-003 measures against?
**Options**:
- A: A specific archived session transcript — provide path or URL (e.g. `docs/baselines/snappoll-run-7.jsonl`, a gist, or a linked issue comment).
- B: A recorded measurement in an existing artifact (e.g. #403's PR body or a decision doc) — cite exact location.
- C: No archived transcript exists yet — capture the baseline as part of this feature's validate phase against a named epic (specify which epic).
- D: Something else — specify.

**Answer**: *Pending*

### Q4: Scope of migrated playbooks beyond auto.md
**Context**: Change #1 says "every `generacy cockpit status|context|queue|advance|resume|merge` invocation in `auto.md`'s D-rows becomes the corresponding MCP tool call"; the Goal says "auto.md (and any cockpit playbook that invokes CLI verbs)." Out of Scope excludes "any non-cockpit playbook or any non-migrated cockpit verb outside status|context|queue|advance|resume|merge" but does not enumerate which cockpit playbooks are in scope beyond auto.md. FR-007 and SC-005 apply to "migrated playbooks" — planning needs the concrete list.
**Question**: Which playbooks are in scope for the migration and audit assertions (FR-007, SC-005)?
**Options**:
- A: Only `auto.md`.
- B: `auto.md` plus every other cockpit playbook in this repo that currently invokes any of the six verbs — enumerate in plan.md by grepping for `generacy cockpit <verb>`.
- C: `auto.md` plus a specific enumerated set — list them.
- D: Something else — specify.

**Answer**: *Pending*

### Q5: How "fail loud" surfaces to the operator
**Context**: FR-006 requires fail-loud with "actionable guidance" when the cockpit MCP tools are absent, but does not specify the surface. Options range from a thrown error propagated to the caller, a specific AskUserQuestion prompt, a written ledger entry, or a printed banner. Planning needs the surface to define the failure boundary and audit hook.
**Question**: What surface should the fail-loud signal use when cockpit_* MCP tools are absent at startup sweep?
**Options**:
- A: A typed error raised from the startup-sweep code path with the guidance string as the message; caller (auto.md operator) sees it as a normal tool-boundary failure.
- B: An AskUserQuestion prompt naming the missing tools and pointing to cluster-base#75, so the operator explicitly acknowledges before aborting.
- C: A structured ledger entry (matching #403's cost contract) plus the typed error, so the failure is captured in the audit trail.
- D: Something else — specify.

**Answer**: *Pending*
