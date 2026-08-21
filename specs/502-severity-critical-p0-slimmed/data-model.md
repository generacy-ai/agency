# Data Model: Fix inverted engine-compatibility gating in `/cockpit:auto`

`auto.md` is markdown prose interpreted by the model, not typed code. This document models the **decision states, dispatch branches, and ledger vocabulary** the prose must encode, so `/speckit:tasks` and the pin test have a precise target. Nothing here introduces a new MCP field, engine surface, or loop-state variable beyond what is called out.

## Engine compatibility model (the thing being detected)

```text
EngineModel =
  | "post-validate"   // #1120 gate move active: implementation-review fires AFTER completed:validate
  | "legacy"          // pre-relocation / flag-off: implementation-review fires BEFORE validate (pre-validate)
  | "undetectable"    // neither signal resolves → fail closed
```

The model is **not** derived from `generacy --version`. It is derived from a runtime label observation (below). The engine flags that produce the `legacy` (flag-off) case are, for reference only (read-only, cross-repo — never written by `auto`):

| Flag | Default | Source | Effect when false |
|------|---------|--------|-------------------|
| `reviewPhaseEnabled` | `false` | `generacy worker/config.ts:143` | engine does not run the server-side review phase; `implementation-review` is client-driven / pre-validate |
| `ciMergeGateEnabled` | `false` | `generacy worker/config.ts:151` | engine does not gate merge on validate; the post-validate model is not in effect |

## Detection signal (authoritative, runtime)

**Input**: the issue's live label set at the moment `waiting-for:implementation-review` fires, read from the enriched doorbell line's `labels` field (§ Enriched-line dispatch contract E3) or the `cockpit_status(issue=<ref>, json=true)` fallback. No new query is added on the enriched-line path.

**Rule**:

```text
detectModel(labels):
  present(waiting-for:implementation-review)  # the trigger; always true at D.3
  if present(completed:validate):   return "post-validate"
  else:                             return "legacy"       # provisional
  # "undetectable" is reached only if the provisional "legacy" advance attempt
  # itself fails in a way that proves the engine has no implementation-review gate
  # (see fail-closed transition below).
```

**Advisory pre-flight probe** (non-authoritative, never blocks): `generacy --version` output may be echoed for operator context. It contributes **no** branch to `EngineModel`. The removed `MIN_GENERACY_VERSION = 0.2.0` comparison and its hard-fail branches are deleted.

## D.3 dispatch branch (verdict application)

The Step 0 identity/drift/adoption machinery, the trigger, and the source-of-truth block are **unchanged**. Only the verdict application changes:

| Detected model | `approve` verb | `hold` / `reject` | Ledger outcome (approve) |
|----------------|----------------|-------------------|--------------------------|
| `post-validate` | `cockpit_merge(issue=<ref>)` — merge on green, never on red (unchanged) | no-op (label stays; gate re-fires) | `merged (PR #<n>)` / `blocked: <reason>` |
| `legacy` | `cockpit_advance(issue=<ref>, gate="implementation-review")` (restored #500-removed path) | no-op | `advanced (implementation-review)` |
| `undetectable` | — (fail closed; see below) | — | `fail-closed: engine gate model undetectable` |

`hold` / `reject` remain no-ops in every model (label stays, gate re-fires; add-only invariant §3 — no label writes).

## Fail-closed transition

```text
undetectable  ⟸  detectModel returned "legacy"
                 AND cockpit_advance(gate="implementation-review") returned a typed error
                     indicating the engine does not recognize the gate
                 (i.e. neither the post-validate nor the legacy model is actually servable)
```

**Action**: print the verbatim fail-closed diagnostic (see contracts/fail-closed-diagnostic.md) naming `reviewPhaseEnabled` and `ciMergeGateEnabled`, exit the run non-zero, halt the loop. No label writes. Byte-mirrors the Monitor/doorbell pre-flight hard-fail idiom (message block + exit non-zero + no loop).

## Ledger vocabulary (D.3 row)

The D.3 ledger line (`auto.md:775`) keeps its structure `<issue-ref> · waiting-for:implementation-review · implementation-review-approval+<verdict> · <outcome>`. The **outcome** enum extends:

| Outcome | Model / verdict | Meaning |
|---------|-----------------|---------|
| `merged (PR #<n>)` | post-validate / approve | merged via `cockpit_merge` (existing) |
| `advanced (implementation-review)` | legacy / approve | advanced via `cockpit_advance(gate="implementation-review")` (**new**) |
| `held` | any / hold | no-op, label stays (existing) |
| `rejected` | any / reject | no-op, label stays (existing) |
| `blocked: <reason>` | post-validate / approve | merge-path blocked reason as in D.5 (existing) |
| `fail-closed: <detail>` | undetectable | fail-closed diagnostic emitted, run exited (**new**) |
| `error: <description>` | any | tool/other error (existing) |

## Gate contract G.8 (post-gate behavior)

G.8 (`auto.md:1478–1500`) presentation and the three-option invocation (`approve` / `hold` / `reject`) are **unchanged** — the gate still prompts. Only `approve`'s post-gate behavior gains the model branch:

```text
approve →
  if model == "post-validate":  cockpit_merge(issue=<ref>)                         # merge on green, never on red
  if model == "legacy":         cockpit_advance(issue=<ref>, gate="implementation-review")
  if model == "undetectable":   fail-closed diagnostic + exit
hold   → no-op (label stays; gate re-fires)   # unchanged
reject → no-op (label stays; gate re-fires)   # unchanged
```

## What is NOT modeled here (unchanged surfaces)

- **Loop state**: no new in-memory variable. `runId`, cursor, `openGates`, and the mode resolution are untouched. The detected model is a per-event local, not persisted loop state.
- **MCP tools**: no new tool and no new field. `cockpit_advance` / `cockpit_merge` / `cockpit_status` are already bound; the D.3 Step 0 gate-verb tools are unchanged.
- **Other dispatch rows**: D.1, D.2, D.4, D.5, D.6, D.7, D.8, D.9–D.11, D.13 unchanged. Gate contracts G.1–G.7, G.9 unchanged.
- **new-engine + old-`auto` direction**: inert by construction (`auto.md:244`); no state added (FR-006).
