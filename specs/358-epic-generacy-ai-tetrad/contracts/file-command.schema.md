# Contract: `/cockpit:file` argument grammar and error envelope

**Feature**: 358-epic-generacy-ai-tetrad
**Date**: 2026-06-29

This contract pins (a) the slash command's argument shape and (b) the inline-message shapes the playbook emits. It does NOT cover the artifact handoff between `tasks_to_issues` and `manifest sync` — see `manifest-handoff.schema.md` for that.

## Argument grammar

```
/cockpit:file [<epic-ref>]
/cockpit:file --help                    # explicit help
```

| Token | Type | Required | Default | Valid values |
|-------|------|----------|---------|--------------|
| `<epic-ref>` | string | no | — | One of: bare `#N` (e.g. `351`), fully-qualified `owner/repo#N` (e.g. `generacy-ai/agency#351`), or a GitHub issue URL. |
| `--help` | flag | no | (not set) | Presence triggers Help / discovery branch. |

### Parsing rules

1. The playbook performs **zero structural validation** of `<epic-ref>` beyond the empty-vs-non-empty test.
2. If `$ARGUMENTS` is `--help` OR matches `*--help*`, branch to **Help / discovery** below.
3. If `$ARGUMENTS` is empty, set `epic_ref = null` and proceed to the engine call (engine creates a new parent unless its dedup finds one — see clarification Q5).
4. Otherwise, set `epic_ref = $ARGUMENTS` (verbatim) and pass it to the engine. The engine's ref resolver normalizes the form (matches `commands/watch.md:13-15`).

### Help / discovery

When the command is invoked with `--help`, emit a short overview, the argument table, and the engine boundary. No file reads, no MCP calls, no shell-outs.

Output (verbatim shape — fill in current arg/engine tables):

```
/cockpit:file — file an epic + child issues from tasks.md, then sync the epic manifest.

Usage:
  /cockpit:file [<epic-ref>]

Arguments:
  <epic-ref>  optional. Existing parent epic to reuse (recovery / idempotency).
              Forms: 351, generacy-ai/agency#351, https://github.com/.../issues/351
              Omitted → engine creates a new parent (or reuses one detected by title/marker).

Engines:
  spec_kit.tasks_to_issues   creates parent + children, writes numbers to tasks.md
  generacy cockpit manifest sync   re-parses epic body, updates .generacy/epics/<slug>.yaml

The slash command is a thin orchestrator. It does not resolve refs and does not edit
tasks.md or the .yaml itself.
```

## Error envelope (inline chat messages)

The playbook emits inline chat lines in two shapes:

### Shape A: engine failure

```
[cockpit:file] <step>: <one-line summary>
  detail: <verbatim engine error>
  next:   <suggested recovery command>
```

| Slot | Required | Allowed values |
|------|----------|----------------|
| `<step>` | yes | `tasks_to_issues` \| `manifest sync` |
| `<one-line summary>` | yes | Free-form short phrase, ≤ 80 chars. |
| `detail:` | yes | Verbatim engine output. May span multiple lines (indent continuation lines under `detail:`). |
| `next:` | conditional | Present when FR-005 or FR-006 supplies a recovery command. Omit when no recovery is available. |

### Shape B: successful completion

```
[cockpit:file] filed <n> issue(s) under <parent-ref>; manifest synced to <yaml-path>
```

| Slot | Required | Allowed values |
|------|----------|----------------|
| `<n>` | yes | Non-negative integer. Zero is valid (full no-op re-run that still converged the `.yaml`). |
| `<parent-ref>` | yes | Bare `#N` form of the parent epic. |
| `<yaml-path>` | yes | Repo-relative path emitted by `manifest sync`, e.g. `.generacy/epics/<slug>.yaml`. |

### Shape C: validation failure (before any engine call)

```
[cockpit:file] usage error: <message>
```

Emitted only for the help / unknown-flag branches. Examples:

```
[cockpit:file] usage error: unknown flag '--target'. Run /cockpit:file --help for usage.
```

## Versioning rule

This contract is part of the cockpit playbook surface. Breaking changes (argument shape, message prefix, slot order) require a new major version of `claude-plugin-cockpit`. Additive changes (a new optional flag, an additional slot rendered when present) are MINOR and forward-compatible — consumers MUST ignore unknown slots.

## Non-goals

- The playbook does NOT define a JSON output mode. All output is inline chat, intended for human reading.
- The playbook does NOT emit progress events during long engine calls. The MCP tool and CLI handle their own progress reporting.
- The playbook does NOT log to a file. Use `gh issue view` or `cat .generacy/epics/<slug>.yaml` to inspect post-hoc state.
