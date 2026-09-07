# Research: D.12 foreign-run / out-of-scope gate-answer no-op guard

## R1 — Guard placement: inside the no-record branch only

**Decision**: The guard fires only when `openGates[event.gateId]` is absent
(clarification Q1 = A). A matching record — current-run or adopted — always
processes through D.12 steps 2–6.

**Rationale**: The #471 adoption feature is built on answers for gates a
*prior* run opened processing normally: the Adoption pass (auto.md:309–329)
adds `openGates` entries carrying the originating row's `runId`, and D.12
steps 3/5 explicitly read `openGates[gateId].runId` because "for an adopted
entry they differ". A pre-lookup runId guard would no-op every adopted-gate
answer — a #471 regression.

**Alternative rejected**: guard before the lookup (Q1 option B) — intentional
adoption break, contradicts FR-006 and the spec's Out-of-Scope note.

## R2 — Shape-based runId segment detection

**Decision**: Detect the runId segment by testing the **trailing colon-free
segment** of the `gateKey` against the runId shape
(`<tracking-ref-slug>-<timestamp>`, colon-free by V1/FR-013); parse the issue
ref as the prefix before the **first** `:`. Never count segments positionally.

**Rationale**: `generation` may itself contain colons (`spec-review:<sha>`,
`sweep:needs-clarification:2` — auto.md:242), so "4th segment" is ambiguous.
The no-`:` invariant on `runId` (auto.md:242, V1/FR-013) guarantees the
trailing segment test is well-defined. Q2 answer mandates this explicitly.

**Legacy keys**: a `gateKey` with no runId-shaped trailing segment (opened
under `runIdEnabled === false`, e.g. the `invalid-args` graceful-degradation
branch on a pre-#1067 cluster) skips the runId comparison — only the in-scope
check applies; an in-scope legacy key with no record falls through to the
existing `superseded (no record)` ack (Q2 = A). Treating it as foreign (B)
would drop a run's *own* answers on a pre-#1067 cluster; treating it as mine
unconditionally (C) would keep acking out-of-scope historical records — the
production damage class.

## R3 — Two pinned ledger vocabularies, runId-mismatch first

**Decision** (Q3 = B): two verbatim outcome strings:

- `foreign-run delivery — not acked (owner run: <runId>)` — runId-mismatch
  trigger; matches the wording the driving model improvised in production
  (run `Painworth-doc-intel-93-20260902-204407`, 2026-09-02).
- `out-of-scope delivery — not acked (issue: <issue-ref>)` — in-scope-set miss.

RunId-mismatch is evaluated **before** out-of-scope (it carries the more
actionable owner-run pointer).

**Rationale**: US2 is about distinguishing drop reasons. The actual production
damage (issues #1, #5–#8) was the out-of-scope class; naming *this* run as
"owner run" for those events would be misleading, and under R2 there may be no
runId to name at all. Mirrors the playbook's practice of distinct UI-specific
outcome strings so grep recipes stay stable.

## R4 — No-op ledger row shape

**Decision** (Q4 = A): four-column row, deterministic from the payload alone:

```
<gateKey-issue-ref> · — · gate-answer · <outcome> · source: ui-gate
```

`—` fills the unknowable transition-class slot (no `openGates` record to read
`transitionClass`/`<original-action>` from); `gate-answer` names the dispatch
class; `source: ui-gate` per Ledger Rules 2 and 4 (every D.12 row carries
`ui-gate` regardless of transport).

**Alternatives rejected**: free-form line (violates Rule 2, leaves the FR-007
pin without a shape); "reuse existing no-record row shape" (not distinct — that
shape sources columns from the nonexistent record).

## R5 — One row per delivery, no dedup

**Decision** (Q5 = A): strict Invariant #8 — every replayed delivery of the
same foreign answer writes its own row. No session-local seen-set.

**Rationale**: "a dispatch without a ledger line is a protocol violation"
(auto.md:1697); the row costs no tool calls. A seen-set adds unpersisted loop
state and silently swallows events — the exact "quietly dropped vs lost"
ambiguity US2 eliminates. Volume is bounded on upgraded clusters by
generacy#1228 (PR #1231, merged: per-epic byte-position persistence + epic-ref
filtering); this guard is defence in depth for older doorbells.

## R6 — Pin-test pattern

**Decision**: New `519-*` tests in
`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` using the
existing helpers — `extractSubheadingBlock(autoMd, "D.12 — \`gate-answer\`")`
for the step-1 branch and vocabulary pins, whole-file / ledger-section reads
for the vocabulary-table and Rule-2 pins. Positive pins on the verbatim
strings; negative pin that the no-op branch region contains no
`cockpit_gate_ack`; order pin (foreign-run text appears before out-of-scope
text within step 1).

**Compatibility constraint (verified)**: existing pins that the step-1 edit
must not break —
- 469-23: no-record ack literal + runId-threading phrase — retained verbatim
  in branch (d).
- 471-16: region regex `/Look up record[^]*?superseded \(no record\) · source: ui-gate/`
  must still match and must not contain `openGates[event.gateId].runId` /
  `openGates[gateId].runId` — the inserted no-op prose avoids those tokens.
- 449-13/449-14: `### D.12 — \`gate-answer\`` heading and steps 2–6 untouched.

## Key sources

- `packages/claude-plugin-cockpit/commands/auto.md` — :242 (runId derivation,
  no-`:` invariant, composite gateKey), :309–329 (Adoption pass), :1079–1129
  (D.12), :1656–1671 (loop state, per-entry runId), :1685–1699 (ledger format +
  Invariant #8), :1730–1778 (vocabulary table), :1784–1808 (UI-mode Rules 1–4).
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` —
  helper at :1060, D.12 pins at :3039–3134, :4989–5051, :5653–5714.
- `specs/519-symptom-when-gate-answer/clarifications.md` — Q1–Q5 answers.
- Production incident: `Painworth/doc-intel` 2026-09-02, run
  `Painworth-doc-intel-93-20260902-204407` (three foreign gates wrongly
  superseded; guard improvised by the driving model).
- generacy#1228 / PR #1231 (merged) — source-side doorbell scoping fix.
