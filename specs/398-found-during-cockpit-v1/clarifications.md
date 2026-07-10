# Clarifications: Found during the cockpit v1

**Issue**: [#398](https://github.com/generacy-ai/agency/issues/398) | **Branch**: `398-found-during-cockpit-v1`

## Batch 1 — 2026-07-10

### Q1: `--help` snapshot source of truth
**Context**: FR-004 says the verification suite is "fixture-driven from `--help` snapshots" of `generacy cockpit <verb>`. The `generacy` CLI lives outside this repo, so how the snapshots are sourced determines CI infra needs and how the fixture is kept in sync.
**Question**: Where does the verification test obtain each verb's `--help` usage string?
**Options**:
- A: Static fixture files checked into the repo (e.g., `tests/fixtures/help-snapshots/<verb>.txt`), regenerated manually or via a repo-local refresh script
- B: Live invocation of `generacy cockpit <verb> --help` at test time (requires the `generacy` CLI to be on `PATH` in CI)
- C: A hand-maintained JSON/TS manifest declaring the expected argument kind and flags per verb

**Answer**: *Pending*

### Q2: What counts as an "invocation" the suite must check
**Context**: FR-004 says the suite parses "every `generacy cockpit <verb>` invocation in `commands/*.md`" — but narrative mentions exist that are references, not calls (e.g. `auto.md` L197: "It MUST NOT call `generacy cockpit merge`"). The parser needs a boundary or it will flag prose.
**Question**: Which forms should the parser treat as invocations subject to the drift check?
**Options**:
- A: Only lines inside fenced code blocks (```...```) whose first token is `generacy cockpit <verb>`
- B: Inline backtick spans and fenced blocks that parse as a valid invocation with an argument (heuristic-based; excludes bare-verb prose like "MUST NOT call `generacy cockpit merge`")
- C: Every `generacy cockpit <verb>` string regardless of context; authors annotate exceptions inline

**Answer**: *Pending*

### Q3: Canonical argument-kind token when sources disagree
**Context**: The spec is internally inconsistent about the token to write in `auto.md` D.5. Spec §Fix says `<issue-ref>`. Spec §Assumptions says `--help` is authoritative — and per the spec, `--help` reads `<issue>` (not `<issue-ref>`). The current `merge.md` slash-command frontmatter uses `<pr-ref>`. The verification suite's match semantics depend on this decision.
**Question**: Which token should `auto.md` D.5 use, and how strict is the fixture's match?
**Options**:
- A: `<issue>` — verbatim from `generacy cockpit merge --help`; verification requires exact string match against the `--help` usage
- B: `<issue-ref>` — as spec §Fix names; verification maps `<issue>` and `<issue-ref>` to the same canonical "issue-ref" kind via an equivalence table in the fixture
- C: Keep playbook tokens aligned with the slash-command wrapper (`merge.md`'s current arg names), not the underlying CLI — different concern, different contract

**Answer**: *Pending*

### Q4: Regression fixture format for FR-005
**Context**: FR-005 asks for "a fixture that reproduces the pre-fix D.5 drift and confirms the verification suite flags it." Format affects test ergonomics and how future regressions get added.
**Question**: How is the pre-fix drift represented as a fixture?
**Options**:
- A: A checked-in markdown fixture file (e.g., `tests/fixtures/398-drift-auto.md`) with just the offending D.5 row and enough surrounding context to parse
- B: An inline test-only string literal in the test file itself
- C: A full snapshot of the pre-fix `auto.md` alongside a diff-style expected-failure assertion

**Answer**: *Pending*

### Q5: FR-006 P3 engine-side guard — deliverable in this branch
**Context**: FR-006 is marked "out of this repo's scope — carry as a note for the companion finding." Whether anything ships in this branch (a follow-up issue link, a handoff note) affects how tasks are cut and what "done" looks like.
**Question**: What artifact, if any, belongs in this branch for the engine-side guard handoff?
**Options**:
- A: Nothing — the generacy companion finding already exists; no artifact in this repo
- B: Create a follow-up issue in the `generacy` repo (via `gh issue create`) linking back to #398, and record its number in this spec
- C: Add a short handoff note in this repo (e.g., `docs/handoffs/398-engine-guard.md` or a note in the spec's "Out of Scope") that describes the desired guard for future readers

**Answer**: *Pending*
