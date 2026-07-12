# Research: Migrate cockpit playbooks from CLI verbs to #917 MCP tools + `cockpit_await_events` long-poll loop

**Feature**: #406
**Date**: 2026-07-11
**Status**: Complete

## Purpose

Restate the clarifications' Q1–Q5 outcomes as design decisions with (a) the alternatives considered and rejected, (b) the implementation pattern each decision maps to, and (c) the anchoring references from the #384–#403 arc that shaped the pattern. `clarifications.md` records the operator-approved decisions; this file explains *why they hold up*.

## Decisions

### D1 — Fail loud on cockpit tools missing, no version-bump gating

**Decision**: When `cockpit_*` MCP tools are absent at session start, the migrated `auto.md` playbook writes a structured ledger line, prints actionable guidance pointing at `cluster-base#75`, and exits non-zero. No CLI fallback, no in-playbook branching, no plugin-version-bump gating.

**Alternatives considered and rejected**:

- **Version-bump gating (Q1=A)**: pin the migrated playbook to a plugin version that only clusters carrying `cluster-base#75` deploy. The gating premise fails: plugin version and cluster-base template version are uncoordinated artifacts — nothing ties "cluster adopted the migrated playbook" to "cluster's entrypoint registers the server." An existing cluster can't gain registration via `generacy update` (entrypoint scripts are baked into the scaffold at creation; only a rebuild picks up `cluster-base#75`). So the "transition mechanism" A promises can't actually gate anything; A degrades to B plus ceremony.
- **In-playbook dual-path branching (Q1=C)**: ship a temporary `if cockpit_status tool available then MCP path else CLI path` branch for a bounded transition window. Rejected because the dual-path playbook is the drift factory this suite exists to prevent (agency#398, agency#402, agency#403's audit deliverable). Every added branch is a code path that must be audited; a "temporary" branch that ships is a branch that ships.

**Implementation pattern**: matches the `Print + non-zero exit` response class for "environment doesn't support the operation" (already used by the § Error handling `MISSING_BINARY` clause across all playbooks). The addition is the structured ledger entry — mirrors #403's cost-contract discipline extended to the failure boundary.

**Reference**: § Change #5 in `spec.md`; Q1 in `clarifications.md`. The #398 CLI-drift-audit finding is the "why dual-path is a drift factory" archive.

### D2 — Cursor is in-memory only; recovery converges on startup sweep

**Decision**: The `cockpit_await_events` cursor lives in memory for the current dispatch loop only. A new session starts cursor-less and runs the startup sweep. No on-disk cursor, no ledger re-derivation. `invalid-cursor` typed errors, `resetFrom` reset signals, and cursor expiry all converge on the same recovery: run the startup sweep, then re-arm cursor-less from connect-time position.

**Alternatives considered and rejected**:

- **Epic run-state file cursor (Q2=A)**: persist the cursor in the epic run's ledger directory. Rejected: adds a persistence surface whose payoff is avoiding a sweep the playbook mandates at session start anyway, plus a new stale-state hazard (a file cursor outliving the server's retention guarantees is how you manufacture `resetFrom` churn).
- **Dedicated cursor file (Q2=B)**: `.cockpit/cursor.json` or similar, per-session, persisted across epic boundaries. Rejected on the same grounds as A, and it adds a new lifecycle owner (who cleans up when a session dies?).
- **Ledger re-derivation on restart (Q2=C)**: rebuild event position from the persistent `.ledger` file. Rejected because the ledger is a human-audit artifact — its lines are event-boundaries but not wire-protocol checkpoints; using them as such is a misuse the moment the server retention doesn't match the ledger's contents.

**Implementation pattern**: the startup sweep + live-state re-check (from `auto.md` step 3 / step 4a) already handle "catch what we missed" for any event delivery gap. The Q2=D choice extends that mechanism uniformly to cursor-loss cases (invalid, reset, expired). Uniform recovery is easier to reason about than three different recovery paths — matching the "one mechanism per failure class" pattern already visible in the D.9-family handling.

**Reference**: § Change #2 in `spec.md`; Q2 in `clarifications.md`. The loop-trust-boundary principle (streamed lines advisory; live state authoritative) has been the load-bearing invariant since #394.

### D3 — SC-003 baseline is the recorded measurement in `generacy-ai/tetrad-development#92`

**Decision**: SC-003's baseline is the numeric snappoll run-7 measurement from `generacy-ai/tetrad-development#92`, `issuecomment-4948309408`, dated 2026-07-11. The exact numbers are restated in the spec's SC-003 text so the criterion is self-contained: ~100 watch-derived events consumed as separate dispatch rounds, 233 API turns total, ~508k final-context tokens, 12-issue epic. Target: on a comparable 12-issue epic, ≤ ~50 `cockpit_await_events` calls that returned ≥1 event.

**Alternatives considered and rejected**:

- **Archived transcript path (Q3=A)**: point to `docs/baselines/snappoll-run-7.jsonl` or a linked gist. Rejected: the raw transcript lives on the snappoll orchestrator container, which is destroyed when the operator rebuilds the test cluster. The recorded measurement is the durable artifact; the raw transcript is not.
- **New smoke-test capture at validate (Q3=C)**: capture a fresh baseline against a named epic at validate-phase. Rejected because the recorded measurement is already durable; recapturing is over-processing. Also, the ~508k → ≤~250k target is a real, measurable delta — the current baseline exists to compare *against*.

**Implementation pattern**: matches the "measurement quoted in the spec, cited in prose" pattern from #388's session-transcript baseline and #400's turn-count comparison. The spec is the durable artifact; external issue comments are the citation.

**Reference**: § SC-003 in `spec.md`; Q3 in `clarifications.md`; `generacy-ai/tetrad-development#92 issuecomment-4948309408`.

### D4 — Six in-scope playbooks; `watch.md` explicitly NOT migrated

**Decision**: The migration covers `auto.md`, `clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md` — every playbook in this repo that invokes any of the six migrated verbs. `watch.md` is explicitly excluded (its verb `watch` isn't among the six; the NDJSON stream remains the human/script surface per generacy#917's out-of-scope note).

**Alternatives considered and rejected**:

- **`auto.md` only (Q4=A)**: leave the five manual playbooks on CLI indefinitely. Rejected because one plugin carrying two invocation idioms + two audit suites (the `--help`-snapshot drift audit for the stragglers alongside the new tool-contract audit for `auto.md`) is the standing-dual-path smell in its audit dimension. Migrating all six-verb users retires the CLI drift audit for cockpit verbs wholesale.
- **Hand-list beyond `auto.md` (Q4=C)**: enumerate the exact playbooks in the spec (e.g., "`auto.md`, `clarify.md`, `merge.md`"). Rejected because a hand-list is a static artifact a playbook added next week silently escapes. Grep-at-plan-time matches the current state; the list is documented for planning's benefit but the audit (406-2) is grep-driven so it stays correct across additions.

**Implementation pattern**: matches the #398 audit's grep-driven discovery (its `grep -hoE 'generacy cockpit [a-z][a-z-]*'` command in `refresh-help-snapshots.sh` is the exact same shape). The 406-2 audit uses the same grep at test time.

**Reference**: § Change #6 in `spec.md`; Q4 in `clarifications.md`. The #398 CLI-drift-audit is the canonical grep-driven-audit precedent.

### D5 — Structured ledger entry + printed guidance + non-zero exit; no `AskUserQuestion`

**Decision**: On cockpit-tools-missing at the startup sweep, the playbook writes a ledger line in the agency#403 shape (`startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`), prints the guidance ("cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75"), and ends the run non-zero. No `AskUserQuestion` prompt.

**Alternatives considered and rejected**:

- **Typed error only (Q5=A)**: raise a typed error from the startup-sweep code path with the guidance as the message. Rejected because it loses the audit-trail half — the run's failure boundary should account for why in the ledger, matching the cost-contract discipline #403 established for successful dispatches.
- **`AskUserQuestion` prompt (Q5=B)**: prompt the operator with a "abort / ignore / retry" choice. Rejected because (a) the operator can do nothing in-session about missing registration, so every option means "abort" — a prompt whose every option means the same thing is not a decision; (b) the § AskUserQuestion invocation contract (from #402) enumerates the four gate kinds (clarification, verdict, phase-queue, escalation); this would be a fifth without a matching gate contract entry.

**Implementation pattern**: matches the § Ledger dispatch-mandatory rule (from #388: "A dispatch without a ledger line is a protocol violation") extended to session-terminal failures. Matches #403's cost-contract discipline (per-event accounting for both successful and failing dispatches). The `Print + non-zero exit` half matches the § Error handling class-shape (already used across all playbooks).

**Reference**: § Change #5 in `spec.md`; Q5 in `clarifications.md`. The #403 § Invariants #8 cost contract is the anchoring pattern.

## Implementation patterns

### Playbook migration mechanics

**Verb site edit shape** (per each of the six migrated verbs, per each playbook):

- **Before**: `` `generacy cockpit <verb> <positional> [flag]` `` via the Bash tool; parse stdout as text or JSON; classify stderr for error handling.
- **After**: `` `cockpit_<verb>(param1=<value>, param2=<value>)` `` via the MCP tool binding; consume the tool's typed return; typed errors surface at the tool boundary with structured `code`/`message`/`details` fields.

**Idempotency, side effects, and result shapes** are preserved by construction — the tool server's contract (generacy#917) mirrors the CLI's behavior for each verb. The playbook's decision trees (D.5 `merge` decision tree on `result` + `reason`; D.4 `manual-validation` advance branch; D.1 `clarification` advance branch) preserve their branch structure with the tool's return replacing the CLI's stdout-JSON parse.

### `cockpit_await_events` long-poll loop (`auto.md` only)

**Loop shape** (from generacy#917's tool contract, restated for `auto.md`'s consumer):

```
cursor = null   # in-memory only; a new session starts cursor-less
loop:
    batch = cockpit_await_events(epic, cursor, maxWaitMs=55000, coalesceWindowMs=3000, maxBatchSize=256)
    if batch.error == "invalid-cursor": run startup sweep; cursor = null; continue
    if batch.resetFrom:                 run startup sweep; cursor = null; continue
    if batch.events is empty:           continue   # no dispatch round
    for event in batch.events (in stream order):
        (a) re-check live state (except for D.9-family ledger-only events per § Invariants §8)
        (b) dispatch per § Dispatch, branching on live transition class
        (c) write one ledger line
    cursor = batch.nextCursor
```

**Batch as dispatch unit**: One batch → one dispatch round in the parent's turn accounting. This is what cuts SC-003's dispatch rounds from ~100 to ~50 on a comparable 12-issue epic — the batch delivers coalesced events per the tool server's `coalesceWindowMs=3000` window, so events that would have arrived as separate NDJSON lines within a 3-second window are consumed in one round.

**Cost contract preservation (§ Invariants #8)**: A batch containing only ledger-only events is exactly N ledger appends and nothing else (mandatory-per-dispatch rule per event; §8's zero-other-tool-calls rule per event). The batch mechanism does not add per-batch overhead; the tool call itself replaces N-many watch-line reads and Monitor-primitive turns.

### Fail-loud tool-presence check (`auto.md` step 3 top)

**Check shape**:

```
tools_present = harness_query("cockpit_status", "cockpit_context", "cockpit_queue",
                              "cockpit_advance", "cockpit_resume", "cockpit_merge",
                              "cockpit_await_events")
if any missing:
    write ledger line: "startup · cockpit-mcp-tools-missing · abort · see cluster-base#75"
    print: "cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75"
    exit non-zero
```

The `harness_query` shape is playbook prose (Claude interprets it against the runtime's tool binding); the reference tool-call classifier in the test file exercises the presence-check contract via a fixture-driven parse.

### Tool-contract audit (406-1)

**Audit shape** (per test 406-1 in `playbook-verification.test.ts`):

- **Input**: the six migrated playbooks + `406-tool-schemas.json` (a snapshot of the seven `cockpit_*` tool definitions).
- **Parse**: locate every `cockpit_*` tool call in the playbook prose; extract tool name + declared parameter names.
- **Validate**: for each call, assert the tool name is in the schema snapshot and every declared parameter name matches a parameter in the tool's schema.
- **Report**: mismatches printed with `file:line`, tool name, declared parameter, expected parameter set — matching the 398-1 audit shape.

Fixture-driven so the audit fires deterministically without needing a live cluster.

## Anchoring references

The 406 change extends the same audit-friendliness pattern that #388 established (fusion of analysis and prompt in one response) and #394/#396/#398/#400/#402/#403 extended (unfiltered stream, tightened D.10, CLI-drift audit, batch parser, AskUserQuestion contract, cost contract). Every load-bearing rule survives rewrites because it lives at two surfaces — the playbook prose that Claude interprets at runtime AND the test-file grep or type-shape assertion that catches drift at build time. The #406 addition follows the same pattern.

Key references:
- **#388 fusion / gate contract enforcement** — the "analysis and prompt in same response" pattern. Preserved verbatim by this migration.
- **#394 unfiltered stream** (§ Invariants #7) — annotated to note the migrated event-consumption boundary; still applies to `watch.md`.
- **#396 dispatch classifier + tightened D.10** — the inline test-file reference pattern (`dispatchClassifier` at `playbook-verification.test.ts:187`) is the exact template for #406's tool-call classifier + typed-error parser.
- **#398 CLI drift audit** — the audit shape and grep-driven discovery pattern. 398-1's verb list narrows to `["watch"]`; 398-2's regression fixture is retained.
- **#400 clarification batch parser + directive grammar** — the "reference parser inline in test file" pattern (`parseBatchComment` in `lib/clarification-batch-parser.ts`, wrapped by the 400 test block). #406's tool-call classifier follows the same shape but stays inline (< 60 lines).
- **#402 AskUserQuestion invocation contract** — the four-gate enumeration is the ground for rejecting Q5=B (adding a fifth gate for cockpit-tools-missing).
- **#403 cost contract (§ Invariants #8) + D.7/D.11 diagnosis subagents + D.9d prefix-match + status table policy** — the ledger-line-on-abort shape (agency#403's `startup · … · abort · …` form) is the template for #406's tool-presence-check ledger line.

## Sources

- `spec.md` (branch: `406-follow-up-generacy-ai`) — Changes #1–#6, § Success criteria SC-001/SC-003/SC-004/SC-005.
- `clarifications.md` (branch: `406-follow-up-generacy-ai`) — Q1–Q5 with resolved answers.
- generacy-ai/generacy#917 — cockpit MCP server (shipped); tool schemas exported.
- generacy-ai/cluster-base#75 — MCP registration (still landing).
- generacy-ai/agency#403 — cost-contract / D.9d / D.7/D.11 subagent workstream (shipped).
- generacy-ai/agency#402 — AskUserQuestion invocation contract (shipped).
- generacy-ai/agency#398 — CLI drift audit (shipped; verb list narrows on this branch).
- generacy-ai/agency#394 — unfiltered stream / liveness cross-check (shipped; invariant §7 preserved, annotated).
- generacy-ai/tetrad-development#92, `issuecomment-4948309408` (2026-07-11) — snappoll run-7 baseline for SC-003.
