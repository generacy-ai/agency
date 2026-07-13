# Contract: D.10 tightened trigger (close the "known but not actionable" bypass)

Structural contract for the D.10 trigger-prose edit in `packages/claude-plugin-cockpit/commands/auto.md`. The tightening is the load-bearing safety net — a bug here reproduces the T-S5 stall regardless of the D.11 row's correctness or the drift audit's presence.

## The bug it closes

Observed on the T-S5 run (spec § Observed):

> "workers resolving base-sync conflicts … worker-owned transient state, **not** one of the D.1–D.9 actionable dispatch classes, so no dispatch and no ledger line … Continuing to wait."

The parent's classification invented a third bucket ("known but not actionable") that the playbook does not define. D.10's pre-tightening trigger read as *"an unrecognized state class"* — the classifier decided the state was recognized (as `waiting-for:merge-conflicts`) but not actionable, so D.10 didn't fire. Silent stall.

## The tightened rule (verbatim)

The trigger prose of D.10 becomes (bold clauses = load-bearing anchors):

> **Trigger**: The re-check step reads a live state whose transition class is not one of D.1–D.9 (including D.9a/b/c) or D.11. This can happen when: (a) S8 adds a new transition class the playbook doesn't know, (b) the streamed event conflicts with the live state and neither is dispatchable, (c) `cockpit status --json` returns an unexpected shape, **(d) the live state is a `waiting-for:*` label that does not match a Trigger in any § Dispatch row (D.1–D.9c or D.11)**.
>
> **Any `waiting-for:*` label without a matching dispatch row IS an unrecognized state.** "Known but not actionable" is not a permissible classification outcome — the § Dispatch table is the exhaustive list of `waiting-for:*` states the loop may treat as no-ops (via the named ledger-only rows D.9, D.9a, D.9b, D.9c). "Wait for someone else to handle it" is never a permissible dispatch outcome for a `waiting-for:*` state unless the table explicitly names it ledger-only. If the table does not name it, D.10 fires — verbatim state in the presentation block.

## Contract invariants

- **D10-C.1**: The verbatim string `Any \`waiting-for:*\` label without a matching dispatch row IS an unrecognized state.` appears in D.10's trigger prose. (Greppable anchor — the primary drift signal.)
- **D10-C.2**: The verbatim string `"Known but not actionable" is not a permissible classification outcome` appears in D.10's trigger prose. (Names the exact anti-pattern the T-S5 run exhibited.)
- **D10-C.3**: The verbatim string `"Wait for someone else to handle it" is never a permissible dispatch outcome for a \`waiting-for:*\` state unless the table explicitly names it ledger-only.` appears. (Names the specific classification move that routed around D.10.)
- **D10-C.4**: The trigger case list is enumerated (a)–(d) with case (d) being the `waiting-for:*`-no-row case (not a general fallback).
- **D10-C.5**: The trigger prose enumerates `D.1–D.9 (including D.9a/b/c) or D.11` as the exhaustive set of dispatchable transition classes (name-checks the new rows so a future add-a-row edit that forgets to update D.10's list is visibly inconsistent).

## Why this is load-bearing, not the audit

Two orthogonal drift risks exist:

**Risk 1 — Vocabulary drift** (engine ships a new label; operator hasn't updated `lib/gate-vocabulary.ts` or `auto.md`):
- Audit at build time: still passes (the new label isn't in the vocabulary, so the audit doesn't check it).
- Runtime: D.10 fires because the label doesn't match a Trigger in any dispatch row.
- **The tightened D.10 catches this at runtime.** No silent stall.

**Risk 2 — Classification drift** (playbook prose changes; classifier decides a known-but-unhandled `waiting-for:*` is "known and can be ignored"):
- Audit at build time: passes (all vocabulary tokens map to rows).
- Runtime: without the tightened trigger, the classifier might invent a third bucket again (this is what happened on T-S5 — the label WAS recognized, but no row matched, and the classifier ignored it).
- **The tightened D.10 catches this by explicitly forbidding the "known but not actionable" classification** — the load-bearing anchor phrases (D10-C.1, D10-C.2, D10-C.3) are prose the classifier reads as instruction, not vocabulary lookup.

The audit is completeness hygiene against Risk 1; the tightened trigger is the classification-level defense against Risk 2. The T-S5 run was a Risk 2 instance (the label WAS in the engine vocabulary; the classifier just didn't route it to D.10). So the tightened trigger, not the audit, is the load-bearing surface.

## Presentation on D.10 fire

Unchanged from the pre-tightening presentation shape (see G.4 (c) contract in the parent § Gate contract):

```markdown
Unrecognized state on <issue-ref>:

Observed: <raw state from cockpit status --json>

Streamed event: <original transition line>
```

The `Observed` field carries the `waiting-for:*` token verbatim when the D.10 fire is caused by case (d) — so the operator can see the specific label that lacks a dispatch row. This is the entire operator debugging surface for a Risk 2 event.

## Verification

Static grep (in [../quickstart.md § Static checks](../quickstart.md) § Static checks):
- The three verbatim anchor phrases (D10-C.1, D10-C.2, D10-C.3) each appear exactly once in `auto.md`, all inside D.10's `**Trigger**` prose block.
- The trigger case list (a)–(d) is enumerated with case (d) being the `waiting-for:*`-no-row case.

Behavioral (assertion 396-2 in `tests/playbook-verification.test.ts`):
- Feed `396-someday-gate-live-state.json` (contains `waiting-for:someday-gate` — a token in neither the vocabulary nor the dispatch table) through the D.10 reference-dispatch handler.
- Assert the D.10 unrecognized-state gate fires (`AskUserQuestion` call recorded with `Skip (Recommended)` / `Stop` options).
- Assert the presentation block contains `Observed: waiting-for:someday-gate` verbatim.
- Assert no ledger line is written with `(no-op)` or `server-side-owned` for the fixture's `waiting-for:someday-gate` token. (Regression check that the classifier didn't invent a third bucket.)
