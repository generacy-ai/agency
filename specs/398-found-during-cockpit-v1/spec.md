# Feature Specification: Found during the cockpit v1

**Branch**: `398-found-during-cockpit-v1` | **Date**: 2026-07-10 | **Status**: Draft

## Summary

Found during the cockpit v1.5 auto-mode integration smoke test (generacy-ai/tetrad-development#92), finding #49. Companion to the generacy merge-resolution finding.

## Observed

auto.md's D.5 dispatch row instructs `generacy cockpit merge <pr-ref>` — but the CLI's contract is an **issue** ref (`--help`: "Squash-merge the PR for **<issue>** iff it carries completed:validate…"; v1 merge.md also says `merge <issue>`). Following its playbook, the auto session's first merge attempt passed the PR number: `generacy cockpit merge christrudelpw/sniplink#21`. GitHub's shared issue/PR number space made this fail confusingly rather than loudly: "issue 21" exists (it *is* PR #21), the resolver linked it to an unrelated draft (PR #25), and the session got a plausible-looking `red / missing-label` verdict for a nonsense query — burning a diagnosis round before it re-read `--help` and corrected to issue refs.

## Fix

1. **Correct D.5** to `generacy cockpit merge <issue-ref>` (and its example invocation), matching the CLI `--help` and the assist merge.md.
2. **Add invocation-vs-`--help` drift coverage** to the playbook verification suite (S6 pattern): for each CLI verb a dispatch row invokes, assert the argument kind in the playbook matches the verb's usage string. D.5's mismatch survived the #390-era rewrite and both prior audits because nothing compares the playbook's invocations against the CLI contract.
3. Engine-side guard (nice-to-have, note for the generacy finding's scope): when an issue ref resolves to a number that is actually a pull request, say so — `"#21 is a pull request; pass the issue number (e.g. #10)"` — instead of resolving it.

## Regression test

Playbook audit: every `generacy cockpit <verb>` invocation in commands/*.md parses against the verb's documented usage (argument kind + flags), fixture-driven from `--help` snapshots.


## User Stories

### US1: Auto-mode dispatch instructs the correct merge argument kind

**As** an auto-mode cockpit session following the D.5 dispatch row,
**I want** the playbook's `cockpit merge` invocation to name the same argument kind (`<issue-ref>`) as the CLI's `--help` and the assist `merge.md`,
**So that** my first merge attempt targets the right entity and I don't waste a diagnosis round chasing a confusing `red / missing-label` verdict from a mis-resolved PR-number-as-issue lookup.

**Acceptance Criteria**:
- [ ] D.5 dispatch row in `auto.md` names the merge argument as `<issue-ref>`.
- [ ] The D.5 example invocation uses an issue number (not a PR number) matching the shape shown in `merge.md` and `cockpit merge --help`.
- [ ] Any other D-row references to `cockpit merge` in `auto.md` use the same `<issue-ref>` naming.

### US2: Playbook verification catches invocation-vs-`--help` drift

**As** a maintainer editing a cockpit playbook or CLI verb,
**I want** the playbook verification suite to fail when a dispatch row's `generacy cockpit <verb>` invocation disagrees with the verb's `--help` usage string (argument kind or flags),
**So that** a regression like D.5's `<pr-ref>` vs `<issue-ref>` drift is caught in CI instead of surviving multiple audits and burning session time.

**Acceptance Criteria**:
- [ ] The verification suite parses every `generacy cockpit <verb>` invocation in `packages/claude-plugin-cockpit/commands/*.md`.
- [ ] Each parsed invocation is checked against a fixture derived from the verb's `--help` usage snapshot (argument kind + flags).
- [ ] Drift between a playbook invocation and the verb's usage fails the suite with a message that names the offending file, verb, and mismatch.
- [ ] The suite would have failed on the pre-fix `auto.md` D.5 row (regression fixture).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Update `auto.md` D.5 dispatch row so the merge invocation reads `generacy cockpit merge <issue-ref>` (not `<pr-ref>`). | P1 | Line 171 today. |
| FR-002 | Update the D.5 example invocation and any surrounding narrative in `auto.md` to use an issue number, matching `merge.md` and the CLI `--help`. | P1 | |
| FR-003 | Sweep the rest of `auto.md` for any other `cockpit merge <…>` references and normalize argument kind to `<issue-ref>`. | P1 | See lines 66, 185, 199, 526, 604, 664 for candidates. |
| FR-004 | Add a playbook verification test that snapshots `generacy cockpit <verb> --help` usage strings and asserts each dispatch-row invocation in `commands/*.md` parses against the matching usage (argument kind + declared flags). | P1 | The regression test the issue calls for. |
| FR-005 | Include a fixture that reproduces the pre-fix D.5 drift and confirm the verification suite flags it. | P2 | Guards against re-regression. |
| FR-006 | (Optional / cross-repo note) Track an engine-side guard in the generacy finding so that when an issue ref resolves to a number that is actually a pull request, the CLI says so instead of proceeding. | P3 | Out of this repo's scope — carry as a note for the companion finding. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | An auto-mode session following `auto.md` D.5 verbatim invokes `cockpit merge` with an issue ref on its first attempt. | 100% of first attempts pass the correct argument kind. | Manual walkthrough of D.5 against `--help`; smoke test in the auto-mode integration. |
| SC-002 | Playbook/`--help` drift is caught before merge. | The verification suite fails on drift and passes on match. | CI status of the new verification test on this branch and on a fixture branch containing the pre-fix drift. |
| SC-003 | No further diagnosis rounds are burned by argument-kind ambiguity in auto-mode merges. | Zero occurrences in follow-up cockpit v1.5 smoke tests. | Session logs from the next auto-mode smoke test. |

## Assumptions

- The CLI `--help` output for `generacy cockpit merge` is the authoritative contract; when the playbook and `--help` disagree, the playbook is wrong.
- `--help` output is stable enough to snapshot as a fixture, and drift in the fixture is a signal that both the snapshot and the playbook must be reviewed together.
- Fixing D.5 is a documentation change to `auto.md` in this repo; the engine-side resolver behavior lives in the `generacy` CLI and is tracked separately (companion finding).

## Out of Scope

- Engine-side resolver changes in the `generacy` CLI (issue-vs-PR number disambiguation, better error message). Handoff to the companion generacy finding.
- Broader rewrites of `auto.md` beyond the D.5 correction and the drift audit's flagged sites.
- Changes to the `merge.md` assist playbook — it already uses `<issue>` correctly.

---

*Generated by speckit*
