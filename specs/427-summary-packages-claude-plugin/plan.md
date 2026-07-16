# Implementation Plan: Auto-emit playbook-verification re-pin task in `/tasks`

**Feature**: Extend the `/tasks` slash-command skill so that when `spec.md` names any file under `packages/claude-plugin-cockpit/commands/*.md`, `tasks.md` automatically includes a mandatory verification task that re-pins `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` to the NEW contract. Mirror-update both copies of `tasks.md`. Add a matching short section to root `CLAUDE.md`.
**Branch**: `427-summary-packages-claude-plugin`
**Status**: Complete

## Summary

Speckit issues that edit a `packages/claude-plugin-cockpit/commands/*.md` playbook keep failing validate because `playbook-verification.test.ts` pins those playbooks by exact heading and contract rules — and the generated `tasks.md` never lists re-pinning as a task. Two consecutive PRs (#424, #426) needed hand remediation for exactly this reason.

The fix is a **prompt edit** in two places plus a short CLAUDE.md addition. No code, no schemas, no new tools:

1. **`/tasks` skill prompt** gains a "Playbook coupling" rule: if `spec.md` mentions any path matching `packages/claude-plugin-cockpit/commands/*.md`, emit a mandatory verification task naming `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` and enumerate the reader sites relevant to the edited files. The rule text explicitly says re-pinning means asserting the NEW contract, not weakening or deleting assertions.
2. **Mirror the edit** in the byte-identical twin so the two copies do not diverge:
   - `packages/agency-plugin-spec-kit/commands/tasks.md`
   - `packages/claude-plugin-agency-spec-kit/commands/tasks.md`
3. **`CLAUDE.md`** at the repo root gains a short "Cockpit playbook pins" section naming `auto.md` and `playbook-verification.test.ts`, the coupling, and the correct response (re-pin to the new contract).

The scope trigger parses `spec.md` for file paths matching the glob (Q3). Emission is unconditional for any `commands/*.md` match — the `readdirSync(COMMANDS_DIR)` sweep at `playbook-verification.test.ts:515` already pins every playbook file (Q5). Enumeration of pin sites is done by dynamic inspection of `playbook-verification.test.ts` at `/tasks` time (Q4), widened beyond `extractSubheadingBlock` to include `extractInstructionsSteps`, `readFileSync(AUTO_MD_PATH)`, `readFileSync(resolve(COMMANDS_DIR, ...))`, and the `readdirSync(COMMANDS_DIR)` sweep.

## Technical Context

- **Language / Format**: Markdown prompt file (`tasks.md`) consumed by the Claude Code `/tasks` slash-command flow. Plus a Markdown edit to root `CLAUDE.md`.
- **Consumer**: Claude Code sessions running `/speckit:tasks` (or `/tasks` via the agency-spec-kit skills). The LLM reads the skill prompt at command-invocation time.
- **Runtime state**: None. This is a prompt-only change; no persistence, no in-memory state, no new MCP tools.
- **Dependencies**: None new. Depends only on the caller already having `spec.md` on disk (existing `check_prereqs` behavior).
- **Testing**: Two paths.
  1. **Prompt-file byte-identity check** (durable): the two `tasks.md` copies must diff empty (SC-005). Existing precedent — no automated check today, but the assumption is enforced in review.
  2. **Emission verification** (dogfood): the next speckit issue that edits a `commands/*.md` file should produce a `tasks.md` grep-visible reference to `playbook-verification.test.ts` (SC-002).
- **Non-goal**: No changes to `playbook-verification.test.ts` itself, no MCP-tool changes, no new preflight checks, no template scaffolding beyond the two prompt files.

## Constitution Check

No `.specify/memory/constitution.md` exists in this repo. Nothing to check.

## Project Structure

```
packages/agency-plugin-spec-kit/
├── commands/
│   └── tasks.md                           ← primary edit (source of truth for /tasks prompt)
packages/claude-plugin-agency-spec-kit/
├── commands/
│   └── tasks.md                           ← byte-identical mirror; must stay in sync
packages/claude-plugin-cockpit/
├── commands/*.md                          ← trigger glob (unchanged by this feature)
└── tests/
    └── playbook-verification.test.ts      ← referenced by the emitted task; unchanged by this feature
CLAUDE.md                                   ← add "Cockpit playbook pins" section
specs/427-summary-packages-claude-plugin/
├── spec.md                                ← read-only
├── clarifications.md                      ← read-only (Batch 1 resolved 2026-07-16)
├── plan.md                                ← this file
├── research.md                            ← technology / pattern decisions
├── data-model.md                          ← emission-rule and trigger entities
├── quickstart.md                          ← verification scenarios
└── contracts/                             ← empty (no new schemas)
```

### Edit sites

| File | Site | Edit |
|------|------|------|
| `packages/agency-plugin-spec-kit/commands/tasks.md` | New instruction inside "Step 1: Check Prerequisites" step 3 (task organization rules) | Insert a "Playbook coupling — mandatory verification task" bullet: when `spec.md` names any `packages/claude-plugin-cockpit/commands/*.md` path, emit the re-pin task with enumerated reader sites. |
| `packages/claude-plugin-agency-spec-kit/commands/tasks.md` | Same site | Byte-identical mirror edit. |
| `CLAUDE.md` | New top-level section | "## Cockpit playbook pins" — 5–10 lines naming `auto.md` and `playbook-verification.test.ts`, describing the coupling, and prescribing re-pinning-to-new-contract. |

### The emitted task text (canonical form the prompt instructs the model to generate)

Copied here so plan reviewers see the exact obligation being programmed into the prompt. The prompt does NOT emit this verbatim from a template file — it instructs the model to generate a task with this shape, filled in with the specific pin sites the model finds at `/tasks` time.

```markdown
- [ ] T### [Story] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: <list of commands/*.md paths from spec.md>
  Pin sites that read the edited file(s):
    - <line>: <test description> (<extractSubheadingBlock | extractInstructionsSteps | readFileSync | readdirSync sweep>)
    - ...
  Re-pinning means updating the assertion to the NEW contract.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.
```

## Risks & Mitigations

- **Risk**: Author writes `spec.md` without naming the specific playbook file (e.g. "edit the auto playbook" instead of `packages/claude-plugin-cockpit/commands/auto.md`), so glob-parsing misses it (false negative).
  **Mitigation**: Bias permissive at the emitter — Q3 answer. False positive costs one no-op task; false negative reintroduces the bug this issue closes. FR-004 explicitly covers *every* `commands/*.md` file so the emitter does not need a whitelist. If false-negative reports appear post-ship, the follow-up is to loosen the regex, not to fall back to labels/frontmatter (which demand new authoring discipline).
- **Risk**: The two `tasks.md` copies drift over time (SC-005 fails silently).
  **Mitigation**: A short reminder in each file's header comment could be added later; for this feature, the mitigation is (a) plan/tasks review calls out the mirror requirement, and (b) `diff packages/agency-plugin-spec-kit/commands/tasks.md packages/claude-plugin-agency-spec-kit/commands/tasks.md` is a one-line check that any reviewer can run. If drift becomes chronic, the follow-up is a pre-commit hook or a single source-of-truth file symlinked from both — out of scope here.
- **Risk**: Dynamic enumeration of pin sites at `/tasks` time misses a test that reads the edited playbook through an indirection (e.g. a helper that hides the `readFileSync`).
  **Mitigation**: Today all reader sites are direct (`readFileSync(AUTO_MD_PATH)`, `readFileSync(resolve(COMMANDS_DIR, ...))`, `readdirSync(COMMANDS_DIR)`) — verified by grep. If an indirection is added later, the prompt instruction ("enumerate every test that reads the edited playbook file") is worded to require judgment rather than a mechanical grep, so the model can spot indirection. The alternative — a maintained static list — was rejected as itself drift-prone (Q4).
- **Risk**: `CLAUDE.md` grows past the 200-line memory index / user-attention threshold.
  **Mitigation**: Keep the new section to 5–10 lines. Current `CLAUDE.md` is 36 lines; there is comfortable headroom.

## Suggested next step

`/speckit:tasks` — generate the ordered task list for the three edit sites above.
