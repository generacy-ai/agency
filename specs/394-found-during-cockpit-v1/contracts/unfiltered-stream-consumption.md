# Contract: Unfiltered Stream Consumption + Liveness Cross-Check

**Feature**: 394-found-during-cockpit-v1
**Target**: `packages/claude-plugin-cockpit/commands/auto.md` (steps 4 and 5, and the `## Invariants` section); `packages/claude-plugin-cockpit/tests/` (new).

This is a **structural contract** on three surfaces of one playbook and a scaffold for a new executable test suite. The consumers are:
- Claude at runtime (interpreting the playbook, executing the read loop and the cross-check).
- Human reviewers (verifying the contract via grep + reading, per [quickstart.md](../quickstart.md)).
- The Vitest runner (executing the reference implementation against the fixture files).

It layers on top of #388's `contracts/fused-step.md` and #390's `contracts/subagent-boundary.md`. Neither is modified. The step 4 / step 5 / invariants surfaces this contract touches are independent of #388 / #390's surfaces.

---

## C.0 — Scope

Applies to:
- `auto.md` step 4 (Main loop) — read shape + prohibition + sanctioned pattern + bounded read.
- `auto.md` step 5 (Watch re-arm) — Liveness cross-check sub-step.
- `auto.md` `## Invariants` — new §7.
- `packages/claude-plugin-cockpit/tests/` — Vitest suite + two fixtures.

Out of scope:
- `auto.md` sections § Dispatch, § Gate contract, § Ledger, § Error handling (byte-identical or consistency-only, per spec § Out of Scope and SC-009).
- Sibling playbooks (byte-identical, per FR-008 / SC-008 and quickstart.md § Sibling non-modification check).
- Historical spec directories (byte-identical, per plan.md § Project Structure and quickstart.md).

## C.1 — Read shape (step 4)

Step 4's amended prose MUST describe a read loop with these properties, verbatim:

1. **Unfiltered read** — new lines from the background watch process output are read **unfiltered**. No filter step (`grep`, `jq`, `awk`, or any content-based predicate) is interposed between the watch process's output and the parent loop.
2. **Non-empty line definition** — trim leading/trailing whitespace, then any remaining content (including malformed or truncated JSON) is an event. Whitespace-only lines are dropped as line-framing hygiene.
3. **Prohibition on content-based filters** — the prose contains, verbatim, the sentence "**Never construct field- or content-based filters over the stream**" (or a near-verbatim equivalent that names both "field-" and "content-based").
4. **Anti-pattern name, exactly once, in a prohibition context** — the literal string `tail -n 0 -f <watch-output> | grep --line-buffered '"type"'` (or the identical shape with matching quoting) appears **exactly once** in the file, and the surrounding sentence names it as prohibited (never as a recommendation, example, or acceptable variation).
5. **Sanctioned pattern (harness stream-monitor case)** — if the harness's stream-monitor primitive requires a match pattern to arm a reader, the sanctioned pattern is **any non-empty line** (regex `.+`, or the newline-delimited-read equivalent). This is stated verbatim in the same paragraph as the "unfiltered" rule.
6. **30-second per-iteration bounded read** — each read from the background watch process output is bounded to **30 seconds**. This is stated verbatim in step 4 prose (before or between the prohibition and the sub-steps (a)/(b)/(c)/(d)).
7. **Schema-heterogeneity rationale inline** — the prose enumerates both event shapes (legacy per-issue envelope `{ts, repo, kind, number, event, labels}` without `type`; S8 synthetic aggregates `phase-complete`/`epic-complete` with `type`) and names the resulting failure mode (filtering on `type` drops every real transition event).
8. **Over-delivery/under-delivery asymmetry rationale inline** — the prose states, verbatim, that over-delivery is harmless (step 4a re-check absorbs it) and under-delivery is silent loop death — the entire justification for the no-filter rule.

**Verifiers** (see [quickstart.md](../quickstart.md) § Static checks for the grep recipes): C.1 → SC-003, FR-001, FR-002, FR-003, US1 AC1–3, US2 AC1–2.

## C.2 — Liveness cross-check (step 5)

Step 5's amended prose MUST retain the pre-394 first paragraph (process-death re-spawn + L.5 idempotency) byte-identical, and add a new sub-step with these properties, verbatim:

1. **Heading** — a "**Liveness cross-check**" heading (or equivalent bold phrase — greppable anchor: `Liveness cross-check`).
2. **Three preconditions enumerated** — the sub-step names all three trigger conditions:
   - (a) The background watch process is alive.
   - (b) **N=4 consecutive empty reads** have elapsed (~2 minutes of silence, given step 4's 30s bounded read).
   - (c) `generacy cockpit status --json <epic-ref>` reports at least one issue in a D.1–D.9 transition class.
3. **Compound trigger** — the prose states, verbatim, that the cross-check fires only on the conjunction of the three conditions. Silence alone does not fire it.
4. **`cockpit status --json` call scope** — the prose states, verbatim, that the status call runs **only at the threshold** (after N=4 empty reads), not on every empty read.
5. **Recovery path** — the prose states, verbatim, that recovery is exactly: (i) re-arm the stream reader (same mechanism as the process-death path), (ii) re-run step 3 (startup sweep). No other actions.
6. **No-new-recovery-machinery framing** — the prose states, verbatim, that no new recovery machinery is introduced (the constraint applies to the recovery path only, per FR-005; detection machinery in step 4 is admitted).
7. **Idempotency reference** — the prose references the L.5 rule (or equivalent shorthand pointing at the "startup sweep + live-state re-check" idempotency invariant).
8. **Mechanism-gap framing** — the prose contains the phrase "mechanism-gap defense-in-depth" (or an equivalent explicit framing that the cross-check is defense-in-depth analogue of the process-death defense — not a replacement).

**Verifiers**: C.2 → SC-004, SC-005 (paired with C.4 Test 2), FR-004, FR-005, US3 AC1–5.

## C.3 — Invariant §7

The `## Invariants` section MUST retain invariants §1–§6 unchanged, and add a new §7 with these properties:

1. **Heading and number** — the invariant is numbered `7` and titled **"Stream consumption is unfiltered."** (with the terminal period).
2. **Body wording** — the invariant body states, verbatim:

   > Every non-empty line from `cockpit watch` is an event; content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.

3. **Position** — appears as the last entry in the invariants numbered list.
4. **Consistency** — the wording is consistent with the step 4 prose amendment (both use "unfiltered", both prohibit content-based filters, both name the sanctioned pattern as "any non-empty line").

**Verifiers**: C.3 → SC-006, FR-009.

## C.4 — Test suite (Vitest)

The suite file at `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` MUST be a Vitest suite with these properties:

1. **File exists** on this branch.
2. **Test 1 — mixed-shape stream reaches dispatch (SC-002)**:
   - Loads `packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson`.
   - Invokes a reference implementation of the step 4 read loop (see C.5) with a mock dispatch function.
   - Asserts: every non-whitespace-only line in the fixture reaches the dispatch mock exactly once (including malformed-JSON lines); both event shapes (legacy per-issue envelope AND S8 synthetic aggregate) are represented in the dispatch calls; no line is dropped by any content-based predicate.
3. **Test 2 — liveness cross-check fires on the actionable-state fixture (SC-005)**:
   - Loads `packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json`.
   - Invokes the reference implementation with (i) an empty stream, (ii) a fake alive-process handle, (iii) a mock `cockpit status --json` returning the fixture payload.
   - Asserts: after exactly N=4 empty reads (with the 30s bound applied — the test can and should use a fake timer, not literal wall-clock), the cross-check fires and invokes the recovery function with the startup-sweep argument.
4. **Assertions independent of the model** — the tests do NOT call Claude at runtime; they exercise a **reference implementation** of the rule (see C.5). The suite is a contract test on the prose, not a behavioral trace.

**Verifiers**: C.4 → SC-002, SC-005, FR-007.

## C.5 — Reference implementation (for the Vitest suite)

The suite MUST include (or import) a reference implementation of the step 4 read loop and the step 5 liveness cross-check, with these properties:

1. **Read function** — takes (i) a stream source (a Readable, an async iterator over lines, or an array of lines for testability), (ii) a dispatch callback, (iii) an empty-read counter reference. For each line: if trim → non-empty, call the dispatch callback with the raw (trimmed) line. Otherwise (whitespace-only), increment nothing, dispatch nothing.
2. **No filter step** — the reference implementation must not contain any `line.startsWith('{')`, `JSON.parse(line)`, `line.includes('"type"')`, or any similar predicate. Its only conditional on the line content is the trim-then-nonempty check.
3. **30s bounded read** — the read timeout is a configurable parameter (default 30_000 ms) so tests can use fake timers.
4. **Empty-read counter** — the reference implementation increments the counter on a bounded-read return with no lines consumed; resets to 0 on any line consumed.
5. **Liveness cross-check function** — takes (i) the empty-read counter, (ii) a status-json callable, (iii) a process-alive callable, (iv) a recovery callable. When the counter reaches N=4 AND `process-alive()` returns true AND `status-json()` returns a payload with ≥1 issue in a D.1–D.9 class, calls `recovery({ mode: "startup-sweep" })`.
6. **File location** — the reference implementation lives in a file adjacent to the suite (e.g., `packages/claude-plugin-cockpit/tests/reference-consumption.ts`); the suite imports from it. Alternately, the reference may live inline in the suite file. Implementation-time choice.

**Rationale for the reference implementation**: the runtime is a model executing prose; there is no production code to exercise. The reference is a **specification of the rule in code** that a test can exercise. It matches the prose contract line-for-line, so a future change to the prose that would drift the rule can be caught by a test edit that changes the reference's behavior.

## C.6 — Fixture: `394-mixed-event-shapes.ndjson`

The fixture file at `packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson` MUST contain these lines (in any order):

1. **At least one legacy per-issue envelope** — JSON with keys `ts`, `repo`, `kind`, `number`, `event`, `labels`. No `type` field. Example:
   ```json
   {"ts":"2026-07-09T12:00:00Z","repo":"christrudelpw/sniplink","kind":"issue","number":1,"event":"waiting-for:clarification","labels":["waiting-for:clarification"]}
   ```
2. **At least one S8 synthetic aggregate** — JSON with `type` field valued `phase-complete` or `epic-complete`. Example:
   ```json
   {"type":"phase-complete","ts":"2026-07-09T12:01:00Z","epic":"christrudelpw/sniplink#1","phase":"P1"}
   ```
3. **(Recommended) at least one whitespace-only line** — to exercise the trim-then-nonempty rule (this line should NOT reach dispatch).
4. **(Recommended) at least one malformed JSON line** — e.g., a truncated `{"ts":"…"` line without the closing `}`. This line SHOULD reach dispatch (per FR-001 — malformed JSON is consumed as an event; step 4a re-check absorbs it).

The fixture should cover 3–8 total non-whitespace-only lines to keep the test scannable.

## C.7 — Fixture: `394-actionable-live-state.json`

The fixture file at `packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json` MUST be a valid JSON document with the shape of `cockpit status --json` and MUST contain at least one issue whose `transition_class` (or equivalent field the reference implementation reads) is in the D.1–D.9 set. Illustrative shape:

```json
{
  "epic_ref": "christrudelpw/sniplink#1",
  "epic_state": "phase-in-progress",
  "issues": [
    {
      "ref": "christrudelpw/sniplink#2",
      "transition_class": "waiting-for:clarification",
      "labels": ["waiting-for:clarification"]
    }
  ]
}
```

The exact field names on the issues objects should match whatever the reference implementation and `auto.md` step 4a describe as the actionable state predicate. Implementation-time detail — anchored to the current shape of `generacy cockpit status --json` output; if the shape has drifted, the fixture matches the drifted shape and the reference implementation reads it consistently.

## C.8 — Sibling non-modification (SC-008 / FR-008)

The following files MUST be byte-identical to `origin/develop` on this branch:

- `packages/claude-plugin-cockpit/commands/clarify.md`
- `packages/claude-plugin-cockpit/commands/review.md`
- `packages/claude-plugin-cockpit/commands/merge.md`
- `packages/claude-plugin-cockpit/commands/queue.md`
- `packages/claude-plugin-cockpit/commands/watch.md`
- `packages/claude-plugin-cockpit/commands/status.md`

The PR body contains a one-line assessment recording this — verified during PR creation, not by a repo file.

## C.9 — Historical artifact preservation

The following directories MUST show zero changes vs `origin/develop`:

- `specs/372-epic-generacy-ai-tetrad/`
- `specs/384-found-during-cockpit-v1/`
- `specs/388-found-during-cockpit-v1/`
- `specs/390-found-during-cockpit-v1/`

## C.10 — § Ledger consistency (SC-009)

`git diff origin/develop -- packages/claude-plugin-cockpit/commands/auto.md` scoped to the `## Ledger` section (from the `## Ledger` heading through the next top-level `##` heading, i.e., through `## Invariants`) shows either zero changes or only consistency edits that reference the amended step 4. New rows, new outcome vocabulary, or new format-sentence changes are prohibited.

## C.11 — No third prompt-strengthening round (SC-007)

Diff review of `auto.md` on this branch shows the fix is: one rule (step 4), one invariant (§7), one cross-check (step 5), one behavioral regression (the Vitest suite). No adjacent "MUST" hedges, no new checklists, no new terminal-outcome extensions, no new gate types. Any wording change in `auto.md` fits into one of these four categories.

---

## Non-normative examples (informative)

### Example 1 — the fixture stream reaches dispatch

The Vitest suite runs Test 1:

```typescript
// packages/claude-plugin-cockpit/tests/playbook-verification.test.ts (excerpt)
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { consumeStream } from "./reference-consumption";

describe("394 — unfiltered stream consumption", () => {
  it("dispatches every non-empty line, both event shapes reach dispatch", () => {
    const fixture = readFileSync(
      "packages/claude-plugin-cockpit/tests/fixtures/394-mixed-event-shapes.ndjson",
      "utf-8",
    );
    const lines = fixture.split("\n");
    const dispatched: string[] = [];

    consumeStream(lines, (line) => dispatched.push(line));

    const trimmed = lines.map((l) => l.trim()).filter((l) => l.length > 0);
    expect(dispatched).toEqual(trimmed);
    expect(dispatched.some((l) => l.includes('"event":"waiting-for:clarification"'))).toBe(true);
    expect(dispatched.some((l) => l.includes('"type":"phase-complete"'))).toBe(true);
  });
});
```

### Example 2 — the liveness cross-check fires

```typescript
// packages/claude-plugin-cockpit/tests/playbook-verification.test.ts (excerpt)
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { runLivenessCheck } from "./reference-consumption";

describe("394 — liveness cross-check", () => {
  it("fires on empty stream + alive process + actionable state after N=4 empty reads", () => {
    const status = JSON.parse(
      readFileSync(
        "packages/claude-plugin-cockpit/tests/fixtures/394-actionable-live-state.json",
        "utf-8",
      ),
    );
    const recovery = vi.fn();
    const state = {
      emptyReads: 0,
      processAlive: () => true,
      statusJson: () => status,
      recovery,
    };

    // Simulate 4 empty bounded reads.
    for (let i = 0; i < 4; i++) {
      runLivenessCheck(state);
      state.emptyReads += 1;
    }
    runLivenessCheck(state);

    expect(recovery).toHaveBeenCalledOnce();
    expect(recovery).toHaveBeenCalledWith({ mode: "startup-sweep" });
  });
});
```

### Example 3 — a filtered read violates C.1

An implementation that ships as:

```markdown
4. **Main loop.** Consume events with:
   ```
   tail -n 0 -f <watch-output> | grep --line-buffered '"type"'
   ```
   For each event line …
```

Violates C.1 (the recipe **is** the anti-pattern, not a prohibition; SC-003 fails). Any wording that recommends a `grep` on the stream — even a different filter, even inside a "example" block that isn't explicitly labeled as an anti-pattern — violates C.1.

### Example 4 — silence-only (wall-clock) trigger violates C.2

An implementation that ships step 5 as:

```markdown
5. **Watch re-arm.** …
   **Liveness cross-check.** If more than 120 seconds have elapsed since the last
   consumed event line, re-arm the reader.
```

Violates C.2:
- No compound trigger (silence alone fires it — false positives during long implement stretches).
- No `cockpit status --json` guard (fires unconditionally on silence).
- No N=4 threshold pinned in step 4 units (the 120s is not stated in the step 4 bounded-read units).
- The observed T-S4 bug (a broken reader that never wakes up) is not caught: the 120s wall-clock never fires because the loop is stuck in `read` — no wake-up to compare to.

---

## Anti-patterns (each is a CONTRACT VIOLATION)

**AP-1** — Step 4's amended prose recommends any filter step on the stream (`grep`, `jq`, `awk`, `test -n`, etc.) between watch output and the parent loop. C.1 violation; SC-003 failure.

**AP-2** — The T-S4 anti-pattern name (`tail -n 0 -f <watch-output> | grep --line-buffered '"type"'`) appears zero times, OR appears in a non-prohibition context (recommendation, example, historical anecdote without a clear "never do this" framing), OR appears more than once. C.1 violation; SC-003 failure.

**AP-3** — Step 4 lacks the sanctioned `.+` / newline-delimited-read pattern for the harness stream-monitor case. C.1 violation; US2 AC3 failure.

**AP-4** — Step 4 lacks the 30-second bounded-read directive, OR pins a different bounded-read value (60s, 120s, 15s) without a corresponding update to the N=4 threshold. C.1 violation; FR-004 failure.

**AP-5** — The trim-then-nonempty rule is stated with a content-shape heuristic ("must start with `{`", "must parse as JSON", etc.). C.1 violation; FR-001 failure. Q2=C's rejection.

**AP-6** — Step 5's liveness cross-check triggers on silence alone (no compound predicate). C.2 violation; US3 AC5 failure. Q1=A's rejection.

**AP-7** — Step 5's `cockpit status --json` call is stated as running on every empty read, or on every 30s interval. C.2 violation; US3 AC5 failure.

**AP-8** — Step 5's recovery path introduces new machinery beyond "re-arm + startup sweep". C.2 violation; FR-005 failure.

**AP-9** — The `## Invariants` section retains §1–§6 but §7 is absent, OR §7's body wording is inconsistent with step 4 (e.g., §7 says "filters are allowed with rationale" while step 4 says "prohibited"). C.3 violation; SC-006 failure.

**AP-10** — The Vitest suite is absent, OR the two fixtures are absent, OR the suite fails on a clean checkout. C.4 / C.6 / C.7 violation; SC-002 / SC-005 / FR-007 failure. Q3=A rejection (standalone `.md` regression file is not executable verification).

**AP-11** — Test 1 asserts only that "some" lines reach dispatch, OR relies on parsing the fixture lines with `JSON.parse`. C.4 violation; SC-002 failure. The test must assert the trim-then-nonempty rule and both shapes, and must not gate dispatch on JSON parseability.

**AP-12** — A sibling cockpit playbook (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `watch.md`, `status.md`) is edited on this branch. C.8 violation; FR-008 / SC-008 failure.

**AP-13** — A historical spec directory (`specs/372-…`, `specs/384-…`, `specs/388-…`, `specs/390-…`) is edited on this branch. C.9 violation.

**AP-14** — § Ledger section has non-consistency-edit changes (new rows, new outcome vocabulary, new format sentence). C.10 violation; SC-009 failure.

**AP-15** — A third prompt-strengthening round is added (new "MUST" clauses adjacent to step 4, new terminal-outcome extensions, new gate types, new belt-and-suspenders hedge prose). C.11 violation; SC-007 failure. The three surfaces (step 4, invariant §7, step 5 cross-check) plus one regression suite are the entire fix.
