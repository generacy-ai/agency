# Research: `/cockpit:auto` enriched-line dispatch drops per-event `cockpit_status` re-check

**Feature**: agency#437 — parse the NDJSON doorbell line for label-driven dispatch inputs (`to`/`labels`) and the D.5/D.6 merge-gate `checks` verdict; drop the per-event `cockpit_status(epic, json=true)` re-check for the frequent classes (D.1–D.4, D.7, D.9, D.9a–D.9d); retain it for D.8, D.10, D.11 (human/consequential gates).
**Branch**: `437-summary-cockpit-auto-exhausts`
**Date**: 2026-07-17
**Status**: Complete

## R1 — Why the current dispatch loop exhausts the GraphQL rate limit

**Decision**: The dominant rate-limit consumer is `auto.md` step 4a's per-event `cockpit_status(epic=<epic-ref>, json=true)` call, which fires **for every actionable event in a drained batch** (D.1–D.8, D.10, D.11 — every dispatch class except the D.9-family ledger-only rows).

**Evidence** (from the pre-#437 loop at `auto.md:85`, current wording):

> **(a) Re-check live state** via `cockpit_status(epic=<epic-ref>, json=true)` for actionable dispatch classes (D.1–D.8, D.10, D.11). The batch event is advisory; the live return is authoritative (spec § Loop).

Per the tracked GitHub issue, each `cockpit_status(epic, json=true)` call fans out **≈28 GraphQL calls** for a mid-size epic (the tool queries the epic body, task-list refs, each child issue's labels + linked PR + PR checks + PR reviews + PR comments + PR feedback threads). A 3-event wake ≈ ~95 GraphQL calls. GitHub's GraphQL secondary rate limit is **5000 points/hour**; sustained auto-driven epics comfortably exceed that in normal use, which is what the reporter observed.

**Root cause diagnosis**: The re-check exists because the pre-#985 doorbell line carried at most a bare event type (e.g., `waiting-for:clarification`, `phase-complete`). Neither `to` (target state), nor `labels` (current-state fingerprint), nor `checks` (merge verdict) were carried on the line. So the parent had to re-query authoritative state before dispatching. Post-#985 the line carries all three (with the `checks` field present on merge-verdict-relevant events), so the re-check is redundant for the classes those fields dispatch.

**Alternatives considered**:

- Coalesce redundant `cockpit_status` calls across a single drained batch (dedup by epic-ref, one call per unique epic per batch). Rejected: reduces cost by O(batch-size) but does not scale — the wake rate matters as much as the events-per-wake rate, and coalescing per-batch still fires N wakes' worth of queries against 5000 pts/hr.
- Downgrade `cockpit_status(epic, json=true)` to a cheaper per-issue query (`cockpit_status(issue, json=true)`). Rejected: still ≈8–12 GraphQL calls per issue (labels + linked PR + PR checks + PR reviews), and the re-check semantics require epic-scoped state anyway (mute set, dispatched-issues set, per-phase status).
- Introduce a client-side status cache with TTL. Rejected: distributed cache correctness under mid-wake state changes is a real hazard; a stale cache hit could silently open a gate against superseded state — the same correctness concern Q1's retain-the-re-check for D.8/D.10/D.11 preserves.

## R2 — Dispatch-class scope choice (Q1)

**Decision**: **A** — convert **D.9a–D.9d** (ledger-only variants: `pr-feedback`, `children-complete`, `dependencies`, `phase:*`) to enriched-line dispatch **alongside D.9** (`address-pr-feedback`), and convert **D.1–D.4** (clarification, artifact-review, implementation-review, manual-validation) and **D.7** (agent-error / failed) to enriched-line dispatch. **Retain** the per-event `cockpit_status` re-check for **D.8** (`phase-complete` → phase-queue gate), **D.10** (unrecognized/ambiguous → escalation gate), and **D.11** (`merge-conflicts` → escalation gate).

**Rationale**:

- **Frequency asymmetry**: D.1–D.4, D.7, D.9, D.9a–D.9d are the frequent classes — a mid-size epic hits these on every state transition of every child issue over its lifetime. D.8 fires ≈once per phase (2–4 times over an epic's life); D.10 and D.11 are error/escalation cases (near-zero rate on healthy runs). Converting the frequent classes captures ≈all of the GraphQL cost savings; retaining the re-check for the rare classes costs almost nothing.
- **Gate-consequentiality asymmetry**: D.8, D.10, D.11 open human/consequential gates (phase-queue confirmation with real outward tool calls; escalation gates with `Stop (exit auto)` options). A stale-line dispatch on any of these could open a gate against superseded state — the operator sees "queue P2 with 4 issues" but P2 has already been queued (superseded by a race between doorbell and merge); the operator escalates on `merge-conflicts` that the engine has already auto-remedied. Retaining the authoritative re-check on these three classes removes that risk.
- **D.9-family symmetry**: D.9 (`address-pr-feedback`) was already ledger-only pre-#437 (invariant §8, zero cost). D.9a–D.9d were also already ledger-only (the pre-#437 wording says "server-side-owned" / "engine-owned phase transition"). But per the pre-#437 step-4a preamble, actionable dispatch classes ran the re-check — the D.9-family rows sat under a different rule ("skip the re-check per §8's cost contract"). This PR aligns D.9a–D.9d with D.9 explicitly: all five ledger-only rows now dispatch off the enriched line's `to`/`labels` fields directly (source-of-truth for the ledger row content) instead of relying on the pre-#437 "server-side-owned" narrative that already made them re-check-free. The alignment is bookkeeping-clarifying, not semantically load-bearing — but it removes ambiguity for future readers.

**Alternatives rejected**:

- **B — convert everything label-driven except D.10** (D.9a–D.9d AND D.8 AND D.11): Rejected because D.8 opens a phase-queue confirmation gate whose ad-hoc-issues enumeration needs authoritative per-issue state (the current step-4a re-check catches issues that transitioned mid-wake). Losing that check silently queues stale phases. D.11 has the same stale-line escalation risk.
- **C — only convert the classes explicitly named in FR-002/FR-003** (D.1–D.4, D.7, D.9, D.5/D.6): Rejected because D.9a–D.9d are structurally identical to D.9 (all five are ledger-only, server-side-owned), and leaving them on the pre-#437 rule while D.9 converts creates a two-lane dispatch path where the difference is bookkeeping-only. Bookkeeping ambiguity is exactly what future maintainers get bitten by; converting the whole D.9 family together removes the drift risk.
- **D — something else**: no viable third path emerged during the Q1 clarification round.

## R3 — Enriched-vs-bare detection heuristic (Q2)

**Decision**: **B** — enriched iff the doorbell line JSON-parses to an object AND the parsed object carries both `to` (target state) and `labels` (current-state fingerprint) fields. Missing either treats the line as bare and falls back to today's re-query behaviour.

**Rationale**:

- **`to` and `labels` are the load-bearing dispatch inputs** for label-driven classes. D.1–D.4 and D.7 dispatch on `to` (`waiting-for:*`, `agent:error`, `failed:*`); D.9/D.9a–D.9d dispatch on `to` (`waiting-for:*`, `phase:*`). `labels` is the ledger-row content per Q5=C (the line-as-received field for the `<transition-class>` slot). A line missing either cannot be safely dispatched on.
- **Explicitly rejecting C (additionally require `checks` for D.5/D.6)**: A legitimate label-change line (e.g., `waiting-for:clarification`) has no `checks` — the field is only meaningful for merge-verdict-relevant events. If the enriched-vs-bare gate required `checks` universally, EVERY label-driven line would fall back to full re-query, which nullifies the whole PR. `checks` presence/absence is handled separately in the D.5/D.6 path per FR-003 (see R4 below), not in the enriched-vs-bare gate. This is the load-bearing distinction that makes B the correct answer, not C.
- **Explicitly rejecting A (JSON-parse success only)**: A partial payload (parses as JSON but missing `to`) would be acted on with incomplete inputs. Dispatching on an object whose `to` field is `undefined` or missing produces silently-wrong ledger rows and can misdispatch (e.g., an object with `{repo, number, kind}` but no `to` — the parent would dispatch to D.10 unrecognized-state, incorrectly firing an escalation gate on what should have been a graceful re-query fallback). B's stricter check turns partial payloads into fallback re-queries — the same graceful-degradation semantics FR-005 mandates for older engines.
- **Failure-mode is fallback, not error**: The detection heuristic is a routing decision, not a validation gate. A malformed or missing line goes down the fallback path; a well-formed line goes down the enriched-line path. No error is raised; no exception surfaces to the operator. This preserves the "loop keeps running" guarantee under transport-layer imperfections.

**Alternatives rejected**:

- **A — JSON-parse success only**: acts on partial payloads (see above).
- **C — JSON-parse + full class-specific field check (`to` + `labels` for label-driven; `checks` too for D.5/D.6)**: routes every label-driven line to full re-query (`checks` is not carried on label-change lines). Nullifies the PR.

## R4 — Step-4a "authoritative source" framing (Q3)

**Decision**: **B** — keep step 4a as a single "resolve authoritative state" contract whose implementation is "prefer the enriched line; fall back to one `cockpit_status` on absence." One unified source-of-truth priority covers both label-driven and merge-gate paths.

**Rationale**:

- **Unified narration**: The pre-#437 step 4a currently reads *"The batch event is advisory; the live return is authoritative (spec § Loop)."* Framing B replaces "the live return is authoritative" with "the source-of-truth is the enriched line when present; the live return is authoritative when the enriched line is absent." One sentence, one narration, both label-driven and merge-gate classes covered.
- **Easier to pin in playbook-verification**: The existing pin on step 4a currently asserts the pre-#437 wording; framing B rewrites it to a single new wording; positive + negative pin catches full and partial reverts. Framing (i) (drop step 4a for label-driven classes) requires splitting the pin into two disjoint assertions (one for the merge-gate fallback path, one for the D.10-style unrecognized path) and re-scoping the invariant — more surface area for future drift.
- **Folds FR-005 graceful degradation in naturally**: The unified contract's "fall back to one `cockpit_status` on absence" clause IS the FR-005 graceful degradation — a bare line (older engine, content-less mode) is treated as "enriched line absent," so the fallback fires. No separate narration branch needed.
- **Preserves the anti-drop protection of invariant §7**: Under framing B, `cockpit_await_events` still owns the sole typed-batch source; the enriched line is a **dispatch input**, not a **batch source**. The distinction matters: batches are the anti-drop guarantee (nothing that lands in the event log is silently dropped by a content-based filter); dispatch inputs are the correctness guarantee (the parent dispatches on state matching what the engine classified). Framing B makes this two-layer structure explicit; framing (i) collapses the two layers.

**Alternative rejected**:

- **A — Framing (i): drop step 4a entirely for label-driven classes; re-scope the invariant to merge-gate fallback + D.10-style unrecognized states only**: More surgical, matches the code path more literally, but harder to explain (two disjoint dispatch rules, one narration per class family) and creates two pin surfaces for future drift.

## R5 — `checks: pending` handling for D.5/D.6 (Q4)

**Decision**: **B** — treat `checks: pending` identically to "verdict absent": fall back to a single authoritative `cockpit_status`/`cockpit_merge` query. Consistent with FR-003 wording ("fall back when not decisive").

**Rationale**:

- **Correctness under lossy transport**: smee doorbell delivery is best-effort/lossy (documented). The naïve alternative — defer-on-pending, do nothing this wake, wait for the next doorbell fire when checks resolve to green/red — silently stalls the merge if the follow-up event is lost. A stalled merge shows up to the operator as "the loop is idle; nothing is happening" and requires manual intervention. This is a real correctness hazard on production clusters, not a hypothetical.
- **Cost is negligible**: Merge-gate dispatch is **≈once per issue over the epic's lifetime**. An extra `cockpit_status` (or `cockpit_merge`) per `pending` merge-gate event is a rounding error against the ≈95-GraphQL-per-wake savings this PR delivers on the frequent classes (D.1–D.4, D.7, D.9, D.9a–D.9d). The tradeoff is asymmetric: defer-on-pending saves ≈1 query per merge-gate dispatch (and risks stall); fall-back-on-pending costs ≈1 query per merge-gate dispatch (and guarantees no stall).
- **Ledger auditability**: The fallback path writes a `source: re-query` ledger row (no `source: enriched-line` marker per Q5=C's marker rule), so a post-mortem can grep `checks-pending` events and see they fell back to authoritative state. This makes the tradeoff visible and reversible — if a future run analyzes the ledger and finds `pending` events are common, the team can re-evaluate B → A once the smee transport is proven lossless enough to defer safely.
- **FR-003 consistency**: FR-003 says "consult the line's `checks` verdict; only if absent, fall back to a single authoritative query." Under B, "absent" is redefined to mean "not present OR present-but-not-decisive." That is the sensible reading — `pending` is by definition not decisive.

**Alternative rejected**:

- **A — Defer-on-pending**: minimizes queries but stalls merges on lost follow-up events. Correctness > cost here (see above).

## R6 — Ledger row source-of-truth (Q5)

**Decision**: **C** — write the ledger row from the doorbell line as-received (the `to` / `labels` fields on the enriched line), plus a `source: enriched-line` marker column so post-mortems can distinguish enriched-line rows from fallback re-query rows. No extra query.

**Rationale**:

- **No extra query** (Q5=C rejects Option B): Writing the ledger row from a fresh `cockpit_status` read would negate the SC-001 saving. Every event we saved a query on for dispatch, we'd pay a query for the ledger. Rejected.
- **Marker is what post-mortems need**: Option A (line-as-received, no marker) is the cheapest option but loses the audit trail. When a future incident asks "did the ledger row reflect what the engine classified, or what GitHub eventually said?", the marker column answers directly. Option C is cheaper than option B (still no extra query) and more auditable than option A (marker distinguishes the two dispatch paths).
- **Post-mortem workflow**: `grep 'source: enriched-line' <ledger>` isolates every enriched-line dispatch; `grep -v 'source: enriched-line' <ledger>` isolates fallback re-query rows. The marker is a suffix on the outcome slot, not a separate column — this keeps the four-column ledger format (`<issue-ref> · <transition-class> · <action> · <outcome>`) intact and grep-friendly.
- **Marker is emitted from the frequent (converted) classes only**: D.5/D.6 fallback (when `checks` is absent or `pending`) writes a `source: re-query` outcome — the same shape as the pre-#437 authoritative-query dispatch. D.8/D.10/D.11 retain the re-check and write no marker (equivalent to `source: re-query`). This keeps the marker's semantic simple: `source: enriched-line` means "the dispatch used the doorbell line's fields, not a `cockpit_status` read." Everything else is implicitly `source: re-query`.

**Alternatives rejected**:

- **A — line-as-received, no marker**: cheapest, but no audit trail for the enriched-line vs. re-query distinction. Rejected as auditability-blind.
- **B — fresh live-state read for the ledger only**: preserves today's observability semantics but costs one query per event; nullifies SC-001. Rejected in-context per FR-002 intent.

## R7 — Invariant §7 rewrite ("Stream consumption is unfiltered" — retain anti-drop, drop "never parse")

**Decision**: The pre-#437 §7 wording:

> **Stream consumption is unfiltered.** Every non-empty line from `generacy cockpit doorbell` is a doorbell only; doorbell content is a doorbell only; never parsed for content. Content-based filters over the stream are prohibited. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.

is rewritten to:

> **Stream consumption is unfiltered.** Every non-empty line from `generacy cockpit doorbell` is consumed by the parent — content-based filters over the stream (e.g., "only wake on lines matching `waiting-for:*`") are prohibited, because a filter could silently drop legitimate events. Enriched lines (JSON-parseable objects carrying `to` and `labels`) ARE parsed for dispatch inputs per the § Enriched-line dispatch contract; bare lines fall back to `cockpit_await_events` for authoritative state. `cockpit_await_events` remains the sole source of typed batches for the merge-gate fallback path and for D.8/D.10/D.11 escalation surfaces. If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field.

**Rationale**:

- **Retain the anti-drop protection**: The pre-#437 wording mixed two guarantees. The load-bearing one is (a) "content-based filters over the stream are prohibited" — no filter that could silently drop legitimate events. This stays verbatim (or nearly so) in the rewritten §7. The retired one is (b) "never parsed for content" — this was a premise-of-transport statement (the line carried no dispatchable content pre-#985), not a correctness invariant. Rewritten §7 makes (a) unambiguous by isolating it from (b).
- **State the new parse-for-dispatch rule explicitly**: The rewritten §7 names the new behaviour ("enriched lines ARE parsed for dispatch inputs per the § Enriched-line dispatch contract") so a future author reading only §7 sees the current dispatch-input rule, not just the retained anti-drop rule.
- **Preserve the harness-reader-match rule**: "If the harness requires a match pattern to arm a reader, it matches any non-empty line, never a JSON field" — this rule survives verbatim. It is a Claude Code harness contract, not a doorbell contract; it constrains how `Monitor.spawn(...)` is invoked, not how the parent reads the sensor's stdout.

**Alternatives considered**:

- **Delete §7 entirely**: rejected — the anti-drop protection is load-bearing and would be lost.
- **Renumber §7 → §7a (anti-drop) + §7b (enriched-line parsing)**: rejected — no other invariant in the §Invariants list uses sub-numbering; adding one here creates a formatting drift. The rewritten §7 fits in one paragraph.
- **Keep §7 wording and add §10 for enriched-line parsing**: rejected — §10 would restate the § Enriched-line dispatch contract, creating drift risk between §10 and the contract section. §7's rewrite pointing to the contract section is the correct discovery path.

## R8 — Playbook-verification test-pin strategy (drift-audit contract)

**Decision**: Re-pin the existing assertions on step 4a's wording and D.1–D.7's dispatch shape to the new contract (positive + negative form per #433). Add new pins for §7 rewrite, ledger `source: enriched-line` marker vocabulary, D.5/D.6 fallback rule, and D.8/D.10/D.11 retain-the-re-check.

**Rationale from CLAUDE.md**:

> `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins every `packages/claude-plugin-cockpit/commands/*.md` playbook (including `auto.md`) by **exact heading strings and contract rules** — heading renames, loop-shape edits, or new/removed steps break the assertions on purpose. This is a drift audit, not a smoke test.
>
> If your edit breaks a pin, the correct response is to **re-pin the assertion to the NEW contract** in the same PR. Do NOT weaken or delete an assertion to make the test pass — weakening it deletes its value.

**Pin-shape choices** (matching the pattern established by #433 and preceding drift-audit pins):

- **Positive + negative pin** for step 4a's re-worded contract:
  - Positive: `auto.md` contains the new "resolve authoritative state" wording with the "prefer the enriched line" phrasing.
  - Negative: `auto.md` does NOT contain the pre-#437 wording `"The batch event is advisory; the live return is authoritative"`.
- **Positive + negative pin** for D.1–D.7 dispatch shape:
  - Positive: the D.1–D.7 dispatch narrations read `to`/`labels` from the enriched line (verbatim mention of the dispatch input in the paragraphs).
  - Negative: no per-event `cockpit_status(...)` mention in D.1–D.4, D.7 paragraphs on the enriched-line path (matches after the edit but not before).
- **Positive + negative pin** for invariant §7 rewrite:
  - Positive: §7 opens with "Stream consumption is unfiltered" AND names the § Enriched-line dispatch contract cross-reference.
  - Negative: §7 does NOT contain `"never parsed for content"`.
- **Positive pin** for ledger vocabulary:
  - The § Ledger action+outcome vocabulary table names the `source: enriched-line` marker as a suffix on the D.1–D.4, D.7, D.9, D.9a–D.9d outcome slots (or, more grep-friendly, `auto.md` contains the string `source: enriched-line` in the § Ledger section).
- **Positive + negative pin** for D.5/D.6 fallback rule:
  - Positive: D.5/D.6 narration names both `absent` AND `pending` as fallback triggers (per Q4=B).
  - Negative: D.5/D.6 does NOT contain a defer-on-pending phrasing (e.g., `defer this wake` under a `checks: pending` context) — Q4=A was rejected.
- **Positive pin** for D.8/D.10/D.11 retain-the-re-check note:
  - D.8/D.10/D.11 paragraphs contain an explicit "retain the per-event `cockpit_status` re-check" phrase (or equivalent verbatim wording chosen at edit time) — future authors editing these dispatch rows read the retain rule.

**Scope discipline**: All new/updated pins live inside a single `describe("437 — auto.md enriched-line dispatch drops per-event cockpit_status re-check for label-driven classes", () => {...})` block appended to `playbook-verification.test.ts`. The block name mirrors the sibling 433 block; the assertion naming (`437-1`, `437-2`, ...) follows the same convention.

## R9 — Impact assessment

**Severity**: **Correctness-adjacent efficiency fix**. The pre-#437 loop is functionally correct (dispatches the right events, opens the right gates) but exhausts the GraphQL rate limit under sustained load, causing:

- Sustained auto runs hit the 5000 pts/hr secondary rate limit and stall for the remainder of the hour. During the stall, `cockpit_status` returns typed errors that the pre-#437 loop currently classifies as `OTHER` and continues past — but every ≈95-GraphQL wake is dead time until the limit resets.
- Operator-visible symptom: `/cockpit:auto` "gets slower over the epic's life," which under diagnosis reveals as GraphQL rate-limit exhaustion, not a bug in the dispatch loop.

**Blast radius**: Two edits, all under `packages/claude-plugin-cockpit/`:

- `commands/auto.md` — dispatch prose (steps 2, 4a, D.1–D.7, D.9-family, D.5/D.6, § Invariants §7, § Ledger action+outcome vocabulary).
- `tests/playbook-verification.test.ts` — re-pin two existing assertions; add five new pin blocks (per R8).

**Cross-repo dependency**: **generacy-ai/generacy#985** ships the engine-side content-ful `lineForEvent`. This PR is designed for lockstep landing but does not hard-fail if #985 is delayed on a cluster — the enriched-vs-bare gate falls back gracefully.

**Rollback**: Trivial — revert the two commits (or one squash commit). The pre-#437 dispatch is preserved verbatim on the fallback path, so a partial rollback (revert `auto.md` while leaving generacy#985 deployed) is also safe: the enriched line is generated but ignored; the pre-#437 re-query path fires. A full rollback restores pre-#437 behaviour without state migration or ledger reformat.

**Ledger format compatibility**: The `source: enriched-line` marker is a suffix on the outcome slot, not a schema change. Ledger files from mixed pre-#437 / post-#437 runs concatenate without ambiguity; `grep 'source: enriched-line'` on a mixed file returns only post-#437 rows dispatched from enriched lines.

## Sources

- **agency#437 spec** — problem statement, proposed change, acceptance criteria, and the five Q1–Q5 clarifications that pinned the dispatch-class scope, enriched-vs-bare heuristic, step-4a framing, `pending` handling, and ledger source-of-truth.
- **agency#437 clarifications.md** — full Q1–Q5 clarification round (2026-07-17) that resolved this PR's design questions.
- **generacy-ai/generacy#985** — companion PR (engine side) that makes the doorbell line content-ful (`{to, labels, checks}`) and wires local `to`-classification.
- **generacy-ai/generacy#970 / #978 / #980** — real-time doorbell foundation (context for what generacy#985 extends).
- **agency#431** — pre-#437 doorbell-real-time work on the skill side (pre-flight probe, sensor arm-up under `Monitor`, wake-driven main loop). Context for the loop shape this PR touches.
- **agency#433** — sibling drift-audit pin PR; established the positive + negative pin convention this PR follows.
- **`packages/claude-plugin-cockpit/commands/auto.md`** — pre-#437 dispatch prose (steps 1–6, § Dispatch D.1–D.11, § Gate contract G.1–G.7, § Ledger, § Invariants).
- **`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`** — pre-#437 pin surface (394, 396, 398, 400, 402, 403, 406, 408, 410, 416, 429, 433) — this PR appends a `437 —` block.
- **GitHub GraphQL secondary rate limit**: 5000 points per hour (documented). The tracked issue's rate-exhaustion reproducer.

---

*Generated by speckit*
