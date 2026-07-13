# Contract: marketplace.json entry shape

**Feature**: 350-epic-generacy-ai-tetrad

The root `.claude-plugin/marketplace.json` is the canonical marketplace manifest for the generacy marketplace. It carries a `$schema` reference to `https://anthropic.com/claude-code/marketplace.schema.json`, which is the upstream contract. This document codifies the per-entry fields used by this monorepo.

## Required shape (the new entry to append)

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

## Field constraints

| Field | Type | Constraint |
|-------|------|------------|
| `name` | string | Identifier used by `/plugin install <name>`. MUST equal `plugin.json#name`. For this issue: `"cockpit"`. |
| `description` | string | Marketplace listing text. MUST equal `plugin.json#description` byte-for-byte (FR-001 + FR-004). |
| `author.name` | string | Display name. For this issue: `"Generacy AI"`. |
| `author.email` | string | Contact email. For this issue: `"support@generacy.ai"`. |
| `source` | string | Repo-relative path to the plugin package, with leading `./`. For this issue: `"./packages/claude-plugin-cockpit"`. |
| `category` | string | Marketplace taxonomy bucket. For this issue: `"development"` (matches `agency-spec-kit` per clarification Q2). |

## Invariants the edit MUST preserve

| Invariant | Why |
|-----------|-----|
| `$schema`, top-level `name`, top-level `description`, `owner` are unchanged | Out-of-scope for this issue. |
| The existing `agency-spec-kit` entry in `plugins[]` is unchanged | FR-004 + Out-of-Scope. |
| The new entry is appended (not inserted) and is the second element of `plugins[]` | Deterministic diff; reviewers can read the patch as a pure append. |
| JSON is 2-space indented and ends with a newline | Matches current file. |

## Validation

After editing, the file should validate against `https://anthropic.com/claude-code/marketplace.schema.json`. Use any JSON Schema validator (e.g., `ajv-cli`) or rely on the Claude Code marketplace install probe as an end-to-end validation.

## Reference

- `.claude-plugin/marketplace.json` — file to edit; carries the schema URL in its `$schema` field.
- `https://anthropic.com/claude-code/marketplace.schema.json` — upstream JSON Schema (authoritative).
