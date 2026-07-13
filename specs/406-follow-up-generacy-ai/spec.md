# Feature Specification: Follow-up to generacy-ai/generacy#917 (cockpit MCP server — shipped) and generacy-ai/agency#403 (auto

**Branch**: `406-follow-up-generacy-ai` | **Date**: 2026-07-11 | **Status**: Draft

## Summary

Follow-up to generacy-ai/generacy#917 (cockpit MCP server — shipped) and generacy-ai/agency#403 (auto.md efficiency contract — shipped), written against the shipped tool contract as both issues' out-of-scope notes record. Blocked at runtime by generacy-ai/cluster-base#75 (nothing registers the server until that lands) — the playbook change can ship first, but only cut over per the fallback decision below.

## Goal

Migrate `auto.md` (and any cockpit playbook that invokes CLI verbs) from Bash + `generacy cockpit <verb>` to the #917 MCP tools, and replace the Monitor/watch-NDJSON event plumbing with the `cockpit_await_events` long-poll loop. This is the second half of the efficiency workstream: #403 cut per-event cost; this cuts event-delivery turn count (SC-003: ≥2× dispatch-round reduction) and eliminates the CLI syntax-negotiation/re-parse turn classes (#398/#906 lineage).

## Changes

1. **Verb migration**: every `generacy cockpit status|context|queue|advance|resume|merge` invocation across the in-scope playbooks (see Change #6) becomes the corresponding MCP tool call (`cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`). Typed refs replace string refs (the PR-number-as-issue class becomes a schema error — do not re-wrap tool errors in CLI-style error handling).
2. **Event loop**: replace the Monitor-runs-`cockpit watch` plumbing (in `auto.md` only — `watch.md` retains the NDJSON stream) with a `cockpit_await_events` loop — defaults per #917 (`maxWaitMs=55000`, `coalesceWindowMs=3000`, `maxBatchSize=256` soft-cap): one batch → one dispatch round, events processed in stream order within the round. Cursor handling: the cursor is **in-memory only** for the current dispatch loop — no on-disk persistence, no ledger re-derivation. A new session starts cursor-less and runs the startup sweep (live state is authoritative and subsumes any missed-event replay). Session restart, `invalid-cursor` typed error (still fail loud — caller bug), `resetFrom` reset signal, and cursor expiry all converge on the same recovery path: run the startup sweep, then re-arm cursor-less from connect-time position.
3. **Ledger-only rows stay cheap**: D.9/D.9d handling under #403's cost contract is unchanged — a batch containing only ledger-only events is one ledger append and nothing else.
4. **Audit-suite migration** (the #398/#402 static suites): the CLI-invocation drift audit (playbook `--help` snapshot comparison) retires for migrated verbs and is replaced by a tool-contract audit — every `cockpit_*` tool call in the playbook names a tool and parameters that exist in the #917 schema exports. The § AskUserQuestion invocation contract (#402) is unaffected.
5. **Fail-loud on missing tools** (clarified): the migrated playbooks ship without CLI fallback or plugin-version-bump gating. At the top of the startup sweep, the session verifies the `cockpit_*` tools are present before dispatching anything; on absence, it writes a ledger line in the agency#403 shape (`startup · cockpit-mcp-tools-missing · abort · see cluster-base#75`), prints the guidance ("cockpit MCP tools not available — upgrade the cluster / verify registration; see cluster-base#75"), and ends the run. No AskUserQuestion prompt (the operator can do nothing in-session about missing registration — a prompt whose every option means "abort" is not a decision; the gate contract enumerates four question kinds, this would be a fifth). The ledger entry is a contract obligation, not a code-path detail — the sweep is playbook prose executed by the session, so FR-007's audit asserts the playbook text mandates the ledger line.
6. **Migrated-playbook scope**: `auto.md` plus every cockpit playbook in this repo that invokes any of the six verbs; enumerated in plan.md by grepping for `generacy cockpit <verb>`. Expected set (subject to grep confirmation at plan time): `auto.md` (all six verbs + watch replacement), `clarify.md` (context, advance), `review.md` (context, advance), `merge.md` (merge), `queue.md` (queue), `status.md` (status). `watch.md` is explicitly **not** migrated — its verb isn't among the six, and the NDJSON stream remains the human/script surface per generacy#917's out-of-scope. Only `auto.md` swaps its Monitor/watch event plumbing for `cockpit_await_events`; the other in-scope playbooks are verb-migration only.

## Success criteria

- **SC-001**: A full epic run completes with zero Bash invocations of cockpit CLI verbs and zero `--help` consultations (generacy#917 SC-001).
- **SC-003**: On a comparable 12-issue epic, the count of `cockpit_await_events` calls that returned ≥1 event is ≤ ~50 (a ≥2× reduction versus the snappoll run-7 baseline of ~100 watch-derived events, each consumed as a separate dispatch round; 233 API turns total, ~508k final-context tokens, 12-issue epic; recorded in generacy-ai/tetrad-development#92 `issuecomment-4948309408` dated 2026-07-11). Measured from the session transcript by counting non-empty `cockpit_await_events` returns and comparing against total events delivered.
- **Ref-layer errors**: A malformed ref is rejected at the tool layer with actionable guidance — no engine round-trip, no diagnosis turn.
- **SC-005 (playbook-verification suite)**: no `generacy cockpit` CLI invocation remains in migrated playbooks (see Change #6 for scope); all `cockpit_*` tool references validate against the #917 schemas; the startup-sweep tool-presence check and its ledger-line contract (see Change #5) are asserted by the audit.


## User Stories

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
