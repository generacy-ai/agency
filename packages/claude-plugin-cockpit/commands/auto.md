---
description: Drive one or more issues — an epic, a tracking-issue scope, or an ad-hoc issue list — to terminal by dispatching Monitor-delivered wake-ups through cockpit_await_events with fused human gates
arguments:
  - name: tracking-ref
    description: "Tracking reference — one of: <epic-ref> positional (`owner/repo#N`), `--tracking <issue-ref>`, `--new \"<title>\"`, or an <issue-list> of one or more comma/whitespace-separated refs (bare `N` resolves against the workspace repo, or qualified `owner/repo#N`). Exactly one form per invocation."
    required: true
---

# Auto Command

Drive the named tracking ref (an epic, an existing tracking issue, or a newly filed tracking issue) to terminal state by dispatching Monitor-delivered wake-ups through `cockpit_await_events` and routing to the six existing assist commands' *actions* (MCP tool calls + subagent hops), never the assist commands themselves. The loop shape is: **pre-flight (incl. `Monitor` presence check) → arm `generacy cockpit doorbell <epic-ref>` under harness `Monitor` (sensor) → startup sweep (tool-presence check + synthetic-event dispatch) → per wake (Monitor line OR ScheduleWakeup heartbeat fire): drain typed batch via `cockpit_await_events(epic|issue, cursor, maxWaitMs=1, coalesceWindowMs=3000)` → consume batch in stream order → per event: re-check live state → dispatch → write one ledger line → advance in-memory cursor → arm next heartbeat → wait for next wake → exit on terminal state (`epic-complete` in epic mode, G.7 scope-drained `Finish` in epic-less mode).** Two hard boundaries are load-bearing: **never merge on red** (anything red is **engine-owned** — `completed:validate` red is a ledger-only no-op that re-fires as an engine gate; `auto` runs no cluster-side fixer branch) and **every gate prompts** (per-gate auto-approve / "full auto" is explicitly out of scope). Analysis lives in named subagents (`cockpit-clarifier`, `cockpit-reviewer`, `cockpit-validator`, `cockpit-diagnoser` — model/effort per role configurable via the `cockpit.auto.agents` block, see § step 1 run-config load) returning strict JSON per hop; the parent loop stays thin.

## User Input

```text
$ARGUMENTS
```

## Instructions

1. **Parse arguments + pre-flight.** Recognize exactly one of four invocation forms per invocation — the tracking ref is the run's identity under all four forms:

   - **Form 1 (epic mode)**: `/cockpit:auto <epic-ref>` — one positional matching `<owner>/<repo>#<n>`. `invocationForm: epic`. D.8 phase-queue gate fires on `phase-complete`; run exits on `epic-complete`.
   - **Form 2 (epic-less: existing tracking)**: `/cockpit:auto --tracking <issue-ref>` — `--tracking` flag with one positional matching `<owner>/<repo>#<n>`. `invocationForm: tracking-existing`. G.7 scope-drained gate fires when every task-list ref is terminal per `cockpit_status`.
   - **Form 3 (epic-less: new tracking)**: `/cockpit:auto --new "<title>"` — `--new` flag with one quoted free-text title. `invocationForm: tracking-new`. **G.6 filing gate fires immediately** (drafts title/body from the operator-supplied `<title>`; on `Approve & file`, `gh issue create` produces the tracking ref; on `Skip (don't file)`, the run exits cleanly). Subsequent behavior identical to Form 2.
   - **Form 4 (epic-less: issue-number list)**: `/cockpit:auto <issue-list>` — one or more comma/whitespace-separated GitHub issue references (bare integers resolve against the workspace repo, or qualified `owner/repo#N`; mix freely). `invocationForm: tracking-list` on fresh creation; `tracking-existing` when an open `cockpit:tracking` issue in the workspace repo has the identical resolved ref-set. Form 4 machine-generates the tracking issue's title, body, and label — no G.6 gate — then falls through to Form 2's loop shape. See § Form 4 branch below.

   **`--gates=<value>` (orthogonal flag; V1 parse)**. Accepted alongside any of Forms 1–4. Values: exactly one of `ui` / `local` / `auto`. Default when absent: `auto`. Parsed exactly once at step-1 pre-flight; a duplicate `--gates=*` in the argument stream → usage error with reason `gates-duplicate`; a value outside `{ui, local, auto}` → usage error with reason `gates-value-invalid (<observed>)`. Both errors exit via the ambiguity-table usage-error pattern below. Semantics per resolved value: `--gates=local` preserves today's byte-path exactly (no `cockpit_gate_open` calls, no `openGates` map, no D.12 dispatch, no `· source: ui-gate` ledger suffix); `--gates=ui` forces UI mode (see § UI-mode gate mapping) and hard-fails at pre-flight if any of `cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` is absent from the session's MCP tool binding; `--gates=auto` resolves per the three-part check below (`cockpit_gate_open` AND `cockpit_gate_status` AND `cockpit_gate_list` ALL bound AND cluster cloud-activated AND pre-flight functional probe pass → `ui`; else `local`), decided ONCE per run (items 1–2 at parse-time pre-flight; item 3 after the ledger header write) and does not flip mid-loop.

   **Ambiguity table**:

   | Input pattern | Form | Notes |
   |---------------|------|-------|
   | One positional matching `<owner>/<repo>#<n>` and no flags | 1 (epic) | Qualified single ref keeps epic-mode meaning. |
   | `--tracking <owner>/<repo>#<n>` | 2 | |
   | `--new "<title>"` | 3 | |
   | Any other non-flag positional stream (bare numbers, mixed lists, multiple qualified refs, single bare number) | **4** | |
   | Both `--tracking` and `--new` present | usage error | Reason `both-flags`. |
   | A flag combined with a positional list | usage error | Reason `tracking-arg-shape` / `new-arg-shape`. |
   | Unknown `--*` flag (e.g. `--tracing`) | usage error | Reason `unknown-flag`. Do NOT guess intent. `--gates=<value>` and `--quiet` are recognized, not unknown. |
   | Zero non-empty tokens after splitting | usage error | Reason `empty`. |
   | `--gates=<value>` where `<value>` ∉ `{ui, local, auto}` | usage error | Reason `gates-value-invalid (<observed>)`. |
   | Multiple `--gates=*` flags | usage error | Reason `gates-duplicate`. |
   | Multiple `--quiet` flags | usage error | Reason `quiet-duplicate`. |

   On any usage error, print the two-line usage string verbatim and exit non-zero — optionally followed by a `Reason: <reason> (<detail>)` line naming the ambiguity-table row:

   ```
   Usage: /cockpit:auto <epic-ref> | --tracking <issue-ref> | --new "<title>" | <issue-list>
          [--gates=ui|local|auto]  (default: auto)
   ```

   ### `--gates` resolution and pre-flight absence

   Resolution runs in **two phases**, the ledger header write being the dividing line: items 1 and 2 of the `--gates=auto` three-part check plus the `--gates=ui` pre-flight absence check are evaluated at parse time, BEFORE ledger directory creation, the ledger header write, F4.1, or the `cockpit_*` tool-presence check (step 3 startup sweep — seven baseline tools always, plus `cockpit_gate_status` / `cockpit_gate_list` only under `ResolvedGateMode === "ui"`). Item 3 (the functional probe) is DEFERRED and fires AFTER the ledger header line is written (Forms 1/2: after the step-1 header write; Form 3: after G.6 approval writes the header; Form 4: after F4.7) — the probe writes a ledger row on both pass and fail, and a ledger row requires the header to already exist as the first line of the ledger file.

   **`--gates=auto` resolution (three-part check, decided ONCE)**. When the parsed value is `auto`, resolve `ResolvedGateMode` via a three-part check — items 1 and 2 at parse-time pre-flight, item 3 deferred until AFTER the ledger header is written:

   1. **Tool binding**: Are `cockpit_gate_open`, `cockpit_gate_status`, AND `cockpit_gate_list` ALL present in the session's MCP tool binding? (same shape as the `cockpit_*` tool-presence check at step 3 below under `ResolvedGateMode === "ui"`. All three are required — requiring only `cockpit_gate_open` would let item 3 invoke an unbound `cockpit_gate_list` on a partial-deployment cluster.)
   2. **Cluster cloud-activation**: Is the cluster cloud-activated? (Queried via the doorbell handshake or a startup field returned by `cockpit_context`.)
   3. **Pre-flight functional probe**: Does the gate-query surface actually WORK? Issue exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call and treat any `status: 'error'` return as failure (details per § Pre-flight probe (UI mode) below). **Short-circuit rule (load-bearing)**: issue item 3 ONLY when items 1 AND 2 both pass; otherwise resolve to `local` with NO probe call and NO probe ledger row — `--gates=auto` → `local` is byte-identical to explicit `--gates=local`, which never calls `cockpit_gate_list`.

   If items 1 AND 2 AND 3 all pass → `ResolvedGateMode = ui`. If item 3 alone fails (items 1–2 both passed) → `ResolvedGateMode = local` with the `probe-failed` resolution reason (fail ledger row written after the header) — EXCEPT when a remote UI gate has already been consumed in the TENTATIVE window (see § TENTATIVE window gate-presentation rule below), in which case the run hard-fails with resolution reason `probe-failed-after-remote-gate-consumed` and does NOT downgrade. If EITHER of items 1–2 is NO → `ResolvedGateMode = local` (byte-identical to explicit `--gates=local`; no probe issued, no probe ledger row). The resolution is decided ONCE per run — between the two decision points it is TENTATIVE (`ui pending probe` when items 1–2 both YES; `local` otherwise), but it does not flip mid-loop. When `--gates=ui` is explicit, this three-part check is skipped and `ResolvedGateMode = ui` unconditionally (the absence check below covers parse-time tool-binding failure; the probe still fires post-header and hard-fails the run on any error).

   ### TENTATIVE window gate-presentation rule

   Any gate that fires between the parse-time decision (items 1–2) and the post-header probe (item 3) presents under the TENTATIVE mode — UI (per § UI-mode gate mapping) when items 1–2 both YES, LOCAL (per § Gate contract) when either failed. Under current sequencing, **ONLY Form 3's G.6 filing gate** (fires immediately at step 1, before the tracking ref — and therefore the probe — can exist) fires in this window; Forms 1/2 bind the identity ref at parse time (the probe runs before any gate can fire) and Form 4 has no gate before F4.7 (the probe fires immediately after F4.7, still before any gate).

   **Form 3 hard-fail path (`--gates=auto`, items 1–2 both YES → TENTATIVE UI)**: G.6 opens remotely via `cockpit_gate_open`; on `Approve & file` the header is written and the probe fires. If the probe fails, do **NOT** downgrade to `local` — the remote UI gate has already been consumed; hard-fail on the same terms as an explicit `--gates=ui` probe failure per § Pre-flight probe (UI mode) → Fail path, with resolution reason `probe-failed-after-remote-gate-consumed` (distinct from the plain `probe-failed` used on the downgrade path). The `Auto run starting …` line is NOT emitted. If G.6 was `Skip (don't file)`, no remote gate was consumed and no header exists — Form 3 exits cleanly at G.6 skip regardless of gate mode.

   **Form 3 downgrade path remains available in exactly one case**: `--gates=auto` where item 1 OR item 2 failed at parse time → TENTATIVE LOCAL — G.6 presents locally (per § Gate contract), no remote gate is ever consumed, the probe is not issued (short-circuit rule above), and `ResolvedGateMode = local` finalizes with the standard `ui-mode tools unbound` / `cluster not cloud-activated` reason — byte-identical to explicit `--gates=local`.

   **`--gates=ui` pre-flight absence (Q3=A — hard-fail, matching the step-3 `cockpit_*` tool-presence check's `Print + exit` precedent)**. When the parsed value is `ui` (explicit) AND any of `cockpit_gate_open`, `cockpit_gate_status`, or `cockpit_gate_list` is absent from the session's MCP tool binding at this pre-flight point, print the verbatim error string and exit non-zero (all three required so the probe cannot later invoke an unbound `cockpit_gate_list`):

   ```
   --gates=ui specified but one or more of cockpit_gate_open / cockpit_gate_status / cockpit_gate_list is not available in this session; re-invoke with --gates=local or --gates=auto
   ```

   Exit non-zero. Do **NOT** create the ledger directory (`mkdir -p .generacy/cockpit/auto-runs`). Do **NOT** write the ledger header line. Do **NOT** emit the `Auto run starting …` line. Under `--gates=auto` the same tool-binding absence resolves silently to `local` (per the three-part check above); the hard-fail is specific to explicit `ui`. Distinct from US4 fallback: absence at pre-flight is a static session property (hard-fail); `cockpit_gate_open` **error at call time** is transient and covered by § UI-mode fallback on `cockpit_gate_open` call error.

   **`--gates=ui` pre-flight functional probe (post-tool-binding, post-identity-ref, post-header-write)**. When the parsed value is `ui` (explicit) AND the three-tool absence check above passed AND the identity ref is bound (Forms 1/2 at step-1 parse time; Form 3 after G.6 approval; Form 4 after F4.6 fresh creation OR F4.4 reuse — see § Form 4 sequencing rule below) AND the ledger header has been written, issue the pre-flight probe per § Pre-flight probe (UI mode) below. **Hard-fail on ANY probe error** (any `class` from the four-class taxonomy): write the probe's fail ledger row, print the operator-facing line, and exit non-zero. Do NOT start the loop. Do NOT fall back to `local`.

   ### Pre-flight probe (UI mode)

   The pre-flight functional probe issues **exactly one** read-only `cockpit_gate_list` call to verify that the gate-query surface actually WORKS (not just that its tools are BOUND). Fires from exactly ONE call site — this pre-flight step, after the run's ledger header write (per § `--gates` resolution and pre-flight absence above) — under both explicit `--gates=ui` (additional assertion after the three-tool absence check) AND `--gates=auto` item 3 (short-circuit rule above governs issuance). Under `--gates=local` paths the probe never fires — see § No probe under `--gates=local` below. The probe is issued AT MOST ONCE per run — no per-event re-probing (FR-010); the per-event pre-draft gate-status check (§ Pre-draft check — shared rules; § Dispatch step 0) is a distinct concern that consumes the same tools with the same error taxonomy.

   **Call shape** — exactly one MCP call, using the identity ref bound above AND the pre-flight-derived `runId` (per § Pre-flight `runId` derivation above). The `runId` field is passed here — this is the SOLE `cockpit_gate_list` call in the run that carries `runId` (functional `cockpit_gate_list` calls never carry it, per FR-011 / R4). Safe: the handler (generacy#1067 commit `82077f1a`) drops the field before the cloud call.

   ```
   cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted>, runId: <runId> })
   ```

   The identity ref is the value written into the ledger header's `Tracking ref:` field — under Form 1 the epic ref, under Forms 2/3/4 the `trackingRef`. `gateType` is OPTIONAL; omitting it returns every non-terminal gate for the identity ref across all gateTypes. Empty `gates: []` on a fresh identity ref is a pass — the probe verifies the surface enumerates at all. `cockpit_gate_status` is NOT called by the probe.

   **`runId` capability outcome — `runIdEnabled` decided ONCE here, whole-session, MUST NOT flip mid-run (V5 / FR-012).** The probe's return decides `runIdEnabled` for the entire session and stores it on the § In-memory loop state additions block. Every downstream reference site reads that stored value verbatim; NO mid-run re-check fires; a mid-run gate verb returning `invalid-args` on `runId` does NOT downgrade — that would produce a mixed-identity run (reverting the read side after sweep opens would orphan sweep-opened 4-segment gates). Classification of the probe return:

   - **`{ status: 'ok', data: … }`** → `runIdEnabled := true`; write the pass ledger row and continue exactly as today.
   - **`{ status: 'error', class: 'invalid-args', … }`** → **`runIdEnabled := false` (graceful degradation, NOT a probe failure).** The cluster's cockpit MCP server does NOT accept `runId` on `cockpit_gate_list` (a pre-#1067 `.strict()` schema rejects the field) — the surface WORKS; the capability is ABSENT. Write the PASS ledger row (not the fail row — the surface is healthy), then log the startup warning verbatim (below) and continue the run under today's 3-input identity.
   - **Every other error class (`query-unreachable`, `internal`, `transport`, or an unrecognized class token)** → retain today's routing verbatim: explicit `--gates=ui` hard-fails the run; `--gates=auto` (items 1–2 both YES) resolves to `local` with `<resolution reason> = probe-failed`; Form-3 TENTATIVE UI window hard-fails with `probe-failed-after-remote-gate-consumed`. `runIdEnabled` is NOT set (the `local` downgrade paths default it to `false` via § In-memory loop state additions below).

   **Startup warning (verbatim, load-bearing — fires on the `invalid-args` graceful-degradation branch only, per FR-012):**

   ```
   runId threading disabled for this session — cluster's cockpit MCP server does not accept runId on cockpit_gate_list (pre-generacy#1067). Run continues under today's 3-input gate identity; generacy#1053 (re-run terminal gates) will not be fixed for this session. Upgrade the cluster's generacy build to ≥ commit 82077f1a to enable runId threading.
   ```

   The warning is printed to the transcript (no `[ledger] ` prefix) and is NOT appended to the ledger file.

   **Cross-schema inference.** All four gate schemas (list, status, open, ack) gained `runId` in the same commit `82077f1a`, so a cluster whose list schema accepts `runId` also accepts it on open, ack, and status; a future deployment that splits them breaks this assumption.

   **Pass path** (`{ status: 'ok', data: { gates: [...], truncated?: ... } }`) — write exactly one ledger row (verbatim shape):

   ```
   <identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe
   ```

   Then proceed to § step 3 (explicit `--gates=ui` → `ResolvedGateMode = "ui"`; under `--gates=auto`, item 3's pass finalizes `ResolvedGateMode = "ui"`). The FR-005 "one pointer line" is NOT printed for a passing probe — the observable output on the pass path is one ledger row.

   **Fail path** (`{ status: 'error', class, detail }` for any of the four classes `query-unreachable` / `invalid-args` / `internal` / `transport`) — regardless of which mode invoked the probe. The header has already been written BEFORE the probe fires, so the fail row is appended after it (header-first invariant preserved):

   1. Write the fail ledger row (verbatim shape) — appended after the header:
      ```
      <identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe
      ```
      **Exceptional outcome shape (Form-3 TENTATIVE UI window, per clause 4 below)** — when a remote UI gate has already been consumed in the TENTATIVE window, the fail row's outcome slot is augmented in-place by folding an `(aborted: probe-failed-after-remote-gate-consumed)` marker between `<detail>` and the ` · source:` suffix — NO additional row is written, so the "at most one probe row is written per run" invariant stays true. The augmented shape (verbatim):
      ```
      <identity-ref> · preflight · gate-query-probe · error: <class> — <detail> (aborted: probe-failed-after-remote-gate-consumed) · source: ui-gate-probe
      ```
   2. Print the operator-facing line — a single frozen template with `<class>` / `<detail>` placeholders shared by all four classes:
      ```
      gate-query surface unavailable (class: <class>): <detail> — re-run with --gates=local, or fix the cluster/cloud gate-query deployment
      ```
      `<detail>` is the tool's `detail` field verbatim. The em-dash (`—`, U+2014) between `<detail>` and `re-run with…` is intentional; no trailing period.
   3. **Under explicit `--gates=ui`** → exit non-zero. Do NOT start the loop. Do NOT fall back to `local`. The ledger directory + header + fail row remain on disk as the audit record of the aborted run; NO `Auto run starting` line is emitted.
   4. **Under `--gates=auto`** → resolve to `local` with `<resolution reason> = probe-failed` — the fail ledger row has already been written with the STANDARD outcome shape; emit `Auto run starting · gates: local (source: --gates=auto → probe-failed)` immediately after the fail row and proceed through § step 3 in `local` mode. **Exception (Form 3, TENTATIVE UI window)** — when a remote UI gate has already been consumed (per § TENTATIVE window gate-presentation rule above): do NOT downgrade to `local`. Write the fail row using the **augmented outcome shape** from step 1 (no additional row), then exit non-zero on the same terms as clause 3 — do NOT start the loop, do NOT emit the `Auto run starting` line, do NOT fall back to `local`. The consumed remote G.6 answer remains on disk; resume later with `--tracking <ref>` against the just-filed ref once the gate-query surface is fixed.

   **Form 4 sequencing rule (load-bearing)**. Under Form 4 the probe fires AFTER F4.6/F4.4 has bound `trackingRef` AND AFTER F4.7 has written the ledger header, NOT alongside items 1–2 of the `--gates=auto` three-part check at step-1 parse time — the identity ref is a required probe input and the header is required for the probe's pass/fail row to be appendable. Items 1–2 are evaluated at step-1 parse time as usual; item 3 is DEFERRED until F4.7 completes (short-circuit rule still applies — if items 1–2 already decided `local`, item 3 is not issued). Under explicit `--gates=ui` under Form 4 the probe likewise fires after F4.7.

   **No probe under `--gates=local`** (invariant). Under `--gates=local` (explicit) OR `--gates=auto` short-circuited to `local` (items 1 or 2 failed), NO probe is issued AND NO probe ledger row is written. The two query tools (`cockpit_gate_status`, `cockpit_gate_list`) are not required under `local` per the § step-3 conditional tool-presence check; a `local` run MUST NOT call — and MUST NOT fail on — a tool it never uses. The `--gates=auto` → `local` short-circuit path is byte-identical to explicit `--gates=local`; any pin that would produce a probe ledger row on the short-circuit path is a regression.

   **Timeout budget**. No new skill-side timer. The probe inherits the query-client's `timeoutMs` (default 5000ms per attempt) × `QUERY_RETRY_SCHEDULE` (3 attempts + ~5s backoff, ~20s worst case). A timeout maps to the existing `query-unreachable` class via `fetchOnce` → `QueryTransportError` → `withRetry` exhaustion. No new class in the taxonomy, no dedicated `probe-timeout` special-case.

   ### Form 4 branch — parse, resolve, validate, reuse, create

   Runs at the top of pre-flight, BEFORE the `Monitor`-presence check (below) and BEFORE any ledger directory creation. All state-changing actions (`gh label create`, `gh issue create`, `mkdir -p .generacy/cockpit/auto-runs`, ledger header write) fire ONLY after parse + workspace-resolve + ref-validate + reuse-detect all succeed.

   **F4.1 — Workspace repo inference (R1).** Run `git remote get-url origin` via Bash in the operator's cwd; capture stdout/stderr and exit code. MUST run in the operator's Claude Code session — the cockpit MCP server's orchestrator-container cwd is meaningless for workspace inference.

   - On non-zero exit (not a git repo, or `origin` unset), print + exit:
     ```
     /cockpit:auto Form 4 needs a workspace with a GitHub `origin` to resolve bare issue numbers.
     Observed: `git remote get-url origin` failed with: <stderr>
     ```
   - On zero exit, parse the URL against the three GitHub remote shapes (HTTPS `https://github.com/<owner>/<repo>(.git)?`, SSH shorthand `git@github.com:<owner>/<repo>(.git)?`, SSH long form `ssh://git@github.com/<owner>/<repo>(.git)?`). On no match, print + exit:
     ```
     /cockpit:auto Form 4 needs a workspace whose `origin` is a GitHub repo. Observed: <originUrl>.
     ```

   **F4.2 — Token resolution + dedup (Q3=A, Q5=A).** Split `$ARGUMENTS` on commas + whitespace (`split(/[,\s]+/).filter(t => t.length > 0)`) — empty tokens discard silently. Bare integer (`^\d+$`) → `{owner: workspace.owner, repo: workspace.repo, number, supplied: "bare"}`; qualified `owner/repo#N` → parse the three groups directly. Dedup the resulting `QualifiedRef[]` in first-seen order using `(owner, repo, number)` tuple equality — a bare `512` and a qualified `<workspace>/<repo>#512` collapse to one entry.

   **F4.3 — Up-front ref validation (Q4=A).** For each resolved ref, probe via `gh api -X GET repos/<owner>/<repo>/issues/<number> --silent --include`. Success codes: `200`, `301`. Any other status → collect into `bad[]`. Probes run sequentially (never parallel). Do NOT short-circuit on the first miss; probe every ref, then decide. On `bad.length > 0`, print the aggregated diagnostic and exit — atomic (create nothing):

   ```
   Cannot create tracking issue — the following refs are missing or inaccessible:

     - <owner>/<repo>#<n>   (<reason>)
     - <owner>/<repo>#<n>   (<reason>)
     ...

   Fix or remove these refs and re-run.
   ```

   **F4.4 — Reuse detection (Q2=B).** Query workspace-scoped open tracking issues: `gh issue list --repo <workspace.owner>/<workspace.repo> --label cockpit:tracking --state open --json number,body,createdAt`. If the query itself fails (network, auth, 5xx), do NOT fall through to creation — print + exit with the "connectivity" diagnostic and suggest `--tracking <ref>` as the bypass. Otherwise, for each candidate, parse `- [ ] <owner>/<repo>#<n>` lines from its body (regex `^\s*- \[ \] ([\w.-]+)\/([\w.-]+)#(\d+)\s*$`, case-sensitive, whitespace-tolerant leading, other bullet shapes ignored). Compare candidate's parsed body-refs against this invocation's resolved ref-set as an order-agnostic set on `(owner, repo, number)`.

   - **Set-match (identical)** → **reuse**. Print the reuse notice BEFORE the standard startup line:
     ```
     Resuming existing tracking session <owner>/<repo>#<n> (opened <YYYY-MM-DD HH:MM UTC>) — ref-set matches this invocation exactly.
     ```
     Bind `trackingRef = <owner>/<repo>#<n>`, `invocationForm = tracking-existing`. Skip F4.5–F4.6. Emit the ledger header `Tracking ref: <owner>/<repo>#<n> · form: tracking-existing · resumed: <YYYY-MM-DD HH:MM UTC>` (the `· resumed:` suffix distinguishes reuse from first-time Form 2) and fall through to F4.7.
   - **No match / overlap-only** → proceed to F4.5. Overlapping-but-not-identical ref-sets do NOT trigger reuse or refusal — create a fresh tracking issue.
   - **Multiple identical matches** (defence-in-depth) → log the warning and reuse the oldest by `createdAt`.

   **F4.5 — Label idempotency (R6).** Before `gh issue create`, ensure the `cockpit:tracking` label exists in the workspace repo:
   ```
   gh label create cockpit:tracking --color cccccc --description "Auto-created tracking issue for /cockpit:auto" --repo <workspace.owner>/<workspace.repo>
   ```
   Swallow the `label already exists` failure (idempotent success). Any other failure → print + exit.

   **F4.6 — Fresh tracking-issue creation (Q1=A, R5, R7, R8).** Machine-generate `TrackingIssueSeed`:
   - **Title**: `Tracking: auto session <YYYY-MM-DD UTC> — <ref1> <ref2> ... <ref5> (+K more)`. Refs render short-form (`#N`) when workspace-local; qualified (`owner/repo#N`) otherwise. ` (+K more)` suffix appears only when `refs.length > 5`.
   - **Body**: flat markdown task list, one `- [ ] <owner>/<repo>#<number>` line per resolved ref (always fully-qualified — the engine's resolver rejects bare `#N` in bodies). No blank lines, no headings, no `## Ad-hoc` section.
   - **Label**: `cockpit:tracking` (from F4.5).

   Write the body to `/tmp/cockpit-auto-form4-<workspace-slug>-<unix_ts>.md`, then reuse Form 3's `gh issue create` shape (§ File-new path step 4 below):
   ```
   gh issue create --repo <workspace.owner>/<workspace.repo> --title "<title>" --body-file <tmpfile> --label cockpit:tracking
   ```
   Use `--body-file` exclusively (never `-b` / `--body`; shell quoting can strip newlines and mangle bullets). Capture the new ref from the returned URL; bind `trackingRef` and `invocationForm = tracking-list`. On non-zero exit → print + exit with the `gh issue create` stderr. Do NOT retry.

   **F4.7 — Ledger header + fall-through (R8).** Emit the ledger header line as the FIRST line of the ledger file:
   - Fresh creation path (F4.6 succeeded): `Tracking ref: <new-ref> · form: tracking-list` — `tracking-list` is the fourth `form:` value (alongside `epic`, `tracking-existing`, `tracking-new`).
   - Reuse path (F4.4 hit): `Tracking ref: <existing-ref> · form: tracking-existing · resumed: <YYYY-MM-DD HH:MM UTC>` (already emitted at F4.4).

   Then fall through to the standard startup line (below) and step 3's startup sweep. From this point on, Form 4 is byte-identical to a Form 2 invocation against `trackingRef` — no new gate, no new dispatch class, no new cursor behavior. Every Form-4 failure mode above is `Print + exit`.

   **Print startup line** naming the tracking ref (verbatim `owner/repo#n`) and the resolved `invocationForm`; under Form 3, the startup line prints after G.6 approval; under Form 4, after F4.6 (fresh creation) or after the reuse notice (F4.4 hit), once `trackingRef` is bound.

   Pre-flight: **first**, check whether the harness `Monitor` tool is bound in the current session's tool binding. If `Monitor` is absent, print verbatim:

   ```
   Monitor tool is required for /cockpit:auto but is not available in this harness. Upgrade Claude Code, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
   ```

   Then exit non-zero. Do **NOT** create the ledger directory. Do **NOT** write a ledger line. The check is presence-only; do not attempt to distinguish "absent" from "present-but-broken" — an actually-broken `Monitor` surfaces as a spawn failure at step 2 and degrades to the C4 heartbeat-only recovery path (Q3=A — skill stays passive on doorbell-transport death). This `Monitor`-presence check MUST run before every other pre-flight check (before `command -v generacy`, before ledger-directory creation, before any state-changing tool call).

   On presence, fall through: `command -v generacy` (on failure → **Error handling** class `MISSING_BINARY`).

   **Next**, probe for the engine doorbell surface with `generacy cockpit help doorbell >/dev/null 2>&1`. If the probe exits non-zero (the current `generacy` build doesn't ship the `doorbell` subcommand), print verbatim:

   ```
   Engine doorbell surface not available. /cockpit:auto needs a generacy build that ships `generacy cockpit doorbell` (generacy#974). Upgrade the cluster's generacy build, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
   ```

   Then exit non-zero. Do **NOT** create the ledger directory. Do **NOT** write a ledger line. Do **NOT** fall back to spawning `generacy cockpit watch`.

   **Then**, optionally echo the engine version for operator context (**advisory only** — FR-001, Q1=D). Run `generacy --version` (`generacy` exposes `.version(VERSION)` — the same CLI `auto` already invokes; no new MCP field) and echo the emitted string in the startup context. This echo is **informational only**: it MUST NOT exit non-zero on the version value and MUST NOT gate the run. Version cannot distinguish a compatible engine from an incompatible one — npm stable `0.10.2` is pre-#1120, while the builds that actually ship epic generacy-ai/generacy#1120's post-validate `implementation-review` gate move report versions *below* it (preview `0.0.0-preview-*`, source `0.1.1`), and a stock #1120-bearing engine with `reviewPhaseEnabled` / `ciMergeGateEnabled` off still fires the gate pre-validate. The **authoritative** compatibility signal is therefore the runtime gate-placement observation at § D.3 (does `waiting-for:implementation-review` co-occur with `completed:validate`?), not this echo. No engine surface reports the gate model at pre-flight (`generacy cockpit --help` exposes only watch/doorbell/status/advance/context/merge/queue/resume/scope/mcp), so a missing or unparseable `generacy --version` here is **not** fatal — the run proceeds and defers to the runtime signal.

   New-engine + old-`auto` skew remains inert by construction: an old `auto` lacks the D.13 / G.8 / G.9 rows, so the engine's new gates fall through to the D.10 unknown-state escalation — a visible escalation, not a silent strand — so no guard is needed for that direction.

   Continue: `gh auth status` (on failure → **Error handling** class `AUTH_FAILURE`); confirm the operator's cwd is a writable git repo; create the ledger directory with `mkdir -p .generacy/cockpit/auto-runs` (on failure → **Error handling** class `OTHER`). Compute the run's ledger filename: `.generacy/cockpit/auto-runs/<tracking-ref-slug>-<timestamp>.ledger`, where `<tracking-ref-slug>` is the tracking reference with `/` replaced by `-` and `#` stripped, and `<timestamp>` is `YYYYMMDD-HHMMSS` in the operator's local time captured now.

   **Pre-flight `runId` derivation (load-bearing, per #469 / FR-001).** Immediately after the ledger filename is computed above, derive the run's `runId` from the SAME components used for the ledger filename stem. This step MUST run before any gate verb fires — before the § Pre-flight probe (UI mode) below, before the § step 3 startup sweep opens any gate, and before any drafting D.n dispatch.

   ```
   runId := <tracking-ref-slug>-<timestamp>
   ```

   The value is the full ledger filename stem VERBATIM — the same `<tracking-ref-slug>-<timestamp>` composition the ledger filename uses, WITHOUT the `.ledger` suffix (the full stem greps directly against `.generacy/cockpit/auto-runs/`).

   **Compute-once invariant (V2 / FR-014).** `runId` is derived exactly ONCE per run, HERE, at pre-flight. Every downstream consumer — the § Pre-flight probe (UI mode) capability probe, the § In-memory loop state additions block, the § step 3 sweep-time and live-path `cockpit_gate_open` calls, the escape-hatch and § D.12 `cockpit_gate_ack` calls, every pre-draft `cockpit_gate_status` in the six § Dispatch step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11), and every subagent dispatch prompt that spawns a gate-verb-issuing subagent — receives the pre-computed value as an EXPLICIT LITERAL. NO consumer re-derives `runId`, even by the same rule (a second derivation that agrees today can diverge under a future filename-format change or a stale-ledger race). This rule binds subagents too (per FR-015): the parent writes the literal into the dispatch prompt at dispatch time; the subagent quotes it verbatim on every gate verb it issues, NEVER reading the ledger filename or any other source.

   **No-`:` invariant (V1 / FR-013).** Assert `runId.indexOf(':') === -1`. `runId` is the trailing composite-key segment (`gateKey = ${issueRef}:${gateType}:${generation}[:${runId}]`), and `generation` may already contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`); a colon-bearing `runId` would make the tail ambiguous to positional key parsing. On assertion failure, abort pre-flight with a diagnostic naming the offending value.

   **`runId` MUST NOT be sourced from a per-process or per-MCP-connection value (FR-006).** Specifically NOT: `INSTANCE_NONCE`, `process.env.HOSTNAME`, `process.pid`, a random UUID at first use, or any other per-process / per-MCP-connection value — the cockpit MCP server is long-lived in the orchestrator container, so per-process values are STABLE across runs, the opposite of what a run discriminator needs.

   **Under `--gates=local` this step is dead prose.** The derivation still runs (the ledger filename is computed under `local` too), but `runId` is not passed to any gate verb — `runIdEnabled === false` under `local`, and no gate verb fires in `local` mode anyway. The § In-memory loop state additions block declares `runId` and sets it to `null` for symmetry.

   **Ledger header line** — the FIRST line of the ledger file, written above the dispatch stream: `Tracking ref: <tracking-ref> · form: <invocationForm>`. Forms 1/2: written at step 1 (before the startup sweep). Form 3: written after G.6 approval; if G.6 was skipped at the initial fire, the header carries `form: tracking-new (abandoned before creation)` and the run exits. Form 4: written at F4.7 (per F4.7's two shapes). Grep for `form:` in ledger post-mortems finds all four values: `epic`, `tracking-existing`, `tracking-new`, `tracking-list`.

   **`Auto run starting …` line** — printed AFTER the ledger header line AND AFTER any pre-flight probe pass/fail row, once `ResolvedGateMode` is finalized (both static inputs and the probe outcome are known). The header remains the FIRST line of the ledger file, then any probe row, then this line. Format:

   ```
   Auto run starting · gates: <ui|local> (source: --gates=<value>[ → <resolution reason>])
   ```

   Examples:
   - Explicit `--gates=ui`, resolved to UI: `Auto run starting · gates: ui (source: --gates=ui)`.
   - `--gates=auto`, resolved to local because one or more UI-mode tools are unbound: `Auto run starting · gates: local (source: --gates=auto → ui-mode tools unbound)`.

   The `→ <resolution reason>` suffix appears only when `--gates=auto` resolved down to `local`; it is omitted for explicit `--gates=ui` / `--gates=local` and for `--gates=auto` that cleanly resolves to `ui`. Enumerated `<resolution reason>` values: `ui-mode tools unbound` (item 1 failed — **any** of `cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` absent; the token deliberately does NOT name a single tool), `cluster not cloud-activated` (item 2 failed), and `probe-failed` (item 3 returned an error; the probe's fail ledger row is written BEFORE this line). The Form-3 hard-fail reason `probe-failed-after-remote-gate-consumed` (per § TENTATIVE window gate-presentation rule above) does NOT appear in this line — that path exits non-zero without emitting `Auto run starting …`; the reason string appears only in the probe's fail ledger row on disk. Under a `--gates=ui` pre-flight absence hard-fail OR a `--gates=ui` pre-flight probe hard-fail OR the Form-3 `probe-failed-after-remote-gate-consumed` hard-fail, this line is NOT emitted.

   **Run-config load (`cockpit.auto`).** At parse-time pre-flight, Read the workspace `.generacy/config.yaml` (walk up from cwd; the same file the `cockpit:` owner/assignee block lives in) and extract the OPTIONAL `cockpit.auto` block into in-memory loop state as `cockpitAutoConfig`. Fields, all optional: `loop` (`{model, effort}` — informational to this playbook; the loop session's own model is chosen by whatever launched the session, not mid-run), `heartbeatSeconds` (integer 60–3600; default `300`), `quiet` (boolean; default `false`), and `agents` (per-role `{model, effort}` selectors keyed `default` / `clarifier` / `reviewer` / `validator` / `diagnoser`). A missing file, missing block, or malformed block degrades to all-defaults with ONE warning line — never a pre-flight failure. Role resolution at every subagent spawn: `agents.<role>.model ?? agents.default.model` (and likewise for `effort`); when neither is set, OMIT the field from the spawn call so the subagent inherits its agent definition's default. This read happens exactly ONCE per run; no re-read mid-loop.

   **`--quiet` flag (orthogonal; parsed alongside `--gates`).** Accepted with any of Forms 1–4. A duplicate `--quiet` → usage error with reason `quiet-duplicate` (same exit pattern as the ambiguity table). Effective quiet mode for the run = `--quiet` flag present OR `cockpitAutoConfig.quiet === true`, decided once at pre-flight. Under quiet mode: (1) every ledger line is appended to the persistent `.ledger` file exactly as before, but the `[ledger] ` transcript echo is suppressed; (2) the § Ledger L.4 status-table surfaces print NO table to the transcript — tables embedded inside gate presentation bodies (escalation, scope-drained) are unaffected, since those travel to the operator through the gate itself; (3) the § Ledger L.6 run summary is posted as a comment on the tracking ref (marker `<!-- generacy-cockpit:run-summary -->`, `gh issue comment --body-file`) instead of printed, and a two-line exit note (`Auto run complete — <tracking-ref> · <exit reason>` plus the ledger file's absolute path) prints in its place; (4) free-standing narration outside gates, errors, and the `Auto run starting …` line is limited to one line per lifecycle phase. Quiet mode changes NO tool calls, NO ledger-file content, and NO gate behavior — it is an output profile only. Intended pairing: headless UI-launched runs (`--gates=ui --quiet`); interactive runs omit it.

2. **Arm the background sensor under harness `Monitor`.** Spawn `generacy cockpit doorbell <epic-ref>` under the harness `Monitor` tool at loop start. The verb's positional is named `<epic-ref>` (matching `generacy cockpit help doorbell`) but takes the epic ref under `invocationForm: epic` or the tracking ref under `--tracking` / `--new` — any task-list-bearing scope issue is accepted. `Monitor.spawn(...)` binds `monitorHandle` and re-invokes the model exactly when the child emits a stdout line — idle cost is zero. Stdout is **NDJSON per-line** — the parent parses each line as a candidate enriched event per § Enriched-line dispatch contract (E2 detection gate). Enriched lines (JSON-parseable objects carrying `to` and `labels`) drive label-driven dispatch (D.1–D.4, D.7, D.9, D.9a–D.9d) and inform the D.5/D.6 merge gate via the baked `checks` verdict; bare or malformed lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback and D.8/D.10/D.11 escalation surfaces (step 4). **No ledger line for sensor arm-up** — the doorbell subprocess is engine-owned per generacy#974.

   On **immediate spawn failure** (`Monitor.spawn(...)` returns a spawn error), the skill **stays passive**: no ledger line, no re-spawn branch. The C4 heartbeat (step 4) is the sole recovery signal — the loop degrades to heartbeat-only cost until the engine restores the doorbell surface. The first `cockpit_await_events` call in step 4 arms the in-memory cursor from the tool server's connect-time position.

3. **Startup sweep.**

   **Tool-presence check (fail-loud on missing cockpit MCP tools).** At the top of the sweep, before dispatching anything, the parent verifies the required `cockpit_*` MCP tools are present in the session's tool binding. The required set is **conditional on `ResolvedGateMode`** (per § step-1 `--gates` resolution):

   - **Always required — the seven baseline tools (all modes, `ui` and `local` alike)**: `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`.
   - **Required ONLY when `ResolvedGateMode === "ui"` — the two gate-query tools (generacy#1038)**: `cockpit_gate_status`, `cockpit_gate_list`. Under `ResolvedGateMode === "local"` these two are **NOT** required and their absence is NOT an error — both call sites (§ step 1 § Pre-flight probe (UI mode), and § Dispatch step 0's per-event pre-draft gate-status check) are skipped entirely under `local`, preserving the § step-1 guarantee that `--gates=local` "preserves today's byte-path exactly". A `local` run MUST NOT fail on a tool it never calls.

   So the check names **seven tools under `local` and nine under `ui`**. If any tool in the resolved mode's required set is absent from the tool binding:
   - Append the ledger line verbatim: `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`.
   - Print verbatim: `cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75`.
   - Exit non-zero.

   The fail path is **ledger + print + exit only** — no operator prompt is fired (registration is owned by cluster-base#75). Under `ResolvedGateMode === "ui"`, absence of `cockpit_gate_status` / `cockpit_gate_list` reaches this same fail path — the pre-draft check is unconditional under `ui`, so a `ui` run on a pre-#1038 cluster cannot silently degrade.

   **Answered-gate parked-forever escape hatch (UI mode only).** Before dispatching any synthetic event, iterate `openGates` and tick the sweep counter for every entry in `status: 'answered'`:

   1. For each `(gateId, record)` in `openGates` where `record.status === 'answered'`:
      `answeredGateSweepCounter.set(gateId, (answeredGateSweepCounter.get(gateId) ?? 0) + 1)`.
   2. For each `(gateId, count)` in `answeredGateSweepCounter` where `count >= 3`:
      - Call `cockpit_gate_ack(gateId, outcome: 'superseded', detail: 'answered-not-consumed — presumed stuck at cloud delivered/applied')`. Under `runIdEnabled === true` this call ALSO passes `runId` — the `runId` value is READ from `openGates[gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`. For a current-run entry the two coincide; for an adopted entry (per § Adoption pass above) they differ — `openGates[gateId].runId` carries the row's originating `runId`. Under `runIdEnabled === false` the `runId` field is OMITTED (V6). `runId` is **accepted-and-ignored** on the ack path (`cockpit_gate_ack` targets an existing `gateId` and performs no key derivation), so the ack works regardless of which run opened the gate (per FR-005 / R11).
      - `openGates.delete(gateId)`.
      - `answeredGateSweepCounter.delete(gateId)`.
      - **Actively re-derive (mandatory — see § Escape-hatch re-derivation below).** Do NOT leave re-derivation to the next `cockpit_await_events` drain.

   **§ Escape-hatch re-derivation (load-bearing).** The escape-hatch ack changes NO label — it only closes a cloud record. `cockpit_await_events(cursor)` returns only NEW transitions since the cursor, so no drain will ever carry an event for a label that did not change; a drain-dependent hatch would have destroyed the operator's only surface for that issue and parked it forever. Therefore, for EACH gate the hatch acks, in the SAME pass:

   1. Read the gate's `issueRef` from the record BEFORE `openGates.delete(gateId)`.
   2. Re-read that issue's live state: `cockpit_status(issue=<issueRef>, json=true)`.
   3. Synthesize an event from the returned labels and dispatch it through the normal § Dispatch D.n path — byte-identical to the startup sweep's synthetic-event pass below. The freshly-derived dispatch runs its own § Dispatch step 0; the just-acked gate is now terminal, so `cockpit_gate_status` returns `absent` and drafting proceeds.
   4. If the live state carries no dispatchable transition class, synthesize nothing and write no ledger row (per Invariant #8 the escape hatch is control flow, not a dispatch).

   **De-duplication at the § step-3 startup-sweep tick site ONLY**: the synthetic-event pass below already re-reads live state for every in-scope issue in this same sweep, so an issue whose gate the hatch just acked is dispatched exactly once, by that pass — do NOT also synthesize it from step 2 above. At the § step-4 per-wake tick site there is no such following pass, so the re-derivation above is performed directly and is the sole path that reaches the issue.

   The threshold `3` is a load-bearing literal (per `specs/457-part-cockpit-remote-gates/research.md § R5`); a future edit that changes it re-triggers the spec's clarify phase. **Counter semantics the literal `3` is measured in (single definition — every site below MUST agree):** the counter value is the number of SWEEPS during which the entry has been recorded `answered` and unresolved, counting the sweep in which the entry was recorded as sweep 1. The `answeredGateSweepCounter[gateId]` increment performed by a D.n Step 0 `reuse-answered` branch IS that entry's count for the sweep in which it was added; the tick sites (this block and § step 4 sub-step 0) supply every subsequent sweep's increment. So a record added during sweep S reaches `3` at sweep S+2.

   **This block runs on EVERY sweep, not just the startup sweep.** A "sweep" is: (a) the once-per-session startup sweep, AND (b) EVERY per-wake pass through the main loop's drain in § step 4 (each Monitor-delivered wake OR heartbeat fire is a fresh sweep for counter-tick purposes). The counter increments exactly once per sweep per `answered` record. **No double-count is possible**: both tick sites run BEFORE any dispatch in their sweep, so an entry added by a D.n Step 0 `reuse-answered` branch during sweep S did not exist when sweep S's tick ran — its record-time increment is sweep S's count, and the tick sites first touch it in sweep S+1.

   Under `ResolvedGateMode === "local"` this block is dead prose. `answeredGateSweepCounter` is undefined under `local`; `openGates` has no `status: 'answered'` entries because local mode does not read remote gate state.

   **Adoption pass (UI mode) — adopt pre-existing non-terminal gates from prior runs (per #471 / FR-001..FR-014).** Under `ResolvedGateMode === "ui"` ONLY, before the § Synthetic-event dispatch block below fires, enumerate every non-terminal gate already open in the cloud for every in-scope issue and adopt each row into `openGates`, so this run's sweep-time `cockpit_gate_open` calls coalesce onto the adopted 4-segment `gateId`s instead of minting duplicates against a fresh-per-run `runId`.

   1. **Functional list call shape** — `cockpit_gate_list({ issueRef: <ref>, gateType: <omitted> })`. The `runId` field MUST NOT be present on the payload — omitted, not `null`, not `undefined`, not `""` (per FR-005 / V8 / R4). This reinforces #469 FR-011 from the consumer end: the cloud applies `?runId=` as an equality filter in list mode, so forwarding `runId` would return only the CURRENT run's gates — adoption exists precisely to see gates from PRIOR runs, so a run-filtered list would silently return `{gates: []}` and no-op this entire pass. The pre-flight capability probe (per § step 1 § Pre-flight probe (UI mode)) remains the SOLE `cockpit_gate_list` call in the run that carries `runId`.

   2. **N+1 count rule** — exactly ONE `cockpit_gate_list` call per in-scope issue: the tracking ref itself PLUS every in-scope child. For an epic with N in-scope children this is N+1 calls (per FR-001 / SC-008); for epic-less tracking with M task-list refs, M+1; for a bare `--tracking` invocation with no task list yet, 1.

   3. **In-scope enumeration** — derived from the SAME shared `cockpit_status(epic|issue=<ref>, json=true)` result the § Synthetic-event dispatch block below reads. Under `invocationForm: epic` the set is `[<epic-ref>] ++ epic.inScopeChildren`; under tracking forms it is `[<tracking-ref>] ++ trackingIssue.taskListRefs`. Adoption does NOT issue a second `cockpit_status`.

   4. **Broad adoption rule (per FR-009 / SC-009 / V5).** For each returned non-terminal row `{gateId, gateType, generation, status, runId}` for an in-scope issue, adopt EVERY row into `openGates` — including rows whose `(gateType, generation)` does NOT match a natural gate the current-run sweep would draft. Compute `dispatchClass` from `(row.gateType, row.generation)` using the SAME mapping-table rule the current-run sweep uses (per § UI-mode gate mapping / § Generation discriminator (UI mode)). Add a `GateRecord` under `row.gateId` with `{gateId, gateType, generation, status, runId: row.runId, issueRef, dispatchClass, transitionClass}` — the per-entry `runId` is the ROW's `runId` verbatim (FR-003 / V2). `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated on adopted entries — the `cockpit_gate_list` return shape does not carry them (DATA GAP). An unanswered adopted `open` entry sits in `openGates` and does nothing (the escape hatch only ticks `answered` entries); answered entries route via `dispatchClass`.

   5. **Generation-drift branch (per FR-013 / SC-010 / V3; contract: `contracts/adoption-drift.md`).** For a row whose `(row.issueRef, row.gateType)` matches a natural gate the current-run sweep would draft AND `row.generation` differs from the current-run derived generation AND `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation, remediation-limit}`: call `cockpit_gate_ack({ gateId: row.gateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)', runId: row.runId })`. The `detail` string is the SAME string the live-path drift branch uses at every § Dispatch D.n Step 0 — sourced verbatim from the playbook; if the live-path string changes, this branch inherits. The `runId` is the ROW's originating `runId` (per FR-003) — `runId` is accepted-and-ignored on the ack path, so the ack lands regardless of which run opened the stale gate. Then: do NOT add the row to `openGates`; do NOT draft here (the § Synthetic-event dispatch block below produces the fresh open at the current-run generation and current-run `runId`). **Precedence**: FR-013 wins over FR-009 for its matching rows — classify `adopt-natural` first (same-generation match), then `drift-supersede`, then `broad-adopt`.

   6. **`escalation` carve-out (per FR-013 / V4 / SC-011).** `row.gateType === 'escalation'` DISABLES the drift branch. Prior-run `escalation` rows with generation drift take the BROAD-adopt branch instead — adopted at their stale generation, left non-terminal. Three dispatch rows (D.7 G.4b, D.10 G.4c, D.11 G.4d) share the one `escalation` enum value and the wire carries no subtype discriminator (upstream generacy#1046), so superseding could destroy an escalation the current run cannot correctly recreate.

   7. **Adopted-`answered` counter initialisation (per FR-010 / SC-012 / V6).** For every row adopted with `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the SAME atomic step as adding the entry to `openGates`. This matches the reuse-answered branch semantics established by #457 (the record-time increment IS the entry's count for the sweep in which it was added). The load-bearing threshold `3` still applies: an adopted `answered` entry reaches count `3` at startup-sweep+2, at which point the escape hatch fires.

   8. **Adopted-`answered` structural limitation (per FR-010 / spec § Follow-ups).** NO MCP surface returns the operator's answer document: `cockpit_gate_status` returns `{gateId, status}` and `cockpit_gate_list` returns `{gateId, gateType, generation, status, runId}` — neither carries the answer, so the current run structurally cannot consume a prior-run answer on its own. The adopted answer is preserved ONLY if D.12 redelivery fires (consumed via the existing `deliveryId` dedup path); otherwise the escape hatch supersedes after 3 sweeps and either re-derives from current labels or re-asks the operator. An answer-document surface would require a cloud-side schema change and is filed as a Follow-up.

   9. **Per-issue defer-on-error rule (per FR-014 / SC-013 / V7 / US5; contract: `contracts/adoption-error-defer.md`).** On `{status: 'error', class, detail}` for issue X (any error class after the tool's internal `QUERY_RETRY_SCHEDULE` has exhausted): SKIP BOTH adoption AND drafting for issue X in this pass — the exclusive-or property; a partial defer that skips adoption but still drafts would reproduce the duplicate-inbox symptom. Write ONE ledger row verbatim: `startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake`. Continue with the next in-scope issue — do NOT abort the run, do NOT re-order remaining issues, do NOT re-attempt in this same pass. The triggering label(s) remain persistent, so the event re-fires on the main loop's first natural wake. The synthetic-event dispatch pass reads a per-run in-memory `adoptionDeferredIssues: Set<IssueRef>` set the adoption pass writes to and skips any natural-gate `cockpit_gate_open` for a deferred issue in this pass.

   10. **UI-mode-only guard (per FR-006 / V9 / SC-005).** The entire § Adoption pass block is dead prose under `ResolvedGateMode === "local"`. No `cockpit_gate_list` calls, no `openGates` writes, no ledger rows, no `adoptionDeferredIssues` set — `--gates=local` byte-path invariance matches #469 FR-007's stance verbatim.

   11. **Ordering guarantees.** The § Adoption pass runs AFTER #469's pre-flight capability probe, AFTER the § step 3 tool-presence check, and AFTER the § Answered-gate parked-forever escape hatch tick; it runs BEFORE the § Synthetic-event dispatch block below AND BEFORE any per-event D.n Step 0 pre-draft check. This ordering is load-bearing: sweep-time `cockpit_gate_open` calls need adopted entries already in `openGates` when they run, so the sweep-time open finds the adopted entry and issues no duplicate open for the natural gate (per SC-006). On the drift branch the adoption pass acks the stale gate `superseded` FIRST, so the sweep's fresh open at the current-run generation and `runId` produces the sole remaining open for the natural gate.

   **Synthetic-event dispatch (only reached when every tool in the resolved mode's required set is present).** Call `cockpit_status(epic=<epic-ref>, json=true)` and treat every issue whose current transition class is one of D.1–D.9 as a synthetic event. Dispatch each one by one (per § Dispatch and § Ledger) before entering the main loop — this handles an epic that already has open work when `/cockpit:auto` is invoked. The sweep ends with exactly one full status table (per § Ledger L.4 policy) and hands off to step 4.

   Under `--tracking <issue-ref>` / `--new "<title>"` (epic-less mode), the sweep reads the task list from the tracking issue via `cockpit_status(issue=<tracking-ref>, json=true)` and treats each live-state ref as a synthetic event — structurally identical to the epic-ref sweep. This is the restart-safety mechanism: the scope survives restarts because it lives on the tracking issue, not in session state.

   **UI-mode extended trigger set (Q2=B)**. When `ResolvedGateMode === "ui"`, the startup sweep re-opens remote gates via `cockpit_gate_open` for **every persistent gate-trigger state** — a superset of the `waiting-for:*` baseline. Under `local`, the sweep behaves EXACTLY as today. Trigger states:

   - **All `waiting-for:*` labels**: `waiting-for:clarification` (D.1), `waiting-for:<artifact>-review` (D.2 — spec / clarification / plan / tasks), `waiting-for:implementation-review` (D.3), `waiting-for:manual-validation` (D.4), `waiting-for:merge-conflicts` (D.11 — co-occurs with `blocked:stuck-merge-conflicts`).
   - **Persistent NON-`waiting-for:*` triggers**: `agent:error` (D.7), `failed:<subtype>` (D.7), `completed:validate` with red checks (D.6 — ledger-only, engine-owned remediate), `phase-complete` (D.8 — G.5), `blocked:stuck-merge-conflicts` (D.11 — either label alone triggers). These are persistent labels that do NOT self-re-fire; restricting the UI sweep to `waiting-for:*` only would silently drop them across a restart / takeover.

   **`runId` on every sweep-time `cockpit_gate_open` (per #469 / FR-004 / R11).** Under `runIdEnabled === true`, every `cockpit_gate_open` call in the extended trigger set above (every `waiting-for:*` label AND every persistent non-`waiting-for:*` trigger) passes the run's pre-flight-derived `runId` (per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions above). Under `runIdEnabled === false` the `runId` field is OMITTED from every sweep-time open call (V6). The `runId` is read verbatim from loop state — NO consumer re-derives (V2 / FR-014). Sweep-time and live-time opens for the same natural gate coalesce on the same 4-segment `gateId` under `runIdEnabled === true` (per § gateId idempotency below).

   **Fresh-epic bootstrap (epic mode; no phase in flight).** In epic mode (`invocationForm: epic`), if the synthetic-event pass found **zero** synthetic events — every issue `pending`, nothing queued, nothing in flight — the wake-driven loop has no event to react to and no `phase-complete` will ever fire, so the epic would idle forever. To bootstrap, compute the **first incomplete phase** P&lt;first&gt; (the lowest-numbered phase with any non-terminal issue) from `cockpit_status(epic=<epic-ref>, json=true)`; if P&lt;first&gt; has at least one unqueued issue, synthesize a **`phase-bootstrap` event** and dispatch it through D.8 / § Gate contract G.5 — the SAME machinery as a real `phase-complete`, differing only in provenance: the G.5 presentation uses the bootstrap variant (§ G.5 **Bootstrap variant**), the wire `transitionClass` is `phase-bootstrap` (a distinct `gateId`, so a restart re-opens the bootstrap gate and never collides with a later real `phase-complete` on the same `<epic-ref>`), and the ledger dispatch-class marker is `phase-bootstrap`. **Under `ResolvedGateMode === "ui"` the bootstrap confirm opens in the operator inbox via `cockpit_gate_open` exactly like every other G.5 gate — it is NEVER a local `AskUserQuestion` under UI mode** (a headless UI-driven session has no local answerer). If P&lt;first&gt; is already queued or in flight the synthetic-event pass above produced events and this clause is skipped. Epic-less modes (`--tracking` / `--new` / issue-list) do NOT bootstrap phases — their scope is the tracking-issue task list, swept above.

   **G.4(e) exclusion**: consecutive `invalid-cursor` streak (per-epic in-memory cursor-mechanism fault; § step 5 Branch B) is NOT swept — it is in-memory state that does not survive a session restart, and it has no `<issue-ref>` to key a per-issue gate record on.

   **gateId idempotency**: every sweep-time `cockpit_gate_open` call uses `gateId = hash(issueRef, gateType, generation[, runId])` — `generation` is derived from the SAME per-gateType function the live path uses (§ UI-mode gate mapping / § Generation discriminator (UI mode)), and `runId` is the pre-flight-derived value on § In-memory loop state additions (UI mode). The plugin never hand-builds the hash — the `cockpit_gate_open` MCP tool derives `gateKey` and `gateId` from the semantic inputs the plugin passes. Under `runIdEnabled === true` every sweep-time open in the extended trigger set passes `runId` on the payload; under `runIdEnabled === false` the field is OMITTED (V6). The pre-draft `cockpit_gate_status({issueRef, gateType, generation, runId})` check (per § Dispatch step 0 in D.1 / D.2 / D.3 / D.4 / D.7 / D.11) names the same FOUR inputs under `runIdEnabled === true` (three under `runIdEnabled === false`, matching the pre-#469 3-input identity), so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed AND the run is the same. Two runs against the same tracking ref intentionally derive DIFFERENT `gateId`s — the FR-001 behaviour change: re-invoking `/cockpit:auto <ref>` mints a NEW ledger file, hence a NEW `runId`, hence a fresh 4-segment `gateId` for the same natural gate (see § Assumptions in `specs/469-problem-cockpit-auto-only/spec.md`). When content HAS changed, the generation differs by design: for the four gateTypes that map 1:1 onto a dispatch row (`clarification`, `artifact-review`, `implementation-review`, `manual-validation`) the pre-draft check's generation-drift branch fires (ack stale `superseded` + draft fresh); for `gateType: 'escalation'` the drift branch is DISABLED and the stale gate is left non-terminal — see § Pre-draft check — shared rules **generation-drift branch guard** (upstream [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)). **Adoption is the ordering primitive that prevents the sweep-time `cockpit_gate_open` from duplicating an adopted natural gate across runs (per #471 / SC-006).** The § Adoption pass block above runs BEFORE this synthetic-event dispatch pass, and every synthetic event routes through a D.n row whose Step 0 pre-draft check performs the same-generation adoption branch on `absent` (a branch ordered BEFORE the drift branch that adopts a prior-run same-generation row from the runId-agnostic `cockpit_gate_list` result rather than drafting fresh). By the time a sweep-time `cockpit_gate_open` fires for a natural gate: (a) a same-generation prior-run gate has been adopted into `openGates` (by the § Adoption pass at startup, or by Step 0's same-generation `absent` sub-branch for issues entering scope mid-run) and adoption SUPPRESSES the sweep-time open — no second `cockpit_gate_open` is issued and the operator's inbox sees exactly one gate, tracked under its originating `runId` (the two runs' `gateId`s do NOT coalesce, but no duplicate is opened); (b) a generation-drift prior-run gate has been acked `superseded` targeting the row's originating `runId`, so the sweep-time open at the current-run generation and `runId` produces the SOLE remaining open; (c) with no prior-run gate, adoption is a no-op and the open proceeds unchanged. The Step 0 same-generation `absent` sub-branch is the load-bearing correctness site for issues that enter scope AFTER the startup sweep; the § Adoption pass is the bulk site for issues already in scope at startup.

   Plugin-side, on a `cockpit_gate_status` reuse-return (`status: 'open' | 'answered'`) the sweep records a partial `openGates` entry keyed by the returned `gateId`, carrying `{gateId, gateType, generation, issueRef, status, transitionClass, dispatchClass}` derived from the query inputs and the mapping-table row. **`dispatchClass` is mandatory on the reuse record** — it is known at record time (the D.n row performing the reuse) and NOT recoverable from the query return; § D.12 keys its live-state supersession check on `dispatchClass` and routes on `(dispatchClass, optionId)`, so a reuse record without it would land the operator's answer nowhere. `inboxUrl`, `title`, `askedAt`, `originalDraft` are NOT populated on the reuse path — the query returns do not carry them (DATA GAP follow-up); the record suffices for the FR-009 escape hatch's `status === 'answered'` filter and D.12's `gateId`-identity check. The "one pointer line" is NOT printed on the reuse path — it is scoped to `cockpit_gate_open` success and requires an `inboxUrl` the query does not return.

   **Deferred-to-loop behavior on sweep-time `cockpit_gate_open` failure**: the sweep is "best-effort UI-open". If `cockpit_gate_open` fails for a specific sweep-time gate, the first-failure ledger note fires (per § UI-mode fallback rule 5), but the gate's initiation is DEFERRED to the main loop's first natural wake (a `Monitor` line or `ScheduleWakeup` heartbeat) rather than blocking on a local `AskUserQuestion` mid-sweep. The record is NOT opened, but the underlying event WILL re-fire naturally because the label is persistent. The main loop's per-wake iteration retries `cockpit_gate_open` for that issue's transition class; on success the gate opens normally, on repeated failure the § UI-mode fallback AskUserQuestion path fires (single-gate blocking is acceptable in the main loop). A hostile cluster degrades to loop-time fallback but does not stall.

   **Deferred-to-loop behavior on adoption-path `cockpit_gate_list` failure** (per #471 / FR-014 / SC-013 / V7): the § Adoption pass is "best-effort UI-adopt" under the same per-issue defer discipline as the sibling paragraph above. On `{status: 'error', class, detail}` for a SPECIFIC in-scope issue X (after the tool's internal `QUERY_RETRY_SCHEDULE` has exhausted — 3 attempts, ~5s backoff, ~20s worst case), skip BOTH adoption AND drafting for X in this pass; the synthetic-event dispatch block reads `adoptionDeferredIssues` and skips any natural-gate `cockpit_gate_open` for a deferred issue. The persistent label(s) re-fire the event on the first natural wake (`Monitor` line or heartbeat fire), where the ordinary D.n Step 0 flow retries. Ledger row (verbatim): `startup · adoption-list-error · <issueRef> · <errorClass> · deferred-to-next-wake` (grep recipe: `grep '· adoption-list-error ·' *.ledger`). Continue with the next in-scope issue — do NOT abort, re-order, or re-attempt in this same pass.

   **Status table** (per § L.4 policy): under UI mode the sweep's status table is printed AFTER the sweep-time `cockpit_gate_open` calls. The "sweep ends with exactly one full status table" rule is unaffected.

4. **Main loop (wake-driven).** The loop is **wake-driven**, not long-polling. The model does nothing between wakes — the harness re-invokes the loop only when a wake signal arrives:

   - **Monitor-delivered wake**: `Monitor` observed a new stdout line from the `generacy cockpit doorbell <epic-ref>` sensor armed in step 2.
   - **`ScheduleWakeup` heartbeat fire**: the belt-and-braces heartbeat (armed per C4 below) elapsed while `Monitor` was silent.

   Idle cost between wakes is **zero tokens** — no polling turn, no context re-read.

   **Per wake (Monitor or heartbeat), the iteration is**:

   0. **Answered-gate parked-forever escape hatch tick (UI mode only).** Before the drain, apply the § step 3 escape-hatch block verbatim (per-wake tick site). Under `ResolvedGateMode === "ui"`: iterate `openGates` and tick `answeredGateSweepCounter` for every `status: 'answered'` entry; for every counter entry with `count >= 3`, ack `superseded` with the exact detail `'answered-not-consumed — presumed stuck at cloud delivered/applied'` (under `runIdEnabled === true` this per-wake `cockpit_gate_ack` ALSO passes `runId` verbatim — the `runId` value is READ from `openGates[gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`; for a current-run entry the two coincide, for an adopted entry (per § step 3 § Adoption pass above) they differ — `openGates[gateId].runId` carries the row's originating `runId`; under `runIdEnabled === false` the `runId` field is OMITTED — V6; `runId` is accepted-and-ignored on the ack path, so the ack works regardless of which run opened the gate), delete from `openGates`, delete from the counter, and then **actively re-derive** the fresh event per § step 3 **Escape-hatch re-derivation**: read the record's `issueRef` before deleting it, call `cockpit_status(issue=<issueRef>, json=true)`, synthesize an event from the returned labels, and dispatch it through the normal § Dispatch D.n path **in this same pass, before the drain in sub-step 1**. Do **NOT** rely on the next drain to produce it: the hatch changes no label, and `cockpit_await_events(cursor)` returns only NEW transitions, so a drain-dependent hatch would delete the operator's only surface and park the issue forever. At this tick site there is no following synthetic-event pass, so this re-derivation is the SOLE path that reaches the issue — the § step 3 de-duplication carve-out applies to the startup-sweep site only. Under `ResolvedGateMode === "local"` this step is a no-op (the counter is undefined). This is the load-bearing per-wake tick that makes the FR-009 escape hatch reachable for `answered` entries FIRST added by a D.n Step 0 `reuse-answered` branch mid-run. Ledger accounting: the escape-hatch ack is control flow, not a dispatch — no ledger row per Invariant #8; the re-derived dispatch writes its own ledger row.
   1. **Drain** — call `cockpit_await_events(epic=<epic-ref>, cursor=<in-memory-cursor>, maxWaitMs=1, coalesceWindowMs=3000, maxBatchSize=256)` via the MCP tool binding. `maxWaitMs=1` is the smallest currently-accepted value at the tool boundary — the drain is effectively non-blocking. `coalesceWindowMs=3000` remains the sole burst-batcher (the MCP layer owns coalescing). The initial iteration passes `cursor=null` (the tool server arms from its connect-time position). Each successful return is a **batch of typed events** with a `nextCursor` field, already parsed by the tool server.
   2. **Consume** — process every event in the batch **in stream order**. No content- or field-based filter over the batch; the batch's ordering IS the dispatch order (§ Invariants #7 holds by construction — the tool server owns event parsing).
   3. **Advance cursor** — after the batch is fully consumed, advance the in-memory cursor to `batch.nextCursor`.
   4. **Arm next heartbeat + wait** — fall through to C4 to arm the next `ScheduleWakeup` and wait for the next wake signal. Do NOT re-issue `cockpit_await_events` in a tight loop.

   For each event in the batch (in stream order):
   - **(a) Resolve authoritative state.** Prefer the enriched doorbell line's `to` / `labels` fields (and, for D.5/D.6, the baked `checks` verdict) — a line is enriched iff it JSON-parses to an object AND carries both `to` and `labels` (per § Enriched-line dispatch contract E2). Otherwise fall back to a single `cockpit_status(epic=<epic-ref>, json=true)` query. **Under the enriched-line path**, D.1–D.4, D.7, and D.9/D.9a–D.9d dispatch directly from the line's `to` / `labels` fields. **Retain the per-event `cockpit_status` re-check for D.8, D.10, and D.11** — those open human/consequential gates where a stale-line dispatch could open a gate against superseded state. **D.5/D.6** consult the `checks` verdict on the line; if `checks` is **absent OR `pending`**, fall back to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` / `cockpit_merge(issue=<issue-ref>)` query — smee doorbell delivery is best-effort/lossy, and a lost follow-up event would silently stall the merge. Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip any query entirely per § Invariants #8's cost contract. If the epic's live state is `epic-complete`, go to step 6.
   - **(b) Dispatch** per § Dispatch below, branching on the *live* transition class.
   - **(c) Write one ledger line** per § Ledger (transcript print + append to the run's `.ledger` file). A dispatch without a ledger line is a protocol violation.
   - **(d) Continue** with the next event in the batch.

   **Initial-flagged events** — `issue-transition` events with `initial: true` from `cockpit_await_events` (connect-time snapshots and mid-run scope joins, e.g. after `cockpit_scope_add`) — dispatch through the existing table by their carried state class, the same as any other event. The step-4a re-check remains authoritative. **D.10 structurally cannot fire on an initial-flagged event because the state class is known.** No new dispatch row; the initial-flag is orthogonal to dispatch.

   **Empty-batch handling**: a wake whose drain returns zero events is a legitimate outcome — burst coalescing or a spurious wake (Monitor-delivered), or a genuine quiet interval / superseded prior heartbeat (heartbeat fire). In either case: advance the cursor to `batch.nextCursor`, arm the next heartbeat per C4, and wait. Heartbeat-fire wakes DO write a ledger line per C4 (`heartbeat · schedule-wakeup · fired · drain empty` when the drain was empty); Monitor-delivered wakes with an empty drain do NOT write a ledger line.

   **C4 — Heartbeat lifecycle (belt-and-braces recovery while `Monitor` silent)**. After each drain (Monitor-delivered wake OR heartbeat fire), if no `ScheduleWakeup` heartbeat is currently outstanding (`heartbeatScheduledWakeupArmed == false`), arm one:

   ```text
   ScheduleWakeup(
     delaySeconds = <currentHeartbeatSeconds>,
     prompt = <verbatim /cockpit:auto invocation with the same ref and flags used at run start>,
     reason = "cockpit-auto heartbeat while Monitor silent"
   )
   ```

   Set `heartbeatScheduledWakeupArmed = true`. **Adaptive interval**: `currentHeartbeatSeconds` starts at `cockpitAutoConfig.heartbeatSeconds` (default `300`, per § step 1 run-config load). After each wake whose drain returns zero events, double it before arming the next heartbeat, capped at `1800`; after any wake whose drain dispatches at least one actionable event (and on every Monitor-delivered wake with a non-empty drain), reset it to the base value. All values stay inside the harness `[60, 3600]` clamp. The doorbell remains the primary wake path — the heartbeat is recovery-only, and backing off while drains stay empty is what keeps an idle epic from paying a full-context wake every 5 minutes. Zero token cost until fire.

   **On heartbeat fire**: the harness re-invokes the model with the verbatim `/cockpit:auto` prompt. Perform the C3 drain, then write the ledger line:

   ```text
   <ref> · heartbeat · schedule-wakeup · fired · drain empty
   ```

   Or, when the drain returned events:

   ```text
   <ref> · heartbeat · schedule-wakeup · fired · drain complete (<M> events)
   ```

   where `<M>` is the number of events dispatched. Set `heartbeatScheduledWakeupArmed = false` (the outstanding heartbeat fired) and re-arm a fresh one per the shape above.

   **On Monitor-delivered wake** while a heartbeat is outstanding: the outstanding heartbeat is **superseded** — no explicit cancellation is required. The stale heartbeat may fire harmlessly later (its drain returns zero events, one extra `fired · drain empty` ledger line, no correctness impact). `heartbeatScheduledWakeupArmed` remains `true` until the heartbeat fires (natural) or the current drain completes and re-arms a fresh one (superseded). Do NOT attempt to cancel or reference the outstanding `ScheduleWakeup` — the harness exposes no cancel primitive and correctness does not require one.

5. **Cursor recovery.** The cursor is in-memory only, held for the lifetime of the current dispatch loop. Each cursor-error signal returned from `cockpit_await_events` is classified and routed onto one of two branches. The parent maintains a **per-class consecutive-fault counter** — one each for `invalid-cursor`, `resetFrom`, `expiry`, `discarded`. Every counter resets to 0 on any **successful cursor reuse**: any `cockpit_await_events` call presenting a non-null cursor and returning no cursor-error signal (empty batches included). All counters reset together; the `streakOperatorAcknowledged` flag (see Branch B) resets to `false` on the same event.

   **Branch A — recover (per-class ledger accounting only):**
   - `resetFrom` reset signal in the returned batch (e.g. server-side event-log rotation). Increment `resetFrom` counter; recover; ledger `<epic-ref> · cursor-recovery · resetFrom · <resetFrom-counter>`.
   - Cursor expiry typed error — the cursor is past the server's retention window. Increment `expiry` counter; recover; ledger `<epic-ref> · cursor-recovery · expiry · <expiry-counter>`.
   - `discarded` signal — server restart / eviction. Increment `discarded` counter; recover; ledger `<epic-ref> · cursor-recovery · discarded · <discarded-counter>`.

   None of Branch A's classes ever fires the escalation gate — their counters are ledger accounting only (the § L.6 run summary identifies churn for later investigation).

   **Branch B — recover once, then escalate on consecutive fault:**
   - `invalid-cursor` typed error — the cursor is malformed / never-issued / wrong-epic (a reliable caller-bug signal; the class also covers server-restart artifacts that present as `invalid-cursor`). Log the typed error's `code`/`message`/`details` verbatim; increment `invalid-cursor` counter; ledger `<epic-ref> · cursor-recovery · invalid-cursor · <invalid-cursor-counter>` (e.g., first consecutive fault writes `cursor-recovery · invalid-cursor · 1`).
     - If counter == 1 → recover (sweep + re-arm cursor-less); continue the loop.
     - If counter ≥ 2 AND the current streak is **not** operator-acknowledged → fire the **G.4(e) escalation gate** (see § Gate contract G.4(e)). The gate's options are `Continue degraded (sweep-per-batch) (Recommended)` and `Stop (exit auto)`.
     - If counter ≥ 2 AND the current streak IS operator-acknowledged (a prior `Continue degraded` on this unhealed streak) → recover; do **not** re-fire the gate (decide-once for the streak that raised it). The counter continues to increment for ledger accounting.

   All recoveries — Branch A and Branch B alike — converge on the same recovery path: **re-run step 3's startup sweep + re-arm cursor-less from connect-time position.** Both the sweep (per § Ledger L.5 idempotency rule) and the re-arm are idempotent — the live-state re-check in step 4a catches events already dispatched, so no duplicate action can result. **The cursor is in-memory only** — session restart, `invalid-cursor`, `resetFrom`, cursor expiry, and `discarded` all converge on this same recovery path, and no filesystem persistence of the cursor exists.

   Any successful cursor reuse resets **ALL** counters to 0 and clears `streakOperatorAcknowledged`. A fresh 2-in-a-row `invalid-cursor` streak after a healed period is a **new** escalation decision — the gate re-fires at count == 2.

6. **Exit.** On `epic-complete`, print the run summary per § Ledger L.6 (including the absolute path of the run's `.ledger` file), and exit zero. Non-`epic-complete` exits (Stop from an escalation gate, unrecoverable error) print an abbreviated summary with the exit reason.

## Enriched-line dispatch contract

Post-generacy#985 the doorbell subprocess emits an NDJSON line per event carrying dispatch-sufficient fields; the parent dispatches label-driven classes directly from the line, dropping the per-event `cockpit_status(epic, json=true)` re-check for the frequent dispatch classes. Authoritative reference for § Dispatch D.1–D.11 and step 4a; the dispatch rows below name it verbatim.

### E1 — Enriched line schema (consumed, not owned)

**Owner**: `generacy-ai/generacy#985` defines and versions the schema. Reproduced for pin discoverability:

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

**Rule**: A doorbell line is treated as **enriched** iff BOTH hold:

1. The line JSON-parses to an object (not `null`, not a string/number/boolean, not an array), AND
2. That object carries **both** `to` and `labels` fields with non-null, non-undefined values.

Any other outcome — parse failure, non-object result, missing `to`, missing `labels` — treats the line as **bare** and routes it to the fallback path (single authoritative `cockpit_status(epic=<epic-ref>, json=true)` per pre-#437 shape). This gate does NOT raise an error; the loop keeps running.

`checks` presence is NOT part of this gate (a legitimate label-change line has no `checks`); it is handled inside the D.5/D.6 path per C4.

### E3 — Dispatch source per class

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
| D.13 | `waiting-for:remediation-limit` | **enriched line** | fallback |

**Retain-the-re-check** (D.8, D.10, D.11): human/consequential gates where a stale-line dispatch could open a gate against superseded state — retain the authoritative re-check.

### E4 — `checks` verdict handling for D.5/D.6

**Rule**: The D.5/D.6 merge-gate dispatch consults the `checks` field on the enriched line (E1) and branches on its value:

| `checks` value | Action |
|----------------|--------|
| `"green"` | D.5 branch: evaluate the § D.5 step-2 **implementation-review co-presence guard** first — **DEFER** (passive no-op, ledger outcome `deferred: implementation-review pending`; no `cockpit_merge`, no gate, no label) when `waiting-for:implementation-review` co-occurs, because G.8 (D.3's trigger) owns that merge on `approve` (`auto.md:1494`); otherwise `cockpit_merge(issue=<issue-ref>)` |
| `"red"` | D.6 branch: **ledger-only no-op** — red validate is engine-owned and re-fires as an engine gate (remediation / remediation-limit); no fixer subagent |
| `"pending"` | **Fall back** to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` OR `cockpit_merge(issue=<issue-ref>)` (per the D.5 vs. D.6 dispatch); branch on the returned verdict per pre-#437 logic |
| Absent (field missing OR `null`/`undefined`) | **Fall back** — same as `"pending"` |

**Defer-on-pending was rejected**: doorbell delivery is lossy; a lost `pending → green | red` follow-up would silently stall the merge.

**Ledger marker on fallback**: D.5/D.6 fallback rows do NOT carry the `source: enriched-line` marker (no marker; equivalent to `source: re-query`).

### E5 — Step-4a "resolve authoritative state" priority

**Unified contract**: Step 4a resolves authoritative state per this priority list:

1. **Prefer the enriched doorbell line's `to`/`labels`** (and, for D.5/D.6, `checks`) when E2 returns `enriched: true` AND the class is in the E3 "enriched line" column.
2. **Fall back to a single `cockpit_status(epic=<epic-ref>, json=true)`** when E2 returns `enriched: false` (bare line, older engine, content-less mode), OR the class is in the E3 fallback column (D.8, D.10, D.11), OR E4's `checks` verdict is absent/pending.

**Retained invariant**: `cockpit_await_events` remains the sole source of typed **batches** (merge-gate fallback path, D.8/D.10/D.11 escalation surfaces). The enriched line is a **dispatch input**, not a **batch source** — preserving § Invariants §7 (no content-based filters over the stream).

### E6 — Ledger row marker

**Format** (unchanged four-column shape, marker appended in outcome slot):

```
<issue-ref> · <transition-class> · <action> · <outcome> [· source: enriched-line]
```

**Marker rules**:

- **Append `· source: enriched-line`** when the dispatch was driven by the enriched line (E2 = true AND the class is in the E3 "enriched line" column, including D.5/D.6 with decisive `checks`).
- **Omit the marker** (equivalent to `source: re-query`) when: the class is in the E3 fallback column (D.8, D.10, D.11); the class is in the "enriched line" column but the line was bare (E2 = false) and the fallback path fired; or the class is D.5/D.6 and `checks` was absent OR `pending`.

### E7 — Graceful degradation

**Guarantee**: A cluster running a pre-#985 `generacy` (no enriched line generation) sees every doorbell line fail the E2 gate and falls back to the pre-#437 `cockpit_status(epic, json=true)` per-event re-check — pre-#437 behaviour preserved verbatim. Future schema drift (renamed or dropped load-bearing fields) likewise fails E2 → fallback fires → the loop keeps running at pre-#437 cost; no runtime error, no operator-visible failure.

## Dispatch

Label-driven classes (D.1–D.11) plus the UI-mode gate-answer completion class D.12 (fires only under `ResolvedGateMode === "ui"`). Authoritative state resolves per step 4a / § Enriched-line dispatch contract: enriched `to` / `labels` (and, for D.5/D.6, `checks`) are the source of truth for label-driven classes; the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check is retained for D.8, D.10, D.11 and fires as fallback for bare lines or absent/`pending` `checks`. Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip any query entirely per § Invariants #8's cost contract. **D.12**: under `ResolvedGateMode === "ui"`, every gate contract G.1–G.9 that maps to the wire record (per § UI-mode gate mapping) OPENS via `cockpit_gate_open` instead of `AskUserQuestion`; the operator's answer arrives as a D.12 `gate-answer` event routed onto the SAME downstream handling the local `AskUserQuestion` path performs today, closing the record with `cockpit_gate_ack(applied | superseded | failed)`. Each dispatch is **CLI verb + optional subagent + optional gate**; no dispatch invokes a `/cockpit:*` slash command (invariant §4).

| # | Event | Action shape |
|---|-------|--------------|
| D.1 | `waiting-for:clarification` | Clarification drafter subagent → single batched-gate `AskUserQuestion` (three options) → post + `cockpit advance` |
| D.2 | `waiting-for:<artifact>-review` | Review-verdict analyzer subagent → fused verdict gate → `cockpit advance` OR `COMMENT` review |
| D.3 | `waiting-for:implementation-review` | Final-approval gate G.8 (no findings artifact — renders `(none)`, **no subagent**) → `approve` → post-validate: cockpit merge path / legacy: `cockpit_advance(issue, gate="implementation-review")` / undetectable: fail closed; `hold`/`reject` → no-op (label stays, gate re-fires) |
| D.4 | `waiting-for:manual-validation` | Manual-validation summarizer subagent → confirm gate → `cockpit advance` |
| D.5 | `completed:validate` + green | `cockpit merge` (no gate — human verdict was implementation-review) |
| D.6 | `completed:validate` + red / merge red | Ledger line only (engine remediate loop owns red validate; re-fires as an engine gate) |
| D.7 | `agent:error` / `failed:*` | Fetch evidence → escalation gate (Requeue / Skip / Stop) |
| D.8 | `phase-complete` | Phase-queue confirmation gate → `cockpit queue --yes` |
| D.9 | `waiting-for:address-pr-feedback` | Ledger line only (server-side owns it) |
| D.9a | `waiting-for:pr-feedback` | Ledger line only (legacy alias) |
| D.9b | `waiting-for:children-complete` | Ledger line only (epic-container state) |
| D.9c | `waiting-for:dependencies` | Ledger line only (engine-owned cross-issue wait) |
| D.9d | `phase:*` (prefix-match) | Ledger line only (engine-owned phase transition) |
| D.11 | `waiting-for:merge-conflicts` **or** `blocked:stuck-merge-conflicts` (labels co-occur when the engine escalates; deduplicated per-issue for one incident) | Escalation gate (`I've resolved it` / `Skip` / `Stop`) |
| D.10 | Unrecognized / ambiguous | Escalation gate (Skip / Stop only, never Retry) |
| D.13 | `waiting-for:remediation-limit` | Remediation-limit gate G.9 (findings from the `## Remediation limit reached` issue comment, **no subagent**) → `resume remediation` → `cockpit_advance(issue, gate="remediation-limit")`; `stop` → exit clean, no label writes |
| D.12 | `gate-answer` (typed event `type: "gate-answer"` on the doorbell NDJSON line and as a `cockpit_await_events` batch item; FLAT frozen shape — carries `gateId`, `gateKey`, `optionId`, `freeText`, `actor`, `deliveryId` (NO `generation`); fires only under `ResolvedGateMode === "ui"`) | Stale-gate check (gateId identity) → live-state supersession check → route optionId (+freeText) to the SAME downstream handling the local `AskUserQuestion` path performs (per § UI-mode gate mapping) → `cockpit_gate_ack(applied | superseded | failed)` |

### Pre-draft check — shared rules (UI mode)

Rules every § Dispatch **Step 0 — pre-draft gate-status check** obeys, stated once so the seven Step 0 blocks (D.1, D.2, D.3, D.4, D.7, D.11, D.13) cannot drift apart. All are dead prose under `ResolvedGateMode === "local"` (Step 0 is skipped entirely there).

**`runId` (fourth input under `runIdEnabled === true`) — per #469 / FR-010 / FR-014.** The pre-draft check's `gateId` uses FOUR inputs when `runIdEnabled === true`; the fourth is the pre-flight-derived `runId` (per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions above). The `runId` is threaded on the `cockpit_gate_status` payload as an explicit literal read verbatim from loop state — NEVER re-derived by the Step 0 site, even by the same rule (per V2 / FR-014). Under `runIdEnabled === false` the field is OMITTED from the wire payload (V6) and the pre-#469 3-input identity applies. The six Step 0 blocks name the same four inputs by construction, so sweep-derived and live-derived `gateId`s coalesce when content is unchanged AND the run is the same. The compute-once + explicit-literal invariant extends to subagent dispatch prompts — see § UI-mode gate mapping header note "Subagent dispatch prompt template addition".

#### Generation-drift branch guard (dispatch-identity precondition)

The generation-drift branch — step 0's `{ status: 'absent' }` → `cockpit_gate_list` → "non-terminal gate at a DIFFERENT `generation`" → `cockpit_gate_ack(..., 'superseded')` — **destroys a gate**, so it MUST only ever supersede a gate that the CURRENT dispatch itself would have opened. Precondition, applied at every Step 0:

**A listed entry may be superseded only when BOTH hold:**

1. `entry.gateType` equals **this dispatch's** `gateType`. (Restated because `gateType` is OPTIONAL on `CockpitGateListInputSchema`, so an unfiltered call returns every type for the issue.) **AND**
2. the entry's **dispatch-identifying discriminator** — *which D.n row opened it* — is recoverable from the list entry `{gateId, gateType, generation, status}` (per `mcp/gates/query-schemas.ts § CockpitGateListEntrySchema`) **and equals this dispatch's row**.

**When the discriminator is NOT recoverable from the list entry, the drift branch MUST NOT supersede.** Skip the drift branch entirely — do not call `cockpit_gate_list`, do not ack anything — and proceed exactly as "no existing gate": fall through to the draft-then-open flow.

**Recoverability per `gateType`.** Five of the frozen enum values map 1:1 onto a single Step-0 row, so condition 2 is satisfied by condition 1 alone. `escalation` does not:

| gateType | Step-0 row(s) that open it | discriminator recoverable from a list entry? |
|---|---|---|
| `clarification` | D.1 (G.1) | yes — `gateType` ⇒ row |
| `artifact-review` | D.2 (G.2) | yes — `gateType` ⇒ row |
| `implementation-review` | D.3 (G.8) | yes — `gateType` ⇒ row |
| `manual-validation` | D.4 (G.3) | yes — `gateType` ⇒ row |
| `remediation-limit` | D.13 (G.9) | yes — `gateType` ⇒ row |
| `escalation` | **D.7 (G.4b), D.10 (G.4c), D.11 (G.4d)** | **NO — three rows share one `gateType`** |

(`phase-queue`, `filing`, and `scope-drained` have no Step 0 today — D.8 / G.6 / G.7 run no pre-draft check; each maps 1:1 to a single row.)

**Consequence — the drift branch is DISABLED for `gateType: 'escalation'` (D.7, D.10, D.11).** All three escalation rows open gates under the single frozen enum value `escalation`, and a list entry carries only `{gateId, gateType, generation, status}` — **nothing on the wire says which escalation row opened a listed gate.** So in D.7, D.10, and D.11 the **drift branch never fires** — no listed escalation entry is ever acked `superseded` from an escalation row. **The list call itself is NOT skipped for the two escalation rows that have a Step 0 (D.7, D.11):** since #471, `{ status: 'absent' }` on those rows issues `cockpit_gate_list` in order to reach the **same-generation adoption branch** (per #471 / SC-006), which keys on generation *equality*, not on recovering the dispatch subtype — condition 2 does not apply and no supersession occurs. Every listed entry that is not a same-generation non-terminal match falls through to draft-then-open without an ack. D.10 has no Step 0, so it genuinely issues no list call.

**The plugin MUST NOT recover the subtype by parsing the `generation` string.** `generation` is an opaque `z.string().min(1)` on the wire with no format contract; the `<subtype>:<triggeringLabelOrState>:<occurrence>` shape in § Generation discriminator (UI mode) is a plugin-side authoring convention, not a wire guarantee — a mis-parse here destroys a live operator gate.

**Residual limitation (NOT fixed here; deliberate).** Escalation-subtype generation drift is therefore undetectable: a genuinely stale escalation gate at an older occurrence counter is left non-terminal instead of being acked `superseded`, and the fresh gate opens alongside it. Fixing it requires the query surface to carry a subtype discriminator (or a finer `gateType`); tracked upstream as [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046). Until #1046 ships, the behavior above is the contract — do not "improve" it client-side.

#### Gate-query error taxonomy

`cockpit_gate_status` and `cockpit_gate_list` each return `ToolResult<T>` — `{ status: 'ok', data }` or `{ status: 'error', class, detail, hint? }`. Four error classes are reachable at these call sites (per generacy `mcp/errors.ts § ErrorClass`):

| `class` | What actually produces it | Required action |
|---|---|---|
| `query-unreachable` | Query-client transport error AFTER `withRetry` exhausts `QUERY_RETRY_SCHEDULE` (~3 attempts / ~5s) — a sustained cloud/relay outage. | **Abort this event's dispatch.** Ledger `<issue-ref> · <transition-class> · pre-draft-check · error: query-unreachable — aborting sweep for this event · source: ui-gate`, print the visible operator-facing line below, continue with the NEXT event in the batch. The aborted event re-fires on the next natural wake. |
| `invalid-args` | The tool's `.strict()` input parse REJECTED the payload — a deterministic **caller bug** in this playbook. | **Abort this event's dispatch and surface it loudly.** Ledger `<issue-ref> · <transition-class> · pre-draft-check · error: invalid-args — <detail> · source: ui-gate`, print the visible operator-facing line, continue with the NEXT event. |
| `internal` | A throw wrapped by `wrapToolBoundary`, or a malformed upstream payload — a deterministic **server/tool bug**. | Same as `invalid-args`, with the `internal` token in the ledger row. |
| `transport` (and any class not listed above) | The call never reached the query surface (MCP transport failure / `CockpitExit` code 1), or an unrecognized class. | Treat as unreachable: same abort + visible error as `query-unreachable`, with the observed class token written verbatim in the ledger row. Never guess a newer class's semantics. |

**Only a literal `{ status: 'absent' }` ok-return means "no existing gate".** No error class may be collapsed to `absent` and no error class may fall through to the draft-then-open flow. Collapsing `query-unreachable` re-introduces the duplicate-drafting hazard this feature fixes; the `invalid-args` / `internal` bucket is populated **exclusively** by deterministic caller/server bugs, never by a race, so collapsing it would silently degrade this feature to a no-op. An error is never evidence that a gate does not exist.

**Visible operator-facing error line** (printed to the transcript, no `[ledger] ` prefix, in addition to the ledger row):

```
pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger
```

Call-time errors here are handled DIFFERENTLY from `cockpit_gate_open` call-time errors (§ UI-mode fallback): a failed gate-*open* falls back to a local `AskUserQuestion` because the operator still needs the gate; a failed gate-*query* has no safe fallback — "I could not read the gate state" is not "there is no gate".

**Cross-reference — pre-flight functional probe (§ step 1 § Pre-flight probe (UI mode))**. The four-class taxonomy above is ALSO consumed by the pre-flight functional probe: it issues exactly one read-only `cockpit_gate_list({ issueRef: <identity-ref>, gateType: <omitted> })` call at pre-flight and classifies its response using the exact same four classes with the exact same routing — any `{ status: 'error', class, detail }` triggers the probe fail path (write the `preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` ledger row, print the operator-facing line, then either exit non-zero under explicit `--gates=ui` or resolve to `local` with `<resolution reason> = probe-failed`). No new class is introduced — a divergence between per-event pre-draft-check classification and pre-flight probe classification would silently break the consistency contract this taxonomy exists to enforce.

### D.1 — `waiting-for:clarification`

**Trigger**: An issue enters `waiting-for:clarification` (open questions posted, awaiting operator-authored answers). Verbatim event string: `waiting-for:clarification`.

**Source of truth**: Read `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check on the enriched-line path; bare / malformed lines take the fallback path per FR-005 (single `cockpit_status` re-query). The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = clarification`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — pass the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId` from § In-memory loop state additions; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — known at record time and MANDATORY (§ D.12 step 3 keys its live-state supersession check on it; § D.12 step 4 routes on `(dispatchClass, optionId)`). The reuse-path record has no `inboxUrl`/`title`/`askedAt` (the query does not return them). Continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped to `cockpit_gate_open` success, which alone carries `inboxUrl`).
      - **`{ status: 'answered' }`** — answered, but no D.12 event has resolved it this session. Do NOT spawn the drafting subagent. Record the same partial entry with `status: 'answered'`, increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; tick sites supply every subsequent sweep's increment), and continue to the next event. Downstream D.12 delivery consumes the answer via the redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }`. Iterate `result.gates` and branch (same-generation is the more specific match and MUST be evaluated before drift):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as a query-unreachable error per sub-step 3 (abort this event's sweep with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content (the current run's `runId` derives a different `gateId`). Do **NOT** draft, do **NOT** open, do **NOT** supersede — byte-identical to the § step 3 § Adoption pass `adopt-natural` branch (per #471 / SC-006). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.1', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`/`title`/`askedAt`/`originalDraft` are NOT populated (DATA GAP). Continue to the next event.
        - **Non-terminal gate at a DIFFERENT `generation`** — generation drift. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the ack path accepts-and-ignores `runId`, so the ack lands regardless of which run opened the stale gate); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the draft-then-open flow below with the fresh generation. When multiple drift entries are present, ack the first non-terminal entry observed; remaining stale entries are acked on subsequent sweeps of the same event.
        - **Empty `gates` list** — no gate for this `(issueRef, gateType)` pair. Fall through to the draft-then-open flow below unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both tools return `{ status: 'ok', data }` or `{ status: 'error', class, detail }`; four classes are reachable: `query-unreachable` (sustained outage after the tool's retry budget), `invalid-args` (deterministic caller bug), `internal` (deterministic server/tool bug), `transport` (call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Fetch context**: `cockpit_context(issue=<issue-ref>)`. The return's `clarificationComment.body` carries the engine-authored batch-comment template (raw). Parse it into per-question `{title, context, question, options}` per the shared batch-comment rule (`### Q<n>: <title>` headers + `**Context**:` / `**Question**:` / `**Options**:` labels; option bullets tolerant of `A:` and `A)` styles; free-form questions with no `**Options**:` label yield `options: null`).
2. **Spawn clarification drafter subagent** (see § Gate contract G.1 and the SB.1 return schema below). Invocation:
   ```
   subagent_type: "cockpit-clarifier"
   description: "Draft clarifications <issue-ref>"
   model: <cockpit.auto.agents.clarifier.model ?? cockpit.auto.agents.default.model — OMIT the line when neither is set>
   effort: <cockpit.auto.agents.clarifier.effort ?? cockpit.auto.agents.default.effort — OMIT the line when neither is set>
   prompt: <inlined open-question list + spec/plan bodies + touched-files context + return-schema directive>
   ```
   `model`/`effort` are read from the `cockpitAutoConfig` loaded at pre-flight (§ step 1). Behavioral contract: the `cockpit-clarifier` agent definition. It returns a single JSON value — either an array of `{question_id, recommendation, justification, provenance}` (one per open question, in order), or `{"error": "<description>"}`. `recommendation` is the chosen letter + its text (for lettered-option questions) OR the drafted free-form response (for free-form questions); `justification` is 1–3 sentences of *why over alternatives* (rendered under `**Why:**` and posted as `**Rationale:**`).
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
     2. `Make changes` — enter the re-loop (see § Directive grammar): parse operator-typed directives, apply them, re-present only the changed questions plus the same batch gate, loop until Approve or Skip. Zero directives is a no-op re-present, not an implicit approve or skip.
     3. `Skip this batch` — post nothing; do not advance; ledger line noting the skip.

   Built-in "Other" free-text is the **one-turn edit path**: directives typed there are parsed via the same rule (see § Directive grammar) and applied directly (edited answers posted verbatim, individual questions skipped) without the extra `Make changes` round-trip.
4. **Assemble comment body**: `<!-- generacy-cockpit:clarification-answers -->` marker + one `### Q<n>` block per approved (or edited) answer, in ascending question-number order, separated by a single blank line. Each block emits `**Answer:** <recommendation>` on one line and `**Rationale:** <justification>` on the next — read from the same drafter-return fields the presentation renders. For bare-letter operator overrides (a directive whose `rationale` is `null` per § Directive grammar), emit NO `**Rationale:**` line — never retain the draft's justification under an operator-overridden answer. Skipped questions do not appear. Write to `/tmp/cockpit-auto-clarify-<issue>-<unix_ts>.md`. Post via `gh issue comment "$ISSUE" --body-file <tmpfile>` — use `--body-file` exclusively (never `-b` / `--body`; shell quoting risks stripping the marker).
5. **Advance gate**: If every open question received an approved or edited answer, call `cockpit_advance(issue=<issue-ref>, gate="clarification")`. If some were skipped, do not advance — write a ledger line noting the partial state (`posted <k>/<N>, skipped <s>`) and continue.

**Ledger line**: `<issue-ref> · waiting-for:clarification · clarification-batch · <outcome>` where outcome is one of `advanced` / `posted <k>/<N>, skipped <s>` / `all answers skipped` / `error: <description>`.

**Failure modes**:
- Subagent returns `{"error": …}` → **Error handling** class `OTHER`; do not post; do not advance; ledger line noting the error.
- All answers skipped → do not post; do not advance; ledger line `all answers skipped`.
- Post fails → **Error handling**; ledger line noting the failure (do not attempt retraction).
- Advance fails → **Error handling**; ledger line noting the failure.

### D.2 — `waiting-for:<artifact>-review`

**Trigger**: An issue enters `waiting-for:spec-review`, `waiting-for:clarification-review`, `waiting-for:plan-review`, or `waiting-for:tasks-review`. Verbatim event string: `waiting-for:<artifact>-review`.

**Source of truth**: Read `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check on the enriched-line path; bare / malformed lines take the fallback path per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = artifact-review` (the single frozen enum value — the spec/clarification/plan/tasks distinction is folded into the `generation` discriminator as `<artifactKind>@<reviewBranchHeadSHA>`, per § Generation discriminator (UI mode); the per-artifact tokens would be rejected by the tool's `.strict()` schema, so the plugin MUST pass the enum value `artifact-review` verbatim). The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — pass the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId` from § In-memory loop state additions; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — known at record time and MANDATORY (§ D.12 step 3 keys its live-state supersession check on it; § D.12 step 4 routes on `(dispatchClass, optionId)`). The reuse-path record has no `inboxUrl`/`title`/`askedAt` (the query does not return them). Continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped to `cockpit_gate_open` success, which alone carries `inboxUrl`).
      - **`{ status: 'answered' }`** — answered, but no D.12 event has resolved it this session. Do NOT spawn the drafting subagent. Record the same partial entry with `status: 'answered'`, increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; tick sites supply every subsequent sweep's increment), and continue to the next event. Downstream D.12 delivery consumes the answer via the redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }`. Iterate `result.gates` and branch (same-generation is the more specific match and MUST be evaluated before drift):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as a query-unreachable error per sub-step 3 (abort this event's sweep with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content (the current run's `runId` derives a different `gateId`). Do **NOT** draft, do **NOT** open, do **NOT** supersede — byte-identical to the § step 3 § Adoption pass `adopt-natural` branch (per #471 / SC-006). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.2', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`/`title`/`askedAt`/`originalDraft` are NOT populated (DATA GAP). Continue to the next event.
        - **Non-terminal gate at a DIFFERENT `generation`** — generation drift. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the ack path accepts-and-ignores `runId`, so the ack lands regardless of which run opened the stale gate); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the draft-then-open flow below with the fresh generation. When multiple drift entries are present, ack the first non-terminal entry observed; remaining stale entries are acked on subsequent sweeps of the same event.
        - **Empty `gates` list** — no gate for this `(issueRef, gateType)` pair. Fall through to the draft-then-open flow below unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both tools return `{ status: 'ok', data }` or `{ status: 'error', class, detail }`; four classes are reachable: `query-unreachable` (sustained outage after the tool's retry budget), `invalid-args` (deterministic caller bug), `internal` (deterministic server/tool bug), `transport` (call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Resolve target artifact** — parse `<artifact>` from the transition class; identify the file to review (e.g., `specs/<issue-slug>/spec.md`, `plan.md`, `tasks.md`, `clarifications.md`).
2. **Spawn review-verdict analyzer subagent**. Invocation:
   ```
   subagent_type: "cockpit-reviewer"
   description: "Review artifact <name>"
   model: <cockpit.auto.agents.reviewer.model ?? cockpit.auto.agents.default.model — OMIT the line when neither is set>
   effort: <cockpit.auto.agents.reviewer.effort ?? cockpit.auto.agents.default.effort — OMIT the line when neither is set>
   prompt: <artifact path + gate name + review instructions + return-schema directive>
   ```
   `model`/`effort` are read from the `cockpitAutoConfig` loaded at pre-flight (§ step 1). Behavioral contract: the `cockpit-reviewer` agent definition. It returns a single JSON value — either an array of `[{file, line, summary, failure_scenario}, ...]`, `[]` for zero findings, or `{"error": "<description>"}`. The parent renders the parsed array as a findings-summary table; it never restates the JSON verbatim.
3. **Present fused verdict gate** (see § Gate contract G.2). In one assistant response: findings-summary table + `Suggested decision: <approve | request-changes>` line + single `AskUserQuestion` with options `approve` / `request-changes` / `abort` (in that order), header `Verdict`, `multiSelect: false`. For zero findings (`[]`), still present the gate — the row is `| (none) | | | |` with `Suggested decision: approve`.
4. **Apply verdict**:
   - `approve` → `cockpit_advance(issue=<issue-ref>, gate=<gate-name>)`.
   - `request-changes` → run the four-step guardrail below. The exact JSON body shape, GraphQL query, marker string, and ledger templates live in `specs/422-summary-auto-md-s/contracts/request-changes-post.md` and `specs/422-summary-auto-md-s/contracts/postcondition-check.md`; the prose here spells out the guardrail steps but never restates those shapes verbatim.
     1. **Pre-validate anchors** — fetch the PR diff via `gh pr diff <owner>/<repo>#<pr-n>`, parse `@@ -A,B +C,D @@` hunk headers into `DiffHunk[]`, and assign each `Finding` an `AnchorCheck` verdict per `data-model.md`: `anchored` iff `finding.line != null` AND ∃ hunk in the same file whose `[headStart, headStart + headCount − 1]` range contains `finding.line`; every other finding is `unanchored`, tagged with reason `analyzer-supplied-null` or `outside-diff-hunks`.
     2. **Compose bundle** — assemble the `ReviewPostBundle` per `contracts/request-changes-post.md` § POST body: one `comments[]` entry per anchored finding (`path`, `line`, `body: <summary> — <failure_scenario>`); unanchored findings render into `body` under the literal marker `<!-- generacy-cockpit:unanchored-findings -->` immediately followed by `## General findings (no file anchor)`, per contract § Unanchored-block shape. **Refuse to POST when `comments.length == 0` AND unanchored count == 0** — a `request-changes` on zero findings is a contract violation (Error handling class `OTHER`).
     3. **POST** — `gh api -X POST /repos/<owner>/<repo>/pulls/<pr-n>/reviews --input <bundle>`; capture the response's `.id` and `.submitted_at`. Exit 0 is required to proceed. The POST response body does NOT carry a `comments` field; Leg 1 counts inline comments via a separate REST endpoint.
     4. **Verify (two legs)** per `contracts/postcondition-check.md` § Combined verdict:
        - **Leg 1** — see `contracts/postcondition-check.md § Leg 1` for the paginated GET-and-filter procedure (single source of truth): `gh api --paginate /repos/<owner>/<repo>/pulls/<pr-n>/comments?per_page=100`, filter to `pull_request_review_id == response.id`, early-exit at `bundle.comments.length`, inline poll 500 ms → 1 s → 2 s across four attempts. `Leg1Check.outcome == "genuine-undercount"` (never `undefined.length`) is the failure signal that trips the outer 2 s → re-POST retry.
        - **Leg 2** — run the `reviewThreads(first:50)` GraphQL query from the same contract; filter client-side to nodes matching ALL of: `isResolved == false`, `comments.nodes[0].author.login == <acting-bot-login>` (both sides under `postcondition-check.md § Login normalization`), `comments.nodes[0].createdAt >= response.submitted_at`. Filtered count MUST be `≥ bundle.comments.length`.
        Success ⇔ both legs pass. On failure: sleep 2000 ms, retry the POST once; if the second attempt's postcondition also fails, re-present G.2 (see § Gate contract G.2 — re-presentation shape) with the failure notice prepended. On success (first attempt or after retry), emit the `Feedback posted: N inline comment(s) on PR #<pull_number>` success line (N = anchored count) — the only marker downstream steps read to confirm the POST landed.
     5. **No `cockpit_advance`** — unresolved threads own the transition; the server-side `PrFeedbackMonitorService` applies `waiting-for:address-pr-feedback` and enqueues fix work. Calling `advance` here races the server.
   - `abort` → do nothing (no post, no advance).

**Ledger line**: `<issue-ref> · waiting-for:<artifact>-review · review-analysis+<verdict> · <outcome>` — outcomes: `approved` / `posted (<anchored> inline, <unanchored> in body)` (first-attempt success) / `postcondition-failed → re-present-gate` (failed after retry) / `aborted` / `advance failed` / `error: <description>`. See § Ledger cheatsheet for the postcondition-passed/failed and review-post-retry line shapes emitted around the request-changes POST.

**Failure modes**: `[]` still prompts the gate (assist-mode contract preserved). `{"error": …}` → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Parse failure or other shape → **Error handling** with the raw return quoted.

### D.3 — `waiting-for:implementation-review`

**Trigger**: A PR enters `waiting-for:implementation-review`. Verbatim event string: `waiting-for:implementation-review`.

**Source of truth**: Read `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check on the enriched-line path; bare / malformed lines take the fallback path per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**: The post-validate `waiting-for:implementation-review` gate is a **final human approval** (moved post-validate by engine epic generacy-ai/generacy#1120). The engine has already run review → remediate → validate server-side; there is **no fresh verdict to compute cluster-side and no `cockpit-reviewer` subagent is spawned** (FR-001 / SC-002). `auto` renders `(none)` — there is no findings artifact on either the post-validate or legacy path — and offers an approve/hold/reject decision — see § Gate contract G.8. The **trigger, Source-of-truth, and Step 0** blocks are preserved from the pre-#1120 contract (identity/drift/adoption machinery — gateType stays `implementation-review`, generation = PR head SHA); only the analysis + verdict-application content below changed. On a **legacy** (flag-off / pre-relocation) engine the same gate fires pre-validate; step 4 detects the model at runtime and step 5 routes `approve` accordingly (post-validate → merge, legacy → `cockpit_advance(issue, gate="implementation-review")`, undetectable → fail closed).

0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = implementation-review`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — pass the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId` from § In-memory loop state additions; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — known at record time and MANDATORY (§ D.12 step 3 keys its live-state supersession check on it; § D.12 step 4 routes on `(dispatchClass, optionId)`). The reuse-path record has no `inboxUrl`/`title`/`askedAt` (the query does not return them). Continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped to `cockpit_gate_open` success, which alone carries `inboxUrl`).
      - **`{ status: 'answered' }`** — answered, but no D.12 event has resolved it this session. Do NOT spawn the drafting subagent. Record the same partial entry with `status: 'answered'`, increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; tick sites supply every subsequent sweep's increment), and continue to the next event. Downstream D.12 delivery consumes the answer via the redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }`. Iterate `result.gates` and branch (same-generation is the more specific match and MUST be evaluated before drift):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as a query-unreachable error per sub-step 3 (abort this event's sweep with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content (the current run's `runId` derives a different `gateId`). Do **NOT** draft, do **NOT** open, do **NOT** supersede — byte-identical to the § step 3 § Adoption pass `adopt-natural` branch (per #471 / SC-006). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.3', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`/`title`/`askedAt`/`originalDraft` are NOT populated (DATA GAP). Continue to the next event.
        - **Non-terminal gate at a DIFFERENT `generation`** — generation drift. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the ack path accepts-and-ignores `runId`, so the ack lands regardless of which run opened the stale gate); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the draft-then-open flow below with the fresh generation.
        - **Empty `gates` list** — no gate for this `(issueRef, gateType)` pair. Fall through to the draft-then-open flow below unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both tools return `{ status: 'ok', data }` or `{ status: 'error', class, detail }`; four classes are reachable: `query-unreachable` (sustained outage after the tool's retry budget), `invalid-args` (deterministic caller bug), `internal` (deterministic server/tool bug), `transport` (call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Resolve PR** — from `cockpit status --json`, get the issue's associated PR ref (`<owner>/<repo>#<pr-n>`).
2. **Render findings — none exist for this gate.** The engine ran review → remediate → validate server-side; the on-ci-green implementation-review branch posts **no findings comment** (`phase-loop.ts:1435-1453`) and the gate record carries no findings. G.8 therefore renders the single body row `| (none) | | | |` unconditionally on either the post-validate or legacy path; **no `cockpit-reviewer` subagent is spawned** (FR-001 / SC-002).
3. **Present final-approval gate** (see § Gate contract G.8). In one assistant response: findings-summary table (from step 2) + single `AskUserQuestion` with options `approve` / `hold` / `reject` (in that order), header `Approve?` (≤ 12 chars), `multiSelect: false`.
4. **Resolve the engine gate model** (runtime-authoritative capability detection — FR-001, Q1=D). Before applying the `approve` verdict, read the issue's live labels — from the enriched doorbell line's `labels` field (§ Enriched-line dispatch contract E3; **no extra query** on the enriched-line path) or the `cockpit_status(issue=<issue-ref>, json=true)` fallback for bare / malformed lines — and branch on whether `completed:validate` **co-occurs** with `waiting-for:implementation-review`:
   - `completed:validate` **present** → **post-validate** model (engine ran review → remediate → validate server-side; epic generacy-ai/generacy#1120's gate move is active). This is the case the slimmed playbook was designed for.
   - `completed:validate` **absent** → **legacy** model (pre-relocation / flag-off; `reviewPhaseEnabled` / `ciMergeGateEnabled` default false — the common deployed state). The gate fired pre-validate and the engine expects the client to answer the labeled gate. Treated as **provisional** legacy: the fail-closed branch (step 6) fires only if the legacy advance is itself rejected by the engine.

   This runtime co-occurrence is the **authoritative** compatibility signal — the § step 1 pre-flight `generacy --version` echo is advisory only (no engine surface reports the gate model). The Step 0 identity/drift/adoption machinery above is unchanged (gateType stays `implementation-review`, generation = PR head SHA, `runId` threading); only the verdict application below branches on the detected model.
5. **Apply verdict** (branch on the model detected in step 4):
   - `approve`, **post-validate** model → cockpit merge path (D.5 step 2): `cockpit_merge(issue=<issue-ref>)` — **merge on green, never on red** (invariant §1). The tool resolves the issue's linked PR internally.
   - `approve`, **legacy** model → `cockpit_advance(issue=<issue-ref>, gate="implementation-review")` (restores the branch agency#500 removed). Applies `completed:implementation-review` server-side and hands control back to the engine's own validate → merge gate cadence — it does **not** merge (invariant §1: the engine still owns the green/red validate and the merge). Use `cockpit_advance`, **NOT** `cockpit_resume` (mirrors the D.4 `manual-validation` and D.13 `remediation-limit` labeled-gate-answer idiom; `cockpit_resume` is process/paused-issue resume, the wrong verb).
   - `approve`, **legacy** advance **rejected by the engine as an unknown gate** → **fail closed** (step 6): neither the post-validate nor the legacy model is servable.
   - `hold` / `reject` → do nothing in every model (the label stays; the gate re-fires when the operator or engine takes another action — mirrors D.4 `not yet`). No label writes (add-only invariant §3).
6. **Fail closed** (neither model servable — FR-002, FR-004). Reached only when the provisional legacy `cockpit_advance(issue=<issue-ref>, gate="implementation-review")` from step 5 is rejected by the engine as an unknown / unrecognized gate — the engine emitted `waiting-for:implementation-review` without `completed:validate` (not post-validate) **and** does not accept the legacy advance (not pre-relocation). Print verbatim:

   ```
   /cockpit:auto cannot determine this generacy engine's implementation-review gate model. The engine raised `waiting-for:implementation-review` without `completed:validate` (so not the post-validate #1120 model) and rejected `cockpit_advance(issue, gate="implementation-review")` (so not the legacy pre-relocation model). This usually means the engine's `reviewPhaseEnabled` and `ciMergeGateEnabled` flags are both off and the build predates #1120's gate move. Enable `reviewPhaseEnabled` / `ciMergeGateEnabled` on the cluster's generacy build, upgrade to a build that ships generacy#1120, or drive the epic manually with /cockpit:watch, /cockpit:status, and /cockpit:advance.
   ```

   Then adopt the pre-flight hard-fail idiom (byte-mirrors the Monitor-absence `:208–214` / doorbell-absence `:218–224` fails): exit the run **non-zero** and **halt the loop** (no further dispatch). No label writes (§3 add-only). Because the ledger directory already exists at runtime — unlike the pre-flight sibling fails this idiom mirrors — this branch DOES write a terminal `fail-closed: <detail>` ledger line before exiting.

**Ledger line**: `<issue-ref> · waiting-for:implementation-review · implementation-review-approval+<verdict> · <outcome>` — outcomes: `merged (PR #<n>)` (post-validate / approve) / `advanced (implementation-review)` (legacy / approve) / `held` / `rejected` / `blocked: <reason>` (merge-path blocked reasons as in D.5) / `fail-closed: <detail>` (neither model servable) / `error: <description>`.

### D.4 — `waiting-for:manual-validation`

**Trigger**: An issue enters `waiting-for:manual-validation` (implementation approved, awaiting manual smoke test). Verbatim event string: `waiting-for:manual-validation`.

**Source of truth**: Read `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check on the enriched-line path; bare / malformed lines take the fallback path per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = manual-validation`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — pass the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId` from § In-memory loop state additions; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — known at record time and MANDATORY (§ D.12 step 3 keys its live-state supersession check on it; § D.12 step 4 routes on `(dispatchClass, optionId)`). The reuse-path record has no `inboxUrl`/`title`/`askedAt` (the query does not return them). Continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped to `cockpit_gate_open` success, which alone carries `inboxUrl`).
      - **`{ status: 'answered' }`** — answered, but no D.12 event has resolved it this session. Do NOT spawn the drafting subagent. Record the same partial entry with `status: 'answered'`, increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; tick sites supply every subsequent sweep's increment), and continue to the next event. Downstream D.12 delivery consumes the answer via the redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }`. Iterate `result.gates` and branch (same-generation is the more specific match and MUST be evaluated before drift):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as a query-unreachable error per sub-step 3 (abort this event's sweep with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content (the current run's `runId` derives a different `gateId`). Do **NOT** draft, do **NOT** open, do **NOT** supersede — byte-identical to the § step 3 § Adoption pass `adopt-natural` branch (per #471 / SC-006). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.4', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`/`title`/`askedAt`/`originalDraft` are NOT populated (DATA GAP). Continue to the next event.
        - **Non-terminal gate at a DIFFERENT `generation`** — generation drift. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the ack path accepts-and-ignores `runId`, so the ack lands regardless of which run opened the stale gate); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the draft-then-open flow below with the fresh generation.
        - **Empty `gates` list** — no gate for this `(issueRef, gateType)` pair. Fall through to the draft-then-open flow below unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both tools return `{ status: 'ok', data }` or `{ status: 'error', class, detail }`; four classes are reachable: `query-unreachable` (sustained outage after the tool's retry budget), `invalid-args` (deterministic caller bug), `internal` (deterministic server/tool bug), `transport` (call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Spawn manual-validation summarizer subagent** — the parent MUST NOT read the spec / issue body / PR body inline (Q4=B, AP-9). All artifact reads happen inside the subagent. Invocation:
   ```
   subagent_type: "cockpit-validator"
   description: "Manual val summary <issue-ref>"
   model: <cockpit.auto.agents.validator.model ?? cockpit.auto.agents.default.model — OMIT the line when neither is set>
   effort: <cockpit.auto.agents.validator.effort ?? cockpit.auto.agents.default.effort — OMIT the line when neither is set>
   prompt: <issue-ref + PR-ref + read-and-summarize instructions + return-schema directive>
   ```
   `model`/`effort` are read from the `cockpitAutoConfig` loaded at pre-flight (§ step 1). Behavioral contract: the `cockpit-validator` agent definition. It returns a single JSON value — either `{scenarios: [...], acceptance_checks: [...]}` (one-line entries in each list) or `{"error": "<description>"}`.
2. **Present manual-validation gate** (see § Gate contract G.3). In one assistant response: `**Scenarios to test:**` bulleted list + `**Acceptance checks:**` bulleted list (rendered verbatim from the structured return) + single `AskUserQuestion` with options `manually validated` / `not yet`, header `Validated?` (≤ 12 chars), `multiSelect: false`.
3. **Apply verdict**:
   - `manually validated` → `cockpit_advance(issue=<issue-ref>, gate="manual-validation")`.
   - `not yet` → do nothing (the label stays; the event re-fires when the operator confirms later or takes another action).

**Ledger line**: `<issue-ref> · waiting-for:manual-validation · manual-validation-summary+<verdict> · <outcome>` — outcomes: `manually validated` / `not yet` / `error: <description>`.

**Failure modes**: `{"error": …}` → **Error handling** class `OTHER`; do not invoke gate; ledger line.

### D.5 — `completed:validate` (checks green) → merge without gate

**Trigger**: An issue enters `completed:validate` with all PR checks green. Verbatim event string: `completed:validate`.

**Source of truth**: reads `to`, `labels`, and `checks` from the enriched doorbell line per § Enriched-line dispatch contract E3/E4 — decisive `checks: "green"` merges without a per-event re-check; `checks: absent | pending` (Q4=B) or a bare / malformed line fires the fallback. `· source: enriched-line` suffix on the enriched-line path only (E6).

**Dispatch**:
1. **Resolve `checks` verdict.** Prefer the enriched line's `checks` field (E4). `checks: "green"` → proceed to the implementation-review guard (step 2). `checks: "red"` → fall through to D.6. `checks` **absent OR `pending`** → single authoritative `cockpit_status(issue=<issue-ref>, json=true)`: verify `checks_state == "green"` and no infrastructure/runner failures; a red fallback verdict falls through to D.6. When this fallback re-query fires, read `waiting-for:implementation-review` from the SAME response so the step-2 guard needs no second round-trip.
2. **Implementation-review co-presence guard (green path, before merge).** Evaluate `waiting-for:implementation-review` against the enriched line's `labels` field (E1), or against the folded step-1 re-query when the line is non-decisive:
   - **present** (co-present with `completed:validate`) → **DEFER** (passive no-op): write the D.5 ledger row with outcome token `deferred: implementation-review pending` and drop the event. On DEFER, D.5 does NOT call `cockpit_merge`, does NOT call `cockpit_gate_open`, writes NO label, and does NOT invoke the G.8 presentation path (add-only advance invariant §3). The co-present `waiting-for:implementation-review` transition is D.3's own trigger, which presents G.8; `approve` at G.8 performs the merge (`auto.md:1494`).
   - **absent** (confirmed absent from a well-formed `labels` list) → merge (step 3) — the legacy / already-approved path, unchanged (SC-002).
   - **non-decisive** (`labels` absent / bare / malformed) → fail safe: a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` re-query (fold into the step-1 `checks` fallback when that already fired). Merge only if `waiting-for:implementation-review` is confirmed absent; if present → DEFER; if still non-decisive or the re-query errors → DEFER. Absence-of-signal is NEVER treated as absence-of-gate.
3. **Merge**: `cockpit_merge(issue=<issue-ref>)` (squash, branch delete per the tool's default; the tool resolves the issue's linked PR internally — never pass a PR ref directly).
4. **No gate.** When `waiting-for:implementation-review` is absent, operator judgment was recorded at `waiting-for:implementation-review` (D.3) and `validate` + green checks is mechanical; when it is co-present the merge is deferred to G.8 (step 2) and D.5 never presents a gate itself.

**Never merge on red** — the branch exists here strictly on the `result: merged` outcome (invariant §1). The green-path guard (step 2) runs only after checks resolve green; it never merges past a co-present `waiting-for:implementation-review`.

**Ledger line**: `<issue-ref> · completed:validate · merge · <outcome>` — outcomes: `merged (PR #<n>)` / `deferred: implementation-review pending` / `blocked: missing-approval` / `blocked: draft` / `blocked: pending` / `blocked: missing-label` / `infrastructure failure — <checks>`. The `deferred: implementation-review pending` row is a passive no-op (step 2 DEFER): D.5 writes the row and drops the event without any tool call or label write.

**Failure modes**:
- Merge returns `result: "red"` → fall through to D.6 (ledger-only, engine-owned remediate).
- Merge returns `result: "blocked"` → handle per `merge.md`'s decision tree (missing-label / missing-approval / draft / pending). For `pending`, defer to the watcher (do not poll); for other blocked reasons, ledger line and continue.
- Infrastructure/runner failure → ledger line `infrastructure failure — <check names>` and continue.

### D.6 — `completed:validate` (red) / merge red → ledger-only (engine-owned remediate)

**Trigger**: `completed:validate` with an enriched line `checks: "red"` verdict (E4), OR (on `checks: absent | pending` fallback per Q4=B) a `cockpit_status(issue=<issue-ref>, json=true)` returning `checks_state == "red"`, OR a merge call in D.5 returned `result: "red"`.

**Source of truth**: as D.5 — a decisive `checks: "red"` verdict writes the ledger-only row (engine-owned remediate, per Dispatch step 2) without a per-event re-check; fallback on `absent | pending` or bare / malformed lines; `· source: enriched-line` suffix on the enriched-line path only (E6).

**Dispatch**:
1. **Classify failing checks** — infrastructure/runner failures are recorded as such (repo-owned CI classes only: tests / lint / typecheck / build).
2. **Ledger line only — no subagent.** The engine's remediate loop owns red validate: it computes the verdict, loops delta-scoped re-reviews server-side, and re-fires `completed:validate` red as an engine gate (remediation / remediation-limit). `auto` **does not** spawn a `cockpit-fixer` subagent, does not present an escalation gate, and does not write labels here (FR-001, Q4 / SC-002). Write the ledger line and continue.

**Never merge on red** — the merge path (D.5) exits on `result: merged` only (invariant §1); this row never advances to merge.

**Ledger line**: `<issue-ref> · completed:validate:red · (no-op) · engine-owned remediate` — the red validate is engine-owned and re-fires as an engine gate; if the failing checks are infrastructure/runner failures, append `— infrastructure failure: <check names>`.

### D.7 — `agent:error` / `failed:*` → escalation gate (Requeue path)

**Trigger**: An issue enters `agent:error` or any `failed:*` state. Verbatim event strings: `agent:error` and `failed:` (matching any `failed:<subtype>`).

**Source of truth**: reads `to` (`agent:error` or `failed:<subtype>`) and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check on the enriched-line path; bare / malformed lines fire the fallback per FR-005. `· source: enriched-line` suffix on the enriched-line path only (E6). Evidence fetch is separate — `cockpit_context(issue=<issue-ref>)` remains the sole evidence-fetch tool (step 1).

**Dispatch classification**: a **first dispatch** is the issue's first `agent:error` / `failed:*` event within the current contiguous auto invocation; a **repeat dispatch** is any second-and-subsequent failure-class event on the same issue in one invocation, regardless of `failed:<subtype>` match. Session restart resets first-vs-repeat state (session-local grain).

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`. **This step 0 applies to BOTH first-dispatch AND repeat-dispatch paths** (§ Dispatch classification above):

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = escalation` (the `generation` discriminator folds `<subtype>:<triggeringLabelOrState>:<occurrence>` per § Generation discriminator (UI mode)). The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId`; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}` — `dispatchClass` is THIS row's `D.n` identifier, MANDATORY (§ D.12 routing on `(dispatchClass, optionId)`); no `inboxUrl`/`title`/`askedAt`; the "one pointer line" is NOT printed. Continue to the next event.
      - **`{ status: 'answered' }`** — answered but not yet resolved by a D.12 event this session. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape, `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added), and continue to the next event; D.12 redelivery + `deliveryId` dedup consumes the answer.
      - **`{ status: 'absent' }`** — no gate at this exact `gateId`. **The generation-drift branch is DISABLED for this row.** D.7 opens `gateType: 'escalation'` (shared by D.7/D.10/D.11); a `cockpit_gate_list` entry carries only `{gateId, gateType, generation, status, runId}`, so the § Pre-draft check — shared rules **generation-drift branch guard** condition 2 fails — superseding could destroy another escalation row's live gate. Do NOT recover the subtype by parsing `generation` (opaque wire string). **Residual limitation**: escalation-subtype drift is undetectable; a stale escalation gate stays non-terminal alongside the fresh one ([generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)). **However, the SAME-generation adoption branch DOES fire on this row (per #471 / SC-006)** — it keys on `gateId` identity, not subtype. Call `cockpit_gate_list({ issueRef, gateType })` (MUST NOT carry `runId` per FR-011 / R4) and iterate `result.gates`:
        - **`result.truncated === true` AND no same-generation entry in the returned page** — treat as a query-unreachable error per sub-step 3 (abort with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME escalation gate; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId`. Do **NOT** draft, do **NOT** open, do **NOT** supersede. Adopt: add a `GateRecord` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.7', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (FR-010 / SC-012). Continue to the next event. (This branch is the sole adoption path for issues entering scope after the startup sweep.)
        - **Anything else** (drift entries at different generation; same-generation but terminal; empty list) — do **NOT** ack anything `superseded`; fall through to the draft-then-open flow (below).
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** The four reachable error classes are `query-unreachable`, `invalid-args`, `internal`, and `transport`. Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row, prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Fetch evidence** — the parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`. **No ad-hoc `gh` chains, no link-following, no inline comment-fetching in the parent.** If the diagnosis subagent routinely needs a specific artifact, fix the engine bundle (generacy-side), not the parent envelope.
   - **First dispatch**: call `cockpit_context(issue=<issue-ref>)`; the engine bundle payload is the first-dispatch evidence, forwarded to the subagent per step 2.
   - **Repeat dispatch**: call `cockpit_context(issue=<issue-ref>)` again — same evidence verb. **No dispatch of a repeat D.7 without the new alert body in hand.** The parent is pure transport: fetch the fresh alert and hand it to the subagent verbatim. **The parent MUST NOT characterize the fresh failure** ("requeue failed identically", "same as before", or any parent-authored similarity summary) — the subagent, not the parent, determines same-or-different from the evidence; parent-authored summaries of evidence are forbidden in diagnosis prompts.
2. **Spawn diagnosis subagent** — for any further work (repro, log reads, bisecting versions, branch inspection, downstream artifact fetch), dispatch to a diagnosis subagent. Behavioral contract: the `cockpit-diagnoser` agent definition. On unrecoverable error the subagent returns `{"error": "<description>"}`.
   - **First dispatch invocation**:
     ```
     subagent_type: "cockpit-diagnoser"
     model: <cockpit.auto.agents.diagnoser.model ?? cockpit.auto.agents.default.model — OMIT the line when neither is set>
     effort: <cockpit.auto.agents.diagnoser.effort ?? cockpit.auto.agents.default.effort — OMIT the line when neither is set>
     description: "Diagnose <issue-ref> failure"
     prompt: <issue-ref + failure-context payload + gate-option-set directive + return-schema directive>
     ```
     `model`/`effort` are read from the `cockpitAutoConfig` loaded at pre-flight (§ step 1). Return contract on first dispatch: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. `failure_class_changed` and `failure_classes_seen` are absent (or explicitly `null`) on first dispatch.
   - **Repeat dispatch invocation** — SendMessage to the existing diagnosis subagent if still live; **fresh spawn** (same invocation shape) with **both** the verbatim prior alert body AND the fresh alert body in the prompt if the subagent has returned or been disposed across the Requeue window (the prior alert is a persistent engine-marked comment on the issue — never lost). In either form, the continuation prompt contains:
     - The verbatim **new alert body** (from the fresh `cockpit_context` return payload's failure-alert comment).
     - Either the prior-context reference ("continuing from earlier diagnosis" — SendMessage form) OR the verbatim **prior alert body** (fresh-spawn form).
     - **No parent-authored summary of similarity** between fresh and prior — the subagent determines `failure_class_changed` from the two evidences. Feeding a prior *verdict* (read from the ledger) instead of the prior *alert body* is also forbidden.
     - The verdict-return-schema addendum instruction (below).
   - **Verdict return-schema addendum on repeat dispatches**: the JSON return payload grows two required fields on repeat dispatches (both absent or `null` on first dispatch). Absence of either on a repeat dispatch is a contract violation the parent MUST detect and treat as a subagent error (return `{"error": "verdict missing failure_class_changed and/or failure_classes_seen on repeat dispatch"}` to G.4(b) as a subagent-error class).
     - **`failure_class_changed: boolean`** — computed by the subagent from the fresh and **immediately-prior** alert bodies (not the original first-dispatch alert). `failure_class_changed = true` iff *any* of three dimensions differs: (1) `classifier_reason` field (engine-authored, exact string match, absent-vs-present differs); (2) `error_taxonomy` field (engine-authored, exact string match, absent-vs-present differs); (3) canonical failing-test/step identifier (`<file>::<name>` form for test failures; equivalent stable identifier for non-test failing steps — **never raw line text**, which drifts across runs; absent-vs-present differs).
     - **`failure_classes_seen: string[]`** — running list of failure classifier identifiers observed across this issue's repeat dispatches in the current session. On the second dispatch (first repeat), initialized as `[<class1>, <class2>]` (`<class1>` = the first-dispatch alert's classifier identifier, `<class2>` = the fresh alert's). On the N-th dispatch (N ≥ 3), the subagent takes the running list from the immediately-prior verdict's `failure_classes_seen` and appends the fresh alert's classifier identifier. `classifier_id` derivation priority: `classifier_reason` if present, else `error_taxonomy` if present, else the canonical failing-test identifier, else `<unclassified>`. Rendered at the G.4(b) gate as a "classes this session: `<class1>` → `<class2>` → …" line — cycles like A → B → A are visible in one row.
3. **Present escalation gate** (see § Gate contract G.4b). In one assistant response: five-element presentation block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with options `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. **On repeat dispatches**, the presentation block gains a sixth element between "Evidence" and "Current state": `**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)`, populated verbatim from the verdict's `failure_class_changed` and `failure_classes_seen` fields. No in-parent re-analysis.
4. **Apply verdict**:
   - `Requeue` → `cockpit_resume(issue=<issue-ref>)` (clears `agent:error` / `failed:*`, restores the phase's `waiting-for:` / `completed:` resume pair).
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Degradation clause**: If `cockpit_resume` is unavailable, Requeue degrades to Skip with an explicit ledger note: `<issue-ref> · <transition> · escalation-gate · skip (cockpit resume unavailable — G-S8 prerequisite)`.

**Ledger line**: `<issue-ref> · <agent:error | failed:<subtype>> · escalation-gate · <outcome>` — outcomes: `requeue (cockpit resume)` / `requeue failed: <description>` / `skip (session-local mute)` / `skip (cockpit resume unavailable — G-S8 prerequisite)` / `stop (exit)`.

**Failure modes**: `cockpit_resume` returns a typed error → **Error handling** class `OTHER`; ledger line; leave the issue in its failed state (do not retry automatically).

### D.8 — `phase-complete` → phase-queue confirmation gate

**Trigger**: A phase completes (all its issues terminal); S8 emits `phase-complete` when the next phase is ready to queue. Verbatim event string: `phase-complete`. **Only fires in epic mode (`invocationForm: epic`).** Also fires on the synthetic **`phase-bootstrap`** event the step-3 startup sweep emits on a fresh epic — identical dispatch and G.5 gate, targeting the first incomplete phase P&lt;first&gt; (see § step-3 **Fresh-epic bootstrap** and § G.5 **Bootstrap variant**). The wire `transitionClass` is `phase-bootstrap` (distinct `gateId`); under `ResolvedGateMode === "ui"` the bootstrap confirm opens via `cockpit_gate_open` — never a local `AskUserQuestion`.

**Source of truth**: D.8 **retains the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check** per § Enriched-line dispatch contract E3 — the phase-queue gate is a consequential surface whose ad-hoc-issues enumeration requires authoritative per-ref state. No `source: enriched-line` suffix (E6).

**Dispatch**:
1. **Compute next phase scope** — from `cockpit_status(epic=<epic-ref>, json=true)`, identify the next phase (P<next>) and its N issues.
2. **Compute open ad-hoc issues** — `openAdHocIssues(<epic-ref>, ledger)`: filter ledger `scope-add` and `filing-gate+scope-add` action lines (successful outcomes) to the refs whose live state per `cockpit_status` is non-terminal, in scope-add (chronological) order.
3. **Present phase-queue gate** (see § Gate contract G.5). In one assistant response: presentation block with the next-phase issue list numbered with titles, followed — **only when the ad-hoc list is non-empty** — by a `Open ad-hoc issues in scope (added mid-run):` block enumerating each open ad-hoc ref as `<owner>/<repo>#<n> · <title> · <live-state>`. Empty ad-hoc list omits the block entirely (no `(none)` placeholder). Then a single `AskUserQuestion`:
   - **Empty ad-hoc list (unchanged behavior)**: options `Queue P<next> (<N> issues) (Recommended)` / `Cancel`.
   - **Non-empty ad-hoc list**: options `Hold — <M> open ad-hoc issue(s) in scope (Recommended)` / `Queue P<next> (<N> issues)` / `Cancel`, where `<M>` is the open ad-hoc count. The recommendation flips to `Hold`; `Queue P<next>` remains selectable (queueing while ad-hoc work is open stays *possible* but never *silent*).

   Header `QueueP<next>`, `multiSelect: false`.
4. **Apply verdict**:
   - `Queue P<next>` → `cockpit_queue(epic=<epic-ref>, phase="P<next>")` (the tool has no interactive confirm; the gate itself is the sole confirmation). Under a non-empty ad-hoc list, the ledger outcome carries the ad-hoc count.
   - `Hold` (only under non-empty ad-hoc list) → do NOT call `cockpit_queue`; the `phase-complete` state persists; the loop continues.
   - `Cancel` → ledger line noting the cancellation; continue loop.

**Ledger line**: `<epic-ref> · phase-complete · phase-queue-gate · <queued P<next> (<N> issues) | queued P<next> (<N> issues) with <M> ad-hoc open | held (<M> ad-hoc open) | cancelled>`.

If `cockpit_status` fails for one or more ad-hoc refs during the helper call, omit those refs from the enumeration and write `<epic-ref> · phase-complete · openAdHocIssues · error: cockpit_status failed for <ref>: <description>` before firing the gate; the gate still presents the partial list.

### D.9 — `waiting-for:address-pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:address-pr-feedback`. Verbatim event string: `waiting-for:address-pr-feedback`.

**Dispatch**: **Ledger line only.** No tool call (no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The `<transition-class>` slot is populated from the enriched line's `to` field as-received; `· source: enriched-line` suffix on the enriched-line path, no suffix (equivalent to `source: re-query`) on fallback (per § Enriched-line dispatch contract E6).

**Ledger line**: `<issue-ref> · waiting-for:address-pr-feedback · (no-op) · server-side-owned`.

### D.9a — `waiting-for:pr-feedback` → ledger only

**Trigger**: An issue enters `waiting-for:pr-feedback`. Verbatim event string: `waiting-for:pr-feedback`. Legacy alias of D.9's engine-owned feedback loop (some pre-migration epics still emit the shorter label).

**Dispatch**: **Ledger line only.** No tool call (no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. Same `<transition-class>` slot and `· source: enriched-line` suffix rules as D.9 (E6).

**Ledger line**: `<issue-ref> · waiting-for:pr-feedback · (no-op) · server-side-owned`.

### D.9b — `waiting-for:children-complete` → ledger only

**Trigger**: An epic-container issue enters `waiting-for:children-complete`. Verbatim event string: `waiting-for:children-complete`. The running auto loop *is* its resolution — on the last child's completion the label transitions naturally to `epic-complete` without operator input.

**Dispatch**: **Ledger line only.** No tool call (no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. Same `<transition-class>` slot and `· source: enriched-line` suffix rules as D.9 (E6).

**Ledger line**: `<issue-ref> · waiting-for:children-complete · (no-op) · server-side-owned`.

### D.9c — `waiting-for:dependencies` → ledger only

**Trigger**: An issue enters `waiting-for:dependencies`. Verbatim event string: `waiting-for:dependencies`. Engine-owned cross-issue wait — resolved server-side when the depended-on issue transitions.

**Dispatch**: **Ledger line only.** No tool call (no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. Same `<transition-class>` slot and `· source: enriched-line` suffix rules as D.9 (E6).

**Ledger line**: `<issue-ref> · waiting-for:dependencies · (no-op) · server-side-owned`.

### D.9d — `phase:*` → ledger only

**Trigger**: An issue enters any `phase:*` state. **Prefix-match**: any transition class whose token begins with the literal `phase:` prefix matches this row (`phase:specify` … `phase:validate`, and any future workflow-phase addition — the phase set is workflow-dependent and open-ended).

**Dispatch**: **Ledger line only.** No tool call (no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Same `<transition-class>` slot and `· source: enriched-line` suffix rules as D.9 (E6). Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (an unrecognized `waiting-for:*` or `blocked:*` still fires D.10).

**Ledger line**: `<issue-ref> · <phase:*-token> · (no-op) · engine-owned phase transition`.

### D.11 — `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` → escalation gate (I've resolved it / Skip / Stop)

**Trigger**: Verbatim event strings (either fires this row): `waiting-for:merge-conflicts` (base-sync merge conflict; operator resolution required) OR `blocked:stuck-merge-conflicts` (engine auto-remedy attempted AND failed). The classifier applies both labels together for a single stuck-merge incident, so the two events co-occur per issue — the step-1 dedup (dispatched-issues set) ensures one incident produces one gate. The label that surfaced first is the `<source-label>` for the ledger, the subagent prompt, and the G.4d presentation.

**Source of truth**: D.11 **retains the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check** per § Enriched-line dispatch contract E3 — a stale-line dispatch could gate on a conflict the engine already auto-remedied. Evidence fetch is separate — `cockpit_context(issue=<issue-ref>)` remains the sole evidence-fetch tool (step 1a). No `source: enriched-line` suffix (E6).

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   **D.11 ordering exception (Q5=A / FR-010).** In D.11 ONLY, the in-memory `dispatched-issues` set check (step 1 below) is consulted from step 0's `absent` return, BEFORE step 0 falls through to the draft-then-open flow. The escalation generation discriminator folds the triggering label into `generation`, so the label-pair `waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` hashes to two DIFFERENT `gateId`s per incident — event 2 (sibling label) sees `absent` at its own `gateId` even though event 1 already opened this incident's gate, and without the exception would open a SECOND gate. Operationally: on `absent` return, if `<issue-ref>` is present in `dispatched-issues`, write ledger line `<issue-ref> · <source-label> · escalation-gate · already-dispatched` and return to the main loop. The exception applies ONLY to the `absent` return; the `open` / `answered` reuse branches (matching gateId) still fire normally without touching step 1.

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = escalation`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId`; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}` — `dispatchClass` is THIS row's `D.n` identifier, MANDATORY (§ D.12 routing); no `inboxUrl`/`title`/`askedAt`; the "one pointer line" is NOT printed. Continue to the next event.
      - **`{ status: 'answered' }`** — answered but not yet resolved by a D.12 event this session. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape, `status: 'answered'`), increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added), and continue to the next event; D.12 redelivery + `deliveryId` dedup consumes the answer.
      - **`{ status: 'absent' }`** — no gate at this exact `gateId`. **The generation-drift branch is DISABLED for this row**, for the same reason as D.7: D.11 opens `gateType: 'escalation'` (shared with D.7/D.10) and a `cockpit_gate_list` entry (`{gateId, gateType, generation, status, runId}`) does not say which row opened a listed gate — the § Pre-draft check — shared rules **generation-drift branch guard** condition 2 fails; superseding could destroy another escalation row's live gate. Do NOT recover the subtype by parsing `generation` (opaque wire string). **Residual limitation**: escalation-subtype drift is undetectable; a stale escalation gate stays non-terminal alongside the fresh one ([generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)). **However, the SAME-generation adoption branch DOES fire on this row (per #471 / SC-006)** — it keys on `gateId` identity, not subtype. Call `cockpit_gate_list({ issueRef, gateType })` (MUST NOT carry `runId` per FR-011 / R4) and iterate `result.gates`:
        - **`result.truncated === true` AND no same-generation entry in the returned page** — treat as a query-unreachable error per sub-step 3 (abort with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME escalation gate; `cockpit_gate_status` returned `absent` only because the current run's `runId` derives a DIFFERENT 4-segment `gateId`. Do **NOT** draft, do **NOT** open, do **NOT** supersede. Adopt: add a `GateRecord` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.11', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (FR-010 / SC-012). **Also add `<issue-ref>` to the in-memory `dispatched-issues` set** — this run's SIBLING D.11 event (different generation hash) MUST take the `already-dispatched` exit; adopting without setting the sibling flag would let it open a second gate for the same incident. Continue to the next event.
        - **Anything else** (drift entries at different generation; same-generation but terminal; empty list) — do **NOT** ack anything `superseded`. **Now apply the D.11 ordering exception above** — if `<issue-ref>` is in `dispatched-issues`, write the `already-dispatched` ledger row and return; otherwise fall through to the draft-then-open flow (below).
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** The four reachable error classes are `query-unreachable`, `invalid-args`, `internal`, and `transport`. Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row, prints the visible operator-facing error line, and continues with the NEXT event in the batch.

   **Defense-in-depth with step 1 dedup (Q5=A / FR-010)**: step 0 coalesces the CROSS-SESSION case (a durable gate from a prior session). Step 1's in-memory `dispatched-issues` set is RETAINED unchanged for two properties the durable check cannot express: (a) the label-pair hashes to two different `gateId`s, so the durable check does not coalesce sibling events; (b) session-mute-on-Skip semantics — Skip never touches labels. The two checks are complementary, not redundant. Do NOT collapse step 1 into step 0.

1. **Dedup check.** If `<issue-ref>` is already present in the in-memory `dispatched-issues set` (session-scoped, alongside the session mute set), the sibling merge-conflicts-family label has already produced one gate for this incident: write ledger-only line `<issue-ref> · <source-label> · escalation-gate · already-dispatched` and return to the main loop — do NOT fetch context, spawn a subagent, or present a gate. Otherwise, add `<issue-ref>` to the dispatched-issues set and continue to step 1a. **Under `ResolvedGateMode === "ui"` this check is ALSO consulted from step 0's drift branch per the D.11 ordering exception above — dedup before drift-ack.**
1a. **Fetch context.** The parent's sole evidence-fetch tool is `cockpit_context(issue=<issue-ref>)`; the return payload includes the pause-alert comment content and the list of conflicted paths. **No ad-hoc `gh` chains, no link-following, no inline comment-fetching in the parent.**
1.5. **Spawn diagnosis subagent** — for any conflict-triage work beyond the engine bundle, dispatch to a diagnosis subagent. Invocation:
   ```
   subagent_type: "cockpit-diagnoser"
   model: <cockpit.auto.agents.diagnoser.model ?? cockpit.auto.agents.default.model — OMIT the line when neither is set>
   effort: <cockpit.auto.agents.diagnoser.effort ?? cockpit.auto.agents.default.effort — OMIT the line when neither is set>
   description: "Diagnose <issue-ref> merge conflicts"
   prompt: <issue-ref + <source-label> (verbatim: one of `waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`) + conflicted-paths payload + gate-option-set directive + return-schema directive>
   ```
   `model`/`effort` are read from the `cockpitAutoConfig` loaded at pre-flight (§ step 1). When `<source-label>` is `blocked:stuck-merge-conflicts`, the subagent MAY reference "auto-remedy already failed" in its `root_cause`/`evidence` fields. Behavioral contract: the `cockpit-diagnoser` agent definition. Return contract: a single JSON value `{root_cause: string, evidence: string, recommended_action: string, confidence: "low"|"medium"|"high"}` where `recommended_action` is exactly one of the target gate's option strings (`I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` — verbatim). No prose, no fenced block. On unrecoverable error the subagent returns `{"error": "<description>"}`.
2. **Present escalation gate** (see § Gate contract G.4d). In one assistant response: five-element presentation block populated verbatim from the verdict (`root_cause`/`evidence` fill the context and evidence rows; conflicted paths shown; `recommended_action` renders as a "Suggested decision" line with `confidence` beside it) + single `AskUserQuestion` with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. No in-parent re-analysis.
3. **Apply verdict**:
   - `I've resolved it — advance the gate` → `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`. On success: ledger `advanced`; **remove `<issue-ref>` from the dispatched-issues set** so a genuinely new future conflict re-gates; continue. **On typed-error return: re-present the D.11 gate with the tool's `code`/`message` prepended verbatim to the presentation block** (see § Gate contract G.4d re-present shape). The operator may retry, skip, or stop from the re-presented gate; the dispatched-issues set entry remains until advance succeeds or the session ends.
   - `Skip (session-local mute)` → add `<issue-ref>` to session mute set; **leave the dispatched-issues set entry in place** (aligned with session-local mute semantics until session end); ledger line `skip (session-local mute)`; continue.
   - `Stop (exit auto)` → kill watch; summary; exit (dispatched-issues set drops with process exit).

**Future degradation**: once the engine-side merge-conflicts resolver ships, this row degrades to ledger-only (D.9-shape) — the label becomes server-side-owned.

**Ledger line**: `<issue-ref> · <source-label> · escalation-gate · <advanced | advance failed: <code>: <message> | skip (session-local mute) | stop (exit) | already-dispatched>`. `<source-label>` is written verbatim from the triggering event (`waiting-for:merge-conflicts` or `blocked:stuck-merge-conflicts`). The `already-dispatched` outcome is produced by the step-1 dedup check; the four gate-outcome tokens by the verdict-apply step 3.

### D.10 — Unrecognized / ambiguous state → escalation gate (Skip / Stop only)

**Source of truth**: D.10 **retains the per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check** per § Enriched-line dispatch contract E3 — the transition class is unknown by definition; dispatching an escalation gate off a bare / stale line is meaningless. The ledger row writes no `source: enriched-line` suffix (E6).

**Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9 (including D.9a/b/c) or D.11: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape, **(d) any state token (`waiting-for:*` OR `blocked:*`) does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)** — future `blocked:*` labels without their own dispatch row land here, not in D.11.

**Any `waiting-for:*` OR `blocked:*` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of `waiting-for:*` and `blocked:*` states the loop may treat as no-ops (D.9, D.9a, D.9b, D.9c) or dispatch to a dedicated gate (D.11). If the table does not name it, D.10 fires — verbatim state in the presentation block.

**Dispatch**:
1. **Present escalation gate** (see § Gate contract G.4c). In one assistant response: presentation block including the observed state (verbatim from `cockpit status --json`) + streamed event line + single `AskUserQuestion` with options `Skip (session-local mute) (Recommended)` / `Stop (exit auto)`, header `Escalate`, `multiSelect: false`. **NEVER Retry** (nothing to retry).
2. **Apply verdict**:
   - `Skip` → add `<issue-ref>` to session mute set; ledger line; continue.
   - `Stop` → kill watch; summary; exit.

**Never guess** — the escalation gate is the surface for any state class the playbook cannot dispatch.

**Escalation-gateType note (UI mode).** D.10 has no Step 0, but its G.4c gate opens under `gateType: 'escalation'` — shared with D.7 (G.4b) and D.11 (G.4d) — and is covered by the § Pre-draft check — shared rules **generation-drift branch guard**: no other row's drift branch may ack a D.10 gate `superseded`; the drift branch is disabled for `escalation` outright ([generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046)).

**Ledger line**: `<issue-ref> · <observed-state> · unrecognized-state · <skip (session-local mute) | stop (exit)>`.

### D.13 — `waiting-for:remediation-limit`

**Trigger**: An issue enters `waiting-for:remediation-limit` — the engine's remediate loop hit its retry cap without converging and raised the gate; the remaining findings live in a plain issue comment on the linked issue (`## Remediation limit reached`), not in the gate record. Verbatim event string: `waiting-for:remediation-limit`. The row MUST be recognized so a remediation-limit label never falls through to D.10 (unknown-state escalation).

**Source of truth**: Read `to` and `labels` from the enriched doorbell line per § Enriched-line dispatch contract E3 — no per-event `cockpit_status(epic=<epic-ref>, json=true)` re-check on the enriched-line path; bare / malformed lines take the fallback path per FR-005. The ledger row carries `· source: enriched-line` on the enriched-line path (no suffix on fallback) per § Enriched-line dispatch contract E6.

**Dispatch**:
0. **Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

   1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). For this row `gateType = remediation-limit`. The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
   2. Call `cockpit_gate_status({ issueRef, gateType, generation, runId })` — pass the three semantic inputs verbatim AND, under `runIdEnabled === true`, the pre-flight-derived `runId` from § In-memory loop state additions; the `runId` field is OMITTED under `runIdEnabled === false` (V6). The `runId` is read verbatim from loop state; NO consumer re-derives (V2 / FR-014). The tool returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
      - **`{ status: 'open' }`** — a gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry `{gateId, gateType, generation, issueRef, status: 'open', transitionClass, dispatchClass}`, where `dispatchClass` is THIS row's `D.n` identifier — known at record time and MANDATORY (§ D.12 step 3 keys its live-state supersession check on it; § D.12 step 4 routes on `(dispatchClass, optionId)`). The reuse-path record has no `inboxUrl`/`title`/`askedAt` (the query does not return them). Continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped to `cockpit_gate_open` success, which alone carries `inboxUrl`).
      - **`{ status: 'answered' }`** — answered, but no D.12 event has resolved it this session. Do NOT spawn the drafting subagent. Record the same partial entry with `status: 'answered'`, increment `answeredGateSweepCounter[gateId]` (per § step 3 **Counter semantics**: this record-time increment IS the entry's count for the sweep in which it was added; tick sites supply every subsequent sweep's increment), and continue to the next event. Downstream D.12 delivery consumes the answer via the redelivery + `deliveryId` dedup path.
      - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. This row's `gateType` maps 1:1 onto this dispatch row, so the § Pre-draft check — shared rules **generation-drift branch guard** is satisfied and the drift branch MAY fire. Call `cockpit_gate_list({ issueRef, gateType })` — this drift-detection call MUST NOT carry `runId` (per FR-011 / R4; functional `cockpit_gate_list` calls are runId-agnostic — the sole `runId`-bearing list call in the run is the § step 1 § Pre-flight probe (UI mode) capability probe). The tool returns `{ gates: [{gateId, gateType, generation, status, runId}, ...], truncated?: boolean }`. Iterate `result.gates` and branch (same-generation is the more specific match and MUST be evaluated before drift):
        - **`result.truncated === true` AND neither a same-generation entry NOR a drift entry is present in the returned page** — treat as a query-unreachable error per sub-step 3 (abort this event's sweep with a visible error); do NOT fall through to draft-fresh.
        - **Non-terminal gate at the SAME `generation`** (`generation === <this event's fresh generation>` AND `status ∈ {open, answered}`) — a prior run opened this SAME natural gate at the SAME content (the current run's `runId` derives a different `gateId`). Do **NOT** draft, do **NOT** open, do **NOT** supersede — byte-identical to the § step 3 § Adoption pass `adopt-natural` branch (per #471 / SC-006). Adopt the row: add a `GateRecord` to `openGates` under `row.gateId` with `{gateId: row.gateId, gateType: row.gateType, generation: row.generation, status: row.status, runId: row.runId, issueRef, dispatchClass: 'D.13', transitionClass}` — the per-entry `runId` is the ROW's originating `runId` verbatim (per FR-003), NOT the current run's; if `row.status === 'answered'`, set `answeredGateSweepCounter[row.gateId] = 1` in the same atomic step (per FR-010 / SC-012). `inboxUrl`/`title`/`askedAt`/`originalDraft` are NOT populated (DATA GAP). Continue to the next event.
        - **Non-terminal gate at a DIFFERENT `generation`** — generation drift. Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')` — under `runIdEnabled === true` this drift-branch ack ALSO passes the STALE row's originating `runId` verbatim (read from `row.runId`, per FR-003 — the ack path accepts-and-ignores `runId`, so the ack lands regardless of which run opened the stale gate); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Then fall through to the draft-then-open flow below with the fresh generation.
        - **Empty `gates` list** — no gate for this `(issueRef, gateType)` pair. Fall through to the draft-then-open flow below unchanged.
   3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both tools return `{ status: 'ok', data }` or `{ status: 'error', class, detail }`; four classes are reachable: `query-unreachable` (sustained outage after the tool's retry budget), `invalid-args` (deterministic caller bug), `internal` (deterministic server/tool bug), `transport` (call never reached the query surface). Classify per § Pre-draft check — shared rules → **Gate-query error taxonomy** and take that row's action. **MUST NOT** collapse ANY error class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them: every class aborts this event's dispatch, writes its ledger row (`<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`; the `query-unreachable` row's detail is the verbatim `aborting sweep for this event`), prints the visible operator-facing error line, and continues with the NEXT event in the batch.

1. **Fetch and render the remaining findings from the engine's issue comment.** The engine writes the non-converged findings as a plain GitHub issue comment on the linked issue (`phase-loop.ts:1411-1421`); the gate record carries no findings (`cockpit_gate_status` returns `{gateId, status}` only), so the comment is the sole source in BOTH local and UI gate modes. Retrieval: `gh issue view <issue-ref> --json comments` → filter to comments whose `body` `startsWith` the exact, case-sensitive string `## Remediation limit reached` (NOT `contains`, NOT case-insensitive) → if none match, render the `(none)` fallback → else select the single most-recent matching comment by `createdAt` → parse its `- <file>:<line> — <title>` bullets (em-dash `—` separator, one per finding) and render them. **No subagent is spawned** — the findings come from the engine's issue comment, not a cluster-side analyzer.
2. **Present remediation-limit gate** (see § Gate contract G.9). In one assistant response: the remaining-findings rendering (from step 1) + single `AskUserQuestion` with options `resume remediation` / `stop` (in that order), header `Remediate?` (≤ 12 chars), `multiSelect: false`.
3. **Apply verdict**:
   - `resume remediation` → `cockpit_advance(issue=<issue-ref>, gate="remediation-limit")` — resets the engine's remediation counter **server-side** and resumes the remediate loop via the engine gate path (same pattern as D.4's `cockpit_advance(issue, gate="manual-validation")`; `cockpit_resume` is the WRONG verb — it is process/paused-issue resume, not a labeled-gate answer).
   - `stop` → exit auto cleanly (kill watch; run summary). **No label writes** (add-only advance invariant §3).

**Ledger line**: `<issue-ref> · waiting-for:remediation-limit · remediation-limit-gate · <outcome>` — outcomes: `resumed (advanced)` / `advance failed: <desc>` / `stop (exit)`.

### D.12 — `gate-answer`

**Trigger**: A `gate-answer` typed event on either wake path — an enriched doorbell NDJSON line with `type: "gate-answer"`, or a `cockpit_await_events(...)` batch item whose event `type` is `"gate-answer"`. D.12 fires **only** when `ResolvedGateMode === "ui"`; under a local resolution no remote records are open and D.12 is dead code. Contract: `contracts/dispatch-d12-gate-answer.md`. The event payload IS the source of truth for the operator's answer (E3); the underlying label state comes from the SAME enriched-line `to` / `labels` fields OR the fallback re-query per E6.

**Payload shape** — the FROZEN down-path gate-answer (Shape 3): FLAT, keyed on `type`; the answer fields carry NO `generation` (supersession keys on gateId identity — step 2) and are NOT nested under an `answer` object:

- `type: "gate-answer"` — discriminator (NOT `kind`).
- `gateId: string` — matches an entry in `openGates`; a re-open mints a NEW `gateId`, so a stale answer arrives under the OLD `gateId`.
- `gateKey: string` — `<owner>/<repo>#<issue>:<gateType>:<generation>`.
- `optionId: string | null` — one of the gate's option ids; `null` on a pure free-text answer.
- `freeText: string | null` — present-and-`null` on an option-only answer; **required** when `optionId === "add-more-work"` for G.7 (`required-if` affordance).
- `actor: { userId: string; email: string | null; displayName: string | null }`.
- `answeredAt: string` — ISO-8601 UTC.
- `deliveryId: string` — unique per delivery attempt; the session dedups on it.

`issueRef` and `transitionClass` are NOT on the wire — read them from `openGates[event.gateId].issueRef` / `.transitionClass` for the ledger row.

**Dispatch steps**:

1. **Look up record**: `record = openGates[event.gateId]`. If absent → `cockpit_gate_ack(gateId, outcome: "superseded", detail: "no matching open record — likely startup-race or duplicate delivery")` — under `runIdEnabled === true` this call ALSO passes the run's pre-flight-derived `runId` verbatim for envelope symmetry with `cockpit_gate_open`, per § step 1 Pre-flight `runId` derivation (per FR-005 / R11; the ack targets an existing `gateId` and performs no key derivation, so this no-record ack lands correctly even when `event.gateId` was minted by a different run); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (no record) · source: ui-gate`. Do NOT dispatch further.

2. **Stale-gate check (gateId identity, V3)**: the frozen down-path answer carries NO `generation` field — supersession is by gateId identity, not an integer match. A revised-draft re-open (below) mints a NEW `gateId` and marks the prior record `superseded` (retained in `openGates`). If the matched `record` is flagged `superseded` → `cockpit_gate_ack(gateId, outcome: "superseded", detail: "stale gate — superseded by re-open")` — under `runIdEnabled === true` this ack ALSO passes the run's pre-flight-derived `runId` verbatim (per FR-005 / R11); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (stale generation) · source: ui-gate`. Do NOT dispatch further.

3. **Live-state supersession check (V4)**: read the underlying trigger label / state via the enriched doorbell line (if the drain also carried `to` / `labels`) OR fall back to `cockpit_status(issue=<issueRef>, json=true)` per E6. If the trigger has been resolved out-of-band → `cockpit_gate_ack(gateId, outcome: "superseded", detail: "live state moved past <transition-class>")` — under `runIdEnabled === true` this live-state-supersession ack ALSO passes `runId` verbatim — the `runId` value is READ from `openGates[gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`; for a current-run entry the two coincide, for an adopted entry (per § step 3 § Adoption pass above) they differ — `openGates[gateId].runId` carries the row's originating `runId` (per FR-005 / R11); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (state advanced) · source: ui-gate`. Do NOT dispatch further.

4. **Route answer to downstream** (per § UI-mode gate mapping): each `(dispatchClass, optionId)` pair has a downstream handler in the mapping table's `downstream action per optionId` column. Invoke it with `event.freeText` where applicable (G.1 `make-changes`, G.2 `request-changes`, G.6 `make-changes`, G.7 `add-more-work`). The handler performs the SAME tool call(s) / subagent spawn(s) / state mutation(s) the local `AskUserQuestion` path performs (per the corresponding G.n subsection) — no new downstream behavior; the handler is reused verbatim across UI-mode and local-mode paths.

5. **Ack outcome**:
   - Handler success → `cockpit_gate_ack(gateId, outcome: "applied")` — under `runIdEnabled === true` this operator-answer-applied ack ALSO passes `runId` verbatim for envelope symmetry with `cockpit_gate_open` — the `runId` value is READ from `openGates[event.gateId].runId` (per #471 / FR-003 / § In-memory loop state additions above), NOT the run-wide loop-state `runId`; for a current-run entry the two coincide, for an adopted entry (per § step 3 § Adoption pass above) they differ — `openGates[event.gateId].runId` carries the row's originating `runId` (per FR-005 / R11; `runId` is **accepted-and-ignored** on the ack path — `cockpit_gate_ack` targets an existing `gateId` and performs no key derivation (per generacy `mcp/gates/schemas.ts § GateAckInputSchema`; `GateOutcomeWireSchema` carries no `runId`, so the field is dropped before the wire), so this operator-apply ack lands on the pending gate regardless of which run opened it — the answer routes by `gateId` alone); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Ledger row uses the mapping-table `<original-action>` + local-vocabulary `<outcome>` + `· source: ui-gate` suffix.
   - Handler failure (downstream tool error) → `cockpit_gate_ack(gateId, outcome: "failed", detail: "<handler-name> returned: <description>")` — under `runIdEnabled === true` this failure ack ALSO passes `runId` verbatim — READ from `openGates[event.gateId].runId` (per #471 / FR-003), NOT the run-wide loop-state `runId` (per FR-005 / R11); under `runIdEnabled === false` the `runId` field is OMITTED (V6). Ledger row: `<issue-ref> · <transition-class> · <original-action> · failed: <detail> · source: ui-gate`.
   - Handler ambiguity (D.11 typed error → re-present the gate) — apply the § D.12 revised-draft re-open path (below): recompute the generation discriminator (a new `gateId`), re-open with the revised body, and mark the ORIGINAL record `superseded`; do NOT ack the original record yet (the re-open supersedes the pending ack when its answer arrives).

6. **Remove from openGates and reset sweep counter**: on `applied` / `superseded` / `failed`, `openGates.delete(event.gateId)` AND `answeredGateSweepCounter.delete(event.gateId)` (no-op if not present). A revised-draft re-open (step 5 handler-ambiguity path) creates a NEW record under a fresh `gateId` — the recomputed generation discriminator changes the `gateKey`, so the derived `gateId` changes; the prior record is **marked `superseded`** and retained in `openGates`, so a late answer under the OLD `gateId` is acked `superseded` by gateId identity (step 2). The counter for the original `gateId` is deleted on the revised-draft re-open so the escape hatch does not fire on a record already flagged `superseded`.

**Mandatory-per-dispatch ledger**: exactly one ledger line per D.12 event, per Invariant #8. The `cockpit_gate_open` call at initiation is print-only (per § Ledger UI-mode extensions) — the D.12 event is the resolving dispatch, and its ledger row is the mandatory one.

**No content-based filter**: D.12 events are consumed in the same stream order as every other event in a batch, per Invariants #7. No pre-filter drops a `gate-answer` event because a downstream handler is currently retrying.

**Revised-draft re-open path (edit-directive from `make-changes`)**. When the resolved action for an arriving `gate-answer` is `make-changes` (G.1 / G.2 / G.6), the handler applies the operator's edit directive, then re-opens the gate under a fresh generation instead of acking the original record `applied`:

1. Apply the edit directive per the corresponding G.n subsection (G.1 § Directive grammar; G.2 revised draft; G.6 iterative edit branch).
2. Recompute the gate's **generation discriminator** for the revised content (per § UI-mode gate mapping — e.g. G.1 clarification → content hash of the revised answer-set; G.6 filing → draft hash of the edited draft). A durable, content-derived discriminator — NOT a session-local integer bump. (An in-memory re-ask ordinal `g<n>` MAY be kept for the ledger label only, never as the wire generation.)
3. Compose the revised `GateDraft` (title, body, options, freeTextAffordance) — the body carries the edited content; options and freeTextAffordance re-used verbatim from the original row's mapping-table entry.
4. Call `cockpit_gate_open(GateOpenParams{ gateType, generation: <revised discriminator>, title/body/options/allowFreeText: <revised draft>, ... })` — the tool derives the new `gateKey`+`gateId`; the plugin never hand-builds a hash. On success, add the NEW `GateRecord` to `openGates` under the new `gateId`, and **mark the ORIGINAL record `superseded`** (retained in `openGates`).
5. The original record is NOT acked at this point. A late answer arrives under the ORIGINAL `gateId`, whose record is now flagged `superseded` → step 2 acks it `superseded (stale generation)` by gateId identity — no downstream duplicate action.
6. Print the "one pointer line" for the new gate; write a ledger row noting the re-open, e.g., G.1's `<ref> · waiting-for:clarification · clarification-batch · make-changes (re-opened g<n>) · source: ui-gate`.
7. On `cockpit_gate_open` call-time error at re-open, the § UI-mode fallback path fires for the revised draft (local `AskUserQuestion` on the same revised body). The discriminator was still recomputed and the original record still marked `superseded`, so a late answer under the original `gateId` is still `superseded` by gateId identity.

**Interactions**: D.1–D.4, D.7, D.10, D.11, D.13 — under `ResolvedGateMode === "ui"` these classes' gates are OPENED via `cockpit_gate_open` instead of `AskUserQuestion`; the answer arrives as a D.12 event routed BACK to the same-class downstream handling (D.12 is the completion path, the label-driven dispatch the initiation path). D.5 — no gate; `cockpit_gate_open` is never called. D.8 — G.5 opens under `<epic-ref>` (sole per-issue exception); D.12 handles the answer identically and the ledger `<issue-ref>` slot carries `<epic-ref>`. D.9 / D.9a–D.9d — ledger-only, no gate. Fallback path (§ UI-mode fallback on `cockpit_gate_open` call error): if the INITIATION open errors, the local `AskUserQuestion` fires; no `openGates` record is created and no D.12 event arrives for that gate; the local flow writes the ledger row at resolution in the pre-change vocabulary with the `· source: ui-gate-fallback` suffix (distinct from clean UI `· source: ui-gate`).

**Ledger line** (per row of the § UI-mode gate mapping table): `<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate` — `<original-action>` reuses the pre-change vocabulary (`clarification-batch`, `review-analysis+advance`, `phase-queue-gate`, `escalation-gate`, `filing-gate+scope-add`, `scope-drained-gate`, etc.); `<outcome>` reuses the local-vocabulary `applied` outcomes (`advanced`, `queued P<n> (<N> issues)`, `manually validated`, `filed + queued (<new-ref>)`, `keep-watching`, `finish (tracking closed)`, etc.) OR the UI-specific outcomes (`superseded (no record)`, `superseded (stale generation)`, `superseded (state advanced)`, `failed: <detail>`). Additional row for `make-changes` (revised-draft re-open): outcome slot carries `make-changes (re-opened g<n>)`.

## Add-issue flow (mid-run)

Between dispatched events, the operator may ask the session to add a ref to the current tracking scope. Two **intent classes**:

1. **Add-existing intent** — "also process <ref>", "process <ref> too", "add <ref> to scope", "include <ref>", "queue <ref>", "pull in <ref>", "handle <ref>", "look at <ref> too", AND a parseable explicit ref (`<owner>/<repo>#<n>` or `#<n>` shorthand, resolved against the tracking ref's repo at dispatch time).
2. **File-new intent** — "file an issue for <topic>", "open a bug for <topic>", "create an issue about <topic>", "raise an issue for <topic>", "report an issue for <topic>".

Recognition is generous; the safety net is structural: add-existing **requires a parseable explicit ref** — phrasing with no ref parses to `null` → confirm intent conversationally ("do you want me to add an issue to scope? which ref?") before acting. File-new **always lands on the filing gate G.6** — a misread intent is a skippable gate, never an unreviewed outward action; ambiguous phrasings (`look at X`, `check X out`, `investigate X`, `let's discuss X`) parse to `null` → confirm before drafting. Multiple refs in one message: FIRST parseable ref wins; re-invoke per-ref.

### Add-existing path (no gate)

1. Parse via `parseAddExistingIntent`; on `null`, confirm intent conversationally and re-parse.
2. Resolve shorthand `#<n>` against the tracking ref's `<owner>/<repo>` prefix; the resolved ref goes into the ledger and tool calls.
3. `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<resolved-ref>)`.
4. `cockpit_queue(issue=<resolved-ref>)`.
5. Ledger line: `<resolved-ref> · scope-add · queued` (or `<resolved-ref> · scope-add · error: <description>` on failure).
6. Return to the main loop. **No gate** — the operator's explicit instruction *is* the approval.

On any error from `cockpit_scope_add` or `cockpit_queue`, write the error ledger line and continue; the operator can retry via a fresh intent.

### File-new path (G.6 filing gate)

1. Parse the topic via `parseFileNewIntent`; on `null`, confirm intent conversationally and re-parse.
2. Spawn a drafter subagent (`subagent_type: "general-purpose"`, description: `Draft issue for <topic>`, prompt: the operator's topic + a return-schema directive). Return contract: strict JSON `{title: string, body: string, labels: string[]}`; on error `{"error": "<description>"}`.
3. Present the **G.6 filing gate** (§ Gate contract G.6) with the drafted content in the five-element block. Loop the edit branch until `Approve & file` or `Skip (don't file)`.
4. **On `Approve & file`**:
   - Write the assembled body to `/tmp/cockpit-auto-file-<tracking-ref-slug>-<unix_ts>.md`.
   - `gh issue create --title "<title>" --body-file <tmpfile> [--label <labels>]` — `--body-file` only (never `-b` / `--body`; shell quoting risks stripping content). Capture the new ref from the return.
   - `cockpit_scope_add(scopeRoot=<tracking-ref>, addRef=<new-ref>)`, then `cockpit_queue(issue=<new-ref>)`.
   - Ledger line: `<new-ref> · filing-gate+scope-add · filed + queued (<new-ref>)`.
5. **On `Skip (don't file)`**: ledger line `<tracking-ref> · filing-gate · skipped (draft discarded)` (left slot is the tracking ref — no new ref was assigned); return to the main loop. **No create, no scope-add, no queue.**

On any error after `Approve & file`, write the corresponding error ledger line (`filing-gate+scope-add · error: <description>` / `error: scope-add failed: <description>` / `error: queue failed: <description>`) and continue. Do **not** retract a successful `gh issue create`; the operator can manually add the ref via the add-existing flow.

**Restart safety**: scope mutations are ledger-lined and reflected on the tracking issue's task list at the engine boundary; a restarted session re-orients from the live task list. Mutes/cursors stay session-local.

## Offering auto

Pre-invocation conversational guidance — not a gate, not an `AskUserQuestion`, not part of the auto loop. After 1+ issues are filed to the workspace's repo this session (any drafter), the session may offer to drive them with `/cockpit:auto`. Hard rules: the offer MUST use resolved concrete issue numbers (e.g. `/cockpit:auto 223, 224`), never a placeholder; it MUST be confirmation-gated — never auto-run on the operator's behalf; at most once per batch of filed issues (declined ⇒ don't re-nag; a later batch is a fresh offer). Phrasing is free.

## Gate contract

Four gate types — **clarification batches, review/validation verdicts, phase-queue confirmations, red/error escalations** — are the exhaustive human-interaction surface (G.1–G.7 below). **Nothing else prompts; none of these auto-proceed.** Every gate is fused with its presentation in one assistant response. Every gate uses `AskUserQuestion` — never a Bash `read` prompt, never a text-only question answered in prose.

### G.1 — Clarification batch gate

**Trigger**: D.1 (`waiting-for:clarification`).

**Presentation** (same response as the single `AskUserQuestion` call) — one five-element `### Q<n>` block per open question:

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

Title = batch comment header verbatim (`ParsedQuestion.title`); if untitled, substitute `q.question.split('\n')[0].slice(0, 80)`. Free-form questions render `**Options:** (free-form — no options posted)` verbatim — never drop the line; the five-element shape is fixed. Context/question/options parse from `clarificationComment.body` (D.1 step 1); recommendation/why/provenance from the drafter (D.1 step 2).

**Gate invocation** (per § AskUserQuestion invocation contract — one `AskUserQuestion` call per batch): question `Post all <N> drafted answers to <issue-ref>?` · header `Clarify` (≤ 12 chars) · `multiSelect: false` · exactly three discrete options in order: `Approve all & post (Recommended)` / `Make changes` / `Skip this batch`.

**Edit path**: the built-in "Other" free-text channel is the one-turn edit path — directives typed there parse via § Directive grammar and apply directly, no `Make changes` round-trip. A `Make changes` follow-up turn cannot auto-proceed: zero directives = no-op re-present, never implicit approve/skip; every iteration requires an explicit operator choice.

**Post-gate behavior**:
- `Approve all & post` (or all questions approved via edits) → post every answer; `cockpit advance --gate clarification`; ledger `advanced`.
- `Make changes` → parse directives per § Directive grammar; empty ⇒ re-present the entire batch and re-fire the same three-option gate (no auto-approve/auto-skip); non-empty ⇒ apply (edits update the staged answer/rationale, `skip` excludes), re-present only changed questions plus the same gate, loop until Approve or Skip.
- "Other" (one-turn edit) → parse + apply; post the resulting subset; advance if every question was posted, else ledger `posted <k>/<N>, skipped <s>`.
- Some approved, some skipped → post the approved subset (skipped answers dropped from the comment); do not advance; ledger `posted <k>/<N>, skipped <s>`.
- `Skip this batch` / all skipped → post no comment; do not advance; ledger `all answers skipped`.

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

- `Q<n>: <letter>` — bare letter (matching a parsed option) resolves to that option's text; posts with **no rationale line** — never retain the draft's justification under an operator-overridden answer.
- `Q<n>: <letter> — <reason>` — letter resolves to option text; `<reason>` replaces the justification.
- `Q<n>: skip` — excludes that question from the posted batch and blocks advance.
- Anything else — verbatim replacement text for the answer, posted as-is.

The `Make changes` re-loop re-presents only changed questions plus the same batch gate until Approve or Skip; the "Other" path applies directly, no extra round-trip. Zero directives from a `Make changes` turn ⇒ re-present the entire batch and fire the same gate again.

### G.2 — Review verdict gate (artifact)

**Trigger**: D.2 (`waiting-for:<artifact>-review`) only. (D.3 `waiting-for:implementation-review` is now a final-approval gate — see § Gate contract G.8 — and no longer routes through G.2.)

**Presentation** (same response as the `AskUserQuestion` call) — the findings-summary table verbatim:

```markdown
Review of <issue-ref> (<gate-name>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| 1 | <path>:<line> | <one-line finding summary> | Yes |
| 2 | <path>:<line> | <one-line finding summary> | No |
| ... |

Suggested decision: <approve | request-changes>
```

Zero findings (`[]` from the subagent): same table with the single body row `| (none) | | | |` and `Suggested decision: approve`. **Retained rule** (canonical inline occurrence in D.2 prose): the subagent's structured return is parsed and rendered as a table; it is never restated verbatim in the response body.

**Gate invocation** (per § AskUserQuestion invocation contract — one call per verdict gate): question `Verdict for <issue-ref> (<gate-name>)?` · header `Verdict` (≤ 12 chars) · `multiSelect: false` · exactly three discrete options in order: `approve` / `request-changes` / `abort`.

**Post-gate behavior**:
- `approve` → `cockpit_advance(issue=<issue-ref>, gate=<gate-name>)`.
- `request-changes` → run the D.2 four-step guardrail (pre-validate → POST → two-leg verify → retry-once → re-present on failure); do NOT `advance` (unresolved threads own the transition).
- `abort` → do nothing.

Hard-error subagent returns (`{"error": …}` or unparseable) → **Error handling** class `OTHER`; **do not** invoke `AskUserQuestion`. Zero findings still invokes `AskUserQuestion` — no auto-approve smuggled in.

**G.2 re-presentation shape** (fired only when the D.2 request-changes guardrail's second attempt also fails its postcondition): a full G.2 re-fire — same table, same `AskUserQuestion` call, same three options in the same order — with a failure notice prepended:

```markdown
> **Postcondition failed after retry.**
> POST/GraphQL error: <verbatim `code` / `message` from the failing leg — quote the response payload>
> postcondition failed after retry (attempt=2 · leg1=<a>/<n> · leg2=<b>/<n>)

<original findings table>

Suggested decision: <approve | request-changes>
```

The blockquote quotes the failing leg's error `code`/`message` verbatim (Leg 1 → POST mismatch summary; Leg 2 → GraphQL response fragment or timeout error); the original findings table and `Suggested decision:` line follow verbatim (no re-analysis — the failure is delivery-layer). Re-selecting `request-changes` starts a **fresh POST with a fresh retry allowance** (retry counter is per-attempt, not per-verdict). `abort` and `approve` are unchanged — only `request-changes` gains the guardrail and retry-then-re-present recovery.

### G.3 — Manual-validation confirm gate

**Trigger**: D.4 (`waiting-for:manual-validation`).

**Presentation** (same response as the `AskUserQuestion` call) — the subagent's structured summary rendered as bullet lists:

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

**Gate invocation** (per § AskUserQuestion invocation contract — one call per manual-validation gate): question `Have you manually validated <issue-ref>?` · header `Validated?` (≤ 12 chars) · `multiSelect: false` · exactly two discrete options: `manually validated` (advance the gate) / `not yet` (do nothing; the event re-fires when the operator confirms later).

The scenarios and acceptance_checks lists come **only** from the subagent hop — no inline artifact reads in the parent.

### G.4 — Escalation gate (four subtypes)

**Trigger**: One of:
- (b) `agent:error` / `failed:*` (D.7).
- (d) `waiting-for:merge-conflicts` (D.11).
- (c) Unrecognized / ambiguous state (D.10).
- (e) Consecutive `invalid-cursor` fault (§ step 5 Branch B; counter ≥ 2, streak not yet operator-acknowledged).

**Presentation** (same response as the `AskUserQuestion` call) — evidence formatted per subtype.

**(b) `agent:error` / `failed:*`**: populated verbatim from the diagnosis subagent's verdict (D.7 step 2); no in-parent re-analysis; the option set is unchanged. First-dispatch presentation:

```markdown
Agent error on <issue-ref>:

**Root cause:** <verdict.root_cause verbatim>
**Evidence:** <verdict.evidence verbatim>
**Current state:** <observed state from `cockpit_context(issue=<issue-ref>)`>
**Suggested decision:** <verdict.recommended_action> (confidence: <verdict.confidence>)
```

On **repeat dispatches** (D.7 dispatch classification) the opening line becomes `Agent error on <issue-ref> (repeat dispatch):` and this row is inserted between Evidence and Current state:

```markdown
**Failure class changed since prior:** <yes | no>  (classes this session: <class1> → <class2> → …)
```

The `Failure class changed since prior` row populates verbatim from the verdict's `failure_class_changed` (`yes`/`no`) and `failure_classes_seen` (`→`-joined running list); `yes` usually means the prior Requeue *made progress* — the recommendation calculus should reflect that. Absent on first dispatch.

**(d) Merge-conflicts**: populated verbatim from the diagnosis subagent's verdict (D.11 step 1.5); no in-parent re-analysis; the option set is unchanged. Initial presentation:

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

Do not mutate the opening line or append prose beyond what is shown. Re-presentation on typed-error return prepends the error and repeats the initial block unchanged (identical `Auto-remedy status` placement and literal — symmetric aside from the preamble):

```markdown
Advance failed for <issue-ref>:

<typed-error `code`/`message`/`details` verbatim, from `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`>

<the initial presentation block above, verbatim>
```

**(c) Unrecognized state**:

```markdown
Unrecognized state on <issue-ref>:

Observed: <raw state from cockpit status --json>

Streamed event: <original transition line>
```

**Gate invocation** (per § AskUserQuestion invocation contract — one call per escalation gate; uniform across all four subtypes): question `How to proceed on <issue-ref>?` (b/c/d) or `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?` ((e); per-epic, not per-issue) · header `Escalate` (≤ 12 chars) · `multiSelect: false` · options subtype-specific, in the listed order:

  | Subtype | Options |
  |---------|---------|
  | (b) agent:error / failed:* | `Requeue (cockpit resume)` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (d) merge-conflicts | `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` |
  | (c) unrecognized state | `Skip (session-local mute) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** |
  | (e) consecutive `invalid-cursor` fault | `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)` — **NEVER Retry** (single call; per-epic, not per-issue) |

**Post-gate mechanism sentences**:
- `Requeue` (subtype b only) → `cockpit_resume(issue=<issue-ref>)`. If tool missing, degrade to Skip with explicit ledger note.
- `I've resolved it — advance the gate` (subtype d only) → `cockpit_advance(issue=<issue-ref>, gate="merge-conflicts")`. On success, ledger `advanced` and continue. On typed-error return, re-present the D.11 gate with the tool's `code`/`message` prepended verbatim (§ D.11 dispatch step 3).
- `Continue degraded (sweep-per-batch)` (subtype (e) only) → see § G.4(e) post-gate behavior.
- `Skip` (subtypes b/c/d) → add `<issue-ref>` to the in-memory **session mute set**; ledger line; continue. **Labels untouched.** Subtype (e) does NOT expose `Skip` — the fault is per-epic (cursor mechanism), not per-issue.
- `Stop` (all subtypes) → kill watch process; print run summary; exit auto cleanly. **No label writes.**

### G.4(e) — Escalation: consecutive `invalid-cursor` fault

**Trigger**: § step 5 Branch B — second consecutive `invalid-cursor` typed error from `cockpit_await_events` with no intervening successful cursor reuse (per § step 5: any call presenting a non-null cursor and returning no cursor-error signal, empty batches included), streak not yet operator-acknowledged. Fires exactly once per unhealed streak, at count == 2; later occurrences in the streak recover silently (with ledger lines) once acknowledged.

**Presentation** (same response as the `AskUserQuestion` call):

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

**Gate invocation** (per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.4(e) fire): question `How to proceed on the consecutive invalid-cursor fault on <epic-ref>?` · header `Escalate` (≤ 12 chars) · `multiSelect: false` · exactly two discrete options in order: `Continue degraded (sweep-per-batch) (Recommended)` / `Stop (exit auto)`.

**Post-gate behavior**:
- `Continue degraded (sweep-per-batch)` → set `streakOperatorAcknowledged = true`; loop continues; § step 5 Branch B recovers each subsequent `invalid-cursor` (counter + ledger line, gate NOT re-fired). Any successful cursor reuse resets the flag to `false` and all counters to 0; a fresh 2-in-a-row streak re-fires at count == 2 (new streak = new decision).
- `Stop (exit auto)` → kill the loop cleanly; print the run summary per § L.6 (with the persistent ledger file's absolute path); exit. No label writes.

**Ledger line contract**: two lines per fire — fault accounting written by § step 5 Branch B before the gate (`<epic-ref> · cursor-recovery · invalid-cursor · <N>`, `<N>` = counter value that triggered the gate); operator decision written after the response (`<epic-ref> · invalid-cursor-streak · escalation-gate · <continue-degraded | stop>`).

No operator response → the gate blocks indefinitely per the standing gate contract; no per-row timeout. The block is cheap — no recovery loop spins while waiting.

### G.5 — Phase-queue confirmation gate

**Trigger**: D.8 (`phase-complete`).

**Presentation** (same response as the `AskUserQuestion` call):

```markdown
Phase P<current> complete on <epic-ref>.

Next phase: P<next> (<N> issues)

Issues to queue:
1. <owner>/<repo>#<m1> · <title>
2. <owner>/<repo>#<m2> · <title>
...
```

**Bootstrap variant** (synthetic `phase-bootstrap` trigger from the § step-3 fresh-epic sweep): the presentation's first line is `No phase in flight on <epic-ref> — bootstrapping the first phase.` and the next-phase line reads `First phase: P<first> (<N> issues)` (there is no P<current>). The issue list, options, question text (`Queue P<first> (<N> issues)?`), downstream (`cockpit_queue(epic=<epic-ref>, phase="P<first>")`), and ledger action verb (`phase-queue-gate`) are otherwise identical to the `phase-complete` path. Under `ResolvedGateMode === "ui"` it opens via `cockpit_gate_open` (transitionClass `phase-bootstrap`); it is **never** presented as a local `AskUserQuestion` under UI mode.

**Gate invocation** (per § AskUserQuestion invocation contract — one call per phase-queue gate): question `Queue P<next> (<N> issues)?` · header `QueueP<next>` (≤ 12 chars) · `multiSelect: false` · exactly two discrete options: `Queue P<next> (<N> issues) (Recommended)` (call `cockpit queue`) / `Cancel` (do nothing; the phase-complete state persists).

On `Queue`, the CLI verb is called with `--yes` — the gate itself is the confirmation.

### G.6 — Filing gate (new-issue draft)

**Trigger**: A file-new intent recognized mid-run (`parseFileNewIntent` returning a `FileNewIntent`) — see § Add-issue flow. Also fires at step 1 under the `--new "<title>"` invocation form to create the initial tracking issue.

**Presentation** (same response as the `AskUserQuestion` call) — the five-element block, used verbatim on every re-fire (no diff view — what gets filed is exactly what was last shown):

```markdown
Filing new issue for <tracking-ref>:

**Title:** <drafted-title>
**Labels:** <labels or "(none)">
**Body:**

<drafted-body — full markdown, multi-line, verbatim as it will be filed>

**Filing target:** <owner>/<repo> (from tracking ref)
**Parent tracking ref:** <tracking-ref>
```

The five field labels (`**Title:**`, `**Labels:**`, `**Body:**`, `**Filing target:**`, `**Parent tracking ref:**`) are ALWAYS present — even under empty labels (`(none)` placeholder). Missing any label is a presentation-shape drift.

**Gate invocation** (per § AskUserQuestion invocation contract — one `AskUserQuestion` call per G.6 fire): question `File this issue on <owner>/<repo>?` · header `File` (≤ 12 chars) · `multiSelect: false` · exactly three discrete options in order: `Approve & file (Recommended)` / `Make changes` / `Skip (don't file)`.

**Iterative edit branch** (full-draft re-present each round, never a diff view):
- `Make changes` → follow-up turn provides free-text change directives (title, body, labels); the session redrafts the FULL issue and re-presents the full revised draft plus the same G.6 gate. Loop ends on `Approve & file` or `Skip (don't file)`.
- Built-in "Other" free-text (one-turn fast path) → revised content typed directly; apply the edit, re-fire G.6 once with the revised draft. Further edits require explicit `Make changes`.
- Zero-directive `Make changes` ⇒ no-op re-present: same draft, same gate. Never implicit-approve; never implicit-skip.

**Post-gate behavior**: see § Add-issue flow (file-new path) — `Approve & file` runs `gh issue create --body-file` → `cockpit_scope_add` → `cockpit_queue(issue=…)` → ledger `filing-gate+scope-add · filed + queued (<new-ref>)`; `Skip (don't file)` writes ledger `<tracking-ref> · filing-gate · skipped (draft discarded)`; `Make changes` loops.

Under `--new "<title>"`, the initial G.6 fire creates the tracking ref itself: on `Approve & file` the ledger header is written after the create succeeds; on `Skip (don't file)` the run exits cleanly (no tracking ref created; ledger carries `form: tracking-new (abandoned before creation)`).

### G.7 — Scope-drained gate (epic-less exit)

**Trigger**: Under `invocationForm: tracking-existing | tracking-new`, every task-list ref of the tracking issue is terminal per `cockpit_status`'s classifier (`completed | not-planned`); never re-derive terminality from raw GitHub states. **Does NOT fire under `invocationForm: epic`** — that path exits on `epic-complete`.

**Presentation** (same response as the `AskUserQuestion` call). The full epic status table per § L.4 policy is emitted immediately before this block:

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

Per-ref disposition ordering matches the tracking issue's task-list markdown (first task first), populated from `cockpit_status(issue=<tracking-ref>, json=true)`'s per-ref classifier.

**Gate invocation** (per § AskUserQuestion invocation contract — one call per G.7 fire): question `Scope drained on <tracking-ref>. How to proceed?` · header `Drain` (≤ 12 chars) · `multiSelect: false` · exactly three discrete options in order: `Keep watching (Recommended)` / `Add more work` / `Finish (close tracking issue + summary)`. `Keep watching` is recommended as the reversible option (work arrives ad hoc — drained-for-now is not done); `Finish` is outward-facing (closes the tracking issue) so gated regardless, and the G.7 pick IS the confirmation (G.5 pattern — no second gate).

**Post-gate behavior**:
- `Keep watching` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · keep-watching`; return to step 4 and re-arm `cockpit_await_events` on the tracking ref.
- `Add more work` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · add-more-work`; emit prose prompt `What would you like to add? Reference an existing ref (e.g., "also process <ref>") or ask me to file a new issue (e.g., "file an issue for <topic>").`; return to step 4 (the operator's next turn is processed by the intent-class recognizer per § Add-issue flow).
- `Finish` → ledger line `<tracking-ref> · scope-drained · scope-drained-gate · finish (tracking closed)`; then `gh issue close <tracking-ref>`; then print run summary per § L.6 (extended with per-ref disposition); exit zero. The ledger line is written BEFORE the close so the run summary can read it.

G.7 fires exactly once per drain event; subsequent drains (after `Keep watching` and further ad-hoc work reaching terminal) fire again as fresh gates.

### G.8 — Implementation-review final-approval gate

**Trigger**: D.3 (`waiting-for:implementation-review`). On a **post-validate** (#1120) engine the gate fires **after** `completed:validate` green as the final human approval before merge, the engine having already run review → remediate → validate server-side; on a **legacy** (pre-relocation / flag-off) engine it fires pre-validate and the client answers the labeled gate (§ D.3 step 4 detects the model at runtime). In neither case is there a fresh verdict to compute cluster-side, and **no `cockpit-reviewer` subagent is spawned** (FR-001 / SC-002).

**Presentation** (same response as the `AskUserQuestion` call) — G.8 has NO findings artifact on either the post-validate or legacy path (the on-ci-green implementation-review branch posts no comment, `phase-loop.ts:1435-1453`), so it renders `(none)` unconditionally, keeping exactly the single body row `| (none) | | | |`. No findings-table-from-JSON regeneration and no gate-body parse:

```markdown
Final approval for <issue-ref> (PR <pr-number>):

| # | File:line | Finding | Blocking? |
|---|-----------|---------|-----------|
| (none) | | | |
```

**Gate invocation** (per § AskUserQuestion invocation contract — one call per final-approval gate): question `Approve <issue-ref> for merge?` · header `Approve?` (≤ 12 chars) · `multiSelect: false` · exactly three discrete options in order: `approve` / `hold` / `reject`.

**Post-gate behavior** (the `approve` action branches on the engine gate model detected at § D.3 step 4 — post-validate vs legacy vs undetectable; `hold` / `reject` are model-independent no-ops):
- `approve`, **post-validate** model (`completed:validate` co-occurs) → route into the **cockpit merge path** (D.5 step 2): `cockpit_merge(issue=<issue-ref>)` — merge on green, **never** on red (invariant §1).
- `approve`, **legacy** model (`completed:validate` absent) → `cockpit_advance(issue=<issue-ref>, gate="implementation-review")` — restores the branch agency#500 removed; applies `completed:implementation-review` server-side and returns control to the engine's own validate → merge cadence. Does **not** merge (invariant §1). Use `cockpit_advance`, **NOT** `cockpit_resume` (mirrors the D.4 `manual-validation` / D.13 `remediation-limit` idiom).
- `approve`, **undetectable** (legacy advance rejected by the engine as an unknown gate) → **fail closed** per § D.3 step 6: emit the verbatim flag-naming diagnostic (naming `reviewPhaseEnabled` and `ciMergeGateEnabled`), write a terminal `fail-closed: <detail>` ledger line, exit non-zero, halt the loop. No label writes.
- `hold` → **no-op**: the label stays; the gate re-fires on the next doorbell (byte-mirrors D.4 `not yet`; add-only advance invariant §3). No label writes.
- `reject` → **no-op**: same as `hold` (label stays, gate re-fires, no label writes).

Resuming remediation is **out of scope** for this gate — that path is the separate remediation-limit gate (G.9 / D.13). No `cockpit-reviewer` subagent and no request-changes guardrail run here.

### G.9 — Remediation-limit gate

**Trigger**: D.13 (`waiting-for:remediation-limit`) — the engine's remediate loop hit its retry cap without converging and raised the gate; the remaining findings live in a plain issue comment on the linked issue, not in the gate record.

**Presentation** (same response as the `AskUserQuestion` call) — the remaining findings fetched and rendered per the D.13 step-1 contract: `gh issue view <issue-ref> --json comments` → select the single most-recent comment (by `createdAt`) whose `body` `startsWith` the exact, case-sensitive string `## Remediation limit reached` → parse its `- <file>:<line> — <title>` bullets (em-dash `—`) → render `(none)` when no comment matches. Identical in local and UI gate modes (the source is the engine's issue comment, not the gate record). **No subagent** — the findings come from the engine's issue comment, not a cluster-side analyzer:

```markdown
Remediation limit reached for <issue-ref> (PR <pr-number>):

<remaining findings rendered from the `## Remediation limit reached` comment>
```

**Gate invocation** (per § AskUserQuestion invocation contract — one call per remediation-limit gate): question `Resume remediation on <issue-ref>?` · header `Remediate?` (≤ 12 chars) · `multiSelect: false` · exactly two discrete options in order: `resume remediation` / `stop`.

**Post-gate behavior**:
- `resume remediation` → `cockpit_advance(issue=<issue-ref>, gate="remediation-limit")` — resets the engine's remediation counter **server-side** and resumes the remediate loop via the engine gate path (same pattern as D.4's `cockpit_advance(issue, gate="manual-validation")`; `cockpit_resume` is the WRONG verb).
- `stop` → exit auto cleanly (kill watch; run summary). **No label writes** (add-only advance invariant §3).

## UI-mode gate mapping (G.1–G.9)

Applies only when `ResolvedGateMode === "ui"` (from § step-1 `--gates` resolution). Under `local`, every gate presents via `AskUserQuestion` per § Gate contract above and this section is dead prose. Under `ui`, every gate contract G.1–G.9 that maps to a per-issue wire record opens a remote gate via `cockpit_gate_open(GateOpenParams)` instead of `AskUserQuestion`; the operator's answer arrives as a D.12 `gate-answer` event and D.12 routes `{optionId, freeText}` onto the SAME downstream handling the local `AskUserQuestion` path performs today — no new downstream behavior.

**`runId` — compute-once, threaded as an explicit literal, propagated to gate-verb-issuing subagents (per #469 / FR-014 / FR-015 / FR-016 / R8).** Under `runIdEnabled === true`, EVERY UI-mode `cockpit_gate_open` invocation in a drafting D.n row (D.1 clarification, D.2 artifact-review, D.3 implementation-review, D.4 manual-validation, D.7 G.4b escalation, D.8 G.5 phase-queue, D.10 G.4c escalation, D.11 G.4d escalation, D.13 remediation-limit) passes the run's pre-flight-derived `runId` (per § step 1 Pre-flight `runId` derivation and § In-memory loop state additions) VERBATIM on the payload. Also carrying `runId` under `runIdEnabled === true`: the § step 3 startup sweep's `cockpit_gate_open` calls (every extended-trigger row), the § UI-mode fallback branch's local counterpart (wire shape N/A), Form 3's G.6 filing gate open under the TENTATIVE UI window, and every G.5 `phase-queue` open (including the synthetic `phase-bootstrap` variant). Under `runIdEnabled === false` the `runId` field is OMITTED from every payload (V6). No `runId` column is added to the mapping-table rows below because `runId` is per-run, NOT per-gateType — the same value is passed to every open call in the run.

**Subagent dispatch prompt template addition (per FR-015 / R8).** Under `runIdEnabled === true`, every subagent dispatch prompt that spawns a gate-verb-issuing subagent (D.1 clarification-drafter SB.1, D.2 review-verdict analyzer, D.4 manual-validation summarizer, D.7 diagnosis subagent, D.11 merge-conflicts diagnosis subagent) gains ONE additional line stating the run's `runId` verbatim:

```
runId: "<runId-literal>"
```

The subagent quotes the literal verbatim on every gate verb it issues (`cockpit_gate_open`, `cockpit_gate_ack`, `cockpit_gate_status`). Subagents MUST NOT re-derive `runId` from the ledger filename, an environment variable, a shared file, or any other source — the parent is the sole authority (per V2 / FR-014). Under `runIdEnabled === false` the `runId:` line is OMITTED from the prompt entirely (matching the wire shape). Subagents that issue no gate verb need no `runId` line. Rationale: explicit-literal propagation matches every other run-scoped value passed to subagents; re-deriving from the ledger filename would break because the directory accumulates one file per run, so a subagent opening a stale prior-run file would derive the WRONG `runId`.

**Row count**: EXACTLY 11 rows below — G.1, G.2, G.3, G.4b, G.4c, G.4d, G.5, G.6, G.7, G.8, G.9 — never including G.4a (D.6 no longer opens a gate — it is ledger-only; the red-validate remediate loop is engine-owned) or G.4e. G.4(e) escalation stays local-only — the per-epic in-memory cursor-fault has no `<issue-ref>` to key on, so the wire record's per-issue fields (`issueRef`, `issueTitle`, `issueUrl`, `branch`) cannot be populated for it; see § G.4(e) exclusion note below.

**Row shape**: `Gate | transitionClass | title | drafted body (source) | options (optionId → label / recommended?) | freeTextAffordance | downstream action per optionId | ledger action verb`. Column meanings:

- **transitionClass** — plugin-side dispatch vocabulary selecting the row; maps to the frozen `gateType` enum (per § Generation discriminator). Plugin-local, NOT a wire field (the wire carries `gateType`); recover it from the matched record for the ledger row.
- **title / drafted body (source)** — `GateOpenParams.title` / `GateOpenParams.body` (flat), verbatim from the corresponding G.n contract above.
- **options (optionId → label)** — `GateOpenParams.options[]` (flat); `optionId` values are stable-across-the-wire keys this table pins; `label` is the operator-facing button text verbatim from the local G.n option strings.
- **freeTextAffordance** — one of `{ kind: "none" }`, `{ kind: "optional", placeholder }`, `{ kind: "required-if", ifOptionId, placeholder }`, used for local `AskUserQuestion` rendering; on the wire it collapses to the frozen `GateOpenParams.allowFreeText: boolean` (`= freeTextAffordance.kind !== "none"`) — placeholder / `required-if` detail is local-only.
- **downstream action per optionId** — the SAME tool call(s) / subagent spawn(s) / state mutation(s) the local path performs (per the G.n subsection above), invoked by D.12 on the arriving answer.
- **ledger action verb** — the `<action>` slot in the resolution ledger row (always the pre-change vocabulary); the outcome slot carries `· source: ui-gate` (or `· source: ui-gate-fallback` on the fallback path).

#### Generation discriminator (UI mode)

The frozen `gateKey` is `<issueRef>:<gateType>:<generation>` and `gateId = sha256(gateKey)[:24]` (the `cockpit_gate_open` MCP tool derives both — the plugin never hand-builds a hash). `generation` is a **durable, content-derived, gateType-specific discriminator**, NOT a session-local integer counter: the SAME gate re-asked after a session restart or serial cluster takeover must derive the SAME `gateId` (so a stored answer redelivers), which a session-local counter cannot satisfy. Per-gateType derivation:

| gateType | generation discriminator |
|---|---|
| `clarification` | content hash of the open question / answer set at open time (re-ask on `make-changes` → hash of the revised answer-set) |
| `artifact-review` | artifact kind + review-branch head SHA |
| `implementation-review` | PR head SHA |
| `manual-validation` | PR head SHA |
| `remediation-limit` | PR head SHA + remediation counter (or remediation counter + remaining-findings hash) |
| `escalation` | subtype + triggering label/state + occurrence counter |
| `phase-queue` | phase number (`P<next>`) |
| `filing` | draft hash over `{title, body, labels}` (a `make-changes` edit changes it naturally) |
| `scope-drained` | tracking ref + drain counter |

**DATA GAPS (follow-up).** The parent loop does not yet compute several of these inputs (review-branch / PR **head SHA** / **prNumber**, durable escalation **occurrence counter**, `remediation-limit` **remediation counter** / **remaining-findings hash**, `scope-drained` **drain counter**, stable clarification **answer-set hash**), so re-asks across restart/takeover are not idempotent for the affected gateTypes; `phase-queue` and `filing` have no gap. **Separately**, `escalation` has a distinct gap: the single enum value is shared by three dispatch rows (D.7 / D.10 / D.11) and the query surface exposes no subtype discriminator, so the pre-draft check's generation-drift branch is disabled for it — see § Pre-draft check — shared rules **generation-drift branch guard**; upstream [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046).

| Gate | transitionClass | title | drafted body (source) | options (optionId → label / recommended?) | freeTextAffordance | downstream action per optionId | ledger action verb |
|------|-----------------|-------|-----------------------|-------------------------------------------|--------------------|--------------------------------|--------------------|
| G.1 | `waiting-for:clarification` | `Approve clarification answers for <issue-ref>` | Five-element `### Q<n>` block per open question (title, context, question, options, recommendation, why, provenance) — from § D.1 step 3 / § G.1 above | `approve-all` → `Approve all & post (Recommended)`; `make-changes` → `Make changes`; `skip-batch` → `Skip this batch` | `{ kind: "optional", placeholder: "notes (optional)" }` — used to carry an edit directive alongside `make-changes` in a single submission | `approve-all`: post batch + `cockpit_advance(issue=<ref>, gate="clarification")`. `make-changes` (with freeText): apply edit directive per § G.1 edit-directive handling; recompute the generation discriminator (content hash of the revised answer-set); re-open per § D.12 revised-draft re-open path. `skip-batch`: post subset (skipped Q excluded) or post nothing if all-skipped. | `clarification-batch` |
| G.2 | `waiting-for:<artifact>-review` (spec / clarification / plan / tasks) | `Review verdict for <issue-ref> — <artifact>` | Findings-summary table + `Suggested decision:` line (per § D.2 step 3 / § G.2 above) | `approve` → `approve`; `request-changes` → `request-changes`; `abort` → `abort` | `{ kind: "optional", placeholder: "reviewer comment (optional; used as body of request-changes review or approval note)" }` | `approve`: `cockpit_advance(issue=<ref>, gate="<artifact>-review")`. `request-changes` (with freeText as review body): run the D.2 four-step guardrail (pre-validate anchors → compose bundle → POST → two-leg verify → retry once → re-present on failure). `abort`: no downstream action. | `review-analysis+advance` / `review-analysis+request-changes` / `review-analysis+abort` |
| G.3 | `waiting-for:manual-validation` | `Manual validation for <issue-ref>` | `**Scenarios to test:**` + `**Acceptance checks:**` bulleted lists (per § D.4 / § G.3 above) | `manually-validated` → `manually validated`; `not-yet` → `not yet` | `{ kind: "none" }` | `manually-validated`: `cockpit_advance(issue=<ref>, gate="manual-validation")`. `not-yet`: no downstream action (event re-fires when operator re-invokes). | `manual-validation-summary+advance` / `manual-validation-summary+wait` |
| G.4b | `agent:error` OR `failed:<subtype>` | `Escalation: agent-error for <issue-ref>` | D.7 diagnosis subagent verdict block (root cause / evidence / current state / suggested decision + confidence; on repeat dispatches: adds `Failure class changed since prior` row — per § G.4(b) above) | `requeue` → `Requeue (cockpit resume)`; `skip` → `Skip (session-local mute)`; `stop` → `Stop (exit auto)` | `{ kind: "none" }` | `requeue`: `cockpit_resume(issue=<ref>)` (degrade to Skip with explicit ledger note if tool missing). `skip`: add `<ref>` to session mute set. `stop`: exit run cleanly. | `escalation-gate` |
| G.4c | Unrecognized `waiting-for:*` / `blocked:*` (per D.10 catch-all) | `Escalation: unrecognized state for <issue-ref>` | Observed state (verbatim from `cockpit status --json`) + streamed event line (per § D.10 / § G.4(c) above) | `skip` → `Skip (session-local mute) (Recommended)`; `stop` → `Stop (exit auto)` — **NEVER `retry`** | `{ kind: "none" }` | `skip`: add `<ref>` to session mute set. `stop`: exit run cleanly. | `unrecognized-state` |
| G.4d | `waiting-for:merge-conflicts` OR `blocked:stuck-merge-conflicts` | `Escalation: merge conflicts on <issue-ref>` | D.11 diagnosis subagent verdict block (auto-remedy status when applicable / root cause / evidence / conflicted paths / suggested decision + confidence — per § G.4(d) above) | `resolved` → `I've resolved it — advance the gate`; `skip` → `Skip (session-local mute)`; `stop` → `Stop (exit auto)` | `{ kind: "none" }` | `resolved`: `cockpit_advance(issue=<ref>, gate="merge-conflicts")` — on typed-error return, re-present the gate (revised generation) per § D.12 revised-draft re-open path. `skip`: add `<ref>` to session mute set (leave dispatched-issues entry in place). `stop`: exit run cleanly. | `escalation-gate` |
| G.5 | `phase-complete` — and the synthetic `phase-bootstrap` (fresh-epic startup, § step-3) which reuses this row verbatim with a distinct `gateId` and the § G.5 **Bootstrap variant** presentation (issueRef stays `<epic-ref>`) — (epic mode only; issueRef in the wire record is `<epic-ref>` — sole per-issue exception) | `Phase queue: P<next> for <epic-ref>` | Next-phase issue list + (when non-empty) `Open ad-hoc issues in scope (added mid-run):` block (per § D.8 / § G.5 above) | Empty ad-hoc list: `queue` → `Queue P<next> (<N> issues) (Recommended)`; `cancel` → `Cancel`. Non-empty ad-hoc: `hold` → `Hold — <M> ad-hoc (Recommended)`; `queue` → `Queue P<next> (<N> issues)`; `cancel` → `Cancel`. | `{ kind: "none" }` | `queue`: `cockpit_queue(epic=<ref>, phase="P<next>")` (with ad-hoc count in ledger outcome). `hold`: no downstream action (phase-complete persists). `cancel`: no downstream action. | `phase-queue-gate` |
| G.6 | `filing-gate` (synthetic — not a live label; fires on `--new "<title>"` startup or mid-run file-new intent) | `File issue: <drafted-title>` | Five-element block: title / labels / body / filing target / parent tracking ref (per § G.6 above) | `approve-and-file` → `Approve & file (Recommended)`; `make-changes` → `Make changes`; `skip-dont-file` → `Skip (don't file)` | `{ kind: "optional", placeholder: "edit directive (used by Make changes)" }` | `approve-and-file`: `gh issue create --body-file <tmp>` → capture ref → `cockpit_scope_add(scope=<tracking-ref>, add=<new-ref>)` → `cockpit_queue(...)` (mid-run intent) OR bind trackingRef (Form 3 startup). `make-changes` (with freeText): apply edit directive; recompute the generation discriminator (draft hash of the edited draft — changes naturally); re-open per § D.12 revised-draft re-open path. `skip-dont-file`: no filing (Form 3 startup exits cleanly; mid-run intent continues loop). | `filing-gate+scope-add` / `filing-gate` (skip only) |
| G.7 | `scope-drained` (synthetic — under `invocationForm: tracking-existing | tracking-new`) | `Scope drained for <tracking-ref>` | Full status table (per § L.4 policy) immediately before this block, then tracking ref / refs processed / per-ref disposition / session-mute count (per § G.7 above) | `keep-watching` → `Keep watching (Recommended)`; `add-more-work` → `Add more work`; `finish` → `Finish (close tracking + summary)` | `{ kind: "required-if", ifOptionId: "add-more-work", placeholder: "Reference an existing ref (e.g., 'also process <ref>') or ask me to file a new issue (e.g., 'file an issue for <topic>')." }` — Q4=A single-answer collapse: on `add-more-work`, D.12 routes `freeText` through the existing § Add-issue intent recognizer (add-existing vs file-new); under fallback (local `AskUserQuestion`) the two-turn flow reverts to today's behavior | `keep-watching`: return to main loop. `add-more-work` (with required freeText): route freeText through § Add-issue intent recognizer → write intent-specific downstream rows (`scope-add · queued` for add-existing; `filing-gate+scope-add · filed + queued (<new-ref>)` for file-new). `finish`: `gh issue close <tracking-ref>` → print run summary → exit zero (ledger line written BEFORE the close). | `scope-drained-gate` |
| G.8 | `waiting-for:implementation-review` (post-validate final approval, or legacy pre-validate) | `Final approval for <issue-ref>` | No findings artifact on either path — renders `(none)` unconditionally (per § D.3 / § G.8 above) — **no subagent** | `approve` → `approve`; `hold` → `hold`; `reject` → `reject` | `{ kind: "none" }` | `approve` (branches on the § D.3 step 4 model): post-validate → cockpit merge path (`cockpit_merge(issue=<ref>)`; merge on green, never on red); legacy → `cockpit_advance(issue=<ref>, gate="implementation-review")`; undetectable → fail closed. `hold`: no downstream action (label stays; gate re-fires). `reject`: no downstream action (label stays; gate re-fires). | `implementation-review-approval` |
| G.9 | `waiting-for:remediation-limit` | `Remediation limit for <issue-ref>` | Engine's remaining findings fetched from the linked-issue `## Remediation limit reached` comment (per § D.13 / § G.9 above) — **no subagent** | `resume-remediation` → `resume remediation`; `stop` → `stop` | `{ kind: "none" }` | `resume-remediation`: `cockpit_advance(issue=<ref>, gate="remediation-limit")` (resets the engine remediation counter server-side). `stop`: exit run cleanly (no label writes). | `remediation-limit-gate` |

**Fallback body identity**: every row's drafted body / options / free-text prompt is authored ONCE per gate — handed to `cockpit_gate_open` on UI-mode success, and the SAME block handed to local `AskUserQuestion` on the § UI-mode fallback path (below). The rows carry no separate "fallback body" column because the body is identical.

**G.4(e) exclusion note**: G.4(e) (consecutive `invalid-cursor` fault; § step 5 Branch B; per-epic in-memory cursor-mechanism fault) is NOT in the table above. The wire record cannot represent it — no `issueRef`, `issueTitle`, `issueUrl`, `branch`; the fault is per-epic in-memory only and does not survive a session restart. Under `ResolvedGateMode === "ui"`, the G.4(e) gate fires locally via `AskUserQuestion` even when every other gate uses UI mode — the sole per-gate mode exception. Its ledger row is unchanged from today (no `· source: ui-gate` suffix, no `· source: ui-gate-fallback` suffix, no fallback ledger note).

### UI-mode fallback on `cockpit_gate_open` call error

Covers `cockpit_gate_open` **call-time** errors — the tool returns `{ ok: false, error: <string>, retryable: <bool> }`, times out, or throws an MCP transport error. **Distinct from Q3=A pre-flight absence**: absence of the tool from the session binding is a static property → hard-fail per § step-1 `--gates` resolution (no ledger dir, verbatim error, exit non-zero); a call-time error is transient → per-gate fallback, loop continues.

**Rule (per gate)**: on any `cockpit_gate_open` failure at gate-initiation time:

1. **Do NOT retry the call.** The plugin does not manage retry/backoff for gate-open; retry logic (if any) is owned by the cluster surface.
2. **Fall through to local `AskUserQuestion` for that gate ONLY**, using the same drafted body / options / free-text affordance that WOULD have been sent to `cockpit_gate_open` (row-identical per the fallback body identity rule above). The § AskUserQuestion invocation contract Rules 1–3 apply verbatim.
3. **On the operator's answer**, run the SAME downstream handler as if it had come via D.12 — the mapping table's `downstream action per optionId` fires; the ledger resolution row is written.
4. **Ledger provenance**: write the fallback resolution row in the pre-change vocabulary with the suffix `· source: ui-gate-fallback` in the outcome slot — distinct from the clean UI-mode `· source: ui-gate`.
5. **First-failure ledger note**: the FIRST `cockpit_gate_open` failure in a run also writes a one-time note BEFORE the fallback resolution row, verbatim shape:

   ```
   <first-failing-ref> · <transition-class> · gate-open · error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate
   ```

   Subsequent failures within the same run are silent (no per-failure ledger row) — only the resolution rows carry the `· source: ui-gate-fallback` suffix.

**Fallback state tracking**: in-memory flag `firstGateOpenFailureNoted: boolean` (default `false`, § In-memory loop state additions below) flips `false → true` on the first `cockpit_gate_open` failure; the note fires only when the flag flips. The flag does NOT reset across the run — a run whose later opens succeed still shows only the one initial note.

**Interaction with revised drafts (`make-changes`)**: a G.1 / G.2 / G.6 re-open MAY itself fail — the same per-gate fallback applies. The revised generation discriminator was still recomputed (a new `gateId`) and the original record still marked `superseded`, so a late-arriving answer under the original `gateId` is still recognized as `superseded` by gateId identity.

**G.7 Add-more-work under fallback**: the local two-turn pattern (select option → prose prompt → operator prose reply → intent recognizer) applies; UI mode's Q4=A one-turn collapse is a wire-schema feature (`Answer.freeText`) and does not survive fallback — the fallback path IS the pre-change local flow.

**One pointer line on `cockpit_gate_open` success** (per FR-005 — UI affordance, not a ledger row): the loop prints the pointer line verbatim to the transcript, once per gate open:

```
gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)
```

No `[ledger] ` prefix. NOT appended to the persistent ledger file. This is the operator's affordance for finding the gate in the inbox; the dispatch-recording ledger row is written by D.12 at answer resolution.

### In-memory loop state additions (UI mode)

Additions to the § In-memory loop state block (alongside `monitorHandle`, `cursor`, `muteSet`, `activeGeneration`, and the C4 `heartbeatScheduledWakeupArmed` flag) — added only under `ResolvedGateMode === "ui"`; unused (undefined) under `local`:

- `openGates: Map<GateId, GateRecord>` — added on each successful `cockpit_gate_open`; removed on `cockpit_gate_ack(applied | superseded | failed)`. Not persisted to disk; a session restart re-derives the set from the § step-3 UI-mode startup sweep, keyed by `gateId = hash(issueRef, gateType, generation)` — the same three inputs yield the same id, so a re-sweep matches an existing open record instead of creating a duplicate. `dispatchClass` (plugin-local) is a distinct field on `GateRecord` used for the D.12 live-state supersession check and for D.12 step 4's `(dispatchClass, optionId)` routing; it is NOT part of the gateId derivation. **`dispatchClass` MUST be populated on every record, including the partial records the § Dispatch step 0 reuse branches create** — it is known at record time, and a record without it resolves no downstream handler when the answer arrives. Each `GateRecord` carries a `status: 'open' | 'answered'` field (added by #457) so the escape-hatch's N=3 check (per § step 4 answered-gate sweep) can distinguish `open` from `answered` entries without an additional MCP call.

  **Per-entry `runId: string` on `GateRecord` — MANDATORY (per #471 / FR-003 / FR-004 / R11).** Each `openGates` entry carries its OWN `runId` field alongside `gateType`, `generation`, `status`, `issueRef`, `dispatchClass`, and `transitionClass`. The field is populated at ADD time and never mutated:
  - **(a) Current-run entries** — every entry added by the CURRENT run's sweep-time or live-path `cockpit_gate_open` success carries the current-run `runId` (the run-wide loop-state `runId` declared below).
  - **(b) Adopted entries** — every entry added by the § step 3 § Adoption pass (UI mode) block carries the row's ORIGINATING `runId`, read verbatim from the `cockpit_gate_list` row that produced the adopted entry (NOT the current-run `runId`). Adoption MUST NOT re-derive, transform, normalise, or fallback the field (per data-model.md § V2).
  - **(c) Every downstream `cockpit_gate_ack` for an `openGates` entry MUST read `openGates[gateId].runId`, NOT the run-wide loop-state `runId`.** The sites that matter: § step 3 § Answered-gate parked-forever escape hatch → § Escape-hatch re-derivation ack; § step 4 sub-step 0 per-wake escape-hatch ack; § D.12 gate-answer step 3 live-state supersession ack; § D.12 gate-answer step 5 operator-answer-applied / failure acks. The § D.12 step 1 no-record ack is the SOLE ack path that continues to use the run-wide loop-state `runId` (there is NO `openGates` entry to source from on the drop path).

  The two coincide for current-run entries but DIFFER for adopted entries. Server-side accept-and-ignore semantics on the ack path mean the ack succeeds either way — the on-wire value matters for audit/trace parity with `cockpit_gate_open`. Under `runIdEnabled === false` the per-entry field is still populated (for symmetry) but is OMITTED from every wire payload (V6). Under `local` the map is unused and the field is dead prose.
- `firstGateOpenFailureNoted: boolean` (default `false`) — flipped `false → true` on the FIRST `cockpit_gate_open` call-time failure, drives the once-only fallback ledger note per § UI-mode fallback rule 5.
- `runId: string | null` — the pre-flight-derived full ledger filename stem (per § step 1 Pre-flight `runId` derivation above), of the form `<tracking-ref-slug>-<timestamp>` and colon-free by V1 / FR-013. Under `--gates=local` (any resolution path — explicit `local`, `--gates=auto` short-circuited to `local`, `--gates=auto` resolved to `local` via probe failure) `runId` is `null` for symmetry with the UI-mode branch. Under `runIdEnabled === true` this value is the run's on-wire discriminator for every `cockpit_gate_open` / `cockpit_gate_ack` / pre-draft `cockpit_gate_status` call in the run (per § UI-mode gate mapping and § Dispatch step 0 blocks). Read verbatim by every downstream consumer; NO consumer re-derives (V2 / FR-014). Every gate-verb-issuing subagent receives the value as an EXPLICIT LITERAL in its dispatch prompt (FR-015).
- `runIdEnabled: boolean` — the session-scoped capability flag. Decided ONCE at pre-flight after the § step 1 § Pre-flight probe (UI mode) capability probe (per FR-012 / V5); MUST NOT flip mid-run. Under `--gates=local` (any resolution path) `runIdEnabled` is `false` unconditionally (no probe fires, no `runId` field appears on any wire — the local byte-path never issues a gate verb). Under `--gates=ui` (explicit) or `--gates=auto` resolved to `ui`, `runIdEnabled === true` iff the pre-flight probe returned `{status: 'ok', …}`; on the `invalid-args` graceful-degradation branch (pre-#1067 cluster) `runIdEnabled := false` and the startup warning fires; on every other error class the run does not continue in UI mode (`runIdEnabled` is not set). Under `runIdEnabled === false` the `runId` field is OMITTED from every gate-verb wire payload — not passed as `null`, not passed as `undefined`, not passed as an empty string; omission is the safe no-op against a `.strict()` schema on a pre-#1067 cluster (V6). A mid-run flip is FORBIDDEN — the startup sweep opens gates before any Step-0 check runs, so reverting the read side after opens would orphan sweep-opened 4-segment gates for the rest of the session.
- `answeredGateSweepCounter: Map<GateId, number>` — per-sweep counter of consecutive sweeps in which a recorded `answered` gate has produced no D.12 event. Seeded at `1` by the D.n Step 0 `reuse-answered` branch that records the entry (that increment IS the entry's count for the sweep in which it was added — per § step 3 **Counter semantics**), then ticked at the top of every subsequent sweep by the § step 3 escape-hatch block AND at the top of every per-wake iteration by § step 4 sub-step 0 (both tick sites apply the same block; a "sweep" is either the once-per-session startup sweep OR a per-wake main-loop iteration; both run before any dispatch, so no sweep is counted twice for the same entry); reset by every D.12 handler; entries reaching `count >= 3` trigger the FR-009 supersede-and-re-derive path (ack `superseded` with detail `answered-not-consumed — presumed stuck at cloud delivered/applied`, remove from `openGates`, delete the counter entry, then **actively re-derive** per § step 3 **Escape-hatch re-derivation** — re-read the issue's live state with `cockpit_status(issue=<issueRef>, json=true)` and dispatch a synthesized event through the normal D.n path in the same pass. Re-derivation MUST NOT be deferred to the next drain: the ack changes no label and `cockpit_await_events` yields only new transitions, so no drain would ever produce the event and the issue would be parked with no operator surface). The per-wake tick site is load-bearing for reachability of entries FIRST added mid-run by a D.n Step 0 `reuse-answered` branch (the startup sweep alone cannot reach them). Under `local` the map is unused.

## AskUserQuestion invocation contract

Every gate contract G.1–G.5 above emits an `AskUserQuestion` call; the three rules below govern every such invocation, so each gate contract references them rather than restating them inline. Every future gate G.6+ MUST reference this section as well.

**Rule 1 — Default gate shape.** `AskUserQuestion.questions` is a **single-item array** (one call per gate/batch). Each of G.1–G.5 emits exactly one item in its `questions` array — the load-bearing structural default.

**Rule 2 — Harness ceiling.** `AskUserQuestion.questions` is capped at ≤ 4 items per call — a hard input-validation bound enforced by the Claude Code SDK harness (exceeding it returns `InputValidationError: Too big: expected array to have <=4 items (questions)` and forces a retry round-trip). The playbook cannot change this bound and must never write shape that violates it.

**Rule 3 — Multi-gate fanout.** When multiple gates fuse into one assistant response (e.g. several issues hitting a `waiting-for:*` label simultaneously, a phase-boundary co-fire, or an escalation co-fire), fire **multiple `AskUserQuestion` calls** in that one response — one call per gate — never a single fused call whose `questions` array concatenates every gate's item. The fanout dimension is the *number of calls*, not the length of a single call's `questions` array.

The rules compose: default 1 item per call (Rule 1) + the ≤ 4 per-call ceiling (Rule 2) → fanout is per-call (Rule 3); five calls each with `questions.length === 1` satisfies all three. Each gate contract G.1–G.5 carries a one-sentence `Per § AskUserQuestion invocation contract — …` reference in its `**Gate invocation**` paragraph; any future gate G.6+ MUST carry the same reference — it is the discovery path to the ceiling and fanout rules.

## Ledger

**Format sentence** (verbatim):

```text
<issue-ref> · <transition-class> · <action> · <outcome>
```

Mnemonic column names: `issue · transition · action · outcome`. The separator is the middle-dot ` · ` (U+00B7) with a single space on each side.

**Mandatory-per-dispatch rule** (verbatim):

> A dispatch without a ledger line is a protocol violation.

**What counts as a "dispatch"**: any typed event from a `cockpit_await_events` batch that the parent processes; any event synthesized by the startup sweep; any escalation-gate retry that re-presents the escalation gate; any session-mute skip.

**What does NOT count**: re-check calls that don't produce a dispatch decision; pre-flight failures (before the loop begins); re-arms and doorbell arm-ups (re-arms are idempotent).

**Narrow amendment — pre-flight probe rows DO earn a ledger row** (per § step 1 § Pre-flight probe (UI mode)). Rows carrying the `preflight` transition class AND the `gate-query-probe` action DO earn a ledger row (shapes below). The probe is DEFERRED until AFTER the ledger header exists: header is line 1, any probe row is line 2 (or later), and the `Auto run starting …` line follows the probe row. The § step-1 hard-fail paths (missing UI-mode tools under explicit `--gates=ui` at parse time; `--gates=*` usage errors; F4.6 `gh issue create` non-zero exit) remain ledger-free — they fire BEFORE the ledger directory is created. The probe's own `--gates=ui` fail path fires AFTER the header exists, so it writes the fail row and then exits non-zero.

**Preflight vocabulary additions**:

- **`preflight`** — transition class used only by the probe row (sibling of the existing `startup`, `heartbeat`, `cursor-recovery`, `epic-complete` control-flow transition classes). Each probe row's action names the specific probe (currently `gate-query-probe`).
- **`ui-gate-probe`** — source token used only by the probe row (sibling of the existing `ui-gate`, `ui-gate-fallback`, `enriched-line` source tokens); mutually exclusive with those three under the § Ledger Rule 4 precedence — a probe row is never an enriched-line dispatch nor a D.12 gate resolution.

**Pre-flight probe row shapes** (verbatim):

- Pass: `<identity-ref> · preflight · gate-query-probe · ok · source: ui-gate-probe`.
- Fail (standard): `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> · source: ui-gate-probe` (`<class>` is one of `query-unreachable` / `invalid-args` / `internal` / `transport` per the § Gate-query error taxonomy; `<detail>` is the tool's `detail` field verbatim).
- Fail (Form-3 TENTATIVE UI window exception, per § step 1 § Pre-flight probe (UI mode) → Fail path clause 4): `<identity-ref> · preflight · gate-query-probe · error: <class> — <detail> (aborted: probe-failed-after-remote-gate-consumed) · source: ui-gate-probe` — the aborted-reason marker is folded into the outcome slot between `<detail>` and the ` · source:` suffix; no additional row is written.

The `<identity-ref>` slot carries the ledger header's `Tracking ref:` value (epic ref under Form 1; `trackingRef` under Forms 2/3/4). At most one probe row is written per run (per FR-010) — the Form-3 exception augments the single Fail row's outcome slot, never a second row.

**Persistence rule (dual-write, unconditional)**: every ledger line is:
1. **Printed to the transcript** on its own line, prefixed with `[ledger] `. Under quiet mode (§ step 1 `--quiet`), this transcript echo is suppressed — the file append below still happens unconditionally.
2. **Appended to the persistent file** at `.generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger`, one line per dispatch, in the exact `<issue-ref> · <transition-class> · <action> · <outcome>` format (no `[ledger] ` prefix in the file).

Write mechanism: `echo "<line>" >> .generacy/cockpit/auto-runs/<epic-ref-slug>-<timestamp>.ledger` — one append per dispatch, no rewriting.

**Epic-ref-slug rule**: the epic reference with `/` replaced by `-` and `#` stripped (e.g., `christrudelpw/epic#42` → `christrudelpw-epic-42`).

**Timestamp format**: `YYYYMMDD-HHMMSS` in the operator's local time, captured at the start of the run (step 1).

**Idempotency rule (L.5 — startup sweep + live-state re-check)**: the startup sweep (step 3) + live-state re-check (step 4a) guarantee re-arming the doorbell sensor on the same live state produces no duplicate action. Each synthetic sweep event gets its own ledger line; events for state already dispatched are recognized as no-ops by the re-check and dispatched only if still actionable.

### Action + outcome vocabulary (per dispatch row)

Stable strings per dispatch table row, so `grep` recipes on `<action>` / `<outcome>` are reliable.

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| D.1 clarification | `clarification-batch` | `advanced`, `posted <k>/<N>, skipped <s>`, `all answers skipped`, `error: <description>` |
| D.2 artifact-review | `review-analysis+advance` | `approved`, `advance failed`, `error: <description>` |
| D.2 artifact-review | `review-analysis+request-changes` | `posted (<anchored> inline, <unanchored> in body)` |
| D.2 artifact-review | `review-analysis+request-changes` | `postcondition-failed → re-present-gate` |
| D.2 review-verdict | `postcondition-passed` | `leg1=<n>/<n> · leg2=<m>/<n>` |
| D.2 review-verdict | `postcondition-failed` | `attempt=<1\|2> · leg1=<a>/<n> · leg2=<b>/<n>` (attempt=2 line appends ` · re-present-gate`) |
| D.2 review-verdict | `review-post-retry` | `attempt=1 · backoff=2s` |
| D.2 artifact-review | `review-analysis+abort` | `aborted` |
| D.3 implementation-review (final approval) | `implementation-review-approval` | `merged (PR #<n>)`, `hold`, `reject`, `blocked: <desc>`, `error: <description>` |
| D.4 manual-validation | `manual-validation-summary+advance` | `manually validated` |
| D.4 manual-validation | `manual-validation-summary+wait` | `not yet` |
| D.5 merge (green) | `merge` | `merged (PR #<n>)`, `blocked: missing-approval`, `blocked: draft`, `blocked: pending`, `blocked: missing-label`, `infrastructure failure — <checks>` |
| D.6 completed:validate:red | `(no-op)` | `engine-owned remediate`, `engine-owned remediate — infrastructure failure: <checks>` |
| D.7 agent-error / failed | `escalation-gate` | `requeue (cockpit resume)`, `requeue failed: <description>`, `skip (session-local mute)`, `skip (cockpit resume unavailable — G-S8 prerequisite)`, `stop (exit)` |
| D.8 phase-complete | `phase-queue-gate` | `queued P<next> (<N> issues)`, `cancelled` |
| D.9 address-pr-feedback | `(no-op)` | `server-side-owned` |
| D.9a pr-feedback | `(no-op)` | `server-side-owned` |
| D.9b children-complete | `(no-op)` | `server-side-owned` |
| D.9c dependencies | `(no-op)` | `server-side-owned` |
| D.9d phase:* | `(no-op)` | `engine-owned phase transition` |
| D.11 merge-conflicts | `escalation-gate` | `advanced`, `advance failed: <description>`, `skip (session-local mute)`, `stop (exit)` |
| D.10 unrecognized | `unrecognized-state` | `skip (session-local mute)`, `stop (exit)` |
| D.13 remediation-limit | `remediation-limit-gate` | `resumed (advanced)`, `advance failed: <description>`, `stop (exit)` |
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

**`source: enriched-line` marker rule (per § Enriched-line dispatch contract E6)**: Rows D.1, D.2, D.3, D.4, D.7, D.9, D.9a, D.9b, D.9c, D.9d, and D.13 append `· source: enriched-line` to their `<outcome>` slot when the dispatch was driven by an enriched doorbell line (E2 = true and class in the E3 "enriched line" column); D.5/D.6 append it on decisive `checks: "green" | "red"` (E4). No suffix (equivalent to `source: re-query`) on fallback re-query rows — bare / malformed lines, D.5/D.6 with `checks: absent | pending`, and the retain-the-re-check classes D.8, D.10, D.11. The marker sits inside the outcome slot; the four-column format is preserved.

**UI-mode extensions (Q5=B — `· source: ui-gate` / `· source: ui-gate-fallback`)**. Applies under `ResolvedGateMode === "ui"`; contract: `contracts/ledger-ui-mode.md`.

**Rule 1 — `cockpit_gate_open` (gate-open) is print-only** (per FR-005). On successful `cockpit_gate_open` the loop prints exactly one pointer line to the transcript, verbatim:

```
gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)
```

The pointer line has **NO `[ledger] ` prefix** and is **NOT appended to the persistent ledger file** — a UI affordance, not a dispatch record. Local mode writes exactly one ledger line per gate dispatch AT RESOLUTION; UI mode does the same via D.12 at the answer.

**Rule 2 — D.12 writes exactly one ledger line per resolved gate**, in the pre-change four-column format with `· source: ui-gate` appended in the outcome slot:

```
<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate
```

`<original-action>` matches the pre-change `<action>` vocabulary; `<outcome>` reuses pre-change vocabulary for the `applied` case OR the UI-specific outcomes (`superseded (no record)`, `superseded (stale generation)`, `superseded (state advanced)`, `failed: <detail>`, `make-changes (re-opened g<n>)`). G.5 rows carry `<epic-ref>` in the `<issue-ref>` slot (sole per-issue exception per § UI-mode gate mapping G.5). Grep recipes on stable `<action>` / `<outcome>` strings keep working across the local ↔ UI transition.

**Rule 3 — UI-mode fallback resolution suffix is `· source: ui-gate-fallback`** (distinct from `· source: ui-gate`). When `cockpit_gate_open` fails at call time and the local `AskUserQuestion` fires (per § UI-mode fallback on `cockpit_gate_open` call error), the resolution row uses pre-change vocabulary with the `-fallback` suffix. The FIRST failure per run also writes a one-time note per § UI-mode fallback rule 5 — that note carries `· source: ui-gate` (NOT `-fallback`); `-fallback` is reserved for resolution rows.

**Rule 4 — Three-way provenance-suffix precedence** (mutually exclusive within a single row):

- `· source: enriched-line` — pre-existing (E6): dispatch driven by an enriched doorbell line (E2 = true AND class in the E3 "enriched line" column, including D.5/D.6 with decisive `checks`).
- `· source: ui-gate` — NEW (Q5=B): D.12 resolutions (applied and superseded/failed cases) AND the UI-mode fallback first-failure note.
- `· source: ui-gate-fallback` — NEW (Q5=B): resolutions that fell back to local `AskUserQuestion` after `cockpit_gate_open` failed.

A D.12 row could — via transport — arrive on the enriched doorbell line; `ui-gate` WINS: **D.12 rows use `· source: ui-gate` (or `ui-gate-fallback`) regardless of transport; `· source: enriched-line` applies only to non-D.12 rows driven by the enriched doorbell line.** The more-specific marker wins.

**Extended grep recipes** (post-#449):

- `grep 'source: ui-gate$' <ledger>` — all clean UI-mode resolutions (the `$` distinguishes from `ui-gate-fallback`).
- `grep 'source: ui-gate-fallback' <ledger>` — all UI-mode fallback resolutions (local `AskUserQuestion` after `cockpit_gate_open` failure).
- `grep 'source: enriched-line' <ledger>` — enriched-line dispatch rows.
- `grep -Ev 'source: (ui-gate|ui-gate-fallback|enriched-line)' <ledger>` — pre-change / re-query rows (no provenance suffix).

### L.4 — Status table policy

The full epic status table (anchor: header row `| Issue | Phase | State |`) is emitted **only** at the following surfaces:

1. **`phase-complete` dispatch** (D.8, § Gate contract G.5 presentation block).
2. **`epic-complete` exit** (step 6, § Ledger L.6 run-summary paragraph).
3. **Escalation-gate presentations** (D.7 G.4b, D.10 G.4c, D.11 G.4d) — operator orientation before an escalation decision.
4. **Startup-sweep summary** (step 3) — session-start orientation. The sweep ends with exactly one full status table, then enters the main loop.
5. **Scope-drained gate G.7 presentation** — operator orientation before an exit decision in epic-less mode.

Between phase boundaries, the ledger line is the sole record of a dispatch. No status table is emitted after D.1–D.6, D.9/D.9a/D.9b/D.9c/D.9d, or any actionable dispatch that is not one of the five surfaces above.

Under quiet mode (§ step 1 `--quiet`), no table is printed to the transcript at any of the five surfaces; tables embedded inside gate presentation bodies (surfaces 3 and 5) are unaffected — they reach the operator through the gate itself.

### L.6 — Run summary at exit

On `epic-complete` exit (step 6), print a run summary paragraph and include the persistent ledger file's absolute path. Under quiet mode (§ step 1 `--quiet`), post this same summary as a comment on the tracking ref instead (marker `<!-- generacy-cockpit:run-summary -->`, via `gh issue comment --body-file`), and print only the two-line exit note (`Auto run complete — <tracking-ref> · <exit reason>` + the ledger file's absolute path):

```text
Auto run complete.

Epic: <epic-ref> · Exited: epic-complete
Events dispatched: <N>
  · Clarification batches: <k1>
  · Review verdicts: <k2>
  · Manual-validation gates: <k3>
  · Phase-queue confirmations: <k4>
  · Merges: <k5> (<green>/<red>)
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

Counts derive from the ledger file (or the in-memory count if the file is unavailable). Non-`epic-complete` exits (Stop from an escalation gate, pre-flight failure) print an abbreviated summary with the exit reason.

**`Scope growth:` line (unconditional)** — emitted in every run summary, including zero-activity runs (`Scope growth: started with 0, added 0, completed 0`).
- `started with N` — count of task-list refs at run start. Epic mode: count of synthetic events from step 3 startup sweep. Epic-less: count of task-list refs on the tracking issue at step 3.
- `added M` — count of `scope-add · queued` action lines PLUS count of `filing-gate+scope-add · filed + queued (…)` action lines. **Excludes** `filing-gate · skipped` outcomes and any `filing-gate+scope-add · error: …` outcomes.
- `completed K` — count of `merge · merged (…)` action lines PLUS any `epic-complete` action line for the tracking ref itself. Epic-less mode: count of task-list refs classified `completed | not-planned` per `cockpit_status` at exit time.

**`Per-ref disposition:` block (epic-less only)**. Emitted only under `invocationForm: tracking-existing | tracking-new`; OMITTED under epic mode. Ordering matches the tracking issue's task-list markdown; content is the same per-ref list the G.7 gate presented, reused verbatim so the summary and the gate cannot drift.

## Invariants

1. **Never merge on red.** `completed:validate` + green routes to the cockpit merge path, and the post-validate `implementation-review` final-approval gate (G.8) `approve` routes into that SAME merge path. Anything red is **engine-owned** — `completed:validate` red is a ledger-only no-op that re-fires as an engine gate (remediation / remediation-limit); `auto` runs no cluster-side fixer branch and no escalation gate for red checks. The merge path exits `0` only on `result: merged`, never on red.
2. **Cockpit comments marked.** Every comment the playbook posts to an issue or PR carries the `<!-- generacy-cockpit:… -->` prefix marker (e.g., `<!-- generacy-cockpit:clarification-answers -->`).
3. **Add-only advance.** `Skip` in every escalation gate is **session-local mute only** — labels are untouched, `cockpit advance` is never called with a fake-skip flag. A muted issue resurfaces in the next auto run's startup sweep.
4. **No cross-slash-command invocation** from `auto.md`. Cross-command composition is CLI verb (`generacy cockpit …`) + subagent boundary only. No `/cockpit:*`, `/code-review`, or `/speckit:*` invocation from the parent's execution path.
5. **Analysis in subagents** whose contracts end with the subagent — the #390 pattern. All analysis workloads (clarification drafting, artifact review verdict, manual-validation summary, diagnosis) live inside named-agent hops (`cockpit-clarifier` / `cockpit-reviewer` / `cockpit-validator` / `cockpit-diagnoser`) with strict-JSON returns; per-role model/effort comes from `cockpit.auto.agents` (§ step 1 run-config load), inheriting the session model when unset. Implementation review/remediate is engine-owned — `auto` spawns no `cockpit-fixer` and no reviewer against an implementation PR.
6. **Autonomy *policy* out of scope.** Per-gate auto-approve and "full auto" mode are explicitly out of scope in v1. Every gate prompts; none auto-proceed.
7. **Stream consumption is unfiltered.** Every non-empty line from `generacy cockpit doorbell` is consumed by the parent — content-based filters over the stream (e.g., "only wake on lines matching `waiting-for:*`") are prohibited, because a filter could silently drop legitimate events. Enriched lines (JSON-parseable objects carrying `to` and `labels`) ARE parsed for dispatch inputs per the § Enriched-line dispatch contract; bare lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.
8. **Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose.
9. **MCP-tool-only invariant.** After the migration, `auto.md` invokes no `generacy cockpit <migrated-verb>` Bash form — every dispatch of the six migrated verbs (`status`, `context`, `queue`, `advance`, `resume`, `merge`) goes through its `cockpit_*` MCP tool.

<!-- BEGIN error-conv -->
**Error handling** — When a Bash CLI exit code is non-zero (or a pre-flight failed), classify the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emit the matching response. Every class MUST print something — never silently no-op. Exit non-zero on every class. This block covers the remaining Bash CLI invocations (`gh` for issue comment posting; `git` for local ledger writes). Cockpit MCP tool typed errors surface at their call sites (`code`/`message`/`details` structured fields), not through this regex classifier — the tool-presence check in step 3 handles tool absence with its own load-bearing ledger line.
<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->
- **MISSING_BINARY** — pre-flight for a required Bash CLI (`gh` for issue comment posting, `git` for local ledger writes) returned non-zero. Print: `A required CLI (\`gh\`, \`git\`) is required but is not on $PATH. In a Generacy cluster session common CLIs are already installed — add them to your PATH: \`export PATH="/shared-packages/node_modules/.bin:$PATH"\` (persist it in ~/.bashrc). Standalone: install the specific CLI via your platform's package manager.`
- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print: `Authentication failed. The required CLI needs GitHub access — run gh auth login and retry.`
- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.
<!-- END error-conv -->
