# Feature Specification: ## Summary

Make the conversational entry point to `/cockpit:auto` discoverable: when a developer's conversation with Claude surfaces bugs (during investigation, code review, or testing), Claude should offer to file the issues and then offer to process them with `/cockpit:auto`

**Branch**: `445-summary-make-conversational` | **Date**: 2026-07-21 | **Status**: Draft

## Summary

## Summary

Make the conversational entry point to `/cockpit:auto` discoverable: when a developer's conversation with Claude surfaces bugs (during investigation, code review, or testing), Claude should offer to file the issues and then offer to process them with `/cockpit:auto`. The machinery for this exists (issue-list invocation + the mid-run add-issue flow); what's missing is documentation and skill-surface descriptions so sessions actually offer it.

Depends on #444 (issue-list invocation form for `/cockpit:auto`).

## Current behavior

- The plugin README and the `auto.md` frontmatter description present auto as an epic-driving command ("Drive an epic … to terminal"). Nothing tells a Claude session that a natural follow-up to "we found two bugs" is: file them, then run `/cockpit:auto <numbers>`.
- The mid-run add-issue flow already exists and works (auto.md "Add-issue flow (mid-run)": add-existing intents like "also process #223" → `cockpit_scope_add` + `cockpit_queue`; file-new intents → drafter subagent → G.6 filing gate → `cockpit_scope_add` + `cockpit_queue`), but it is only documented deep inside the playbook.

## Proposed change

1. **Skill descriptions**: update `auto.md` frontmatter (name/description) and the plugin-level `description` in `.claude-plugin/plugin.json` so the command reads as "drive one or more issues (or an epic/tracking scope) to terminal", explicitly mentioning the issue-list form. The description is what surfaces in skill listings — it should make "process these N issues" an obvious match, not just "drive an epic". *(Per Q2: do NOT introduce a per-command `commands` array in `plugin.json` — no such schema exists; per-command descriptions live in each command's frontmatter, so only the plugin-level `description` field is edited here.)*
2. **README**: add a quick-start section covering the conversational flow end-to-end:
   - discover bugs in conversation → file with `gh issue create` (or let the auto session's G.6 filing gate draft them) → `/cockpit:auto 223, 224` — no epic required;
   - mid-run scope growth: "also process #226" while a session is running, and file-new-during-run for bugs found at gates/testing (things that only reproduce in a deployed environment);
   - running multiple conversations with different issue sets concurrently, with a note that execution interleaves through a single cluster worker per user (sessions watch in parallel; implementation is serialized).
3. **Offer guidance**: ship the offer-heuristic guidance inside `auto.md` itself as a dedicated "Offering auto" section (auto-consumed by Claude sessions alongside the skill description on plugin install), and add an equivalent README section for human readers plus a pointer to the `auto.md` section. *(Per Q1: do NOT add a new file under `commands/` — every `commands/*.md` in this plugin registers as a slash command, so a new file would surface as a spurious `/cockpit:offer-auto` command.)*
   - **When to offer** *(per Q3)*: after any 1+ issue is successfully filed to the workspace's repo during the current session, regardless of who drafted the text. Simplest rule to state and follow; the offer is cheap and confirmation-gated, so an occasional unwanted offer costs one "no".
   - **How to offer** *(per Q4)*: suggested phrasing plus hard rules — the offer MUST include the concrete resolved issue-number list, MUST be a suggestion the developer confirms (never an auto-run), and SHOULD be made at most once per batch of filed issues (no re-nagging). Exact wording is not prescribed.

## Out of scope

- Any change to the auto loop, gates, or MCP tools.
- Automatic invocation without the developer's confirmation — this is about offering, not auto-running.

## Acceptance criteria

- [ ] `auto.md` frontmatter description mentions issue-list invocation and no longer implies an epic is required.
- [ ] `.claude-plugin/plugin.json` plugin-level `description` mentions issue-list invocation (e.g. "…for speckit epics or ad-hoc issue lists"). No `commands` array is introduced.
- [ ] `auto.md` contains an "Offering auto" section that describes when to offer (any 1+ issue filed to workspace repo this session) and how to offer (concrete `<numbers>` list, confirmation-gated, at most once per batch — exact wording not prescribed).
- [ ] No new file is added under `commands/` (a new `commands/*.md` would register as a spurious slash command).
- [ ] README documents the discover → file → `/cockpit:auto <numbers>` flow and the mid-run add-issue flow with concrete examples.
- [ ] README documents multi-conversation usage and the single-worker interleaving caveat.
- [ ] README contains the offer-guidance section for human readers, with a pointer to the "Offering auto" section in `auto.md`.
- [ ] Pinning tests in playbook-verification are re-pinned if auto.md prose changes (re-pin, do not weaken).


## User Stories

### US1: [Primary User Story]

**As a** [user type],
**I want** [capability],
**So that** [benefit].

**Acceptance Criteria**:
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | [Description] | P1 | |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | [Metric] | [Target] | [How to measure] |

## Assumptions

- [Assumption 1]

## Out of Scope

- [Exclusion 1]

---

*Generated by speckit*
