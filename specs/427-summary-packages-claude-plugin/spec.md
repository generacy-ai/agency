# Feature Specification: ## Summary

`packages/claude-plugin-cockpit/tests/playbook-verification

**Branch**: `427-summary-packages-claude-plugin` | **Date**: 2026-07-16 | **Status**: Draft

## Summary

## Summary

`packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` pins `commands/auto.md` by **exact heading strings and contract rules**. Every speckit issue that edits `auto.md` scopes its tasks to `auto.md` alone and never re-pins the tests — so the PR fails validate (`agent:error` + `failed:validate`) and needs manual remediation before it can merge.

This is structural, not bad luck: it happened on two consecutive issues, and the tasks lists show why — *every* task targeted the playbook, none the tests.

## Evidence

**#420 → PR #424** (Monitor-driven wake-ups). All 12 tasks (T001–T012) targeted `auto.md`; none touched the test. Two failures:

- **406-3** asserted *"auto.md step 4 has no Monitor primitive"* — the exact rule #420 exists to supersede (`expected true to be false`). Remediated by re-pinning to the post-#420 contract: step 2 arms the sensor under `Monitor`, step 4 drains `cockpit_await_events` with `maxWaitMs=1`, plus a new pin that the 55s long-poll must not return (guards SC-001/SC-002).
- **398-1** (drift audit): #420 wrote `generacy cockpit watch <ref>`, but the verb's positional is `<epic-ref>` — verified against generacy `packages/generacy/src/cli/commands/cockpit/watch.ts` (`.argument('<epic-ref>')`), which the checked-in help snapshot matches. Genuine template drift; fixed in `auto.md`.

**#421 → PR #426** (route `blocked:stuck-merge-conflicts` to D.11). The single playbook task renamed the D.11 gate heading to name both labels — which *is* the issue's whole purpose — but **403-4** hardcodes the old heading, so `extractSubheadingBlock` threw `subheading 'D.11 — \`waiting-for:merge-conflicts\` → escalation gate (I've resolved it / Skip / Stop)' not found in auto.md`.

## Why this isn't "just loosen the tests"

The exactness is the point — these are drift audits, and relaxing them to keep them green would delete their value. **398-1 earned its keep in this very batch**: it caught a real invocation-vs-`--help` mismatch that would otherwise have shipped in the playbook.

The gap is not the tests. It's that **the spec/tasks never account for the pins the edit invalidates**.

## Suggested fix

1. **Task template (durable).** When a speckit issue's scope includes `packages/claude-plugin-cockpit/commands/*.md`, `/plan` or `/tasks` should automatically emit a mandatory verification task: *"re-pin `playbook-verification.test.ts` for every heading and contract rule this edit changes — re-pin to the NEW contract; never weaken or delete an assertion to make it pass."*
2. **CLAUDE.md (cheap mitigation).** Agency's `CLAUDE.md` currently doesn't mention `auto.md` or `playbook-verification.test.ts` at all. Add a short section: the pins exist, editing a playbook heading or loop-shape contract will break them, and the correct response is re-pinning to the new contract. `CLAUDE.md` is loaded into every session, so the implement phase would actually see it.

(2) is the immediate mitigation; (1) is the real fix.

## Blast radius (small — this is very fixable)

The file has 36 tests and only **5** `extractSubheadingBlock` exact-heading pins today, so the set a heading rename can break is small and easy to enumerate up front.

## Acceptance criteria

- [ ] A speckit issue that renames an `auto.md` D.x heading or changes a step's loop-shape contract produces a tasks list that includes re-pinning `playbook-verification.test.ts`.
- [ ] The guidance states explicitly that re-pinning means asserting the new contract, not deleting the assertion.
- [ ] Validate passes on such a PR without hand remediation.

## User Stories

### US1: Speckit author editing a playbook

**As a** speckit author writing tasks for an issue that edits a `packages/claude-plugin-cockpit/commands/*.md` playbook,
**I want** the `/plan` and `/tasks` phases to automatically emit a task requiring me to re-pin `playbook-verification.test.ts` against the new contract,
**So that** my PR passes validate on the first run without hand remediation.

**Acceptance Criteria**:
- [ ] Tasks list generated for an issue scoped to `commands/auto.md` (or any `commands/*.md`) contains a mandatory verification task naming `playbook-verification.test.ts`.
- [ ] The task text explicitly says re-pin means asserting the new contract, not deleting or weakening the assertion.
- [ ] The task is emitted regardless of whether the issue's suggested-fix text mentions tests.

### US2: Implementing agent seeing the coupling

**As an** agent in the implement phase who has just edited `commands/auto.md`,
**I want** `CLAUDE.md` to tell me that `playbook-verification.test.ts` pins headings and loop-shape contracts in the playbook,
**So that** I re-pin the tests in the same PR instead of shipping a broken validate.

**Acceptance Criteria**:
- [ ] Agency's `CLAUDE.md` names `packages/claude-plugin-cockpit/commands/auto.md` and `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` and describes the coupling.
- [ ] The guidance states the correct response to a broken pin is re-pinning to the new contract, not loosening or deleting the assertion.

### US3: Cluster operator watching validate outcomes

**As a** cluster operator running a batch of speckit issues that touch playbooks,
**I want** validate to pass on those PRs without me hand-remediating `playbook-verification.test.ts`,
**So that** the batch merges without manual intervention.

**Acceptance Criteria**:
- [ ] A speckit PR that renames a `D.x` heading or changes a step's loop-shape contract in `auto.md` passes validate on first run.
- [ ] No `agent:error` / `failed:validate` transitions attributable to stale playbook-verification pins in the batch.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | When an issue's declared scope includes any file under `packages/claude-plugin-cockpit/commands/*.md`, the `/plan` and/or `/tasks` phase MUST emit a mandatory verification task targeting `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`. | P1 | Durable fix; belongs in the task template. |
| FR-002 | The emitted verification task MUST state that re-pinning means updating assertions to the NEW contract, and MUST forbid weakening or deleting assertions to make the test pass. | P1 | Preserves the drift-audit value of the pins. |
| FR-003 | `CLAUDE.md` at the repository root MUST include a section that names `auto.md` and `playbook-verification.test.ts`, describes the exact-heading and contract-rule pinning, and prescribes re-pinning-to-new-contract as the correct response to a broken assertion. | P1 | Immediate mitigation; loaded into every session. |
| FR-004 | The template rule MUST apply to every file under `packages/claude-plugin-cockpit/commands/*.md`, not only `auto.md`. | P2 | The other playbook files (`review.md`, `merge.md`, etc.) are shipped by the same package and can be pinned in the future. |
| FR-005 | The emitted verification task MUST enumerate the pin sites relevant to the edit — at minimum, every `extractSubheadingBlock` call whose subheading string appears in the edited file. | P2 | Blast radius is small (5 today); listing them keeps the task actionable. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Speckit PRs that edit a `commands/*.md` playbook pass validate on first run without hand remediation. | 100% of such PRs in the next batch | Count PRs with the label pattern `phase:validate` → success on first run vs. `failed:validate` requiring operator fix. |
| SC-002 | Tasks lists for issues scoped to a `commands/*.md` file include the re-pin verification task. | 100% | Grep generated `tasks.md` for a task naming `playbook-verification.test.ts`. |
| SC-003 | No assertion in `playbook-verification.test.ts` is weakened or deleted as a workaround. | 0 net-negative assertions vs. baseline | Compare assertion count / `extractSubheadingBlock` call count before and after each playbook-editing PR. |
| SC-004 | `CLAUDE.md` mentions both `auto.md` and `playbook-verification.test.ts`. | Present | grep. |

## Assumptions

- The `/plan` and `/tasks` templates are the correct injection points for the automatic verification task (rather than, say, a validate-phase hook).
- Task authors reading a template-emitted task recognize the pins and act on it; the template does not need to auto-generate the diff itself.
- The set of playbook files that `playbook-verification.test.ts` pins is enumerable from the test file at spec time.
- `CLAUDE.md` in this repo is loaded into implement-phase agents' context (project instructions confirm this).

## Out of Scope

- Rewriting `playbook-verification.test.ts` to be resilient to heading text or contract-rule drift (would defeat its drift-audit purpose — see "Why this isn't 'just loosen the tests'" above).
- Fixing prior PRs (#424, #426) — those were remediated by hand and are already merged.
- Changing how speckit selects which issues qualify as playbook-scoped edits beyond a path-glob match.
- Extending pins to other packages' playbooks or docs.

---

*Generated by speckit*
