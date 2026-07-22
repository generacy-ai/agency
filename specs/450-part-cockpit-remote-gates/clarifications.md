# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-22 17:25

### Q1: Epic selection strategy
**Context**: FR-001 says to select 'a real epic (scratch or live)' suitable for exercising every gate type, and the Assumptions section allows a synthetic seeded epic if no natural candidate exists. This choice cascades through the entire run: whether we're driving live work (higher realism, less control over which gates fire) or a constructed epic (full coverage guaranteed, less representative). Without a decision, the operator can't start.
**Question**: How should the epic under test be chosen?
**Options**:
- A: Live epic — pick an in-flight epic from generacy-ai/generacy-cloud (or another product repo) that will naturally hit each gate type as it progresses. Accept that some gate types may need to be forced or that a follow-up epic covers gaps.
- B: Scratch/synthetic epic — construct an epic on a scratch branch specifically engineered to trigger every gate type (clarification batch, review approve + request-changes, phase-queue confirm, escalation, supersession) in one run.
- C: Hybrid — start with a live epic and, if any gate type doesn't fire naturally within the run window, seed a synthetic follow-up to cover the missing types.

**Answer**: *Pending*

### Q2: Run completion criteria
**Context**: US1/FR-002 launch `/cockpit:auto --gates=ui` and FR-015 requires a written run report, but the spec doesn't state when the run is 'done' for the purpose of writing the report. Options: the driven epic reaches terminal state (may take days), or all listed gate types are exercised at least once (may finish sooner, but epic left in-flight). This determines how long the operator commits and what state the epic is left in.
**Question**: When is the dogfood run considered complete for the purpose of publishing the run report?
**Options**:
- A: Coverage-complete — run ends when every gate type in FR-003–FR-007 has been exercised at least once (including approve + request-changes + free-text round + supersession + offline). Epic may still be in-flight; note that in the report.
- B: Epic-terminal — run ends only when the driven epic reaches a terminal state (merged / abandoned). Coverage must still be achieved along the way; if a gate type doesn't fire naturally, force it before terminal.
- C: Operator-judged — run ends when the operator judges enough evidence has been collected across FR-003–FR-011; document the stopping heuristic in the report.

**Answer**: *Pending*

### Q3: Escalation gate trigger
**Context**: FR-006 requires exercising 'at least one escalation gate' and the Assumptions section notes 'if the current implementation cannot generate an escalation on demand, this is itself a rough edge to file.' But the spec doesn't say what an escalation is triggered by (a red-check merge fixer bail-out? repeated review request-changes? a timeout?). The operator needs a concrete trigger recipe to plan for.
**Question**: What operator action or condition should be used to trigger the escalation gate exercised in FR-006?
**Options**:
- A: Repeated request-changes — respond to a review gate with request-changes multiple times until the system escalates (natural path if the driver escalates after N revisions).
- B: Red-check merge — cause a merge to hit red checks that the bounded fixer subagent cannot resolve, so the driver escalates to a human gate.
- C: Whichever escalation path the driver actually implements today — operator confirms with cockpit maintainers before the run which escalation is currently reachable, and uses that; if none is reachable, file the gap as a rough edge per Assumptions.

**Answer**: *Pending*

### Q4: Supersession scenario construction
**Context**: FR-007 requires exercising 'at least one supersession case: submit an answer after the gate's underlying state has already advanced.' The spec doesn't say how the operator engineers the underlying state advance — e.g., answer a different gate that advances the phase, cancel via CLI, resume the epic manually, etc. Without a concrete recipe, the operator can't reliably reproduce the supersession path.
**Question**: How should the supersession case be constructed during the run?
**Options**:
- A: Answer inline via Claude Code session — while a gate is open in the inbox, answer the same gate directly in the driving Claude Code session so the inbox answer arrives against superseded state.
- B: Advance via a separate action — while a gate is open, cause the underlying phase to advance by another route (CLI cockpit_advance, another gate answer, or GitHub label change), then submit the inbox answer against the old generation.
- C: Race with driver retry — leave a gate open long enough that the driver reissues it under a new gateId/generation; answer the old (superseded) one from the inbox.
- D: Operator-choice — any reproducible path that results in the delivery layer recording superseded is acceptable; record the exact path taken in the run report.

**Answer**: *Pending*

### Q5: Offline-cluster simulation
**Context**: FR-011 requires that 'the driving cluster be offline while at least one answer is submitted; verify delivery on reconnect.' The spec doesn't specify the offline mechanism — killing the process, disabling network on the cluster host, blocking the inbox transport endpoint, etc. Different mechanisms exercise different reconnection paths (transport retry vs. process restart) and produce different evidence. The operator needs to know which path this dogfood is meant to exercise.
**Question**: How should the driver-cluster offline state be induced for FR-011?
**Options**:
- A: Network-level — block outbound connectivity from the cluster to the generacy.ai inbox transport (e.g., firewall rule, unplug network) while the process keeps running; restore connectivity to observe delivery.
- B: Process-level — stop the driving `/cockpit:auto` process (or its cluster host) entirely, submit an inbox answer during the outage, then restart and observe delivery.
- C: Whichever path is documented as the supported reconnect scenario for remote gates — confirm with the epic owner which mechanism the transport layer is designed to survive, and use that; file any undocumented gaps as rough edges.

**Answer**: *Pending*

