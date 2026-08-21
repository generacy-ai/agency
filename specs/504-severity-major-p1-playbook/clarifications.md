# Clarifications

## Batch 1 — 2026-08-21

### Q1: D.5 guard on non-decisive labels
**Context**: FR-001 adds a `waiting-for:implementation-review`-absent guard so D.5 never merges past an unanswered G.8. But D.5's source of truth is the enriched doorbell line's `labels` field (E3/E4), which can be absent, bare, or malformed. The `checks` verdict already has a fallback re-query (`cockpit_status`) for the absent/pending case. The label guard needs the same decision.
**Question**: When the enriched line is NOT decisive about `waiting-for:implementation-review` (labels absent / bare / malformed line), should D.5 fail safe or proceed?
**Options**:
- A: Fail safe — do an authoritative `cockpit_status(json=true)` re-query for labels before merging; only merge if `waiting-for:implementation-review` is confirmed absent (mirrors the `checks` fallback; strongest safety guarantee).
- B: Proceed to merge on the decisive `completed:validate` + green when the line does not explicitly show `waiting-for:implementation-review` (treat absence-of-signal as absence-of-gate; current behavior, cheaper).

**Answer**: A — Fail safe. When the enriched line is not decisive about `waiting-for:implementation-review`, D.5 does an authoritative `cockpit_status(json=true)` re-query for labels before merging and only merges if `waiting-for:implementation-review` is confirmed absent (mirrors the `checks` fallback). Rationale: FR-001's whole point is that D.5 must never merge past an unanswered G.8, so absence-of-signal cannot be treated as absence-of-gate; D.5 already establishes this fail-safe idiom for its `checks` verdict.

### Q2: Deferral ledger outcome + passive vs active
**Context**: FR-002 requires the deferral to be observable in the ledger. The D.5 ledger line (`auto.md:826`) has a fixed outcome enum. We need (a) the exact new outcome token and (b) whether the deferred `completed:validate` event is a pure no-op that lets a separate `waiting-for:implementation-review` event drive D.3/G.8, or whether D.5 must actively present the gate.
**Question**: What is the deferral's ledger outcome token, and is deferral passive (no-op; D.3 independently presents G.8) or active (D.5 routes into G.8 now)?
**Options**:
- A: Passive no-op — outcome token e.g. `deferred: implementation-review pending`; write the ledger row and drop the event; the co-present `waiting-for:implementation-review` transition is its own D.3 trigger that presents G.8; G.8 `approve` performs the merge (auto.md:1494).
- B: Active — D.5 itself invokes the G.8 presentation path on detecting co-presence, rather than relying on a separate D.3 event.

**Answer**: A — Passive no-op. Outcome token `deferred: implementation-review pending`; write the ledger row and drop the event; the co-present `waiting-for:implementation-review` transition is its own D.3 trigger that presents G.8, and G.8 `approve` performs the merge (auto.md:1494). Rationale: D.5 is explicitly a no-gate row (`cockpit_gate_open` is never called), so it cannot itself invoke G.8; the co-present label is D.3's trigger.

### Q3: Findings fetch mechanism + gate-mode applicability
**Context**: FR-003 pins retrieval as "the latest linked-issue comment whose body starts with `## Remediation limit reached`." The playbook must name a concrete fetch. It currently uses both `gh` CLI (e.g. `gh issue close`) and `cockpit_*` verbs. Under UI gate mode there is also a wire gate record, distinct from the engine's plain issue comment.
**Question**: Which retrieval does D.13 / G.9 prescribe, and does it apply identically in local and UI gate modes?
**Options**:
- A: Client-side `gh issue view <issue-ref> --json comments` (fetch the issue's comments, select the latest whose body starts with the heading); identical in both local and UI modes since the source is the engine's issue comment, not the gate record.
- B: A `cockpit_*` MCP verb (specify which) that returns the gate/issue body; behavior may differ by gate mode.

**Answer**: A — Client-side `gh issue view <issue-ref> --json comments`; select the latest comment whose body starts with the heading. Identical in both local and UI modes since the source is the engine's issue comment, not the gate record. Rationale: `cockpit_gate_status` returns only `{gateId, status}` with no findings, so the gate record cannot be the source in UI mode; findings come from the engine-authored issue comment.

### Q4: Heading match strictness and multiple comments
**Context**: FR-004 documents the `- <file>:<line> — <title>` bullet contract and an empty/`(none)` fallback. Across resume cycles the engine may write the `## Remediation limit reached` comment more than once, and the heading is written best-effort.
**Question**: How is the matching comment selected and how strict is the heading anchor?
**Options**:
- A: Select the single most-recent comment (by `createdAt`) whose body `startsWith` the exact, case-sensitive string `## Remediation limit reached`; if none match, render the explicit `(none)` fallback.
- B: A looser rule (case-insensitive / `contains` / first-match) — specify the exact predicate.

**Answer**: A — Select the single most-recent comment (by `createdAt`) whose body `startsWith` the exact, case-sensitive string `## Remediation limit reached`; if none match, render the explicit `(none)` fallback. Rationale: FR-003 pins retrieval to "the latest linked-issue comment whose body starts with" the heading — latest = most-recent by `createdAt`, starts with = exact `startsWith`; the `(none)` fallback byte-mirrors G.8/G.9's `| (none) | | | |` row.

### Q5: G.8 findings source on legacy vs post-validate
**Context**: FR-005 removes the G.8 prose claim that the engine "wrote its remaining findings into the gate body," because the post-validate on-ci-green branch posts no comment (engine `phase-loop.ts:1435-1453`); the `(none)` fallback covers it. G.8 also fires on the legacy (pre-relocation / flag-off) engine model.
**Question**: On the legacy G.8 path, is there any findings artifact to render, or does G.8 render `(none)` in all cases now?
**Options**:
- A: G.8 renders `(none)` in all cases — no findings artifact exists on either the post-validate or legacy path; the table keeps its single `| (none) | | | |` row unconditionally.
- B: The legacy path DOES have a findings source (specify where) that G.8 must still render; only the post-validate path is `(none)`.

**Answer**: A — G.8 renders `(none)` in all cases; no findings artifact exists on either the post-validate or legacy path, and the table keeps its single `| (none) | | | |` row unconditionally. Rationale: G.8 is a post-validate final-approval gate with no cluster-side analysis and no subagent, and `cockpit_gate_status` carries no findings; #504 defines a comment-fetch only for the remediation-limit gate (G.9), not G.8, and FR-005 removes the gate-body claim without substituting a source.
