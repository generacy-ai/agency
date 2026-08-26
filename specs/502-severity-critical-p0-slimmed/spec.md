# Feature Specification: Fix inverted engine-compatibility gating in `/cockpit:auto`

**Branch**: `502-severity-critical-p0-slimmed` | **Date**: 2026-08-21 | **Status**: Draft
**Source**: [generacy-ai/agency#502](https://github.com/generacy-ai/agency/issues/502) — Severity: critical (P0)

## Summary

The slimmed `/cockpit:auto` playbook (`packages/claude-plugin-cockpit/commands/auto.md`) gates on engine compatibility in a way that is wrong in **both directions**, and leaves **no working path** for the generacy engines that exist today.

**Problem 1 — version guard is inverted.** Pre-flight compares `generacy --version` against `MIN_GENERACY_VERSION = 0.2.0` (`auto.md:226`), documented as "the first release that ships #1120's gate move." But:
- npm `@generacy-ai/generacy` latest/stable is **0.10.2**, published **before** #1120 (the #1120 changesets are unreleased on `develop`). Every legacy engine in `0.2.0`–`0.10.2` **passes** the guard — precisely the silently-strand case the guard exists to block.
- The only builds that actually ship #1120 report versions **below** the minimum: preview `0.0.0-preview-20260821014149-155b346`, a source build reports `0.1.1`. The guard **rejects** the compatible engines.
- Pin test `500-1` (`playbook-verification.test.ts:5887`) freezes the wrong literal (`0.2.0`), so it protects the broken behavior.

**Problem 2 — version can never confirm the post-validate model.** Even a correct version literal is insufficient because the engine's `reviewPhaseEnabled` / `ciMergeGateEnabled` both default **false** (`generacy worker/config.ts:143,151`). On a stock #1120-bearing but flag-off engine:
- `waiting-for:implementation-review` still fires **post-implement / pre-validate**.
- `auto`'s approve path now routes **only** to `cockpit_merge` (`auto.md:772,1496`); the old `cockpit_advance(gate="implementation-review")` path was removed entirely.
- `cockpit merge` refuses without `completed:validate` (`merge.ts:36,227-241`).
- **No path ever applies `completed:implementation-review`.**

Result: the issue strands under `auto` on any flag-off engine, **regardless of version**.

**Fix direction (from the issue):** replace the version literal with **capability detection** (engine flags / gate placement — e.g. probe whether the `implementation-review` gate co-occurs with `completed:validate`, or key on a version that genuinely ships #1120 once released), and **restore a legacy-path branch** (advance-on-approve) for pre-relocation engines, or **fail closed** with an actionable message that names the required flags. Update pin test `500-1` to the corrected mechanism in the same PR.

## User Stories

### US1: Operator runs `/cockpit:auto` against a flag-off / legacy engine (Primary)

**As a** cockpit operator driving an epic with `/cockpit:auto`,
**I want** the pre-flight to correctly detect whether the engine drives implementation-review server-side (post-validate) or expects the client to drive it (pre-relocation),
**So that** my run either takes a working path or fails closed with a clear message — never silently strands at `waiting-for:implementation-review`.

**Acceptance Criteria**:
- [ ] Against a stock (flag-off / pre-#1120) engine, `auto` either drives implementation-review to a merge-eligible state via a legacy-path branch, OR fails pre-flight closed with an actionable message naming the required engine flags.
- [ ] An `approve` verdict never leaves the issue stranded with no path to `completed:implementation-review` / `completed:validate`.

### US2: Operator runs `/cockpit:auto` against a #1120-bearing engine

**As a** cockpit operator on a preview / source engine build that ships #1120,
**I want** the compatibility gate to admit that engine even though its version string sorts below `0.2.0`,
**So that** the slimmed playbook's server-side review→remediate→validate→merge model runs as designed.

**Acceptance Criteria**:
- [ ] A #1120-bearing engine (e.g. preview `0.0.0-preview-*`, source `0.1.1`) passes pre-flight and reaches the merge path.
- [ ] Detection is based on capability, not a version literal that the compatible builds fail.

### US3: Maintainer relies on the pin test as a drift audit

**As a** maintainer of the cockpit playbooks,
**I want** pin test `500-1` to freeze the corrected compatibility mechanism,
**So that** the drift audit protects the fixed behavior rather than the inverted guard.

**Acceptance Criteria**:
- [ ] `500-1` asserts the new capability-detection mechanism (or corrected version basis) and its hard-fail / legacy-path contract, per the CLAUDE.md re-pin rule (re-pin to the new contract; do not weaken).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Replace the `MIN_GENERACY_VERSION = 0.2.0` version-literal guard (`auto.md:226`) with **hybrid detection** (Q1=D): an advisory pre-flight capability/version probe for fast-fail, plus a **runtime gate-placement fallback** that is authoritative — observe whether the `implementation-review` gate co-occurs with `completed:validate`. | P0 | Runtime co-occurrence is the authoritative signal; pre-flight is advisory only because no engine surface exposes the gate model (Q3) and version cannot distinguish compatible engines. |
| FR-002 | For pre-relocation / flag-off engines, do **both** (Q2=C): route **detectable** flag-off engines to a **working legacy path** (advance-on-approve, re-adding the `cockpit_advance(gate="implementation-review")` logic #500 removed); **fail closed** only when neither model can be detected, with an actionable diagnostic naming the required engine flags (`reviewPhaseEnabled`, `ciMergeGateEnabled`). | P0 | No silent strand. Must not admit-and-strand. Fail-closed only when neither post-validate nor legacy model is detectable. |
| FR-003 | Admit #1120-bearing engines whose version strings sort below the old literal (preview `0.0.0-preview-*`, source `0.1.1`). | P0 | Detection must not depend on the broken version comparison. |
| FR-004 | Preserve the existing hard-fail idiom for the fail-closed branch: exit non-zero, no ledger directory, no ledger line, no loop — byte-mirroring the Monitor / doorbell / version pre-flight fails. | P0 | Consistency with `auto.md:208-244`. |
| FR-005 | Update pin test `500-1` to freeze **both** the corrected detection mechanism **and** the exact fail-closed diagnostic wording, byte-mirroring the existing Monitor/doorbell/version pre-flight pins (Q4=A); re-pin, do not weaken (per CLAUDE.md playbook-pin rule). | P0 | `playbook-verification.test.ts:5887`. Loose assert would drop the load-bearing flag-name contract. |
| FR-006 | Preserve the correct-direction inertness for new-engine + old-`auto` skew (already inert by construction; no new guard needed for that direction). | P2 | `auto.md:244`. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Flag-off / legacy engine outcome | Working path OR fail-closed with actionable flag-naming message; never silent strand | Exercise `auto` against a stock engine; observe no `waiting-for:implementation-review` dead-end. |
| SC-002 | #1120-bearing engine admitted | Preview `0.0.0-preview-*` and source `0.1.1` pass pre-flight and reach merge path | Exercise `auto` against a #1120 build. |
| SC-003 | Legacy engine rejected/handled | `0.2.0`–`0.10.2` engines are no longer admitted-and-stranded | Verify pre-flight decision for a stable-npm engine. |
| SC-004 | Pin test correctness | `500-1` passes and asserts the corrected mechanism | `pnpm test` on `playbook-verification.test.ts`. |

## Assumptions

- The #1120 changesets remain unreleased on `develop`; npm stable stays at `0.10.2` until #1120 ships, so a version literal cannot distinguish compatible from incompatible engines at spec time.
- **No dedicated pre-flight capability surface exists** (Q3=C): `generacy cockpit --help` exposes only watch/doorbell/status/advance/context/merge/queue/resume/scope/mcp — none report the review/merge-gate model or the `reviewPhaseEnabled` / `ciMergeGateEnabled` flag state. Adding such a surface is cross-repo and out of scope. Detection therefore relies on the authoritative **runtime** signal: whether the `implementation-review` gate co-occurs with `completed:validate` (observable only once the phase fires), with the pre-flight probe advisory-only.
- Engine defaults `reviewPhaseEnabled = false` and `ciMergeGateEnabled = false` (`generacy worker/config.ts:143,151`) are the common deployed state.

## Out of Scope

- Changing engine-side flag defaults or shipping the #1120 release on npm.
- Resuming remediation from the final-approval gate (that is the separate remediation-limit gate G.9 / D.13).
- The new-engine + old-`auto` skew direction (already inert by construction).

---

*Generated by speckit; enhanced from generacy-ai/agency#502*
