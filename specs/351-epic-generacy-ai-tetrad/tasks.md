# Tasks: /cockpit:watch slash command

**Input**: Design documents from `/specs/351-epic-generacy-ai-tetrad/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/transition.schema.md, contracts/autonomy-policy.schema.md, quickstart.md
**Status**: Complete

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1 = the only user story for this issue — the watch loop)

## Phase 1: Pre-implementation checks

These confirm the upstream surfaces the playbook depends on exist before authoring against them. They are read-only and parallelizable.

- [X] T001 [P] [US1] Verify `generacy cockpit watch <ref>` exists and emits one JSON line per transition (per contracts/transition.schema.md). If not yet shipped (#787 not landed), proceed against the contract and add a dependency block to the issue.
- [X] T002 [P] [US1] Verify the autonomy policy lookup surface from G1.1–G1.3 / A1.4 (CLI subcommand, MCP tool, or static file) returns the shape documented in contracts/autonomy-policy.schema.md. If not yet shipped, proceed against the contract and add a dependency block.
- [X] T003 [P] [US1] Verify the engine ref resolver (#788) accepts the same `<epic-ref>` strings the slash command will pass through (bare number resolves via `MONITORED_REPOS`; `owner/repo#N` passes through). If not yet shipped, proceed against the contract.
- [X] T004 [P] [US1] Confirm `packages/claude-plugin-cockpit/commands/.gitkeep` is currently the only file in `commands/` (it is, as of branch start). If a sibling verb has landed, skip the `.gitkeep` cleanup in T013.
- [X] T005 [P] [US1] Read `packages/claude-plugin-agency-spec-kit/commands/plan.md` and `clarify.md` as the structural reference for the playbook shape (YAML frontmatter, H1 title, `## Arguments`, `## Instructions`, numbered steps, literal `$ARGUMENTS`).

## Phase 2: Author the playbook

All tasks in this phase edit the same file (`packages/claude-plugin-cockpit/commands/watch.md`), so they MUST run sequentially.

- [X] T010 [US1] Create `packages/claude-plugin-cockpit/commands/watch.md` with YAML frontmatter (`description: Watch an epic and apply the autonomy policy to each transition` — must match the entry in `packages/claude-plugin-cockpit/README.md`'s commands table exactly) and the H1 title `# Watch Command`.
- [X] T011 [US1] Add the `## Arguments` section to `packages/claude-plugin-cockpit/commands/watch.md`: document `$ARGUMENTS` as one positional `<epic-ref>` (bare number OR `owner/repo#N`), passed verbatim to `generacy cockpit watch`. Explicitly state the slash command does NOT resolve refs (delegated to engine resolver #788, per Q5).
- [X] T012 [US1] Add the `## Instructions` numbered steps to `packages/claude-plugin-cockpit/commands/watch.md`, in this exact order (covers plan.md Phase 1 step 3 a–g and the data-model E1→E5 flow):
  1. If `$ARGUMENTS` is empty, print usage and stop.
  2. Spawn `generacy cockpit watch $ARGUMENTS` via the `Monitor` tool — no extra flags.
  3. For each notification (one per stdout line):
     a. Parse as JSON (reference `contracts/transition.schema.md`). On parse failure or missing required fields (`repo`, `kind`, `number`, `from`, `to`): log inline and continue. Do NOT terminate the loop.
     b. If `from === null`: classify as state-sync. Add the dedupe id (`${repo}:${kind}:${number}:null→${to}`) to the in-memory seen-set, then stop processing this line. Do NOT dispatch. Do NOT notify. (Q1, data-model E1 validation rule.)
     c. If `from === to` (same-state echo): drop. Not a transition. (Contract: should not be emitted; defensive drop if it is.)
     d. Compute `transition_id = ${repo}:${kind}:${number}:${from}→${to}`. If already in the seen-set: drop silently (dedupe gate — data-model E3).
     e. Add `transition_id` to the seen-set BEFORE dispatching (so a failed dispatch doesn't cause a duplicate fire on re-emission — data-model E3 validation rule).
     f. Look up the autonomy policy for the transition (reference `contracts/autonomy-policy.schema.md`).
        - `mode === "auto"` with valid `command`: invoke `command` with the args from `args_template` (substituting `<repo>`, `<kind>`, `<number>`, `<from>`, `<to>`), or default to `<repo>#<number>` if `args_template` is omitted.
        - `mode === "auto"` missing `command`: degrade to notify-only with an inline `policy-error:` marker (contract E4 validation rule).
        - `mode === "notify-only"`: emit one inline chat message (format in step g).
        - No mapping (undefined): emit one inline chat message with `policy: unmapped` (Q2-A fallback). Never silently drop.
        - Unknown `mode` value: degrade to notify-only with `policy-error:` marker (contract versioning rule).
  4. Inline notification format (research.md P3): single line `[cockpit:watch] <repo>#<number> <kind> <from> → <to> · policy: <policy> · suggested: /cockpit:<verb> <ref>` (`suggested` optional). For auto-dispatched transitions, the dispatch itself is the user-visible signal — do NOT also print the notification line.
  5. Permanent-failure handling: if the `Monitor` tool reports the spawned process EXITED (not a disconnect, not a stream blip — actually gone), surface that inline and prompt the user to re-run `/cockpit:watch`. Do NOT retry, do NOT reconnect — `generacy cockpit watch` owns retry per #787 FR-009 (Q3-D).
- [X] T013 [US1] If T004 confirmed `.gitkeep` is still the only file in `commands/` (now joined by `watch.md`), `git rm packages/claude-plugin-cockpit/commands/.gitkeep` in the same commit. If a sibling verb has already landed, skip.

## Phase 3: Validation

- [X] T020 [US1] Static checks: `ls packages/claude-plugin-cockpit/commands/watch.md` exists; `grep -n 'cockpit:watch' packages/claude-plugin-cockpit/README.md` still resolves (the README commands table entry); the YAML frontmatter `description:` string matches that table entry verbatim.
- [ ] T021 [US1] Acceptance test (manual, blocked on #787, #788, G1.1–G1.3, A1.4 landing — see quickstart.md §4):
  1. Install the cockpit plugin in a Claude Code session.
  2. Run `/cockpit:watch <epic-ref>` against a low-traffic test epic.
  3. Verify baseline lines flow with NO action dispatches and NO notifications.
  4. Drive one label change on the monitored issue; verify exactly one inline notification OR exactly one `/cockpit:*` dispatch (per policy) — not both, not duplicated.
- [ ] T022 [US1] Restart test (manual): interrupt the watch and re-invoke `/cockpit:watch <epic-ref>` against the same epic. Verify the baseline re-syncs without re-firing the transition from T021. (Q1 / data-model baseline invariant.)
- [ ] T023 [US1] Unmapped-transition test (manual): drive a transition whose class the policy doesn't cover. Verify the playbook surfaces a notify-only inline message with `policy: unmapped` — not a silent drop, not a startup failure. (Q2-A / contract E4.)

## Dependencies & Execution Order

**Phase order (sequential)**: Phase 1 → Phase 2 → Phase 3.

**Within Phase 1**: T001–T005 are all read-only, independent surface verifications — all `[P]`, runnable in parallel.

**Within Phase 2**: T010 → T011 → T012 → T013 are strictly sequential (all touch `packages/claude-plugin-cockpit/commands/watch.md`, plus T013 removes a sibling file in the same package and should land in the same commit as T012).

**Within Phase 3**: T020 is local-only (no external deps) and can run as soon as Phase 2 is complete. T021–T023 are manual acceptance tests blocked on upstream landings (#787, #788, G1.1–G1.3, A1.4); they can run in any order but should all run before closing the issue.

**External blockers** (not tasks here, but tracked in plan.md "Open Risks"):
- #787 (`generacy cockpit watch` CLI) — blocks T021–T023.
- #788 (engine ref resolver) — blocks T021–T023.
- G1.1, G1.2, G1.3, A1.4 (autonomy policy lookup) — blocks T021, T023.

If any blocker is unresolved, Phase 1 / Phase 2 still proceed against the documented contracts; Phase 3 acceptance tests pause until the blocker ships.
