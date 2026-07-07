# Feature Specification: Fix MISSING_BINARY remedy to name the real package and lead with the cluster PATH fix

**Branch**: `378-found-during-cockpit-v1` | **Date**: 2026-07-07 | **Status**: Draft
**Issue**: [generacy-ai/agency#378](https://github.com/generacy-ai/agency/issues/378)

## Summary

Found during the cockpit v1 integration smoke test ([generacy-ai/tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88)).

The `MISSING_BINARY` error-class remedy in the cockpit plugin currently reads:

> The generacy CLI is required but is not on $PATH. Install it with `npm install -g @generacy-ai/cli` (or the prevailing install command) and retry.

Two problems:

1. **Wrong package name.** `@generacy-ai/cli` does not exist on npm; the published package is `@generacy-ai/generacy`. Following the printed remedy verbatim yields an `npm 404`, and the developer has to guess or search.
2. **Wrong primary remedy.** The primary audience for `/cockpit:*` is a Generacy cluster session, where the CLI is already installed under `/shared-packages/node_modules/.bin` but the session may not have that directory on `$PATH` (see [generacy-ai/cluster-base#73](https://github.com/generacy-ai/cluster-base/issues/73)). Telling that developer to `npm install -g` is a red herring — the fix is to put the existing binary on `$PATH`. `npm install -g @generacy-ai/generacy` is only the right remedy for standalone (non-cluster) use.

The wrong string appears in **seven places** that must all stay in sync per the plugin's inline-verbatim convention:

- `packages/claude-plugin-cockpit/README.md` — the canonical Error Handling block (source of truth).
- `packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` — six inlined copies, one per command.

## Clarifications

Resolved 2026-07-07 (see `clarifications.md` for full rationale):

- **Canonical remedy payload** (single line, byte-identical across README and six command files):

  > The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.

- **Remedy format** (Q1): Cluster fix includes an explicit copy-pasteable shell command in an inline backtick-quoted span (no fenced block), so mid-failure readers copy-paste rather than translate prose.
- **Single-line / two-part** (Q2): One line carries both remedies with audience labels (cluster vs standalone). Splitting them across files would violate byte-identity.
- **Byte-for-byte scope** (Q3): Text-only — the payload string is what must match across the seven files. Surrounding markup (README fence vs `Print:` inline backticks in command files) is presentation and stays as-is.
- **README §Installation line 24 update** (Q4): Correct the package name AND add a one-line cross-reference to §Error Handling / MISSING_BINARY. Do not restate the cluster remedy — that would create a new drift site.
- **Verify step in cluster remedy** (Q5): None. Pre-flight (`command -v generacy` failing) is the check that matters; the single-line payload is self-selecting (cluster users run the export, standalone users run the install, and cluster users with empty shared-packages fall through to the install).

## User Stories

### US1: Cluster-session developer hits MISSING_BINARY

**As a** developer running `/cockpit:*` inside a Generacy cluster session,
**I want** the printed remedy to point me at the already-installed CLI under `/shared-packages/node_modules/.bin` and tell me to put it on `$PATH`,
**So that** I recover in one step (a PATH tweak) instead of running an unnecessary global npm install.

**Acceptance Criteria**:
- [ ] The printed `MISSING_BINARY` remedy names `/shared-packages/node_modules/.bin` as the location to check / add to `$PATH` first.
- [ ] Following the printed steps in-order fixes the problem inside a cluster session without any npm install.

### US2: Standalone developer hits MISSING_BINARY

**As a** developer using the cockpit plugin outside a cluster (marketplace install),
**I want** the fallback install command to name a package that actually resolves on npm,
**So that** copy-pasting the command works instead of returning `npm 404`.

**Acceptance Criteria**:
- [ ] The printed fallback install command is `npm install -g @generacy-ai/generacy` (not `@generacy-ai/cli`).
- [ ] The string `@generacy-ai/cli` no longer appears anywhere in `packages/claude-plugin-cockpit/`.

### US3: Plugin maintainer keeps inline copies in sync

**As a** maintainer of the cockpit plugin,
**I want** all six inlined command copies to match the canonical Error Handling block in the README byte-for-byte,
**So that** the inline-verbatim convention continues to hold and a future single-source refactor is trivial.

**Acceptance Criteria**:
- [ ] The `MISSING_BINARY` remedy string in the README and in each of the six `commands/*.md` files is identical.
- [ ] A diff of the remedy string across the seven files produces no output.

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Replace the `MISSING_BINARY` remedy in `packages/claude-plugin-cockpit/README.md` § Error Handling with a version that (a) instructs cluster users to check `/shared-packages/node_modules/.bin` and put it on `$PATH` first, and (b) offers `npm install -g @generacy-ai/generacy` as the standalone fallback. | P1 | Canonical source of truth. |
| FR-002 | Replace the inlined `MISSING_BINARY` remedy in each of the six `packages/claude-plugin-cockpit/commands/{clarify,merge,queue,review,status,watch}.md` files with the exact same string used in the README. | P1 | Inline-verbatim convention — copies must match byte-for-byte. |
| FR-003 | Remove the stale `npm install -g @generacy-ai/cli` reference in the README § Installation "Runtime dependencies" bullet (line 24), replace with the corrected package name (`@generacy-ai/generacy`), AND add a one-line cross-reference to § Error Handling / MISSING_BINARY. Do NOT restate the cluster remedy here — the cross-ref keeps that string single-sourced. | P1 | Same wrong-package-name bug, different location. Cross-ref prevents drift. |
| FR-004 | The final wording MUST NOT contain the string `@generacy-ai/cli`. | P1 | Enforceable via a repo-wide grep. |
| FR-005 | The final wording MUST fit on a single line when inlined into a `commands/*.md` file (the inline copies are single-line per current convention). | P2 | Preserves current file structure; no line-count changes to command files. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | Occurrences of the string `@generacy-ai/cli` in `packages/claude-plugin-cockpit/` | 0 | `grep -r "@generacy-ai/cli" packages/claude-plugin-cockpit/` returns no matches. |
| SC-002 | Occurrences of the corrected `MISSING_BINARY` remedy string across the seven files | 7 (1 README + 6 commands) | Grep for a distinctive fragment of the new remedy string. |
| SC-003 | Cluster smoke test — developer with the CLI installed but not on `$PATH` follows the printed remedy | Recovers without running any npm command | Re-run the scenario from [tetrad-development#88](https://github.com/generacy-ai/tetrad-development/issues/88). |
| SC-004 | Standalone smoke test — developer without the CLI copy-pastes the printed fallback install command | `npm install` succeeds (no 404) | `npm install -g @generacy-ai/generacy` resolves the published package. |

## Assumptions

- The npm package `@generacy-ai/generacy` is (and will remain) the canonical published name of the CLI.
- Cluster sessions consistently install the CLI under `/shared-packages/node_modules/.bin` (per cluster-base#73's shared-packages convention).
- The inline-verbatim convention (each command re-states the Error Handling block rather than importing it) is out of scope to change here — this fix respects it.
- No CLI/binary code changes are required; the bug is entirely in documentation/prompt copy shipped by the cockpit plugin.

## Out of Scope

- Refactoring the six commands to share the Error Handling block via a single source (would break the inline-verbatim convention that is intentional for prompt commands).
- Changes to the `AUTH_FAILURE` or `OTHER` error-class copy — only `MISSING_BINARY` is wrong.
- Any change to the actual pre-flight detection logic (`command -v generacy`) — the detection is correct; only the remedy text is wrong.
- Publishing an `@generacy-ai/cli` alias package on npm to satisfy the current wrong text (not the right fix; the text is what should change).
- Fixing PATH-injection in the cluster-base image itself — tracked separately at [cluster-base#73](https://github.com/generacy-ai/cluster-base/issues/73).

---

*Generated by speckit*
