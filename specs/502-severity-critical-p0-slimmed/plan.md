# Implementation Plan: Fix inverted engine-compatibility gating in `/cockpit:auto`

**Feature**: The slimmed `/cockpit:auto` playbook (`packages/claude-plugin-cockpit/commands/auto.md`) gates engine compatibility on a version literal (`MIN_GENERACY_VERSION = 0.2.0`, `auto.md:226`) that is inverted in **both directions** — it admits legacy npm engines (`0.2.0`–`0.10.2`, all pre-#1120) that then silently strand at `waiting-for:implementation-review`, and rejects the only builds that actually ship #1120 (preview `0.0.0-preview-*`, source `0.1.1`, which sort *below* the literal). Replace the version gate with **hybrid detection** — an advisory pre-flight probe plus an authoritative **runtime gate-placement** signal (does `implementation-review` co-occur with `completed:validate`?) — and **restore a legacy advance-on-approve branch** for pre-relocation / flag-off engines, failing closed with an actionable flag-naming diagnostic only when neither model is detectable. Re-pin `playbook-verification.test.ts` test `500-1` to the corrected mechanism and the exact fail-closed wording.
**Branch**: `502-severity-critical-p0-slimmed`
**Status**: Complete
**Issue**: [generacy-ai/agency#502](https://github.com/generacy-ai/agency/issues/502) — Severity: critical (P0); child of follow-up epic [generacy-ai/generacy#1153](https://github.com/generacy-ai/generacy/issues/1153); regression from [agency#500](https://github.com/generacy-ai/agency/issues/500) / epic [generacy#1120](https://github.com/generacy-ai/generacy/issues/1120)
**Spec**: [spec.md](./spec.md)
**Clarifications**: [clarifications.md](./clarifications.md) — Batch 1: **Q1=D** hybrid detection (advisory pre-flight probe + authoritative runtime gate-placement fallback); **Q2=C** both (route detectable flag-off engines to a legacy advance-on-approve path; fail closed only when neither model detectable); **Q3=C** no reliable pre-flight capability surface exists (verified via `generacy cockpit --help`); **Q4=A** re-pin `500-1` to freeze both the detection mechanism **and** the exact fail-closed diagnostic wording (byte-mirror the sibling pre-flight pins).

## Summary

`auto.md` today runs a single **pre-flight version gate** (`auto.md:226–244`): it parses `generacy --version` and hard-fails the run when the version sorts below `MIN_GENERACY_VERSION = 0.2.0`, documented as "the first release that ships #1120's gate move." Two facts break this guard:

1. **The literal admits the wrong engines.** npm `@generacy-ai/generacy` latest/stable is `0.10.2`, published **before** #1120 (the #1120 changesets are unreleased on `develop`). Every legacy engine in `0.2.0`–`0.10.2` **passes** the `>= 0.2.0` guard — exactly the silently-strand case the guard exists to block.
2. **The literal rejects the right engines.** The only builds that actually ship #1120 report versions **below** `0.2.0`: preview `0.0.0-preview-20260821014149-155b346`, source `0.1.1`. They **fail** the guard.

Worse, **version can never confirm the post-validate model at all** (spec Problem 2): the engine's `reviewPhaseEnabled` / `ciMergeGateEnabled` both default **false** (`generacy worker/config.ts:143,151`). On a stock #1120-bearing but flag-off engine, `waiting-for:implementation-review` still fires **post-implement / pre-validate**; `auto`'s approve path now routes **only** to `cockpit_merge` (`auto.md:772,1496`); `cockpit merge` refuses without `completed:validate` (`merge.ts:36,227-241`); and **no path ever applies `completed:implementation-review`**. The issue strands under `auto` on any flag-off engine regardless of version — the #500 removal of the `cockpit_advance(gate="implementation-review")` legacy path left no working route for the flag-off default that is the **common deployed state**.

This fix is a **playbook-prose + test edit only**, entirely within `packages/claude-plugin-cockpit/`; no engine, MCP-schema, or cloud change lands here (changing engine flag defaults or shipping #1120 to npm is explicitly out of scope). The load-bearing edits to `auto.md`:

1. **Remove the version-literal hard gate (FR-001, FR-003, Q1=D / Q3=C).** Delete the `MIN_GENERACY_VERSION = 0.2.0` comparison and its below-minimum / unparseable hard-fail branches from `§ step 1` pre-flight (`auto.md:226–244`). Version cannot distinguish compatible from incompatible engines, so it must not block the run. The `generacy --version` probe may remain as an **advisory** line (informational only; never exits non-zero on version alone). No engine surface exposes the gate model (Q3=C, verified via `generacy cockpit --help`), so the pre-flight cannot positively confirm capability — it is advisory only, and the authoritative decision defers to runtime.

2. **Add authoritative runtime gate-placement detection at D.3 (FR-001, FR-002).** When `waiting-for:implementation-review` fires (§ D.3, `auto.md:747`), branch on whether `completed:validate` **co-occurs** in the issue's live labels — the authoritative signal, observable only once the phase fires:
   - **`completed:validate` present** → **post-validate (#1120) model.** `approve` → `cockpit_merge(issue=<ref>)` (the current path, unchanged). This is the case the slimmed playbook was designed for.
   - **`completed:validate` absent** → **pre-relocation / flag-off model.** `approve` → **legacy path**: `cockpit_advance(issue=<ref>, gate="implementation-review")` (restore the branch #500 removed entirely), which applies `completed:implementation-review` server-side and lets the engine proceed to validate/merge on its own gate cadence.
   - **Neither model detectable** → **fail closed** (see edit 4).

3. **Restore the legacy advance-on-approve branch in G.8 (FR-002, Q2=C).** § Gate contract G.8 (`auto.md:1478–1500`) currently routes `approve` **only** to the merge path. Add the detection branch: on the flag-off (pre-validate) model, `approve` routes to `cockpit_advance(issue=<ref>, gate="implementation-review")` instead of `cockpit_merge`. `hold`/`reject` stay no-ops in both models. This mirrors the existing G.9 / D.13 `resume remediation` → `cockpit_advance(issue, gate="remediation-limit")` idiom and D.4's `cockpit_advance(issue, gate="manual-validation")` — the same add-only labeled-gate-answer verb (`cockpit_resume` is the wrong verb).

4. **Add the fail-closed branch with an actionable, flag-naming diagnostic (FR-002, FR-004).** When neither the post-validate nor the legacy model can be detected, print a verbatim operator diagnostic that **names the required engine flags** (`reviewPhaseEnabled`, `ciMergeGateEnabled`), explains the strand, and points to the manual-drive fallback (`/cockpit:watch`, `/cockpit:status`, `/cockpit:advance`) — byte-mirroring the shape of the Monitor-absence / doorbell-absence pre-flight hard-fails (`auto.md:208–224`): exit the run non-zero, halt the loop, no admit-and-strand. See research.md § "Where the fail-closed branch fires" for the pre-flight-vs-runtime placement decision deferred to the tasks phase.

5. **Re-pin `playbook-verification.test.ts` test `500-1` (FR-005, Q4=A).** `500-1` (`playbook-verification.test.ts:5887`) currently freezes the wrong literal (`MIN_GENERACY_VERSION = 0.2.0`, the verbatim below-minimum error, the unparseable branch). Re-pin it (per CLAUDE.md § "Cockpit playbook pins" — re-pin to the new contract, never weaken) to assert: (a) the version-literal hard gate is **gone** (negative pin on `MIN_GENERACY_VERSION` / `0.2.0` / the below-minimum error string); (b) the runtime gate-placement detection mechanism (co-occurrence of `implementation-review` with `completed:validate`) and its two routing branches (`cockpit_merge` vs `cockpit_advance(gate="implementation-review")`); (c) the **exact** fail-closed diagnostic wording, including the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag names, byte-mirroring the existing Monitor/doorbell pre-flight pins. A loose assert would drop the load-bearing flag-name contract (FR-005 note).

6. **Preserve the correct-direction inertness (FR-006).** The new-engine + old-`auto` skew is already inert by construction (`auto.md:244`) — an old `auto` lacks the D.13 / G.8 / G.9 rows, so the engine's new gates fall through to D.10 unknown-state escalation (visible, not silent). No new guard for that direction; the FR-006 prose that documents it is retained.

## Technical Context

- **Language / runtime**: `auto.md` is a Claude Code plugin markdown playbook interpreted by the model at slash-command time — there is no compiled code path. The pins that guard the prose are a Vitest suite, `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (6050 lines), that greps the markdown for exact heading strings and contract rules. This is a drift audit, not a smoke test (CLAUDE.md).
- **Detection signal (Q1=D, authoritative)**: the co-occurrence of `waiting-for:implementation-review` with `completed:validate` in the issue's live labels. Both are already surfaced to D.3 — via the enriched doorbell line's `labels` field (§ Enriched-line dispatch contract E3) or the `cockpit_status(issue=<ref>, json=true)` fallback. **No new MCP field, no new engine surface, no new CLI subcommand is introduced.** Detection reads labels D.3 already has.
- **Advisory pre-flight (Q3=C)**: `generacy cockpit --help` exposes only watch/doorbell/status/advance/context/merge/queue/resume/scope/mcp — none report the review/merge-gate model or the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag state (verified at clarify time). No dedicated capability surface exists; adding one is cross-repo and out of scope. The pre-flight `generacy --version` probe therefore cannot confirm capability and is advisory only.
- **MCP tools consumed (all already bound; none newly introduced)**: `cockpit_advance` (legacy advance-on-approve — re-adding the #500-removed `gate="implementation-review"` call; the verb and pattern already exist for `manual-validation` / `remediation-limit`), `cockpit_merge` (post-validate approve path, unchanged), `cockpit_status` (label read fallback, unchanged), plus the D.3 Step 0 identity/drift machinery (`cockpit_gate_open` / `cockpit_gate_status` / `cockpit_gate_list` / `cockpit_gate_ack`) which is **kept intact** — only the verdict-application content of D.3 / G.8 changes.
- **Engine defaults (motivating constraint)**: `reviewPhaseEnabled = false`, `ciMergeGateEnabled = false` (`generacy worker/config.ts:143,151`) are the common deployed state. Fail-closed-only (spec Q2 Option A) would leave stock engines unable to run `auto` at all — the P0 this epic removes. Hence Q2=C: legacy path + fail-closed safety net.
- **Constraint (Q1=D)**: hybrid — advisory pre-flight probe + authoritative runtime gate-placement fallback. A pure pre-flight capability probe is infeasible (Q3=C) and a version literal is proven unreliable (both-directions inversion). Runtime co-occurrence is authoritative because it is the only signal that reflects the actual gate the engine emitted.
- **Constraint (Q2=C)**: route **detectable** flag-off engines to the legacy advance-on-approve path (`cockpit_advance(gate="implementation-review")`); **fail closed** only when neither post-validate nor legacy model can be detected. No silent strand; no admit-and-strand.
- **Constraint (Q4=A)**: `500-1` freezes both the detection mechanism and the exact fail-closed diagnostic wording (flag names verbatim), byte-mirroring the Monitor/doorbell pre-flight pins. FR-004 requires the fail-closed to mirror the sibling idiom; a loose assert would drop the load-bearing flag-name contract.
- **Constraint (playbook pin rule, CLAUDE.md)**: `500-1` asserts the *removed* version literal today, so it fails on this PR by design. The correct response is re-pinning to the new contract in the same PR — never weakening or deleting the assertion.

## Constitution Check

**No `.specify/memory/constitution.md` exists** in this repo (`.specify/` holds only templates; `.specify/memory/` is empty). Applying the plugin-scope `CLAUDE.md` pins and `auto.md § Invariants`:

- **Playbook pin discipline** (CLAUDE.md § "Cockpit playbook pins"): this plan **re-pins** `500-1` to the corrected mechanism and the exact fail-closed wording — never weakens. The `readdirSync(COMMANDS_DIR)` invocation-vs-`--help` sweep must stay green — the edits touch pre-flight / D.3 / G.8 dispatch prose, not the invocation contract.
- **§1 Never merge on red** — **preserved.** The post-validate branch still routes `approve` into the merge path (merge on green, never on red). The new legacy branch routes `approve` to `cockpit_advance(gate="implementation-review")`, which does **not** merge — it hands control back to the engine's own validate→merge gate cadence, so no red merge is possible from the legacy path either.
- **§3 Add-only advance** — **preserved.** The legacy `approve` path advances via `cockpit_advance(issue, gate="implementation-review")` — the same add-only labeled-gate-answer pattern D.4 (`manual-validation`) and D.13 (`remediation-limit`) already use. `hold` / `reject` and the fail-closed exit write no labels.
- **§6 Every gate prompts / autonomy out of scope** — **preserved.** G.8 still prompts `approve` / `hold` / `reject`; the detection branch only changes what `approve` *does*, not whether the gate prompts.
- **§7 Stream consumption unfiltered / §8 ledger-only rows cheap / §9 MCP-tool-only** — **preserved.** Detection reads labels D.3 already resolves (no extra query on the enriched-line path); the legacy advance and the fail-closed both go through existing `cockpit_*` MCP tools / a terminal diagnostic (§9).

**Complexity note**: the one genuine design interaction — whether the fail-closed branch fires at **pre-flight** (FR-004's "no ledger directory / no ledger line" idiom literally applies) or at **runtime D.3** (where detection actually resolves, but the ledger dir already exists) — is analysed in research.md § "Where the fail-closed branch fires" and flagged as a tasks-phase decision. The plan's position: detection is authoritative at runtime, so the fail-closed *decision* is runtime; the fail-closed *diagnostic shape* byte-mirrors the pre-flight idiom (verbatim block, exit non-zero, halt loop) per FR-004, with the ledger-dir clause reconciled during tasks.

## Project Structure

### Documentation (this feature)

```text
specs/502-severity-critical-p0-slimmed/
├── spec.md                          (unchanged — read-only)
├── clarifications.md                (unchanged — read-only; Batch 1 Q1–Q4)
├── conversation-log.jsonl           (unchanged — event log)
├── plan.md                          (this file)
├── research.md                      (decisions, detection-signal analysis, fail-closed placement, version-inversion evidence)
├── data-model.md                    (detection states, D.3 branch table, ledger vocab, loop-state)
├── contracts/
│   ├── capability-detection.md      (the hybrid: advisory pre-flight probe + authoritative runtime gate-placement)
│   ├── legacy-advance-path.md       (restored cockpit_advance(gate="implementation-review") on approve for flag-off)
│   ├── fail-closed-diagnostic.md    (exact flag-naming diagnostic; byte-mirror idiom; where it fires)
│   └── pin-repin-500-1.md           (the 500-1 re-pin map: removed literal → new mechanism + fail-closed wording)
└── quickstart.md                    (operator usage; three engine scenarios; test run)
```

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── commands/auto.md                 (EDIT — remove version gate (:226–244); add D.3/G.8 detection branch + legacy path + fail-closed)
└── tests/playbook-verification.test.ts
                                      (EDIT — re-pin 500-1 to the new mechanism + exact fail-closed wording; negative pin on the removed literal)
```

**Files intentionally not touched**:

- **Engine / MCP server / cloud code** — changing `reviewPhaseEnabled` / `ciMergeGateEnabled` defaults, shipping #1120 to npm, or adding a capability-reporting `generacy` surface are all cross-repo and out of scope (spec § Out of Scope). This PR reacts to the labels the engine emits; it does not change them.
- **D.5 / D.6 / D.4 / the artifact gates (G.1–G.7) / D.13 / G.9** — unchanged. Only D.3 and G.8 (the `waiting-for:implementation-review` gate) and the § step 1 pre-flight version block are edited.
- **The D.3 Step 0 identity/drift/adoption machinery** — kept byte-for-byte (gateType `implementation-review`, generation = PR head SHA, `runId` threading). Only the verdict-application content changes.

## Approach — surgical edit list

1. `auto.md § step 1` pre-flight (`:226–244`): delete the `MIN_GENERACY_VERSION = 0.2.0` comparison, the below-minimum verbatim error, and the unparseable-fail-closed branch. Optionally retain a one-line advisory `generacy --version` echo (never blocking). Keep the FR-006 sentence at `:244` documenting new-engine + old-auto inertness (trim its now-stale reference to the version guard).
2. `auto.md § D.3` (`:747–775`): insert the gate-placement detection step (read `completed:validate` co-occurrence from the enriched line's `labels` / fallback `cockpit_status`), and split the `approve` verdict-application (step 4, `:772`) into the two model branches + the fail-closed branch.
3. `auto.md § Gate contract G.8` (`:1478–1500`): mirror the D.3 branch in the post-gate behavior — `approve` → merge (post-validate) OR `cockpit_advance(gate="implementation-review")` (legacy); document the fail-closed.
4. `auto.md` gate-mapping row G.8 (`:1574`) and the D.3 summary row (`:555`): update the terse `approve` → outcome text to reflect both branches.
5. `auto.md § D.3 Ledger line` (`:775`): extend the outcome vocab to cover the legacy `advanced` outcome and the fail-closed outcome alongside the existing `merged` / `held` / `rejected` / `blocked` / `error`.
6. `playbook-verification.test.ts` `500-1` (`:5887–5912`): re-pin per contracts/pin-repin-500-1.md.

## Next step

`/speckit:tasks` to generate the dependency-ordered task list from this plan and the four contracts.
