# Research: `/cockpit:review` command

**Feature**: `/cockpit:review` slash command (A2.4)
**Branch**: `354-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

This document records the technology and pattern decisions behind the `/cockpit:review` implementation. Each section names the chosen approach, the alternatives considered, and the rationale. Decisions traceable to a clarification answer cite `Q#`.

---

## D1: Verb-file format and packaging

**Decision**: Ship as a single markdown file with YAML frontmatter at `packages/claude-plugin-cockpit/commands/review.md`. Use the same shape as the sibling `agency-spec-kit` commands (e.g. `plan.md`, `tasks.md`).

**Alternatives considered**:
- *Multi-file split* (one file per gate): rejected — increases plugin loader surface, complicates the discoverable gate listing (FR-010), and the per-gate divergence is < 20 lines each.
- *Embed gate logic in a TypeScript MCP tool* and have the verb shell out: rejected — outside the isolation envelope declared in the spec (`Owns: packages/claude-plugin-cockpit/commands/review.md`) and adds a build step the cockpit plugin has so far avoided.

**Reference**: `packages/claude-plugin-agency-spec-kit/commands/plan.md` (style template).

---

## D2: PR resolution for the `impl` gate

**Decision**: Delegate entirely to `/cockpit:review-context` (G1.3 / #789). `/cockpit:review` does **no** PR lookup — it calls the helper and uses whatever PR (or error) comes back.

**Alternatives considered**:
- *`gh pr list --search "linked:<issue#> is:open"`*: rejected — duplicates logic owned by G1.3; would diverge over time.
- *Branch-name heuristic (`<issue#>-*`)*: rejected — same reason, plus it loses correctness on rebased/renamed branches.

**Rationale**: Locked by **Q3 → A**. Single-responsibility: G1.3 owns PR resolution, this command owns the review workflow.

---

## D3: Label mutation ownership

**Decision**: `/cockpit:review` never touches labels. The only path to a label change is `/cockpit:advance --gate <name>`, which is the sole owner of the `waiting-for:<name>` → `completed:<name>` transition.

**Alternatives considered**:
- *Direct `gh issue edit --add-label / --remove-label` calls*: rejected — would split label ownership across two commands and risk drift.
- *Transition via a `gate:*` namespace*: rejected — there is no such namespace (Q4 correction).

**Rationale**: Locked by **Q4 → D (correction)**. The spec's original `gate:<name>` assumption was wrong; the real labels are `phase:*` (orchestrator-owned, untouched), `waiting-for:*`, and `completed:*`. `/cockpit:review` reports the transition that `/cockpit:advance` performs; it does not perform it.

---

## D4: Non-`impl` artifact mapping

**Decision**: Hard-code the gate→file mapping inside the command:

| Gate | Artifact |
|------|----------|
| `specify` | `specs/<feature>/spec.md` |
| `clarify` | `specs/<feature>/clarifications.md` |
| `plan` | `specs/<feature>/plan.md` |
| `tasks` | `specs/<feature>/tasks.md` |

No GitHub child-issue fetch for `--gate tasks` in v1.

**Alternatives considered**:
- *Also fetch the GitHub child issues that `/speckit:tasks-issues` created*: rejected — Q1 → A, explicitly excluded from v1 to keep the surface small.
- *Re-summarise `spec.md` for `--gate clarify`*: rejected — Q1 → A picked the clarifications file directly, on the rationale that the developer is reviewing the *answers*, not a re-derived spec.

**Rationale**: Locked by **Q1 → A**. Each gate has one canonical input file; no GitHub fetches; failure mode is "file missing → fail fast with the expected path".

---

## D5: Output schema

**Decision**: Two schemas, gate-conditional:

- **`impl`**: emit `/code-review`'s output verbatim. If `/code-review` already ends with a `Suggested decision:` line, do not append a second one. If it does not, append the standard line.
- **Non-`impl`**: three H2 sections in order — `## Blockers`, `## Open questions`, `## Suggested decision` — followed by a final line `Suggested decision: approve | request-changes | abort` (the literal line, with the chosen verb rendered).

**Alternatives considered**:
- *Single shared severity vocabulary across all gates* (`Blocker / Major / Minor / Info`): rejected — non-`impl` artifacts have no "code findings"; severity adds noise. (Q5)
- *Render summaries as a single markdown table for parseability*: rejected — `/code-review`'s native shape is paragraphs/sections; forcing a table would mangle it on the `impl` path. (Q5)

**Rationale**: Locked by **Q5 → C**. Reuse `/code-review` schema verbatim for `impl`; minimal three-section structure for the rest. Final-line invariant powers SC-005 grep verification.

---

## D6: Approval signal mechanism

**Decision**: Use `AskUserQuestion` (the host primitive) inside `assist` mode to capture approve / request-changes / abort. On `approve`, immediately invoke `/cockpit:advance --gate <name>` in the same run. `auto` mode skips the prompt and advances iff `Suggested decision: approve`. `manual` mode never prompts and never advances.

**Alternatives considered**:
- *Re-invocation with a flag* (`/cockpit:review --gate impl --approve`): rejected — splits the workflow across two commands and loses transcript continuity. (Q2)
- *Out-of-band GitHub label signal* (`approved:impl`): rejected — adds a new label namespace and a second source of truth. (Q2)

**Rationale**: Locked by **Q2 → B (with a mode flag)**. The three-mode design (`assist` / `auto` / `manual`) addresses both interactive and CI/batch scenarios without proliferating new commands.

---

## D7: Feature-directory resolution

**Decision**: Resolve `specs/<feature>/` from the current branch name. The cockpit branch convention is `<issue#>-<slug>`; the matching `specs/` directory is the one whose name begins with the same `<issue#>-`.

**Alternatives considered**:
- *Accept a `--feature <slug>` argument*: deferred — adds surface that the spec does not require; the branch heuristic is sufficient for v1. Can be added later without breaking callers.
- *Always use the most-recently-modified `specs/*` directory*: rejected — non-deterministic and surprising on shared branches.

**Rationale**: Mirrors the assumption in spec Assumptions: "the current branch / working directory unambiguously identifies the active speckit feature". If the branch heuristic fails, fail-fast with the candidate directories listed.

---

## D8: Failure-mode policy

**Decision**: All failures are reported with a single concrete line naming the missing dependency or input. The command never falls back silently to a different gate or mode. Label-mutation paths are guarded by an explicit `approve` signal; any non-`approve` outcome leaves labels untouched (FR-008, SC-004).

**Specific failure responses**:
- Unknown `--gate <name>`: list valid gate names; exit.
- Unknown `--mode <value>`: list valid modes; exit.
- `--gate impl` and review-context returns no/multi PR: surface review-context's message verbatim; exit.
- Non-`impl` gate and artifact file missing: print the expected absolute path; exit.
- `/cockpit:advance` not installed at approval time: print "dependency `/cockpit:advance` not available"; exit with no label changes.

**Rationale**: FR-009 requires fail-fast actionable messages; SC-004 forbids unauthorised label changes. Silent fallback violates both.

---

## Key sources

- **Spec**: `specs/354-epic-generacy-ai-tetrad/spec.md` (this issue)
- **Clarifications**: `specs/354-epic-generacy-ai-tetrad/clarifications.md` (Q1–Q5)
- **Sibling plugin shape**: `packages/claude-plugin-agency-spec-kit/commands/*.md`
- **Plugin scaffold (A1.4)**: `specs/350-epic-generacy-ai-tetrad/` and `packages/claude-plugin-cockpit/`
- **Epic plan**: `docs/epic-cockpit-plan.md` in the `tetrad-development` repo (P2 / A2.4)
- **Upstream issues**: tetrad-development#85 (epic), generacy-ai/agency#788 (G1.2), generacy-ai/agency#789 (G1.3)
