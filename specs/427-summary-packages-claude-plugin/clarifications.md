# Clarifications

## Batch 1 — 2026-07-16

### Q1: Emitting phase
**Context**: FR-001 says "the `/plan` and/or `/tasks` phase MUST emit a mandatory verification task". The "and/or" is ambiguous — a single, authoritative owner is needed so the task is emitted once, in a predictable place, without duplication or gaps.
**Question**: Which speckit phase should be responsible for emitting the re-pin verification task?
**Options**:
- A: `/tasks` only — it already produces the concrete task list, so injecting there is the most direct.
- B: `/plan` only — plan.md declares design/verification requirements that /tasks then materializes.
- C: Both — /plan declares the requirement in design docs, /tasks emits the concrete task.
- D: /plan writes the task into plan.md; /tasks copies it verbatim into tasks.md.

**Answer**: A) `/tasks` only — it already produces the concrete task list, so injecting there is the most direct.

**Rationale**: The failure mode is a missing *task*, and `tasks.md` is the artifact the implement phase actually executes — #420's tasks.md already carried a "Phase 4: Verification" section (T012), so a verification task's natural home is `/tasks`. Q1's own context asks for "a single, authoritative owner ... without duplication or gaps", which rules out C/D: a plan→tasks copy step is one more thing that can drift, in an issue about drift. B alone cannot guarantee the task reaches `tasks.md`.

### Q2: Implementation vehicle
**Context**: The "task template (durable)" fix in the spec doesn't say *where* the rule lives in the codebase. This determines whether the change is a doc edit, a slash-command skill edit in this repo, or code in an external speckit tool/library.
**Question**: What artifact should carry the automatic-emission rule?
**Options**:
- A: The `/plan` and/or `/tasks` slash-command skill files (e.g., `packages/claude-plugin-cockpit/commands/plan.md`, `commands/tasks.md`) — checked-in, editable here.
- B: The speckit MCP tool (`generate_plan` / `generate_tasks` codepaths) — programmatic emission, out of this repo.
- C: A shared prompt-template fragment (e.g., `packages/claude-plugin-cockpit/templates/*.md`) referenced by both skills.
- D: Only a doc/CLAUDE.md note — no programmatic emission, relies on the agent noticing.

**Answer**: A) the slash-command skill files — **but option A's example paths are wrong**. `/plan` and `/tasks` are **not** in `packages/claude-plugin-cockpit/commands/`; that directory holds only the seven cockpit commands (`auto`, `clarify`, `merge`, `queue`, `review`, `status`, `watch`). The real injection points are `packages/agency-plugin-spec-kit/commands/tasks.md` and its byte-identical mirror `packages/claude-plugin-agency-spec-kit/commands/tasks.md` — both live in this repo, and **both must be updated** or the two copies diverge.

**Rationale**: A is right in substance (a checked-in, editable skill prompt file); only its cited paths are wrong, and implementing against them as written would edit a non-existent file. D is rejected because it is already FR-003 (the `CLAUDE.md` note) — that is the acknowledged weaker half of the fix, not a substitute for the durable one. Please correct the paths in the plan so the implementer doesn't chase `commands/plan.md` in the cockpit package.

### Q3: Scope-trigger mechanism
**Context**: FR-001 fires when "an issue's declared scope includes any file under `packages/claude-plugin-cockpit/commands/*.md`". The detection mechanism is unspecified — this is the trigger that makes the rule fire (or fail to fire).
**Question**: How should the emitter determine that an issue's scope matches `packages/claude-plugin-cockpit/commands/*.md`?
**Options**:
- A: Parse `spec.md` (and/or issue body) for file paths matching the glob.
- B: Require the spec author to declare scope explicitly in frontmatter or a "## Scope" section, then match the glob against that list.
- C: Inspect a GitHub label on the issue (e.g., `scope:playbook`).
- D: Match against files touched in the working tree / current branch diff at plan-time.

**Answer**: A) Parse `spec.md` (and/or issue body) for file paths matching the glob.

**Rationale**: D is not viable — at `/plan`/`/tasks` time the implement phase has not run, so the branch diff contains only spec artifacts and never the playbook edit. C (a `scope:playbook` label) depends on a human remembering to apply it, which is the same class of gap this issue exists to close. B demands new authoring discipline. A works against specs exactly as they are written today (#420's tasks.md names `packages/claude-plugin-cockpit/commands/auto.md` explicitly). Bias permissive: a false positive costs one no-op task, a false negative reintroduces the bug.

### Q4: Enumeration approach for FR-005
**Context**: FR-005 says the emitted task MUST enumerate "every `extractSubheadingBlock` call whose subheading string appears in the edited file". A grep of the test today shows 4 concrete calls (playbook-verification.test.ts:1109, 1119, 1170, 1176). How that list is produced determines whether this is durable or brittle.
**Question**: How should the emitted task enumerate the specific pin sites relevant to the edit?
**Options**:
- A: The emitter dynamically greps `playbook-verification.test.ts` for `extractSubheadingBlock` calls at plan/tasks time and lists any subheading strings that match text in the edited file.
- B: The emitter references a maintained static list of pin subheadings (kept in a companion file next to the test).
- C: The emitted task text just names `playbook-verification.test.ts` and directs the implementer to enumerate pins themselves at implement time.
- D: The emitted task links to a documented enumeration procedure (e.g., "run `grep extractSubheadingBlock` and cross-reference") without pre-computing the list.

**Answer**: A) dynamic grep at plan/tasks time — **but widen it beyond `extractSubheadingBlock`**. The emitter should enumerate every test that *reads the edited playbook* (`readFileSync(AUTO_MD_PATH)`, `resolve(COMMANDS_DIR, "<file>")`, and the `readdirSync(COMMANDS_DIR)` sweep), not only `extractSubheadingBlock` call sites. **FR-005 should be amended accordingly.**

**Rationale**: As currently written, FR-005 would have missed the #420 failure that motivated this issue. Test 406-3 — the one that broke — uses `extractInstructionsSteps` plus string assertions, **not** `extractSubheadingBlock`. Today the file has 4 `extractSubheadingBlock` heading pins, 3 `extractInstructionsSteps` contract pins, and 10 tests in total that read `AUTO_MD_PATH`; a heading-only enumeration therefore covers 4 of ~10 pins and misses precisely the class that failed. (FR-002 and FR-003 already say "contract-rule", so FR-005 is the outlier.) A beats B because a maintained static list is a second artifact that can drift — self-defeating in a drift issue; A beats C/D because those defer enumeration to the implementer who already forgot.

### Q5: Handling unpinned `commands/*.md` files
**Context**: FR-004 extends the rule to *every* `commands/*.md` file (auto, clarify, merge, queue, review, status, watch), but today only `auto.md` has pins in `playbook-verification.test.ts`. It's unclear what should happen when an issue edits an unpinned file — a no-op task, no task, or a reconnaissance task.
**Question**: When an issue edits a `commands/*.md` file that has NO current pins in `playbook-verification.test.ts` (e.g., `review.md`, `merge.md`), what should the emitter do?
**Options**:
- A: Always emit the verification task — future-proofs the workflow when pins are added later; no-op cost is low.
- B: Skip — emit only when at least one `extractSubheadingBlock` pin exists whose subheading text appears in the edited file (avoids no-op tasks).
- C: Emit a lighter "reconnaissance" task ("check whether this file has pins; if any, re-pin to the new contract") rather than the full re-pin task.
- D: Only emit for `auto.md` explicitly; treat other playbooks as out of scope until they gain pins.

**Answer**: A) Always emit the verification task.

**Rationale**: The question's premise — that only `auto.md` has pins and `review.md`/`merge.md` are unpinned — is false. 398-1 (playbook-verification.test.ts:515) sweeps **every** `commands/*.md` via `readdirSync(COMMANDS_DIR)` for invocation-vs-`--help` drift; that is exactly the check that caught #420's `<ref>` vs `<epic-ref>` drift. 406-2 (:1504) additionally reads `watch.md` by name. So B ("skip when no `extractSubheadingBlock` pin exists") would skip a `review.md` edit that 398-1 genuinely does cover — a false negative, i.e. the very bug this issue addresses. D is narrower still. C (a lighter reconnaissance task) is defensible, but because the drift-audit sweep already covers every playbook the task is never truly a no-op, so A is both simpler and safer. FR-004 is right to cover all playbooks; its stated justification ("can be pinned in the future") should be corrected to "are already pinned today by the 398-1 sweep".
