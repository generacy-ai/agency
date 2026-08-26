# Contract: G.8 — Implementation-review final-approval gate

**Requirement**: FR-004 / US3 · **Clarification**: Q1 (Option A) · **Dispatch row**: D.3
(`waiting-for:implementation-review`, now post-validate)

The post-validate `waiting-for:implementation-review` gate is a **final human approval** gate. The
engine has already run review → remediate → validate server-side; there is no fresh verdict to
compute cluster-side. `auto` renders the engine's findings and offers a merge/hold/reject decision.

## Trigger

- Dispatch row **D.3** fires on `waiting-for:implementation-review` (enriched-line `to`/`labels`).
- The gate is post-validate (moved by engine epic #1120) — it fires **after** `completed:validate`
  green, as the final approval before merge (see research.md § D8 for the D.5/D.3 ordering).

## Preserved machinery (do NOT change)

- **gateType** `implementation-review`, generation = **PR head SHA** — unchanged; reused by G.8.
- **Step 0** pre-draft gate-status check (`cockpit_gate_status` / adoption sweep #471 / drift guard
  #457) — kept verbatim. Only the *analysis + verdict-application* content of D.3 changes.

## Presentation

- Parse **remaining findings from the gate body** and render them if present.
- **No `cockpit-reviewer` subagent** is spawned (FR-001 / SC-002). No findings-table-from-JSON
  regeneration — the findings already exist in the gate body.

## Options and outcomes

| Option | Action | Label effect | Ledger |
|--------|--------|--------------|--------|
| `approve` | Route into the **cockpit merge path** (`cockpit_merge`; merge on green, **never** on red) | consumed on merge | `implementation-review-approval` → `merged (PR #<n>)` / `blocked: <desc>` |
| `hold` | **No-op** — label stays, gate re-fires later | none written | `hold` |
| `reject` | **No-op** — label stays, gate re-fires later | none written | `reject` |

- `hold` / `reject` byte-mirror D.4's `not yet`: no label write, no advance, gate re-fires on the
  next doorbell (add-only advance invariant §3).
- Resuming remediation is **out of scope** for this gate — that path is the separate
  `remediation-limit` gate (G.9 / D.13, Q2).

## Invariants

- §1 Never merge on red — `approve` routes through the merge path, which exits 0 only on
  `result: merged`; a red PR is never merged.
- §6 Every gate prompts — G.8 prompts; it never auto-approves.

## UI-mode mapping row

`transitionClass = waiting-for:implementation-review`; options `approve`/`hold`/`reject`; downstream
`approve` → merge, `hold`/`reject` → no-op; body = engine findings parsed from the gate body.

## Pins (`playbook-verification.test.ts`)

- `500-2`: D.3 opens G.8 with `approve`/`hold`/`reject`; `approve`→merge path; `hold`/`reject`→no-op.
  **Negative**: D.3 no longer spawns `cockpit-reviewer`; no request-changes guardrail in D.3.
- `500-6`: G.8 renders findings from the gate body and spawns no reviewer subagent.
- `500-7` (shared): gate-mapping table has a G.8 row.
- Re-pin (469 block): the D.3 gate-verb entry re-pinned from "review-verdict analyzer subagent" to a
  bare `cockpit_gate_open` (final-approval gate, no subagent).
