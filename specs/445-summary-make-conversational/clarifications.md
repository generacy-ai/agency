# Clarifications

Questions and answers to clarify the feature specification.

## Batch 1 - 2026-07-21 15:38

### Q1: Offer-guidance location
**Context**: FR-006 says the offer-guidance section can live 'in README or a small reference doc under commands/'. Where it lives determines both what the session cites and how new readers find it. It also affects how reliably future Claude sessions discover the offer heuristic — a commands/-level doc is auto-loaded alongside skill descriptions on plugin install, whereas README is only consulted when a human opens it.
**Question**: Where should the offer-guidance section live?
**Options**:
- A: New section in README only (relies on README being present in context or user reading it)
- B: New reference doc under commands/ (e.g., commands/offer-auto.md) that ships with the plugin, plus a short pointer from README
- C: Both a README section AND a plugin-level CLAUDE.md so Claude sessions using the plugin auto-consume it

**Answer**: B, with one load-bearing modification to WHERE the doc lives: do NOT create a separate reference doc under `commands/` — every `commands/*.md` in this plugin registers as a slash command, so `commands/offer-auto.md` would surface as a spurious `/cockpit:offer-auto` command (verified: the plugin's `commands/` dir contains only the seven real commands today). Instead, ship the offer guidance inside `auto.md` itself as a dedicated "Offering auto" section, surface its existence in the `auto.md` frontmatter description, and add a README section with the same guidance for human readers plus a pointer to the section in auto.md.

### Q2: plugin.json command metadata
**Context**: FR-002 requires updating `.claude-plugin/plugin.json` command metadata to match the new auto.md description. The current plugin.json contains only plugin-level `name`, `description`, and `author` — no per-command entries exist. This ambiguity blocks the implementation choice.
**Question**: How should FR-002 be interpreted given plugin.json currently has no per-command metadata?
**Options**:
- A: Add a new `commands` array to plugin.json with per-command descriptions (introduce the schema; ensure `/cockpit:auto` description matches auto.md frontmatter)
- B: Update the plugin-level `description` field to mention issue-list invocation for auto (no per-command schema added)
- C: Skip FR-002 (no plugin.json change needed since no per-command metadata schema exists in Claude Code plugins)

**Answer**: B — Update the plugin-level `description` field to mention issue-list invocation (e.g. "…for speckit epics or ad-hoc issue lists"). Option C's factual premise is correct — `plugin.json` has no per-command schema and per-command descriptions live in each command's frontmatter — so do not invent a `commands` array; the frontmatter update is already covered by the other FRs.

### Q3: Offer trigger heuristic
**Context**: US1/FR-006 says the session should offer `/cockpit:auto <numbers>` 'after filing 1+ actionable issues in the workspace's repo'. What counts as a trigger determines when the offer fires and whether it fires when the user files issues without Claude's help. The choice shapes the guidance text a session cites.
**Question**: What conditions should the guidance describe for when a session offers `/cockpit:auto <numbers>`?
**Options**:
- A: Any successful `gh issue create` in the current session (whether Claude drafted the body or the user pasted a command), when the target repo matches the workspace
- B: Only when Claude drafted/proposed the issue text in the current session (issue is a direct output of the conversational discovery)
- C: Any 1+ issues filed to the workspace's repo during the session, plus a soft filter — e.g., issues that carry a bug/actionable label or contain reproduction steps

**Answer**: A — Any issue successfully filed to the workspace's repo during the current session, regardless of who drafted the text. It's the simplest rule to state and follow, and the offer is cheap and confirmation-gated, so an occasional unwanted offer costs one "no". Provenance filters (B) and content heuristics (C) add judgment calls that will misfire more confusingly than an extra offer does.

### Q4: Offer wording
**Context**: US1 requires the session to 'offer' `/cockpit:auto <numbers>` and the developer must confirm. Prescribing a template vs leaving it freeform affects consistency across sessions and how load-bearing the guidance doc becomes.
**Question**: Should the guidance prescribe an exact offer template, a suggested phrasing with room to vary, or only describe when to offer?
**Options**:
- A: Prescribe an exact template (e.g., 'Want me to run `/cockpit:auto 223, 224` to process these? (y/N)') for consistency
- B: Provide suggested phrasing plus rules (must include the concrete `<numbers>` list; must be a suggestion, not an auto-run) but allow session-level variation
- C: Only describe when to offer; leave wording entirely to the session

**Answer**: B — Suggested phrasing plus hard rules: the offer MUST include the concrete resolved issue-number list, MUST be a suggestion the developer confirms (never an auto-run), and SHOULD be made at most once per batch of filed issues (no re-nagging). An exact template (A) goes stale as syntax evolves; no wording guidance at all (C) loses the invariants that matter.

