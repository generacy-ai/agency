# Implementation Plan: Slim `cockpit:auto` to gates / queue / clarify / merge (engine owns review→remediate)

**Feature**: The workflow engine (epic generacy-ai/generacy#1120, P1–P4 issues #1121–#1135) now owns the implementation-PR review→remediate→validate loop. `/cockpit:auto` (`packages/claude-plugin-cockpit/commands/auto.md`) must stop driving those rounds from the cluster conversation: remove reviewer/fixer subagent dispatch against implementation PRs (D.3, D.6, G.2 implementation branch), react to two engine gates instead (`waiting-for:remediation-limit` and the post-validate `waiting-for:implementation-review` final approval), keep artifact-gate reviews (spec/plan/tasks) unchanged, add a pre-flight `generacy --version` minimum-version guard, and re-pin `playbook-verification.test.ts` to the slimmed contract.
**Branch**: `500-context-review-remediate`
**Issue**: [generacy-ai/agency#500](https://github.com/generacy-ai/agency/issues/500) (P5 rollout of the client playbook)
**Status**: Complete
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) — Batch 1: Q1 final-approval gate shape (Option A: approve→merge; hold/reject→no-op; findings from gate body; no reviewer subagent); Q2 remediation-limit resume (Option A: `resume remediation`/`stop`; resume→`cockpit_advance(gate="remediation-limit")`); Q3 version-skew (Option A: `generacy --version` pre-flight probe, hard-fail below minimum); Q4 D.6 red fixer (Option A: remove entirely; `completed:validate` red → ledger-only, re-fires as engine gate); Q5 D.9/D.9a (Option A: keep both as ledger-only rows, unchanged).
**Depends on**: Engine epic [generacy#1120](https://github.com/generacy-ai/generacy/issues/1120) (P1–P4, issues #1121–#1135) merged and shipping in the generacy package the cluster runs — the engine emits `waiting-for:remediation-limit` (remaining findings in the gate body) and moves `waiting-for:implementation-review` to post-validate.
**Out of scope (companion issues)**: engine-side executors/config/validate orchestration (P1–P4); artifact-gate review behaviour changes; migration-notes/rollout-checklist deliverable ([generacy#1136](https://github.com/generacy-ai/generacy/issues/1136)); cross-repo monitoring of the agency repo by the driving cluster.

## Summary

`auto.md` today runs the implementation-PR review loop itself: D.3 (`waiting-for:implementation-review`) spawns a `cockpit-reviewer` subagent and fuses a review-verdict gate (G.2) with `approve`/`request-changes`/`abort`; D.6 (`completed:validate` red / merge red) spawns a bounded `cockpit-fixer` subagent and, on `{fixed:false}`, opens the G.4a escalation gate; D.5 auto-merges on `completed:validate` green on the premise that "operator judgment was recorded at `waiting-for:implementation-review` (D.3)". Together these drive review→request-changes→fix→re-review rounds and poll PR state to converge them — the dominant remaining consumer of the GitHub GraphQL 5k/hr budget now that the engine owns the loop.

Post-epic-#1120 the engine runs review/remediate/validate server-side, emits a structured verdict, loops delta-scoped re-reviews, raises a remediation-cap gate (`waiting-for:remediation-limit`) when it stops retrying, and moves the `waiting-for:implementation-review` gate to **after** validate as a final human approval. `auto` must react to those gates, not run the loop. This is a **playbook-prose + test edit only**, entirely within `packages/claude-plugin-cockpit/`; no engine, MCP-schema, or cloud change lands here.

The load-bearing edits to `auto.md`:

1. **D.3 → final-approval gate (FR-001 + FR-004, Q1).** `waiting-for:implementation-review` no longer spawns `cockpit-reviewer` and no longer runs the D.2 request-changes guardrail. It becomes a **final human approval** gate: render remaining findings parsed from the gate body if present (no reviewer subagent), present options **`approve`** / **`hold`** / **`reject`**. `approve` → the existing cockpit merge path (merge on green, never on red). `hold` / `reject` → **no-op** — the `waiting-for:implementation-review` label stays and the gate re-fires later (byte-mirrors D.4's `not yet`). The Step 0 pre-draft gate-status check and the `implementation-review` gateType (generation = PR head SHA) are **kept** — they are load-bearing for the #457 / #469 / #471 gate-identity, drift, and adoption machinery. Only the *analysis and verdict-application* content of D.3 changes.
2. **D.6 → ledger-only (FR-001, Q4).** Remove the `cockpit-fixer` dispatch and the G.4a escalation gate entirely. `completed:validate` red (E4 `checks: "red"`, or a red fallback, or a merge returning `result: "red"`) becomes a **ledger-only no-op** that re-fires as an engine gate (remediation / remediation-limit). D.6 stays a recognised dispatch row (E3/E4 still route `checks: "red"` to it) so a red validate is never an unrecognised state (D.10).
3. **G.2 → artifact-only (FR-001 + FR-002).** The review-verdict gate reverts to serving D.2 (`spec`/`clarification`/`plan`/`tasks`) only. Its trigger, presentation, three-option set (`approve`/`request-changes`/`abort`), and request-changes guardrail are **unchanged** for artifacts. The implementation branch (D.3) is removed from G.2 and handled by the new final-approval gate.
4. **New gate: remediation-limit (FR-003, Q2).** Add dispatch row **D.13 — `waiting-for:remediation-limit`** and a new gate contract **G.9 — Remediation-limit gate**. It is a fused human gate: parse remaining findings from the gate body for presentation (no subagent), options **`resume remediation`** / **`stop`**. `resume remediation` → `cockpit_advance(issue=<issue-ref>, gate="remediation-limit")` (resets the engine's remediation counter server-side, mirroring D.4's `cockpit_advance(issue, gate="manual-validation")`). `stop` → exit auto cleanly with **no label writes**.
5. **New gate contract: G.8 — Implementation-review final-approval gate (FR-004).** The presentation/option contract for the repurposed D.3 (kept separate from G.2 so G.2 stays purely the artifact request-changes flow).
6. **Version-skew pre-flight guard (FR-008, Q3).** In § step 1 pre-flight, alongside the existing `command -v generacy` presence check, probe `generacy --version`, parse it, and compare against a documented minimum (`MIN_GENERACY_VERSION`, pinned in the playbook prose — the first generacy build that ships the post-validate gate + `remediation-limit` gate from epic #1120). Below the minimum → abort at pre-flight with a visible operator error naming the required version; do **not** create the ledger dir, do **not** start the loop (mirrors the Monitor-absence and doorbell-absence hard-fails). This closes the old-engine + new-auto silent-strand (an old engine still expects the client to drive review rounds a slimmed `auto` no longer drives).
7. **PR-state polling reduction (FR-005).** Removing D.3's reviewer round-driving and D.6's fixer re-check loop removes the per-round `cockpit_status` / PR-state polling that dominates GraphQL exhaustion; the retained calls are the E3 fallback re-checks (D.8/D.10/D.11) and the single authoritative D.5/D.6 fallback on `checks: absent|pending` — unchanged.
8. **D.9 / D.9a kept ledger-only, unchanged (FR-006, Q5).** No edit; deleting them would strip pins US4/FR-007 forbid weakening and orphan the E3 enriched-line references.
9. **Re-pin `playbook-verification.test.ts` (FR-007, US4).** Every pin that describes the pre-#500 contract (D.3 reviewer dispatch, D.6 bounded-fixer heading, G.2 implementation variant, G.4a, the four-row escalation enum set, the gate-mapping table, ledger vocab, invariant §1/§5) is **re-pinned to the new contract in the same PR** — positive + negative form per the #433 pattern. No assertion is weakened or deleted (CLAUDE.md § "Cockpit playbook pins"). A new `describe("500 …")` block pins the two new gates, the version-skew guard, and the removed-dispatch negatives.

## Technical Context

- **Language / runtime**: `auto.md` is a Claude Code plugin markdown playbook interpreted by the model at slash-command time — there is no compiled code path. The pins that guard the prose are a Vitest suite, `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (currently 5864 lines), that greps the markdown for exact heading strings and contract rules. Any `lib/` TypeScript is a reference implementation of the prose, not the source of truth.
- **Cross-repo dependency (runtime, not build)**: the engine changes ship in the `generacy` package the cluster runs (epic #1120). This PR does not import or build against them; it reacts to the labels/gates they emit and guards the version at pre-flight (FR-008). A cluster below `MIN_GENERACY_VERSION` hard-fails at pre-flight rather than mis-driving.
- **MCP tools consumed (all already bound; none newly introduced)**: `cockpit_advance` (remediation-limit resume, mirrors the existing gate-advance pattern), `cockpit_merge` (final-approval → merge path, reused unchanged), `cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` / `cockpit_gate_ack` (the D.3 Step 0 identity/drift machinery and the two new UI-mode gates), `cockpit_status` (retained fallback re-checks). The `cockpit-reviewer` agent remains bound (still used by D.2); `cockpit-fixer` becomes **unused** by `auto.md` after this change (its only caller was D.6/G.4a-retry).
- **Version probe (FR-008 / Q3)**: `generacy` exposes `.version(VERSION)`, so `generacy --version` is the probe surface — the same CLI `auto` already invokes (`command -v generacy`, `generacy cockpit help doorbell`, `generacy cockpit doorbell`). No new MCP field is needed. `MIN_GENERACY_VERSION` is a load-bearing literal pinned in the playbook prose; its concrete value is the first generacy release that ships epic #1120's post-validate gate + `remediation-limit` gate (a tasks-phase input, sourced from the generacy release notes / the epic).
- **Constraint (Q1=A)**: the final-approval gate presents `approve` / `hold` / `reject`; `approve` → cockpit merge path (merge on green, never on red); `hold`/`reject` → no-op (label stays, re-fires); findings rendered from the gate body if present; **no reviewer subagent** (the engine already ran review/remediate/validate). Resuming remediation from this terminal post-validate gate is out of scope — that resume path is the separate `remediation-limit` gate (Q2).
- **Constraint (Q2=A)**: the remediation-limit gate presents `resume remediation` / `stop`; `resume remediation` → `cockpit_advance(issue=<ref>, gate="remediation-limit")` (resets the engine's counter server-side); `stop` exits cleanly with no label writes. `cockpit_resume` is the WRONG verb (process/paused-issue resume, not a labeled-gate answer) — every engine gate in the playbook resolves via `cockpit_advance(issue, gate=<name>)`.
- **Constraint (Q3=A)**: `generacy --version` pre-flight probe, hard-fail below `MIN_GENERACY_VERSION` with a visible operator error naming the required version. No ledger dir, no loop. Both skew directions are covered — new-engine + old-auto is inert by construction (old auto lacks the new gate rows, so the new gates fall through to D.10 unknown-state on the old client — a visible escalation, not a silent strand); old-engine + new-auto is the case this guard actively blocks.
- **Constraint (Q4=A)**: D.6's bounded-fixer/escalation dispatch is removed **entirely**; `completed:validate` red is ledger-only and re-fires as an engine gate. Retaining even a single autonomous fixer attempt violates SC-002 (zero reviewer/fixer dispatch).
- **Constraint (Q5=A)**: D.9 (`waiting-for:address-pr-feedback`) and D.9a (`waiting-for:pr-feedback`) stay ledger-only rows, unchanged.
- **Constraint (playbook pin rule, CLAUDE.md)**: pins that assert the pre-#500 contract fail on this PR by design; the correct response is re-pinning to the new contract in the same PR, never weakening/deleting.

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo (`.specify/` holds only templates). Applying the plugin-scope `CLAUDE.md` pins and `auto.md § Invariants`:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): this plan **re-pins** — never weakens — every assertion that describes the removed D.3 reviewer / D.6 fixer / G.2 implementation contract, and adds a `describe("500 …")` block for the new gates and the version guard. FR-007 / US4 / SC-001 are satisfied by the re-pinned suite going green. The `readdirSync(COMMANDS_DIR)` invocation-vs-`--help` sweep must stay green — the edits touch dispatch/gate prose, not the invocation contract.
- **§1 Never merge on red** — **re-pinned, preserved in substance.** Today: "anything red routes through the bounded-fixer branch and, if still red, the escalation gate." Post-#500: red validate is ledger-only and re-fires as an engine gate (engine owns remediation); the merge path itself still merges only on `result: merged` and never on red, and the final-approval gate routes `approve` into that same merge path. The guarantee "the branch exits 0 only on `result: merged`" is unchanged.
- **§5 Analysis in subagents** — **re-pinned.** The list of analysis subagents drops `cockpit-fixer` (no longer dispatched by `auto.md`). `cockpit-reviewer` stays (D.2 artifact review). The engine now owns implementation-PR review/fix analysis; the invariant's spirit (cluster-side analysis lives in named subagent hops) is preserved for the workloads that remain cluster-side.
- **§6 Autonomy policy out of scope / every gate prompts** — preserved. The two new gates both prompt; neither auto-proceeds. `approve` and `resume remediation` are operator answers.
- **§3 Add-only advance** — preserved. `hold`/`reject` and `stop` write no labels; `resume remediation` advances via the engine gate path (`cockpit_advance(gate="remediation-limit")`), the same add-only pattern D.4 uses.
- **§7 Stream consumption unfiltered / §8 ledger-only rows cheap / §9 MCP-tool-only** — preserved. D.6-ledger-only strengthens §8's cost contract (a red validate now adds no tool call beyond the ledger append). `remediation-limit` resume and final-approval merge go through `cockpit_*` MCP tools (§9).

**Complexity note**: the one genuine design interaction — the ordering of D.5 (`completed:validate` green → auto-merge) vs. the now-post-validate D.3 final-approval gate — is analysed in research.md § "D.5 / D.3 post-validate ordering". The spec does not list D.5 for change and scopes the merge path as "reused unchanged"; the plan keeps D.5's mechanical merge path intact and routes the final-approval `approve` into that same path, flagging the exact engine emission order as a tasks-phase confirmation against the epic-#1120 design doc.

## Project Structure

### Documentation (this feature)

```text
specs/500-context-review-remediate/
├── spec.md                          (unchanged — read-only)
├── clarifications.md                (unchanged — read-only; Batch 1 Q1–Q5)
├── conversation-log.jsonl           (unchanged — event log)
├── plan.md                          (this file)
├── research.md                      (decisions + clarification anchors + D.5/D.3 ordering + version-min sourcing)
├── data-model.md                    (gate types, dispatch rows, ledger vocab, gate-mapping rows, loop-state)
├── contracts/
│   ├── final-approval-gate.md       (G.8: repurposed D.3 — approve→merge / hold/reject→no-op; findings from gate body)
│   ├── remediation-limit-gate.md    (G.9 / D.13: resume remediation / stop; cockpit_advance(gate="remediation-limit"))
│   ├── version-skew-preflight.md    (generacy --version probe, MIN_GENERACY_VERSION, hard-fail shape)
│   └── removed-dispatch.md          (D.3 reviewer / D.6 fixer / G.4a / G.2-implementation removal + re-pin map)
└── quickstart.md                    (operator usage; engine-native dry-run; version-skew abort demo; test run)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/auto.md                 (EDIT — see § Approach for the surgical edit list)
├── agents/cockpit-fixer.md          (OPTIONAL removal — now unused by auto.md; flagged in tasks, not required for green suite)
└── tests/playbook-verification.test.ts
                                      (EDIT — re-pin pre-#500 assertions to the new contract; new describe("500 …") block)
```

**Files intentionally not touched**:

- **Engine / MCP server / cloud code** — epic #1120 (P1–P4) owns the review/remediate/validate executors, config schema, CI/validate orchestration, and the emission of `waiting-for:remediation-limit` + the post-validate gate move. This PR reacts to those; it does not implement them.
- **D.2 and the G.2 artifact request-changes guardrail** — unchanged (FR-002). The four-step guardrail (pre-validate anchors → POST → two-leg verify → retry-once → re-present) stays exactly as-is for `spec`/`clarification`/`plan`/`tasks`.
- **D.9 / D.9a / D.9b / D.9c / D.9d** — ledger-only rows kept unchanged (FR-006 / Q5).
- **D.5 mechanical merge path** — kept; `approve` on the final-approval gate routes into it (research.md § ordering).
- **The other `commands/*.md` playbooks** (clarify, queue, review, merge, status, watch) — none drive implementation-PR review rounds; the `readdirSync` sweep pins them for invocation-vs-`--help` drift only.
- **`cockpit-reviewer` / `cockpit-validator` / `cockpit-clarifier` / `cockpit-diagnoser` agent definitions** — still used (D.2, D.4, D.1, D.7/D.11 respectively).

## Approach — surgical `auto.md` edit list

Line numbers are current-file anchors; the pins in `playbook-verification.test.ts` key on heading strings, not line numbers.

1. **§ step 1 pre-flight — version-skew guard (FR-008).** After the `command -v generacy` presence check (currently `auto.md:216`) and the `generacy cockpit help doorbell` doorbell-surface probe (`:218`), add a `generacy --version` probe: parse the version, compare against `MIN_GENERACY_VERSION` (a load-bearing literal stated verbatim in the prose). Below minimum → print the verbatim operator error naming the required version, exit non-zero, do NOT `mkdir -p .generacy/cockpit/auto-runs`, do NOT write a ledger line — the exact shape of the Monitor-absence (`:208–214`) and doorbell-absence (`:218–224`) hard-fails. On an unparseable / missing version output, treat as below-minimum (fail closed) with a distinct diagnostic. Contract: `contracts/version-skew-preflight.md`.
2. **§ Dispatch table (`auto.md:530–547`).** D.3 row action → final-approval gate (`approve` → merge / `hold`/`reject` → no-op). D.6 row action → "Ledger line only (engine remediate loop owns red validate; re-fires as engine gate)". Add **D.13 — `waiting-for:remediation-limit`** row → "Remediation-limit gate (`resume remediation` / `stop`)".
3. **§ Enriched-line dispatch contract E3 (`:463–483`).** D.6 stays in the table; its "Source under enriched line" stays `enriched line + checks` (E4 still routes `checks: "red"` here) but the class becomes ledger-*adjacent* (no subagent). Add a D.13 row for `waiting-for:remediation-limit` in the "enriched line" column (a `waiting-for:*` label the doorbell carries in `to`). D.3 row unchanged as a trigger (still enriched).
4. **§ E4 checks verdict (`:485–498`).** `"red"` → D.6 branch: **ledger-only** (was: bounded fixer subagent). Update the table cell and the surrounding prose; keep the `absent|pending` fallback wording.
5. **§ D.3 (`:724–758`).** Keep the trigger, Source-of-truth, and **Step 0** blocks verbatim (identity/drift/adoption machinery). Replace steps 1–4 (Resolve PR → spawn `cockpit-reviewer` → G.2 gate → apply verdict/request-changes guardrail) with the final-approval flow: render findings parsed from the gate body if present (no subagent); present G.8; `approve` → cockpit merge path (merge on green, never on red); `hold`/`reject` → no-op (label stays, re-fires — mirror D.4's `not yet`). Update the D.3 ledger line accordingly.
6. **§ D.6 (`:818–852`).** Remove steps 2–4 (classify → spawn `cockpit-fixer` → re-evaluate → apply escalation verdict), the outcome-scoped fixer prompt, the G.4a escalation-gateType note, and the fixer ledger lines. D.6 becomes: classify (drop the fixer-attempt language) → **ledger line only**; `completed:validate` red re-fires as an engine gate. Keep the "Never merge on red" reference but point it at the merge path, not the fixer branch.
7. **§ D.13 — new (`waiting-for:remediation-limit`).** New dispatch section modeled on D.4's shape: trigger + Source-of-truth (enriched line) + Step 0 pre-draft gate-status check (gateType `remediation-limit`, 1:1 mapping so the drift branch is *enabled*, mirroring D.4) + present G.9 (findings parsed from gate body) + apply verdict (`resume remediation` → `cockpit_advance(issue, gate="remediation-limit")`; `stop` → exit clean, no label writes) + ledger line. Contract: `contracts/remediation-limit-gate.md`.
8. **§ Pre-draft check — shared rules → generation-drift branch guard table (`:566–582`).** Add a `remediation-limit` row (1:1 → D.13 → drift recoverable → drift branch enabled). The `escalation` row's "four rows share one `gateType`" narrative → **"three rows (D.7, D.10, D.11)"** now that D.6 no longer opens an escalation gate. #1046 residual limitation still applies.
9. **§ G.2 (`:1191–1232`).** Trigger → D.2 only. Drop the "(artifact and implementation)" scope from the heading/body and the D.3 references; keep the artifact three-option set and request-changes guardrail unchanged.
10. **§ G.4 (`:1258–1353`).** Remove subtype **(a)** (validate-red/merge-red) entirely: the trigger bullet, the "(a) Validate-red / merge-red" presentation block, the (a) row in the options table, and the `Retry (re-run fixer)` mechanism sentence. Renumber-free: keep (b)/(c)/(d)/(e) labels as-is (they are not sequential letters tied to order). Update "three subtypes" heading count accordingly.
11. **§ G.8 — new (Implementation-review final-approval gate).** New gate contract: trigger D.3; presentation renders findings from the gate body if present (no subagent, no findings-table-from-JSON); options `approve` / `hold` / `reject`; `approve` → cockpit merge path; `hold`/`reject` → no-op. Contract: `contracts/final-approval-gate.md`.
12. **§ G.9 — new (Remediation-limit gate).** New gate contract per D.13 (above).
13. **§ UI-mode gate mapping table (`:1512–1523`).** Remove the **G.4a** row. Change the **G.2** row's transitionClass to drop `implementation` (artifact kinds only). Add a **G.8** row (transitionClass `waiting-for:implementation-review`; options `approve`/`hold`/`reject`; downstream `approve` → merge, `hold`/`reject` → no-op; body = engine findings from gate body). Add a **G.9** row (transitionClass `waiting-for:remediation-limit`; options `resume remediation`/`stop`; downstream resume → `cockpit_advance(gate="remediation-limit")`, stop → exit). 
14. **§ Generation discriminator table (`:1499–1508`).** `implementation-review` row stays (`PR head SHA`) — the gateType is reused by G.8. Add a `remediation-limit` row (discriminator = remediation counter + findings hash, or PR head SHA + counter; DATA-GAP note like the siblings if the counter is not yet computed cluster-side). The `escalation` DATA-GAP note updates "four dispatch rows (D.6/D.7/D.10/D.11)" → "three dispatch rows (D.7/D.10/D.11)".
15. **§ Ledger action+outcome vocabulary (`:1635–1686`).** D.3 row → new action/outcome vocab for the final-approval gate (`implementation-review-approval+merge` / outcomes `merged (PR #<n>)` / `hold` / `reject` / `blocked: …`). D.6 rows → single ledger-only row (`completed:validate:red · (no-op) · engine-owned remediate`); remove the `fixer` and `fixer+escalation-gate` rows. Add a D.13 row (`remediation-limit · escalation-gate` or `remediation-limit-gate` action; outcomes `resumed (advanced)` / `advance failed: <description>` / `stop (exit)`). Update the `source: enriched-line` marker rule list to include D.13 and reflect D.3/D.6 changes.
16. **§ Invariants (`:1772–1782`).** §1 re-pinned (red → engine gate, not fixer branch; merge path still never merges on red). §5 re-pinned (drop `cockpit-fixer` from the subagent list; keep `cockpit-reviewer`).

## Test edits (`playbook-verification.test.ts`) — re-pin, do not weaken

Add a `describe("500 slim auto to gates/queue/clarify/merge", …)` block at the end of the file (after `471`). Re-pin the pre-#500 assertions in-place, positive + negative per the #433 pattern:

- **Re-pin (437 block, ~L2435)**: `437-5` pins the D.6 heading `"D.6 — \`completed:validate\` (red) / merge red → bounded fixer subagent"`. Re-pin to the new ledger-only heading and assert the `bounded fixer` / `cockpit-fixer` phrasing is **absent** from D.6.
- **Re-pin (449 block, ~L2851)**: the G.4a mapping row and its `retry: re-spawn fixer subagent` downstream; the `EXPECTED_GATES` / `expectedGates` arrays that include `G.4a` (L892, L2993). Re-pin `EXPECTED_GATES` to drop `G.4a` and add `G.8`, `G.9`; re-pin the mapping-table assertion to the artifact-only G.2 + new G.8/G.9 rows.
- **Re-pin (457 block, ~L3213)**: `457-9b` ("§ D.6 and § D.10 … bound by the drift guard") → D.10 only (D.6 no longer opens an escalation gate). The Step 0 header arrays that include the D.3 header stay (D.3 keeps Step 0). The generation-discriminator `implementation-review → PR head SHA` pin (L3819) stays.
- **Re-pin (471 block, ~L5243)**: `ESCALATION_DISPATCH_ROWS` pinned as `["D.6","D.7","D.10","D.11"]` (L4041) → `["D.7","D.10","D.11"]`. The `row.gateType ∈ {clarification, artifact-review, implementation-review, manual-validation}` set (L5360) → add `remediation-limit` (the new 1:1 gateType); `implementation-review` stays.
- **Re-pin (469 block, ~L4666)**: `469-25` enumerates gate-verb-issuing dispatch paths including `"D.6 G.4a escalation"` and `"D.3 review-verdict analyzer"` (L5073, L5123). Re-pin: drop `D.6 G.4a`; D.3 no longer dispatches a review-verdict analyzer subagent (it opens G.8 directly) — re-pin the D.3 entry to the final-approval gate open (still a `cockpit_gate_open`, no subagent); add D.13 remediation-limit gate open.
- **Re-pin invariants (403 block or wherever §1/§5 are pinned)**: §1 wording and §5 subagent list.
- **New `500-*` pins**:
  - `500-1`: § step 1 pre-flight declares the `generacy --version` probe, the `MIN_GENERACY_VERSION` literal, and the below-minimum hard-fail (no ledger dir, no loop) with the verbatim operator error — positioned after `command -v generacy`.
  - `500-2`: D.3 opens the final-approval gate (G.8) with options `approve`/`hold`/`reject`; `approve` → cockpit merge path; `hold`/`reject` → no-op. **Negative**: D.3 no longer spawns `cockpit-reviewer` and no longer runs the request-changes guardrail.
  - `500-3`: D.6 is ledger-only; `completed:validate` red re-fires as an engine gate. **Negative**: no `cockpit-fixer` / no G.4a escalation from D.6.
  - `500-4`: G.2 trigger is D.2/artifact-only (the "(artifact and implementation)" / D.3 references removed).
  - `500-5`: D.13 + G.9 present `resume remediation` / `stop`; `resume remediation` → `cockpit_advance(issue, gate="remediation-limit")`; `stop` → exit, no label writes; findings parsed from gate body; no subagent.
  - `500-6`: G.8 renders findings from the gate body, spawns no reviewer subagent.
  - `500-7`: the gate-mapping table has G.8 + G.9 rows and no G.4a row; the generation-discriminator table has `remediation-limit`.
  - `500-8`: escalation enum narrative names three rows (D.7/D.10/D.11), not four.
  - `500-9`: `waiting-for:remediation-limit` is a recognised dispatch row (so it never falls through to D.10 unknown-state).

## Key technical decisions (details in research.md)

| Decision | Choice | Rationale (short) | Anchor |
|----------|--------|-------------------|--------|
| Final-approval gate shape | `approve`→merge / `hold`,`reject`→no-op; findings from gate body; no reviewer subagent | US3/FR-004 scope the gate to "approval routes into merge"; FR-001/SC-002 forbid reviewer/fixer dispatch; resume-remediation is the separate Q2 gate | Q1 |
| Remediation-limit resume | `resume remediation`/`stop`; resume → `cockpit_advance(gate="remediation-limit")` | Every engine gate resolves via `cockpit_advance(issue, gate=<name>)`; `cockpit_resume` is process-resume, wrong verb; advance resets the counter server-side | Q2 |
| Version-skew handling | `generacy --version` pre-flight hard-fail below `MIN_GENERACY_VERSION` | US5 demands non-silent degradation; blocks the old-engine+new-auto silent strand; `generacy` already exposes `.version`; mirrors Monitor/doorbell hard-fails | Q3 |
| D.6 red-checks fixer | Remove entirely; red validate ledger-only, re-fires as engine gate | FR-001 lists D.6 for removal; SC-002 requires zero fixer dispatch; engine owns validate/CI orchestration | Q4 |
| D.9 / D.9a rows | Keep ledger-only, unchanged | Deleting strips pins US4/FR-007 forbid weakening; orphans E3 references; risks legacy alias falling to D.10 | Q5 |
| Keep D.3 gateType `implementation-review` + Step 0 | Reused by G.8; identity/drift/adoption machinery preserved | #457/#469/#471 key gate identity on `(gateType, generation, runId)`; dropping the gateType would strand adoption/dedup for the post-validate gate | derived |
| New gates as own contracts (G.8/G.9), not folded into G.2/G.3 | G.2 stays purely the artifact request-changes flow; G.3 stays manual-validation | Keeps the artifact guardrail (FR-002) untouched and the pin surface clean; new gates render findings from the engine gate body, not a subagent | derived |

## Complexity Tracking

No constitution file → no violations to justify. The only non-mechanical judgment is the D.5/D.3 post-validate ordering (research.md), resolved conservatively by keeping D.5's merge path unchanged and routing final-approval `approve` into it, with a tasks-phase confirmation against the epic-#1120 design doc.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| — | — | — |

## Next step

Run `/speckit:tasks` to generate `tasks.md` with dependency-ordered work items derived from this plan and the four contracts.

---

*Generated by speckit*
