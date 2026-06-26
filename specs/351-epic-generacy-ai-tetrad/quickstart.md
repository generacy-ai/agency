# Quickstart: /cockpit:watch

**Feature**: 351-epic-generacy-ai-tetrad
**Date**: 2026-06-26

This quickstart covers two audiences:
1. **Implementers** — how to land the slash-command playbook in this repo.
2. **End users** — how to invoke the command and what to expect.

---

## For implementers (landing the playbook)

### Prerequisites

- `claude-plugin-cockpit` package scaffold from #350 already on `develop` (provides `commands/` directory and marketplace entry).
- `generacy cockpit watch` (#787) available on `PATH` in the developer's environment for acceptance testing.
- Autonomy policy lookup surface from G1.1–G1.3, A1.4 available for acceptance testing. (You can implement against the contract in `contracts/autonomy-policy.schema.md` even if the upstream resolver isn't yet shipped, but the acceptance test is blocked until it is.)
- Engine ref resolver from #788 available so `generacy cockpit watch 351` resolves `351` against `MONITORED_REPOS`.

### 1. Create the verb file

Create `packages/claude-plugin-cockpit/commands/watch.md`. Use the structure of `packages/claude-plugin-agency-spec-kit/commands/plan.md` as the shape reference.

Minimum sections:

```markdown
---
description: Watch an epic and apply the autonomy policy to each transition
---

# Watch Command

## Arguments

- `$ARGUMENTS`: A single positional `<epic-ref>` — either a bare issue number (resolved via the engine resolver per #788) or `owner/repo#N`. Passed through verbatim to `generacy cockpit watch`.

## Instructions

1. If `$ARGUMENTS` is empty, print usage and stop.
2. Spawn `generacy cockpit watch $ARGUMENTS` via the Monitor tool.
3. For each notification (one per stdout line):
   - Parse the line as JSON (see contracts/transition.schema.md). Malformed → log inline and continue.
   - If `from === null`, treat as state-sync: record the dedupe id, do NOT dispatch and do NOT notify.
   - Compute `transition_id = ${repo}:${kind}:${number}:${from}→${to}`. If already seen, drop silently.
   - Look up the autonomy policy (see contracts/autonomy-policy.schema.md).
     - `mode: "auto"` → invoke the mapped /cockpit:* command with the transition args.
     - `mode: "notify-only"` (or no mapping) → emit one inline chat notification summarizing the transition.
   - Add `transition_id` to the in-memory seen-set.
4. If the spawned process exits permanently (not just a stream blip), surface that inline and prompt the user to re-run `/cockpit:watch`. Do NOT retry — `generacy cockpit watch` owns retry per #787 FR-009.
```

### 2. Clean up the `.gitkeep` (optional but recommended)

If `watch.md` is the first verb to land in `packages/claude-plugin-cockpit/commands/`, you can remove `commands/.gitkeep` in the same commit — its job was to preserve the directory before any verb existed.

### 3. Validate locally

```bash
# Confirm the file lands where the spec says it must.
ls packages/claude-plugin-cockpit/commands/watch.md

# Confirm no stray .md files crept in.
ls packages/claude-plugin-cockpit/commands/

# Confirm the README's commands table still references /cockpit:watch.
grep -n 'cockpit:watch' packages/claude-plugin-cockpit/README.md
```

### 4. Acceptance test (manual)

1. Install the cockpit plugin in a Claude Code session.
2. Run `/cockpit:watch <epic-ref>` (use a low-traffic epic on a test repo).
3. Wait for baseline lines to flow — verify NO action dispatches and NO notifications fire during baseline.
4. Drive a single label change on the monitored issue.
5. Verify: exactly one inline notification (for `notify-only`) OR exactly one `/cockpit:*` dispatch (for `auto`). Not both, not duplicated.
6. Interrupt and re-invoke `/cockpit:watch <epic-ref>` against the same epic. Verify the baseline re-syncs without re-firing the transition from step 4.
7. Introduce a transition class the policy doesn't cover. Verify the playbook surfaces a notify-only message with `policy: unmapped` (not a silent drop, not a startup failure).

### 5. Commit

```bash
git add packages/claude-plugin-cockpit/commands/watch.md
# If you removed it: git rm packages/claude-plugin-cockpit/commands/.gitkeep
git commit -m "feat(cockpit): add /cockpit:watch slash command (#351)"
```

---

## For end users

### Prerequisites

- Claude Code with the `cockpit` plugin installed (see `packages/claude-plugin-cockpit/README.md`).
- `generacy` CLI on `PATH` with `cockpit watch` available.
- An autonomy policy configured (G1.1–G1.3, A1.4) — without one, every transition will fall back to notify-only, which is safe but not useful.

### Usage

```text
/cockpit:watch 351
/cockpit:watch generacy-ai/agency#351
```

Either form works — the slash command passes the ref verbatim to `generacy cockpit watch`, which uses the engine resolver to disambiguate.

### What to expect

- On startup, you'll see no action dispatches and no notifications for a brief moment as `generacy cockpit watch` re-syncs current epic state (baseline lines).
- When a label changes on a monitored issue (or PR), one of:
  - The agent invokes the mapped `/cockpit:*` command if the autonomy policy says `auto`.
  - The agent prints one inline chat message summarizing the transition if the policy says `notify-only`.
  - The agent prints a `policy: unmapped` inline message if no mapping exists yet (safe default — go update your policy).

### Stopping the watch

Interrupt the running command (Ctrl-C in the agent's UI, or whatever the host surface uses).

---

## Troubleshooting

### `generacy: command not found`
`generacy` isn't on `PATH`. Install or expose the CLI and re-run.

### The playbook reports the spawned process exited
This is the permanent-failure path. `generacy cockpit watch` is supposed to back off on transient errors (#787 FR-009); a real exit means something durable is broken. Check the upstream stream, then re-invoke `/cockpit:watch` once the source is back.

### Every transition shows `policy: unmapped`
The autonomy policy isn't reachable (or has no entries). Confirm the resolver from G1.1–G1.3 / A1.4 is configured. Until then, the playbook degrades to notify-only — the watch loop is still functioning, you're just not getting any auto dispatches.

### A transition fires twice
Should not happen within a single `/cockpit:watch` invocation (the in-memory seen-set prevents it). If it happens across invocations: that's expected — dedupe is in-memory only per spec clarification Q1, and a restart re-syncs from baseline. If a baseline line itself triggered a dispatch, the playbook misclassified `from: null` — surface as a bug against `commands/watch.md`.

### `Monitor` tool not available
This command depends on Claude Code's `Monitor` tool. If your Claude Code version doesn't expose it, the playbook can't run — upgrade or run the watch manually until `Monitor` is available.
