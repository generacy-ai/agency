# Data Model

This feature has no schema changes, no persisted state, and no new APIs. It touches three conceptual entities in the `/tasks` skill prompt.

## Entity 1: Playbook-scope trigger

Predicate the `/tasks` skill evaluates against `spec.md` to decide whether to emit the re-pin verification task.

```ts
type PlaybookGlob = "packages/claude-plugin-cockpit/commands/*.md";

type PlaybookScopeTrigger = {
  match: (spec: string) => PlaybookMatch[];
};

type PlaybookMatch = {
  path: string;   // full path from spec.md, e.g. "packages/claude-plugin-cockpit/commands/auto.md"
  file: string;   // basename, e.g. "auto.md"
};
```

**Origin**: Read from `spec.md` at `/tasks` invocation time. Also permissively consulted: `plan.md`, issue body (if fetched).

**Detection**: Simple substring / regex match against the literal path prefix `packages/claude-plugin-cockpit/commands/` followed by any filename ending in `.md`. No YAML frontmatter, no labels, no branch-diff inspection (see research.md Decision 3).

**Validation**:
- Empty match array → emit no re-pin task (rule does not fire).
- Non-empty array → emit exactly one re-pin task, enumerating **all** matched files (do not emit one task per file — a single task lists them together).
- De-duplicate by `path`.

**Lifetime**: Ephemeral, in `/tasks` skill-execution scope. Not persisted.

## Entity 2: Pin-site enumeration

Set of test-code locations in `playbook-verification.test.ts` that read the edited playbook file(s) and would break on unmatched edits.

```ts
type PinSiteKind =
  | "extractSubheadingBlock"     // exact heading pin
  | "extractInstructionsSteps"   // contract-rule pin (loop shape, step content)
  | "readFileSyncNamed"          // direct readFileSync(AUTO_MD_PATH) or resolve(COMMANDS_DIR, "<file>")
  | "readdirSyncSweep";          // readdirSync(COMMANDS_DIR) — iterates every playbook file

type PinSite = {
  kind: PinSiteKind;
  line: number;                  // 1-indexed line in playbook-verification.test.ts
  description: string;           // human-readable label; e.g. `it("test 406-3 ...")`
  affectsFiles: string[];        // basenames of playbook files this site reads
                                 // sweep sites list all playbook files; named sites list one
};
```

**Origin**: Produced by the `/tasks` skill at run time via grep against `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.

**Enumeration algorithm** (prompt-level, to be encoded as instructions in `tasks.md`):

1. Read `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`.
2. Find every call to `extractSubheadingBlock(...)`, `extractInstructionsSteps(...)`, `readFileSync(AUTO_MD_PATH)`, `readFileSync(resolve(COMMANDS_DIR, "<name>"))`, and `readdirSync(COMMANDS_DIR)`.
3. For each match, record `kind`, `line`, and the surrounding `it(...)` description.
4. Determine `affectsFiles`:
   - `readdirSync(COMMANDS_DIR)` sweep → affects **every** playbook file (all seven).
   - Named reads → the specific file named (extract from `AUTO_MD_PATH` → `auto.md`, or from the resolve argument).
   - `extractSubheadingBlock` / `extractInstructionsSteps` → affects the file whose contents were read into the variable passed as first argument (trace back one line — usually a `readFileSync` immediately above).
5. Filter to sites whose `affectsFiles` intersects the `PlaybookMatch[]` produced by Entity 1.

**Validation**:
- If zero pin sites intersect the edited files → the rule still emits the task, but with an explicit note: "no direct pin sites found by grep; verify manually before shipping". This shouldn't happen in practice given the `:515` sweep covers all playbooks, but the fail-open behavior matches the permissive bias from research.md Decision 3.
- If the enumeration is uncertain (e.g., a helper function hides the reader), the prompt instructs the model to include a broader "review test file for any indirect readers" note. Judgment beats mechanical grep here.

**Lifetime**: Ephemeral, in `/tasks` skill-execution scope.

## Entity 3: Emitted re-pin verification task

The task the emitter writes into `tasks.md`. Shape mirrors an ordinary `tasks.md` line, augmented with a mandatory enumeration block.

```markdown
- [ ] T### [Story] Re-pin `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts`
  for every heading and contract rule this edit changes.
  Files edited by this issue: <PlaybookMatch[].path joined by ", ">
  Pin sites that read the edited file(s):
    - :<line>: <description> (<PinSiteKind>)
    - ...
  Re-pinning means updating the assertion to the NEW contract.
  Do NOT weaken or delete an assertion to make the test pass — the pin is a drift audit;
  weakening it deletes its value.
```

**Placement in `tasks.md`**: The task appears in the "Verification" phase (or, in Epic Mode, in the verification task group). It is one of the final tasks — the implementer must complete the playbook edit before knowing what heading/contract shapes to pin to. Ordering rule: after all `commands/*.md` edit tasks, before or alongside any final smoke-check task.

**Story tag**: Uses the user story most directly associated with the playbook edit. If none is unambiguous, uses the generic `[US*]` tag (all stories) since the pin failure blocks the whole PR from merging.

**Task ID `T###`**: Sequential in the current tasks.md numbering.

**Validation**:
- SC-002: `grep -n playbook-verification.test.ts tasks.md` must return at least one line when the rule fires.
- SC-003: The task text must contain the sentence "Do NOT weaken or delete an assertion" (or equivalent), so review can confirm the anti-relaxation guidance is present.
- FR-005: The enumeration block is non-empty (or, if empty, carries the "verify manually" caveat from Entity 2 validation).

## Relationships

```
spec.md ──▶ Entity 1 (PlaybookScopeTrigger)
             │
             ▼
             PlaybookMatch[]  ────────────┐
                                          │
playbook-verification.test.ts ──▶ Entity 2 (pin-site enumeration)
                                          │
                                          ▼
                                 Filter by intersection
                                          │
                                          ▼
                                 Entity 3 (emitted re-pin task)
                                          │
                                          ▼
                                     tasks.md
```

## Non-entities (explicit omissions)

- **No preflight_check MCP tool change**: the emitter uses the same `check_prereqs` call the skill already makes; the trigger evaluation is done on the returned `spec.md` contents in-process.
- **No new file on disk**: the enumeration is computed at `/tasks` time and written directly into `tasks.md`. There is no intermediate cache or manifest file.
- **No changes to `playbook-verification.test.ts`**: the test file is the source of truth for pin sites but is not mutated by this feature.
- **No changes to any `commands/*.md` playbook**: those files are the *trigger*, not a target.
- **No hooks / CI checks**: SC-005 (byte-identical mirrors) is enforced by review discipline; automating the diff check is a follow-up outside this feature's scope.
