# Contract: Sweep-time generation derivation (FR-006)

Load-bearing prose for the removal of the `generation=1` hard-coded default at `auto.md:198` and its replacement with the per-gateType generation-discriminator function the live path uses. Prose fragments below are meant to be pinned by `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` in the `describe("457 sweep-time gate reuse", ...)` block.

## Why this is load-bearing

The whole feature is a no-op without this change. Today the sweep calls `cockpit_gate_open(gateId=hash(issueRef, dispatchClass, generation=1))` (`auto.md:198`) while the live path calls `cockpit_gate_open` with a content-derived `generation` (per the § UI-mode gate mapping generation-discriminator table at `auto.md:1354-1366`). The two `gateId`s never coalesce, so the pre-draft `cockpit_gate_status({issueRef, gateType, generation})` call would look up a `gateId` that doesn't exist — the check would always return `absent`, the drafting subagent would always spawn, and the feature would deliver zero value.

FR-006 makes this precondition explicit: FR-002 requires the pre-draft check to use the same `gateId` as the live path, and FR-006 is the change that makes that possible.

## Verbatim removal

The current prose at `auto.md:198` reads:

> **gateId idempotency**: every sweep-time `cockpit_gate_open` call uses `gateId = hash(issueRef, dispatchClass, generation=1)` per plan-doc rules (`generation=1` is the sweep-time default since a restart forgets in-memory generation state). The tool server MUST recognize a duplicate `gateId` and return the existing record's `inboxUrl` rather than creating a duplicate — cluster-side property owned by the epic (see `cockpit-remote-gates-plan.md § Idempotency`). Plugin-side, on a duplicate return the sweep still adds an entry to `openGates` in-memory (the record's `openedAt` may be earlier than the run's start — expected on a takeover / restart).

Replace with:

> **gateId idempotency**: every sweep-time `cockpit_gate_open` call uses `gateId = hash(issueRef, gateType, generation)` where `generation` is derived from the SAME per-gateType function the live path uses. The plugin never hand-builds the hash — the `cockpit_gate_open` MCP tool derives `gateKey` and `gateId` from the semantic inputs the plugin passes. The pre-draft `cockpit_gate_status({issueRef, gateType, generation})` check names the same three semantic inputs, so sweep-derived and live-derived `gateId`s coalesce when the underlying content has not changed.
>
> Plugin-side, on a `cockpit_gate_status` reuse-return the sweep records a partial `openGates` entry (see auto.md § step 3 sweep `gateId idempotency` DATA GAP note); `inboxUrl`/`askedAt`/`title` are not carried by the query return.

**Test assertion 457-2**: § step 3 startup sweep NO LONGER contains the literal substring `generation=1`. The prose containing `hash(issueRef, dispatchClass, generation=1)` is removed; the replacement prose containing `hash(issueRef, gateType, generation)` and referencing the pre-draft check is present.

## DATA GAPS

The § UI-mode gate mapping already documents (per `auto.md:1367`) that several inputs to the per-gateType generation function are NOT yet derived from durable GitHub state today:

- **`clarification`**: no stable batch-id or answer-set content hash — the parent doesn't compute one.
- **`artifact-review`**: no review-branch head SHA — the review subagent fetches its own diff.
- **`implementation-review`**: no PR head SHA — same as above.
- **`manual-validation`**: no PR head SHA — same as above.
- **`escalation`**: no durable occurrence counter — dedup is the session-local `dispatched-issues` set.
- **`scope-drained`**: no drain counter.

For these gateTypes, the sweep can still derive a `generation` value using whatever placeholder function the live path uses today — the KEY invariant is that BOTH the sweep and the live path use the SAME function, not that the function itself is durable. When the placeholder happens to produce the same value on sweep and live (typically, when the loop has not iterated past the first draft), the pre-draft check catches the exact-reuse case. When the placeholder produces different values, the pre-draft check falls through to the generation-drift branch (list-then-ack-superseded-then-redraft) — the drafting subagent still runs, but no duplicate INBOX entry is created.

**`phase-queue` and `filing`** have NO gap (`phase-queue` = `P<next>` phase number; `filing` = draft hash over `{title, body, labels}`). For these two, the pre-draft check catches exact-reuse unconditionally.

## Test coverage sketch

- **457-2**: § step 3 startup sweep prose removal — the literal `generation=1` no longer appears in the sweep's `gateId idempotency` paragraph.
- **457-13**: § UI-mode gate mapping generation-discriminator table is UNCHANGED — drift audit ensures that the sweep and live paths continue to reference the same table (a divergent function would silently re-break the feature).
- The § UI-mode gate mapping table at `auto.md:1354-1366` is not touched by this ticket — the fix is that the sweep now consults the table it should have been consulting from day one.

## Interaction with the pre-draft check

The pre-draft check contract (`pre-draft-check.md § Verbatim step-0 block`) is written assuming FR-006 is applied — its step 1 says "Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses." Applying the pre-draft check without FR-006 is a no-op (see § Why this is load-bearing above). The two changes MUST land together in the same PR; splitting them into two PRs delivers no value in the first and a redundant edit in the second.

## Interaction with #1038 DATA GAPS follow-up

Closing the DATA GAPS (per `auto.md:1367`) is a separate upstream deliverable — the parent loop starts computing head SHA / occurrence counter / batch-id / drain counter durably. When that lands, the per-gateType generation functions become fully coalescing, and SC-002 (drafting subagent spawns for issues with an existing open gate) hits ZERO across all gateTypes (not just `phase-queue` and `filing`). This ticket does NOT block on that follow-up — SC-001 (duplicate inbox entries) is met immediately with the change described here, because generation-drift is handled correctly.
