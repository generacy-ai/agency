# Quickstart: /cockpit:status command

**Feature**: 352-epic-generacy-ai-tetrad
**Date**: 2026-06-26

Two audiences:

1. **Implementers** — how to land `status.md` in this repo.
2. **End users** — how to use `/cockpit:status` from inside Claude Code once it ships.

---

## For implementers (landing the file)

### 1. Confirm the scaffold from #350 is present

```bash
ls packages/claude-plugin-cockpit/
# Expected: .claude-plugin/  commands/  README.md

ls packages/claude-plugin-cockpit/commands/
# Expected: .gitkeep      ← only entry until this issue lands
```

If the directory is missing or `.gitkeep` is absent, stop and re-verify #350 is merged.

### 2. Author `status.md`

Create `packages/claude-plugin-cockpit/commands/status.md` following the contract in [`contracts/slash-command.schema.md`](./contracts/slash-command.schema.md). Mirror the frontmatter shape used in `packages/claude-plugin-agency-spec-kit/commands/specify.md`.

Minimum sections in the body (numbered list under `## Instructions`):

1. **Argument handling** — instruct the model to pass `$ARGUMENTS` to the CLI verbatim; if empty, run the no-arg resolution chain.
2. **No-arg epic resolution** — read `specs/<current-branch>/spec.md`, grep for `**Epic**:`, fall back to listing `.generacy/epics/`, fall back to a printed usage hint.
3. **CLI invocation** — pre-flight `command -v generacy`; then `generacy cockpit status <epic-ref>` via Bash; capture exit code, stdout, stderr.
4. **Output rendering** — on success, emit optional one-line header `**Status:** <epic-ref>` then a fenced code block containing stdout verbatim.
5. **Error handling** — match the four classes (`MISSING_BINARY`, `AUTH_FAILURE`, `UNKNOWN_EPIC`, `OTHER`) and emit the tailored response per the [CLI invocation contract](./contracts/cli-invocation.md).

End with at least one example invocation in `## Examples`.

### 3. Validate frontmatter

```bash
# Confirm frontmatter parses
node -e "
const fs = require('fs');
const src = fs.readFileSync('packages/claude-plugin-cockpit/commands/status.md','utf8');
const fm = src.split('---')[1];
if (!fm) { console.error('No frontmatter'); process.exit(1); }
console.log(fm);
"
```

### 4. Confirm layout

```bash
ls packages/claude-plugin-cockpit/commands/
# Expected: .gitkeep  status.md
```

Only those two entries. No stray `.md` files. No `README.md` inside `commands/`.

### 5. Loader-safety smoke

```bash
# Confirm no spurious .md files have leaked into commands/
find packages/claude-plugin-cockpit/commands -name '*.md'
# Expected: packages/claude-plugin-cockpit/commands/status.md
```

### 6. End-to-end smoke (requires G1.1 / generacy#787 installed)

```bash
# Confirm the CLI is installed
command -v generacy && generacy cockpit status --help

# (In Claude Code) install the plugin from the marketplace
/plugin install cockpit

# (In Claude Code) explicit-argument smoke
/cockpit:status generacy-ai/tetrad-development#85
# Expected: a fenced code block listing the 19 children of the Epic Cockpit epic

# (In Claude Code) no-arg smoke — run from this branch
/cockpit:status
# Expected: same dashboard, resolved via this branch's spec.md `**Epic**:` line

# (In Claude Code) error-path smoke
/cockpit:status bogus/repo#9999
# Expected: tailored "could not resolve epic" message, not a stack trace
```

### 7. Commit

```bash
git add packages/claude-plugin-cockpit/commands/status.md
git commit -m "feat(cockpit): add /cockpit:status command (#352)"
```

The commit MUST touch only `packages/claude-plugin-cockpit/commands/status.md` (epic-isolation invariant from the spec).

---

## For end users (using the command)

### Prerequisites

- Claude Code installed.
- The `cockpit` plugin installed from the generacy marketplace (`/plugin install cockpit`).
- The `generacy` CLI installed and on `$PATH` (`npm install -g @generacy-ai/cli` — or whatever the prevailing install command is when you read this).

### Available commands

| Command | Description |
|---------|-------------|
| `/cockpit:status <epic-ref>` | Print the dashboard for the given epic |
| `/cockpit:status` | Print the dashboard for the epic of the current branch (resolved via this branch's `spec.md` `**Epic**:` line) |

### Argument shapes

| Shape | Example |
|-------|---------|
| `owner/repo#N` | `generacy-ai/tetrad-development#85` |
| `#N` | `#85` (repo defaulted by the engine resolver) |
| URL | `https://github.com/generacy-ai/tetrad-development/issues/85` |

### What the output looks like

A one-line header followed by a monospaced fenced code block:

````
**Status:** generacy-ai/tetrad-development#85

```
<epic identifier>
  P1 — Foundation
    #787  in-progress  G1.1 cockpit watch + status CLI
    #788  open         CLI resolver for #N shorthand
  P2 — Core verbs
    #351  open         cockpit:watch
    #352  in-progress  cockpit:status        ← this issue
    ...
```
````

(Actual structure, indentation, and decoration are produced by the CLI; this command preserves them by wrapping the output verbatim.)

---

## Troubleshooting

### "The `generacy` CLI is required. Install it with..."

The CLI is not on `$PATH`. Install it globally (`npm install -g @generacy-ai/cli` or per the prevailing instructions) and retry.

### "Authentication failed. Run `gh auth login`..."

The CLI shells out to `gh` for GitHub API access. Re-authenticate with `gh auth login` and retry.

### "Could not resolve epic `<ref>`..."

The reference did not resolve. Try the explicit `owner/repo#N` form (e.g., `generacy-ai/tetrad-development#85`) — bare `#N` requires the engine resolver to know your default repo (generacy#788).

### `/cockpit:status` (no args) prints a usage hint instead of a dashboard

You are not on a speckit child branch with a `spec.md`, and `.generacy/epics/` does not contain exactly one epic. Pass the epic ref explicitly.

### The output looks broken (mis-aligned columns, raw escape codes)

This is a CLI-side issue, not a slash-command issue. Run `generacy cockpit status <epic-ref>` directly in your terminal to confirm the same output, and file against generacy#787.

### A spurious `/cockpit:<something-other-than-status>` verb appeared

`packages/claude-plugin-cockpit/commands/` has been polluted with a stray `.md` file. Only `status.md` should be present (until #351, #353, #354, #355 land their own verbs).
