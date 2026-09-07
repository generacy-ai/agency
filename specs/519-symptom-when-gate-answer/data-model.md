# Data Model: D.12 foreign-run / out-of-scope gate-answer no-op guard

This is a playbook + pin-test change; no runtime types are added. The entities
below are the prose-level contracts the playbook edit manipulates and the pin
tests freeze.

## E1 — `gateKey` (composite key, documented shape)

```
<owner>/<repo>#<issue>:<gateType>:<generation>[:<runId>]
```

| Segment | Constraints | Parse rule |
|---------|-------------|------------|
| issue ref (`<owner>/<repo>#<issue>`) | contains no `:` | prefix before the FIRST `:` |
| `gateType` | enum (`clarification`, `artifact-review`, `implementation-review`, `manual-validation`, `escalation`, `remediation-limit`, `ci`, …) | not parsed by the guard |
| `generation` | MAY contain colons (`spec-review:<sha>`, `sweep:needs-clarification:2`) | never parsed positionally |
| `runId` (optional) | colon-free (V1/FR-013), shape `<tracking-ref-slug>-<timestamp>` | trailing colon-free segment matched against the runId shape; ABSENT when the gate was opened under `runIdEnabled === false` |

**Validation rules**:
- V-G1: runId-segment detection MUST be shape-based (trailing segment vs runId
  shape), never a positional segment count (FR-002, Q2).
- V-G2: the no-op ledger `<gateKey-issue-ref>` slot is the parsed issue-ref
  prefix, verbatim.

## E2 — D.12 step 1 classification (three-way, no-record branch only)

Input: `gate-answer` event with `openGates[event.gateId]` **absent**.
Precondition: a present record (current-run or adopted) bypasses the guard
entirely — steps 2–6 unchanged (FR-001, Q1).

| # | Condition (evaluated in order) | Classification | Ack? | Downstream? | Ledger outcome |
|---|-------------------------------|----------------|------|-------------|----------------|
| 1 | gateKey HAS runId segment AND segment ≠ run's pre-flight `runId` | foreign-run no-op | NO | NO | `foreign-run delivery — not acked (owner run: <runId>)` |
| 2 | gateKey issue ref ∉ run's in-scope set | out-of-scope no-op | NO | NO | `out-of-scope delivery — not acked (issue: <issue-ref>)` |
| 3 | otherwise (same-run OR no runId segment, AND in scope) | genuine startup race / duplicate | YES — `cockpit_gate_ack(superseded, "no matching open record — likely startup-race or duplicate delivery")`, existing runId threading | NO (existing behaviour) | `superseded (no record)` |

**Validation rules**:
- V-B1: rows 1–2 issue NO `cockpit_gate_ack` of any outcome and invoke NO
  downstream handler (FR-003).
- V-B2: row order is fixed — runId-mismatch before out-of-scope (FR-002, Q3).
- V-B3: row 3 is byte-preserved from the current playbook, including the
  run-wide (loop-state) `runId` threading prose pinned by 471-16 (FR-006).

## E3 — No-op ledger row

```
<gateKey-issue-ref> · — · gate-answer · <outcome> · source: ui-gate
```

| Slot | Value | Source |
|------|-------|--------|
| issue-ref | parsed gateKey prefix | payload (no record exists) |
| transition-class | `—` (literal em-dash placeholder) | unknowable — no record |
| action | `gate-answer` | dispatch class literal |
| outcome | one of the two E2 vocabularies, verbatim | classification |
| source suffix | `· source: ui-gate` | Ledger Rules 2 + 4 |

**Validation rules**:
- V-L1: exactly one row per delivery; replays are NOT deduped — no
  session-local seen-set, no per-gateId or per-wake collapsing (FR-004, Q5).
- V-L2: both outcome strings are pinned verbatim in the FR-007 test; the
  four-column shape with the `—` placeholder is pinned with them (Q4).
- V-L3: rows appear in the § Action + outcome vocabulary table and in the
  § Ledger Rule 2 UI-specific outcome enumeration (and the D.12 **Ledger
  line** paragraph), keeping grep recipes stable.

## E4 — Run-scope inputs read by the guard (existing state, unchanged)

| Input | Defined at | Guard usage |
|-------|-----------|-------------|
| `runId` (run-wide loop state) | pre-flight derivation, auto.md:232–246; compute-once V2 | compared verbatim against the gateKey trailing segment; never re-derived |
| in-scope set | § Adoption pass item 3: `[<epic-ref>] ++ epic.inScopeChildren` / `[<tracking-ref>] ++ taskListRefs` | membership test for the gateKey issue ref |
| `openGates: Map<GateId, GateRecord>` | § In-memory loop state additions | presence test that gates the whole guard |

No new loop-state fields are introduced (Q5 rejected the seen-set).

## Relationships

- E2 row 1–2 → E3: each no-op classification emits exactly one E3 row.
- E2 precondition → #471 adoption: record-present bypass preserves the
  adopted-answer path (D.12 steps 3/5 `openGates[gateId].runId` reads).
- E1 optional runId segment → E2 row 1 applicability: absent segment disables
  row 1 (Q2).
