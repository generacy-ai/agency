# Data Model: `/cockpit:auto` enriched-line dispatch

**Feature**: agency#437
**Branch**: `437-summary-cockpit-auto-exhausts`
**Date**: 2026-07-17
**Status**: Complete

## Overview

This is a prose-and-test-pin fix in `packages/claude-plugin-cockpit/`. There is no persistent runtime schema owned by this PR — the wire format the skill reads (the NDJSON doorbell line) is defined and versioned by generacy-ai/generacy#985. This document catalogs the entities the fix reshapes on the skill side:

1. The **enriched doorbell line** as consumed by the parent (parsed but not owned here).
2. The **enriched-vs-bare detection gate** (Q2=B).
3. The **dispatch-source classification** per dispatch row (which classes read the line vs. the fallback query).
4. The **`checks` verdict handling** for D.5/D.6 (Q4=B).
5. The **ledger row shape** — the four-column format is unchanged; the outcome slot gains a `source: enriched-line` marker suffix (Q5=C).
6. The **step-4a source-of-truth priority** as a unified contract (Q3=B).

Because the change is prose-only on this side, this document also catalogs the string-level entities the fix reshapes (§7 invariant wording, step 4a phrasing, D.1–D.7 dispatch preambles, § Ledger vocabulary table entries) so the tasks phase has a load-bearing target list.

## E1 — Enriched doorbell line (consumed, not owned)

**Owner**: generacy-ai/generacy#985 defines the schema; this PR's parser reads it.

**Source**: `Monitor`-attached stdout of `generacy cockpit doorbell <epic-ref>` — one JSON object per newline (NDJSON).

**Shape** (post-generacy#985):

```jsonc
{
  "type": "issue-transition",           // event type (existing enum)
  "repo": "christrudelpw/epic",         // repo the event pertains to
  "kind": "issue" | "pr",               // resource kind
  "number": 42,                         // issue or PR number
  "event": "labeled" | "unlabeled" | "opened" | "closed" | ...,  // GitHub event kind
  "to": "waiting-for:clarification",    // engine-classified target state (load-bearing dispatch input)
  "labels": ["waiting-for:clarification", "epic:child"],  // current label set (load-bearing dispatch input)
  "url": "https://github.com/...",      // GitHub URL for the resource (informational)
  "checks": "green" | "red" | "pending"  // OPTIONAL; present only on merge-verdict-relevant events (D.5/D.6)
}
```

**Field-by-field notes**:

- **`type`**: Existing enum, unchanged. The parent does not branch on `type` for the label-driven dispatch — it branches on `to`. Retained for structural completeness and for future non-`issue-transition` event types.
- **`repo`, `kind`, `number`**: Enough to reconstruct the `<issue-ref>` (`repo#number`) used throughout the dispatch table. The parent's per-event ledger row's `<issue-ref>` slot is populated from these three fields.
- **`event`**: The GitHub event kind (labeled / unlabeled / opened / closed / ...). Present on the line for engine-side classification purposes; the parent does not branch on it directly.
- **`to`** (load-bearing): The engine-classified target state — the same string the pre-#437 loop read from `cockpit_status(issue=…, json=true)`'s classifier output. Dispatch table matches: `waiting-for:clarification` → D.1; `waiting-for:<artifact>-review` → D.2; `waiting-for:implementation-review` → D.3; `waiting-for:manual-validation` → D.4; `completed:validate` → D.5/D.6 (checks branch); `agent:error` / `failed:*` → D.7; `waiting-for:address-pr-feedback` → D.9; `waiting-for:pr-feedback` → D.9a; `waiting-for:children-complete` → D.9b; `waiting-for:dependencies` → D.9c; `phase:*` prefix → D.9d.
- **`labels`** (load-bearing): The current label set on the resource. Used by the parent for two purposes: (1) as source-of-truth for the ledger row's transition-class slot (Q5=C — the ledger row reads the labels as-received); (2) as fingerprint of the resource's current label state for future audit (a post-mortem grep can reconstruct what the resource looked like at dispatch time).
- **`url`**: Informational only. Not used for dispatch, not written to the ledger.
- **`checks`** (present only on merge-verdict events, D.5/D.6 dispatch): Values `"green"` / `"red"` / `"pending"`. Handled per E4 below.

**Absent-vs-present semantics**:

- **Enriched line**: All required fields present (`to` + `labels` at minimum). Non-required fields (`checks`) may be present or absent depending on event class.
- **Bare line**: The line either does not JSON-parse to an object, OR parses to an object but is missing `to` or `labels` (or both). Missing = falsy (absent field OR field value is `null` OR field value is `undefined`).

## E2 — Enriched-vs-bare detection gate (Q2=B)

**Purpose**: The step-4a "resolve authoritative state" contract branches on this gate. Enriched → dispatch from the line for label-driven classes; bare → fall back to today's `cockpit_status` re-check per FR-005.

**Detection rule** (Q2=B):

```
function isEnrichedLine(line: string): { enriched: true, event: EnrichedEvent } | { enriched: false } {
  // Step 1: JSON.parse the line
  let event: unknown;
  try {
    event = JSON.parse(line);
  } catch {
    return { enriched: false };  // parse failure → bare
  }

  // Step 2: verify it's an object (not a bare string, number, or null)
  if (event === null || typeof event !== "object" || Array.isArray(event)) {
    return { enriched: false };  // non-object → bare
  }

  // Step 3: verify `to` and `labels` are both present and non-null
  //   `checks` is NOT part of this gate — it's handled inside the D.5/D.6 path per FR-003.
  const e = event as Record<string, unknown>;
  if (e.to === null || e.to === undefined || e.labels === null || e.labels === undefined) {
    return { enriched: false };  // missing load-bearing field → bare (graceful degradation)
  }

  return { enriched: true, event: e as EnrichedEvent };
}
```

**Rejected alternatives** (per Q2 clarification, recorded here for future reference):

- **A — JSON-parse success only**: acts on partial payloads; rejected.
- **C — JSON-parse + full class-specific field check (require `checks` too)**: routes every label-change line to full re-query; rejected because `checks` is not carried on label-change events.

**Failure mode**: This gate does NOT throw or raise an error. A malformed or partial line goes down the fallback path; a well-formed line goes down the enriched-line path. The loop keeps running under any transport-layer imperfection.

## E3 — Dispatch-source classification per dispatch row (Q1=A)

Every dispatch class in the § Dispatch table falls into one of three source categories under the post-#437 contract:

| Dispatch class | Source under enriched line | Source under bare line (fallback) | Notes |
|----------------|----------------------------|------------------------------------|-------|
| D.1 `waiting-for:clarification` | **enriched line** (`to`, `labels`) | fallback: `cockpit_status(epic, json=true)` | frequent — dominant load |
| D.2 `waiting-for:<artifact>-review` | **enriched line** | fallback | frequent |
| D.3 `waiting-for:implementation-review` | **enriched line** | fallback | frequent |
| D.4 `waiting-for:manual-validation` | **enriched line** | fallback | frequent |
| D.5 `completed:validate` + green | **enriched line + `checks`** (per E4) | fallback (`checks` absent or `pending`) | merge gate |
| D.6 `completed:validate` + red | **enriched line + `checks`** (per E4) | fallback (`checks` absent or `pending`) | merge gate |
| D.7 `agent:error` / `failed:*` | **enriched line** | fallback | frequent |
| D.8 `phase-complete` | **fallback** (retain per-event `cockpit_status`) | fallback | rare — phase-queue gate consequential |
| D.9 `waiting-for:address-pr-feedback` | **enriched line** | fallback | ledger-only (always was) |
| D.9a `waiting-for:pr-feedback` | **enriched line** | fallback | ledger-only |
| D.9b `waiting-for:children-complete` | **enriched line** | fallback | ledger-only |
| D.9c `waiting-for:dependencies` | **enriched line** | fallback | ledger-only |
| D.9d `phase:*` | **enriched line** | fallback | ledger-only |
| D.10 unrecognized | **fallback** (retain per-event `cockpit_status`) | fallback | rare — escalation gate consequential |
| D.11 `waiting-for:merge-conflicts` / `blocked:stuck-merge-conflicts` | **fallback** (retain per-event `cockpit_status`) | fallback | rare — escalation gate consequential |

**Retain-the-re-check rationale** (D.8, D.10, D.11):

- **D.8**: opens the phase-queue confirmation gate; the `openAdHocIssues` helper needs authoritative per-ad-hoc-ref state, and the phase-queue gate presentation shows the next phase's issue list. A stale-line dispatch would silently open a gate against superseded state — the operator sees "queue P2 with 4 issues" but P2 has already been queued.
- **D.10**: by definition, the state class is unknown. A re-query is the only way to identify what actually landed on the resource; dispatching D.10 off a bare/stale line is meaningless.
- **D.11**: opens the merge-conflicts escalation gate; a stale-line dispatch could open a gate against a conflict the engine has already auto-remedied.

**Cost model** (per SC-001 target):

- **Frequent classes on enriched line** (D.1–D.4, D.7, D.9, D.9a–D.9d): 0 GraphQL calls per event (dispatch from the line).
- **Frequent classes on bare line** (fallback): ≈28 GraphQL calls per event (`cockpit_status(epic, json=true)`) — pre-#437 baseline.
- **Merge gate classes on enriched line + `checks: green|red`** (D.5/D.6): 0 GraphQL calls to dispatch (merge action itself makes its own calls, unchanged).
- **Merge gate classes on enriched line + `checks: absent|pending`** (D.5/D.6 fallback): 1 `cockpit_status` OR 1 `cockpit_merge` (whichever the D.5/D.6 branch calls per today's logic).
- **D.8, D.10, D.11**: 1 `cockpit_status` per event (retain-the-re-check). Rare frequency.

## E4 — `checks` verdict handling for D.5/D.6 (Q4=B)

**Purpose**: The merge-gate dispatch (D.5 green / D.6 red) reads the `checks` field on the enriched line and branches on its value. The absent/pending fallback rule preserves correctness under lossy transport.

**Decision rule** (Q4=B):

| `checks` field value | Dispatch |
|----------------------|----------|
| `"green"` | D.5: call `cockpit_merge(issue=<issue-ref>)` (unchanged from today) |
| `"red"` | D.6: spawn bounded fixer subagent (unchanged from today) |
| `"pending"` | **Fall back**: single authoritative `cockpit_status`/`cockpit_merge` query; branch on the returned verdict per today's logic |
| Absent (field missing OR value is `null`/`undefined`) | **Fall back**: same as `"pending"` — single authoritative query |

**Rejected alternative** (Q4=A): defer-on-pending — do nothing this wake, wait for the next doorbell fire when checks resolve. Rejected because smee doorbell delivery is best-effort/lossy; a lost follow-up event silently stalls the merge.

**Ledger row source-of-truth on the fallback path**: Under `checks: absent | pending` fallback, the ledger row's outcome slot does **NOT** carry the `source: enriched-line` marker — it carries no `source:` suffix, equivalent to `source: re-query`. This distinguishes fallback merge-gate rows from enriched-line-dispatched rows in the ledger, matching the Q5=C marker semantics for D.1–D.4 and D.7.

## E5 — Ledger row shape (Q5=C — `source: enriched-line` marker)

**Format** (unchanged four-column shape, marker appended in outcome slot):

```
<issue-ref> · <transition-class> · <action> · <outcome> [· source: enriched-line]
```

The marker `· source: enriched-line` is appended to the outcome slot when the dispatch was driven by the enriched line (E2 returned `enriched: true` AND the class is in the E3 "enriched line" column). It is **absent** when:

- The class is in the E3 "fallback" column (D.8, D.10, D.11 — retain-the-re-check).
- The class is in the E3 "enriched line" column but the line was bare (E2 returned `enriched: false`) AND the fallback path fired.
- The class is D.5/D.6 and `checks` was absent/pending (E4 fallback path fired).

**Grep semantics**:

- `grep 'source: enriched-line' <ledger>` — all rows dispatched from the enriched line (post-#437 savings visible).
- `grep -v 'source: enriched-line' <ledger>` — all rows dispatched from a `cockpit_status` re-query (pre-#437 shape, retain-the-re-check classes, and merge-gate fallbacks).

**Example ledger rows** (post-#437):

```
christrudelpw/epic#43 · waiting-for:clarification · clarification-batch · advanced · source: enriched-line
christrudelpw/epic#44 · waiting-for:implementation-review · review-analysis+advance · approved · source: enriched-line
christrudelpw/epic#44 · completed:validate · merge · merged (PR #46) · source: enriched-line
christrudelpw/epic#45 · completed:validate · merge · merged (PR #47)  ← fallback (checks was pending)
christrudelpw/epic#42 · phase-complete · phase-queue-gate · queued P2 (4 issues)  ← D.8 retain-the-re-check, no marker
christrudelpw/epic#48 · waiting-for:merge-conflicts · escalation-gate · advanced  ← D.11 retain-the-re-check, no marker
```

**Compatibility**: The four-column separator (` · `) semantics are unchanged; the marker sits in the outcome slot. Pre-#437 ledger files (no markers anywhere) and post-#437 mixed ledgers concatenate without ambiguity — grep on the marker isolates post-#437 enriched-line dispatch rows.

## E6 — Step-4a source-of-truth priority (Q3=B)

**Contract** (Q3=B — unified "resolve authoritative state"):

Under the post-#437 dispatch loop, step 4a reads:

1. **Prefer the enriched line**: If E2 returns `enriched: true`, treat the line's `to` / `labels` fields as authoritative for dispatch inputs. For D.5/D.6, additionally read the `checks` field per E4.
2. **Fall back to `cockpit_status` on absence**: If E2 returns `enriched: false` (bare line, older engine, content-less mode), OR the class is in the E3 fallback column (D.8, D.10, D.11), OR the D.5/D.6 `checks` verdict is absent/pending (E4), fire a single `cockpit_status(epic=<epic-ref>, json=true)` (or `cockpit_merge` for D.5/D.6 fallback) to resolve authoritative state, and dispatch off the returned classification.

**Retained invariant**: `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. The enriched line is a dispatch input, not a batch source — the anti-drop protection of §7 (no content-based filter that could silently drop legitimate events) is preserved because batch consumption is still driven by `cockpit_await_events`.

## E7 — String-level prose entities the fix reshapes

Since the "implementation" is markdown prose executed by the model tool-by-tool, the fix reshapes a small number of load-bearing strings in `auto.md`. The tasks phase targets these directly.

### E7.1 — Step 4a "resolve authoritative state" contract (auto.md § Main loop, per-event iteration, currently at ~L85)

**Before** (~L85):

```
- **(a) Re-check live state** via `cockpit_status(epic=<epic-ref>, json=true)` for actionable
  dispatch classes (D.1–D.8, D.10, D.11). The batch event is advisory; the live return is authoritative
  (spec § Loop). Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip the re-check entirely per
  § Invariants #8's cost contract — a batch containing only ledger-only events is one ledger append per
  event and zero other tool calls. If the epic's live state is `epic-complete`, go to step 6.
```

**After** (Q3=B unified contract):

```
- **(a) Resolve authoritative state.** Prefer the enriched doorbell line's `to` / `labels` fields (and,
  for D.5/D.6, the baked `checks` verdict) — a line is enriched iff it JSON-parses to an object AND
  carries both `to` and `labels` (per § Enriched-line dispatch contract). Otherwise, fall back to a
  single `cockpit_status(epic=<epic-ref>, json=true)` query to resolve authoritative state. **Under the
  enriched-line path**, D.1–D.4, D.7, and D.9/D.9a–D.9d dispatch directly from the line's `to` / `labels`
  fields — the re-check for these classes is redundant when the line carries them. **Retain the per-event
  `cockpit_status` re-check for D.8, D.10, and D.11** — those open human/consequential gates where a
  stale-line dispatch could open a gate against superseded state, and their low frequency makes the
  authoritative query cost negligible. **D.5/D.6** consult the `checks` verdict on the line; if absent
  OR `pending`, fall back to a single authoritative `cockpit_status` / `cockpit_merge` query per Q4=B
  (defer-on-pending is rejected — smee doorbell delivery is best-effort/lossy and a lost follow-up event
  would silently stall the merge). Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip any query entirely
  per § Invariants #8's cost contract — a batch containing only ledger-only events is one ledger append
  per event and zero other tool calls. If the epic's live state is `epic-complete`, go to step 6.
```

### E7.2 — D.1–D.4 and D.7 dispatch preambles (auto.md § Dispatch)

**Load-bearing pre-#437 wording** (§ Dispatch preamble, currently at ~L151):

> The parent **always** re-checks live state on every event (step 4a) — streamed lines are advisory (spec § Loop trust boundary). The re-check is mandatory for every *actionable* dispatch class (D.1–D.8, D.10, D.11); ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip the re-check entirely per § Invariants #8's cost contract.

**Post-#437 rewrite**:

> The parent resolves authoritative state per step 4a — the enriched doorbell line's `to` / `labels` (and, for D.5/D.6, `checks`) are the source of truth for label-driven classes (D.1–D.4, D.5/D.6 on decisive `checks`, D.7, D.9, D.9a–D.9d); the per-event `cockpit_status` re-check is retained for D.8, D.10, and D.11 (human/consequential gates), and fires as fallback for the label-driven classes when the line is bare (per FR-005 graceful degradation) or for D.5/D.6 when `checks` is absent or `pending` (per Q4=B). Ledger-only rows (D.9, D.9a, D.9b, D.9c, D.9d) skip any query entirely per § Invariants #8's cost contract.

### E7.3 — D.5 dispatch narration (`checks` field path)

**Pre-#437** (§ D.5, currently at ~L299):

> 1. **Confirm state via `cockpit status --json`** — verify `checks_state == "green"` and no infrastructure/runner failures. A `completed:validate` streamed event whose live state shows red falls through to D.6.

**Post-#437** (Q4=B fallback wording):

> 1. **Resolve `checks` verdict.** Prefer the enriched doorbell line's `checks` field (per § Enriched-line dispatch contract E4). If `checks: "green"` → proceed with merge. If `checks: "red"` → fall through to D.6. If `checks` is absent OR `pending` (per Q4=B), fall back to a single authoritative `cockpit_status(issue=<issue-ref>, json=true)` — verify `checks_state == "green"` and no infrastructure/runner failures; a `red` fallback verdict falls through to D.6.

### E7.4 — D.6 dispatch narration (`checks` field path)

**Pre-#437** (§ D.6, currently at ~L314):

> **Trigger**: `completed:validate` with `checks_state == "red"` OR a `cockpit merge` call in D.5 returned `result: "red"`.

**Post-#437** (Q4=B fallback wording added):

> **Trigger**: `completed:validate` with an enriched line's `checks: "red"` verdict (per § Enriched-line dispatch contract E4), OR (on `checks: absent | pending` fallback per Q4=B) a `cockpit_status(issue=<issue-ref>, json=true)` returning `checks_state == "red"`, OR a `cockpit merge` call in D.5 returned `result: "red"`.

### E7.5 — D.9-family "server-side-owned" narrations (D.9, D.9a, D.9b, D.9c)

**Load-bearing pre-#437 wording** on each of D.9 / D.9a / D.9b / D.9c (currently at ~L405 / L413 / L421 / L429):

> **Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger line accounts for the event; the loop continues.

**Post-#437 rewrite** (per E5 — line-as-received + marker; the re-check-free statement is preserved verbatim, the source-of-truth is called out):

> **Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E5); the outcome slot carries the `source: enriched-line` marker when the dispatch was driven by an enriched line, and no marker (equivalent to `source: re-query`) when the fallback fired.

### E7.6 — D.9d `phase:*` narration

**Pre-#437** (§ D.9d, currently at ~L437):

> **Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` or `blocked:*` still fires D.10).

**Post-#437 rewrite** (marker added; the D.10 non-collision statement preserved):

> **Dispatch**: **Ledger line only.** No tool call (in particular, no `cockpit_status` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. The ledger row's `<transition-class>` slot is populated from the enriched doorbell line's `to` field as-received (per § Enriched-line dispatch contract E5); the outcome slot carries the `source: enriched-line` marker when the dispatch was driven by an enriched line. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels.

### E7.7 — Invariant §7 rewrite (auto.md § Invariants #7, currently at ~L1138)

**Pre-#437** (verbatim):

> **Stream consumption is unfiltered.** Every non-empty line from `generacy cockpit doorbell` is a doorbell only; doorbell content is a doorbell only; never parsed for content. Content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.

**Post-#437** (per R7):

> **Stream consumption is unfiltered.** Every non-empty line from `generacy cockpit doorbell` is consumed by the parent — content-based filters over the stream (e.g., "only wake on lines matching `waiting-for:*`") are prohibited, because a filter could silently drop legitimate events. Enriched lines (JSON-parseable objects carrying `to` and `labels`) ARE parsed for dispatch inputs per the § Enriched-line dispatch contract; bare lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.

### E7.8 — Step 2 sensor arm-up "doorbell only" statement (auto.md § Instructions #2, currently at ~L53)

**Pre-#437** (verbatim):

> The stdout content is a **doorbell only**: the parent NEVER parses lines for content. `cockpit_await_events` remains the sole source of typed batches (step 4).

**Post-#437**:

> The stdout content is **NDJSON per-line** — the parent parses each line as a candidate enriched event per § Enriched-line dispatch contract (E2 detection gate). Enriched lines (JSON-parseable objects carrying `to` and `labels`) drive label-driven dispatch (D.1–D.4, D.7, D.9, D.9a–D.9d) and inform the D.5/D.6 merge gate via the baked `checks` verdict; bare or malformed lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces (step 4).

### E7.9 — § Ledger action+outcome vocabulary table (~L1044 onward)

**Post-#437 additions** to the table (per E5 marker):

- Rows D.1–D.4, D.7, D.9, D.9a, D.9b, D.9c, D.9d gain a note in the `<outcome>` column: `"…; add ` · source: enriched-line` suffix when dispatched from the enriched line (E2 = true; per § Enriched-line dispatch contract E5); no suffix on fallback re-query rows"`.

The pin-friendly canonical form of the marker string — `source: enriched-line` — appears at least once in the § Ledger section as a literal string, so `playbook-verification.test.ts` can assert its presence with a `.toContain("source: enriched-line")` check.

## Relationships

```
Monitor.spawn(generacy cockpit doorbell <ref>)
  └─▶ stdout NDJSON line
        └─▶ E2 detection gate (isEnrichedLine)
              ├─▶ enriched=true
              │     └─▶ E3 dispatch source table
              │           ├─▶ D.1–D.4, D.7, D.9, D.9a–D.9d ─▶ dispatch off line's `to`/`labels`
              │           │     └─▶ ledger row w/ `source: enriched-line` marker (E5)
              │           └─▶ D.5/D.6 (merge gate) ─▶ E4 checks handler
              │                 ├─▶ green|red ─▶ dispatch, ledger w/ marker
              │                 └─▶ absent|pending ─▶ fallback `cockpit_status`/`cockpit_merge`, no marker
              └─▶ enriched=false (bare)
                    └─▶ fallback: `cockpit_status(epic, json=true)` (pre-#437 shape)
                          └─▶ dispatch per today's logic, no marker on ledger row

step 4a "resolve authoritative state" (Q3=B) ─▶ orchestrates the E2/E3/E4 branch
§7 invariant (rewritten per E7.7) ─▶ documents E2 parse and the retained anti-drop rule
§ Ledger vocabulary (E7.9) ─▶ documents E5 marker on D.1–D.4, D.7, D.9-family rows
```

## Validation rules

None at runtime — this fix has no runtime state or persistent schema on the skill side. Validation happens at test time:

- **`playbook-verification.test.ts::437-1 (step 4a re-pin)`** — `auto.md` contains the new "resolve authoritative state" wording; does NOT contain the pre-#437 `"The batch event is advisory; the live return is authoritative"` string.
- **`playbook-verification.test.ts::437-2 (D.1–D.7 dispatch re-pin)`** — the D.1–D.4 and D.7 dispatch narrations name the enriched line's `to`/`labels` as the source-of-truth; do NOT name a per-event `cockpit_status(...)` re-check inside their dispatch narrations (the retain-the-re-check statement in step 4a's rewritten E7.1 is scope-restricted to D.8/D.10/D.11 and is fine).
- **`playbook-verification.test.ts::437-3 (§7 rewrite)`** — § Invariants §7 opens with "Stream consumption is unfiltered" AND names the § Enriched-line dispatch contract cross-reference; does NOT contain the pre-#437 `"never parsed for content"` phrase.
- **`playbook-verification.test.ts::437-4 (§ Ledger marker)`** — `auto.md § Ledger` section contains the literal string `source: enriched-line`.
- **`playbook-verification.test.ts::437-5 (D.5/D.6 fallback rule)`** — D.5/D.6 narrations name both `absent` and `pending` as fallback triggers (per Q4=B); do NOT contain a defer-on-pending phrasing (per Q4=A rejection).
- **`playbook-verification.test.ts::437-6 (D.8/D.10/D.11 retain-the-re-check)`** — D.8/D.10/D.11 narrations name the retain-the-re-check rule verbatim.
- **Existing 406-3 pin (post-#420/#431 loop shape)** — continues to pass; the sensor invocation `generacy cockpit doorbell <epic-ref>` is unchanged.
- **Existing 433 positive + negative pin (pre-flight probe form)** — continues to pass; the pre-flight probe `generacy cockpit help doorbell` is orthogonal to the stdout parse.
- **Existing 398 drift-audit** — continues to pass; no new `cockpit doorbell <verb>` invocation is added; the sensor invocation is unchanged.

---

*Generated by speckit*
