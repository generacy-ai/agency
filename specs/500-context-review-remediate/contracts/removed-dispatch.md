# Contract: Removed dispatch (D.3 reviewer / D.6 fixer / G.4a / G.2-implementation) + re-pin map

**Requirement**: FR-001 / FR-005 / FR-007 / US1 / US4 · **Clarification**: Q4 (Option A) ·
**Success**: SC-002 (zero reviewer/fixer dispatch)

This contract enumerates everything #500 **removes** from the implementation-PR review loop and the
exact pins that must be **re-pinned** (never weakened/deleted, per CLAUDE.md § "Cockpit playbook
pins") to the new contract in the same PR.

## What is removed

| # | Removed | Replaced by |
|---|---------|-------------|
| R1 | D.3 spawns `cockpit-reviewer` + runs the D.2 request-changes guardrail | D.3 opens final-approval gate **G.8** (findings from gate body, no subagent) |
| R2 | D.6 spawns bounded `cockpit-fixer` + opens G.4a escalation on `{fixed:false}` | D.6 **ledger-only no-op**; red validate re-fires as an engine gate |
| R3 | G.4 escalation subtype **(a)** validate-red/merge-red + `Retry (re-run fixer)` | (removed; no cluster-side red-validate retry) |
| R4 | G.2 "(artifact and implementation)" scope + D.3/implementation branch | G.2 **artifact-only**; implementation → G.8 |
| R5 | `cockpit-fixer` in the §5 analysis-subagent list | list drops `cockpit-fixer` (keeps `cockpit-reviewer`) |

**Kept (do NOT remove)**: D.3's `implementation-review` gateType + Step 0 (reused by G.8; #457/#469/#471
identity/drift/adoption). D.6 stays a *recognised* row (routing only). D.9/D.9a ledger-only (Q5).

## SC-002 acceptance

An engine-native dry-run transcript of `auto` shows **zero** reviewer/fixer dispatch against an
implementation PR. No `cockpit-reviewer` and no `cockpit-fixer` invocation appears on any
implementation-PR path.

## FR-005 polling reduction

Removing D.3's reviewer round-driving and D.6's fixer re-check loop removes the per-round
`cockpit_status` / PR-state polling that dominated GraphQL 5k/hr exhaustion. Retained calls: the E3
fallback re-checks (D.8/D.10/D.11) and the single authoritative D.5/D.6 fallback on
`checks: absent|pending` — unchanged.

## Re-pin map (`playbook-verification.test.ts`)

Re-pin in-place, positive + negative per the #433 pattern.

| Block (approx line) | Pin today | Re-pin to |
|---------------------|-----------|-----------|
| 437-5 (~L2546) | D.6 heading `"… → bounded fixer subagent"` | new ledger-only D.6 heading; **negative**: `bounded fixer` / `cockpit-fixer` absent from D.6 |
| 449 (~L892, ~L2993) | `EXPECTED_GATES` / `expectedGates` include `G.4a` | drop `G.4a`; add `G.8`, `G.9` |
| 449 (mapping row) | G.4a mapping row + `retry: re-spawn fixer subagent` | remove; mapping table = artifact-only G.2 + new G.8/G.9 |
| 457-9b (~L3635) | "§ D.6 and § D.10 … bound by drift guard" | D.10 only (D.6 no longer opens an escalation gate) |
| 457 (~L3819) | generation-discriminator `implementation-review → PR head SHA` | **keep** (reused by G.8) |
| 471 (~L4041) | `ESCALATION_DISPATCH_ROWS = ["D.6","D.7","D.10","D.11"]` | `["D.7","D.10","D.11"]` |
| 471 (~L5360) | `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}` | add `remediation-limit`; keep `implementation-review` |
| 469-25 (~L5073, ~L5123) | enumerates `"D.6 G.4a escalation"` + `"D.3 review-verdict analyzer"` | drop `D.6 G.4a`; D.3 → bare `cockpit_gate_open` (final-approval, no analyzer); add D.13 remediation-limit gate open |
| 403 (or where §1/§5 pinned) | §1 red→fixer branch; §5 list includes `cockpit-fixer` | §1 red→engine gate, merge path still never-on-red; §5 list drops `cockpit-fixer` |

## New `500-*` pins (`describe("500 slim auto to gates/queue/clarify/merge", …)`)

Appended after the `471` block:

- `500-1` — version-skew pre-flight guard (see `version-skew-preflight.md`).
- `500-2` — D.3 → G.8 final-approval; **negative**: no `cockpit-reviewer`, no request-changes guardrail.
- `500-3` — D.6 ledger-only; red validate re-fires as engine gate; **negative**: no `cockpit-fixer` / no G.4a.
- `500-4` — G.2 trigger is D.2/artifact-only (`(artifact and implementation)` / D.3 refs removed).
- `500-5` — D.13 + G.9 (see `remediation-limit-gate.md`).
- `500-6` — G.8 findings from gate body, no reviewer subagent (see `final-approval-gate.md`).
- `500-7` — gate-mapping table has G.8 + G.9, no G.4a; generation-discriminator has `remediation-limit`.
- `500-8` — escalation enum narrative names three rows (D.7/D.10/D.11), not four.
- `500-9` — `waiting-for:remediation-limit` is a recognised dispatch row (never falls to D.10).

The `readdirSync(COMMANDS_DIR)` invocation-vs-`--help` sweep must stay green — these edits touch
dispatch/gate prose, not the invocation contract.
