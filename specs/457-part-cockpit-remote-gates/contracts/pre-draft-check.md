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
     (The `cockpit_gate_list` call and every branch below fire ONLY when the drift-branch dispatch-identity guard is satisfied — see § Generation-drift branch guard. For `gateType: 'escalation'` (D.6/D.7/D.10/D.11) the guard fails: skip the list call and the drift branch entirely and fall straight through to the draft-then-open flow.)
     - **`result.truncated === true` AND no drift entry present in the returned page** — treat as query-unreachable per sub-step 3 (abort with visible error) — do NOT fall through to draft-fresh.
     - **Non-terminal gate at a DIFFERENT `generation`** — generation drift (Q1=C). Call `cockpit_gate_ack(staleGateId, outcome: 'superseded', detail: 'generation drift — content changed since original draft (was g<old>, now g<new>)')`, then fall through to the current draft-then-open flow (below) with the fresh generation.
     - **Empty `gates` list** — no gate anywhere for this `(issueRef, gateType)` pair. Fall through to the current draft-then-open flow (below) unchanged.
3. **Error handling — classify the typed error; only a literal `absent` means "no existing gate".** Both `cockpit_gate_status` and `cockpit_gate_list` return `ToolResult<T>`. FOUR error classes are reachable here (per generacy `mcp/errors.ts § ErrorClass` and the two tools' `catch` blocks): `query-unreachable` (surfaced only after `withRetry(QUERY_RETRY_SCHEDULE)` is exhausted — sustained cloud/relay outage, NOT a race), `invalid-args` (`.strict()` parse rejection — deterministic CALLER bug), `internal` (wrapped throw / malformed upstream payload — deterministic SERVER bug), `transport` (the call never reached the query surface). **MUST NOT** collapse ANY class to `status: 'absent'`, and MUST NOT fall through to the draft-then-open flow on any of them. Every class: abort this event's dispatch, write `<issue-ref> · <transition-class> · pre-draft-check · error: <class> — <detail> · source: ui-gate`, print the visible operator-facing line `pre-draft gate check failed for <issue-ref> (<class>): <detail> — not drafting; see the run ledger`, and continue with the NEXT event in the batch. Collapsing `query-unreachable` re-introduces the duplicate-drafting hazard this feature fixes; collapsing `invalid-args` / `internal` is worse, since that bucket is populated exclusively by deterministic bugs rather than races, so one payload mismatch would silently degrade the whole check to a no-op.
```

The verbatim heading `**Step 0 — pre-draft gate-status check (UI mode only).**` is pinned literally (assertion 457-4 through 457-9). The six-branch names — `reuse-open`, `reuse-answered`, `supersede-and-redraft`, `draft-fresh`, `abort-query-unreachable`, `abort-gate-query-bug` — are NOT pinned as literal strings in the prose (they exist in `data-model.md § PreDraftCheckOutcome`); the prose describes each branch by its return-shape condition.

## Tool-presence check (add to § step 3)

The existing tool-presence check at `auto.md:176` names seven tools. This contract adds `cockpit_gate_status` and `cockpit_gate_list` **conditionally**, so the required set is:

- **Always (all modes)** — the seven baseline tools: `cockpit_status`, `cockpit_context`, `cockpit_queue`, `cockpit_advance`, `cockpit_resume`, `cockpit_merge`, `cockpit_await_events`.
- **Only when `ResolvedGateMode === "ui"`** — `cockpit_gate_status`, `cockpit_gate_list`.

Under `ResolvedGateMode === "local"` the two gate-query tools are NOT required and their absence is NOT an error: they are called from exactly one site (§ Dispatch step 0), which `local` skips entirely. An unconditional requirement would hard-abort every `--gates=local` run — including every `--gates=auto` run that resolved to `local`, which is the default — on any cluster predating generacy#1038, breaking the § step-1 guarantee that `--gates=local` "preserves today's byte-path exactly". A `local` run MUST NOT fail on a tool it never calls. This mirrors the § step-1 `--gates=ui` pre-flight absence check, where `cockpit_gate_open` absence hard-fails under explicit `ui` but resolves the mode down under `auto`.

Absence of any tool in the resolved mode's required set fires the existing `Print + exit` fail-loud path (append `startup · cockpit-mcp-tools-missing · abort · see cluster-base#75` to the ledger, print the guidance line, exit non-zero). No operator prompt, no ledger dir created. Matches the Q3=A precedent from #449.

**Test assertion 457-1**: § step 3's presence check states the rule CONDITIONALLY — seven tools under `local`, nine under `ui` — and names all nine tools.

## Generation-drift branch guard (dispatch-identity precondition)

The drift branch acks another gate `superseded` — it destroys a gate. It may therefore fire ONLY when the listed entry is one the CURRENT dispatch itself would have opened. Precondition, both parts required:

1. `entry.gateType` equals this dispatch's `gateType` (guaranteed when the list call passes the `gateType` filter — `CockpitGateListInputSchema.gateType` is OPTIONAL, so an unfiltered call returns every type for the issue), AND
2. the entry's **dispatch-identifying discriminator** — which D.n row opened it — is recoverable from `{gateId, gateType, generation, status}` and equals this dispatch's row.

**When part 2 is not recoverable, the drift branch MUST NOT supersede**: skip it entirely (do not even issue the list query) and proceed as "no existing gate".

| gateType | Step-0 row(s) | recoverable? |
|---|---|---|
| `clarification` | D.1 | yes — gateType ⇒ row |
| `artifact-review` | D.2 | yes |
| `implementation-review` | D.3 | yes |
| `manual-validation` | D.4 | yes |
| `escalation` | **D.6, D.7, D.10, D.11** | **no — four rows share one gateType** |

So the drift branch is **DISABLED for `gateType: 'escalation'`**. Without this, a D.7 `agent:error` event would list the issue's escalation gates, find the operator's live D.11 merge-conflict gate at a different `generation`, ack it `superseded`, and destroy it with no replacement — the ack touches no label, so D.11's dedup returns `already-dispatched` on re-fire and never re-opens. The mirror case destroys a D.7 gate. Round 2's "in D.11 ONLY" scoping did not fix this; it moved the hazard to D.7.

The `generation` string MUST NOT be parsed to recover the subtype: it is an opaque `z.string().min(1)` on the wire with no format contract, and a mis-parse destroys a live operator gate.

**Residual limitation (out of scope for this feature)**: escalation-subtype generation drift is therefore undetectable — a genuinely stale escalation gate is left non-terminal alongside the fresh one. The conservative behavior is to not supersede. A fix requires a subtype discriminator (or a finer `gateType`) on the query surface; tracked upstream as [generacy-ai/generacy#1046](https://github.com/generacy-ai/generacy/issues/1046).

**Test assertions 457-8 / 457-9**: D.7's and D.11's Step 0 blocks state the disabled drift branch and contain NO `cockpit_gate_ack(staleGateId …)` call. **457-9a**: the shared-rules section names all four escalation rows and #1046. **457-9b**: D.6 and D.10 (escalation rows without a Step 0) carry the guard note.

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

1. **Step 0** — pre-draft `cockpit_gate_status` check (NEW), with the **D.11 ordering exception** that consults the in-memory `dispatched-issues` set on the `absent` return. (The drift branch itself is disabled for this row by the § Generation-drift branch guard.)
2. **Step 1** — `dispatched-issues` in-memory dedup (UNCHANGED).
3. Step 1a through step 3 — UNCHANGED.

The two checks cover orthogonal properties per Q5=A / R6:

- **Step 0 covers**: cross-session reuse (a gate opened by a prior session that survived the restart / cluster takeover).
- **Step 1 covers**: (a) label-pair coalescing — `waiting-for:merge-conflicts` + `blocked:stuck-merge-conflicts` fire together but hash to two different `gateId`s under the escalation generation discriminator (`auto.md:1360`), so the durable check does NOT coalesce them; (b) session-mute-on-Skip semantics — the set is retained on skip (`auto.md:718`) per Invariant 3 (`auto.md:1636`), which no durable gate query can express since Skip never touches labels.

**D.11 ordering exception (retained, now belt-and-braces)**: the gate-destroying hazard it was introduced for is closed at the § Generation-drift branch guard, which disables the drift branch for every `gateType: 'escalation'` row under any ordering. The exception still earns its place: because the sibling labels hash to two different `gateId`s, event 2 would otherwise see `absent` at its own gateId and open a SECOND gate for one incident. So step 0's `absent` branch consults the in-memory `dispatched-issues` set and returns `already-dispatched` when the sibling has already dispatched this incident — which also saves a pointless list query. The `open` / `answered` reuse branches (matching gateId) are not affected by the exception — they were already dispatch-idempotent.

**Test assertion 457-10**: § Dispatch D.11 contains BOTH step 0 (the pre-draft check heading) AND step 1 (the `Dedup check.` heading), in that order, with no removal of step 1's prose.

**Test assertion 457-15**: § Dispatch D.11's Step 0 block contains the verbatim heading `**D.11 ordering exception (Q5=A / FR-010).**` naming the dedup-before-drift-ack coupling.

## Interaction with the § UI-mode fallback path

`cockpit_gate_status` / `cockpit_gate_list` call-time errors do NOT trigger the § UI-mode fallback to local `AskUserQuestion` — that path is scoped to `cockpit_gate_open` errors only. They do **NOT** fall through to the draft-then-open flow either. Per step 0 sub-step 3 above, EVERY reachable error class (`query-unreachable`, `invalid-args`, `internal`, `transport`) aborts this event's dispatch, writes the `pre-draft-check · error: <class>` ledger row, prints the visible operator-facing line, and continues with the NEXT event in the batch. `cockpit_gate_open` is therefore never reached on an errored pre-draft check, so the § UI-mode fallback cannot fire for that event at all.

The § UI-mode fallback per `auto.md:1386-1418` still applies unchanged to `cockpit_gate_open` errors on events whose pre-draft check SUCCEEDED — i.e. returned a literal `absent`, or took a reuse / drift branch that fell through to draft-then-open (per-gate local `AskUserQuestion`, first-failure ledger note, subsequent silent).

**No new fallback state**: the pre-draft check does NOT introduce a `firstGateStatusFailureNoted` flag — **not** because its errors are harmless, but because each one is already individually surfaced (a ledger row plus a visible operator line per occurrence, per sub-step 3), so there is nothing for a once-only suppression flag to suppress. `cockpit_gate_open` errors are different: the fallback resolves them silently after the first note, so that path needs the flag to stay observable. Different semantics; no state added.

## Interaction with revised drafts

Revised drafts (G.1 `make-changes`, G.2 `request-changes`, G.6 `make-changes`) already recompute their generation discriminator and mint a fresh `gateId` per the § D.12 revised-draft re-open path (`auto.md:781-791`). The pre-draft check applies to the RE-OPEN as it does to any first-open — an operator-inbox gate at the fresh `gateId` is exceedingly unlikely (unless a prior identical revision was drafted from the same content), but the check is unconditional.

## Ledger provenance

The pre-draft check itself does NOT write a ledger row on its own (per Invariant #8 — no per-check cost). Ledger provenance comes from the downstream resolution:

- **`reuse-open` / `reuse-answered` branches**: the eventual D.12 resolution writes the ledger row per § D.12 gate-answer with `· source: ui-gate` suffix. The pre-draft record is invisible in the ledger.
- **`supersede-and-redraft` branch**: the stale `cockpit_gate_ack` call is a control-flow event, not a dispatch event, and is NOT logged as its own ledger row. The fresh gate's eventual D.12 resolution writes the ledger row as normal (with the fresh `generation` in the `gateId`).
- **`draft-fresh` branch**: unchanged behavior; the eventual D.12 resolution writes the ledger row as today.

**Rationale**: Per Invariant #8 (`auto.md:1641`), only dispatch events (D.n resolution) may write ledger rows. The pre-draft check is a pre-dispatch check, not a dispatch. Adding a per-check ledger row would violate the cost contract. Post-mortem visibility into pre-draft-check behavior comes from the cloud-side audit trail (stale gate terminal-state records with the drift-detail string, reused-gate record's `askedAt` timestamp older than the current run's start).
