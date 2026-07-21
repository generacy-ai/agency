# Quickstart: verifying #445 changes

## What this feature ships

Documentation and skill-description updates that make the conversational entry point to `/cockpit:auto` discoverable — Claude sessions offer `/cockpit:auto <numbers>` after issues get filed during the conversation.

## Files changed

- `packages/claude-plugin-cockpit/commands/auto.md`
- `packages/claude-plugin-cockpit/.claude-plugin/plugin.json`
- `packages/claude-plugin-cockpit/README.md`
- `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` (re-pins if needed)

## Local verification

### 1. Inspect the auto.md frontmatter

```bash
head -8 packages/claude-plugin-cockpit/commands/auto.md
```

Expected: the `description:` field now mentions the issue-list invocation form and no longer implies an epic is required.

### 2. Inspect plugin.json

```bash
cat packages/claude-plugin-cockpit/.claude-plugin/plugin.json
```

Expected: the plugin-level `description` mentions issue-list invocation (e.g. "…for speckit epics or ad-hoc issue lists"). No `commands` array present.

### 3. Inspect the new `## Offering auto` section

```bash
grep -n '^## Offering auto' packages/claude-plugin-cockpit/commands/auto.md
```

Expected: exactly one match. Reading the section body should describe:

- When to offer (any 1+ issue filed to workspace repo this session).
- The three hard rules (concrete numbers, confirmation-gated, at-most-once-per-batch).
- Suggested phrasing (not prescribed).

### 4. Inspect the README additions

```bash
grep -n '^## Quick start\|^### Growing scope mid-run\|^### Running multiple conversations\|^## Offer guidance' packages/claude-plugin-cockpit/README.md
```

Expected: four matches, one per new section.

### 5. Run the playbook-verification test suite

```bash
pnpm --filter claude-plugin-cockpit test
```

Expected: all tests pass. If a pinning assertion fails against the new prose, re-pin it to the new contract in the same PR (per `CLAUDE.md § Cockpit playbook pins`). **Do NOT weaken the assertion.**

### 6. Full workspace build

```bash
pnpm install && pnpm build
```

Expected: clean build.

## Usage — the flow this feature makes discoverable

### Discover → file → process

1. During conversation, Claude helps investigate a bug and confirms it reproduces.
2. Claude files the issue (`gh issue create` or the `--new "<title>"` form via a subsequent auto session).
3. Repeat for a second bug — now you have `#223` and `#224` filed.
4. Claude offers: "Want me to run `/cockpit:auto 223, 224` to process these?" (wording varies; the concrete numbers and the confirmation gate do not).
5. On operator confirmation, `/cockpit:auto 223, 224` starts a session that drives both issues to terminal.

### Growing scope mid-run

While an auto session is running:

- **Add existing**: type `also process #226`. Session parses the ref, calls `cockpit_scope_add` + `cockpit_queue`, no gate. See `commands/auto.md § Add-issue flow (mid-run)`.
- **File new**: type `file an issue for the flaky test in module foo`. Session drafts, lands on the G.6 filing gate for confirmation, then queues. See same section.

### Running multiple conversations

Kick off two auto sessions in different conversations with different issue sets. Both watch and dispatch in parallel. Note: implementation of queued work interleaves through a single cluster worker per user — you get parallel observability, serialized execution.

## Rollback

Revert the PR. There is no schema migration, no state to unwind, no cluster restart required.
