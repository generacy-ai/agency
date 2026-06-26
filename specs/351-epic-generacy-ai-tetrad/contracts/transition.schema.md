# Contract: Transition record emitted by `generacy cockpit watch`

**Feature**: 351-epic-generacy-ai-tetrad
**Producer**: `generacy cockpit watch` (#787)
**Consumer**: `packages/claude-plugin-cockpit/commands/watch.md`

## Wire format

One JSON object per line on stdout. The `Monitor` tool buffers a line, then emits one notification per line to the agent driving the playbook. No partial lines, no multi-line records.

## Schema (informal JSON Schema)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CockpitWatchTransition",
  "type": "object",
  "required": ["repo", "kind", "number", "from", "to"],
  "additionalProperties": true,
  "properties": {
    "repo": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
      "description": "owner/repo, e.g. generacy-ai/agency"
    },
    "kind": {
      "type": "string",
      "description": "issue | pr today; extensible upstream. The consumer MUST NOT treat unknown values as errors."
    },
    "number": {
      "type": "integer",
      "minimum": 1
    },
    "from": {
      "type": ["string", "null"],
      "description": "Prior label/state. null indicates a baseline state-sync line (see semantics below)."
    },
    "to": {
      "type": "string",
      "description": "New label/state."
    },
    "at": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 timestamp the upstream observed the transition. Optional; consumer does not use it for dedupe."
    },
    "source": {
      "type": "string",
      "description": "Free-form provenance, e.g. webhook | poll. Pass through to notifications."
    }
  }
}
```

## Semantics

### Baseline lines (`from === null`)

When `generacy cockpit watch` connects to its upstream, it emits one record per currently-known epic state with `from: null` so the consumer can re-sync without re-firing actions. The playbook MUST classify these as state-sync, record them in the dedupe seen-set, and dispatch nothing. This is the load-bearing contract that lets a watch restart re-establish state cleanly (per spec clarification Q1).

### Actionable transitions (`from === "X", to === "Y"`)

Every line where `from` is a non-null string IS an actionable transition. The playbook:

1. Computes `transition_id = ${repo}:${kind}:${number}:${from}→${to}`.
2. Drops if already in the seen-set.
3. Adds to the seen-set.
4. Looks up the autonomy policy (see `autonomy-policy.schema.md`).
5. Dispatches `auto` commands directly; surfaces `notify-only` / unmapped transitions as a single inline chat message.

### Echo lines (`from === "X", to === "X"`)

Should not be emitted by `generacy cockpit watch`. If they are, the playbook MUST drop them — they aren't transitions.

### Malformed lines

A line that fails JSON.parse, or parses but lacks one of the required fields (`repo`, `kind`, `number`, `from`, `to`), MUST be logged inline (so the developer notices upstream regressions) and skipped. The watch loop MUST NOT terminate on a malformed line.

## Retry / reconnect

Owned entirely by `generacy cockpit watch` (per #787 FR-009). The playbook does NOT implement its own retry. If the spawned process exits permanently — i.e. `Monitor` reports the process gone, not just a stream blip — the playbook surfaces that inline and prompts the user to re-invoke `/cockpit:watch`.

## Versioning

Additive changes (new optional fields, new `kind` values) MUST be ignored by the playbook. Breaking changes (renaming a required field, changing the baseline marker) require coordinated updates to this file and `commands/watch.md`.
