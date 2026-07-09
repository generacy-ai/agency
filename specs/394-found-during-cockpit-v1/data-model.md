# Data Model: Pin auto.md event-consumption + liveness cross-check + invariant §7

**Feature**: 394-found-during-cockpit-v1
**Date**: 2026-07-09

This feature is a **playbook-document edit + new executable test suite** (like #388 / #390 on the playbook side; unlike them on the test side), so the "data model" describes:
1. The structural layout of `auto.md`'s step 4, step 5, and invariants sections — their pre-/post-394 shapes and the invariants each surface must uphold.
2. The shape of the new Vitest suite entry and the fixture files under `packages/claude-plugin-cockpit/tests/`.
3. The contract invariants (C.1–C.11) each verifier (static grep + Vitest assertion) enforces.

---

## Entities

### 1. `Instructions` — step 4 (Main loop)

The core body of the playbook remains a numbered step list (6 steps). Step 4 is the "Main loop" step. This feature amends step 4's prose to pin the consumption recipe and prohibit content-based filters; it does not add or remove any of the numbered sub-steps (a)/(b)/(c)/(d).

**Pre-394 shape (deployed today, post-#388/#390)**:

```text
4. **Main loop.** For each event line from the watcher:
   - (a) Re-check live state via `generacy cockpit status --json <epic-ref>`.
       The streamed line is advisory; the live JSON is authoritative.
       If the epic's live state is `epic-complete`, go to step 6.
   - (b) Dispatch per § Dispatch below, branching on the *live* transition class.
   - (c) Write one ledger line per § Ledger.
   - (d) Continue the loop.
```

No consumption mechanism prescribed. The T-S4 session improvised `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` — the origin of the observed silent outage.

**Post-394 shape (target)**:

```text
4. **Main loop.** New lines from the background watch process output are read
   **unfiltered**. Every non-empty line (trim leading/trailing whitespace, then
   any remaining content — including malformed or truncated JSON) is an event.
   Whitespace-only lines are dropped as line-framing hygiene.

   **Never construct field- or content-based filters over the stream.** The
   stream carries more than one event shape: legacy per-issue transitions use
   the envelope `{ts, repo, kind, number, event, labels}` and have **no `type`
   field**; only S8 synthetic aggregates (`phase-complete`/`epic-complete`)
   carry `type`. Filtering on `type` would drop every real transition event.
   The T-S4 anti-pattern —
   `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` —
   is prohibited. Over-delivery is harmless (step 4a re-check absorbs it);
   under-delivery is silent loop death (this asymmetry is the whole
   justification for the no-filter rule).

   If the harness's stream-monitor primitive requires a match pattern to arm a
   reader, the pattern MUST match any non-empty line (regex `.+`, or the
   newline-delimited-read equivalent) — never a JSON field, JSON key,
   `type`/`event` substring, or schema-shape discriminator.

   Each read from the background watch process output is bounded to
   **30 seconds** per iteration. The 30s bound is the sole new detection
   mechanism admitted by this fix (see FR-004): a dead reader cannot event-
   drive its own diagnosis.

   For each event line consumed:
   - (a) Re-check live state via `generacy cockpit status --json <epic-ref>`.
         The streamed line is advisory; the live JSON is authoritative.
         If the epic's live state is `epic-complete`, go to step 6.
   - (b) Dispatch per § Dispatch below, branching on the *live* transition class.
   - (c) Write one ledger line per § Ledger.
   - (d) Continue the loop.

   Issue-history footnote: T-S4 delivered 17 NDJSON lines from `cockpit watch`
   and 1 to the loop (dropped 16 legacy per-issue events); see agency#394. This
   is an instance of the "instruction gap → improvisation" pattern (see #384
   Terminal Outcome Check, #388 fusion) applied to a mechanism gap in the
   consumption recipe.
```

**Post-394 invariants for step 4**:
- The phrase "unfiltered" appears in the amended prose (C.1).
- The T-S4 anti-pattern name (`tail -n 0 -f <watch-output> | grep --line-buffered '"type"'`) appears **exactly once**, and its surrounding context is a **prohibition**, not a recommendation (C.2, SC-003).
- The sanctioned pattern (`.+` or "newline-delimited read") is documented in the same paragraph as the "unfiltered" rule (C.3, US2 AC3).
- The 30-second bounded-read directive is present verbatim (C.4).
- The schema-heterogeneity rationale (legacy envelope without `type`; S8 synthetic aggregate with `type`) is stated inline (C.5, US1 AC2).
- The over-delivery/under-delivery asymmetry is stated inline (C.6, US1 AC3).
- Sub-steps (a)/(b)/(c)/(d) remain in this order with unchanged wording.
- No third prompt-strengthening round added later in the file (C.11, SC-007, US1 AC4).

### 2. `Instructions` — step 5 (Watch re-arm) + liveness cross-check

**Pre-394 shape (deployed today, post-#388/#390)**:

```text
5. **Watch re-arm.** If the background `cockpit watch` process dies while the
   epic is incomplete, re-spawn it (repeat step 2's Bash invocation). The
   startup sweep (step 3) + the live-state re-check (4a) make the re-arm
   idempotent — spawning `cockpit watch` twice on the same live state produces
   no duplicate action, because the re-check catches events that are already
   dispatched (state moved on).
```

**Post-394 shape (target)**:

```text
5. **Watch re-arm.** If the background `cockpit watch` process dies while the
   epic is incomplete, re-spawn it (repeat step 2's Bash invocation). The
   startup sweep (step 3) + the live-state re-check (4a) make the re-arm
   idempotent — spawning `cockpit watch` twice on the same live state produces
   no duplicate action, because the re-check catches events that are already
   dispatched (state moved on).

   **Liveness cross-check.** A live watch process with a dead consumer must be
   treated as a broken loop — the mechanism-gap defense-in-depth analogue of
   this step's process-death defense, not a replacement. The cross-check fires
   on the conjunction of:
   1. The background watch process is alive (still running per Bash tool
      handle status).
   2. **N=4 consecutive empty reads** have elapsed from step 4's 30s bounded
      read (~2 minutes of silence).
   3. `generacy cockpit status --json <epic-ref>` reports **at least one issue
      in a D.1–D.9 transition class** (actionable live state).

   The `cockpit status --json` call runs **only at the threshold**, not on
   every empty read. Silence alone is normal during long implement stretches;
   the cross-check requires actionable state.

   **Recovery** is exactly: re-arm the stream reader (same mechanism as the
   process-death path above) + re-run step 3 (startup sweep). Both are
   idempotent per the L.5 rule so no duplicate action can result. **No new
   recovery machinery is introduced** — this constraint applies to the
   recovery path only; the 30s bounded read + N=4 empty-read counter from
   step 4 is the only new detection mechanism admitted by this fix (see
   FR-004/FR-005).
```

**Post-394 invariants for step 5**:
- The heading "**Liveness cross-check**" appears in the step 5 prose (C.7, SC-004).
- The three named preconditions (alive process, N consecutive empty reads, actionable live state) are enumerated verbatim (C.7).
- The `N=4` threshold appears in the prose (C.8, US3 AC4).
- The recovery path is stated verbatim as "re-arm the reader + re-run step 3" (C.9).
- The "mechanism-gap defense-in-depth analogue" phrasing appears verbatim (C.10, US3 AC3).
- The pre-394 first paragraph (process-death re-spawn + L.5 rationale) is retained byte-identical.

### 3. `Invariants` — new §7

**Pre-394 shape (deployed today)**:

```text
## Invariants

1. **Never merge on red.** …
2. **Cockpit comments marked.** …
3. **Add-only advance.** …
4. **No cross-slash-command invocation** from `auto.md`. …
5. **Analysis in subagents** whose contracts end with the subagent — the #390 pattern. …
6. **Autonomy *policy* out of scope.** …
```

**Post-394 shape (target)**:

```text
## Invariants

1. **Never merge on red.** …
2. **Cockpit comments marked.** …
3. **Add-only advance.** …
4. **No cross-slash-command invocation** from `auto.md`. …
5. **Analysis in subagents** whose contracts end with the subagent — the #390 pattern. …
6. **Autonomy *policy* out of scope.** …
7. **Stream consumption is unfiltered.** Every non-empty line from
   `cockpit watch` is an event; content-based filters over the stream are
   prohibited. If the harness requires a match pattern to arm a reader, it
   matches any non-empty line, never a JSON field.
```

**Post-394 invariants for the invariants list**:
- Invariant §7 present verbatim (C.6, SC-006).
- Invariant §7 wording consistent with the step 4 prose amendment (verified by cross-reference).
- Invariants §1–§6 unchanged.

### 4. `Ledger` section

**Pre-394 shape**: current § Ledger.
**Post-394 shape**: byte-identical (or consistency-only edits — if any prose in § Ledger references step 4 and needs re-wording for consistency with the amended step 4, that is the only permitted change).

**Post-394 invariants for § Ledger**:
- Section byte-identical (C.11, SC-009) OR the diff scope is limited to consistency-only prose edits referencing the amended step 4.
- The **one-line watch-re-arm ledger exception** (from the current "What does NOT count" clause) is preserved (FR-006). The liveness cross-check inherits this exception — no new ledger surface, only re-synthesized events from step 3.

### 5. `Dispatch`, `Gate contract`, `Error handling` sections

Byte-identical on this branch. Explicitly out of scope per spec § Out of Scope.

### 6. Test suite scaffold — `packages/claude-plugin-cockpit/tests/`

New directory. Ships with three files:

**`packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson`**: NDJSON stream containing one line per event, at minimum:
- ≥1 legacy per-issue envelope: `{"ts":"…","repo":"…","kind":"…","number":<int>,"event":"waiting-for:clarification","labels":[…]}` — no `type` field.
- ≥1 S8 synthetic aggregate: `{"type":"phase-complete","ts":"…", "epic":"…","phase":"P<n>"}` — has `type`.
- (Optional) at least one whitespace-only line and at least one malformed JSON line, to exercise the trim-then-nonempty rule and the malformed-JSON-still-consumed rule.

**`packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json`**: `cockpit status --json` shape carrying `{issues: [{ref: "…", transition_class: "waiting-for:clarification", …}, …]}` with ≥1 issue in a D.1–D.9 class. Used by Assertion 2 (liveness cross-check).

**`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`**: Vitest suite. Two test cases:
- **Test 1 (SC-002)**: import a reference implementation of the consumption rule (see [contracts/unfiltered-stream-consumption.md](./contracts/unfiltered-stream-consumption.md) for the reference shape); feed the fixture stream through it; assert every non-whitespace-only line is dispatched exactly once, and both event shapes (legacy per-issue + S8 aggregate) reach the mocked dispatch table.
- **Test 2 (SC-005)**: with an empty stream + `394-actionable-live-state.json` + a fake alive-process handle, run the reference consumption + liveness-check function; assert the liveness cross-check fires after N=4 empty reads and the recovery function is invoked with the startup-sweep argument.

**Post-394 invariants for the test suite**:
- Suite file present at the named path (C.12).
- Both fixture files present at their named paths (C.13, C.14).
- Suite passes on a clean checkout of this branch (C.15).

---

## Contracts / invariants (SC-derived)

### C.1. "Unfiltered" phrasing in step 4 (SC-003, FR-001)

`grep -n "unfiltered" packages/claude-plugin-cockpit/commands/auto.md` returns ≥1 match, located inside step 4 prose (before the sub-steps (a)/(b)/(c)/(d)).

### C.2. Anti-pattern name present exactly once, in prohibition context (SC-003, FR-002)

`grep -c "grep --line-buffered '\"type\"'" packages/claude-plugin-cockpit/commands/auto.md` returns exactly `1`. The surrounding paragraph explicitly names the pattern as prohibited (verified by manual reading; a "prohibited"/"forbidden"/"anti-pattern"/"never" phrase appears in the same paragraph).

### C.3. Sanctioned pattern present in step 4 (FR-003, US2 AC3)

`grep -n "\\.\\+\\|newline-delimited" packages/claude-plugin-cockpit/commands/auto.md` returns ≥1 match, co-located with the "unfiltered" phrasing in step 4.

### C.4. 30-second bounded-read directive in step 4 (FR-004)

`grep -n "30 second\\|30s" packages/claude-plugin-cockpit/commands/auto.md` returns ≥1 match in step 4 prose (before the sub-steps).

### C.5. Schema-heterogeneity rationale inline in step 4 (FR-001, US1 AC2)

`grep -c "ts.*repo.*kind.*number.*event.*labels" packages/claude-plugin-cockpit/commands/auto.md` returns ≥1 (the legacy envelope is named). `grep -n "phase-complete\\|epic-complete" packages/claude-plugin-cockpit/commands/auto.md` returns matches in step 4 prose (the S8 synthetic-aggregate examples are named).

### C.6. Invariant §7 present verbatim (SC-006, FR-009)

`grep -n "Stream consumption is unfiltered" packages/claude-plugin-cockpit/commands/auto.md` returns exactly `1` match, located inside the `## Invariants` section.

### C.7. Liveness cross-check heading + preconditions in step 5 (SC-004, FR-004, US3 AC1)

`grep -n "Liveness cross-check" packages/claude-plugin-cockpit/commands/auto.md` returns ≥1 match in step 5 prose. The three preconditions (alive process, N consecutive empty reads, actionable live state) are enumerated in the same sub-step.

### C.8. N=4 threshold in step 5 (US3 AC4)

`grep -n "N=4\\|four consecutive\\|4 consecutive" packages/claude-plugin-cockpit/commands/auto.md` returns ≥1 match in step 5.

### C.9. Recovery path stated verbatim in step 5 (FR-005, US3 AC2)

The step 5 prose contains, verbatim, the phrase "re-arm the reader" (or equivalent) AND "re-run step 3" (or "startup sweep") in the same paragraph as the liveness-cross-check heading.

### C.10. "Mechanism-gap defense-in-depth" framing in step 5 (US3 AC3)

The step 5 prose contains the phrase "mechanism-gap defense-in-depth" (or the "not a replacement" framing) in the liveness-cross-check paragraph.

### C.11. Ledger section byte-identical or consistency-only edit (SC-009)

`git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md` scoped to the `## Ledger` section shows either zero changes or only consistency edits that reference the amended step 4.

### C.12. Test suite file present at named path

`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` exists on this branch.

### C.13. Mixed-shape fixture file present

`packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson` exists on this branch and contains ≥1 legacy per-issue envelope AND ≥1 S8 synthetic aggregate.

### C.14. Actionable-live-state fixture file present

`packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json` exists on this branch and contains ≥1 issue in a D.1–D.9 transition class.

### C.15. Vitest suite passes on this branch

`pnpm --filter @generacy-ai/claude-plugin-cockpit test` (or the repository-standard invocation resolved at implementation time) passes both assertions.

### C.16. Sibling playbook non-modification (FR-008 / SC-008)

`git diff origin/develop -- packages/claude-plugin-cockpit/commands/clarify.md packages/claude-plugin-cockpit/commands/review.md packages/claude-plugin-cockpit/commands/merge.md packages/claude-plugin-cockpit/commands/queue.md packages/claude-plugin-cockpit/commands/watch.md packages/claude-plugin-cockpit/commands/status.md` returns empty.

### C.17. Historical artifact preservation

`git diff origin/develop -- specs/372-epic-generacy-ai-tetrad specs/384-found-during-cockpit-v1 specs/388-found-during-cockpit-v1 specs/390-found-during-cockpit-v1` returns empty.

### C.18. No third prompt-strengthening round (SC-007)

Diff review of `auto.md` shows the fix is: one rule (step 4 amendment), one invariant (§7), one cross-check (step 5 sub-step), one behavioral regression (the Vitest suite). No new "MUST" clauses, no new checklists, no new terminal-outcome extensions beyond what #384 and #388 shipped, no new gate types.

---

## Relationships

```text
Instructions.steps[4] (Main loop)
  ├─ contains: "unfiltered" phrasing ──────────────────────────────────► C.1
  ├─ contains: T-S4 anti-pattern name, exactly once, in prohibition ──► C.2
  ├─ contains: sanctioned .+ / newline-delimited pattern ─────────────► C.3
  ├─ contains: 30-second bounded-read directive ──────────────────────► C.4
  ├─ contains: schema-heterogeneity rationale inline ─────────────────► C.5
  └─ sub-steps (a)/(b)/(c)/(d) unchanged in wording and order

Instructions.steps[5] (Watch re-arm)
  ├─ retains: pre-394 first paragraph (process-death + L.5 rationale)
  ├─ adds: Liveness cross-check sub-step heading ─────────────────────► C.7
  ├─ names: three preconditions (alive proc / N=4 empty / actionable) ► C.7
  ├─ contains: N=4 threshold verbatim ─────────────────────────────────► C.8
  ├─ contains: recovery path "re-arm + step 3" ────────────────────────► C.9
  └─ contains: mechanism-gap defense-in-depth framing ────────────────► C.10

Invariants
  ├─ retains: §1 – §6 unchanged
  └─ adds: §7 "Stream consumption is unfiltered." ─────────────────────► C.6

Ledger
  ├─ § Ledger byte-identical or consistency-only ─────────────────────► C.11
  └─ watch-re-arm exception preserved (FR-006)

tests/
  ├─ playbook-verification.test.ts present ────────────────────────────► C.12
  ├─ fixtures/394-mixed-event-shapes.ndjson present ──────────────────► C.13
  ├─ fixtures/394-actionable-live-state.json present ─────────────────► C.14
  └─ suite passes on this branch ──────────────────────────────────────► C.15

Sibling playbooks
  └─ untouched ──────────────────────────────────────────────────────► C.16

Historical specs (372, 384, 388, 390)
  └─ untouched ──────────────────────────────────────────────────────► C.17

Fix surface (aggregate)
  └─ one rule + one invariant + one cross-check + one regression ────► C.18
```

---

## Validation rules (non-normative summary)

- Step 4's amended prose defines "non-empty" once, in a way that is checkable at a read boundary (trim → non-empty), and explicitly enumerates what is dropped (whitespace-only) vs. consumed (everything else, including malformed JSON).
- The anti-pattern name is a verbatim string; a future editor cannot re-derive it accidentally.
- The step 5 cross-check is compound: silence AND actionable state — the `cockpit status --json` call is scoped to the threshold (not per empty read), preserving the `cockpit status --json` cadence invariant elsewhere in the playbook.
- The Vitest suite verifies a **reference implementation of the rule**, not the model's inference. This is a contract test on the prose; the true verifier is empirical (SC-001).
- The one-line PR-body sibling-assessment (SC-008) is a PR-body artifact, not a repo file — verified during PR creation, not by grep on the branch.
