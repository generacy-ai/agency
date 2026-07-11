# Research: #402 — `AskUserQuestion invocation contract` section + fusion-drift audit

Phase 0 restatement of the Q1–Q4 decisions from [clarifications.md](./clarifications.md) as design decisions with alternatives-rejected and rationale. Each decision is anchored in a directly-observed T-S12 constraint (finding #57 in tetrad-development#92), a directly-observed pre-existing surface-drift, or the resolved-precedent shape of #396/#398/#400; none is aesthetic.

## Framing: what shape of fix is this?

The observed failure is a **harness-contract drift**, not a mechanism gap or a CLI-contract gap:

- The auto session **received** the P3 event burst (five issues all entering `waiting-for:clarification` simultaneously) and correctly classified all five as D.1 (mechanism + classification worked).
- The parent correctly recognized the multi-gate fusion opportunity: fuse all five clarification gates into one assistant response (the #388 pattern applied uniformly).
- The parent then **concatenated** all five gates' batch-approval questions into a single `AskUserQuestion.questions` array — a 5-item array on one call.
- The harness (Claude Code's `AskUserQuestion` tool) enforces a hard input-validation ceiling: `questions` array MUST NOT exceed 4 items. It returned `InputValidationError: Too big: expected array to have <=4 items (questions)`.
- The session recovered by splitting into a 4-item call + a separate 1-item call — burning a retry round-trip, duplicating the presentation block in the transcript, and lagging the fifth gate by ~15 minutes.

No mechanism gap (the harness rejected the shape and the parent observed the rejection). No CLI-contract gap (`AskUserQuestion` is a Claude Code SDK tool, not `generacy cockpit`). The gap is at the *invocation surface*: the playbook's G.1 (post-#400) says "single-item `questions` array per batch" but never states the harness ceiling that governs any fusion of gates into a single response. "Fused gate = one response" was read as "one call". The pre-#400 text had `ceil(N/4)` implicitly encoding the ceiling; the #400 rewrite removed the arithmetic and lost the ceiling as a side effect.

The fix has the same shape as #384/#388/#390/#394/#396/#398/#400 (instruction-drift class): pin the rule at a single load-bearing surface (a top-level `## AskUserQuestion invocation contract` section stating the ceiling and the fanout rule), then reference it from each gate contract. Backstop with a structural audit the model cannot silently regress (assertion 402-1 checks the section exists, the bound is present, and every gate references it; assertion 402-2 checks the audit isn't vacuous via a checked-in negative fixture).

## R1 — Contract scope: `auto.md` D.1/G.1 plus one top-level section covering G.1–G.5 (Q1=B)

**Decision**: The ≤4-questions-per-`AskUserQuestion`-call bound is stated once, in a new top-level `## AskUserQuestion invocation contract` section of `packages/claude-plugin-cockpit/commands/auto.md`. That section is the shared home for the three rules governing every `AskUserQuestion` invocation the playbook fires: default single-item `questions` array, ≤4 items per call harness ceiling, one call per gate under multi-gate fanout. Each of `## Gate contract`'s subsections G.1, G.2, G.3, G.4 (a/b/c/d), G.5 references the contract section from its gate-invocation paragraph via a one-sentence pointer (`Per § AskUserQuestion invocation contract: …`). `clarify.md` is out of scope (single-issue invocation, no cross-issue fusion). `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md` are out of scope (single-question gates make the bound vacuous).

**Rationale**: The failure mode observed at 00:18Z on the T-S12 run was multi-*gate* co-occurrence — five gates fused into one response, concatenated into one `AskUserQuestion` call. The same run at 00:59Z co-fired five verdict gates (D.2/D.3 fanout) in one response too. This isn't clarify-specific; the bound is a property of `AskUserQuestion` invocation *in general*, and G.2 (verdict), G.4 (escalation), G.5 (phase-queue) are all potential fusion surfaces the moment the auto loop dispatches multiple issues in the same iteration.

The alternatives:

- **Q1=A (only auto.md D.1/G.1)**: Would fix the clarification fanout that finding #57 caught but leave G.2/G.3/G.4/G.5 vulnerable to the exact same mistake at the next multi-gate fusion. The 00:59Z verdict-gate co-fire in the same run proves this isn't a hypothetical.
- **Q1=C (every fused-gate contract in auto.md individually, plus clarify.md)**: Five copies of the same rule at G.1, G.2, G.3, G.4a/b/c/d, G.5 — five surfaces to drift independently. Adding `clarify.md` re-adds the vacuous surface the scope analysis explicitly rejected (single-issue invocation, no cross-issue fusion). The exact anti-pattern #396's declared-vocabulary fix avoided and #398's snapshot-driven audit avoided.
- **Q1=D (every command playbook that mentions `AskUserQuestion`)**: Drags in playbooks whose single-question gates make the bound vacuous. `review.md`/`merge.md`/`queue.md`/`status.md`/`watch.md` fire zero or one `AskUserQuestion` per session; adding the ceiling reference to their prose adds noise for no reader benefit and blurs which playbooks actually fanout gates.

Q1=B is the only option that (a) covers the observed failure mode (clarification fanout at 00:18Z), (b) covers the near-miss (verdict fanout at 00:59Z), (c) covers G.4/G.5 by construction (they compose into fusion the same way G.1/G.2/G.3 do), and (d) keeps the rule declared once so it can't drift across sites. This is the architectural equivalent of #396's "declare the vocabulary" fix: single home for the rule, cross-references from each site.

**Load-bearing property**: the contract section is at `##` depth (H2), sibling to `## Gate contract` — not nested inside it. `## Gate contract` introduces gate-specific parameter shapes (`Options` / `Question text` / `Header` / `multiSelect`); the invocation contract governs the *shape of the call itself* (call count, item count, fanout dimension) across all gate types. Nesting the invocation contract inside `## Gate contract` conflates the two surfaces and hides the ceiling from a G.6+ author who might extend the table without reading the parent.

**Alternatives rejected in-line above**: Q1=A, Q1=C, Q1=D.

## R2 — Test naming: `402-1` in an issue-numbered describe block, following 398-1 (Q2=A)

**Decision**: The regression test is named `402-1` (following the `394-1`/`396-1`/`398-1`/`400-N` house convention) inside a top-level `describe("402 — playbook AskUserQuestion invocation contract audit", …)` block appended to `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. It's paired with a negative fixture at `packages/claude-plugin-cockpit/tests/fixtures/402-drift-auto.md` (matching the `398-drift-auto.md` shape) plus a positive check on current `auto.md`. "S6" from the spec's Fix section is shorthand from the tetrad-development cockpit plan's work breakdown for the static playbook-verification audit pattern — the thing `398-1` instantiates. It is not a code identifier and should not become one.

**Rationale**: The existing suite already groups tests by issue number (394-1, 396-1, 398-1, 398-2, 400-1 through 400-5) inside describe blocks named `describe("394 — …")` etc. Every issue-numbered block has the same shape: parse the playbook file, assert a structural property, and (for issues that touch a load-bearing rule) pair with a negative fixture that reproduces the pre-fix drift. Following this shape verbatim minimizes cognitive overhead for future authors reading the test file — the pattern is already there; the new block extends it without introducing a new category.

The alternatives:

- **Q2=B ("S6" refers to external scenario numbering; add 402-1 but don't try to encode "S6")**: Correct on the outcome (add 402-1, don't encode S6) but incomplete — it doesn't name the pattern being reused. The audit's shape (parse + structural check + negative fixture) is specifically the 398-1 pattern, and calling that out in the plan makes future authors' work faster (they read the 398 plan and adapt).
- **Q2=C ("S6" names a new sixth test category; create a top-level `describe("S6 — playbook AskUserQuestion contract audit", …)` block distinct from the issue-numbered ones)**: Mints a category name with no referent. The existing file's issue-numbered blocks are already the categorization scheme. A parallel "S6" category would confuse future readers who see a mix of issue-numbered blocks and one category-named block and wonder what makes S6 different (the answer would be: nothing — it's just a different naming choice for the same thing).
- **Q2=D (ignore "S6" as prose shorthand; implement as 402-1 alongside 398-1)**: Correct outcome, but doesn't reference the 398-1 pattern by name, missing the opportunity to make the "adapt the 398 shape" instruction explicit.

Q2=A explicitly names the 398-1 shape as the reference — this is the fastest path to a correct implementation (read `describe("398 — …")` in `playbook-verification.test.ts`; adapt).

**Precedent match**: This is the same shape as #398 chose for its own audit (a `describe("398 — …")` block with `398-1` positive audit + `398-2` negative-fixture regression), and #400 chose for its own five parser assertions (`400-1` through `400-5` inside `describe("400 — …")`). The house convention is issue-numbered describe blocks with issue-numbered assertions inside.

**Alternatives rejected in-line above**: Q2=B, Q2=C, Q2=D.

## R3 — Detection heuristic: single top-level contract section is the required home; audit checks it exists and is referenced from each gate contract (Q3=C)

**Decision**: The audit's structural checks are:

- (a) `auto.md` contains exactly one heading at `##` depth matching the case-insensitive substring `AskUserQuestion invocation contract` — the SECTION EXISTS at the declared depth.
- (b) Within that section's body, the ≤4 bound is present as a numeric bound — checked via the regex `≤ ?4 ?items? ?per ?call` OR the co-occurrence of the literal tokens `4 items` and `per call` within the section's body (on the same line or in adjacent lines).
- (c) Each of the eight gate contracts (`G.1`, `G.2`, `G.3`, `G.4a`/`G.4b`/`G.4c`/`G.4d`, `G.5`) contains at least one substring reference `AskUserQuestion invocation contract` within its section body — the CROSS-REFERENCES exist.

Structural checks over content-sniffing. The audit never regexes the fusion vocabulary ("fused", "fanout", "in the same response", "simultaneously") — dialect-pinned regex is the exact failure mode generacy#909 instanced (a content-sniffing classifier false-negating on unanticipated wording), and the whole point of Q3=C is to avoid that class of failure.

**Rationale**: The failure mode being audited is *architectural*: the contract's home is missing or a gate lost its reference. Structural checks are stable across future prose edits — a reformatting of G.3's gate-invocation paragraph doesn't break the audit as long as the paragraph still contains the reference substring; a rewrite of the contract section's body doesn't break the audit as long as the ≤4 bound is still stated.

The alternatives:

- **Q3=A (any section header G.1–G.5 or D.1–D.11 that describes an `AskUserQuestion` call → bound must appear per-section)**: Requires G.1–G.5 (and every D.<n>) to state the bound inline. Directly contradicts Q1=B's single-home architecture — the whole point of Q1=B is to state the rule once. Q3=A + Q1=B is architecturally inconsistent; you'd have both a top-level contract section AND inline bounds at each G.<n>, five copies to drift independently.
- **Q3=B (fusion-phrase regex: `same (assistant )?response`, `fused`, `multiple .* gates?`, `simultaneously`, or startup-sweep dispatch loop → bound required there)**: Content-sniffing on prose. Dialect-pinned to today's wording. False-negatives on any future author's alternative phrasing (`"in one turn"`, `"co-fires"`, `"multiplex"`). This is the exact class of failure generacy#909 hit at the transition-classification surface — a wording-pinned classifier that false-negatives on the T-S6 corpus's actual phrasing. Q3=B recreates that failure mode at the playbook-audit surface.
- **Q3=D (HTML-comment annotation: `<!-- fusion:multi-issue -->` on fused sections; audit checks the bound within annotated sections)**: Introduces an annotation surface that itself drifts. Reformat strips the comment; audit false-fails; author disables the audit. Same failure class as #398's Q2=C rejection of author-annotated audit exceptions. Structural discriminators (Q3=C's section-header + bound-token + reference-substring) are more robust than comment-based ones.

Q3=C is the architectural assertion that composes with Q1=B: the audit checks the exact architecture the fix creates (single home + cross-references). If the architecture is right, the audit passes; if any of the three structural properties breaks, the audit fails with the specific missing element.

**Precedent match**: #398 §7 established "structural discriminator over content heuristic" as the mechanism-gap defense principle (`.+` regex over `must-start-with-{`, has-an-argument test over content-of-argument test). Q3=C applies the same principle at the playbook-audit surface — section-header existence, numeric-bound presence, and cross-reference substring are all structural facts, not content interpretations.

**Alternatives rejected in-line above**: Q3=A, Q3=B, Q3=D.

## R4 — Contract wording: new top-level `§ AskUserQuestion invocation contract` section holds the general rules; G.1 shortens to a reference (Q4=C)

**Decision**: The new `## AskUserQuestion invocation contract` section states the three rules verbatim:

1. **Default gate shape**: `AskUserQuestion.questions` is a single-item array (one call per gate/batch). This resolves the "one question per call" ambiguity Q4 found — the default is a single-item `questions` array, aligning with G.1's post-#400 shape and G.2–G.5's single-question gates.
2. **Harness ceiling**: `AskUserQuestion.questions.length ≤ 4` per call. This is the harness's input-validation bound. Exceeding it returns `InputValidationError: Too big: expected array to have <=4 items (questions)`.
3. **Multi-gate fanout**: When multiple gates fuse into one assistant response, fire multiple `AskUserQuestion` calls in that response — one per gate — never a single fused call.

G.1's `**Gate invocation**` paragraph (currently `Exactly one \`AskUserQuestion\` call per batch in the same response (never \`ceil(N/4)\`, never per-question)`) is replaced with a one-sentence reference: `Per § AskUserQuestion invocation contract: one \`AskUserQuestion\` call per batch (single-item \`questions\` array); if multiple clarification gates fuse into one response, fire one call per gate.` The gate-specific parameters (`Question text`, `Header`, `multiSelect`, `Options`) stay inline in G.1's paragraph — only the invocation-shape prose is factored out.

G.2, G.3, G.4a/b/c/d, G.5 similarly add a one-sentence `Per § AskUserQuestion invocation contract` reference next to their gate-invocation paragraph. Their gate-specific parameters stay inline.

**Rationale**: Q4's ambiguity was real — the fix wording in the spec ("one `AskUserQuestion` call per issue's clarification batch (one question per call), multiple calls in the same response when several issues gate simultaneously; a single call must never carry more than 4 questions") mixed two concepts:

- "one question per call" — read as "questions array holds exactly 1 item" (aligns with G.1's single-item shape) OR "at most 1 harness-question per call" (redundant with ≤4).
- The relationship to G.1's existing `never ceil(N/4)` phrasing — either reintroduce `ceil(N/4)` as the inter-issue fanout rule, or complement the per-batch single-call rule with an inter-batch fanout rule.

Q4=C settles both by moving to a general architectural statement: **default 1 item per call + ≤4 ceiling + fanout is per-call not per-array**. The three rules compose transitively (default 1 + ceiling 4 + per-call fanout → the ceiling is the fanout ceiling *per call*, and the array shape stays 1 per gate). No arithmetic (`ceil(N/4)`), no ambiguous "one question per call" phrasing — just three declarative rules.

The alternatives:

- **Q4=A (insert the fix wording verbatim as a new paragraph after G.1's existing paragraph)**: Preserves the ambiguity Q4 found. And concentrates the wording in G.1 where G.2–G.5 can't see it — same failure mode Q1=A rejected.
- **Q4=B (rewrite G.1 to combine)**: Same "concentrated in G.1" failure mode. G.2–G.5 authors reading only their own gate contract miss the rule.
- **Q4=D (append one-line footnote to G.1)**: Leaves the "one question per call" ambiguity unresolved (the footnote just adds the harness ceiling without clarifying the default shape). And still concentrates the wording in G.1.

Q4=C composes with Q1=B (single home) and Q3=C (structural audit checks that single home). The contract section states three declarative rules; G.1 shortens to reference them; G.2–G.5 add references; the audit checks the architecture. Everything composes.

**Load-bearing property**: The contract section resolves the ambiguity at the source. Future gate contracts (G.6+) that fuse under some new multi-gate condition read the contract section, apply the three rules, and can't accidentally recreate the finding #57 concatenation — because the multi-gate fanout rule is explicit and structurally checked.

**Alternatives rejected in-line above**: Q4=A, Q4=B, Q4=D.

## R5 — Load-bearing surfaces: what the fix touches and what it doesn't

The `auto.md` contract section + gate-contract cross-references and the two audit assertions are the load-bearing edits. Everything else is completeness hygiene around them:

**Load-bearing** (a bug here reproduces the finding #57 diagnosis-round-burn):

- `auto.md` new `## AskUserQuestion invocation contract` section — the runtime prose the session reads when composing a fused gate response. If this is missing or missing the ≤4 bound, no audit can save the next session from concatenating into a single call.
- `auto.md` G.1–G.5 gate-contract references — the discovery path from a specific gate contract to the general contract. If any gate contract loses its reference, an author extending that gate re-inlines the ceiling (Q1=C shape) or forgets it (finding #57 shape).
- The audit's structural assertions (Q3=C) applied to the current `auto.md` — the machine-checkable backstop that any future edit removing the section, the bound, or a gate-contract reference fails at build time.

**Completeness hygiene** (a bug here fails the audit at build time, not at runtime):

- `tests/fixtures/402-drift-auto.md` — the machine-checkable proof that the audit's structural logic isn't vacuous (positive-signal check via assertion 402-2).
- The two new assertions (402-1, 402-2) — the audit's build-time enforcement.

**Not touched** (out of scope):

- `auto.md` `## Invariants` section — no new §8. The audit's guarantee lives inside the test file's assertion, not at the invariants surface. Matches SC-007 of #394 and #396/#398/#400's no-§8 rule.
- Sibling playbooks (`clarify.md`, `review.md`, `merge.md`, `queue.md`, `status.md`, `watch.md`) — Q1=B explicitly out-of-scope; the ≤4 bound is vacuous at those surfaces.
- `packages/claude-plugin-cockpit/lib/*.ts` — no runtime code change; the fix is playbook prose + test extension.
- Historical spec directories — deliberately byte-identical.
- The Claude Code SDK's `AskUserQuestion` tool contract — the ≤4 ceiling is a harness bound we consume, not one we can change from here. If the ceiling ever changes (e.g., to ≤8), the fix is: refresh the number in the contract section + the audit's regex/tokens — a small, mechanical follow-up.

## Sources

- **Spec**: [spec.md](./spec.md) — observed T-S12 evidence (P3 event burst → 5-item `questions` → harness InputValidationError → retry round-trip + 15-min lag on #13), three-part fix framing, regression-test enumeration.
- **Clarifications**: [clarifications.md](./clarifications.md) — Q1–Q4 with resolved answers.
- **Predecessor fixes**: [../384-found-during-cockpit-v1/plan.md](../384-found-during-cockpit-v1/plan.md), [../388-found-during-cockpit-v1/plan.md](../388-found-during-cockpit-v1/plan.md), [../390-found-during-cockpit-v1/plan.md](../390-found-during-cockpit-v1/plan.md), [../394-found-during-cockpit-v1/plan.md](../394-found-during-cockpit-v1/plan.md), [../396-found-during-cockpit-v1/plan.md](../396-found-during-cockpit-v1/plan.md), [../398-found-during-cockpit-v1/plan.md](../398-found-during-cockpit-v1/plan.md), [../400-operator-requested-ux/plan.md](../400-operator-requested-ux/plan.md) — the instruction-drift class this fix continues to close at successive playbook surfaces (this fix at the harness-invocation surface).
- **Related architectural precedent**: #396 (declared-vocabulary fix at the classification surface) — same "single home + cross-references + declared-vocabulary audit" architecture applied here at the invocation surface. #398 (`describe("398 — …")` block + `398-1` positive audit + `398-2` negative fixture) — same test-file shape reused for `402-1` + `402-2`.
- **Harness contract of record**: Claude Code SDK's `AskUserQuestion` tool documentation — usage note "Questions to ask the user (1-4 questions)" implies the ≤4 ceiling; empirical evidence from T-S12 run at 00:18Z (`InputValidationError: Too big: expected array to have <=4 items (questions)`) confirms enforcement at input validation.
