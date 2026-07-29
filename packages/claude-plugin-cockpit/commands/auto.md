---
description: Drive one or more issues — an epic, a tracking-issue scope, or an ad-hoc issue list — to terminal by dispatching Monitor-delivered wake-ups through cockpit_await_events with fused human gates
arguments:
  - name: tracking-ref
    description: "Tracking reference — one of: <epic-ref> positional (`owner/repo#N`), `--tracking <issue-ref>`, `--new \"<title>\"`, or an <issue-list> of one or more comma/whitespace-separated refs (bare `N` resolves against the workspace repo, or qualified `owner/repo#N`). Exactly one form per invocation."
    required: true
---

# Auto Command

Drive the named tracking ref (an epic, an existing tracking issue, or a newly filed tracking issue) to terminal state by dispatching Monitor-delivered wake-ups through `cockpit_await_events` and routing to the six existing assist commands' *actions* (MCP tool calls + subagent hops), never the assist commands themselves. The loop shape is: **pre-flight (incl. `Monitor` presence check) → arm `generacy cockpit doorbell <epic-ref>` under harness `Monitor` (sensor) → startup sweep (tool-presence check + synthetic-event dispatch) → per wake (Monitor line OR ScheduleWakeup heartbeat fire): drain typed batch via `cockpit_await_events(epic|issue, cursor, maxWaitMs=1, coalesceWindowMs=3000)` → consume batch in stream order → per event: re-check live state → dispatch → write one ledger line → advance in-memory cursor → arm next heartbeat → wait for next wake → exit on terminal state (`epic-complete` in epic mode, G.7 scope-drained `Finish` in epic-less mode).** Two hard boundaries are load-bearing: **never merge on red** (validate + green is mechanical; anything red routes through the bounded-fixer branch and, if still red, an escalation gate) and **every gate prompts** (per-gate auto-approve / "full auto" is explicitly out of scope). Analysis lives in subagents (`subagent_type: "general-purpose"`) whose contracts return strict JSON per hop; the parent loop stays thin.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments + pre-flight.** Recognize exactly one of four invocation forms per invocation — the tracking ref is the run's identity under all four forms (see `contracts/invocation-forms.md` for Forms 1–3; `specs/444-summary-cockpit-auto-accept/contracts/invocation-form-4-parse.md` for Form 4):

   - **Form 1 (epic mode)**: `/cockpit:auto <epic-ref>` — one positional matching `<owner>/<repo>#<n>`. `invocationForm: epic`. D.8 phase-queue gate fires on `phase-complete`; run exits on `epic-complete`.
   - **Form 2 (epic-less: existing tracking)**: `/cockpit:auto --tracking <issue-ref>` — `--tracking` flag with one positional matching `<owner>/<repo>#<n>`. `invocationForm: tracking-existing`. G.7 scope-drained gate fires when every task-list ref is terminal per `cockpit_status`.
   - **Form 3 (epic-less: new tracking)**: `/cockpit:auto --new "<title>"` — `--new` flag with one quoted free-text title. `invocationForm: tracking-new`. **G.6 filing gate fires immediately** (drafts title/body from the operator-supplied `<title>` — same drafter shape as a mid-run file-new intent — presents G.6; on `Approve & file`, `gh issue create` produces the tracking ref; on `Skip (don't file)`, the run exits cleanly). Subsequent behavior identical to Form 2.
   - **Form 4 (epic-less: issue-number list)**: `/cockpit:auto <issue-list>` — one or more comma/whitespace-separated GitHub issue references (bare integers resolve against the workspace repo, or qualified `owner/repo#N`; mix freely). `invocationForm: tracking-list` on fresh creation; `tracking-existing` when an open `cockpit:tracking` issue in the workspace repo has the identical resolved ref-set. Form 4 machine-generates the tracking issue's title, body, and label — no G.6 gate — then falls through to Form 2's loop shape. See § Form 4 branch below for the parse/resolve/validate/reuse/create pipeline.

   **`--gates=<value>` (orthogonal flag; V1 parse)**. Accepted alongside any of Forms 1–4. Values: exactly one of `ui` / `local` / `auto`. Default when absent: `auto`. Parsed exactly once at step-1 pre-flight; a duplicate `--gates=*` in the argument stream → usage error with reason `gates-duplicate`; a value outside `{ui, local, auto}` → usage error with reason `gates-value-invalid (<observed>)`. Both errors fall through the § step-1 ambiguity-table exit pattern (below) — same `Usage: /cockpit:auto …` print + non-zero exit as any other Form 1–4 ambiguity. Contract: `contracts/gates-flag-parse.md`. Semantics per resolved value: `--gates=local` preserves today's byte-path exactly (no `cockpit_gate_open` calls, no `openGates` map, no D.12 dispatch, no `· source: ui-gate` ledger suffix); `--gates=ui` forces UI mode (see § UI-mode gate mapping) and hard-fails at pre-flight if any of `cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` is absent from the session's MCP tool binding (below, before ledger directory creation — the widened three-tool check is what stops a partial-deployment cluster with only `cockpit_gate_open` bound from slipping through to an unbound `cockpit_gate_list` at the deferred pre-flight probe); `--gates=auto` resolves per the three-part check below (`cockpit_gate_open` AND `cockpit_gate_status` AND `cockpit_gate_list` ALL bound AND cluster cloud-activated AND pre-flight functional probe pass → `ui`; else `local`), decided ONCE per run (items 1–2 at parse-time pre-flight; item 3 after the ledger header write) and does not flip mid-loop.

   **Ambiguity table** (extends `contracts/invocation-forms.md`; per `specs/444-summary-cockpit-auto-accept/research.md § R9`):

   | Input pattern | Form | Notes |
   |---------------|------|-------|
   | One positional matching `<owner>/<repo>#<n>` and no flags | 1 (epic) | Unchanged — qualified single ref keeps epic-mode meaning. |
   | `--tracking <owner>/<repo>#<n>` | 2 | Unchanged. |
   | `--new "<title>"` | 3 | Unchanged. |
   | Any other non-flag positional stream (bare numbers, mixed lists, multiple qualified refs, single bare number) | **4** | New. |
   | Both `--tracking` and `--new` present | usage error | Existing — reason `both-flags`. |
   | A flag combined with a positional list | usage error | New — reason `tracking-arg-shape` / `new-arg-shape`. |
   | Unknown `--*` flag (e.g. `--tracing`) | usage error | New — reason `unknown-flag`. Do NOT guess intent. Note: `--gates=<value>` is now recognized (see the `--gates` flag row above and the two `--gates`-specific rows below); it is no longer an unknown flag. |
   | Zero non-empty tokens after splitting | usage error | New (Q5=A boundary) — reason `empty`. |
   | `--gates=<value>` where `<value>` ∉ `{ui, local, auto}` | usage error | New — reason `gates-value-invalid (<observed>)`. |
   | Multiple `--gates=*` flags | usage error | New — reason `gates-duplicate`. |

   On any usage error, print the two-line usage string verbatim (extended in R1 to include the `--gates` flag) and exit non-zero — optionally followed by a `Reason: <reason> (<detail>)` line naming the ambiguity-table row:

   ```
   Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
          [--gates=ui|local|auto]  (default: auto)
   ```

   ### `--gates` resolution and pre-flight absence

   The `--gates` resolution runs in **two phases** with the ledger header write as the dividing line — items 1 and 2 of the `--gates=auto` three-part check plus the `--gates=ui` pre-flight absence check are evaluated at parse time, BEFORE any of ledger directory creation, ledger header write, the Form 4 workspace-repo inference (F4.1 below), or the `cockpit_*` tool-presence check (step 3 startup sweep — seven baseline tools always, plus `cockpit_gate_status` / `cockpit_gate_list` only under `ResolvedGateMode === "ui"`). Item 3 (the functional probe) is DEFERRED and fires AFTER the ledger header line is written (Forms 1/2: after the header write in main step 1 below; Form 3: after G.6 approval writes the header; Form 4: after F4.7 writes the header). This two-phase split is load-bearing — the probe writes a ledger row on both pass and fail (per § Pre-flight probe (UI mode) below), and a ledger row requires the ledger header to already exist as the first line of the ledger file (per § Ledger `Narrow amendment` and line 199 below). Contract: `contracts/gates-flag-parse.md`. Reference: `cockpit-remote-gates-plan.md § Skill-side presence check`.

   **`--gates=auto` resolution (three-part check, decided ONCE)**. When the parsed value is `auto`, resolve to `ResolvedGateMode` via a three-part check — items 1 and 2 evaluated at parse-time pre-flight, item 3 (the probe) deferred until AFTER the ledger header is written (per § `--gates` resolution and pre-flight absence above):

   1. **Tool binding**: Are `cockpit_gate_open`, `cockpit_gate_status`, AND `cockpit_gate_list` ALL present in the session's MCP tool binding? (same shape as the `cockpit_*` tool-presence check at step 3 below under `ResolvedGateMode === "ui"` — these three tools are the complete UI-mode-only set that landed together in generacy#1038, and a partial deployment where `cockpit_gate_open` is bound but the query tools are not can arise on clusters mid-upgrade; requiring all three here — rather than only `cockpit_gate_open` — is what keeps item 3 from invoking an unbound `cockpit_gate_list` under item 1 = YES on a pre-#1038-query-tools cluster.)
   2. **Cluster cloud-activation**: Is the cluster cloud-activated? Query surface pinned by the epic — implementation piggybacks on either the doorbell handshake or a startup field returned by `cockpit_context` (per `cockpit-remote-gates-plan.md § Skill-side presence check`).
   3. **Pre-flight functional probe**: Does the gate-query surface actually WORK? Issue exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call and treat any `status: 'error'` return as failure. See § Pre-flight probe (UI mode) below for the probe call shape, pass/fail ledger rows, and the operator-facing failure line. **Short-circuit rule (load-bearing)**: issue item 3 ONLY when items 1 AND 2 both pass; otherwise resolve to `local` with NO probe call and NO probe ledger row. Rationale: `--gates=auto` → `local` is pinned as byte-identical to explicit `--gates=local`, and `--gates=local` never calls `cockpit_gate_list`; issuing the probe under the short-circuit paths would make the byte-paths differ observably AND would call a tool the § step-3 conditional tool-presence check does not require to be bound under `local`.

   If items 1 AND 2 AND 3 all pass → `ResolvedGateMode = ui`. If item 3 alone fails (items 1–2 both passed) → `ResolvedGateMode = local` with the `probe-failed` resolution reason (the probe's fail ledger row is written after the header) — EXCEPT when a remote UI gate has already been consumed in the TENTATIVE window (see § TENTATIVE window gate-presentation rule below), in which case the run hard-fails with resolution reason `probe-failed-after-remote-gate-consumed` and does NOT downgrade (a downgrade with a consumed remote UI gate on record would produce the ambiguous partial-UI / partial-local ledger this decision-once discipline exists to prevent). If EITHER of items 1–2 is NO → `ResolvedGateMode = local` (byte-identical to explicit `--gates=local`; no probe issued, no probe ledger row). The resolution is decided ONCE per run — items 1–2 are decided at parse-time pre-flight, item 3 is decided post-header-write; between the two decision points the resolution is TENTATIVE (`ui pending probe` when items 1–2 both YES; `local` otherwise), but it does not flip mid-loop — the probe is issued at most once per run (per FR-010) and both static inputs are session properties; a mid-loop flip would produce an ambiguous partial-UI / partial-local ledger. When `--gates=ui` is explicit, this three-part check is skipped and `ResolvedGateMode = ui` unconditionally (the absence check below covers tool-binding failure at parse time; the § Pre-flight probe (UI mode) below fires as an additional post-header assertion under explicit `ui` on the same call site and hard-fails the run on any probe error).

   ### TENTATIVE window gate-presentation rule

   Between the parse-time decision (items 1–2) and the post-header probe (item 3), `ResolvedGateMode` is TENTATIVE (`ui pending probe` when items 1–2 both YES; `local` otherwise). Any gate that fires during this window presents under the TENTATIVE mode — UI (per § UI-mode gate mapping) when items 1–2 both YES, LOCAL (per § Gate contract) when either failed. Under current sequencing, **ONLY Form 3's G.6 filing gate** (line 25 — fires immediately at step 1, before the tracking ref exists and therefore before the probe can be issued) fires in this window; Forms 1 and 2 bind the identity ref at parse time and the probe runs before any gate can fire, and Form 4 has no gate before F4.7 (which is also the header write, so the probe fires immediately after F4.7 and still before any gate).

   **Form 3 hard-fail path (`--gates=auto`, items 1–2 both YES → TENTATIVE UI)**: G.6 opens remotely via `cockpit_gate_open` (per § UI-mode gate mapping row 9); on `Approve & file` the tracking ref exists and the header is written; the probe then fires per § Pre-flight probe (UI mode) below. If the probe fails, do **NOT** downgrade to `local` — the remote UI gate has already been consumed, and a `gates: local` ledger with a `· source: ui-gate` G.6 resolution row above it would be exactly the ambiguous partial-UI / partial-local ledger the decision-once discipline exists to prevent. Instead, treat the failure as a hard-fail on the same terms as an explicit `--gates=ui` probe failure: write the probe's fail ledger row, print the operator-facing line (per § Pre-flight probe (UI mode) → Fail path), and exit non-zero. The fail ledger row uses resolution reason `probe-failed-after-remote-gate-consumed` (distinct from the plain `probe-failed` used on the downgrade path — grep recipes distinguish the two). The `Auto run starting …` line is NOT emitted (the run refuses to proceed past pre-flight for a run that has already committed to UI and cannot cleanly complete). If G.6 was `Skip (don't file)` no remote gate was consumed and no header exists — Form 3 exits cleanly at G.6 skip regardless of gate mode, so this path is unreachable in the skip branch.

   **Form 3 downgrade path remains available in exactly one case**: `--gates=auto` where item 1 OR item 2 failed at parse time → TENTATIVE LOCAL — G.6 presents locally (per § Gate contract), no remote gate is ever consumed, the probe is not issued (short-circuit rule above), and `ResolvedGateMode = local` finalizes with the standard `ui-mode tools unbound` / `cluster not cloud-activated` reason. This is byte-identical to explicit `--gates=local` per the invariant above.

   **`--gates=ui` pre-flight absence (Q3=A — hard-fail, Print + exit)**. When the parsed value is `ui` (explicit) AND any of `cockpit_gate_open`, `cockpit_gate_status`, or `cockpit_gate_list` is absent from the session's MCP tool binding at this pre-flight point, print the verbatim error string and exit non-zero — matching the step-3 `cockpit_*` tool-presence check's `Print + exit` precedent (below). Requiring all three UI-mode tools here — rather than only `cockpit_gate_open` — is what prevents the § Pre-flight probe (UI mode) below from later invoking an unbound `cockpit_gate_list` on a partial-deployment cluster:

   ```
   --gates=ui specified but one or more of cockpit_gate_open / cockpit_gate_status / cockpit_gate_list is not available in this session; re-invoke with --gates=local or --gates=auto
   ```

   Exit non-zero. Do **NOT** create the ledger directory (`mkdir -p .generacy/cockpit/auto-runs`). Do **NOT** write the ledger header line (`Tracking ref: <ref> · form: <form>`). Do **NOT** emit the `Auto run starting …` line. The operator sees only the error string. Rationale: `--gates=ui` is an explicit operator override the environment cannot satisfy; a silent whole-run downgrade would reintroduce exactly the session-blocking behavior that `--gates=ui` was chosen to escape, and a prompt whose every option means "abort" is not a decision. Under `--gates=auto` the same tool-binding absence resolves silently to `local` (per the three-part check above); the hard-fail is specific to explicit `ui`. Distinct from US4 fallback: absence at pre-flight is a static session property (hard-fail); `cockpit_gate_open` **error at call time** is transient and covered by the per-gate `UI-mode fallback` block below (see § UI-mode fallback on `cockpit_gate_open` call error).

   **`--gates=ui` pre-flight functional probe (post-tool-binding, post-identity-ref, post-header-write)**. When the parsed value is `ui` (explicit) AND the three-tool absence check above passed (`cockpit_gate_open`, `cockpit_gate_status`, `cockpit_gate_list` all bound) AND the identity ref is bound (Forms 1/2 at step-1 parse time; Form 3 after G.6 approval; Form 4 after F4.6 fresh creation OR F4.4 reuse — see § Form 4 sequencing rule below) AND the ledger header has been written (Forms 1/2: at the line-199 header write in main step 1 below; Form 3: at the post-G.6 header write; Form 4: at F4.7), issue the pre-flight probe per § Pre-flight probe (UI mode) below. The post-header ordering is load-bearing — the probe writes a ledger row on both pass and fail (per § Ledger `Narrow amendment`), and a ledger row requires the ledger header to already exist as the first line of the ledger file. **Hard-fail on ANY probe error** (any `class` from the four-class taxonomy): write the probe's fail ledger row (safe now that the header exists), print the operator-facing line, and exit non-zero. Do NOT start the loop. Do NOT fall back to `local` — a `ui` run that quietly becomes `local` would re-introduce the duplicate-drafting hazard the pre-draft check exists to remove, and the operator asked for UI gates.

   ### Pre-flight probe (UI mode)

   The pre-flight functional probe issues **exactly one** read-only `cockpit_gate_list` call at pre-flight to verify that the gate-query surface actually WORKS (not just that its tools are BOUND). Fires from exactly ONE call site — this pre-flight step, deferred until AFTER the ledger header line has been written for the run's form (Forms 1/2: after the header write in main step 1 below; Form 3: after G.6 approval's header write; Form 4: after F4.7) — under both explicit `--gates=ui` (as an additional assertion after the three-tool absence check) AND under `--gates=auto`'s three-part check item 3 (only after items 1 and 2 have both passed at parse time; the short-circuit rule above governs when it is issued). The post-header sequencing is load-bearing (per § `--gates` resolution and pre-flight absence above): the probe writes a ledger row on both pass and fail, and a ledger row can only be safely written after the ledger directory has been created (`mkdir -p .generacy/cockpit/auto-runs`) and the header line has been written as the first line of the ledger file. Under `--gates=local` (explicit OR `--gates=auto` short-circuited to `local`) the probe is NOT issued and NO probe ledger row is written — the two query tools are not required under `local` (per the § step-3 conditional tool-presence check), and a `local` run MUST NOT fail on a tool it never calls. The probe is issued AT MOST ONCE per run — no per-event re-probing (FR-010); the per-event pre-draft gate-status check (§ Pre-draft check — shared rules; § Dispatch step 0) is a distinct concern that consumes the same tools with the same error taxonomy.

   **Call shape** — exactly one MCP call, using the identity ref bound above AND the pre-flight-derived `runId` (per § Pre-flight `runId` derivation above; contract: `contracts/runid-probe.md`). The `runId` field is passed here — this is the SOLE `cockpit_gate_list` call in the run that carries `runId` (functional `cockpit_gate_list` calls never carry it, per FR-011 / R4 / `contracts/runid-threading.md § Read-side (cockpit_gate_list)`). The probe is safe precisely because Phase B's handler (generacy#1067 commit `82077f1a`) drops the field before the cloud call, full stop — the cloud never receives `runId` on this probe regardless of whether the deployed cloud version still enforces the `runId requires generation` refine (pre-generacy-cloud#894) or has moved to run-filtered list mode (post-#894 — in which the field would silently narrow the list rather than 400). Tracked at generacy#1080.

   ```
   cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted>, runId: <runId> })
   ```

   The identity ref is the value written into the ledger header's `Tracking ref:` field — under Form 1 the epic ref, under Forms 2/3/4 the `trackingRef`. `gateType` is OPTIONAL on `CockpitGateListInputSchema` (per generacy `mcp/gates/query-schemas.ts`); omitting it returns every non-terminal gate for the identity ref across all gateTypes, which is strictly stronger than probing one `gateType`. Empty `gates: []` on a fresh identity ref is a perfectly good pass — the probe verifies the surface enumerates at all, not that any gate is present. `cockpit_gate_status` is NOT called by the probe (it requires `{issueRef, gateType, generation}` and there is no natural probe target for a functional health check).

   **`runId` capability outcome — `runIdEnabled` decided ONCE here, whole-session, MUST NOT flip mid-run (V5 / FR-012).** The probe's return decides `runIdEnabled` for the entire session and stores it on the § In-memory loop state additions block. Every downstream reference site reads that stored value verbatim; NO mid-run re-check fires; a mid-run gate verb returning `invalid-args` on `runId` does NOT downgrade — that would produce a mixed-identity run (the startup sweep opens gates via `cockpit_gate_open` BEFORE any Step-0 check runs; reverting the read side after opens would orphan sweep-opened 4-segment gates for the rest of the session). The four-branch classification of the probe return maps onto the existing four error classes plus one new graceful-degradation branch (`invalid-args`):

   - **`{ status: 'ok', data: … }`** → `runIdEnabled := true` (cluster is generacy#1067+; write the pass ledger row per § Pre-flight probe row shapes and continue exactly as today).
   - **`{ status: 'error', class: 'invalid-args', … }`** → **`runIdEnabled := false` (graceful degradation, NOT a probe failure).** The cluster's cockpit MCP server does NOT accept `runId` on `cockpit_gate_list` — the `.strict()` schema on a pre-#1067 cluster rejects the field. This is DIFFERENT from every other error class: `invalid-args` on a `.strict()` schema is definitionally a "known-unknown" — the tool server told us it does not recognize the field. The surface WORKS; the capability is ABSENT. This branch is a NEW asymmetry vs. today's probe (which treated every error class the same → probe-failed) and applies IN ADDITION TO today's four-class routing at every OTHER class. Write the PASS ledger row per § Pre-flight probe row shapes (not the fail row — the surface is healthy), then log the startup warning verbatim (below) and continue the run under today's 3-input identity. generacy#1053 (re-run terminal gates) stays unfixed for this session — the warning says so.
   - **Every other error class (`query-unreachable`, `internal`, `transport`, or an unrecognized class token)** → retain today's routing verbatim (unchanged behaviour). Explicit `--gates=ui` hard-fails the run; `--gates=auto` (items 1–2 both YES) resolves to `local` with `<resolution reason> = probe-failed`; Form-3 TENTATIVE UI window hard-fails with `probe-failed-after-remote-gate-consumed`. `runIdEnabled` is NOT set (the run does not continue in UI mode; the `local` downgrade paths default `runIdEnabled` to `false` via § In-memory loop state additions below).

   **Startup warning (verbatim, load-bearing — fires on the `invalid-args` graceful-degradation branch only, per FR-012):**

   ```
   runId threading disabled for this session — cluster's cockpit MCP server does not accept runId on cockpit_gate_list (pre-generacy#1067). Run continues under today's 3-input gate identity; generacy#1053 (re-run terminal gates) will not be fixed for this session. Upgrade the cluster's generacy build to ≥ commit 82077f1a to enable runId threading.
   ```

   The warning is printed to the transcript (no `[ledger] ` prefix) and is NOT appended to the ledger file — its purpose is to make the graceful-degradation branch operator-visible so the operator understands why generacy#1053 stayed unfixed for this session. A future edit that removes the warning re-introduces the silent-degradation hazard `runIdEnabled` was designed to make loud.

   **Cross-schema inference (safe under Phase B, generacy#1067 `82077f1a`).** The probe tests `CockpitGateListInputSchema`, but the dependency in FR-009 is `CockpitGateStatusInputSchema`. Both live in `mcp/gates/query-schemas.ts` and both gained `runId` in the same commit `82077f1a`, so no deployment can split them. Similarly, `CockpitGateOpenInputSchema` and `CockpitGateAckInputSchema` live in `mcp/gates/schemas.ts` and gained `runId` in the same Phase B commit — a cluster whose list schema accepts `runId` also accepts `runId` on open, ack, and status. The 1:1 inference is by construction; if a future deployment splits the four schemas, this assumption breaks and the spec's Assumptions section must be revisited.

   **Pass path** (`{ status: 'ok', data: { gates: [...], truncated?: ... } }`) — write exactly one ledger row (verbatim shape):

   ```
   <identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe
   ```

   Then proceed to § step 3 (under explicit `--gates=ui`, set `ResolvedGateMode = "ui"`; under `--gates=auto` items 1–2 also passed, so item 3's pass finalizes `ResolvedGateMode = "ui"`). The FR-005 "one pointer line" is NOT printed for a passing probe — the probe is functional health, not an operator-visible affordance; the observable output on the pass path is one ledger row.

   **Fail path** (`{ status: 'error', class, detail }` for any of the four classes `query-unreachable` / `invalid-args` / `internal` / `transport` per § Pre-draft check — shared rules → Gate-query error taxonomy) — regardless of which mode invoked the probe. Ordering is load-bearing: the ledger header (`Tracking ref: …`) has already been written as the first line of the file BEFORE the probe fires, so the fail row below is the second (or later) line — the header-first invariant per line 199 is preserved:

   1. Write the fail ledger row (verbatim shape) — appended after the header:
      ```
      <identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe
      ```
      **Exceptional outcome shape (Form-3 TENTATIVE UI window, per clause 4 below)** — when a remote UI gate has already been consumed in the TENTATIVE window (currently only reachable via Form 3's G.6 firing under `--gates=auto` with items 1–2 both YES; per § TENTATIVE window gate-presentation rule above), the fail row's outcome slot is augmented in-place by folding an `(aborted: probe-failed-after-remote-gate-consumed)` marker between `<detail>` and the ` · source:` suffix — NO additional row is written, so the "at most one probe row is written per run" invariant (per § Ledger `Pre-flight probe row shapes`) stays true and the registered `gate-query-probe` action + `ui-gate-probe` source vocabulary is reused unchanged. The augmented shape (verbatim):
      ```
      <identity-ref> · preflight · gate-query-probe · error: <class> — <detail> (aborted: probe-failed-after-remote-gate-consumed) · source: ui-gate-probe
      ```
   2. Print the operator-facing line — a single frozen template with `<class>` / `<detail>` placeholders (per FR-013), produced by `lib/gate-status-check.ts § formatGateQueryProbeErrorLine`:
      ```
      gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
      ```
      Where `<class>` is one of `query-unreachable` / `invalid-args` / `internal` / `transport` and `<detail>` is the tool's `detail` field verbatim. All four classes share this ONE template; any change to the wording requires re-pinning the playbook prose AND the formatter's fixture-equality tests. The em-dash (`—`, U+2014) between `<detail>` and `re-run with…` is intentional; no trailing period.
   3. **Under explicit `--gates=ui`** → exit non-zero. Do NOT start the loop. Do NOT fall back to `local`. The ledger directory + header + fail row remain on disk as the audit record of the aborted run; NO `Auto run starting` line is emitted (the run refuses to proceed past pre-flight).
   4. **Under `--gates=auto`** → resolve to `local` with `<resolution reason> = probe-failed` — the probe's fail ledger row (above) has already been written with the STANDARD outcome shape; the `Auto run starting · gates: local (source: --gates=auto → probe-failed)` line is emitted immediately after the fail row per the line's format below, and the run proceeds through § step 3 in `local` mode. **Exception (Form 3, TENTATIVE UI window)** — when a remote UI gate has already been consumed in the TENTATIVE window (currently only reachable via Form 3's G.6 firing under `--gates=auto` with items 1–2 both YES; per § TENTATIVE window gate-presentation rule above): do NOT downgrade to `local`. Under this exception, the probe's fail ledger row is written using the **augmented outcome shape** described in step 1 above (with `(aborted: probe-failed-after-remote-gate-consumed)` folded into the outcome slot between `<detail>` and the ` · source:` suffix) — no additional row is written, preserving the "at most one probe row per run" invariant per § Ledger `Pre-flight probe row shapes` and reusing the registered `gate-query-probe` action + `ui-gate-probe` source vocabulary already registered by § Ledger `Preflight vocabulary additions`. Then exit non-zero on the same terms as clause 3 above — do NOT start the loop, do NOT emit the `Auto run starting` line, do NOT fall back to `local`. The consumed remote G.6 answer remains on disk as an audit record of the aborted partial-UI run; the operator's next invocation starts fresh (a new tracking issue for Form 3, since the G.6 filing already produced one — or `--tracking <ref>` against the just-filed ref to resume, once the cluster gate-query surface is fixed).

   **Form 4 sequencing rule (load-bearing)**. Under Form 4 the probe fires AFTER F4.6/F4.4 has bound `trackingRef` AND AFTER F4.7 has written the ledger header, NOT alongside items 1–2 of the `--gates=auto` three-part check at step-1 parse time. Two inputs are required for the probe call to be safe: the identity ref (bound by F4.6/F4.4) is a required input to the probe call itself, and the ledger header (written by F4.7 as the first line of the ledger file) is required for the probe's pass/fail row to be appendable. Under `--gates=auto` items 1–2 are evaluated at step-1 parse time as usual; item 3 (the probe) is DEFERRED until F4.7 completes and then evaluated (short-circuit rule still applies — if items 1–2 already decided `local`, item 3 is not issued regardless of when F4.7 completes). Under Forms 1/2/3 the identity ref is bound at parse time (Form 1: `<epic-ref>` positional) or by G.6 approval (Form 3: mid-step-1); the probe fires after the ledger header write for the form (Forms 1/2: at line-199 header write; Form 3: at post-G.6 header write). Under explicit `--gates=ui` under Form 4 the probe likewise fires after F4.7, following the same post-tool-binding, post-identity-ref, post-header-write ordering.

   **No probe under `--gates=local`** (invariant). Under `--gates=local` (explicit) OR `--gates=auto` short-circuited to `local` (items 1 or 2 failed), NO probe is issued AND NO probe ledger row is written. The two query tools (`cockpit_gate_status`, `cockpit_gate_list`) are not required under `local` per the § step-3 conditional tool-presence check; a `local` run MUST NOT call — and MUST NOT fail on — a tool it never uses. The `--gates=auto` → `local` short-circuit path is pinned as byte-identical to explicit `--gates=local` (per `contracts/gates-flag-parse.md`); any pin that would produce a probe ledger row on the short-circuit path is a regression.

   **Timeout budget**. No new skill-side timer. The probe inherits the query-client's `timeoutMs` (default 5000ms per attempt) × `QUERY_RETRY_SCHEDULE` (3 attempts + ~5s backoff, ~20s worst case). A timeout maps to the existing `query-unreachable` class via `fetchOnce` → `QueryTransportError` → `withRetry` exhaustion — the same path the per-event pre-draft check uses. No new class in the taxonomy, no dedicated `probe-timeout` special-case.

   ### Form 4 branch — parse, resolve, validate, reuse, create

   Runs at the top of pre-flight, BEFORE the `Monitor`-presence check (below) and BEFORE any ledger directory creation. All state-changing actions (`gh label create`, `gh issue create`, `mkdir -p .generacy/cockpit/auto-runs`, ledger header write) fire ONLY after parse + workspace-resolve + ref-validate + reuse-detect all succeed. Reference implementation: `packages/claude-plugin-cockpit/lib/invocation-form-4.ts` — the prose below is authoritative; the library exists for machine-checkable fixtures.

   **F4.1 — Workspace repo inference (R1).** Run `git remote get-url origin` via Bash in the operator's cwd. Capture stdout/stderr and exit code. This step MUST run in the operator's Claude Code session (before any MCP tool binds); the cockpit MCP server runs in the orchestrator container whose cwd is meaningless for workspace inference.

   - On non-zero exit (not a git repo, or `origin` unset), print + exit:
     ```
     /cockpit:auto Form 4 needs a workspace with a GitHub `origin` to resolve bare issue numbers.
     Observed: `git remote get-url origin` failed with: <stderr>
     ```
   - On zero exit, parse the URL against the three GitHub remote shapes (HTTPS `https://github.com/<owner>/<repo>(.git)?`, SSH shorthand `git@github.com:<owner>/<repo>(.git)?`, SSH long form `ssh://git@github.com/<owner>/<repo>(.git)?`). On no match, print + exit:
     ```
     /cockpit:auto Form 4 needs a workspace whose `origin` is a GitHub repo. Observed: <originUrl>.
     ```

   **F4.2 — Token resolution + dedup (Q3=A, Q5=A).** Split `$ARGUMENTS` on commas + whitespace (`split(/[,\s]+/).filter(t => t.length > 0)`) — empty tokens discard silently (Q5=A). For each remaining token: bare integer (`^\d+$`) → `{owner: workspace.owner, repo: workspace.repo, number, supplied: "bare"}`; qualified `owner/repo#N` → parse the three groups directly. Dedup the resulting `QualifiedRef[]` in first-seen order using `(owner, repo, number)` tuple equality (Q3=A) — a bare `512` and a qualified `<workspace>/<repo>#512` collapse to one entry.

   **F4.3 — Up-front ref validation (Q4=A).** For each resolved ref, probe via `gh api -X GET repos/<owner>/<repo>/issues/<number> --silent --include`. Success codes: `200`, `301`. Any other status → collect into `bad[]`. Probes run sequentially (never parallel — GitHub abuse-detection tolerates sequential fine for realistic ref-list sizes). Do NOT short-circuit on the first miss; probe every ref, then decide. On `bad.length > 0`, print the aggregated diagnostic and exit — atomic (create nothing) per Q4=A:

   ```
   Cannot create tracking issue — the following refs are missing or inaccessible:

     - <owner>/<repo>#<n>   (<reason>)
     - <owner>/<repo>#<n>   (<reason>)
     ...

   Fix or remove these refs and re-run.
   ```

   **F4.4 — Reuse detection (Q2=B).** Query workspace-scoped open tracking issues: `gh issue list --repo <workspace.owner>/<workspace.repo> --label cockpit:tracking --state open --json number,body,createdAt`. If the query itself fails (network, auth, 5xx), do NOT fall through to creation — print + exit with the "connectivity" diagnostic and suggest `--tracking <ref>` as the bypass. Otherwise, for each candidate, parse `- [ ] <owner>/<repo>#<n>` lines from its body (regex `^\s*- \[ \] ([\w.-]+)\/([\w.-]+)#(\d+)\s*$`, case-sensitive, whitespace-tolerant leading, other bullet shapes ignored). Compare candidate's parsed body-refs against this invocation's resolved ref-set as an order-agnostic set on `(owner, repo, number)`.

   - **Set-match (identical)** → **reuse** (Q2=B). Print the reuse notice BEFORE the standard startup line:
     ```
     Resuming existing tracking session <owner>/<repo>#<n> (opened <YYYY-MM-DD HH:MM UTC>) — ref-set matches this invocation exactly.
     ```
     Bind `trackingRef = <owner>/<repo>#<n>`, `invocationForm = tracking-existing`. Skip F4.5–F4.6. Emit the ledger header `Tracking ref: <owner>/<repo>#<n> · form: tracking-existing · resumed: <YYYY-MM-DD HH:MM UTC>` (the `· resumed:` suffix distinguishes reuse from first-time Form 2; per contract `tracking-issue-reuse.md § R7`) and fall through to F4.7.
   - **No match / overlap-only** → proceed to F4.5. Overlapping-but-not-identical ref-sets do NOT trigger reuse or refusal (Q2 verbatim) — create a fresh tracking issue.
   - **Multiple identical matches** (should be dead code post-generacy#1015; retain as defence-in-depth) → log the warning and reuse the oldest by `createdAt`.

   **F4.5 — Label idempotency (R6).** Before `gh issue create`, ensure the `cockpit:tracking` label exists in the workspace repo:
   ```
   gh label create cockpit:tracking --color cccccc --description "Auto-created tracking issue for /cockpit:auto" --repo <workspace.owner>/<workspace.repo>
   ```
   Swallow the `label already exists` failure (idempotent success). Any other failure → print + exit per contract `tracking-issue-body.md § L1`.

   **F4.6 — Fresh tracking-issue creation (Q1=A, R5, R7, R8).** Machine-generate `TrackingIssueSeed`:
   - **Title** (Q1=A / R5): `Tracking: auto session <YYYY-MM-DD UTC> — <ref1> <ref2> ... <ref5> (+K more)`. Refs render short-form (`#N`) when workspace-local; qualified (`owner/repo#N`) otherwise. ` (+K more)` suffix appears only when `refs.length > 5`.
   - **Body** (R7): flat markdown task list, one `- [ ] <owner>/<repo>#<number>` line per resolved ref (always fully-qualified regardless of workspace-locality — the engine's resolver rejects bare `#N` in bodies). No blank lines, no headings, no `## Ad-hoc` section.
   - **Label**: `cockpit:tracking` (from F4.5).

   Write the body to `/tmp/cockpit-auto-form4-<workspace-slug>-<unix_ts>.md`, then reuse Form 3's `gh issue create` shape (from § File-new path step 4 below, line ~640):
   ```
   gh issue create --repo <workspace.owner>/<workspace.repo> --title "<title>" --body-file <tmpfile> --label cockpit:tracking
   ```
   Use `--body-file` exclusively (never `-b` / `--body`; shell quoting can strip newlines and mangle bullets). Capture the new ref from the returned URL; bind `trackingRef` and `invocationForm = tracking-list`. On non-zero exit → print + exit with the `gh issue create` stderr. Do NOT retry (a transient failure produces the same diagnostic; the operator re-invokes).

   **F4.7 — Ledger header + fall-through (R8).** Emit the ledger header line as the FIRST line of the ledger file:
   - Fresh Form 4 creation path (F4.6 succeeded): `Tracking ref: <new-ref> · form: tracking-list`. The `tracking-list` value is new — it is the fourth `form:` value (alongside `epic`, `tracking-existing`, `tracking-new`); every grep of `form:` in ledger post-mortems must find it.
   - Reuse path (F4.4 hit): `Tracking ref: <existing-ref> · form: tracking-existing · resumed: <YYYY-MM-DD HH:MM UTC>` (already emitted at F4.4).

   Then fall through to the standard startup line (below) and step 3's startup sweep. From this point on, Form 4 is byte-identical to a Form 2 invocation against `trackingRef` — no new gate, no new dispatch class, no new cursor behavior. Form 4 has no gate of its own; every failure mode above is `Print + exit`, matching the tool-presence-check precedent below (a prompt whose every option means "abort" is not a decision).

   **Print startup line** naming the tracking ref (verbatim `owner/repo#n`) and the resolved `invocationForm`; under Form 3, the startup line prints after G.6 approval, once the new tracking ref exists. Under Form 4, the startup line prints after F4.6 (fresh creation) or after the reuse notice (F4.4 hit), once `trackingRef` is bound.

   Pre-flight: **first**, check whether the harness `Monitor` tool is bound in the current session's tool binding. If `Monitor` is absent, print verbatim:

   ```
   Monitor tool is required for /cockpit:auto but is not available in this harness. Upgrade Claude Code, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
   ```

   Then exit non-zero. Do **NOT** create the ledger directory. Do **NOT** write a ledger line — the ledger file has not been created yet at this step, and pre-flight refuses to touch the filesystem for a run that can never succeed. The check is presence-only; do not attempt to distinguish "absent" from "present-but-broken" — an actually-broken `Monitor` surfaces as a spawn failure at step 2 and degrades to the C4 heartbeat-only recovery path (Q3=A — skill stays passive on doorbell-transport death). This `Monitor`-presence check MUST run before every other pre-flight check (before `command -v generacy`, before ledger-directory creation, before any state-changing tool call). Maps to FR-006 / SC-006.

   On presence, fall through: `command -v generacy` (on failure → **Error handling** class `MISSING_BINARY`).

   **Next**, probe for the engine doorbell surface with `generacy cockpit help doorbell >/dev/null 2>&1`. If the probe exits non-zero (the current `generacy` build doesn't ship the `doorbell` subcommand — the surface owned by generacy#974 hasn't landed on this cluster), print verbatim:

   ```
   Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships `generacy cockpit doorbell` (generacy#974). Upgrade the cluster's generacy build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
   ```

   Then exit non-zero. Do **NOT** create the ledger directory. Do **NOT** write a ledger line — pre-flight refuses to touch the filesystem for a run that can never succeed. Do **NOT** fall back to spawning `generacy cockpit watch` — a silent fallback would mask engine-agency version drift and re-introduce the double-poll condition this playbook exists to remove.

   On probe success, continue: `gh auth status` (on failure → **Error handling** class `AUTH_FAILURE`); confirm the operator's cwd is a writable git repo; create the ledger directory with `mkdir -p .generacy/cockpit/auto-runs` (on failure → **Error handling** class `OTHER`). Compute the run's ledger filename: `.generacy/cockpit/auto-runs/<tracking-ref-slug>-<timestamp>.ledger`, where `<tracking-ref-slug>` is the tracking reference with `/` replaced by `-` and `#` stripped, and `<timestamp>` is `YYYYMMDD-HHMMSS` in the operator's local time captured now.

   **Pre-flight `runId` derivation (load-bearing, per #469 / FR-001).** Immediately after the ledger filename is computed above, derive the run's `runId` from the SAME components used for the ledger filename stem. This step MUST run before any gate verb fires — before the § Pre-flight probe (UI mode) below, before the § step 3 startup sweep opens any gate, and before any drafting D.n dispatch. Contract: `contracts/runid-derivation.md`.

   ```
   runId := <tracking-ref-slug>-<timestamp>
   ```

   The value is the full ledger filename stem VERBATIM — the same `<tracking-ref-slug>-<timestamp>` composition the ledger filename above uses, WITHOUT the `.ledger` suffix. Example: for a Form 1 run against `generacy-ai/generacy#1053` invoked at 2026-07-29 14:30:12 local, the ledger filename is `.generacy/cockpit/auto-runs/generacy-ai-generacy-1053-20260729-143012.ledger` and `runId` is `generacy-ai-generacy-1053-20260729-143012`. Rationale for the FULL stem verbatim (not the trailing timestamp alone): only the stem greps directly against `.generacy/cockpit/auto-runs/` — a post-mortem grep of a `cockpit_gate_list` row's `runId` against the ledger directory is self-describing under the stem, cross-referencing under the timestamp alone.

   **Compute-once invariant (V2 / FR-014).** `runId` is derived exactly ONCE per run, HERE, at pre-flight. Every downstream consumer — the § step 1 § Pre-flight probe (UI mode) capability probe, the § In-memory loop state additions block, the § step 3 startup sweep's `cockpit_gate_open` calls, the § step 3 / § step 4 sub-step 0 answered-gate escape-hatch `cockpit_gate_ack(superseded)` calls, every pre-draft `cockpit_gate_status` in the six § Dispatch step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11), every live-path `cockpit_gate_open` in D.1/D.2/D.3/D.4/D.6/D.7/D.8/D.10/D.11, § D.12's `cockpit_gate_ack` calls, and every subagent dispatch prompt that spawns a gate-verb-issuing subagent — receives the pre-computed value as an EXPLICIT LITERAL. NO consumer re-derives `runId`, even by the same rule (a second derivation that agrees today can diverge under a future filename-format change or a stale-ledger race). This rule binds subagents too (per FR-015): the parent writes the literal into the dispatch prompt at dispatch time; the subagent quotes it verbatim on every gate verb it issues, NEVER reading the ledger filename or any other source.

   **No-`:` invariant (V1 / FR-013).** Assert `runId.indexOf(':') === -1`. `runId` is the trailing composite-key segment (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), and `generation` may already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`); a colon-bearing `runId` would make the tail ambiguous to anything parsing keys by position. Both candidate ledger-stem forms today are colon-free by construction (slug is `/` → `-` with `#` stripped, timestamp is `YYYYMMDD-HHMMSS`); the assertion is defence-in-depth against a future ledger-filename-format change that silently introduces one — abort pre-flight with a diagnostic naming the offending value.

   **`runId` MUST NOT be sourced from a per-process or per-MCP-connection value (FR-006).** Specifically NOT: `INSTANCE_NONCE` (rejected upstream by generacy#1055), `process.env.HOSTNAME`, `process.pid`, a random UUID at first use, or any other per-process / per-MCP-connection value. The cockpit MCP server is long-lived in the orchestrator container; per-process values are STABLE across runs — the opposite of what a run discriminator needs.

   **Under `--gates=local` this step is dead prose.** The derivation still runs (the ledger filename is computed under `local` too), but `runId` is not passed to any gate verb — `runIdEnabled === false` under `local` (per § Pre-flight probe (UI mode) below), and no gate verb fires in `local` mode anyway. The § In-memory loop state additions block declares `runId` and sets it to `null` for symmetry — see § In-memory loop state additions (UI mode) below.

   **Ledger header line** — the FIRST line of the ledger file, written above the dispatch stream: `Tracking ref: <tracking-ref> · form: <invocationForm>`. Under Forms 1 and 2 the header is written at step 1 (before the startup sweep). Under Form 3 the header is written after G.6 approval; if G.6 was skipped at the initial fire, the header carries `form: tracking-new (abandoned before creation)` and the run exits. Under Form 4 the header is written at F4.7 — `form: tracking-list` on the fresh-creation path, `form: tracking-existing · resumed: <YYYY-MM-DD HH:MM UTC>` on the reuse path. Grep for `form:` in ledger post-mortems will find all four values: `epic`, `tracking-existing`, `tracking-new`, `tracking-list`.

   **`Auto run starting …` line** (print + ledger-header extension, per `contracts/gates-flag-parse.md § --gates=auto resolution`) — printed AFTER the ledger header line (Tracking ref: … line above) AND AFTER any pre-flight probe pass/fail row (per § Pre-flight probe (UI mode) above), once `ResolvedGateMode` is finalized (both static inputs and the probe outcome are known). This line makes the resolved gate mode observable both in the transcript and near the top of the ledger file — the header remains the FIRST line of the ledger file per line 199, then any probe row (Forms/modes that fire it), then this `Auto run starting …` line. Format:

   ```
   Auto run starting · gates: <ui|local> (source: --gates=<value>[ → <resolution reason>])
   ```

   Two illustrative examples (per `quickstart.md § Expected output`):
   - Explicit `--gates=ui`, resolved to UI (tool binding + cluster cloud-activation both YES + probe pass): `Auto run starting · gates: ui (source: --gates=ui)`.
   - `--gates=auto`, resolved to local because one or more UI-mode tools are unbound: `Auto run starting · gates: local (source: --gates=auto → ui-mode tools unbound)`.

   The `→ <resolution reason>` suffix appears only when `--gates=auto` resolved down to `local` (naming which of the three-part checks failed); it is omitted for explicit `--gates=ui` / `--gates=local` and for `--gates=auto` that cleanly resolves to `ui`. The enumerated `<resolution reason>` values are: `ui-mode tools unbound` (item 1 failed — **any** of `cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` absent; the token deliberately does NOT name a single tool, because item 1 was widened to require all three and a per-tool token would assert that a specific tool is unbound when a *different* one is the missing tool — the exact partial-deployment case the widening exists to catch), `cluster not cloud-activated` (item 2 failed), and `probe-failed` (items 1–2 passed but item 3 — the pre-flight functional probe — returned an error; per § Pre-flight probe (UI mode) above, the probe's fail ledger row is written BEFORE this `Auto run starting` line, both appended after the header line). The Form-3 hard-fail reason `probe-failed-after-remote-gate-consumed` (per § TENTATIVE window gate-presentation rule above) does NOT appear in this line — that path exits non-zero without emitting `Auto run starting …`, and the reason string appears only in the probe's fail ledger row on disk. Under a `--gates=ui` pre-flight absence hard-fail (above) OR a `--gates=ui` pre-flight probe hard-fail (per § Pre-flight probe (UI mode) above) OR the Form-3 `probe-failed-after-remote-gate-consumed` hard-fail (per § TENTATIVE window gate-presentation rule above), this line is NOT emitted (the run refuses to proceed past pre-flight for a run that can never cleanly succeed).

2. **Arm the background sensor under harness `Monitor`.** Spawn `generacy cockpit doorbell <epic-ref>` under the harness `Monitor` tool at loop start. The verb's positional is named `<epic-ref>` (matching `generacy cockpit help doorbell`), but it takes the epic ref under `invocationForm: epic` or the tracking ref under `--tracking` / `--new` (matching the ledger header line's `Tracking ref:` field) — any task-list-bearing scope issue is accepted. The `Monitor.spawn(...)` call binds `monitorHandle` (see `data-model.md § In-memory loop state`) and re-invokes the model exactly when the child emits a stdout line — idle cost is zero. The stdout content is **NDJSON per-line** — the parent parses each line as a candidate enriched event per § Enriched-line dispatch contract (E2 detection gate). Enriched lines (JSON-parseable objects carrying `to` and `labels`) drive label-driven dispatch (D.1–D.4, D.7, D.9, D.9a–D.9d) and inform the D.5/D.6 merge gate via the baked `checks` verdict; bare or malformed lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback and D.8/D.10/D.11 escalation surfaces (step 4). **No ledger line for sensor arm-up** — the doorbell subprocess is engine-owned per generacy#974 (it internally attaches to the shared event-bus poll loop `cockpit_await_events` drains rather than running its own poll cycle), and skill-side arm-up produces no ledger row. The pre-#431 `watch-lifecycle · spawn · armed` row is retired along with the C5 re-spawn state machine.

   On **immediate spawn failure** (`Monitor.spawn(...)` returns a spawn error — should not happen when pre-flight passed, but may surface as a transient cluster-registration race), the skill **stays passive**: no ledger line, no re-spawn branch (Q3=A). The C4 heartbeat (step 4) is the sole recovery signal — the loop degrades to heartbeat-only cost until the engine restores the doorbell surface. Transport resilience lives behind the doorbell surface itself, not in a skill-side state machine. The cursor is unchanged from pre-#420: the first `cockpit_await_events` call in step 4 arms the in-memory cursor from the tool server's connect-time position. Maps to FR-001, FR-009, SC-004.

3. **Startup sweep.**

   **Tool-presence check (fail-loud on missing cockpit MCP tools).** At the top of the sweep, before dispatching anything, verify that the run's **required** `cockpit_*` MCP tools are present in the session's tool binding. The required set is **conditional on `ResolvedGateMode`** (per § step-1 `--gates` resolution) — the same conditional shape the § step-1 `--gates=ui` pre-flight absence check uses (`cockpit_gate_open` is required only when the resolved mode is `ui`; under `auto → local` its absence resolves the mode down instead of failing the run):

   - **Always required — the seven baseline tools (all modes, `ui` and `local` alike)**: `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`.
   - **Required ONLY when `ResolvedGateMode === "ui"` — the two gate-query tools (generacy#1038)**: `cockpit_gate_status`, `cockpit_gate_list`. Under `ResolvedGateMode === "local"` these two are **NOT** required and their absence is **NOT** an error: they are called from two sites under `ui` — (a) § step 1 § Pre-flight probe (UI mode), which fires exactly once per run against `cockpit_gate_list`, and (b) § Dispatch step 0, the per-event pre-draft gate-status check, which fires per drafting event against both — and both sites are skipped entirely under `local`. Requiring them unconditionally would hard-abort every `--gates=local` run (and every `--gates=auto` run that resolved to `local`, which is the default) on any cluster predating generacy#1038, breaking the § step-1 guarantee that `--gates=local` "preserves today's byte-path exactly". A `local` run MUST NOT fail on a tool it never calls.

   So the check names **seven tools under `local` and nine under `ui`**. If any tool in the resolved mode's required set is absent from the tool binding:
   - Append the load-bearing ledger line verbatim: `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`.
   - Print the load-bearing guidance verbatim: `cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75`.
   - Exit non-zero.

   The fail path is **ledger + print + exit only** — no operator prompt is fired. The operator can do nothing in-session about missing tool registration; a prompt whose every option means "abort" is not a decision. The correct response class for "environment doesn't support the operation" is `Print + exit`. Registration is owned by cluster-base#75 (runtime-registered per cluster); a cluster without registration hard-fails here by contract, not by bug. Under `ResolvedGateMode === "ui"`, absence of `cockpit_gate_status` / `cockpit_gate_list` reaches this same fail path — the pre-draft check is unconditional under `ui`, so a `ui` run on a pre-#1038 cluster cannot silently degrade (that degradation is exactly the duplicate-drafting symptom this feature exists to remove).

   **Answered-gate parked-forever escape hatch (UI mode only).** Before dispatching any synthetic event, iterate `openGates` and tick the sweep counter for every entry in `status: 'answered'`:

   1. For each `(gateId, record)` in `openGates` where `record.status === 'answered'`:
      `answeredGateSweepCounter.set(gateId, (answeredGateSweepCounter.get(gateId) ?? 0) + 1)`.
   2. For each `(gateId, count)` in `answeredGateSweepCounter` where `count >= 3`:
      - Call `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')`. Under `runIdEnabled === true` this call ALSO passes `runId` for envelope symmetry with `cockpit_gate_open` — the `runId` value is READ from `openGates[gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`. For a current-run entry the two coincide; for an adopted entry (per § Adoption pass above) they differ — `openGates[gateId].runId` carries the row's originating `runId`. Under `runIdEnabled === false` the `runId` field is OMITTED (V6). `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`, and `GateOutcomeWireSchema` carries no `runId` — the field is dropped before the wire), so the ack works regardless of which run opened the gate. This is what lets the escape hatch supersede an `answered` record whose originating `cockpit_gate_open` may have been issued by an earlier run (per FR-005 / R11), including adopted-entry acks that target the originating `runId` for audit/trace parity (per #471 / FR-003).
      - `openGates.delete(gateId)`.
      - `answeredGateSweepCounter.delete(gateId)`.
      - **Actively re-derive (mandatory — see § Escape-hatch re-derivation below).** Do NOT leave re-derivation to the next `cockpit_await_events` drain.

   **§ Escape-hatch re-derivation (load-bearing).** The escape-hatch ack changes NO label — it only closes a cloud record. `cockpit_await_events(cursor)` returns only NEW transitions since the cursor (see § step 4 sub-step 1 and § Empty-batch handling; the `initial: true` snapshot is a connect-time-only property), so no drain will ever carry an event for a label that did not change. If the hatch deleted the record and waited for a drain, it would have destroyed the operator's only surface for that issue and parked it forever. Therefore, for EACH gate the hatch acks, in the SAME pass:

   1. Read the gate's `issueRef` from the record BEFORE `openGates.delete(gateId)` (the reuse-path record carries `issueRef`, `transitionClass`, and `dispatchClass` — see § step-3 sweep `gateId idempotency` below).
   2. Re-read that issue's live state: `cockpit_status(issue=<issueRef>, json=true)`.
   3. Synthesize an event from the returned labels and dispatch it through the normal § Dispatch D.n path — byte-identical to the way the startup sweep's synthetic-event pass (below) turns a live label into a synthetic event. The freshly-derived dispatch runs its own § Dispatch step 0; the just-acked gate is now terminal, so `cockpit_gate_status` returns `absent` and drafting proceeds.
   4. If the live state carries no dispatchable transition class (the trigger resolved out-of-band while the gate sat answered), synthesize nothing — the issue needs no operator surface. Write no ledger row for this case (per Invariant #8 the escape hatch is control flow, not a dispatch).

   **De-duplication at the § step-3 startup-sweep tick site ONLY**: the synthetic-event pass immediately below this block already re-reads live state for every in-scope issue in this same sweep. An issue whose gate the hatch just acked is therefore dispatched exactly once, by that pass — do NOT also synthesize it from step 2 above. At the § step-4 per-wake tick site there is no such following pass, so the re-derivation above is performed directly and is the sole path that reaches the issue.

   The threshold `3` is a load-bearing literal (per `specs/457-part-cockpit-remote-gates/research.md § R5` — provides two full sweeps of margin between "recorded answered" and "declared stuck"; short enough to avoid parking a genuinely-stuck gate for user-perceptible time; long enough to tolerate a slow redelivery). A future edit that changes the value re-triggers the spec's clarify phase. **Counter semantics the literal `3` is measured in (single definition — every site below MUST agree):** the counter value is the number of SWEEPS during which the entry has been recorded `answered` and unresolved, **counting the sweep in which the entry was recorded as sweep 1**. The `answeredGateSweepCounter[gateId]` increment performed by a D.n Step 0 `reuse-answered` branch IS that entry's count for the sweep in which it was added; the tick sites (this block and § step 4 sub-step 0) supply every subsequent sweep's increment. So a record added during sweep S reaches `3` at sweep S+2 — two full sweeps of margin after the sweep that recorded it, exactly as R5 specifies.

   **This block runs on EVERY sweep, not just the startup sweep.** A "sweep" is defined as: (a) the once-per-session startup sweep in § step 3 above, AND (b) EVERY per-wake pass through the main loop's drain in § step 4 below (each Monitor-delivered wake OR heartbeat fire is a fresh sweep for counter-tick purposes). The counter increments exactly once per sweep per `answered` record. **No double-count is possible**: both tick sites run BEFORE any dispatch in their sweep, so an entry added by a D.n Step 0 `reuse-answered` branch during sweep S did not exist when sweep S's tick ran — its record-time increment is sweep S's count, and the tick sites first touch it in sweep S+1. The load-bearing property (per FR-009 / SC-005): after at most three sweeps in which no D.12 event has resolved an `answered` entry, the escape hatch fires. If the startup sweep were the SOLE tick site, a mid-run reuse-answered entry could never advance past its record-time `1` (the startup sweep runs before any dispatch that could add such an entry) and the FR-009 escape hatch would be structurally unreachable — the exact hazard called out in the review. The per-wake tick in § step 4 (below) closes the reachability gap.

   Under `ResolvedGateMode === "local"` this block is dead prose. `answeredGateSweepCounter` is undefined under `local`; `openGates` has no `status: 'answered'` entries because local mode does not read remote gate state.

   **Adoption pass (UI mode) — adopt pre-existing non-terminal gates from prior runs (per #471 / FR-001..FR-014).** Under `ResolvedGateMode === "ui"` ONLY (per FR-006 / V9), before the § Synthetic-event dispatch block below fires, enumerate every non-terminal gate that is already open in the cloud for every in-scope issue and adopt each row into `openGates` so this run's sweep-time `cockpit_gate_open` calls coalesce onto the adopted 4-segment `gateId`s instead of minting duplicates against a fresh-per-run `runId`. Contract: `contracts/adoption-sweep.md` (parent); `contracts/adoption-drift.md` (drift branch); `contracts/adoption-error-defer.md` (per-issue error defer). Under `ResolvedGateMode === "local"` the ENTIRE block is dead prose — no `cockpit_gate_list` calls, no `openGates` writes, no ledger rows, no adoption (per FR-006 / V9 / SC-005).

   1. **Functional list call shape** — `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })`. The `runId` field MUST NOT be present on the payload — omitted, not `null`, not `undefined`, not `""` (per FR-005 / V8 / R4 / `contracts/adoption-sweep.md § Functional list call`). This reinforces #469 FR-011 from the consumer end: `cockpit_gate_list` is deliberately run-agnostic — the cloud applies `?runId=` as an equality filter in list mode (per generacy-cloud#894, which retires the earlier `runId requires generation` refine), so forwarding `runId` here would return only the CURRENT run's gates. Adoption exists precisely to see gates from PRIOR runs, so a run-filtered list would return `{gates: []}` at startup (the current run has opened no gates yet) and make this entire pass a silent no-op — every issue would adopt nothing, no ledger row would fire, and the duplicate-inbox regression this feature exists to prevent would recur without a visible failure mode. (Before generacy-cloud#894 lands the same call 400'd because the refine rejected `runId` without `generation`; the rule is unchanged, the failure mode is now silent instead of loud, which makes the MUST NOT more important, not less. Tracked at generacy#1080 for the cluster-side sibling justifications that assert the same stale refine reason.) The pre-flight capability probe (per § step 1 § Pre-flight probe (UI mode)) remains the SOLE `cockpit_gate_list` call in the run that carries `runId` — it is safe precisely because Phase B's handler drops the field before the cloud call.

   2. **N+1 count rule** — exactly ONE `cockpit_gate_list` call per in-scope issue: the tracking ref itself PLUS every in-scope child. For an epic with N in-scope children this is N+1 calls (per FR-001 / SC-008). For an epic-less tracking mode with M task-list refs, k = M + 1 calls. For a bare `--tracking` invocation with no task list yet, k = 1 (the tracking ref itself).

   3. **In-scope enumeration** — the set of in-scope issues is derived from the SAME shared `cockpit_status(epic|issue=<ref>, json=true)` result that the § Synthetic-event dispatch block below already reads (per `contracts/adoption-sweep.md § In-scope issue enumeration`). Under `invocationForm: epic` the set is `[<epic-ref>] ++ epic.inScopeChildren`; under `invocationForm: tracking-existing | tracking-new | tracking-list` the set is `[<tracking-ref>] ++ trackingIssue.taskListRefs`. Adoption does NOT issue a second `cockpit_status` — one shared call per run.

   4. **Broad adoption rule (per FR-009 / SC-009 / V5).** For each returned non-terminal row `{gateId, gateType, generation, status, runId}` for an in-scope issue, adopt EVERY row into `openGates` — including rows whose `(gateType, generation)` does NOT match a natural gate the current-run sweep would draft. Compute `dispatchClass` from `(row.gateType, row.generation)` using the SAME mapping-table rule the current-run sweep uses (per § UI-mode gate mapping / § Generation discriminator (UI mode); FR-008). Add a `GateRecord` under `row.gateId` with `{gateId, gateType, generation, status, runId: row.runId, issueRef, dispatchClass, transitionClass}` — the per-entry `runId` is the ROW's `runId` verbatim (per § In-memory loop state additions above, item (b); FR-003 / V2). Fields `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated on adopted entries — the `cockpit_gate_list` return shape does not carry them (DATA GAP; matches the reuse-answered branch already tolerated by § step 3 sweep `gateId idempotency`). Rationale: narrower rules (adopt-only-matching) leave orphaned inbox entries — most obviously a prior-run `implementation-review` on a child that has since moved to `manual-validation` phase. An unanswered adopted `open` entry sits in `openGates` and does nothing (the escape hatch only ticks `answered` entries, so nothing churns). Answered entries route via `dispatchClass` regardless.

   5. **Generation-drift branch (per FR-013 / SC-010 / V3; contract: `contracts/adoption-drift.md`).** For a row whose `(row.issueRef, row.gateType)` matches a natural gate the current-run sweep would draft AND `row.generation` differs from the current-run derived generation AND `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}`: call `cockpit_gate_ack({ gateId: row.gateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)', runId: row.runId })`. The `detail` string is the SAME string the live-path drift branch uses at every § Dispatch D.n Step 0 (per `auto.md § Pre-draft check — shared rules → generation-drift branch guard` and D.1/D.2/D.3/D.4 Step 0 blocks) — sourced verbatim from the playbook, not re-invented; if the live-path string changes, this branch inherits. The `runId` is the ROW's originating `runId` (per FR-003), NOT the current run's — `runId` is **accepted-and-ignored** on the ack path (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so the ack lands regardless of which run opened the stale gate. Then: do NOT add the row to `openGates`; do NOT draft here (the § Synthetic-event dispatch block below produces the fresh open at the current-run generation and current-run `runId`, via `cockpit_gate_open`). **Precedence**: FR-013 wins over FR-009 for its matching rows (per V3). The classifier evaluates `adopt-natural` first (same-generation match), then `drift-supersede` (drift-enabled gateType with drift), then `broad-adopt` (everything else).

   6. **`escalation` carve-out (per FR-013 / V4 / SC-011).** `row.gateType === 'escalation'` DISABLES the drift branch. Prior-run `escalation` rows with generation drift take the BROAD-adopt branch instead — adopted at their stale generation, left non-terminal. Rationale: four dispatch rows (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) share the one `escalation` enum value and the wire carries no subtype discriminator (upstream generacy#1046). The drift branch cannot tell them apart, so superseding would potentially destroy an escalation the current run has no way to correctly recreate. Same treatment #457 established for the live path.

   7. **Adopted-`answered` counter initialisation (per FR-010 / SC-012 / V6).** For every row adopted with `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the SAME atomic step as adding the entry to `openGates`. This matches the reuse-answered branch semantics established by #457 (the record-time increment IS the entry's count for the sweep in which it was added). The load-bearing threshold `3` (per `specs/457-part-cockpit-remote-gates/research.md § R5`) still applies: an adopted `answered` entry reaches count `3` at startup-sweep+2, at which point the escape hatch fires.

   8. **Adopted-`answered` structural limitation (per FR-010 / spec § Follow-ups).** NO MCP surface returns the operator's answer document: `cockpit_gate_status` returns `{gateId, status}` and `cockpit_gate_list` returns `{gateId, gateType, generation, status, runId}` — neither carries the operator's answer. The current run structurally cannot consume a prior-run answer on its own. The adopted answer is preserved ONLY if D.12 redelivery fires (consumed via existing `deliveryId` dedup path); otherwise the escape hatch supersedes after 3 sweeps and either re-derives from current labels (dispatches correctly if labels moved) or re-asks the operator (they did not). Any path that supersedes immediately guarantees the re-ask even where redelivery would have worked. This limitation is stated verbatim rather than implied away — an answer-document surface would require a cloud-side schema change and is filed as a Follow-up (out of scope for this phase; tracked against generacy-cloud after this repair lands).

   9. **Per-issue defer-on-error rule (per FR-014 / SC-013 / V7 / US5; contract: `contracts/adoption-error-defer.md`).** On `{status: 'error', class, detail}` for issue X (any error class after the tool's internal `QUERY_RETRY_SCHEDULE` has exhausted): SKIP BOTH adoption AND drafting for issue X in this pass — the exclusive-or property. A partial defer that skips adoption but still drafts would produce the exact duplicate-inbox symptom this repair exists to remove. Write ONE ledger row verbatim: `startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake` (per data-model.md § `AdoptionLedgerRow`; grep recipe: `grep '· adoption-list-error ·' *.ledger`). Continue with the next in-scope issue — do NOT abort the run, do NOT re-order remaining issues, do NOT re-attempt in this same pass (the tool's `QUERY_RETRY_SCHEDULE` — 3 attempts, ~5s backoff, ~20s worst case — has already absorbed the transient case). The label(s) that would trigger the drafted gate remain persistent, so the event re-fires on the main loop's first natural wake (Monitor line or heartbeat fire) — the SAME "label persistence guarantees natural re-fire" mechanism § Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure (below) relies on for a symmetric failure mode. The synthetic-event dispatch pass reads a per-run in-memory `adoptionDeferredIssues: Set<IssueRef>` set the adoption pass writes to and skips any natural-gate `cockpit_gate_open` for a deferred issue in this pass (per `contracts/adoption-error-defer.md § Ordering invariant`).

   10. **UI-mode-only guard (per FR-006 / V9 / SC-005).** The entire § Adoption pass block is dead prose under `ResolvedGateMode === "local"`. No `cockpit_gate_list` calls, no `openGates` writes, no ledger rows, no `adoptionDeferredIssues` set — `--gates=local` byte-path invariance matches #469 FR-007's stance verbatim.

   11. **Ordering guarantees.** The § Adoption pass runs AFTER #469's pre-flight capability probe AND AFTER the § step 3 tool-presence check AND AFTER the § Answered-gate parked-forever escape hatch tick (which reads/writes `openGates` from prior-run in-memory state, if any — running adoption first would obscure that tick site's "reads and writes prior-run state" semantic). The § Adoption pass runs BEFORE the § Synthetic-event dispatch block below AND BEFORE any per-event D.n Step 0 pre-draft check. This ordering is load-bearing: sweep-time `cockpit_gate_open` calls in the § step 3 extended trigger set fire from the § Synthetic-event dispatch block through the D.n rows, and they need adopted entries already in `openGates` at the moment they run — so the sweep-time open finds the adopted entry and issues no duplicate `cockpit_gate_open` for the natural gate (per SC-006). On the drift branch the adoption pass acks the stale gate `superseded` FIRST, so the sweep's fresh `cockpit_gate_open` at the current-run generation and current-run `runId` produces the sole remaining open for the natural gate.

   **Synthetic-event dispatch (only reached when every tool in the resolved mode's required set is present).** Call `cockpit_status(epic=<epic-ref>, json=true)` and treat every issue whose current transition class is one of D.1–D.9 (below) as a synthetic event. Dispatch each one by one (per § Dispatch and § Ledger) before entering the main loop. This handles the case where the epic already has open work when `/cockpit:auto` is invoked. The sweep ends with exactly one full status table (per § Ledger L.4 policy) and then hands off to step 4.

   Under `--tracking <issue-ref>` / `--new "<title>"` (epic-less mode), the sweep reads the task list from the tracking issue via `cockpit_status(issue=<tracking-ref>, json=true)` and treats each live-state ref as a synthetic event — structurally identical to the epic-ref sweep. This is the restart-safety mechanism: the scope survives restarts because it lives on the tracking issue, not in session state (spec § Changes item 5).

   **UI-mode extended trigger set (Q2=B)**. When `ResolvedGateMode === "ui"` (per § step-1 `--gates` resolution), the startup sweep re-opens remote gates via `cockpit_gate_open` for **every persistent gate-trigger state** — a superset of the `waiting-for:*` baseline. Contract: `contracts/ui-startup-sweep.md`. Under `local`, the sweep behaves EXACTLY as today (this callout is a UI-only extension; local-mode byte-path unchanged). Trigger states:

   - **All `waiting-for:*` labels** (matches FR-013 baseline): `waiting-for:clarification` (D.1), `waiting-for:<artifact>-review` (D.2 — spec / clarification / plan / tasks), `waiting-for:implementation-review` (D.3), `waiting-for:manual-validation` (D.4), `waiting-for:merge-conflicts` (D.11 — co-occurs with `blocked:stuck-merge-conflicts`).
   - **Persistent NON-`waiting-for:*` triggers** (added under Q2=B): `agent:error` (D.7), `failed:<subtype>` (D.7), `completed:validate` with red checks (D.6 — after fixer, if the fixer state is not in-memory-only), `phase-complete` (D.8 — G.5), `blocked:stuck-merge-conflicts` (D.11 — co-occurs with `waiting-for:merge-conflicts`; either alone triggers).

   **Rationale**: these non-`waiting-for` triggers are persistent labels — the engine sets them and they sit until dispatched; they do NOT self-re-fire. Restricting the UI sweep to `waiting-for:*` only would silently drop them across a restart / takeover — a real operator hazard the local sweep does not have.

   **`runId` on every sweep-time `cockpit_gate_open` (per #469 / FR-004 / R11).** Under `runIdEnabled === true`, every `cockpit_gate_open` call in the extended trigger set above (every `waiting-for:*` label AND every persistent non-`waiting-for:*` trigger — `agent:error`, `failed:<subtype>`, `completed:validate` red, `phase-complete`, `blocked:stuck-merge-conflicts`) passes the run's pre-flight-derived `runId` (per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions above). Under `runIdEnabled === false` the `runId` field is OMITTED from every sweep-time open call (V6). The `runId` is read verbatim from loop state — NO consumer re-derives (V2 / FR-014). Sweep-time and live-time opens for the same natural gate coalesce on the same 4-segment `gateId` under `runIdEnabled === true` (per § gateId idempotency above) — the sweep does not create a duplicate gate for a live-path event within the same run.

   **Fresh-epic bootstrap (epic mode; no phase in flight).** In epic mode (`invocationForm: epic`), after the synthetic-event pass above, if the sweep found **zero** synthetic events — no issue is in any D.1–D.9 transition class, i.e. every issue is `pending`, nothing queued, nothing in flight — then the wake-driven loop has no event to react to and no `phase-complete` will ever fire, so the epic would idle forever. To bootstrap, compute the **first incomplete phase** P&lt;first&gt; (the lowest-numbered phase with any non-terminal issue) from `cockpit_status(epic=<epic-ref>, json=true)`; if P&lt;first&gt; has at least one unqueued issue, synthesize a **`phase-bootstrap` event** and dispatch it through D.8 / § Gate contract G.5 — the SAME machinery as a real `phase-complete`, differing only in provenance: the G.5 presentation uses the bootstrap variant (§ G.5 **Bootstrap variant**), the wire `transitionClass` is `phase-bootstrap` (a distinct `gateId` so a restart re-opens the bootstrap gate and never collides with a later real `phase-complete` on the same `<epic-ref>`), and the ledger dispatch-class marker is `phase-bootstrap`. **Under `ResolvedGateMode === "ui"` the bootstrap confirm opens in the operator inbox via `cockpit_gate_open` exactly like every other G.5 gate — it is NEVER a local `AskUserQuestion` under UI mode** (a headless UI-driven session has no local answerer; a local prompt there blocks forever). This is the sole bootstrap trigger: if P&lt;first&gt; were already queued or in flight the synthetic-event pass above would have produced events and this clause is skipped. Epic-less modes (`--tracking` / `--new` / issue-list) do NOT bootstrap phases — their scope is the tracking-issue task list, swept above.

   **G.4(e) exclusion**: consecutive `invalid-cursor` streak (per-epic in-memory cursor-mechanism fault; § step 5 Branch B) is NOT swept. It is an in-memory state that does not survive a session restart by definition, and it has no `<issue-ref>` to key a per-issue gate record on.

   **gateId idempotency**: every sweep-time `cockpit_gate_open` call uses `gateId = hash(issueRef, gateType, generation[, runId])` — where `generation` is derived from the SAME per-gateType function the live path uses (§ UI-mode gate mapping / § Generation discriminator (UI mode)), and `runId` is the pre-flight-derived value on § In-memory loop state additions (UI mode) above (per § step 1 Pre-flight `runId` derivation). The plugin never hand-builds the hash — the `cockpit_gate_open` MCP tool derives `gateKey` and `gateId` from the semantic inputs the plugin passes. Under `runIdEnabled === true` every sweep-time `cockpit_gate_open` in the extended trigger set (below at the `waiting-for:*` / `agent:error` / `failed:*` / `completed:validate` red / `phase-complete` / `blocked:stuck-merge-conflicts` block) passes `runId` on the payload; under `runIdEnabled === false` the field is OMITTED (V6). The pre-draft `cockpit_gate_status({issueRef, gateType, generation, runId})` check (per § Dispatch step 0 in D.1 / D.2 / D.3 / D.4 / D.7 / D.11) names the same FOUR inputs under `runIdEnabled === true` (three under `runIdEnabled === false`, matching the pre-#469 3-input identity), so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed AND the run is the same. Two runs against the same tracking ref intentionally derive DIFFERENT `gateId`s — this is the FR-001 behaviour change: re-invoking `/cockpit:auto <ref>` mints a NEW ledger file (per line 209 above), which by FR-001 mints a NEW `runId`, which by construction produces a fresh 4-segment `gateId` for the same natural gate. See § Assumptions in `specs/469-problem-cockpit-auto-only/spec.md` for the behaviour change and the sweep-adoption follow-up (Batch 2 Q6 — deliberately not in this phase's scope). When content HAS changed (a new PR head SHA, a revised clarification answer-set, a new phase number, an incremented escalation occurrence counter), the generation differs by design. For the four gateTypes that map 1:1 onto a dispatch row (`clarification`, `artifact-review`, `implementation-review`, `manual-validation`) the pre-draft check's generation-drift branch then fires (ack stale `superseded` + draft fresh — per Q1=C). For `gateType: 'escalation'` the drift branch is DISABLED and the stale gate is left non-terminal — see § Pre-draft check — shared rules **generation-drift branch guard** (four dispatch rows share the one enum value, and the wire carries no subtype discriminator to tell them apart; upstream [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)). **Adoption is the ordering primitive that prevents the sweep-time `cockpit_gate_open` from duplicating an adopted natural gate across runs (per #471 / SC-006).** The § Adoption pass block above runs BEFORE this synthetic-event dispatch pass, and every synthetic event this pass produces routes through a D.n row whose Step 0 pre-draft check performs the same-generation adoption branch on `absent` (per D.1 / D.2 / D.3 / D.4 / D.7 / D.11 Step 0, `{status: 'absent'}` sub-branches — a fourth branch ordered BEFORE the drift branch that adopts a prior-run same-generation row from the runId-agnostic `cockpit_gate_list` result rather than drafting fresh). Together the two sites produce these guarantees by the time a sweep-time `cockpit_gate_open` fires for a natural gate on an in-scope issue: (a) if a same-generation prior-run gate exists, its `gateId` under the current run's derivation would be DIFFERENT from the prior-run row's `gateId` because the two runs' `runId` values differ (per §  gateId idempotency above — "Two runs against the same tracking ref intentionally derive DIFFERENT `gateId`s"); the two `gateId`s do NOT coalesce. Instead — the prior-run gate's ADOPTION into `openGates` (either by the § Adoption pass at startup, or by Step 0's same-generation `absent` sub-branch for issues that entered scope mid-run) SUPPRESSES the sweep-time `cockpit_gate_open` for this event: either the adoption branch fires directly and issues `continue to the next event` (skipping the draft-then-open flow), or the Step 0 same-generation `absent` sub-branch does the same at dispatch time. Either way no second `cockpit_gate_open` is issued for this natural gate, and the operator's inbox sees exactly one gate — the prior-run one, now tracked in this run's `openGates` under its originating `runId`. (b) If a generation-drift prior-run gate exists, the adoption pass or Step 0's drift branch has acked it `superseded` targeting the row's originating `runId`, so the sweep-time open at the current-run generation and current-run `runId` produces the SOLE remaining open for the natural gate under a DIFFERENT `gateId`. (c) If no prior-run gate exists, adoption is a no-op and the sweep-time open proceeds unchanged. This ordering primitive is what makes the pre-#471 "two runs against the same tracking ref intentionally derive DIFFERENT `gateId`s" behaviour NON-hazardous — the different `gateId`s no longer duplicate an operator-visible inbox entry because the prior-run gate has either been adopted-and-tracked (case a) or superseded (case b) BEFORE this run's sweep-time open runs. The Step 0 same-generation `absent` sub-branch is the load-bearing correctness site for issues that enter scope AFTER the startup sweep (mid-run scope-add or an epic child that becomes in-scope on a later wake); the § Adoption pass is the bulk-optimisation site for issues already in scope at startup.

   Plugin-side, on a `cockpit_gate_status` reuse-return (`status: 'open' | 'answered'`) the sweep records a partial `openGates` entry keyed by the returned `gateId` and carrying `{gateId, gateType, generation, issueRef, status, transitionClass, dispatchClass}` derived from the query inputs and the mapping-table row. **`dispatchClass` is mandatory on the reuse record** — it is known at record time (it is simply the D.n row performing the reuse, e.g. `D.1` for the clarification row) and is NOT recoverable from the query return. § D.12 step 3's live-state supersession check keys on `dispatchClass` and § D.12 step 4 routes on `(dispatchClass, optionId)`; a reuse record with `dispatchClass` undefined resolves no downstream handler, so the operator's answer to a reused gate would land nowhere. The `inboxUrl`, `title`, `askedAt`, and `originalDraft` fields on `GateRecord` are NOT populated on the reuse path — the `cockpit_gate_status` return shape (`{gateId, status}`) does not carry them and `cockpit_gate_list` only returns `{gateId, gateType, generation, status}`. This partial-record limitation is a DATA GAP tracked as a follow-up (mirrors the § UI-mode gate mapping DATA GAPS note); the reuse-path record is sufficient for the FR-009 escape hatch's `status === 'answered'` filter and for D.12's `gateId`-identity supersession check, which is all the reuse path needs. The "one pointer line" (per FR-005) is NOT printed on the reuse path — it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not return.

   **Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure**: the sweep is "best-effort UI-open". If `cockpit_gate_open` fails for a specific sweep-time gate, the first-failure ledger note fires (per § UI-mode fallback rule 5), but "fall through to local `AskUserQuestion` mid-sweep" is problematic (blocking on an AskUserQuestion mid-sweep would defeat the sweep's non-blocking model). Instead: the specific gate's initiation is DEFERRED to the main loop's first natural wake (a `Monitor` line or `ScheduleWakeup` heartbeat). The record is NOT opened, but the underlying event WILL re-fire naturally because the label is persistent. The main loop's per-wake iteration retries `cockpit_gate_open` for that issue's transition class; on success the gate opens normally, on repeated failure the § UI-mode fallback AskUserQuestion path fires (single-gate blocking is acceptable in the main loop; sweep is the special case). A hostile cluster (constantly-failing `cockpit_gate_open`) degrades to loop-time fallback but does not stall.

   **Deferred-to-loop behavior on adoption-path `cockpit_gate_list` failure** (per #471 / FR-014 / SC-013 / V7; contract: `contracts/adoption-error-defer.md`): the § Adoption pass block above is "best-effort UI-adopt" under the same per-issue defer discipline as the sibling sweep-time `cockpit_gate_open` failure paragraph above. If `cockpit_gate_list` returns `{status: 'error', class, detail}` for a SPECIFIC in-scope issue X (after the tool's internal `QUERY_RETRY_SCHEDULE` has exhausted — 3 attempts, ~5s backoff, ~20s worst case), SKIP BOTH adoption AND drafting for issue X in this pass — exclusive-or per V7. The synthetic-event dispatch block reads the per-run in-memory `adoptionDeferredIssues: Set<IssueRef>` set the adoption pass writes to, and skips any natural-gate `cockpit_gate_open` for a deferred issue in this pass. No `openGates` entry is added for X in this pass, and no `cockpit_gate_open` for a natural gate on X fires in the subsequent synthetic-event dispatch pass. The underlying label(s) that would trigger the drafted gate on issue X (e.g. `waiting-for:clarification`, `agent:error`, `phase-complete`) remain persistent — the event re-fires on the main loop's first natural wake (`Monitor` line or heartbeat fire); the main loop's per-wake iteration retries via the ordinary D.n Step 0 flow (a `cockpit_gate_status` call, not `cockpit_gate_list`, but by then either the transient blip is over and X's normal Step 0 does its job or the operator sees the second attempt fail loudly through the ordinary main-loop failure paths). Ledger row shape (verbatim): `startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake` (per data-model.md § `AdoptionLedgerRow`; grep recipe: `grep '· adoption-list-error ·' *.ledger` returns every adoption defer across every run). Continue with the next in-scope issue — do NOT abort the run, do NOT re-order remaining issues, do NOT re-attempt in this same pass (adding a playbook-level retry on top of `QUERY_RETRY_SCHEDULE` would add ~35s per failing issue without buying anything — per research.md § R5). This mirrors the sibling `cockpit_gate_open` failure paragraph's shape verbatim: label-persistence guarantees natural re-fire, next-natural-wake retry, ledger-row grep recipe for post-mortem.

   **Status table** (per § L.4 policy): under UI mode the sweep's status table is printed AFTER the sweep-time `cockpit_gate_open` calls; the table's rows show the same issues that just had gates opened. The "sweep ends with exactly one full status table" rule is unaffected.

4. **Main loop (wake-driven).** Post-#420, the loop is **wake-driven**, not long-polling. The model does nothing between wakes — the harness re-invokes the loop only when a wake signal arrives:

   - **Monitor-delivered wake**: the harness re-invokes the model because `Monitor` observed a new stdout line from the `generacy cockpit doorbell <epic-ref>` sensor armed in step 2. The line content is a doorbell only — never parsed.
   - **`ScheduleWakeup` heartbeat fire**: the harness re-invokes the model because the belt-and-braces heartbeat (armed per C4 below) elapsed while `Monitor` was silent.

   Idle cost between wakes is **zero tokens** — no polling turn, no context re-read. This is the load-bearing property of the whole rewrite.

   **Per wake (Monitor or heartbeat), the iteration is**:

   0. **Answered-gate parked-forever escape hatch tick (UI mode only).** Before the drain, apply the § step 3 escape-hatch block verbatim (per-wake tick site). Under `ResolvedGateMode === "ui"`: iterate `openGates` and tick `answeredGateSweepCounter` for every `status: 'answered'` entry; for every counter entry with `count >= 3`, ack `superseded` with the exact detail `'answered-not-consumed — presumed stuck at cloud delivered/applied'` (under `runIdEnabled === true` this per-wake `cockpit_gate_ack` ALSO passes `runId` verbatim for envelope symmetry with `cockpit_gate_open` — the `runId` value is READ from `openGates[gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`; for a current-run entry the two coincide, for an adopted entry (per § step 3 § Adoption pass above) they differ — `openGates[gateId].runId` carries the row's originating `runId`; under `runIdEnabled === false` the `runId` field is OMITTED — V6; `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so the ack works regardless of which run opened the gate — this is what lets the per-wake escape hatch supersede an `answered` record whose originating open may have been issued by an earlier run, per FR-005 / R11, including adopted-entry acks that target the originating `runId` for audit/trace parity per #471 / FR-003), delete from `openGates`, delete from the counter, and then **actively re-derive** the fresh event per § step 3 **Escape-hatch re-derivation**: read the record's `issueRef` before deleting it, call `cockpit_status(issue=<issueRef>, json=true)`, synthesize an event from the returned labels, and dispatch it through the normal § Dispatch D.n path **in this same pass, before the drain in sub-step 1**. Do **NOT** rely on the next drain to produce it: the hatch changes no label, and `cockpit_await_events(cursor)` returns only NEW transitions (an unchanged label produces no batch item on this or any later wake — see § Empty-batch handling; the C4 heartbeat performs the same drain and the `initial: true` snapshot is connect-time-only), so a drain-dependent hatch would delete the operator's only surface and park the issue forever. At this tick site there is no following synthetic-event pass, so this re-derivation is the SOLE path that reaches the issue — the § step 3 de-duplication carve-out applies to the startup-sweep site only. Under `ResolvedGateMode === "local"` this step is a no-op (the counter is undefined). This is the load-bearing per-wake tick that makes the FR-009 escape hatch reachable for `answered` entries FIRST added by a D.n Step 0 `reuse-answered` branch mid-run (the once-per-session startup sweep runs before any such addition can happen and cannot cover them alone). Ledger accounting: the escape-hatch ack is a control-flow event, not a dispatch event; no ledger row per Invariant #8. The re-derived dispatch writes its own ledger row per the mandatory-per-dispatch rule.
   1. **Drain** — call `cockpit_await_events(epic=<epic-ref>, cursor=<in-memory-cursor>, maxWaitMs=1, coalesceWindowMs=3000, maxBatchSize=256)` via the MCP tool binding. `maxWaitMs=1` is the smallest currently-accepted value at the tool boundary (Q2=C / FR-003) — the drain is effectively non-blocking. `coalesceWindowMs=3000` remains the sole burst-batcher (no client-side debounce is added; the MCP layer owns coalescing). The initial iteration passes `cursor=null` (cursor-less — the tool server arms from its connect-time position). Each successful return is a **batch of typed events** with a `nextCursor` field; the batch's events are already parsed by the tool server (no NDJSON stream, no per-line filtering).
   2. **Consume** — process every event in the returned batch **in stream order**. There is no content- or field-based filter over the batch; the batch's ordering IS the dispatch order. Preserving § Invariants #7's intent — no content-based filter that could silently drop legitimate events — is by construction here: the tool server owns event parsing, and the parent consumes the typed batch as-is.
   3. **Advance cursor** — after the batch is fully consumed, advance the in-memory cursor to `batch.nextCursor`.
   4. **Arm next heartbeat + wait** — fall through to step C4 (heartbeat lifecycle) to arm the next `ScheduleWakeup` and wait for the next wake signal. Do NOT re-issue `cockpit_await_events` in a tight loop — the next call happens on the next wake.

   For each event in the batch (in stream order):
   - **(a) Resolve authoritative state.** Prefer the enriched doorbell line's `to` / `labels` fields (and, for D.5/D.6, the baked `checks` verdict) — a line is enriched iff it JSON-parses to an object AND carries both `to` and `labels` (per § Enriched-line dispatch contract E2). Otherwise, fall back to a single `cockpit_status(epic=<epic-ref>, json=true)` query to resolve authoritative state. **Under the enriched-line path**, D.1–D.4, D.7, and D.9/D.9a–D.9d dispatch directly from the line's `to` / `labels` fields — the per-event re-check for these classes is redundant when the line carries them. **Retain the per-event `cockpit_status` re-check for D.8, D.10, and D.11** — those open human/consequential gates where a stale-line dispatch could open a gate against superseded state, and their low frequency makes the authoritative query cost negligible. **D.5/D.6** consult the `checks` verdict on the line; if `checks` is **absent OR `pending`** (per Q4=B), fall back to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` / `cockpit_merge(issue=<issue-ref>)` query — defer-on-pending is rejected because smee doorbell delivery is best-effort/lossy and a lost follow-up event would silently stall the merge. Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip any query entirely per § Invariants #8's cost contract — a batch containing only ledger-only events is one ledger append per event and zero other tool calls. If the epic's live state is `epic-complete`, go to step 6.
   - **(b) Dispatch** per § Dispatch below, branching on the *live* transition class.
   - **(c) Write one ledger line** per § Ledger (transcript print + append to the run's `.ledger` file). A dispatch without a ledger line is a protocol violation.
   - **(d) Continue** with the next event in the batch.

   **Initial-flagged events** — `issue-transition` events with `initial: true` from `cockpit_await_events`, produced by generacy#935 for connect-time snapshots and mid-run scope joins (e.g., events emitted after `cockpit_scope_add`) — dispatch through the existing table by their carried state class, the same as any other event. The step-4a re-check remains authoritative. **D.10 structurally cannot fire on an initial-flagged event because the state class is known.** No new dispatch row is added; the initial-flag is orthogonal to dispatch (Q5 anchor). Preserved verbatim from pre-#420 semantics.

   **Empty-batch handling**: A wake whose drain returns zero events is a legitimate outcome. Under a Monitor-delivered wake this indicates burst coalescing (the doorbell line's state was already consumed by an earlier drain) or a spurious wake. Under a heartbeat fire it usually indicates a genuine quiet interval (or a superseded prior heartbeat firing after a Monitor wake already drained). In either case: advance the cursor to `batch.nextCursor` (the tool server's connect-time position moved forward even without events), arm the next heartbeat per C4, and wait. Ledger-only cost accounting sees zero appends for an empty-batch wake — that is the SC-001 / SC-002 saving in action. Heartbeat-fire wakes DO write a ledger line per C4 (`heartbeat · schedule-wakeup · fired · drain empty` when the drain was empty) — heartbeat accounting is separate from per-event ledger accounting. Monitor-delivered wakes with an empty drain do NOT write a ledger line (a doorbell that produced no dispatchable event is a no-op).

   Maps to FR-002, FR-003, FR-007, SC-001, SC-002.

   **C4 — Heartbeat lifecycle (belt-and-braces recovery while `Monitor` silent)**. After each drain (Monitor-delivered wake OR heartbeat fire), if no `ScheduleWakeup` heartbeat is currently outstanding (`heartbeatScheduledWakeupArmed == false`; see `data-model.md § In-memory loop state`), arm one:

   ```text
   ScheduleWakeup(
     delaySeconds = 300,
     prompt = <verbatim /cockpit:auto invocation with the same ref and flags used at run start>,
     reason = "cockpit-auto heartbeat while Monitor silent"
   )
   ```

   Set `heartbeatScheduledWakeupArmed = true`. The 5-minute interval (Q1=A) is fixed; not operator-configurable. `delaySeconds=300` sits at the low end of the harness `[60, 3600]` clamp. Zero token cost until fire — this is the SC-005 saving.

   **On heartbeat fire**: the harness re-invokes the model with the verbatim `/cockpit:auto` prompt. Perform the C3 drain, then write the ledger line:

   ```text
   <ref> · heartbeat · schedule-wakeup · fired · drain empty
   ```

   Or, when the drain returned events:

   ```text
   <ref> · heartbeat · schedule-wakeup · fired · drain complete (<M> events)
   ```

   where `<M>` is the number of events dispatched. Set `heartbeatScheduledWakeupArmed = false` (the outstanding heartbeat fired) and re-arm a fresh one per the shape above.

   **On Monitor-delivered wake** while a heartbeat is outstanding: the outstanding heartbeat is **superseded** — no explicit cancellation is required. Harness semantics allow the stale heartbeat to fire harmlessly later (its drain returns zero events, one extra ledger line accounted as `fired · drain empty`, no correctness impact). The bookkeeping remains `heartbeatScheduledWakeupArmed = true` until either the heartbeat fires (natural) or the current drain completes and re-arms a fresh one (superseded — the newer arm cycle takes over). Do NOT attempt to cancel or reference the outstanding `ScheduleWakeup` — the harness does not expose a cancel primitive, and correctness does not require one.

   Maps to FR-004, SC-005.

5. **Cursor recovery.** There is no watch process to re-arm from the cursor's perspective — the cursor is in-memory only, held for the lifetime of the current dispatch loop. Each cursor-error signal returned from `cockpit_await_events` is classified per the post-#924 hardened taxonomy and routed onto one of two branches. The parent maintains a **per-class consecutive-fault counter** — one counter each for `invalid-cursor`, `resetFrom`, `expiry`, `discarded`. Every counter resets to 0 on any **successful cursor reuse**: any `cockpit_await_events` call presenting a non-null cursor and returning no cursor-error signal (empty batches included — an accepted cursor returning zero events is the cursor mechanism working perfectly on a quiet epic). All counters reset together; the `streakOperatorAcknowledged` flag (see Branch B) resets to `false` on the same event.

   **Branch A — recover (unchanged semantics; per-class ledger accounting only):**
   - `resetFrom` reset signal in the returned batch — the tool server signaled a reset in the batch metadata (e.g., server-side event-log rotation). Increment `resetFrom` counter; recover; ledger `<epic-ref> · cursor-recovery · resetFrom · <resetFrom-counter>`.
   - Cursor expiry typed error — the cursor is past the server's retention window. Increment `expiry` counter; recover; ledger `<epic-ref> · cursor-recovery · expiry · <expiry-counter>`.
   - `discarded` signal — post-#924 hardened taxonomy for server restart / eviction. Increment `discarded` counter; recover; ledger `<epic-ref> · cursor-recovery · discarded · <discarded-counter>`.

   None of Branch A's classes ever fires the escalation gate. Their counters are ledger accounting only — the run summary § L.6 identifies reset-churn / expiry-churn / discarded-churn for future finding investigations, but no runtime escalation is triggered from these classes.

   **Branch B — recover once, then escalate on consecutive fault:**
   - `invalid-cursor` typed error — the cursor the parent passed is malformed / never-issued / wrong-epic (post-#924, a reliable caller-bug signal; the class also covers server-restart artifacts that present as `invalid-cursor` before the recovery sweep). Log the typed error's `code`/`message`/`details` verbatim; increment `invalid-cursor` counter; ledger `<epic-ref> · cursor-recovery · invalid-cursor · <invalid-cursor-counter>` (e.g., first consecutive fault writes `cursor-recovery · invalid-cursor · 1`).
     - If counter == 1 → recover (sweep + re-arm cursor-less); continue the loop.
     - If counter ≥ 2 AND the current streak is **not** operator-acknowledged → fire the **G.4(e) escalation gate** (see § Gate contract G.4(e)). The gate's options are `Continue degraded (sweep-per-batch) (Recommended)` and `Stop (exit auto)`.
     - If counter ≥ 2 AND the current streak IS operator-acknowledged (a prior `Continue degraded` on this unhealed streak) → recover; do **not** re-fire the gate (decide-once for the streak that raised it; per Q4=A of the #408 clarifications). The counter continues to increment for ledger accounting.

   All recoveries — Branch A and Branch B alike — converge on the same recovery path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.** Both the sweep (per § Ledger L.5 idempotency rule) and the re-arm are idempotent — the live-state re-check in step 4a catches events already dispatched (state moved on), so no duplicate action can result. **The cursor is in-memory only** — session restart, `invalid-cursor`, `resetFrom`, cursor expiry, and `discarded` all converge on this same recovery path, and no filesystem persistence of the cursor exists (no on-disk cursor file, no ledger re-derivation).

   Q2=A reset semantics (verbatim): any successful cursor reuse resets **ALL** counters to 0 and clears `streakOperatorAcknowledged`. A fresh 2-in-a-row `invalid-cursor` streak after a healed period is a **new** escalation decision — the gate re-fires at count == 2 again (per Q4=A).

   The compound-liveness cross-check (N=4 empty reads + actionable live state) retires with this step. The `maxWaitMs=1` at the tool boundary makes each drain effectively non-blocking; the "no events" case now surfaces as a Monitor-silent interval bounded by the C4 heartbeat, and the tool server owns the "silent stall" detection (a stalled server returns a typed error or fails the tool call, both of which the recovery branches above handle).

6. **Exit.** On `epic-complete`, print the run summary per § Ledger L.6 (including the absolute path of the run's `.ledger` file), and exit zero. Non-`epic-complete` exits (Stop from an escalation gate, unrecoverable error) print an abbreviated summary with the exit reason.

## Enriched-line dispatch contract

Post-generacy#985 the doorbell subprocess emits an NDJSON line per event carrying dispatch-sufficient fields. The parent parses each line as a candidate enriched event and dispatches label-driven classes directly from the line — dropping the per-event `cockpit_status(epic, json=true)` re-check that was the dominant GraphQL rate-limit consumer for the frequent dispatch classes. This section defines the parse gate, the per-class dispatch source, the merge-gate `checks` handling, the unified step-4a priority, the ledger marker rules, and the graceful-degradation guarantee. It is the authoritative reference for § Dispatch D.1–D.11 and step 4a; the dispatch rows below name it verbatim.

### E1 — Enriched line schema (consumed, not owned)

**Owner**: `generacy-ai/generacy#985` defines and versions the schema. This playbook reads what the engine emits; a future schema change on the generacy side surfaces here as a C2 detection-gate failure → fallback path fires. Reproduced for pin discoverability:

```jsonc
{
  "type": "issue-transition",
  "repo": "<owner>/<repo>",
  "kind": "issue" | "pr",
  "number": <integer>,
  "event": "<github-event-kind>",
  "to": "<engine-classified-target-state>",   // load-bearing: dispatch input
  "labels": ["<current-labels>", ...],         // load-bearing: dispatch input + ledger row content
  "url": "<github-url>",
  "checks": "green" | "red" | "pending"        // OPTIONAL; present only on merge-verdict-relevant events (D.5/D.6)
}
```

**Load-bearing fields** on the enriched-vs-bare gate (C2 below): `to` AND `labels`. `checks` is orthogonal to the gate and consulted only in the D.5/D.6 branch (C4).

### E2 — Enriched-vs-bare detection gate

**Rule**: A doorbell line is treated as **enriched** iff BOTH of the following hold:

1. The line JSON-parses to a value that is (a) an object (not `null`, not a string/number/boolean, not an array), AND
2. That object carries **both** `to` and `labels` fields with non-null, non-undefined values.

Any other outcome — parse failure, non-object parse result, missing `to`, missing `labels` — treats the line as **bare** and routes it to the fallback path (single authoritative `cockpit_status(epic=<epic-ref>, json=true)` per pre-#437 shape). This gate does NOT raise an error: a malformed line goes down the fallback path; the loop keeps running.

`checks` presence is NOT part of this gate. A legitimate label-change line has no `checks` — requiring `checks` here would route every label-driven line to the fallback path and nullify the whole rewrite. `checks` presence/absence is handled inside the D.5/D.6 path per C4.

### E3 — Dispatch source per class

Under the post-#437 contract each dispatch class falls into one of two source columns depending on whether the enriched-line path applies:

| Dispatch class | Trigger token (`to` field) | Source under enriched line | Source under bare line |
|----------------|----------------------------|----------------------------|------------------------|
| D.1 | `waiting-for:clarification` | **enriched line** | fallback |
| D.2 | `waiting-for:<artifact>-review` (spec/clarification/plan/tasks) | **enriched line** | fallback |
| D.3 | `waiting-for:implementation-review` | **enriched line** | fallback |
| D.4 | `waiting-for:manual-validation` | **enriched line** | fallback |
| D.5 | `completed:validate` + `checks: "green"` | **enriched line + `checks`** | fallback |
| D.6 | `completed:validate` + `checks: "red"` | **enriched line + `checks`** | fallback |
| D.7 | `agent:error` / `failed:<subtype>` | **enriched line** | fallback |
| D.8 | `phase-complete` | **fallback (retain re-check)** | fallback |
| D.9 | `waiting-for:address-pr-feedback` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9a | `waiting-for:pr-feedback` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9b | `waiting-for:children-complete` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9c | `waiting-for:dependencies` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9d | `phase:*` (prefix-match) | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.10 | Unrecognized / ambiguous | **fallback (retain re-check)** | fallback |
| D.11 | `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` | **fallback (retain re-check)** | fallback |

**Retain-the-re-check** (D.8, D.10, D.11): all three open human/consequential gates where a stale-line dispatch could open a gate against superseded state — D.8's phase-queue confirmation needs authoritative per-ad-hoc-ref state; D.10 is by definition the unknown-state class; D.11 could open a merge-conflicts escalation gate against a conflict the engine has already auto-remedied. All three are low-frequency (D.8 ≈once per phase; D.10/D.11 are error/escalation cases), so retaining the authoritative re-check costs almost nothing.

### E4 — `checks` verdict handling for D.5/D.6

**Rule**: The D.5/D.6 merge-gate dispatch consults the `checks` field on the enriched line (E1) and branches on its value:

| `checks` value | Action |
|----------------|--------|
| `"green"` | D.5 branch: `cockpit_merge(issue=<issue-ref>)` (unchanged from pre-#437) |
| `"red"` | D.6 branch: bounded fixer subagent (unchanged from pre-#437) |
| `"pending"` | **Fall back** to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` OR `cockpit_merge(issue=<issue-ref>)` (per the D.5 vs. D.6 dispatch); branch on the returned verdict per pre-#437 logic |
| Absent (field missing OR `null`/`undefined`) | **Fall back** — same as `"pending"` |

**Defer-on-pending was rejected**: smee doorbell delivery is best-effort/lossy; a lost follow-up event on the `pending → green | red` transition would silently stall the merge. Merge-gate dispatch is ≈once per issue, so the extra query cost on `pending` is negligible.

**Ledger marker on fallback**: D.5/D.6 fallback rows do NOT carry the `source: enriched-line` marker (they carry no marker; equivalent to `source: re-query`).

### E5 — Step-4a "resolve authoritative state" priority

**Unified contract**: Step 4a resolves authoritative state per this priority list:

1. **Prefer the enriched doorbell line's `to`/`labels`** (and, for D.5/D.6, `checks`) when E2 returns `enriched: true` AND the class is in the E3 "enriched line" column.
2. **Fall back to a single `cockpit_status(epic=<epic-ref>, json=true)`** when E2 returns `enriched: false` (bare line, older engine, content-less mode), OR the class is in the E3 fallback column (D.8, D.10, D.11), OR E4's `checks` verdict is absent/pending.

**Retained invariant**: `cockpit_await_events` remains the sole source of typed **batches** for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. The enriched line is a **dispatch input**, not a **batch source**. The distinction preserves the anti-drop protection of § Invariants §7 (content-based filters over the stream are prohibited; nothing that lands in the event log is silently dropped by the parent).

### E6 — Ledger row marker

**Format** (unchanged four-column shape, marker appended in outcome slot):

```
<issue-ref> · <transition-class> · <action> · <outcome> [· source: enriched-line]
```

**Marker rules**:

- **Append `· source: enriched-line`** to the outcome slot when the dispatch was driven by the enriched line (E2 = true AND the class is in the E3 "enriched line" column, including D.5/D.6 with decisive `checks`).
- **Omit the marker** (equivalent to `source: re-query`) when:
  - The class is in the E3 "fallback" column (D.8, D.10, D.11).
  - The class is in the E3 "enriched line" column but the line was bare (E2 = false) AND the fallback path fired.
  - The class is D.5/D.6 and `checks` was absent OR `pending` (E4 fallback path fired).

**Post-mortem grep semantics**: `grep 'source: enriched-line' <ledger>` isolates every enriched-line dispatch row (the post-#437 savings visible); `grep -v 'source: enriched-line' <ledger>` isolates every re-query row (pre-#437 shape, retain-the-re-check classes, and merge-gate fallbacks). Pre-#437 ledger files (no markers) and mixed pre/post-#437 ledgers concatenate without ambiguity.

### E7 — Graceful degradation

**Guarantee**: A cluster running an older `generacy` (pre-#985, no enriched line generation) sees every doorbell line fail the E2 detection gate (missing `to` and/or `labels`) and falls back to the pre-#437 `cockpit_status(epic, json=true)` per-event re-check. Pre-#437 behaviour is preserved verbatim on the fallback path.

**Schema drift protection**: A future generacy-side schema change (renaming a load-bearing field, dropping `to` or `labels` from a subset of events) surfaces on the skill side as an E2 gate failure → fallback path fires → the loop keeps running at pre-#437 cost. No runtime error, no operator-visible failure — the SC-001 saving degrades gracefully back to the baseline.

## Dispatch

The dispatch table below covers the label-driven classes (D.1–D.11) plus the UI-mode gate-answer completion class D.12 (fires only under `ResolvedGateMode === "ui"`). The parent resolves authoritative state per step 4a — the enriched doorbell line's `to` / `labels` (and, for D.5/D.6, `checks`) are the source of truth for label-driven classes (D.1–D.4, D.5/D.6 on decisive `checks`, D.7, D.9, D.9a–D.9d); the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check is retained for D.8, D.10, and D.11 (human/consequential gates), and fires as fallback for the label-driven classes when the doorbell line is bare (per FR-005 graceful degradation) or for D.5/D.6 when `checks` is absent or `pending` (per Q4=B). Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip any query entirely per § Invariants #8's cost contract. **D.12** is the UI-mode completion class: under `ResolvedGateMode === "ui"`, every gate contract G.1–G.7 that maps to the wire record (per § UI-mode gate mapping) OPENS via `cockpit_gate_open` instead of `AskUserQuestion`; the operator's answer arrives as a D.12 `gate-answer` event and D.12 routes `{optionId, freeText}` onto the SAME downstream handling the local `AskUserQuestion` path performs today, closing the record with `cockpit_gate_ack(applied | superseded | failed)`. Each dispatch is composed of **CLI verb + optional subagent + optional gate**; no dispatch invokes a `/cockpit:*` slash command (invariant §4).

| # | Event | Action shape |
|---|-------|--------------|
| D.1 | `waiting-for:clarification` | Clarification drafter subagent → single batched-gate `AskUserQuestion` (three options) → post + `cockpit advance` |
| D.2 | `waiting-for:<artifact>-review` | Review-verdict analyzer subagent → fused verdict gate → `cockpit advance` OR `COMMENT` review |
| D.3 | `waiting-for:implementation-review` | Same as D.2 (uses #390 contract for PR-scope analyzer) |
| D.4 | `waiting-for:manual-validation` | Manual-validation summarizer subagent → confirm gate → `cockpit advance` |
| D.5 | `completed:validate` + green | `cockpit merge` (no gate — human verdict was implementation-review) |
| D.6 | `completed:validate` + red / merge red | Bounded fixer subagent (once) → still red → escalation gate (Retry / Skip / Stop) |
| D.7 | `agent:error` / `failed:*` | Fetch evidence → escalation gate (Requeue / Skip / Stop) |
| D.8 | `phase-complete` | Phase-queue confirmation gate → `cockpit queue --yes` |
| D.9 | `waiting-for:address-pr-feedback` | Ledger line only (server-side owns it) |
| D.9a | `waiting-for:pr-feedback` | Ledger line only (legacy alias) |
| D.9b | `waiting-for:children-complete` | Ledger line only (epic-container state) |
| D.9c | `waiting-for:dependencies` | Ledger line only (engine-owned cross-issue wait) |
| D.9d | `phase:*` (prefix-match) | Ledger line only (engine-owned phase transition) |
| D.11 | `waiting-for:merge-conflicts` **or** `blocked:stuck-merge-conflicts` (labels co-occur when the engine escalates; deduplicated per-issue for one incident) | Escalation gate (`I've resolved it` / `Skip` / `Stop`) |
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |
| D.12 | `gate-answer` (typed event `type: "gate-answer"` on the doorbell NDJSON line and as a `cockpit_await_events` batch item; FLAT frozen shape — carries `gateId`, `gateKey`, `optionId`, `freeText`, `actor`, `deliveryId` (NO `generation`); fires only under `ResolvedGateMode === "ui"`) | Stale-gate check (gateId identity) → live-state supersession check → route optionId (+freeText) to the SAME downstream handling the local `AskUserQuestion` path performs (per § UI-mode gate mapping) → `cockpit_gate_ack(applied | superseded | failed)` |

### Pre-draft check — shared rules (UI mode)

Two rules that every § Dispatch **Step 0 — pre-draft gate-status check** obeys. They are stated once here so the six Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11) cannot drift apart. Both are dead prose under `ResolvedGateMode === "local"` (Step 0 is skipped entirely there).

**`runId` (fourth input under `runIdEnabled === true`) — per #469 / FR-010 / FR-014.** The pre-draft check's `gateId` uses FOUR inputs when `runIdEnabled === true`; the fourth input is the pre-flight-derived `runId` (per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions above; contract: `contracts/runid-derivation.md`). The `runId` is threaded on the `cockpit_gate_status` payload as an explicit literal read verbatim from loop state — NEVER re-derived by the Step 0 site, even by the same rule (per V2 / FR-014). Under `runIdEnabled === false` the field is OMITTED from the wire payload (V6) and the pre-#469 3-input identity applies. This bullet governs every Step 0 block below (D.1, D.2, D.3, D.4, D.7, D.11) — the six blocks name the same four inputs by construction under `runIdEnabled === true`, so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed AND the run is the same (per § step 3 sweep `gateId idempotency` above). The compute-once + explicit-literal invariant also extends to subagent dispatch prompts — see § UI-mode gate mapping header note "Subagent dispatch prompt template addition" for the runId-literal rule at every gate-verb-issuing subagent.

#### Generation-drift branch guard (dispatch-identity precondition)

The generation-drift branch — step 0's `{ status: 'absent' }` → `cockpit_gate_list` → "non-terminal gate at a DIFFERENT `generation`" → `cockpit_gate_ack(..., 'superseded')` — **destroys a gate**. It MUST therefore only ever supersede a gate that the CURRENT dispatch itself would have opened. Precondition, applied at every Step 0:

**A listed entry may be superseded only when BOTH hold:**

1. `entry.gateType` equals **this dispatch's** `gateType`. (Guaranteed when the list call passes the `gateType` filter — restated because `gateType` is OPTIONAL on `CockpitGateListInputSchema` (per generacy `mcp/gates/query-schemas.ts`), so an unfiltered call returns every type for the issue.) **AND**
2. the entry's **dispatch-identifying discriminator** — *which D.n row opened it* — is recoverable from the list entry `{gateId, gateType, generation, status}` (per `mcp/gates/query-schemas.ts § CockpitGateListEntrySchema`) **and equals this dispatch's row**.

**When the discriminator is NOT recoverable from the list entry, the drift branch MUST NOT supersede.** Skip the drift branch entirely — do not call `cockpit_gate_list`, do not ack anything — and proceed exactly as "no existing gate": fall through to the draft-then-open flow. A duplicate inbox entry is a recoverable annoyance that cloud-side coalescing bounds; destroying a live gate the operator is holding is not.

**Recoverability per `gateType`.** Four of the frozen enum values map 1:1 onto a single Step-0 row, so condition 2 is satisfied by condition 1 alone. `escalation` does not:

| gateType | Step-0 row(s) that open it | discriminator recoverable from a list entry? |
|---|---|---|
| `clarification` | D.1 (G.1) | yes — `gateType` ⇒ row |
| `artifact-review` | D.2 (G.2) | yes — `gateType` ⇒ row |
| `implementation-review` | D.3 (G.2) | yes — `gateType` ⇒ row |
| `manual-validation` | D.4 (G.3) | yes — `gateType` ⇒ row |
| `escalation` | **D.6 (G.4a), D.7 (G.4b), D.10 (G.4c), D.11 (G.4d)** | **NO — four rows share one `gateType`** |

(`phase-queue`, `filing`, and `scope-drained` have no Step 0 today — D.8 / G.6 / G.7 do not run a pre-draft check. Each maps 1:1 to a single row, so if one gains a Step 0 the precondition is satisfied by condition 1.)

**Consequence — the drift branch is DISABLED for `gateType: 'escalation'` (D.6, D.7, D.10, D.11).** All four escalation rows open gates under the single frozen enum value `escalation` (per generacy `mcp/gates/schemas.ts § GateTypeSchema`), `cockpit_gate_list` filters no finer than `{issueRef, gateType}`, and a list entry carries only `{gateId, gateType, generation, status}`. **Nothing on the wire says which escalation row opened a listed gate.** So in D.6, D.7, D.10, and D.11, on a `{ status: 'absent' }` return the plugin skips the list call and the drift branch and falls straight through to the draft-then-open flow. Without this guard, an `agent:error` event (D.7) would list the issue's escalation gates, find the operator's LIVE D.11 merge-conflict gate at a different `generation`, ack it `superseded` — and because the ack touches no label, when D.11 next fires its `dispatched-issues` dedup returns `already-dispatched` and the gate is never re-opened. The operator's merge-conflict surface vanishes silently. The mirror case destroys a D.7 gate.

**The plugin MUST NOT recover the subtype by parsing the `generation` string.** `generation` is an opaque `z.string().min(1)` on the wire with no format contract (`CockpitGateListEntrySchema`); the `<subtype>:<triggeringLabelOrState>:<occurrence>` shape in § Generation discriminator (UI mode) is a plugin-side authoring convention, not a wire guarantee. A gate opened by a different plugin version, a future row, or a future discriminator revision would be mis-parsed — and a mis-parse here destroys a live operator gate. Assuming structure the schema does not promise is precisely the class of defect this feature exists to remove.

**Residual limitation (NOT fixed here; deliberate).** Escalation-subtype generation drift is therefore undetectable: a genuinely stale escalation gate at an older occurrence counter is left non-terminal instead of being acked `superseded`, and the fresh gate opens alongside it. This is the conservative trade — with no subtype discriminator on the query surface, no client-side rule can distinguish "stale sibling of MY row" from "live gate of ANOTHER row", and the conservative behavior is to not supersede. Fixing it requires the query surface to carry a subtype discriminator (or a finer `gateType`); tracked upstream as [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046). Until #1046 ships, the behavior above is the contract — do not "improve" it client-side.

#### Gate-query error taxonomy

`cockpit_gate_status` and `cockpit_gate_list` each return `ToolResult<T>` — `{ status: 'ok', data }` or `{ status: 'error', class, detail, hint? }`. Four error classes are reachable at these call sites (per generacy `mcp/errors.ts § ErrorClass` and `mcp/tools/cockpit_gate_status.ts` / `cockpit_gate_list.ts`):

| `class` | What actually produces it | Required action |
|---|---|---|
| `query-unreachable` | The query client's transport error AFTER `withRetry` exhausts `QUERY_RETRY_SCHEDULE` (~3 attempts / ~5s) — a sustained cloud/relay outage. | **Abort this event's dispatch.** Ledger `<issue-ref> · <transition-class> · pre-draft-check · error: query-unreachable — aborting sweep for this event · source: ui-gate`, print the visible operator-facing line below (per generacy #1038 FR-014), continue with the NEXT event in the batch. The aborted event re-fires on the next natural wake once the cloud/relay recovers. |
| `invalid-args` | The tool's `.strict()` input parse REJECTED the payload — an unrecognized key, a missing required key, or a `gateType` outside the frozen enum. A deterministic **caller bug** in this playbook. | **Abort this event's dispatch and surface it loudly.** Ledger `<issue-ref> · <transition-class> · pre-draft-check · error: invalid-args — <detail> · source: ui-gate`, print the visible operator-facing line below, continue with the NEXT event. |
| `internal` | A throw wrapped by `wrapToolBoundary`, or a malformed upstream payload the query client could not parse. A deterministic **server/tool bug**. | Same as `invalid-args`, with the `internal` token in the ledger row. |
| `transport` (and any class not listed above, e.g. one introduced by a newer tool build) | The call never reached the query surface (MCP transport failure / `CockpitExit` code 1), or an unrecognized class. | Treat as unreachable: same abort + visible error as `query-unreachable`, with the observed class token written verbatim in the ledger row. Never guess a newer class's semantics. |

**Only a literal `{ status: 'absent' }` ok-return means "no existing gate".** No error class may be collapsed to `absent` and no error class may fall through to the draft-then-open flow. Collapsing `query-unreachable` re-introduces the exact duplicate-drafting hazard this feature fixes (a 20-issue epic sweeping during a relay outage would re-draft and re-open all 20 gates). Collapsing `invalid-args` / `internal` is worse: that bucket is populated **exclusively** by deterministic caller/server bugs, never by a race — so a single payload mismatch would silently degrade this entire feature back to a no-op with nothing in the ledger to say so, which is exactly how the previous iteration of this check shipped broken. An error is never evidence that a gate does not exist.

**Visible operator-facing error line** (printed to the transcript, no `[ledger] ` prefix, in addition to the ledger row):

```
pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger
```

Note that call-time errors here are handled DIFFERENTLY from `cockpit_gate_open` call-time errors (§ UI-mode fallback): a failed gate-*open* falls back to a local `AskUserQuestion` because the operator still needs the gate; a failed gate-*query* has no safe fallback, because "I could not read the gate state" is not "there is no gate".

**Cross-reference — pre-flight functional probe (§ step 1 § Pre-flight probe (UI mode))**. The four-class taxonomy above is ALSO consumed by the pre-flight functional probe. The probe issues exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call at pre-flight (per § step 1 § Pre-flight probe (UI mode)) and classifies its response using the exact same four classes with the exact same routing (any `{ status: 'error', class, detail }` triggers the probe fail path — write the `preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` ledger row, print the operator-facing line, then either exit non-zero (explicit `--gates=ui`) or resolve to `local` (short-circuit `--gates=auto` → `local` with `<resolution reason> = probe-failed`)). No new class is introduced — a divergence between per-event pre-draft-check classification and pre-flight probe classification would silently break the consistency contract this taxonomy exists to enforce. An operator diagnosing a `preflight · gate-query-probe · error: internal` ledger row finds the class definition in the table above; the underlying failure mode is the same server/tool bug the per-event `internal` bucket names.

### D.1 — `waiting-for:clarification`

**Trigger**: An issue enters `waiting-for:clarification` (open clarification questions posted, awaiting operator-authored answers). Verbatim event string: `waiting-for:clarification`.

**Source of truth**: The dispatch reads `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check fires on the enriched-line path. On bare / malformed lines the fallback path fires per FR-005 (single `cockpit_status` re-query, pre-#437 behaviour). The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = clarification`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`, extended by Phase B / generacy#1067 commit `82077f1a` with the optional `runId` field). The plugin passes the three semantic inputs verbatim AND — under `runIdEnabled === true` — the pre-flight-derived `runId` from § In-memory loop state additions above; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool server internally derives `gateKey`/`gateId` from the semantic inputs plus (under `runIdEnabled === true`) the fourth `runId` segment, and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (per § step-3 sweep `gateId idempotency` DATA GAP note: `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — it is known at record time and is MANDATORY, because § D.12 step 3 keys its live-state supersession check on it and § D.12 step 4 routes on `(dispatchClass, optionId)`; leaving it undefined resolves no downstream handler for the operator's answer. The reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
      - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session (either the answer was applied by a prior session that crashed, or the redelivery has not landed). Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above — including the mandatory `dispatchClass` — with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, so no sweep is double-counted), and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4 / `contracts/runid-threading.md § Read-side (cockpit_gate_list)`; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }` (per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`; row-level `runId` per generacy-cloud#892). Iterate `result.gates` and branch (order is load-bearing — same-generation is the more specific match than drift, so it MUST be evaluated first):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — the page may hide a same-generation entry (a prior-run natural gate this dispatch would duplicate) OR a drift entry the plugin cannot see. Treat as a query-unreachable error per sub-step 3 below (abort the sweep for this event with a visible error) — do NOT fall through to draft-fresh, which would risk the duplicate-gate hazard the pre-draft check exists to prevent.
        - **Non-terminal gate at the SAME `generation`** (a `gates[]` entry whose `generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId` (per #469 FR-001, which put `runId` into `gateId` derivation and made this case reachable in a fresh run). Do **NOT** draft, do **NOT** open, do **NOT** supersede — this is byte-identical to the § step 3 § Adoption pass's `adopt-natural` branch (per #471 / SC-006; see § Adoption pass and `contracts/adoption-sweep.md § Branch: adopt-natural`). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.1', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003 / § In-memory loop state additions), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated (DATA GAP — same limitation as the reuse-answered branch above and the § Adoption pass). Continue to the next event. **Coverage rationale**: the § step 3 § Adoption pass runs once at startup only; an issue that enters scope AFTER the startup sweep (e.g. an epic child that becomes in-scope on a later wake, or a scope-add mid-run) never goes through the adoption pass. This Step 0 branch is the sole path that adopts a prior-run same-generation gate for those issues; the adoption pass is a bulk optimisation, this branch is the load-bearing correctness site.
        - **Non-terminal gate at a DIFFERENT `generation`** (a `gates[]` entry whose `generation !== <this event's fresh generation>` AND `status ∈ {open, answered}`) — generation drift (Q1=C). The pending gate was drafted from older content; the two `gateId`s do not coalesce. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the stale gate MAY belong to a prior run whose `runId` differs from the current one; `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so this drift-branch ack supersedes the stale gate regardless of which run opened it — critical here because `staleGateId` was discovered via the runId-agnostic `cockpit_gate_list` call above); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the current draft-then-open flow (below) with the fresh generation. Re-attaching would apply an operator verdict computed against an old head SHA to current content — the correctness hazard D.12's supersession checks exist to prevent. **Ordering note**: `cockpit_gate_list` does NOT specify a return ordering (per generacy #1038 contract); when multiple drift entries are present the plugin picks the first non-terminal entry it observes and acks that one — remaining stale entries are acked on subsequent sweeps of the same event (each fresh draft supersedes at most one stale entry per sweep; the loop converges).
        - **Empty `gates` list** — no gate anywhere for this `(issueRef, gateType)` pair. Fall through to the current draft-then-open flow (below) unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>` — `{ status: 'ok', data }` or `{ status: 'error', class, detail }`. Four error classes are reachable here (per generacy `mcp/errors.ts § ErrorClass`): `query-unreachable` (surfaced only after the tool's internal `withRetry` budget is exhausted — ~3 attempts / ~5s — signifying a sustained cloud/relay outage, NOT a transient race), `invalid-args` (the tool's `.strict()` input parse rejected the payload — a deterministic caller bug), `internal` (a wrapped throw or malformed upstream payload — a deterministic server/tool bug), and `transport` (the call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class — `query-unreachable` least of all — to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch. Collapsing `query-unreachable` re-introduces the exact duplicate-drafting hazard this feature fixes (a 20-issue epic sweeping during a relay outage would re-draft and re-open all 20 gates); collapsing `invalid-args` / `internal` is worse, because that bucket is populated exclusively by deterministic bugs rather than races, so one payload mismatch would silently degrade the whole check back to a no-op.

1. **Fetch context**: `cockpit_context(issue=<issue-ref>)` (the same MCP tool `/cockpit:clarify` uses). The return payload's `clarificationComment.body` field carries the engine-authored batch-comment template (raw). Parse it into per-question `{title, context, question, options}` per the shared batch-comment rule (`### Q<n>: <title>` headers + `**Context**:` / `**Question**:` / `**Options**:` labels; option bullets tolerant of `A:` and `A)` styles; free-form questions with no `**Options**:` label yield `options: null`).
2. **Spawn clarification drafter subagent** (see § Gate contract G.1 and the SB.1 return schema below). Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Draft clarifications <issue-ref>"
   prompt: <inlined open-question list + spec/plan bodies + touched-files context + return-schema directive>
   ```
   The subagent MUST NOT invoke any slash command. It returns a single JSON value — either an array of `{question_id, recommendation, justification, provenance}` (one per open question, in order), or `{"error": "<description>"}`. No prose, no fenced block. `recommendation` is the chosen letter + its text (for lettered-option questions) OR the drafted free-form response (for free-form questions); `justification` is 1–3 sentences of *why over alternatives* (rendered under `**Why:**` and posted as `**Rationale:**`).
3. **Present fused batch gate** (see § Gate contract G.1). In one assistant response, merge the parsed batch (step 1) with the drafter return (step 2) into a five-element presentation block per open question — title from the batch header, context/question/options verbatim from the batch, recommendation/why/provenance from the drafter:

   ```markdown
   Drafted answers for <issue-ref> (<N> open questions):

   ### Q<n> — <title from batch comment>
   **Context:** <framing from batch comment, verbatim/condensed>
   **Question:** <question verbatim>
   **Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
   **Recommendation:** <chosen letter + its text, or the drafted free-form response>
   **Why:** <1–3 sentences justifying the recommendation over the other options>
   _provenance: <citation>_

   (repeat per open question — one block per Q, separated by a blank line)
   ```

   Free-form questions render `**Options:** (free-form — no options posted)` verbatim (never drop the line). When a batch header lacks a title, substitute `q.question.split('\n')[0].slice(0, 80)` — canonical path is verbatim from the batch header; truncation is defense-in-depth.

   **Plus** a single `AskUserQuestion` call in the same response (never `ceil(N/4)` and never per-question):
   - **Question text**: `Post all <N> drafted answers to <issue-ref>?`
   - **Header**: `Clarify` (≤ 12 chars)
   - **multiSelect**: `false`
   - **Options** (exactly three, discrete, in this order):
     1. `Approve all & post (Recommended)` — post every drafted answer as-is.
     2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
     3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.

   Built-in "Other" free-text is the **one-turn edit path**: directives typed there are parsed via the same rule (see § Directive grammar) and applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip. The change-collection turn following an explicit `Make changes` selection is NOT the same risk as the #388 turn-split concern — the #388 concern was about splitting a gate's presentation from its decision, which allowed the loop to auto-proceed on an implicit-approve default; the `Make changes` re-loop cannot auto-proceed (zero directives is a no-op re-present, not an implicit approve or skip), and every iteration requires an explicit operator choice.
4. **Assemble comment body**: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per approved (or edited) answer, in ascending question-number order, separated by a single blank line. Each block emits `**Answer:** <recommendation>` on one line and `**Rationale:** <justification>` on the next. Read the `recommendation` and `justification` fields from the drafter return (step 2); the assembly step reads the same fields the presentation renders, so display and posted content cannot drift. For bare-letter operator overrides (a directive whose `rationale` is `null` per § Directive grammar), emit NO `**Rationale:**` line — never retain the draft's justification under an operator-overridden answer. Skipped questions do not appear. Write to `/tmp/cockpit-auto-clarify-<issue>-<unix_ts>.md`. Post via `gh issue comment "$ISSUE" --body-file <tmpfile>` — use `--body-file` exclusively (never `-b` / `--body`; shell quoting risks stripping the marker).
5. **Advance gate**: If every open question received an approved or edited answer, call `cockpit_advance(issue=<issue-ref>, gate="clarification")`. If some were skipped, do not advance — write a ledger line noting the partial state (`posted <k>/<N>, skipped <s>`) and continue.

**Ledger line**: `<issue-ref> · waiting-for:clarification · clarification-batch · <outcome>` where outcome is one of `advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>`.

**Failure modes**:
- Subagent returns `{"error": …}` → **Error handling** class `OTHER`; do not post; do not advance; write ledger line noting the error.
- All answers skipped → do not post; do not advance; ledger line `all answers skipped`.
- Post fails → **Error handling**; ledger line noting the failure (do not attempt retraction).
- Advance fails → **Error handling**; ledger line noting the failure.

### D.2 — `waiting-for:<artifact>-review`

**Trigger**: An issue enters `waiting-for:spec-review`, `waiting-for:clarification-review`, `waiting-for:plan-review`, or `waiting-for:tasks-review`. Verbatim event string: `waiting-for:<artifact>-review`.

**Source of truth**: The dispatch reads `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check fires on the enriched-line path. On bare / malformed lines the fallback path fires per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = artifact-review` (the single frozen enum value — the spec/clarification/plan/tasks distinction is folded into the `generation` discriminator as `<artifactKind>@<reviewBranchHeadSHA>`, per § Generation discriminator (UI mode)). Passing `gateType: 'spec-review' | 'clarification-review' | 'plan-review' | 'tasks-review'` would be rejected by the tool's `.strict()` schema (per generacy `mcp/gates/schemas.ts § GateTypeSchema`), so the plugin MUST pass the enum value `artifact-review` verbatim. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`, extended by Phase B / generacy#1067 commit `82077f1a` with the optional `runId` field). The plugin passes the three semantic inputs verbatim AND — under `runIdEnabled === true` — the pre-flight-derived `runId` from § In-memory loop state additions above; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool server internally derives `gateKey`/`gateId` from the semantic inputs plus (under `runIdEnabled === true`) the fourth `runId` segment, and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (per § step-3 sweep `gateId idempotency` DATA GAP note: `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — it is known at record time and is MANDATORY, because § D.12 step 3 keys its live-state supersession check on it and § D.12 step 4 routes on `(dispatchClass, optionId)`; leaving it undefined resolves no downstream handler for the operator's answer. The reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
      - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session (either the answer was applied by a prior session that crashed, or the redelivery has not landed). Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above — including the mandatory `dispatchClass` — with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, so no sweep is double-counted), and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4 / `contracts/runid-threading.md § Read-side (cockpit_gate_list)`; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }` (per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`; row-level `runId` per generacy-cloud#892). Iterate `result.gates` and branch (order is load-bearing — same-generation is the more specific match than drift, so it MUST be evaluated first):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — the page may hide a same-generation entry (a prior-run natural gate this dispatch would duplicate) OR a drift entry the plugin cannot see. Treat as a query-unreachable error per sub-step 3 below (abort the sweep for this event with a visible error) — do NOT fall through to draft-fresh, which would risk the duplicate-gate hazard the pre-draft check exists to prevent.
        - **Non-terminal gate at the SAME `generation`** (a `gates[]` entry whose `generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId` (per #469 FR-001). Do **NOT** draft, do **NOT** open, do **NOT** supersede — this is byte-identical to the § step 3 § Adoption pass's `adopt-natural` branch (per #471 / SC-006; see § Adoption pass and `contracts/adoption-sweep.md § Branch: adopt-natural`). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.2', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003 / § In-memory loop state additions), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated (DATA GAP — same limitation as the reuse-answered branch above and the § Adoption pass). Continue to the next event. **Coverage rationale**: the § step 3 § Adoption pass runs once at startup only; an issue that enters scope AFTER the startup sweep never goes through the adoption pass. This Step 0 branch is the sole path that adopts a prior-run same-generation gate for those issues; the adoption pass is a bulk optimisation, this branch is the load-bearing correctness site.
        - **Non-terminal gate at a DIFFERENT `generation`** (a `gates[]` entry whose `generation !== <this event's fresh generation>` AND `status ∈ {open, answered}`) — generation drift (Q1=C). The pending gate was drafted from older content; the two `gateId`s do not coalesce. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the stale gate MAY belong to a prior run whose `runId` differs from the current one; `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so this drift-branch ack supersedes the stale gate regardless of which run opened it — critical here because `staleGateId` was discovered via the runId-agnostic `cockpit_gate_list` call above); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the current draft-then-open flow (below) with the fresh generation. Re-attaching would apply an operator verdict computed against an old head SHA to current content — the correctness hazard D.12's supersession checks exist to prevent. **Ordering note**: `cockpit_gate_list` does NOT specify a return ordering (per generacy #1038 contract); when multiple drift entries are present the plugin picks the first non-terminal entry it observes and acks that one — remaining stale entries are acked on subsequent sweeps of the same event.
        - **Empty `gates` list** — no gate anywhere for this `(issueRef, gateType)` pair. Fall through to the current draft-then-open flow (below) unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>` — `{ status: 'ok', data }` or `{ status: 'error', class, detail }`. Four error classes are reachable here (per generacy `mcp/errors.ts § ErrorClass`): `query-unreachable` (surfaced only after the tool's internal `withRetry` budget is exhausted — ~3 attempts / ~5s — signifying a sustained cloud/relay outage, NOT a transient race), `invalid-args` (the tool's `.strict()` input parse rejected the payload — a deterministic caller bug), `internal` (a wrapped throw or malformed upstream payload — a deterministic server/tool bug), and `transport` (the call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class — `query-unreachable` least of all — to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch. Collapsing `query-unreachable` re-introduces the exact duplicate-drafting hazard this feature fixes (a 20-issue epic sweeping during a relay outage would re-draft and re-open all 20 gates); collapsing `invalid-args` / `internal` is worse, because that bucket is populated exclusively by deterministic bugs rather than races, so one payload mismatch would silently degrade the whole check back to a no-op.

1. **Resolve target artifact** — parse `<artifact>` from the transition class; identify the file to review (e.g., `specs/<issue-slug>/spec.md`, `plan.md`, `tasks.md`, `clarifications.md`).
2. **Spawn review-verdict analyzer subagent** — reuses #390's contract verbatim. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Review artifact <name>"
   prompt: <artifact path + gate name + review instructions + return-schema directive>
   ```
   The subagent reads the artifact + surrounding context directly and returns a single JSON value — either an array of `[{file, line, summary, failure_scenario}, ...]`, `[]` for zero findings, or `{"error": "<description>"}`. No prose, no fenced block. **MUST NOT print raw JSON under any circumstance.** The parent renders the parsed array as a findings-summary table; it never restates the JSON verbatim.
3. **Present fused verdict gate** (see § Gate contract G.2). In one assistant response: findings-summary table (per #388 C.3.5 shape) + `Suggested decision: <approve | request-changes>` line + single `AskUserQuestion` with options `approve` / `request-changes` / `abort` (in that order), header `Verdict`, `multiSelect: false`. For zero findings (`[]`), still present the gate — the row is `| (none) | | | |` with `Suggested decision: approve`.
4. **Apply verdict**:
   - `approve` → `cockpit_advance(issue=<issue-ref>, gate=<gate-name>)`.
   - `request-changes` → run the four-step guardrail below. The exact JSON body shape, GraphQL query, marker string, and ledger templates live in `specs/422-summary-auto-md-s/contracts/request-changes-post.md` and `specs/422-summary-auto-md-s/contracts/postcondition-check.md`; the prose here spells out the guardrail steps but never restates those shapes verbatim.
     1. **Pre-validate anchors** — fetch the PR diff via `gh pr diff <owner>/<repo>#<pr-n>`, parse `@@ -A,B +C,D @@` hunk headers into `DiffHunk[]`, and assign each `Finding` an `AnchorCheck` verdict per `data-model.md` (§ AnchorCheck rule: `anchored` iff `finding.line != null` AND ∃ hunk in the same file whose `[headStart, headStart + headCount − 1]` range contains `finding.line`; every other finding is `unanchored`, tagged with reason `analyzer-supplied-null` or `outside-diff-hunks`).
     2. **Compose bundle** — assemble the `ReviewPostBundle` per `contracts/request-changes-post.md` § POST body: one `comments[]` entry per anchored finding (`path`, `line`, `body: <summary> — <failure_scenario>`); unanchored findings render into `body` under the literal marker `<!-- generacy-cockpit:unanchored-findings -->` immediately followed by `## General findings (no file anchor)`, per contract § Unanchored-block shape. **Refuse to POST when `comments.length == 0` AND unanchored count == 0** — a `request-changes` on zero findings is a contract violation (Error handling class `OTHER`).
     3. **POST** — `gh api -X POST /repos/<owner>/<repo>/pulls/<pr-n>/reviews --input <bundle>`; capture the response's `.id` and `.submitted_at`. Exit 0 is required to proceed. The POST response body does NOT carry a `comments` field (see `specs/429-re-filed-from-generacy/data-model.md § PostReviewResponse`); Leg 1 counts inline comments via a separate REST endpoint.
     4. **Verify (two legs)** per `contracts/postcondition-check.md` § Combined verdict:
        - **Leg 1** — see `contracts/postcondition-check.md § Leg 1` for the paginated GET-and-filter procedure (single source of truth): `gh api --paginate /repos/<owner>/<repo>/pulls/<pr-n>/comments?per_page=100`, filter to `pull_request_review_id == response.id`, early-exit at `bundle.comments.length`, inline poll 500 ms → 1 s → 2 s across four attempts. `Leg1Check.outcome == "genuine-undercount"` (never `undefined.length`) is the failure signal that trips the outer 2 s → re-POST retry.
        - **Leg 2** — run the `reviewThreads(first:50)` GraphQL query from the same contract; filter client-side to nodes matching ALL of: `isResolved == false`, `comments.nodes[0].author.login == <acting-bot-login>` (both sides under `postcondition-check.md § Login normalization`), `comments.nodes[0].createdAt >= response.submitted_at`. Filtered count MUST be `≥ bundle.comments.length`.
        Success ⇔ both legs pass. On failure: sleep 2000 ms, retry the POST once; if the second attempt's postcondition also fails, re-present G.2 (see § Gate contract G.2 — re-presentation shape) with the failure notice prepended. On success (first attempt or after retry), emit the `Feedback posted: N inline comment(s) on PR #<pull_number>` success line (N = anchored count) — this is the only marker downstream steps read to confirm the POST landed.
     5. **No `cockpit_advance`** — unresolved threads own the transition; the server-side `PrFeedbackMonitorService` (generacy#861/#869/#878/#883 lineage) applies `waiting-for:address-pr-feedback` and enqueues fix work. Calling `advance` here races the server.
   - `abort` → do nothing (no post, no advance).

**Ledger line**: `<issue-ref> · waiting-for:<artifact>-review · review-analysis+<verdict> · <outcome>` — outcomes: `approved` / `posted (<anchored> inline, <unanchored> in body)` (first-attempt success) / `postcondition-failed → re-present-gate` (failed after retry) / `aborted` / `advance failed` / `error: <description>`. See § Ledger cheatsheet for the postcondition-passed/failed and review-post-retry line shapes emitted around the request-changes POST.

**Failure modes**: `[]` still prompts the gate (assist-mode contract preserved). `{"error": …}` → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Parse failure or other shape → **Error handling** with the raw return quoted.

### D.3 — `waiting-for:implementation-review`

**Trigger**: A PR enters `waiting-for:implementation-review`. Verbatim event string: `waiting-for:implementation-review`.

**Source of truth**: The dispatch reads `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check fires on the enriched-line path. On bare / malformed lines the fallback path fires per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**: Structurally identical to D.2; the only difference is the scope passed to the subagent — an artifact file (D.2) vs. a PR reference (D.3). Both use the #390 contract verbatim.

0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = implementation-review`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`, extended by Phase B / generacy#1067 commit `82077f1a` with the optional `runId` field). The plugin passes the three semantic inputs verbatim AND — under `runIdEnabled === true` — the pre-flight-derived `runId` from § In-memory loop state additions above; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool server internally derives `gateKey`/`gateId` from the semantic inputs plus (under `runIdEnabled === true`) the fourth `runId` segment, and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (per § step-3 sweep `gateId idempotency` DATA GAP note: `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — it is known at record time and is MANDATORY, because § D.12 step 3 keys its live-state supersession check on it and § D.12 step 4 routes on `(dispatchClass, optionId)`; leaving it undefined resolves no downstream handler for the operator's answer. The reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
      - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session (either the answer was applied by a prior session that crashed, or the redelivery has not landed). Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above — including the mandatory `dispatchClass` — with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, so no sweep is double-counted), and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4 / `contracts/runid-threading.md § Read-side (cockpit_gate_list)`; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }` (per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`; row-level `runId` per generacy-cloud#892). Iterate `result.gates` and branch (order is load-bearing — same-generation is the more specific match than drift, so it MUST be evaluated first):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as query-unreachable per sub-step 3 (abort with visible error) — do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (a `gates[]` entry whose `generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId` (per #469 FR-001). Do **NOT** draft, do **NOT** open, do **NOT** supersede — this is byte-identical to the § step 3 § Adoption pass's `adopt-natural` branch (per #471 / SC-006; see § Adoption pass and `contracts/adoption-sweep.md § Branch: adopt-natural`). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.3', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003 / § In-memory loop state additions), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated (DATA GAP). Continue to the next event. **Coverage rationale**: the § step 3 § Adoption pass runs once at startup only; an issue that enters scope AFTER the startup sweep never goes through the adoption pass. This Step 0 branch is the sole path that adopts a prior-run same-generation gate for those issues.
        - **Non-terminal gate at a DIFFERENT `generation`** (a `gates[]` entry whose `generation !== <this event's fresh generation>` AND `status ∈ {open, answered}`) — generation drift (Q1=C). Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the stale gate MAY belong to a prior run whose `runId` differs from the current one; the ack path is runId-accepted-and-ignored so the ack lands regardless); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the current draft-then-open flow (below) with the fresh generation.
        - **Empty `gates` list** — no gate anywhere for this `(issueRef, gateType)` pair. Fall through to the current draft-then-open flow (below) unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>` — `{ status: 'ok', data }` or `{ status: 'error', class, detail }`. Four error classes are reachable here (per generacy `mcp/errors.ts § ErrorClass`): `query-unreachable` (surfaced only after the tool's internal `withRetry` budget is exhausted — ~3 attempts / ~5s — signifying a sustained cloud/relay outage, NOT a transient race), `invalid-args` (the tool's `.strict()` input parse rejected the payload — a deterministic caller bug), `internal` (a wrapped throw or malformed upstream payload — a deterministic server/tool bug), and `transport` (the call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class — `query-unreachable` least of all — to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch. Collapsing `query-unreachable` re-introduces the exact duplicate-drafting hazard this feature fixes (a 20-issue epic sweeping during a relay outage would re-draft and re-open all 20 gates); collapsing `invalid-args` / `internal` is worse, because that bucket is populated exclusively by deterministic bugs rather than races, so one payload mismatch would silently degrade the whole check back to a no-op.

1. **Resolve PR** — from `cockpit status --json`, get the issue's associated PR ref (`<owner>/<repo>#<pr-n>`).
2. **Spawn review-verdict analyzer subagent** — same subagent as D.2, invoked with the PR ref as scope:
   ```
   subagent_type: "general-purpose"
   description: "Code review PR #<n>"
   prompt: <PR ref + review instructions + return-schema directive>
   ```
   The prompt carries only the PR reference; the subagent fetches its own diff via `gh pr diff <owner>/<repo>#<pr-n>` and reads surrounding files as needed. Returns strict JSON per the SB.2 schema. The raw-JSON-suppression clause carried forward from #388 / #390 (canonical inline occurrence is in D.2 prose above) applies here identically — the parent renders the parsed findings as a table; it never restates the JSON verbatim.
3. **Present fused verdict gate** — same as D.2 (see § Gate contract G.2).
4. **Apply verdict** — same as D.2. On `request-changes`, run the D.2 four-step guardrail; the `<acting-bot-login>` used in the Leg-2 GraphQL filter is the PR-author credential (Generacy single-credential rule — the same account that opened the PR posts the review), so it MUST match the `viewer.login` seen by `gh api graphql -f query='{ viewer { login } }'` in the same session. The `<owner>/<repo>/<pr-n>` triple comes from step 1's `cockpit status --json` result.

**Ledger line**: `<issue-ref> · waiting-for:implementation-review · review-analysis+<verdict> · <outcome>` — outcomes as in D.2.

### D.4 — `waiting-for:manual-validation`

**Trigger**: An issue enters `waiting-for:manual-validation` (implementation approved, awaiting manual smoke test). Verbatim event string: `waiting-for:manual-validation`.

**Source of truth**: The dispatch reads `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check fires on the enriched-line path. On bare / malformed lines the fallback path fires per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = manual-validation`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`, extended by Phase B / generacy#1067 commit `82077f1a` with the optional `runId` field). The plugin passes the three semantic inputs verbatim AND — under `runIdEnabled === true` — the pre-flight-derived `runId` from § In-memory loop state additions above; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool server internally derives `gateKey`/`gateId` from the semantic inputs plus (under `runIdEnabled === true`) the fourth `runId` segment, and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (per § step-3 sweep `gateId idempotency` DATA GAP note: `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — it is known at record time and is MANDATORY, because § D.12 step 3 keys its live-state supersession check on it and § D.12 step 4 routes on `(dispatchClass, optionId)`; leaving it undefined resolves no downstream handler for the operator's answer. The reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
      - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session (either the answer was applied by a prior session that crashed, or the redelivery has not landed). Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above — including the mandatory `dispatchClass` — with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, so no sweep is double-counted), and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4 / `contracts/runid-threading.md § Read-side (cockpit_gate_list)`; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }` (per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`; row-level `runId` per generacy-cloud#892). Iterate `result.gates` and branch (order is load-bearing — same-generation is the more specific match than drift, so it MUST be evaluated first):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as query-unreachable per sub-step 3 (abort with visible error) — do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (a `gates[]` entry whose `generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId` (per #469 FR-001). Do **NOT** draft, do **NOT** open, do **NOT** supersede — this is byte-identical to the § step 3 § Adoption pass's `adopt-natural` branch (per #471 / SC-006; see § Adoption pass and `contracts/adoption-sweep.md § Branch: adopt-natural`). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.4', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003 / § In-memory loop state additions), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated (DATA GAP). Continue to the next event. **Coverage rationale**: the § step 3 § Adoption pass runs once at startup only; an issue that enters scope AFTER the startup sweep never goes through the adoption pass. This Step 0 branch is the sole path that adopts a prior-run same-generation gate for those issues.
        - **Non-terminal gate at a DIFFERENT `generation`** (a `gates[]` entry whose `generation !== <this event's fresh generation>` AND `status ∈ {open, answered}`) — generation drift (Q1=C). Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the stale gate MAY belong to a prior run whose `runId` differs from the current one; the ack path is runId-accepted-and-ignored so the ack lands regardless); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the current draft-then-open flow (below) with the fresh generation.
        - **Empty `gates` list** — no gate anywhere for this `(issueRef, gateType)` pair. Fall through to the current draft-then-open flow (below) unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>` — `{ status: 'ok', data }` or `{ status: 'error', class, detail }`. Four error classes are reachable here (per generacy `mcp/errors.ts § ErrorClass`): `query-unreachable` (surfaced only after the tool's internal `withRetry` budget is exhausted — ~3 attempts / ~5s — signifying a sustained cloud/relay outage, NOT a transient race), `invalid-args` (the tool's `.strict()` input parse rejected the payload — a deterministic caller bug), `internal` (a wrapped throw or malformed upstream payload — a deterministic server/tool bug), and `transport` (the call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class — `query-unreachable` least of all — to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch. Collapsing `query-unreachable` re-introduces the exact duplicate-drafting hazard this feature fixes (a 20-issue epic sweeping during a relay outage would re-draft and re-open all 20 gates); collapsing `invalid-args` / `internal` is worse, because that bucket is populated exclusively by deterministic bugs rather than races, so one payload mismatch would silently degrade the whole check back to a no-op.

1. **Spawn manual-validation summarizer subagent** — the parent MUST NOT read the spec / issue body / PR body inline (Q4=B, AP-9). All artifact reads happen inside the subagent. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Manual val summary <issue-ref>"
   prompt: <issue-ref + PR-ref + read-and-summarize instructions + return-schema directive>
   ```
   The subagent reads spec §Success Criteria + the issue's acceptance criteria + the PR title/body, and returns a single JSON value — either `{scenarios: [...], acceptance_checks: [...]}` (one-line entries in each list) or `{"error": "<description>"}`. No prose, no fenced block.
2. **Present manual-validation gate** (see § Gate contract G.3). In one assistant response: `**Scenarios to test:**` bulleted list + `**Acceptance checks:**` bulleted list (rendered verbatim from the structured return) + single `AskUserQuestion` with options `manually validated` / `not yet`, header `Validated?` (≤ 12 chars), `multiSelect: false`.
3. **Apply verdict**:
   - `manually validated` → `cockpit_advance(issue=<issue-ref>, gate="manual-validation")`.
   - `not yet` → do nothing (the label stays; the event will re-fire when the operator confirms later or takes another action).

**Ledger line**: `<issue-ref> · waiting-for:manual-validation · manual-validation-summary+<verdict> · <outcome>` — outcomes: `manually validated` / `not yet` / `error: <description>`.

**Failure modes**: `{"error": …}` → **Error handling** class `OTHER`; do not invoke gate; ledger line.

### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` and the PR's checks are all green. Verbatim event string: `completed:validate`.

**Source of truth**: The dispatch reads `to`, `labels`, and `checks` from the enriched doorbell line per § Enriched-line dispatch contract E3/E4 — on decisive `checks: "green"` the merge fires without a per-event re-check. On `checks: absent | pending` (per Q4=B) OR a bare / malformed line the fallback path fires. The ledger row carries `· source: enriched-line` on the enriched-line path (decisive `checks: "green"`); the fallback path writes no suffix (equivalent to `source: re-query`) per § Enriched-line dispatch contract E6.

**Dispatch**:
1. **Resolve `checks` verdict.** Prefer the enriched doorbell line's `checks` field (per § Enriched-line dispatch contract E4). If `checks: "green"` → proceed with merge (step 2). If `checks: "red"` → fall through to D.6. If `checks` is **absent OR `pending`** (per Q4=B), fall back to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` — verify `checks_state == "green"` and no infrastructure/runner failures; a fallback verdict showing red falls through to D.6.
2. **Merge**: `cockpit_merge(issue=<issue-ref>)` (squash, branch delete per the tool's default; the tool resolves the issue's linked PR internally — passing a PR ref directly is a distinct failure mode observed in agency#398).
3. **No gate.** The operator's judgment was recorded at `waiting-for:implementation-review` (D.3). `validate` + green checks is mechanical; no additional prompt.

**Never merge on red** — the branch exists here strictly on the `result: merged` outcome (invariant §1).

**Ledger line**: `<issue-ref> · completed:validate · merge · <outcome>` — outcomes: `merged (PR #<n>)` / `blocked: missing-approval` / `blocked: draft` / `blocked: pending` / `blocked: missing-label` / `infrastructure failure — <checks>`.

**Failure modes**:
- `cockpit merge` returns `result: "red"` → fall through to D.6 (fixer branch).
- `cockpit merge` returns `result: "blocked"` → handle per `merge.md`'s existing decision tree (missing-label / missing-approval / draft / pending). For `pending`, defer to the watcher (do not poll). For other blocked reasons, ledger line and continue.
- Infrastructure/runner failure → do not burn a fixer attempt; ledger line `infrastructure failure — <check names>` and continue.

### D.6 — `completed:validate` (red) / merge red → bounded fixer subagent

**Trigger**: `completed:validate` with an enriched doorbell line's `checks: "red"` verdict (per § Enriched-line dispatch contract E4), OR (on `checks: absent | pending` fallback per Q4=B) a `cockpit_status(issue=<issue-ref>, json=true)` returning `checks_state == "red"`, OR a `cockpit merge` call in D.5 returned `result: "red"`.

**Source of truth**: The dispatch reads `to`, `labels`, and `checks` from the enriched doorbell line per § Enriched-line dispatch contract E3/E4 — on decisive `checks: "red"` the bounded fixer subagent fires without a per-event re-check. On `checks: absent | pending` (per Q4=B) OR a bare / malformed line the fallback path fires. The ledger row carries `· source: enriched-line` on the enriched-line path (decisive `checks: "red"`); the fallback path writes no suffix (equivalent to `source: re-query`) per § Enriched-line dispatch contract E6.

**Dispatch**:
1. **Classify failing checks** — infrastructure/runner failures abort without burning an attempt (repo-owned CI classes only: tests / lint / typecheck / build).
2. **Spawn bounded fixer subagent** — runs **once autonomously** per red event. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Fix red checks PR #<n>"
   prompt: <PR ref + failing-check summaries + outcome-scoping directive + return-schema directive>
   ```
   The prompt is **outcome-scoped**, verbatim:
   > "Make this specific red green (the named failing checks: `<check names>`). No refactors, no feature work, no scope expansion, no 'while I'm here' cleanups. If the fix requires design judgment (ambiguous root cause, multiple viable approaches, an architectural decision), stop and return `{fixed: false, reason: '<explanation>'}` instead of guessing."
   The subagent MAY read surrounding files, run local checks, and iterate on its own fix before returning; it MAY push commits to `pr.head_ref`. It MUST NOT call `cockpit_merge` (the parent owns the loop). It MUST NOT invoke any slash command. Return contract: a single JSON value `{fixed: bool, summary, reason?}` — no error shape (errors surface as `{fixed: false, reason: "<error description>"}`).
3. **Re-evaluate**:
   - `{fixed: true, summary: …}` → loop back to D.5 (re-run `cockpit merge`; the re-check catches whether the fix actually turned checks green).
   - `{fixed: false, summary: …, reason: …}` → present escalation gate (see § Gate contract G.4a) with options `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
4. **Apply escalation verdict**:
   - `Retry` → re-run the fixer subagent **once** (operator-approved single re-run; the gate is the bound). Each Retry produces a new ledger line and a new subagent invocation.
   - `Skip` → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.**
   - `Stop` → kill watch; run summary; exit auto cleanly. **No label writes.**

The fixer runs **once autonomously** per red event; each further run requires the escalation gate's Retry. Bounded by outcome scope, not file scope.

**Escalation-gateType note (UI mode).** D.6 has no Step 0 pre-draft check today, but its G.4a gate opens under `gateType: 'escalation'` — shared with D.7 (G.4b), D.10 (G.4c), and D.11 (G.4d). It is therefore covered by the § Pre-draft check — shared rules **generation-drift branch guard**: no other row's drift branch may ack a D.6 gate `superseded`, because the drift branch is disabled for `escalation` outright. If a Step 0 is ever added to this row, the same guard binds it — the drift branch stays disabled until the query surface carries a subtype discriminator ([generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)).

**Ledger lines** (mandatory per-attempt):
- Successful fix: `<issue-ref> · completed:validate:red · fixer · fixed`.
- Unfixed (about to escalate): `<issue-ref> · completed:validate:red · fixer · unfixed → escalation`.
- Escalation outcome: `<issue-ref> · completed:validate:red · fixer+escalation-gate · <retry | skip (session-local mute) | stop (exit)>`.

### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Source of truth**: The dispatch reads `to` (`agent:error` or `failed:<subtype>`) and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check fires on the enriched-line path. On bare / malformed lines the fallback path fires per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6. Evidence fetch is separate — `cockpit_context(issue=<issue-ref>)` remains the sole evidence-fetch tool (see step 1 below).

**Dispatch classification**: A D.7 event is a **first dispatch** iff it is the issue's first `agent:error` / `failed:*` event within the current contiguous auto invocation. A D.7 event is a **repeat dispatch** iff it is the issue's second-and-subsequent `agent:error` / `failed:*` event within the current contiguous auto invocation, regardless of `failed:<subtype>` match (any second failure-class event on the same issue in one auto invocation is a repeat — subtype match not required). Session restart resets first-vs-repeat state (session-local grain per #406 Q2).

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`. **This step 0 applies to BOTH first-dispatch AND repeat-dispatch paths** (§ Dispatch classification above):

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = escalation` (the `generation` discriminator folds `<subtype>:<triggeringLabelOrState>:<occurrence>` per § Generation discriminator (UI mode)). The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`, extended by Phase B / generacy#1067 commit `82077f1a` with the optional `runId` field). The plugin passes the three semantic inputs verbatim AND — under `runIdEnabled === true` — the pre-flight-derived `runId` from § In-memory loop state additions above; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool server internally derives `gateKey`/`gateId` from the semantic inputs plus (under `runIdEnabled === true`) the fourth `runId` segment, and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (per § step-3 sweep `gateId idempotency` DATA GAP note: `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — it is known at record time and is MANDATORY, because § D.12 step 3 keys its live-state supersession check on it and § D.12 step 4 routes on `(dispatchClass, optionId)`; leaving it undefined resolves no downstream handler for the operator's answer. The reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
      - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session (either the answer was applied by a prior session that crashed, or the redelivery has not landed). Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above — including the mandatory `dispatchClass` — with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, so no sweep is double-counted), and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. **The generation-drift branch is DISABLED for this row.** D.7 opens `gateType: 'escalation'`, which D.6, D.7, D.10, and D.11 all share; a `cockpit_gate_list` entry carries only `{gateId, gateType, generation, status, runId}` and nothing on the wire says which of the four rows opened a listed gate, so the § Pre-draft check — shared rules **generation-drift branch guard** condition 2 (dispatch-identifying discriminator recoverable) fails. Superseding a listed gate here would destroy a live D.11 merge-conflict gate (or a D.6 / D.10 gate) that this row did not open, with no replacement — the label is untouched, so the other row's dedup returns `already-dispatched` and never re-opens it. Do NOT recover the subtype by parsing `generation`: it is an opaque wire string with no format contract. **Residual limitation**: escalation-subtype drift is consequently undetectable and a genuinely stale escalation gate is left non-terminal alongside the fresh one — the conservative behavior is to not supersede. Tracked upstream as [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046). **However, the SAME-generation adoption branch DOES fire on this row (per #471 / SC-006)** — same-generation adoption is orthogonal to the drift-branch guard: adopting a prior-run row keys on `gateId` identity (`row.gateId`) not on dispatch-identifying subtype, so it cannot destroy a sibling row's gate. Call `cockpit_gate_list({ issueRef, gateType })` (the runId-agnostic functional form — MUST NOT carry `runId` per FR-011 / R4) and iterate `result.gates`:
        - **`result.truncated === true` AND no same-generation entry is present in the returned page** — the page may hide a prior-run same-generation escalation entry this dispatch would duplicate. Treat as a query-unreachable error per sub-step 3 below (abort the sweep for this event with a visible error) — do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (a `gates[]` entry whose `generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME escalation gate at the SAME `<subtype>:<triggeringLabelOrState>:<occurrence>` discriminator; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId` (per #469 FR-001). Because generation folds in the subtype (§ Generation discriminator (UI mode)), a same-generation match with `gateType: 'escalation'` unambiguously identifies THIS D.7 row's prior-run gate — the dispatch-discriminator ambiguity that disables the drift branch does NOT apply to the same-generation branch. Do **NOT** draft, do **NOT** open, do **NOT** supersede. Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.7', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). Continue to the next event. **Coverage rationale**: the § step 3 § Adoption pass runs once at startup only; an issue that enters scope AFTER the startup sweep never goes through the adoption pass. This Step 0 branch is the sole path that adopts a prior-run escalation gate for those issues.
        - **Anything else** (drift entries at different generation; entries at same generation but terminal; empty gates list) — do **NOT** ack anything `superseded` (drift branch stays DISABLED for escalation), fall through to the current draft-then-open flow (below) as "no existing gate this dispatch can safely adopt or supersede".
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>`; the four reachable error classes are `query-unreachable`, `invalid-args`, `internal`, and `transport` (per generacy `mcp/errors.ts § ErrorClass`). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class — `query-unreachable` least of all — to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row, prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.** The return payload is whatever the engine bundle returns — if the diagnosis subagent routinely needs a specific artifact (e.g., the primary CI log), fix the engine bundle (server-side, generacy-side), not the per-session parent envelope.
   - **First dispatch**: call `cockpit_context(issue=<issue-ref>)`; the engine bundle payload is the first-dispatch evidence, forwarded to the subagent per step 2.
   - **Repeat dispatch**: call `cockpit_context(issue=<issue-ref>)` again — same evidence verb as first-dispatch. **No dispatch of a repeat D.7 without the new alert body in hand.** The parent's role at this boundary is pure transport: fetch the fresh alert, and hand it to the subagent verbatim (step 2). **The parent MUST NOT characterize the fresh failure** with a phrase like "requeue failed identically", "same as before", "another `<subtype>`", or any other parent-authored summary of similarity; the subagent — not the parent — determines same-or-different from the evidence. Parent-authored summaries of evidence are forbidden in diagnosis prompts (the loop-trust-boundary principle applied to the parent itself: assertions are advisory, evidence is authoritative).
2. **Spawn diagnosis subagent** — for any further work (reproducing, reading logs, bisecting versions, inspecting branches, downstream artifact fetch), dispatch to a diagnosis subagent. The subagent MUST NOT invoke any slash command. On unrecoverable error the subagent returns `{"error": "<description>"}`.
   - **First dispatch invocation** (unchanged from pre-fix):
     ```
     subagent_type: "general-purpose"
     description: "Diagnose <issue-ref> failure"
     prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
     ```
     Return contract on first dispatch: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. `failure_class_changed` and `failure_classes_seen` are absent (or explicitly `null`) on first dispatch — there is no prior evidence to compare against.
   - **Repeat dispatch invocation** — SendMessage to the existing diagnosis subagent if it is still live; **fresh spawn** (same invocation shape as first-dispatch) with **both** the verbatim prior alert body AND the fresh alert body in the prompt if the subagent has already returned or been disposed across the Requeue window. The prior alert is a persistent engine-marked comment on the issue (mechanically identifiable as the previous failure-alert comment) — never lost even when the subagent dies. The parent's job on continuation-miss is pure transport. In either form, the continuation prompt contains:
     - The verbatim **new alert body** (from the fresh `cockpit_context` return payload's failure-alert comment).
     - Either the prior-context reference ("continuing from earlier diagnosis" — SendMessage form; the subagent still holds the prior alert body in-context) OR the verbatim **prior alert body** (fresh-spawn form; the subagent needs the prior evidence in-prompt).
     - **No parent-authored summary of similarity** between fresh and prior. The subagent — not the parent — determines `failure_class_changed` from the two evidences it now holds. Feeding the fresh subagent a prior *verdict* (read from the ledger) instead of the prior *alert body* is also forbidden: a distilled verdict is a diluted form of parent-authored characterization.
     - The verdict-return-schema addendum instruction (see below).
   - **Verdict return-schema addendum on repeat dispatches**: the JSON return payload's shape grows two required fields on repeat dispatches (both absent or `null` on first dispatch). Absence of either field on a repeat dispatch is a contract violation the parent MUST detect and treat as a subagent error (return `{"error": "verdict missing failure_class_changed and/or failure_classes_seen on repeat dispatch"}` to G.4(b) as a subagent-error class).
     - **`failure_class_changed: boolean`** — computed by the subagent from the fresh and **immediately-prior** alert bodies (not the original first-dispatch alert). `failure_class_changed = true` iff *any* of three dimensions differs: (1) `classifier_reason` field (engine-authored, exact string match, absent-vs-present differs); (2) `error_taxonomy` field (engine-authored, exact string match, absent-vs-present differs); (3) canonical failing-test/step identifier (`<file>::<name>` form for test failures; equivalent stable identifier for non-test failing steps — **never raw line text**, which drifts with line numbers and durations across runs of the same failure; absent-vs-present differs).
     - **`failure_classes_seen: string[]`** — running list of failure classifier identifiers observed across this issue's repeat dispatches in the current session. On the second dispatch (first repeat), initialized as `[<class1>, <class2>]` where `<class1>` is the first-dispatch alert's classifier identifier and `<class2>` is the fresh alert's. On the N-th dispatch (N ≥ 3), the subagent takes the running list from the immediately-prior verdict's `failure_classes_seen` and appends the fresh alert's classifier identifier. The `classifier_id` derivation priority: `classifier_reason` if present, else `error_taxonomy` if present, else the canonical failing-test identifier, else the placeholder `<unclassified>`. Rendered at the G.4(b) gate as a "classes this session: `<class1>` → `<class2>` → …" line — cycles like A → B → A are visible in one row.
3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: presentation block per § Gate contract G.4b (subtype b) — five-element block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with the unchanged D.7 option set (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`), header `Escalate`, `multiSelect: false`. **On repeat dispatches**, the presentation block gains a sixth element between "Evidence" and "Current state": `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. No in-parent re-analysis.
4. **Apply verdict**:
   - `Requeue` → `cockpit_resume(issue=<issue-ref>)` (engine action per Assumption A2 — clears `agent:error` / `failed:*`, restores the phase's `waiting-for:` / `completed:` resume pair).
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Degradation clause**: If `cockpit_resume` is unavailable (G-S8 did not ship the tool, per Assumption A2), Requeue degrades to Skip with an explicit ledger note: `<issue-ref> · <transition> · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

**Ledger line**: `<issue-ref> · <agent:error | failed:<subtype>> · escalation-gate · <outcome>` — outcomes: `requeue (cockpit resume)` / `requeue failed: <description>` / `skip (session-local mute)` / `skip (cockpit resume unavailable — G-S8 prerequisite)` / `stop (exit)`.

**Failure modes**: `cockpit_resume` returns a typed error → **Error handling** class `OTHER`; ledger line; leave the issue in its failed state (do not retry automatically).

### D.8 — `phase-complete` → phase-queue confirmation gate

**Trigger**: A phase completes (all its issues reached terminal states). S8 emits `phase-complete` when the epic's next phase is ready to queue. Verbatim event string: `phase-complete`. **Only fires in epic mode (`invocationForm: epic`).** Also fires on the synthetic **`phase-bootstrap`** event the step-3 startup sweep emits on a fresh epic (no phase in flight) — identical dispatch and identical G.5 gate, targeting the first incomplete phase P&lt;first&gt; in place of P&lt;next&gt; (see § step-3 **Fresh-epic bootstrap** and the § G.5 **Bootstrap variant**). The wire `transitionClass` is `phase-bootstrap` (distinct `gateId`), so under `ResolvedGateMode === "ui"` the bootstrap confirm opens in the operator inbox via `cockpit_gate_open` like any other G.5 gate — never a local `AskUserQuestion`.

**Source of truth**: D.8 **retains the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check** per § Enriched-line dispatch contract E3 — the phase-queue confirmation gate opens a human/consequential surface whose ad-hoc-issues enumeration requires authoritative per-ad-hoc-ref state; a stale-line dispatch could open a gate against superseded state. Low frequency (≈once per phase) makes the authoritative query cost negligible. The ledger row writes no `source: enriched-line` suffix (equivalent to `source: re-query`) per § Enriched-line dispatch contract E6.

**Dispatch**:
1. **Compute next phase scope** — from `cockpit_status(epic=<epic-ref>, json=true)`, identify the next phase (P<next>) and its N issues.
2. **Compute open ad-hoc issues** — call `openAdHocIssues(<epic-ref>, ledger)` which filters ledger `scope-add` and `filing-gate+scope-add` action lines (with successful outcomes) to the refs whose live state per `cockpit_status` is non-terminal. Order is scope-add order (chronological).
3. **Present phase-queue gate** (see § Gate contract G.5). In one assistant response: presentation block with the next-phase issue list numbered with titles, followed — **only when the ad-hoc list is non-empty** — by a `Open ad-hoc issues in scope (added mid-run):` block enumerating each open ad-hoc ref as `<owner>/<repo>#<n> · <title> · <live-state>`. Empty ad-hoc list omits the block entirely (no `(none)` placeholder). Then a single `AskUserQuestion` with options depending on the ad-hoc list:
   - **Empty ad-hoc list (unchanged behavior)**: options `Queue P<next> (<N> issues) (Recommended)` / `Cancel`.
   - **Non-empty ad-hoc list**: options `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` / `Queue P<next> (<N> issues)` / `Cancel`, where `<M>` is the count of open ad-hoc issues. The recommendation flips to `Hold`; `Queue P<next>` remains selectable (queueing while ad-hoc work is open stays *possible* but never *silent* — the gate text names the open refs and the operator decides).

   Header `QueueP<next>`, `multiSelect: false`.
4. **Apply verdict**:
   - `Queue P<next>` → `cockpit_queue(epic=<epic-ref>, phase="P<next>")` (the `--yes` flag is retired — the tool has no interactive confirm; the gate itself is the sole confirmation). Under a non-empty ad-hoc list, the ledger outcome carries the ad-hoc count.
   - `Hold` (only under non-empty ad-hoc list) → do NOT call `cockpit_queue`; the `phase-complete` state persists; the loop continues (the operator may add more ad-hoc work, complete existing ad-hoc work, or return to this gate later).
   - `Cancel` → ledger line noting the cancellation; continue loop.

**Ledger line**: `<epic-ref> · phase-complete · phase-queue-gate · <queued P<next> (<N> issues) | queued P<next> (<N> issues) with <M> ad-hoc open | held (<M> ad-hoc open) | cancelled>`.

If `cockpit_status` fails for one or more ad-hoc refs during the helper call, omit those refs from the enumeration and write a ledger line noting the omission (`<epic-ref> · phase-complete · openAdHocIssues · error: cockpit_status failed for <ref>: <description>`) before firing the gate; the gate still presents the partial list.

### D.9 — `waiting-for:address-pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:address-pr-feedback`. Verbatim event string: `waiting-for:address-pr-feedback`.

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger line accounts for the event; the loop continues. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E6); the outcome slot carries the `· source: enriched-line` suffix when dispatched from the enriched line, and no suffix (equivalent to `source: re-query`) when the fallback fired.

**Ledger line**: `<issue-ref> · waiting-for:address-pr-feedback · (no-op) · server-side-owned`.

### D.9a — `waiting-for:pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:pr-feedback`. Verbatim event string: `waiting-for:pr-feedback`. Legacy alias of the engine-owned feedback loop (D.9 `waiting-for:address-pr-feedback` is the modern shape; some pre-migration epics still emit the shorter `pr-feedback` label).

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E6); the outcome slot carries the `· source: enriched-line` suffix when dispatched from the enriched line, and no suffix (equivalent to `source: re-query`) when the fallback fired.

**Ledger line**: `<issue-ref> · waiting-for:pr-feedback · (no-op) · server-side-owned`.

### D.9b — `waiting-for:children-complete` → ledger only

**Trigger**: An epic-container issue enters `waiting-for:children-complete`. Verbatim event string: `waiting-for:children-complete`. Epic-container state — the running auto loop *is* its resolution (children dispatch as they transition; on the last child's completion, this label transitions naturally to `epic-complete` without operator input).

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E6); the outcome slot carries the `· source: enriched-line` suffix when dispatched from the enriched line, and no suffix (equivalent to `source: re-query`) when the fallback fired.

**Ledger line**: `<issue-ref> · waiting-for:children-complete · (no-op) · server-side-owned`.

### D.9c — `waiting-for:dependencies` → ledger only

**Trigger**: An issue enters `waiting-for:dependencies`. Verbatim event string: `waiting-for:dependencies`. Engine-owned cross-issue wait — resolved server-side when the depended-on issue transitions.

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E6); the outcome slot carries the `· source: enriched-line` suffix when dispatched from the enriched line, and no suffix (equivalent to `source: re-query`) when the fallback fired.

**Ledger line**: `<issue-ref> · waiting-for:dependencies · (no-op) · server-side-owned`.

### D.9d — `phase:*` → ledger only

**Trigger**: An issue enters any `phase:*` state. **Prefix-match**: any transition class whose token begins with the literal `phase:` prefix matches this row (`phase:specify`, `phase:clarify`, `phase:plan`, `phase:tasks`, `phase:implement`, `phase:validate`, and any future workflow-phase addition). The phase set is workflow-dependent and open-ended — speckit-feature and speckit-bugfix already differ; enumeration would break the day a workflow adds a phase.

**Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E6); the outcome slot carries the `· source: enriched-line` suffix when dispatched from the enriched line, and no suffix (equivalent to `source: re-query`) when the fallback fired. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` or `blocked:*` still fires D.10).

**Ledger line**: `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`.

### D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)

**Trigger**: An issue enters a merge-conflicts-family state. Verbatim event strings (either fires this row): `waiting-for:merge-conflicts` (base-sync produced a merge conflict; the branch cannot be advanced without an operator-authored resolution) OR `blocked:stuck-merge-conflicts` (engine auto-remedy attempted AND failed; operator resolution is the only path forward). The classifier applies both labels together for a single stuck-merge incident, so the two events co-occur per issue — the dedup rule in step 1 (dispatched-issues set) ensures one incident produces one escalation gate. The label that surfaced first is treated as the `<source-label>` for the ledger and threaded through the subagent prompt and G.4d presentation.

**Source of truth**: D.11 **retains the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check** per § Enriched-line dispatch contract E3 — the merge-conflicts escalation gate opens a human/consequential surface where a stale-line dispatch could open a gate against a conflict the engine has already auto-remedied. Low frequency (error/escalation case) makes the authoritative query cost negligible. Evidence fetch is separate — `cockpit_context(issue=<issue-ref>)` remains the sole evidence-fetch tool (see step 1a below). The ledger row writes no `source: enriched-line` suffix (equivalent to `source: re-query`) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   **D.11 ordering exception (Q5=A / FR-010).** In D.11 ONLY, the in-memory `dispatched-issues` set check (step 1 below) is consulted from step 0's `absent` return, BEFORE step 0 falls through to the draft-then-open flow. Rationale: the escalation generation discriminator `<subtype>:<triggeringLabelOrState>:<occurrence>` folds the triggering label into `generation`, so the label-pair `waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` hashes to two DIFFERENT `gateId`s per incident — event 2 (sibling label) sees `absent` at its own `gateId` even though event 1 already opened this incident's gate. Without the exception, event 2 would draft and open a SECOND gate for one incident. Operationally: on `absent` return, check whether `<issue-ref>` is present in `dispatched-issues`; if it is, the sibling event already produced this incident's gate — write ledger line `<issue-ref> · <source-label> · escalation-gate · already-dispatched` and return to the main loop. The exception applies ONLY to the `absent` return; the `open` / `answered` reuse branches (matching gateId) still fire normally and continue to the next event without touching step 1.

   This exception is now **belt-and-braces on top of the general guard**: since the § Pre-draft check — shared rules **generation-drift branch guard** disables the drift branch for every `gateType: 'escalation'` row, step 0 can no longer ack a sibling gate `superseded` under any ordering — the "destroy event 1's live gate, then return `already-dispatched` with no replacement" hazard is closed at the guard, not by ordering alone. The exception still earns its place: it suppresses the duplicate second gate for one incident and it saves a pointless `cockpit_gate_list` call. Round-2's D.11-only scoping is NOT sufficient on its own — scoping the guard to one row merely moved the hazard to D.7 (an `agent:error` event acking the live D.11 gate), which is why the guard is stated once for all four escalation rows.

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = escalation`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`, extended by Phase B / generacy#1067 commit `82077f1a` with the optional `runId` field). The plugin passes the three semantic inputs verbatim AND — under `runIdEnabled === true` — the pre-flight-derived `runId` from § In-memory loop state additions above; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool server internally derives `gateKey`/`gateId` from the semantic inputs plus (under `runIdEnabled === true`) the fourth `runId` segment, and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (per § step-3 sweep `gateId idempotency` DATA GAP note: `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — it is known at record time and is MANDATORY, because § D.12 step 3 keys its live-state supersession check on it and § D.12 step 4 routes on `(dispatchClass, optionId)`; leaving it undefined resolves no downstream handler for the operator's answer. The reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
      - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above — including the mandatory `dispatchClass` — with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; the tick sites supply every subsequent sweep's increment, so no sweep is double-counted), and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. **The generation-drift branch is DISABLED for this row**, for the same reason as D.7: D.11 opens `gateType: 'escalation'`, shared with D.6, D.7, and D.10, and a `cockpit_gate_list` entry (`{gateId, gateType, generation, status, runId}`) does not say which row opened a listed gate — so the § Pre-draft check — shared rules **generation-drift branch guard** condition 2 fails. Superseding a listed gate here would destroy a live D.7 (or D.6 / D.10) escalation gate this row did not open. Do NOT recover the subtype by parsing `generation` (opaque wire string, no format contract). **Residual limitation**: escalation-subtype drift is consequently undetectable and a genuinely stale escalation gate is left non-terminal alongside the fresh one — the conservative behavior is to not supersede. Tracked upstream as [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046). **However, the SAME-generation adoption branch DOES fire on this row (per #471 / SC-006)** — same-generation adoption is orthogonal to the drift-branch guard: adopting a prior-run row keys on `gateId` identity (`row.gateId`) not on dispatch-identifying subtype, so it cannot destroy a sibling row's gate. Call `cockpit_gate_list({ issueRef, gateType })` (the runId-agnostic functional form — MUST NOT carry `runId` per FR-011 / R4) and iterate `result.gates`:
        - **`result.truncated === true` AND no same-generation entry is present in the returned page** — the page may hide a prior-run same-generation escalation entry this dispatch would duplicate. Treat as a query-unreachable error per sub-step 3 below (abort the sweep for this event with a visible error) — do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (a `gates[]` entry whose `generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME escalation gate at the SAME `<subtype>:<triggeringLabelOrState>:<occurrence>` discriminator; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId` (per #469 FR-001). Because generation folds in the subtype, a same-generation match with `gateType: 'escalation'` unambiguously identifies THIS D.11 row's prior-run gate. Do **NOT** draft, do **NOT** open, do **NOT** supersede. Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.11', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). **Also add `<issue-ref>` to the in-memory `dispatched-issues` set** — this incident's gate is now tracked in `openGates` (adopted from the prior run), and this run's SIBLING D.11 event (`waiting-for:merge-conflicts` vs `blocked:stuck-merge-conflicts` at a different generation hash) MUST see `<issue-ref>` in `dispatched-issues` and take the `already-dispatched` exit; adopting without setting the sibling flag would let the sibling event draft-and-open a second gate for the same incident. Continue to the next event.
        - **Anything else** (drift entries at different generation; entries at same generation but terminal; empty gates list) — do **NOT** ack anything `superseded` (drift branch stays DISABLED for escalation). **Now apply the D.11 ordering exception above** — if `<issue-ref>` is in `dispatched-issues`, write the `already-dispatched` ledger row and return; otherwise fall through to the draft-then-open flow (below) as "no existing gate this dispatch can safely adopt or supersede".
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>`; the four reachable error classes are `query-unreachable`, `invalid-args`, `internal`, and `transport` (per generacy `mcp/errors.ts § ErrorClass`). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class — `query-unreachable` least of all — to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row, prints the visible operator-facing error line, and continues with the NEXT event in the batch.

   **Defense-in-depth with step 1 dedup (Q5=A / FR-010)**: step 0 above coalesces the CROSS-SESSION case (a durable gate opened by a prior session that survived a restart / cluster takeover). Step 1 below (`Dedup check` — in-memory `dispatched-issues` set) is RETAINED unchanged and coalesces two properties the durable check cannot express: (a) the label-pair `waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` fires together but hashes to two different `gateId`s under the escalation generation discriminator, so the durable check does NOT coalesce them; (b) session-mute-on-Skip semantics — the set entry is retained on Skip so the next wake does not re-open the gate, but Skip never touches labels so no durable gate query can express this. The two checks are complementary, not redundant. Do NOT collapse step 1 into step 0. The D.11 ordering exception above (dedup-before-drift-ack) is the load-bearing coupling that prevents the two checks from colliding on the sibling-label incident.

1. **Dedup check.** If `<issue-ref>` is already present in the in-memory `dispatched-issues set` (session-scoped, alongside the session mute set referenced at `auto.md:266`, `:305`, `:391`, `:407`, `:749`), the sibling merge-conflicts-family label has already produced one gate for this incident. Write ledger-only line `<issue-ref> · <source-label> · escalation-gate · already-dispatched` and return to the main loop — do NOT fetch context, spawn a subagent, or present a gate. Otherwise, add `<issue-ref>` to the dispatched-issues set and continue to step 1a. **Under `ResolvedGateMode === "ui"` this check is ALSO consulted from step 0's drift branch per the D.11 ordering exception above — dedup before drift-ack.**
1a. **Fetch context.** The parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`; the return payload includes the pause-alert comment content and the list of conflicted paths. **No ad-hoc `gh` chains, no link-following, no `gh issue view --comments` inline in the parent.**
1.5. **Spawn diagnosis subagent** — for any conflict-triage work beyond the engine bundle (repro, log reads, `git status` / `git diff` / branch inspection, downstream artifact fetch), dispatch to a diagnosis subagent. Invocation:
   ```
   subagent_type: "general-purpose"
   description: "Diagnose <issue-ref> merge conflicts"
   prompt: <issue-ref + <source-label> (verbatim: one of `waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`) + conflicted-paths payload + gate-option-set directive + return-schema directive>
   ```
   When `<source-label>` is `blocked:stuck-merge-conflicts`, the subagent MAY reference "auto-remedy already failed" (engine attempted resolution and escalated) in its `root_cause`/`evidence` fields. The subagent MUST NOT invoke any slash command. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. On unrecoverable error the subagent returns `{"error": "<description>"}`.
2. **Present escalation gate** (see § Gate contract G.4d). In one assistant response: presentation block per § Gate contract G.4d — five-element block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; conflicted paths shown; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. No in-parent re-analysis.
3. **Apply verdict**:
   - `I've resolved it — advance the gate` → call `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`. On success: ledger `advanced`; **remove `<issue-ref>` from the dispatched-issues set** so a genuinely new future conflict on the same issue re-gates; continue. **On typed-error return: re-present the D.11 gate with the tool's `code`/`message` prepended verbatim to the presentation block** (see § Gate contract G.4d re-present shape). The operator may retry, skip, or stop from the re-presented gate; the dispatched-issues set entry remains until either advance succeeds or the session ends.
   - `Skip (session-local mute)` → add `<issue-ref>` to session mute set; **leave the dispatched-issues set entry in place** (session-local mute semantics — the existing session mute set already suppresses further events on this issue, and the dispatched-issues set is aligned with that until session end); ledger line `skip (session-local mute)`; continue.
   - `Stop (exit auto)` → kill watch; summary; exit (dispatched-issues set drops with process exit).

**Future degradation**: Once the engine-side merge-conflicts resolver ships (companion finding in generacy dead-end-gate), this row degrades to ledger-only (D.9-shape) — the label becomes server-side-owned. Until then, this escalation gate is the operator's resolution surface.

**Ledger line**: `<issue-ref> · <source-label> · escalation-gate · <advanced | advance failed: <code>: <message> | skip (session-local mute) | stop (exit) | already-dispatched>`. `<source-label>` is written verbatim from the triggering event and is one of `waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`. The `already-dispatched` outcome is produced by the step 1 dedup check (Entity 3 in `data-model.md`); the four gate-outcome tokens (`advanced` / `advance failed: …` / `skip …` / `stop …`) are produced by the verdict-apply step 3.

### D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)

**Source of truth**: D.10 **retains the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check** per § Enriched-line dispatch contract E3 — by definition the transition class here is unknown, and dispatching an escalation gate off a bare / stale line is meaningless. Low frequency (error case) makes the authoritative query cost negligible. The ledger row writes no `source: enriched-line` suffix (equivalent to `source: re-query`) per § Enriched-line dispatch contract E6.

**Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9 (including D.9a/b/c) or D.11. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape, **(d) any state token (`waiting-for:*` OR `blocked:*`) does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)** — future `blocked:*` labels (e.g. `blocked:stuck-validate-fix` from generacy#943) that lack their own dispatch row land here, not in D.11.

**Any `waiting-for:*` OR `blocked:*` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of `waiting-for:*` and `blocked:*` states the loop may treat as no-ops (via the named ledger-only rows D.9, D.9a, D.9b, D.9c) or dispatch to a dedicated gate (D.11). "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` or `blocked:*` state unless the table explicitly names it ledger-only. If the table does not name it, D.10 fires — verbatim state in the presentation block.

**Dispatch**:
1. **Present escalation gate** (see § Gate contract G.4c). In one assistant response: presentation block including the observed state (verbatim from `cockpit status --json`) + streamed event line + single `AskUserQuestion` with options `Skip (session-local mute) (Recommended)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. **NEVER Retry** (nothing to retry — we don't know what to do).
2. **Apply verdict**:
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Never guess** — the escalation gate is the surface for any state class the playbook cannot dispatch.

**Escalation-gateType note (UI mode).** D.10 has no Step 0 pre-draft check today, but its G.4c gate opens under `gateType: 'escalation'` — shared with D.6 (G.4a), D.7 (G.4b), and D.11 (G.4d). It is therefore covered by the § Pre-draft check — shared rules **generation-drift branch guard**: no other row's drift branch may ack a D.10 gate `superseded`, because the drift branch is disabled for `escalation` outright. If a Step 0 is ever added to this row, the same guard binds it — the drift branch stays disabled until the query surface carries a subtype discriminator ([generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)).

**Ledger line**: `<issue-ref> · <observed-state> · unrecognized-state · <skip (session-local mute) | stop (exit)>`.

### D.12 — `gate-answer`

**Trigger**: A `gate-answer` typed event arriving on either wake path — the enriched doorbell NDJSON line whose parsed object has `type: "gate-answer"`, or a batch item returned by `cockpit_await_events(...)` whose event `type` field is `"gate-answer"`. D.12 fires **only** when `ResolvedGateMode === "ui"`. Under `--gates=local` (or `--gates=auto` resolved to local) no remote records are open, the doorbell surface does not emit `gate-answer` events for this run, and D.12 is dead code on that path. Contract: `contracts/dispatch-d12-gate-answer.md`. Source of truth: the event payload IS the source of truth for the operator's answer (per § Enriched-line dispatch contract E3); the event does NOT carry the underlying label state — that comes from the SAME enriched-line `to` / `labels` fields OR from the § D.12 fallback re-query per E6.

**Payload shape** — the FROZEN down-path gate-answer (Shape 3). The event is FLAT and keyed on `type`; the answer fields carry NO `generation` (supersession keys on gateId identity — see step 2) and are NOT nested under an `answer` object:

- `type: "gate-answer"` — discriminator (NOT `kind`).
- `gateId: string` — matches an entry in `openGates` (§ In-memory loop state additions above). The gate's identity — a re-open mints a NEW `gateId`, so a stale answer arrives under the OLD `gateId`.
- `gateKey: string` — `<owner>/<repo>#<issue>:<gateType>:<generation>`; the issue-ref / gateType / generation-discriminator are recoverable from it if needed.
- `optionId: string | null` — one of the gate's option ids per the § UI-mode gate mapping row; `null` on a pure free-text answer.
- `freeText: string | null` — present-and-`null` on an option-only answer; carries the value **required** when `optionId === "add-more-work"` for G.7 per Q4=A (`required-if` affordance).
- `actor: { userId: string; email: string | null; displayName: string | null }` — the operator who answered (opaque handle; `email`/`displayName` may be null).
- `answeredAt: string` — ISO-8601 UTC.
- `deliveryId: string` — unique per delivery attempt; the session dedups on it.

`issueRef` and `transitionClass` are NOT on the wire answer — read them from the matched record (`openGates[event.gateId].issueRef` / `.transitionClass`) for the ledger row.

**Dispatch steps**:

1. **Look up record**: `record = openGates[event.gateId]`. If absent → `cockpit_gate_ack(gateId, outcome: "superseded", detail: "no matching open record — likely startup-race or duplicate delivery")` — under `runIdEnabled === true` this call ALSO passes the run's pre-flight-derived `runId` verbatim for envelope symmetry with `cockpit_gate_open`, per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions above (per FR-005 / R11; `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so this no-record ack lands correctly even when the arriving `event.gateId` was minted by a different run — the startup-race and duplicate-delivery scenarios this branch exists for); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (no record) · source: ui-gate`. Do NOT dispatch further.

2. **Stale-gate check (gateId identity, V3)**: the frozen down-path answer carries NO `generation` field — supersession is by gateId identity, not an integer match. A revised-draft re-open (§ revised-draft re-open path below) mints a NEW `gateId` and marks the prior record `superseded` (retained in `openGates`). If the matched `record` is flagged `superseded` → `cockpit_gate_ack(gateId, outcome: "superseded", detail: "stale gate — superseded by re-open")` — under `runIdEnabled === true` this ack ALSO passes the run's pre-flight-derived `runId` verbatim (per FR-005 / R11); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (stale generation) · source: ui-gate`. Do NOT dispatch further.

3. **Live-state supersession check (V4)**: read the underlying trigger label / state via the enriched doorbell line (if the D.12 event arrived via a doorbell-line drain that also carries `to` / `labels`) OR fall back to `cockpit_status(issue=<issueRef>, json=true)` per E6 retain-the-re-check pattern for consequential gates. If the trigger has been resolved out-of-band (e.g., `waiting-for:clarification` label removed, or `phase-complete` has advanced) → `cockpit_gate_ack(gateId, outcome: "superseded", detail: "live state moved past <transition-class>")` — under `runIdEnabled === true` this live-state-supersession ack ALSO passes `runId` verbatim — the `runId` value is READ from `openGates[gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`; for a current-run entry the two coincide, for an adopted entry (per § step 3 § Adoption pass above) they differ — `openGates[gateId].runId` carries the row's originating `runId` (per FR-005 / R11); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (state advanced) · source: ui-gate`. Do NOT dispatch further.

4. **Route answer to downstream** (per § UI-mode gate mapping): each `(dispatchClass, optionId)` pair has a downstream handler in the mapping table's `downstream action per optionId` column. Invoke that handler with `event.freeText` where applicable (G.1 `make-changes`, G.2 `request-changes`, G.6 `make-changes`, G.7 `add-more-work`). The handler performs the SAME tool call(s) / subagent spawn(s) / state mutation(s) the local `AskUserQuestion` path performs today (per the corresponding G.n subsection above) — no new downstream behavior is introduced by D.12; the handler is reused verbatim across UI-mode and local-mode paths.

5. **Ack outcome**:
   - Handler success → `cockpit_gate_ack(gateId, outcome: "applied")` — under `runIdEnabled === true` this operator-answer-applied ack ALSO passes `runId` verbatim for envelope symmetry with `cockpit_gate_open` — the `runId` value is READ from `openGates[event.gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`; for a current-run entry the two coincide, for an adopted entry (per § step 3 § Adoption pass above) they differ — `openGates[event.gateId].runId` carries the row's originating `runId` (per FR-005 / R11; `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so this operator-apply ack lands on the pending gate regardless of which run opened it — the answer routes by `gateId` alone); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Ledger row uses the mapping-table `<original-action>` + local-vocabulary `<outcome>` + `· source: ui-gate` suffix (per § Ledger UI-mode extensions).
   - Handler failure (downstream tool error) → `cockpit_gate_ack(gateId, outcome: "failed", detail: "<handler-name> returned: <description>")` — under `runIdEnabled === true` this failure ack ALSO passes `runId` verbatim — the `runId` value is READ from `openGates[event.gateId].runId` (per #471 / FR-003), NOT the run-wide loop-state `runId` (per FR-005 / R11); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Ledger row: `<issue-ref> · <transition-class> · <original-action> · failed: <detail> · source: ui-gate`.
   - Handler ambiguity (D.11 typed error → re-present the gate) — apply the § D.12 revised-draft re-open path (below): recompute the generation discriminator (a new `gateId`), re-open with the revised body, and mark the original record `superseded`; do NOT ack the original record yet (the re-open supersedes the pending ack when its answer arrives).

6. **Remove from openGates and reset sweep counter**: on `applied` / `superseded` / `failed`, `openGates.delete(event.gateId)` AND `answeredGateSweepCounter.delete(event.gateId)` (no-op if not present; defensive against V5 violations). A revised-draft re-open (step 5 handler-ambiguity path) creates a NEW record under a fresh `gateId` — the recomputed generation discriminator changes the `gateKey`, so the derived `gateId` changes; the prior record is **marked `superseded`** and retained in `openGates`, so a late answer arriving under the OLD `gateId` is acked `superseded` by gateId identity (step 2 — the frozen down-path answer carries no `generation`). The counter for the original `gateId` is deleted on the revised-draft re-open so the escape hatch does not fire on a record that is already flagged `superseded`.

**Mandatory-per-dispatch ledger**: exactly one ledger line per D.12 event, per Invariant #8. The `cockpit_gate_open` call at initiation is print-only (per § Ledger UI-mode extensions) — the D.12 event is the resolving dispatch, and its ledger row is the mandatory one. Local mode's "one ledger line per gate dispatch at resolution" == UI mode's "one D.12 ledger line at resolution." Symmetry preserved.

**No content-based filter**: D.12 events are consumed in the same stream order as every other event in a batch, per Invariants #7. No pre-filter drops a `gate-answer` event because a downstream handler is currently retrying; the retry is downstream of D.12's own handling.

**Revised-draft re-open path (edit-directive from `make-changes`)**. When the resolved action for an arriving `gate-answer` is `make-changes` (G.1 / G.2 / G.6) — the edit-directive path — the handler applies the operator's edit directive (per the corresponding local G.n edit-directive handling), then re-opens the gate under a fresh generation instead of acking the original record `applied`. Concretely:

1. Apply the edit directive per the corresponding G.n subsection above (G.1 § Directive grammar; G.2 revised draft; G.6 iterative edit branch).
2. Recompute the gate's **generation discriminator** for the revised content (per § UI-mode gate mapping — e.g. G.1 clarification → a content hash of the revised answer-set; G.6 filing → the draft hash of the edited draft, which changes naturally). This is a durable, content-derived discriminator — NOT a session-local integer bump. (A purely in-memory re-ask ordinal `g<n>` MAY be kept for the ledger label only, never as the wire generation.)
3. Compose the revised `GateDraft` (title, body, options, freeTextAffordance) — the body carries the edited content; options and freeTextAffordance are re-used verbatim from the original row's mapping-table entry.
4. Call `cockpit_gate_open(GateOpenParams{ gateType, generation: <revised discriminator>, title/body/options/allowFreeText: <revised draft>, ... })` — the `cockpit_gate_open` MCP tool derives the new `gateKey`+`gateId`; the plugin never hand-builds a hash. On success, add the NEW `GateRecord` to `openGates` under the new `gateId`, and **mark the ORIGINAL record `superseded`** (retained in `openGates`).
5. The original record is NOT acked at this point. If its answer arrives late (a race between the operator's `make-changes` selection and a duplicate delivery of the original answer), it arrives under the ORIGINAL `gateId`, whose record is now flagged `superseded` → step 2 acks it `superseded (stale generation)` by gateId identity — no downstream duplicate action.
6. Print the "one pointer line" for the new gate (per § UI-mode fallback / One pointer line rule); write a ledger row noting the re-open, e.g., G.1's `<ref> · waiting-for:clarification · clarification-batch · make-changes (re-opened g<n>) · source: ui-gate` (see § Ledger UI-mode extensions).
7. On `cockpit_gate_open` call-time error at re-open, the § UI-mode fallback path fires for the revised draft (local `AskUserQuestion` on the same revised body). The revised discriminator was still recomputed and the original record still marked `superseded`, so any late-arriving answer under the original `gateId` is still `superseded` by gateId identity.

Reference: `data-model.md § Revised-draft re-open path`. See also G.1 `make-changes` / G.2 `request-changes` on typed-error re-present / G.6 `make-changes` for how each local G.n contract's edit-directive semantics feed into this path.

**Interactions with existing dispatch classes**:

- D.1–D.4, D.6, D.7, D.10, D.11 — under `ResolvedGateMode === "ui"`, these dispatch classes' gates are OPENED via `cockpit_gate_open` instead of `AskUserQuestion`; the answer arrives as a D.12 event and is routed BACK to the same-class downstream handling. D.12 is the completion path; the label-driven dispatch is the initiation path. The pair `(D.n → open gate → D.12 → downstream)` is a two-hop sequence separated by an operator turn.
- D.5 (green merge) — no gate, unaffected. `cockpit_gate_open` is never called for D.5.
- D.8 (phase-complete) — G.5 opens under `<epic-ref>` (sole per-issue exception per the mapping table G.5 row). D.12 handles the answer identically to per-issue gates; the ledger row's `<issue-ref>` slot carries `<epic-ref>`.
- D.9 / D.9a–D.9d — ledger-only rows, no gate, unaffected. `cockpit_gate_open` is never called for the D.9 family.

**Interactions with the fallback path** (§ UI-mode fallback on `cockpit_gate_open` call error). If a `cockpit_gate_open` call errors during the INITIATION hop, the local `AskUserQuestion` fires for that gate. No `openGates` record is created; no D.12 event arrives for that gate (the record was never opened). The ledger row for that gate is written by the local flow at resolution time in the pre-change vocabulary, with the `· source: ui-gate-fallback` suffix (distinct from clean UI `· source: ui-gate`).

**Ledger line** (per row of the § UI-mode gate mapping table): `<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate` — `<original-action>` reuses the pre-change vocabulary (`clarification-batch`, `review-analysis+advance`, `phase-queue-gate`, `escalation-gate`, `filing-gate+scope-add`, `scope-drained-gate`, etc.); `<outcome>` reuses the local-vocabulary `applied` outcomes (`advanced`, `queued P<n> (<N> issues)`, `manually validated`, `filed + queued (<new-ref>)`, `keep-watching`, `finish (tracking closed)`, etc.) OR the UI-specific outcomes for non-applied cases (`superseded (no record)`, `superseded (stale generation)`, `superseded (state advanced)`, `failed: <detail>`). Additional row for `make-changes` (revised-draft re-open): outcome slot carries `make-changes (re-opened g<n>)` per the corresponding mapping-table entry.

## Add-issue flow (mid-run)

Between dispatched events, the operator may ask the session to add a ref to the current tracking scope — either an existing issue ("also process X") or a new issue drafted for them ("file an issue for X"). Two **intent classes** are recognized (see `lib/intent-recognition.ts` for the canonical shape used by the fixture-verified reference parser):

1. **Add-existing intent** — the operator's message reads like "also process <ref>", "process <ref> too", "add <ref> to scope", "include <ref>", "queue <ref>", "pull in <ref>", "handle <ref>", or "look at <ref> too", AND contains a parseable explicit ref (`<owner>/<repo>#<n>` or `#<n>` shorthand — the shorthand resolves against the tracking ref's repo at dispatch time).
2. **File-new intent** — the operator's message reads like "file an issue for <topic>", "open a bug for <topic>", "create an issue about <topic>", "raise an issue for <topic>", or "report an issue for <topic>".

Recognition is **generous by design** because the safety net is structural (spec Q2 anchor):

- The **add-existing path requires a parseable explicit ref** — if no ref is present in a message with add-existing phrasing, the parser returns `null` and the session **confirms intent conversationally** ("do you want me to add an issue to scope? which ref?") before acting. A false-positive add-existing dispatch can only happen when the operator actually referenced a ref, which bounds the blast radius.
- The **file-new path always lands on the filing gate G.6** — a misread intent surfaces as a skippable gate, never as an unreviewed outward action. On ambiguous chat-adjacent phrasings (`look at X`, `check X out`, `investigate X`, `let's discuss X`), the parser returns `null` and the session confirms intent before drafting.

Multiple refs in one message: the FIRST parseable ref wins. The operator can re-invoke intent per-ref.

### Add-existing path (no gate)

1. Parse the ref via `parseAddExistingIntent`. On `null`, confirm intent conversationally and re-parse on the operator's confirmation.
2. Resolve shorthand `#<n>` against the tracking ref's `<owner>/<repo>` prefix. The resolved ref is what goes into the ledger and the tool calls.
3. Call `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<resolved-ref>)` (the generacy#935 verb).
4. Call `cockpit_queue(issue=<resolved-ref>)` (the generacy#935 issue-form of `cockpit_queue`).
5. Write ledger line: `<resolved-ref> · scope-add · queued` (or `<resolved-ref> · scope-add · error: <description>` on failure).
6. Return to the main loop. **No gate** — the operator's explicit instruction *is* the approval (Q2 anchor).

On any error from `cockpit_scope_add` or `cockpit_queue`, write the error ledger line and continue the main loop; the operator can retry via a fresh intent.

### File-new path (G.6 filing gate)

1. Parse the topic via `parseFileNewIntent`. On `null`, confirm intent conversationally and re-parse on the operator's confirmation.
2. Spawn a drafter subagent (`subagent_type: "general-purpose"`, description: `Draft issue for <topic>`, prompt: the operator's topic + a return-schema directive) to draft `{title, body, labels}` for the new issue. Return contract: strict JSON `{title: string, body: string, labels: string[]}`; on error `{"error": "<description>"}`.
3. Present the **G.6 filing gate** (see § Gate contract G.6) with the drafted content in the five-element block. Loop the edit branch until `Approve & file` or `Skip (don't file)`.
4. **On `Approve & file`**:
   - Write the assembled body to `/tmp/cockpit-auto-file-<tracking-ref-slug>-<unix_ts>.md`.
   - Create the issue: `gh issue create --title "<title>" --body-file <tmpfile> [--label <labels>]` — `--body-file` only (never `-b` / `--body`; shell quoting risks stripping content).
   - Capture the new ref from `gh issue create` return.
   - Call `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<new-ref>)`.
   - Call `cockpit_queue(issue=<new-ref>)`.
   - Write ledger line: `<new-ref> · filing-gate+scope-add · filed + queued (<new-ref>)`.
5. **On `Skip (don't file)`**: write ledger line `<tracking-ref> · filing-gate · skipped (draft discarded)` (the left slot is the tracking ref because no new ref was ever assigned) and return to the main loop. **No create, no scope-add, no queue.**

On any error from `gh issue create` / `cockpit_scope_add` / `cockpit_queue` after `Approve & file`, write the corresponding error ledger line (`filing-gate+scope-add · error: <description>` / `error: scope-add failed: <description>` / `error: queue failed: <description>`) and continue the main loop. Do **not** attempt retraction on a successful `gh issue create` — closing the just-created issue would compound the failure; the operator can manually add the ref via the add-existing intent flow.

**Restart safety**: scope mutations are ledger-lined and reflected on the tracking issue's task list at the engine boundary. A restarted session re-orients from the tracking ref's live task list (spec § Changes item 5); mutes/cursors stay session-local.

## Offering auto

Guidance for the *pre-invocation* conversational surface — the point at which a Claude session, having just helped file one or more issues, decides whether to suggest driving them to terminal with `/cockpit:auto`. This is skill-level guidance, not part of the auto loop.

**When to offer** (R1): after any 1+ issues have been successfully filed to the workspace's repo during the current session, regardless of who drafted the text (developer, subagent, or the auto session's G.6 filing gate). No provenance filter, no content heuristic — the offer is cheap and confirmation-gated, so an occasional unwanted offer costs one "no".

**How to offer** — three hard rules:

1. **R2 — concrete numbers only.** The offer MUST include the resolved issue-number list (e.g. `/cockpit:auto 223, 224`), never a placeholder like `<n>` or `<numbers>`. A placeholder-numbered offer is broken; resolve the numbers before making the offer.
2. **R3 — confirmation-gated.** The offer MUST be a suggestion the developer confirms. Never auto-run `/cockpit:auto` on the operator's behalf; the developer decides whether to start an auto session at all.
3. **R4 — at most once per batch.** The offer SHOULD fire at most once per batch of filed issues. If the developer declines, don't re-nag; if a later batch of issues is filed, that's a new batch and a fresh offer is fine.

**Suggested phrasing** (not prescribed): e.g. "Want me to run `/cockpit:auto 223, 224` to process these?" — with room for session-level variation. Exact wording is not fixed; the invariants above are.

**What it is NOT**: this is not a gate, not an `AskUserQuestion`, and not part of the auto loop. It is the pre-invocation conversational surface — where the developer decides whether to *start* an auto session — not a step inside a running session. The auto loop's gates (G.1–G.7) are unaffected by this guidance.

## Gate contract

Four gate types — **clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations** — are the exhaustive human-interaction surface. **Nothing else prompts; none of these auto-proceed.** Every gate is fused with its presentation in one assistant response (#388 pattern applied uniformly). Every gate uses `AskUserQuestion` — never a Bash `read` prompt, never a text-only question the operator answers in prose.

| # | Gate | Options | Presentation |
|---|------|---------|--------------|
| G.1 | Clarification batch | `Approve all & post (Recommended)` / `Make changes` / `Skip this batch` (single call per batch) | Five-element `### Q<n>` block per open question (context/question/options/recommendation/why + provenance) |
| G.2 | Review verdict | `approve` / `request-changes` / `abort` (single call) | Findings-summary table + Suggested decision |
| G.3 | Manual-validation confirm | `manually validated` / `not yet` (single call) | Scenarios + acceptance_checks lists |
| G.4 (a) | Escalation: validate-red / merge-red | `Retry` / `Skip` / `Stop` (single call) | Fixer summary + reason + failing checks |
| G.4 (b) | Escalation: agent:error / failed:* | `Requeue` / `Skip` / `Stop` (single call) | Failure evidence |
| G.4 (d) | Escalation: Merge-conflicts | `I've resolved it — advance the gate` / `Skip` / `Stop` (single call) | Conflicted paths (+ CLI stderr on re-present) |
| G.4 (c) | Escalation: unrecognized state | `Skip (Recommended)` / `Stop` (single call, no Retry) | Observed state |
| G.5 | Phase-queue confirmation | `Queue P<next> (Recommended)` / `Cancel` — or `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` / `Queue P<next> (<N> issues)` / `Cancel` when open ad-hoc work exists (single call) | Next-phase issue list + optional `Open ad-hoc issues in scope (added mid-run):` block |
| G.6 | Filing gate (new-issue draft) | `Approve & file (Recommended)` / `Make changes` / `Skip (don't file)` (single call; iterative edit branch) | Five-element block: title, labels, body, filing target, parent tracking ref |
| G.7 | Scope-drained (epic-less exit) | `Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)` (single call) | Tracking ref, refs processed, per-ref disposition (`completed` / `not-planned`) |

### G.1 — Clarification batch gate

**Trigger**: D.1 (`waiting-for:clarification`).

**Presentation** (in the same response as the single `AskUserQuestion` call) — one five-element `### Q<n>` block per open question:

```markdown
Drafted answers for <issue-ref> (<N> open questions):

### Q<n> — <title from batch comment>
**Context:** <framing from batch comment, verbatim/condensed>
**Question:** <question verbatim>
**Options:** <lettered options as posted (A — …, B — …); or "(free-form — no options posted)">
**Recommendation:** <chosen letter + its text, or the drafted free-form response>
**Why:** <1–3 sentences justifying the recommendation over the other options>
_provenance: <citation>_

(repeat per open question — one block per Q, separated by a blank line)
```

Title comes from the batch comment header verbatim (`ParsedQuestion.title`); when the header lacks a title (`### Q<n>` without colon-title), substitute `q.question.split('\n')[0].slice(0, 80)` — the canonical path uses the header title verbatim; truncation is defense-in-depth. Free-form questions render `**Options:** (free-form — no options posted)` verbatim (never drop the line — the five-element structure is a fixed shape). Context, question, and options come from parsing `clarificationComment.body` (D.1 step 1); recommendation, why, and provenance come from the drafter (SB.1 return, D.1 step 2).

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per batch (single-item `questions` array); when multiple clarification gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Post all <N> drafted answers to <issue-ref>?`
- **Header**: `Clarify` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve all & post (Recommended)` — post every drafted answer as-is.
  2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip. Zero directives is a no-op re-present.
  3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.

**Edit path**: The built-in "Other" free-text channel is the **one-turn edit path**: directives typed there are parsed via the same rule (see § Directive grammar) and applied directly to the drafted answers (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip. The listed `Make changes` option is not the same risk as the #388 turn-split concern. Splitting a gate's presentation from its decision (the #388 concern) allowed the loop to auto-proceed on an implicit-approve default. A change-collection turn that follows an explicit operator selection of `Make changes` cannot auto-proceed — zero directives is a no-op re-present, not an implicit approve or skip. Every iteration requires an explicit operator choice. Keep "Other" documented as the no-extra-turn path.

**Post-gate behavior**:
- `Approve all & post` → post every drafted answer as-is; `cockpit advance --gate clarification`; ledger `advanced`.
- `Make changes` → parse directives via § Directive grammar; if `Directive[]` is empty, re-present the entire batch (no changes) and re-fire the same three-option gate — do NOT auto-approve, do NOT auto-skip; if non-empty, apply directives (edits update the staged answer/rationale, `skip` marks the question excluded), re-present only the changed questions plus the same three-option batch gate, loop until Approve or Skip.
- `Skip this batch` → post no comment; do not advance; ledger `all answers skipped`.
- "Other" (one-turn edit) → parse directives via § Directive grammar; apply to the drafted answers (edits overwrite, `skip` excludes); post the resulting subset; advance if every question was posted, else ledger `posted <k>/<N>, skipped <s>`.
- Skipped answers → dropped; do not appear in the comment.
- All approved (including via edits) → `cockpit advance --gate clarification`; ledger `advanced`.
- Some approved, some skipped → post the approved subset; do not advance; ledger `posted <k>/<N>, skipped <s>`.
- All skipped (via directives or `Skip this batch`) → post no comment; do not advance; ledger `all answers skipped`.

### Directive grammar

Both `Make changes` and the "Other" free-text path parse per-question directives identically, using a `Q<n>:` token-anchored rule.

**Rule**: A new directive begins at each `Q<n>:` token. Split the input at `Q<n>:` occurrences; each directive's payload runs from the token to the next token or end of input.

**Documented forms** (both parse identically under the rule):

- Newline-separated (canonical):
  ```
  Q2: B
  Q4: skip
  ```
- Single-line semicolon (a verbatim replacement's text may itself contain semicolons; the token rule doesn't mis-split it):
  ```
  Q2: B; Q4: skip
  ```

**Payload forms**:

- `Q<n>: <letter>` — bare letter (matching an option from the parsed batch comment) resolves to that option's text. The answer posts with **no rationale line** — never retain the draft's justification under an operator-overridden answer, because it would argue for a different choice.
- `Q<n>: <letter> — <reason>` — letter resolves to option text, and `<reason>` replaces the justification.
- `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
- Anything else — treated as verbatim replacement text for the answer, posted as-is.

**Applied identically in two paths**:

- **`Make changes` re-loop** — the operator's turn collects directives typed in a follow-up prompt or in the initial `AskUserQuestion` "Other" field; the loop re-presents only changed questions plus the same batch gate; loops until Approve or Skip.
- **"Other" free-text on the batch gate** — the operator's replacement text is applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.

Zero directives from a `Make changes` turn is a no-op: re-present the entire batch and fire the same gate again (never auto-approve or auto-skip on empty input).

### G.2 — Review verdict gate (artifact and implementation)

**Trigger**: D.2 (`waiting-for:<artifact>-review`) or D.3 (`waiting-for:implementation-review`).

**Presentation** (in the same response as the `AskUserQuestion` call) — the findings-summary table verbatim per #388 C.3.5:

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | <path>:<line> | <one-line finding summary> | Yes |
| 2 | <path>:<line> | <one-line finding summary> | No |
| ... |

Suggested decision: <approve | request-changes>
```

For zero findings (`[]` from the subagent):

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |

Suggested decision: approve
```

**Retained rule** (canonical inline occurrence is in D.2 prose — the raw-JSON-suppression clause carried forward from #388 / #390): the subagent's structured return is parsed and rendered as a table; it is never restated verbatim in the response body.

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per verdict gate (single-item `questions` array); when multiple review gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Verdict for <issue-ref> (<gate-name>)?`
- **Header**: `Verdict` (≤ 12 chars)
- **Options** (exactly three, discrete, in this order):
  1. `approve` — advance the gate
  2. `request-changes` — post via the D.2 guardrail (pre-validate → POST → two-leg verify → retry-once → re-present on failure)
  3. `abort` — do nothing
- **multiSelect**: `false`

**Post-gate behavior**:
- `approve` → `cockpit_advance(issue=<issue-ref>, gate=<gate-name>)`.
- `request-changes` → run the D.2 four-step guardrail; do NOT `advance` (unresolved threads own the transition).
- `abort` → do nothing.

Hard-error subagent returns (`{"error": …}` or unparseable) → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Zero findings still invokes `AskUserQuestion` — no auto-approve smuggled in.

**G.2 re-presentation shape** (fired only when the D.2 request-changes guardrail's second attempt also fails its postcondition — Q3=A per `research.md` R4):

The re-presented gate is a full G.2 re-fire (same table, same `AskUserQuestion` call with the same three options in the same order) with a **failure notice prepended** to the presentation body:

```markdown
> **Postcondition failed after retry.**
> POST/GraphQL error: <verbatim `code` / `message` from the failing leg — quote the response payload>
> postcondition failed after retry (attempt=2 · leg1=<a>/<n> · leg2=<b>/<n>)

<original findings table>

Suggested decision: <approve | request-changes>
```

**Rules**:
- The failure notice is a Markdown blockquote so the operator's eye lands on it first; the original findings table and `Suggested decision:` line follow verbatim from the initial G.2 presentation (no re-analysis — the analyzer's return is unchanged; the failure is in the delivery layer, not the analysis).
- The failure notice quotes the failing leg's error `code`/`message` verbatim inside the blockquote (Leg 1 → mismatch summary from the POST response; Leg 2 → the GraphQL query's response fragment or the timeout error).
- Re-selecting `request-changes` on the re-presented gate starts a **fresh POST with a fresh retry allowance** — the retry counter is per-attempt (per POST bundle), not per-verdict, so operator re-selection does not compound retries.
- The `abort` and `approve` branches on the re-presented gate are unchanged — `approve` still advances the gate (operator's judgment call: they may choose to advance despite the invisible feedback), `abort` still does nothing.

**Invariant**: G.2 `abort` and `approve` branches are unchanged by this branch — only `request-changes` gains the postcondition guardrail and the retry-then-re-present recovery.

### G.3 — Manual-validation confirm gate

**Trigger**: D.4 (`waiting-for:manual-validation`).

**Presentation** (in the same response as the `AskUserQuestion` call) — the subagent's structured summary rendered as bullet lists:

```markdown
Manual validation checklist for <issue-ref> (PR <pr-number>):

**Scenarios to test:**
- <scenario 1>
- <scenario 2>
- ...

**Acceptance checks:**
- <check 1>
- <check 2>
- ...
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per manual-validation gate (single-item `questions` array); when multiple manual-validation gates fuse into one response, fire one call per gate. Parameters:
- **Question text**: `Have you manually validated <issue-ref>?`
- **Header**: `Validated?` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `manually validated` — advance the gate
  2. `not yet` — do nothing; the event will re-fire when the operator confirms later
- **multiSelect**: `false`

The scenarios and acceptance_checks lists come **only** from the subagent hop — no inline artifact reads in the parent (Q4=B).

### G.4 — Escalation gate (three subtypes)

**Trigger**: One of:
- (a) `completed:validate` red / merge red after fixer runs and returns `{fixed: false, …}` (D.6).
- (b) `agent:error` / `failed:*` (D.7).
- (d) `waiting-for:merge-conflicts` (D.11).
- (c) Unrecognized / ambiguous state (D.10).
- (e) Consecutive `invalid-cursor` fault (§ step 5 Branch B; counter ≥ 2, streak not yet operator-acknowledged).

**Presentation** (in the same response as the `AskUserQuestion` call) — evidence formatted per subtype.

**(a) Validate-red / merge-red**:

```markdown
Fixer could not resolve <issue-ref> (PR <pr-number>):

<fixer summary — the subagent's `summary` field>

Reason (from fixer): <fixer's `reason` field>

Failing checks: <check names>
```

**(b) `agent:error` / `failed:*`**:

Populated verbatim from the diagnosis subagent's verdict (D.7 step 2). No in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged. On **repeat dispatches** (D.7 dispatch classification), the block gains a sixth element between "Evidence" and "Current state" populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields.

First-dispatch presentation:

```markdown
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

Repeat-dispatch presentation (adds the "Failure class changed since prior" row between Evidence and Current state):

```markdown
Agent error on <issue-ref> (repeat dispatch):

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

The `Failure class changed since prior` row is populated verbatim from the verdict's `failure_class_changed` (as `yes` if `true`, `no` if `false`) and `failure_classes_seen` (as a `→`-joined running list). A `yes` value usually means the prior Requeue *made progress* — the recommendation calculus at the gate should reflect that (this incident's Skip recommendations inverted it). The row is absent on first-dispatch presentations (there is no prior evidence to compare against).

**(d) Merge-conflicts**:

Populated verbatim from the diagnosis subagent's verdict (D.11 step 1.5). No in-parent re-analysis; the operator still chooses from the full option set; the option set itself is unchanged.

Initial presentation:

```markdown
Merge conflicts on <issue-ref>:

**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)   ← rendered ONLY when <source-label> is `blocked:stuck-merge-conflicts`; omitted entirely when source is `waiting-for:merge-conflicts`
**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Conflicted paths (from engine pause alert):**
- <path 1>
- <path 2>
- ...
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to call `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`.
```

The `Auto-remedy status` row is a fixed-shape labeled field (D.7 precedent at `auto.md:665–677`); its literal value is `failed (engine escalated via blocked:stuck-merge-conflicts)` when present. The opening line and all other rows are unchanged across both source labels — do not mutate the opening line and do not append trailing prose beyond what is shown.

Re-presentation on typed-error return (Q3=A shape):

```markdown
Advance failed for <issue-ref>:

<typed-error `code`/`message`/`details` verbatim, from `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`>

Merge conflicts on <issue-ref>:

**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)   ← rendered ONLY when <source-label> is `blocked:stuck-merge-conflicts`; omitted entirely when source is `waiting-for:merge-conflicts`
**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Conflicted paths (from engine pause alert):**
- <path 1>
- <path 2>
- ...
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)

The branch cannot advance until the conflicts are resolved and the branch is pushed conflict-free. Resolve locally (e.g., `git checkout <branch>; git rebase origin/main; git mergetool; git push --force-with-lease`), then select `I've resolved it — advance the gate` to call `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`.
```

The `Auto-remedy status` row is inserted with identical placement (above `**Root cause:**`) and identical literal value across the initial and re-presentation shapes — the two shapes remain symmetric aside from the prepended typed-error preamble.

**(c) Unrecognized state**:

```markdown
Unrecognized state on <issue-ref>:

Observed: <raw state from cockpit status --json>

Streamed event: <original transition line>
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per escalation gate (single-item `questions` array); when multiple escalation gates fuse into one response, fire one call per gate. The reference applies uniformly to each of the five subtypes G.4a/G.4b/G.4c/G.4d/G.4(e) listed in the Options table below. Parameters:
- **Question text**: `How to proceed on <issue-ref>?` (subtypes a/b/c/d) or `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?` (subtype (e); operates on an epic, not an issue).
- **Header**: `Escalate` (≤ 12 chars)
- **Options** (subtype-specific, in the listed order):

  | Subtype | Options |
  |---------|---------|
  | (a) validate-red / merge-red | `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (b) agent:error / failed:* | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (d) merge-conflicts | `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (c) unrecognized state | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |
  | (e) consecutive `invalid-cursor` fault | `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** (single call; per-epic, not per-issue) |

- **multiSelect**: `false`

**Post-gate mechanism sentences** (verbatim per Q3=D):
- `Retry` (subtype a only) → re-run the fixer subagent **once**. If `{fixed: true}`, loop back to D.5; if `{fixed: false}`, re-present the escalation gate.
- `Requeue` (subtype b only) → `cockpit_resume(issue=<issue-ref>)` (Assumption A2). If tool missing, degrade to Skip with explicit ledger note.
- `I've resolved it — advance the gate` (subtype d only) → `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`. On success, ledger `advanced` and continue. On typed-error return, re-present the D.11 gate with the tool's `code`/`message` prepended verbatim to the presentation block (see § D.11 dispatch step 3).
- `Continue degraded (sweep-per-batch)` (subtype (e) only) → mark the current unhealed `invalid-cursor` streak as operator-acknowledged; the loop continues; § step 5 Branch B recovers on each subsequent `invalid-cursor` (incrementing the counter and writing a `cursor-recovery · invalid-cursor · <N>` ledger line for accounting), but the G.4(e) gate does **not** re-fire within the same streak (decide-once). On any successful cursor reuse the streak-acknowledged flag AND all counters reset (per § step 5); a fresh 2-in-a-row streak re-fires the gate at count == 2 (Q4=A: new streak = new decision).
- `Skip` (subtypes a/b/c/d) → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.** Subtype (e) does NOT expose `Skip` — the fault is per-epic (cursor mechanism), not per-issue.
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**

### G.4(e) — Escalation: consecutive `invalid-cursor` fault

**Trigger**: § step 5 Branch B evaluates: `invalid-cursor` counter ≥ 2 AND the current streak has not yet been operator-acknowledged (per Q4=A decide-once). Verbatim state anchor: the `invalid-cursor` consecutive-fault counter has reached 2 on the second consecutive `invalid-cursor` typed error from `cockpit_await_events` with no intervening successful cursor reuse (per § step 5's successful-reuse definition — any call presenting a non-null cursor and returning no cursor-error signal, empty batches included). The gate fires exactly once per unhealed streak (at count == 2); subsequent `invalid-cursor` occurrences within the same streak recover silently (with ledger lines) once the streak is operator-acknowledged.

**Presentation** (in the same response as the `AskUserQuestion` call):

```markdown
Consecutive `invalid-cursor` fault on <epic-ref> (consecutive-count: <N>):

**Most recent typed errors** (verbatim from `cockpit_await_events`):
- Occurrence <N-1>: `code`=<code-1>, `message`=<message-1>, `details`=<details-1>
- Occurrence <N>: `code`=<code-2>, `message`=<message-2>, `details`=<details-2>

**Recovery state**: The loop has been running startup-sweep-per-batch since the first `invalid-cursor` occurrence at <timestamp>. Each recovery is idempotent (sweeps see already-dispatched state and no-op), but the dispatch-round reduction the MCP path exists to deliver (SC-003) is not being realized — every batch pays the full startup-sweep cost.

**Options**:
- `Continue degraded (sweep-per-batch) (Recommended)` — accept the degraded loop; decide-once for the current unhealed streak (the gate does NOT re-fire on subsequent `invalid-cursor` within the same streak). The counter continues to increment for ledger accounting.
- `Stop (exit auto)` — kill the auto loop cleanly; print the run summary per § L.6 with the ledger file's absolute path. The operator may investigate offline (server-side incident, epic-configuration mismatch, caller-side race) and restart auto later.
```

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.4(e) fire (single-item `questions` array). When G.4(e) co-fires with another gate class (rare — cursor recovery is a per-loop event, not per-issue; the only realistic co-fire is a batch-boundary event that also happens to end with an `invalid-cursor`), the standing multi-gate fanout rule applies: one call per gate, never a fused questions array. Parameters:
- **Question text**: `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?`
- **Header**: `Escalate` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly two, discrete, in this order):
  1. `Continue degraded (sweep-per-batch) (Recommended)` — accept degraded loop for the current unhealed streak.
  2. `Stop (exit auto)` — kill loop; print run summary; exit.

**Post-gate behavior**:
- `Continue degraded (sweep-per-batch)` → set `streakOperatorAcknowledged = true` for the current unhealed streak; loop continues; § step 5 Branch B recovers on each subsequent `invalid-cursor` (incrementing the counter and writing a ledger line, but NOT re-firing the gate). Once any successful cursor reuse occurs, `streakOperatorAcknowledged` resets to `false` and all counters reset to 0 (per Q4=A).
- `Stop (exit auto)` → kill the auto loop cleanly; print the run summary per § L.6 (including the persistent ledger file's absolute path); exit cleanly. No label writes.

**Ledger line contract**: two ledger lines per G.4(e) fire — the fault accounting is written by § step 5 Branch B before the gate fires (`<epic-ref> · cursor-recovery · invalid-cursor · <N>` where `<N>` is the counter value that triggered the gate); the operator decision is written by G.4(e) after the response (`<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>`). Together they form the "streak reached N, operator decided X" record.

**Failure modes**:
- `Continue degraded` (operator selected) → no failure mode; the loop continues in degraded state. The ledger records the decision.
- `Stop` (operator selected) → no failure mode; the loop exits cleanly. The ledger records the decision. The run summary § L.6 prints an abbreviated form (non-`epic-complete` exit).
- No operator response → the gate blocks indefinitely per the standing gate contract (§ AskUserQuestion invocation contract, Q3=D). No per-row timeout policy. The block is cheap — no recovery loop spins while waiting — so the cost is bounded by operator return time, not by an arbitrary N.

### G.5 — Phase-queue confirmation gate

**Trigger**: D.8 (`phase-complete`).

**Presentation** (in the same response as the `AskUserQuestion` call):

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...
```

**Bootstrap variant** (synthetic `phase-bootstrap` trigger from the § step-3 fresh-epic sweep): the presentation's first line is `No phase in flight on <epic-ref> — bootstrapping the first phase.` and the next-phase line reads `First phase: P<first> (<N> issues)` (there is no P<current>). The issue list, options, question text (`Queue P<first> (<N> issues)?`), downstream (`cockpit_queue(epic=<epic-ref>, phase="P<first>")`), and ledger action verb (`phase-queue-gate`) are otherwise identical to the `phase-complete` path. Under `ResolvedGateMode === "ui"` it opens via `cockpit_gate_open` (transitionClass `phase-bootstrap`); it is **never** presented as a local `AskUserQuestion` under UI mode.

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per phase-queue gate (single-item `questions` array); phase-queue gates rarely fuse but the fanout rule applies uniformly if they do. Parameters:
- **Question text**: `Queue P<next> (<N> issues)?`
- **Header**: `QueueP<next>` (≤ 12 chars)
- **Options** (exactly two, discrete):
  1. `Queue P<next> (<N> issues) (Recommended)` — call `cockpit queue`
  2. `Cancel` — do nothing (the phase-complete state persists)
- **multiSelect**: `false`

On `Queue`, the CLI verb is called with `--yes` — the gate itself is the confirmation.

### G.6 — Filing gate (new-issue draft)

**Trigger**: A file-new intent recognized mid-run (via `parseFileNewIntent` returning a `FileNewIntent`) — see § Add-issue flow. Also fires at step 1 under the `--new "<title>"` invocation form to create the initial tracking issue.

**Presentation** (in the same response as the `AskUserQuestion` call) — the five-element block layout, used verbatim on every re-fire (no diff view — what gets filed is exactly what was last shown):

```markdown
Filing new issue for <tracking-ref>:

**Title:** <drafted-title>
**Labels:** <labels or "(none)">
**Body:**

<drafted-body — full markdown, multi-line, verbatim as it will be filed>

**Filing target:** <owner>/<repo> (from tracking ref)
**Parent tracking ref:** <tracking-ref>
```

The five field labels (`**Title:**`, `**Labels:**`, `**Body:**`, `**Filing target:**`, `**Parent tracking ref:**`) are ALWAYS present — even under empty labels (`(none)` placeholder). Missing any label is a presentation-shape drift (416-3 anchor).

**Gate invocation**: Per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.6 fire (single-item `questions` array). Parameters:

- **Question text**: `File this issue on <owner>/<repo>?`
- **Header**: `File` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Approve & file (Recommended)` — create + scope-add + queue + ledger.
  2. `Make changes` — enter iterative edit re-loop; the operator provides revised content conversationally, the session redrafts and re-fires this same G.6 gate with the full revised draft.
  3. `Skip (don't file)` — no create, no scope-add, no queue; ledger line noting the skip.

**Iterative edit branch (Q3 anchor — full-draft re-present each round, never a diff view)**:

- **On `Make changes` selection**: the operator's follow-up turn provides change directives (title, body, labels) as free text. The session redrafts the FULL issue and re-presents the full revised draft plus the same G.6 gate. Loop terminates on `Approve & file` or `Skip (don't file)`.
- **On built-in "Other" free-text** (one-turn fast path — matches #400's Q1=A pattern): the operator can type revised content directly on the current G.6 fire without selecting `Make changes` first. The session applies the edit, re-fires G.6 once with the revised draft. Further edits require explicit `Make changes` selection.
- **Zero-directive `Make changes` is a no-op re-present** (matches #400's Q4=A pattern): empty follow-up → the session re-presents the same draft plus the same gate. Never implicit-approve; never implicit-skip. Every iteration requires an explicit operator choice.

**Post-gate behavior**: see § Add-issue flow (file-new path) for the full sequence — `Approve & file` runs `gh issue create --body-file` → `cockpit_scope_add` → `cockpit_queue(issue=…)` → ledger `filing-gate+scope-add · filed + queued (<new-ref>)`; `Skip (don't file)` writes ledger `<tracking-ref> · filing-gate · skipped (draft discarded)`; `Make changes` loops.

Under the `--new "<title>"` invocation form, the initial G.6 fire creates the tracking ref itself. On `Approve & file`, the ledger header is written after the create succeeds. On `Skip (don't file)` at the initial G.6, the run exits cleanly (no tracking ref created; ledger carries `form: tracking-new (abandoned before creation)`).

### G.7 — Scope-drained gate (epic-less exit)

**Trigger**: Under `invocationForm: tracking-existing | tracking-new`, every task-list ref of the tracking issue has a terminal disposition per `cockpit_status`'s classifier (Q1 anchor: `completed | not-planned`). The playbook does NOT re-derive terminality from raw GitHub states. **Does NOT fire under `invocationForm: epic`** — that path exits on `epic-complete`.

**Presentation** (in the same response as the `AskUserQuestion` call). The full epic status table per § L.4 policy is emitted immediately before this block:

```markdown
Scope drained for <tracking-ref> — every ref is terminal.

**Tracking ref:** <tracking-ref>
**Refs processed:** <N>
**Per-ref disposition:**
1. <owner>/<repo>#<m1> · <completed | not-planned>
2. <owner>/<repo>#<m2> · <completed | not-planned>
...

**Session-mute set:** <s> ref(s)
```

Per-ref disposition ordering is the same as the tracking issue's task-list markdown (first task first). Populated from `cockpit_status(issue=<tracking-ref>, json=true)`'s per-ref classifier.

**Gate invocation**: Per § AskUserQuestion invocation contract — one call per G.7 fire (single-item `questions` array). Parameters:

- **Question text**: `Scope drained on <tracking-ref>. How to proceed?`
- **Header**: `Drain` (≤ 12 chars)
- **multiSelect**: `false`
- **Options** (exactly three, discrete, in this order):
  1. `Keep watching (Recommended)` — return to main loop; re-arm `cockpit_await_events` on the tracking ref.
  2. `Add more work` — return to main loop with a follow-up prose prompt inviting the operator to file or add.
  3. `Finish (close tracking issue + summary)` — close tracking issue via `gh issue close <tracking-ref>`, print run summary per § L.6 (extended with per-ref disposition), exit zero. The G.7 pick IS the outward-facing confirmation (matches G.5's "gate IS the confirmation" pattern — no second gate).

**Default rationale (Q4 anchor)**: `Keep watching` is the reversible option; the mode's premise is that work arrives ad hoc — drained-for-now is not done. `Finish` closes the tracking issue (outward-facing, so gated regardless) and is always one explicit pick away.

**Post-gate behavior**:
- `Keep watching` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · keep-watching`; return to step 4.
- `Add more work` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · add-more-work`; emit prose prompt `What would you like to add? Reference an existing ref (e.g., "also process <ref>") or ask me to file a new issue (e.g., "file an issue for <topic>").`; return to step 4 (operator's next turn is processed by the intent-class recognizer per § Add-issue flow).
- `Finish` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · finish (tracking closed)`; then `gh issue close <tracking-ref>`; then print run summary per § L.6; exit zero. The ledger line is written BEFORE the close so the run summary can read it.

G.7 fires exactly once per drain event; subsequent drains (after `Keep watching` and further ad-hoc work reaching terminal) fire again as fresh gates.

## UI-mode gate mapping (G.1–G.7)

Applies only when `ResolvedGateMode === "ui"` (from § step-1 `--gates` resolution). Under `local`, every gate presents via `AskUserQuestion` per § Gate contract above and this section is dead prose. Under `ui`, every gate contract G.1–G.7 that maps to a per-issue wire record opens a remote gate via `cockpit_gate_open(GateOpenParams)` instead of `AskUserQuestion`; the operator's answer arrives as a D.12 `gate-answer` event (see § D.12 gate-answer below) and D.12 routes `{optionId, freeText}` onto the SAME downstream handling the local `AskUserQuestion` path performs today — no new downstream behavior. Contract: `contracts/ui-gate-mapping.md`. Reference wire types: `packages/claude-plugin-cockpit/lib/gate-wire-types.ts` (and `specs/449-part-cockpit-remote-gates/data-model.md § Types`).

**`runId` — compute-once, threaded as an explicit literal, propagated to gate-verb-issuing subagents (per #469 / FR-014 / FR-015 / FR-016 / R8).** Under `runIdEnabled === true`, EVERY UI-mode `cockpit_gate_open` invocation in a drafting D.n row (D.1 clarification, D.2 artifact-review, D.3 implementation-review, D.4 manual-validation, D.6 G.4a escalation, D.7 G.4b escalation, D.8 G.5 phase-queue, D.10 G.4c escalation, D.11 G.4d escalation) passes the run's pre-flight-derived `runId` (per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions above) VERBATIM on the payload. Also carrying `runId` under `runIdEnabled === true`: the § step 3 startup sweep's `cockpit_gate_open` calls (every extended-trigger row above), the § UI-mode fallback branch's local `AskUserQuestion` counterpart (wire shape N/A), Form 3's G.6 filing gate `cockpit_gate_open` under the TENTATIVE UI window, and every G.5 `phase-queue` gate open (including the synthetic `phase-bootstrap` variant). Under `runIdEnabled === false` the `runId` field is OMITTED from every payload (V6). No `runId` column is added to the mapping-table rows below because `runId` is per-run, NOT per-gateType — the same value is passed to every open call in the run.

**Subagent dispatch prompt template addition (per FR-015 / R8).** Under `runIdEnabled === true`, every subagent dispatch prompt that spawns a gate-verb-issuing subagent (D.1 clarification-drafter SB.1, D.2 review-verdict analyzer, D.3 review-verdict analyzer, D.4 manual-validation summarizer, D.7 diagnosis subagent, D.11 merge-conflicts diagnosis subagent) gains ONE additional line stating the run's `runId` verbatim:

```
runId: "<runId-literal>"
```

The subagent quotes the literal verbatim on every gate verb it issues (`cockpit_gate_open`, `cockpit_gate_ack`, `cockpit_gate_status`). Subagents MUST NOT re-derive `runId` from the ledger filename, an environment variable, a shared file, or any other source — the parent is the sole authority (per V2 / FR-014). Under `runIdEnabled === false` the `runId:` line is OMITTED from the prompt entirely (matching the wire shape — the field is not passed on any gate-verb payload the subagent might issue). Any subagent that does NOT issue a gate verb (e.g. a plain research subagent) does NOT need `runId` in its prompt — the explicit-literal rule is scoped to gate-verb-issuing subagents. Rationale: `auto.md` already uses explicit-literal propagation for every other run-scoped value passed to subagents (epic ref, gateId, cursor, prompts); pattern-B (subagent re-derives from ledger filename) would require a one-file-per-directory invariant that does not hold (the directory accumulates one file per run — a subagent that opens a stale prior-run file would derive the WRONG `runId`).

**Row count**: EXACTLY 10 rows below — G.1, G.2, G.3, G.4a, G.4b, G.4c, G.4d, G.5, G.6, G.7. Never 7 (consolidated) or 11 (including G.4e). Per Q1=C. G.4(e) escalation stays local-only — per-epic in-memory cursor-fault has no `<issue-ref>` to key on, so the wire record's per-issue fields (`issueRef`, `issueTitle`, `issueUrl`, `branch`) cannot be populated for it; see § G.4(e) exclusion note below.

**Row shape**: every row names — `Gate | transitionClass | title | drafted body (source) | options (optionId → label / recommended?) | freeTextAffordance | downstream action per optionId | ledger action verb`. Column meanings:

- **Gate**: the gate identifier (G.1 … G.7 subtype).
- **transitionClass**: the plugin-side dispatch vocabulary (`waiting-for:clarification`, `completed:validate`, `phase-complete`, etc.) that selects the row and maps to the frozen `gateType` enum (per § UI-mode gate mapping / § Generation discriminator). It is a plugin-local concept — NOT a frozen wire field (the wire carries `gateType`, not `transitionClass`); recover it from the matched record for the ledger row.
- **title**: `GateOpenParams.title` (flat) — the AskUserQuestion title verbatim from the corresponding G.n contract above.
- **drafted body (source)**: the drafted presentation block reused verbatim as `GateOpenParams.body` (flat) — sourced from the G.n subsection above.
- **options (optionId → label)**: `GateOpenParams.options[]` (flat) — `optionId` values are stable-across-the-wire keys the mapping table pins; `label` values are the operator-facing button text verbatim from the local G.n option strings.
- **freeTextAffordance**: the operator-facing free-text shape — one of `{ kind: "none" }`, `{ kind: "optional", placeholder }`, `{ kind: "required-if", ifOptionId, placeholder }` — used for local `AskUserQuestion` rendering. On the wire it collapses to the frozen `GateOpenParams.allowFreeText: boolean` (`= freeTextAffordance.kind !== "none"`); the placeholder / `required-if` detail is local-only (the frozen contract carries just the boolean).
- **downstream action per optionId**: the SAME tool call(s) / subagent spawn(s) / state mutation(s) the local `AskUserQuestion` path performs (per the G.n subsection above), invoked by D.12 on the arriving answer.
- **ledger action verb**: the `<action>` slot in the resolution ledger row (see § Ledger and § Ledger UI-mode extensions below) — always the pre-change vocabulary; the row's outcome slot carries `· source: ui-gate` (or `· source: ui-gate-fallback` on the fallback path).

#### Generation discriminator (UI mode)

The frozen `gateKey` is `<issueRef>:<gateType>:<generation>` and `gateId = sha256(gateKey)[:24]` (the `cockpit_gate_open` MCP tool derives both — the plugin never hand-builds a hash). `generation` is a **durable, content-derived, gateType-specific discriminator**, NOT a session-local integer counter: the frozen contract requires that the SAME gate re-asked after a session restart or serial cluster takeover derive the SAME `gateId` (so a stored answer redelivers), which a session-local counter cannot satisfy. Per-gateType derivation (plan.md § "Gate identity"):

| gateType | generation discriminator |
|---|---|
| `clarification` | content hash of the open question / answer set at open time (re-ask on `make-changes` → hash of the revised answer-set) |
| `artifact-review` | artifact kind + review-branch head SHA |
| `implementation-review` | PR head SHA |
| `manual-validation` | PR head SHA |
| `escalation` | subtype + triggering label/state + occurrence counter |
| `phase-queue` | phase number (`P<next>`) |
| `filing` | draft hash over `{title, body, labels}` (a `make-changes` edit changes it naturally) |
| `scope-drained` | tracking ref + drain counter |

**DATA GAPS (follow-up — durable-discriminator derivation is out of scope for this wire-shape reconciliation).** Today the parent loop does not compute several of these inputs: no review-branch / PR **head SHA** or **prNumber** (the review subagent fetches its own `gh pr diff`); no durable **occurrence counter** for escalations (dedup is a session-local membership set, `dispatched-issues`); no **drain counter** for `scope-drained`; no stable **batch-id / answer-set hash** for clarification. Until these are derived from durable GitHub state, re-asks across restart/takeover are not idempotent for the affected gateTypes. `phase-queue` and `filing` have no gap (phase number / draft hash are fully known). Tracked as a follow-up on the epic. **Separately**, `escalation` has a second, distinct gap: the single enum value is shared by four dispatch rows (D.6 / D.7 / D.10 / D.11) and the query surface exposes no subtype discriminator, so the pre-draft check's generation-drift branch is disabled for it — see § Pre-draft check — shared rules **generation-drift branch guard**; upstream [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046).

| Gate | transitionClass | title | drafted body (source) | options (optionId → label / recommended?) | freeTextAffordance | downstream action per optionId | ledger action verb |
|------|-----------------|-------|-----------------------|-------------------------------------------|--------------------|--------------------------------|--------------------|
| G.1 | `waiting-for:clarification` | `Approve clarification answers for <issue-ref>` | Five-element `### Q<n>` block per open question (title, context, question, options, recommendation, why, provenance) — from § D.1 step 3 / § G.1 above | `approve-all` → `Approve all & post (Recommended)`; `make-changes` → `Make changes`; `skip-batch` → `Skip this batch` | `{ kind: "optional", placeholder: "notes (optional)" }` — used to carry an edit directive alongside `make-changes` in a single submission | `approve-all`: post batch + `cockpit_advance(issue=<ref>, gate="clarification")`. `make-changes` (with freeText): apply edit directive per § G.1 edit-directive handling; recompute the generation discriminator (content hash of the revised answer-set); re-open per § D.12 revised-draft re-open path (the MCP tool derives the new `gateId`). `skip-batch`: post subset (skipped Q excluded) or post nothing if all-skipped. | `clarification-batch` |
| G.2 | `waiting-for:<artifact>-review` (spec / clarification / plan / tasks / implementation) | `Review verdict for <issue-ref> — <artifact>` | Findings-summary table + `Suggested decision:` line (per § D.2 step 3 / § G.2 above) | `approve` → `approve`; `request-changes` → `request-changes`; `abort` → `abort` | `{ kind: "optional", placeholder: "reviewer comment (optional; used as body of request-changes review or approval note)" }` — matches the local drafter's comment-body affordance | `approve`: `cockpit_advance(issue=<ref>, gate="<artifact>-review")`. `request-changes` (with freeText as review body): run the D.2 four-step guardrail (pre-validate anchors → compose bundle → POST → two-leg verify → retry once → re-present on failure). `abort`: no downstream action. | `review-analysis+advance` / `review-analysis+request-changes` / `review-analysis+abort` |
| G.3 | `waiting-for:manual-validation` | `Manual validation for <issue-ref>` | `**Scenarios to test:**` + `**Acceptance checks:**` bulleted lists (per § D.4 / § G.3 above) | `manually-validated` → `manually validated`; `not-yet` → `not yet` | `{ kind: "none" }` | `manually-validated`: `cockpit_advance(issue=<ref>, gate="manual-validation")`. `not-yet`: no downstream action (event re-fires when operator re-invokes). | `manual-validation-summary+advance` / `manual-validation-summary+wait` |
| G.4a | `completed:validate` (with red checks) OR post-merge red | `Escalation: validate red for <issue-ref>` | Fixer summary + reason + failing checks (per § D.6 / § G.4(a) above) | `retry` → `Retry (re-run fixer)`; `skip` → `Skip (session-local mute)`; `stop` → `Stop (exit auto)` | `{ kind: "none" }` | `retry`: re-spawn fixer subagent → loop D.5. `skip`: add `<ref>` to session mute set. `stop`: exit run cleanly. | `fixer+escalation-gate` |
| G.4b | `agent:error` OR `failed:<subtype>` | `Escalation: agent-error for <issue-ref>` | D.7 diagnosis subagent verdict block (root cause / evidence / current state / suggested decision + confidence; on repeat dispatches: adds `Failure class changed since prior` row — per § G.4(b) above) | `requeue` → `Requeue (cockpit resume)`; `skip` → `Skip (session-local mute)`; `stop` → `Stop (exit auto)` | `{ kind: "none" }` | `requeue`: `cockpit_resume(issue=<ref>)` (degrade to Skip with explicit ledger note if tool missing). `skip`: add `<ref>` to session mute set. `stop`: exit run cleanly. | `escalation-gate` |
| G.4c | Unrecognized `waiting-for:*` / `blocked:*` (per D.10 catch-all) | `Escalation: unrecognized state for <issue-ref>` | Observed state (verbatim from `cockpit status --json`) + streamed event line (per § D.10 / § G.4(c) above) | `skip` → `Skip (session-local mute) (Recommended)`; `stop` → `Stop (exit auto)` — **NEVER `retry`** | `{ kind: "none" }` | `skip`: add `<ref>` to session mute set. `stop`: exit run cleanly. | `unrecognized-state` |
| G.4d | `waiting-for:merge-conflicts` OR `blocked:stuck-merge-conflicts` | `Escalation: merge conflicts on <issue-ref>` | D.11 diagnosis subagent verdict block (auto-remedy status when applicable / root cause / evidence / conflicted paths / suggested decision + confidence — per § G.4(d) above) | `resolved` → `I've resolved it — advance the gate`; `skip` → `Skip (session-local mute)`; `stop` → `Stop (exit auto)` | `{ kind: "none" }` | `resolved`: `cockpit_advance(issue=<ref>, gate="merge-conflicts")` — on typed-error return, re-present the gate (revised generation) per § D.12 revised-draft re-open path. `skip`: add `<ref>` to session mute set (leave dispatched-issues entry in place). `stop`: exit run cleanly. | `escalation-gate` |
| G.5 | `phase-complete` — and the synthetic `phase-bootstrap` (fresh-epic startup, § step-3) which reuses this row verbatim with a distinct `gateId` and the § G.5 **Bootstrap variant** presentation (issueRef stays `<epic-ref>`) — (epic mode only; issueRef in the wire record is `<epic-ref>` — sole per-issue exception) | `Phase queue: P<next> for <epic-ref>` | Next-phase issue list + (when non-empty) `Open ad-hoc issues in scope (added mid-run):` block (per § D.8 / § G.5 above) | Empty ad-hoc list: `queue` → `Queue P<next> (<N> issues) (Recommended)`; `cancel` → `Cancel`. Non-empty ad-hoc: `hold` → `Hold — <M> ad-hoc (Recommended)`; `queue` → `Queue P<next> (<N> issues)`; `cancel` → `Cancel`. | `{ kind: "none" }` | `queue`: `cockpit_queue(epic=<ref>, phase="P<next>")` (with ad-hoc count in ledger outcome). `hold`: no downstream action (phase-complete persists). `cancel`: no downstream action. | `phase-queue-gate` |
| G.6 | `filing-gate` (synthetic — not a live label; fires on `--new "<title>"` startup or mid-run file-new intent) | `File issue: <drafted-title>` | Five-element block: title / labels / body / filing target / parent tracking ref (per § G.6 above) | `approve-and-file` → `Approve & file (Recommended)`; `make-changes` → `Make changes`; `skip-dont-file` → `Skip (don't file)` | `{ kind: "optional", placeholder: "edit directive (used by Make changes)" }` | `approve-and-file`: `gh issue create --body-file <tmp>` → capture ref → `cockpit_scope_add(scope=<tracking-ref>, add=<new-ref>)` → `cockpit_queue(...)` (mid-run intent) OR bind trackingRef (Form 3 startup). `make-changes` (with freeText): apply edit directive; recompute the generation discriminator (draft hash of the edited draft — changes naturally); re-open per § D.12 revised-draft re-open path (the MCP tool derives the new `gateId`). `skip-dont-file`: no filing (Form 3 startup exits cleanly; mid-run intent continues loop). | `filing-gate+scope-add` / `filing-gate` (skip only) |
| G.7 | `scope-drained` (synthetic — under `invocationForm: tracking-existing | tracking-new`) | `Scope drained for <tracking-ref>` | Full status table (per § L.4 policy) immediately before this block, then tracking ref / refs processed / per-ref disposition / session-mute count (per § G.7 above) | `keep-watching` → `Keep watching (Recommended)`; `add-more-work` → `Add more work`; `finish` → `Finish (close tracking + summary)` | `{ kind: "required-if", ifOptionId: "add-more-work", placeholder: "Reference an existing ref (e.g., 'also process <ref>') or ask me to file a new issue (e.g., 'file an issue for <topic>')." }` — Q4=A single-answer collapse: on `add-more-work`, D.12 routes `freeText` through the existing § Add-issue intent recognizer (add-existing vs file-new); under fallback (local `AskUserQuestion`) the two-turn flow reverts to today's behavior | `keep-watching`: return to main loop. `add-more-work` (with required freeText): route freeText through § Add-issue intent recognizer → write intent-specific downstream rows (`scope-add · queued` for add-existing; `filing-gate+scope-add · filed + queued (<new-ref>)` for file-new). `finish`: `gh issue close <tracking-ref>` → print run summary → exit zero (ledger line written BEFORE the close). | `scope-drained-gate` |

**Fallback body identity**: every row's drafted body / options / free-text prompt is authored ONCE per gate. On UI-mode success the block is handed to `cockpit_gate_open`; on the § UI-mode fallback path (below) the SAME block is handed to local `AskUserQuestion`. The mapping-table rows carry no separate "fallback body" column because the body is identical.

**G.4(e) exclusion note**: G.4(e) (consecutive `invalid-cursor` fault; § step 5 Branch B; per-epic in-memory cursor-mechanism fault) is NOT in the table above. The wire record cannot represent it — no `issueRef`, no `issueTitle`, no `issueUrl`, no `branch`; the fault is per-epic in-memory only, does not survive a session restart. Under `ResolvedGateMode === "ui"`, the G.4(e) gate fires locally via `AskUserQuestion` even when every other gate uses UI mode — the sole per-gate mode exception. Ledger row for G.4(e) is unchanged from today (no `· source: ui-gate` suffix, no `· source: ui-gate-fallback` suffix, no fallback ledger note).

### UI-mode fallback on `cockpit_gate_open` call error

Covers `cockpit_gate_open` **call-time** errors — the tool returns `{ ok: false, error: <string>, retryable: <bool> }`, times out, or throws a MCP transport error. Does NOT cover pre-flight absence of `cockpit_gate_open` from the tool binding (that path is the Q3=A hard-fail described in § step-1 `--gates` resolution above). Contract: `contracts/ui-mode-fallback.md`.

**Rule (per gate)**: on any `cockpit_gate_open` failure at gate-initiation time:

1. **Do NOT retry the call.** The plugin does not manage retry/backoff for gate-open; retry logic (if any) is owned by the cluster surface.
2. **Fall through to local `AskUserQuestion` for that gate ONLY.** Use the same drafted body / options / free-text affordance that WOULD have been sent to `cockpit_gate_open` (row-identical per the fallback body identity rule above). The § AskUserQuestion invocation contract Rules 1–3 apply verbatim.
3. **On the operator's answer**, run the SAME downstream handler as if it had come via D.12 — the mapping table's `downstream action per optionId` fires; the ledger resolution row is written.
4. **Ledger provenance for the fallback resolution**: write the ledger row in the pre-change vocabulary (matching today's local flow) with the suffix `· source: ui-gate-fallback` in the outcome slot — distinct from the clean UI-mode `· source: ui-gate`. Example: `<ref> · waiting-for:clarification · clarification-batch · advanced · source: ui-gate-fallback`. Grep recipes distinguish clean UI resolutions (`grep 'source: ui-gate$' <ledger>`) from fallback resolutions (`grep 'source: ui-gate-fallback' <ledger>`).
5. **First-failure ledger note** (spec § Scope: "repeated failures noted once, loop continues"). The FIRST `cockpit_gate_open` failure in a run also writes a one-time note BEFORE the fallback resolution row, verbatim shape:

   ```
   <first-failing-ref> · <transition-class> · gate-open · error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate
   ```

   Subsequent failures within the same run are silent (no per-failure ledger row) — only the resolution rows carry the `· source: ui-gate-fallback` suffix. This balances observability with ledger cost.

**Fallback state tracking**: in-memory flag `firstGateOpenFailureNoted: boolean` (default `false`) is added to § In-memory loop state (see below); flipped `false → true` on the first `cockpit_gate_open` failure; the first-failure ledger note fires only when the flag flips. The flag does NOT reset across the run — a run that recovers gate-open partway through (subsequent calls succeed) still shows only the one initial failure note; the failure pattern is what matters, not a running count.

**Interaction with revised drafts (`make-changes`)**: revised drafts (G.1 / G.2 / G.6) MAY encounter a fresh `cockpit_gate_open` failure at re-open time. The same per-gate fallback rule applies. The revised generation discriminator was still recomputed (a new `gateId`) and the original record still marked `superseded`, so any late-arriving answer under the original `gateId` is still recognized as `superseded` by gateId identity.

**G.7 Add-more-work under fallback**: local flow's two-turn pattern (select option → prose prompt → operator prose reply → intent recognizer) applies. UI mode's Q4=A one-turn collapse is a wire-schema feature (`Answer.freeText`); it does not survive fallback to `AskUserQuestion`. This is acceptable — the fallback path IS the pre-change local flow.

**Distinct from Q3=A pre-flight absence**: absence at pre-flight is a static session property → hard-fail (no ledger dir, verbatim error, exit non-zero). Error at call time is transient → per-gate fallback (loop continues, first-failure noted once). Different semantics, different contract.

**One pointer line on `cockpit_gate_open` success** (per FR-005 — UI affordance, not a ledger row): the loop prints the pointer line verbatim to the transcript, once per gate open:

```
gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)
```

No `[ledger] ` prefix. NOT appended to the persistent ledger file. This is the operator's affordance for finding the gate in the inbox; the dispatch-recording ledger row is written by D.12 at answer resolution (per § Ledger UI-mode extensions below).

### In-memory loop state additions (UI mode)

Additions to the § In-memory loop state block (alongside `monitorHandle`, `cursor`, `muteSet`, `activeGeneration`, and the C4 `heartbeatScheduledWakeupArmed` flag) — added only under `ResolvedGateMode === "ui"`; unused (undefined) under `local`:

- `openGates: Map<GateId, GateRecord>` — added on each successful `cockpit_gate_open`; removed on `cockpit_gate_ack(applied | superseded | failed)`. Not persisted to disk; a session restart re-derives the set from the § step-3 UI-mode startup sweep (below), keyed by `gateId = hash(issueRef, gateType, generation)` — the same three inputs yield the same id, so a re-sweep matches an existing open record instead of creating a duplicate. `dispatchClass` (plugin-local) is a distinct field on `GateRecord` used for the D.12 live-state supersession check and for D.12 step 4's `(dispatchClass, optionId)` routing; it is NOT part of the gateId derivation. **`dispatchClass` MUST be populated on every record, including the partial records the § Dispatch step 0 reuse branches create** — it is known at record time (it is the D.n row doing the reuse), and a record without it resolves no downstream handler when the answer arrives. Each `GateRecord` carries a `status: 'open' | 'answered'` field (added by #457, declared on the canonical type in `lib/gate-wire-types.ts § GateRecord`) so the escape-hatch's N=3 check (per § step 4 answered-gate sweep — below) can distinguish `open` from `answered` entries without an additional MCP call.

  **Per-entry `runId: string` on `GateRecord` — MANDATORY (per #471 / FR-003 / FR-004 / R11).** Each `openGates` entry carries its OWN `runId` field alongside `gateType`, `generation`, `status`, `issueRef`, `dispatchClass`, and `transitionClass`. The field is populated at ADD time and never mutated:
  - **(a) Current-run entries** — every entry added by the CURRENT run's sweep-time or live-path `cockpit_gate_open` success carries the current-run `runId` (the run-wide loop-state `runId` declared below).
  - **(b) Adopted entries** — every entry added by the § step 3 § Adoption pass (UI mode) block (below) carries the row's ORIGINATING `runId`, read verbatim from the `cockpit_gate_list` row that produced the adopted entry (per generacy-cloud#892; NOT the current-run `runId`). Adoption MUST NOT re-derive, transform, normalise, or fallback the field (per data-model.md § V2).
  - **(c) Every downstream `cockpit_gate_ack` for an `openGates` entry MUST read `openGates[gateId].runId`, NOT the run-wide loop-state `runId`.** The sites that matter: § step 3 § Answered-gate parked-forever escape hatch → § Escape-hatch re-derivation ack; § step 4 sub-step 0 per-wake escape-hatch ack; § D.12 gate-answer step 3 live-state supersession ack; § D.12 gate-answer step 5 operator-answer-applied / failure acks. The § D.12 step 1 no-record ack is the SOLE ack path that continues to use the run-wide loop-state `runId` (there is NO `openGates` entry to source from on the drop path — likely startup-race or duplicate delivery).

  The two coincide for current-run entries but DIFFER for adopted entries. Server-side accept-and-ignore semantics on the ack path (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire) mean the ack still succeeds either way — the intent-encoded value on the wire matters for audit/trace parity with `cockpit_gate_open`. Under `runIdEnabled === false` the per-entry field is still populated (for symmetry) but is OMITTED from every wire payload (V6). Under `local` the map is unused and the field is dead prose. Reference: `data-model.md § GateRecord` (extended).
- `firstGateOpenFailureNoted: boolean` (default `false`) — flipped `false → true` on the FIRST `cockpit_gate_open` call-time failure, drives the once-only fallback ledger note per § UI-mode fallback rule 5.
- `runId: string | null` — the pre-flight-derived full ledger filename stem (per § step 1 Pre-flight `runId` derivation above), of the form `<tracking-ref-slug>-<timestamp>` and colon-free by V1 / FR-013. Under `--gates=local` (any resolution path — explicit `local`, `--gates=auto` short-circuited to `local`, `--gates=auto` resolved to `local` via probe failure) `runId` is `null` for symmetry with the UI-mode branch. Under `runIdEnabled === true` this value is the run's on-wire discriminator for every `cockpit_gate_open` / `cockpit_gate_ack` / pre-draft `cockpit_gate_status` call in the run (per § UI-mode gate mapping and § Dispatch step 0 blocks). Read verbatim by every downstream consumer; NO consumer re-derives (V2 / FR-014). Every gate-verb-issuing subagent receives the value as an EXPLICIT LITERAL in its dispatch prompt (FR-015).
- `runIdEnabled: boolean` — the session-scoped capability flag. Decided ONCE at pre-flight after the § step 1 § Pre-flight probe (UI mode) capability probe (per FR-012 / V5); MUST NOT flip mid-run. Under `--gates=local` (any resolution path) `runIdEnabled` is `false` unconditionally (no probe fires, no `runId` field appears on any wire — the local byte-path never issues a gate verb). Under `--gates=ui` (explicit) or `--gates=auto` resolved to `ui`, `runIdEnabled === true` iff the pre-flight probe returned `{status: 'ok', …}`; on the `invalid-args` graceful-degradation branch (pre-#1067 cluster) `runIdEnabled := false` and the startup warning fires (per § Pre-flight probe (UI mode) above); on every other error class the run does not continue in UI mode (`runIdEnabled` is not set). Under `runIdEnabled === false` the `runId` field is OMITTED from every gate-verb wire payload — not passed as `null`, not passed as `undefined`, not passed as an empty string; omission is the safe way to be a no-op against a `.strict()` schema on a pre-#1067 cluster (V6). A mid-run flip is FORBIDDEN — the startup sweep opens gates before any Step-0 check runs, so reverting the read side after opens would orphan sweep-opened 4-segment gates for the rest of the session.
- `answeredGateSweepCounter: Map<GateId, number>` — per-sweep counter of consecutive sweeps in which a recorded `answered` gate has produced no D.12 event. Seeded at `1` by the D.n Step 0 `reuse-answered` branch that records the entry (that increment IS the entry's count for the sweep in which it was added — per § step 3 **Counter semantics**), then ticked at the top of every subsequent sweep by the § step 3 escape-hatch block AND at the top of every per-wake iteration by § step 4 sub-step 0 (both tick sites apply the same block; a "sweep" is either the once-per-session startup sweep OR a per-wake main-loop iteration; both run before any dispatch, so no sweep is counted twice for the same entry); reset by every D.12 handler; entries reaching `count >= 3` trigger the FR-009 supersede-and-re-derive path (ack `superseded` with detail `answered-not-consumed — presumed stuck at cloud delivered/applied`, remove from `openGates`, delete the counter entry, then **actively re-derive** per § step 3 **Escape-hatch re-derivation** — re-read the issue's live state with `cockpit_status(issue=<issueRef>, json=true)` and dispatch a synthesized event through the normal D.n path in the same pass. Re-derivation MUST NOT be deferred to the next drain: the ack changes no label and `cockpit_await_events` yields only new transitions, so no drain would ever produce the event and the issue would be parked with no operator surface). The per-wake tick site is load-bearing for reachability of entries FIRST added mid-run by a D.n Step 0 `reuse-answered` branch (the startup sweep alone cannot reach them). Under `local` the map is unused.

Reference types: `packages/claude-plugin-cockpit/lib/gate-wire-types.ts` and `data-model.md § Types` — the playbook prose IS the source of truth; the library exists for machine-checkable fixtures.

## AskUserQuestion invocation contract

Every gate contract G.1–G.5 above emits an `AskUserQuestion` call. This section states the three general rules that govern every such invocation, so each gate contract can reference them rather than restating them inline. Every future gate G.6+ MUST reference this section as well.

**Rule 1 — Default gate shape.** `AskUserQuestion.questions` is a **single-item array** (one call per gate/batch). Each of G.1–G.5 emits exactly one item in its `questions` array — this is the load-bearing structural default. The array's length is the number of `AskUserQuestion.question` objects the caller wants answered in a single harness call; the default is one per gate.

**Rule 2 — Harness ceiling.** `AskUserQuestion.questions` array MUST NOT exceed **4 items** per call. This is a hard input-validation bound enforced by the Claude Code SDK harness: exceeding it returns the harness error `InputValidationError: Too big: expected array to have <=4 items (questions)` and forces a retry round-trip that costs correctness signal (duplicated presentation block in the transcript, laggy last item as it fires in a subsequent call). The playbook cannot change this bound — it is a property of the harness, not of the playbook — so the playbook must never write shape that violates it.

**Rule 3 — Multi-gate fanout.** When multiple gates fuse into one assistant response (five issues hitting a `waiting-for:*` label simultaneously, or a phase-boundary co-fire of verdict gates, or an escalation-gate co-fire), fire **multiple `AskUserQuestion` calls** in that one response — one call per gate — never a single fused call whose `questions` array carries every gate's item concatenated. The fanout dimension is the *number of `AskUserQuestion` calls*, not the length of a single call's `questions` array.

The three rules compose transitively: default 1 item per call (Rule 1) + ≤4 items per call (Rule 2) → the fanout mechanism is per-call fanout (Rule 3), and each call's `questions` array stays at 1 item per gate. The ceiling is a property of each individual call, not of the response as a whole; a response containing five `AskUserQuestion` calls each with `questions.length === 1` satisfies all three rules simultaneously.

Every gate contract G.1–G.5 in the preceding `## Gate contract` section carries a one-sentence `Per § AskUserQuestion invocation contract — …` reference in its `**Gate invocation**` paragraph. When a future gate G.6+ is added, its gate contract MUST also reference this section — the reference is the discovery path a future author reading only one gate contract follows to find the ceiling and the fanout rule.

## Ledger

**Format sentence** (verbatim):

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

or, using the mnemonic column names: `issue · transition · action · outcome`. The separator is the middle-dot ` · ` (U+00B7) with a single space on each side.

**Mandatory-per-dispatch rule** (#388 enforcement style, verbatim):

> A dispatch without a ledger line is a protocol violation.

**What counts as a "dispatch"**: any typed event from a `cockpit_await_events` batch that the parent processes (branches into the dispatch table); any event synthesized by the startup sweep; any escalation-gate retry that re-runs the fixer or re-presents the escalation gate; any session-mute skip.

**What does NOT count**: re-check calls that don't produce a dispatch decision; pre-flight failures (before the loop begins); re-arms and doorbell arm-ups are not dispatches (re-arms are idempotent).

**Narrow amendment — pre-flight probe rows DO earn a ledger row** (per § step 1 § Pre-flight probe (UI mode)). The general "pre-flight failures do not earn a row" clause above is narrowed for the pre-flight functional probe: rows carrying the `preflight` transition class AND the `gate-query-probe` action DO earn a ledger row (`ok`, `error: <class> — <detail>`, and — under the Form-3 TENTATIVE UI window exception introduced by § step 1 § Pre-flight probe (UI mode) → Fail path clause 4 — the augmented `error: <class> — <detail> (aborted: probe-failed-after-remote-gate-consumed)` outcome shape, which folds the aborted-reason marker into the outcome slot in-place rather than emitting a second row). This is safe by construction: the probe is DEFERRED until AFTER the ledger header exists — the header is emitted at step 1 (Forms 1/2 at line-199 header write, before the startup sweep), after G.6 approval (Form 3), or at F4.7 (Form 4), all BEFORE the probe is issued (per § step 1 § `--gates` resolution and pre-flight absence two-phase split; the § Pre-flight probe (UI mode) subsection's post-header-write sequencing rule; and the Form 4 sequencing rule's post-F4.7 constraint). The header-first invariant is preserved: header is line 1, any probe row is line 2 (or later), and the `Auto run starting …` line follows the probe row. The § step-1 hard-fail paths (missing UI-mode tools under explicit `--gates=ui` at parse time; `--gates=*` usage errors; F4.6 `gh issue create` non-zero exit) remain ledger-free unchanged: those failures fire BEFORE the ledger directory is created. The probe's own `--gates=ui` fail path is a DIFFERENT case — it fires AFTER the ledger directory + header exist, so it does write the fail row and then exits non-zero (per § Pre-flight probe (UI mode) fail path step 3).

**Preflight vocabulary additions** (per § step 1 § Pre-flight probe (UI mode)):

- **`preflight`** — NEW transition class used exclusively by the pre-flight functional probe's ledger row (sibling of the existing `startup`, `heartbeat`, `cursor-recovery`, `epic-complete` control-flow transition classes). A future edit that introduces additional pre-flight probes MAY reuse the class; every probe row's action names the specific probe (currently `gate-query-probe`).
- **`ui-gate-probe`** — NEW source token used exclusively by the pre-flight functional probe's ledger row (sibling of the existing `ui-gate`, `ui-gate-fallback`, `enriched-line` source tokens). The four-way provenance-suffix precedence (below, § Ledger Rule 4) is extended: `ui-gate-probe` applies to the pre-flight probe row's outcome slot and is mutually exclusive with `ui-gate` / `ui-gate-fallback` / `enriched-line` — a probe row is never an enriched-line dispatch and never a D.12 gate resolution.

**Pre-flight probe row shapes** (verbatim, per § step 1 § Pre-flight probe (UI mode)):

- Pass: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`.
- Fail (standard): `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` (where `<class>` is one of `query-unreachable` / `invalid-args` / `internal` / `transport` per the § Gate-query error taxonomy, and `<detail>` is the tool's `detail` field verbatim).
- Fail (Form-3 TENTATIVE UI window exception, per § step 1 § Pre-flight probe (UI mode) → Fail path clause 4): `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> (aborted: probe-failed-after-remote-gate-consumed) · source: ui-gate-probe` — same `gate-query-probe` action and `ui-gate-probe` source vocabulary as the standard Fail shape, with the aborted-reason marker `(aborted: probe-failed-after-remote-gate-consumed)` folded into the outcome slot in-place between `<detail>` and the ` · source:` suffix. No additional row is written for the aborted resolution — the fold-in preserves the "at most one probe row is written per run" invariant (below) and avoids introducing an unregistered `gate-mode-resolution` action or a `reason:` field the four-column grammar does not carry.

The `<identity-ref>` slot carries the value in the ledger header's `Tracking ref:` field (epic ref under Form 1; `trackingRef` under Forms 2/3/4). At most one probe row is written per run (per FR-010 and § Pre-flight probe (UI mode)) — including the Form-3 TENTATIVE UI window exception above, which augments the single Fail row's outcome slot rather than emitting a second row.

**Persistence rule (dual-write, unconditional)**:

Every ledger line is:
1. **Printed to the transcript** on its own line, prefixed with `[ledger] ` for visual scanning.
2. **Appended to the persistent file** at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`, one line per dispatch, in the exact `<issue-ref> · <transition-class> · <action> · <outcome>` format (no `[ledger] ` prefix in the file).

Write mechanism: `echo "<line>" >> .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` — one append per dispatch, no rewriting.

**Epic-ref-slug rule**: the epic reference with `/` replaced by `-` and `#` stripped (e.g., `christrudelpw/epic#42` → `christrudelpw-epic-42`).

**Timestamp format**: `YYYYMMDD-HHMMSS` in the operator's local time, captured at the start of the run (step 1).

**Idempotency rule (L.5 — startup sweep + live-state re-check)**: The startup sweep (step 3) + the live-state re-check (step 4a) guarantee that re-arming the doorbell sensor on the same live state produces no duplicate action. Each synthetic event from the startup sweep produces its own ledger line, per the mandatory-per-dispatch rule. Events streamed for state already dispatched are recognized as no-ops by the re-check step and dispatched only if the live state is still actionable.

### Action + outcome vocabulary (per dispatch row)

Stable strings per dispatch table row, so `grep` recipes on `<action>` / `<outcome>` are reliable.

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| D.1 clarification | `clarification-batch` | `advanced`, `posted <k>/<N>, skipped <s>`, `all answers skipped`, `error: <description>` |
| D.2 artifact-review | `review-analysis+advance` | `approved`, `advance failed`, `error: <description>` |
| D.2 artifact-review | `review-analysis+request-changes` | `posted (<anchored> inline, <unanchored> in body)` |
| D.2 artifact-review | `review-analysis+request-changes` | `postcondition-failed → re-present-gate` |
| D.2/D.3 review-verdict | `postcondition-passed` | `leg1=<n>/<n> · leg2=<m>/<n>` |
| D.2/D.3 review-verdict | `postcondition-failed` | `attempt=<1\|2> · leg1=<a>/<n> · leg2=<b>/<n>` (attempt=2 line appends ` · re-present-gate`) |
| D.2/D.3 review-verdict | `review-post-retry` | `attempt=1 · backoff=2s` |
| D.2 artifact-review | `review-analysis+abort` | `aborted` |
| D.3 implementation-review | (same as D.2) | (same as D.2) |
| D.4 manual-validation | `manual-validation-summary+advance` | `manually validated` |
| D.4 manual-validation | `manual-validation-summary+wait` | `not yet` |
| D.5 merge (green) | `merge` | `merged (PR #<n>)`, `blocked: missing-approval`, `blocked: draft`, `blocked: pending`, `blocked: missing-label`, `infrastructure failure — <checks>` |
| D.6 fixer | `fixer` | `fixed`, `unfixed → escalation` |
| D.6 fixer + escalation | `fixer+escalation-gate` | `retry`, `skip (session-local mute)`, `stop (exit)` |
| D.7 agent-error / failed | `escalation-gate` | `requeue (cockpit resume)`, `requeue failed: <description>`, `skip (session-local mute)`, `skip (cockpit resume unavailable — G-S8 prerequisite)`, `stop (exit)` |
| D.8 phase-complete | `phase-queue-gate` | `queued P<next> (<N> issues)`, `cancelled` |
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.9a pr-feedback | `(no-op)` | `server-side-owned` |
| D.9b children-complete | `(no-op)` | `server-side-owned` |
| D.9c dependencies | `(no-op)` | `server-side-owned` |
| D.9d phase:* | `(no-op)` | `engine-owned phase transition` |
| D.11 merge-conflicts | `escalation-gate` | `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
| § step 5 cursor recovery (Branch A) | `cursor-recovery` | `resetFrom · <N>`, `expiry · <N>`, `discarded · <N>` |
| § step 5 cursor recovery (Branch B) | `cursor-recovery` | `invalid-cursor · <N>` (e.g., `cursor-recovery · invalid-cursor · 1`) |
| § step 5 Branch B escalation | `escalation-gate` | `continue-degraded`, `stop (exit)` — G.4(e) operator decision; transition class is `invalid-cursor-streak` |
| Add-issue (add-existing intent) | `scope-add` | `queued`, `error: <description>` |
| Add-issue (file-new intent) | `filing-gate+scope-add` | `filed + queued (<new-ref>)`, `error: <description>`, `error: scope-add failed: <description>`, `error: queue failed: <description>` |
| G.6 filing gate (skip only — no ref filed) | `filing-gate` | `skipped (draft discarded)` |
| G.7 scope-drained gate | `scope-drained-gate` | `keep-watching`, `add-more-work`, `finish (tracking closed)`, `error: close failed: <description>` |
| D.8 phase-queue hold / queued-with-ad-hoc (non-empty ad-hoc list) | `phase-queue-gate` | `held (<M> ad-hoc open)`, `queued P<next> (<N> issues) with <M> ad-hoc open` |
| D.8 `openAdHocIssues` helper (failure only) | `openAdHocIssues` | `error: cockpit_status failed for <ref>: <description>` |
| mute-set hit | `(muted)` | `skip (session-local mute active)` |
| Heartbeat fire (step 4 C4) | `heartbeat · schedule-wakeup` | `fired · drain empty`, `fired · drain complete (<M> events)` |
| D.12 gate-answer (applied — clean UI-mode resolution) | (same as record's `<original-action>` — e.g., `clarification-batch`, `review-analysis+advance`, `phase-queue-gate`, `escalation-gate`, `filing-gate+scope-add`, `scope-drained-gate`) | pre-change `<outcome>` (e.g., `advanced`, `queued P<next> (<N> issues)`, `manually validated`, `filed + queued (<new-ref>)`, `keep-watching`) + `· source: ui-gate` |
| D.12 gate-answer (superseded — no record) | (same as record's `<original-action>` OR `gate-open` if record was lost) | `superseded (no record) · source: ui-gate` |
| D.12 gate-answer (superseded — stale generation) | (same as record's `<original-action>`) | `superseded (stale generation) · source: ui-gate` |
| D.12 gate-answer (superseded — live state advanced) | (same as record's `<original-action>`) | `superseded (state advanced) · source: ui-gate` |
| D.12 gate-answer (failed — downstream handler error) | (same as record's `<original-action>`) | `failed: <detail> · source: ui-gate` |
| D.12 revised-draft re-open (G.1 / G.2 / G.6 `make-changes`) | (same as record's `<original-action>`) | `make-changes (re-opened g<n>) · source: ui-gate` |
| UI-mode fallback first-failure note (one-time per run) | `gate-open` | `error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate` |
| UI-mode fallback resolution (local `AskUserQuestion` after `cockpit_gate_open` failure) | (same as pre-change `<action>`) | (pre-change `<outcome>`) · source: ui-gate-fallback |

The `<issue-ref>` slot of the heartbeat row carries the **`<epic-ref>`** (or the tracking ref under `--tracking` / `--new`, matching the ledger header line's `Tracking ref:` field) — heartbeats are epic-scoped, not per-issue.

**`source: enriched-line` marker rule (per § Enriched-line dispatch contract E6)**: Rows D.1, D.2, D.3, D.4, D.7, D.9, D.9a, D.9b, D.9c, and D.9d append the literal `· source: enriched-line` suffix to their `<outcome>` slot when the dispatch was driven by an enriched doorbell line (per § Enriched-line dispatch contract E2 = true and the class is in the E3 "enriched line" column). Rows D.5 and D.6 append the same suffix on decisive `checks: "green" | "red"` from the enriched line (per E4). No suffix is appended (equivalent to `source: re-query`) on fallback re-query rows — bare / malformed lines, D.5/D.6 with `checks: absent | pending`, and the retain-the-re-check classes D.8, D.10, D.11. The four-column ledger format (`<issue-ref> · <transition-class> · <action> · <outcome>`) is preserved verbatim; the marker sits inside the outcome slot.

Example enriched-line rows (post-#437):

```
christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · advanced · source: enriched-line
christrudelpw/epic#44 · completed:validate · merge · merged (PR #46) · source: enriched-line
christrudelpw/epic#45 · completed:validate · merge · merged (PR #47)  ← fallback (checks was pending)
christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (4 issues)  ← D.8 retain-the-re-check, no marker
```

Post-mortem grep semantics: `grep 'source: enriched-line' <ledger>` isolates every enriched-line dispatch row; `grep -v 'source: enriched-line' <ledger>` isolates every re-query row (pre-#437 shape, retain-the-re-check classes, and merge-gate fallbacks).

**UI-mode extensions (Q5=B — `· source: ui-gate` / `· source: ui-gate-fallback`)**. Applies under `ResolvedGateMode === "ui"`; contract: `contracts/ledger-ui-mode.md`. Reference FR-005 for the "exactly one pointer line" rule below.

**Rule 1 — `cockpit_gate_open` (gate-open) is print-only** (per FR-005). On successful `cockpit_gate_open` the loop prints exactly one pointer line to the transcript, verbatim:

```
gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)
```

The pointer line has **NO `[ledger] ` prefix** and is **NOT appended to the persistent ledger file**. It is a UI affordance for the operator to find the gate in the inbox, not a dispatch record. Under Invariant #8's cost contract: local mode writes exactly one ledger line per gate dispatch AT RESOLUTION; UI mode does the same via D.12 at the answer. Symmetry preserved — gate-open is the operator affordance, D.12 is the mandatory-per-dispatch ledger row.

**Rule 2 — D.12 writes exactly one ledger line per resolved gate**, in the pre-change four-column format with `· source: ui-gate` appended in the outcome slot:

```
<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate
```

`<original-action>` matches the pre-change `<action>` vocabulary (`clarification-batch`, `review-analysis+advance`, `phase-queue-gate`, `escalation-gate`, `filing-gate+scope-add`, `scope-drained-gate`, etc.). `<outcome>` reuses pre-change vocabulary for the `applied` case (`advanced`, `queued P<next> (<N> issues)`, `manually validated`, `filed + queued (<new-ref>)`, `keep-watching`, etc.) OR the UI-specific outcomes for non-applied cases (`superseded (no record)`, `superseded (stale generation)`, `superseded (state advanced)`, `failed: <detail>`, `make-changes (re-opened g<n>)` on revised-draft re-open). G.5 rows carry `<epic-ref>` in the `<issue-ref>` slot (sole per-issue exception per § UI-mode gate mapping G.5). Grep recipes on stable `<action>` / `<outcome>` strings (e.g., `grep 'clarification-batch · advanced' <ledger>`) continue to work across the local ↔ UI transition — the recipe surface is preserved.

**Rule 3 — UI-mode fallback resolution suffix is `· source: ui-gate-fallback`** (distinct from `· source: ui-gate`). When `cockpit_gate_open` fails at call time and the local `AskUserQuestion` fires for that gate (per § UI-mode fallback on `cockpit_gate_open` call error), the resolution row uses the pre-change vocabulary with the `-fallback` suffix. The FIRST failure per run also writes a one-time note per § UI-mode fallback rule 5 — that note itself carries `· source: ui-gate` (NOT `-fallback`); the `-fallback` suffix is reserved for resolution rows.

**Rule 4 — Three-way provenance-suffix precedence** (mutually exclusive within a single row):

- `· source: enriched-line` — pre-existing (E6). Applied when the dispatch was driven by an enriched doorbell line (E2 = true AND the class is in the E3 "enriched line" column, including D.5/D.6 with decisive `checks`).
- `· source: ui-gate` — NEW (Q5=B). Applied to D.12 resolutions (both applied and superseded/failed cases) AND to the UI-mode fallback first-failure note.
- `· source: ui-gate-fallback` — NEW (Q5=B). Applied to resolutions that fell back to local `AskUserQuestion` after `cockpit_gate_open` failed.

A D.12 row could — via transport — arrive on the enriched doorbell line and thus qualify for `enriched-line`. The precedence rule pins `ui-gate` as the WIN: **D.12 rows use `· source: ui-gate` (or `ui-gate-fallback`) regardless of transport; `· source: enriched-line` applies only to non-D.12 rows driven by the enriched doorbell line.** Rationale: `ui-gate` carries more specific information (the resolution came through the remote inbox surface) than `enriched-line` (which merely says the transport was the enriched doorbell); the more-specific marker wins.

**Extended grep recipes** (post-#449):

- `grep 'source: ui-gate$' <ledger>` — all clean UI-mode resolutions (the `$` distinguishes from `ui-gate-fallback`).
- `grep 'source: ui-gate-fallback' <ledger>` — all UI-mode fallback resolutions (local `AskUserQuestion` after `cockpit_gate_open` failure).
- `grep 'source: enriched-line' <ledger>` — pre-existing enriched-line rows, unchanged.
- `grep -Ev 'source: (ui-gate|ui-gate-fallback|enriched-line)' <ledger>` — pre-change / re-query rows (no provenance suffix).

Example UI-mode rows (post-#449):

```
christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · advanced · source: ui-gate
christrudelpw/epic#44 · waiting-for:implementation-review · review-analysis+advance · approved · source: ui-gate
christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (4 issues) · source: ui-gate
christrudelpw/epic#45 · waiting-for:clarification · clarification-batch · advanced · source: ui-gate-fallback  ← cockpit_gate_open failed, resolved via local AskUserQuestion
christrudelpw/epic#43 · waiting-for:clarification · gate-open · error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate  ← one-time first-failure note
christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · superseded (stale generation) · source: ui-gate
```

### L.4 — Status table policy

The full epic status table (anchor: header row `| Issue | Phase | State |`) is emitted **only** at the following surfaces:

1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
3. **Escalation-gate presentations** (D.6 G.4a, D.7 G.4b, D.10 G.4c, D.11 G.4d) — the operator needs orientation before an escalation decision.
4. **Startup-sweep summary** (step 3) — session-start orientation is a real operator need; every resumed run starts with "where are things?". The sweep ends with exactly one full status table, then enters the main loop.
5. **Scope-drained gate G.7 presentation** — operator orientation before an exit decision in epic-less mode. Matches the escalation-gate rationale in surface 3.

Between phase boundaries, the ledger line is the sole record of a dispatch. No status table is emitted after D.1–D.5, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the five surfaces above.

### L.6 — Run summary at exit

On `epic-complete` exit (step 6), print a run summary paragraph and include the persistent ledger file's absolute path:

```text
Auto run complete.

Epic: <epic-ref> · Exited: epic-complete
Events dispatched: <N>
  · Clarification batches: <k1>
  · Review verdicts: <k2>
  · Manual-validation gates: <k3>
  · Phase-queue confirmations: <k4>
  · Merges: <k5> (<green>/<red>, <fixer runs>)
  · Escalations: <k6>
  · Cursor recoveries: <k7> (by class: invalid-cursor=<a>, resetFrom=<b>, expiry=<c>, discarded=<d>)
  · Cursor-recovery escalations: <k8> (continue-degraded=<x>, stop=<y>)
Scope growth: started with <N>, added <M>, completed <K>
Per-ref disposition:
  · <owner>/<repo>#<m1> · <completed | not-planned>
  · <owner>/<repo>#<m2> · <completed | not-planned>
  ...
Muted issues (session-local): <s>
Ledger file: <absolute path to .ledger file>
```

Counts are derived from the ledger file (or the in-memory count if the file is unavailable). Non-`epic-complete` exits (Stop from an escalation gate, pre-flight failure) print an abbreviated summary with the exit reason.

**`Scope growth:` line (unconditional)**. Emitted in every run summary, including runs with zero scope activity (e.g., an epic-less run closed at the initial G.7 without any adds still prints `Scope growth: started with 0, added 0, completed 0`).
- `started with N` — count of task-list refs at run start. Epic mode: count of synthetic events from step 3 startup sweep. Epic-less: count of task-list refs on the tracking issue at step 3.
- `added M` — count of `scope-add · queued` action lines PLUS count of `filing-gate+scope-add · filed + queued (…)` action lines. **Excludes** `filing-gate · skipped` outcomes and any `filing-gate+scope-add · error: …` outcomes.
- `completed K` — count of `merge · merged (…)` action lines PLUS any `epic-complete` action line for the tracking ref itself. Epic-less mode: count of task-list refs classified `completed | not-planned` per `cockpit_status` at exit time.

**`Per-ref disposition:` block (epic-less only)**. Emitted only under `invocationForm: tracking-existing | tracking-new`. Under epic mode the block is OMITTED entirely (the phase-based structure supplies the "who did what" reading; per-ref disposition would be noise). Ordering matches the tracking issue's task-list markdown; content is the same per-ref list the G.7 gate presented, reused verbatim so the summary and the gate cannot drift.

## Invariants

1. **Never merge on red.** `completed:validate` + green routes straight to `cockpit merge`; anything red routes through the bounded-fixer branch and, if still red, the escalation gate. The branch exits `0` only on `result: merged`.
2. **Cockpit comments marked.** Every comment the playbook posts to an issue or PR carries the `<!-- generacy-cockpit:… -->` prefix marker (e.g., `<!-- generacy-cockpit:clarification-answers -->`).
3. **Add-only advance.** `Skip` in every escalation gate is **session-local mute only** — labels are untouched, `cockpit advance` is never called with a fake-skip flag. A muted issue resurfaces in the next auto run's startup sweep.
4. **No cross-slash-command invocation** from `auto.md`. Cross-command composition is CLI verb (`generacy cockpit …`) + subagent boundary only. No `/cockpit:*`, `/code-review`, or `/speckit:*` invocation from the parent's execution path.
5. **Analysis in subagents** whose contracts end with the subagent — the #390 pattern. All four analysis workloads (clarification drafting, review verdict, manual-validation summary, bounded fixer) live inside `subagent_type: "general-purpose"` hops with strict-JSON returns.
6. **Autonomy *policy* out of scope.** Per-gate auto-approve and "full auto" mode are explicitly out of scope in v1. Every gate prompts; none auto-proceed.
7. **Stream consumption is unfiltered.** Every non-empty line from `generacy cockpit doorbell` is consumed by the parent — content-based filters over the stream (e.g., "only wake on lines matching `waiting-for:*`") are prohibited, because a filter could silently drop legitimate events. Enriched lines (JSON-parseable objects carrying `to` and `labels`) ARE parsed for dispatch inputs per the § Enriched-line dispatch contract; bare lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.
8. **Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose. Playbook edits that add per-event output — a `cockpit_status` re-check, an epic status table, a prose recap — on a ledger-only row are efficiency regressions.
9. **MCP-tool-only invariant.** After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form — every dispatch of the six migrated verbs (`status`, `context`, `queue`, `advance`, `resume`, `merge`) goes through its `cockpit_*` MCP tool. Playbook edits that reintroduce the Bash form are drift regressions.

## Examples

### Example 1 — End-to-end run on a synthetic 2-phase epic

Command: `/cockpit:auto christrudelpw/epic#42`

Run shape:

1. **Sensor arm-up** — step 2 spawns `generacy cockpit doorbell christrudelpw/epic#42` under harness `Monitor` (no ledger line — sensor arm-up is engine-owned).
2. **Startup sweep** — the parent verifies the required `cockpit_*` MCP tools are present — this run carries no `--gates` flag and resolves to `gates: local` (its gates present via `AskUserQuestion` below), so the required set is the seven baseline tools only; `cockpit_gate_status` / `cockpit_gate_list` are UI-mode-only and are not required here — then calls `cockpit_status(epic="christrudelpw/epic#42", json=true)` and finds P1 has three actionable children: `#43` in `waiting-for:clarification`, `#44` in `waiting-for:implementation-review`, `#45` in `waiting-for:manual-validation`. Each is dispatched in order.
2. **D.1 for #43** — clarification drafter subagent → fused batch gate with N=3 questions (`ceil(3/4) = 1` `AskUserQuestion` call in one response) → all approved → post + `cockpit_advance(issue="christrudelpw/epic#43", gate="clarification")`.
   - Ledger: `christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · advanced`.
3. **D.3 for #44** — review analyzer subagent (`gh pr diff` inside the subagent) → zero findings → fused verdict gate with `Suggested decision: approve` → operator selects `approve` → `cockpit_advance(issue="christrudelpw/epic#44", gate="implementation-review")`.
   - Ledger: `christrudelpw/epic#44 · waiting-for:implementation-review · review-analysis+advance · approved`.
4. **D.4 for #45** — manual-validation summarizer subagent → confirm gate (scenarios + acceptance_checks) → operator selects `manually validated` → `cockpit_advance(issue="christrudelpw/epic#45", gate="manual-validation")`.
   - Ledger: `christrudelpw/epic#45 · waiting-for:manual-validation · manual-validation-summary+advance · manually validated`.
5. **Main loop begins** — `cockpit_await_events` returns a batch containing `christrudelpw/epic#44 · completed:validate` (checks all green).
6. **D.5 for #44** — `cockpit_merge(issue="christrudelpw/epic#44")` → `result: merged` → PR #<n> merged (squash, branch delete).
   - Ledger: `christrudelpw/epic#44 · completed:validate · merge · merged (PR #46)`.
7. Similar for #43, #45.
8. **Quiet interval** — no watch line arrives for ~5 minutes while the phase's remaining CI runs. The C4 heartbeat fires; the drain returns zero events.
   - Ledger: `christrudelpw/epic#42 · heartbeat · schedule-wakeup · fired · drain empty`.
9. `cockpit_await_events` returns a batch containing `christrudelpw/epic#42 · phase-complete`.
9. **D.8 phase-queue confirmation** — presentation shows P2 with 4 issues → operator selects `Queue P2 (4 issues)` → `cockpit_queue(epic="christrudelpw/epic#42", phase="P2")`.
   - Ledger: `christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (4 issues)`.
10. P2 runs to completion the same way.
11. `cockpit_await_events` returns a batch containing `christrudelpw/epic#42 · epic-complete`.
12. **Exit** — parent prints the run summary per L.6 with the ledger file's absolute path, exits zero.

### Example 2 — Clarification batch gate with N=6 open questions

Trigger: D.1 for `christrudelpw/epic#43` with 6 open clarifications.

The subagent returns 6 drafted answers in one JSON array (`{question_id, recommendation, justification, provenance}` per entry). The parent parses `clarificationComment.body` for the per-question `{title, context, question, options}` and renders a five-element block per question:

```markdown
Drafted answers for christrudelpw/epic#43 (6 open questions):

### Q1 — What auth mode?
**Context:** The client needs to negotiate auth without a shared secret pre-provisioned.
**Question:** Which auth mode should the client default to?
**Options:** A — OAuth device flow, B — API key from environment, C — mTLS
**Recommendation:** A — OAuth device flow
**Why:** Device flow works in headless contexts and doesn't need a pre-shared secret. API key requires operator provisioning per install; mTLS demands certificate distribution.
_provenance: spec.md § Auth_

### Q2 — Timeout policy?
**Context:** ...
**Question:** ...
**Options:** ...
**Recommendation:** ...
**Why:** ...
_provenance: plan.md § Timeouts_

... (Q3 through Q6)
```

Then, **in the same assistant response**, **exactly one** `AskUserQuestion` call fires (never fanned out) with header `Clarify` and options `Approve all & post (Recommended)` / `Make changes` / `Skip this batch`.

Operator responses (illustrative): operator selects `Make changes` and types:

```
Q3: skip
Q5: B — because we validated this shape in the pilot
Q6: skip
```

The parser (§ Directive grammar) produces three directives — `{skip Q3}`, `{edit Q5, answer=<option-B text>, rationale="because we validated this shape in the pilot"}`, `{skip Q6}`. The parent re-presents only Q3, Q5, Q6 (Q3 marked skipped, Q5 with updated recommendation + rationale, Q6 marked skipped) plus the same three-option batch gate. Operator selects `Approve all & post`.

Post-gate: post the assembled comment with Q1/Q2/Q4/Q5 (4 answers, Q5 with the edited answer/rationale); do not advance (2 skipped).

Ledger: `christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · posted 4/6, skipped 2`.

### Example 3 — Validate-red with fixer that returns unfixed, followed by G.4a Retry

Trigger: `christrudelpw/epic#44` enters `completed:validate` with `checks_state: "red"` (one failing test in `packages/foo/tests/bar.test.ts`).

Flow:

1. **D.6** — classify checks (test failure, repo-owned CI class ✓), spawn bounded fixer subagent.
2. Fixer returns:
   ```json
   {"fixed": false, "summary": "attempted to fix bar.test.ts assertion; the underlying failure is a race between two callbacks that requires a design decision on ordering guarantees", "reason": "ambiguous root cause — design judgment required"}
   ```
3. Ledger: `christrudelpw/epic#44 · completed:validate:red · fixer · unfixed → escalation`.
4. **G.4a escalation gate** presentation:
   ```markdown
   Fixer could not resolve christrudelpw/epic#44 (PR christrudelpw/repo#46):

   attempted to fix bar.test.ts assertion; the underlying failure is a race between two callbacks that requires a design decision on ordering guarantees

   Reason (from fixer): ambiguous root cause — design judgment required

   Failing checks: test:bar
   ```
   Single `AskUserQuestion` with options `Retry (re-run fixer)` / `Skip (session-local mute)` / `Stop (exit auto)`.
5. Operator selects `Retry`. Fixer re-runs once (new dispatch, new ledger line).
6. Ledger: `christrudelpw/epic#44 · completed:validate:red · fixer+escalation-gate · retry`.

### Example 4 — `agent:error` with G.4b Requeue → `cockpit_resume`

Trigger: `christrudelpw/epic#47` enters `agent:error` (bot-authored alert comment posted with failure trace per #865's shape).

Flow:

1. **D.7** — fetch evidence via `cockpit_context(issue="christrudelpw/epic#47")`.
2. **G.4b escalation gate** presentation:
   ```markdown
   Agent error on christrudelpw/epic#47:

   Runner reported: process exited 137 after 90s (OOM). Retry may succeed on a fresh runner.
   ```
   Single `AskUserQuestion` with options `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`.
3. Operator selects `Requeue`.
4. Parent calls `cockpit_resume(issue="christrudelpw/epic#47")`.
5. Ledger: `christrudelpw/epic#47 · agent:error · escalation-gate · requeue (cockpit resume)`.

If `cockpit_resume` were not available (G-S8 didn't ship the tool, per Assumption A2), Requeue would degrade to Skip with an explicit ledger note: `christrudelpw/epic#47 · agent:error · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

### Example 5 — Epic-less stabilization run with G.6 filing gates and G.7 scope-drained exit

Command: `/cockpit:auto --tracking generacy-ai/agency#100`

Run shape (epic-less, `invocationForm: tracking-existing`):

1. **Startup** — step 1 prints `Tracking ref: generacy-ai/agency#100 · form: tracking-existing`; writes the same as the ledger header. Step 3 startup sweep reads the tracking issue's task list via `cockpit_status(issue="generacy-ai/agency#100", json=true)` and finds it empty (this is a fresh stabilization run). Main loop begins with zero synthetic events.
2. **Add-existing intent (mid-run)** — the operator types `also process generacy-ai/agency#420`. Parser (`parseAddExistingIntent`) returns `{ref: "generacy-ai/agency#420"}`. Session calls `cockpit_scope_add(scopeRoot="generacy-ai/agency#100", addRef="generacy-ai/agency#420")` then `cockpit_queue(issue="generacy-ai/agency#420")`. **No gate.**
   - Ledger: `generacy-ai/agency#420 · scope-add · queued`.
3. **File-new intent #1 (mid-run)** — the operator types `file an issue for the flaky test in module foo`. Parser (`parseFileNewIntent`) returns `{topic: "the flaky test in module foo"}`. Drafter subagent returns `{title, body, labels}`. G.6 fires with the five-element block. Operator selects `Approve & file`.
   - `gh issue create --title "..." --body-file /tmp/cockpit-auto-file-generacy-ai-agency-100-1720905600.md` returns `generacy-ai/agency#421`.
   - `cockpit_scope_add(scopeRoot="generacy-ai/agency#100", addRef="generacy-ai/agency#421")` succeeds; `cockpit_queue(issue="generacy-ai/agency#421")` succeeds.
   - Ledger: `generacy-ai/agency#421 · filing-gate+scope-add · filed + queued (generacy-ai/agency#421)`.
4. **File-new intent #2 skipped at G.6** — the operator types `open a bug for the retry-helper timeout`. Drafter returns a draft; G.6 fires; operator selects `Skip (don't file)` after reading the draft.
   - Ledger: `generacy-ai/agency#100 · filing-gate · skipped (draft discarded)` (the tracking ref sits in the left slot because no new ref was assigned).
5. **All three refs (from steps 2, 3, and one more via a subsequent add-existing) reach terminal** (mix of merges and `not-planned` closures). `cockpit_await_events` returns nothing more actionable; the parent detects scope-drain via `cockpit_status`'s classifier.
6. **G.7 fires (first drain)** — presentation shows `Refs processed: 3`, per-ref disposition `#420 · completed`, `#421 · completed`, `#422 · not-planned`. Operator selects `Keep watching`.
   - Ledger: `generacy-ai/agency#100 · scope-drained · scope-drained-gate · keep-watching`.
7. Loop resumes; the operator does no further adds. `cockpit_await_events` returns no events on the tracking ref for several iterations. `cockpit_status` still reports every ref terminal → **G.7 fires again**.
8. **G.7 (second drain)** — operator selects `Finish (close tracking issue + summary)`.
   - Ledger: `generacy-ai/agency#100 · scope-drained · scope-drained-gate · finish (tracking closed)` (written BEFORE the close so the run summary can read it).
   - `gh issue close generacy-ai/agency#100` succeeds.
   - Run summary per § L.6 with `Scope growth: started with 0, added 3, completed 3` and the per-ref disposition block:
     ```text
     Per-ref disposition:
       · generacy-ai/agency#420 · completed
       · generacy-ai/agency#421 · completed
       · generacy-ai/agency#422 · not-planned
     ```
   - Exit zero.

<!-- BEGIN error-conv -->
**Error handling** — When a Bash CLI exit code is non-zero (or a pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class. This block covers the remaining Bash CLI invocations (`gh` for issue comment posting; `git` for local ledger writes). Cockpit MCP tool typed errors surface at their call sites (`code`/`message`/`details` structured fields), not through this regex classifier — the tool-presence check in step 3 handles tool absence with its own load-bearing ledger line.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight for a required Bash CLI (`gh` for issue comment posting, `git` for local ledger writes) returned non-zero. Print: `A required CLI (\`gh\`, \`git\`) is required but is not on $PATH. In a Generacy cluster session common CLIs are already installed — add them to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install the specific CLI via your platform's package manager.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The required CLI needs GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->
