# Contract: Dispatch class D.12 — `gate-answer`

Adds a new row to the `## Dispatch` table in `packages/claude-plugin-cockpit/commands/auto.md` (currently ending at D.11 — see the table at auto.md line 337–353) and a new subsection `### D.12 — gate-answer` matching the shape of the existing per-class subsections (D.1–D.11).

Load-bearing for spec FR-006, FR-007, FR-010 and Q4=A / Q5=B mappings.

## Dispatch-table row

Appended after D.11:

| # | Event | Action shape |
|---|-------|--------------|
| D.12 | `gate-answer` (typed event kind on doorbell NDJSON line and `cockpit_await_events` batch item; carries `gateId`, `generation`, `optionId`, `freeText?`) | Live-state supersession check → generation-match check → route optionId (+freeText) to the same downstream handling the local `AskUserQuestion` path performs (per § UI-mode gate mapping) → `cockpit_gate_ack(applied | superseded | failed)` |

## D.12 subsection body

```markdown
### D.12 — `gate-answer`

**Trigger**: A `gate-answer` typed event arriving on either wake path:
- Enriched doorbell NDJSON line whose parsed object has `kind: "gate-answer"`.
- A batch item returned by `cockpit_await_events(...)` whose event `kind` field is `gate-answer`.

D.12 only fires when `resolvedGateMode === "ui"`. Under `--gates=local` (or `--gates=auto` resolved to local), no remote records are open, so the doorbell surface does not emit `gate-answer` events — D.12 is dead code on that path.

**Source of truth**: The event payload IS the source of truth for the operator's answer (per § Enriched-line dispatch contract E3). The event does NOT carry the underlying label state — that comes from the SAME enriched-line `to`/`labels` fields OR from the § D.12 fallback re-query (see below).

**Payload shape** (per `data-model.md § GateAnswerEvent`):
- `gateId: string` — matches an entry in `openGates`.
- `generation: number` — must match `openGates[gateId].generation`.
- `issueRef: string` — the issue the gate belongs to (redundant with the record; used for the ledger row's `<issue-ref>` slot).
- `transitionClass: string` — matches the record's `transitionClass` (redundant, used for the ledger row).
- `answer.optionId: string` — one of the gate's option ids per the mapping table.
- `answer.freeText?: string` — optional; required when `optionId === "add-more-work"` for G.7 per Q4=A.
- `answeredAt: string` — ISO-8601 UTC.

**Dispatch steps**:

1. **Look up record**: `record = openGates[event.gateId]`. If absent, ack `cockpit_gate_ack(gateId, outcome: "superseded", detail: "no matching open record — likely startup-race or duplicate delivery")` and write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (no record) · source: ui-gate`. Do NOT dispatch further.

2. **Generation-match check (V3)**: If `event.generation !== record.generation`, ack `cockpit_gate_ack(gateId, outcome: "superseded", detail: "stale generation <g_event> (current: <g_record>)")` and write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (stale generation) · source: ui-gate`. Do NOT dispatch further.

3. **Live-state supersession check (V4)**: Read the underlying trigger label / state via the enriched doorbell line (if the D.12 event arrived via a doorbell-line drain that also carries `to`/`labels`) OR fall back to `cockpit_status(issue=<issueRef>, json=true)` (per E6 retain-the-re-check pattern for consequential gates). If the trigger has been resolved out-of-band (e.g., the `waiting-for:clarification` label has been removed, or `phase-complete` has advanced), ack `cockpit_gate_ack(gateId, outcome: "superseded", detail: "live state moved past <transition-class>")` and write ledger row: `<issue-ref> · <transition-class> · <original-action> · superseded (state advanced) · source: ui-gate`. Do NOT dispatch further.

4. **Route answer to downstream** (per § UI-mode gate mapping): each `(dispatchClass, optionId)` pair has a downstream handler in the mapping table. Invoke that handler with `answer.freeText` where applicable (G.1 make-changes, G.2 request-changes, G.6 make-changes, G.7 add-more-work). The handler performs the same tool call(s) / subagent spawn(s) / state mutation(s) the local `AskUserQuestion` path performs today — no new downstream behavior is introduced.

5. **Ack outcome**:
   - Handler success → `cockpit_gate_ack(gateId, outcome: "applied")`; ledger row uses the mapping-table `<original-action>` + local-vocabulary `<outcome>` + `· source: ui-gate` suffix (see `contracts/ledger-ui-mode.md`).
   - Handler failure (downstream tool error) → `cockpit_gate_ack(gateId, outcome: "failed", detail: "<handler-name> returned: <description>")`; ledger row: `<issue-ref> · <transition-class> · <original-action> · failed: <detail> · source: ui-gate`.
   - Handler ambiguity (D.11 typed error → re-present) → apply the re-present rule: bump `generation`, re-open with a revised body per § G.4d, do NOT ack the original record yet (the re-open supersedes the pending ack when its answer arrives).

6. **Remove from openGates**: on `applied` / `superseded` / `failed`, `openGates.delete(event.gateId)`. Revised-draft re-open (step 5 handler-ambiguity path) creates a NEW record under a fresh `gateId` (hashes over `generation` too, so a bump changes the id — the prior record is left in `openGates` and will match a stale-generation answer to `superseded`).

**Mandatory-per-dispatch ledger**: exactly one ledger line per D.12 event, per Invariant #8. The gate-open call (§ UI-mode gate mapping steps) is print-only (per `contracts/ledger-ui-mode.md`) — the D.12 event is the resolving dispatch, and its ledger row is the mandatory one.

**No content-based filter**: D.12 events are consumed in the same stream order as every other event in a batch, per Invariants #7. No pre-filter drops a `gate-answer` event because a downstream handler is currently retrying; the retry is downstream of D.12's own handling.
```

## Interactions with existing dispatch classes

- **D.1–D.4, D.6, D.7, D.10, D.11** — under `resolvedGateMode === "ui"`, these dispatch classes' gates are OPENED via `cockpit_gate_open` instead of `AskUserQuestion`; the answer arrives as a D.12 event and is routed BACK to the same-class downstream handling. D.12 is the completion path; the label-driven dispatch is the initiation path. The pair `(D.n → open gate → D.12 → downstream)` is a two-hop sequence separated by an operator turn.
- **D.5 (green merge)** — no gate, unaffected. `cockpit_gate_open` is never called for D.5.
- **D.8 (phase-complete)** — G.5 opens under `<epic-ref>` (the sole per-issue exception per § UI-mode gate mapping G.5). D.12 handles the answer identically to per-issue gates; the ledger row's `<issue-ref>` slot carries `<epic-ref>`.
- **D.9 / D.9a-d** — ledger-only rows, no gate, unaffected.

## Interactions with the fallback path

If a `cockpit_gate_open` call errors during the initiation hop (per `contracts/ui-mode-fallback.md`), the local `AskUserQuestion` fires for that gate. No `openGates` record is created. No D.12 event arrives (the record was never opened). The ledger row for that gate is written by the local flow at resolution time, in the pre-change vocabulary, WITHOUT the `· source: ui-gate` suffix (see `contracts/ledger-ui-mode.md § Fallback ledger provenance`).

## Test pins (playbook-verification)

The 449-* describe block adds:
- `assert dispatch table (§ Dispatch) contains a row starting "D.12"`
- `assert dispatch table row for D.12 names "gate-answer" as the event kind`
- `assert a new subsection "### D.12 — \`gate-answer\`" exists`
- `assert D.12 subsection body contains all three supersession outcome literals ("no record", "stale generation", "state advanced")`
- `assert D.12 subsection body names the "route optionId (+freeText) to the same downstream handling the local AskUserQuestion path performs today" invariant`
- `assert D.12 subsection body states that D.12 only fires under resolvedGateMode === "ui"`
