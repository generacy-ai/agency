# Implementation Plan: Make `/cockpit:auto` conversational entry point discoverable

**Feature**: Documentation + skill-description changes so Claude sessions naturally offer `/cockpit:auto <numbers>` after bugs are filed in conversation.
**Branch**: `445-summary-make-conversational`
**Status**: Complete

## Summary

Docs-only change. The engine and playbook machinery already support the flows this spec cares about: `/cockpit:auto` accepts an issue-list invocation (delivered by #444), and the mid-run add-issue flow (add-existing + file-new via G.6) is already described in `commands/auto.md § Add-issue flow (mid-run)`. What is missing is **surface**:

1. The `auto.md` frontmatter `description:` still reads "Drive an epic … to terminal", which fails to advertise the issue-list form to future Claude sessions scanning skill descriptions.
2. `.claude-plugin/plugin.json`'s plugin-level `description` says "for speckit epics" and does not mention issue lists.
3. There is no in-playbook guidance telling a session **when** to offer `/cockpit:auto <numbers>` after issues have been filed. Without it, sessions do not consistently make the offer.
4. The README does not walk a human reader through the discover → file → `/cockpit:auto <numbers>` flow, the mid-run add-issue flow, or the multi-conversation caveat (execution interleaves through a single cluster worker per user).

The plan applies four edits in three files and re-pins any playbook-verification assertions the edits touch.

## Technical Context

- **Language / runtime**: Markdown + JSON. No TypeScript logic changes.
- **Package**: `packages/claude-plugin-cockpit`.
- **Dependencies**: none new. `commands/auto.md`, `.claude-plugin/plugin.json`, `README.md`, `tests/playbook-verification.test.ts` (re-pin only).
- **Depends on**: #444 (issue-list invocation form for `/cockpit:auto`). This spec assumes Form 4 (or equivalent multi-issue invocation) already exists in `auto.md` § Instructions step 1 by merge time.

## Constraints (from spec + clarifications)

- **No new file under `commands/`.** Every `commands/*.md` registers as a slash command; a `commands/offer-auto.md` would surface as a spurious `/cockpit:offer-auto`. The offer-guidance section lives inside `auto.md` as a dedicated `## Offering auto` H2 section (Q1 answer).
- **No `commands` array in `plugin.json`.** No such schema exists in the Claude Code plugin format; only the plugin-level `description` field is edited (Q2 answer).
- **Offer trigger**: any 1+ issues successfully filed to the workspace's repo during the current session, regardless of who drafted the text (Q3 answer). No provenance filter, no content heuristic.
- **Offer wording**: suggested phrasing + hard rules — MUST include the concrete resolved issue-number list, MUST be a confirmation-gated suggestion (never auto-run), SHOULD fire at most once per batch of filed issues (Q4 answer). Exact wording is not prescribed.
- **Playbook pinning**: `tests/playbook-verification.test.ts` pins `commands/*.md` playbooks by exact heading strings and contract rules per `CLAUDE.md`. Any auto.md prose change that breaks a pin must be **re-pinned to the new contract in the same PR**, not weakened.

## Files Touched

| File | Change |
|------|--------|
| `packages/claude-plugin-cockpit/commands/auto.md` | Frontmatter `description:` rewritten to advertise both epic and issue-list forms; new `## Offering auto` H2 section added (placement: after `## Add-issue flow (mid-run)`, before `## Gate contract`) |
| `packages/claude-plugin-cockpit/.claude-plugin/plugin.json` | Plugin-level `description` extended (e.g. "…for speckit epics or ad-hoc issue lists") |
| `packages/claude-plugin-cockpit/README.md` | Four new sections: (a) Quick start (conversational flow), (b) Mid-run add-issue, (c) Multi-conversation usage + single-worker caveat, (d) Offer guidance (mirrors auto.md's `## Offering auto` for human readers, with a pointer to it) |
| `packages/claude-plugin-cockpit/tests/playbook-verification.test.ts` | Re-pin any assertion that touches the changed prose (`grep`-anchored heading strings for the new `## Offering auto` section; frontmatter `description:` if pinned) |

## `## Offering auto` — section shape (target auto.md content)

Target H2 body — described here for the plan; the tasks phase will write it. Fields to include verbatim:

- **When to offer**: after any 1+ issue is successfully filed to the workspace's repo during the current session, regardless of who drafted the text. The offer is cheap and confirmation-gated; an occasional unwanted offer costs one "no".
- **How to offer** — three hard rules:
  1. MUST include the concrete resolved issue-number list (e.g., `/cockpit:auto 223, 224`), never a placeholder.
  2. MUST be a suggestion the developer confirms — never auto-run.
  3. SHOULD be made at most once per batch of filed issues (no re-nagging).
- **Suggested phrasing** (not prescribed): e.g., "Want me to run `/cockpit:auto 223, 224` to process these?" — with room for session-level variation.
- **What it is NOT**: not a gate, not a `AskUserQuestion`, not part of the auto loop — this is guidance for the *pre-invocation* conversational surface where the developer decides whether to start an auto session at all.

## README sections — target structure

Target H2/H3 shape (tasks phase writes the prose):

1. `## Quick start — from bug discovery to processed PRs` (new H2, placed after `## Available Commands`)
   - `### 1. Discover in conversation` — one-line example.
   - `### 2. File the issues` — `gh issue create` example OR the `--new "<title>"` invocation.
   - `### 3. Kick off auto` — `/cockpit:auto 223, 224` example, "no epic required" note.

2. `### Growing scope mid-run` (H3 under Quick start)
   - "also process #226" — add-existing intent.
   - "file an issue for X" — file-new intent → G.6 filing gate.
   - Pointer to `commands/auto.md § Add-issue flow (mid-run)` for details.

3. `### Running multiple conversations` (H3 under Quick start)
   - Concurrent sessions with different issue sets — supported.
   - Caveat: execution interleaves through a single cluster worker per user; sessions watch in parallel, implementation is serialized.

4. `## Offer guidance — when should a session offer /cockpit:auto?` (new H2, mirrors auto.md's `## Offering auto`)
   - Same three rules as auto.md.
   - Pointer to the `commands/auto.md § Offering auto` section as the source of truth.

## Constitution check

No `.specify/memory/constitution.md` in this repo (checked). Skipped.

## Out of Scope

- Any change to the auto loop, gates, MCP tools, or engine.
- Automatic invocation of `/cockpit:auto` without operator confirmation — offer-only.
- Adding a `commands` array to `plugin.json` — no such schema exists (Q2).
- Adding a `commands/offer-auto.md` file — would register as a spurious slash command (Q1).
- Prescribing exact offer wording — Q4 chose suggested-phrasing-plus-rules.
- Offer heuristics based on issue provenance or content — Q3 rejected filters.

## Next step

`/speckit:tasks` to generate the task list.
