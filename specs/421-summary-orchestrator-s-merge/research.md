# Research: `blocked:stuck-merge-conflicts` → D.11 routing

## Decision 1: Extend D.11 rather than create a new dispatch row (e.g. D.11a / D.12)

**Decision**: The two labels (`waiting-for:merge-conflicts`, `blocked:stuck-merge-conflicts`) route to the *same* D.11 row.

**Rationale**: The clarifications record (Q1) that the labels co-occur by construction — the engine applies `blocked:*` while leaving `waiting-for:*` in place. They describe one incident from two angles, not two incidents. A second dispatch row would duplicate the gate, the subagent prompt, and the ledger schema, and would require its own dedup rule against the sibling row. One row with an OR-shaped Trigger is the minimal edit that preserves the existing gate contract (G.4d).

**Alternatives considered**:
- **New D.12 row for `blocked:*`**: rejected — duplicates D.11's presentation/options/advance flow. Also fights Q4's answer that `blocked:*` is a recognized token *family*, not a per-label discipline.
- **Route `blocked:stuck-merge-conflicts` to D.10**: rejected — D.10's option set (Skip / Stop) has no way to advance the merge-conflicts gate, which is the operator's actual resolution surface. This is exactly the current failure mode the fix is repairing.

## Decision 2: Dedup key is issue-ref, not `(issue-ref, label)`

**Decision**: Once D.11 dispatches for an issue-ref, subsequent merge-conflict-family events for the *same ref* are ledger-only `already-dispatched`.

**Rationale**: Q1 answer A. The labels are one incident; asking the operator the same question twice is pure gate fatigue. Keying by `(issue-ref, label)` (option C) would still surface a second gate for the sibling label, which is what we're trying to prevent.

**Alternatives considered**:
- **No dedup (Q1 option B)**: rejected — operator manually skips redundant gates, exactly the fatigue we're removing.
- **Per-label dedup (Q1 option C)**: rejected — sees one `waiting-for:*` gate + one `blocked:*` gate per incident, still redundant.
- **Deferred to follow-up (Q1 option D)**: rejected — leaves the fix behavior-incomplete once the classifier ships.

**Dedup lifecycle**: The dispatched-issues set is in-memory for the auto run. Entries are cleared **on successful `cockpit_advance(gate="merge-conflicts")`** (so a genuinely new future conflict on the same issue re-gates). `Skip` does NOT clear the entry (session-local mute semantics extend naturally). `Stop` ends the session, which drops the set entirely.

## Decision 3: Fixed-shape labeled field over opening-line mutation

**Decision**: The `blocked:*` case adds a new labeled row `**Auto-remedy status:** failed (engine escalated via blocked:stuck-merge-conflicts)` above `**Root cause:**` in the presentation block. The opening line (`Merge conflicts on <issue-ref>:`) is unchanged.

**Rationale**: Q2 answer B. The G.4d presentation follows the codebase's fixed-shape labeled-field convention (five elements, `**Label:**` rows). Mutating the opening line (option A), appending trailing prose (option C), or prepending a bold callout outside the field block (option D) all break the convention that machine parsers and operator eyes rely on. A new labeled row extends the shape without breaking it.

**Alternatives considered**: Q2 options A/C/D — all rejected as documented.

## Decision 4: Pass source label to subagent; do not extend return schema

**Decision**: The D.11 diagnosis subagent's prompt payload gains the source label verbatim. The return schema remains `{root_cause, evidence, recommended_action, confidence}`.

**Rationale**: Q3 answer A. The subagent can use "engine auto-remedy already failed" as ruled-out reasoning ("don't recommend the trivial rebase — the engine already tried"). But the parent already knows the label (it does the source-label conditional rendering per Decision 3), so adding a `remedy_context` return field (Q3 option C) duplicates state the parent owns. Prompt-only is the minimal-diff, largest-signal edit.

**Alternatives considered**:
- **No prompt change (Q3 option B)**: rejected — passes up an obvious diagnostic signal, risks the subagent recommending remediation the engine already attempted.
- **Extend return schema (Q3 option C)**: rejected — duplicates parent-owned state, forces every future subagent-caller to handle the new field.

## Decision 5: Broaden D.10 case (d) prose to `waiting-for:* | blocked:*`

**Decision**: D.10's case (d) reads: "any state token (`waiting-for:*` or `blocked:*`) that does not match a Trigger in D.1–D.11 fires D.10."

**Rationale**: Q4 answer C. The snappoll fall-through wasn't just a missing D.11 row — `blocked:*` tokens had no defined place in D.10's routing prose at all. `blocked:stuck-validate-fix` (already slated in generacy#943 to become an error-tier label) would repeat the same fall-through under option A/B. Broadening case (d) fixes the token *class*, not the token *instance*, and documents `blocked:*` as a first-class recognized state family.

**Alternatives considered**:
- **A (D.11 edit alone)**: rejected — leaves the next `blocked:*` label to re-hit the same bug.
- **B (add belt-and-suspenders explicit-exclusion sentence)**: rejected — clutters D.10 with a fact D.11 already carries; doesn't help future `blocked:*` labels.

## Pattern references

- **Fixed-shape labeled-field convention**: existing precedent at `auto.md:665–677` (D.7 repeat-dispatch presentation, which added a sixth labeled row between Evidence and Current state without disturbing surrounding rows). Same shape, same rationale.
- **Session-local mute set (dedup analogue)**: existing precedent at `auto.md:266`, `auto.md:305`, `auto.md:391`, `auto.md:407`, `auto.md:749`. The `dispatched-issues set` follows the same in-memory-per-run lifecycle discipline.
- **Subagent prompt payload extensions**: existing precedent at `auto.md:293–299` (D.7 subagent gets `failure_class_changed` context on repeat dispatches). Adding a source-label field to D.11's payload follows the same pattern.
- **D.10 tightened trigger phrasing**: existing precedent at `auto.md:371, 400–402` — the phrase "unrecognized `waiting-for:*` still fires D.10" and the "Any `waiting-for:*` label without a matching dispatch row IS an unrecognized state" paragraph will parallel-update to include `blocked:*`.

## Sources

- `packages/claude-plugin-cockpit/commands/auto.md` — current dispatch table, D.10/D.11 sections, G.4d gate contract.
- `specs/421-summary-orchestrator-s-merge/spec.md` — evidence from snappoll#3, #13, +1.
- `specs/421-summary-orchestrator-s-merge/clarifications.md` — batch 1, four resolved questions (2026-07-15).
- Companion issue on the `@generacy-ai/cockpit` repo (referenced in spec) — classifier `blocked:*` tier is a shipping prerequisite for the new D.11 branch to fire in production.
