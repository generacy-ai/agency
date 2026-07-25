# Quickstart: Cockpit Remote Gates — Pre-flight Functional Probe

Operator-visible behavior of the pre-flight gate-query probe under each of the three gate modes. Written for the operator running `/cockpit:auto <epic-ref>` (or the equivalent Form 2/3/4 invocation) against a cluster whose gate-query surface may or may not be functional. No new command flags are added by this feature; behavior is inferred from the `Auto run starting` line and the ledger.

## Prerequisites

1. **Blocking dependency**: [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) — read-only gate-status query (MCP tools `cockpit_gate_status`, `cockpit_gate_list`) — must be merged and deployed to the cluster before UI mode can be exercised. On a cluster without #1038, `--gates=ui` hard-fails at pre-flight with the existing `cockpit MCP tools not available — upgrade the cluster` message (§ step 3 tool-presence check per #457's conditional shape). `--gates=local` (and `--gates=auto` resolved to `local` via item 1 or item 2 short-circuit) is unaffected on such a cluster: it never calls the two gate-query tools.
2. **Related deployment gap**: [generacy-ai/generacy-cloud#877](https://github.com/generacy-ai/generacy-cloud/issues/877) — the cloud-side gate-query endpoint that #1038's cluster half calls. When #877 is not deployed (or is deployed but broken), the cluster's `cockpit_gate_list` returns `{status: 'error', class: 'internal', detail: '…404…'}`. This feature makes THAT failure legible; it does not close the deployment gap.
3. **Prior work merged**: this feature builds on #449 (`--gates=ui|local|auto` flag + D.12 gate-answer dispatch) and #457 (per-event pre-draft check + conditional tool-presence check + `formatPreDraftCheckErrorLine` reference formatter). If either is missing, verify against the current `auto.md` HEAD before proceeding.
4. **Operator inbox access** (for UI-mode scenarios): an active tab on `https://generacy.ai/dashboard/inbox` for the driving cluster's org, with browser-notification permission granted.

## Usage — unchanged

The user-facing command is identical to today:

```
/cockpit:auto <epic-ref> --gates=ui
/cockpit:auto <epic-ref>                # default: --gates=auto
/cockpit:auto <epic-ref> --gates=local
```

No new flags. The behavior change is entirely internal to how `/cockpit:auto` decides whether it can run in UI mode.

## Scenario 1 — UI mode fails fast on a broken gate-query surface (US1)

**Setup**: An operator running `/cockpit:auto <epic-ref> --gates=ui` against a cluster whose two gate-query MCP tools are correctly BOUND (they appear in the session's tool binding, so #457's conditional tool-presence check passes) but whose backing cloud endpoint returns 404 (the generacy-cloud#877 gap) or any other non-`ok` response.

**Expected observable behavior**:

1. Pre-flight starts. § step 1 parses `--gates=ui`.
2. The three-tool absence check passes (`cockpit_gate_open`, `cockpit_gate_status`, `cockpit_gate_list` all bound).
3. F4.6/F4.4 binds the identity ref (Form 4 only; other forms bind it earlier).
4. The ledger directory is created and the ledger header line is written as the first line of the ledger file (Forms 1/2: at the line-199 header write; Form 3: after G.6 approval; Form 4: at F4.7). This is the load-bearing precondition for the probe row to be safely appendable.
5. The probe fires: exactly one `cockpit_gate_list({issueRef: <identity-ref>})` MCP call.
6. The call returns `{status: 'error', class: 'internal', detail: 'cluster query endpoint returned 404'}` (or the analogous class for the specific failure mode).
7. The plugin writes one ledger row (appended after the header):
   ```
   <identity-ref> · preflight · gate-query-probe · error: internal — cluster query endpoint returned 404 · source: ui-gate-probe
   ```
8. The plugin prints the operator-facing line VERBATIM (the FR-013 frozen template):
   ```
   gate-query surface unavailable (class: internal): cluster query endpoint returned 404 — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
   ```
9. The plugin exits non-zero. **No `Auto run starting` line is printed** (the run never starts). **No loop is entered.** **No events are dispatched.** **The run does NOT silently degrade to `local`.** The ledger directory + header + fail row remain on disk as the audit record of the aborted run.

**What was broken before this fix**: pre-flight passed happily (the two tools were bound, so the tool-presence check succeeded). The startup sweep entered the main loop, drained events, and every event's Step 0 pre-draft-check tried to call `cockpit_gate_status(...)` — every call hit the same 404 → `internal` → `<issue-ref> · <transition-class> · pre-draft-check · error: internal — … · source: ui-gate` row. The loop woke, aborted, woke again, aborted again, indefinitely. Doorbell armed, events draining, ledger growing — zero progress. Diagnosing the underlying 404 required a container-log dive and a hand-rolled curl against the cloud API (cluster `snappoll-local-2`, 2026-07-25).

**Verifying the fix**:
- The exit is at pre-flight (well before any event dispatches).
- The single operator-facing line names the class (`internal`) and gives the exact workaround (`--gates=local` or fix the cloud deployment).
- A `grep '· preflight ·' <ledger>` returns exactly one row.
- A `grep '· pre-draft-check ·' <ledger>` returns zero rows (no events were dispatched).

## Scenario 2 — Auto mode falls back to local on a broken surface (US2)

**Setup**: Same cluster as Scenario 1 (tools BOUND, cloud endpoint broken), but the operator uses the default mode (no `--gates=...` flag, equivalent to `--gates=auto`).

**Expected observable behavior**:

1. Pre-flight starts. § step 1 parses `--gates=auto`.
2. Item 1 of the three-part check (parse-time): `cockpit_gate_open`, `cockpit_gate_status`, `cockpit_gate_list` all bound? YES.
3. Item 2 of the three-part check (parse-time): cluster cloud-activated? YES. Tentative resolution: `ui pending probe`.
4. F4.6/F4.4 binds the identity ref (Form 4 only; other forms bind it earlier). The ledger directory is created and the ledger header is written as the first line of the ledger file (Forms 1/2 at line-199 header write; Form 3 after G.6 approval; Form 4 at F4.7).
5. Item 3 of the three-part check (probe, deferred until post-header-write): `cockpit_gate_list({issueRef: <identity-ref>})` returns `{status: 'error', class: 'internal', detail: '…'}`.
6. The plugin writes one ledger row (appended after the header):
   ```
   <identity-ref> · preflight · gate-query-probe · error: internal — … · source: ui-gate-probe
   ```
7. The plugin prints the FR-013 template line (same wording as Scenario 1).
8. The plugin appends the `Auto run starting` line to the ledger and prints:
   ```
   Auto run starting · gates: local (source: --gates=auto → probe-failed)
   ```
9. The plugin continues to § step 3 in `local` mode. Under `local`:
   - The tool-presence check (per #457) requires only the seven baseline tools; the two gate-query tools are NOT required and their state does not matter.
   - No further pre-draft-check calls are made (they are `ui`-only).
   - The loop runs to completion using local `AskUserQuestion` for gates.

**Verifying the fallback**:
- The `Auto run starting · gates: local (source: --gates=auto → probe-failed)` line is visible in the transcript.
- The ledger contains ONE `preflight · gate-query-probe · error` row (the probe fired once) followed by normal `local`-mode ledger rows.
- No `pre-draft-check · error` rows appear — the `local` path does not call the gate-query tools.
- The run makes forward progress despite the broken cloud endpoint.

## Scenario 3 — Auto mode short-circuits without probing (US2 continued)

**Setup**: A cluster where either `cockpit_gate_open` is unbound (pre-#449) OR the cluster is not cloud-activated (typical development cluster). Operator uses the default mode.

**Expected observable behavior**:

1. Pre-flight starts. § step 1 parses `--gates=auto`.
2. Item 1 fails: `cockpit_gate_open` NOT bound (or item 2 fails: cluster not cloud-activated).
3. **The probe is NOT called.** Short-circuit resolution to `local`.
4. **No probe ledger row is written.** No `preflight · gate-query-probe` row appears in the ledger.
5. The plugin prints:
   ```
   Auto run starting · gates: local (source: --gates=auto → cockpit_gate_open unbound)
   ```
   (or `→ cluster not cloud-activated`, per which condition failed).
6. The plugin continues to § step 3 in `local` mode.

**Verifying the short-circuit**:
- The `Auto run starting` line names the earlier-condition failure (`cockpit_gate_open unbound` or `cluster not cloud-activated`), NOT `probe-failed`.
- The ledger contains ZERO `preflight · gate-query-probe` rows.
- The run is byte-identical to what `--gates=local` would have produced (no extra rows, no extra prints, no extra tool calls).

This is Q3's answer in action: `auto`→`local` remains indistinguishable from explicit `--gates=local` when short-circuited by items 1 or 2.

## Scenario 4 — Local mode is unaffected (US3)

**Setup**: Any cluster (with or without #1038, with or without a functional gate-query surface). Operator runs `/cockpit:auto <epic-ref> --gates=local`.

**Expected observable behavior**:

1. Pre-flight starts. § step 1 parses `--gates=local`.
2. **Zero probe calls.** The probe is not evaluated under explicit `--gates=local`.
3. **Zero probe ledger rows.** No `preflight · gate-query-probe` row appears in the ledger.
4. The plugin prints:
   ```
   Auto run starting · gates: local (source: --gates=local)
   ```
5. The plugin continues to § step 3 in `local` mode.

**Verifying local-mode invariance**:
- Zero probe calls under `--gates=local`, always. If you audit the tool-call trace and see any `cockpit_gate_list` call at pre-flight, that is a regression.
- The ledger contains zero `preflight · gate-query-probe` rows under `--gates=local`.
- The output is byte-identical to a run before this feature shipped.

## Scenario 5 — Timeout (transient network stall)

**Setup**: A cluster where the gate-query surface accepts connections but does not respond within `timeoutMs` (default 5000ms per attempt). Operator runs `/cockpit:auto <epic-ref> --gates=ui`.

**Expected observable behavior**:

1. Pre-flight starts. Everything through the identity-ref binding proceeds normally.
2. Probe fires: `cockpit_gate_list({issueRef: <identity-ref>})`.
3. Inside the query-client, `fetchOnce` aborts each attempt at 5000ms, `withRetry(QUERY_RETRY_SCHEDULE)` retries 3 times with ~5s backoff. Total elapsed: ~20 seconds.
4. After the third attempt times out, the tool returns `{status: 'error', class: 'query-unreachable', detail: 'connection stalled after 3 attempts'}` (or similar).
5. The plugin writes:
   ```
   <identity-ref> · preflight · gate-query-probe · error: query-unreachable — connection stalled after 3 attempts · source: ui-gate-probe
   ```
6. The plugin prints:
   ```
   gate-query surface unavailable (class: query-unreachable): connection stalled after 3 attempts — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
   ```
7. Exit non-zero.

**Note on the ~20s bound**: pre-flight can take up to ~20 seconds on a hung endpoint. This is the query-client's built-in budget; the plugin does not add a shorter timer. If you need faster failure, the correct fix is upstream (`QUERY_RETRY_SCHEDULE` in generacy #1038), not a skill-side timer — see plan.md § R3.

## Scenario 6 — Concurrent conversations, one broken cluster

**Setup**: Two operators (or one operator in two tabs) both run `/cockpit:auto <epic-ref> --gates=ui` against the same cluster with a broken gate-query surface.

**Expected observable behavior**:

- Both conversations independently fire their own probe at pre-flight.
- Both probes return the same error class (assuming the surface is deterministically broken, e.g. 404).
- Both conversations write their own `preflight · gate-query-probe · error` ledger row (one per conversation's ledger; the ledgers are separate files under `.cockpit/runs/<run-id>/`).
- Both conversations print the FR-013 template line and exit non-zero.
- **Neither conversation enters its loop.** No events are dispatched from either conversation. Zero cloud writes.

The probe is per-run, not per-cluster; two runs both probe. But because neither run enters the loop, there is no race, no coordination needed.

## What operators should NOT do

- **Do not add a skill-side timeout wrapper around the probe call.** The upstream `QUERY_RETRY_SCHEDULE` is the bound; adding a shorter wrapper either has no effect (upstream fires first) or arbitrarily cuts short a legitimate attempt in mid-flight. If ~20s is too long for your workflow, the fix is upstream (see plan.md § R3).
- **Do not "quickly fall back to `local`" when `--gates=ui` fails at pre-flight.** The FR-004 invariant exists precisely to prevent this — a `ui` run that silently becomes `local` re-introduces the duplicate-drafting hazard the pre-draft check exists to remove. If you want fallback behavior, use `--gates=auto`.
- **Do not `try/catch` around the probe to "keep the run alive."** The probe's failure is the RIGHT answer for a broken cluster: the run should fail fast, not stall in `ui` mode against a broken surface.

## Troubleshooting

- **`Auto run starting · gates: local (source: --gates=auto → probe-failed)` appears when I expected `ui`**: the cluster's gate-query surface returned a non-`ok` status. Read the immediately-preceding `preflight · gate-query-probe · error: <class> — <detail>` ledger row to see the class and detail. Under `<class> = internal`, the cloud endpoint is likely 404 (the generacy-cloud#877 gap). Under `<class> = query-unreachable`, the surface is unreachable or timing out — check cluster health. Under `<class> = invalid-args`, there is a plugin-side caller bug (file a regression). Under `<class> = transport`, the MCP call never reached the query surface — check the cluster's cockpit process.

- **The FR-013 template line prints but no ledger row appears**: check that the ledger directory was created. Under Form 4 the ledger header emits at F4.7; under Forms 1/2/3 it emits at the top of step 3. The probe fires AFTER the ledger header exists, so a missing ledger row means either the amendment (§ Ledger clause amendment for probe rows) was not applied to auto.md or there is a bug in the ledger primitive itself.

- **The run exits non-zero under `--gates=ui` when I thought the cluster was fine**: run `/cockpit:auto --gates=local <epic-ref>` — if that succeeds, the gate-query surface is broken but the local mode does not care. Or run `/cockpit:auto --gates=auto <epic-ref>` — that resolves to `local` on probe failure and completes the run in local mode. Or manually curl the gate-query endpoint to reproduce the failure without going through `/cockpit:auto`.

- **The probe fires twice in the same run**: this is a regression — the probe must fire at most once per run per FR-010. File a bug and cite pin 459-12.

- **The probe fires under `--gates=local` (explicit) or `--gates=auto → local` (short-circuited)**: this is a regression — the probe must not fire under either case per FR-007 and FR-005. File a bug and cite pin 459-10.

## Related documents

- Spec: [spec.md](./spec.md)
- Clarifications: [clarifications.md](./clarifications.md)
- Plan: [plan.md](./plan.md)
- Research (rationale + Q1–Q5 anchors): [research.md](./research.md)
- Data model (types + validation rules): [data-model.md](./data-model.md)
- Contracts: [gate-query-probe.md](./contracts/gate-query-probe.md), [auto-resolution-fold-in.md](./contracts/auto-resolution-fold-in.md), [error-line-formatter.md](./contracts/error-line-formatter.md)
- Playbook: `packages/claude-plugin-cockpit/commands/auto.md`
- Pins: `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (`describe("459 pre-flight functional probe", ...)` — added by this feature)
- Reference formatter: `packages/claude-plugin-cockpit/lib/gate-status-check.ts § formatGateQueryProbeErrorLine` (added by this feature; mirrors the shape of the existing `formatPreDraftCheckErrorLine` from #457)
- Upstream: [generacy-ai/generacy#1038](https://github.com/generacy-ai/generacy/issues/1038) (blocking dependency — provides the two gate-query MCP tools and the four-class error taxonomy)
- Related deployment gap: [generacy-ai/generacy-cloud#877](https://github.com/generacy-ai/generacy-cloud/issues/877) (the 404 that exposed this bug; out of scope for this feature)
- Epic: [generacy-ai/generacy-cloud#850](https://github.com/generacy-ai/generacy-cloud/issues/850)
- Motivating incident: cluster `snappoll-local-2`, 2026-07-25
