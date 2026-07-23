# Research: Cockpit Remote Gates Dogfood Run

Decisions and their rationale for driving `/cockpit:auto --gates=ui` end-to-end. All references below tie back to the epic plan at [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md) and the [clarifications](./clarifications.md).

## Prerequisites (verify before starting)

The run depends on P1–P3 of the epic being merged and deployed. Confirm each of the following against current state, not memory:

1. **`--gates=ui` flag exists** in `agency/packages/claude-plugin-cockpit/commands/auto.md`. Grep for `--gates=` and confirm the three-way (`ui|local|auto`) is present with the D.12 `gate-answer` dispatch class.
2. **`cockpit_gate_open` / `cockpit_gate_ack` MCP tools** are exposed on the cockpit MCP server and callable from the current cluster.
3. **Answers file plumbing**: `/workspaces/.generacy/cockpit/answers.ndjson` is written by the orchestrator; the doorbell tails it and emits `gate-answer` NDJSON on stdout. Verify by triggering one gate manually and observing the file grow.
4. **Cloud inbox is reachable** at generacy.ai `/dashboard/inbox` with the operator's account able to see the driving cluster's org.
5. **Relay WS is authenticated** — smee.io is not on the answer path. Confirm the transport by tailing orchestrator logs while answering.
6. **UI renders every gateType**: `clarification`, `artifact-review`, `implementation-review`, `manual-validation`, `escalation`, `phase-queue`, `filing`, `scope-drained`. Open a synthetic gate of each type (or wait for one to appear) and confirm the inbox renders it before starting the coverage run. If any type renders poorly or crashes, file as a P3 defect and continue.

Blocking prerequisites become blocking defects for the epic, not this issue.

## Decisions

### D1. Epic under test — hybrid (clarification Q1 → C)

**Decision**: start with a live in-flight epic in a product repo (generacy-ai/generacy-cloud is the natural candidate since the epic itself lives there). If any gate type in FR-003–FR-007 has not fired naturally within a bounded window (target: two working days of driver time), stop and seed a synthetic follow-up epic on a scratch branch specifically to trigger the remaining gate types.

**Rationale**: pure-live risks never exercising escalation, supersession, or offline; fully-synthetic sacrifices the "drive a real epic" fidelity the epic asks for. Hybrid preserves realism where it happens naturally and closes coverage gaps deterministically.

**Alternatives rejected**:
- Pure live (Q1-A): may leave gaps in escalation/supersession/offline coverage.
- Pure synthetic (Q1-B): loses realism; the point of P4 is to see the stack under actual work.

### D2. Run completion — coverage-complete (Q2 → A)

**Decision**: the run ends when every gate type in the scope list has been exercised at least once. The driven epic may still be in-flight; the report notes its state at run-end.

**Rationale**: the deliverable is a report proving each remote gate type works end-to-end. Coverage-of-types is the stopping rule that maps directly to that. Epic-terminal (Q2-B) forces artificial gates after coverage is complete; operator-judged (Q2-C) is too vague to reproduce.

### D3. Escalation trigger — red-check merge (Q3 → B)

**Decision**: cause a merge to hit an unfixable red check so the bounded fixer subagent runs once, stays red, and the driver fires an `escalation` gate. Canonical recipes (any one suffices):
- Land a change on a PR branch that intentionally fails a required CI job the fixer cannot repair (e.g., a hard-coded `exit 1` in a new test file).
- Break a required status check whose failure isn't a compile error the fixer patches (e.g., a lint rule that expects a config the fixer has no template for).

**Rationale**: this is the D.6 / G.4(a) escalation path in the auto playbook and is deterministically reproducible. Repeated request-changes (Q3-A) drives the review-verdict gate (G.2), not an escalation.

**Preflight check**: before the run, confirm the inbox UI actually renders `escalation` gateType (icon, body, options). If it doesn't, file the gap as a P3 rough edge and force the escalation anyway so the down-path can still be exercised.

### D4. Supersession recipe — separate advance action (Q4 → B)

**Decision**: while a gate is open in the inbox, advance the underlying phase by another route (CLI `cockpit_advance`, a GitHub label flip, or answering a different gate). Then submit the stored-open inbox answer. The session validates against live state and acks `superseded`; the inbox reflects `superseded`.

**Rationale**: this is precisely the "Stale answers" scenario in the epic plan's Lifecycle & edge cases. Advancing via a separate action makes the race controlled and reproducible. The inline-answer (Q4-A) and driver-retry-race (Q4-C) options are timing-dependent and flaky.

### D5. Offline mechanism — network-level (Q5 → A)

**Decision**: block the cluster's outbound relay WebSocket to the generacy.ai transport while the driving process keeps running. Answer at least one gate from the inbox during the outage. Restore connectivity and observe delivery via the redelivery-on-reconnect path.

Two ways to sever the relay WS (choose whichever is available on the cluster):
- **Firewall rule / iptables**: block egress to the relay endpoint (host + port).
- **Interface toggle**: bring the primary network interface down (safer inside a controlled dev cluster).

**Rationale**: FR-011's documented behavior is redelivery via the cluster relay handshake; severing and restoring the authenticated relay WS exercises exactly that path. Stopping the driving process (Q5-B) conflates offline delivery with the separate session-restart / re-derive path.

**Evidence to capture**:
- Timestamp of connectivity drop.
- Answer submitted in the inbox during outage (with delivery state pre-restore).
- Timestamp of connectivity restore.
- `deliveryId` in the orchestrator logs / answers.ndjson at the moment of redelivery.
- Confirm the session applies the answer exactly once (no duplicate side effects).

## Implementation patterns exercised

None built in this issue; the following P1–P3 patterns are what the run validates:

- **gateId derivation**: `sha256(<owner>/<repo>#<issue>:<gateType>:<generation>)`, first 24 hex chars. Same gate re-asked after restart/takeover upserts.
- **Answers file as replay log**: append-only NDJSON, tailed by the doorbell and the MCP event bus, replayable across session restarts by `deliveryId` dedup.
- **Relay retain-and-replay**: `cluster.cockpit` channel retains gate-open/ack events across relay disconnects.
- **Cloud redelivery**: undelivered answers are redelivered on cluster handshake/reconnect.
- **Fallback semantics**: `--gates=ui` falls back to local `AskUserQuestion` if `cockpit_gate_open` errors (fail toward operator, never stall).

## Key sources

- Epic plan: [cockpit-remote-gates-plan.md](https://github.com/generacy-ai/tetrad-development/blob/develop/docs/cockpit-remote-gates-plan.md)
- Auto playbook (P4 rework target): `agency/packages/claude-plugin-cockpit/commands/auto.md`
- Cockpit playbook drift pin: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (any behavior changes to auto.md must re-pin, not weaken, assertions — see repo CLAUDE.md)
- Spec: [spec.md](./spec.md)
- Clarifications: [clarifications.md](./clarifications.md)
