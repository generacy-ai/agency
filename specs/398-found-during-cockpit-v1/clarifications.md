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

**Answer**: A — checked-in snapshot files with a repo-local refresh script, each snapshot headed by the `generacy --version` it was captured from. Live invocation (B) makes agency CI depend on installing `@generacy-ai/generacy@preview`, which tests whatever preview happens to be that hour rather than the contract the playbook was written against — version skew masquerading as drift signal. The refresh script should also run happily inside a cluster session (where the CLI always exists) so refreshing is a one-liner during any smoke test.

### Q2: What counts as an "invocation" the suite must check
**Context**: FR-004 says the suite parses "every `generacy cockpit <verb>` invocation in `commands/*.md`" — but narrative mentions exist that are references, not calls (e.g. `auto.md` L197: "It MUST NOT call `generacy cockpit merge`"). The parser needs a boundary or it will flag prose.
**Question**: Which forms should the parser treat as invocations subject to the drift check?
**Options**:
- A: Only lines inside fenced code blocks (```...```) whose first token is `generacy cockpit <verb>`
- B: Inline backtick spans and fenced blocks that parse as a valid invocation with an argument (heuristic-based; excludes bare-verb prose like "MUST NOT call `generacy cockpit merge`")
- C: Every `generacy cockpit <verb>` string regardless of context; authors annotate exceptions inline

**Answer**: B, and this one is load-bearing — the observed D.5 drift lived in a dispatch-**table** row, i.e. an *inline backtick span*, not a fenced block. Option A would false-pass the exact bug that motivated this issue. So: fenced blocks *and* inline spans that parse as verb-plus-argument; bare-verb mentions ("MUST NOT call `generacy cockpit merge`") are excluded by the has-an-argument rule, which needs no author annotations (C's exception comments are drift surfaces of their own).

### Q3: Canonical argument-kind token when sources disagree
**Context**: The spec is internally inconsistent about the token to write in `auto.md` D.5. Spec §Fix says `<issue-ref>`. Spec §Assumptions says `--help` is authoritative — and per the spec, `--help` reads `<issue>` (not `<issue-ref>`). The current `merge.md` slash-command frontmatter uses `<pr-ref>`. The verification suite's match semantics depend on this decision.
**Question**: Which token should `auto.md` D.5 use, and how strict is the fixture's match?
**Options**:
- A: `<issue>` — verbatim from `generacy cockpit merge --help`; verification requires exact string match against the `--help` usage
- B: `<issue-ref>` — as spec §Fix names; verification maps `<issue>` and `<issue-ref>` to the same canonical "issue-ref" kind via an equivalence table in the fixture
- C: Keep playbook tokens aligned with the slash-command wrapper (`merge.md`'s current arg names), not the underlying CLI — different concern, different contract

**Answer**: A — `<issue>`, verbatim from `--help`, exact match. The spec's own §Assumptions declares `--help` authoritative, which settles its internal inconsistency by its own rule. B's equivalence table is a second artifact that can itself drift, defending token cosmetics nobody needs; and if a future `--help` wording change breaks the audit, that's the audit working — the playbook should follow the contract in the same commit that refreshes the snapshot. (C conflates two contracts: `merge.md`'s *slash-command* argument is its own surface; what's audited here is CLI invocations inside playbooks. Note `merge.md`'s `<pr-ref>` frontmatter is itself wrong per this same finding — fix it in passing.)

### Q4: Regression fixture format for FR-005
**Context**: FR-005 asks for "a fixture that reproduces the pre-fix D.5 drift and confirms the verification suite flags it." Format affects test ergonomics and how future regressions get added.
**Question**: How is the pre-fix drift represented as a fixture?
**Options**:
- A: A checked-in markdown fixture file (e.g., `tests/fixtures/398-drift-auto.md`) with just the offending D.5 row and enough surrounding context to parse
- B: An inline test-only string literal in the test file itself
- C: A full snapshot of the pre-fix `auto.md` alongside a diff-style expected-failure assertion

**Answer**: A — a minimal checked-in markdown fixture (offending D.5 row + just enough table context to parse). The suite's real input mode is markdown files, so file fixtures exercise the actual ingestion path, and future drift regressions get a drop-in naming pattern (`<finding>-drift-<command>.md`). C's full pre-fix snapshot is 400 lines of noise around a one-line defect.

### Q5: FR-006 P3 engine-side guard — deliverable in this branch
**Context**: FR-006 is marked "out of this repo's scope — carry as a note for the companion finding." Whether anything ships in this branch (a follow-up issue link, a handoff note) affects how tasks are cut and what "done" looks like.
**Question**: What artifact, if any, belongs in this branch for the engine-side guard handoff?
**Options**:
- A: Nothing — the generacy companion finding already exists; no artifact in this repo
- B: Create a follow-up issue in the `generacy` repo (via `gh issue create`) linking back to #398, and record its number in this spec
- C: Add a short handoff note in this repo (e.g., `docs/handoffs/398-engine-guard.md` or a note in the spec's "Out of Scope") that describes the desired guard for future readers

**Answer**: A, with the number now concrete — nothing ships in this branch: the engine-side guard is filed as **generacy#906** (PR-number-as-issue-ref → error with guidance, folding into #904's resolver work if still open). Record that number in this spec's Out of Scope line and the handoff is complete — no handoff doc (C) needed when the tracking artifact is the issue itself.
