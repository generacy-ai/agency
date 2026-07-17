# Quickstart & Verification

This feature is a **prompt edit** to the `/tasks` slash-command skill (two byte-identical copies) plus a short section addition to root `CLAUDE.md`. There are no install steps, no new commands, no runtime state, and no changes to `playbook-verification.test.ts` or any `commands/*.md` playbook.

## Files touched

- `packages/agency-plugin-spec-kit/commands/tasks.md` (primary edit)
- `packages/claude-plugin-agency-spec-kit/commands/tasks.md` (byte-identical mirror)
- `CLAUDE.md` (root — new "Cockpit playbook pins" section)

## Files referenced but NOT edited

- `packages/claude-plugin-cockpit/commands/*.md` — the seven playbooks; edit-trigger only.
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` — target of the emitted re-pin task; unchanged.

## Verification scenarios

The five scenarios below cover the FR/SC matrix in `spec.md`. Each is a hypothetical (or real) speckit invocation the edited `/tasks` prompt should handle. Verification for scenarios 1–3 is done by running `/speckit:tasks` on a real spec and grepping `tasks.md`; scenarios 4–5 are file-diff checks.

### Scenario 1 — Spec names `commands/auto.md` explicitly (dogfood path)

**Given**: A speckit issue whose `spec.md` contains the literal string `packages/claude-plugin-cockpit/commands/auto.md` (e.g. the same shape as #420 and #421 today).

**When**: `/speckit:tasks` runs against that feature directory.

**Then**:
- `tasks.md` contains at least one task whose text includes `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.
- The task lists `auto.md` under "Files edited by this issue".
- The task enumerates pin sites covering all four kinds present in the test file today: `extractSubheadingBlock`, `extractInstructionsSteps`, `readFileSync(AUTO_MD_PATH)`, `readdirSync(COMMANDS_DIR)` sweep.
- The task text contains the sentence "Do NOT weaken or delete an assertion" (or equivalent anti-relaxation guidance).

**Verifies**: FR-001, FR-002, FR-005, FR-006, SC-002, SC-003.

### Scenario 2 — Spec names a non-`auto` playbook (e.g. `commands/watch.md`)

**Given**: A speckit issue whose `spec.md` contains `packages/claude-plugin-cockpit/commands/watch.md`.

**When**: `/speckit:tasks` runs.

**Then**:
- `tasks.md` contains a re-pin task naming `playbook-verification.test.ts`.
- The task lists `watch.md` under "Files edited by this issue".
- The task enumerates at minimum the `readdirSync(COMMANDS_DIR)` sweep site (`:515`) and the named `watch.md` read (`:1504` area). It does NOT list unrelated `readFileSync(AUTO_MD_PATH)` sites.

**Verifies**: FR-004, FR-005, Q5 emission-always semantics.

### Scenario 3 — Spec names no `commands/*.md` file (rule does not fire)

**Given**: A speckit issue whose `spec.md` edits `packages/agency/src/*` and never mentions `packages/claude-plugin-cockpit/commands/`.

**When**: `/speckit:tasks` runs.

**Then**:
- `tasks.md` contains NO task naming `playbook-verification.test.ts` (the rule stayed silent).
- `grep -n playbook-verification.test.ts tasks.md` returns zero lines.

**Verifies**: FR-001 negative case — false-positive containment.

### Scenario 4 — Byte-identity of the two `tasks.md` copies (SC-005)

**Given**: The two skill files.

**When**: The reviewer runs the diff command below.

**Then**: Empty output.

```bash
diff packages/agency-plugin-spec-kit/commands/tasks.md \
     packages/claude-plugin-agency-spec-kit/commands/tasks.md
```

**Verifies**: SC-005, FR-007 lockstep requirement.

### Scenario 5 — Root `CLAUDE.md` mentions both `auto.md` and the test file (SC-004)

**Given**: Root `CLAUDE.md` after this feature ships.

**When**: The reviewer runs the greps below.

**Then**: Each returns at least one line.

```bash
grep -n "auto.md" CLAUDE.md
grep -n "playbook-verification.test.ts" CLAUDE.md
grep -n "re-pin" CLAUDE.md
```

**Verifies**: FR-003, SC-004.

## How to run the full verification

There is no automated harness for prompt-file behavior. Verification is a mix of:

1. **File-diff checks** (Scenarios 4, 5) — one-line grep / diff commands anyone can run locally.
2. **Dogfood run** (Scenarios 1, 2, 3) — after this feature ships, the next speckit issue that edits a `commands/*.md` file is the real test. Run `/speckit:tasks` on that issue and grep `tasks.md` for the expected task.
3. **Historical replay** — for confidence before the next dogfood, take #420's or #421's `spec.md` verbatim and run `/speckit:tasks` in a scratch branch; confirm the generated `tasks.md` now contains the re-pin task that was missing on those PRs.

## Success-criteria checklist

Copied from `spec.md` for at-a-glance verification:

- [ ] **SC-001**: Speckit PRs editing a `commands/*.md` playbook pass validate on first run (measured on the next batch — needs a dogfood window).
- [ ] **SC-002**: `tasks.md` for a playbook-scoped issue includes the re-pin task (Scenario 1 grep).
- [ ] **SC-003**: No assertion in `playbook-verification.test.ts` is weakened or deleted as a workaround (assertion count parity, measured PR-over-PR).
- [ ] **SC-004**: `CLAUDE.md` names both `auto.md` and `playbook-verification.test.ts` (Scenario 5 greps).
- [ ] **SC-005**: The two `tasks.md` copies are byte-identical (Scenario 4 diff).

## Troubleshooting

- **Rule didn't fire on a spec that mentions `commands/auto.md`**: the prompt likely regressed. Grep both `tasks.md` skill files for the "Playbook coupling" section; if missing from either, restore from the other (they must stay byte-identical — SC-005).
- **Rule fired on a spec that shouldn't have triggered it (false positive)**: expected and cheap — the implementer marks the emitted task no-op and moves on. If false positives are chronic, tighten the trigger regex in a follow-up (e.g., require the path to appear outside a code fence). Do NOT loosen to labels/frontmatter — those demand new authoring discipline (Q3 rationale).
- **The two `tasks.md` copies drifted**: `diff` will show the delta. Resolve by choosing one as truth (usually the more recently edited) and copying it over the other, then re-run the diff to confirm empty. If drift becomes chronic, follow up with a pre-commit hook or a symlink — out of scope for this feature.
- **Pin-site enumeration in the emitted task is stale (test file changed but the emitted list didn't)**: the enumeration is computed at `/tasks` time by grep — re-run `/speckit:tasks` to refresh. If the emitter is not re-reading the test file, the prompt has regressed.
- **`CLAUDE.md` section is missing / removed**: agents in the implement phase won't see the coupling reminder. Restore the section; the exact text is in the plan.md edit-sites table.

## Rollback

Prompt-only feature. If the emission rule causes unexpected pain:

1. Revert the `## Playbook coupling` block in both `tasks.md` copies.
2. Revert the `## Cockpit playbook pins` section in `CLAUDE.md`.
3. Re-run `diff` to confirm the two `tasks.md` copies are byte-identical after the revert.

No data migration, no state cleanup, no shipped code to un-ship.
