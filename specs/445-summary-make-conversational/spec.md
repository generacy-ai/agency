# Feature Specification: Document conversational entry point to `/cockpit:auto`

**Branch**: `445-summary-make-conversational` | **Date**: 2026-07-21 | **Status**: Draft | **Issue**: [#445](https://github.com/generacy-ai/agency/issues/445) | **Depends on**: #444

## Summary

Make the conversational entry point to `/cockpit:auto` discoverable: when a developer's conversation with Claude surfaces bugs (during investigation, code review, or testing), Claude should offer to file the issues and then offer to process them with `/cockpit:auto`. The machinery for this exists (issue-list invocation + the mid-run add-issue flow); what's missing is documentation and skill-surface descriptions so sessions actually offer it.

Depends on #444 (issue-list invocation form for `/cockpit:auto`).

## Current behavior

- The plugin README and the `auto.md` frontmatter description present auto as an epic-driving command ("Drive an epic … to terminal"). Nothing tells a Claude session that a natural follow-up to "we found two bugs" is: file them, then run `/cockpit:auto <numbers>`.
- The mid-run add-issue flow already exists and works (auto.md "Add-issue flow (mid-run)": add-existing intents like "also process #223" → `cockpit_scope_add` + `cockpit_queue`; file-new intents → drafter subagent → G.6 filing gate → `cockpit_scope_add` + `cockpit_queue`), but it is only documented deep inside the playbook.

## Proposed change

1. **Skill descriptions**: update `auto.md` frontmatter (name/description) and `.claude-plugin/plugin.json` metadata so the command reads as "drive one or more issues (or an epic/tracking scope) to terminal", explicitly mentioning the issue-list form. The description is what surfaces in skill listings — it should make "process these N issues" an obvious match, not just "drive an epic".
2. **README**: add a quick-start section covering the conversational flow end-to-end:
   - discover bugs in conversation → file with `gh issue create` (or let the auto session's G.6 filing gate draft them) → `/cockpit:auto 223, 224` — no epic required;
   - mid-run scope growth: "also process #226" while a session is running, and file-new-during-run for bugs found at gates/testing (things that only reproduce in a deployed environment);
   - running multiple conversations with different issue sets concurrently, with a note that execution interleaves through a single cluster worker per user (sessions watch in parallel; implementation is serialized).
3. **Offer guidance**: a short section (README or a small reference doc shipped in `commands/`) that a session can cite for when to *offer* auto: after filing 1+ actionable issues in the workspace's repo, offer `/cockpit:auto <numbers>` as the next step.

## Out of scope

- Any change to the auto loop, gates, or MCP tools.
- Automatic invocation without the developer's confirmation — this is about offering, not auto-running.

## User Stories

### US1: Session offers `/cockpit:auto` after bugs are filed

**As a** developer using Claude interactively (investigating code, reviewing a PR, or testing a change),
**I want** Claude to recognize that the bugs we just filed are actionable input for `/cockpit:auto` and offer that as the next step,
**So that** I don't have to remember the incantation or context-switch to a different playbook — the conversational discovery flow leads directly into automated processing.

**Acceptance Criteria**:
- [ ] After the session helps file 1+ actionable issues in the workspace's repo (via `gh issue create` or similar), the session offers `/cockpit:auto <numbers>` as the next step.
- [ ] The offer is grounded in a documented guidance section (README or `commands/` reference doc) that the session can cite.
- [ ] The offer is a suggestion, not automatic invocation — the developer must confirm.

### US2: Skill listings advertise issue-list invocation

**As a** developer scanning available Claude commands (via skill listings, `/help`, or plugin discovery),
**I want** `/cockpit:auto`'s description to make "process these N issues" an obvious match,
**So that** I find and use the command for its issue-list form, not only for driving an existing epic.

**Acceptance Criteria**:
- [ ] `auto.md` frontmatter `description` mentions issue-list invocation and no longer implies an epic is required.
- [ ] `.claude-plugin/plugin.json` metadata for the command aligns with the updated frontmatter.

### US3: README documents the end-to-end conversational flow

**As a** developer new to the cockpit plugin,
**I want** the README to walk me through the discover → file → `/cockpit:auto <numbers>` flow with concrete examples, including mid-run scope growth and concurrent multi-session usage,
**So that** I understand both the entry point and the runtime execution model (single-worker interleaving) without having to read the full playbook.

**Acceptance Criteria**:
- [ ] README has a quick-start section covering the discover → file → `/cockpit:auto <numbers>` flow with concrete examples.
- [ ] README documents the mid-run add-issue flow (both `also process #226` and file-new-during-run at gates/testing).
- [ ] README documents multi-conversation usage and calls out the single-worker-per-user interleaving caveat (parallel watching, serialized implementation).

## Functional Requirements

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-001 | Update `auto.md` frontmatter `description` to mention issue-list invocation and remove language implying an epic is required. | P1 | Skill-listing surface. |
| FR-002 | Update `.claude-plugin/plugin.json` command metadata to match the new `auto.md` description. | P1 | Two surfaces must agree. |
| FR-003 | Add a README quick-start section documenting the discover → file → `/cockpit:auto <numbers>` flow with a concrete example (issue creation, then invocation). | P1 | |
| FR-004 | Add README coverage of the mid-run add-issue flow, with examples for both add-existing intents (`also process #226`) and file-new-during-run intents (bugs found at gates/testing). | P1 | Points readers at the G.6 filing gate. |
| FR-005 | Add README coverage of concurrent multi-conversation usage, including the single-cluster-worker interleaving caveat (sessions watch in parallel; implementation is serialized). | P1 | Prevents surprise about serialization. |
| FR-006 | Ship an "offer guidance" section (in README or a small reference doc under `commands/`) that a session can cite for when to *offer* auto: after filing 1+ actionable issues in the workspace's repo. | P1 | Grounds the offer behavior in US1. |
| FR-007 | Re-pin `playbook-verification` assertions if `auto.md` prose changes so the pins reflect the new contract; do NOT weaken or delete the assertions. | P1 | Matches CLAUDE.md pinning rule. |

## Success Criteria

| ID | Metric | Target | Measurement |
|----|--------|--------|-------------|
| SC-001 | `auto.md` frontmatter and `plugin.json` metadata mention issue-list invocation. | Both surfaces mention it. | Grep the two files for issue-list language. |
| SC-002 | README covers the three documented topics (quick-start flow, mid-run add-issue flow, multi-conversation caveat). | All three sections present with concrete examples. | Review README diff. |
| SC-003 | Offer-guidance section exists in a location a session can cite. | Present in README or `commands/`. | Verify file existence and cross-reference. |
| SC-004 | `playbook-verification` tests pass and any `auto.md` prose changes are reflected in re-pinned assertions. | Test suite green; assertions updated in the same PR. | `pnpm test` on `packages/claude-plugin-cockpit`. |

## Assumptions

- #444 (issue-list invocation form for `/cockpit:auto`) lands before or with this change; otherwise the documented invocation form would not work.
- The G.6 filing gate and mid-run `cockpit_scope_add` + `cockpit_queue` flow described in `auto.md` continue to function as documented (this change is doc-only, not a behavior change).
- Session behavior around "offering" a command is influenced by documented skill descriptions and README guidance that the session can consult — not by hard-coded runtime logic.

## Out of Scope

- Any change to the auto loop, gates, or MCP tools.
- Automatic invocation of `/cockpit:auto` without the developer's confirmation — this is about offering, not auto-running.
- Changes to the underlying issue-list invocation mechanics (owned by #444).
- Changes to the cluster-worker execution model (the single-worker interleaving is documented, not changed).

---

*Generated by speckit*
