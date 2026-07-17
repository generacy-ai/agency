# Research: Auto-emit playbook-verification re-pin task in `/tasks`

## Decision 1: Emit in `/tasks` only, not `/plan`

**Decision**: The re-pin verification task is emitted by the `/tasks` slash-command skill. `/plan` is not modified.

**Rationale**: Clarifications Q1 answer A. The failure mode observed on #420/#421 is a missing *task* in `tasks.md`, not a missing design note in `plan.md`. `tasks.md` is the artifact the implement phase actually executes; #420's `tasks.md` already carried a "Phase 4: Verification" section (T012), so a verification task's natural home is `/tasks`. Q1's own context asks for "a single, authoritative owner ... without duplication or gaps", ruling out Options C/D (both phases emit, or plan→tasks copy): a plan→tasks copy step is one more thing that can drift in an issue about drift. Option B alone (plan-only) cannot guarantee the task reaches `tasks.md`.

**Alternatives considered**:
- **Both `/plan` and `/tasks` emit (Q1 option C)**: rejected — duplication risk and the drift-about-drift objection above.
- **`/plan` declares, `/tasks` copies verbatim (Q1 option D)**: rejected — same reasoning; a copy step is a drift surface.
- **`/plan` only (Q1 option B)**: rejected — plan declarations do not guarantee `tasks.md` contains the task.

## Decision 2: Injection point is the slash-command skill prompt, not an MCP tool

**Decision**: The emission rule lives in `packages/agency-plugin-spec-kit/commands/tasks.md` (and its mirror in `packages/claude-plugin-agency-spec-kit/commands/tasks.md`), as prompt instructions to the model.

**Rationale**: Clarifications Q2 answer A (with the paths corrected — Q2 explicitly notes that the example paths in Option A were wrong; the real paths are the two `*-spec-kit` copies, NOT `packages/claude-plugin-cockpit/commands/`). A checked-in editable skill prompt file is the right vehicle: (1) it's in this repo, so a PR here ships the fix; (2) the `/tasks` skill already reads spec.md and generates task text, so adding "if spec.md names a playbook, add this task" is a small localized instruction addition; (3) no external tool release is required.

The two-file mirror requirement follows directly: today the files are byte-identical (`wc -l` shows 246 lines each). SC-005 codifies this — the diff must remain empty.

**Alternatives considered**:
- **Speckit MCP tool code (Q2 option B)**: rejected — out of this repo, requires a separate release, higher blast radius for a prompt-level rule.
- **Shared template fragment referenced by both skills (Q2 option C)**: rejected — a third artifact that can drift or fall out of the skill's read path. The current byte-identical mirror is a known invariant already; adding a shared fragment is more novel machinery for a single-line prompt addition.
- **`CLAUDE.md` only, no `/tasks` change (Q2 option D)**: rejected because it's already FR-003 (the acknowledged weaker half of the fix), not a substitute for the durable one. Spec's suggested-fix section calls (2) the "immediate mitigation" and (1) the "real fix"; both ship.

## Decision 3: Scope trigger is `spec.md` file-path glob-parsing, not labels or diff inspection

**Decision**: The `/tasks` prompt instructs the model to parse `spec.md` (and, permissively, the issue body / plan.md if present) for file paths matching `packages/claude-plugin-cockpit/commands/*.md`.

**Rationale**: Clarifications Q3 answer A. Existing specs already name playbook paths explicitly — #420's `spec.md` cites `packages/claude-plugin-cockpit/commands/auto.md` verbatim, and #421 does the same. Glob-parsing today's writing conventions is sufficient; no new authoring discipline is required.

Option D (branch-diff inspection at `/tasks` time) is not viable — at `/tasks` time the implement phase has not run, so the branch diff contains only spec artifacts (`spec.md`, `plan.md`, `clarifications.md`) and never the playbook edit. Option C (`scope:playbook` label) depends on a human remembering to apply it, which is the exact class of gap this issue exists to close. Option B (mandatory frontmatter or a `## Scope` section) demands new authoring discipline for every spec — high tax for one narrow rule.

**Bias**: Permissive. A false positive costs one no-op task the implementer skips (zero remediation cost); a false negative reintroduces the bug this issue closes. If the regex misses a case in the field, tighten it in a follow-up.

## Decision 4: Enumerate pin sites dynamically; widen beyond `extractSubheadingBlock`

**Decision**: The prompt instructs the model to grep `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` at `/tasks` time and enumerate every reader site that could break, not only `extractSubheadingBlock` call sites.

**Rationale**: Clarifications Q4 answer A, amended. The reader-site classes as of today's test file:

| Reader kind | Approx. site(s) | Coverage |
|-------------|-----------------|----------|
| `extractSubheadingBlock(autoMd, "...")` | `:1109`, `:1119`, `:1170`, `:1176` | Exact heading pins — breaks on heading rename. |
| `extractInstructionsSteps` + string assertions | `:1516`, `:1539`, `:1553` (approx) | Contract-rule pins — breaks on loop-shape or step-content change. Test 406-3 (the #420-failing one) is in this class. |
| `readFileSync(AUTO_MD_PATH)` direct | `:286`, `:906`, `:1101`, `:1118`, `:1169`, `:1253` | Broad reads for whole-file checks. |
| `readFileSync(resolve(COMMANDS_DIR, "<file>"))` | `:1504` (watch.md read) and similar | Named-file pins for non-auto playbooks. |
| `readdirSync(COMMANDS_DIR)` sweep | `:515` (test 398-1) | Iterates every playbook file for invocation-vs-`--help` drift. |

A heading-only enumeration would have missed the #420 failure (test 406-3 is `extractInstructionsSteps`, not `extractSubheadingBlock`), and would miss the `:515` sweep that caught #420's `<ref>` vs `<epic-ref>` drift. FR-005 was amended in Q4 accordingly.

**Alternatives considered**:
- **Static maintained list of pin sites in a companion file (Q4 option B)**: rejected — the whole point of the drift-audit is to catch playbook-vs-test divergence; adding a *second* artifact that catalogues the pins introduces the same drift class.
- **Defer enumeration to the implementer at implement time (Q4 options C/D)**: rejected — this is exactly what happened on #420 and #421, and the implementer didn't do it. Pre-computing at `/tasks` time makes the coupling visible before the code edit begins.

## Decision 5: Always emit for any `commands/*.md` match, not only `auto.md`

**Decision**: The rule fires for any file matching `packages/claude-plugin-cockpit/commands/*.md` — `auto`, `clarify`, `merge`, `queue`, `review`, `status`, `watch`.

**Rationale**: Clarifications Q5 answer A, with the premise corrected. Q5's question assumed only `auto.md` has pins; that is false. The `readdirSync(COMMANDS_DIR)` sweep at `playbook-verification.test.ts:515` (test 398-1) iterates **every** `commands/*.md` file for invocation-vs-`--help` drift. That is exactly the check that caught #420's `<ref>` vs `<epic-ref>` mismatch. `watch.md` additionally has a named read at `:1504`. Skipping emission for non-auto playbooks (Q5 option B/D) would miss the sweep coverage.

Option C (a lighter reconnaissance task) is defensible but adds a second task shape the emitter must decide between. Since the sweep coverage is universal, the full re-pin task is never truly a no-op — Option A is simpler and safer.

FR-004's stated justification ("can be pinned in the future") is corrected in the plan to "are already pinned today by the 398-1 sweep."

## Pattern references

- **Byte-identical mirrored skill files**: existing precedent — all nine files in `packages/agency-plugin-spec-kit/commands/` are mirrored in `packages/claude-plugin-agency-spec-kit/commands/` (verified: `diff` returns empty on `tasks.md` today, `wc -l` shows 246 lines each). The mirror invariant is already the convention.
- **Prompt-only rule enforcement**: existing precedent — `packages/claude-plugin-cockpit/commands/auto.md` is a prose playbook whose "rules" are enforced entirely by prompt text (D.x dispatch rows, G.4d gate contract). Adding a rule to `tasks.md` follows the same pattern.
- **`CLAUDE.md` as always-loaded implement-phase context**: project instructions confirm `CLAUDE.md` is loaded into every session. The `## MCP Testing Tools` and `## Development Stack` sections are precedents for short, load-bearing sections adjacent to Packages.
- **Pin-site classes on `playbook-verification.test.ts`**: verified by `grep -n` against the current file (see the reader-site table under Decision 4).

## Sources

- `specs/427-summary-packages-claude-plugin/spec.md` — problem statement, FRs, SCs.
- `specs/427-summary-packages-claude-plugin/clarifications.md` — Batch 1, five resolved questions (2026-07-16).
- `packages/agency-plugin-spec-kit/commands/tasks.md` — current `/tasks` skill prompt (246 lines).
- `packages/claude-plugin-agency-spec-kit/commands/tasks.md` — byte-identical mirror.
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — pin sites enumerated by grep against `extractSubheadingBlock`, `extractInstructionsSteps`, `readFileSync`, `readdirSync`.
- `packages/claude-plugin-cockpit/commands/*.md` — the seven playbook files (`auto`, `clarify`, `merge`, `queue`, `review`, `status`, `watch`).
- `CLAUDE.md` — current 36-line root file; injection site for FR-003.
- PR #424 (fixed #420) and PR #426 (fixed #421) — the two hand-remediated PRs that motivate this feature.
