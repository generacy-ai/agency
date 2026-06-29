# Feature Specification: /cockpit:plan command — planning-doc scaffolder

**Branch**: `356-epic-generacy-ai-tetrad` | **Date**: 2026-06-29 | **Status**: Clarified

**Epic**: generacy-ai/tetrad-development#85 · **Phase**: P4 · **Tier**: v2-pipeline · **Issue**: A4.1
**Owns (isolation)**: `packages/claude-plugin-cockpit/commands/plan.md`
**Depends on**: A1.4 (cockpit plugin scaffold and command-loader contract — see the epic checklist for the resolved issue number)

## Summary

Add a `/cockpit:plan` slash command to the `claude-plugin-cockpit` plugin that scaffolds (or assists in drafting) a top-level *planning document* under `docs/` for an epic. The command is **human-led**: it never auto-merges, never advances a gate, and never overwrites an existing planning doc without explicit confirmation. Its sole engineering contract is to drop a well-formed planning-doc skeleton at a deterministic path and surface the next step to the developer.

This is the developer-side counterpart to `/speckit:plan`. Where `/speckit:plan` generates an `implementation` plan inside `specs/<feature>/plan.md` (per-feature, code-anchored), `/cockpit:plan` generates an `epic-level` planning doc under `docs/` (cross-feature, narrative). The two are non-overlapping and live in distinct namespaces.

## User Stories

### US1: Scaffold a planning doc for a new epic (primary)

**As a** developer kicking off a new epic,
**I want** to run `/cockpit:plan <epic-ref>` and receive a planning-doc skeleton at a deterministic `docs/` path,
**So that** I can fill in the narrative sections (goals, phases, ownership, sequencing) without re-typing the boilerplate every time.

**Acceptance Criteria**:
- [ ] Running `/cockpit:plan <epic-ref>` against an open epic issue creates a file at `docs/epic-<slug>-plan.md` containing the canonical skeleton sections (see FR-003).
- [ ] If the target file already exists, the command does NOT overwrite it; it surfaces the existing path and exits non-destructively.
- [ ] The skeleton includes the epic ref, title, and any metadata (phase/tier) extracted from the epic issue body, pre-filled in the front matter.
- [ ] The command prints the absolute path of the created (or pre-existing) file so the developer can open it immediately.

### US2: Assist an in-progress planning doc (secondary)

**As a** developer who has started a planning doc but left sections blank,
**I want** `/cockpit:plan <epic-ref>` to detect the existing doc and offer to *append* the canonical sections that are missing,
**So that** I can adopt the standard structure without manually merging boilerplate.

**Acceptance Criteria**:
- [ ] When the doc exists, the command diff-detects missing canonical sections and prompts before appending.
- [ ] No section is overwritten — append-only, with a visible separator preceding any appended block.
- [ ] If every canonical section already exists, the command exits 0 with `planning doc already complete: <path>` and does nothing.

## Functional Requirements

| ID     | Requirement                                                                                                                                                                                                                                              | Priority | Notes |
|--------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------|-------|
| FR-001 | The command MUST live at `packages/claude-plugin-cockpit/commands/plan.md` and ship in the cockpit plugin's marketplace entry.                                                                                                                            | P1       | Isolation boundary from issue. |
| FR-002 | The command MUST accept a single positional `<epic-ref>` argument, either bare (`356`) or fully-qualified (`owner/repo#356`). Bare numeric refs MUST resolve against the current repo's `gh` default. For qualified cross-repo refs, the planning doc MUST still be written into the current working tree's `docs/` (the file always lives where the command runs — convention is to invoke `/cockpit:plan` from the epic's primary/orchestration repo). Argument parsing follows the same pattern as `/cockpit:clarify` and `/cockpit:watch`. | P1       | Consistency across cockpit verbs. Cross-repo write location resolved per clarification Q1. |
| FR-003 | The generated skeleton MUST contain these canonical top-level sections, in order: `# <Epic Title>`, `## Context`, `## Goals`, `## Non-Goals`, `## Phases`, `## Ownership / Isolation`, `## Sequencing & Dependencies`, `## Risks`, `## Open Questions`.    | P1       | Skeleton = acceptance criterion. |
| FR-004 | The output file path MUST be derived from the epic ref and title: `docs/epic-<kebab-slug>-plan.md`. Slug derivation: (1) if the epic issue body contains a `slug:` metadata field, use it verbatim; (2) otherwise, strip any leading `Epic:` / `Epic ` / `[…]` bracket prefix from the title, lowercase, replace non-alphanumerics with `-`, collapse runs of `-`, trim leading/trailing `-`, and cap at 60 chars (truncating at the last `-` boundary). E.g. `Epic: Cockpit` → `cockpit` → `docs/epic-cockpit-plan.md`. | P1       | Deterministic so reruns idempotent. Normalization rules resolved per clarification Q2. |
| FR-005 | If the file exists, the command MUST NOT overwrite. It MAY append missing canonical sections (US2) but only after explicit developer confirmation obtained via an in-conversation `AskUserQuestion` prompt (one-step, conversational — no `--apply` round-trip), with an `<!-- generacy-cockpit:appended -->` marker preceding the appended block. "Missing" is determined by case-insensitive heading match plus a small alias table maintained inside the command (e.g. `Goals ↔ Objectives`, `Non-Goals ↔ Out of Scope`); any canonical section not matched by exact-text (case-insensitive) or alias counts as missing. | P1       | Human-led — no destructive writes. Confirmation mechanism resolved per Q3; detection semantics resolved per Q4. |
| FR-006 | The command MUST be a *human-led* verb: it does NOT advance any gate, does NOT post comments on the epic issue, and does NOT call `generacy cockpit advance`.                                                                                             | P1       | Matches "human-led" in issue body. |
| FR-007 | The command MUST surface the absolute output path on success so the developer can open the file in their editor (e.g. `wrote planning skeleton: /workspaces/agency/docs/epic-cockpit-plan.md`).                                                           | P2       | DX. |
| FR-008 | Argument validation: empty `$ARGUMENTS` MUST print a usage line and exit non-destructively. Invalid integer / malformed `owner/repo#N` MUST exit non-zero with a verbatim parse error.                                                                    | P2       | Consistent with sibling verbs. |
| FR-009 | The command MUST resolve the epic issue title via `gh issue view <ref> --json title,body` (or equivalent) before generating the slug; if `gh` is missing or the issue is not found, exit non-zero surfacing the underlying error verbatim.                | P2       | `gh` is a hard runtime dep — same as `/cockpit:clarify`. |
| FR-010 | The skeleton MUST embed the epic ref and any `Phase: …` / `Tier: …` metadata extractable from the epic body as a **markdown metadata block** placed under the H1, formatted as `**Epic**: … · **Phase**: … · **Tier**: …` (matching `spec.md`'s style and the parsing model used by downstream tooling — which reads `**Epic**:` / `Plan:` lines, not YAML front-matter). | P2       | Aids cross-linking. Front-matter format resolved per clarification Q5 (markdown block, not YAML). |

## Success Criteria

| ID     | Metric                                              | Target                                              | Measurement |
|--------|-----------------------------------------------------|-----------------------------------------------------|-------------|
| SC-001 | Skeleton produced for a fresh epic                  | File exists at `docs/epic-<slug>-plan.md`           | File present, contains all FR-003 sections. |
| SC-002 | No data loss on re-run                              | 0 overwrites across all re-runs                     | Compare file mtime + hash between runs; no destructive writes. |
| SC-003 | Argument parity with sibling cockpit verbs          | Same `<epic-ref>` semantics as `/cockpit:watch` / `/cockpit:clarify` | Manual: same input passes for all three. |
| SC-004 | Marketplace publishability                          | Command file loads in the cockpit plugin            | Plugin scaffold (A1.4) lists `plan` alongside `watch`/`review`/`clarify`/`status`/`merge`. |

## Assumptions

- The `docs/` directory exists at the repo root, or the command creates it if missing.
- `gh` CLI is installed and authenticated in the developer's environment (same assumption as `/cockpit:clarify`).
- Epic issues follow the standard body format used elsewhere in this epic (Phase / Tier / Owns / Acceptance / Depends on lines), so the metadata extraction in FR-010 has something stable to parse. An optional `slug:` metadata line MAY appear in the epic body; if present, FR-004 uses it verbatim instead of deriving the slug from the title.
- The cockpit plugin scaffold from A1.4 is in place and the command-loader picks up new `commands/*.md` files without further configuration.

## Out of Scope

- Any *automation* of the planning content itself — this command is explicitly human-led; LLM-generated narrative for the sections is out of scope.
- Posting the planning doc back to the epic issue as a comment.
- Advancing any gate (`generacy cockpit advance`) — `/cockpit:plan` is purely a file-scaffolding verb.
- Cross-repo planning docs (multi-epic in a single doc). One epic → one planning doc.
- The implementation-level `plan.md` for individual features under `specs/<feature>/` — that remains the responsibility of `/speckit:plan` and is unaffected by this command.

---

*Generated by speckit, enhanced for issue #356 ([cockpit] /cockpit:plan command).*
