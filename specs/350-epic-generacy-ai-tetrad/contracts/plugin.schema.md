# Contract: `plugin.json` manifest shape

**Feature**: 350-epic-generacy-ai-tetrad

The `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` document is the per-plugin manifest consumed by the Claude Code plugin loader. There is no canonical JSON schema URL referenced by the reference plugin (`agency-spec-kit`), so this contract codifies the observed shape used in this monorepo.

## Required shape

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

## Field constraints

| Field | Type | Constraint |
|-------|------|------------|
| `name` | string | Lower-case identifier matching the marketplace entry's `name`. Becomes the namespace prefix in `/<name>:<verb>`. For this issue: `"cockpit"`. |
| `description` | string | Free text, used in `/help` listings and marketplace UX. MUST match the marketplace entry's `description` byte-for-byte. |
| `author.name` | string | Display name. For this issue: `"Generacy AI"`. |
| `author.email` | string | Contact email. For this issue: `"support@generacy.ai"`. |

## Prohibited keys for this issue

| Key | Reason |
|-----|--------|
| `commands` | FR-005 — no verbs are declared at this stage. |
| `requires` (including `requires.mcp`) | FR-005 — no MCP coupling at this stage. |
| `version` | Not present in reference plugin; not required by this scaffold. |
| `license` | Not present in reference plugin; not required by this scaffold. |

## Loader behavior (informational)

- The loader globs `commands/*.md` to discover verbs at install time.
- A namespace with zero discovered verbs is expected to register successfully (SC-002). If this assumption breaks at install time, treat it as a spec gap and surface to the user — do not paper over with a stub command.

## Reference

- `packages/claude-plugin-agency-spec-kit/.claude-plugin/plugin.json` — canonical example in this repo.
