# Research: /cockpit:watch slash command

**Feature**: 351-epic-generacy-ai-tetrad
**Date**: 2026-06-26

## Decisions

### D1: The command is a slash-command playbook, not new code

**Decision**: Ship one markdown file at `packages/claude-plugin-cockpit/commands/watch.md`. The Claude Code agent executes the playbook on `/cockpit:watch`; the playbook drives existing tools (`Monitor`, `generacy cockpit watch`, other `/cockpit:*` commands) rather than introducing new compiled code.

**Rationale**:
- The spec's "Owns (isolation)" line names exactly this file path.
- The cockpit plugin (#350) is a static-asset plugin with no `package.json`, no build, no runtime code. Adding code here would break that pattern.
- Every other verb in the cockpit roadmap (`:status`, `:clarify`, `:review`, `:merge`) follows the same shape; consistency wins.

**Alternatives considered**:
- A TypeScript module that wraps `Monitor` and the resolver. Rejected: introduces a build step and runtime dependency for a workflow the agent can already drive directly from a playbook.
- Embedding the watch loop logic inside the `generacy` CLI itself. Rejected: separation of concerns — `generacy cockpit watch` emits the stream; the slash command applies the autonomy policy. Mixing them couples policy to CLI release cadence.

### D2: Delegate retry/reconnect to `generacy cockpit watch` (Q3-D)

**Decision**: The playbook does not implement exponential backoff, retry budgets, or reconnect logic. It trusts `generacy cockpit watch` to back off and never exit on transient stream errors (per #787 FR-009). If the spawned process exits *permanently*, the playbook surfaces that inline and prompts the user to restart.

**Rationale**:
- Clarification Q3 chose option D explicitly: don't reimplement retry.
- Two layers of retry (CLI + slash command) would compound delays and obscure root causes.
- The slash command can't reliably distinguish "transient stream error" from "permanent failure" — only `generacy cockpit watch` has the necessary context. Letting it own that decision avoids ambiguity.

**Alternatives considered**:
- Exponential backoff in the playbook itself (options A/B/C from Q3). Rejected per Q3.
- Drop to a notify-only mode if the stream stays down. Rejected per Q3 — same reason; ambiguity about who owns retry.

### D3: Compose dedupe id locally; in-memory only (Q1-B)

**Decision**: For each non-baseline transition, the playbook computes `transition_id = ${repo}:${kind}:${number}:${from}→${to}` and stores it in an in-memory set scoped to the running `/cockpit:watch` invocation. Baseline lines (`from === null`) are recorded but never dispatched.

**Rationale**:
- Clarification Q1 chose option B: compose locally, in-memory only, treat baseline as state-sync.
- Persisting dedupe state to disk would require schema, location, eviction policy, and conflict handling — none of which the spec calls for and all of which add risk.
- Restarts re-sync state via baseline lines and then resume on real transitions — the desired UX per Q1.

**Alternatives considered**:
- Trust an upstream-supplied transition id (option A). Rejected per Q1 — and #787 doesn't guarantee a stable per-line id today.
- On-disk persistence (option C). Rejected per Q1.
- No client-side dedupe (option D). Rejected per Q1 — FR-006 was intentional, not defensive.

### D4: Unmapped transitions fall back to notify-only (Q2-A)

**Decision**: When the autonomy resolver returns no mapping for a transition class, the playbook emits a notify-only inline message and continues. It does not silently drop, does not warn-once-then-ignore, and does not fail-fast at startup.

**Rationale**:
- Clarification Q2 chose option A — safe default.
- Unmapped classes WILL happen routinely (new labels introduced after a watch starts; the developer's policy lagging upstream label taxonomy). Failing fast or silently dropping both hurt the user.
- Treating unmapped as notify-only is recoverable: the developer sees the gap immediately and can update the policy without losing data.

**Alternatives considered**:
- Silent ignore (option B). Rejected per Q2 — invisible policy gaps are dangerous.
- One-shot warning (option C). Rejected per Q2 — surfacing every unmapped transition is more useful than a single warning that scrolls off.
- Fail-fast at startup (option D). Rejected per Q2 — incompatible with persistent-loop UX.

### D5: Notification surface is inline chat only (Q4-B)

**Decision**: All user-visible notifications from the watch loop are inline chat messages (one per actionable transition). The playbook does not invoke `PushNotification`.

**Rationale**:
- Clarification Q4 chose option B.
- Claude Code's `Monitor` tool already emits one notification per stdout line into the running conversation; the playbook only needs to format/route those, not surface a parallel OS notification.
- OS notifications are the A5.3 / v3 enhancement — explicitly out of scope for this issue per Q4.

**Alternatives considered**:
- `PushNotification` only (option A). Rejected per Q4 — also loses persistence in chat scrollback.
- Both surfaces (option C). Rejected per Q4 — scope creep into A5.3.
- Per-policy configurable (option D). Rejected per Q4 — adds policy schema surface this issue doesn't own.

### D6: Delegate ref resolution to the engine (Q5)

**Decision**: The slash command passes `$ARGUMENTS` verbatim to `generacy cockpit watch`. It does NOT inspect the ref, does NOT resolve bare numbers via the local git remote, and does NOT consult a config file. The engine resolver (#788) is the single source of truth.

**Rationale**:
- Clarification Q5 chose "delegate to the engine resolver" (none of A–D).
- Two resolvers (slash-command-side + engine-side) is a guaranteed divergence over time. Centralizing keeps `/cockpit:watch 351` behaving identically to anything else in the cockpit ecosystem that takes a ref.
- Per #788, the resolver searches `MONITORED_REPOS` and disambiguates on 0/>1 matches — that's the right place for that logic, not duplicated in every slash command.

**Alternatives considered**:
- Resolve from `origin` (option A). Rejected per Q5 — breaks the moment the developer is in a different checkout.
- Cockpit config setting (option B). Rejected per Q5 — duplicates resolver state.
- Always require `owner/repo#N` (option C). Rejected per Q5 — hostile UX.
- Try origin then config then error (option D). Rejected per Q5 — even more divergence surface.

## Implementation Patterns

### P1: Slash-command playbook structure mirrors the spec-kit pattern

- YAML frontmatter with `description:` matching the cockpit README's commands table entry exactly.
- H1 title; H2 sections for `## Arguments`, `## Instructions`, optionally `## Headless Mode` if/when that's added.
- Numbered steps inside `## Instructions` — agents follow them top to bottom.
- Reference `$ARGUMENTS` literally; do not invent argument names.

See `packages/claude-plugin-agency-spec-kit/commands/plan.md` and `clarify.md` for the canonical structure.

### P2: `Monitor`-tool invocation

- The playbook instructs the agent to call `Monitor` with `generacy cockpit watch $ARGUMENTS` as the spawned command.
- `Monitor` emits one notification per stdout line; the agent processes each line as a self-contained transition record.
- The agent does NOT poll `Monitor` — it reacts to the per-line notifications it receives.

### P3: Inline notification format (for notify-only and unmapped transitions)

A single chat-line per transition, structured for at-a-glance scanning. Suggested format (the playbook can phrase it more naturally — the data points are what matters):

```
[cockpit:watch] <repo>#<number> <kind> <from> → <to> · policy: notify-only · suggested: /cockpit:<verb> <ref>
```

For auto-dispatched transitions, the agent invokes the mapped slash command directly rather than printing the line — the dispatch itself is the user-visible signal.

### P4: In-memory dedupe set scope

- The seen-set lives in the agent's conversation context for the duration of the `/cockpit:watch` invocation.
- It is NOT shared across invocations, sessions, or restarts.
- Baseline lines populate the seen-set so a `from: null → open` line at startup doesn't get re-dispatched if it later re-emerges as a real `closed → open` transition (the dedupe id is different, so the real transition still fires — baseline only suppresses its own re-fire).

## Key Sources / References

- `specs/351-epic-generacy-ai-tetrad/spec.md` — feature summary and acceptance criterion.
- `specs/351-epic-generacy-ai-tetrad/clarifications.md` — Q1–Q5 answers (the load-bearing design decisions).
- `specs/350-epic-generacy-ai-tetrad/` — sibling spec; established the cockpit package shape and README.
- `packages/claude-plugin-cockpit/` — target package (scaffold from #350).
- `packages/claude-plugin-agency-spec-kit/commands/*.md` — reference shape for slash-command playbooks.
- Upstream dependencies referenced in spec: G1.1, G1.2, G1.3 (autonomy policy lookup), A1.4 (policy-driven dispatch).
- `#787` — `generacy cockpit watch` CLI (stream source, owns retry per FR-009).
- `#788` — engine ref resolver (shared resolver for `owner/repo#N` and bare numbers, searches `MONITORED_REPOS`).
- Epic plan: `docs/epic-cockpit-plan.md` in the `tetrad-development` repo (P2 / A2.1 context).
