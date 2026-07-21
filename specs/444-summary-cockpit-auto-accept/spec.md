# Feature Specification: ## Summary

`/cockpit:auto` should accept one or more bare issue numbers — e

**Branch**: `444-summary-cockpit-auto-accept` | **Date**: 2026-07-21 | **Status**: Draft

## Summary

## Summary

`/cockpit:auto` should accept one or more bare issue numbers — e.g. `/cockpit:auto 223, 224, 226` — with the repository inferred from the workspace the command is invoked in. Under the hood the skill auto-creates (or reuses) a lightweight tracking issue seeded with those refs and runs the existing epic-less tracking-mode loop. This removes the requirement that developers author an epic in a specific format before they can use auto, and enables the "Claude found two bugs in conversation → file them → process them" flow.

## Current behavior

`commands/auto.md` step 1 accepts exactly three invocation forms (lines ~21–27):

1. `/cockpit:auto <epic-ref>` — one positional `owner/repo#N` (epic mode)
2. `/cockpit:auto --tracking <issue-ref>` — existing tracking issue (epic-less)
3. `/cockpit:auto --new "<title>"` — files a tracking issue via the G.6 gate, then proceeds epic-less

Anything else (multiple refs, bare numbers) prints usage and exits. Repo is never inferred — every form requires a fully qualified `owner/repo#N` ref.

## Proposed change

Add a fourth invocation form: **issue-number list**.

- `/cockpit:auto 223, 224, 226` (also accept space-separated, and a mix of bare numbers and qualified `owner/repo#N` refs; a single bare number is valid too).
- Token splitting: split args on commas and whitespace, then silently discard empty tokens (so `512,,513`, `512, ,513`, and trailing commas are accepted). Only if zero non-empty tokens remain does the invocation fall through to the usage-error path.
- Duplicate tokens within one invocation are silently deduped after resolution in first-seen order (`512` and `owner/repo#512` collapse to one entry), matching the engine's existing `allRefs` dedup semantics.
- Bare numbers resolve against the workspace repo: run `git remote get-url origin` in the invocation cwd and parse `owner/repo` from it. Resolution MUST happen plugin-side (in the operator's session) before any MCP tool is called — the cockpit MCP server runs in the orchestrator container, so its cwd is meaningless for inference. Fail loudly with a clear message if cwd is not a git repo with a GitHub origin.
- Ref existence check: after resolution+dedup, validate every ref (bare-resolved and qualified cross-repo alike) for existence + accessibility. If any refs are missing or inaccessible, exit with a single diagnostic that names ALL bad refs (not just the first) and create nothing.
- Re-invocation with an identical ref-set: before creating a new tracking issue, look for an open issue in the workspace repo carrying the `cockpit:tracking` label whose resolved ref-set is exactly the same as this invocation's. If found, reuse it (proceed as `invocationForm: tracking-existing` against that ref) and print a "resuming existing session" notice. Overlapping-but-not-identical ref-sets do NOT trigger reuse or refusal — create a fresh tracking issue.
- Otherwise the skill creates a tracking issue seeded with the resolved refs (reuse the Form-3 `--new` path, minus the title prompt):
  - Title convention: `Tracking: auto session YYYY-MM-DD — #N1 #N2 …` including up to 5 refs, then append ` (+K more)` where K is the remaining count (e.g. `Tracking: auto session 2026-07-21 — #223 #224 #226 #227 #228 (+3 more)`). This keeps the title scannable and safely under GitHub's 256-char limit even when some refs are qualified `owner/repo#N` forms.
  - Body: a flat task list of **fully qualified** refs (`- [ ] owner/repo#N` — the engine's resolver rejects bare `#N` in bodies today), no phase headings. The engine already supports flat scope bodies; terminal condition is the existing G.7 scope-drained gate.
  - Apply a `cockpit:tracking` label so synthetic containers are filterable and not mistaken for real epics (create the label if absent).
- After creation, proceed exactly as `invocationForm: tracking-existing` — doorbell/await-events keyed on the new tracking ref, mid-run `cockpit_scope_add` additions land in `## Ad-hoc` as today, and the G.7 scope-drained gate closes the tracking issue when every ref is terminal.
- Update the usage string and the ambiguity rules in step 1 accordingly (bare-number list is only ambiguous with the single-positional epic form when the token matches `owner/repo#N`; qualified single ref keeps its current epic-mode meaning).

## Out of scope

- No engine/MCP schema changes — all four ref-resolution and tracking-issue mechanics live in the plugin playbook.
- Inline phase grouping for issue lists (flat scope only for now).
- Parallel execution of concurrent sessions (cluster worker lease is a separate concern).

## Acceptance criteria

- [ ] `/cockpit:auto 223, 224, 226` in a workspace whose origin is `owner/repo` creates a tracking issue listing `owner/repo#223`, `#224`, `#226` as qualified task-list refs, then enters the standard auto loop against that tracking ref.
- [ ] `/cockpit:auto 223` (single bare number) works the same way.
- [ ] Mixed form `/cockpit:auto 223 other-owner/other-repo#41` resolves bare numbers against the workspace origin and passes qualified refs through unchanged.
- [ ] Invocation outside a git repo (or with a non-GitHub origin) fails with a clear usage/diagnostic message, before any issue is created.
- [ ] Existing forms 1–3 behave exactly as before.
- [ ] The tracking issue carries the `cockpit:tracking` label and the title convention above (≤5 refs inline, then ` (+K more)`).
- [ ] Empty tokens from comma/whitespace splitting (`512,,513`, trailing commas) are silently discarded; usage error fires only when zero non-empty tokens remain.
- [ ] Duplicate refs within one invocation are silently deduped after resolution in first-seen order.
- [ ] Every resolved ref (bare-resolved and qualified) is validated up front; if any are missing/inaccessible, a single diagnostic lists ALL bad refs and no tracking issue is created.
- [ ] Re-invocation with an identical resolved ref-set reuses the existing open `cockpit:tracking` issue (proceeds as `--tracking <ref>` with a "resuming existing session" notice); overlapping-but-not-identical ref-sets create a fresh tracking issue.
- [ ] Run exits via the existing scope-drained gate; the tracking issue is closed on finish.
- [ ] Pinning tests in playbook-verification are re-pinned to the updated auto.md (re-pin, do not weaken).


## User Stories

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
