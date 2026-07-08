# Feature Specification: Interpolate the issue ref into every watch-playbook suggestion so it is a one-keystroke handoff

**Branch**: `386-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Draft

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #23 — UX gap observed on the first fully-working watch session.

The watch playbook's suggestion strings omit the issue ref. Transition lines render `· suggested: /cockpit:review --gate implementation-review` and the initial-state table shows the ref in a separate Child column while the Suggested-next cell reads `/cockpit:merge`. Either way, the operator must mentally re-assemble the actual invocation from two pieces (verb + ref) before typing it. The suggestion exists to be a one-keystroke handoff; without the ref it isn't executable.

**Fix (packages/claude-plugin-cockpit/commands/watch.md)**: every suggestion MUST be the complete, executable invocation with the ref interpolated — `/cockpit:merge 2`, `/cockpit:review 3 --gate implementation-review` — using the bare number when the transition's repo matches the session's cwd origin (the common case; the CLI resolves it per generacy#822/#850) and the qualified `owner/repo#N` otherwise. Render each suggestion as an inline code span so it presents as a copyable unit in the chat surface (backtick formatting is the strongest copy affordance available to a playbook; there is no true click-to-copy in command output). Update both the per-transition line format and the initial-state table (Suggested-next cell carries the full command; the Child column stays for scanning).

## User Stories

### US1: Per-transition suggestions are directly executable

**As a** cockpit operator watching an epic,
**I want** each per-transition suggestion line to carry the complete `/cockpit:*` invocation including the child ref,
**So that** I can copy-paste the suggestion straight into the prompt without re-assembling verb + ref from separate cells.

**Acceptance Criteria**:
- [ ] For every non-error transition line, `watch.md`'s output format interpolates the child ref into the suggestion. Examples: `/cockpit:merge 2`, `/cockpit:review 3 --gate implementation-review`, `/cockpit:clarify 4`.
- [ ] The suggestion is wrapped in backticks (inline code span) so the chat surface renders it as a copyable unit. Example line shape: `<transition-line> · suggested: `/cockpit:merge 2``.
- [ ] The bare number (`N`) is used when the transition's repo matches the session's cwd origin — the CLI resolves it per generacy#822/#850. The qualified `owner/repo#N` form is used otherwise.
- [ ] Error-state rows continue to omit the `· suggested: …` segment (unchanged from today).
- [ ] The verb mapping table in `watch.md` is updated so the "Suggested next command" column shows the interpolated shape with a placeholder (e.g. `/cockpit:review <ref> --gate implementation-review`), matching the runtime format the playbook is required to emit.

### US2: Initial-state table suggestion cells are directly executable

**As a** cockpit operator opening a `/cockpit:watch` session,
**I want** the initial-state table's Suggested-next cell to carry the complete executable invocation with the ref,
**So that** I don't have to visually cross-reference the Child column and mentally splice the command.

**Acceptance Criteria**:
- [ ] The initial-state table's Suggested-next cell contains the full invocation with the ref interpolated (e.g. `/cockpit:merge 2`), wrapped in backticks.
- [ ] The Child column is preserved unchanged, so operators can still scan the ref list independently.
- [ ] Bare-number vs qualified-ref selection follows the same rule as US1 (cwd-origin match ⇒ bare; otherwise `owner/repo#N`).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `watch.md` step 2 MUST interpolate the child ref into every non-error suggestion, emitting the complete `/cockpit:<verb> <ref> [flags]` invocation. | P1 | The per-transition fix. |
| FR-002 | Every emitted suggestion MUST be wrapped in a single-backtick inline code span so the chat surface renders it as a copyable unit. | P1 | Copy affordance. |
| FR-003 | The ref MUST be rendered as the bare issue number (`N`) when the transition's repo matches the session's cwd origin, and as the qualified `owner/repo#N` form otherwise. | P1 | CLI resolves per generacy#822/#850. |
| FR-004 | The verb mapping table's "Suggested next command" column MUST show the interpolated shape (with a `<ref>` placeholder) rather than the bare verb. | P1 | Keeps the doc consistent with the runtime output. |
| FR-005 | The initial-state table's Suggested-next cell MUST carry the complete interpolated invocation, wrapped in backticks. | P1 | Table fix. |
| FR-006 | The initial-state table's Child column MUST be preserved unchanged. | P2 | Scanning affordance retained. |
| FR-007 | Error-state rows MUST continue to omit the `· suggested: …` segment. | P2 | Unchanged behavior — preserve today's contract. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Operator can copy a per-transition suggestion straight into the prompt with no editing | 100% of non-error transitions emit a self-contained invocation | Replay the tetrad-development#88 smoke-test session; verify every non-error suggestion is a full, executable line. |
| SC-002 | Initial-state table's Suggested-next cell is executable as-rendered | Every non-error row's Suggested-next cell is a copyable full invocation | Inspect the initial-state table from a live `/cockpit:watch` session with multiple children. |
| SC-003 | Bare-number vs qualified-ref selection is correct | Bare `N` when repo matches cwd origin; `owner/repo#N` otherwise | Run the playbook in a matching-repo cwd and a non-matching cwd; verify the two forms appear as specified. |
| SC-004 | Suggestions render as inline code spans in the chat surface | 100% of suggestions wrapped in backticks | Grep the emitted output for suggestion lines and confirm backtick wrapping. |

## Assumptions

- The generacy CLI accepts both the bare number `N` and the qualified `owner/repo#N` form for `<epic-ref>` / `<child-ref>` arguments; the CLI resolves the bare form against the session's cwd origin per generacy#822/#850.
- Inline code spans (single-backtick) are the strongest copy affordance available inside `/cockpit:*` command output — there is no true click-to-copy mechanism in the playbook chat surface.
- The transition-line format produced by `generacy cockpit watch` includes enough information (child ref, waiting-for state) to synthesize the full invocation without additional CLI calls.
- The initial-state table is produced or annotated by the playbook itself (not by the underlying CLI), so `watch.md` is the correct file to change for both fixes.

## Out of Scope

- Changing the underlying `generacy cockpit watch` CLI output format. This spec covers only the playbook-level rendering.
- Adding a click-to-copy affordance beyond backtick-wrapped code spans.
- Any behavior for error-state rows other than continuing to omit the suggestion segment.
- Retroactively adjusting suggestion-line formatting in other `/cockpit:*` commands (e.g. `status`, `queue`); those are separate playbooks with different output contracts.
- CLI-side changes to the ref-resolution rules established in generacy#822/#850.

---

*Generated by speckit*
