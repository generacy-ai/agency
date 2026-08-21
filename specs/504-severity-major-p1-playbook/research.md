# Research: D.5 merge-past-G.8 guard + remediation-limit findings-fetch contract

All decisions below are pinned by the clarifications batch (Q1–Q5) and grounded in the
engine source at generacy `develop` `155b3464` and the client playbook at agency
`develop` `1455ce5`.

## R1 — D.5 fail-safe on non-decisive labels (Q1 → A)

**Decision**: When the enriched doorbell line is not decisive about
`waiting-for:implementation-review` (labels absent / bare / malformed), D.5 does an
authoritative `cockpit_status(issue=<issue-ref>, json=true)` re-query for labels and
only merges if `waiting-for:implementation-review` is confirmed absent.

**Rationale**: FR-001's whole point is that D.5 must never merge past an unanswered
G.8, so absence-of-signal cannot be treated as absence-of-gate. D.5 already establishes
this fail-safe idiom for its `checks` verdict (`auto.md:820`: `checks` absent | pending
→ authoritative `cockpit_status(json=true)`), so the label guard reuses the same idiom
and the same re-query. Prefer folding the label check into the existing fallback
`cockpit_status` call rather than adding a second network round-trip.

**Alternative rejected (Q1 B)**: proceed to merge on decisive `completed:validate` +
green when the line does not explicitly show the label (treat absence-of-signal as
absence-of-gate). Cheaper, but re-introduces exactly the merge-past-G.8 race the feature
exists to close.

## R2 — Deferral is a passive no-op ledger row (Q2 → A)

**Decision**: Outcome token `deferred: implementation-review pending`. On co-presence,
D.5 writes the ledger row and drops the event. It does NOT call `cockpit_gate_open` and
does NOT invoke the G.8 presentation path. The co-present `waiting-for:implementation-review`
transition is its own D.3 trigger that presents G.8; G.8 `approve` performs the merge
(`auto.md:1494`).

**Rationale**: D.5 is explicitly a no-gate row (`cockpit_gate_open` is never called on
this dispatch path), so it structurally cannot present G.8. The co-present label is
D.3's trigger by construction, so passive deferral is sufficient and correct — an active
hand-off would duplicate D.3's responsibility and risk double-presentation.

**Alternative rejected (Q2 B)**: D.5 actively invokes the G.8 presentation path on
detecting co-presence. Violates the no-gate-row invariant and duplicates D.3.

## R3 — Findings retrieval is a client-side `gh issue view` comment fetch (Q3 → A)

**Decision**: D.13 / G.9 fetch findings with `gh issue view <issue-ref> --json comments`
and select from the returned comments. Identical in local and UI gate modes.

**Rationale**: The engine writes the findings as a **plain issue comment** headed
`## Remediation limit reached` (`phase-loop.ts:1411-1421`), NOT into any gate record.
`cockpit_gate_status` returns only `{gateId, status}` — it carries no findings — so the
gate record cannot be the source even in UI mode. The single source of truth is the
engine-authored issue comment, so one retrieval path serves both modes. The playbook
already uses `gh` for issue operations (e.g. `gh issue close`), so this introduces no
new tool surface.

**Alternative rejected (Q3 B)**: a `cockpit_*` MCP verb returning the gate/issue body.
No such verb carries findings; `cockpit_gate_status` is `{gateId, status}` only.

## R4 — Heading match is exact `startsWith`, most-recent by `createdAt` (Q4 → A)

**Decision**: Select the single most-recent comment (by `createdAt`) whose body
`startsWith` the exact, case-sensitive string `## Remediation limit reached`. If none
match, render the explicit `(none)` fallback. Bullet format contract:
`- <file>:<line> — <title>` per finding (em-dash separator).

**Rationale**: FR-003 pins retrieval to "the latest linked-issue comment whose body
starts with" the heading — latest = most-recent by `createdAt`; starts with = exact
`startsWith`. The engine may write the comment more than once across resume cycles, so
"most-recent" disambiguates deterministically. The heading is written best-effort but is
a fixed literal, so an exact case-sensitive `startsWith` is the tightest predicate that
still matches. The `(none)` fallback byte-mirrors the existing G.8/G.9 `| (none) | | | |`
row shape.

**Alternative rejected (Q4 B)**: looser rule (case-insensitive / `contains` /
first-match). Under-specified and non-deterministic across multi-write resume cycles.

## R5 — G.8 renders `(none)` in all cases (Q5 → A)

**Decision**: G.8 renders `(none)` unconditionally on both the post-validate and legacy
paths; the presentation table keeps its single `| (none) | | | |` row. The prose stops
claiming the engine "wrote its remaining findings into the gate body".

**Rationale**: The post-validate on-ci-green branch posts NO findings comment
(`phase-loop.ts:1435-1453`). G.8 is a post-validate final-approval gate with no
cluster-side analysis and no subagent; `cockpit_gate_status` carries no findings; and
#504 defines a comment-fetch only for the remediation-limit gate (G.9), not G.8. FR-005
removes the gate-body claim without substituting a source, so `(none)` is the only
correct rendering on either path.

**Alternative rejected (Q5 B)**: the legacy path has a findings source G.8 must render.
No such artifact exists on either path.

## R6 — Drift-audit re-pin obligation (CLAUDE.md)

**Decision**: Every `playbook-verification.test.ts` pin broken by these edits is re-pinned
to the new contract in the same change; new positive/negative pins are added for the D.5
guard, the `deferred: implementation-review pending` token, and the findings-fetch
predicate. No assertion is weakened or deleted.

**Rationale**: CLAUDE.md § "Cockpit playbook pins" makes the pins a deliberate drift
audit, not a smoke test. Weakening a pin destroys its value; the correct response to a
broken pin is always to re-pin to the new contract. FR-009 encodes this.

**Known pin interactions**:
- **500-6** asserts G.8 "parsed from the **gate body**" and "spawns no reviewer" — the
  gate-body phrasing must be replaced with the `(none)`-unconditional wording.
- **500-5** asserts D.13/G.9 "parsed from the **gate body**" and "no subagent is
  spawned" — replace the gate-body phrasing with the comment-fetch contract; keep the
  no-subagent pin.
- **437-5** asserts D.5/D.6 name `absent` AND `pending` (positive) and do NOT match
  `/defer\s+(this\s+wake|on\s+pending)/i` (negative). Preserve both; the new guard's
  `deferred: implementation-review pending` token does not trip the negative regex, and
  the new label guard must keep the `checks`-verdict `absent`/`pending` wording intact.
- **500-7** pins the UI-mode G.8 mapping row; if G.8's approve-outcome prose changes,
  re-pin the row text.

## Key sources

- Engine on-ci-green pause / co-present labels: `phase-loop.ts:1513-1531`.
- Engine remediation-limit comment shape: `phase-loop.ts:1411-1421`.
- Engine on-ci-green branch posts no findings comment: `phase-loop.ts:1435-1453`.
- Client D.5 dispatch + ledger enum: `auto.md:813-831`.
- Client D.13 / G.9: `auto.md:1035-1054`, `:1502-1518`.
- Client G.8: `auto.md:1476-1500`.
- `cockpit.auto.agents` role selectors: `auto.md:262`.
- Escalation-gateType docstring: `gate-status-check.ts:159-179`.
- Drift-audit rule: CLAUDE.md § "Cockpit playbook pins".
