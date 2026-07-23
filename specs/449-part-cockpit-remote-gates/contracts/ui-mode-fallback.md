# Contract: UI-mode call-time fallback

Extends `packages/claude-plugin-cockpit/commands/auto.md` § UI-mode gate mapping with the per-gate fallback rule. Load-bearing for spec US4, FR-011 and the spec § Scope bullet "cockpit_gate_open error → local AskUserQuestion for that gate".

## Scope

**Covers**: `cockpit_gate_open` call-time errors — the tool returns `{ ok: false, error: <string>, retryable: <bool> }`, times out, or throws a MCP transport error.

**Does NOT cover**: pre-flight absence of `cockpit_gate_open` from the tool binding — that path is handled by `contracts/gates-flag-parse.md § Pre-flight absence` (Q3=A hard-fail). Distinct semantics.

## Rule

On any `cockpit_gate_open` failure at gate-initiation time:

1. **Do NOT retry the call.** The plugin does not manage retry/backoff for gate-open; retry logic (if any) is owned by the cluster surface. Per-gate fallback is the plugin's response.
2. **Fall through to local `AskUserQuestion`** for that gate ONLY. Use the same drafted body / options / free-text affordance that WOULD have been sent to `cockpit_gate_open`. The AskUserQuestion invocation contract rules (auto.md § AskUserQuestion invocation contract, Rules 1–3) apply verbatim.
3. **On the operator's answer**, run the same downstream handler as if it had come via D.12 — the mapping table's `on <optionId>` action fires, ledger row is written.
4. **Ledger provenance for the fallback**: write the ledger row using the pre-change vocabulary (matching today's local flow) with the suffix `· source: ui-gate-fallback` in the outcome slot (NOT `ui-gate` — that's reserved for actually-remote resolutions). This distinguishes fallback resolutions from clean UI resolutions in post-mortem grep. Example: `<ref> · waiting-for:clarification · clarification-batch · advanced · source: ui-gate-fallback`.
5. **First-failure ledger note** (spec § Scope: "repeated failures noted once, loop continues"): the FIRST `cockpit_gate_open` failure in a run also writes a one-time note BEFORE the fallback resolution row:
   ```
   <first-failing-ref> · <transition-class> · gate-open · error: <error-string> — falling back to local AskUserQuestion for this gate (repeated failures suppressed) · source: ui-gate
   ```
   Subsequent failures within the same run are silent (no per-failure ledger row) — only the resolution rows carry the `· source: ui-gate-fallback` suffix. This balances observability with ledger cost.

## Fallback state tracking

In-memory flag `firstGateOpenFailureNoted: boolean` (default `false`), added to § In-memory loop state. Flipped to `true` on the first `cockpit_gate_open` failure; the first-failure ledger note fires only when the flag is being flipped from `false` to `true`.

The flag does NOT reset across the run — a run that recovers gate-open partway through (subsequent calls succeed) still shows only the one initial failure note. This is intentional; the failure pattern is what matters, not a running count.

## Interaction with the mapping table

Every row in `contracts/ui-gate-mapping.md` has a "fallback path" convention: the local `AskUserQuestion` call that would fire on `cockpit_gate_open` failure uses the SAME body, options, and (where applicable) free-text prompt as the remote gate. This is achieved by drafting the presentation block ONCE (per-gate), then either handing it to `cockpit_gate_open` (UI mode success) or to `AskUserQuestion` (fallback). The mapping-table rows don't need a separate "fallback body" column because the body is identical.

For G.7 `Add more work` under fallback: the local flow's TWO-turn pattern (select option → prose prompt → operator prose reply → intent recognizer) applies. UI mode's Q4=A one-turn collapse is a wire-schema feature (Answer.freeText); it does not survive fallback to `AskUserQuestion`. This is acceptable — the fallback path IS the pre-change local flow.

## Interaction with revised drafts (Make-changes)

Revised drafts (G.1 / G.2 / G.6 `make-changes` path) MAY encounter a fresh `cockpit_gate_open` failure at re-open time. The same per-gate fallback rule applies: the AskUserQuestion for the revised draft fires locally, downstream handling proceeds as if the operator's edit had gone through the remote surface. The revised generation still increments (`generation += 1`) so any late-arriving answer to the prior generation (from before the failure) is still recognized as `superseded`.

## Test pins (playbook-verification)

The 449-* describe block adds:
- `assert § UI-mode gate mapping contains a "Fallback semantics" subsection`
- `assert the subsection names the "· source: ui-gate-fallback" ledger suffix (distinct from "· source: ui-gate")`
- `assert the subsection contains the verbatim first-failure ledger note format`
- `assert the subsection distinguishes call-time error (per-gate fallback) from pre-flight absence (Q3=A hard-fail)`
