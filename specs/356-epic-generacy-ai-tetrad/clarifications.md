# Clarifications

Issue: [generacy-ai/agency#356](https://github.com/generacy-ai/agency/issues/356) — `[cockpit] /cockpit:plan command`
Spec: [spec.md](./spec.md)

## Batch 1 — 2026-06-29

### Q1: Cross-repo epic refs & target repo

**Context**: FR-002 accepts bare (`356`) and qualified (`owner/repo#356`) refs, and FR-004 fixes the output path at `docs/epic-<slug>-plan.md`. The epic itself lives in a *different* repo from this feature (`generacy-ai/tetrad-development#85`), and the issue body explicitly says *"Plan: docs/epic-cockpit-plan.md **in tetrad-development**"*. The spec doesn't say where the file is written when the ref points cross-repo, nor which repo a bare numeric ref resolves against.

**Question**: When `<epic-ref>` is given, (a) which repo does a bare numeric (`356`) resolve against, and (b) where is the planning doc written for a cross-repo qualified ref?

**Options**:
- A: Bare → current repo's `gh` default; qualified cross-repo → still write into the **current working tree's** `docs/` (file always lives where the command runs).
- B: Bare → current repo's `gh` default; qualified cross-repo → **reject** with a non-zero error and instruct the developer to `cd` into the target repo.
- C: Bare → current repo; qualified cross-repo → clone-or-fetch the target repo and write into **its** `docs/` (matches the "in tetrad-development" wording).
- D: Bare → **always** resolve against the epic's canonical repo (e.g. `generacy-ai/tetrad-development`); doc always lives in the current working tree.

**Answer**: **A.** The planning doc is written to the current working tree's `docs/`; bare numeric refs resolve against the current repo. Convention: run `/cockpit:plan` from the epic's primary/orchestration repo (where the plan + manifest live) — which is how this epic's `docs/epic-cockpit-plan.md` landed in tetrad-development. Avoids clone/fetch complexity.

### Q2: Slug derivation from epic title

**Context**: FR-004 says the slug is the epic title "lowercased, with non-alphanumerics collapsed to `-`". Real epic titles in this repo include shapes like `[cockpit] /cockpit:plan command` or `Epic: Cockpit`. A naive transform produces `--cockpit----cockpit-plan-command` or `epic--cockpit`, which is not what the issue body's example (`docs/epic-cockpit-plan.md`) implies. The spec is silent on prefix-stripping, dash-collapsing, trimming, and length caps.

**Question**: What slug-normalization rules should apply beyond "lowercase + non-alphanumerics → `-`"?

**Options**:
- A: Collapse runs of `-`, trim leading/trailing `-`. No other transforms. No length cap.
- B: Option A **plus** strip a leading `Epic:` / `Epic ` / `[…]` bracket prefix from the title before slugifying (so `[cockpit] X` → `x`, `Epic: Cockpit` → `cockpit`).
- C: Option B **plus** cap slug at 60 chars (truncate at last `-` boundary).
- D: Use a `slug:` field from the epic body's metadata if present, otherwise fall back to Option B.

**Answer**: **D.** Honor an explicit `slug:` from the epic metadata if present; otherwise strip a leading `Epic:` / `[…]` bracket prefix, lowercase, collapse runs of `-`, trim, and cap at ~60 chars (truncate at a `-` boundary). This yields `Epic: Cockpit` → `cockpit` → `docs/epic-cockpit-plan.md`.

### Q3: US2 append-confirmation mechanism

**Context**: FR-005 / US2 require "explicit developer confirmation" before appending missing canonical sections, but the deliverable (FR-001) is a single `commands/plan.md` slash-command file — these are markdown prompts for Claude, not interactive CLIs with TTY prompts. The spec doesn't define how the confirmation is captured.

**Question**: How is "explicit confirmation" obtained for the append flow?

**Options**:
- A: The command **prints the proposed diff and exits**, instructing the developer to re-run with an explicit `--apply` (or `--append`) flag. Two-step, no in-conversation prompt.
- B: The slash command **asks Claude to prompt the developer in-conversation** ("append these sections? y/n") and only writes on `y`. One-step, conversational.
- C: The command appends **automatically** when sections are missing (no prompt) but emits the `<!-- generacy-cockpit:appended -->` marker so the developer can `git diff` / revert. Confirmation = git review after the fact.

**Answer**: **B.** Prompt in-conversation (`AskUserQuestion`) and append the missing sections only on confirm. Matches the cockpit's assist UX (no separate `--apply` round-trip).

### Q4: "Missing section" detection semantics

**Context**: FR-005 / US2 say the command "diff-detects missing canonical sections" before appending. Real planning docs will have renamed/re-cased/re-ordered headings (e.g., a developer wrote `## Objectives` instead of `## Goals`, or `## goals` lowercased). The spec doesn't define the match rule, which determines whether the append behavior is helpful or noisy.

**Question**: How is a canonical section determined to be "present" in an existing doc?

**Options**:
- A: **Exact** heading match — `## Goals` matches only `## Goals`. Different casing or wording counts as missing → re-appended.
- B: **Case-insensitive, exact text** — `## Goals` matches `## goals` / `## GOALS` but not `## Objectives`.
- C: **Case-insensitive + small alias table** maintained inside the command file (e.g. `Goals ↔ Objectives`, `Non-Goals ↔ Out of Scope`). Anything not aliased counts as missing.
- D: **Any** H2 in the doc counts as "present enough" — append only if the doc has zero H2 sections.

**Answer**: **C.** Case-insensitive match plus a small alias table maintained in the command (`Goals ↔ Objectives`, `Non-Goals ↔ Out of Scope`). Real planning docs rename headings; exact/case-only matching would re-append noisily.

### Q5: Front-matter format for FR-010 metadata

**Context**: FR-010 requires embedding the epic ref and extracted `Phase:` / `Tier:` metadata as a "front-matter block at the top of the file". The spec doesn't specify the syntax. Downstream tooling that reads this metadata depends on the choice.

**Question**: What format should the front-matter block use?

**Options**:
- A: **YAML front-matter** delimited by `---` lines (`---\nepic: …\nphase: …\n---`). Standard, parseable by most static-site tooling.
- B: **A markdown metadata block** under the H1 (e.g. `**Epic**: …  ·  **Phase**: …  ·  **Tier**: …`), matching the style already used in `spec.md` lines 3–7.
- C: **HTML comment block** (`<!-- epic: … | phase: … | tier: … -->`), invisible when rendered but machine-readable.

**Answer**: **B.** A markdown metadata block under the H1 (`**Epic**: … · **Phase**: … · **Tier**: …`), matching `spec.md`'s style — and it is already what #790's parser reads (it parses `**Epic**:` / `Plan:` lines, not YAML front-matter).
