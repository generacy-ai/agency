## Contract: `packages/claude-plugin-cockpit/package.json`

**Feature**: 374-epic-generacy-ai-tetrad
**Phase**: 1 (design)
**Applies to**: `packages/claude-plugin-cockpit/package.json` (added by this feature)

The following table is executable by the tasks phase. Each row is either a required assertion (MUST) or a forbidden condition (MUST NOT). All row checks operate on the parsed JSON of the target file.

### Required top-level fields

| Field | Required value / shape | Sources | Verification |
|-------|-----------------------|---------|--------------|
| `name` | `"@generacy-ai/claude-plugin-cockpit"` | FR-001 | `jq -r .name package.json` equals literal string |
| `version` | `"0.0.0"` | FR-005 (Q1 answer A) | `jq -r .version package.json` equals `"0.0.0"` |
| `description` | `"Claude Code plugin providing /cockpit:* commands for running Generacy speckit epics (watch, status, queue, clarify, review, merge)"` | FR-008 (Q5 amendment) | `jq -r .description package.json` equals literal string |
| `keywords` | `["claude-plugin", "cockpit", "generacy", "tetrad", "workflow"]` (order not significant) | FR-008 | `jq -r '.keywords \| sort \| join(",")' package.json` equals `"claude-plugin,cockpit,generacy,tetrad,workflow"` |
| `author` | `"Generacy AI"` | FR-008 | `jq -r .author package.json` equals literal string |
| `license` | `"Apache-2.0"` | FR-008 | `jq -r .license package.json` equals literal string |
| `repository.type` | `"git"` | FR-008 | `jq -r .repository.type package.json` equals literal string |
| `repository.url` | `"git+https://github.com/generacy-ai/agency.git"` | FR-008 | `jq -r .repository.url package.json` equals literal string |
| `repository.directory` | `"packages/claude-plugin-cockpit"` | FR-008 | `jq -r .repository.directory package.json` equals literal string |
| `files` | `["commands", ".claude-plugin", "README.md"]` (order not significant, exactly three entries) | FR-002 | `jq -r '.files \| length' package.json` equals `3` AND `jq -r '.files \| sort \| join(",")' package.json` equals `".claude-plugin,README.md,commands"` |
| `publishConfig.access` | `"public"` | FR-004 | `jq -r .publishConfig.access package.json` equals `"public"` |

### Forbidden top-level fields (MUST NOT appear)

| Field | Reason (source) |
|-------|-----------------|
| `private` | FR-001 — presence with `true` blocks the workflow's `!p.private` filter. Absence with `false` is dead surface. |
| `type` | FR-011 (Q3 answer A) — no ESM/CJS entry point. |
| `main` | FR-011 — no code entry point. |
| `module` | FR-011 — no code entry point. |
| `types` | FR-011 — no TypeScript declarations. |
| `exports` | FR-011 — no code entry point. |
| `bin` | FR-011 — no executable shipped. |
| `scripts` | FR-011 — no build/test/lint; `pnpm -r run --if-present build` skips script-less packages cleanly. |
| `dependencies` | FR-011 — no runtime code. |
| `devDependencies` | FR-011 — no build/test tools. |
| `peerDependencies` | FR-011 — no host-runtime coupling. |
| `peerDependenciesMeta` | FR-011 — no `peerDependencies` to annotate. |
| `agency` | FR-010 (Q2 answer B) — cockpit is Claude-side only; Agency runtime never reads this file. |

### Structural rules

- File MUST be valid JSON (no trailing commas, no comments).
- File MUST end with a trailing newline.
- File MUST be located at `packages/claude-plugin-cockpit/package.json` exactly (case-sensitive).

### One-shot verification command

```bash
node -e "
  const p = require('./packages/claude-plugin-cockpit/package.json');
  const req = {
    name: '@generacy-ai/claude-plugin-cockpit',
    version: '0.0.0',
    description: 'Claude Code plugin providing /cockpit:* commands for running Generacy speckit epics (watch, status, queue, clarify, review, merge)',
    author: 'Generacy AI',
    license: 'Apache-2.0',
  };
  for (const [k, v] of Object.entries(req)) {
    if (p[k] !== v) { console.error('MISMATCH', k, JSON.stringify(p[k]), 'expected', JSON.stringify(v)); process.exit(1); }
  }
  const kws = [...(p.keywords || [])].sort().join(',');
  if (kws !== 'claude-plugin,cockpit,generacy,tetrad,workflow') { console.error('keywords', kws); process.exit(1); }
  const files = [...(p.files || [])].sort().join(',');
  if (files !== '.claude-plugin,README.md,commands') { console.error('files', files); process.exit(1); }
  if (p.publishConfig?.access !== 'public') { console.error('publishConfig.access', p.publishConfig?.access); process.exit(1); }
  if (p.repository?.type !== 'git' || p.repository?.url !== 'git+https://github.com/generacy-ai/agency.git' || p.repository?.directory !== 'packages/claude-plugin-cockpit') { console.error('repository', p.repository); process.exit(1); }
  const forbidden = ['private','type','main','module','types','exports','bin','scripts','dependencies','devDependencies','peerDependencies','peerDependenciesMeta','agency'];
  for (const k of forbidden) {
    if (Object.prototype.hasOwnProperty.call(p, k)) { console.error('forbidden field present', k); process.exit(1); }
  }
  console.log('OK');
"
```

Exit code `0` and stdout `OK` ⇒ the contract holds. Any other exit code ⇒ the field named on stderr is out of contract.
