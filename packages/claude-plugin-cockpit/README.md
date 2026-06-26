# cockpit

A Claude Code plugin providing developer-side workflow automation commands for speckit epics.

## Overview

This plugin is the home for the `/cockpit:*` namespace — developer-side workflow automation verbs that orchestrate epics, reviews, and merges around the spec-kit workflow. The verb files ship in Epic Cockpit issues #351–#360; this scaffold reserves the namespace and the marketplace entry so those issues can drop `commands/*.md` files in without further setup.

## Installation

1. Add the generacy marketplace to your Claude Code settings by appending `generacy-ai/agency` to `extraKnownMarketplaces`:

   ```json
   {
     "extraKnownMarketplaces": ["generacy-ai/agency"]
   }
   ```

2. Install this plugin in your Claude Code environment.
3. The slash commands will be available with the `cockpit:` prefix.

## Available Commands

| Command | Description |
|---------|-------------|
| `/cockpit:watch` | Watch an epic and apply the autonomy policy to each transition |
| `/cockpit:status` | Report the current status of an epic and its children (coming in #351–#360) |
| `/cockpit:clarify` | Drive clarification flow against an epic's open questions |
| `/cockpit:review` | Coordinate review of a speckit gate — artifact (spec/clarifications/plan/tasks) or impl PR diff — and optionally advance the gate label. |
| `/cockpit:merge` | Merge a completed epic's branches in dependency order (coming in #351–#360) |

## Related

- [Agency](https://github.com/generacy-ai/agency) — The parent repository
- [`agency-spec-kit`](../claude-plugin-agency-spec-kit) — Sibling plugin providing `/speckit:*` commands

## License

MIT
