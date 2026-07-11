# Contract: Ledger-only rows are cheap by contract

**Applies to**: `packages/claude-plugin-cockpit/commands/auto.md` § Dispatch D.9 / D.9a / D.9b / D.9c / D.9d subheadings; § Invariants §8; `tests/playbook-verification.test.ts` assertions 403-1, 403-2, 403-6.

## Contract statement

**A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose.**

Concretely, when the parent loop receives a streamed event whose live transition class is one of the ledger-only rows:

1. Perform the mandatory ledger append (§ Ledger L.5 — one line to the transcript + one line to the `.ledger` file).
2. Continue the main loop.

**Explicitly forbidden on a ledger-only dispatch**:

- Any additional CLI verb — in particular, `generacy cockpit status --json <epic-ref>` (the standard live-state re-check). The re-check exists to make *actions* idempotent; a row whose only action is a ledger append has nothing to protect (a no-op action cannot produce a duplicate state).
- Any epic status table emission (see § Ledger L.4 — permitted surfaces exclude ledger-only dispatches).
- Any prose recap block (a "here's what just happened" narration on top of the ledger line).
- Any subagent dispatch.
- Any `AskUserQuestion` gate.

## Preserved (unchanged from the current playbook)

- The mandatory ledger line per dispatch (§ Ledger L.5 — "A dispatch without a ledger line is a protocol violation") applies to ledger-only rows exactly as before. The dispatch class is `(no-op)`; the outcome is `server-side-owned` (D.9 / D.9a / D.9b / D.9c) or `engine-owned phase transition` (D.9d).
- The live-state re-check (step 4a) remains mandatory for every actionable class (D.1–D.8, D.10, D.11) exactly as today. The re-check is what makes actionable dispatches idempotent under duplicate events; nothing about that changes.
- The never-content-filter invariant (§7, from #394) is preserved. The stream reader consumes every non-empty line unfiltered; only the dispatch classifier's routing table treats ledger-only rows as no-ops. The loop still *sees* every event — it just dispatches ledger-line-only.

## Prose shape

Every ledger-only row's subheading includes the exact substring `no status table, no prose recap` in its Dispatch paragraph. This is the grep-anchor for the 403-1 assertion — a rewrite that drops the substring from any single subheading fails the assertion.

The canonical form:

```markdown
**Dispatch**: **Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — server-side-owned.
```

D.9d uses the same shape with the suffix `engine-owned transient transition` (matching the D.9d ledger outcome vocabulary), because `phase:*` transitions are engine-owned transient states of the workflow-phase machinery rather than waits for a downstream artifact:

```markdown
**Dispatch**: **Ledger line only.** No CLI verb (in particular, no `generacy cockpit status --json` re-check), no subagent, no gate, no status table, no prose recap — engine-owned transient transition. Never surface a D.10 escalation gate on a `phase:*` token; D.10 remains the catch-all for genuinely unknown, non-`phase:` labels (per § Dispatch D.10's tightened trigger — an unrecognized `waiting-for:*` still fires D.10).
```

## Invariant §8

The contract is anchored at the § Invariants surface as a numbered invariant, verbatim:

> **Ledger-only rows are cheap by contract.** A transition that dispatches to a ledger-only row (D.9, D.9a, D.9b, D.9c, D.9d) must add no tool calls beyond the ledger append and no prose. Playbook edits that add per-event output — a `cockpit status --json` re-check, an epic status table, a prose recap — on a ledger-only row are efficiency regressions.

The 403-6 assertion greps for the opening substring `A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;`. A future rewrite that drops or paraphrases the line fails the assertion at build time. This is the S6/decay-countermeasures pattern applied at the invariants surface — the "numbered invariant survives rewrites" convention established by §1–§7.

## Rejected forms

- **Prose in the D.9 subheadings only, no invariants line.** The D.9-family prose is the site where the contract is applied; the invariants line is the site where the contract is remembered. Both are needed. A rewrite that touches D.9 without touching § Invariants would lose the prose; a rewrite that touches § Invariants without touching D.9 would lose the applied instance. Both surfaces make the countermeasure mechanical.
- **Renumbering existing invariants when adding §8.** §7 is anchored in the 394 tests as "unfiltered stream consumption"; renumbering breaks the anchor and rewrites the audit surface for no gain. Additive numbering is the correct countermeasure.
- **A single "ledger-only rows never do anything else" invariant added to the § Invariants list without the D.9 subheading prose.** The invariants list is a top-level rule surface; without the applied rule in the D.9 subheading, a maintainer editing D.9 has no local anchor. Both surfaces.

## Test coverage

- **403-1**: D.9, D.9a, D.9b, D.9c subheadings each contain `no status table, no prose recap`. Grep-based, exact substring match.
- **403-2**: New D.9d subheading contains the prefix-match sentence, the "Ledger line only" prose block, and the ledger-line format `engine-owned phase transition`. Grep-based.
- **403-6**: § Invariants section contains a §8 numbered item whose opening substring is `A transition that dispatches to a ledger-only row must add no tool calls beyond the ledger append and no prose;`. Grep-based.

## True verifier

Transcript grep on a comparable 12-issue epic run: for every event whose transition class matches a ledger-only row, exactly one tool call (the ledger append) and zero prose blocks appear in the parent transcript for that event. Adherence target: 100% of ledger-only dispatches meet the contract. This is SC-001 and SC-002.
