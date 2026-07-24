# Quickstart: `cockpit:auto (--gates=ui)` — Reuse Existing Pending Gates in Startup Sweep

Operator-visible behavior of the pre-draft gate-status check, the generation-drift supersession, and the parked-answered escape hatch. Written for the operator running `/cockpit:auto <epic-ref> --gates=ui` and verifying the fix works end-to-end after a restart. No new command flags are added by this feature; behavior is inferred from the durable operator inbox.

## Prerequisites

1. **Blocking dependency**: [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) — read-only gate-status query (MCP tools `cockpit_gate_status`, `cockpit_gate_list`) — must be merged and deployed to the cluster before this feature can be exercised. On a cluster without #1038, `/cockpit:auto --gates=ui` hard-fails at pre-flight with the existing `cockpit MCP tools not available — upgrade the cluster` message (per the seven-cockpit-tools precedent at `auto.md:176`, now extended to nine tools).
2. **Prior work merged**: this feature builds on #449 (`--gates=ui|local|auto` flag + D.12 gate-answer dispatch) and #450 (P4 dogfood run report). If either is missing, verify against the current `auto.md` HEAD before proceeding.
3. **Operator inbox access**: an active tab on `https://generacy.ai/dashboard/inbox` for the driving cluster's org, with browser-notification permission granted.

## Usage — unchanged

The user-facing command is identical to today:

```
/cockpit:auto <epic-ref> --gates=ui
```

No new flags. No new prompts. The behavior change is entirely internal to how the loop decides whether to spawn a drafting subagent.

## Scenario 1 — Restart safety (US1, US2)

**Setup**: Start a `/cockpit:auto --gates=ui` run on an epic with at least one issue in `waiting-for:clarification`. Wait for the clarification gate to open in the operator inbox (do NOT answer it yet). Confirm the gate is present.

**Restart**: Stop the running conversation (or Ctrl-C the driving process; a full cluster restart also works). Start a NEW conversation with the same invocation.

**Expected observable behavior**:
- The new conversation's startup sweep dispatches the same issue's clarification event.
- The operator inbox shows **exactly one** clarification gate for the issue (not two).
- The new conversation's transcript prints the "one pointer line" pointing to the existing gate's `inboxUrl` — the URL matches the gate opened by the prior conversation (same `gateId`).
- The new conversation does NOT spawn the clarification drafter subagent for this issue. (Verify: no `subagent_type: "general-purpose"` invocation for "Draft clarifications" appears in the new conversation's transcript for this issue.)
- Answering the gate in the inbox delivers the answer to the new conversation via D.12 exactly as if the new conversation had opened the gate.

**What was broken before this fix**: the old sweep re-drafted every issue's clarification (spawning a fresh subagent for each) AND opened a fresh gate in the inbox for each, producing exactly two gates per issue after a restart. The operator would then dismiss one and answer the other, doubling the operator's roundtrip cost per restart.

## Scenario 2 — Generation drift (Q1=C)

**Setup**: Start a `/cockpit:auto --gates=ui` run on an issue with an open PR. Wait for the D.3 implementation-review gate to open in the inbox (PR head SHA is the generation). Do NOT answer.

**Force a drift**: Push a new commit to the PR (any change — a whitespace edit suffices). This mutates the PR head SHA, so the next dispatch's computed generation differs from the pending gate's generation.

**Restart the conversation** (or wait for a natural re-sweep triggered by an unrelated event).

**Expected observable behavior**:
- The old gate (at the previous head SHA's generation) is acked `superseded` in the inbox with a detail visible on the terminal record: `generation drift — content changed since original draft (was g<old>, now g<new>)`.
- A NEW gate opens in the inbox at the new head SHA's generation, containing a freshly-drafted review verdict.
- The operator answers the NEW gate; the OLD gate is inert (already terminal).

**What was broken before this fix**: the old sweep either opened a second gate at the fresh generation (leaving two live gates in the inbox, operator answers one, the other rots) OR re-attached to the stale gate silently (applying the operator's verdict to the OLD head SHA — a correctness hazard the D.12 supersession checks exist to prevent).

## Scenario 3 — Parked-answered escape hatch (FR-009 / SC-005)

**Setup**: Start a `/cockpit:auto --gates=ui` run. Wait for a gate to open. Answer it in the operator inbox. Confirm the D.12 event resolves it in the driving conversation (transcript shows the ledger row for the resolution).

**Force a park**: Simulate a gate stuck at cloud `delivered` by killing the driving conversation IMMEDIATELY after answering, then restarting on a new cluster with a different `clusterId`. The `cockpit-gate-delivery.ts:147-176` re-delivery rule (`status == 'answered' AND clusterId matches`) will fail to redeliver — the new cluster's `clusterId` does not match.

**Expected observable behavior over the next several sweeps**:
- The new conversation's startup sweep records the gate as `answered` (per Q3=C), does NOT spawn the drafting subagent, and does NOT open a duplicate gate.
- The sweep counter increments each sweep (1, 2, 3).
- On the 3rd sweep, the gate is acked `superseded` in the inbox with detail `answered-not-consumed — presumed stuck at cloud delivered/applied`. The `openGates` entry is removed and the counter is deleted.
- The same sweep re-derives the underlying event from labels — a FRESH gate opens (with a fresh drafting subagent spawn, since the parked gate is now terminal and does not appear in the pre-draft check's return).
- The operator answers the fresh gate to unblock the issue.

**What was broken before this fix**: without the escape hatch, the parked gate would sit in `openGates` forever, blocking the issue from ever re-dispatching. The operator has no visible signal — the driving conversation just silently stops making progress on that issue.

## Scenario 4 — Concurrent conversations on the same event (Q2=B, Q4=B)

**Setup**: On a cluster that supports two simultaneous `/cockpit:auto --gates=ui` conversations for the same org (e.g., an operator opens a second browser tab to the driving cluster), start both conversations on the same epic. Both will run the pre-draft check on the same synthetic events.

**Expected observable behavior**:
- Both conversations may perform the drafting subagent spawn if their pre-draft checks race and both observe `absent`. (This is the SC-002 exclusion — race-window double drafter spawn is out of scope per Q4=B.)
- ONLY ONE gate opens in the operator inbox for the issue. The second conversation's `cockpit_gate_open` call takes the non-terminal branch of the cloud-side Firestore `runTransaction` on `cockpitGates/{gateId}`, which rebinds `clusterId` and refreshes the body, but does NOT create a second inbox entry.
- Both conversations receive the D.12 event when the operator answers; whichever conversation the cloud routes the redelivery to consumes the answer, the other's pre-draft check on the next sweep observes `answered` (or `absent` if the answer has already resolved and the gate is terminal) and does not re-draft.

## What operators should NOT do

- **Do not manually delete gates from the inbox** while the driving conversation is alive — the durable inbox is authoritative per this spec's Assumption 3. A manual dismissal is not a gate answer and does not trigger a D.12 event; the sweep counter will eventually escape-hatch the gate, but this takes 3 sweeps.
- **Do not force a `--gates=local` restart on an epic with pending remote gates** expecting the local flow to answer them — the local mode does not query the remote inbox. Pending remote gates will be re-derived from labels on the next `--gates=ui` restart.

## Troubleshooting

- **Duplicate gates appear in the inbox after restart**: the pre-draft check did not fire OR the `gateId` derivation is diverging between sweep and live. First check the tool-presence output — if `cockpit_gate_status` or `cockpit_gate_list` is missing, the sweep should have hard-failed at pre-flight (`Print + exit`). If those tools are present and duplicates still appear, the fix has regressed — file a blocker against the epic and cite this ticket.
- **The pre-draft check silently no-ops on a gateType known to have a DATA GAP** (`clarification`, `escalation`, `artifact-review`, `implementation-review`, `manual-validation`, `scope-drained`): this is expected behavior for the SC-002 metric only. The pre-draft check catches exact-`gateId` reuse when the placeholder generation function happens to produce the same value on sweep and live (typically first-draft cases). When it diverges, the generation-drift branch fires (ack stale + draft fresh) so duplicate INBOX entries (SC-001) are still zero. Full SC-002 = 0 on these gateTypes requires the #1038 DATA GAPS follow-up.
- **A gate is acked `superseded` immediately on my next sweep, before the operator has had a chance to answer**: check the detail string on the terminal record. If it says `generation drift — …`, the content changed under the pending gate (e.g., new PR commit) and a fresh gate should have opened; look for it. If it says `answered-not-consumed — …`, the D.12 delivery is stuck (see Scenario 3 troubleshooting).
- **The escape hatch fires but the fresh gate doesn't open on the same sweep**: check that the underlying label is still present on the issue. The escape hatch acks the gate terminal but does not add or remove labels; the fresh event re-derives from `cockpit_status` labels. If the label was removed out-of-band, the fresh event has nothing to dispatch.

## Related documents

- Spec: [spec.md](./spec.md)
- Clarifications: [clarifications.md](./clarifications.md)
- Plan: [plan.md](./plan.md)
- Research (rationale + N=3 justification): [research.md](./research.md)
- Data model (types + validation rules): [data-model.md](./data-model.md)
- Contracts: [pre-draft-check.md](./contracts/pre-draft-check.md), [answered-escape-hatch.md](./contracts/answered-escape-hatch.md), [sweep-generation-fix.md](./contracts/sweep-generation-fix.md)
- Playbook: `packages/claude-plugin-cockpit/commands/auto.md`
- Pins: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (`describe("457 sweep-time gate reuse", ...)` — added by this feature)
- Upstream: [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) (blocking dependency)
- Epic: [generacy-ai/generacy-cloud#850](https://github.com/generacy-ai/generacy-cloud/issues/850)
