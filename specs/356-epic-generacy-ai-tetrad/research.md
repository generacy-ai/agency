# Research: /cockpit:plan command

**Feature**: 356-epic-generacy-ai-tetrad
**Date**: 2026-06-29

## Decisions

### D1: Single-file delivery in the cockpit plugin's `commands/` directory

**Decision**: `/cockpit:plan` is a single markdown slash-command file at `packages/claude-plugin-cockpit/commands/plan.md`. No new TypeScript, no MCP coupling, no edits to `plugin.json` or `marketplace.json`.

**Rationale**:
- FR-001 fixes the file path.
- Sibling commands in the same package (`clarify.md`, `merge.md`, `review.md`, `status.md`, `watch.md`) are all single-file slash commands. The loader auto-discovers `commands/*.md`.
- Per-verb isolation matches the model used across Epic Cockpit issues #351–#360 and avoids cross-issue merge conflicts.

**Alternatives considered**:
- A separate CLI verb (`generacy cockpit plan`) that the slash command shells out to. Rejected — the work (read an issue, write a file) is trivial enough that a CLI shim adds surface area without removing complexity. `/cockpit:plan` is also explicitly human-led (FR-006), so a backgrounded/automated CLI form has no use case here.
- An MCP tool. Rejected — same reasoning; the command is purely conversational and file-scaffolding.

### D2: Always write into the current working tree's `docs/`, regardless of ref qualification

**Decision**: Bare numeric refs (`356`) resolve against the current repo's `gh` default. Cross-repo qualified refs (`owner/other-repo#356`) still write the planning doc into the **current working tree's** `docs/` — never into the cross-repo target.

**Rationale**:
- Clarification Q1 chose option A.
- Avoids clone/fetch complexity and the question of "what if the target repo isn't local."
- Matches the convention used by this very epic — `docs/epic-cockpit-plan.md` lives in `tetrad-development` because that's where `/cockpit:plan` was (or will be) invoked.

**Alternatives considered**:
- (B) Reject cross-repo refs. Rejected per Q1 — too restrictive when the developer legitimately wants to read metadata from a cross-repo epic.
- (C) Clone-or-fetch + write into the target repo. Rejected per Q1 — heavy and opaque; the user must already `cd` to where they want the doc.
- (D) Bare refs always resolve against a canonical epic repo. Rejected per Q1 — surprising and incompatible with the orchestrator session's `gh` defaults.

### D3: Slug derivation honors an explicit `slug:` field; otherwise normalizes the title

**Decision**: Slug derivation rule, in order:
1. If the epic body contains a `slug:` metadata line, use the value verbatim.
2. Otherwise: strip a leading `Epic:` / `Epic ` / `[…]` bracket prefix from the title, lowercase, replace non-alphanumerics with `-`, collapse runs of `-`, trim leading/trailing `-`, cap at 60 chars (truncate at the last `-` boundary).

Examples:
- `Epic: Cockpit` → `cockpit` → `docs/epic-cockpit-plan.md`
- `[cockpit] /cockpit:plan command` → `cockpit-plan-command` → `docs/epic-cockpit-plan-command-plan.md`
- (with `slug: cockpit`) → `cockpit` → `docs/epic-cockpit-plan.md`

**Rationale**:
- Clarification Q2 chose option D.
- Honoring an explicit `slug:` lets the epic author override the algorithmic derivation for awkward titles.
- Real epic titles routinely include `Epic:` prefixes and `[scope]` brackets; without prefix-stripping, slugs become noisy (`docs/epic--cockpit----cockpit-plan-command-plan.md`).
- The 60-char cap keeps filenames within reasonable POSIX limits and stops the slug from including trailing noise.

**Alternatives considered**:
- (A) Bare lowercase + dash. Rejected per Q2 — produces awkward slugs for real titles.
- (B) Prefix-strip but no cap. Rejected per Q2 — long titles produce hard-to-type filenames.
- (C) Prefix-strip + 60-char cap, but no `slug:` override. Rejected per Q2 — the override is what makes the deterministic rule recoverable when the title is genuinely a poor slug source.

### D4: Append-flow confirmation is conversational via `AskUserQuestion`

**Decision**: When the planning doc exists and some canonical sections are missing, `plan.md` calls `AskUserQuestion` with the list of missing sections and `append / cancel` choices. Only on `append` does the command write. No `--apply` round-trip, no auto-write.

**Rationale**:
- Clarification Q3 chose option B.
- Matches `/cockpit:clarify`'s Step 4 approval UX, which uses `AskUserQuestion` for in-conversation confirmation. Consistency across cockpit verbs.
- A separate `--apply` flag would require the developer to re-invoke the command, which doubles the round-trip cost.

**Alternatives considered**:
- (A) Print diff + require `--apply` re-invocation. Rejected per Q3 — heavier UX with no safety gain over the conversational prompt.
- (C) Auto-append with a `<!-- ...:appended -->` marker. Rejected per Q3 — violates the "human-led" invariant in FR-006; the marker alone doesn't make the write less surprising.

### D5: "Missing section" detection is case-insensitive with a small alias table

**Decision**: A canonical section counts as "present" in the existing doc if any H2 heading in the doc matches its name (case-insensitive) OR matches one of its registered aliases. Aliases live in a small table inside `plan.md`:
- `Goals ↔ Objectives`
- `Non-Goals ↔ Out of Scope`

All other canonical sections (`Context`, `Phases`, `Ownership / Isolation`, `Sequencing & Dependencies`, `Risks`, `Open Questions`) have no aliases in the initial table; case-insensitive exact match only.

**Rationale**:
- Clarification Q4 chose option C.
- Real planning docs rename `Goals` to `Objectives` and `Non-Goals` to `Out of Scope` routinely; exact matching would produce noisy re-appends.
- Keeping the alias table inside the command (not in a separate config file) keeps the rule auditable and trivially evolvable without a separate config-loader plumbing layer.
- Limiting the alias table to the two clear-cut cases avoids over-engineering — additional aliases can be added in a future revision if the noise pattern resurfaces.

**Alternatives considered**:
- (A) Exact-text match (case-sensitive). Rejected per Q4 — way too noisy.
- (B) Case-insensitive exact match, no aliases. Rejected per Q4 — still produces noise on common renames.
- (D) "Any H2 counts as present." Rejected per Q4 — loses the value of the canonical structure; a doc with one H2 would falsely count as complete.

### D6: Metadata block under H1 is markdown, not YAML front-matter

**Decision**: The metadata embedded under the H1 is a markdown line of the form `**Epic**: <ref>  ·  **Phase**: <phase>  ·  **Tier**: <tier>`. Not YAML front-matter, not an HTML comment.

**Rationale**:
- Clarification Q5 chose option B.
- Matches the existing style used by `spec.md` lines 3–7 in this very feature directory.
- The downstream parser referenced in #790 reads `**Epic**:` / `Plan:` lines, not YAML front-matter. Choosing YAML would break that parser.
- Markdown metadata renders cleanly in GitHub's preview and in any markdown viewer, without the "what's that `---` block?" question YAML front-matter raises for non-Jekyll readers.

**Alternatives considered**:
- (A) YAML front-matter (`---\nepic: …\n---`). Rejected per Q5 — would force the downstream parser to learn YAML.
- (C) HTML comment block. Rejected per Q5 — invisible in rendered output, which sacrifices the cross-linking benefit.

### D7: The metadata block is omitted when no metadata is extractable

**Decision**: If the epic body has neither `Phase:` nor `Tier:` lines and no explicit `slug:` (which would be in the body too), the metadata block under H1 is omitted entirely. The skeleton emits only the H1 and the nine canonical H2 sections. Partial metadata (e.g., only `Phase:` found) renders only what was found, joined by ` · `.

**Rationale**:
- FR-010 says "**Epic**: … `Phase`: … `Tier`: …" but the spec's Assumptions section explicitly allows the metadata to be missing (line 68: "Epic issues follow the standard body format … so the metadata extraction in FR-010 has something stable to parse").
- A line that reads `**Epic**: 356  ·  **Phase**:   ·  **Tier**: ` (with empty values) is uglier than no line at all.
- The `**Epic**:` portion alone is still useful when present, so partial rendering is the right middle ground.

**Alternatives considered**:
- Always emit the block, even with empty values. Rejected — produces unsightly placeholders.
- Hard-require all three. Rejected — would make the command fail on epics that legitimately don't yet have Phase/Tier assigned.

### D8: Output discipline — terse status lines, no chatty summaries

**Decision**: The command emits one short status line per outcome (`wrote planning skeleton: <abs-path>`, `planning doc already complete: <abs-path>`, `appended <N> section(s) to: <abs-path>`, or usage / parse / `gh` errors verbatim). No narration of internal deliberation.

**Rationale**:
- Matches the project-wide tone-and-style guidance in `CLAUDE.md` and the sibling commands' output discipline (`/cockpit:merge` D6, `/cockpit:clarify` Step 5–6).
- Cockpit verbs run inside orchestrator sessions; verbose output pollutes the parent agent's context.

**Alternatives considered**:
- Multi-line summary with each section's status. Rejected — out of scope and noisy. The append-prompt itself already lists the missing sections to the developer.

## Implementation Patterns

### P1: Slash-command frontmatter mirrors sibling commands

- Use the YAML frontmatter convention from `packages/claude-plugin-cockpit/commands/clarify.md` and `merge.md`: `description`, `arguments[]` with `name`, `description`, `required`.
- Declare one positional argument (`epic-ref`); no flags.

### P2: `gh issue view` is the only network call

- Single `gh issue view <ref> --json title,body` invocation per command run. Same pattern as `/cockpit:clarify` Step 2 (which calls `gh repo view` and `gh issue comment`).
- No retries, no caching, no rate-limit handling — if `gh` fails, surface verbatim and exit. The user is in an interactive session and can rerun.

### P3: File-existence branch is non-destructive by default

- The very first operation after path computation is an existence check on `docs/epic-<slug>-plan.md`.
- If it exists, the command MUST NOT touch the file until the developer says `append` via `AskUserQuestion`. There is no code path that overwrites.
- The `<!-- generacy-cockpit:appended -->` marker is inserted *once* between the existing content and the appended block; multiple subsequent appends append below the existing block (no nested markers).

### P4: Heading parser is forgiving

- Parse the existing doc by reading all lines that start with `## ` (zero-padded indent only), case-insensitive, trimming whitespace and trailing punctuation.
- An alias is matched after the case-insensitive comparison; the alias table is a flat array of pairs inside the command body, not a runtime lookup.

### P5: Skeleton is a literal in the command body

- The canonical skeleton (H1 + metadata block + nine H2 sections, in order) is written out **verbatim** inside the command's prompt body, with templating only for the H1 title, the metadata-block values, and the H2 section bodies (which are short placeholder hints — `<!-- TODO -->` or one-line description).
- This avoids any "where does the skeleton live?" indirection. Anyone reading `plan.md` can see exactly what the skeleton looks like.

## Key Sources / References

- `specs/356-epic-generacy-ai-tetrad/spec.md` — feature requirements and acceptance criteria.
- `specs/356-epic-generacy-ai-tetrad/clarifications.md` — answered questions Q1–Q5.
- `packages/claude-plugin-cockpit/commands/clarify.md` — pattern reference for `gh`-shelling and `AskUserQuestion` use.
- `packages/claude-plugin-cockpit/commands/merge.md` — pattern reference for terse status output and frontmatter shape.
- `specs/355-epic-generacy-ai-tetrad/contracts/slash-command.contract.md` — sibling slash-command contract format; mirrored here.
- Issue #790 (parent epic / downstream parser) — confirms the markdown metadata block format choice (D6).
- A1.4 (cockpit plugin scaffold) — provides the `commands/` directory and namespace.
