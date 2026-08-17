---
"@generacy-ai/agency-plugin-spec-kit": patch
---

fix(spec-kit): remove phantom MCP tool references from the speckit playbooks and wire the implement increment sentinel.

The playbooks instructed agents to call four tools that do not exist anywhere in the agency server (`manage_clarification_labels`, `preflight_check`, `merge_from_base`, `update_phase_labels`), so every clarify/tasks/implement run paid for a failed tool call and improvised recovery — and the label steps (`waiting-for:clarification`, `waiting-for:manual-validation`) silently never happened.

- clarify.md: labels are now managed via `gh issue edit`; the redundant second `manage_clarifications read` (which re-fetched the whole clarifications file just to read `pending_count`) is replaced with local bookkeeping.
- tasks.md: epic auto-detection now reads issue labels via `gh issue view` instead of the nonexistent `preflight_check`.
- implement.md: base-branch sync uses plain `git fetch`/`git merge`; the manual-validation block label uses `gh issue edit`; completion validation now points at the terse `build_validate`/`test_run_unit` MCP tools; and a new "Task Increment Boundaries (Headless Mode)" section instructs emitting the `SPECKIT_IMPLEMENT_PARTIAL: {...}` sentinel after ~10 tasks — the orchestrator has parsed this sentinel since generacy spec 360 (T004), but no playbook ever emitted it, so the fresh-session re-invoke mitigation for implement-phase context exhaustion could never trigger.
- taskstoissues.md: the mandatory `dry_run: true` preview pass (up to ~15 KB of discarded body previews) is now interactive-only; headless runs create issues in a single call.

Both command directories (`agency-plugin-spec-kit/commands` and `claude-plugin-agency-spec-kit/commands`) updated in lockstep, byte-identical.
