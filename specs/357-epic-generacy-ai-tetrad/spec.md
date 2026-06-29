# Feature Specification: `/cockpit:breakdown` command

**Branch**: `357-epic-generacy-ai-tetrad` | **Date**: 2026-06-29 | **Status**: Draft

## Summary

Epic: generacy-ai/tetrad-development#85 | Phase: P4 | Tier: v2-pipeline | Issue: A4.2

Add the `/cockpit:breakdown` slash command to the `claude-plugin-cockpit` plugin. The command analyses an epic-scoped doc (typically `docs/<epic>-plan.md`) and proposes a phased decomposition: a set of phases and, per phase, the child issues that implement it. It then calls `generacy cockpit manifest` to write the canonical manifest file and appends a corresponding section to the epic doc so the human-readable plan and machine-readable manifest stay in lockstep.

Owns (isolation): `packages/claude-plugin-cockpit/commands/breakdown.md`

Acceptance: Writes a manifest + doc section.

Depends on: G3.1 (generacy engine: cockpit manifest writer), A1.4 (cockpit plugin scaffolding shared by all `/cockpit:*` verbs)

---
Part of the Epic Cockpit. Plan: docs/epic-cockpit-plan.md in tetrad-development (P4 / A4.2).

## User Stories

### US1: Epic owner proposes a phase decomposition

**As an** epic owner driving a multi-phase initiative,
**I want** to run `/cockpit:breakdown <epic-ref>` and have the assistant propose phases + per-phase child issues,
**So that** I can review and approve a single coherent decomposition instead of hand-curating the manifest and the doc separately.

**Acceptance Criteria**:
- [ ] Accepts an epic reference as `$ARGUMENTS` (bare issue number or `owner/repo#N`); passes verbatim to `generacy` for ref resolution.
- [ ] Surfaces a proposal listing each phase (id, title, summary) and the child issues under it (title + one-line scope) for developer review before any write.
- [ ] Allows the developer to approve, edit, or reject the proposal; nothing is written on reject.

### US2: Manifest and doc are written atomically from one source of truth

**As an** epic owner approving the proposal,
**I want** the manifest file and the epic doc section to be written in the same run from the same proposal,
**So that** the manifest (read by `generacy cockpit *` verbs) and the doc (read by humans) cannot drift.

**Acceptance Criteria**:
- [ ] On approval, the command invokes `generacy cockpit manifest` with the approved phase + issue list and exits non-zero on engine failure.
- [ ] On manifest success, the command appends a phase-decomposition section to the epic doc identified by the proposal (typically `docs/<epic>-plan.md`); the appended section is bounded by a stable marker so re-runs replace the section rather than appending duplicates.
- [ ] On manifest failure, the doc is not modified.

### US3: Re-running updates rather than duplicating

**As an** epic owner who needs to revise the breakdown,
**I want** to re-run `/cockpit:breakdown` after the initial run,
**So that** I can refine the decomposition without manually unwinding a stale section or a stale manifest.

**Acceptance Criteria**:
- [ ] A second run on the same epic detects the existing manifest + doc section, shows a diff against the prior proposal, and asks for confirmation before overwriting.
- [ ] On confirmation, both artifacts are replaced in place (manifest overwritten via `generacy cockpit manifest`; doc section replaced between its markers).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Accept one positional `<epic-ref>` (`$ARGUMENTS`); print a usage banner and exit when empty. | P1 | Mirrors `/cockpit:watch` argument handling for consistency. |
| FR-002 | Resolve the target epic doc by shelling out to `generacy` (no in-playbook ref resolution). | P1 | Engine resolver is the single source of truth — same rule as the other `/cockpit:*` verbs. |
| FR-003 | Read the epic doc and any existing manifest as inputs to the proposal. | P1 | If a prior manifest exists, seed the proposal from it so re-runs are deltas, not rewrites. |
| FR-004 | Draft a phase-decomposition proposal: ordered phases (id, title, summary) and, per phase, child issues (title, one-line scope). | P1 | Drafting heuristics are out of scope for the contract — quality is judged in review. |
| FR-005 | Present the proposal for developer approval (approve / edit / reject) before any write. | P1 | Read-mostly until approval, matching `/cockpit:clarify` Step 4. |
| FR-006 | On approval, call `generacy cockpit manifest` with the approved decomposition. | P1 | Delegates manifest schema + write semantics to the engine (G3.1). |
| FR-007 | On manifest success, append a phase-decomposition section to the epic doc, bounded by stable HTML comment markers. | P1 | Markers chosen so re-runs replace the section idempotently. |
| FR-008 | On manifest failure, surface the engine's stderr verbatim and exit non-zero without touching the doc. | P1 | Atomicity from the developer's perspective: never half-written. |
| FR-009 | On re-run, diff the new proposal against the prior manifest and require explicit confirmation before overwriting. | P2 | Prevents silent regressions of approved decompositions. |
| FR-010 | On reject, exit zero with a single status line; do not write either artifact. | P1 | Clean abort path. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Manifest + doc consistency after a run | 100% — every approved run produces a manifest whose phase/issue set matches the appended doc section | Compare manifest JSON to parsed doc section in an integration test. |
| SC-002 | Idempotency under re-run | Re-running with no edits yields no net change to manifest or doc | Diff manifest and doc before/after a no-op re-run; expect empty diff. |
| SC-003 | Atomicity on engine failure | Doc unmodified whenever `generacy cockpit manifest` exits non-zero | Force a manifest-writer failure in test; assert the doc file's mtime/contents are unchanged. |

## Assumptions

- `generacy cockpit manifest` (G3.1) exists and owns the manifest file format, write path, and schema validation; this verb does not duplicate that logic.
- The epic doc lives under `docs/` in the repo identified by `<epic-ref>`'s `owner/repo`, with a name pattern the engine can resolve (e.g., `docs/<epic-slug>-plan.md`).
- Cockpit plugin scaffolding (A1.4) supplies the shared argument-parsing, ref-passing, and exit-code conventions used by every `/cockpit:*` verb.
- The developer reviewing the proposal is the human authority on whether the decomposition is correct; the verb's job is to draft and to write, not to validate phase quality.

## Out of Scope

- Creating the child GitHub issues. This verb writes the manifest + doc only; issue creation is a separate downstream step (likely a future `/cockpit:scaffold` or the existing `taskstoissues` flow).
- Editing or refactoring the epic doc beyond the bounded phase-decomposition section.
- Cross-epic manifests or multi-epic rollups.
- Persisting proposal drafts between invocations — each run drafts fresh from the doc + prior manifest.

---

*Generated by speckit*
