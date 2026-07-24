# Contract: Pre-draft gate-status check (step 0)

Load-bearing prose for the new **step 0** inserted at the head of every drafting D.n dispatch (D.1, D.2, D.3, D.4, D.7, D.11) in `packages/claude-plugin-cockpit/commands/auto.md`. Prose fragments below are meant to be pinned by `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` in the `describe("457 sweep-time gate reuse", ...)` block. Any edit that alters the pinned phrases MUST be accompanied by a re-pin in the same PR (per repo CLAUDE.md § "Cockpit playbook pins").

## Scope

Applies ONLY when `ResolvedGateMode === "ui"` (per § step-1 `--gates` resolution introduced by #449). Under `--gates=local` (or `--gates=auto` resolved to `local`) the step-0 block is dead prose — every existing local-mode test continues to describe correct local behavior.

Applies on BOTH the § step 3 startup sweep path AND the § step 4 main-loop (in-session, event-driven) dispatch path — per Q2=B, sweep-synthesized and live events share the same D.n dispatch rows (`auto.md:184`), so an unconditional check at the top of every dispatch is strictly simpler and strictly safer than a per-dispatch provenance flag.

Applies to EXACTLY six rows: D.1, D.2, D.3, D.4, D.7, D.11 (the drafting-subagent-spawning rows). D.5 (green merge) has no gate. D.6 opens via the fixer branch under a single `openGates` record already handled by #449's flow. D.8 (phase-complete → G.5) has no drafting subagent but a pre-draft check would still be structurally valid; this feature does NOT add it per the six-row scope FR-001 pins. D.9 family is ledger-only. D.10 (unrecognized state) does not draft.

## Verbatim step-0 block (canonical form)

The block below is added at the head of each of the six drafting D.n dispatches. Substitutions per row: `<gateType>` is the frozen 8-value gateType enum value (`clarification` for D.1; `artifact-review` for D.2 — the artifact kind is folded into `generation`, NOT `gateType`, per the frozen enum; `implementation-review` for D.3; `manual-validation` for D.4; `escalation` for D.7 and D.11).

```markdown
**Step 0 — pre-draft gate-status check (UI mode only).** Before spawning any drafting subagent or fetching any context, check whether an existing operator-inbox gate already covers this event. Skip Step 0 entirely under `ResolvedGateMode === "local"`; under `ui`:

1. Derive `(gateType, generation)` for this event using the SAME per-gateType generation function the live path uses (§ UI-mode gate mapping generation-discriminator table). The `cockpit_gate_open` MCP tool derives the `gateId` from these inputs — the plugin never hand-builds a hash.
2. Call `cockpit_gate_status({ issueRef, gateType, generation })` — the tool's frozen `.strict()` input schema (per generacy `mcp/gates/query-schemas.ts § CockpitGateStatusInputSchema`). The plugin passes the three semantic inputs and the tool server internally derives `gateKey`/`gateId` and returns `{ gateId, status: 'open' | 'answered' } | { gateId: null, status: 'absent' }`. Branch on the return:
   - **`{ status: 'open' }`** — an operator-inbox gate is already pending at exactly this `gateId`. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (`{gateId, gateType, generation, issueRef, status: 'open', transitionClass}` — the reuse-path record has no `inboxUrl`/`title`/`askedAt`, which the query does not return), and continue to the next event. The "one pointer line" is NOT printed (per FR-005 it is scoped verbatim to `cockpit_gate_open` success and requires an `inboxUrl` value the reuse-path query does not carry).
   - **`{ status: 'answered' }`** — an operator has answered the gate but a D.12 event has not yet resolved it in this session. Do NOT spawn the drafting subagent. Record a partial `openGates` entry (same shape as `open` above with `status: 'answered'`), increment `answeredGateSweepCounter[gateId]`, and continue to the next event. Downstream D.12 delivery will consume the answer via the existing redelivery + `deliveryId` dedup path.
   - **`{ status: 'absent' }`** — no gate exists at this exact `gateId`. Call `cockpit_gate_list({ issueRef, gateType })` — the tool returns `{ gates: [{gateId, gateType, generation, status}, ...], truncated?: boolean }` (per generacy `mcp/gates/query-schemas.ts § CockpitGateListDataSchema`). Iterate `result.gates` and branch again:
     - **`result.truncated === true` AND no drift entry present in the returned page** — treat as query-unreachable per sub-step 3 (abort with visible error) — do NOT fall through to draft-fresh.
     - **Non-terminal gate at a DIFFERENT `generation`** — generation drift (Q1=C). Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')`, then fall through to the current draft-then-open flow (below) with the fresh generation.
     - **Empty `gates` list** — no gate anywhere for this `(issueRef, gateType)` pair. Fall through to the current draft-then-open flow (below) unchanged.
3. **Error handling — distinguish `absent` from `query-unreachable`**. Both `cockpit_gate_status` and `cockpit_gate_list` may return a typed `query-unreachable` error class (per generacy #1038 `mcp/errors.ts` and quickstart.md § FR-014: the tool retries internally within its budget — ~3 attempts / ~5s — before surfacing `query-unreachable`; the error signifies a sustained cloud/relay outage, NOT a transient race). **MUST NOT** collapse `query-unreachable` to `status: 'absent'` — doing so re-introduces the exact duplicate-drafting hazard this feature fixes. On `query-unreachable`: abort this event's dispatch, write the ledger line `<issue-ref> · <transition-class> · pre-draft-check · error: query-unreachable — aborting sweep for this event · source: ui-gate`, and continue with the NEXT event in the batch. On a non-`query-unreachable` transient error: apply the first-failure-note-then-continue rule the § UI-mode fallback path uses for `cockpit_gate_open` errors — treat as "no existing gate" and fall through to the draft-then-open flow.
```

The verbatim heading `**Step 0 — pre-draft gate-status check (UI mode only).**` is pinned literally (assertion 457-4 through 457-9). The five-branch names — `reuse-open`, `reuse-answered`, `supersede-and-redraft`, `draft-fresh`, `abort-query-unreachable` — are NOT pinned as literal strings in the prose (they exist in `data-model.md § PreDraftCheckOutcome`); the prose describes each branch by its return-shape condition.

## Tool-presence check (add to § step 3)

The existing tool-presence check at `auto.md:176` names seven tools. This contract grows it to nine by adding `cockpit_gate_status` and `cockpit_gate_list`. Verbatim addition:

```
- `cockpit_gate_status`
- `cockpit_gate_list`
```

Absence of either fires the existing `Print + exit` fail-loud path (append `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` to the ledger, print the guidance line, exit non-zero). No operator prompt, no ledger dir created. Matches the Q3=A precedent from #449.

**Test assertion 457-1**: § step 3 startup sweep names all nine tools in the presence check.

## Generation-drift ack detail-string convention

The `cockpit_gate_ack` call in the supersede-and-redraft branch MUST carry a `detail` string of the canonical form:

```
generation drift — content changed since original draft (was g<old>, now g<new>)
```

Where `<old>` is the stale gate's `generation` (as returned by `cockpit_gate_list`) and `<new>` is the freshly-computed generation for the current event. The em-dash (`—`) is intentional and pinned.

**Rationale**: The post-mortem ledger and cloud audit trail need to distinguish drift-driven supersessions from operator-driven ones (a manually-answered `superseded` vs an automatically-fired one). The detail-string is the only place the distinction can be encoded on the wire; the acked cloud doc carries this string into the terminal record for later inspection.

**Test assertion (part of 457-4 through 457-9)**: the detail-string literal appears in the step-0 prose of every drafting D.n row.

## D.11 defense-in-depth

D.11's dispatch has both the new step 0 (durable, cross-session) AND the existing step 1 (`Dedup check` — the in-memory `dispatched-issues` set at `auto.md:706`). Ordering:

1. **Step 0** — pre-draft `cockpit_gate_status` check (NEW), with the **D.11 ordering exception** (per #458 review comment 3) that consults the in-memory `dispatched-issues` set BEFORE the drift-ack sub-branch fires.
2. **Step 1** — `dispatched-issues` in-memory dedup (UNCHANGED).
3. Step 1a through step 3 — UNCHANGED.

The two checks cover orthogonal properties per Q5=A / R6:

- **Step 0 covers**: cross-session reuse (a gate opened by a prior session that survived the restart / cluster takeover).
- **Step 1 covers**: (a) label-pair coalescing — `waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` fire together but hash to two different `gateId`s under the escalation generation discriminator (`auto.md:1360`), so the durable check does NOT coalesce them; (b) session-mute-on-Skip semantics — the set is retained on skip (`auto.md:718`) per Invariant 3 (`auto.md:1636`), which no durable gate query can express since Skip never touches labels.

**D.11 ordering exception (load-bearing)**: without it, event 2 (sibling label) would find event 1's live gate at a different `generation`, ack it `superseded`, then hit step 1's dedup and return `already-dispatched` — destroying the operator's live gate with no replacement (the exact hazard called out in #458 review comment 3). The step-0 drift branch MUST check the in-memory `dispatched-issues` set FIRST and skip the drift-ack when the sibling has already dispatched this incident. The `open` / `answered` reuse branches (matching gateId) are not affected by the exception — they were already dispatch-idempotent.

**Test assertion 457-10**: § Dispatch D.11 contains BOTH step 0 (the pre-draft check heading) AND step 1 (the `Dedup check.` heading), in that order, with no removal of step 1's prose.

**Test assertion 457-15**: § Dispatch D.11's Step 0 block contains the verbatim heading `**D.11 ordering exception (Q5=A / FR-010).**` naming the dedup-before-drift-ack coupling.

## Interaction with the § UI-mode fallback path

`cockpit_gate_status` / `cockpit_gate_list` call-time errors do NOT trigger the § UI-mode fallback to local `AskUserQuestion` — that path is scoped to `cockpit_gate_open` errors only. The pre-draft check's error branch (step 0 sub-step 3 above) simply treats the return as "no existing gate" and falls through to the draft-then-open flow, where `cockpit_gate_open` runs normally. If THAT call also errors, the existing § UI-mode fallback path per `auto.md:1386-1418` fires as it does today (per-gate local `AskUserQuestion`, first-failure ledger note, subsequent silent).

**No new fallback state**: the pre-draft check does NOT introduce a `firstGateStatusFailureNoted` flag. The rationale is that `cockpit_gate_status` errors are handled as pass-through (no operator-facing consequence beyond a potentially-duplicated drafter spawn, which cloud-side coalescing eliminates), whereas `cockpit_gate_open` errors are the OPERATOR-VISIBLE failure mode (a gate that cannot be opened remotely still needs an answer surface, hence the local fallback). Different semantics; no state added.

## Interaction with revised drafts

Revised drafts (G.1 `make-changes`, G.2 `request-changes`, G.6 `make-changes`) already recompute their generation discriminator and mint a fresh `gateId` per the § D.12 revised-draft re-open path (`auto.md:781-791`). The pre-draft check applies to the RE-OPEN as it does to any first-open — an operator-inbox gate at the fresh `gateId` is exceedingly unlikely (unless a prior identical revision was drafted from the same content), but the check is unconditional.

## Ledger provenance

The pre-draft check itself does NOT write a ledger row on its own (per Invariant #8 — no per-check cost). Ledger provenance comes from the downstream resolution:

- **`reuse-open` / `reuse-answered` branches**: the eventual D.12 resolution writes the ledger row per § D.12 gate-answer with `· source: ui-gate` suffix. The pre-draft record is invisible in the ledger.
- **`supersede-and-redraft` branch**: the stale `cockpit_gate_ack` call is a control-flow event, not a dispatch event, and is NOT logged as its own ledger row. The fresh gate's eventual D.12 resolution writes the ledger row as normal (with the fresh `generation` in the `gateId`).
- **`draft-fresh` branch**: unchanged behavior; the eventual D.12 resolution writes the ledger row as today.

**Rationale**: Per Invariant #8 (`auto.md:1641`), only dispatch events (D.n resolution) may write ledger rows. The pre-draft check is a pre-dispatch check, not a dispatch. Adding a per-check ledger row would violate the cost contract. Post-mortem visibility into pre-draft-check behavior comes from the cloud-side audit trail (stale gate terminal-state records with the drift-detail string, reused-gate record's `askedAt` timestamp older than the current run's start).
