# cockpit

A Claude Code plugin providing developer-side workflow automation commands for speckit epics.

## Overview

This plugin is the home for the `/cockpit:*` namespace — developer-side workflow automation verbs that orchestrate epics, reviews, and merges around the spec-kit workflow. It ships exactly six assist-mode slash commands (`watch`, `status`, `queue`, `clarify`, `review`, `merge`), each self-contained: their behavior is the `generacy` CLI verb they wrap plus the playbook body in this repository. There are no dependencies on `specs/**` contracts, no autonomy-policy lookup, and no cross-slash-command invocation (with a single documented exception: `/cockpit:review --gate implementation-review` invokes Claude Code's built-in `/code-review`).

## Installation

1. Add the generacy marketplace to your Claude Code settings by appending `generacy-ai/agency` to `extraKnownMarketplaces`:

   ```json
   {
     "extraKnownMarketplaces": ["generacy-ai/agency"]
   }
   ```

2. Install this plugin in your Claude Code environment.
3. The slash commands will be available with the `cockpit:` prefix.

Runtime dependencies (must be on `$PATH` in the session that runs any command):

- `generacy` CLI (`npm install -g @generacy-ai/generacy` or the prevailing install command). See § Error Handling / `MISSING_BINARY` for the cluster-session PATH remedy.
- `gh` CLI, authenticated with `gh auth login`.

## Distribution

The plugin ships on two rails:

- **Generacy clusters (npm, zero-step).** Cluster setup installs
  [`@generacy-ai/claude-plugin-cockpit`](https://www.npmjs.com/package/@generacy-ai/claude-plugin-cockpit)
  from npm — channel-aware (`@preview` / `@stable`, matching the cluster's `GENERACY_CHANNEL`) —
  and `generacy setup build` copies `commands/` into `~/.claude/commands/cockpit/`, so
  `/cockpit:*` resolves in a fresh Claude Code session with no manual steps.
- **Marketplace (standalone).** Outside a cluster, install via the Claude Code marketplace using
  the steps in [Installation](#installation) above.

## Available Commands

| Command | Description |
|---------|-------------|
| `/cockpit:watch` | Stream `generacy cockpit watch <epic-ref>` and suggest the next `/cockpit:*` verb per transition |
| `/cockpit:status` | Render `generacy cockpit status <epic-ref>` output for an epic and its children |
| `/cockpit:queue` | Confirm-gated wrapper over `generacy cockpit queue <phase>` |
| `/cockpit:clarify` | Draft grounded answers for an epic's open clarifications, approve per-question, post, and advance the gate |
| `/cockpit:review` | Review a speckit gate — artifact (`spec-review`/`clarification-review`/`plan-review`/`tasks-review`) or `implementation-review` PR diff — and advance on approval |
| `/cockpit:merge` | Merge a PR via `generacy cockpit merge`; on red, spawn a bounded fixer subagent and re-evaluate. Never merges on red |

## Error Handling

Every command classifies failures identically. Each command file inlines the three-class block below verbatim as its terminal `Instructions` step; this section is the canonical source of truth those inlined blocks cite.

When the CLI exit code is non-zero (or the pre-flight failed), the command classifies the failure into exactly one of three classes (first match wins, all matches case-insensitive) and emits the matching response. Every class MUST print something — never silently no-op. The command exits non-zero on every class.

- **MISSING_BINARY** — pre-flight `command -v generacy` returned non-zero. Print:

  ```
  The generacy CLI is required but is not on $PATH. In a Generacy cluster session it is already installed — add it to your PATH: `export PATH="/shared-packages/node_modules/.bin:$PATH"` (persist it in ~/.bashrc). Standalone: install it with `npm install -g @generacy-ai/generacy`.
  ```

- **AUTH_FAILURE** — exit ≠ 0 AND captured stderr matches `/auth|unauthorized|401|gh auth/i`. Print:

  ```
  Authentication failed. The generacy CLI uses gh for GitHub access — run gh auth login and retry.
  ```

- **OTHER** — anything else. Print `CLI failed with exit code <N>.` on one line, followed by captured stderr inside a triple-backtick fenced code block.

## Related

- [Agency](https://github.com/generacy-ai/agency) — The parent repository
- [`agency-spec-kit`](../claude-plugin-agency-spec-kit) — Sibling plugin providing `/speckit:*` commands

## License

Apache-2.0
