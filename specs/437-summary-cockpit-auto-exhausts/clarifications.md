# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-17

### Q1: Dispatch-class scope
**Context**: FR-002/FR-003 name the dispatch classes covered by the new enriched-line path: D.1 (clarification), D.2–D.4 (reviews), D.7 (error), D.9 (ledger-only), and D.5/D.6 (merge-gate). But `auto.md` defines additional classes that also fire from doorbell events — D.8 (`phase-complete` → phase-queue gate), D.9a–D.9d (ledger-only variants: `pr-feedback`, `children-complete`, `dependencies`, `phase:*`), D.10 (unrecognized/ambiguous → escalation gate), and D.11 (`merge-conflicts` → escalation gate). Whether these classes also drop the per-event `cockpit_status` re-check materially changes the change surface (D.8/D.11 both prompt human gates; a stale doorbell line could open a gate against superseded state) and the playbook-verification pin surface.
**Question**: Which additional dispatch classes should also be converted to enriched-line dispatch (no per-event `cockpit_status` re-check), and which must retain the current re-check?
**Options**:
- A: Convert D.9a–D.9d (ledger-only variants) to enriched-line dispatch alongside D.9; retain the re-check for D.8, D.10, D.11 because they open human gates and stale state would be operator-visible.
- B: Convert everything label-driven (D.9a–D.9d AND D.8 AND D.11) except D.10; D.10 by definition means the class is unknown, so it MUST re-query. D.5/D.6 already gated on `checks` verdict presence per FR-003.
- C: Only the classes explicitly named in FR-002/FR-003 (D.1, D.2–D.4, D.7, D.9, D.5/D.6) drop the re-check in this spec. Everything else — including D.8, D.9a–D.9d, D.10, D.11 — retains the current re-check. Follow-up spec if that surface also needs conversion.
- D: Something else (please specify).

**Answer**: A — convert the ledger-only variants (D.9a–D.9d) to enriched-line dispatch alongside D.9; retain the per-event re-check for D.8, D.10, D.11. Those three open human/consequential gates where a stale line could open a gate against superseded state, and they are all low-frequency (phase-complete once per phase; D.10/D.11 are error/escalation cases), so keeping them on the authoritative re-check costs almost nothing while removing the risk. The frequent classes (D.1–D.4, D.7, D.9, D.9a–d) carry essentially all the load, and they convert.

### Q2: Enriched-vs-bare detection heuristic
**Context**: FR-005 requires graceful degradation to today's re-query behaviour when the doorbell line is a bare event type (older engine or a content-less mode), but does not specify how the skill decides which path a given line takes. Candidate heuristics differ in strictness and failure mode: (a) try `JSON.parse` on the line — if it parses to an object, treat as enriched; if it parses to a bare string or throws, treat as bare; (b) additionally require the parsed object to carry `to` (and `labels`) fields — a partial payload (parses as JSON but missing `to`) is treated as bare and re-queries; (c) require `to`, `labels`, AND the class-specific fields (`checks` for D.5/D.6) — anything missing routes to re-query. Choice (c) is strictest and most predictable; (a) risks acting on a malformed enriched line; (b) is the middle ground.
**Question**: What detection rule should the skill use to decide "enriched (dispatch from line)" vs "bare (fall back to re-query)"?
**Options**:
- A: JSON-parse success only — if the line parses to an object, treat as enriched; otherwise bare. Simplest, but risks acting on a partial payload.
- B: JSON-parse + presence of `to` and `labels` — those two fields are the load-bearing dispatch inputs for label-driven classes. Missing either falls back to today's re-query.
- C: JSON-parse + full class-specific field check — `to`+`labels` for label-driven classes; additionally `checks` for D.5/D.6. Anything missing routes to fallback. Strictest; matches "one authoritative query only when it is absent" (FR-003) tightly.
- D: Something else (please specify).

**Answer**: B — enriched = JSON-parses to an object AND carries `to` and `labels` (the load-bearing dispatch inputs for label-driven classes). Missing either → treat as bare and re-query. Do not use C (additionally require `checks`): a legitimate label-change line has no `checks`, so C would wrongly route every label-driven line to full re-query. `checks` presence/absence is handled separately in the D.5/D.6 path per FR-003, not in the enriched-vs-bare gate.

### Q3: Step-4a "live is authoritative" contract
**Context**: `auto.md` step 4a currently says "The batch event is advisory; the live return is authoritative" — a hard invariant that guards against dispatching on stale state. FR-002 removes the per-event re-check for label-driven classes; that necessarily rewrites this invariant for those classes. Two coherent framings exist: (i) the doorbell line becomes the authoritative source for label-driven classes (the engine's local classification is trusted; step-4a is dropped entirely for those classes and the invariant is re-scoped to only apply to merge-gate classes on the fallback path); (ii) the invariant survives but "authoritative source" is redefined as "the enriched line when present; the live query when absent" (advisory-vs-authoritative wording is dropped in favor of a source-of-truth priority list). Both are implementable; framing (ii) is easier to explain in the narration and to pin in tests; framing (i) is more surgical and matches the code path more literally.
**Question**: Which framing should the updated step-4 narration adopt for the "authoritative source" contract on label-driven classes?
**Options**:
- A: Framing (i) — drop step 4a entirely for label-driven classes; the doorbell line's `to`/`labels` ARE the dispatch input, full stop. Retain step 4a only for merge-gate fallback and for D.10-style unrecognized states.
- B: Framing (ii) — keep step 4a as a "resolve authoritative state" step whose implementation is "prefer the enriched line; fall back to a single `cockpit_status` on absence." Wording unifies label-driven and merge-gate paths under one contract.
- C: Something else (please specify).

**Answer**: B — keep step 4a as a single "resolve authoritative state" contract whose implementation is "prefer the enriched line; fall back to one `cockpit_status` on absence." One unified source-of-truth priority covers both label-driven and merge-gate paths, is easier to narrate, easier to pin in playbook-verification, and folds the FR-005 graceful-degradation path in naturally.

### Q4: `checks: pending` handling for D.5/D.6
**Context**: The companion issue (generacy#985) specifies the baked verdict as `checks: green | red | pending`. FR-003 says "consult the line's `checks` verdict; only if absent, fall back to a single authoritative query." That handles missing/undefined but doesn't say what to do when the verdict IS present but the value is `pending`. Two coherent options: (a) treat `pending` as "verdict-not-yet-decided" and defer — do nothing this wake, wait for the next doorbell fire when checks resolve to green/red; (b) treat `pending` as "verdict-absent" and fall back to a single `cockpit_status`/`cockpit_merge` query to get the current truth. Option (a) minimizes queries but risks silently stalling if the follow-up event is lost; option (b) matches "only fall back on absence" if we define absence as "not decisive". This is the only fully-baked field with a "pending" state, so the semantics matter.
**Question**: How should the D.5/D.6 dispatch treat `checks: pending` on the doorbell line?
**Options**:
- A: Defer — write a ledger line (`checks-pending · deferred`) and do NOT dispatch this wake; rely on the next doorbell fire when checks resolve. Zero extra GraphQL cost; stall risk if a follow-up event is missed.
- B: Fall back — treat `pending` identically to "verdict absent": one authoritative `cockpit_status`/`cockpit_merge` query. Consistent with FR-003 wording; costs one extra query per `pending` event.
- C: Something else (please specify).

**Answer**: B — treat `checks: pending` like "verdict absent": one authoritative `cockpit_status`/`cockpit_merge` query. Defer (A) risks silently stalling the merge if the follow-up doorbell event is lost (smee is best-effort/lossy) — a real correctness hazard. Merge-gate dispatch is rare (≈once per issue), so the cost of B is negligible, and it is consistent with FR-003 ("fall back when not decisive").

### Q5: Ledger row source-of-truth for `to`/`labels`
**Context**: Today's ledger rows are written from the live-state re-check, so the row reflects what `cockpit_status` returned at dispatch time. Under this change, label-driven classes dispatch directly from the doorbell line's `to`/`labels` without a live-state read — so the ledger row's `to` field could reflect either (a) the doorbell line as-received (matches what the dispatch actually acted on; reproducible from the doorbell payload alone) or (b) a fresh live-state read used only to populate the ledger row (matches today's observability semantics; costs one query per event and defeats the purpose of the change) or (c) the doorbell line plus a synthetic marker indicating it was engine-classified (audit-friendly middle ground). This affects post-mortem debugging and how much the ledger diverges from GitHub's view of the world at dispatch time.
**Question**: What should the ledger row's `to`/`labels` reflect when a label-driven event is dispatched from the enriched line?
**Options**:
- A: Doorbell line as-received — the row reflects exactly what the skill dispatched on. No extra query; if it disagrees with GitHub reality, that's a signal about the engine's classification. Cheapest and most reproducible.
- B: Fresh live-state read for the ledger only — preserves today's observability semantics but costs one query per event and negates the SC-001 saving. Rejected in-context per FR-002 intent, listed for completeness.
- C: Doorbell line plus a marker column (e.g. `source: enriched-line`) so post-mortems can distinguish enriched-line rows from fallback re-query rows. No extra query.
- D: Something else (please specify).

**Answer**: C — write the ledger row from the doorbell line as-received, plus a `source: enriched-line` marker distinguishing enriched-line dispatch from fallback re-query rows. No extra query (rejects B), and the marker is exactly what post-mortems need to validate that engine classification matches GitHub reality while the new path beds in.

