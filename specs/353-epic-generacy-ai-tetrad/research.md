# Research: /cockpit:clarify verb

**Feature**: `353-epic-generacy-ai-tetrad`
**Date**: 2026-06-26

## Decisions

### D1: Verb is a single static markdown file, no code

**Decision**: Ship `commands/clarify.md` as a pure prompt/instruction document, mirroring `packages/claude-plugin-agency-spec-kit/commands/*.md`. No TypeScript, no MCP tool surface added in this issue.

**Rationale**:
- The cockpit package (`packages/claude-plugin-cockpit/`) scaffolded in #350 is intentionally manifest-only — `commands/` is the runtime surface.
- All side-effecting capability the verb needs (shell calls, file reads) is already available to Claude Code via built-in tools (Bash, Read, Grep). No new MCP capability is required.
- Other cockpit verbs in the #351–#360 batch share this shape; deviating now would create a one-off pattern for the next eight verbs to either match or work around.

**Alternatives considered**:
- *MCP tool in `packages/agency`*: Would centralize parsing of `generacy cockpit clarify-context` output. Rejected — adds a build/release dependency and couples the verb roll-out to the agency MCP server's release cadence. The clarification surface is interactive by design; an MCP tool would still need a prompt layer on top.
- *Standalone Node script invoked from the verb*: Adds a build artifact to a package that today has none. Rejected — same coupling concern, plus the verb's logic is short enough to express as instructions.

### D2: Comment marker is the literal first line, posted via stdin to preserve verbatim

**Decision**: The posted comment body begins with `<!-- generacy-cockpit:clarification-answers -->` on line 1, followed by a blank line, then the approved answer blocks. Post with `gh issue comment <n> --body-file -` reading from stdin (or `--body-file <tempfile>`), never with `-b "…"`.

**Rationale**:
- Clarification Q2 settled the marker string; resume tooling keys off it for comment discovery (separate from the `completed:clarification` label that triggers orchestrator resume).
- Shell quoting via `-b "…"` risks rewrapping or stripping the HTML comment on some `gh` versions; stdin/body-file is byte-exact.
- Putting the marker on line 1 (not buried later) lets grep-style discovery (`gh issue view --comments | head`) find it without parsing the full body.

**Alternatives considered**:
- *Trailing marker*: Easier to read for humans skimming the comment. Rejected — discovery cost is worse and breaks any tooling that streams only the first line.
- *Marker as YAML frontmatter*: GitHub markdown doesn't render frontmatter; would just become visible junk text. Rejected.

### D3: Hard error on unresolvable issue, no interactive prompt

**Decision**: When `$ARGUMENTS` is empty and the branch name does not match `###-*`, the verb exits non-zero with the message `no child issue resolvable; pass --issue <n>`. No interactive "which issue?" prompt.

**Rationale**:
- Clarification Q3 picked option A. The verb must be callable from `/cockpit:watch` (and other automation surfaces) which pass `$ARGUMENTS` explicitly; failing loud is safer than guessing.
- An interactive prompt would diverge from the rest of the cockpit verb family, which all assume an explicitly-resolved issue context.

**Alternatives considered**:
- *Interactive prompt (Q3 option C)*: Rejected per clarification.
- *Defer `$ARGUMENTS` support (Q3 option B)*: Rejected — `/cockpit:watch` is documented to invoke `/cockpit:clarify <issue>`, so the argument must work in v1.

### D4: Ungrounded answers are rendered as a stub string in the draft, not omitted

**Decision**: When the agent cannot ground an answer in `spec.md`, `plan.md`, or a repo file, the draft for that question renders the literal text `_no draft — insufficient context_`. The developer can edit, fill in, or skip it during the approval step. The rest of the batch proceeds.

**Rationale**:
- Clarification Q4 picked option A. A stub keeps the question visible (so the developer can supply the answer manually) without blocking the batch (so confidently-drafted answers can still ship in the same run).
- The literal string is preserved as a token so downstream tooling (or future review) can detect "this answer was not agent-drafted" without re-reading the spec.

**Alternatives considered**:
- *Omit ungrounded questions (Q4 option B)*: Rejected — silently dropping a question from the draft surface makes it easy for the developer to miss that it still needs an answer.
- *Block the entire batch (Q4 option C)*: Rejected — would punish well-drafted questions for being grouped with one weak one.

### D5: Posting transport is `gh issue comment`, not a cockpit subcommand

**Decision**: The verb shells out to `gh issue comment <n> --body-file -` directly. `gh` becomes a hard runtime dependency. No new `generacy cockpit post-clarification-answers` subcommand is added.

**Rationale**:
- Clarification Q5 picked option A. #788 (G1.2 / `generacy cockpit advance`) is already implemented and shipping; adding a posting verb to it retroactively would expand its scope post-release.
- The slash-layer is the right home for GitHub-shaped mechanics: it's already orchestrating an interactive approval flow that has no analog inside the cockpit engine.

**Alternatives considered**:
- *Auto-detect (Q5 option C)*: Adds a code path with no real consumer today and doubles the testing surface. Rejected.
- *Post via `generacy` (Q5 option B)*: Rejected per clarification.

### D6: One comment per run, regardless of partial vs. full approval

**Decision**: Every invocation that has at least one approved answer posts exactly one comment containing all approved answers from that run. Subsequent runs post a new comment with whatever was newly approved — they never edit or replace the previous comment.

**Rationale**:
- FR-006 in the template caps posting at one comment per run; multiple comments per run would fragment the audit trail.
- Editing a prior comment would mutate audit history and risks dropping the canonical marker if the edit goes wrong. Append-only is safer and matches how `clarifications.md` evolves locally.

**Alternatives considered**:
- *Edit a single canonical comment via `gh api`*: Rejected — operationally fragile and breaks resume tooling that may have already scanned the prior comment.

### D7: Gate advance fires only on full approval in the current run

**Decision**: After posting, the verb invokes `generacy cockpit advance --gate clarification --issue <n>` if and only if every open question reported by `clarify-context` in this run has an approved answer in the posted comment. If any question remains pending (un-drafted, edited-but-rejected, or skipped), the verb exits 0 after posting, with a summary of pending questions for the developer.

**Rationale**:
- Clarification Q1 picked option B. The common "approve all" path posts + advances in one go; the partial case posts incrementally without prematurely flipping the gate.
- A separate, later `/cockpit:clarify` run picks up the remaining questions and (when they're all answered) advances the gate.

**Alternatives considered**:
- *Always advance after any approval (Q1 option A)*: Rejected per clarification.
- *Block posting on partial approval (Q1 option C)*: Rejected — too coarse; punishes the common partial-progress case.

## Implementation Patterns

### Pattern: Verb file frontmatter + step-numbered sections

Match the shape of `packages/claude-plugin-agency-spec-kit/commands/clarify.md`:

```markdown
---
description: <one-line summary matching the README row>
---

# Cockpit Clarify

<one-paragraph overview>

## Arguments
- `$ARGUMENTS`: optional issue number; falls back to `###-*` branch inference

## Instructions
### Step 1: Resolve target issue
### Step 2: Fetch open questions
### Step 3: Draft answers
### Step 4: Present for approval
### Step 5: Post comment
### Step 6: Advance gate (conditional)

## Constraints
## Post-Command Check
```

### Pattern: Shell invocations via Bash tool with explicit binaries

The verb instructs the agent to run shell commands via the Bash tool, naming binaries explicitly (`gh`, `generacy`) so they appear in the permission prompt and the audit trail. No `which`/`command -v` guards — let the shell surface the not-found error.

### Pattern: Comment body assembled in a tempfile to preserve formatting

```bash
cat > /tmp/cockpit-clarify-answers.md <<'EOF'
<!-- generacy-cockpit:clarification-answers -->

### Q1
<answer>

### Q2
<answer>
EOF
gh issue comment <n> --body-file /tmp/cockpit-clarify-answers.md
```

Tempfile path is documented in the verb as `/tmp/cockpit-clarify-answers-<issue>-<timestamp>.md` to avoid collisions if the verb runs concurrently for two different issues.

## Key Sources

- `specs/353-epic-generacy-ai-tetrad/spec.md` — feature scope, ownership, dependencies
- `specs/353-epic-generacy-ai-tetrad/clarifications.md` — Q1–Q5 (drove D2–D7)
- `packages/claude-plugin-cockpit/README.md` — namespace + planned-verbs table
- `packages/claude-plugin-agency-spec-kit/commands/clarify.md` — reference shape for verb files
- `specs/350-epic-generacy-ai-tetrad/plan.md` — sibling plan establishing the cockpit scaffold; lays out the marketplace + manifest patterns this verb plugs into
- Epic plan: `docs/epic-cockpit-plan.md` (in `tetrad-development#85`), section P2 / A2.3
