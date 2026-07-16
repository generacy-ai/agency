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

**Answer**: *Pending*

### Q2: Implementation vehicle
**Context**: The "task template (durable)" fix in the spec doesn't say *where* the rule lives in the codebase. This determines whether the change is a doc edit, a slash-command skill edit in this repo, or code in an external speckit tool/library.
**Question**: What artifact should carry the automatic-emission rule?
**Options**:
- A: The `/plan` and/or `/tasks` slash-command skill files (e.g., `packages/claude-plugin-cockpit/commands/plan.md`, `commands/tasks.md`) — checked-in, editable here.
- B: The speckit MCP tool (`generate_plan` / `generate_tasks` codepaths) — programmatic emission, out of this repo.
- C: A shared prompt-template fragment (e.g., `packages/claude-plugin-cockpit/templates/*.md`) referenced by both skills.
- D: Only a doc/CLAUDE.md note — no programmatic emission, relies on the agent noticing.

**Answer**: *Pending*

### Q3: Scope-trigger mechanism
**Context**: FR-001 fires when "an issue's declared scope includes any file under `packages/claude-plugin-cockpit/commands/*.md`". The detection mechanism is unspecified — this is the trigger that makes the rule fire (or fail to fire).
**Question**: How should the emitter determine that an issue's scope matches `packages/claude-plugin-cockpit/commands/*.md`?
**Options**:
- A: Parse `spec.md` (and/or issue body) for file paths matching the glob.
- B: Require the spec author to declare scope explicitly in frontmatter or a "## Scope" section, then match the glob against that list.
- C: Inspect a GitHub label on the issue (e.g., `scope:playbook`).
- D: Match against files touched in the working tree / current branch diff at plan-time.

**Answer**: *Pending*

### Q4: Enumeration approach for FR-005
**Context**: FR-005 says the emitted task MUST enumerate "every `extractSubheadingBlock` call whose subheading string appears in the edited file". A grep of the test today shows 4 concrete calls (playbook-verification.test.ts:1109, 1119, 1170, 1176). How that list is produced determines whether this is durable or brittle.
**Question**: How should the emitted task enumerate the specific pin sites relevant to the edit?
**Options**:
- A: The emitter dynamically greps `playbook-verification.test.ts` for `extractSubheadingBlock` calls at plan/tasks time and lists any subheading strings that match text in the edited file.
- B: The emitter references a maintained static list of pin subheadings (kept in a companion file next to the test).
- C: The emitted task text just names `playbook-verification.test.ts` and directs the implementer to enumerate pins themselves at implement time.
- D: The emitted task links to a documented enumeration procedure (e.g., "run `grep extractSubheadingBlock` and cross-reference") without pre-computing the list.

**Answer**: *Pending*

### Q5: Handling unpinned `commands/*.md` files
**Context**: FR-004 extends the rule to *every* `commands/*.md` file (auto, clarify, merge, queue, review, status, watch), but today only `auto.md` has pins in `playbook-verification.test.ts`. It's unclear what should happen when an issue edits an unpinned file — a no-op task, no task, or a reconnaissance task.
**Question**: When an issue edits a `commands/*.md` file that has NO current pins in `playbook-verification.test.ts` (e.g., `review.md`, `merge.md`), what should the emitter do?
**Options**:
- A: Always emit the verification task — future-proofs the workflow when pins are added later; no-op cost is low.
- B: Skip — emit only when at least one `extractSubheadingBlock` pin exists whose subheading text appears in the edited file (avoids no-op tasks).
- C: Emit a lighter "reconnaissance" task ("check whether this file has pins; if any, re-pin to the new contract") rather than the full re-pin task.
- D: Only emit for `auto.md` explicitly; treat other playbooks as out of scope until they gain pins.

**Answer**: *Pending*
