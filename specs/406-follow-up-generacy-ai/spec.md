# Feature Specification: Follow-up to generacy-ai/generacy#917 (cockpit MCP server — shipped) and generacy-ai/agency#403 (auto

**Branch**: `406-follow-up-generacy-ai` | **Date**: 2026-07-11 | **Status**: Draft

## Summary

Follow-up to generacy-ai/generacy#917 (cockpit MCP server — shipped) and generacy-ai/agency#403 (auto.md efficiency contract — shipped), written against the shipped tool contract as both issues' out-of-scope notes record. Blocked at runtime by generacy-ai/cluster-base#75 (nothing registers the server until that lands) — the playbook change can ship first, but only cut over per the fallback decision below.

## Goal

Migrate `auto.md` (and any cockpit playbook that invokes CLI verbs) from Bash + `generacy cockpit <verb>` to the #917 MCP tools, and replace the Monitor/watch-NDJSON event plumbing with the `cockpit_await_events` long-poll loop. This is the second half of the efficiency workstream: #403 cut per-event cost; this cuts event-delivery turn count (SC-003: ≥2× dispatch-round reduction) and eliminates the CLI syntax-negotiation/re-parse turn classes (#398/#906 lineage).

## Changes

1. **Verb migration**: every `generacy cockpit status|context|queue|advance|resume|merge` invocation in auto.md's D-rows becomes the corresponding MCP tool call (`cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`). Typed refs replace string refs (the PR-number-as-issue class becomes a schema error — do not re-wrap tool errors in CLI-style error handling).
2. **Event loop**: replace the Monitor-runs-`cockpit watch` plumbing with a `cockpit_await_events` loop — defaults per #917 (`maxWaitMs=55000`, `coalesceWindowMs=3000`, `maxBatchSize=256` soft-cap): one batch → one dispatch round, events processed in stream order within the round. Cursor handling: persist the returned cursor in the run state; on `invalid-cursor` typed error → fail loud (caller bug); on a `resetFrom` reset signal → run the startup sweep (events may have been missed — the existing recovery mechanism, now with an explicit trigger).
3. **Ledger-only rows stay cheap**: D.9/D.9d handling under #403's cost contract is unchanged — a batch containing only ledger-only events is one ledger append and nothing else.
4. **Audit-suite migration** (the #398/#402 static suites): the CLI-invocation drift audit (playbook `--help` snapshot comparison) retires for migrated verbs and is replaced by a tool-contract audit — every `cockpit_*` tool call in the playbook names a tool and parameters that exist in the #917 schema exports. The § AskUserQuestion invocation contract (#402) is unaffected.
5. **Decision point (clarify)** — tools absent at session start (old cluster, cluster-base#75 not yet deployed, registration failed): recommended posture is **fail loud at the startup sweep** with guidance ("cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75"), NOT a silent CLI fallback — dual-path playbooks are the drift factory this suite exists to prevent. If a transition period is wanted, prefer publishing the migration as a plugin version bump adopted only by clusters that also carry the registration, over in-playbook branching.

## Success criteria

- A full epic run completes with zero Bash invocations of cockpit CLI verbs and zero `--help` consultations (generacy#917 SC-001).
- Watch-derived dispatch rounds for a comparable 12-issue epic drop ≥2× versus the snappoll run-7 baseline (generacy#917 SC-003), measured from the session transcript.
- A malformed ref is rejected at the tool layer with actionable guidance — no engine round-trip, no diagnosis turn.
- Playbook-verification suite: no `generacy cockpit` CLI invocation remains in migrated playbooks; all `cockpit_*` tool references validate against the #917 schemas.


## User Stories

### US1: Migrated verb calls in auto.md

**As a** cockpit auto.md operator (Claude Code driving an epic),
**I want** every cockpit verb (`status`, `context`, `queue`, `advance`, `resume`, `merge`) to be invoked as an MCP tool call rather than a Bash `generacy cockpit <verb>` shell-out,
**So that** typed refs are validated at the tool boundary, malformed refs (e.g. PR number passed as issue) become schema errors instead of engine round-trips, and the CLI syntax-negotiation / `--help` re-parse turn classes (#398/#906 lineage) disappear.

**Acceptance Criteria**:
- [ ] Every D-row in `auto.md` that previously ran `generacy cockpit <verb>` now names a `cockpit_*` MCP tool.
- [ ] All `cockpit_*` tool references validate against the #917 schema exports (tool name exists; parameters match).
- [ ] A malformed ref (wrong type, missing required field) surfaces the tool's typed error verbatim — no CLI-style re-wrapping, no diagnosis turn.
- [ ] Zero `generacy cockpit` Bash invocations remain in migrated playbooks (verified by static audit).

### US2: Long-poll event loop replaces Monitor/watch NDJSON

**As a** cockpit auto.md operator,
**I want** `cockpit_await_events` long-poll batching (defaults `maxWaitMs=55000`, `coalesceWindowMs=3000`, `maxBatchSize=256` soft-cap) to deliver events instead of Monitor streaming NDJSON from `cockpit watch`,
**So that** one batch collapses to one dispatch round, event-delivery turn count drops ≥2× on a comparable 12-issue epic vs the snappoll run-7 baseline, and D.9/D.9d ledger-only batches remain a single ledger append (per #403's cost contract).

**Acceptance Criteria**:
- [ ] auto.md's event dispatch loop is `cockpit_await_events` — no `Monitor` invocation of `cockpit watch`.
- [ ] The returned cursor is persisted in run state and passed on the next call; events within a batch are processed in stream order.
- [ ] `invalid-cursor` typed error → fail loud (caller bug); a `resetFrom` reset signal → invoke the existing startup sweep as the recovery path.
- [ ] A batch containing only ledger-only events (D.9/D.9d rows) produces exactly one ledger append and nothing else.
- [ ] Dispatch-round count on the reference 12-issue epic run drops ≥2× vs the snappoll run-7 baseline, measured from session transcript.

### US3: Audit suite reflects the tool-contract world

**As a** playbook maintainer,
**I want** the #398/#402 static audit suites to check the new invariants — no `generacy cockpit` CLI verbs remain, every `cockpit_*` reference resolves in the #917 schema — instead of the retiring `--help` snapshot comparison for migrated verbs,
**So that** contract drift is caught at review time and the § AskUserQuestion invocation contract (#402, unaffected) continues to hold.

**Acceptance Criteria**:
- [ ] The `--help` snapshot audit is removed for migrated verbs.
- [ ] A new tool-contract audit fails the suite if any `cockpit_*` reference in the playbook names a tool or parameter absent from the #917 schema exports.
- [ ] A regression test asserts zero `generacy cockpit` Bash invocations in migrated playbooks.
- [ ] The § AskUserQuestion invocation contract audit (#402) continues to pass.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Replace every `generacy cockpit status\|context\|queue\|advance\|resume\|merge` Bash invocation in `auto.md` with the matching `cockpit_*` MCP tool call. | P1 | Typed refs — do not re-wrap tool errors in CLI-style error handling. |
| FR-002 | Implement the `cockpit_await_events` long-poll loop as the sole event source for auto.md's D-row dispatcher, using #917 defaults (`maxWaitMs=55000`, `coalesceWindowMs=3000`, `maxBatchSize=256`). | P1 | One batch → one dispatch round; stream-order processing within the batch. |
| FR-003 | Persist the `cockpit_await_events` cursor in run state; on `invalid-cursor` → fail loud; on `resetFrom` → invoke the existing startup sweep. | P1 | `resetFrom` is the explicit trigger for the recovery mechanism that already exists. |
| FR-004 | Preserve the #403 cost contract for ledger-only rows (D.9/D.9d): a batch of ledger-only events yields one ledger append and nothing else. | P1 | No behavioural change here — asserted, not modified. |
| FR-005 | Remove the `--help` snapshot audit for migrated verbs and replace it with a tool-contract audit that validates every `cockpit_*` reference against the #917 schema exports. | P1 | The § AskUserQuestion invocation contract (#402) is unaffected. |
| FR-006 | On startup sweep, if the `cockpit_*` MCP tools are absent (old cluster, cluster-base#75 not deployed, registration failed), fail loud with actionable guidance pointing to cluster-base#75 — do not silently fall back to CLI. | P1 | Confirm-via-clarify. Dual-path playbooks are the drift factory this suite exists to prevent. |
| FR-007 | The playbook-verification suite MUST assert zero `generacy cockpit` Bash invocations in migrated playbooks. | P1 | Static grep-style audit. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Bash cockpit CLI invocations in a full epic run | 0 | Grep session transcript for `generacy cockpit <verb>` — mirrors generacy#917 SC-001. |
| SC-002 | `--help` consultations for cockpit verbs during a run | 0 | Session transcript scan. |
| SC-003 | Watch-derived dispatch rounds on the reference 12-issue epic | ≥2× reduction vs snappoll run-7 baseline | Count dispatch rounds in session transcript (generacy#917 SC-003). |
| SC-004 | Malformed-ref handling | Rejected at the tool layer with actionable guidance; zero engine round-trips; zero diagnosis turns | Inject a PR number as an issue ref; observe typed schema error and no follow-up parse turn. |
| SC-005 | Playbook-verification suite | Passes | Suite green: no `generacy cockpit` CLI invocation remains; every `cockpit_*` tool call validates against the #917 schema. |
| SC-006 | § AskUserQuestion invocation contract audit (#402) | Passes | Continues to pass unchanged. |

## Assumptions

- generacy-ai/generacy#917 (cockpit MCP server) is shipped and its schema exports are the authoritative source for tool names and parameters.
- generacy-ai/agency#403 (auto.md efficiency contract) is shipped; the per-event cost contract this spec preserves comes from that PR.
- Runtime cutover is gated on generacy-ai/cluster-base#75 (registration of the MCP server in the cluster). The playbook change can be merged first; cutover follows registration.
- The existing startup-sweep recovery mechanism (invoked today on Monitor restart) is the correct target for the `resetFrom` reset signal — no new recovery path is needed.
- The §402 AskUserQuestion invocation contract is orthogonal to this migration and does not require changes.

## Out of Scope

- Any change to the cockpit MCP server itself (generacy#917 is treated as a fixed contract).
- Changes to the #403 per-event cost contract for ledger-only rows — this spec asserts the contract, does not modify it.
- Registering the MCP server in the cluster — that is cluster-base#75's job; this spec only fails loud when registration is absent.
- A CLI fallback path when MCP tools are unavailable — explicitly rejected in the issue's decision point (dual-path playbooks are the drift factory this suite exists to prevent). A transition period, if wanted, is handled by plugin-version-bump rollout, not in-playbook branching.
- Migration of any non-cockpit playbook or any non-migrated cockpit verb outside `status|context|queue|advance|resume|merge`.

## Open Questions / Clarification Targets

- **Fallback posture on missing tools** — issue Change #5 records the recommended posture (fail loud + guidance) but flags it for clarify. Confirm before `/speckit:plan`.
- **Cursor persistence location** — issue says "persist the returned cursor in the run state" but doesn't specify the file/keyspace. Clarify during planning.
- **Reference epic for SC-003 measurement** — the "snappoll run-7 baseline" needs a concrete transcript pointer to be verifiable.

---

*Generated by speckit*
