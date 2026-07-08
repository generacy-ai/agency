# Feature Specification: Interpolate the issue ref into every watch-playbook suggestion so it is a one-keystroke handoff

**Branch**: `386-found-during-cockpit-v1` | **Date**: 2026-07-08 | **Status**: Draft

## Summary

Found during the cockpit v1 integration smoke test (generacy-ai/tetrad-development#88), finding #23 — UX gap observed on the first fully-working watch session.

The watch playbook's suggestion strings omit the issue ref: transitions render `· suggested: /cockpit:review --gate implementation-review` — so the operator must mentally re-assemble the actual invocation from the verb and a separately displayed ref before typing it. The suggestion exists to be a one-keystroke handoff; without the ref it isn't executable.

Fix (commands/watch.md): every suggestion MUST be the complete, executable invocation with the qualified `owner/repo#N` ref interpolated verbatim from the transition line — `/cockpit:merge owner/repo#2`, `/cockpit:review owner/repo#3 --gate implementation-review`. Render each suggestion as an inline code span so it presents as a copyable unit in the chat surface (backtick formatting is the strongest copy affordance available to a playbook; there is no true click-to-copy in command output). The rule applies to any presentation of a suggestion — the streamed per-transition line and any improvised summary or table alike.

## User Stories

### US1: Per-transition suggestions are directly executable

**As a** cockpit operator watching an epic,
**I want** each per-transition suggestion line to carry the complete `/cockpit:*` invocation including the qualified ref,
**So that** I can copy-paste the suggestion straight into the prompt without re-assembling verb + ref from separate pieces.

**Acceptance Criteria**:
- [ ] For every non-error transition line that carries a ref, `watch.md`'s output format interpolates the ref (in its qualified `owner/repo#N` form) into the suggestion. Examples: `/cockpit:merge owner/repo#2`, `/cockpit:review owner/repo#3 --gate implementation-review`, `/cockpit:clarify owner/repo#4`.
- [ ] The suggestion is wrapped in backticks (inline code span) so the chat surface renders it as a copyable unit. Example line shape: `` <transition-line> · suggested: `/cockpit:merge owner/repo#2` ``.
- [ ] The playbook interpolates the ref the transition line itself names, verbatim — no scope resolution (child vs. epic) and no cwd/origin comparison is performed by the playbook.
- [ ] Error-state rows continue to omit the `· suggested: …` segment (unchanged from today).
- [ ] Non-error transition lines that carry no ref also omit the `· suggested: …` segment (safest fallback, mirrors error-row behavior).
- [ ] The verb mapping table in `watch.md` is updated so the "Suggested next command" column shows the interpolated shape with a `<ref>` placeholder (e.g. `/cockpit:review <ref> --gate implementation-review`), matching the runtime format the playbook is required to emit.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | `watch.md` step 2 MUST interpolate the ref named on the transition line into every non-error suggestion, emitting the complete `/cockpit:<verb> <ref> [flags]` invocation. | P1 | The per-transition fix. |
| FR-002 | Every emitted suggestion MUST be wrapped in a single-backtick inline code span so the chat surface renders it as a copyable unit. | P1 | Copy affordance. |
| FR-003 | The ref MUST always be rendered in the qualified `owner/repo#N` form, interpolated verbatim from the transition line. The playbook performs no cwd/origin comparison and no scope disambiguation. | P1 | Simpler than optimizing for typing; the CLI accepts qualified refs universally per generacy#822/#850, so the suggestion is executable in every session cwd. |
| FR-004 | The verb mapping table's "Suggested next command" column MUST show the interpolated shape using a `<ref>` placeholder (rather than the bare verb). | P1 | Keeps the doc consistent with the runtime output. |
| FR-005 | Any presentation of a suggestion by the playbook — streamed per-transition line, or any improvised summary/table — MUST carry the complete executable invocation with the ref interpolated. | P2 | Generalizes FR-001 across any future rendering surface. |
| FR-006 | Error-state rows MUST continue to omit the `· suggested: …` segment. | P2 | Unchanged behavior — preserve today's contract. |
| FR-007 | Non-error transition lines that carry no ref MUST also omit the `· suggested: …` segment. | P2 | Defensive fallback; the NDJSON schema guarantees refs on actionable transition lines, so this covers schema anomalies gracefully. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Operator can copy a per-transition suggestion straight into the prompt with no editing | 100% of non-error transitions with a ref emit a self-contained invocation | Replay the tetrad-development#88 smoke-test session; verify every non-error suggestion is a full, executable line. |
| SC-002 | Suggestions render as inline code spans in the chat surface | 100% of emitted suggestions wrapped in backticks | Grep the emitted output for suggestion lines and confirm backtick wrapping. |
| SC-003 | Every emitted suggestion uses the qualified `owner/repo#N` form | 100% of emitted suggestions carry a qualified ref | Inspect emitted suggestions in a live watch session; verify none use bare-number form. |
| SC-004 | Refless non-error rows and error rows omit the suggestion segment | 0% of such rows render a `· suggested: …` segment | Feed refless transition lines and error rows through the playbook; verify no suggestion appears. |

## Assumptions

- The generacy CLI accepts the qualified `owner/repo#N` form for `<epic-ref>` / `<child-ref>` arguments in every session cwd per generacy#822/#850, so the qualified suggestion is executable regardless of cwd.
- Inline code spans (single-backtick) are the strongest copy affordance available inside `/cockpit:*` command output — there is no true click-to-copy mechanism in the playbook chat surface.
- The NDJSON transition-line schema emitted by `generacy cockpit watch` guarantees a ref on every actionable transition line; every actionable transition is child-scoped (the line's repo+number IS the subject), so the playbook can interpolate the line's own ref without knowing whether it is child- or epic-scoped.
- The playbook does not render its own initial-state table. The "initial-state table" observed in the smoke-test session was an ad-hoc presentation of the initial transition lines, not a playbook artifact. Any presentation of a suggestion (streamed line or improvised table) follows the same interpolation rule.

## Out of Scope

- Changing the underlying `generacy cockpit watch` CLI output format. This spec covers only the playbook-level rendering.
- Adding a click-to-copy affordance beyond backtick-wrapped code spans.
- Adding table-rendering machinery to the playbook (initial-state table or otherwise).
- Bare-number (`N`) rendering, cwd/origin comparison, or repo-detection logic in the playbook.
- Any behavior for error-state rows other than continuing to omit the suggestion segment.
- Retroactively adjusting suggestion-line formatting in other `/cockpit:*` commands (e.g. `status`, `queue`); those are separate playbooks with different output contracts.
- CLI-side changes to the ref-resolution rules established in generacy#822/#850.

---

*Generated by speckit*
