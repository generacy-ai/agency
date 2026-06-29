# Quickstart: /cockpit:plan command

**Feature**: 356-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This quickstart covers two audiences:
1. **Implementers** — how to land the `plan.md` slash command in this repo.
2. **End users** — how to install and use `/cockpit:plan` once it ships.

---

## For implementers (landing the command)

### Prerequisites

- The `claude-plugin-cockpit` scaffold from A1.4 is landed (already on `develop` — five sibling commands `clarify.md`, `merge.md`, `review.md`, `status.md`, `watch.md` load via `commands/*.md` auto-discovery).
- `gh` CLI is installed and authenticated in the developer's environment.
- The `AskUserQuestion` tool is available in the Claude Code runtime where the cockpit plugin runs.

### 1. Create the command file

```bash
touch packages/claude-plugin-cockpit/commands/plan.md
```

### 2. Author the frontmatter and prompt body

Frontmatter (use the shape from `contracts/slash-command.contract.md`):

```yaml
---
description: Scaffold (or non-destructively assist) an epic-level planning doc at docs/epic-<slug>-plan.md. Human-led — never overwrites, never advances a gate, never comments on the epic.
arguments:
  - name: epic-ref
    description: Bare issue number (e.g. 356) or owner/repo#N (e.g. generacy-ai/agency#356). Resolves epic title/body via gh. The planning doc is always written into the current working tree's docs/ directory.
    required: true
---
```

Prompt body structure (mirrors `packages/claude-plugin-cockpit/commands/clarify.md`'s `gh`-shelling pattern and `merge.md`'s output discipline):

1. **Parse `$ARGUMENTS`** per `data-model.md` E1: trim, validate as bare integer or `owner/repo#N`. Empty → Usage line, exit 0. Malformed → parse error, exit non-zero.
2. **Resolve the epic** via `Bash`: `gh issue view <ref> --json title,body`. Surface failures verbatim and exit non-zero (per FR-009).
3. **Extract metadata** from `body` per `data-model.md` E2: optional `slug:`, `Phase:`, `Tier:`. First match wins; tolerate bold-wrapped keys (`**Phase**:`).
4. **Derive slug** per `data-model.md` E3: explicit `slug:` wins; otherwise strip `Epic:` / `Epic ` / `[…]` prefix, lowercase, replace non-alphanumerics with `-`, collapse runs, trim, cap at 60 chars at a `-` boundary.
5. **Compute target_path** = `<cwd>/docs/epic-<slug>-plan.md`. Ensure `<cwd>/docs/` exists (mkdir -p if missing).
6. **Branch on file existence**:
   - **Does not exist (US1)**: write the canonical skeleton verbatim from `contracts/planning-doc.contract.md` — H1 + metadata block (partial-rendered per D7) + the eight canonical H2 sections in fixed order, each with its `<!-- TODO: … -->` placeholder. Emit `wrote planning skeleton: <abs-path>`. Exit `0`.
   - **Exists (US2)**: parse the existing doc's H2 headings (skip code-fenced regions); run the comparator from `data-model.md` E4 against the canonical list + alias table.
     - If zero missing → emit `planning doc already complete: <abs-path>`. Exit `0`.
     - Otherwise → call `AskUserQuestion` with the E5 payload (`Append` / `Cancel`).
       - On `Append`: append a single `<!-- generacy-cockpit:appended -->` marker line plus the missing sections (canonical order, placeholder bodies) per `contracts/planning-doc.contract.md`. Emit `appended <N> section(s) to: <abs-path>`. Exit `0`.
       - On `Cancel` (or any free-text fallback): emit `planning doc not modified: <abs-path>`. Exit `0`.
       - If `AskUserQuestion` is unreachable (non-interactive context): emit `missing sections: <list>; cannot prompt for append in non-interactive context — no changes made to <abs-path>`. Exit `0`.
7. **Output discipline**: one status line per outcome. No multi-line summaries.

### 3. Validate

```bash
# Loader sanity: the file must be picked up by the cockpit namespace
ls packages/claude-plugin-cockpit/commands/plan.md

# Frontmatter parses as YAML (best-effort smoke test)
head -n 20 packages/claude-plugin-cockpit/commands/plan.md | grep -q '^---$' && echo "frontmatter delimiter present"

# Isolation check: no other files in the repo were modified
git status --porcelain | grep -v '^?? specs/356-' | grep -v 'packages/claude-plugin-cockpit/commands/plan.md'
# (should print nothing — only the new spec dir and the new command file should appear)
```

### 4. Smoke test (manual)

Install the plugin in a Claude Code environment, then run:

```
/cockpit:plan 356                       # fresh — expect skeleton at docs/epic-<slug>-plan.md
/cockpit:plan 356                       # re-run — expect "planning doc already complete"
# (delete the "## Risks" H2 line and its body by hand)
/cockpit:plan 356                       # expect AskUserQuestion listing "Risks" as missing
# (choose Append)                       # expect "appended 1 section(s) to: …"

/cockpit:plan                           # no arg — expect Usage line, exit 0, no file touched
/cockpit:plan not-a-number              # expect parse error, exit non-zero
/cockpit:plan owner/none#999            # expect gh's not-found error verbatim, exit non-zero

# Cross-repo qualified ref
/cockpit:plan generacy-ai/tetrad-development#85   # expect doc written into the CURRENT cwd's docs/

# Alias table check (after a fresh run)
# Rename "## Goals" to "## Objectives" by hand
/cockpit:plan 356                       # expect "planning doc already complete" (alias match)

# Out-of-table rename
# Rename "## Risks" to "## Hazards" by hand
/cockpit:plan 356                       # expect "Risks" listed as missing in the prompt
```

### 5. Commit

```bash
git add packages/claude-plugin-cockpit/commands/plan.md specs/356-epic-generacy-ai-tetrad
git commit -m "feat(cockpit): /cockpit:plan command for epic-level planning-doc scaffolding (#356)"
```

---

## For end users (using `/cockpit:plan`)

### Prerequisites

- The cockpit plugin is installed (see `packages/claude-plugin-cockpit/README.md`).
- `gh` is on PATH and authenticated against the repo(s) you reference.
- You're invoking from the working tree where you want the planning doc to land — typically the epic's primary/orchestration repo.

### Basic usage — scaffold a new planning doc

```
/cockpit:plan 356
```

The command will:
1. Resolve issue 356 in the current repo (via `gh`).
2. Derive the slug from the epic title (or from an explicit `slug:` line in the body).
3. Write `docs/epic-<slug>-plan.md` with the canonical skeleton.
4. Print the absolute path so you can open it immediately.

The skeleton has eight H2 sections in fixed order: Context, Goals, Non-Goals, Phases, Ownership / Isolation, Sequencing & Dependencies, Risks, Open Questions. Fill them in — the command will not touch them again.

### Cross-repo epics

```
/cockpit:plan generacy-ai/tetrad-development#85
```

The command resolves the issue from the qualified `owner/repo#N`, but the planning doc **always lands in the current working tree's `docs/`**, never in the cross-repo target. This matches the cockpit convention: run `/cockpit:plan` from wherever you want the doc to live.

### Re-running on an existing doc

```
/cockpit:plan 356
```

If `docs/epic-<slug>-plan.md` already exists, the command:
- Parses its H2 headings.
- Compares against the canonical list, honoring aliases (`Goals ↔ Objectives`, `Non-Goals ↔ Out of Scope`).
- If every canonical section is present (directly or via alias): reports `planning doc already complete: <abs-path>` and exits without touching the file.
- If some sections are missing: prompts you in-conversation to `Append` or `Cancel`. Append-only — your existing content is never modified.

### Forcing a specific slug

If your epic title is awkward and you want a cleaner filename, add a `slug:` line to the epic body:

```markdown
slug: cockpit-plan-verb
```

The command uses the slug verbatim (you'll get `docs/epic-cockpit-plan-verb-plan.md`).

---

## Troubleshooting

### `invalid epic-ref: <value>`
The argument is neither a bare positive integer nor `owner/repo#N`. Check the shape and retry.

### `failed to resolve epic <ref>`
`gh` couldn't view the issue. Either it doesn't exist, you don't have access, or `gh` isn't authenticated. The previous lines have `gh`'s native error — read those first.

### `could not derive slug from title: <title> — add a slug: line to the epic body`
The epic title normalized to an empty string (e.g., it was just `Epic: [...]`). Add an explicit `slug: …` line to the epic body and re-run.

### `slug contains invalid characters: <slug>`
The explicit `slug:` line in the epic body contains `/`, `\`, or whitespace. Fix the slug in the epic body — the command refuses to silently rewrite a developer-provided slug.

### `planning doc not modified: <abs-path>`
You cancelled the append prompt. No file change happened. Re-run the command and choose `Append` if you change your mind.

### `missing sections: <list>; cannot prompt for append in non-interactive context — no changes made to <abs-path>`
You're running the command in a context where `AskUserQuestion` is unreachable (e.g., a non-interactive automation). The command degrades safely by listing the missing sections and exiting without writing. Re-run interactively to use the append flow.

### "I wanted the doc written into a *different* repo"
By design, the command always writes into the current working tree's `docs/`. Either `cd` to the target repo first (and pass the bare or qualified ref), or run the command from the orchestration repo (which is the cockpit convention — the planning doc lives where the orchestrator session lives).

### "Re-runs keep flagging `Goals` (or `Non-Goals`) as missing even though I renamed them"
Only `Objectives` (for `Goals`) and `Out of Scope` / `Out-of-Scope` (for `Non-Goals`) are aliases. Any other rename counts as missing. If you want a different alias supported, file a follow-up against this plugin.

### "I want the metadata block in YAML front-matter instead"
Out of scope for v1 — the markdown-bold format is fixed (per clarification Q5) so that the downstream parser (#790) keeps working. A future flag could expose alternative formats.
