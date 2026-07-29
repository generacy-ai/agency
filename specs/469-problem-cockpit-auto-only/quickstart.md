# Quickstart: Thread run-scoped `runId` from `/cockpit:auto` into gate open/ack calls

Operator-facing demo of the fix and the diagnostic surfaces the pre-flight probe adds. Assumes the ticket has landed and both Phase A (generacy-cloud) and Phase B (generacy commit `82077f1a`) are deployed on the cluster you are running against.

## What changed

Before this ticket: re-running `/cockpit:auto` against an epic whose previous auto session had already answered a gate hung silently. The cluster sent a `cockpit_gate_open` for the fresh event, the cloud log-dropped it as terminal (the prior gate at the same `issueRef:gateType:generation` had reached `applied` / `superseded` / `failed` / `expired`), the cluster got a 202, the operator saw nothing in the inbox, and the auto session waited forever for an answer.

After this ticket: `/cockpit:auto` derives a run-scoped `runId` at pre-flight and threads it as an explicit literal into every `cockpit_gate_open`, `cockpit_gate_ack`, and pre-draft `cockpit_gate_status` call it issues. The composite gate key becomes `issueRef:gateType:generation:runId`, so a fresh run gets a fresh `gateId` and the cloud opens a NEW inbox-visible gate.

Behaviour is identical to today under `--gates=local` — no `runId` field appears on any wire; no probe fires. All the changes below are UI-mode only.

## Reproduce the terminal-gate resurrection (US1)

Prerequisites: a cluster at Phase B commit `82077f1a` or later; a deployed Phase A that accepts `runId` on write and read paths; an epic (or a tracking issue) that has completed at least one `waiting-for:*` gate with the operator having applied an answer (i.e. the gate's cloud status is `applied`).

Steps:

1. Confirm the prior gate is terminal:

   ```bash
   # From an operator shell with the cockpit MCP surface bound:
   /cockpit:status <epic-ref>
   ```

   The row for the previously-answered issue should show the issue in a subsequent state (e.g. it advanced past `waiting-for:clarification` after the answer landed). The gate document cloud-side is `applied`.

2. Re-run auto against the same epic:

   ```bash
   /cockpit:auto <epic-ref>
   ```

3. Observe the pre-flight probe pass row in the ledger:

   ```bash
   cat .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger | head -5
   ```

   Expected output (Phase B cluster, `--gates=ui` explicit or resolved to `ui`):

   ```
   Tracking ref: <epic-ref> · form: epic
   <epic-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe
   Auto run starting · gates: ui (source: --gates=auto)
   ```

   The `gate-query-probe · ok` row indicates the extended `cockpit_gate_list({issueRef, gateType: <omitted>, runId: <this-run's-runId>})` call was accepted by the cluster's `.strict()` schema — `runIdEnabled === true` for this session.

4. Watch the sweep open a NEW gate for the previously-answered issue:

   ```bash
   grep "· source: ui-gate" .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger
   ```

   Expected (in the sweep-time rows near the top of the file):

   ```
   <issue-ref> · waiting-for:clarification · clarification-batch · gate-opened · source: ui-gate
   ```

   The gate is inbox-visible; the operator answers it as usual.

5. Confirm the new gate's `gateId` differs from the prior run's `gateId` in the `runId` component only. Compare the `runId` field on the cloud gate document (via `cockpit_gate_list({issueRef, gateType: <omitted>})`) — the row for the new gate carries the current run's `runId`; the row for the prior (terminal) gate carries the prior run's `runId`. `issueRef`, `gateType`, and `generation` match; only `runId` differs.

## `runId` value shape

The `runId` value on every wire is the FULL ledger filename stem verbatim: `<tracking-ref-slug>-<timestamp>`.

For an auto run against `generacy-ai/generacy#1053` started at 2026-07-29 14:30:12 local:

- Ledger filename: `.generacy/cockpit/auto-runs/generacy-ai-generacy-1053-20260729-143012.ledger`
- `runId` on every gate verb: `generacy-ai-generacy-1053-20260729-143012`

Grep the value in a `cockpit_gate_list` row and it points directly at the ledger file — no cross-referencing needed.

The `runId` MUST NOT contain the `:` character (per FR-013). Under today's derivation this is a no-op — the slug is `/` → `-` with `#` stripped and the timestamp is `YYYYMMDD-HHMMSS`, both colon-free by construction — but the invariant is pinned in the derivation prose so a future ledger-filename-format change cannot silently introduce one.

## Pre-flight probe fallback (pre-Phase-B cluster)

If you point `/cockpit:auto` at a cluster that pre-dates Phase B commit `82077f1a`, the extended `cockpit_gate_list({issueRef, gateType: <omitted>, runId})` call trips the tool server's `.strict()` schema (which does not know the `runId` field yet) and returns `{status: 'error', class: 'invalid-args', detail: …}`.

The probe distinguishes this "known-unknown" case from a broken surface:

1. `runIdEnabled` is set to `false` for the entire session.
2. The following startup warning is logged verbatim:

   ```
   runId threading disabled for this session — cluster's cockpit MCP server does not accept runId on cockpit_gate_list (pre-generacy#1067). Run continues under today's 3-input gate identity; generacy#1053 (re-run terminal gates) will not be fixed for this session. Upgrade the cluster's generacy build to ≥ commit 82077f1a to enable runId threading.
   ```

3. The run continues under today's 3-input identity. No `runId` field appears on any gate verb payload. The terminal-gate resurrection symptom (US1) is NOT fixed for this session — the operator will see the same silent hang until the cluster is upgraded.

4. The decision is fixed for the session. Even if the cluster is upgraded mid-run (unlikely; the MCP server is long-lived), the session's `runIdEnabled` value does not flip. Restart `/cockpit:auto` to pick up the new capability.

**Distinguishing this from a broken surface**: if the probe returns any error class OTHER than `invalid-args` (e.g. `query-unreachable`, `internal`, `transport`), the pre-#469 probe-failure behaviour fires unchanged. Under explicit `--gates=ui` the run hard-fails with the probe-fail ledger row and operator-facing line; under `--gates=auto` the run resolves to `local` with `probe-failed`. Only `invalid-args` triggers graceful degradation.

## Within-run gate identity stability (US2)

Every `cockpit_gate_open` / `cockpit_gate_ack` / pre-draft `cockpit_gate_status` in a single auto run carries the SAME `runId`. This includes:

- The startup sweep's `cockpit_gate_open` calls for every persistent gate-trigger state.
- Each drafting D.n row's live-path `cockpit_gate_open` (D.1, D.2, D.3, D.4, D.6 G.4a, D.7 G.4b, D.8 G.5, D.10 G.4c, D.11 G.4d).
- Every per-event pre-draft `cockpit_gate_status` in the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11).
- Every `cockpit_gate_ack` from § D.12 (operator apply, no-record supersede, live-state supersession) and from the § step 3 / § step 4 answered-gate escape hatch.
- Every generation-drift `cockpit_gate_ack(superseded)` in the drift-branch-enabled Step 0 rows (D.1, D.2, D.3, D.4).

A mid-run MCP reconnect does NOT change the `runId` — the value is stored on loop state at pre-flight and read verbatim by every downstream site. A reconnect re-binds the tool handle; it does not re-run pre-flight.

**Verify with a grep**: after a run completes, every ledger row for the run's gates references the same `runId`. In a `cockpit_gate_list({issueRef, gateType: <omitted>})` snapshot mid-run, every row for an in-flight gate carries the same `runId` string.

## Two runs, two identities (US3)

Two consecutive `/cockpit:auto` invocations against the same epic produce two DIFFERENT `runId`s (they were captured at two different timestamps, so their ledger filename stems differ). Each run's gates therefore live under distinct `gateId`s; the ledger, inbox, and gate documents remain mutually traceable during a post-mortem.

Example:

- Run 1 starts at 2026-07-29 14:30:12 → `runId: generacy-ai-generacy-1053-20260729-143012`.
- Run 1 opens a clarification gate for issue #1055 → `gateId = hash("generacy-ai/generacy#1055", "clarification", "abc123", "generacy-ai-generacy-1053-20260729-143012")`.
- Run 2 starts at 2026-07-29 14:35:47 → `runId: generacy-ai-generacy-1053-20260729-143547`.
- Run 2 opens a fresh clarification gate for issue #1055 → `gateId = hash("generacy-ai/generacy#1055", "clarification", "abc123", "generacy-ai-generacy-1053-20260729-143547")`. Distinct from Run 1's `gateId`.

Both `runId` values map directly to `.generacy/cockpit/auto-runs/generacy-ai-generacy-1053-20260729-143012.ledger` and `.generacy/cockpit/auto-runs/generacy-ai-generacy-1053-20260729-143547.ledger` — grepping either against the directory finds exactly one file.

## Local-mode invariance (US4)

Under `--gates=local` (whether explicit or resolved by `--gates=auto` short-circuit), NOTHING about `runId` fires:

- No `runId` derivation stored on loop state (`runId: null`, `runIdEnabled: false`).
- No pre-flight capability probe (short-circuited before item 3).
- No `cockpit_gate_open`, `cockpit_gate_ack`, `cockpit_gate_status`, or `cockpit_gate_list` calls (local byte-path).
- Zero `runId` occurrences anywhere on the wire, in the ledger, or in the transcript.

Run

```bash
/cockpit:auto <epic-ref> --gates=local
```

and grep for `runId` in the ledger — zero matches expected.

## Post-mortem: `runId` in a `cockpit_gate_list` row

Every non-terminal gate that Phase A stored under the new schema carries `runId` as a first-class field on the returned row (per generacy-cloud#892). To find the ledger file for a gate you are inspecting:

1. Run `cockpit_gate_list({issueRef: <issue-ref>, gateType: <omitted>})` against the cluster.
2. Read the row's `runId` field.
3. `cat .generacy/cockpit/auto-runs/<runId>.ledger` on the orchestrator host.

The ledger file describes the exact `/cockpit:auto` run that opened the gate. This is the traceability the full-stem `runId` value shape was chosen for (per Batch 1 Q4 / R2).

## Troubleshooting

### "I re-ran auto but the gate still doesn't appear in the inbox"

Check the ledger's pre-flight rows:

- No `gate-query-probe` row at all → the run resolved to `local` (either explicitly or via `--gates=auto` short-circuit — check the `Auto run starting …` line for `gates: local`). `runId` is not threaded under local; the terminal-gate resurrection symptom is not addressed.
- `gate-query-probe · ok · source: ui-gate-probe` → `runIdEnabled === true`. `runId` is threaded; the fresh gate should be open. If it is not, the cloud state may be inconsistent — inspect the cloud gate document directly.
- `gate-query-probe · error: invalid-args …` → the cluster is pre-#1067; graceful-degradation fired; `runIdEnabled === false`. Upgrade the cluster (or accept that this session cannot resurrect terminal gates).
- `gate-query-probe · error: <other-class> …` → surface is broken; the run hard-failed under `--gates=ui` or downgraded to `local` under `--gates=auto`.

### "Two identical gates appeared in the inbox after I Ctrl-C'd and re-invoked auto"

This is the behaviour change named in spec.md § Assumptions. Re-invocation is a NEW run under Phase C — pre-flight mints a new ledger file and a new `runId`, and the new run's startup sweep does NOT see the prior run's still-open gate.

The clean fix (startup sweep adopts pre-existing non-terminal gates for the tracking ref) is filed as a follow-up on this ticket and is NOT in this PR. Until it lands, work around it manually: answer or ack the orphaned gate via the operator inbox before re-invoking auto.

### "The startup warning about pre-#1067 appears even though the cluster IS at #1067+"

Sanity-check the cluster's cockpit MCP server build:

```bash
# On the orchestrator host:
generacy --version
# Verify the git commit is at or above 82077f1a (generacy#1067).
```

If the version is correct, verify that `mcp/gates/query-schemas.ts § CockpitGateListInputSchema` actually accepts the `runId` field. A build that pins a stale schema would surface this exact symptom.

### "Auto ran, but a subagent's `cockpit_gate_open` used a different `runId` than the parent"

This is a bug (violates FR-014 / FR-015). Reproduce with the enumerated-dispatch-path test (per FR-016 / R11):

```bash
cd packages/claude-plugin-cockpit
pnpm vitest run tests/playbook-verification.test.ts -t "469 runId threading"
```

The test enumerates every dispatch path (six Step 0 blocks + startup sweep + D.12) and asserts each carries the run's `runId`. A failing assertion names the offending dispatch path.
