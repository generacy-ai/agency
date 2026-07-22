# Contract: Ledger vocabulary — UI mode

Extends `packages/claude-plugin-cockpit/commands/auto.md` § Ledger (line 1228) and § Action + outcome vocabulary (line 1260). Load-bearing for spec FR-005, FR-010 and Q5=B.

## Rule (Q5=B)

Under `resolvedGateMode === "ui"`, gate-open is **print-only**; D.12 writes exactly ONE ledger line per resolved gate, in the existing four-column format:

```
<issue-ref> · <transition-class> · <original-action> · <outcome> · source: ui-gate
```

Where:
- `<issue-ref>` — the issue the gate resolves for (G.5 uses `<epic-ref>` per § UI-mode gate mapping G.5; other rows use the per-issue `<issue-ref>`).
- `<transition-class>` — matches the pre-change vocabulary (`waiting-for:clarification`, `completed:validate`, `phase-complete`, etc.).
- `<original-action>` — matches the pre-change `<action>` vocabulary at auto.md line 1264–1300. For example, D.1 uses `clarification-batch`; D.8 uses `phase-queue-gate`; D.7 uses `escalation-gate`.
- `<outcome>` — matches the pre-change `<outcome>` vocabulary for the `applied` case (e.g., `advanced`, `queued P<n> (<N> issues)`, `manually validated`). For non-applied cases, uses the new UI-specific outcomes: `superseded (<reason>)`, `failed: <detail>`.
- `· source: ui-gate` — the provenance suffix appended in the outcome slot (matching the E6 `· source: enriched-line` convention at auto.md line 1303).

## Gate-open is print-only

Per FR-005, gate-open emits "exactly one pointer line" to the transcript:

```
gate open: <title> → answer in the generacy.ai inbox (<inboxUrl>)
```

No `[ledger] ` prefix, NO append to the persistent ledger file. This is a UI affordance for the operator, not a dispatch record. Under Invariant #8's cost contract:

- **Local mode**: every gate dispatch writes one ledger line at RESOLUTION time. The dispatch's ledger row IS the mandatory-per-dispatch record.
- **UI mode**: same — one ledger line per gate at RESOLUTION time (the D.12 event). Gate-open is the operator-visible affordance; D.12 is the dispatch. Symmetry preserved.

**Rationale rejection**: Option A (both gate-open and D.12 write rows) would double the ledger volume for every gate and invent a new `gate-open` action verb, breaking every existing post-mortem grep recipe (`grep 'clarification-batch · advanced' <ledger>` would miss UI-mode rows if they used a different action). Q5=B preserves the recipe surface.

## Outcome vocabulary — new UI-specific strings

Added to the § Action + outcome vocabulary table:

| Dispatch row | `<action>` | `<outcome>` (examples) |
|--------------|------------|------------------------|
| D.12 (superseded — no record) | (same as record's `<original-action>` OR `gate-open` if record was lost) | `superseded (no record) · source: ui-gate` |
| D.12 (superseded — stale generation) | (same as record's `<original-action>`) | `superseded (stale generation) · source: ui-gate` |
| D.12 (superseded — live state advanced) | (same as record's `<original-action>`) | `superseded (state advanced) · source: ui-gate` |
| D.12 (failed — downstream handler error) | (same as record's `<original-action>`) | `failed: <detail> · source: ui-gate` |
| Fallback first-failure note (one-time per run) | `gate-open` | `error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate` |
| Fallback resolution (local AskUserQuestion after cockpit_gate_open failure) | (same as pre-change `<action>`) | (pre-change `<outcome>`) · source: ui-gate-fallback |

## Provenance-suffix precedence rule

Per row, only ONE of the three suffixes appears in the outcome slot:

- `· source: enriched-line` — pre-existing (E6). Applied when the dispatch was driven by an enriched doorbell line.
- `· source: ui-gate` — NEW (this contract). Applied to D.12 resolutions (both applied and superseded/failed cases) AND to the fallback first-failure note.
- `· source: ui-gate-fallback` — NEW (this contract). Applied to resolutions that fell back to local AskUserQuestion after `cockpit_gate_open` failed.

The three suffixes are mutually exclusive within a single row. A D.12 resolution is `ui-gate`. A fallback resolution is `ui-gate-fallback`. A local-mode resolution has NO source suffix (equivalent to `source: re-query`, unless the dispatch was itself driven by an enriched line — in which case it's `enriched-line`, unchanged).

Grep semantics extended (post-mortem):
- `grep 'source: ui-gate$' <ledger>` — all clean UI-mode resolutions (the `$` distinguishes from `ui-gate-fallback`).
- `grep 'source: ui-gate-fallback' <ledger>` — all fallback resolutions.
- `grep 'source: enriched-line' <ledger>` — pre-existing, unchanged.
- `grep -Ev 'source: (ui-gate|ui-gate-fallback|enriched-line)' <ledger>` — pre-change / re-query rows.

## Interaction with the E6 marker rule

The E6 rule at auto.md line 1303 defines `· source: enriched-line` suffix appending for the enriched-line dispatch path. D.12 events themselves arrive on the enriched-line path (per § D.12 subsection payload shape), but the ledger suffix precedence for D.12 is `ui-gate`, NOT `enriched-line`. Rationale: `ui-gate` carries more specific information (the resolution came through the remote inbox) than `enriched-line` (which merely says the transport was the enriched doorbell). When a row could carry either, `ui-gate` wins.

This precedence is explicit in the extended E6 rule: "D.12 rows use `· source: ui-gate` (or `ui-gate-fallback`) regardless of transport; `· source: enriched-line` applies only to non-D.12 rows driven by the enriched doorbell line."

## Test pins (playbook-verification)

The 449-* describe block adds:
- `assert § Ledger section states "gate-open is print-only" with reference to FR-005`
- `assert § Action + outcome vocabulary table contains rows for D.12 covering superseded (no record), superseded (stale generation), superseded (state advanced), failed: <detail>`
- `assert § Ledger section states the three-way provenance-suffix precedence rule (enriched-line vs ui-gate vs ui-gate-fallback)`
- `assert the "gate open: <title> → answer in the generacy.ai inbox" pointer-line format is present in § UI-mode gate mapping and matches FR-005's "exactly one pointer line" phrase`
- `assert grep-recipe examples for ui-gate and ui-gate-fallback are present in the extended E6 marker rule`

Re-pin, don't weaken.
