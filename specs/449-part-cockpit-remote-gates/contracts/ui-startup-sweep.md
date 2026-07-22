# Contract: UI-mode startup sweep

Extends `packages/claude-plugin-cockpit/commands/auto.md` step-3 startup sweep (auto.md line 134–145). Load-bearing for spec FR-013 and Q2=B.

## Rule (Q2=B)

Under `resolvedGateMode === "ui"`, the startup sweep re-opens remote gates for every issue whose live transition class is in the **persistent gate-trigger set**:

- Every `waiting-for:*` label (matches FR-013 baseline text):
  - `waiting-for:clarification` (D.1)
  - `waiting-for:<artifact>-review` (D.2 — spec / clarification / plan / tasks)
  - `waiting-for:implementation-review` (D.3)
  - `waiting-for:manual-validation` (D.4)
  - `waiting-for:merge-conflicts` (D.11 — co-occurs with `blocked:stuck-merge-conflicts`)
- PLUS the following persistent NON-`waiting-for:*` gate triggers (per Q2=B):
  - `agent:error` (D.7)
  - `failed:<subtype>` (D.7)
  - `completed:validate` with red checks (D.6 — after fixer, if the fixer state is not in-memory-only)
  - `phase-complete` (D.8 — G.5)
  - `blocked:stuck-merge-conflicts` (D.11 — co-occurs with `waiting-for:merge-conflicts`; either alone triggers)

## Exclusions

- **G.4(e) consecutive `invalid-cursor` fault**: NOT swept. In-memory cursor-mechanism fault, no persistent label, does not survive restart by definition.
- **D.5 (green merge)**: no gate. Sweep dispatches the merge action mechanically per today's rule — no `cockpit_gate_open` call for D.5.
- **D.9 / D.9a-d (server-side-owned)**: ledger-only rows in the local flow, no gate. Sweep respects this — no `cockpit_gate_open` call for D.9 family.

## Idempotency by `gateId`

Every sweep-time `cockpit_gate_open` call uses `gateId = hash(issueRef, dispatchClass, generation=1)` (per plan-doc rules — `generation=1` is the sweep-time default since a restart forgets in-memory generation state). The tool server MUST recognize a duplicate `gateId` and return the existing record's `inboxUrl` rather than creating a duplicate. This is a cluster-side property owned by the epic (see `cockpit-remote-gates-plan.md § Idempotency`).

Plugin-side, on a duplicate return the sweep still adds an entry to `openGates` in-memory (the record's `openedAt` may be earlier than the run's start — that's expected on a takeover / restart).

## Interaction with `--gates=local`

Under `resolvedGateMode === "local"`, the startup sweep behaves EXACTLY as today (auto.md line 143 — dispatch each D.1–D.9 (and D.11) issue as a synthetic event, per § Dispatch and § Ledger). No `cockpit_gate_open` calls, no `openGates` map populated. Q2=B's extended trigger set is a UI-only addition.

## Interaction with epic-less mode

Under `--tracking <ref>` / `--new "<title>"` (epic-less mode), the sweep reads the task list from the tracking issue via `cockpit_status(issue=<tracking-ref>, json=true)` (per auto.md line 145). The Q2=B extended trigger set applies identically to each ref in the task list — the sweep opens remote gates for every ref whose live transition class is in the persistent gate-trigger set, per issue.

## Fallback interaction

If `cockpit_gate_open` fails for a specific sweep-time gate, per `contracts/ui-mode-fallback.md` the fallback fires — but during the STARTUP SWEEP, "fall through to local AskUserQuestion" is problematic (the sweep dispatches many issues in sequence; blocking on an AskUserQuestion mid-sweep would defeat the sweep's non-blocking model). Resolution:

- Sweep-time `cockpit_gate_open` failure → first-failure ledger note fires (per fallback contract), the specific gate's initiation is DEFERRED to the main loop's first natural wake (a `Monitor` line or `ScheduleWakeup` heartbeat). The record is NOT opened, but the underlying event WILL re-fire naturally because the label is persistent.
- The main loop's per-wake iteration retries `cockpit_gate_open` for that issue's transition class. On success, the gate opens normally. On repeated failure, the fallback AskUserQuestion path fires per US4 / FR-011 (single-gate blocking is acceptable in the main loop; sweep is the special case).

This means the sweep is "best-effort UI-open"; a hostile cluster (constantly-failing `cockpit_gate_open`) degrades to loop-time fallback but does not stall.

## Startup-sweep status table

The existing "sweep ends with exactly one full status table" rule (auto.md line 143, § L.4 policy) is unaffected. Under UI mode, the status table is printed AFTER the sweep-time `cockpit_gate_open` calls; the table's rows show the same issues that just had gates opened.

## Test pins (playbook-verification)

The 449-* describe block adds:
- `assert step-3 startup sweep contains a "UI-mode extended trigger set" callout naming the five non-waiting-for triggers (agent:error, failed:*, completed:validate+red, phase-complete, blocked:stuck-merge-conflicts)`
- `assert the callout explicitly excludes G.4(e) invalid-cursor streak (in-memory only)`
- `assert step-3 startup sweep names "gateId idempotency" as the duplicate-open safety property`
- `assert step-3 startup sweep names the deferred-to-loop behavior on sweep-time cockpit_gate_open failure`

Re-pin, don't weaken.
