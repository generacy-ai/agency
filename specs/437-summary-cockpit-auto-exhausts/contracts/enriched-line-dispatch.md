# Contract: `/cockpit:auto` enriched-line dispatch

**Feature**: agency#437
**Branch**: `437-summary-cockpit-auto-exhausts`
**Date**: 2026-07-17
**Status**: Complete
**Scope**: The parse + dispatch decisions the `auto.md` playbook makes on each doorbell stdout line delivered by `Monitor`. The doorbell line **schema** is owned by generacy-ai/generacy#985 (engine side); this contract governs how the skill CONSUMES it.

## C1 — Enriched line schema (consumed)

**Owner**: generacy-ai/generacy#985. Reproduced here for pin discoverability.

```jsonc
{
  "type": "issue-transition",
  "repo": "<owner>/<repo>",
  "kind": "issue" | "pr",
  "number": <integer>,
  "event": "<github-event-kind>",
  "to": "<engine-classified-target-state>",   // load-bearing: dispatch input
  "labels": ["<current-labels>", ...],         // load-bearing: dispatch input + ledger row content
  "url": "<github-url>",
  "checks": "green" | "red" | "pending"        // OPTIONAL: present only on merge-verdict events
}
```

**Load-bearing fields** on the enriched-vs-bare gate: `to` AND `labels`. `checks` is orthogonal to the gate and consulted only in the D.5/D.6 branch.

## C2 — Enriched-vs-bare detection gate (Q2=B)

**Rule**: A doorbell line is treated as **enriched** iff BOTH of the following hold:

1. The line JSON-parses to a value that is (a) an object (not `null`, not a string/number/boolean, not an array), AND
2. That object carries **both** `to` and `labels` fields with non-null, non-undefined values.

Any other outcome — parse failure, non-object parse result, missing `to`, missing `labels` — treats the line as **bare** and routes it to the fallback path (single authoritative `cockpit_status(epic, json=true)` per pre-#437 shape).

**`checks` is NOT part of this gate**. A legitimate label-change line has no `checks`; requiring `checks` here would nullify the PR by routing every label-driven line to the fallback path. `checks` presence/absence is handled in the D.5/D.6 branch per C4 below.

**Failure mode**: This gate does not raise an error. A malformed line goes down the fallback path; the loop keeps running.

## C3 — Dispatch source per class (Q1=A)

| Dispatch class | Trigger token (`to` field) | Source under enriched line | Source under bare line |
|----------------|----------------------------|----------------------------|------------------------|
| D.1 | `waiting-for:clarification` | **enriched line** | fallback |
| D.2 | `waiting-for:<artifact>-review` (spec/clarification/plan/tasks) | **enriched line** | fallback |
| D.3 | `waiting-for:implementation-review` | **enriched line** | fallback |
| D.4 | `waiting-for:manual-validation` | **enriched line** | fallback |
| D.5 | `completed:validate` + `checks: "green"` | **enriched line + `checks`** | fallback |
| D.6 | `completed:validate` + `checks: "red"` | **enriched line + `checks`** | fallback |
| D.7 | `agent:error` / `failed:<subtype>` | **enriched line** | fallback |
| D.8 | `phase-complete` | **fallback (retain re-check)** | fallback |
| D.9 | `waiting-for:address-pr-feedback` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9a | `waiting-for:pr-feedback` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9b | `waiting-for:children-complete` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9c | `waiting-for:dependencies` | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.9d | `phase:*` (prefix-match) | **enriched line** (ledger-only) | fallback (ledger-only) |
| D.10 | Unrecognized / ambiguous | **fallback (retain re-check)** | fallback |
| D.11 | `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` | **fallback (retain re-check)** | fallback |

**Retain-the-re-check justification** (D.8, D.10, D.11):

- **D.8** opens a phase-queue confirmation gate whose ad-hoc-issues enumeration requires authoritative per-ad-hoc-ref state.
- **D.10** is by definition the unknown-state class — dispatching off a bare/stale line is meaningless.
- **D.11** opens the merge-conflicts escalation gate — a stale-line dispatch could open a gate against a conflict the engine has already auto-remedied.

All three are low-frequency (D.8 ≈once per phase; D.10/D.11 are error/escalation cases), so retaining the authoritative re-check costs almost nothing.

## C4 — `checks` verdict handling for D.5/D.6 (Q4=B)

**Rule**: The D.5/D.6 merge-gate dispatch consults the `checks` field on the enriched line (C1) and branches on its value:

| `checks` value | Action |
|----------------|--------|
| `"green"` | D.5 branch: `cockpit_merge(issue=<issue-ref>)` (unchanged from pre-#437) |
| `"red"` | D.6 branch: bounded fixer subagent (unchanged from pre-#437) |
| `"pending"` | **Fall back** to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` OR `cockpit_merge(issue=<issue-ref>)` (per the D.5 vs. D.6 dispatch); branch on the returned verdict per pre-#437 logic |
| Absent (field missing OR `null`/`undefined`) | **Fall back** — same as `"pending"` |

**Defer-on-pending was rejected** (Q4=A → rejected): smee doorbell delivery is best-effort/lossy; a lost follow-up event on the `pending → green | red` transition would silently stall the merge. Merge-gate dispatch is ≈once per issue, so the extra query cost on `pending` is negligible.

**Ledger marker on fallback**: D.5/D.6 fallback rows do NOT carry the `source: enriched-line` marker (they carry no marker; equivalent to `source: re-query`).

## C5 — Step-4a "resolve authoritative state" priority (Q3=B)

**Unified contract**: Step 4a resolves authoritative state per this priority list:

1. **Prefer the enriched doorbell line's `to`/`labels`** (and, for D.5/D.6, `checks`) when C2 returns `enriched: true` AND the class is in the C3 "enriched line" column.
2. **Fall back to a single `cockpit_status(epic=<epic-ref>, json=true)`** when C2 returns `enriched: false` (bare line, older engine, content-less mode), OR the class is in the C3 fallback column (D.8, D.10, D.11), OR C4's `checks` verdict is absent/pending.

**Retained invariant**: `cockpit_await_events` remains the sole source of typed **batches** for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. The enriched line is a **dispatch input**, not a **batch source**. The distinction preserves the anti-drop protection of § Invariants §7 (content-based filters over the stream are prohibited; nothing that lands in the event log is silently dropped by the parent).

## C6 — Ledger row shape (Q5=C)

**Format** (unchanged four-column shape, marker appended in outcome slot):

```
<issue-ref> · <transition-class> · <action> · <outcome> [· source: enriched-line]
```

**Marker rules**:

- **Append `· source: enriched-line`** to the outcome slot when the dispatch was driven by the enriched line (C2 = true AND the class is in the C3 "enriched line" column, including D.5/D.6 with decisive `checks`).
- **Omit the marker** (equivalent to `source: re-query`) when:
  - The class is in the C3 "fallback" column (D.8, D.10, D.11).
  - The class is in the C3 "enriched line" column but the line was bare (C2 = false) AND the fallback path fired.
  - The class is D.5/D.6 and `checks` was absent OR `pending` (C4 fallback path fired).

**Post-mortem grep semantics**:

- `grep 'source: enriched-line' <ledger>` — every enriched-line dispatch row (the post-#437 savings visible).
- `grep -v 'source: enriched-line' <ledger>` — every re-query row (pre-#437 shape, retain-the-re-check classes, and merge-gate fallbacks).

**Backwards compatibility**: Pre-#437 ledger files (no markers) and mixed pre/post-#437 ledgers concatenate without ambiguity — grep on the marker isolates post-#437 enriched-line dispatch rows.

## C7 — Graceful degradation (FR-005)

**Guarantee**: A cluster running an older `generacy` (pre-#985, no enriched line generation) sees every doorbell line fail the C2 detection gate (missing `to` and/or `labels`) and falls back to the pre-#437 `cockpit_status(epic, json=true)` per-event re-check. Pre-#437 behaviour is preserved verbatim on the fallback path.

**Schema drift protection**: A future generacy-side schema change (renaming a load-bearing field, dropping `to` or `labels` from a subset of events) surfaces on the skill side as a C2 gate failure → fallback path fires → the loop keeps running at pre-#437 cost. No runtime error, no operator-visible failure — the SC-001 saving degrades gracefully back to the baseline.

**Cost model under partial engine rollout**:

- **Full engine rollout (all events enriched)**: C1 hit rate 100%; C2 = true 100%; SC-001 fully realized (0 GraphQL calls per event on label-driven classes).
- **Partial engine rollout (some events enriched)**: C2 hit rate proportional to the fraction of events the engine emits with `to` + `labels`; SC-001 partially realized.
- **No engine rollout (pre-#985)**: C2 = false 100%; SC-001 not realized; pre-#437 cost baseline preserved.

## C8 — Test pin contract

The following assertions are pinned in `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` inside a `describe("437 — …", ...)` block. Each pin uses the positive + negative form established by the #433 pattern.

| Pin | Positive assertion | Negative assertion |
|-----|--------------------|--------------------|
| 437-1 (step 4a) | `auto.md` contains the new "resolve authoritative state" wording (per E7.1 in `data-model.md`) | `auto.md` does NOT contain `"The batch event is advisory; the live return is authoritative"` |
| 437-2 (D.1–D.7 dispatch) | The D.1–D.4 and D.7 dispatch narrations reference the enriched line's `to` / `labels` as source-of-truth (per E7.2) | The D.1–D.4 and D.7 dispatch narrations do NOT contain a per-event `cockpit_status(...)` re-check statement |
| 437-3 (§7 rewrite) | § Invariants §7 opens with "Stream consumption is unfiltered" AND references the § Enriched-line dispatch contract | § Invariants §7 does NOT contain the phrase `"never parsed for content"` |
| 437-4 (§ Ledger marker) | `auto.md` § Ledger section contains the literal string `source: enriched-line` | (positive-only — the marker's presence in the ledger is a single-string check) |
| 437-5 (D.5/D.6 `checks` fallback) | D.5/D.6 narrations name both `absent` AND `pending` as fallback triggers per Q4=B | D.5/D.6 narrations do NOT contain a defer-on-pending phrasing (Q4=A rejection) |
| 437-6 (D.8/D.10/D.11 retain-the-re-check) | D.8/D.10/D.11 narrations state the retain-the-re-check rule verbatim | (positive-only — the retain rule is stated as a positive obligation) |

**Do-not-weaken rule** (from CLAUDE.md): Existing pins broken by this PR's edits (the pre-#437 wording pins for step 4a and the D.1–D.7 dispatch preambles, if any) are re-authored to match the new contract in this same PR. Weakening or deleting an existing assertion to make the test pass is a protocol violation.

## C9 — Cross-repo integration boundary

**generacy-ai/generacy#985 owns**:

- The doorbell line's JSON schema (`type`, `repo`, `kind`, `number`, `event`, `to`, `labels`, `url`, `checks`).
- Local `to`-classification (the engine reads a resource's labels and computes the same target state that `cockpit_status`'s classifier returns).
- Baking the `checks` verdict on merge-verdict-relevant events (the engine reads PR check states and emits `green | red | pending`).
- The versioning and deprecation policy for the schema.

**agency#437 (this PR) owns**:

- The parse of the line (JSON.parse, non-null-object check, `to`+`labels` presence check).
- The dispatch decision (label-driven → enriched line; D.5/D.6 → `checks` branch; D.8/D.10/D.11 → fallback).
- The ledger row content (line-as-received `to`/`labels`; `source: enriched-line` marker).
- The prose invariants (§7 rewrite; step-4a contract; D.1–D.7 preambles).
- The playbook-verification pin surface.

**Lockstep landing**: The two PRs are designed to land together. If generacy#985 lands first, `/cockpit:auto` on pre-#437 skill code continues to work (the skill treats every enriched line as a bare doorbell — the extra fields are ignored). If this PR lands first, `/cockpit:auto` on pre-#985 engine code continues to work (every line fails the C2 gate → fallback path fires). Neither partial landing state is a functional break.

---

*Generated by speckit*
