# Feature Specification: Pin auto.md event-consumption to unfiltered reads, forbid content-based stream filters, and add a liveness cross-check to catch broken consumption paths

**Branch**: `394-found-during-cockpit-v1` | **Date**: 2026-07-09 | **Status**: Draft

## Summary

Found during the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92), finding #38 — first finding of the T-S4 run.

## Observed

`/cockpit:auto christrudelpw/sniplink#1`, first live run. Startup was flawless: pre-flight, ledger file created, P1 detected complete, `phase-complete` startup event → phase-queue gate → operator approved → P2 queued (4 issues), ledger line written. Then the loop went blind: all four P2 issues reached `waiting-for:clarification` (the watcher emitted every transition — 17 NDJSON lines in the background output file, confirmed) and the session dispatched none of them for several minutes until the operator intervened.

## Root cause

auto.md step 4 says *"For each event line from the watcher"* — but prescribes **no consumption mechanism**. The session improvised one:

```
tail -n 0 -f <watch-output> | grep --line-buffered '"type"'
```

Per-issue transition events use the legacy envelope (`ts`/`repo`/`kind`/`number`/`event`/`labels`) and carry **no `type` field** — only the S8 synthetic aggregates (`phase-complete`/`epic-complete`) do. The filter therefore delivered exactly 1 of 17 lines and silently dropped every real event. A reasonable improvisation over an under-specified step produced a silent total outage of the main loop — the same class as instruction decay, but in the mechanism gap rather than the instruction.

(Companion engine finding: the stream's schema heterogeneity that made this filter look sensible is filed in generacy — every event line should carry a uniform `type` discriminator.)

## Fix

Pin the consumption recipe in auto.md step 4, verbatim:

- Read new lines from the background watch process output **unfiltered**. Every non-empty line is an event. **Never construct field- or content-based filters over the stream** — the schema has more than one event shape, and the live-state re-check (step 4a) already makes over-delivery harmless; under-delivery is silent loop death.
- If the harness requires a matching pattern to arm a stream monitor, match on any non-empty line (e.g. newline-delimited read), not on a JSON field.
- Add a liveness cross-check to the re-arm step (step 5): if the watch *process* is alive but no event has been consumed for N poll intervals **and** `cockpit status --json` shows actionable states, the consumption path itself is broken — re-arm the reader and re-run the startup sweep (step 3), which is already the idempotent recovery.

## Regression check

Playbook behavioral test per the S6/S9 verification pattern: feed a fixture stream containing both event shapes (legacy per-issue + synthetic aggregate) and assert both reach dispatch; assert the recovery path (no-events-but-actionable-live-state) triggers sweep re-run.

## Live remediation applied

Operator instructed to have the running session re-arm its monitor unfiltered and re-run the startup sweep — the four pending `waiting-for:clarification` states dispatch from live state (step 3), so no events are lost.


## User Stories

### US1: `/cockpit:auto` step 4 prescribes an unfiltered event consumption mechanism, so the main loop cannot go blind on legacy per-issue events

**As a** cockpit operator running `/cockpit:auto <epic-ref>`,
**I want** step 4 of `auto.md` to specify a verbatim, unfiltered read recipe for the background watch stream — every non-empty line is an event, no field- or content-based filter is permitted — and to explicitly forbid the class of `grep '"type"'`-style improvisations that dropped 16 of 17 events on the T-S4 run,
**So that** the session cannot re-invent a filter that silently drops the legacy per-issue envelope (`ts`/`repo`/`kind`/`number`/`event`/`labels`, which carry no `type` field) while letting through only S8 synthetic aggregates (`phase-complete`/`epic-complete`), producing a silent total outage of the main loop.

**Acceptance Criteria**:
- [ ] `auto.md` step 4 prose is amended to state, verbatim, that new lines from the background watch process output are read **unfiltered**, every non-empty line is an event, and content-based filters over the stream are forbidden.
- [ ] The prose names the failure mode explicitly (schema heterogeneity: legacy per-issue events lack the `type` field the S8 synthetic aggregates carry; filtering on `type` would drop every real transition event) so a future session cannot re-derive the same "reasonable" filter from the same under-specified prompt.
- [ ] The prose states, verbatim, that over-delivery is harmless (the step 4(a) live-state re-check absorbs duplicates), whereas under-delivery is silent loop death — this asymmetry is the entire justification for the no-filter rule.
- [ ] No third prompt-strengthening round is added later to re-teach the same rule. The rule is stated once, in step 4, with its rationale inline.

### US2: If the harness requires a match pattern to arm a stream monitor, it matches any non-empty line — never a JSON field

**As a** cockpit playbook author,
**I want** `auto.md` to name the sanctioned way to arm a background stream reader inside the harness (Monitor-tool style stream monitors that require a matching pattern) and to pin the pattern to "any non-empty line" — a newline-delimited read — never a JSON field or content substring,
**So that** the harness constraint that forced the T-S4 session to *supply some pattern* cannot re-derive the field-based filter that caused the outage; the sanctioned pattern is written down where the session will read it.

**Acceptance Criteria**:
- [ ] `auto.md` step 4 documents, verbatim, that if the harness's stream-monitor primitive requires a matching regex or pattern, the operative pattern MUST match any non-empty line (e.g. `.+` or the newline-delimited read equivalent), not a JSON key/value.
- [ ] The prose explicitly enumerates the disallowed shapes so the session cannot re-derive them: no `grep '"type"'`, no `grep '"event"'`, no field-name substring match, no schema-shape discriminator. Named example: the `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` shape that caused this issue is called out as the anti-pattern.
- [ ] The pattern instruction is co-located with the "read unfiltered" instruction from US1 — one paragraph, one mental model, so the session cannot follow one rule and improvise the other.

### US3: Step 5 (watch re-arm) gains a liveness cross-check that catches a broken consumption path

**As a** cockpit operator whose watch process is still alive but whose consumption path has silently broken,
**I want** step 5 of `auto.md` to add a liveness cross-check — if the watch *process* is alive but no event has been consumed for N poll intervals **and** `cockpit status --json` shows one or more issues in actionable transition classes (D.1–D.9), the consumption path itself is broken; re-arm the reader and re-run the startup sweep (step 3),
**So that** the same class of silent-outage bug is caught by the loop itself rather than by an operator noticing the session sitting idle for minutes, and the recovery is deterministic (re-arm + startup sweep, both already idempotent by design).

**Acceptance Criteria**:
- [ ] `auto.md` step 5 gains a "Liveness cross-check" sub-step that fires when: (a) the background watch process is alive, (b) no event has been consumed for N consecutive poll intervals, and (c) `cockpit status --json` reports at least one issue in an actionable transition class (D.1–D.9). Any state matching the three conditions triggers the recovery path.
- [ ] The recovery path is exactly: re-arm the stream reader (same mechanism as step 5's re-spawn on watcher death), then re-run step 3 (startup sweep). No new recovery machinery is introduced — both steps are already idempotent per the L.5 idempotency rule, so the recovery reuses shipped paths.
- [ ] The prose states, verbatim, that the cross-check is the mechanism-gap defense-in-depth analogue of step 5's process-death defense, not a replacement — a live process with a dead consumer must be treated as a broken loop.
- [ ] A concrete N value is pinned in the prose (matching the poll-interval semantics already implicit in step 4), so the session cannot improvise the threshold.

### US4: A regression check is defined that would have caught this bug pre-ship, matching the S6/S9 verification pattern

**As a** cockpit playbook maintainer,
**I want** the fix to add a playbook behavioral regression check — feed a fixture stream containing both event shapes (legacy per-issue envelopes without `type` + S8 synthetic aggregates with `type`) and assert both reach dispatch; separately, assert the recovery path (no-events-but-actionable-live-state) triggers a sweep re-run,
**So that** a future edit to `auto.md` that re-introduces a filtering shape or removes the liveness cross-check cannot ship without the regression flagging it, matching the verification style already used for S6/S9 findings on this playbook.

**Acceptance Criteria**:
- [ ] A behavioral regression test (playbook fixture-style, matching the S6/S9 verification pattern already used for prior cockpit findings) is defined that feeds a stream containing at least one legacy per-issue event (envelope: `ts`/`repo`/`kind`/`number`/`event`/`labels`, no `type`) and at least one S8 synthetic aggregate (carrying `type: "phase-complete"` or `type: "epic-complete"`), and asserts both are consumed by the loop and reach the dispatch table.
- [ ] A second regression asserts the liveness cross-check triggers a startup-sweep re-run when the fixture is: process alive + zero events consumed + `cockpit status --json` shows an actionable state.
- [ ] The regression check lives in the appropriate playbook-verification location per the S6/S9 pattern (not free-floating). A one-line PR-description entry names the location.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `packages/claude-plugin-cockpit/commands/auto.md` step 4 (Main loop) prose is amended to state, verbatim, that new lines from the background watch process output are read **unfiltered** and that every non-empty line is an event. The amendment carries a one-sentence rationale inline: the stream carries more than one event shape (legacy per-issue envelopes without `type`; S8 synthetic aggregates with `type`); over-delivery is absorbed by the live-state re-check (4a); under-delivery is silent loop death. | P1 | The rule is pinned inside step 4 (not in an appendix, not in the invariants section) because that is where the session was under-instructed at T-S4. |
| FR-002 | The amendment adds a "**Never construct field- or content-based filters over the stream**" sentence, verbatim, and names the T-S4 anti-pattern explicitly (`tail -n 0 -f <watch-output> \| grep --line-buffered '"type"'`) so a future session cannot re-derive it. The prohibition covers `type` filtering, `event` filtering, any JSON-key substring match, any schema-shape discriminator. | P1 | Naming the specific anti-pattern is the #384/#388 pattern applied here — vague "don't filter" prose has been shown to lose to plausible improvisations. |
| FR-003 | If the harness's stream-monitor primitive requires a match pattern to arm, the amendment specifies the sanctioned pattern is any non-empty line (regex `.+` or equivalent newline-delimited read), verbatim. No pattern that references stream content is permitted. | P1 | Closes the "the harness made me do it" derivation path — a specific sanctioned alternative removes the need to improvise. |
| FR-004 | `auto.md` step 5 (Watch re-arm) gains a "Liveness cross-check" sub-step: if the watch process is alive AND no event has been consumed for N poll intervals AND `cockpit status --json` shows at least one issue in a D.1–D.9 transition class, re-arm the stream reader and re-run step 3 (startup sweep). The N value is pinned verbatim in the prose. | P1 | Defense-in-depth: even if a future prompt-side amendment fails to prevent a filter, the loop catches the silent outage itself. Recovery reuses shipped idempotent paths (L.5). |
| FR-005 | The liveness cross-check's recovery path is exactly: re-arm the reader (same mechanism as watch-death re-spawn) + re-run step 3. No new recovery machinery is introduced. The prose states, verbatim, that both steps are idempotent per the L.5 rule so no duplicate action can result. | P1 | Every ledger consequence of the recovery is already handled — startup-sweep events produce their own ledger lines per the mandatory-per-dispatch rule. |
| FR-006 | The one-line watch-re-arm ledger exception is preserved (per the current § Ledger "What does NOT count" clause): watch re-arms do not themselves produce a ledger line; only the dispatches they synthesize via the startup sweep do. The liveness cross-check inherits this — no new ledger surface, only re-synthesized events from step 3. | P1 | Preserves the existing ledger invariant unchanged. |
| FR-007 | A playbook behavioral regression check is defined per the S6/S9 verification pattern, feeding a fixture stream with **both** event shapes (legacy per-issue envelope + S8 synthetic aggregate) and asserting both reach the dispatch table. A second fixture asserts the liveness cross-check triggers a startup-sweep re-run on the (alive-process, zero-events, actionable-live-state) condition. | P1 | Prevents a future edit from silently re-introducing the filter or removing the cross-check. |
| FR-008 | The change touches `packages/claude-plugin-cockpit/commands/auto.md` only. Sibling cockpit playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) are out of scope; a one-line PR-description assessment confirms none of them consume a stream in the same shape today. | P1 | Scoped to the observed defect. `watch.md` produces the stream but does not consume it. |
| FR-009 | The Invariants section of `auto.md` gains one new invariant (numbered 7): "**Stream consumption is unfiltered.** Every non-empty line from `cockpit watch` is an event; content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field." | P2 | Codifies the rule at the invariants-list surface (where §1 "Never merge on red" already lives), so future edits to step 4 that would drift from the rule are visibly inconsistent with an invariant. |
| FR-010 | The observed T-S4 evidence (17 NDJSON lines produced, 1 delivered) is referenced in a one-line issue-history footnote in the same paragraph as FR-001's prose amendment, cross-linking to #394. Prior recurrences of the "instruction gap → improvisation" pattern (#384 Terminal Outcome Check, #388 fusion) are named as the class of failure this is an instance of. | P2 | Matches the #390 approach of naming the class (contract collision) inside the fix prose so future readers recognize the mechanism, not just the specific bug. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Main-loop blindness on the smoke-test corpus that triggered #394 | Zero occurrences of the "session dispatched none of the streamed events for N minutes" pattern across the replayed corpus after the change lands | Manual review of a curated set of `/cockpit:auto` sessions replayed against the fixture stream; grep the transcripts for the observed silence gap. |
| SC-002 | Fixture stream with both event shapes reaches dispatch | Both legacy per-issue events and S8 synthetic aggregates are consumed and reach the dispatch table; zero dropped events | Behavioral test on the fixture defined by FR-007. |
| SC-003 | Anti-pattern grep is absent | `packages/claude-plugin-cockpit/commands/auto.md` step 4 does not contain a recommendation to filter the stream on any JSON field, and step 4 does explicitly name and disallow the T-S4 anti-pattern (`grep '"type"'`) | Grep `auto.md` for both the required "unfiltered" phrasing (must appear) and any recommended `grep`/`jq` filter over the stream (must not appear); verify the anti-pattern name appears exactly once, in the prohibition context. |
| SC-004 | Liveness cross-check is present in step 5 | `auto.md` step 5 contains the "Liveness cross-check" sub-step with the three named preconditions (alive process, N consecutive empty polls, actionable live state) and the recovery path (reader re-arm + step 3 re-run) | Static reading of the amended step 5; grep for the sub-step heading. |
| SC-005 | Liveness cross-check triggers on the recovery fixture | The regression fixture (alive process + zero events + actionable live state) triggers a startup-sweep re-run in the playbook harness | Behavioral test on the fixture defined by FR-007. |
| SC-006 | New invariant is present and consistent with step 4 | The `## Invariants` list contains invariant §7 ("Stream consumption is unfiltered") and its wording is consistent with the step 4 prose amendment | Static reading; cross-check the two locations for verbatim consistency. |
| SC-007 | No third prompt-strengthening round | The change adds the rule at step 4, the invariant at §7, and the liveness cross-check at step 5 — nothing further. No belt-and-suspenders extra clauses, no new terminal-outcome checklists, no new gate types | Diff review of `auto.md`: the fix is one rule, one invariant, one cross-check. |
| SC-008 | Sibling playbooks confirmed uninfluenced | A one-line PR-description assessment records that `clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md` do not consume a stream in the same shape as `auto.md` today | Grep sibling playbooks for stream-consumption patterns (`tail -f`, background `cockpit watch`, etc.); record result in the PR body. |
| SC-009 | Ledger surface unchanged | The § Ledger section is byte-identical before and after this change, except for any prose that references step 4 (if any) that must remain consistent | `git diff` on the § Ledger section shows either zero changes or only consistency edits. |

## Assumptions

- The T-S4 evidence is accurate: 17 NDJSON lines were produced by `cockpit watch` on the run and 1 line was delivered to the loop; the delta is the 16 per-issue events dropped by the `grep '"type"'` filter (confirmed in the issue body).
- The two event shapes in the stream are stable: legacy per-issue envelope (`ts`/`repo`/`kind`/`number`/`event`/`labels`, no `type` field) and S8 synthetic aggregate (`phase-complete`/`epic-complete`, carrying `type`). The companion engine-side finding — that every event line should carry a uniform `type` discriminator — is filed in generacy and is out of scope for this fix (the playbook fix must work against the shape shipped today).
- The step 4(a) live-state re-check is authoritative and absorbs any duplicate delivery — this is the invariant that makes "read unfiltered, every line is an event" safe against over-delivery.
- The startup sweep (step 3) is idempotent per the L.5 rule; re-running it as part of the liveness cross-check's recovery cannot introduce duplicate action because the live-state re-check catches state that has moved on.
- The playbook execution environment supports reading a background process's stdout unfiltered (Monitor tool or an equivalent stream-monitor primitive); if the primitive requires a match pattern, it accepts `.+` (or any newline-delimited-read equivalent) to match any non-empty line.
- The N-poll-interval threshold for the liveness cross-check can be pinned to a value already implicit in step 4's poll cadence — no new configuration surface is introduced.
- `packages/claude-plugin-cockpit/commands/auto.md` is the live governance surface for the auto command; amending it here is sufficient. The canonical design-principles doc in tetrad-development (referenced elsewhere in the plugin) does not need to be touched by this fix.
- No sibling cockpit playbook consumes a stream in the same shape today. The one-line PR-description assessment (FR-008) records this rather than a separate migration.

## Out of Scope

- Any change to the `generacy cockpit watch` CLI verb or the stream schema itself. The companion engine finding (uniform `type` discriminator on every event line) is filed in generacy and is a separate change; this fix must work against the shape shipped today.
- Retroactive migration of sibling cockpit playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`). None of them consume a stream today; a one-line PR-description assessment records that.
- Changing the § Dispatch table, the § Gate contract, or the § Ledger format. This is a step-4/step-5/invariant amendment, not a redesign.
- Changing the § Error handling classes. Consumption-path breakage is caught by the FR-004 liveness cross-check, not by adding a new error class.
- Configuration surface for the N-poll-interval threshold. It is pinned in prose, not exposed as a flag.
- Post-decision changes to any dispatch row. All D.1–D.10 dispatch rows remain as shipped.
- Auto-approve on any gate. Every gate still prompts (invariant §6). This fix does not touch the gate surface.
- A runtime probe or telemetry counter for consumed-events-per-minute. The liveness cross-check *is* the probe; a separate metric is not introduced.
- Retrofitting a `type` discriminator inline in the playbook by re-classifying events at read time. The playbook consumes lines as-is; classification into transition classes happens at the step 4(a) re-check via `cockpit status --json`, not at line parse time.
- Adding a fixer subagent or bounded-repair path for a broken consumption route. The recovery is deterministic (re-arm + startup sweep); no analysis subagent is warranted for this failure class.

---

*Generated by speckit*
