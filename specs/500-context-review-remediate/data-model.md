# Data Model: Slim `cockpit:auto` to gates / queue / clarify / merge

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

This feature edits a markdown playbook and its pin suite; the "data model" is the set of **contract
entities** the playbook prose defines — dispatch rows, gate contracts, gateTypes, ledger vocabulary,
and the UI-mode gate-mapping / generation-discriminator tables. This document is the authoritative
before/after of those entities so the `auto.md` edits and the re-pins stay consistent.

Legend: **NEW** = added by #500 · **CHANGED** = edited by #500 · **REMOVED** = deleted by #500 ·
**UNCHANGED** = listed for context, not edited.

## 1. Dispatch rows (`auto.md § Dispatch table`)

| Row | Label / trigger | Status | Action (post-#500) |
|-----|-----------------|--------|--------------------|
| D.1 | (queue / claim) | UNCHANGED | — |
| D.2 | artifact review (`spec`/`clarification`/`plan`/`tasks`) | UNCHANGED | spawn `cockpit-reviewer` → G.2 |
| D.3 | `waiting-for:implementation-review` (now post-validate) | **CHANGED** | **final-approval gate G.8**: render findings from gate body (no subagent); `approve`→merge / `hold`,`reject`→no-op |
| D.4 | `waiting-for:manual-validation` | UNCHANGED | present G.3; `validate`→`cockpit_advance(gate="manual-validation")` / `not yet`→no-op |
| D.5 | `completed:validate` green | UNCHANGED (see research D8) | mechanical merge path (`cockpit_merge`); `approve` from G.8 routes here |
| D.6 | `completed:validate` red / merge red | **CHANGED** | **ledger-only no-op**; re-fires as engine gate (remediation / remediation-limit). No `cockpit-fixer`, no G.4a |
| D.7 | escalation (diagnose) | UNCHANGED | escalation gate (G.4 subtypes b–e); still in escalation enum |
| D.8 | retain-re-check class | UNCHANGED | fallback re-check |
| D.9 | `waiting-for:address-pr-feedback` | UNCHANGED (Q5) | ledger-only |
| D.9a | `waiting-for:pr-feedback` (legacy alias) | UNCHANGED (Q5) | ledger-only |
| D.9b / D.9c / D.9d | (sibling ledger-only rows) | UNCHANGED | ledger-only |
| D.10 | unknown state | UNCHANGED | escalation gate; still in escalation enum |
| D.11 | retain-re-check / escalation | UNCHANGED | still in escalation enum |
| D.12 | (existing tail row) | UNCHANGED | — |
| **D.13** | `waiting-for:remediation-limit` | **NEW** | **remediation-limit gate G.9**: render findings from gate body (no subagent); `resume remediation`→`cockpit_advance(gate="remediation-limit")` / `stop`→exit clean |

**Escalation dispatch enum** (rows that share the `escalation` gateType): `["D.6","D.7","D.10","D.11"]`
→ **`["D.7","D.10","D.11"]`** (D.6 no longer opens an escalation gate).

## 2. Gate contracts (`auto.md § Gates`)

| Gate | Purpose | Status | Options | Downstream |
|------|---------|--------|---------|------------|
| G.1 | (clarification gate) | UNCHANGED | — | — |
| G.2 | review-verdict — **artifact only** (was "artifact and implementation") | **CHANGED** | `approve`/`request-changes`/`abort` | artifact request-changes guardrail (unchanged); D.3/implementation branch removed |
| G.3 | manual-validation | UNCHANGED | `validate`/`not yet` | `cockpit_advance(gate="manual-validation")` |
| G.4 | escalation gate | **CHANGED** | subtypes b–e (subtype **a** removed) | diagnose; "three subtypes" |
| G.4a | escalation subtype (a) validate-red/merge-red, `Retry (re-run fixer)` | **REMOVED** | — | — |
| G.4b–e | escalation subtypes | UNCHANGED | — | — |
| G.5 / G.6 / G.7 | (existing gates) | UNCHANGED | — | — |
| **G.8** | **implementation-review final-approval** | **NEW** | `approve`/`hold`/`reject` | `approve`→cockpit merge path (merge on green, never red); `hold`/`reject`→no-op (label stays, re-fires); findings from gate body; **no reviewer subagent** |
| **G.9** | **remediation-limit** | **NEW** | `resume remediation`/`stop` | `resume`→`cockpit_advance(issue, gate="remediation-limit")` (resets counter server-side); `stop`→exit clean, no label writes; findings from gate body; **no subagent** |

## 3. gateTypes (`auto.md § generation discriminator` + drift-branch guard)

| gateType | Mapping | generation discriminator | Drift branch |
|----------|---------|--------------------------|--------------|
| `clarification` | G.1 | (existing) | enabled |
| `artifact-review` | G.2 | artifact content hash | enabled |
| `implementation-review` | D.3 → **G.8** (was G.2 implementation) | PR head SHA (**unchanged** — reused by G.8) | enabled (1:1) |
| `manual-validation` | D.4 → G.3 | (existing) | enabled (1:1) |
| `escalation` | D.7/D.10/D.11 (**was** D.6/D.7/D.10/D.11) | shared-enum; #1046 residual limitation | **disabled** (shared enum) |
| **`remediation-limit`** | **NEW** — D.13 → G.9 | remediation counter + findings hash (or PR head SHA + counter; DATA-GAP note if counter not yet computed cluster-side) | enabled (1:1) |

**Pin-relevant set** (`row.gateType ∈ …`): `{clarification, artifact-review, implementation-review,
manual-validation}` → add **`remediation-limit`** (5 members). `implementation-review` stays.

## 4. Enriched-line dispatch contract (E1–E7)

| Element | Status | Change |
|---------|--------|--------|
| E3 dispatch-source table | **CHANGED** | D.6 stays (source `enriched line + checks`) but class becomes ledger-adjacent (no subagent). Add D.13 row (`waiting-for:remediation-limit` in the `to`/`labels` column). D.3 stays a trigger (still enriched). D.9/D.9a references unchanged (Q5). |
| E4 checks-verdict | **CHANGED** | `checks: "green"` → D.5 (unchanged). `checks: "red"` → D.6 **ledger-only** (was: bounded fixer). `absent`/`pending` fallback wording unchanged. |
| E1/E2/E5/E6/E7 | UNCHANGED | — |

## 5. Ledger action + outcome vocabulary (`auto.md § Ledger`)

| Dispatch | action (post-#500) | outcomes |
|----------|--------------------|----------|
| D.3 | `implementation-review-approval` + merge | `merged (PR #<n>)` / `hold` / `reject` / `blocked: <desc>` |
| D.6 | (single ledger-only row) `completed:validate:red · (no-op) · engine-owned remediate` | — (no fixer / no escalation-gate rows) |
| **D.13** | `remediation-limit-gate` | `resumed (advanced)` / `advance failed: <desc>` / `stop (exit)` |

**Removed vocab**: the D.6 `fixer` and `fixer+escalation-gate` action rows. **`source: enriched-line`
marker rule list** updated to include D.13 and reflect the D.3/D.6 changes.

## 6. UI-mode gate mapping table (`auto.md § UI-mode gate mapping`)

| Gate | transitionClass | options | downstream | body source |
|------|-----------------|---------|------------|-------------|
| G.1 | (clarification) | — | — | — |
| G.2 | artifact kinds only (**drop `implementation`**) | `approve`/`request-changes`/`abort` | artifact guardrail | subagent verdict |
| G.3 | `waiting-for:manual-validation` | `validate`/`not yet` | `cockpit_advance` | — |
| G.4a | — | — | — | **ROW REMOVED** |
| G.4b–d | (escalation subtypes) | UNCHANGED | — | — |
| **G.8** | `waiting-for:implementation-review` | `approve`/`hold`/`reject` | `approve`→merge; `hold`/`reject`→no-op | engine findings from gate body |
| **G.9** | `waiting-for:remediation-limit` | `resume remediation`/`stop` | `resume`→`cockpit_advance(gate="remediation-limit")`; `stop`→exit | engine findings from gate body |

## 7. Pre-flight state (`auto.md § step 1 pre-flight`)

| Check | Status | Behavior below/absent |
|-------|--------|-----------------------|
| Monitor presence (`:208–214`) | UNCHANGED | hard-fail: exit non-zero, no ledger dir, no loop |
| `command -v generacy` (`:216`) | UNCHANGED | hard-fail |
| `generacy cockpit help doorbell` doorbell probe (`:218–224`) | UNCHANGED | hard-fail |
| **`generacy --version` vs `MIN_GENERACY_VERSION`** | **NEW** | hard-fail below minimum: visible operator error naming required version; no ledger dir, no loop. Unparseable/missing → fail closed with distinct diagnostic |

**`MIN_GENERACY_VERSION`** — a load-bearing literal in the playbook prose. Value = first generacy
release shipping epic #1120's post-validate gate + `remediation-limit` gate (tasks-phase input;
sourced from generacy release notes / epic #1120).

## 8. Invariants touched (`auto.md § Invariants`)

| Invariant | Status | Post-#500 substance |
|-----------|--------|---------------------|
| §1 Never merge on red | **CHANGED (re-pinned)** | red validate → engine gate (not fixer branch); merge path still exits 0 only on `result: merged`, never on red; G.8 `approve` routes into that path |
| §3 Add-only advance | UNCHANGED (preserved) | `hold`/`reject`/`stop` write no labels; `resume remediation` advances via `cockpit_advance(gate="remediation-limit")` |
| §5 Analysis in subagents | **CHANGED (re-pinned)** | drop `cockpit-fixer` from the list; keep `cockpit-reviewer` (D.2) |
| §6 Every gate prompts | UNCHANGED (preserved) | G.8 and G.9 both prompt; neither auto-proceeds |
| §7 / §8 / §9 | UNCHANGED (preserved) | D.6-ledger-only strengthens §8 (red validate = ledger append, no tool call); gates use `cockpit_*` (§9) |

## 9. Agent bindings

| Agent | Status | Caller after #500 |
|-------|--------|-------------------|
| `cockpit-reviewer` | UNCHANGED | D.2 (artifact review) |
| `cockpit-fixer` | **UNUSED by auto.md** | (was D.6 / G.4a-retry) — optional removal, flagged in tasks, not required for green suite |
| `cockpit-validator` | UNCHANGED | D.4 |
| `cockpit-clarifier` | UNCHANGED | D.1 |
| `cockpit-diagnoser` | UNCHANGED | D.7 / D.11 |

## Validation rules (for the re-pins)

- Every REMOVED entity gets a **negative** pin (old phrasing absent) plus a **positive** pin on its
  replacement — the #433 pattern. No assertion weakened or deleted (CLAUDE.md pin rule).
- `waiting-for:remediation-limit` **must** be a recognised dispatch row (D.13) so it never falls
  through to D.10 unknown-state.
- `implementation-review` gateType **must** remain present (reused by G.8; #457/#469/#471 identity).
- Escalation enum **must** name exactly three rows (D.7/D.10/D.11) everywhere it appears
  (dispatch table, drift-branch narrative, generation-discriminator DATA-GAP note,
  `ESCALATION_DISPATCH_ROWS`).
