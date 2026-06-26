# Clarifications

## Batch 1 — 2026-06-26

### Q1: Plugin Description
**Context**: `FR-001` requires a `description` in `.claude-plugin/plugin.json`, but the spec does not say what text to use. The reference plugin uses "Specification-driven development commands using Agency MCP tools". The cockpit description sets user-facing expectations in marketplace listings and `/help` output, and is reused in `marketplace.json` (FR-004).
**Question**: What `description` string should the cockpit `plugin.json` and `marketplace.json` entry use?
**Options**:
- A: "Developer-side workflow automation commands for speckit epics" (mirrors Epic Cockpit framing)
- B: "Slash commands for the cockpit watch-and-approve loop"
- C: A different string supplied by the user

**Answer**: A — `"Developer-side workflow automation commands for speckit epics"` (used for both `plugin.json` and the `marketplace.json` entry).

### Q2: Marketplace Category
**Context**: `FR-004` requires "an appropriate category" for the new entry in `.claude-plugin/marketplace.json`. The existing `agency-spec-kit` entry uses `"category": "development"`. There is no documented taxonomy in the spec or schema reference visible in the repo.
**Question**: Which `category` value should the cockpit entry use in `marketplace.json`?
**Options**:
- A: `"development"` (same as `agency-spec-kit` — simplest, consistent)
- B: `"workflow"` (matches Epic Cockpit's "developer-side workflow automation" framing)
- C: A different category the user prefers

**Answer**: A — `"development"`, consistent with the existing `agency-spec-kit` entry. (Trivial to switch to `"workflow"` later if a distinct category is preferred.)

### Q3: Empty `commands/` Directory
**Context**: `FR-002` says the directory should exist, with `.gitkeep` "if necessary". Git does not track empty directories, so a placeholder is required. The reference plugin has real `.md` files plus a `DEPRECATED.md`, so it does not demonstrate the empty-namespace case. The choice affects how downstream issues land their first verb (`/cockpit:watch`, etc.).
**Question**: How should the empty `commands/` directory be preserved in git?
**Options**:
- A: Add `commands/.gitkeep` (conventional, invisible to plugin loader)
- B: Add a placeholder `commands/README.md` explaining "verbs land here in subsequent Epic Cockpit issues"
- C: Add a stub command file that is removed when the first real verb lands

**Answer**: A — `commands/.gitkeep`. Avoid a `README.md` or stub file inside `commands/` — the plugin loader globs `commands/*.md`, so either would register a junk `/cockpit:*` command. A `.gitkeep` is invisible to the loader.

### Q4: Marketplace Identifier in README
**Context**: `US2` and `FR-003` require the README to document marketplace install via `extraKnownMarketplaces`. The reference plugin's README does NOT actually document `extraKnownMarketplaces` — it only says "Install this plugin in your Claude Code environment". The cockpit README therefore cannot copy this section verbatim. We need the concrete identifier/URL users add to their settings to register the generacy marketplace.
**Question**: What identifier should the README instruct users to add to `extraKnownMarketplaces`?
**Options**:
- A: GitHub repo shorthand: `generacy-ai/agency`
- B: A full GitHub URL: `https://github.com/generacy-ai/agency`
- C: A different identifier (e.g., a published marketplace registry path)

**Answer**: A — `generacy-ai/agency` (GitHub repo shorthand). Matches the marketplace identifier generacy's `.claude/settings.json` already references.

### Q5: README Scope and Tone
**Context**: `FR-003` says the README mirrors `claude-plugin-agency-spec-kit/README.md` in structure and tone. The reference README contains a populated "Available Commands" table and per-command sections. The cockpit plugin has zero commands at this stage but a known forward roadmap (`/cockpit:watch`, `:status`, `:clarify`, `:review`, `:merge`, etc.).
**Question**: How should the README handle the "Available Commands" section while the namespace is empty?
**Options**:
- A: Include the table but populate it only with planned verbs marked "(coming in #351–#360)" so the README is useful immediately
- B: Include an empty/placeholder commands section that explicitly states "no commands yet — see Epic Cockpit for upcoming verbs"
- C: Omit the commands section entirely until the first verb ships

**Answer**: A — Include the "Available Commands" table populated with the planned verbs (e.g. `/cockpit:watch`, `:status`, `:clarify`, `:review`, `:merge`) marked "(coming in #351–#360)" so the README is useful immediately and signals the roadmap.
