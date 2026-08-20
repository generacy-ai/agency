# Contract: G.9 / D.13 — Remediation-limit gate

**Requirement**: FR-003 / US2 · **Clarification**: Q2 (Option A) · **Dispatch row**: D.13
(`waiting-for:remediation-limit`) — **NEW**

When the engine's remediate loop hits its retry cap without converging, it raises
`waiting-for:remediation-limit` with the remaining findings in the gate body. `auto` surfaces this as
a fused human gate so the operator can decide whether to reset the counter and resume, or stop.

## Trigger

- **New dispatch row D.13** fires on `waiting-for:remediation-limit` (enriched-line `to`/`labels`).
- The row must be **recognised** so a remediation-limit label never falls through to D.10
  (unknown-state escalation).

## Machinery (modeled on D.4)

- **gateType** `remediation-limit` — a **1:1** mapping (one dispatch row, one gate), so the
  generation-drift branch is **enabled** (unlike the shared-enum `escalation` gateType).
- **Step 0** pre-draft gate-status check, same shape as D.4.
- **generation discriminator**: remediation counter + findings hash (or PR head SHA + counter);
  DATA-GAP note like the siblings if the counter is not yet computed cluster-side.

## Presentation

- Parse **remaining findings from the gate body** and render them.
- **No subagent** — the findings come from the engine gate body, not a cluster-side analyzer.

## Options and outcomes

| Option | Action | Label effect | Ledger |
|--------|--------|--------------|--------|
| `resume remediation` | `cockpit_advance(issue=<ref>, gate="remediation-limit")` — resets the engine's remediation counter **server-side** | advanced via engine gate path | `remediation-limit-gate` → `resumed (advanced)` / `advance failed: <desc>` |
| `stop` | **Exit auto cleanly** — **no label writes** | none written | `stop (exit)` |

- `resume remediation` uses the same engine-gate-advance pattern as D.4's
  `cockpit_advance(issue, gate="manual-validation")`. **`cockpit_resume` is the WRONG verb** (it is
  process/paused-issue resume, not a labeled-gate answer).
- `stop` exits cleanly with no label writes (add-only advance invariant §3).

## Invariants

- §3 Add-only advance — `stop` writes no labels; `resume remediation` advances via the engine gate
  path only.
- §6 Every gate prompts — G.9 prompts; it never auto-resumes.
- §9 MCP-tool-only — resume goes through `cockpit_advance`.

## UI-mode mapping row

`transitionClass = waiting-for:remediation-limit`; options `resume remediation`/`stop`; downstream
`resume` → `cockpit_advance(gate="remediation-limit")`, `stop` → exit; body = engine findings from
the gate body.

## Pins (`playbook-verification.test.ts`)

- `500-5`: D.13 + G.9 present `resume remediation`/`stop`; `resume remediation` →
  `cockpit_advance(issue, gate="remediation-limit")`; `stop` → exit, no label writes; findings parsed
  from gate body; no subagent.
- `500-7` (shared): gate-mapping table has a G.9 row; generation-discriminator table has a
  `remediation-limit` row.
- `500-9`: `waiting-for:remediation-limit` is a recognised dispatch row (never falls to D.10).
- Re-pin (471 block): `row.gateType ∈ {…}` set gains `remediation-limit`.
