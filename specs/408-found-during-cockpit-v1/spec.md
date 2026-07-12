# Feature Specification: Found during the cockpit v1

**Branch**: `408-found-during-cockpit-v1` | **Date**: 2026-07-12 | **Status**: Draft

## Summary

Found during the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92), finding #59 — first MCP-path run (snappoll-1). Companion to generacy-ai/generacy#924 (the server-side bus-lifetime bug this incident exposed); sequence this after #924 so the error taxonomy it restores is available.

## Observed

auto.md § step 5 converges **all three** cursor signals — `invalid-cursor`, `resetFrom`, cursor expiry — onto one unconditional recovery path (log verbatim → startup sweep → re-arm cursor-less). The session on snappoll-1 followed it faithfully: when generacy#924's bug made *every* returned cursor invalid, the loop settled into **recovery per batch** — a full startup sweep after every event batch, indefinitely, with no escalation. The run stayed correct (sweeps are idempotent) but silently lost the entire dispatch-round reduction the migration exists to deliver (SC-003), and the systematic fault surfaced only because the operator happened to be watching the transcript.

Two contract gaps:

1. **The clarified class distinction was collapsed in authoring.** #406's clarification (Q2) specified `invalid-cursor` → fail loud (caller bug) vs `resetFrom` → recover; the shipped step 5 reinterpreted fail-loud as "log verbatim, then recover anyway." In this incident that softening was *lucky* (it kept the run alive against a server bug), and pure fail-loud would have aborted multi-hour runs on what #924 shows can also be a server-restart artifact — so neither extreme is right. The missing piece is:
2. **No circuit breaker on recovery.** Recovery treats each occurrence as isolated; nothing notices "this is the Nth consecutive one." A recurring cursor fault is a systematic defect (server or playbook), and unbounded silent recovery is the fail-silent shape this playbook family exists to abolish — degradation must become an operator decision, not a permanent quiet tax.

## Fix (auto.md § step 5)

1. **Restore the class split, informed by #924's hardened taxonomy** (post-#924, `never-issued` reliably means caller bug; restarts/evictions classify as `discarded`/`resetFrom`):
   - `resetFrom` / expiry / `discarded` → recover (sweep + re-arm cursor-less), ledger line — unchanged.
   - `invalid-cursor` (malformed / never-issued / wrong-epic) → log the typed error verbatim + ledger line + recover **once**.
2. **Consecutive-fault circuit breaker**: a second consecutive `invalid-cursor` (no successful cursor-reuse between them) → **escalation gate** (G.4-class): present the verbatim typed errors and the recovery count, options `Continue degraded (sweep-per-batch)` / `Stop (exit auto)`. Recommended default: Continue degraded — the operator learns the loop is degraded and decides; nothing is silently absorbed. Reset the counter on any successful cursor reuse.
3. **Ledger accounting**: each recovery writes `<epic-ref> · cursor-recovery · <class> · <consecutive-count>` so the run summary shows how many rounds ran degraded (SC-003 measurements must be able to exclude/flag degraded runs).

## Regression coverage (playbook-verification suite)

- Step 5 text: distinct handling per class; the escalation-gate contract present with both options; ledger-line shape present.
- Negative fixture: a step-5 variant that recovers unconditionally with no consecutive-fault escape → flagged by the audit.


## User Scenarios & Testing

### User Story 1 — Recurring cursor fault surfaces as an operator decision (Priority: P1)

An operator running an auto-mode epic encounters a systematic cursor fault (server or playbook defect) that would otherwise degrade the session to "recovery per batch" indefinitely. Instead of the fault being silently absorbed, the second consecutive `invalid-cursor` occurrence raises a G.4-class escalation gate that presents the verbatim typed errors and the recovery count, letting the operator choose to continue degraded or exit auto.

**Why this priority**: This is the core defect the incident exposed — silent, unbounded degradation is the exact failure mode the cockpit playbook family exists to abolish. Without this gate, SC-003 (dispatch-round reduction) can be permanently forfeit without anyone noticing.

**Independent Test**: With `auto.md`'s step 5 wired to a fixture that returns `invalid-cursor` on every batch, the second consecutive occurrence must produce the escalation gate with both options (`Continue degraded (sweep-per-batch)` / `Stop (exit auto)`) — never a third silent recovery.

**Acceptance Scenarios**:

1. **Given** a session with no prior cursor fault, **When** a single `invalid-cursor` typed error is returned, **Then** the session logs the typed error verbatim, writes a ledger line, recovers once (sweep + re-arm cursor-less), and resumes.
2. **Given** a session that recovered from one `invalid-cursor` with no successful cursor reuse since, **When** a second `invalid-cursor` is returned, **Then** the session raises the G.4-class escalation gate with the verbatim typed errors, the recovery count, and the two options (`Continue degraded` / `Stop`).
3. **Given** a session that recovered from one `invalid-cursor` and then successfully reused a cursor, **When** a subsequent `invalid-cursor` is returned, **Then** the consecutive-fault counter has been reset and the session recovers once again without escalating.

---

### User Story 2 — Non-fault cursor signals recover unchanged (Priority: P1)

`resetFrom`, cursor expiry, and `discarded` are legitimate session-restart / eviction signals — not caller bugs. They must continue to recover (sweep + re-arm cursor-less) with a ledger line and no escalation, so routine restarts don't page the operator.

**Why this priority**: Splitting the class handling is only safe if the recovery path for legitimate signals stays exactly as-is; treating a normal restart as an `invalid-cursor` would produce false escalations and undermine the gate's signal-to-noise.

**Independent Test**: With a fixture that returns `resetFrom`, `expiry`, or `discarded`, the session must recover on every occurrence (no escalation, no counter increment against `invalid-cursor`).

**Acceptance Scenarios**:

1. **Given** any prior state, **When** a `resetFrom` / expiry / `discarded` signal is returned, **Then** the session recovers (sweep + re-arm cursor-less), writes a ledger line, and does not increment the `invalid-cursor` consecutive-fault counter.
2. **Given** an in-flight consecutive-fault counter at 1, **When** a `resetFrom` / expiry / `discarded` signal is returned, **Then** the counter is unaffected (only successful cursor reuse resets it).

---

### User Story 3 — Ledger records enable degraded-run accounting (Priority: P2)

The run summary and any SC-003 measurement must be able to identify or exclude rounds that ran degraded. Each recovery writes a ledger line naming the class and the consecutive count, so downstream analysis (or the operator scanning the transcript) can see exactly how many rounds ran in sweep-per-batch mode.

**Why this priority**: Without ledger accounting, a "successful" epic run indistinguishable from a fully degraded one silently corrupts the SC-003 baseline the migration exists to prove.

**Independent Test**: After a scripted run mixing successful cursor reuses and cursor faults, grep the ledger for `cursor-recovery` and confirm the classes and consecutive counts match the fixture.

**Acceptance Scenarios**:

1. **Given** any cursor recovery is triggered, **When** the recovery completes, **Then** the ledger contains a line of shape `<epic-ref> · cursor-recovery · <class> · <consecutive-count>`.
2. **Given** a mixed run with two consecutive `invalid-cursor` faults followed by successful reuse followed by one `resetFrom`, **When** the run ends, **Then** the ledger shows recovery classes and counts consistent with `invalid-cursor · 1`, `invalid-cursor · 2`, then `resetFrom · 1` (counter reset by the successful reuse).

---

### User Story 4 — Playbook-verification suite catches regressions (Priority: P2)

The static playbook-verification audit must fail on any future edit that collapses the class split or removes the consecutive-fault escape. A negative fixture — a step-5 variant that recovers unconditionally — must be flagged.

**Why this priority**: The original defect was a documentation/authoring regression from the #406 clarification; without a regression audit, the same collapse can recur silently the next time step 5 is edited.

**Independent Test**: Run the playbook-verification suite against (a) the fixed `auto.md`, expecting pass; (b) the negative fixture, expecting the specific failure describing the missing consecutive-fault escape.

**Acceptance Scenarios**:

1. **Given** the fixed `auto.md`, **When** the audit runs, **Then** it asserts distinct handling per class, the escalation-gate contract present with both options, and the ledger-line shape.
2. **Given** a step-5 variant that recovers unconditionally (no consecutive-fault escape), **When** the audit runs, **Then** it fails and names the missing contract element.

---

### Edge Cases

- **Immediate second fault after a fresh session**: a cursor-less session's very first two batches both return `invalid-cursor` — the counter starts at zero, so occurrence #2 must still trigger the escalation gate (the "no successful reuse between them" clause is satisfied vacuously).
- **`Continue degraded` chosen at the gate**: the session runs sweep-per-batch indefinitely; the counter stays live so subsequent successful reuse resets it, but the gate does not re-fire on every batch — decide-once semantics.
- **`Stop` chosen at the gate**: the session exits auto cleanly with a final ledger line naming the classified fault and the exit reason.
- **Cursor becomes valid mid-batch**: successful cursor reuse resets the counter to zero even if a later batch faults again — the gate only fires on truly consecutive faults.
- **Playbook shipped before generacy#924 lands**: the taxonomy this feature relies on (`never-issued` vs `discarded` vs `resetFrom`) is only reliable post-#924; sequencing is enforced upstream, but if the playbook is exercised against a pre-#924 server the classification may be ambiguous — behavior in that window is out of scope.

## Requirements

### Functional Requirements

- **FR-001**: `auto.md` § step 5 MUST split cursor-signal handling by class: `resetFrom`, cursor expiry, and `discarded` recover (sweep + re-arm cursor-less) and write a ledger line; `invalid-cursor` (malformed / never-issued / wrong-epic) logs the typed error verbatim, writes a ledger line, and recovers once.
- **FR-002**: `auto.md` § step 5 MUST maintain a consecutive-`invalid-cursor` counter that increments on each `invalid-cursor` occurrence and resets to zero on any successful cursor reuse. `resetFrom`, expiry, and `discarded` signals MUST NOT affect this counter.
- **FR-003**: On a second consecutive `invalid-cursor` (counter reaches 2), `auto.md` MUST raise a G.4-class escalation gate presenting the verbatim typed errors from both occurrences and the recovery count, with exactly two options: `Continue degraded (sweep-per-batch)` and `Stop (exit auto)`. Recommended default: `Continue degraded`.
- **FR-004**: When the operator chooses `Continue degraded`, the session MUST continue running sweep-per-batch without re-firing the gate on each subsequent batch; the counter MUST still reset on any successful cursor reuse (so recovery from the degraded state is observable).
- **FR-005**: When the operator chooses `Stop`, the session MUST exit auto and write a final ledger line naming the classified fault and the exit reason.
- **FR-006**: Every cursor recovery MUST write a ledger line of shape `<epic-ref> · cursor-recovery · <class> · <consecutive-count>`, where `<class>` is one of `invalid-cursor`, `resetFrom`, `expiry`, `discarded`, and `<consecutive-count>` is the `invalid-cursor` counter value at recovery time (always `0` for non-`invalid-cursor` classes).
- **FR-007**: The playbook-verification suite MUST assert that `auto.md` § step 5 (a) names distinct handling per cursor class, (b) contains the escalation-gate contract with both options exactly, and (c) mandates the ledger-line shape from FR-006.
- **FR-008**: The playbook-verification suite MUST include a negative fixture — a step-5 variant that recovers unconditionally with no consecutive-fault escape — and MUST report a failure on it that names the missing contract element.
- **FR-009**: This change MUST sequence after generacy-ai/generacy#924 so the hardened taxonomy it restores (`never-issued` reliably classifying as `invalid-cursor`; restarts and evictions classifying as `discarded`/`resetFrom`) is available to the class split.

### Key Entities

- **Cursor signal**: The typed outcome returned when a cursor is presented to the cockpit event API. Classes: `invalid-cursor` (caller-bug shape: malformed, never-issued, wrong-epic), `resetFrom` (server-directed reset), `expiry` (natural cursor lifetime end), `discarded` (server evicted the cursor, e.g., restart).
- **Consecutive-fault counter**: An in-memory integer scoped to the current dispatch loop, incremented on `invalid-cursor`, reset to zero on any successful cursor reuse. Drives the FR-003 escalation gate.
- **Cursor-recovery ledger line**: The FR-006 ledger record; the primary evidence used by SC-003 measurements to exclude or flag degraded rounds.
- **G.4-class escalation gate**: An operator-facing decision prompt in the AskUserQuestion contract shape (per #402), presenting typed errors plus a finite option set that always includes at least one meaningful continuation.

## Success Criteria

### Measurable Outcomes

- **SC-001**: On a fixture that returns `invalid-cursor` on every batch, the session raises the escalation gate no later than the second batch — never absorbs a third silent recovery.
- **SC-002**: On a fixture returning `resetFrom` / expiry / `discarded` signals only, the session runs to completion with zero escalation gates fired and the ledger records the expected recovery count per class.
- **SC-003**: The playbook-verification audit runs against (a) the fixed `auto.md` (expected: pass) and (b) the negative unconditional-recovery fixture (expected: fail with a message naming the missing consecutive-fault escape) — both outcomes reproducible on every audit run.
- **SC-004**: Run-summary tooling (or a manual grep) can identify degraded rounds from the ledger alone — `cursor-recovery` line count and consecutive counts are sufficient to compute the degraded-round fraction for any SC-003 (generacy#917) baseline comparison.

## Assumptions

- generacy-ai/generacy#924 has landed by the time this playbook change is exercised in an auto-mode session; the hardened taxonomy is available and reliable.
- The AskUserQuestion contract (per #402) can express the G.4-class gate with two options and verbatim typed-error content; no new gate-kind is needed.
- Operators watching auto-mode sessions can and will make the `Continue degraded` / `Stop` decision when prompted — the escalation surface is meaningful signal, not noise the operator will learn to dismiss.

## Out of Scope

- Server-side fixes to the cursor taxonomy — tracked in generacy-ai/generacy#924.
- Automatic remediation of the underlying fault (server restart, cache eviction) — this feature makes the fault visible and decidable, not self-healing.
- Changes to `watch.md` or other playbooks that don't dispatch `cockpit_await_events` — the fault mode is specific to the auto-mode dispatch loop.
- Persisting the consecutive-fault counter across sessions — a new session's counter always starts at zero (a session restart is itself the correction).
- Retroactive re-classification or scoring of past run-7 / snappoll-1 transcripts.

---

*Generated by speckit*
