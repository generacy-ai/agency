# Quickstart: claude-plugin-cockpit

**Feature**: 350-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This quickstart covers two audiences:
1. **Implementers** — how to land the scaffold in this repo.
2. **End users** — how to install and verify the plugin from the marketplace once the scaffold ships.

---

## For implementers (landing the scaffold)

### 1. Create the package directory

```bash
mkdir -p packages/claude-plugin-cockpit/.claude-plugin
mkdir -p packages/claude-plugin-cockpit/commands
```

### 2. Write `plugin.json`

`packages/claude-plugin-cockpit/.claude-plugin/plugin.json`:

```json
{
  "name": "cockpit",
  "description": "Developer-side workflow automation commands for speckit epics",
  "author": {
    "name": "Generacy AI",
    "email": "support@generacy.ai"
  }
}
```

### 3. Preserve the empty `commands/` directory

```bash
touch packages/claude-plugin-cockpit/commands/.gitkeep
```

> **Do not** add a `README.md` or stub `.md` inside `commands/` — the plugin loader globs `commands/*.md` and would surface it as a verb (clarification Q3).

### 4. Write the README

Create `packages/claude-plugin-cockpit/README.md` mirroring the structure of `packages/claude-plugin-agency-spec-kit/README.md`. The Installation section must add `generacy-ai/agency` to `extraKnownMarketplaces`, and the "Available Commands" table must list `/cockpit:watch`, `:status`, `:clarify`, `:review`, `:merge` with each marked `(coming in #351–#360)`.

### 5. Append the marketplace entry

Edit `.claude-plugin/marketplace.json` and append to the `plugins` array (preserving the existing `agency-spec-kit` entry):

```json
{
  "name": "cockpit",
  "description": "Developer-side workflow automation commands for speckit epics",
  "author": {
    "name": "Generacy AI",
    "email": "support@generacy.ai"
  },
  "source": "./packages/claude-plugin-cockpit",
  "category": "development"
}
```

### 6. Validate

```bash
# JSON well-formedness
node -e "JSON.parse(require('fs').readFileSync('packages/claude-plugin-cockpit/.claude-plugin/plugin.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json','utf8'))"

# Layout check (should print: README.md, .claude-plugin, commands)
ls packages/claude-plugin-cockpit/

# Loader-safety check (must print nothing)
find packages/claude-plugin-cockpit/commands -name '*.md'
```

### 7. Commit

```bash
git add packages/claude-plugin-cockpit .claude-plugin/marketplace.json
git commit -m "feat(cockpit): scaffold claude-plugin-cockpit and register in marketplace (#350)"
```

---

## For end users (installing from the marketplace)

### Prerequisites

- Claude Code installed.
- Write access to your Claude Code `settings.json` (project-scoped or user-scoped).

### Install

1. Add the generacy marketplace to your Claude Code settings:

```json
{
  "extraKnownMarketplaces": ["generacy-ai/agency"]
}
```

2. From Claude Code, install the plugin:

```
/plugin install cockpit
```

### Verify

After install, the `/cockpit` namespace is registered with zero commands. Run `/help` and confirm:

- A `cockpit` namespace appears in the list.
- No `/cockpit:*` verbs are listed yet (verbs ship in Epic Cockpit issues #351–#360).

### Uninstall

```
/plugin uninstall cockpit
```

---

## Troubleshooting

### "Plugin not found in marketplace"
Ensure `generacy-ai/agency` is in `extraKnownMarketplaces` and that you've refreshed the marketplace index (restart Claude Code if needed).

### "Namespace registered with no commands" warning
Expected for this scaffold. Verbs land in Epic Cockpit issues #351–#360.

### A spurious `/cockpit:README` or similar verb appears after install
The empty `commands/` directory has been polluted with a `.md` file. The placeholder must be `.gitkeep`, not a markdown file (clarification Q3 / FR-002).

### Marketplace JSON validation fails after edit
Re-check that the new entry's keys are `name`, `description`, `author`, `source`, `category` and that the existing `agency-spec-kit` entry was not modified.
