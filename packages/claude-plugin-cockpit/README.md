# cockpit

A Claude Code plugin providing developer-side workflow automation commands for speckit epics.

## Overview

This plugin is the home for the `/cockpit:*` namespace — developer-side workflow automation verbs that orchestrate epics, reviews, and merges around the spec-kit workflow. It ships exactly six assist-mode slash commands (`watch`, `status`, `queue`, `clarify`, `review`, `merge`), each self-contained: their behavior is the `generacy` CLI verb they wrap plus the playbook body in this repository. There are no dependencies on `specs/**` contracts, no autonomy-policy lookup, and no cross-slash-command invocation. Cross-command composition uses the Agent tool (subagent boundary); a slash command is never invoked inline in another command's shared context (see #390 for the recurrence pattern this rule closes, following #384 and #388).

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
| `/cockpit:auto` | Drive an epic to `epic-complete` — watch transitions, dispatch through CLI verbs + subagents, gate on judgment surfaces. Never merges on red; every gate prompts (no auto-approve). |

## Quick start — from bug discovery to processed PRs

The end-to-end conversational flow: a developer discovers bugs while collaborating with Claude, files them as GitHub issues, and hands them to `/cockpit:auto` for automated processing — no epic required.

### 1. Discover in conversation

Bugs surface during any collaboration — investigation, code review, testing, reproducing a customer report:

```
> the login page 500s when the session cookie is stale — I can repro it locally
```

### 2. File the issues

File with `gh` directly, or let the auto session's G.6 filing gate draft them for you:

```bash
gh issue create --title "Login page 500s on stale session cookie" --body "…"
# → https://github.com/generacy-ai/agency/issues/223
gh issue create --title "Session refresh silently no-ops after expiry" --body "…"
# → https://github.com/generacy-ai/agency/issues/224
```

Alternatively, an auto session launched with `--new "<title>"` drafts the tracking issue's title and body and presents them at the G.6 filing gate; approved drafts land as real issues via `gh issue create`.

### 3. Kick off auto

Pass the resolved issue numbers directly — no epic, no tracking issue required:

```
/cockpit:auto 223, 224
```

The auto loop drives both issues to terminal state, gating on the same judgment surfaces (clarifications, reviews, phase-queue confirmations, red/error escalations) as an epic-driven run.

### Growing scope mid-run

While an auto session is running, either intent works as a mid-run message:

- **Add-existing** — `also process #226` → `cockpit_scope_add` + `cockpit_queue` (no gate; the ref must already exist).
- **File-new** — `file an issue for the flaky test in module foo` → drafter subagent → G.6 filing gate → on `Approve & file`, `gh issue create` runs and the new ref lands in scope via `cockpit_scope_add` + `cockpit_queue`.

See `commands/auto.md § Add-issue flow (mid-run)` for the parsing rules and gate behavior.

### Running multiple conversations

Concurrent auto sessions with different issue sets are supported — each session has its own tracking ref and ledger, and their watch / dispatch loops run in parallel. **Execution interleaves through a single cluster worker per user**: the *watch* side is parallel, but the actual issue-processing runs one at a time on the cluster. Frame the expectation as "parallel observability, serialized execution" — two concurrent sessions do not deliver 2× throughput on the same cluster.

## Offer guidance — when should a session offer /cockpit:auto?

Companion guidance for Claude sessions collaborating with a developer: after helping file one or more issues, when should the session suggest running `/cockpit:auto <numbers>` on them? The rules below mirror `commands/auto.md § Offering auto`.

**When to offer** (R1): after any 1+ issues have been successfully filed to the workspace's repo during the current session, regardless of who drafted the text. No provenance filter, no content heuristic — the offer is cheap and confirmation-gated.

**How to offer** — three hard rules:

1. **R2 — concrete numbers only.** The offer MUST include the resolved issue-number list (e.g. `/cockpit:auto 223, 224`), never a placeholder.
2. **R3 — confirmation-gated.** The offer MUST be a suggestion the developer confirms. Never auto-run `/cockpit:auto` on the operator's behalf.
3. **R4 — at most once per batch.** The offer SHOULD fire at most once per batch of filed issues; if the developer declines, don't re-nag.

**Suggested phrasing** (not prescribed): e.g. "Want me to run `/cockpit:auto 223, 224` to process these?" — with room for session-level variation.

**What it is NOT**: not a gate, not an `AskUserQuestion`, not part of the auto loop — pre-invocation conversational surface only.

Source of truth: `commands/auto.md § Offering auto`.

## Configuration — models, quiet mode, heartbeat (`cockpit.auto`)

`/cockpit:auto` reads an optional `cockpit.auto` block from the workspace's `.generacy/config.yaml` once at pre-flight:

```yaml
cockpit:
  auto:
    loop: { model: sonnet, effort: low }   # loop session; consumed by headless launchers, not by the playbook
    heartbeatSeconds: 1200                 # base C4 heartbeat (default 300); backs off ×2 to 1800s while drains stay empty
    quiet: true                            # headless output profile (same as passing --quiet)
    agents:                                # per-role model/effort for the analysis subagents
      default:   { model: sonnet }
      clarifier: { model: opus, effort: high }
      reviewer:  { model: opus, effort: high }
      validator: { model: haiku }
      fixer:     { model: sonnet, effort: high }
      diagnoser: { model: sonnet }
```

The five analysis hops run as named agents shipped in `agents/` — `cockpit-clarifier` (clarification drafting), `cockpit-reviewer` (artifact + PR review), `cockpit-validator` (manual-validation summary), `cockpit-fixer` (bounded red-checks fixer), `cockpit-diagnoser` (agent-error / merge-conflict diagnosis). Role resolution per spawn is `agents.<role>` → `agents.default` → inherit the session model. This is what lets the loop session run on a cheap model while review/clarification reasoning stays on a strong one.

**Quiet mode** (`--quiet` flag or `quiet: true`): ledger lines go to the run's `.ledger` file only (no `[ledger]` transcript echo), status tables print only inside gate bodies, and the exit run summary is posted as a comment on the tracking ref instead of the transcript. Intended for headless UI-launched runs (`--gates=ui`); interactive behavior is unchanged without it.

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
