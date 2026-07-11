# Clarifications: Found during the cockpit v1

**Issue**: [#402](https://github.com/generacy-ai/agency/issues/402)
**Branch**: `402-found-during-cockpit-v1`

## Batch 1 — 2026-07-11

### Q1: Playbook scope
**Context**: The Fix section names `auto.md D.1/G.1` as definite, and `clarify.md` conditionally ("if it fuses multi-issue batches"). `clarify.md` in fact handles one issue's batch per invocation and does not fuse across issues, so it appears out of scope. Other gates in `auto.md` (G.2 review verdict, G.3 validation, G.4 escalation, G.5 phase-queue) each fire a single `AskUserQuestion` per gate but multiple such gates can co-occur in one assistant response during the auto loop.
**Question**: Which playbook sections need the ≤4-questions-per-`AskUserQuestion`-call bound stated explicitly?
**Options**:
- A: Only auto.md D.1/G.1 (the site where the incident occurred)
- B: auto.md D.1/G.1 plus a single top-level "Gate invocation contract" section that applies to G.1–G.5
- C: Every fused-gate contract in auto.md (D.1/G.1, G.2, G.3, G.4a–d, G.5) individually, plus clarify.md
- D: Every command playbook that mentions `AskUserQuestion` (auto.md + clarify.md + review.md + merge.md + queue.md + status.md + watch.md)

**Answer**: B — auto.md D.1/G.1 plus one top-level "Gate invocation contract" section covering G.1–G.5. The failure mode is multi-*gate* co-occurrence, and the run proves it isn't clarify-specific — five verdict gates co-fired at 00:59 in the same run. So the bound is a property of gate invocation in general, stated once; C's per-section repetition is five copies that drift independently, and D drags in playbooks whose single-question gates make the bound vacuous. clarify.md handles one issue per invocation and is out of scope, as the question's context establishes.

### Q2: "S6 pattern" reference
**Context**: The Fix section says "Add the constraint to the playbook-verification suite (S6 pattern)". `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` currently groups tests by issue number (394-1, 396-1, 398-1, 400-1). No "S6" identifier appears in the codebase.
**Question**: What does "S6 pattern" refer to, and how should the new test be named/structured?
**Options**:
- A: S6 is a shorthand for the 398-1 style **static drift audit** (scan playbook prose + assert on parsed structure); name the new test `402-1: ...` in a `describe("402 — ...")` block, paired with a negative fixture (like `398-drift-auto.md`) plus a positive check on current auto.md
- B: S6 refers to an external scenario numbering scheme; add a `402-1: ...` test and don't try to encode "S6" in the codebase
- C: S6 names a new sixth test category the operator wants to introduce; create a top-level `describe("S6 — playbook AskUserQuestion contract audit", ...)` block distinct from the issue-numbered ones
- D: Ignore "S6" as prose shorthand; just implement the audit as a `402-1: ...` scan test alongside the existing 398-1 drift audit

**Answer**: A. "S6" is shorthand from the tetrad-development cockpit plan's work breakdown for the static playbook-verification audit pattern — the thing `398-1` instantiates; it is not a code identifier and should not become one (C mints a category name with no referent). Implement as `402-1` in an issue-numbered describe block, negative drift fixture plus positive check on current auto.md, per house convention.

### Q3: Multi-gate-fusion detection heuristic
**Context**: The regression test must "scan command playbooks for `AskUserQuestion` contracts and assert they state the ≤4-questions-per-call bound wherever multi-gate fusion is described". Fusion language in `auto.md` varies: "in the same response", "in the same assistant response", "fused verdict gate", "fused batch gate", "multiple gates … in one response", or the D.1–D.9 startup-sweep dispatch. What signals should be treated as fusion (and thus require the ≤4 clause), vs. single-gate contexts (which need not)?
**Question**: What detection heuristic should the audit use to identify sections where the ≤4-questions-per-call bound must appear?
**Options**:
- A: Any section header (G.1–G.5, D.1–D.11) that describes an `AskUserQuestion` call — bound must appear per-section
- B: Only sections whose prose contains multi-gate-fusion phrases (regex: `same (assistant )?response`, `fused`, `multiple .* gates?`, `simultaneously`, or a startup-sweep dispatch loop reference) — bound required there, not in single-gate G.2–G.5
- C: A single top-level "AskUserQuestion invocation contract" section is the required home for the bound; the audit checks that this section exists and is referenced from each gate contract
- D: Explicit annotation: mark fused sections with an HTML comment like `<!-- fusion:multi-issue -->` and audit for the bound within any annotated section

**Answer**: C — the audit asserts the top-level contract section exists, contains the ≤4 bound, and is referenced from each gate contract. Structural assertion over prose-sniffing: B's fusion-phrase regex is the same content-sniffing shape that just failed in generacy#909 (dialect-pinned detection false-negating on unanticipated wording), and A/D re-create per-section duplication or annotation surfaces that drift. C also composes with Q1-B — the audit checks the exact architecture the fix creates.

### Q4: Contract wording reconciliation
**Context**: The Fix section proposes wording that mixes two constraints: **"one `AskUserQuestion` call per issue's clarification batch (one question per call), multiple calls in the same response when several issues gate simultaneously; a single call must never carry more than 4 questions."** The existing G.1 already says "**Exactly one** `AskUserQuestion` call per batch in the same response (never `ceil(N/4)`, never per-question)". The "one question per call" clause in the fix could be read as "questions array holds exactly 1 item" (aligns with G.1's 3-option gate shape) or as "at most 1 harness-question per call" (redundant with ≤4). The relationship to G.1's existing `never ceil(N/4)` phrasing also needs to be settled — either the fix reintroduces `ceil(N/4)` as the *inter-issue* fanout rule, or it complements the *per-batch* single-call rule with an *inter-batch* fanout rule.
**Question**: How should the fix wording be reconciled with the existing G.1 contract?
**Options**:
- A: Insert the fix wording verbatim as a new paragraph immediately after the existing G.1 "Gate invocation" paragraph; treat "one question per call" as reaffirming the single-item `questions` array shape and add "multiple calls in the same response, ≤4 questions per call" as the multi-issue fanout rule
- B: Rewrite G.1 to combine the two: "Exactly one `AskUserQuestion` call per issue's batch (one item in the `questions` array). When several issues gate simultaneously, fire one call per issue in the same response. A single call must never carry more than 4 questions in the `questions` array (harness limit)."
- C: Add a separate top-level "§ AskUserQuestion invocation contract" section stating the general rules (≤4 per call, single-item `questions` array by default, multiple calls per response permitted); shorten G.1 to reference it
- D: Keep G.1's existing wording and only append a one-line footnote: "Harness limit: `AskUserQuestion.questions` array ≤ 4 items per call; fire multiple calls in the same response when more gates fuse."

**Answer**: C — new top-level "§ AskUserQuestion invocation contract" holding the general rules; G.1 shortens to a reference. Follows from Q1-B/Q3-C. The contract section also settles the ambiguity this question found: the default gate shape is a single-item `questions` array (one call per gate/batch); ≤4 items per call is the harness ceiling governing any fusion; multiple calls in one response is the multi-gate fanout mechanism. B concentrates the wording in G.1, which is exactly where G.2–G.5 can't see it; D's footnote leaves the "one question per call" ambiguity unresolved.
