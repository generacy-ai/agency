# Implementation Plan: Fix MISSING_BINARY remedy to name the real package and lead with the cluster PATH fix

**Feature**: Correct the `MISSING_BINARY` error-class remedy in `packages/claude-plugin-cockpit/` so cluster-session developers get a PATH fix first and standalone developers get an install command that names a real npm package (`@generacy-ai/generacy`, not the non-existent `@generacy-ai/cli`).
**Branch**: `378-found-during-cockpit-v1`
**Status**: Complete
**Spec**: [spec.md](spec.md) · **Clarifications**: [clarifications.md](clarifications.md)

## Summary

Replace one string in seven Markdown files. The canonical `MISSING_BINARY` remedy block in `packages/claude-plugin-cockpit/README.md` (§ Error Handling) and its six inlined copies in `packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` are rewritten byte-identically to the payload settled in `clarifications.md`:

> The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.

The README's § Installation "Runtime dependencies" bullet (currently line 24) — which independently references `@generacy-ai/cli` — is fixed in the same change: package name corrected to `@generacy-ai/generacy` and a one-line cross-reference added to § Error Handling / `MISSING_BINARY`. The cluster remedy is NOT restated in § Installation to avoid a new drift site (FR-003).

Zero code changes. Zero build output. The bug lives entirely in prompt copy shipped by the cockpit plugin, so acceptance is a `grep` sweep across the package directory (SC-001, SC-002) plus a re-run of the cluster smoke test that surfaced the bug ([tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88), SC-003) and a standalone install-command copy-paste (SC-004).

## Technical Context

**Language/Version**: Markdown (CommonMark) — Claude Code prompt commands are Markdown files consumed by the harness at runtime.
**Primary Dependencies**: None. This feature ships no runtime code.
- The generacy CLI itself (`@generacy-ai/generacy` on npm) is a *subject* of the remedy string, not a dependency of this change.
- The cluster's `/shared-packages/node_modules/.bin` install location is an assumption governed by [generacy-ai/cluster-base#73](https://github.com/generacy-ai/cluster-base/issues/73); this feature does not change that install path, only how the plugin remedies the resulting missing-PATH failure mode.
**Storage**: None.
**Testing**:
- **Local (deterministic)** — three greps executed from repo root:
  1. `grep -r "@generacy-ai/cli" packages/claude-plugin-cockpit/` MUST return zero matches (SC-001, FR-004).
  2. `grep -rc "In a Generacy cluster session it is already installed" packages/claude-plugin-cockpit/` MUST report `7` distinctive-fragment hits across `README.md` + six `commands/*.md` (SC-002).
  3. `diff <(grep -o 'The generacy CLI is required.*retry.\|.*generacy.$' README.md) <(grep -o ...)` — a `sort -u` on the extracted payload strings across the seven files MUST produce exactly one line (US3 acceptance).
- **Cluster smoke test** — re-run the scenario from [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88) in a cluster session with the CLI installed under `/shared-packages/node_modules/.bin` but absent from `$PATH`. Follow the printed remedy in-order; recovery MUST NOT require any `npm install` command (SC-003, US1).
- **Standalone smoke test** — outside a cluster, copy the fallback `npm install -g @generacy-ai/generacy` verbatim from the printed remedy; the command MUST succeed (no npm 404) (SC-004, US2).
- **No unit tests to add**: there is no code path to cover. The Markdown files are prompt copy; correctness is verified by grep + smoke test, not by a test runner.

**Target Platform**: The `@generacy-ai/claude-plugin-cockpit` npm package (shipped from `packages/claude-plugin-cockpit/`) and its consumers (Claude Code sessions inside and outside Generacy clusters). Because that package's `files` array includes `README.md` and `commands/`, the corrected strings ship in the next preview publish automatically — no workflow or `package.json` edits needed.
**Project Type**: Documentation-only fix inside a publishable pnpm workspace package.
**Performance Goals**: N/A.
**Constraints**:
- **Byte-identical payload across seven files** (FR-002, US3): the payload string in `README.md` § Error Handling and in each of the six `commands/*.md` files must be identical character-for-character. Surrounding presentation (README fenced block vs command-file inline `Print:` context) stays as-is per clarifications Q3 — the constraint is on the *payload text*, not the enclosing Markdown.
- **Single line when inlined** (FR-005): the payload must remain one physical line, because each command file inlines it after `Print:` inside a single Markdown list item. No `\n` inside the payload.
- **No `@generacy-ai/cli` anywhere in the package** (FR-004): enforceable by `grep -r "@generacy-ai/cli" packages/claude-plugin-cockpit/` returning nothing. This includes the § Installation bullet at README.md:24, which is a second site of the same wrong package name (FR-003).
- **Inline-verbatim convention preserved** (Assumptions §3, Out of Scope §1): do NOT refactor the six commands to import the block from README. That refactor is intentionally deferred; this fix respects the convention.
- **Detection logic untouched** (Out of Scope §3): the pre-flight `command -v generacy` check is correct; only the *remedy text* printed on failure changes.
- **Only `MISSING_BINARY` copy changes** (Out of Scope §2): `AUTH_FAILURE` and `OTHER` blocks in the same Error Handling section are correct and are not to be edited.

**Scale/Scope**: One package directory. Seven files edited: `packages/claude-plugin-cockpit/README.md` (two edits — § Installation line 24 and § Error Handling `MISSING_BINARY` block) and six `packages/claude-plugin-cockpit/commands/*.md` files (one edit each — the inline `MISSING_BINARY` line). No files added, no files removed, no other packages touched.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

No `.specify/memory/constitution.md` exists in this repository, so there is no project-specific constitution to check against. General repo hygiene gates that this change honors implicitly:

- **Scope discipline**: The change owns only `packages/claude-plugin-cockpit/**` — no cross-package edits, no CLI code edits, no workflow edits. `git diff --stat` on the resulting commit MUST show exactly seven files, all under `packages/claude-plugin-cockpit/`.
- **Root-cause fix, not bandaid**: The clarifications explicitly ruled out publishing an `@generacy-ai/cli` alias package to make the current wrong text work (Out of Scope §4). The text is what is wrong; the text is what changes.
- **No dead surface**: The plan does not introduce shared-source infrastructure for the inline-verbatim block (single-source refactor is deferred per Out of Scope §1). That would be premature abstraction against the seven-copy count and the intentional convention.
- **One-issue-per-repo boundary**: PATH-injection at the cluster-base image level is tracked separately at [cluster-base#73](https://github.com/generacy-ai/cluster-base/issues/73) and is explicitly Out of Scope §5. This feature ships the plugin-side text fix only.

**Result**: PASS. No violations. Complexity Tracking table below is intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/378-found-during-cockpit-v1/
├── spec.md              # Feature specification (read-only for /plan)
├── clarifications.md    # Q1–Q5 answers integrated into spec (read-only for /plan)
├── plan.md              # This file
├── research.md          # Phase 0 — inline-verbatim convention + cluster PATH context
├── quickstart.md        # Phase 1 — apply-the-fix walkthrough and verification greps
├── contracts/
│   └── remedy-string.contract.md  # The exact byte-identical payload and where it appears
├── checklists/          # (empty; no /checklist run for this feature)
└── conversation-log.jsonl
```

No `data-model.md` — this feature introduces no runtime entities, types, or state. The only "data" is a single string constant living in Markdown copy, captured in `contracts/remedy-string.contract.md`.

### Source Code (repository root)

```text
packages/claude-plugin-cockpit/
├── README.md                         # EDIT: § Installation line 24 + § Error Handling MISSING_BINARY block
└── commands/
    ├── clarify.md                    # EDIT: MISSING_BINARY inline `Print:` line
    ├── merge.md                      # EDIT: MISSING_BINARY inline `Print:` line
    ├── queue.md                      # EDIT: MISSING_BINARY inline `Print:` line
    ├── review.md                     # EDIT: MISSING_BINARY inline `Print:` line
    ├── status.md                     # EDIT: MISSING_BINARY inline `Print:` line
    └── watch.md                      # EDIT: MISSING_BINARY inline `Print:` line
```

**Structure Decision**: The cockpit plugin is a Claude Code prompt-command package (Markdown-only, no `src/`, no build step). Prompt commands under `commands/` are the shipped surface; `README.md` is both npm-visible docs and the declared canonical source of truth for cross-command shared blocks. Editing all seven files in one commit preserves the inline-verbatim convention that the plugin already relies on (see `commands/*.md` line comment `<!-- Canonical source of truth: packages/claude-plugin-cockpit/README.md § Error Handling -->`).

## Phase 0: Research

See [research.md](research.md). Summary of decisions:

- **Why inline-verbatim (not shared-source)**: prompt commands are read by Claude in isolation; a `{{include}}`-style refactor would require a build step this package deliberately lacks. Seven copies + one canonical source + inline `Canonical source of truth:` comment is the current convention and is out of scope to change (Out of Scope §1).
- **Why cluster fix leads**: the `MISSING_BINARY` failure mode was surfaced in a cluster session (tetrad-development#88), and the cluster case is the primary audience for `/cockpit:*`. A standalone-first remedy makes cluster users run an unnecessary `npm install -g`; the cluster-first remedy is a strict superset (cluster users with an empty `/shared-packages/node_modules/.bin` fall through to the standalone install line naturally).
- **Why `@generacy-ai/generacy` (not `@generacy-ai/cli`)**: the published package name is `@generacy-ai/generacy`; `@generacy-ai/cli` yields npm 404. Publishing an alias to make the current wrong text work was considered and rejected (Out of Scope §4).
- **Why a single-line two-part payload**: clarifications Q2 — splitting cluster / standalone across two lines breaks the FR-005 single-line constraint that the six inlined `Print:` lines rely on, and would require the six command files to gain a multi-line inline block (a bigger structural change than a text fix warrants).
- **Why no "verify" step in the cluster remedy**: clarifications Q5 — the pre-flight `command -v generacy` failing is the check that triggered the remedy in the first place; adding a `command -v generacy && echo OK` post-fix step would be redundant and would spend a scarce token budget on repetition rather than actionable guidance.

## Phase 1: Design & Contracts

**Prerequisites**: research.md complete.

Artifacts produced in this phase:

- **[contracts/remedy-string.contract.md](contracts/remedy-string.contract.md)** — the byte-identical payload string, the seven locations it appears, and the grep-based verification queries. This is the sole contract for this feature; there is no runtime API surface.
- **[quickstart.md](quickstart.md)** — a copy-paste-ready sequence for a maintainer to apply the fix and verify it before opening a PR. The quickstart is written as a checklist because the fix is prescriptive: seven specific edits, three verification greps, two smoke tests.

No `data-model.md` — see Project Structure §Documentation. No `contracts/*.openapi.yaml` or similar — the plugin exposes no API; its "contract" with users is the printed remedy text, which is captured in the single Markdown contract above.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified.*

*Empty — Constitution Check passed with no violations.*

---

*Generated by /plan for issue [generacy-ai/agency#378](https://github.com/generacy-ai/agency/issues/378)*
