# Contract: D.11 `waiting-for:merge-conflicts` dispatch

Structural contract for the new D.11 dispatch row in `packages/claude-plugin-cockpit/commands/auto.md`. Each numbered rule is a machine-checkable claim reflected in either the static grep list ([../quickstart.md](../quickstart.md) § Static checks) or behavioral assertion 396-1 ([../data-model.md § 7](../data-model.md) § 7).

## Trigger

**Verbatim event string**: `waiting-for:merge-conflicts`.

**Live-state classification**: `cockpit status --json <epic-ref>` reports an issue whose `transition_class` is `waiting-for:merge-conflicts` (or whose `labels` array contains that token). The streamed event line is advisory (per § Loop trust boundary at step 4a); the live JSON is authoritative.

## Dispatch shape

Escalation gate — the operator resolves conflicts locally (git rebase + push), then advances the gate via CLI. Follows the `CLI verb + optional subagent + optional gate` invariant §4 pattern: no subagent (no analysis workload), gate present (operator decision required), CLI verb (`generacy cockpit advance --gate merge-conflicts <issue-ref>`) called on the `I've resolved it` verdict.

### Step 1 — Fetch context

The engine, on setting `waiting-for:merge-conflicts`, posts a pause-alert comment listing the conflicted paths. Read the alert via:

```bash
gh issue view <issue-ref> --comments --json comments -q '.comments[] | select(.body | contains("<!-- generacy-engine:merge-conflicts -->")) | .body'
```

Extract the conflicted-paths list. If the alert is missing or malformed, present a degraded G.4 (d) block with the note `Engine pause-alert comment missing — resolve conflicts locally and check the branch's git status output.`

### Step 2 — Present escalation gate

One assistant response containing:
1. Presentation block (see § G.4 (d) contract in [../data-model.md § 3.4](../data-model.md) § 3.4).
2. Single `AskUserQuestion` call with:
   - **Question text**: `How to proceed on <issue-ref>?`
   - **Header**: `Escalate` (≤ 12 chars)
   - **Options** (exactly three, in this order):
     1. `I've resolved it — advance the gate`
     2. `Skip (session-local mute)`
     3. `Stop (exit auto)`
   - **multiSelect**: `false`

### Step 3 — Apply verdict

- **`I've resolved it — advance the gate`** → run `generacy cockpit advance --gate merge-conflicts <issue-ref>`.
  - **On zero exit**: ledger line `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · advanced`; continue the loop.
  - **On non-zero exit**: **re-present the D.11 gate** with the CLI stderr prepended verbatim to the presentation block (Q3=A). Do NOT ledger a terminal outcome yet; the re-presented gate's verdict is the terminal outcome. The re-presented gate offers the same three options (`I've resolved it` / `Skip` / `Stop`), so the operator may:
    - Re-select `I've resolved it` (after actually resolving + pushing) → retry the CLI call. If zero exit this time, ledger `advanced`. If non-zero again, re-present again (unbounded — the operator's Skip/Stop are the exit paths).
    - Select `Skip` → ledger `skip (session-local mute)`; add to mute set; continue.
    - Select `Stop` → ledger `stop (exit)`; kill watch; summary; exit.
- **`Skip (session-local mute)`** → add `<issue-ref>` to session mute set; ledger `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · skip (session-local mute)`; continue.
- **`Stop (exit auto)`** → kill watch process; print run summary per § Ledger L.6; ledger `<issue-ref> · waiting-for:merge-conflicts · escalation-gate · stop (exit)`; exit.

**Contract invariants**:
- **D11-C.1**: The `I've resolved it` verdict is the **only** option that triggers a CLI call. Skip/Stop are label-untouching (invariant §3 add-only advance).
- **D11-C.2**: The re-present-on-non-zero shape is unbounded — the operator's Skip/Stop are always available on the re-presented gate.
- **D11-C.3**: The re-presented gate's presentation block prepends the CLI stderr verbatim; the original conflicted-paths block is preserved below.
- **D11-C.4**: A ledger line is written exactly once per D.11 dispatch — at the terminal verdict (advanced / skip / stop). Re-presentations do not produce intermediate ledger lines (they are not dispatches per the § Ledger "What counts as a dispatch" clause).

## Ledger line

Format (verbatim per § Ledger persistence rule):

```text
<issue-ref> · waiting-for:merge-conflicts · escalation-gate · <outcome>
```

Where `<outcome>` is one of:
- `advanced`
- `advance failed: <description>` (rare — only if the D.11 dispatch is exited without a terminal verdict, e.g., a pre-flight failure interrupts the run mid-D.11)
- `skip (session-local mute)`
- `stop (exit)`

The `advance failed: <description>` outcome is retained in the vocabulary table for symmetry with D.2's `advance failed` outcome, but under the Q3=A re-present shape it should be rare — the re-presented gate's terminal verdict is normally what gets ledgered.

## Future degradation

Once the engine-side merge-conflicts resolver ships (companion generacy dead-end-gate finding), the D.11 row degrades to ledger-only (D.9-shape). At that point:
- The trigger prose unchanged.
- The dispatch shape becomes `Ledger line only. No CLI verb, no subagent, no gate — server-side-owned.`
- The ledger line becomes `<issue-ref> · waiting-for:merge-conflicts · (no-op) · server-side-owned`.
- G.4 (d) is removed from § Gate contract.
- `GATE_VOCABULARY` unchanged (still present, still audited).

That degradation is a follow-up PR, not this fix's surface.

## Interaction with other dispatch rows

- **D.11 vs D.10 (catch-all)**: D.11's trigger is specific (`waiting-for:merge-conflicts`); D.10's trigger is any `waiting-for:*` without a matching row. D.11 fires on the exact token; D.10 fires on any other `waiting-for:*` not in D.1–D.9c or D.11.
- **D.11 vs D.9-family**: D.11 is an escalation gate (operator action required); D.9/D.9a/D.9b/D.9c are ledger-only (server-side-owned). The engine-side resolver's arrival flips D.11 into the D.9-family without renumbering.
- **D.11 vs D.7 (`agent:error` / `failed:*`)**: A branch that fails to rebase might emit `agent:error` instead of `waiting-for:merge-conflicts` depending on engine behavior. D.7 handles `agent:error`; D.11 handles the labeled-gate case. The two are mutually exclusive at the label surface.

## Verification

Static grep (in [../quickstart.md § Static checks](../quickstart.md) § Static checks):
- `## D.11 — \`waiting-for:merge-conflicts\`` heading present in `auto.md`.
- The verbatim string `On non-zero exit: re-present the D.11 gate with the CLI stderr prepended verbatim to the presentation block` appears in D.11 dispatch step 3.
- The § Action + outcome vocabulary table contains the four D.11 outcomes exactly.

Behavioral (assertion 396-1 in `tests/playbook-verification.test.ts`):
- Feed `396-merge-conflicts-live-state.json` through the D.11 reference-dispatch handler.
- Assert the escalation gate is invoked (single `AskUserQuestion` call recorded) with options `I've resolved it — advance the gate` / `Skip (session-local mute)` / `Stop (exit auto)` in that order.
- Assert the presentation block contains the conflicted paths from the fixture.
