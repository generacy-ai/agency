# Data Model: claude-plugin-cockpit scaffold

**Feature**: 350-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This feature ships no code, no database, and no runtime entities. The "data model" is the shape of two committed JSON documents and one supporting filesystem layout.

## Entities

### E1: Plugin manifest (`packages/claude-plugin-cockpit/.claude-plugin/plugin.json`)

| Field | Type | Required | Value for this issue |
|-------|------|----------|----------------------|
| `name` | string | yes | `"cockpit"` |
| `description` | string | yes | `"Developer-side workflow automation commands for speckit epics"` |
| `author` | object | yes | `{ "name": "Generacy AI", "email": "support@generacy.ai" }` |
| `commands` | array | no | **omit** (FR-005) |
| `requires.mcp` | array | no | **omit** (FR-005) |

**Validation rules**:
- Must be valid JSON, UTF-8 encoded, ending with a newline.
- `name` MUST equal `"cockpit"` (FR-001).
- `description` MUST equal the value above byte-for-byte and MUST match the `description` in the marketplace entry (FR-004).
- No `commands` or `requires` keys may be present (FR-005).
- 2-space indentation (matches reference plugin).

### E2: Marketplace entry (object appended to `.claude-plugin/marketplace.json` → `plugins`)

| Field | Type | Required | Value for this issue |
|-------|------|----------|----------------------|
| `name` | string | yes | `"cockpit"` |
| `description` | string | yes | `"Developer-side workflow automation commands for speckit epics"` |
| `author` | object | yes | `{ "name": "Generacy AI", "email": "support@generacy.ai" }` |
| `source` | string | yes | `"./packages/claude-plugin-cockpit"` |
| `category` | string | yes | `"development"` |

**Validation rules**:
- Must be valid JSON conforming to `https://anthropic.com/claude-code/marketplace.schema.json`.
- `source` MUST be a repo-relative path (leading `./`, matches the `agency-spec-kit` convention).
- `name`, `description` MUST match the corresponding fields in E1 byte-for-byte (FR-001 + FR-004).
- `category` MUST equal `"development"` (FR-004 + clarification Q2).

### E3: Empty `commands/` directory

| Field | Type | Required | Value for this issue |
|-------|------|----------|----------------------|
| path | string | yes | `packages/claude-plugin-cockpit/commands/` |
| placeholder | file | yes | `.gitkeep` (empty file) |

**Validation rules**:
- Directory MUST exist in git after commit (E3 placeholder ensures this).
- Directory MUST contain zero `.md` files (FR-005; clarification Q3 — the loader globs `*.md`).
- `.gitkeep` MUST be the only file inside.

### E4: Plugin README (`packages/claude-plugin-cockpit/README.md`)

| Section | Required | Content rule |
|---------|----------|--------------|
| Title (H1) | yes | `# cockpit` (or `# claude-plugin-cockpit` — matching reference style) |
| Overview | yes | One short paragraph: cockpit is the developer-side workflow automation namespace; verbs ship in Epic Cockpit issues #351–#360. |
| Installation | yes | Must instruct users to add `generacy-ai/agency` to `extraKnownMarketplaces`, then install `cockpit`. |
| Available Commands | yes | Markdown table populated with planned verbs (`/cockpit:watch`, `:status`, `:clarify`, `:review`, `:merge`) each annotated `(coming in #351–#360)`. |
| Related (optional) | no | May link to the parent agency repo or sibling `agency-spec-kit` plugin. |

**Validation rules**:
- Must include the literal string `generacy-ai/agency` (FR-003 + Q4).
- Must include the literal string `coming in #351–#360` at least once (Q5).
- Tone and section ordering MUST mirror `packages/claude-plugin-agency-spec-kit/README.md` (FR-003).

## Relationships

```
.claude-plugin/marketplace.json
        │
        │  plugins[] contains E2 (entry for cockpit)
        │  E2.source ──────────────────► packages/claude-plugin-cockpit/
        │                                          │
        │                                          ├── .claude-plugin/plugin.json   (E1)
        │                                          ├── commands/                    (E3)
        │                                          │     └── .gitkeep
        │                                          └── README.md                    (E4)
        │
        │  E2.name        ◄═══ MUST equal ═══►  E1.name
        │  E2.description ◄═══ MUST equal ═══►  E1.description
```

## Cross-document invariants

- `E1.name == E2.name == "cockpit"`
- `E1.description == E2.description == "Developer-side workflow automation commands for speckit epics"`
- The reference plugin entry (`agency-spec-kit`) in `marketplace.json` MUST remain unchanged.
- `E3` directory MUST contain no `.md` files at commit time.
