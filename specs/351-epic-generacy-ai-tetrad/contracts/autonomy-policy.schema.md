# Contract: Autonomy policy lookup consumed by `/cockpit:watch`

**Feature**: 351-epic-generacy-ai-tetrad
**Producer**: Upstream issues G1.1, G1.2, G1.3, A1.4 (see the Epic Cockpit checklist for current issue numbers)
**Consumer**: `packages/claude-plugin-cockpit/commands/watch.md`

## Purpose

For each actionable transition received from `generacy cockpit watch`, the playbook needs one answer: "do I dispatch a command, or just notify?" The autonomy policy is the function that answers it.

## Lookup signature

```text
lookupPolicy(transition: Transition) → PolicyEntry | undefined
```

The exact mechanism (a CLI subcommand, an MCP tool, a static file consulted by the playbook) is owned by G1.1–G1.3 / A1.4. The playbook only relies on the shape of the returned `PolicyEntry`.

## `PolicyEntry` schema (informal JSON Schema)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "AutonomyPolicyEntry",
  "type": "object",
  "required": ["mode"],
  "additionalProperties": true,
  "properties": {
    "mode": {
      "enum": ["auto", "notify-only"],
      "description": "auto = the playbook invokes `command` with `args_template`. notify-only = the playbook surfaces an inline message and takes no action."
    },
    "command": {
      "type": "string",
      "pattern": "^/cockpit:",
      "description": "Required when mode === 'auto'. The slash command to invoke. MUST start with `/cockpit:` (non-cockpit dispatch is out of scope for this issue)."
    },
    "args_template": {
      "type": "string",
      "description": "Optional template for the dispatched command's argument string. Substitutions: <repo>, <kind>, <number>, <from>, <to>. If omitted, the playbook passes `<repo>#<number>`."
    }
  }
}
```

## Consumer behavior

| Lookup result | Playbook action |
|--------------|------------------|
| `{ mode: "auto", command: "/cockpit:clarify" }` | Invoke `/cockpit:clarify <repo>#<number>` (or `args_template`-substituted args). |
| `{ mode: "auto" }` (missing `command`) | Treat as a configuration error — degrade to notify-only and prefix the inline message with `policy-error:` so the developer notices. |
| `{ mode: "notify-only" }` | Emit one inline chat notification summarizing the transition. Suggest a likely `/cockpit:*` follow-up if obvious from `kind`/`to`. |
| `undefined` (no mapping) | Treat as `notify-only` per spec clarification Q2-A. Inline message MUST include `policy: unmapped` so the developer can spot policy gaps. |

## Versioning

- Adding new fields to `PolicyEntry` MUST be additive — the playbook ignores unknown keys.
- Adding new `mode` values (e.g. a future `"prompt-once"`) requires updating this contract and the playbook in lockstep. Until then, the playbook MUST treat unknown `mode` values as `"notify-only"` with an inline `policy-error:` marker.
- Removing or renaming any of the three documented fields is a breaking change requiring coordinated updates across G1.1–G1.3, A1.4, and this consumer.

## Out of scope for this consumer

- Authoring or editing the policy file. The playbook is read-only against the policy.
- Caching policy lookups. The expected transition volume is low; per-transition lookups are fine. Optimizations belong upstream if they're ever needed.
- Surfacing policy diffs over time. If the policy changes mid-watch, the playbook just sees the new values on the next lookup — no diff surface required.
