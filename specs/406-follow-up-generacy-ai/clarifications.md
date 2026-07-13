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

**Answer**: B — fail loud with guidance, no version-bump gating. A's gating isn't enforceable, so it degrades to B plus ceremony: the plugin version and the cluster-base template version are uncoordinated artifacts — nothing ties "cluster adopted the migrated playbook" to "cluster's entrypoint registers the server" (an existing cluster can't even gain registration via `generacy update`, since entrypoint scripts are baked into the scaffold at creation; only a rebuild picks up cluster-base#75). So the "transition mechanism" A promises can't actually gate anything. Given the current fleet is dev-stage test clusters that rebuild frequently, the simple contract is right: ship it, and a cluster without registration hard-fails at startup with guidance naming the fix. C stays ruled out — the dual-path playbook is the drift factory this suite exists to prevent, and the spec already records that.

### Q2: Cursor persistence location
**Context**: FR-003 requires the `cockpit_await_events` cursor to be persisted in "run state" so it can be passed on the next call, with `invalid-cursor` → fail loud and `resetFrom` → startup sweep. The spec does not name the file, keyspace, or lifecycle owner for that cursor, which planning needs to pick concrete APIs and recovery semantics.
**Question**: Where should the `cockpit_await_events` cursor be persisted, and what is its lifecycle scope?
**Options**:
- A: In the existing epic run-state file used by auto.md (name/path to be surfaced in plan.md); scoped per epic run; cleared on epic-complete.
- B: In a dedicated cursor file (e.g. `.cockpit/cursor.json` or similar); scoped per session; persisted across epic boundaries within a session.
- C: In-memory only for the current dispatch loop, re-derived from the ledger on restart (no on-disk cursor).
- D: Something else — specify path/keyspace and lifecycle.

**Answer**: D — in-memory only for the current loop; a new session starts cursor-less and runs the startup sweep; no on-disk cursor, and explicitly no ledger re-derivation. The cursor's only cross-session value would be replaying events missed while the session was down — but auto.md already has a stronger reconciliation mechanism for exactly that window: the startup sweep reads *live state*, which subsumes anything event replay could tell it (streamed lines are advisory; live state is authoritative — the loop-trust-boundary principle already in the playbook). This also makes recovery uniform: session restart, `resetFrom` signal, and cursor expiry all converge on the same path — sweep, then re-arm cursor-less from connect-time position. A and B add a persistence surface whose payoff is avoiding a sweep the playbook mandates at session start anyway, plus a new stale-state hazard (a file cursor outliving the server's retention guarantees is precisely how you manufacture `resetFrom` churn). C's ledger re-derivation is the worst of both — it rebuilds event position from a human-audit artifact never designed as a wire-protocol checkpoint.

### Q3: SC-003 baseline transcript pointer
**Context**: SC-003 targets a ≥2× reduction in watch-derived dispatch rounds vs the "snappoll run-7 baseline" on a comparable 12-issue epic. Without a concrete pointer (transcript path, epic ref, or archived measurement) the success criterion is not verifiable at validate-phase.
**Question**: What is the concrete reference for the "snappoll run-7 baseline" that SC-003 measures against?
**Options**:
- A: A specific archived session transcript — provide path or URL (e.g. `docs/baselines/snappoll-run-7.jsonl`, a gist, or a linked issue comment).
- B: A recorded measurement in an existing artifact (e.g. #403's PR body or a decision doc) — cite exact location.
- C: No archived transcript exists yet — capture the baseline as part of this feature's validate phase against a named epic (specify which epic).
- D: Something else — specify.

**Answer**: B — the recorded measurement, with the numbers restated in this spec so the criterion is self-contained. The authoritative artifact is the run-7 ledger comment on the smoke-test tracking issue: generacy-ai/tetrad-development#92, comment `issuecomment-4948309408` (2026-07-11). Baseline figures for SC-003: ~100 watch-derived events each consumed as a separate dispatch round, 233 API turns total, final context ~508k tokens, 12-issue epic. The measurement at validate: on a comparable 12-issue epic, count `cockpit_await_events` calls that returned ≥1 event and compare against total events delivered — target is a ≥2× reduction in event-consuming dispatch rounds (≤ ~50 rounds for ~100 events). Copy those numbers into SC-003's text rather than linking alone. A has a practical problem: the raw transcript lives on the snappoll orchestrator container, which is destroyed when the operator rebuilds the test cluster — the recorded measurement is the durable artifact.

### Q4: Scope of migrated playbooks beyond auto.md
**Context**: Change #1 says "every `generacy cockpit status|context|queue|advance|resume|merge` invocation in `auto.md`'s D-rows becomes the corresponding MCP tool call"; the Goal says "auto.md (and any cockpit playbook that invokes CLI verbs)." Out of Scope excludes "any non-cockpit playbook or any non-migrated cockpit verb outside status|context|queue|advance|resume|merge" but does not enumerate which cockpit playbooks are in scope beyond auto.md. FR-007 and SC-005 apply to "migrated playbooks" — planning needs the concrete list.
**Question**: Which playbooks are in scope for the migration and audit assertions (FR-007, SC-005)?
**Options**:
- A: Only `auto.md`.
- B: `auto.md` plus every other cockpit playbook in this repo that currently invokes any of the six verbs — enumerate in plan.md by grepping for `generacy cockpit <verb>`.
- C: `auto.md` plus a specific enumerated set — list them.
- D: Something else — specify.

**Answer**: B — auto.md plus every cockpit playbook that invokes any of the six verbs, enumerated in plan.md by grep. Expected result of that grep, for planning's benefit: `clarify.md` (context, advance), `review.md` (context, advance), `merge.md` (merge), `queue.md` (queue), `status.md` (status) — with `watch.md` explicitly *not* migrated (its verb isn't among the six; the NDJSON stream remains the human/script surface per generacy#917's out-of-scope). The decisive argument against A: leaving the manual playbooks on the CLI means one plugin carrying two invocation idioms *and* two audit suites indefinitely (the `--help`-snapshot drift audit for the stragglers alongside the new tool-contract audit) — the standing-dual-path smell in its audit dimension. Migrating all six-verb users retires the CLI drift audit for cockpit verbs wholesale. B over C only because grep-at-plan-time beats a hand-list that a playbook added next week silently escapes.

### Q5: How "fail loud" surfaces to the operator
**Context**: FR-006 requires fail-loud with "actionable guidance" when the cockpit MCP tools are absent, but does not specify the surface. Options range from a thrown error propagated to the caller, a specific AskUserQuestion prompt, a written ledger entry, or a printed banner. Planning needs the surface to define the failure boundary and audit hook.
**Question**: What surface should the fail-loud signal use when cockpit_* MCP tools are absent at startup sweep?
**Options**:
- A: A typed error raised from the startup-sweep code path with the guidance string as the message; caller (auto.md operator) sees it as a normal tool-boundary failure.
- B: An AskUserQuestion prompt naming the missing tools and pointing to cluster-base#75, so the operator explicitly acknowledges before aborting.
- C: A structured ledger entry (matching #403's cost contract) plus the typed error, so the failure is captured in the audit trail.
- D: Something else — specify.

**Answer**: C — structured ledger entry plus the loud abort; explicitly no AskUserQuestion. The check runs at the top of the startup sweep (verify the `cockpit_*` tools are present before dispatching anything); on absence, write a ledger line in the agency#403 shape (`startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`), print the guidance, and end the run. The ledger half matters because a run that aborts must account for why in the audit trail — the cost contract's discipline applied to the failure boundary — and it gives FR-007's audit a concrete hook (assert the playbook text mandates the ledger line). B is disqualified on gate-contract grounds: the operator can do nothing in-session about missing registration, so a prompt whose every option means "abort" is not a decision — and the gate contract enumerates exactly four question kinds; this would be a fifth. A alone loses the audit-trail half and misdescribes the mechanism — the sweep is playbook prose executed by the session, not a code path that raises; what exists is the session detecting absence and acting per contract.
