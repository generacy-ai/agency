# Feature Specification: Retire the redundant `cockpit watch` poll loop in `/cockpit:auto`

**Branch**: `431-summary-cockpit-auto-skill` | **Date**: 2026-07-17 | **Status**: Draft | **Issue**: [#431](https://github.com/generacy-ai/agency/issues/431)

## Summary

`/cockpit:auto` currently arms **two independent 30-second GraphQL poll loops** against the same epic. The auto skill spawns `generacy cockpit watch <epic-ref>` as a Monitor-tool "doorbell" sensor (`packages/claude-plugin-cockpit/commands/auto.md:43`). Although the parent treats the subprocess's stdout as a doorbell only (never parses content), the watch subprocess itself runs a full `runOnePoll` + `resolveEpic` cycle every 30 s — `gh issue view` + per-PR `gh pr checks`, all GraphQL-backed. Separately, `cockpit_await_events` on every wake (`auto.md:79`) drives the MCP server's own event-bus registry, which spins up **its own** 30-second poll loop in the server process. Two loops, same epic, neither aware of the other — a flat 2× on background GraphQL cost, continuous even when the epic is idle. This is the skill-side half of a cross-repo issue; the engine-side companion is **[generacy-ai/generacy#970](https://github.com/generacy-ai/generacy/issues/970)**.

Additionally, the loop re-checks live state via `cockpit_status(json=true)` on **every** actionable event (`auto.md:85`); each such call is a full per-ref GraphQL fan-out on the generacy side. That amplifier is tracked in the generacy companion; the dispatch cadence that triggers it is defined here and is in scope for tuning if it can be reduced without violating the "live state is authoritative" contract (spec § Loop trust boundary).

The fix is contingent on the engine change landing first: once generacy exposes a single shared poll signal — a doorbell emitted by the same event-bus poll loop that `cockpit_await_events` already drains — the auto skill can drop the separate `generacy cockpit watch` subprocess entirely. `cockpit_await_events` becomes the sole source of both event data AND wake-up signal, so exactly one poll loop exists per epic. This is a wake-source consolidation, not an event-protocol rewrite — the wake-driven main loop (established in #420) is preserved.

## User Stories

### US1: Operator running long epics doesn't pay 2× the GraphQL budget on idle time

**As an** operator running `/cockpit:auto` on an epic with long implement/test phases,
**I want** the background GraphQL polling cost to reflect exactly one poll loop per epic (not two),
**So that** a long-lived shared token (e.g., `christrudelpw`) doesn't hit GitHub's GraphQL secondary rate limit halfway through a multi-hour run because the same epic is being polled twice on independent 30 s cadences.

**Acceptance Criteria**:
- [ ] After the fix lands, only one background poll loop runs per epic per `/cockpit:auto` invocation.
- [ ] The `generacy cockpit watch <epic-ref>` subprocess is no longer spawned by `auto.md` (the sensor role moves to the engine's shared doorbell surface).
- [ ] Background GraphQL request rate attributable to a single idle `/cockpit:auto` run drops by ~50% vs. current baseline.

### US2: Wake-driven main loop and gate semantics are preserved

**As a** developer of `/cockpit:auto`,
**I want** the switch from `cockpit watch`-doorbell to engine-shared-doorbell to be a wake-source swap only,
**So that** the #420 zero-token-idle property, cursor bookkeeping, batch ordering, and the re-check-live-state dispatch contract all continue to hold unchanged.

**Acceptance Criteria**:
- [ ] The loop still calls `cockpit_await_events(epic, cursor, maxWaitMs=1, coalesceWindowMs=3000)` on every wake and consumes the typed batch it returns.
- [ ] Idle cost between wakes remains zero tokens (no polling turn, no context re-read) — the `ScheduleWakeup` heartbeat armed per FR-004 of #420 remains the sole belt-and-braces recovery signal.
- [ ] End-to-end epic advancement on a representative fixture matches pre-change behavior (same gates cleared, same merges, same terminal state).

### US3: Skill degrades gracefully when the engine doorbell is unavailable

**As an** operator running an auto skill built against a new engine contract in a cluster that hasn't yet updated,
**I want** the skill to fail loudly at pre-flight rather than silently falling back to double-polling,
**So that** the fix doesn't accidentally live-alongside the regression in mixed-version deployments (the failure mode that motivated FR-006 in #420).

**Acceptance Criteria**:
- [ ] The auto skill declares its minimum required engine capability (e.g., the shared-doorbell surface exposed by generacy#970) at pre-flight.
- [ ] Absent that capability, the skill prints a clear error naming the missing engine surface and pointing at the manual assist commands (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`), then exits non-zero.
- [ ] No hidden fallback re-arms the retired `generacy cockpit watch` subprocess.

### US4: Per-event `cockpit_status` re-check cadence is evaluated for reduction

**As an** operator sensitive to GraphQL cost,
**I want** the per-event `cockpit_status(json=true)` re-check on every actionable dispatch to be evaluated for narrowing (e.g., trust the batched event's carried state for a subset of dispatch classes, or debounce re-checks within a coalesce window),
**So that** the dispatch amplifier tracked in the generacy companion is reduced without violating the "live state is authoritative" contract (`auto.md:85` current behavior).

**Acceptance Criteria**:
- [ ] The re-check cadence is analyzed against each dispatch class (D.1–D.11); classes where the batched event's carried state is provably sufficient are candidates for skipping the re-check.
- [ ] Any narrowing preserves the § Loop trust boundary invariant — the batch event remains advisory; wherever the dispatch acts on live state, the re-check remains.
- [ ] The analysis is captured in this spec's Assumptions / Out of Scope such that the outcome (narrow, don't narrow, defer to a follow-up) is a load-bearing decision, not an ambient one.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `packages/claude-plugin-cockpit/commands/auto.md` step 2 MUST no longer spawn `generacy cockpit watch <epic-ref>` as a Monitor subprocess once the engine-side shared-doorbell surface (generacy#970) is available. | P1 | Engine change lands first; this repo consumes it. |
| FR-002 | `/cockpit:auto` MUST use the engine's shared doorbell (delivered through the same event-bus poll loop that `cockpit_await_events` drains) as its sole Monitor-driven wake source. | P1 | Wake-source swap; not an event-protocol change. |
| FR-003 | The wake-driven main loop MUST continue to call `cockpit_await_events(epic, cursor, maxWaitMs=1, coalesceWindowMs=3000)` on every wake and consume the typed batch as-is. | P1 | Preserves #420 FR-002. |
| FR-004 | The `ScheduleWakeup` fallback heartbeat (5 min, per #420 FR-004) MUST remain in place unchanged — it is the belt-and-braces recovery signal even after the sensor swap. | P1 | Zero token cost until fire. |
| FR-005 | The C5 re-spawn branch in step 5 of `auto.md` MUST be retired alongside the `generacy cockpit watch` spawn (no watch subprocess ⇒ no re-spawn state machine). Any equivalent recovery for a dead engine-doorbell MUST live behind the shared-doorbell surface itself, not in the skill. | P2 | Skill simplification. |
| FR-006 | `/cockpit:auto` pre-flight MUST verify the engine exposes the shared-doorbell capability. On absence, print a clear error naming the missing capability + the manual assist commands, then exit non-zero (no fallback to `generacy cockpit watch` spawn). | P1 | Prevents mixed-version dark-surface regressions. |
| FR-007 | Cursor protocol, batch ordering, and re-check-live-state dispatch MUST remain unchanged. | P1 | Wake-source change only. |
| FR-008 | The per-event `cockpit_status(json=true)` re-check cadence (`auto.md:85`) MUST be reviewed against each dispatch class (D.1–D.11) for narrowing candidates. Any narrowing MUST preserve the § Loop trust boundary invariant. If no safe narrowing exists, the review is captured in Out of Scope and deferred. | P2 | Dispatch amplifier tuning; may defer. |
| FR-009 | The change MUST NOT alter the observable event stream consumed by other cockpit skills (`/cockpit:watch`, `/cockpit:status`, etc.). Those skills continue to work as-is. | P2 | Sensor is shared infrastructure. |
| FR-010 | The playbook-verification test (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`) MUST be re-pinned to the new `auto.md` contract in the same PR — no heading / rule pin is weakened or deleted to make the test pass (CLAUDE.md drift-audit rule). | P1 | Drift audit governance. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Background GraphQL request rate on an idle `/cockpit:auto` run | Drop by ~50% vs. current baseline (2 loops → 1 loop per epic) | Count GitHub GraphQL requests attributable to the run over a fixed idle window; compare pre-fix vs. post-fix. |
| SC-002 | Number of independent 30 s poll loops per epic per run | 1 (post-fix) vs. 2 (current) | Process inventory during a live run: verify no `generacy cockpit watch <epic-ref>` subprocess exists post-fix. |
| SC-003 | Idle-turn token cost | Unchanged from #420 baseline — zero tokens between wakes | Session transcript audit: no polling turns during idle windows other than heartbeat fires. |
| SC-004 | Epic-completion parity | Same terminal state and merged-issue count on a representative fixture (e.g., snappoll) as the pre-change run | Compare epic ledger + PR merge list. |
| SC-005 | Wake latency after a real transition | ≤ 5 s p95 from state change to loop wake (unchanged from #420 SC-003) | Timestamp diff: engine transition emit vs. next model turn start. |
| SC-006 | Pre-flight refusal without engine doorbell capability | Command exits non-zero with actionable error and takes no state-changing action | Run `/cockpit:auto` against an engine version without the shared-doorbell surface; inspect exit code, output, and ledger. |
| SC-007 | Playbook-verification test passes on the re-pinned contract | 100% (no assertions weakened or deleted) | `pnpm --filter @generacy/claude-plugin-cockpit test playbook-verification` green; PR diff of the test file only re-pins to new heading strings / rules. |

## Assumptions

- The engine-side companion (generacy#970) lands first and exposes a shared-doorbell surface delivered through the same event-bus poll loop that `cockpit_await_events` already drains. This spec does not define that surface; it consumes it.
- The harness `Monitor` tool contract still holds (background process idles at zero token cost, model re-invoked on stdout lines) — the engine doorbell surface will be plumbed through Monitor the same way `generacy cockpit watch` is today, just from a different producer.
- The `ScheduleWakeup` fallback heartbeat (#420 FR-004) continues to hold as the belt-and-braces recovery signal — the sensor swap does not remove the need for a heartbeat.
- `cockpit_await_events`'s existing cursor / coalesce / batch semantics (post-#924, post-#420) are unchanged.
- The playbook-verification test (`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`) will require re-pinning to the new `auto.md` heading strings and contract rules — expected and required by CLAUDE.md governance.

## Out of Scope

- Defining or implementing the engine-side shared-doorbell surface — that is generacy#970's scope. This spec depends on it but does not specify it.
- Changing gate semantics, phase transitions, or advancement rules.
- Removing `cockpit_await_events` — it remains the sole typed-event data path.
- Rewriting the `/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`, `/cockpit:queue`, `/cockpit:merge`, `/cockpit:clarify`, `/cockpit:review` skills — they continue to work as-is.
- Migrating the per-event `cockpit_status` re-check to a bulk / cached form — if the FR-008 review determines narrowing is unsafe within this feature's blast radius, it defers to a follow-up.
- Multi-epic supervision from a single loop.
- Adding operator-configurable poll intervals or heartbeat cadences.

## Evidence Pointers

- Skill-side source of the redundant loop: `packages/claude-plugin-cockpit/commands/auto.md:43` (Monitor spawn of `generacy cockpit watch <epic-ref>`).
- Wake-driven drain via `cockpit_await_events`: `packages/claude-plugin-cockpit/commands/auto.md:79`.
- Per-event live-state re-check amplifier: `packages/claude-plugin-cockpit/commands/auto.md:85`.
- Wake-source lineage: #420 (Monitor-driven wake-ups spec), #924 (cursor-recovery hardening), #406 (regression that reintroduced long-poll before #420 restored the sensor/actuator split).
- Engine-side companion issue: **[generacy-ai/generacy#970](https://github.com/generacy-ai/generacy/issues/970)** — cockpit auto exhausts GitHub GraphQL rate limit.
- Playbook drift-audit governance: `CLAUDE.md § Cockpit playbook pins`; test at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.
- Observed on: preview channel, local dev cluster, shared `christrudelpw` token (per issue #431 Notes).

---

*Generated by speckit*
